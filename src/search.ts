import data from "./data";

export type VehicleSearchMatchKind = "exact" | "prefix" | "token" | "contains" | "fuzzy";

export interface SearchVehiclesOptions {
  /** Restrict results to one catalog year. A year in the query is detected automatically. */
  year?: number;
  vehicleTypeId?: number;
  sourceId?: string;
  /** Maximum number of results. Defaults to 10 and is capped at 100. */
  limit?: number;
  /** Enables conservative typo matching. Defaults to true. */
  fuzzy?: boolean;
}

interface VehicleSearchResultBase {
  makeId: number;
  makeName: string;
  /** Available years after applying the supplied filters, sorted ascending. */
  years: number[];
  sourceIds: string[];
  matchKind: VehicleSearchMatchKind;
}

export interface VehicleMakeSearchResult extends VehicleSearchResultBase {
  kind: "make";
}

export interface VehicleSearchVariant {
  year: number;
  /** The preferred catalog model ID for this canonical make/model/type/year. */
  modelId: number;
  sourceIds: string[];
}

export interface VehicleModelSearchResult extends VehicleSearchResultBase {
  kind: "model";
  modelName: string;
  vehicleTypeId: number;
  vehicleTypeName: string;
  /** One directly selectable catalog identity per available year. */
  variants: VehicleSearchVariant[];
}

export type VehicleSearchResult = VehicleMakeSearchResult | VehicleModelSearchResult;

interface SearchText {
  spaced: string;
  compact: string;
  tokens: string[];
}

interface IndexedMakeRow {
  year: number;
  vehicleTypeId: number;
  sourceMask: number;
}

interface IndexedMake {
  makeId: number;
  makeName: string;
  forms: SearchText[];
  rows: IndexedMakeRow[];
}

type IndexedModelRow = (typeof data.models)[number];

interface IndexedModel {
  makeId: number;
  makeName: string;
  vehicleTypeId: number;
  vehicleTypeName: string;
  makeForms: SearchText[];
  modelForms: SearchText[];
  combinedForms: SearchText[];
  rows: IndexedModelRow[];
}

interface SearchIndex {
  makes: IndexedMake[];
  models: IndexedModel[];
}

interface LexicalMatch {
  kind: VehicleSearchMatchKind;
  rank: number;
  closeness: number;
}

interface RankedResult {
  key: string;
  result: VehicleSearchResult;
  rank: number;
  interpretationRank: number;
  closeness: number;
}

interface ParsedQuery {
  text: SearchText;
  year?: number;
  /** Prefer an unmodified exact model phrase over interpreting its number as a year. */
  interpretationRank: number;
}

interface SelectedModelVariant extends VehicleSearchVariant {
  modelName: string;
  sourceMask: number;
}

const MATCH_RANK: Record<VehicleSearchMatchKind, number> = {
  exact: 0,
  prefix: 1,
  token: 2,
  contains: 3,
  fuzzy: 4,
};

// These are search-only colloquialisms. They do not rewrite catalog identities.
const MAKE_SEARCH_ALIASES = new Map<string, string[]>([
  ["alfa romeo", ["alfa"]],
  ["bmw", ["bimmer", "beemer"]],
  ["chevrolet", ["chevy"]],
  ["general motors", ["gm"]],
  ["harley davidson", ["harley"]],
  ["mercedes benz", ["mercedes", "benz", "merc"]],
  ["volkswagen", ["vw"]],
]);

const sourceMaskById = new Map(
  data.sources.map((source, index) => [source.source_id, 2 ** index]),
);
const vehicleTypeNameById = new Map(
  data.vehicleTypes.map((type) => [type.vehicle_type_id, type.vehicle_type_name]),
);

let _searchIndex: SearchIndex | null = null;

/**
 * Finds canonical make and model candidates for a driver-entered query.
 *
 * Matching is deterministic and popularity-neutral: exact, prefix, token,
 * substring, then conservative typo matching. Applications can request a
 * larger candidate set and rerank within the returned `matchKind` using local
 * recents or regional telemetry.
 */
