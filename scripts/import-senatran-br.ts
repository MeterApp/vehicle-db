/**
 * Refreshes the normalized Brazil SENATRAN snapshot from the national vehicle
 * register (RENAVAM) fleet files on dados.transportes.gov.br.
 *
 * Every month SENATRAN publishes the registered fleet as one file counting
 * vehicles by state, municipality, make/model and year of manufacture. The
 * importer downloads the latest month, adds the counts up nationally, maps the
 * make/model strings to model families with the reviewed table in
 * scripts/senatran-br-models.ts, and keeps each make/model/year with at least
 * --min-count vehicles. The archive is about 140 MB and the government server
 * drops long downloads, so the download resumes where it stopped.
 *
 * Usage:
 *   npx tsx scripts/import-senatran-br.ts
 *   npx tsx scripts/import-senatran-br.ts --input frota.zip    # or the extracted .TXT
 *   npx tsx scripts/import-senatran-br.ts --url <resource .zip URL>
 *   npx tsx scripts/import-senatran-br.ts --start-year 1990 --end-year 2026 --min-count 10
 *   npx tsx scripts/import-senatran-br.ts --prune              # drop entries the register no longer lists
 */
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import zlib from "zlib";
import {
  assertNoIdCollision,
  compareStrings,
  normalizeName,
  stableSourceId,
  writeSnapshot,
  type SourceCatalog,
} from "./catalog-types";
import { RENAVAM_MAKES, RENAVAM_MODELS } from "./senatran-br-models";

const SOURCE_PAGE =
  "https://dados.transportes.gov.br/dataset/registro-nacional-de-veiculos-automotores-renavam";
const DATASET_API =
  "https://dados.transportes.gov.br/api/3/action/package_show?id=registro-nacional-de-veiculos-automotores-renavam";
const DEFAULT_OUT_PATH = path.join(__dirname, "..", "data", "sources", "senatran-br.json");
const DEFAULT_START_YEAR = 1990;
const DEFAULT_MIN_COUNT = 10;
const DOWNLOAD_ATTEMPTS = 20;
const HEADERS = { "User-Agent": "MeterApp-vehicle-db-source-refresh" };

const VEHICLE_TYPE_NAMES = new Map<number, string>([
  [1, "Motorcycle"],
  [2, "Passenger Car"],
  [3, "Truck"],
  [5, "Bus"],
  [7, "Multipurpose Passenger Vehicle (MPV)"],
]);
/** Make names that follow the import prefix ("I/LAND ROVER ...") as two words. */
const TWO_WORD_MAKES = ["LAND ROVER", "ROYAL ENFIELD"];
/** Trailers, semi-trailers, and road or farm machinery, left out of the unmapped report. */
const EQUIPMENT_CODES = new Set(["R", "SR", "REB", "SE", "SC", "M.A.", "MR", "MO", "MON"]);
const MONTHS = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

interface Family {
  prefix: string;
  model: string;
  vehicleTypeId: number;
}

const familiesByMake = new Map<string, Family[]>();
for (const [make, model, vehicleTypeId, prefixes = [model]] of RENAVAM_MODELS) {
  const families = familiesByMake.get(make) ?? [];
  for (const prefix of prefixes) families.push({ prefix, model, vehicleTypeId });
  familiesByMake.set(make, families);
}
for (const families of familiesByMake.values()) {
  families.sort((left, right) => right.prefix.length - left.prefix.length);
}

function prefixMatches(text: string, prefix: string): boolean {
  if (prefix.endsWith("*")) return text.startsWith(prefix.slice(0, -1));
  if (!text.startsWith(prefix)) return false;
  return !/\p{L}/u.test(text.charAt(prefix.length));
}

/**
 * Splits a RENAVAM make/model ("CHEV/ONIX 10MT LT2", "I/TOYOTA HILUX SRV",
 * "JTA/SUZUKI EN125 YES") into the make code and the model text.
 */
