import fs from "fs";
import path from "path";

export interface SourceMetadata {
  id: string;
  name: string;
  url: string;
  license: string;
  licenseUrl?: string;
  region: string;
  description: string;
  retrievedAt: string;
}

export interface SourceCatalog {
  metadata: SourceMetadata;
  vehicleTypes: { vehicle_type_id: number; vehicle_type_name: string }[];
  makes: { make_id: number; make_name: string }[];
  modelNames: string[];
  models: [number, number, number, number, number][];
}

export function normalizeName(value: string): string {
  return value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, " ");
}

export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("Unsupported newline inside a quoted CSV field");
  values.push(value);
  return values;
}

/** Stable unsigned FNV-1a ID in a namespace above the IDs assigned by vPIC. */
export function stableSourceId(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return 1_000_000_000 + hash;
}

/** The snapshot a refresh is about to replace, if there is one. */
export function readSnapshot(filePath: string): SourceCatalog | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as SourceCatalog;
}

/**
 * Adds back every entry the previous snapshot published that a refresh no
 * longer reports. Registers drop scrapped vehicles and count thresholds move
 * between releases, but a year/make/model a consumer already stored has to
 * keep resolving, so a refresh only ever adds. Entries match on year, make
 * ID, model ID and vehicle type. Registry IDs derive from names, so a model
 * the source renamed keeps its old entry beside the new one. The result keeps
 * the registry importers' order: makes and model names alphabetically, models
 * by year, make name, model name and vehicle type.
 */
export function retainPublishedEntries(
  previous: SourceCatalog | undefined,
  next: SourceCatalog,
): { catalog: SourceCatalog; retained: number } {
  if (!previous) return { catalog: next, retained: 0 };
  const entryKey = (model: SourceCatalog["models"][number]) =>
    `${model[0]}:${model[1]}:${model[2]}:${model[4]}`;
  const reported = new Set(next.models.map(entryKey));
  const missing = previous.models.filter((model) => !reported.has(entryKey(model)));
  if (missing.length === 0) return { catalog: next, retained: 0 };

  const makeNames = new Map(next.makes.map((make) => [make.make_id, make.make_name]));
  for (const make of previous.makes) {
    if (!makeNames.has(make.make_id)) makeNames.set(make.make_id, make.make_name);
  }
  const typeNames = new Map(
    next.vehicleTypes.map((type) => [type.vehicle_type_id, type.vehicle_type_name]),
  );
  for (const type of previous.vehicleTypes) {
    if (!typeNames.has(type.vehicle_type_id)) {
      typeNames.set(type.vehicle_type_id, type.vehicle_type_name);
    }
  }

  const rows = [
    ...next.models.map((model) => ({ model, name: next.modelNames[model[3]]! })),
    ...missing.map((model) => ({ model, name: previous.modelNames[model[3]]! })),
  ].map(({ model, name }) => ({
    year: model[0],
    makeId: model[1],
    modelId: model[2],
    modelName: name,
    vehicleTypeId: model[4],
  }));
  const makeName = (makeId: number) => makeNames.get(makeId) ?? "";
  rows.sort(
    (left, right) =>
      left.year - right.year ||
      compareStrings(makeName(left.makeId), makeName(right.makeId)) ||
      compareStrings(left.modelName, right.modelName) ||
      left.vehicleTypeId - right.vehicleTypeId,
  );

  const usedMakeIds = new Set(rows.map((row) => row.makeId));
  const usedTypeIds = new Set(rows.map((row) => row.vehicleTypeId));
  const modelNames = [...new Set(rows.map((row) => row.modelName))].sort(compareStrings);
  const nameIndexes = new Map(modelNames.map((name, index) => [name, index]));

  return {
    catalog: {
      ...next,
      vehicleTypes: [...typeNames]
        .filter(([typeId]) => usedTypeIds.has(typeId))
        .sort(([left], [right]) => left - right)
        .map(([vehicle_type_id, vehicle_type_name]) => ({ vehicle_type_id, vehicle_type_name })),
      makes: [...makeNames]
        .filter(([makeId]) => usedMakeIds.has(makeId))
        .map(([make_id, make_name]) => ({ make_id, make_name }))
        .sort((left, right) => compareStrings(left.make_name, right.make_name)),
      modelNames,
      models: rows.map((row) => [
        row.year,
        row.makeId,
        row.modelId,
        nameIndexes.get(row.modelName)!,
        row.vehicleTypeId,
      ]),
    },
    retained: missing.length,
  };
}

/**
 * Writes a refreshed registry snapshot over the previous one, keeping every
 * entry that one published unless the refresh was asked to prune.
 */
export function writeSnapshot(outPath: string, fresh: SourceCatalog, prune: boolean): SourceCatalog {
  const { catalog, retained } = prune
    ? { catalog: fresh, retained: 0 }
    : retainPublishedEntries(readSnapshot(outPath), fresh);
  if (retained > 0) {
    console.log(
      `Kept ${retained.toLocaleString()} published entries the source no longer reports (--prune drops them)`,
    );
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(catalog));
  return catalog;
}

export function assertNoIdCollision(
  ids: Map<number, string>,
  id: number,
  key: string,
  label: string,
): void {
  const existing = ids.get(id);
  if (existing && existing !== key) {
    throw new Error(`${label} ID collision ${id}: ${existing} vs ${key}`);
  }
  ids.set(id, key);
}