export function searchVehicles(
  query: string,
  options: SearchVehiclesOptions = {},
): VehicleSearchResult[] {
  if (options.year != null && !Number.isInteger(options.year)) return [];
  const parsedQueries = parseQueries(query, options.year);
  if (parsedQueries.length === 0) return [];

  const sourceMask = options.sourceId == null ? undefined : sourceMaskById.get(options.sourceId);
  if (options.sourceId != null && sourceMask == null) return [];

  const limit = normalizeLimit(options.limit);
  if (limit === 0) return [];

  const index = getSearchIndex();
  const rankedByKey = collectQueryInterpretations(
    index,
    parsedQueries,
    options,
    sourceMask,
    false,
  );
  preferUnmodifiedInterpretation(rankedByKey);

  // Typo matching is a fallback, not filler after a good lexical match. This
  // keeps an exact vehicle from being followed by unrelated near-spellings.
  if (options.fuzzy !== false && rankedByKey.size === 0) {
    for (const [key, result] of collectQueryInterpretations(
      index,
      parsedQueries,
      options,
      sourceMask,
      true,
    )) {
      rankedByKey.set(key, result);
    }
    preferUnmodifiedInterpretation(rankedByKey);
  }

  const ranked = [...rankedByKey.values()];
  ranked.sort(compareRankedResults);
  return ranked.slice(0, limit).map(({ result }) => result);
}

function preferUnmodifiedInterpretation(results: Map<string, RankedResult>): void {
  if (![...results.values()].some((result) => result.interpretationRank === 0)) return;
  for (const [key, result] of results) {
    if (result.interpretationRank > 0) results.delete(key);
  }
}

function collectQueryInterpretations(
  index: SearchIndex,
  parsedQueries: ParsedQuery[],
  options: SearchVehiclesOptions,
  sourceMask: number | undefined,
  fuzzyOnly: boolean,
): Map<string, RankedResult> {
  const rankedByKey = new Map<string, RankedResult>();
  for (const parsed of parsedQueries) {
    const interpretationResults: RankedResult[] = [];
    collectMatches(
      index,
      parsed.text,
      parsed.year,
      parsed.interpretationRank,
      options,
      sourceMask,
      fuzzyOnly,
      interpretationResults,
      new Set(),
    );
    for (const result of interpretationResults) {
      const existing = rankedByKey.get(result.key);
      if (!existing || compareRankedResults(result, existing) < 0) {
        rankedByKey.set(result.key, result);
      }
    }
  }
  return rankedByKey;
}

function collectMatches(
  index: SearchIndex,
  query: SearchText,
  year: number | undefined,
  interpretationRank: number,
  options: SearchVehiclesOptions,
  sourceMask: number | undefined,
  fuzzyOnly: boolean,
  results: RankedResult[],
  includedKeys: Set<string>,
): void {
  for (const make of index.makes) {
    const key = `make\u0000${make.makeId}`;
    if (includedKeys.has(key)) continue;

    const match = matchForms(query, make.forms, fuzzyOnly);
    if (!match || (fuzzyOnly && match.kind !== "fuzzy")) continue;

    const availability = selectMakeAvailability(
      make.rows,
      year,
      options.vehicleTypeId,
      sourceMask,
    );
    if (availability.years.length === 0) continue;

    includedKeys.add(key);
    results.push({
      key,
      rank: match.rank,
      interpretationRank,
      closeness: match.closeness,
      result: {
        kind: "make",
        makeId: make.makeId,
        makeName: make.makeName,
        years: availability.years,
        sourceIds: getSourceIds(availability.sourceMask),
        matchKind: match.kind,
      },
    });
  }

  for (const model of index.models) {
    if (options.vehicleTypeId != null && model.vehicleTypeId !== options.vehicleTypeId) continue;

    const key = `model\u0000${model.makeId}\u0000${model.modelForms[0].compact}\u0000${model.vehicleTypeId}`;
    if (includedKeys.has(key)) continue;

    const modelMatch = matchForms(query, model.modelForms, fuzzyOnly);
    const makeMatch = matchForms(query, model.makeForms, fuzzyOnly);
    const match = modelMatch ?? (makeMatch ? undefined : matchForms(query, model.combinedForms, fuzzyOnly));
    if (!match || (fuzzyOnly && match.kind !== "fuzzy")) continue;

    const variants = selectModelVariants(model.rows, year, sourceMask);
    if (variants.length === 0) continue;

    const representative = variants.reduce((best, variant) =>
      compareRepresentativeVariants(variant, best) < 0 ? variant : best,
    );
    const combinedSourceMask = variants.reduce((mask, variant) => mask | variant.sourceMask, 0);

    includedKeys.add(key);
    results.push({
      key,
      rank: match.rank,
      interpretationRank,
      closeness: match.closeness,
      result: {
        kind: "model",
        makeId: model.makeId,
        makeName: model.makeName,
        modelName: representative.modelName,
        vehicleTypeId: model.vehicleTypeId,
        vehicleTypeName: model.vehicleTypeName,
        years: variants.map((variant) => variant.year),
        sourceIds: getSourceIds(combinedSourceMask),
        matchKind: match.kind,
        variants: variants.map(({ year: variantYear, modelId, sourceIds }) => ({
          year: variantYear,
          modelId,
          sourceIds,
        })),
      },
    });
  }
}