export function splitMakeModel(value: string): { code: string; text: string } | undefined {
  const slash = value.indexOf("/");
  if (slash < 0) return undefined;
  let code = normalizeName(value.slice(0, slash));
  let text = normalizeName(value.slice(slash + 1));
  // Imported vehicles: "I/" or "IMP/" followed by the make.
  if (code === "I" || code === "IMP") {
    const make = TWO_WORD_MAKES.find((name) => text.startsWith(`${name} `));
    const end = make ? make.length : text.indexOf(" ");
    code = end < 0 ? text : text.slice(0, end);
    text = end < 0 ? "" : text.slice(end + 1).trim();
  }
  // J. Toledo da Amazônia builds Suzuki motorcycles: "JTA/SUZUKI EN125 YES".
  if (code === "JTA" && text.startsWith("SUZUKI")) {
    code = "SUZUKI";
    text = text.slice("SUZUKI".length).trim();
  }
  return { code, text: text.replace(/^(NOVO|NOVA|NEW) /, "") };
}

/** Maps a RENAVAM make/model to a catalog make, model family and vehicle type. */
export function mapRegistration(
  value: string,
): { makeName: string; modelName: string; vehicleTypeId: number } | undefined {
  const parsed = splitMakeModel(value);
  const makeName = parsed && RENAVAM_MAKES[parsed.code];
  if (!parsed || !makeName) return undefined;
  const family = familiesByMake
    .get(makeName)
    ?.find((candidate) => prefixMatches(parsed.text, candidate.prefix));
  return family && { makeName, modelName: family.model, vehicleTypeId: family.vehicleTypeId };
}

/** Streams the text file inside a single-file ZIP archive (deflated, not ZIP64). */
function openZipEntry(zipPath: string): Readable {
  const fd = fs.openSync(zipPath, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const tail = Buffer.alloc(Math.min(size, 65_557));
    fs.readSync(fd, tail, 0, tail.length, size - tail.length);
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) throw new Error(`${zipPath} is not a complete ZIP archive`);
    const entry = Buffer.alloc(46);
    fs.readSync(fd, entry, 0, entry.length, tail.readUInt32LE(end + 16));
    if (entry.readUInt32LE(0) !== 0x02014b50) throw new Error(`${zipPath} has no central directory`);
    const method = entry.readUInt16LE(10);
    const compressedSize = entry.readUInt32LE(20);
    const localOffset = entry.readUInt32LE(42);
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error(`${zipPath} is a ZIP64 archive; extract it and pass the text file to --input`);
    }
    const local = Buffer.alloc(30);
    fs.readSync(fd, local, 0, local.length, localOffset);
    const start = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    const raw = fs.createReadStream(zipPath, { start, end: start + compressedSize - 1 });
    if (method === 0) return raw;
    if (method !== 8) throw new Error(`${zipPath} uses unsupported compression method ${method}`);
    const inflate = zlib.createInflateRaw();
    pipeline(raw, inflate).catch((error: Error) => inflate.destroy(error));
    return inflate;
  } finally {
    fs.closeSync(fd);
  }
}

function headerKey(value: string): string {
  return normalizeName(value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^﻿/, ""));
}

