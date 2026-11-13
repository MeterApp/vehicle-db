import { describe, expect, test } from "vitest";
import { getAppearancePackages } from "./packages";
import { appearancePackageSlug, listAppearancePackages, type IdentityGraph, type VehicleIdentity } from "./identity";
import { createVehicleResolver, resolveVehicle } from "./resolve";
import { validateIdentityGraph } from "../scripts/identity-types";
import graph from "./identity-data";

const LEXUS = 515, IS = 2184, IS_350 = 2789494252, LX = 2212, LX_600 = 2166581238;

describe("appearance packages (bundled)", () => {
  test("Lexus IS F SPORT, US model years 2021-2024, on the IS rows", () => {
    for (const year of [2021, 2022, 2023, 2024]) {
      const [pkg, ...rest] = getAppearancePackages({ makeId: LEXUS, modelId: IS, year, market: "US" });
      expect(rest).toEqual([]);
      expect(pkg).toMatchObject({
        slug: "f-sport", name: "F SPORT", specificationId: "lexus:is:third:sedan:fsport:us:2021",
        visualIdentityId: "lexus:is:third:sedan:fsport:us:2021:exterior", markets: ["US"], yearBasis: "model-year",
        years: [2021, 2022, 2023, 2024],
      });
      expect(pkg.exteriorDifferences).toEqual(["grille", "front_bumper", "rear_bumper", "side_skirts", "spoiler", "wheels", "badges", "exhaust"]);
      expect(pkg.evidenceIds.length).toBeGreaterThan(0);
    }
    expect(getAppearancePackages({ makeId: LEXUS, modelId: IS_350, year: 2022, market: "US" }).map(p => p.slug)).toEqual(["f-sport"]);
  });
  test("market semantics: a market-scoped package needs its market", () => {
    expect(getAppearancePackages({ makeId: LEXUS, modelId: IS, year: 2022 })).toEqual([]);
    expect(getAppearancePackages({ makeId: LEXUS, modelId: IS, year: 2022, market: "GB" })).toEqual([]);
    expect(getAppearancePackages({ makeId: LEXUS, modelId: IS, year: 2020, market: "US" })).toEqual([]);
    expect(getAppearancePackages({ makeId: LEXUS, modelId: IS, year: 2025, market: "US" })).toEqual([]);
  });
  test("LX 600 F SPORT: US 2022 and Vietnam 2026, grille and wheels", () => {
    for (const modelId of [LX, LX_600]) {
      const us = getAppearancePackages({ makeId: LEXUS, modelId, year: 2022, market: "US" });
      expect(us.map(p => [p.slug, p.specificationId, p.yearBasis])).toEqual([["f-sport", "lexus:lx600:fourth:suv:fsport:us:2022", "model-year"]]);
      expect(us[0].exteriorDifferences).toEqual(["grille", "wheels"]);
      const vn = getAppearancePackages({ makeId: LEXUS, modelId, year: 2026, market: "VN" });
      expect(vn.map(p => [p.slug, p.visualIdentityId, p.yearBasis])).toEqual([["f-sport", "lexus:lx600:fourth:suv:fsport:vn:2026:exterior", "catalog-year"]]);
      expect(getAppearancePackages({ makeId: LEXUS, modelId, year: 2026, market: "US" })).toEqual([]);
    }
  });
  test("invalid input returns no packages", () => {
    expect(getAppearancePackages({ makeId: LEXUS, modelId: IS, year: 2022.5, market: "US" })).toEqual([]);
    expect(getAppearancePackages({ makeId: NaN, modelId: IS, year: 2022, market: "US" })).toEqual([]);
  });
  test("a package is never the resolution of its base car or a performance model", () => {
    // The base rows answer exactly as before: an offered-on link neither verifies a market nor adds a visual.
    for (const [query, options] of [["2022 Lexus LX 600", { market: "US", depth: "visual" }], ["2022 Lexus LX 600", { market: "US" }], ["2022 Lexus IS", { market: "US" }], ["2022 Lexus IS 350", { market: "US", depth: "visual" }]] as const) {
      const result = resolveVehicle(query, options);
      expect(result.status).toBe("SCOPE_UNVERIFIED");
      expect(result.candidates.flatMap(c => c.visualIdentityIds)).toEqual([]);
    }
    for (const query of ["2021 Lexus IS F Sport", "2013 Lexus IS F Sport"]) {
      const result = resolveVehicle(query, { market: "US" });
      expect(result.status).not.toBe("MATCHED");
    }
  });
});