function getSearchIndex(): SearchIndex {
  if (_searchIndex) return _searchIndex;

  const makesById = new Map<number, IndexedMake>();
  const makeRowsById = new Map<number, Map<string, IndexedMakeRow>>();
  for (const make of data.makes) {
    const baseForm = normalizeSearchText(make.make_name);
    const aliases = MAKE_SEARCH_ALIASES.get(baseForm.spaced) ?? [];
    makesById.set(make.make_id, {
      makeId: make.make_id,
      makeName: make.make_name,
      forms: uniqueForms([baseForm, ...aliases.map(normalizeSearchText)]),
      rows: [],
    });
    makeRowsById.set(make.make_id, new Map());
  }

  const modelsByKey = new Map<
    string,
    IndexedModel & { modelFormMap: Map<string, SearchText> }
  >();

  for (const row of data.models) {
    const [year, makeId, modelId, modelNameIndex, vehicleTypeId, sourceMask] = row;
    const make = makesById.get(makeId);
    const modelName = data.modelNames[modelNameIndex];
    const vehicleTypeName = vehicleTypeNameById.get(vehicleTypeId);
    if (!make || modelName == null || vehicleTypeName == null) continue;

    const makeRows = makeRowsById.get(makeId)!;
    const makeRowKey = `${year}\u0000${vehicleTypeId}`;
    const existingMakeRow = makeRows.get(makeRowKey);
    if (existingMakeRow) existingMakeRow.sourceMask |= sourceMask;
    else makeRows.set(makeRowKey, { year, vehicleTypeId, sourceMask });

    const modelForm = normalizeSearchText(modelName);
    const key = `${makeId}\u0000${modelForm.compact}\u0000${vehicleTypeId}`;
    let model = modelsByKey.get(key);
    if (!model) {
      model = {
        makeId,
        makeName: make.makeName,
        vehicleTypeId,
        vehicleTypeName,
        makeForms: make.forms,
        modelForms: [],
        combinedForms: [],
        modelFormMap: new Map(),
        rows: [],
      };
      modelsByKey.set(key, model);
    }

    model.modelFormMap.set(`${modelForm.spaced}\u0000${modelForm.compact}`, modelForm);
    model.rows.push(row);
  }

  for (const make of makesById.values()) {
    make.rows = [...makeRowsById.get(make.makeId)!.values()];
  }

  const models: IndexedModel[] = [...modelsByKey.values()].map(
    ({ modelFormMap, ...model }) => {
      model.modelForms = [...modelFormMap.values()];
      model.combinedForms = uniqueForms(
        model.makeForms.flatMap((makeForm) =>
          model.modelForms.map((modelForm) =>
            normalizeSearchText(`${makeForm.spaced} ${modelForm.spaced}`),
          ),
        ),
      );
      return model;
    },
  );

  _searchIndex = {
    makes: [...makesById.values()],
    models,
  };
  return _searchIndex;
}

function normalizeSearchText(value: string): SearchText {
  const spaced = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return {
    spaced,
    compact: spaced.replace(/\s/g, ""),
    tokens: spaced.length === 0 ? [] : spaced.split(" "),
  };
}

