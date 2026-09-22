/**
 * Refreshes the normalized NHTSA vPIC source snapshot.
 *
 * Usage:
 *   npx tsx scripts/import-nhtsa.ts [--start-year 1990] [--end-year <next year>]
 *   npx tsx scripts/import-nhtsa.ts --start-year 2025 --end-year 2027 --merge
 *   npx tsx scripts/import-nhtsa.ts ... --cache-dir .cache/nhtsa   # resumable
 *   npx tsx scripts/import-nhtsa.ts ... --prune   # drop entries vPIC no longer lists
 *
 * With --merge, only the requested years are fetched; entries for every other
 * year are carried over from the existing snapshot. vPIC rate-limits heavily,
 * so this is the practical way to add a new model year. Model years run ahead
 * of the calendar, so the default range ends next year.
 *
 * A refreshed year never loses an entry the snapshot already published:
 * manufacturers re-file model years (Maserati's 2026 MC20 became the MCPura),
 * but consumers store the year/make/model they rendered. --prune drops them.
 *
 * vPIC's CDN answers HTTP 403 to every request from an address it considers
 * too busy, for an hour or more. Requests are therefore spaced out, the run
 * stops at the first sustained 403, and with --cache-dir every answer already
 * received is kept on disk so the next run resumes where this one stopped.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { compareStrings, type SourceCatalog } from "./catalog-types";

const OUT_PATH = path.join(__dirname, "..", "data", "sources", "nhtsa.json");
const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_INTERVAL_MS = 500;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 2000;
/** Consecutive 403 answers after which the address is treated as blocked. */
const BLOCKED_AFTER = 5;

