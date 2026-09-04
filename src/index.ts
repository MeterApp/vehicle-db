import data from "./data";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface VehicleType {
  vehicleTypeId: number;
  vehicleTypeName: string;
}

export interface DataSource {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  licenseUrl?: string;
  region: string;
  description: string;
  retrievedAt: string;
  vehicleTypeIds: number[];
  yearFrom: number;
  yearTo: number;
  makeCount: number;
  modelCount: number;
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
  sourceIds: string[];
}

export interface GetMakesOptions {
  year?: number;
  vehicleTypeId?: number;
  sourceId?: string;
}

export interface GetModelsOptions {
  year?: number;
  vehicleTypeId?: number;
  makeId?: number;
  modelId?: number;
  sourceId?: string;
}

export interface GetAvailableYearsOptions {
  vehicleTypeId?: number;
  makeId?: number;
  modelId?: number;
  sourceId?: string;
}

// ---------------------------------------------------------------------------
// Internal lookup maps (lazy)
// ---------------------------------------------------------------------------
let _makeMap: Map<number, string> | null = null;
let _typeMap: Map<number, string> | null = null;
let _sourceMaskMap: Map<string, number> | null = null;

function getMakeMap(): Map<number, string> {
  if (!_makeMap) {
    _makeMap = new Map(data.makes.map((m) => [m.make_id, m.make_name]));
  }
  return _makeMap;
}

function getTypeMap(): Map<number, string> {
  if (!_typeMap) {
    _typeMap = new Map(data.vehicleTypes.map((t) => [t.vehicle_type_id, t.vehicle_type_name]));
  }
  return _typeMap;
}

function getSourceMaskMap(): Map<string, number> {
  if (!_sourceMaskMap) {
    _sourceMaskMap = new Map(data.sources.map((source, index) => [source.source_id, 2 ** index]));
  }
  return _sourceMaskMap;
}

function getSourceIds(sourceMask: number): string[] {
  const sourceIds: string[] = [];
  for (let index = 0; index < data.sources.length; index++) {
    if ((sourceMask & 2 ** index) !== 0) sourceIds.push(data.sources[index].source_id);
  }
  return sourceIds;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all vehicle types in the database.
 */
export function getVehicleTypes(): VehicleType[] {
  return data.vehicleTypes.map((t) => ({
    vehicleTypeId: t.vehicle_type_id,
    vehicleTypeName: t.vehicle_type_name,
  }));
}

/**
 * Returns provenance and coverage metadata for every bundled source.
 */
export function getDataSources(): DataSource[] {
  return data.sources.map((source) => ({
    sourceId: source.source_id,
    sourceName: source.source_name,
    sourceUrl: source.source_url,
    license: source.license,
    ...(source.license_url ? { licenseUrl: source.license_url } : {}),
    region: source.region,
    description: source.description,
    retrievedAt: source.retrieved_at,
    vehicleTypeIds: [...source.vehicle_type_ids],
    yearFrom: source.year_from,
    yearTo: source.year_to,
    makeCount: source.make_count,
    modelCount: source.model_count,
  }));
}

/**
 * Returns makes, optionally filtered by year and/or vehicle type.
 */
export function getMakes(options: GetMakesOptions = {}): Make[] {
  const { year, vehicleTypeId, sourceId } = options;

  if (year == null && vehicleTypeId == null && sourceId == null) {
    return data.makes.map((m) => ({ makeId: m.make_id, makeName: m.make_name }));
  }

  const sourceMask = sourceId == null ? undefined : getSourceMaskMap().get(sourceId);
  if (sourceId != null && sourceMask == null) return [];

  const makeIds = new Set<number>();
  for (const m of data.models) {
    if (year != null && m[0] !== year) continue;
    if (vehicleTypeId != null && m[4] !== vehicleTypeId) continue;
    if (sourceMask != null && (m[5] & sourceMask) === 0) continue;
    makeIds.add(m[1]);
  }

  const makeMap = getMakeMap();
  return [...makeIds]
    .map((id) => ({ makeId: id, makeName: makeMap.get(id)! }))
    .sort((a, b) => (a.makeName < b.makeName ? -1 : a.makeName > b.makeName ? 1 : 0));
}

/**
 * Returns models, optionally filtered by year, vehicle type, and/or make.
 */
export function getModels(options: GetModelsOptions = {}): Model[] {
  const makeMap = getMakeMap();
  const typeMap = getTypeMap();
  const { year, vehicleTypeId, makeId, modelId, sourceId } = options;
  const sourceMask = sourceId == null ? undefined : getSourceMaskMap().get(sourceId);
  if (sourceId != null && sourceMask == null) return [];

  const results: Model[] = [];
  for (const m of data.models) {
    if (year != null && m[0] !== year) continue;
    if (makeId != null && m[1] !== makeId) continue;
    if (modelId != null && m[2] !== modelId) continue;
    if (vehicleTypeId != null && m[4] !== vehicleTypeId) continue;
    if (sourceMask != null && (m[5] & sourceMask) === 0) continue;
    results.push({
      modelId: m[2],
      modelName: data.modelNames[m[3]],
      makeId: m[1],
      makeName: makeMap.get(m[1])!,
      vehicleTypeId: m[4],
      vehicleTypeName: typeMap.get(m[4])!,
      sourceIds: getSourceIds(m[5]),
    });
  }

  return results.sort(
    (a, b) =>
      (a.modelName < b.modelName ? -1 : a.modelName > b.modelName ? 1 : 0) ||
      a.vehicleTypeId - b.vehicleTypeId,
  );
}

/**
 * Gets available years, optionally filtered by vehicle identity and source.
 */
export function getAvailableYears(options: GetAvailableYearsOptions = {}): number[] {
  const { vehicleTypeId, makeId, modelId, sourceId } = options;
  const sourceMask = sourceId == null ? undefined : getSourceMaskMap().get(sourceId);
  if (sourceId != null && sourceMask == null) return [];

  const years = new Set<number>();
  for (const m of data.models) {
    if (makeId != null && m[1] !== makeId) continue;
    if (modelId != null && m[2] !== modelId) continue;
    if (vehicleTypeId != null && m[4] !== vehicleTypeId) continue;
    if (sourceMask != null && (m[5] & sourceMask) === 0) continue;
    years.add(m[0]);
  }
  return [...years].sort((a, b) => a - b);
}
