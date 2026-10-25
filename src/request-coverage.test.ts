import { expect, test } from "vitest";
import { resolveVehicle } from "./resolve";
import { searchVehicles } from "./search";
import graph from "./identity-data";
import { evaluateVisualCompatibility } from "./identity";

const india = { market: "IN", yearBasis: "catalog-year" as const };
test("reviewed brand names keep catalog IDs and require their market in the resolver", () => {
  const canonical = resolveVehicle("2025 Hero Splendor Plus", india);
  const expanded = resolveVehicle("2025 Hero MotoCorp Splendor Plus", india);
  expect(expanded.status).toBe("MATCHED");
  expect(expanded).toEqual(canonical);
  expect(resolveVehicle("2025 Hero MotoCorp Splendor Plus", { ...india, market: "VN" }).status).not.toBe("MATCHED");
  const short = searchVehicles("2025 maruti ciaz", { fuzzy: false }).find(r => r.kind === "model");
  const long = searchVehicles("2025 maruti suzuki ciaz", { fuzzy: false }).find(r => r.kind === "model");
  expect(long).toMatchObject({ makeId: 3233934283, modelName: "Ciaz", matchKind: "exact" });
  expect(long).toEqual(short);
  expect(resolveVehicle("2025 Maruti Suzuki Ciaz", india).status).toBe("MATCHED");
});

test("category labels and unknown suffixes are never discarded to find a nearby vehicle", () => {
  for (const query of ["2025 Honda Scooters Activa 125", "2025 Honda Motorcycles CB350", "2025 Tata Commercial Ace"]) {
    expect(resolveVehicle(query, india).status).not.toBe("MATCHED");
  }
  for (const query of ["2025 TVS Jupiter", "2025 Honda Shine", "2025 Hero Xpulse 200", "2026 Yamaha RayZR", "2026 Ashok Leyland Partner", "2025 Ashok Leyland AVTR"]) {
    expect(resolveVehicle(query, india).status).not.toBe("MATCHED");
  }
  expect(resolveVehicle("2025 Honda Activa 125", india).status).toBe("MATCHED");
  expect(resolveVehicle("2025 TVS Jupiter 125", india).status).toBe("MATCHED");
  expect(resolveVehicle("2026 Ashok Leyland Partner 6 Tyre", india).status).toBe("MATCHED");
});

test("a dated catalog or family record never becomes a model-year or visual match", () => {
  expect(resolveVehicle("2025 Honda Amaze", { ...india, depth: "generation" }).status).toBe("AMBIGUOUS");
  expect(resolveVehicle("2025 Honda Amaze 3rd Generation", { ...india, depth: "generation" }).status).toBe("MATCHED");
  for (const query of ["2026 Ather 450X", "2025 Tata Nexon", "2025 TVS Apache RR 310", "2026 Eicher Pro 6042"]) {
    expect(resolveVehicle(query, { ...india, yearBasis: "model-year" }).status).not.toBe("MATCHED");
    expect(resolveVehicle(query, { ...india, depth: "visual" }).status).not.toBe("MATCHED");
  }
  expect(resolveVehicle("2026 Tata Nexon.ev", india).status).toBe("MATCHED");
  expect(resolveVehicle("2025 Honda SP 125", { market: "IN", depth: "visual" }).status).toBe("GENERATION_UNRESOLVED");
  expect(resolveVehicle("2028 Bentley Torcal", { market: "US" }).status).not.toBe("MATCHED");
  expect(resolveVehicle("2026 Bentley Torcal", { market: "US", yearBasis: "catalog-year" }).status).toBe("MATCHED");
  expect(resolveVehicle("2026 Bentley Torcal S", { market: "US", yearBasis: "catalog-year" }).status).not.toBe("MATCHED");
});

