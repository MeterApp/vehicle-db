import { describe, expect, test } from "vitest";
import { createVehicleResolver, resolveVehicle } from "./resolve";
import { evaluateVisualCompatibility, type IdentityGraph, type VisualCompatibility } from "./identity";
import { validateIdentityGraph } from "../scripts/identity-types";
const evidence = [{ id:"ev", sourceId:"fixture", url:"https://example.com/fixture", retrievedAt:"2026-09-24", note:"Synthetic test fixture, not production vehicle evidence" }];
const catalog = { makes:[{make_id:1,make_name:"Example"}], modelNames:["Car","Car Sport"], sources:[{source_id:"fixture"}], models:[[2024,1,10,0,2,1],[2025,1,10,0,2,1],[2024,1,11,1,2,1]] };
function fixture(): IdentityGraph {
  const common = { makeId:1,vehicleTypeId:2,evidenceIds:["ev"] };
  return { schemaVersion:1,revision:"fixture",evidence,aliases:[],catalogLinks:[],homologation:[],visualCompatibility:[],identities:[
    {...common,id:"line",kind:"line",name:"Car",names:["Car"]},
    {...common,id:"old",kind:"generation",parentId:"line",name:"Old",names:[],years:[2024],yearBasis:"model-year"},
    {...common,id:"new",kind:"generation",parentId:"line",name:"New",names:[],years:[2024,2025],yearBasis:"model-year"},
    {...common,id:"old-sport",kind:"derivative",parentId:"old",name:"Sport",names:["Car Sport"]},
    {...common,id:"new-sport",kind:"derivative",parentId:"new",name:"Sport",names:["Car Sport"]},
    {...common,id:"v1",kind:"visual",parentId:"new-sport",name:"Original",names:[],years:[2024],yearBasis:"model-year"},
    {...common,id:"v2",kind:"visual",parentId:"new-sport",name:"Facelift",names:[],years:[2025],yearBasis:"model-year"},
  ] };
}
describe("strict vehicle resolution",()=>{
  test("does not reduce significant suffixes to base vehicles",()=>{
    for(const q of ["2026 Lamborghini Huracan STO","2024 Chevrolet Silverado EV Bogus","2024 Cadillac CT5 V Unknown"]){
      expect(resolveVehicle(q).status).not.toBe("MATCHED");
    }
  });
  test("scoped body derivatives and generations stay distinct",()=>{
    const coupe=resolveVehicle("2024 BMW 4 Series Coupe",{market:"US",depth:"visual"});
    const gran=resolveVehicle("2024 BMW 4 Series Gran Coupé",{market:"US",depth:"visual"});
    expect(coupe.status).toBe("MATCHED");expect(gran.status).toBe("MATCHED");
    expect(coupe.candidates[0].identityId).not.toBe(gran.candidates[0].identityId);
    const old=resolveVehicle("2014 BMW 4 Series Coupe",{market:"US",depth:"visual"});
    expect(old.status).toBe("MATCHED");
    expect(old.candidates[0].lineage.generation).not.toBe(coupe.candidates[0].lineage.generation);
    const facelift=resolveVehicle("2025 BMW 4 Series Coupe",{market:"US",depth:"visual"});
    expect(facelift.candidates[0].lineage.generation).toBe(coupe.candidates[0].lineage.generation);
    expect(facelift.candidates[0].identityId).not.toBe(coupe.candidates[0].identityId);
  });
  test("missing or incompatible context is not silently filled",()=>{
    expect(resolveVehicle("2024 BMW 4 Series Coupe").status).not.toBe("MATCHED");
    expect(resolveVehicle("2024 BMW 4 Series Coupe",{market:"SA"}).status).not.toBe("MATCHED");
    expect(resolveVehicle("2024 BMW 4 Series Coupe",{market:"US",yearBasis:"registration-year"}).status).not.toBe("MATCHED");
    expect(resolveVehicle("2024 BMW 4 Series Coupe",{market:"US",year:2025}).status).toBe("INVALID_INPUT");
  });
  test("overlapping generations are ambiguous; a later year can disambiguate",()=>{
    const resolve=createVehicleResolver(catalog,fixture());
    expect(resolve("2024 Example Car Sport",{depth:"derivative"}).status).toBe("AMBIGUOUS");
    expect(resolve("2025 Example Car Sport",{depth:"derivative"}).status).toBe("MATCHED");
    expect(resolve("2025 Example Car Sport",{depth:"visual"}).candidates[0].identityId).toBe("v2");
    expect(resolve("2026 Example Car Sport",{depth:"derivative"}).status).toBe("YEAR_UNVERIFIED");
    expect(resolve("2025 Example Car Sport NotKnown").unresolvedTokens).toEqual(["notknown"]);
  });
  test("flat exact records are not generation or visual evidence",()=>{
    expect(resolveVehicle("2024 Toyota Camry").status).toBe("MATCHED");
    expect(resolveVehicle("2024 Toyota Camry",{depth:"visual"}).status).toBe("GENERATION_UNRESOLVED");
    expect(resolveVehicle("2024 Toyota Camry",{sourceId:"nonexistent"}).status).toBe("SCOPE_UNVERIFIED");
    expect(resolveVehicle("2024 Toyota Camry SE MadeUp").status).not.toBe("MATCHED");
  });
});
const rule:VisualCompatibility={id:"r",requestedVisualIdentityId:"a",assetVisualIdentityId:"b",decision:"allow",years:[2024],markets:["US"],yearBasis:"model-year",evidenceIds:["ev"],rationale:"fixture",reviewedBy:"test",reviewedAt:"2026-09-24",revision:"1"};
test("asset compatibility is scoped, directional, non-transitive, and deny wins",()=>{
  const ctx={year:2024,market:"US",yearBasis:"model-year" as const};
  expect(evaluateVisualCompatibility([rule],"a","b",ctx)).toBe("allow");
  expect(evaluateVisualCompatibility([rule],"b","a",ctx)).toBe("unknown");
  expect(evaluateVisualCompatibility([rule],"a","b",{year:2024})).toBe("unknown");
  expect(evaluateVisualCompatibility([rule],"a","b",{...ctx,year:2025})).toBe("unknown");
  expect(evaluateVisualCompatibility([rule,{...rule,requestedVisualIdentityId:"b",assetVisualIdentityId:"c"}],"a","c",ctx)).toBe("unknown");
  expect(evaluateVisualCompatibility([rule,{...rule,decision:"deny"}],"a","b",ctx)).toBe("deny");
});
test("graph validation rejects broken parentage, missing evidence, collisions and contradictory rules",()=>{
  const g=fixture();expect(()=>validateIdentityGraph(g,catalog)).not.toThrow();
  const broken=fixture();broken.identities[2].parentId="old-sport";expect(()=>validateIdentityGraph(broken,catalog)).toThrow(/parent/);
  const missing=fixture();missing.evidence=[];expect(()=>validateIdentityGraph(missing,catalog)).toThrow(/evidence/);
  const duplicate=fixture();duplicate.identities.push(duplicate.identities[0]);expect(()=>validateIdentityGraph(duplicate,catalog)).toThrow(/duplicate/);
  const conflict=fixture();const r={...rule,requestedVisualIdentityId:"v1",assetVisualIdentityId:"v2"};conflict.visualCompatibility=[r,{...r,id:"r2",decision:"deny"}];expect(()=>validateIdentityGraph(conflict,catalog)).toThrow(/contradictory/);
});
test("reviewed aliases resolve a line without inventing generation or render equivalence",()=>{
  const macan=resolveVehicle("2024 Porsche maccane");
  expect(macan.status).toBe("MATCHED");expect(macan.candidates[0].depth).toBe("line");
  expect(resolveVehicle("2024 Porsche maccane",{depth:"visual"}).status).toBe("GENERATION_UNRESOLVED");
  expect(resolveVehicle("2024 Toyota Prado").status).toBe("MATCHED");
  expect(resolveVehicle("2024 Toyota Prado EV").status).not.toBe("MATCHED");
});