describe("appearance package rules", () => {
  const evidence = [{ id: "ev", sourceId: "fixture", url: "https://example.com/fixture", retrievedAt: "2026-11-13", note: "Synthetic test fixture" }];
  const catalog = { makes: [{ make_id: 1, make_name: "Example" }], modelNames: ["Car"], sources: [{ source_id: "fixture" }], models: [[2024, 1, 10, 0, 2, 1], [2025, 1, 10, 0, 2, 1]] };
  const common = { makeId: 1, vehicleTypeId: 2, evidenceIds: ["ev"] };
  const scope = { years: [2024, 2025], yearBasis: "model-year" as const };
  function fixture(edit: (g: IdentityGraph) => void = () => {}): IdentityGraph {
    const g: IdentityGraph = { schemaVersion: 1, revision: "fixture", evidence, aliases: [], homologation: [], visualCompatibility: [], identities: [
      { ...common, id: "line", kind: "line", name: "Car", names: ["Car"] },
      { ...common, id: "gen", kind: "generation", parentId: "line", name: "Gen", names: [], ...scope },
      { ...common, id: "body", kind: "derivative", parentId: "gen", name: "Sedan", names: [] },
      { ...common, id: "sport", kind: "specification", parentId: "body", name: "Car Sport Line", names: [], ...scope, markets: ["US"], specification: { trim: "Sport Line", rawText: "Sport Line" } },
      { ...common, id: "sport:exterior", kind: "visual", parentId: "sport", name: "Car Sport Line", names: [], ...scope, markets: ["US"], exteriorDifferences: ["front_bumper", "wheels"] },
    ] as VehicleIdentity[], catalogLinks: [
      { ...common, identityId: "sport", year: 2024, modelId: 10, relation: "offered-on" },
      { ...common, identityId: "sport", year: 2025, modelId: 10, relation: "offered-on" },
    ] };
    edit(g);
    return g;
  }
  const valid = (g: IdentityGraph) => () => validateIdentityGraph(g, catalog);
  const node = (g: IdentityGraph, id: string) => g.identities.find(n => n.id === id)!;

  test("slugs are lower-case kebab of the trim name", () => {
    expect(appearancePackageSlug("F SPORT")).toBe("f-sport");
    expect(appearancePackageSlug("M Sport")).toBe("m-sport");
    expect(appearancePackageSlug("N Line")).toBe("n-line");
    expect(appearancePackageSlug("AMG Line")).toBe("amg-line");
    expect(appearancePackageSlug("S line")).toBe("s-line");
    expect(appearancePackageSlug("R-Design")).toBe("r-design");
    expect(appearancePackageSlug(" GT-Line+ ")).toBe("gt-line-plus");
    expect(appearancePackageSlug("Édition Noire")).toBe("edition-noire");
  });
  test("a valid package lists and does not resolve its base row", () => {
    const g = fixture();
    expect(valid(g)).not.toThrow();
    expect(listAppearancePackages(g, { makeId: 1, modelId: 10, year: 2024, market: "US" }).map(p => p.slug)).toEqual(["sport-line"]);
    expect(listAppearancePackages(g, { makeId: 1, modelId: 10, year: 2024 })).toEqual([]);
    const resolve = createVehicleResolver(catalog, g);
    expect(resolve("2024 Example Car", { market: "US", depth: "visual" }).candidates.flatMap(c => c.visualIdentityIds)).not.toContain("sport:exterior");
  });
  test("an unscoped package answers with or without a market", () => {
    const g = fixture(g => { for (const id of ["sport", "sport:exterior"]) delete node(g, id).markets; });
    expect(valid(g)).not.toThrow();
    expect(listAppearancePackages(g, { makeId: 1, modelId: 10, year: 2025 }).map(p => p.slug)).toEqual(["sport-line"]);
    expect(listAppearancePackages(g, { makeId: 1, modelId: 10, year: 2025, market: "DE" }).map(p => p.slug)).toEqual(["sport-line"]);
  });
  test("rejects a package exterior without differences, with unknown or repeated parts", () => {
    expect(valid(fixture(g => { node(g, "sport:exterior").exteriorDifferences = []; }))).toThrow(/exterior differences/);
    expect(valid(fixture(g => { node(g, "sport:exterior").exteriorDifferences = ["roof" as never]; }))).toThrow(/exterior differences/);
    expect(valid(fixture(g => { node(g, "sport:exterior").exteriorDifferences = ["wheels", "wheels"]; }))).toThrow(/exterior differences/);
  });
  test("rejects differences outside a package (no trim, not visual, not under a specification)", () => {
    expect(valid(fixture(g => { node(g, "sport").specification = { rawText: "Sport Line" }; }))).toThrow(/trim/);
    expect(valid(fixture(g => { node(g, "body").exteriorDifferences = ["wheels"]; }))).toThrow(/exterior differences/);
  });
  test("rejects a package outside its generation's or specification's scope", () => {
    expect(valid(fixture(g => { node(g, "sport").years = [2023, 2024]; node(g, "sport:exterior").years = [2024]; g.catalogLinks = g.catalogLinks.filter(l => l.year === 2024); }))).toThrow(/scope/);
    expect(valid(fixture(g => { node(g, "sport:exterior").markets = ["US", "GB"]; }))).toThrow(/scope/);
  });
  test("rejects a package without evidence, years or offered-on links", () => {
    expect(valid(fixture(g => { node(g, "sport").evidenceIds = []; }))).toThrow(/evidence/);
    expect(valid(fixture(g => { delete node(g, "sport").years; delete node(g, "sport").yearBasis; delete node(g, "sport:exterior").years; delete node(g, "sport:exterior").yearBasis; }))).toThrow(/years/);
    expect(valid(fixture(g => { g.catalogLinks = []; }))).toThrow(/offered-on/);
    expect(valid(fixture(g => { g.catalogLinks.push({ ...common, identityId: "body", year: 2024, modelId: 10, relation: "offered-on" }); }))).toThrow(/offered-on link without a package/);
  });
  test("a slug is unique per catalog vehicle and year unless the markets are disjoint", () => {
    const twin = (markets?: string[]) => (g: IdentityGraph) => {
      g.identities.push(
        { ...common, id: "sport2", kind: "specification", parentId: "body", name: "Car SPORT LINE", names: [], ...scope, ...(markets ? { markets } : {}), specification: { trim: "SPORT LINE", rawText: "SPORT LINE" } },
        { ...common, id: "sport2:exterior", kind: "visual", parentId: "sport2", name: "Car SPORT LINE", names: [], ...scope, ...(markets ? { markets } : {}), exteriorDifferences: ["grille"] },
      );
      g.catalogLinks.push({ ...common, identityId: "sport2", year: 2024, modelId: 10, relation: "offered-on" });
    };
    expect(valid(fixture(twin(["US"])))).toThrow(/duplicate package slug/);
    expect(valid(fixture(twin()))).toThrow(/duplicate package slug/);
    expect(valid(fixture(twin(["GB"])))).not.toThrow();
  });
  test("the bundled graph passes the package rules and every package has evidence", () => {
    const packages = graph.identities.filter(n => n.exteriorDifferences);
    expect(packages.length).toBeGreaterThanOrEqual(3);
    for (const v of packages) expect(v.evidenceIds.length).toBeGreaterThan(0);
  });
});
