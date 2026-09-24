/** Private cohorts stay outside the repository; reports contain no account identifiers. */
import fs from "fs";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { resolveVehicle, type ResolveVehicleOptions, type VehicleResolutionStatus } from "../src/resolve";
import { searchVehicles } from "../src/search";
interface ReplayCase { query?: string; make?: string; model?: string; year?: number; n?: number; cohort: "customer" | "synthetic" | "haraj-sweep"; options?: ResolveVehicleOptions; expectedStatus?: VehicleResolutionStatus; forbiddenModelNames?: string[] }
export function replay(cases: ReplayCase[]) {
  return cases.map(row => {
    if (!["customer","synthetic","haraj-sweep"].includes(row.cohort) || (row.n !== undefined && (!Number.isInteger(row.n) || row.n < 1))) throw new Error("Invalid replay cohort/count");
    const query = row.query ?? [row.year,row.make,row.model].filter(x=>x!==undefined).join(" ");
    const resolved = resolveVehicle(query,row.options);
    const candidates = searchVehicles(query,{year:row.options?.year ?? row.year,sourceId:row.options?.sourceId,vehicleTypeId:row.options?.vehicleTypeId,limit:5});
    const forbidden = resolved.status === "MATCHED" && resolved.selection.catalogSelections.some(s => row.forbiddenModelNames?.some(n=>n.toUpperCase()===s.modelName.toUpperCase()));
    return { query, cohort:row.cohort, requests:row.n??1, demandWeight:row.cohort==="customer" ? row.n??1 : 0,
      status:resolved.status, resolution:resolved, autocompleteCandidates:candidates,
      reviewed:row.expectedStatus!==undefined, passed:(!row.expectedStatus || row.expectedStatus===resolved.status) && !forbidden };
  });
}
if (require.main === module) {
  const input=process.argv[2]??"scripts/fixtures/resolution-replay.json", output=process.argv[3];
  const text=fs.readFileSync(input,"utf8"), rows=replay(JSON.parse(text));
  const cohorts:Record<string,{identities:number;requests:number;matchedRequests:number;reviewed:number;failures:number}>={};
  for(const row of rows){const c=cohorts[row.cohort]??={identities:0,requests:0,matchedRequests:0,reviewed:0,failures:0};c.identities++;c.requests+=row.requests;if(row.status==="MATCHED")c.matchedRequests+=row.requests;if(row.reviewed)c.reviewed++;if(!row.passed)c.failures++;}
  const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
  const report={packageVersion:JSON.parse(fs.readFileSync("package.json","utf8")).version,commit:execFileSync("git",["rev-parse","HEAD"]).toString().trim(),catalogHash:hash(fs.readFileSync("data/compact.json","utf8")),resolverHash:hash(fs.readFileSync("src/resolve.ts","utf8")),fixtureHash:hash(text),runAt:new Date().toISOString(),cohorts,renderCorrectness:"not measured",rows};
  if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,rows:undefined},null,2));
  if(rows.some(r=>!r.passed))process.exitCode=1;
}