export async function buildSourceCatalog(
  inputPath: string,
  options: { startYear?: number; endYear?: number; minCount?: number; retrievedAt?: string } = {},
): Promise<SourceCatalog> {
  const startYear = options.startYear ?? DEFAULT_START_YEAR;
  const endYear = options.endYear ?? new Date().getUTCFullYear();
  const minCount = options.minCount ?? DEFAULT_MIN_COUNT;
  const retrievedAt = options.retrievedAt ?? new Date().toISOString().slice(0, 10);

  const input = readline.createInterface({
    input: /\.zip$/i.test(inputPath) ? openZipEntry(inputPath) : fs.createReadStream(inputPath),
    crlfDelay: Infinity,
  });
  const mappings = new Map<string, ReturnType<typeof mapRegistration>>();
  const counts = new Map<string, number>();
  const unmapped = new Map<string, number>();
  let columns: { makeModel: number; year: number; count: number } | undefined;
  let mappedVehicles = 0;
  let totalVehicles = 0;

  for await (const line of input) {
    const values = line.split(";");
    if (!columns) {
      const header = values.map(headerKey);
      columns = {
        makeModel: header.findIndex((name) => name.startsWith("MARCA")),
        year: header.findIndex((name) => name.startsWith("ANO")),
        count: header.findIndex((name) => name.startsWith("QTD")),
      };
      if (Object.values(columns).some((index) => index < 0)) {
        throw new Error(`${inputPath} has an unexpected header: ${line}`);
      }
      continue;
    }

    const year = Number(values[columns.year]);
    const count = Number(values[columns.count]);
    if (!Number.isInteger(year) || year < startYear || year > endYear || !(count > 0)) continue;
    const makeModel = values[columns.makeModel] ?? "";
    let mapping = mappings.get(makeModel);
    if (!mappings.has(makeModel)) {
      mapping = mapRegistration(makeModel);
      mappings.set(makeModel, mapping);
    }

    totalVehicles += count;
    if (mapping) {
      mappedVehicles += count;
      const key = [mapping.makeName, mapping.modelName, mapping.vehicleTypeId, year].join("\u0000");
      counts.set(key, (counts.get(key) ?? 0) + count);
    } else {
      const parsed = splitMakeModel(makeModel);
      if (parsed && EQUIPMENT_CODES.has(parsed.code)) continue;
      const family = parsed ? `${parsed.code}/${parsed.text.split(" ")[0]}` : makeModel;
      unmapped.set(family, (unmapped.get(family) ?? 0) + count);
    }
  }
  if (!columns) throw new Error(`${inputPath} is empty`);

  const share = totalVehicles ? ((100 * mappedVehicles) / totalVehicles).toFixed(1) : "0";
  console.log(
    `Mapped ${share}% of ${Math.round(totalVehicles).toLocaleString()} vehicles manufactured ${startYear}–${endYear}`,
  );
  const largestUnmapped = [...unmapped].sort((left, right) => right[1] - left[1]).slice(0, 15);
  if (largestUnmapped.length > 0) {
    console.log("Largest unmapped families (extend scripts/senatran-br-models.ts to add one):");
    for (const [family, vehicles] of largestUnmapped) {
      console.log(`  ${family}: ${Math.round(vehicles).toLocaleString()}`);
    }
  }

  const entries = [...counts]
    .filter(([, count]) => count >= minCount)
    .map(([key]) => {
      const [makeName, modelName, vehicleTypeId, year] = key.split("\u0000");
      return { makeName, modelName, vehicleTypeId: Number(vehicleTypeId), year: Number(year) };
    })
    .sort(
      (left, right) =>
        left.year - right.year ||
        compareStrings(left.makeName, right.makeName) ||
        compareStrings(left.modelName, right.modelName) ||
        left.vehicleTypeId - right.vehicleTypeId,
    );

  const makeNames = [...new Set(entries.map((entry) => entry.makeName))].sort(compareStrings);
  const modelNames = [...new Set(entries.map((entry) => entry.modelName))].sort(compareStrings);
  const modelNameIndexes = new Map(modelNames.map((name, index) => [name, index]));
  const makeIds = new Map<string, number>();
  const usedMakeIds = new Map<number, string>();
  const usedModelIds = new Map<number, string>();

  const makes = makeNames.map((makeName) => {
    const idKey = `senatran-br:make:${makeName}`;
    const makeId = stableSourceId(idKey);
    assertNoIdCollision(usedMakeIds, makeId, idKey, "Make");
    makeIds.set(makeName, makeId);
    return { make_id: makeId, make_name: makeName };
  });

  const models: SourceCatalog["models"] = entries.map((entry) => {
    const modelKey = `senatran-br:model:${entry.makeName}:${entry.modelName}`;
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
  return {
    metadata: {
      id: "senatran-br-renavam",
      name: "Brazil SENATRAN National Vehicle Register (RENAVAM)",
      url: SOURCE_PAGE,
      license: "Public Domain",
      licenseUrl: SOURCE_PAGE,
      region: "Brazil",
      description:
        "Cars, pickups, vans, SUVs, minibuses, and motorcycles in Brazil's registered fleet, keyed by year of manufacture. RENAVAM make/model strings are mapped to model families with a reviewed table; heavy trucks, bus bodies, and trailers are not included.",
      retrievedAt,
    },
    vehicleTypes: [...VEHICLE_TYPE_NAMES]
      .filter(([id]) => usedTypeIds.has(id))
      .map(([vehicle_type_id, vehicle_type_name]) => ({ vehicle_type_id, vehicle_type_name })),
    makes,
    modelNames,
    models,
  };
}

/** The newest monthly fleet archive listed in the dataset. */
async function latestArchiveUrl(): Promise<string> {
  const response = await fetch(DATASET_API, { headers: HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status} while requesting ${DATASET_API}`);
  const body = (await response.json()) as { result: { resources: { url: string }[] } };
  const month = (url: string): number => {
    const match = url
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .match(/_([a-z]+)_(\d{4})\.zip$/);
    const index = match ? MONTHS.indexOf(match[1]) : -1;
    return index < 0 ? -1 : Number(match![2]) * 12 + index;
  };
  const archives = body.result.resources
    .map((resource) => resource.url)
    .filter((url) => month(url) >= 0)
    .sort((left, right) => month(left) - month(right));
  if (archives.length === 0) throw new Error(`No monthly fleet archive found at ${DATASET_API}`);
  return archives[archives.length - 1];
}

/** Downloads a file, resuming with a range request each time the connection drops. */
async function download(url: string, destination: string): Promise<void> {
  console.log(`Downloading ${url}`);
  for (let attempt = 1; ; attempt++) {
    const offset = fs.existsSync(destination) ? fs.statSync(destination).size : 0;
    try {
      const response = await fetch(url, {
        headers: offset > 0 ? { ...HEADERS, Range: `bytes=${offset}-` } : HEADERS,
      });
      if (offset > 0 && response.status === 416) return;
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const flags = offset > 0 && response.status === 206 ? "a" : "w";
      await pipeline(Readable.fromWeb(response.body as never), fs.createWriteStream(destination, { flags }));
      return;
    } catch (error) {
      if (attempt >= DOWNLOAD_ATTEMPTS) throw error;
      const received = fs.existsSync(destination) ? fs.statSync(destination).size : 0;
      console.log(`  interrupted at ${(received / 1024 / 1024).toFixed(1)} MB (${(error as Error).message}); resuming`);
    }
  }
}

function parseArguments(): {
  inputPath?: string;
  url?: string;
  outPath: string;
  startYear: number;
  endYear: number;
  minCount: number;
  prune: boolean;
} {
  const args = process.argv.slice(2);
  let inputPath: string | undefined;
  let url: string | undefined;
  let outPath = DEFAULT_OUT_PATH;
  let startYear = DEFAULT_START_YEAR;
  let endYear = new Date().getUTCFullYear();
  let minCount = DEFAULT_MIN_COUNT;
  let prune = false;

  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--input") inputPath = path.resolve(args[++index]);
    else if (args[index] === "--url") url = args[++index];
    else if (args[index] === "--out") outPath = path.resolve(args[++index]);
    else if (args[index] === "--start-year") startYear = Number(args[++index]);
    else if (args[index] === "--end-year") endYear = Number(args[++index]);
    else if (args[index] === "--min-count") minCount = Number(args[++index]);
    else if (args[index] === "--prune") prune = true;
    else throw new Error(`Unknown argument: ${args[index]}`);
  }

  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) {
    throw new Error(`Invalid year range: ${startYear}–${endYear}`);
  }
  if (!Number.isInteger(minCount) || minCount < 1) {
    throw new Error(`Invalid minimum count: ${minCount}`);
  }
  return { inputPath, url, outPath, startYear, endYear, minCount, prune };
}

async function main(): Promise<void> {
  const { inputPath, url, outPath, startYear, endYear, minCount, prune } = parseArguments();
  let temporaryDirectory: string | undefined;
  let source = inputPath;

  try {
    if (!source) {
      temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle-db-senatran-br-"));
      source = path.join(temporaryDirectory, "frota.zip");
      await download(url ?? (await latestArchiveUrl()), source);
    }

    const fresh = await buildSourceCatalog(source, { startYear, endYear, minCount });
    const catalog = writeSnapshot(outPath, fresh, prune);

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
