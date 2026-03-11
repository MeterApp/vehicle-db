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

export interface VehicleType {
  VehicleTypeId: number;
  VehicleTypeName: string;
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
    _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all vehicle types in the database.
 */
export function getVehicleTypes(): NHTSAResponse<VehicleType> {
  const db = getDb();
  const rows = db
    .prepare("SELECT vehicle_type_id, vehicle_type_name FROM vehicle_types ORDER BY vehicle_type_name")
    .all() as { vehicle_type_id: number; vehicle_type_name: string }[];

  const results: VehicleType[] = rows.map((r) => ({
    VehicleTypeId: r.vehicle_type_id,
    VehicleTypeName: r.vehicle_type_name,
  }));

  return {
    Count: results.length,
    Message: "Results returned successfully",
    SearchCriteria: "",
    Results: results,
  };
}

/**
 * Equivalent to:
 * GET /api/vehicles/GetMakesForVehicleType/{type}?year={year}&format=json
 */
export function getMakesForVehicleType(
  vehicleType: string,
  year: number
): NHTSAResponse<MakeResult> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT mk.make_id, mk.make_name, vt.vehicle_type_id, vt.vehicle_type_name
       FROM models m
       JOIN makes mk USING (make_id)
       JOIN vehicle_types vt USING (vehicle_type_id)
       WHERE m.year = ? AND vt.vehicle_type_name = ? COLLATE NOCASE
       ORDER BY mk.make_name`
    )
    .all(year, vehicleType) as {
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
    SearchCriteria: `Vehicle Type: ${vehicleType}`,
    Results: results,
  };
}

/**
 * Equivalent to:
 * GET /api/vehicles/GetModelsForMakeYear/make/{make}/modelyear/{year}?format=json
 *
 * Optionally filter by vehicle type.
 */
export function getModelsForMakeYear(
  make: string,
  year: number,
  vehicleType?: string
): NHTSAResponse<ModelResult> {
  const db = getDb();

  let sql = `
    SELECT mk.make_id, mk.make_name, m.model_id, m.model_name
    FROM models m
    JOIN makes mk USING (make_id)
  `;
  const params: any[] = [year, make];

  if (vehicleType) {
    sql += `JOIN vehicle_types vt USING (vehicle_type_id)
            WHERE m.year = ? AND mk.make_name = ? COLLATE NOCASE AND vt.vehicle_type_name = ? COLLATE NOCASE`;
    params.push(vehicleType);
  } else {
    sql += `WHERE m.year = ? AND mk.make_name = ? COLLATE NOCASE`;
  }

  sql += ` ORDER BY m.model_name`;

  const rows = db.prepare(sql).all(...params) as {
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
    SearchCriteria: `Make:${make} | ModelYear:${year}${vehicleType ? ` | VehicleType:${vehicleType}` : ""}`,
    Results: results,
  };
}

/**
 * Get all available years in the database.
 */
export function getAvailableYears(): number[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT DISTINCT year FROM models ORDER BY year")
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
