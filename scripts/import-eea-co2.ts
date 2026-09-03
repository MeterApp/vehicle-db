/**
 * Refreshes the normalized European Environment Agency (EEA) source snapshot
 * from the CO2 emission monitoring registers for new passenger cars (M1) and
 * vans (N1) under Regulation (EU) 2019/631.
 *
 * Every new car and van registered in the EU, Iceland, and Norway (and the
 * UK until 2020) is reported to the EEA with its make and commercial name.
 * The public DiscoData SQL endpoint is queried for make/commercial name/
 * category combinations grouped by reporting country and registration year,
 * so only aggregated rows are downloaded rather than the tens of millions of
 * individual records.
 *
 * Reporting quality differs by country: some report trim and engine strings
 * as the commercial name. A make/model/year is therefore kept only when at
 * least two countries report it (or one country reports it very often), and
 * the most frequently reported spelling of each model name wins.
 *
 * Usage:
 *   npx tsx scripts/import-eea-co2.ts
 *   npx tsx scripts/import-eea-co2.ts --start-year 2010 --end-year 2026
 *   npx tsx scripts/import-eea-co2.ts --min-count 5 --min-countries 2
 *   npx tsx scripts/import-eea-co2.ts --raw-out rows.json   # keep aggregated rows
 *   npx tsx scripts/import-eea-co2.ts --input rows.json      # rebuild offline
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
import {
  normalizeMakeName,
  normalizeModelName,
  spellingKey,
  splitSubBrand,
} from "./european-names";

const SOURCE_PAGE =
  "https://www.eea.europa.eu/en/datahub/datahubitem-view/fa8b1229-3db6-495d-b18e-9c9b3267c02b";
const DISCODATA_SQL_URL = "https://discodata.eea.europa.eu/sql";
const DISCODATA_METADATA_URL = "https://discodata.eea.europa.eu/md/";
const DATABASE = "CO2Emission";
const SCHEMA = "latest";
const DEFAULT_OUT_PATH = path.join(__dirname, "..", "data", "sources", "eea-co2.json");
const DEFAULT_START_YEAR = 2010;
const DEFAULT_MIN_COUNT = 5;
const DEFAULT_MIN_COUNTRIES = 2;
/** A single country reporting a model this often is trusted without a second country. */
const SINGLE_COUNTRY_TRUST_COUNT = 1_000;
const PAGE_SIZE = 100_000;

const VEHICLE_TYPES = {
  passengerCar: { id: 2, name: "Passenger Car" },
  truck: { id: 3, name: "Truck" },
} as const;

/** EU vehicle category (Ct/Cr) to catalog vehicle type. */
const CATEGORY_TYPE_MAP = new Map<string, { id: number; name: string }>([
  ["M1", VEHICLE_TYPES.passengerCar],
  ["M1G", VEHICLE_TYPES.passengerCar],
  ["N1", VEHICLE_TYPES.truck],
  ["N1G", VEHICLE_TYPES.truck],
  ["N2", VEHICLE_TYPES.truck],
  ["N2G", VEHICLE_TYPES.truck],
  ["N3", VEHICLE_TYPES.truck],
]);

/** Registers whose tables carry distinct make/commercial-name rows. */
const REGISTERS = [
  { table: "co2cars", defaultCategory: "M1" },
  { table: "co2vans", defaultCategory: "N1" },
] as const;

export interface EeaRow {
  Year: number;
  /** Reporting country (ISO 3166-1 alpha-2). */
  MS: string | null;
  Mk: string | null;
  Cn: string | null;
  Ct: string | null;
  Cr: string | null;
  n: number;
  /** Register table the row came from: co2cars (default) or co2vans. */
  register?: string;
}

interface RawEntry {
  year: number;
  makeName: string;
  modelName: string;
  vehicleTypeId: number;
  count: number;
  countries: Set<string>;
}

