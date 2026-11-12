/**
 * Composes all normalized source snapshots into the bundled runtime catalog.
 *
 * Usage: npx tsx scripts/build-db.ts
 */
import fs from "fs";
import path from "path";
import { compareStrings, normalizeName, type SourceCatalog } from "./catalog-types";

const SOURCES_DIRECTORY = path.join(__dirname, "..", "data", "sources");
const COMPACT_JSON_PATH = path.join(__dirname, "..", "data", "compact.json");
const TYPESCRIPT_PATH = path.join(__dirname, "..", "src", "data.ts");
// New source coverage must not replace IDs already published for an identical
// year/make/model/type. These pins retain the 2.9.0 selections where expanded
// Malaysia coverage would otherwise outrank the European source's model ID.
// Pins for newly reported types also preserve the first model ID returned by
// an unfiltered year/make/model picker that previously had only another type.
const MODEL_ID_COMPATIBILITY_PATH = path.join(__dirname, "..", "data", "model-id-compatibility.json");
// Reviewed manufacturer rows are evidenced for one market each. The market stays in the evidence
// sidecars; the bundle carries only a compact mask so the resolver can answer a market request.
const REVIEWED_EVIDENCE_PATHS = [
  path.join(__dirname, "..", "data", "evidence", "manufacturer-reviewed.json"),
  path.join(__dirname, "..", "data", "evidence", "manufacturer-catalogs", "legacy-regional.json"),
];
const REVIEWED_SOURCE_IDS = ["manufacturer-reviewed", "manufacturer-reviewed-catalog"];
const SOURCE_PRIORITY = [
  "nhtsa-vpic",
  "uk-dft-vehicle-licensing",
  "atul-auto-catalog",
  "nzta-asia-pacific-mvr",
  "malaysia-jpj-registrations",
  "eea-co2-monitoring",
  "rdw-nl-vehicle-register",
  "hyundai-brazil-catalog",
  "fueleconomy-maserati-us",
  "fueleconomy-us",
  "manufacturer-reviewed",
  "senatran-br-renavam",
  "manufacturer-reviewed-catalog",
  "bajaj-manufacturer-catalog",
  "changan-manufacturer-catalog",
  "changan-manufacturer-model-years",
  "sgmw-manufacturer-catalog",
  "sgmw-manufacturer-model-years",
  "india-commercial-sales-catalog",
  "india-hero-sales-catalog",
  "india-passenger-sales-catalog",
  "india-tvs-sales-catalog",
  "india-two-wheelers-sales-catalog",
];
// Preserve previously shipped make IDs as source coverage expands, so stored
// selections remain valid even when an earlier-priority source gains a make.
const LEGACY_MAKE_IDS = new Map<string, number>([
  ["BORGWARD", 3026144727],
  ["VAUXHALL", 100101],
  ["CITROEN", 100102],
  ["MAXUS", 100103],
  ["IVECO", 100104],
  ["SKODA", 100105],
  ["DACIA", 100106],
  ["RANGE ROVER", 100107],
  ["MG", 100108],
]);
const MAKE_NAME_ALIASES = new Map<string, string>([
  ["DONG FENG", "DONGFENG"],
  ["HARLEY DAVIDSON", "HARLEY-DAVIDSON"],
  ["MERCEDES", "MERCEDES-BENZ"],
  ["MERCEDES BENZ", "MERCEDES-BENZ"],
  ["ROLLS ROYCE", "ROLLS-ROYCE"],
]);

interface CompiledSource {
  source_id: string;
  source_name: string;
  source_url: string;
  license: string;
  license_url?: string;
  region: string;
  description: string;
  retrieved_at: string;
  year_basis?: "model-year" | "catalog-year";
  vehicle_type_ids: number[];
  year_from: number;
  year_to: number;
  make_count: number;
  model_count: number;
}

interface CompactData {
  sources: CompiledSource[];
  vehicleTypes: { vehicle_type_id: number; vehicle_type_name: string }[];
  makes: { make_id: number; make_name: string }[];
  modelNames: string[];
  models: [number, number, number, number, number, number][];
  /**
   * Markets the reviewed manufacturer rows were evidenced for: `sets` are sorted market lists,
   * `rows` are flat pairs of (index into `models`, index into `sets`), ordered by row.
   */
  reviewedMarkets: { sets: string[][]; rows: number[] };
}

