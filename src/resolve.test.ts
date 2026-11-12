import { describe, expect, test } from "vitest";
import { createVehicleResolver, resolveVehicle } from "./resolve";
import { evaluateVisualCompatibility, type IdentityGraph, type VisualCompatibility } from "./identity";
import { validateIdentityGraph } from "../scripts/identity-types";
import graphData from "./identity-data";
import catalogData from "./data";
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

test("the maker's 'GLC with EQ Technology' name selects the electric X540 line per year, never the X254 GLC",()=>{
  for (const [year, line, model] of [
    [2026, "mercedes-benz:glc-400-4matic-with-eq-te", "GLC 400 4MATIC WITH EQ TE"],
    [2027, "mercedes-benz:glc400-4matic-electric", "GLC400 4matic electric"],
  ] as const) {
    const result = resolveVehicle(`${year} Mercedes-Benz GLC with EQ Technology`);
    expect(result.status).toBe("MATCHED");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].identityId).toBe(line);
    expect(result.candidates[0].catalogSelections.map(s => [s.year, s.modelName.toLowerCase()])).toEqual([[year, model.toLowerCase()]]);
  }
  expect(resolveVehicle("2025 Mercedes-Benz GLC with EQ Technology").status).not.toBe("MATCHED");
  expect(resolveVehicle("Mercedes-Benz GLC with EQ Technology").status).not.toBe("MATCHED");
  expect(resolveVehicle("2026 Mercedes-Benz GLC with EQ Technology", { yearBasis: "catalog-year" }).status).not.toBe("MATCHED");
  const combustion = resolveVehicle("2026 Mercedes-Benz GLC");
  expect(combustion.candidates[0]?.identityId).toBe("mercedes-benz:glc");
});

test("reviewed regional additions preserve generation, body and performance boundaries", () => {
  const octa = resolveVehicle("2025 Land Rover Defender OCTA", { market: "US", depth: "visual" });
  const modern = resolveVehicle("2023 Land Rover Defender 130", { market: "US", depth: "visual" });
  const sv = resolveVehicle("2024 Land Rover Range Rover Sport SV", { market: "US", depth: "visual" });
  const electric = resolveVehicle("2026 Porsche Cayenne Electric", { market: "US", depth: "visual" });
  for (const result of [octa, modern, sv, electric]) expect(result.status).toBe("MATCHED");
  expect(octa.candidates[0].lineage.derivative).not.toBe(modern.candidates[0].lineage.derivative);
  expect(modern.candidates[0].lineage.generation).toBe("lr:defender:l663");
  expect(electric.candidates[0].lineage.derivative).toContain("distinct");
  for (const [query, market] of [
    ["2023 Land Rover Defender OCTA", "US"],
    ["2005 Land Rover Defender 130", "US"],
    ["2023 Land Rover Defender 130", "GB"],
    ["2024 Land Rover Range Rover Sport SVR SV", "US"],
    ["2025 Porsche Cayenne Electric", "US"],
    ["2026 Porsche Cayenne Electric PHEV", "US"],
    ["2025 LYNK&CO 03", "VN"],
    ["2024 Hyundai Custin Unknown Trim", "VN"],
  ]) expect(resolveVehicle(query, { market, depth: "visual" }).status).not.toBe("MATCHED");
  expect(resolveVehicle("2025 Land Rover Defender OCTA", { market: "IN", depth: "visual" }).status).not.toBe("MATCHED");
  expect(resolveVehicle("2024 BMW 5 Series G60", { market: "US", depth: "visual" }).status).toBe("MATCHED");
  expect(resolveVehicle("2023 BMW 5 Series G60", { market: "US", depth: "visual" }).status).not.toBe("MATCHED");
  expect(evaluateVisualCompatibility([], octa.candidates[0].visualIdentityIds[0], modern.candidates[0].visualIdentityIds[0], { year: 2025, market: "US", yearBasis: "model-year" })).toBe("unknown");
});

