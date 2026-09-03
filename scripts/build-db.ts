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
const SOURCE_PRIORITY = [
  "nhtsa-vpic",
  "uk-dft-vehicle-licensing",
  "atul-auto-catalog",
  "nzta-asia-pacific-mvr",
  "malaysia-jpj-registrations",
  "eea-co2-monitoring",
  "rdw-nl-vehicle-register",
];
// Preserve IDs shipped for these international makes before source snapshots
// were introduced, so stored make selections remain valid across the upgrade.
const LEGACY_MAKE_IDS = new Map<string, number>([
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
  console.log(`  File size:     ${sizeMb} MB`);
}

main();