function resolveVehicleType(
  category: string | null,
  fallbackCategory: string | null,
  defaultCategory: string,
): { id: number; name: string } | undefined {
  const value = normalizeName(category ?? "") || normalizeName(fallbackCategory ?? "") || defaultCategory;
  return CATEGORY_TYPE_MAP.get(value);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": "MeterApp-vehicle-db-source-refresh" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while requesting ${url}`);
  }
  return (await response.json()) as T;
}

async function query<T>(sql: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const url = new URL(DISCODATA_SQL_URL);
    url.searchParams.set("query", sql);
    url.searchParams.set("p", String(page));
    url.searchParams.set("nrOfHits", String(PAGE_SIZE));
    url.searchParams.set("mail", "null");
    url.searchParams.set("schema", "null");
    const body = await fetchJson<{ results?: T[]; errors?: { error: string }[] }>(url.toString());
    if (body.errors?.length) {
      throw new Error(`DiscoData error: ${body.errors.map((error) => error.error).join("; ")}`);
    }
    const results = body.results ?? [];
    rows.push(...results);
    if (results.length < PAGE_SIZE) return rows;
  }
}

interface DiscoDataMetadata {
  name?: string;
  Name?: string;
  Schemas?: { name?: string; Name?: string; Tables?: { Columns?: { table: string }[] }[] }[];
}

/**
 * Lists the per-year register tables such as co2cars_2024Fv30 (final) and
 * co2cars_2025Pv31 (provisional) published in the latest schema. Final
 * releases are preferred over provisional ones for the same year.
 */
export function selectYearTables(
  tableNames: string[],
  register: string,
): Map<number, string> {
  const pattern = new RegExp(`^${register}_(\\d{4})([FP])v(\\d+)$`, "i");
  const selected = new Map<number, { table: string; final: boolean; version: number }>();
  for (const tableName of tableNames) {
    const match = pattern.exec(tableName);
    if (!match) continue;
    const year = Number(match[1]);
    const candidate = { table: tableName, final: match[2].toUpperCase() === "F", version: Number(match[3]) };
    const existing = selected.get(year);
    if (
      !existing ||
      (candidate.final && !existing.final) ||
      (candidate.final === existing.final && candidate.version > existing.version)
    ) {
      selected.set(year, candidate);
    }
  }
  return new Map([...selected].map(([year, value]) => [year, value.table]));
}

async function listLatestTables(): Promise<string[]> {
  console.log(`Discovering ${DATABASE} tables from ${DISCODATA_METADATA_URL}`);
  const databases = await fetchJson<DiscoDataMetadata[]>(DISCODATA_METADATA_URL);
  const database = databases.find((entry) => (entry.name ?? entry.Name) === DATABASE);
  const schema = database?.Schemas?.find((entry) => (entry.name ?? entry.Name) === SCHEMA);
  if (!schema) throw new Error(`Schema ${DATABASE}.${SCHEMA} not found in DiscoData metadata`);
  const names = new Set<string>();
  for (const table of schema.Tables ?? []) {
    const name = table.Columns?.[0]?.table;
    if (name) names.add(name);
  }
  return [...names];
}

export async function fetchRows(startYear: number, endYear: number): Promise<EeaRow[]> {
  const tableNames = await listLatestTables();
  const rows: EeaRow[] = [];

  for (const register of REGISTERS) {
    const yearTables = selectYearTables(tableNames, register.table);
    const combinedYears = await query<{ Year: number }>(
      `SELECT DISTINCT Year FROM [${DATABASE}].[${SCHEMA}].[${register.table}]`,
    );
    const availableYears = new Set([
      ...combinedYears.map((row) => row.Year),
      ...yearTables.keys(),
    ]);

    for (let year = startYear; year <= endYear; year++) {
      if (!availableYears.has(year)) continue;
      const table = yearTables.get(year) ?? register.table;
      const sql =
        `SELECT Year, MS, Mk, Cn, Ct, Cr, COUNT(*) AS n FROM [${DATABASE}].[${SCHEMA}].[${table}]` +
        ` WHERE Year = ${year} GROUP BY Year, MS, Mk, Cn, Ct, Cr`;
      const yearRows = await query<EeaRow>(sql);
      console.log(`${table} ${year}: ${yearRows.length.toLocaleString()} grouped rows`);
      rows.push(...yearRows.map((row) => ({ ...row, register: register.table })));
    }
  }
  return rows;
}

