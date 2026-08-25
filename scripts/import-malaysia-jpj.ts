/**
 * Refreshes the normalized Malaysian Road Transport Department (JPJ) source
 * snapshot from data.gov.my's annual registration transaction CSVs.
 *
 * Usage:
 *   npx tsx scripts/import-malaysia-jpj.ts
 *   npx tsx scripts/import-malaysia-jpj.ts --start-year 2024 --end-year 2026
 *   npx tsx scripts/import-malaysia-jpj.ts --input cars_2026.csv
 */
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  assertNoIdCollision,
  compareStrings,
  normalizeName,
  parseCsvLine,
  stableSourceId,
  type SourceCatalog,
} from "./catalog-types";

const SOURCE_PAGE = "https://data.gov.my/data-catalogue/registration_transactions_car";
const RAW_URL = (year: number) =>
  `https://storage.data.gov.my/transportation/cars_${year}.csv`;
const DEFAULT_OUT_PATH = path.join(
  __dirname,
  "..",
  "data",
  "sources",
  "malaysia-jpj.json",
);
const DEFAULT_START_YEAR = 2024;

const VEHICLE_TYPE_MAP = new Map<string, { id: number; name: string }>([
  ["motokar", { id: 2, name: "Passenger Car" }],
  ["pick_up", { id: 3, name: "Truck" }],
  ["jip", { id: 7, name: "Multipurpose Passenger Vehicle (MPV)" }],
  ["motokar_pelbagai_utiliti", { id: 7, name: "Multipurpose Passenger Vehicle (MPV)" }],
  ["window_van", { id: 7, name: "Multipurpose Passenger Vehicle (MPV)" }],
]);

interface RawEntry {
  year: number;
  makeName: string;
  modelName: string;
  vehicleTypeId: number;
}

function isUsefulName(value: string): boolean {
  const normalized = normalizeName(value);
  return (
    normalized.length > 0 &&
    !["N/A", "NA", "NOT APPLICABLE", "OTHER", "UNKNOWN", "UNSPECIFIED"].includes(normalized)
  );
}

async function download(url: string, destination: string): Promise<void> {
  console.log(`Downloading ${url}`);
  const response = await fetch(url, {
    headers: { "User-Agent": "MeterApp-vehicle-db-source-refresh" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body as never), fs.createWriteStream(destination));
}

async function readSourceFile(filePath: string, entries: Map<string, RawEntry>): Promise<number> {
  const input = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });
  let header: string[] | undefined;
  let included = 0;
  let lineNumber = 0;

  for await (const line of input) {
    lineNumber++;
    const values = parseCsvLine(line);
    if (!header) {
      header = values.map((value) => value.trim());
      continue;
    }
    if (values.length !== header.length) {
      throw new Error(`${filePath}:${lineNumber} has ${values.length} columns; expected ${header.length}`);
    }

    const get = (name: string): string => values[header!.indexOf(name)] ?? "";
    const date = get("date_reg");
    const year = Number(date.slice(0, 4));
    const vehicleType = VEHICLE_TYPE_MAP.get(get("type"));
    const make = get("maker");
    const model = get("model");
    if (!Number.isInteger(year) || !vehicleType || !isUsefulName(make) || !isUsefulName(model)) {
      continue;
    }

    const makeName = normalizeName(make);
    const modelName = normalizeName(model);
    const key = `${year}\u0000${makeName}\u0000${modelName}\u0000${vehicleType.id}`;
    if (!entries.has(key)) {
      entries.set(key, { year, makeName, modelName, vehicleTypeId: vehicleType.id });
      included++;
    }
  }
  return included;
}

