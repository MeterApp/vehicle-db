/**
 * Fetches NHTSA vehicle data and builds a local SQLite database.
 *
 * Usage:
 *   npx tsx scripts/build-db.ts [--start-year 1990] [--end-year 2026]
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "data", "nhtsa.db");
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
  console.log(`Output: ${DB_PATH}\n`);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = DELETE");

  db.exec(`
    DROP TABLE IF EXISTS models;
    DROP TABLE IF EXISTS makes;
    DROP TABLE IF EXISTS vehicle_types;

    CREATE TABLE vehicle_types (
      vehicle_type_id   INTEGER PRIMARY KEY,
      vehicle_type_name TEXT NOT NULL
    );

    CREATE TABLE makes (
      make_id   INTEGER PRIMARY KEY,
      make_name TEXT NOT NULL
    );

    CREATE TABLE models (
      year            INTEGER NOT NULL,
      make_id         INTEGER NOT NULL,
      model_id        INTEGER NOT NULL,
      model_name      TEXT    NOT NULL,
      vehicle_type_id INTEGER NOT NULL,
      PRIMARY KEY (year, make_id, model_id, vehicle_type_id),
      FOREIGN KEY (make_id) REFERENCES makes(make_id),
      FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(vehicle_type_id)
    );

    CREATE INDEX idx_models_year_make ON models(year, make_id);
    CREATE INDEX idx_models_year_type ON models(year, vehicle_type_id);
  `);

  const insertVehicleType = db.prepare(
    `INSERT OR IGNORE INTO vehicle_types (vehicle_type_id, vehicle_type_name) VALUES (?, ?)`
  );
  const insertMake = db.prepare(
    `INSERT OR IGNORE INTO makes (make_id, make_name) VALUES (?, ?)`
  );
  const insertModel = db.prepare(
    `INSERT OR IGNORE INTO models (year, make_id, model_id, model_name, vehicle_type_id) VALUES (?, ?, ?, ?, ?)`
  );

  // Insert vehicle types
  const insertTypes = db.transaction(() => {
    for (const vt of VEHICLE_TYPES) {
      insertVehicleType.run(vt.id, vt.name);
    }
  });
  insertTypes();

  const years = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => startYear + i
  );

  // ---- Step 1: Fetch makes per vehicle type (no year filter) ----
  console.log("Step 1/3: Fetching makes per vehicle type...");

  const allMakes = new Map<number, string>(); // make_id -> make_name
  // Track which make IDs belong to each vehicle type + year
  const makesByTypeAndYear = new Map<string, Set<number>>(); // `${typeId}:${year}` -> Set<makeId>

  for (const vt of VEHICLE_TYPES) {
    // Fetch makes for each year and vehicle type
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

  // Insert all makes
  console.log(`\nTotal unique makes: ${allMakes.size}`);
  const insertAllMakes = db.transaction(() => {
    for (const [id, name] of allMakes) {
      insertMake.run(id, name);
    }
  });
  insertAllMakes();

  // ---- Step 2: Fetch models per make/year/vehicleType ----
  console.log("\nStep 2/3: Fetching models per make/year/vehicleType...");

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
  const allModels: { year: number; makeId: number; vehicleTypeId: number; models: ModelResult[] }[] = [];

  await runPool(work, CONCURRENCY, async ({ year, makeId, vehicleType }) => {
    const url = `${BASE}/GetModelsForMakeIdYear/makeId/${makeId}/modelyear/${year}/vehicleType/${encodeURIComponent(vehicleType.slug)}?format=json`;
    const data = await fetchJson<ModelResult>(url);
    if (data && data.Results.length > 0) {
      allModels.push({ year, makeId, vehicleTypeId: vehicleType.id, models: data.Results });
    }

    completed++;
    if (completed % 200 === 0) {
      console.log(`  Progress: ${completed}/${work.length}`);
    }
  });

  // ---- Step 3: Insert models ----
  console.log("\nStep 3/3: Inserting models into database...");
  const insertAllModels = db.transaction(() => {
    for (const { year, vehicleTypeId, models } of allModels) {
      for (const m of models) {
        insertModel.run(year, m.Make_ID, m.Model_ID, m.Model_Name, vehicleTypeId);
      }
    }
  });
  insertAllModels();

  // ---- Stats ----
  const makeCount = (db.prepare("SELECT COUNT(*) as c FROM makes").get() as any).c;
  const modelCount = (db.prepare("SELECT COUNT(*) as c FROM models").get() as any).c;
  const typeCount = (db.prepare("SELECT COUNT(*) as c FROM vehicle_types").get() as any).c;
  const yearCount = (db.prepare("SELECT COUNT(DISTINCT year) as c FROM models").get() as any).c;

  db.close();

  const { size } = require("fs").statSync(DB_PATH);
  const sizeMB = (size / 1024 / 1024).toFixed(2);

  console.log(`\nDone!`);
  console.log(`  Years:          ${yearCount}`);
  console.log(`  Vehicle types:  ${typeCount}`);
  console.log(`  Makes:          ${makeCount}`);
  console.log(`  Model entries:  ${modelCount}`);
  console.log(`  DB size:        ${sizeMB} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