function uniqueForms(forms: SearchText[]): SearchText[] {
  const seen = new Set<string>();
  return forms.filter((form) => {
    const key = `${form.spaced}\u0000${form.compact}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseQueries(query: string, optionYear: number | undefined): ParsedQuery[] {
  const fullText = normalizeSearchText(query);
  if (fullText.spaced.length === 0) return [];

  const detectedYears = [...query.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) =>
    Number(match[0]),
  );
  const uniqueYears = [...new Set(detectedYears)];
  const onlyYearTokens = fullText.tokens.length > 0 && fullText.tokens.every((token) => {
    const value = Number(token);
    return Number.isInteger(value) && uniqueYears.includes(value);
  });
  if (onlyYearTokens) return [];

  const interpretations: ParsedQuery[] = [
    { text: fullText, year: optionYear, interpretationRank: 0 },
  ];

  const inferredYears =
    optionYear == null ? uniqueYears : uniqueYears.filter((year) => year === optionYear);
  for (const year of inferredYears) {
    const text = normalizeSearchText(query.replace(new RegExp(`\\b${year}\\b`, "g"), " "));
    if (text.spaced.length === 0) continue;
    interpretations.push({ text, year: optionYear ?? year, interpretationRank: 1 });
  }

  return interpretations;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit == null) return 10;
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(100, Math.floor(limit));
}

function matchForms(
  query: SearchText,
  forms: SearchText[],
  fuzzyOnly: boolean,
): LexicalMatch | undefined {
  let best: LexicalMatch | undefined;
  for (const form of forms) {
    const match = fuzzyOnly ? fuzzyMatch(query, form) : nonFuzzyMatch(query, form);
    if (match && (!best || compareMatches(match, best) < 0)) best = match;
  }
  return best;
}

function nonFuzzyMatch(query: SearchText, target: SearchText): LexicalMatch | undefined {
  if (query.spaced === target.spaced || query.compact === target.compact) {
    return lexicalMatch("exact", 0);
  }

  if (target.spaced.startsWith(query.spaced) || target.compact.startsWith(query.compact)) {
    return lexicalMatch("prefix", Math.max(0, target.compact.length - query.compact.length));
  }

  const tokenCloseness = tokenPrefixCloseness(query.tokens, target.tokens);
  if (tokenCloseness != null) return lexicalMatch("token", tokenCloseness);

  const spacedIndex = target.spaced.indexOf(query.spaced);
  const compactIndex = target.compact.indexOf(query.compact);
  if (spacedIndex >= 0 || compactIndex >= 0) {
    const index = Math.min(
      spacedIndex < 0 ? Number.MAX_SAFE_INTEGER : spacedIndex,
      compactIndex < 0 ? Number.MAX_SAFE_INTEGER : compactIndex,
    );
    return lexicalMatch("contains", index + target.compact.length - query.compact.length);
  }

  return undefined;
}

function fuzzyMatch(query: SearchText, target: SearchText): LexicalMatch | undefined {
  const fullLimit = allowedEdits(query.compact.length);
  if (fullLimit > 0 && Math.abs(query.compact.length - target.compact.length) <= fullLimit) {
    const distance = damerauLevenshtein(query.compact, target.compact, fullLimit);
    if (distance <= fullLimit) return lexicalMatch("fuzzy", distance);
  }

  const tokenDistance = fuzzyTokenDistance(query.tokens, target.tokens);
  return tokenDistance == null ? undefined : lexicalMatch("fuzzy", tokenDistance);
}

function lexicalMatch(kind: VehicleSearchMatchKind, closeness: number): LexicalMatch {
  return { kind, rank: MATCH_RANK[kind], closeness };
}

function compareMatches(left: LexicalMatch, right: LexicalMatch): number {
  return left.rank - right.rank || left.closeness - right.closeness;
}

function tokenPrefixCloseness(queryTokens: string[], targetTokens: string[]): number | undefined {
  if (queryTokens.length === 0 || queryTokens.length > targetTokens.length) return undefined;

  const unused = new Set(targetTokens.map((_, index) => index));
  let closeness = 0;
  for (const queryToken of [...queryTokens].sort((left, right) => right.length - left.length)) {
    let bestIndex: number | undefined;
    let bestDifference = Number.MAX_SAFE_INTEGER;
    for (const index of unused) {
      const targetToken = targetTokens[index];
      if (!targetToken.startsWith(queryToken)) continue;
      const difference = targetToken.length - queryToken.length;
      if (difference < bestDifference) {
        bestDifference = difference;
        bestIndex = index;
      }
    }
    if (bestIndex == null) return undefined;
    unused.delete(bestIndex);
    closeness += bestDifference;
  }
  return closeness;
}

function fuzzyTokenDistance(queryTokens: string[], targetTokens: string[]): number | undefined {
  if (queryTokens.length === 0 || queryTokens.length > targetTokens.length) return undefined;

  const unused = new Set(targetTokens.map((_, index) => index));
  let totalDistance = 0;
  for (const queryToken of [...queryTokens].sort((left, right) => right.length - left.length)) {
    const limit = allowedEdits(queryToken.length);
    if (limit === 0) return undefined;

    let bestIndex: number | undefined;
    let bestDistance = Number.MAX_SAFE_INTEGER;
    for (const index of unused) {
      const targetToken = targetTokens[index];
      if (Math.abs(queryToken.length - targetToken.length) > limit) continue;
      const distance = damerauLevenshtein(queryToken, targetToken, limit);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex == null || bestDistance > limit) return undefined;
    unused.delete(bestIndex);
    totalDistance += bestDistance;
  }
  return totalDistance;
}

function allowedEdits(length: number): number {
  if (length < 4) return 0;
  return length < 6 ? 1 : 2;
}

function damerauLevenshtein(left: string, right: string, maximum: number): number {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;

  let previousPrevious = new Array<number>(right.length + 1).fill(0);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = new Array<number>(right.length + 1).fill(0);
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );

      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        current[rightIndex] = Math.min(current[rightIndex], previousPrevious[rightIndex - 2] + 1);
      }
    }

    previousPrevious = previous;
    previous = current;
  }

  return previous[right.length];
}

function selectMakeAvailability(
  rows: IndexedMakeRow[],
  year: number | undefined,
  vehicleTypeId: number | undefined,
  sourceMask: number | undefined,
): { years: number[]; sourceMask: number } {
  const years = new Set<number>();
  let combinedSourceMask = 0;
  for (const row of rows) {
    if (year != null && row.year !== year) continue;
    if (vehicleTypeId != null && row.vehicleTypeId !== vehicleTypeId) continue;
    if (sourceMask != null && (row.sourceMask & sourceMask) === 0) continue;
    years.add(row.year);
    combinedSourceMask |= row.sourceMask;
  }
  return { years: [...years].sort((left, right) => left - right), sourceMask: combinedSourceMask };
}

function selectModelVariants(
  rows: IndexedModelRow[],
  year: number | undefined,
  sourceMask: number | undefined,
): SelectedModelVariant[] {
  const variantsByYear = new Map<number, SelectedModelVariant>();
  for (const row of rows) {
    const [rowYear, , modelId, modelNameIndex, , rowSourceMask] = row;
    if (year != null && rowYear !== year) continue;
    if (sourceMask != null && (rowSourceMask & sourceMask) === 0) continue;

    const existing = variantsByYear.get(rowYear);
    const candidate: SelectedModelVariant = {
      year: rowYear,
      modelId,
      modelName: data.modelNames[modelNameIndex],
      sourceMask: rowSourceMask,
      sourceIds: getSourceIds(rowSourceMask),
    };
    if (!existing) {
      variantsByYear.set(rowYear, candidate);
      continue;
    }

    const combinedSourceMask = existing.sourceMask | rowSourceMask;
    const preferred = compareRepresentativeVariants(candidate, existing) < 0 ? candidate : existing;
    variantsByYear.set(rowYear, {
      ...preferred,
      sourceMask: combinedSourceMask,
      sourceIds: getSourceIds(combinedSourceMask),
    });
  }

  return [...variantsByYear.values()].sort((left, right) => left.year - right.year);
}

function compareRepresentativeVariants(
  left: SelectedModelVariant,
  right: SelectedModelVariant,
): number {
  return (
    firstSourceIndex(left.sourceMask) - firstSourceIndex(right.sourceMask) ||
    displayNameRank(left.modelName) - displayNameRank(right.modelName) ||
    left.modelName.length - right.modelName.length ||
    compareStrings(left.modelName, right.modelName) ||
    left.modelId - right.modelId
  );
}

function firstSourceIndex(sourceMask: number): number {
  for (let index = 0; index < data.sources.length; index++) {
    if ((sourceMask & 2 ** index) !== 0) return index;
  }
  return Number.MAX_SAFE_INTEGER;
}

function displayNameRank(value: string): number {
  return /[a-z]/.test(value) && /[A-Z]/.test(value) ? 0 : 1;
}

function getSourceIds(sourceMask: number): string[] {
  const sourceIds: string[] = [];
  for (let index = 0; index < data.sources.length; index++) {
    if ((sourceMask & 2 ** index) !== 0) sourceIds.push(data.sources[index].source_id);
  }
  return sourceIds;
}

function compareRankedResults(left: RankedResult, right: RankedResult): number {
  return (
    left.rank - right.rank ||
    left.interpretationRank - right.interpretationRank ||
    left.closeness - right.closeness ||
    (left.result.kind === right.result.kind ? 0 : left.result.kind === "make" ? -1 : 1) ||
    compareStrings(left.result.makeName, right.result.makeName) ||
    compareStrings(
      left.result.kind === "model" ? left.result.modelName : "",
      right.result.kind === "model" ? right.result.modelName : "",
    ) ||
    (left.result.kind === "model" ? left.result.vehicleTypeId : 0) -
      (right.result.kind === "model" ? right.result.vehicleTypeId : 0) ||
    compareStrings(left.key, right.key)
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