function loadSources(): SourceCatalog[] {
  const sources = fs
    .readdirSync(SOURCES_DIRECTORY)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const filePath = path.join(SOURCES_DIRECTORY, fileName);
      const catalog = JSON.parse(fs.readFileSync(filePath, "utf8")) as SourceCatalog;
      if (!catalog.metadata?.id || !Array.isArray(catalog.models)) {
        throw new Error(`Invalid source catalog: ${filePath}`);
      }
      return catalog;
    });

  const priority = new Map(SOURCE_PRIORITY.map((sourceId, index) => [sourceId, index]));
  sources.sort(
    (left, right) =>
      (priority.get(left.metadata.id) ?? Number.MAX_SAFE_INTEGER) -
        (priority.get(right.metadata.id) ?? Number.MAX_SAFE_INTEGER) ||
      compareStrings(left.metadata.id, right.metadata.id),
  );

  if (sources.length > 30) {
    throw new Error("The compact source bitmask supports at most 30 source catalogs");
  }
  return sources;
}

function compile(sources: SourceCatalog[]): CompactData {
  const vehicleTypes = new Map<number, string>();
  const makeByNormalizedName = new Map<string, { id: number; name: string }>();
  const makeNameById = new Map<number, string>();
  const sourceMakeIds: Map<number, number>[] = [];

  for (const [sourceIndex, source] of sources.entries()) {
    for (const type of source.vehicleTypes) {
      const existing = vehicleTypes.get(type.vehicle_type_id);
      if (existing && existing !== type.vehicle_type_name) {
        throw new Error(
          `Vehicle type ${type.vehicle_type_id} conflicts: ${existing} vs ${type.vehicle_type_name}`,
        );
      }
      vehicleTypes.set(type.vehicle_type_id, type.vehicle_type_name);
    }

    const makeIds = new Map<number, number>();
    for (const make of source.makes) {
      const sourceName = normalizeName(make.make_name);
      const normalizedName = MAKE_NAME_ALIASES.get(sourceName) ?? sourceName;
      let canonical = makeByNormalizedName.get(normalizedName);
      if (!canonical) {
        const canonicalId = LEGACY_MAKE_IDS.get(normalizedName) ?? make.make_id;
        const existingName = makeNameById.get(canonicalId);
        if (existingName && existingName !== normalizedName) {
          throw new Error(`Make ID ${canonicalId} conflicts: ${existingName} vs ${normalizedName}`);
        }
        canonical = { id: canonicalId, name: make.make_name.trim() };
        makeByNormalizedName.set(normalizedName, canonical);
        makeNameById.set(canonical.id, normalizedName);
      }
      makeIds.set(make.make_id, canonical.id);
    }
    sourceMakeIds[sourceIndex] = makeIds;
  }

  type WorkingModel = {
    year: number;
    makeId: number;
    modelId: number;
    modelName: string;
    vehicleTypeId: number;
    sourceMask: number;
  };

  const modelByKey = new Map<string, WorkingModel>();
  const modelIdOwners = new Map<number, string>();

  for (const [sourceIndex, source] of sources.entries()) {
    const sourceMask = 2 ** sourceIndex;
    for (const model of source.models) {
      const [year, sourceMakeId, modelId, modelNameIndex, vehicleTypeId] = model;
      const makeId = sourceMakeIds[sourceIndex].get(sourceMakeId);
      const modelName = source.modelNames[modelNameIndex];
      if (makeId == null || modelName == null) {
        throw new Error(`Source ${source.metadata.id} contains an invalid model reference`);
      }
      if (!vehicleTypes.has(vehicleTypeId)) {
        throw new Error(`Source ${source.metadata.id} uses unknown vehicle type ${vehicleTypeId}`);
      }

      const normalizedModelName = normalizeName(modelName);
      const ownerKey = `${makeId}\u0000${normalizedModelName}`;
      const existingOwner = modelIdOwners.get(modelId);
      if (existingOwner && existingOwner !== ownerKey) {
        throw new Error(`Model ID ${modelId} conflicts across ${existingOwner} and ${ownerKey}`);
      }
      modelIdOwners.set(modelId, ownerKey);

      const key = `${year}\u0000${ownerKey}\u0000${vehicleTypeId}`;
      const existing = modelByKey.get(key);
      if (existing) {
        existing.sourceMask |= sourceMask;
      } else {
        modelByKey.set(key, {
          year,
          makeId,
          modelId,
          modelName: modelName.trim(),
          vehicleTypeId,
          sourceMask,
        });
      }
    }
  }

  const compatibilityRows = JSON.parse(fs.readFileSync(MODEL_ID_COMPATIBILITY_PATH, "utf8")) as
    [number, number, string, number, number][];
  const pinnedKeys = new Set<string>();
  for (const [year, makeId, modelName, vehicleTypeId, modelId] of compatibilityRows) {
    const ownerKey = `${makeId}\u0000${normalizeName(modelName)}`;
    const key = `${year}\u0000${ownerKey}\u0000${vehicleTypeId}`;
    const model = modelByKey.get(key);
    if (!model || pinnedKeys.has(key) || !Number.isSafeInteger(modelId) || modelId <= 0) {
      throw new Error(`Invalid or missing published model identity: ${key}`);
    }
    const existingOwner = modelIdOwners.get(modelId);
    if (existingOwner && existingOwner !== ownerKey) {
      throw new Error(`Published model ID ${modelId} conflicts with ${existingOwner}`);
    }
    modelIdOwners.set(modelId, ownerKey);
    model.modelId = modelId;
    pinnedKeys.add(key);
  }

  const workingModels = [...modelByKey.values()].sort(
    (left, right) =>
      left.year - right.year ||
      left.makeId - right.makeId ||
      compareStrings(left.modelName, right.modelName) ||
      left.vehicleTypeId - right.vehicleTypeId,
  );
  const modelNames = [...new Set(workingModels.map((model) => model.modelName))].sort(compareStrings);
  const modelNameIndexes = new Map(modelNames.map((name, index) => [name, index]));
  const models: CompactData["models"] = workingModels.map((model) => [
    model.year,
    model.makeId,
    model.modelId,
    modelNameIndexes.get(model.modelName)!,
    model.vehicleTypeId,
    model.sourceMask,
  ]);

  const reviewedMask = REVIEWED_SOURCE_IDS.reduce((mask, id) => {
    const index = sources.findIndex((source) => source.metadata.id === id);
    return index < 0 ? mask : mask + 2 ** index;
  }, 0);
  const marketsByRow = new Map<string, Set<string>>();
  for (const file of REVIEWED_EVIDENCE_PATHS) {
    if (!fs.existsSync(file)) continue;
    const { records } = JSON.parse(fs.readFileSync(file, "utf8")) as {
      records: { year: number; make: string; model: string; vehicleTypeId: number; market?: string }[];
    };
    for (const record of records) {
      if (!record.market || !/^[A-Z]{2}$/.test(record.market)) continue;
      const makeName = normalizeName(record.make);
      const make = makeByNormalizedName.get(MAKE_NAME_ALIASES.get(makeName) ?? makeName);
      if (!make) continue;
      const key = `${record.year}\u0000${make.id}\u0000${normalizeName(record.model)}\u0000${record.vehicleTypeId}`;
      const markets = marketsByRow.get(key) ?? new Set<string>();
      markets.add(record.market);
      marketsByRow.set(key, markets);
    }
  }
  const marketSets: string[][] = [];
  const marketSetIndexes = new Map<string, number>();
  const marketRows: number[] = [];
  for (const [rowIndex, model] of workingModels.entries()) {
    if ((model.sourceMask & reviewedMask) === 0) continue;
    const markets = marketsByRow.get(
      `${model.year}\u0000${model.makeId}\u0000${normalizeName(model.modelName)}\u0000${model.vehicleTypeId}`,
    );
    if (!markets) continue;
    const set = [...markets].sort(compareStrings);
    const setKey = set.join(",");
    let setIndex = marketSetIndexes.get(setKey);
    if (setIndex === undefined) {
      setIndex = marketSets.length;
      marketSets.push(set);
      marketSetIndexes.set(setKey, setIndex);
    }
    marketRows.push(rowIndex, setIndex);
  }

  const compiledSources: CompiledSource[] = sources.map((source, sourceIndex) => {
    const sourceMask = 2 ** sourceIndex;
    const matchingModels = workingModels.filter((model) => (model.sourceMask & sourceMask) !== 0);
    if (matchingModels.length === 0) {
      throw new Error(`Source ${source.metadata.id} has no compiled models`);
    }
    const years = matchingModels.map((model) => model.year);
    return {
      source_id: source.metadata.id,
      source_name: source.metadata.name,
      source_url: source.metadata.url,
      license: source.metadata.license,
      ...(source.metadata.licenseUrl ? { license_url: source.metadata.licenseUrl } : {}),
      region: source.metadata.region,
      description: source.metadata.description,
      retrieved_at: source.metadata.retrievedAt,
      ...(source.metadata.yearBasis ? { year_basis: source.metadata.yearBasis } : {}),
      vehicle_type_ids: [...new Set(matchingModels.map((model) => model.vehicleTypeId))].sort(
        (left, right) => left - right,
      ),
      year_from: years.reduce((minimum, year) => Math.min(minimum, year), Infinity),
      year_to: years.reduce((maximum, year) => Math.max(maximum, year), -Infinity),
      make_count: new Set(matchingModels.map((model) => model.makeId)).size,
      model_count: matchingModels.length,
    };
  });

  return {
    sources: compiledSources,
    vehicleTypes: [...vehicleTypes]
      .sort(([left], [right]) => left - right)
      .map(([id, name]) => ({ vehicle_type_id: id, vehicle_type_name: name })),
    makes: [...makeByNormalizedName.values()]
      .map((make) => ({ make_id: make.id, make_name: make.name }))
      .sort((left, right) => compareStrings(left.make_name, right.make_name)),
    modelNames,
    models,
    reviewedMarkets: { sets: marketSets, rows: marketRows },
  };
}