test("F Sport and Peak editions retain distinct market, year, specification and exterior identities", () => {
  const usa = resolveVehicle("2022 Lexus LX 600 F Sport", { market: "US", depth: "visual" });
  const vn = resolveVehicle("2026 Lexus LX 600 F Sport", { market: "VN", yearBasis: "catalog-year", depth: "visual" });
  const peak = resolveVehicle("2019 Lexus LX 570 Peak Edition", { market: "CN", depth: "visual" });
  for (const r of [usa, vn, peak]) {
    expect(r.status).toBe("MATCHED");
    if (r.status === "MATCHED") {
      expect(r.selection.lineage.specification).toBeDefined();
      expect(r.selection.catalogSelections).toHaveLength(1);
      expect(r.selection.visualIdentityIds).toHaveLength(1);
    }
  }
  expect(resolveVehicle("2022 Lexus LX 600 F Sport", { market: "VN", depth: "visual" }).status).not.toBe("MATCHED");
  expect(resolveVehicle("2019 Lexus LX 570 Peak Edition", { market: "VN", depth: "visual" }).status).not.toBe("MATCHED");
  expect(resolveVehicle("2021 Lexus LX 570 Peak Edition", { market: "CN", depth: "visual" }).status).toBe("YEAR_UNVERIFIED");
  expect(resolveVehicle("Lexus LX 600 F Sport", { market: "VN", depth: "visual" }).status).not.toBe("MATCHED");
  if (usa.status === "MATCHED" && vn.status === "MATCHED") {
    expect(usa.selection.visualIdentityIds).not.toEqual(vn.selection.visualIdentityIds);
    expect(evaluateVisualCompatibility(graph.visualCompatibility, usa.selection.visualIdentityIds[0], vn.selection.visualIdentityIds[0], { year: 2026, market: "VN", yearBasis: "catalog-year" })).toBe("unknown");
  }
});

test("G60 exact generation phrase links the existing sedan ID without substituting another generation", () => {
  const r = resolveVehicle("2024 BMW 5 Series G60", { market: "US" });
  expect(r.status).toBe("MATCHED");
  if (r.status === "MATCHED") {
    expect(r.selection.lineage.generation).toBe("bmw:5:g60");
    expect(r.selection.catalogSelections.map(s => s.modelId)).toEqual([1241822597]);
  }
  expect(resolveVehicle("2023 BMW 5 Series G60", { market: "US" }).status).toBe("YEAR_UNVERIFIED");
  expect(resolveVehicle("2024 BMW 5 Series G30", { market: "US" }).status).not.toBe("MATCHED");
  expect(resolveVehicle("2022 Honda Accord 260 Turbo", { market: "VN", depth: "visual" }).status).not.toBe("MATCHED");
});

test("UK estate derivatives are distinct models and never replace the parent nameplate", () => {
  const exact = (query: string) => searchVehicles(query, { fuzzy: false }).find(r => r.kind === "model");
  expect(exact("2008 BMW 3 Series Touring")).toMatchObject({ makeName: "BMW", modelName: "3 SERIES TOURING", matchKind: "exact" });
  expect(exact("2006 BMW 5 Series Touring")).toMatchObject({ makeName: "BMW", modelName: "5 SERIES TOURING", matchKind: "exact" });
  expect(exact("2009 Kia Ceed SW")).toMatchObject({ makeName: "KIA", modelName: "CEED SW", matchKind: "exact" });
  expect(exact("2003 Rover 75 Tourer")).toMatchObject({ makeName: "ROVER", modelName: "75 TOURER", matchKind: "exact" });
  expect(exact("2004 Peugeot 206 SW")).toMatchObject({ makeName: "PEUGEOT", modelName: "206 SW", matchKind: "exact" });
  expect(exact("2020 Peugeot 308 SW")).toMatchObject({ makeName: "PEUGEOT", modelName: "308 SW", matchKind: "exact" });
  expect(exact("2022 Peugeot 508 SW")).toMatchObject({ makeName: "PEUGEOT", modelName: "508 SW", matchKind: "exact" });
  expect(exact("2008 BMW 3 Series")?.modelName).toBe("3 SERIES");
  expect(exact("2020 Peugeot 308")?.modelName).toBe("308");
  expect(exact("2022 Peugeot 508")?.modelName).toBe("508");
  expect(exact("2011 Kia Ceed")?.modelName).not.toBe("CEED SW");
});

