/** Small source-backed additions, with evidence kept outside compact runtime data. */
import fs from "fs";
import { stableSourceId, assertNoIdCollision, writeSnapshot, type SourceCatalog } from "./catalog-types";
interface ReviewedModel { year: number; makeId: number; make: string; model: string; vehicleTypeId: number; market: string; url: string; note: string }
export function buildReviewedCatalog(records: ReviewedModel[], metadata: SourceCatalog["metadata"]): SourceCatalog {
  const makeMap = new Map<number, string>(), used = new Map<number,string>();
  const modelNames = [...new Set(records.map(r => r.model))].sort();
  const models: SourceCatalog["models"] = records.map(r => {
    if (!Number.isInteger(r.year) || r.year < 1990 || !/^https:\/\//.test(r.url) || !r.note || !/^[A-Z]{2}$/.test(r.market)) throw new Error("Invalid reviewed model evidence");
    if (makeMap.has(r.makeId) && makeMap.get(r.makeId) !== r.make) throw new Error("Conflicting make ID");
    makeMap.set(r.makeId, r.make);
    const key = `${metadata.id}:model:${r.make}:${r.model}`; const id = stableSourceId(key);
    assertNoIdCollision(used, id, key, "reviewed model");
    return [r.year,r.makeId,id,modelNames.indexOf(r.model),r.vehicleTypeId];
  });
  return { metadata, makes: [...makeMap].map(([make_id,make_name]) => ({make_id,make_name})), modelNames,
    models: models.sort((a,b) => a[0]-b[0] || a[1]-b[1] || a[3]-b[3]),
    vehicleTypes: [{vehicle_type_id:2,vehicle_type_name:"Passenger Car"},{vehicle_type_id:3,vehicle_type_name:"Truck"},{vehicle_type_id:7,vehicle_type_name:"Multipurpose Passenger Vehicle (MPV)"}].filter(t=>models.some(r=>r[4]===t.vehicle_type_id)) };
}
if (require.main === module) {
  const file = process.argv[2]; if (!file) throw new Error("Usage: import-reviewed-models.ts <evidence.json>");
  const input = JSON.parse(fs.readFileSync(file,"utf8"));
  const catalog = buildReviewedCatalog(input.records,input.metadata);
  writeSnapshot(`data/sources/${catalog.metadata.id}.json`,catalog,false);
  console.log(`Reviewed source: ${catalog.models.length} entries`);
}