function entryKey(entry: RawEntry): string {
  return [entry.year, entry.makeName, entry.modelName, entry.vehicleTypeId].join("\u0000");
}

function mergeEntries(entries: Map<string, RawEntry>, entry: RawEntry): void {
  const key = entryKey(entry);
  const existing = entries.get(key);
  if (existing) {
    existing.count += entry.count;
    for (const country of entry.countries) existing.countries.add(country);
  } else {
    entries.set(key, entry);
  }
}

export function buildSourceCatalog(
  rows: EeaRow[],
  options: { minCount?: number; minCountries?: number; retrievedAt?: string } = {},
): SourceCatalog {
  const minCount = options.minCount ?? DEFAULT_MIN_COUNT;
  const minCountries = options.minCountries ?? DEFAULT_MIN_COUNTRIES;
  const retrievedAt = options.retrievedAt ?? new Date().toISOString().slice(0, 10);
  const normalized = new Map<string, RawEntry>();

  for (const row of rows) {
    const year = Number(row.Year);
    if (!Number.isInteger(year)) continue;
    const register = REGISTERS.find((candidate) => candidate.table === row.register) ?? REGISTERS[0];
    const vehicleType = resolveVehicleType(row.Ct, row.Cr, register.defaultCategory);
    const reportedMake = normalizeMakeName(row.Mk);
    if (!vehicleType || !reportedMake) continue;
    const reportedModel = normalizeModelName(row.Cn, reportedMake);
    if (!reportedModel) continue;
    const [makeName, modelName] = splitSubBrand(reportedMake, reportedModel);

    mergeEntries(normalized, {
      year,
      makeName,
      modelName,
      vehicleTypeId: vehicleType.id,
      count: Number(row.n) || 0,
      countries: new Set(row.MS ? [normalizeName(row.MS)] : []),
    });
  }

  // Choose the most reported spelling of each model name across all years.
  const spellingCounts = new Map<string, Map<string, number>>();
  for (const entry of normalized.values()) {
    const key = `${entry.makeName}\u0000${spellingKey(entry.modelName)}`;
    const counts = spellingCounts.get(key) ?? new Map<string, number>();
    counts.set(entry.modelName, (counts.get(entry.modelName) ?? 0) + entry.count);
    spellingCounts.set(key, counts);
  }
  const canonicalSpelling = new Map<string, string>();
  for (const [key, counts] of spellingCounts) {
    const [spelling] = [...counts].sort(
      (left, right) => right[1] - left[1] || compareStrings(left[0], right[0]),
    )[0]!;
    canonicalSpelling.set(key, spelling);
  }

  const entries = new Map<string, RawEntry>();
  for (const entry of normalized.values()) {
    const key = `${entry.makeName}\u0000${spellingKey(entry.modelName)}`;
    mergeEntries(entries, { ...entry, modelName: canonicalSpelling.get(key) ?? entry.modelName });
  }

  const kept = [...entries.values()].filter(
    (entry) =>
      entry.count >= minCount &&
      (entry.countries.size >= minCountries || entry.count >= SINGLE_COUNTRY_TRUST_COUNT),
  );
  const makeNames = [...new Set(kept.map((entry) => entry.makeName))].sort(compareStrings);
  const modelNames = [...new Set(kept.map((entry) => entry.modelName))].sort(compareStrings);
  const modelNameIndexes = new Map(modelNames.map((name, index) => [name, index]));
  const makeIds = new Map<string, number>();
  const usedMakeIds = new Map<number, string>();
  const usedModelIds = new Map<number, string>();

  const makes = makeNames.map((makeName) => {
    const idKey = `eea-co2:make:${makeName}`;
    const makeId = stableSourceId(idKey);
    assertNoIdCollision(usedMakeIds, makeId, idKey, "Make");
    makeIds.set(makeName, makeId);
    return { make_id: makeId, make_name: makeName };
  });

  const models: SourceCatalog["models"] = kept
    .sort(
      (left, right) =>
        left.year - right.year ||
        compareStrings(left.makeName, right.makeName) ||
        compareStrings(left.modelName, right.modelName) ||
        left.vehicleTypeId - right.vehicleTypeId,
    )
    .map((entry) => {
      const modelKey = `eea-co2:model:${entry.makeName}:${entry.modelName}`;
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
  const vehicleTypes = Object.values(VEHICLE_TYPES)
    .filter((type) => usedTypeIds.has(type.id))
    .sort((left, right) => left.id - right.id)
    .map((type) => ({ vehicle_type_id: type.id, vehicle_type_name: type.name }));

  return {
    metadata: {
      id: "eea-co2-monitoring",
      name: "EEA CO2 Monitoring of New Passenger Cars and Vans",
      url: SOURCE_PAGE,
      license: "Creative Commons Attribution 4.0 International",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      region: "European Union, Iceland, and Norway",
      description:
        "Makes and commercial names of new passenger cars (M1) and vans (N1) registered in EU member states, Iceland, and Norway and reported to the European Environment Agency under Regulation (EU) 2019/631, keyed by registration year.",
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
  rawOutPath?: string;
  outPath: string;
  startYear: number;
  endYear: number;
  minCount: number;
  minCountries: number;
} {
  const args = process.argv.slice(2);
  let inputPath: string | undefined;
  let rawOutPath: string | undefined;
  let outPath = DEFAULT_OUT_PATH;
  let startYear = DEFAULT_START_YEAR;
  let endYear = new Date().getUTCFullYear();
  let minCount = DEFAULT_MIN_COUNT;
  let minCountries = DEFAULT_MIN_COUNTRIES;

  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--input") inputPath = path.resolve(args[++index]);
    else if (args[index] === "--raw-out") rawOutPath = path.resolve(args[++index]);
    else if (args[index] === "--out") outPath = path.resolve(args[++index]);
    else if (args[index] === "--start-year") startYear = Number(args[++index]);
    else if (args[index] === "--end-year") endYear = Number(args[++index]);
    else if (args[index] === "--min-count") minCount = Number(args[++index]);
    else if (args[index] === "--min-countries") minCountries = Number(args[++index]);
    else throw new Error(`Unknown argument: ${args[index]}`);
  }

  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) {
    throw new Error(`Invalid year range: ${startYear}–${endYear}`);
  }
  if (!Number.isInteger(minCount) || minCount < 1) {
    throw new Error(`Invalid minimum count: ${minCount}`);
  }
  if (!Number.isInteger(minCountries) || minCountries < 1) {
    throw new Error(`Invalid minimum countries: ${minCountries}`);
  }
  return { inputPath, rawOutPath, outPath, startYear, endYear, minCount, minCountries };
}

async function main(): Promise<void> {
  const { inputPath, rawOutPath, outPath, startYear, endYear, minCount, minCountries } =
    parseArguments();
  const rows = inputPath
    ? (JSON.parse(fs.readFileSync(inputPath, "utf8")) as EeaRow[])
    : await fetchRows(startYear, endYear);
  if (rawOutPath) {
    fs.mkdirSync(path.dirname(rawOutPath), { recursive: true });
    fs.writeFileSync(rawOutPath, JSON.stringify(rows));
  }

  const catalog = buildSourceCatalog(rows, { minCount, minCountries });
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