test("dated marketed catalogs require catalog-year context and do not infer generation or model year", () => {
  const context = { market: "VN", yearBasis: "catalog-year" as const };
  expect(resolveVehicle("2025 LYNK&CO 03+", context).status).toBe("MATCHED");
  expect(resolveVehicle("2025 LYNK&CO 03", context).status).not.toBe("MATCHED");
  expect(resolveVehicle("2026 LYNK&CO 03", context).status).toBe("MATCHED");
  expect(resolveVehicle("2025 LYNK&CO 03+").status).not.toBe("MATCHED");
  expect(resolveVehicle("2025 LYNK&CO 03+", { ...context, depth: "visual" }).status).toBe("GENERATION_UNRESOLVED");
  expect(resolveVehicle("2025 Volkswagen Teramont X", context).status).toBe("MATCHED");
  expect(resolveVehicle("2024 Volkswagen Teramont X", context).status).not.toBe("MATCHED");
  expect(resolveVehicle("2025 Volkswagen Teramont X", { ...context, market: "US" }).status).not.toBe("MATCHED");
});

test("manufacturer-dated generations resolve Audi, Skoda, Renault and Peugeot catalog years without guessing", () => {
  const context = { market: "GB", yearBasis: "catalog-year" as const, depth: "generation" as const };
  // The 2026 Audi Q3, A5 and Q5 and the 2025 Skoda Kodiaq are their new generations, not the ones a year alone suggests.
  expect(resolveVehicle("2026 Audi Q3", context)).toMatchObject({ status: "MATCHED", selection: { identityId: "audi:q3:third" } });
  expect(resolveVehicle("2026 Audi A5", context)).toMatchObject({ status: "MATCHED", selection: { identityId: "audi:a5:third" } });
  expect(resolveVehicle("2026 Audi Q5", context)).toMatchObject({ status: "MATCHED", selection: { identityId: "audi:q5:third" } });
  expect(resolveVehicle("2025 Skoda Kodiaq", context)).toMatchObject({ status: "MATCHED", selection: { identityId: "skoda:kodiaq:second" } });
  expect(resolveVehicle("2026 Peugeot 2008", context)).toMatchObject({ status: "MATCHED", selection: { identityId: "peugeot:2008:second" } });
  // A changeover year sold both generations and stays ambiguous.
  const changeover = resolveVehicle("2025 Audi Q3", context);
  expect(changeover.status).toBe("AMBIGUOUS");
  expect(changeover.candidates.map(c => c.identityId).sort()).toEqual(["audi:q3:second", "audi:q3:third"]);
  // A year before the dated generations is not assigned one.
  expect(resolveVehicle("2016 Skoda Kodiaq", context).status).toBe("GENERATION_UNRESOLVED");
  // Facelifts are appearance revisions under the generation; the years that sold both fronts stay ambiguous.
  const visual = { ...context, depth: "visual" as const };
  expect(resolveVehicle("2020 Audi A5", visual)).toMatchObject({ status: "MATCHED", selection: { identityId: "audi:a5:second:facelift-2020", lineage: { generation: "audi:a5:second", line: "audi:a5" } } });
  expect(resolveVehicle("2018 Audi A5", visual)).toMatchObject({ status: "MATCHED", selection: { identityId: "audi:a5:second:original" } });
  expect(resolveVehicle("2012 Audi A5", visual).status).toBe("AMBIGUOUS");
  // The scope is the catalog year in the evidenced markets; model-year context does not satisfy it.
  expect(resolveVehicle("2026 Audi Q3", { ...context, yearBasis: "model-year" }).status).toBe("GENERATION_UNRESOLVED");
  expect(resolveVehicle("2026 Audi Q3", { ...context, market: "SA" }).status).toBe("GENERATION_UNRESOLVED");
  // Catalog depth keeps matching the line's rows, as the flat records did before.
  expect(resolveVehicle("2024 Audi A5").status).toBe("MATCHED");
  expect(resolveVehicle("2005 Audi A4").status).toBe("MATCHED");
});