test("U.S. EPA estate derivatives are distinct models and never replace the parent nameplate", () => {
  const exact = (query: string) => searchVehicles(query, { fuzzy: false }).find(r => r.kind === "model");
  const cases: [string, string, string][] = [
    ["2012 Cadillac CTS Wagon", "CADILLAC", "CTS Wagon"],
    ["2004 Ford Focus Station Wagon", "FORD", "Focus Station Wagon"],
    ["2007 Jaguar X-Type Sport Brake", "JAGUAR", "X-Type Sport Brake"],
    ["2006 Mazda 6 Sport Wagon", "MAZDA", "6 Sport Wagon"],
    ["2004 Mercedes-Benz C-Class Wagon", "MERCEDES-BENZ", "C-Class Wagon"],
    ["2003 Saab 9-5 Wagon", "SAAB", "9-5 Wagon"],
    ["2008 Saab 9-5 SportCombi", "SAAB", "9-5 SportCombi"],
    ["2005 Subaru Legacy Wagon", "SUBARU", "Legacy Wagon"],
  ];
  for (const [query, makeName, modelName] of cases) {
    const hit = exact(query);
    expect(hit, query).toMatchObject({ makeName, matchKind: "exact" });
    expect(hit?.modelName.toUpperCase(), query).toBe(modelName.toUpperCase());
  }
  expect(exact("2012 Cadillac CTS")?.modelName.toUpperCase()).toBe("CTS");
  expect(exact("2004 Ford Focus")?.modelName.toUpperCase()).toBe("FOCUS");
  expect(exact("2005 Subaru Legacy")?.modelName.toUpperCase()).toBe("LEGACY");
  expect(exact("2005 Subaru Impreza Wagon")?.modelName.toUpperCase()).not.toBe("IMPREZA WAGON");
});

test("dated German estate observations preserve years and parent selections", () => {
  for (const model of ["Fabia Combi", "Superb Combi"]) {
    for (const year of [2015, 2016]) {
      const hit = searchVehicles(`${year} Skoda ${model}`, { fuzzy: false }).find(r => r.kind === "model");
      expect(hit).toMatchObject({ makeId: 100105, modelName: model, matchKind: "exact", years: [year] });
      expect(hit?.sourceIds).toContain("manufacturer-reviewed-catalog");
    }
    const outOfScope = searchVehicles(`2017 Skoda ${model}`, { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" }).find(r => r.kind === "model");
    expect(outOfScope?.years ?? []).not.toContain(2017);
  }
  for (const model of ["Fabia", "Superb"]) {
    const parent = searchVehicles(`2016 Skoda ${model}`, { fuzzy: false }).find(r => r.kind === "model");
    expect(parent?.modelName.toUpperCase()).toBe(model.toUpperCase());
  }
});

test("U.S. EPA E-Class wagons are a distinct estate model only in observed EPA years", () => {
  const exact = (query: string) => searchVehicles(query, { fuzzy: false }).find(r => r.kind === "model");
  for (const year of [1994, 2003, 2008, 2015, 2019, 2026]) {
    const hit = exact(`${year} Mercedes-Benz E-Class Wagon`);
    expect(hit, String(year)).toMatchObject({ makeName: "MERCEDES-BENZ", matchKind: "exact" });
    expect(hit?.modelName.toUpperCase(), String(year)).toBe("E-CLASS WAGON");
  }
  for (const year of [2010, 2022]) expect(exact(`${year} Mercedes-Benz E-Class Wagon`)?.modelName.toUpperCase()).not.toBe("E-CLASS WAGON");
  expect(exact("2015 Mercedes-Benz E-Class")?.modelName.toUpperCase()).not.toBe("E-CLASS WAGON");
  expect(exact("2004 Mercedes-Benz C-Class Wagon")?.modelName.toUpperCase()).toBe("C-CLASS WAGON");
});