// Vehicle types to fetch from NHTSA vPIC
const NHTSA_VEHICLE_TYPES = [
  { id: 2, name: "Passenger Car", slug: "car" },
  { id: 3, name: "Truck", slug: "truck" },
  { id: 7, name: "Multipurpose Passenger Vehicle (MPV)", slug: "multipurpose passenger vehicle (mpv)" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MakeResult {
  MakeId: number;
  MakeName: string;
  VehicleTypeId: number;
  VehicleTypeName: string;
}

interface ModelResult {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
}

interface ApiResponse<T> {
  Count: number;
  Message: string;
  Results: T[];
}

type RawModel = [number, number, number, string, number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
class BlockedError extends Error {}

const client = {
  cacheDir: undefined as string | undefined,
  intervalMs: DEFAULT_INTERVAL_MS,
  nextSlot: 0,
  consecutive403: 0,
};

/** Spaces request starts at least `intervalMs` apart across all workers. */
async function throttle(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, client.nextSlot);
  client.nextSlot = slot + client.intervalMs;
  if (slot > now) await sleep(slot - now);
}

function cachePath(url: string): string | undefined {
  if (!client.cacheDir) return undefined;
  const digest = crypto.createHash("sha256").update(url).digest("hex").slice(0, 32);
  return path.join(client.cacheDir, `${digest}.json`);
}

async function fetchJson<T>(url: string): Promise<ApiResponse<T> | null> {
  const cached = cachePath(url);
  if (cached && fs.existsSync(cached)) {
    return JSON.parse(fs.readFileSync(cached, "utf8")) as ApiResponse<T>;
  }
  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
    try {
      await throttle();
      const res = await fetch(url);
      if (res.status === 403) {
        client.consecutive403++;
        if (client.consecutive403 >= BLOCKED_AFTER) {
          throw new BlockedError(
            "vPIC is refusing this address (HTTP 403). Wait, then rerun with the same --cache-dir to resume.",
          );
        }
      } else {
        client.consecutive403 = 0;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      if (text.startsWith("<")) {
        console.warn(`  Skipping (HTML response): ${url}`);
        return null;
      }
      const data = JSON.parse(text) as ApiResponse<T>;
      if (cached) {
        fs.mkdirSync(path.dirname(cached), { recursive: true });
        fs.writeFileSync(cached, text);
      }
      return data;
    } catch (err) {
      if (err instanceof BlockedError) throw err;
      if (attempt === RETRY_LIMIT) {
        console.warn(`  Failed after ${RETRY_LIMIT} attempts: ${url}`);
        return null;
      }
      console.warn(`  Retry ${attempt}/${RETRY_LIMIT} for ${url}`);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  let startYear = 1990;
  let endYear = new Date().getUTCFullYear() + 1;
  let merge = false;
  let prune = false;
  let concurrency = DEFAULT_CONCURRENCY;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--start-year") startYear = Number(args[++i]);
    else if (args[i] === "--end-year") endYear = Number(args[++i]);
    else if (args[i] === "--merge") merge = true;
    else if (args[i] === "--prune") prune = true;
    else if (args[i] === "--cache-dir") client.cacheDir = path.resolve(args[++i]);
    else if (args[i] === "--concurrency") concurrency = Number(args[++i]);
    else if (args[i] === "--interval-ms") client.intervalMs = Number(args[++i]);
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) {
    throw new Error(`Invalid year range: ${startYear}–${endYear}`);
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`Invalid concurrency: ${concurrency}`);
  }
  if (!Number.isInteger(client.intervalMs) || client.intervalMs < 0) {
    throw new Error(`Invalid interval: ${client.intervalMs}`);
  }

  console.log(`Refreshing NHTSA source for years ${startYear}–${endYear}${merge ? " (merging into existing snapshot)" : ""}`);
  console.log(`NHTSA vehicle types: ${NHTSA_VEHICLE_TYPES.map((t) => t.name).join(", ")}`);
  console.log(`Output: ${OUT_PATH}\n`);

  const years = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => startYear + i
  );

  // ---- Step 1: Fetch makes per vehicle type ----
  console.log("Step 1/2: Fetching makes per vehicle type...");

  const allMakes = new Map<number, string>();
  const makesByTypeAndYear = new Map<string, Set<number>>();
  const failures: string[] = [];

  for (const vt of NHTSA_VEHICLE_TYPES) {
    await runPool(years, concurrency, async (year) => {
      const url = `${BASE}/GetMakesForVehicleType/${encodeURIComponent(vt.slug)}?year=${year}&format=json`;
      const data = await fetchJson<MakeResult>(url);
      if (data) {
        const key = `${vt.id}:${year}`;
        const makeIds = new Set<number>();
        for (const m of data.Results) {
          allMakes.set(m.MakeId, m.MakeName);
          makeIds.add(m.MakeId);
        }
        makesByTypeAndYear.set(key, makeIds);
        console.log(`  ${vt.slug} ${year}: ${data.Results.length} makes`);
      } else {
        console.warn(`  ${vt.slug} ${year}: FAILED`);
        failures.push(`${vt.slug} makes for ${year}`);
      }
    });
  }

  console.log(`\nTotal unique makes: ${allMakes.size}`);

  // ---- Step 2: Fetch models per make/year/vehicleType ----
  console.log("\nStep 2/2: Fetching models per make/year/vehicleType...");

  interface WorkItem {
    year: number;
    makeId: number;
    vehicleType: (typeof NHTSA_VEHICLE_TYPES)[number];
  }

  const work: WorkItem[] = [];
  for (const vt of NHTSA_VEHICLE_TYPES) {
    for (const year of years) {
      const key = `${vt.id}:${year}`;
      const makeIds = makesByTypeAndYear.get(key);
      if (makeIds) {
        for (const makeId of makeIds) {
          work.push({ year, makeId, vehicleType: vt });
        }
      }
    }
  }

  console.log(`  Total API calls needed: ${work.length}`);

  let completed = 0;
  // Collect raw model rows: [year, makeId, modelId, modelName, vehicleTypeId]
  const rawModels: RawModel[] = [];

  await runPool(work, concurrency, async ({ year, makeId, vehicleType }) => {
    const url = `${BASE}/GetModelsForMakeIdYear/makeId/${makeId}/modelyear/${year}/vehicleType/${encodeURIComponent(vehicleType.slug)}?format=json`;
    const data = await fetchJson<ModelResult>(url);
    if (data && data.Results.length > 0) {
      for (const m of data.Results) {
        rawModels.push([year, m.Make_ID, m.Model_ID, m.Model_Name, vehicleType.id]);
      }
    } else if (!data) {
      failures.push(`${vehicleType.slug} models for make ${makeId}, ${year}`);
    }

    completed++;
    if (completed % 200 === 0) {
      console.log(`  Progress: ${completed}/${work.length}`);
    }
  });

  if (failures.length > 0) {
    throw new Error(
      `NHTSA refresh failed for ${failures.length} request(s); existing snapshot was not changed. First failures: ${failures.slice(0, 10).join(", ")}`,
    );
  }

  // ---- Carry over untouched years, and keep what refreshed years published ----
  const existing =
    (merge || !prune) && fs.existsSync(OUT_PATH)
      ? (JSON.parse(fs.readFileSync(OUT_PATH, "utf8")) as SourceCatalog)
      : undefined;
  if (existing) {
    const fetched = new Set(
      rawModels.map(([year, makeId, modelId, , type]) => `${year}:${makeId}:${modelId}:${type}`),
    );
    let carried = 0;
    let retained = 0;
    for (const [year, makeId, modelId, nameIndex, vehicleTypeId] of existing.models) {
      const refreshed = year >= startYear && year <= endYear;
      const keep = refreshed
        ? !prune && !fetched.has(`${year}:${makeId}:${modelId}:${vehicleTypeId}`)
        : merge;
      if (!keep) continue;
      rawModels.push([year, makeId, modelId, existing.modelNames[nameIndex]!, vehicleTypeId]);
      if (refreshed) retained++;
      else carried++;
    }
    const usedMakeIds = new Set(rawModels.map(([, makeId]) => makeId));
    for (const make of existing.makes) {
      if (!allMakes.has(make.make_id) && (merge || usedMakeIds.has(make.make_id))) {
        allMakes.set(make.make_id, make.make_name);
      }
    }
    if (merge) console.log(`\nCarried over ${carried.toLocaleString()} entries from the existing snapshot`);
    if (retained > 0) {
      console.log(`Kept ${retained.toLocaleString()} published entries vPIC no longer lists (--prune drops them)`);
    }
  }

  // ---- One name per model ID: vPIC occasionally renames a model (e.g. Polestar
  // "PS2" became "POLESTAR 2"), and the catalog build requires a single name.
  // The name reported for the latest model year wins.
  const latestName = new Map<number, { year: number; name: string }>();
  for (const [year, , modelId, name] of rawModels) {
    const current = latestName.get(modelId);
    if (!current || year > current.year || (year === current.year && name > current.name)) {
      latestName.set(modelId, { year, name });
    }
  }
  let renamed = 0;
  for (const model of rawModels) {
    const name = latestName.get(model[2])!.name;
    if (model[3] !== name) {
      model[3] = name;
      renamed++;
    }
  }
  if (renamed > 0) console.log(`Applied latest vPIC names to ${renamed} renamed model entries`);

  // ---- Build compact JSON ----
  console.log("\nBuilding compact JSON...");

  // Deduplicate model names
  const modelNames = [...new Set(rawModels.map((m) => m[3]))].sort(compareStrings);
  const nameIndex = new Map(modelNames.map((n, i) => [n, i]));

  // Deduplicate models (year + makeId + modelId + vehicleTypeId)
  const seen = new Set<string>();
  const compactModels: [number, number, number, number, number][] = [];
  for (const m of rawModels) {
    const key = `${m[0]}:${m[1]}:${m[2]}:${m[4]}`;
    if (!seen.has(key)) {
      seen.add(key);
      compactModels.push([m[0], m[1], m[2], nameIndex.get(m[3])!, m[4]]);
    }
  }
  compactModels.sort(
    (left, right) =>
      left[0] - right[0] ||
      left[1] - right[1] ||
      left[2] - right[2] ||
      left[4] - right[4],
  );

  const vehicleTypes = NHTSA_VEHICLE_TYPES.map((vt) => ({
    vehicle_type_id: vt.id,
    vehicle_type_name: vt.name,
  }));

  const makes = [...allMakes.entries()]
    .map(([id, name]) => ({ make_id: id, make_name: name }))
    .sort((a, b) => compareStrings(a.make_name, b.make_name));

  const compactData: SourceCatalog = {
    metadata: {
      id: "nhtsa-vpic",
      name: "NHTSA Vehicle Product Information Catalog",
      url: "https://vpic.nhtsa.dot.gov/api/",
      license: "U.S. government public data",
      region: "United States",
      description: "Model-year catalog from the National Highway Traffic Safety Administration vPIC API.",
      retrievedAt: new Date().toISOString().slice(0, 10),
    },
    vehicleTypes,
    makes,
    modelNames,
    models: compactModels,
  };
  const json = JSON.stringify(compactData);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, json);

  const { size } = fs.statSync(OUT_PATH);
  const sizeMB = (size / 1024 / 1024).toFixed(2);

  console.log(`\nDone!`);
  console.log(`  Years:          ${years.length}`);
  console.log(`  Vehicle types:  ${vehicleTypes.length}`);
  console.log(`  Makes:          ${makes.length}`);
  console.log(`  Model names:    ${modelNames.length}`);
  console.log(`  Model entries:  ${compactModels.length}`);
  console.log(`  File size:      ${sizeMB} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