test("graph validation accepts a facelift visual directly under its generation", () => {
  const g = fixture();
  g.identities.push({ ...g.identities[1], id: "new-facelift", kind: "visual", parentId: "new", name: "New facelift", names: [], appearanceRevision: "facelift", years: [2025] });
  expect(() => validateIdentityGraph(g, catalog)).not.toThrow();
  const line = fixture();
  line.identities.push({ ...line.identities[1], id: "line-visual", kind: "visual", parentId: "line", name: "Line visual", names: [], years: undefined, yearBasis: undefined });
  expect(() => validateIdentityGraph(line, catalog)).toThrow(/parent/);
});

test("the EV list's generations and facelifts resolve by catalog year (car-image-server #1173)", () => {
  const context = { market: "GB", yearBasis: "catalog-year" as const, depth: "generation" as const };
  const visual = { ...context, depth: "visual" as const };
  // The new electric CLA is its own generation; the Model S fronts are appearance revisions.
  expect(resolveVehicle("2026 Mercedes-Benz CLA", context)).toMatchObject({ status: "MATCHED", selection: { identityId: "mercedes-benz:cla:third" } });
  expect(resolveVehicle("2019 Tesla Model S", visual)).toMatchObject({ status: "MATCHED", selection: { identityId: "tesla:model-s:first:facelift-2017" } });
  expect(resolveVehicle("2023 Tesla Model S", visual)).toMatchObject({ status: "MATCHED", selection: { identityId: "tesla:model-s:first:facelift-2021" } });
  expect(resolveVehicle("2026 Tesla Model Y", visual)).toMatchObject({ status: "MATCHED", selection: { identityId: "tesla:model-y:first:facelift-2026" } });
  expect(resolveVehicle("2024 Hyundai IONIQ 5", visual)).toMatchObject({ status: "MATCHED", selection: { identityId: "hyundai:ioniq-5:first:original" } });
  // Years that sold both fronts stay ambiguous.
  expect(resolveVehicle("2016 Tesla Model S", visual).status).toBe("AMBIGUOUS");
  expect(resolveVehicle("2025 Tesla Model Y", visual).status).toBe("AMBIGUOUS");
  // The plain Macan line mixes the combustion and electric cars in 2024; the electric car has its own line.
  expect(resolveVehicle("2024 Porsche Macan", context).status).toBe("GENERATION_UNRESOLVED");
  expect(resolveVehicle("2025 Porsche Macan Electric", context)).toMatchObject({ status: "MATCHED", selection: { identityId: "porsche:macan-electric:first" } });
});

