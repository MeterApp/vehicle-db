/**
 * Fetches NHTSA vehicle data and builds a local SQLite database.
 *
 * Usage:
 *   npx tsx scripts/build-db.ts [--start-year 1981] [--end-year 2026]
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "data", "nhtsa.db");
const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const CONCURRENCY = 3; // be polite to the API
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Types mirroring the NHTSA JSON responses
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
        // API returned HTML instead of JSON — skip this entry
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
  let startYear = 1981;
  let endYear = 2026;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--start-year") startYear = Number(args[++i]);
    if (args[i] === "--end-year") endYear = Number(args[++i]);
  }

  console.log(`Building NHTSA database for years ${startYear}–${endYear}`);
  console.log(`Output: ${DB_PATH}\n`);

  // Create / reset database
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = DELETE");

  db.exec(`
    DROP TABLE IF EXISTS models;
    DROP TABLE IF EXISTS makes;

    CREATE TABLE makes (
      year        INTEGER NOT NULL,
      make_id     INTEGER NOT NULL,
      make_name   TEXT    NOT NULL,
      vehicle_type_id   INTEGER NOT NULL,
      vehicle_type_name TEXT    NOT NULL,
      PRIMARY KEY (year, make_id)
    );

    CREATE TABLE models (
      year        INTEGER NOT NULL,
      make_id     INTEGER NOT NULL,
      make_name   TEXT    NOT NULL,
      model_id    INTEGER NOT NULL,
      model_name  TEXT    NOT NULL,
      PRIMARY KEY (year, make_id, model_id)
    );

    CREATE INDEX idx_makes_year ON makes(year);
    CREATE INDEX idx_models_year_make ON models(year, make_id);
  `);

  const insertMake = db.prepare(`
    INSERT OR IGNORE INTO makes (year, make_id, make_name, vehicle_type_id, vehicle_type_name)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertModel = db.prepare(`
    INSERT OR IGNORE INTO models (year, make_id, make_name, model_id, model_name)
    VALUES (?, ?, ?, ?, ?)
  `);

  const years = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => startYear + i
  );

  // ---- Step 1: Fetch makes per year ----
  console.log("Step 1/2: Fetching makes per year...");
  const makesByYear = new Map<number, MakeResult[]>();

  await runPool(years, CONCURRENCY, async (year) => {
    const url = `${BASE}/GetMakesForVehicleType/car?year=${year}&format=json`;
    const data = await fetchJson<MakeResult>(url);
    if (data) {
      makesByYear.set(year, data.Results);
      console.log(`  ${year}: ${data.Results.length} makes`);
    } else {
      console.warn(`  ${year}: FAILED`);
    }
  });

  // Insert makes
  const insertMakes = db.transaction(() => {
    for (const [year, makes] of makesByYear) {
      for (const m of makes) {
        insertMake.run(year, m.MakeId, m.MakeName, m.VehicleTypeId, m.VehicleTypeName);
      }
    }
  });
  insertMakes();

  // ---- Step 2: Fetch models per make per year ----
  console.log("\nStep 2/2: Fetching models per make per year...");

  // Build work items — use make ID for reliable lookups
  const work: { year: number; make: MakeResult }[] = [];
  for (const [year, makes] of makesByYear) {
    for (const make of makes) {
      work.push({ year, make });
    }
  }

  console.log(`  Total API calls needed: ${work.length}`);

  let completed = 0;
  const allModels: { year: number; models: ModelResult[] }[] = [];

  await runPool(work, CONCURRENCY, async ({ year, make }) => {
    const url = `${BASE}/GetModelsForMakeIdYear/makeId/${make.MakeId}/modelyear/${year}?format=json`;
    const data = await fetchJson<ModelResult>(url);
    if (data) {
      allModels.push({ year, models: data.Results });
    }

    completed++;
    if (completed % 100 === 0) {
      console.log(`  Progress: ${completed}/${work.length}`);
    }
  });

  // Insert models in batches
  console.log("\nInserting models into database...");
  const insertModels = db.transaction(() => {
    for (const { year, models } of allModels) {
      for (const m of models) {
        insertModel.run(year, m.Make_ID, m.Make_Name, m.Model_ID, m.Model_Name);
      }
    }
  });
  insertModels();

  // ---- Stats ----
  const makeCount = (db.prepare("SELECT COUNT(*) as c FROM makes").get() as any).c;
  const modelCount = (db.prepare("SELECT COUNT(*) as c FROM models").get() as any).c;
  const yearCount = (db.prepare("SELECT COUNT(DISTINCT year) as c FROM makes").get() as any).c;

  db.close();

  const { size } = require("fs").statSync(DB_PATH);
  const sizeMB = (size / 1024 / 1024).toFixed(2);

  console.log(`\nDone!`);
  console.log(`  Years:  ${yearCount}`);
  console.log(`  Makes:  ${makeCount}`);
  console.log(`  Models: ${modelCount}`);
  console.log(`  DB size: ${sizeMB} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