export async function buildSourceCatalog(
  inputPaths: string[],
  retrievedAt = new Date().toISOString().slice(0, 10),
): Promise<SourceCatalog> {
  const entries = new Map<string, RawEntry>();
  for (const inputPath of inputPaths) {
    const added = await readSourceFile(inputPath, entries);
    console.log(`${path.basename(inputPath)}: ${added.toLocaleString()} unique entries added`);
  }

  const makeNames = [...new Set([...entries.values()].map((entry) => entry.makeName))].sort(
    compareStrings,
  );
  const modelNames = [...new Set([...entries.values()].map((entry) => entry.modelName))].sort(
    compareStrings,
  );
  const modelNameIndexes = new Map(modelNames.map((name, index) => [name, index]));
  const makeIds = new Map<string, number>();
  const usedMakeIds = new Map<number, string>();
  const usedModelIds = new Map<number, string>();

  const makes = makeNames.map((makeName) => {
    const idKey = `malaysia-jpj:make:${makeName}`;
    const makeId = stableSourceId(idKey);
    assertNoIdCollision(usedMakeIds, makeId, idKey, "Make");
    makeIds.set(makeName, makeId);
    return { make_id: makeId, make_name: makeName };
  });

  const models: SourceCatalog["models"] = [...entries.values()]
    .sort(
      (left, right) =>
        left.year - right.year ||
        compareStrings(left.makeName, right.makeName) ||
        compareStrings(left.modelName, right.modelName) ||
        left.vehicleTypeId - right.vehicleTypeId,
    )
    .map((entry) => {
      const modelKey = `malaysia-jpj:model:${entry.makeName}:${entry.modelName}`;
      const modelId = stableSourceId(modelKey);
      assertNoIdCollision(usedModelIds, modelId, modelKey, "Model");
      return [
        entry.year,
        makeIds.get(entry.makeName)!,
        modelId,
        modelNameIndexes.get(entry.modelName)!,
        entry.vehicleTypeId,
      ];
    });

  const usedTypeIds = new Set(models.map((model) => model[4]));
  const vehicleTypes = [...new Map([...VEHICLE_TYPE_MAP.values()].map((type) => [type.id, type])).values()]
    .filter((type) => usedTypeIds.has(type.id))
    .sort((left, right) => left.id - right.id)
    .map((type) => ({ vehicle_type_id: type.id, vehicle_type_name: type.name }));

  return {
    metadata: {
      id: "malaysia-jpj-registrations",
      name: "Malaysia JPJ Car Registration Transactions",
      url: SOURCE_PAGE,
      license: "Creative Commons Attribution 4.0 International",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      region: "Malaysia",
      description:
        "Passenger cars, MPVs, jeeps, pickups, and window vans registered by Malaysia's Road Transport Department, keyed by registration year.",
      retrievedAt,
    },
    vehicleTypes,
    makes,
    modelNames,
    models,
  };
}

function parseArguments(): {
  inputPaths: string[];
  outPath: string;
  startYear: number;
  endYear: number;
} {
  const args = process.argv.slice(2);
  const inputPaths: string[] = [];
  let outPath = DEFAULT_OUT_PATH;
  let startYear = DEFAULT_START_YEAR;
  let endYear = new Date().getUTCFullYear();

  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--input") inputPaths.push(path.resolve(args[++index]));
    else if (args[index] === "--out") outPath = path.resolve(args[++index]);
    else if (args[index] === "--start-year") startYear = Number(args[++index]);
    else if (args[index] === "--end-year") endYear = Number(args[++index]);
    else throw new Error(`Unknown argument: ${args[index]}`);
  }

  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) {
    throw new Error(`Invalid year range: ${startYear}–${endYear}`);
  }
  return { inputPaths, outPath, startYear, endYear };
}

async function main(): Promise<void> {
  const { inputPaths, outPath, startYear, endYear } = parseArguments();
  let temporaryDirectory: string | undefined;
  let sources = inputPaths;

  try {
    if (sources.length === 0) {
      temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle-db-malaysia-jpj-"));
      sources = [];
      for (let year = startYear; year <= endYear; year++) {
        const destination = path.join(temporaryDirectory, `cars-${year}.csv`);
        await download(RAW_URL(year), destination);
        sources.push(destination);
      }
    }

    const catalog = await buildSourceCatalog(sources);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(catalog));

    const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
    console.log("\nDone!");
    console.log(`  Vehicle types: ${catalog.vehicleTypes.length}`);
    console.log(`  Makes:         ${catalog.makes.length.toLocaleString()}`);
    console.log(`  Model names:   ${catalog.modelNames.length.toLocaleString()}`);
    console.log(`  Model entries: ${catalog.models.length.toLocaleString()}`);
    console.log(`  File size:     ${sizeMb} MB`);
    console.log(`  Output:        ${outPath}`);
  } finally {
    if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