describe("market-scoped appearances of the Australian pickups", () => {
  const au = { market: "AU", yearBasis: "catalog-year" as const, depth: "visual" as const };
  const ids = (query: string, options: Parameters<typeof resolveVehicle>[1]) => resolveVehicle(query, options).candidates.map(c => c.identityId).sort();
  test("each family resolves in Australia to the appearance of its year", () => {
    expect(resolveVehicle("2013 Ford Ranger", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "ford:ranger:px:original", lineage: { generation: "ford:ranger:px", line: "ford:ranger" } } });
    expect(resolveVehicle("2019 Ford Ranger", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "ford:ranger:px:facelift-2015" } });
    expect(resolveVehicle("2024 Ford Ranger", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "ford:ranger:next-gen:original" } });
    expect(resolveVehicle("2023 Ford Ranger Next Gen", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "ford:ranger:next-gen:original" } });
    expect(resolveVehicle("2008 Toyota HiLux", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "toyota:hilux:seventh:pre-2011" } });
    expect(resolveVehicle("2013 Toyota HiLux", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "toyota:hilux:seventh:facelift-2011" } });
    expect(resolveVehicle("2017 Toyota HiLux", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "toyota:hilux:eighth:original" } });
    expect(resolveVehicle("2022 Toyota HiLux", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "toyota:hilux:eighth:facelift-2020" } });
    expect(resolveVehicle("2026 Toyota HiLux", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "toyota:hilux:ninth:original" } });
    expect(resolveVehicle("2018 Nissan Navara", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "nissan:navara:d23:original" } });
    expect(resolveVehicle("2023 Nissan Navara", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "nissan:navara:d23:facelift-2021" } });
    expect(resolveVehicle("2016 Nissan NP300 Navara", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "nissan:navara:d23:original" } });
    expect(resolveVehicle("2008 Toyota LandCruiser 70", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "toyota:landcruiser-70:2007:original" } });
    expect(resolveVehicle("2012 Toyota LandCruiser 70", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "toyota:landcruiser-70:2007:facelift-2009" } });
    expect(resolveVehicle("2025 Toyota LandCruiser 70", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "toyota:landcruiser-70:2007:facelift-2023" } });
    // A deeper link answers a shallower request with its ancestor.
    expect(resolveVehicle("2018 Toyota LandCruiser 70", { ...au, depth: "generation" })).toMatchObject({ status: "MATCHED", selection: { identityId: "toyota:landcruiser-70:2007", catalogSelections: [{ modelName: "LandCruiser 70", year: 2018 }] } });
  });
  test("a changeover year keeps both shapes and neither wins", () => {
    expect(resolveVehicle("2022 Ford Ranger", au).status).toBe("AMBIGUOUS");
    expect(ids("2022 Ford Ranger", au)).toEqual(["ford:ranger:next-gen:original", "ford:ranger:px:facelift-2015"]);
    expect(ids("2015 Toyota HiLux", au)).toEqual(["toyota:hilux:eighth:original", "toyota:hilux:seventh:facelift-2011"]);
    expect(ids("2015 Toyota HiLux", { ...au, depth: "generation" })).toEqual(["toyota:hilux:eighth", "toyota:hilux:seventh"]);
    expect(ids("2021 Nissan Navara", au)).toEqual(["nissan:navara:d23:facelift-2021", "nissan:navara:d23:original"]);
    // The D22 was sold beside the D40 for ten years: the plain name stays ambiguous, the Australian names decide.
    expect(resolveVehicle("2012 Nissan Navara", au).status).toBe("AMBIGUOUS");
    expect(ids("2012 Nissan Navara", au)).toEqual(["nissan:navara:d22:documented", "nissan:navara:d40:documented"]);
    expect(resolveVehicle("2012 Nissan Navara D22", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "nissan:navara:d22:documented", catalogSelections: [{ modelName: "Navara D22" }] } });
    expect(resolveVehicle("2012 Nissan Navara D40", au)).toMatchObject({ status: "MATCHED", selection: { identityId: "nissan:navara:d40:documented", catalogSelections: [{ modelName: "Navara D40" }] } });
    // The 2016 single cab-chassis body and the 2023 front overlap the 2009 front.
    expect(ids("2023 Toyota LandCruiser 70", au)).toEqual(["toyota:landcruiser-70:2007:facelift-2009", "toyota:landcruiser-70:2007:facelift-2023", "toyota:landcruiser-70:2007:single-cab-2016"]);
  });
  test("the same name and year is another truck in another market", () => {
    const us = resolveVehicle("2021 Ford Ranger", { market: "US", depth: "visual" });
    const australia = resolveVehicle("2021 Ford Ranger", au);
    expect(us).toMatchObject({ status: "MATCHED", selection: { identityId: "ford:ranger:north-america-2019:original" } });
    expect(australia).toMatchObject({ status: "MATCHED", selection: { identityId: "ford:ranger:px:facelift-2015" } });
    const context = { year: 2021, market: "AU", yearBasis: "catalog-year" as const };
    const rules = graphData.visualCompatibility;
    expect(evaluateVisualCompatibility(rules, "ford:ranger:px:facelift-2015", "ford:ranger:north-america-2019:original", context)).toBe("deny");
    expect(evaluateVisualCompatibility(rules, "ford:ranger:north-america-2019:original", "ford:ranger:px:facelift-2015", context)).toBe("deny");
    expect(evaluateVisualCompatibility(rules, "nissan:navara:d22:documented", "nissan:navara:d40:documented", context)).toBe("deny");
    expect(evaluateVisualCompatibility(rules, "ford:ranger:px:facelift-2015", "ford:ranger:next-gen:original", context)).toBe("deny");
    // No rule, no permission: an undocumented pair stays unknown.
    expect(evaluateVisualCompatibility(rules, "ford:ranger:px:original", "ford:ranger:px:facelift-2015", context)).toBe("unknown");
    // Years and markets without evidence are not assigned an appearance.
    expect(resolveVehicle("2024 Ford Ranger", { market: "US", depth: "visual" }).status).toBe("SCOPE_UNVERIFIED");
    expect(resolveVehicle("2011 Ford Ranger", au).status).toBe("SCOPE_UNVERIFIED");
    expect(resolveVehicle("2004 Toyota HiLux", au).status).toBe("SCOPE_UNVERIFIED");
    expect(resolveVehicle("2019 Ford Ranger", { ...au, market: "NZ" }).status).toBe("SCOPE_UNVERIFIED");
    expect(resolveVehicle("2016 Nissan NP300 Navara", { ...au, market: "GB" }).status).toBe("SCOPE_UNVERIFIED");
    // Australian sources date sales, not model years: model-year context does not satisfy them.
    expect(resolveVehicle("2019 Ford Ranger", { market: "AU", depth: "visual" }).status).toBe("SCOPE_UNVERIFIED");
  });
  test("resolution without a market is what it was before the batch", () => {
    for (const query of ["2019 Ford Ranger", "2015 Toyota HiLux", "2012 Nissan Navara", "Ford Ranger"]) {
      const flat = resolveVehicle(query);
      expect(flat.status).toBe("AMBIGUOUS");
      expect(flat.candidates.every(c => c.identityId === undefined && c.depth === "catalog" && !c.visualIdentityIds.length)).toBe(true);
      expect(resolveVehicle(query, { depth: "visual" }).status).toBe("GENERATION_UNRESOLVED");
    }
    for (const query of ["2019 Ford Ranger", "2015 Toyota HiLux", "2012 Nissan Navara", "2012 Nissan Navara D40", "2023 Ford Ranger Next Gen", "2018 Toyota LandCruiser 70"]) {
      const typed = resolveVehicle(query, { vehicleTypeId: 3 });
      expect(typed).toMatchObject({ status: "MATCHED", selection: { depth: "catalog", lineage: {}, visualIdentityIds: [], evidenceIds: [] } });
      expect(typed.status === "MATCHED" && typed.selection.identityId).toBeUndefined();
    }
  });
});

