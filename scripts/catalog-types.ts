export interface SourceMetadata {
  id: string;
  name: string;
  url: string;
  license: string;
  licenseUrl?: string;
  region: string;
  description: string;
  retrievedAt: string;
}

export interface SourceCatalog {
  metadata: SourceMetadata;
  vehicleTypes: { vehicle_type_id: number; vehicle_type_name: string }[];
  makes: { make_id: number; make_name: string }[];
  modelNames: string[];
  models: [number, number, number, number, number][];
}

export function normalizeName(value: string): string {
  return value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, " ");
}

export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Stable unsigned FNV-1a ID in a namespace above the IDs assigned by vPIC. */
export function stableSourceId(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return 1_000_000_000 + hash;
}

export function assertNoIdCollision(
  ids: Map<number, string>,
  id: number,
  key: string,
  label: string,
): void {
  const existing = ids.get(id);
  if (existing && existing !== key) {
    throw new Error(`${label} ID collision ${id}: ${existing} vs ${key}`);
  }
  ids.set(id, key);
}