function writeCatalog(data: CompactData): void {
  const json = JSON.stringify(data);
  const typeScript = `// Auto-generated — do not edit. Run npm run build:data to regenerate.

interface CompactData {
  sources: {
    source_id: string;
    source_name: string;
    source_url: string;
    license: string;
    license_url?: string;
    region: string;
    description: string;
    retrieved_at: string;
    year_basis?: "model-year" | "catalog-year";
    vehicle_type_ids: number[];
    year_from: number;
    year_to: number;
    make_count: number;
    model_count: number;
  }[];
  vehicleTypes: { vehicle_type_id: number; vehicle_type_name: string }[];
  makes: { make_id: number; make_name: string }[];
  modelNames: string[];
  models: [number, number, number, number, number, number][];
  /** Markets of reviewed manufacturer rows: rows holds (index into models, index into sets) pairs. */
  reviewedMarkets: { sets: string[][]; rows: number[] };
}

const data: CompactData = ${json};

export default data;
`;

  fs.writeFileSync(COMPACT_JSON_PATH, json);
  fs.writeFileSync(TYPESCRIPT_PATH, typeScript);
}

function main(): void {
  const sources = loadSources();
  const data = compile(sources);
  writeCatalog(data);

  const sizeMb = (fs.statSync(TYPESCRIPT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`Built catalog from ${data.sources.length} sources`);
  for (const source of data.sources) {
    console.log(`  ${source.source_id}: ${source.model_count.toLocaleString()} model-year entries`);
  }
  const years = data.models.map((model) => model[0]);
  const yearFrom = years.reduce((minimum, year) => Math.min(minimum, year), Infinity);
  const yearTo = years.reduce((maximum, year) => Math.max(maximum, year), -Infinity);
  console.log(`  Years:         ${yearFrom}–${yearTo}`);
  console.log(`  Vehicle types: ${data.vehicleTypes.length}`);
  console.log(`  Makes:         ${data.makes.length.toLocaleString()}`);
  console.log(`  Model names:   ${data.modelNames.length.toLocaleString()}`);
  console.log(`  Model entries: ${data.models.length.toLocaleString()}`);
  console.log(
    `  Reviewed rows with a market: ${(data.reviewedMarkets.rows.length / 2).toLocaleString()} (${data.reviewedMarkets.sets.length} market sets, ${JSON.stringify(data.reviewedMarkets).length.toLocaleString()} bytes)`,
  );
  console.log(`  File size:     ${sizeMb} MB`);
}

main();
