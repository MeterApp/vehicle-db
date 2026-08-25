/**
 * Refreshes the normalized Asia-Pacific snapshot from New Zealand's Motor
 * Vehicle Register. The official ArcGIS service is queried for distinct
 * make/model/vehicle-year/type combinations, restricted to Asian countries
 * of origin and the vehicle categories supported by this package.
 *
 * Usage:
 *   npx tsx scripts/import-nzta-asia-pacific.ts
 *   npx tsx scripts/import-nzta-asia-pacific.ts --start-year 2000 --end-year 2026
 *   npx tsx scripts/import-nzta-asia-pacific.ts --input records.json
 */
import fs from "fs";
import path from "path";
import {
  assertNoIdCollision,
  compareStrings,
  normalizeName,
  stableSourceId,
  type SourceCatalog,
} from "./catalog-types";

const SOURCE_PAGE =
  "https://www.nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets";
const ARCGIS_ITEM_URL =
  "https://www.arcgis.com/sharing/rest/content/items/7b4df667d5014f1a93e6050b31d18407?f=json";
const DEFAULT_OUT_PATH = path.join(
  __dirname,
  "..",
  "data",
  "sources",
  "nzta-asia-pacific.json",
);
const DEFAULT_START_YEAR = 1990;
const PAGE_SIZE = 2_000;

const ASIAN_COUNTRIES = [
  "CHINA",
  "HONG KONG",
  "INDIA",
  "INDONESIA",
  "JAPAN",
  "MALAYSIA",
  "PHILIPPINES",
  "SINGAPORE",
  "SOUTH KOREA",
  "TAIWAN",
  "THAILAND",
  "VIETNAM",
] as const;

const VEHICLE_TYPE_MAP = new Map<string, { id: number; name: string }>([
  ["MOPED", { id: 1, name: "Motorcycle" }],
  ["MOTORCYCLE", { id: 1, name: "Motorcycle" }],
  ["PASSENGER CAR/VAN", { id: 2, name: "Passenger Car" }],
  ["GOODS VAN/TRUCK/UTILITY", { id: 3, name: "Truck" }],
  ["BUS", { id: 5, name: "Bus" }],
]);

export interface NztaRecord {
  MAKE: string;
  MODEL: string;
  VEHICLE_YEAR: number;
  VEHICLE_TYPE: string;
}

interface ArcGisItem {
  url?: string;
  error?: { message?: string };
}

interface ArcGisQueryResponse {
  features?: { attributes: NztaRecord }[];
  exceededTransferLimit?: boolean;
  error?: { message?: string; details?: string[] };
}

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
    !["N/A", "NA", "NOT KNOWN", "OTHER", "UNKNOWN", "UNSPECIFIED"].includes(normalized)
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "MeterApp-vehicle-db-source-refresh" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

async function fetchServiceUrl(): Promise<string> {
  const item = await fetchJson<ArcGisItem>(ARCGIS_ITEM_URL);
  if (!item.url || item.error) {
    throw new Error(item.error?.message ?? "NZTA ArcGIS item has no service URL");
  }
  return `${item.url.replace(/\/$/, "")}/0/query`;
}

