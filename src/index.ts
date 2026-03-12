import path from "path";
import fs from "fs";

const DATA_PATH = path.join(__dirname, "..", "data", "compact.json");

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
// Internal data format: [year, makeId, modelId, modelNameIndex, vehicleTypeId]
// ---------------------------------------------------------------------------
type CompactModel = [number, number, number, number, number];

interface CompactData {
  vehicleTypes: { vehicle_type_id: number; vehicle_type_name: string }[];
  makes: { make_id: number; make_name: string }[];
  modelNames: string[];
  models: CompactModel[];
}

// ---------------------------------------------------------------------------
// Lazy-loaded singleton
// ---------------------------------------------------------------------------
let _data: CompactData | null = null;
let _makeMap: Map<number, string> | null = null;
let _typeMap: Map<number, string> | null = null;

function getData(): CompactData {
  if (!_data) {
    _data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  }
  return _data!;
}

function getMakeMap(): Map<number, string> {
  if (!_makeMap) {
    _makeMap = new Map(getData().makes.map((m) => [m.make_id, m.make_name]));
  }
  return _makeMap;
}

function getTypeMap(): Map<number, string> {
  if (!_typeMap) {
    _typeMap = new Map(getData().vehicleTypes.map((t) => [t.vehicle_type_id, t.vehicle_type_name]));
  }
  return _typeMap;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all vehicle types in the database.
 */
export function getVehicleTypes(): VehicleType[] {
  return getData().vehicleTypes.map((t) => ({
    vehicleTypeId: t.vehicle_type_id,
    vehicleTypeName: t.vehicle_type_name,
  }));
}

/**
 * Returns makes, optionally filtered by year and/or vehicle type.
 */
export function getMakes(options: GetMakesOptions = {}): Make[] {
  const data = getData();
  const { year, vehicleTypeId } = options;

  if (year == null && vehicleTypeId == null) {
    return data.makes.map((m) => ({ makeId: m.make_id, makeName: m.make_name }));
  }

  const makeIds = new Set<number>();
  for (const m of data.models) {
    if (year != null && m[0] !== year) continue;
    if (vehicleTypeId != null && m[4] !== vehicleTypeId) continue;
    makeIds.add(m[1]);
  }

  const makeMap = getMakeMap();
  return [...makeIds]
    .map((id) => ({ makeId: id, makeName: makeMap.get(id)! }))
    .sort((a, b) => (a.makeName >= b.makeName ? 1 : -1));
}

/**
 * Returns models, optionally filtered by year, vehicle type, and/or make.
 */
export function getModels(options: GetModelsOptions = {}): Model[] {
  const data = getData();
  const makeMap = getMakeMap();
  const typeMap = getTypeMap();
  const { year, vehicleTypeId, makeId } = options;

  const results: Model[] = [];
  for (const m of data.models) {
    if (year != null && m[0] !== year) continue;
    if (makeId != null && m[1] !== makeId) continue;
    if (vehicleTypeId != null && m[4] !== vehicleTypeId) continue;
    results.push({
      modelId: m[2],
      modelName: data.modelNames[m[3]],
      makeId: m[1],
      makeName: makeMap.get(m[1])!,
      vehicleTypeId: m[4],
      vehicleTypeName: typeMap.get(m[4])!,
    });
  }

  return results.sort((a, b) => (a.modelName >= b.modelName ? 1 : -1));
}

/**
 * Get all available years in the database.
 */
export function getAvailableYears(): number[] {
  const years = new Set<number>();
  for (const m of getData().models) {
    years.add(m[0]);
  }
  return [...years].sort((a, b) => a - b);
}

/**
 * Clear cached data (optional cleanup, frees memory).
 */
export function close(): void {
  _data = null;
  _makeMap = null;
  _typeMap = null;
}
