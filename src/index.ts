import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "data", "nhtsa.db");

// ---------------------------------------------------------------------------
// Public types — mirror the NHTSA API response shapes
// ---------------------------------------------------------------------------
export interface MakeResult {
  MakeId: number;
  MakeName: string;
  VehicleTypeId: number;
  VehicleTypeName: string;
}

export interface ModelResult {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
}

export interface NHTSAResponse<T> {
  Count: number;
  Message: string;
  SearchCriteria: string;
  Results: T[];
}

// ---------------------------------------------------------------------------
// Database singleton
// ---------------------------------------------------------------------------
let _db: ReturnType<typeof Database> | null = null;

function getDb(): ReturnType<typeof Database> {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Public API — drop-in replacements for the NHTSA REST calls
// ---------------------------------------------------------------------------

/**
 * Equivalent to:
 * GET /api/vehicles/GetMakesForVehicleType/car?year={year}&format=json
 */
export function getMakesForVehicleType(year: number): NHTSAResponse<MakeResult> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT make_id, make_name, vehicle_type_id, vehicle_type_name
       FROM makes
       WHERE year = ?
       ORDER BY make_name`
    )
    .all(year) as {
    make_id: number;
    make_name: string;
    vehicle_type_id: number;
    vehicle_type_name: string;
  }[];

  const results: MakeResult[] = rows.map((r) => ({
    MakeId: r.make_id,
    MakeName: r.make_name,
    VehicleTypeId: r.vehicle_type_id,
    VehicleTypeName: r.vehicle_type_name,
  }));

  return {
    Count: results.length,
    Message: "Results returned successfully",
    SearchCriteria: `Vehicle Type: car`,
    Results: results,
  };
}

/**
 * Equivalent to:
 * GET /api/vehicles/GetModelsForMakeYear/make/{make}/modelyear/{year}?format=json
 */
export function getModelsForMakeYear(
  make: string,
  year: number
): NHTSAResponse<ModelResult> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT make_id, make_name, model_id, model_name
       FROM models
       WHERE year = ? AND make_name = ? COLLATE NOCASE
       ORDER BY model_name`
    )
    .all(year, make) as {
    make_id: number;
    make_name: string;
    model_id: number;
    model_name: string;
  }[];

  const results: ModelResult[] = rows.map((r) => ({
    Make_ID: r.make_id,
    Make_Name: r.make_name,
    Model_ID: r.model_id,
    Model_Name: r.model_name,
  }));

  return {
    Count: results.length,
    Message: "Results returned successfully",
    SearchCriteria: `Make:${make} | ModelYear:${year}`,
    Results: results,
  };
}

/**
 * Get all available years in the database.
 */
export function getAvailableYears(): number[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT DISTINCT year FROM makes ORDER BY year")
    .all() as { year: number }[];
  return rows.map((r) => r.year);
}

/**
 * Close the database connection (optional cleanup).
 */
export function close(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