async function fetchCountryRecords(
  queryUrl: string,
  country: string,
  startYear: number,
  endYear: number,
): Promise<NztaRecord[]> {
  const supportedTypes = [...VEHICLE_TYPE_MAP.keys()]
    .map((value) => `'${value}'`)
    .join(",");
  const where = [
    `VEHICLE_YEAR >= ${startYear}`,
    `VEHICLE_YEAR <= ${endYear}`,
    `ORIGINAL_COUNTRY = '${country}'`,
    `VEHICLE_TYPE IN (${supportedTypes})`,
    "MAKE IS NOT NULL",
    "MODEL IS NOT NULL",
  ].join(" AND ");
  const records: NztaRecord[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const parameters = new URLSearchParams({
      where,
      outFields: "MAKE,MODEL,VEHICLE_YEAR,VEHICLE_TYPE",
      returnGeometry: "false",
      returnDistinctValues: "true",
      orderByFields: "MAKE,MODEL,VEHICLE_YEAR,VEHICLE_TYPE",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      cacheHint: "true",
      f: "json",
    });
    const response = await fetchJson<ArcGisQueryResponse>(`${queryUrl}?${parameters}`);
    if (response.error) {
      throw new Error(
        [response.error.message, ...(response.error.details ?? [])].filter(Boolean).join(": "),
      );
    }

    const page = response.features?.map((feature) => feature.attributes) ?? [];
    records.push(...page);
    if (!response.exceededTransferLimit || page.length === 0) break;
  }

  console.log(`${country}: ${records.length.toLocaleString()} distinct model-year entries`);
  return records;
}

export function buildSourceCatalog(
  records: NztaRecord[],
  retrievedAt = new Date().toISOString().slice(0, 10),
): SourceCatalog {
  const entries = new Map<string, RawEntry>();

  for (const record of records) {
    const vehicleType = VEHICLE_TYPE_MAP.get(record.VEHICLE_TYPE);
    const year = Number(record.VEHICLE_YEAR);
    if (!vehicleType || !Number.isInteger(year)) continue;
    if (!isUsefulName(record.MAKE) || !isUsefulName(record.MODEL)) continue;

    const makeName = normalizeName(record.MAKE);
    const modelName = normalizeName(record.MODEL);
    const key = `${year}\u0000${makeName}\u0000${modelName}\u0000${vehicleType.id}`;
    entries.set(key, { year, makeName, modelName, vehicleTypeId: vehicleType.id });
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
    const idKey = `nzta-asia-pacific:make:${makeName}`;
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
      const modelKey = `nzta-asia-pacific:model:${entry.makeName}:${entry.modelName}`;
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
      id: "nzta-asia-pacific-mvr",
      name: "NZTA Motor Vehicle Register — Asian-origin vehicles",
      url: SOURCE_PAGE,
      license: "Creative Commons Attribution 4.0 International",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      region: "Asia-Pacific (registered in New Zealand)",
      description:
        "Asian-origin cars, trucks, buses, motorcycles, and mopeds in New Zealand's registered fleet, keyed by vehicle year.",
      retrievedAt,
    },
    vehicleTypes,
    makes,
    modelNames,
    models,
  };
}

function parseArguments(): {
  inputPath?: string;
  outPath: string;
  startYear: number;
  endYear: number;
} {
  const args = process.argv.slice(2);
  let inputPath: string | undefined;
  let outPath = DEFAULT_OUT_PATH;
  let startYear = DEFAULT_START_YEAR;
  let endYear = new Date().getUTCFullYear();

  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--input") inputPath = path.resolve(args[++index]);
    else if (args[index] === "--out") outPath = path.resolve(args[++index]);
    else if (args[index] === "--start-year") startYear = Number(args[++index]);
    else if (args[index] === "--end-year") endYear = Number(args[++index]);
    else throw new Error(`Unknown argument: ${args[index]}`);
  }

  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) {
    throw new Error(`Invalid year range: ${startYear}–${endYear}`);
  }
  return { inputPath, outPath, startYear, endYear };
}

async function main(): Promise<void> {
  const { inputPath, outPath, startYear, endYear } = parseArguments();
  let records: NztaRecord[];

  if (inputPath) {
    records = JSON.parse(fs.readFileSync(inputPath, "utf8")) as NztaRecord[];
  } else {
    const queryUrl = await fetchServiceUrl();
    const groups = await Promise.all(
      ASIAN_COUNTRIES.map((country) =>
        fetchCountryRecords(queryUrl, country, startYear, endYear),
      ),
    );
    records = groups.flat();
  }

  const catalog = buildSourceCatalog(records);
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
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
