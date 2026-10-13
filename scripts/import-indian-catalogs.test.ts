import { expect, test } from "vitest";
import { parseSalesCatalog, salesObservations, type CatalogGroup } from "./import-indian-catalogs";

const group: CatalogGroup = { id: "fixture", url: "https://example.com/in/catalog", cacheFile: "fixture.html",
  make: "EXAMPLE", makeId: 1, batch: "tvs", mappings: [
    { rawName: "RTR 160", url: "https://example.com/in/rtr160", model: "Apache RTR 160", vehicleTypeId: 1, scope: "product" },
    { rawName: "Cargo", url: "https://example.com/in/cargo", model: "Cargo", vehicleTypeId: 3, scope: "family" },
  ] };
const html = '<a href="rtr160"><img alt="Wrong Name"/><span>RTR 160</span></a><a href=cargo>Cargo</a>';

test("sales parser rejects script/comment observations and does not treat image labels as product names", () => {
  const parsed = parseSalesCatalog(html + '<script><a href="ghost">Ghost</a></script><!-- <h1>Ghost</h1> --><a href="javascript:evil()">Ghost</a>', group.url);
  expect(parsed.links).toEqual([
    { name: "RTR 160", url: "https://example.com/in/rtr160" },
    { name: "Cargo", url: "https://example.com/in/cargo" },
  ]);
  expect(parsed.headings).toEqual([]);
});

test("catalog observations keep current year and body type without interpreting manual filename years", () => {
  const records = salesObservations(group, html + '<a href="manual-2019-2027.pdf">Guide</a>', "2026-10-13");
  expect(records.map(r => [r.year, r.vehicleTypeId, r.yearBasis, r.scope])).toEqual([
    [2026, 1, "catalog-year", "product"], [2026, 3, "catalog-year", "family"],
  ]);
  expect(() => salesObservations(group, html, "2026-02-30")).toThrow(/date/);
});

test("source name and product URL must both match rather than accepting a similar model", () => {
  expect(() => salesObservations(group, html.replace("RTR 160</span>", "RTR 160 4V</span>"), "2026-10-13")).toThrow(/missing/);
  expect(() => salesObservations(group, html.replace('href="rtr160"', 'href="rtr160-old"'), "2026-10-13")).toThrow(/missing/);
});

test("reviewed headings decode entities and preserve explicit plus badges", () => {
  const headings = { ...group, mappings: [], headingMappings: [
    { rawName: "Product & Plus+", url: group.url, model: "Product & Plus+", vehicleTypeId: 5, scope: "product" as const },
  ] };
  expect(salesObservations(headings, '<h2>Product &amp; Plus&#43;</h2>', "2026-10-13")[0]).toMatchObject({ model: "Product & Plus+", vehicleTypeId: 5 });
});
