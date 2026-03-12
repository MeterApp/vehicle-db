/**
 * Fetches NHTSA vehicle data and builds src/data.ts.
 *
 * Usage:
 *   npx tsx scripts/build-db.ts [--start-year 1990] [--end-year 2026]
 */
import fs from "fs";
import path from "path";

const OUT_PATH = path.join(__dirname, "..", "src", "data.ts");
const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const CONCURRENCY = 3;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 2000;

// Vehicle types to fetch
const VEHICLE_TYPES = [
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchJson<T>(url: string): Promise<ApiResponse<T> | null> {
  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      if (text.startsWith("<")) {
        console.warn(`  Skipping (HTML response): ${url}`);
        return null;
      }
      return JSON.parse(text) as ApiResponse<T>;
    } catch (err) {
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
  let endYear = 2026;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--start-year") startYear = Number(args[++i]);
    if (args[i] === "--end-year") endYear = Number(args[++i]);
  }

  console.log(`Building NHTSA database for years ${startYear}–${endYear}`);
  console.log(`Vehicle types: ${VEHICLE_TYPES.map((t) => t.name).join(", ")}`);
  console.log(`Output: ${OUT_PATH}\n`);

  const years = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => startYear + i
  );

  // ---- Step 1: Fetch makes per vehicle type ----
  console.log("Step 1/2: Fetching makes per vehicle type...");

  const allMakes = new Map<number, string>();
  const makesByTypeAndYear = new Map<string, Set<number>>();

  for (const vt of VEHICLE_TYPES) {
    await runPool(years, CONCURRENCY, async (year) => {
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
      }
    });
  }

  console.log(`\nTotal unique makes: ${allMakes.size}`);

  // ---- Step 2: Fetch models per make/year/vehicleType ----
  console.log("\nStep 2/2: Fetching models per make/year/vehicleType...");

  interface WorkItem {
    year: number;
    makeId: number;
    vehicleType: (typeof VEHICLE_TYPES)[number];
  }

  const work: WorkItem[] = [];
  for (const vt of VEHICLE_TYPES) {
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
  const rawModels: [number, number, number, string, number][] = [];

  await runPool(work, CONCURRENCY, async ({ year, makeId, vehicleType }) => {
    const url = `${BASE}/GetModelsForMakeIdYear/makeId/${makeId}/modelyear/${year}/vehicleType/${encodeURIComponent(vehicleType.slug)}?format=json`;
    const data = await fetchJson<ModelResult>(url);
    if (data && data.Results.length > 0) {
      for (const m of data.Results) {
        rawModels.push([year, m.Make_ID, m.Model_ID, m.Model_Name, vehicleType.id]);
      }
    }

    completed++;
    if (completed % 200 === 0) {
      console.log(`  Progress: ${completed}/${work.length}`);
    }
  });

  // ---- Build compact JSON ----
  console.log("\nBuilding compact JSON...");

  // Deduplicate model names
  const modelNames = [...new Set(rawModels.map((m) => m[3]))].sort();
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

  const vehicleTypes = VEHICLE_TYPES.map((vt) => ({
    vehicle_type_id: vt.id,
    vehicle_type_name: vt.name,
  }));

  const makes = [...allMakes.entries()]
    .map(([id, name]) => ({ make_id: id, make_name: name }))
    .sort((a, b) => (a.make_name >= b.make_name ? 1 : -1));

  const json = JSON.stringify({ vehicleTypes, makes, modelNames, models: compactModels });
  const tsOutput = `// Auto-generated — do not edit. Run npm run build:db to regenerate.

interface CompactData {
  vehicleTypes: { vehicle_type_id: number; vehicle_type_name: string }[];
  makes: { make_id: number; make_name: string }[];
  modelNames: string[];
  models: [number, number, number, number, number][];
}

const data: CompactData = ${json};

export default data;
`;
  fs.writeFileSync(OUT_PATH, tsOutput);

  const { size } = fs.statSync(OUT_PATH);
  const sizeMB = (size / 1024 / 1024).toFixed(2);

  console.log(`\nDone!`);
  console.log(`  Years:          ${years.length}`);
  console.log(`  Vehicle types:  ${VEHICLE_TYPES.length}`);
  console.log(`  Makes:          ${makes.length}`);
  console.log(`  Model names:    ${modelNames.length}`);
  console.log(`  Model entries:  ${compactModels.length}`);
  console.log(`  File size:      ${sizeMB} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
