import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "data", "nhtsa.db");

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface VehicleType {
  vehicleTypeId: number;
  vehicleTypeName: string;
}

export interface Make {
  makeId: number;
  makeName: string;
}

export interface Model {
  modelId: number;
  modelName: string;
  makeId: number;
  makeName: string;
  vehicleTypeId: number;
  vehicleTypeName: string;
}

export interface GetMakesOptions {
  year?: number;
  vehicleTypeId?: number;
}

export interface GetModelsOptions {
  year?: number;
  vehicleTypeId?: number;
  makeId?: number;
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
export function getVehicleTypes(): VehicleType[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT vehicle_type_id, vehicle_type_name FROM vehicle_types ORDER BY vehicle_type_name")
    .all() as { vehicle_type_id: number; vehicle_type_name: string }[];

  return rows.map((r) => ({
    vehicleTypeId: r.vehicle_type_id,
    vehicleTypeName: r.vehicle_type_name,
  }));
}

/**
 * Returns makes, optionally filtered by year and/or vehicle type.
 */
export function getMakes(options: GetMakesOptions = {}): Make[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (options.year != null) {
    conditions.push("m.year = ?");
    params.push(options.year);
  }
  if (options.vehicleTypeId != null) {
    conditions.push("m.vehicle_type_id = ?");
    params.push(options.vehicleTypeId);
  }

  let sql: string;
  if (conditions.length > 0) {
    sql = `SELECT DISTINCT mk.make_id, mk.make_name
           FROM models m
           JOIN makes mk USING (make_id)
           WHERE ${conditions.join(" AND ")}
           ORDER BY mk.make_name`;
  } else {
    sql = `SELECT make_id, make_name FROM makes ORDER BY make_name`;
  }

  const rows = db.prepare(sql).all(...params) as {
    make_id: number;
    make_name: string;
  }[];

  return rows.map((r) => ({
    makeId: r.make_id,
    makeName: r.make_name,
  }));
}

/**
 * Returns models, optionally filtered by year, vehicle type, and/or make.
 */
export function getModels(options: GetModelsOptions = {}): Model[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (options.year != null) {
    conditions.push("m.year = ?");
    params.push(options.year);
  }
  if (options.vehicleTypeId != null) {
    conditions.push("m.vehicle_type_id = ?");
    params.push(options.vehicleTypeId);
  }
  if (options.makeId != null) {
    conditions.push("m.make_id = ?");
    params.push(options.makeId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT m.model_id, m.model_name, mk.make_id, mk.make_name,
           vt.vehicle_type_id, vt.vehicle_type_name
    FROM models m
    JOIN makes mk USING (make_id)
    JOIN vehicle_types vt USING (vehicle_type_id)
    ${where}
    ORDER BY m.model_name`;

  const rows = db.prepare(sql).all(...params) as {
    model_id: number;
    model_name: string;
    make_id: number;
    make_name: string;
    vehicle_type_id: number;
    vehicle_type_name: string;
  }[];

  return rows.map((r) => ({
    modelId: r.model_id,
    modelName: r.model_name,
    makeId: r.make_id,
    makeName: r.make_name,
    vehicleTypeId: r.vehicle_type_id,
    vehicleTypeName: r.vehicle_type_name,
  }));
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
