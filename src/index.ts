import data from "./data";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface VehicleType {
  vehicleTypeId: number;
  vehicleTypeName: string;
}

export interface DataSource {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  licenseUrl?: string;
  region: string;
  description: string;
  retrievedAt: string;
  vehicleTypeIds: number[];
  yearFrom: number;
  yearTo: number;
  makeCount: number;
  modelCount: number;
}

export interface Make {
  makeId: number;
  makeName: string;
}

export interface Model {
  modelId: number;
  modelName: string;
  makeId: number;
  makeName: string;
  vehicleTypeId: number;
  vehicleTypeName: string;
  sourceIds: string[];
}

export interface GetMakesOptions {
  year?: number;
  vehicleTypeId?: number;
  sourceId?: string;
}

export interface GetModelsOptions {
  year?: number;
  vehicleTypeId?: number;
  makeId?: number;
  modelId?: number;
  sourceId?: string;
}

export interface GetAvailableYearsOptions {
  vehicleTypeId?: number;
  makeId?: number;
  modelId?: number;
  sourceId?: string;
}

export interface VehicleYearRange {
  yearFrom: number;
  yearTo: number;
}

/**
 * A sourced period in which a model shares one exterior design. Ranges may
 * overlap when a facelift, body variant, or regional model changed during a
 * calendar year; callers must not treat an overlap as render-equivalent.
 */
export interface VehicleAppearanceRange {
  appearanceId: string;
  makeId: number;
  makeName: string;
  modelName: string;
  label: string;
  bodyStyle: string;
  yearFrom: number;
  yearTo: number;
  representativeYear: number;
  regions: string[];
  sourceName: string;
  sourceUrl: string;
}

export interface GetModelAppearanceRangesOptions {
  makeId: number;
  modelName: string;
  year?: number;
}

export interface GetModelRenderGroupsOptions extends GetModelAppearanceRangesOptions {
  vehicleTypeId?: number;
  sourceId?: string;
}

/**
 * Safe cache groups for every available year. Sourced, unambiguous appearance
 * periods are grouped; unknown and overlapping years deliberately stay as
 * singleton exact-year groups.
 */
export interface VehicleRenderGroup {
  groupId: string;
  kind: "appearance" | "year";
  years: number[];
  yearFrom: number;
  yearTo: number;
  representativeYear: number;
  appearance?: VehicleAppearanceRange;
}

// ---------------------------------------------------------------------------
// Internal lookup maps (lazy)
// ---------------------------------------------------------------------------
let _makeMap: Map<number, string> | null = null;
let _typeMap: Map<number, string> | null = null;
let _sourceMaskMap: Map<string, number> | null = null;

function getMakeMap(): Map<number, string> {
  if (!_makeMap) {
    _makeMap = new Map(data.makes.map((m) => [m.make_id, m.make_name]));
  }
  return _makeMap;
}

function getTypeMap(): Map<number, string> {
  if (!_typeMap) {
    _typeMap = new Map(data.vehicleTypes.map((t) => [t.vehicle_type_id, t.vehicle_type_name]));
  }
  return _typeMap;
}

function getSourceMaskMap(): Map<string, number> {
  if (!_sourceMaskMap) {
    _sourceMaskMap = new Map(data.sources.map((source, index) => [source.source_id, 2 ** index]));
  }
  return _sourceMaskMap;
}

function getSourceIds(sourceMask: number): string[] {
  const sourceIds: string[] = [];
  for (let index = 0; index < data.sources.length; index++) {
    if ((sourceMask & 2 ** index) !== 0) sourceIds.push(data.sources[index].source_id);
  }
  return sourceIds;
}

function normalizeLookupName(value: string): string {
  return value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, " ");
}

function compactYears(years: readonly number[]): VehicleYearRange[] {
  const sorted = [...new Set(years)].sort((left, right) => left - right);
  const ranges: VehicleYearRange[] = [];
  for (const year of sorted) {
    const previous = ranges[ranges.length - 1];
    if (previous && previous.yearTo + 1 === year) previous.yearTo = year;
    else ranges.push({ yearFrom: year, yearTo: year });
  }
  return ranges;
}

