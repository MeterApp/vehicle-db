/** Small source-backed additions, with evidence kept outside compact runtime data. */
import fs from "fs";
import { stableSourceId, assertNoIdCollision, writeSnapshot, type SourceCatalog } from "./catalog-types";
export interface ReviewedModel { year: number; makeId: number; make: string; model: string; vehicleTypeId: number; market: string; url: string; note: string; yearBasis?: "model-year" | "catalog-year" }
const VEHICLE_TYPES = [
  { vehicle_type_id: 1, vehicle_type_name: "Motorcycle" },
  { vehicle_type_id: 2, vehicle_type_name: "Passenger Car" },
  { vehicle_type_id: 3, vehicle_type_name: "Truck" },
  { vehicle_type_id: 5, vehicle_type_name: "Bus" },
  { vehicle_type_id: 7, vehicle_type_name: "Multipurpose Passenger Vehicle (MPV)" },
  { vehicle_type_id: 10001, vehicle_type_name: "Auto Rickshaw" },
  { vehicle_type_id: 10002, vehicle_type_name: "Other Vehicle" },
];
export function buildReviewedCatalog(records: ReviewedModel[], metadata: SourceCatalog["metadata"]): SourceCatalog {
  const makeMap = new Map<number, string>(), used = new Map<number,string>();
  const modelNames = [...new Set(records.map(r => r.model))].sort();
  const models: SourceCatalog["models"] = records.map(r => {
    if (!Number.isInteger(r.year) || r.year < 1990 || !/^https:\/\//.test(r.url) || !r.note || !/^[A-Z]{2}$/.test(r.market)) throw new Error("Invalid reviewed model evidence");
    if (!VEHICLE_TYPES.some(t => t.vehicle_type_id === r.vehicleTypeId) ||
      !Number.isSafeInteger(r.makeId) || r.makeId <= 0 || !r.make.trim() || !r.model.trim() ||
      (r.yearBasis !== undefined && !["model-year", "catalog-year"].includes(r.yearBasis))) throw new Error("Invalid reviewed model identity/type/year basis");
    if (makeMap.has(r.makeId) && makeMap.get(r.makeId) !== r.make) throw new Error("Conflicting make ID");
    makeMap.set(r.makeId, r.make);
    const key = `${metadata.id}:model:${r.make}:${r.model}`; const id = stableSourceId(key);
    assertNoIdCollision(used, id, key, "reviewed model");
    return [r.year,r.makeId,id,modelNames.indexOf(r.model),r.vehicleTypeId];
  });
  return { metadata, makes: [...makeMap].map(([make_id,make_name]) => ({make_id,make_name})), modelNames,
    models: models.sort((a,b) => a[0]-b[0] || a[1]-b[1] || a[3]-b[3]),
    vehicleTypes: VEHICLE_TYPES.filter(t=>models.some(r=>r[4]===t.vehicle_type_id)) };
}
export function buildReviewedCatalogs(input: {
  records: ReviewedModel[];
  metadata: SourceCatalog["metadata"];
  catalogYearMetadata?: SourceCatalog["metadata"];
}): SourceCatalog[] {
  if (input.records.some(r => r.yearBasis !== undefined && !["model-year", "catalog-year"].includes(r.yearBasis))) {
    throw new Error("Invalid reviewed year basis");
  }
  const result: SourceCatalog[] = [];
  for (const basis of ["model-year", "catalog-year"] as const) {
    const records = input.records.filter(r => (r.yearBasis ?? "model-year") === basis);
    if (!records.length) continue;
    const metadata = basis === "model-year" ? input.metadata : input.catalogYearMetadata;
    if (!metadata || (basis === "catalog-year" && metadata.yearBasis !== basis)) throw new Error(`Missing metadata for ${basis}`);
    if (result.some(c => c.metadata.id === metadata.id)) throw new Error("Year bases must use distinct source IDs");
    result.push(buildReviewedCatalog(records, metadata));
  }
  return result;
}
if (require.main === module) {
  const file = process.argv[2]; if (!file) throw new Error("Usage: import-reviewed-models.ts <evidence.json>");
  const input = JSON.parse(fs.readFileSync(file,"utf8"));
  for (const catalog of buildReviewedCatalogs(input)) {
    writeSnapshot(`data/sources/${catalog.metadata.id}.json`,catalog,false);
    console.log(`Reviewed ${catalog.metadata.yearBasis ?? "model-year"} source: ${catalog.models.length} entries`);
  }
}
