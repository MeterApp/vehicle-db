/**
 * Refreshes the normalized UK Department for Transport/DVLA source snapshot.
 *
 * The upstream VEH0124 files contain registered vehicles by make, generic
 * model, body type, and year of manufacture (or first use when unavailable).
 * Raw CSVs are downloaded to a temporary directory and are not committed.
 *
 * Body derivatives such as "3 SERIES TOURING" are added only through the
 * reviewed mappings in data/evidence/uk-dft-body-derivatives.json: a mapped
 * body word in the DVLA model description (e.g. "320D SE TOURING") counts
 * towards the derivative for that year of manufacture, and a year is kept once
 * it reaches the mapping's vehicle threshold. Observed years and counts are
 * written to data/evidence/uk-dft-body-derivatives-observed.json.
 *
 * Usage:
 *   npx tsx scripts/import-uk-dft.ts
 *   npx tsx scripts/import-uk-dft.ts --input data.csv [--input data-2.csv]
 *   npx tsx scripts/import-uk-dft.ts --prune   # drop entries the files no longer list
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
  writeSnapshot,
  type SourceCatalog,
} from "./catalog-types";

export { parseCsvLine } from "./catalog-types";

const SOURCE_PAGE =
  "https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files";
const RAW_URLS = [
  "https://assets.publishing.service.gov.uk/media/69ef3c3a20a498c16734afd1/df_VEH0124_AM.csv",
  "https://assets.publishing.service.gov.uk/media/69ef3c8520a498c16734afd2/df_VEH0124_NZ.csv",
];
const DEFAULT_OUT_PATH = path.join(__dirname, "..", "data", "sources", "uk-dft.json");
const DERIVATIVES_PATH = path.join(__dirname, "..", "data", "evidence", "uk-dft-body-derivatives.json");
const OBSERVED_PATH = path.join(__dirname, "..", "data", "evidence", "uk-dft-body-derivatives-observed.json");
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

/** A reviewed body derivative read from the DVLA model description. */
export interface BodyDerivative {
  make: string;
  genericModel: string;
  /** Whole word or phrase in the DVLA model description, e.g. "TOURING". */
  modelToken: string;
  /** Catalog model name, e.g. "3 SERIES TOURING". */
  model: string;
  bodyStyle: string;
  minVehicles: number;
}

export interface DerivativeObservation {
  make: string;
  model: string;
  years: { year: number; vehicles: number; descriptions: number }[];
}

export function loadBodyDerivatives(filePath = DERIVATIVES_PATH): BodyDerivative[] {
  const reviewed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { derivatives: BodyDerivative[] };
  return reviewed.derivatives;
}

/** Largest reported count of a row across the snapshot columns; "[c]" is a suppressed count of at least one. */
function rowVehicles(counts: string[]): number {
  let vehicles = 0;
  for (const value of counts) {
    const count = value === "[c]" ? 1 : Number(value);
    if (Number.isFinite(count) && count > vehicles) vehicles = count;
  }
  return vehicles;
}

function tokenPattern(token: string): RegExp {
  return new RegExp(`(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}(?:\\s|$)`);
}

type DerivativeCounts = Map<BodyDerivative, Map<number, { vehicles: number; descriptions: number }>>;

async function readSourceFile(
  filePath: string,
  entries: Map<string, RawEntry>,
  derivatives: { derivative: BodyDerivative; pattern: RegExp }[] = [],
  derivativeCounts: DerivativeCounts = new Map(),
): Promise<number> {
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

    const [bodyType, makeName, genericModel, modelDescription, yearFirstUsed, yearManufacture] = values;
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

    if (vehicleType.id === 2) {
      const description = normalizeName(modelDescription ?? "");
      for (const { derivative, pattern } of derivatives) {
        if (normalizedMake !== derivative.make || normalizeName(genericModel) !== derivative.genericModel) continue;
        if (!pattern.test(description)) continue;
        const byYear = derivativeCounts.get(derivative) ?? new Map();
        derivativeCounts.set(derivative, byYear);
        const observed = byYear.get(year) ?? { vehicles: 0, descriptions: 0 };
        observed.vehicles += rowVehicles(values.slice(7));
        observed.descriptions += 1;
        byYear.set(year, observed);
      }
    }

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

export async function buildSourceCatalog(
  inputPaths: string[],
  bodyDerivatives: BodyDerivative[] = [],
  observations: DerivativeObservation[] = [],
): Promise<SourceCatalog> {
  const entries = new Map<string, RawEntry>();
  const derivatives = bodyDerivatives.map((derivative) => ({ derivative, pattern: tokenPattern(derivative.modelToken) }));
  const derivativeCounts: DerivativeCounts = new Map();
  for (const inputPath of inputPaths) {
    const added = await readSourceFile(inputPath, entries, derivatives, derivativeCounts);
    console.log(`Read ${path.basename(inputPath)}: ${added.toLocaleString()} unique entries added`);
  }

  for (const derivative of bodyDerivatives) {
    const byYear = derivativeCounts.get(derivative) ?? new Map();
    const years = [...byYear.entries()]
      .filter(([, observed]) => observed.vehicles >= derivative.minVehicles)
      .sort(([left], [right]) => left - right)
      .map(([year, observed]) => ({ year, ...observed }));
    observations.push({ make: derivative.make, model: derivative.model, years });
    for (const { year } of years) {
      const key = `${year}\u0000${derivative.make}\u0000${derivative.model}\u00002`;
      entries.set(key, { year, makeName: derivative.make, modelName: derivative.model, vehicleTypeId: 2 });
    }
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

function parseArguments(): { inputPaths: string[]; outPath: string; prune: boolean } {
  const args = process.argv.slice(2);
  const inputPaths: string[] = [];
  let outPath = DEFAULT_OUT_PATH;
  let prune = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--input") inputPaths.push(path.resolve(args[++index]));
    else if (args[index] === "--out") outPath = path.resolve(args[++index]);
    else if (args[index] === "--prune") prune = true;
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return { inputPaths, outPath, prune };
}

async function main(): Promise<void> {
  const { inputPaths, outPath, prune } = parseArguments();
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

    const observations: DerivativeObservation[] = [];
    const catalog = writeSnapshot(
      outPath,
      await buildSourceCatalog(sources, loadBodyDerivatives(), observations),
      prune,
    );
    fs.writeFileSync(OBSERVED_PATH, `${JSON.stringify({ source: SOURCE_PAGE, files: RAW_URLS, derivatives: observations }, null, 2)}\n`);

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
