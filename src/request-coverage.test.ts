import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { resolveVehicle } from "./resolve";
import { searchVehicles } from "./search";
import { getAvailableYears, getModels } from "./index";
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

test("U.S. EPA BMW 2 Series and Mercedes-Benz C-Class convertibles keep their exact names in observed model years only", () => {
  const exact = (query: string) => searchVehicles(query, { fuzzy: false }).find(r => r.kind === "model");
  const cases: [string, string, string][] = [
    ["2019 BMW 230i Convertible", "BMW", "230i Convertible"],
    ["2017 BMW 230i xDrive Convertible", "BMW", "230i xDrive Convertible"],
    ["2021 BMW M240i Convertible", "BMW", "M240i Convertible"],
    ["2016 BMW 228i Convertible", "BMW", "228i Convertible"],
    ["2016 BMW M235i xDrive Convertible", "BMW", "M235i xDrive Convertible"],
    ["2020 Mercedes-Benz AMG C43 4matic Convertible", "MERCEDES-BENZ", "AMG C43 4matic Convertible"],
    ["2021 Mercedes-Benz AMG C63 Convertible", "MERCEDES-BENZ", "AMG C63 Convertible"],
    ["2021 Mercedes-Benz AMG C63 S Convertible", "MERCEDES-BENZ", "AMG C63 S Convertible"],
    ["2019 Mercedes-Benz C300 Convertible", "MERCEDES-BENZ", "C300 Convertible"],
    ["2023 Mercedes-Benz AMG C63 S Convertible", "MERCEDES-BENZ", "AMG C63 S Convertible"],
  ];
  for (const [query, makeName, modelName] of cases) {
    const hit = exact(query);
    expect(hit, query).toMatchObject({ makeName, matchKind: "exact" });
    expect(hit?.modelName.toUpperCase(), query).toBe(modelName.toUpperCase());
  }
  // Years without an EPA record for the exact name are not published.
  for (const query of ["2022 BMW 230i Convertible", "2014 BMW 228i Convertible", "2022 Mercedes-Benz AMG C63 Convertible", "2022 Mercedes-Benz AMG C63 S Convertible", "2016 Mercedes-Benz C300 Convertible"]) {
    expect(exact(query)?.modelName.toUpperCase() ?? "", query).not.toMatch(/CONVERTIBLE$/);
  }
  // The coupe/sedan parents keep their own selections.
  expect(exact("2019 BMW 230i")?.modelName.toUpperCase()).toBe("230I");
  expect(exact("2021 Mercedes-Benz AMG C 63")?.modelName.toUpperCase()).toBe("AMG C 63");
  expect(exact("2020 Mercedes-Benz AMG C 43")?.modelName.toUpperCase()).toBe("AMG C 43");
});

test("U.S. EPA body derivatives publish exactly their observed EPA years before the regular window", () => {
  const observed = JSON.parse(readFileSync(new URL("../data/evidence/fueleconomy-us-body-derivatives-observed.json", import.meta.url), "utf8")) as { derivatives: { make: string; model: string; years: number[] }[] };
  const published = new Map<string, Set<number>>();
  for (const year of getAvailableYears()) {
    if (year >= 2022) continue;
    for (const row of getModels({ year, sourceId: "fueleconomy-us" })) {
      const key = `${row.makeName}|${row.modelName}`.toUpperCase();
      published.set(key, (published.get(key) ?? new Set()).add(year));
    }
  }
  for (const d of observed.derivatives) {
    const key = `${d.make}|${d.model}`.toUpperCase();
    expect([...(published.get(key) ?? [])].sort((a, b) => a - b), key).toEqual(d.years.filter(y => y < 2022));
    published.delete(key);
  }
  // Before 2022 the EPA source publishes nothing but the reviewed derivatives.
  expect([...published.keys()]).toEqual([]);
});

