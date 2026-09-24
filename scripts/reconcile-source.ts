import fs from "fs";
import { normalizeName, type SourceCatalog } from "./catalog-types";
/** Candidate queue, not automatic parent/specification matching. */
export function reconcileSource(source: SourceCatalog, reference: SourceCatalog) {
  const key = (s: SourceCatalog, row: number[]) => [row[0], normalizeName(s.makes.find(m=>m.make_id===row[1])!.make_name), normalizeName(s.modelNames[row[3]]),row[4]].join(":");
  const known=new Set(reference.models.map(r=>key(reference,r)));
  return source.models.filter(r=>!known.has(key(source,r))).map(r=>({year:r[0],make:source.makes.find(m=>m.make_id===r[1])!.make_name,model:source.modelNames[r[3]],vehicleTypeId:r[4],sourceId:source.metadata.id,status:"source-only-identity" as const}));
}
if(require.main===module){
  const source=JSON.parse(fs.readFileSync(process.argv[2]??"data/sources/fueleconomy-us.json","utf8"));
  const reference=JSON.parse(fs.readFileSync("data/sources/nhtsa.json","utf8"));
  const candidates=reconcileSource(source,reference);
  const out=process.argv[3]??".cache/fueleconomy-review.json";
  fs.mkdirSync(require("path").dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(candidates,null,2));
  console.log(`${candidates.length} source-only model/year/type identities; review queue: ${out}`);
}