function modelNameYears(options: GetModelRenderGroupsOptions): number[] {
  const sourceMask = options.sourceId == null ? undefined : getSourceMaskMap().get(options.sourceId);
  if (options.sourceId != null && sourceMask == null) return [];

  const wantedModel = normalizeLookupName(options.modelName);
  const years = new Set<number>();
  for (const model of data.models) {
    if (model[1] !== options.makeId) continue;
    if (options.vehicleTypeId != null && model[4] !== options.vehicleTypeId) continue;
    if (sourceMask != null && (model[5] & sourceMask) === 0) continue;
    if (normalizeLookupName(data.modelNames[model[3]]) !== wantedModel) continue;
    years.add(model[0]);
  }
  return [...years].sort((left, right) => left - right);
}

function toAppearanceRange(
  range: (typeof data.appearanceRanges)[number],
): VehicleAppearanceRange {
  return {
    appearanceId: range.id,
    makeId: range.make_id,
    makeName: range.make_name,
    modelName: range.model_name,
    label: range.label,
    bodyStyle: range.body_style,
    yearFrom: range.year_from,
    yearTo: range.year_to,
    representativeYear: range.representative_year,
    regions: [...range.regions],
    sourceName: range.source_name,
    sourceUrl: range.source_url,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all vehicle types in the database.
 */
export function getVehicleTypes(): VehicleType[] {
  return data.vehicleTypes.map((t) => ({
    vehicleTypeId: t.vehicle_type_id,
    vehicleTypeName: t.vehicle_type_name,
  }));
}

/**
 * Returns provenance and coverage metadata for every bundled source.
 */
export function getDataSources(): DataSource[] {
  return data.sources.map((source) => ({
    sourceId: source.source_id,
    sourceName: source.source_name,
    sourceUrl: source.source_url,
    license: source.license,
    ...(source.license_url ? { licenseUrl: source.license_url } : {}),
    region: source.region,
    description: source.description,
    retrievedAt: source.retrieved_at,
    vehicleTypeIds: [...source.vehicle_type_ids],
    yearFrom: source.year_from,
    yearTo: source.year_to,
    makeCount: source.make_count,
    modelCount: source.model_count,
  }));
}

/**
 * Returns makes, optionally filtered by year and/or vehicle type.
 */
export function getMakes(options: GetMakesOptions = {}): Make[] {
  const { year, vehicleTypeId, sourceId } = options;

  if (year == null && vehicleTypeId == null && sourceId == null) {
    return data.makes.map((m) => ({ makeId: m.make_id, makeName: m.make_name }));
  }

  const sourceMask = sourceId == null ? undefined : getSourceMaskMap().get(sourceId);
  if (sourceId != null && sourceMask == null) return [];

  const makeIds = new Set<number>();
  for (const m of data.models) {
    if (year != null && m[0] !== year) continue;
    if (vehicleTypeId != null && m[4] !== vehicleTypeId) continue;
    if (sourceMask != null && (m[5] & sourceMask) === 0) continue;
    makeIds.add(m[1]);
  }

  const makeMap = getMakeMap();
  return [...makeIds]
    .map((id) => ({ makeId: id, makeName: makeMap.get(id)! }))
    .sort((a, b) => (a.makeName < b.makeName ? -1 : a.makeName > b.makeName ? 1 : 0));
}

/**
 * Returns models, optionally filtered by year, vehicle type, and/or make.
 */
export function getModels(options: GetModelsOptions = {}): Model[] {
  const makeMap = getMakeMap();
  const typeMap = getTypeMap();
  const { year, vehicleTypeId, makeId, modelId, sourceId } = options;
  const sourceMask = sourceId == null ? undefined : getSourceMaskMap().get(sourceId);
  if (sourceId != null && sourceMask == null) return [];

  const results: Model[] = [];
  for (const m of data.models) {
    if (year != null && m[0] !== year) continue;
    if (makeId != null && m[1] !== makeId) continue;
    if (modelId != null && m[2] !== modelId) continue;
    if (vehicleTypeId != null && m[4] !== vehicleTypeId) continue;
    if (sourceMask != null && (m[5] & sourceMask) === 0) continue;
    results.push({
      modelId: m[2],
      modelName: data.modelNames[m[3]],
      makeId: m[1],
      makeName: makeMap.get(m[1])!,
      vehicleTypeId: m[4],
      vehicleTypeName: typeMap.get(m[4])!,
      sourceIds: getSourceIds(m[5]),
    });
  }

  return results.sort(
    (a, b) =>
      (a.modelName < b.modelName ? -1 : a.modelName > b.modelName ? 1 : 0) ||
      a.vehicleTypeId - b.vehicleTypeId,
  );
}

/**
 * Gets available years, optionally filtered by vehicle identity and source.
 */
export function getAvailableYears(options: GetAvailableYearsOptions = {}): number[] {
  const { vehicleTypeId, makeId, modelId, sourceId } = options;
  const sourceMask = sourceId == null ? undefined : getSourceMaskMap().get(sourceId);
  if (sourceId != null && sourceMask == null) return [];

  const years = new Set<number>();
  for (const m of data.models) {
    if (makeId != null && m[1] !== makeId) continue;
    if (modelId != null && m[2] !== modelId) continue;
    if (vehicleTypeId != null && m[4] !== vehicleTypeId) continue;
    if (sourceMask != null && (m[5] & sourceMask) === 0) continue;
    years.add(m[0]);
  }
  return [...years].sort((a, b) => a - b);
}

/**
 * Compresses available catalog years into contiguous ranges. These ranges
 * describe availability only; use getModelAppearanceRanges when exterior
 * equivalence matters.
 */
export function getAvailableYearRanges(
  options: GetAvailableYearsOptions = {},
): VehicleYearRange[] {
  return compactYears(getAvailableYears(options));
}

/** Returns the curated, source-backed exterior-design periods for a model. */
export function getModelAppearanceRanges(
  options: GetModelAppearanceRangesOptions,
): VehicleAppearanceRange[] {
  const wantedModel = normalizeLookupName(options.modelName);
  return data.appearanceRanges
    .filter(
      (range) =>
        range.make_id === options.makeId &&
        normalizeLookupName(range.model_name) === wantedModel &&
        (options.year == null ||
          (range.year_from <= options.year && range.year_to >= options.year)),
    )
    .map(toAppearanceRange);
}

/**
 * Returns a complete, non-overlapping render plan for a model. A year is only
 * grouped when exactly one verified appearance range contains it.
 */
export function getModelRenderGroups(
  options: GetModelRenderGroupsOptions,
): VehicleRenderGroup[] {
  const years = modelNameYears(options);
  const appearances = getModelAppearanceRanges(options);
  const groupYears = new Map<string, number[]>();
  const appearanceByGroup = new Map<string, VehicleAppearanceRange>();

  for (const year of years) {
    const candidates = appearances.filter(
      (appearance) => appearance.yearFrom <= year && appearance.yearTo >= year,
    );
    const groupId = candidates.length === 1 ? candidates[0].appearanceId : `year:${year}`;
    const existing = groupYears.get(groupId);
    if (existing) existing.push(year);
    else groupYears.set(groupId, [year]);
    if (candidates.length === 1) appearanceByGroup.set(groupId, candidates[0]);
  }

  return [...groupYears.entries()]
    .map(([groupId, groupedYears]): VehicleRenderGroup => {
      const appearance = appearanceByGroup.get(groupId);
      const preferred = appearance?.representativeYear;
      const representativeYear =
        preferred != null && groupedYears.includes(preferred)
          ? preferred
          : groupedYears.reduce((best, year) =>
              preferred != null && Math.abs(year - preferred) < Math.abs(best - preferred)
                ? year
                : best,
            );
      return {
        groupId,
        kind: appearance ? "appearance" : "year",
        years: [...groupedYears],
        yearFrom: groupedYears[0],
        yearTo: groupedYears[groupedYears.length - 1],
        representativeYear,
        ...(appearance ? { appearance } : {}),
      };
    })
    .sort((left, right) => left.yearFrom - right.yearFrom || left.yearTo - right.yearTo);
}

/**
 * Canonical year for cache/storage identity. Unknown, unavailable, and
 * ambiguous years return themselves, which is the fail-closed behavior.
 */
export function getRepresentativeYear(
  options: GetModelRenderGroupsOptions & { year: number },
): number {
  const group = getModelRenderGroups(options).find((candidate) =>
    candidate.years.includes(options.year),
  );
  return group?.representativeYear ?? options.year;
}