test("dated German estate observations preserve years and parent selections", () => {
  for (const model of ["Fabia Combi", "Superb Combi"]) {
    for (const year of [2015, 2016]) {
      const hit = searchVehicles(`${year} Skoda ${model}`, { fuzzy: false }).find(r => r.kind === "model");
      expect(hit).toMatchObject({ makeId: 100105, modelName: model, matchKind: "exact", years: [year] });
      expect(hit?.sourceIds).toContain("manufacturer-reviewed-catalog");
    }
    const outOfScope = searchVehicles(`2009 Skoda ${model}`, { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" }).find(r => r.kind === "model");
    expect(outOfScope?.years ?? []).not.toContain(2009);
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

test("dated German Octavia Combi observations fill estate years without replacing the parent", () => {
  for (const year of [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2024, 2026]) {
    const hit = searchVehicles(`${year} Skoda Octavia Combi`, { fuzzy: false }).find(r => r.kind === "model");
    expect(hit).toMatchObject({ makeId: 100105, matchKind: "exact" });
    expect(hit?.modelName.toUpperCase()).toBe("OCTAVIA COMBI");
    expect(hit?.years).toContain(year);
  }
  const reviewed = searchVehicles("2012 Skoda Octavia Combi", { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" }).find(r => r.kind === "model");
  expect(reviewed?.years ?? []).not.toContain(2023);
  expect(reviewed?.years ?? []).not.toContain(2025);
  const parent = searchVehicles("2018 Skoda Octavia", { fuzzy: false }).find(r => r.kind === "model");
  expect(parent?.modelName.toUpperCase()).toBe("OCTAVIA");
});

test("dated German Superb Combi and Fabia Combi observations fill estate years without replacing the parents", () => {
  const cases: Array<[string, string, number[]]> = [
    ["Superb Combi", "SUPERB COMBI", [2010, 2011, 2012, 2013, 2014, 2017, 2018, 2019, 2020, 2021, 2022, 2024, 2025, 2026]],
    ["Fabia Combi", "FABIA COMBI", [2008, 2010, 2011, 2012, 2017, 2018, 2019, 2020]],
  ];
  for (const [model, name, years] of cases) {
    for (const year of years) {
      const hit = searchVehicles(`${year} Skoda ${model}`, { fuzzy: false }).find(r => r.kind === "model");
      expect(hit).toMatchObject({ makeId: 100105, matchKind: "exact" });
      expect(hit?.modelName.toUpperCase()).toBe(name);
      expect(hit?.years).toContain(year);
    }
  }
  // Years without a dated German release stay unclaimed by the reviewed source:
  // the Superb Combi launched in Germany in January 2010, and no 2021 Fabia Combi release was found.
  const superb = searchVehicles("2012 Skoda Superb Combi", { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" }).find(r => r.kind === "model");
  expect(superb?.years ?? []).not.toContain(2009);
  expect(superb?.years ?? []).not.toContain(2023);
  const fabia = searchVehicles("2012 Skoda Fabia Combi", { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" }).find(r => r.kind === "model");
  expect(fabia?.years ?? []).not.toContain(2021);
  expect(searchVehicles("2019 Skoda Superb", { fuzzy: false }).find(r => r.kind === "model")?.modelName.toUpperCase()).toBe("SUPERB");
  expect(searchVehicles("2018 Skoda Fabia", { fuzzy: false }).find(r => r.kind === "model")?.modelName.toUpperCase()).toBe("FABIA");
});

test("dated UK Toyota Touring Sports observations fill estate years without replacing the parents", () => {
  const cases: Array<[string, string, number[]]> = [
    ["Auris Touring Sports", "AURIS TOURING SPORTS", [2013, 2014, 2015, 2016, 2017, 2018]],
    ["Avensis Touring Sports", "AVENSIS TOURING SPORTS", [2015, 2016]],
    ["Corolla Touring Sports", "COROLLA TOURING SPORTS", [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]],
  ];
  for (const [model, name, years] of cases) {
    for (const year of years) {
      const hit = searchVehicles(`${year} Toyota ${model}`, { fuzzy: false }).find(r => r.kind === "model");
      expect(hit).toMatchObject({ makeId: 448, matchKind: "exact" });
      expect(hit?.modelName.toUpperCase()).toBe(name);
      expect(hit?.years).toContain(year);
    }
  }
  // The UK Avensis estate was sold as the Tourer until the 2015 facelift, and no dated
  // 2017 or 2018 UK release names the Avensis Touring Sports: those years stay unclaimed.
  const avensis = searchVehicles("2015 Toyota Avensis Touring Sports", { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" }).find(r => r.kind === "model");
  for (const year of [2012, 2013, 2014, 2017, 2018]) expect(avensis?.years ?? []).not.toContain(year);
  const auris = searchVehicles("2015 Toyota Auris Touring Sports", { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" }).find(r => r.kind === "model");
  expect(auris?.years ?? []).not.toContain(2012);
  for (const [query, name] of [["2015 Toyota Auris", "AURIS"], ["2015 Toyota Avensis", "AVENSIS"], ["2020 Toyota Corolla", "COROLLA"]]) {
    expect(searchVehicles(query, { fuzzy: false }).find(r => r.kind === "model")?.modelName.toUpperCase()).toBe(name);
  }
});

test("dated UK Ford Focus and Mondeo estate observations fill estate years without replacing the parents", () => {
  const cases: Array<[string, string, number[]]> = [
    ["Focus Estate", "FOCUS ESTATE", [2009, 2010, 2011, 2015]],
    ["Mondeo Estate", "MONDEO ESTATE", [2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2015, 2016]],
  ];
  for (const [model, name, years] of cases) {
    for (const year of years) {
      const hit = searchVehicles(`${year} Ford ${model}`, { fuzzy: false }).find(r => r.kind === "model");
      expect(hit).toMatchObject({ makeId: 460, matchKind: "exact" });
      expect(hit?.modelName.toUpperCase()).toBe(name);
      expect(hit?.years).toContain(year);
    }
  }
  // Only Ford of Britain releases that name the estate count. Years with only a
  // pan-European "wagon" release, a reveal, or no dated UK release stay unclaimed.
  const focus = searchVehicles("2011 Ford Focus Estate", { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" }).find(r => r.kind === "model");
  for (const year of [2008, 2012, 2013, 2014, 2016, 2018, 2020, 2024]) expect(focus?.years ?? []).not.toContain(year);
  const mondeo = searchVehicles("2011 Ford Mondeo Estate", { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" }).find(r => r.kind === "model");
  for (const year of [2005, 2014, 2017, 2018, 2019, 2020]) expect(mondeo?.years ?? []).not.toContain(year);
  // The U.S. EPA Focus Station Wagon stays its own model.
  expect(searchVehicles("2005 Ford Focus Station Wagon", { fuzzy: false }).find(r => r.kind === "model")?.modelName.toUpperCase()).toBe("FOCUS STATION WAGON");
  for (const [query, name] of [["2016 Ford Focus", "FOCUS"], ["2010 Ford Mondeo", "MONDEO"]]) {
    expect(searchVehicles(query, { fuzzy: false }).find(r => r.kind === "model")?.modelName.toUpperCase()).toBe(name);
  }
});

test("dated UK Mercedes-Benz C-Class Estate observations fill estate years without replacing the parents", () => {
  const years = [2006, 2010, 2011, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2023, 2025, 2026];
  for (const year of years) {
    const hit = searchVehicles(`${year} Mercedes-Benz C-Class Estate`, { fuzzy: false }).find(r => r.kind === "model");
    expect(hit).toMatchObject({ makeId: 449, matchKind: "exact" });
    expect(hit?.modelName.toUpperCase()).toBe("C-CLASS ESTATE");
    expect(hit?.years).toContain(year);
  }
  // Only dated Mercedes-Benz UK price lists and releases that name the estate
  // count. Years without one stay unclaimed rather than inferred from neighbours.
  for (const year of [2005, 2007, 2008, 2009, 2012, 2013, 2020, 2022, 2024]) {
    const hits = searchVehicles(`${year} Mercedes-Benz C-Class Estate`, { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" });
    expect(hits.some(r => r.kind === "model" && r.modelName.toUpperCase() === "C-CLASS ESTATE" && (r.years ?? []).includes(year))).toBe(false);
  }
  // The U.S. EPA C-Class Wagon stays its own model, and the parent keeps its first selection.
  expect(searchVehicles("2004 Mercedes-Benz C-Class Wagon", { fuzzy: false }).find(r => r.kind === "model")?.modelName.toUpperCase()).toBe("C-CLASS WAGON");
  expect(searchVehicles("2016 Mercedes-Benz C-Class", { fuzzy: false }).find(r => r.kind === "model")?.modelName.toUpperCase()).toBe("C CLASS");
});

test("dated South African JAC X200 bodies and electric twin stay separate catalog vehicles", () => {
  const za = { market: "ZA", yearBasis: "catalog-year" as const };
  for (const name of ["X200 Single Cab", "X200 Double Cab", "X200 EV"]) {
    const hit = searchVehicles(`2026 JAC ${name}`, { fuzzy: false }).find(r => r.kind === "model");
    expect(hit).toMatchObject({ makeId: 3336793959, matchKind: "exact", vehicleTypeId: 3 });
    expect(hit?.modelName.toUpperCase()).toBe(name.toUpperCase());
    expect(hit?.years).toEqual([2026]);
  }
  // Only the current official JAC Motors SA pages and its 2026-10-09 release
  // establish these; earlier years are not inferred from the 2017 launch.
  expect(searchVehicles("2025 JAC X200 Double Cab", { fuzzy: false }).some(r => r.kind === "model" && (r.years ?? []).includes(2025))).toBe(false);
  // A bare family name never resolves to one body or to the electric twin.
  expect(resolveVehicle("2026 JAC X200", za).status).not.toBe("MATCHED");
  // Existing JAC T-Series selections are unchanged.
  expect(searchVehicles("2026 JAC T9", { fuzzy: false }).find(r => r.kind === "model")?.modelName).toBe("T9");
});

test("dated Mexican Hyundai Grand i10 hatchback and sedan years stay separate from the i10", () => {
  for (const [name, years] of [["Grand i10", [2014, 2026]], ["Grand i10 Sedan", [2014, 2026]]] as const) {
    for (const year of [years[0], 2020, years[1]]) {
      const hit = searchVehicles(`${year} Hyundai ${name}`, { fuzzy: false }).find(r => r.kind === "model");
      expect(hit).toMatchObject({ makeId: 498, matchKind: "exact", vehicleTypeId: 2 });
      expect(hit?.modelName).toBe(name);
    }
  }
  // INEGI reports no Mexican Grand i10 sales before 2014; no earlier year is inferred from the 2013 Indian launch.
  expect(searchVehicles("2013 Hyundai Grand i10", { fuzzy: false }).some(r => r.kind === "model" && r.modelName === "Grand i10")).toBe(false);
  // The European i10 is unchanged and never becomes a Grand i10.
  expect(searchVehicles("2020 Hyundai i10", { fuzzy: false }).find(r => r.kind === "model")?.modelName.toUpperCase()).toBe("I10");
});

test("dated Turkish C-Elysee, Taliant and Symbol price-list years fill catalog gaps without unsold years", () => {
  const cases = [["Citroen", "C-Elysee", [2023, 2024]], ["Renault", "Taliant", [2021, 2022, 2023, 2024, 2025]], ["Renault", "Symbol", [2021]]] as const;
  for (const [make, name, years] of cases) {
    for (const year of years) {
      const hit = searchVehicles(`${year} ${make} ${name}`, { fuzzy: false }).find(r => r.kind === "model");
      expect(hit).toMatchObject({ matchKind: "exact", vehicleTypeId: 2 });
      expect(hit?.modelName.toUpperCase()).toBe(name.toUpperCase());
      expect(hit?.years).toContain(year);
    }
  }
  // Official Turkish price lists drop the C-Elysee after model year 2024, the Taliant after March 2025
  // and the Symbol in mid-2021; those later years stay unclaimed rather than inferred.
  for (const [make, name, year] of [["Citroen", "C-Elysee", 2025], ["Citroen", "C-Elysee", 2026], ["Renault", "Taliant", 2026], ["Renault", "Taliant", 2020], ["Renault", "Symbol", 2022]] as const) {
    const hits = searchVehicles(`${year} ${make} ${name}`, { fuzzy: false, sourceId: "manufacturer-reviewed-catalog" });
    expect(hits.some(r => r.kind === "model" && r.modelName.toUpperCase() === name.toUpperCase() && (r.years ?? []).includes(year))).toBe(false);
  }
  // The Taliant is listed only under Renault: no Dacia Taliant is invented.
  expect(searchVehicles("2025 Dacia Taliant", { fuzzy: false }).some(r => r.kind === "model" && r.modelName.toUpperCase() === "TALIANT")).toBe(false);
  // Earlier C-Elysee years from the EU register keep their rows.
  const eu = searchVehicles("2022 Citroen C-Elysee", { fuzzy: false }).find(r => r.kind === "model");
  expect(eu?.modelName.toUpperCase()).toBe("C-ELYSEE");
  expect(eu?.sourceIds).toContain("eea-co2-monitoring");
});