describe("the market of reviewed manufacturer rows", () => {
  test("a reviewed row matches in the market it was reviewed for and nowhere else", () => {
    expect(resolveVehicle("2012 Nissan Navara D40", { market: "AU" })).toMatchObject({ status: "MATCHED", selection: { depth: "catalog", catalogSelections: [{ modelName: "Navara D40", year: 2012, sourceIds: ["manufacturer-reviewed-catalog"] }] } });
    expect(resolveVehicle("2012 Nissan Navara D40", { market: "US" }).status).toBe("SCOPE_UNVERIFIED");
    expect(resolveVehicle("2019 Hyundai i30 Tourer", { market: "GB" }).status).toBe("MATCHED");
    expect(resolveVehicle("2019 Hyundai i30 Tourer", { market: "FR" }).status).toBe("SCOPE_UNVERIFIED");
    expect(resolveVehicle("2019 Hyundai i30 Tourer", { market: "GB", depth: "visual" }).status).toBe("GENERATION_UNRESOLVED");
    expect(resolveVehicle("2024 Hyundai i30 Tourer", { market: "GB" }).status).toBe("YEAR_UNVERIFIED");
    // Without a year, every year reviewed for the market answers.
    const years = resolveVehicle("Toyota LandCruiser 70", { market: "AU" });
    expect(years.status === "MATCHED" && years.selection.catalogSelections.length).toBe(20);
    // A row from a register alone stays unverified for any market.
    expect(resolveVehicle("2024 Toyota Camry", { market: "US" }).status).toBe("SCOPE_UNVERIFIED");
    // Without a market nothing changes.
    expect(resolveVehicle("2012 Nissan Navara D40")).toMatchObject({ status: "MATCHED", selection: { depth: "catalog", visualIdentityIds: [] } });
  });
  test("the bundle carries one sorted market set per reviewed row", () => {
    const { sets, rows } = catalogData.reviewedMarkets;
    expect(rows.length % 2).toBe(0);
    expect(rows.length / 2).toBeGreaterThan(400);
    const reviewedSources = ["manufacturer-reviewed", "manufacturer-reviewed-catalog"].map(id => 2 ** catalogData.sources.findIndex(s => s.source_id === id));
    for (let i = 0; i < rows.length; i += 2) {
      const row = catalogData.models[rows[i]], set = sets[rows[i + 1]];
      expect(reviewedSources.some(bit => (row[5] & bit) !== 0)).toBe(true);
      expect(set.length).toBeGreaterThan(0);
      expect(set.every(market => /^[A-Z]{2}$/.test(market))).toBe(true);
      expect([...set].sort()).toEqual(set);
      if (i) expect(rows[i]).toBeGreaterThan(rows[i - 2]);
    }
    expect(JSON.stringify(catalogData.reviewedMarkets).length).toBeLessThan(8192);
  });
  test("an isolated resolver reads the mask, a linked scoped identity and neither", () => {
    const graph = fixture();
    const common = { makeId: 1, vehicleTypeId: 2, evidenceIds: ["ev"], names: [] };
    graph.identities.push({ ...common, id: "au", kind: "generation", parentId: "line", name: "Sold in AU", markets: ["AU"] },
      { ...common, id: "sport-au", kind: "visual", parentId: "au", name: "Sport in AU", years: [2024], yearBasis: "catalog-year" });
    graph.identities = graph.identities.map(n => ({ ...n, names: [] }));
    graph.catalogLinks.push({ identityId: "sport-au", year: 2024, makeId: 1, modelId: 11, vehicleTypeId: 2, evidenceIds: ["ev"] });
    const masked = createVehicleResolver({ ...catalog, reviewedMarkets: { sets: [["NZ"]], rows: [1, 0] } }, graph);
    expect(masked("2025 Example Car", { market: "NZ" })).toMatchObject({ status: "MATCHED", selection: { catalogSelections: [{ year: 2025, modelId: 10 }] } });
    expect(masked("2024 Example Car", { market: "NZ" }).status).toBe("SCOPE_UNVERIFIED");
    expect(masked("Example Car", { market: "NZ" })).toMatchObject({ status: "MATCHED", selection: { catalogSelections: [{ year: 2025 }] } });
    expect(masked("2024 Example Car Sport", { market: "AU", yearBasis: "catalog-year", depth: "visual" })).toMatchObject({ status: "MATCHED", selection: { identityId: "sport-au", catalogSelections: [{ modelId: 11 }] } });
    expect(masked("2024 Example Car Sport", { market: "AU", yearBasis: "catalog-year" })).toMatchObject({ status: "MATCHED", selection: { depth: "catalog", visualIdentityIds: ["sport-au"], evidenceIds: ["ev"] } });
    expect(masked("2024 Example Car Sport", { market: "AU" }).status).toBe("SCOPE_UNVERIFIED");
    expect(masked("2024 Example Car Sport", { market: "NZ", yearBasis: "catalog-year" }).status).toBe("SCOPE_UNVERIFIED");
    // A catalog without a mask behaves as before.
    const plain = createVehicleResolver(catalog, graph);
    expect(plain("2025 Example Car", { market: "NZ" }).status).toBe("SCOPE_UNVERIFIED");
    expect(plain("2025 Example Car").status).toBe("MATCHED");
  });
});
