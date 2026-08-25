/**
 * Refreshes the normalized UK Department for Transport/DVLA source snapshot.
 *
 * The upstream VEH0124 files contain registered vehicles by make, generic
 * model, body type, and year of manufacture (or first use when unavailable).
 * Raw CSVs are downloaded to a temporary directory and are not committed.
 *
 * Usage:
 *   npx tsx scripts/import-uk-dft.ts
 *   npx tsx scripts/import-uk-dft.ts --input data.csv [--input data-2.csv]
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
  stableSourceId,
  type SourceCatalog,
} from "./catalog-types";

const SOURCE_PAGE =
  "https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files";
const RAW_URLS = [
  "https://assets.publishing.service.gov.uk/media/69ef3c3a20a498c16734afd1/df_VEH0124_AM.csv",
  "https://assets.publishing.service.gov.uk/media/69ef3c8520a498c16734afd2/df_VEH0124_NZ.csv",
];
const DEFAULT_OUT_PATH = path.join(__dirname, "..", "data", "sources", "uk-dft.json");
const MIN_YEAR = 1990;
const MAX_YEAR = 2026;

const BODY_TYPE_MAP = new Map<string, { id: number; name: string }>([
  ["Motorcycles", { id: 1, name: "Motorcycle" }],
  ["Cars", { id: 2, name: "Passenger Car" }],
  ["Heavy goods vehicles", { id: 3, name: "Truck" }],
  ["Light goods vehicles", { id: 3, name: "Truck" }],
  ["Buses and coaches", { id: 5, name: "Bus" }],
  ["Other vehicles", { id: 10002, name: "Other Vehicle" }],
]);

function hasVehicleCount(value: string): boolean {
  if (value === "[c]") return true;
  const count = Number(value);
  return Number.isFinite(count) && count > 0;
}

function isUsefulName(value: string): boolean {
  const normalized = normalizeName(value);
  return (
    normalized.length > 0 &&
    normalized !== "[X]" &&
    normalized !== "UNKNOWN" &&
    !normalized.includes("MISSING") &&
    !normalized.includes("NOT RECORDED")
  );
}

function modelNameWithoutMake(makeName: string, genericModel: string): string {
  const normalizedMake = normalizeName(makeName);
  const normalizedModel = normalizeName(genericModel);
  if (normalizedModel.startsWith(`${normalizedMake} `)) {
    return normalizedModel.slice(normalizedMake.length + 1);
  }
  return normalizedModel;
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

async function download(url: string, destination: string): Promise<void> {
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body as never), fs.createWriteStream(destination));
}

interface RawEntry {
  year: number;
  makeName: string;
  modelName: string;
  vehicleTypeId: number;
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
      header = values;
      continue;
    }
    if (values.length !== header.length) {
      throw new Error(`${filePath}:${lineNumber} has ${values.length} columns; expected ${header.length}`);
    }

    const [bodyType, makeName, genericModel, , yearFirstUsed, yearManufacture] = values;
    const vehicleType = BODY_TYPE_MAP.get(bodyType);
    if (!vehicleType || !isUsefulName(makeName) || !isUsefulName(genericModel)) continue;
    if (!values.slice(7).some(hasVehicleCount)) continue;

    const manufactureYear = Number(yearManufacture);
    const firstUsedYear = Number(yearFirstUsed);
    const year =
      Number.isInteger(manufactureYear) && manufactureYear >= MIN_YEAR && manufactureYear <= MAX_YEAR
        ? manufactureYear
        : firstUsedYear;
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) continue;

    const normalizedMake = normalizeName(makeName);
    const normalizedModel = modelNameWithoutMake(makeName, genericModel);
    if (!isUsefulName(normalizedModel)) continue;

    const key = `${year}\u0000${normalizedMake}\u0000${normalizedModel}\u0000${vehicleType.id}`;
    if (!entries.has(key)) {
      entries.set(key, {
        year,
        makeName: normalizedMake,
        modelName: normalizedModel,
        vehicleTypeId: vehicleType.id,
      });
      included++;
    }
  }

  return included;
}

export async function buildSourceCatalog(inputPaths: string[]): Promise<SourceCatalog> {
  const entries = new Map<string, RawEntry>();
  for (const inputPath of inputPaths) {
    const added = await readSourceFile(inputPath, entries);
    console.log(`Read ${path.basename(inputPath)}: ${added.toLocaleString()} unique entries added`);
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
    const idKey = `uk-dft:make:${makeName}`;
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
      const modelKey = `uk-dft:model:${entry.makeName}:${entry.modelName}`;
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
  const vehicleTypes = [...new Map([...BODY_TYPE_MAP.values()].map((type) => [type.id, type])).values()]
    .filter((type) => usedTypeIds.has(type.id))
    .sort((left, right) => left.id - right.id)
    .map((type) => ({
      vehicle_type_id: type.id,
      vehicle_type_name: type.name,
    }));

  return {
    metadata: {
      id: "uk-dft-vehicle-licensing",
      name: "UK DfT/DVLA Vehicle Licensing Statistics",
      url: SOURCE_PAGE,
      license: "Open Government Licence v3.0",
      licenseUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      region: "United Kingdom",
      description:
        "Registered fleet make/model catalog by year of manufacture, including cars, goods vehicles, motorcycles, buses and coaches, and other vehicles.",
      retrievedAt: new Date().toISOString().slice(0, 10),
    },
    vehicleTypes,
    makes,
    modelNames,
    models,
  };
}

function parseArguments(): { inputPaths: string[]; outPath: string } {
  const args = process.argv.slice(2);
  const inputPaths: string[] = [];
  let outPath = DEFAULT_OUT_PATH;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--input") inputPaths.push(path.resolve(args[++index]));
    else if (args[index] === "--out") outPath = path.resolve(args[++index]);
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return { inputPaths, outPath };
}

async function main(): Promise<void> {
  const { inputPaths, outPath } = parseArguments();
  let temporaryDirectory: string | undefined;
  let sources = inputPaths;

  try {
    if (sources.length === 0) {
      temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle-db-uk-dft-"));
      sources = [];
      for (const [index, url] of RAW_URLS.entries()) {
        const destination = path.join(temporaryDirectory, `source-${index + 1}.csv`);
        await download(url, destination);
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
