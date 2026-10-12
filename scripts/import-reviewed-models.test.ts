import { expect, test } from "vitest";
import { buildReviewedCatalog, buildReviewedCatalogs, type ReviewedModel } from "./import-reviewed-models";
const metadata = { id: "reviewed", name: "Reviewed", url: "https://example.com", license: "Fixture", region: "IN", description: "Fixture", retrievedAt: "2026-10-12" };
const record: ReviewedModel = { year: 2025, makeId: 1, make: "Example", model: "Passenger", vehicleTypeId: 2, market: "IN", url: "https://example.com/model", note: "Synthetic evidence fixture" };
test("reviewed import preserves all supported vehicle types and rejects unknown IDs", () => {
  const ids = [1, 2, 3, 5, 7, 10001, 10002];
  const catalog = buildReviewedCatalog(ids.map(id => ({ ...record, model: `Type ${id}`, vehicleTypeId: id })), metadata);
  expect(catalog.vehicleTypes.map(t => t.vehicle_type_id)).toEqual(ids);
  expect(catalog.models.map(r => r[4]).sort((a, b) => a - b)).toEqual(ids);
  expect(() => buildReviewedCatalog([{ ...record, vehicleTypeId: 13 }], metadata)).toThrow(/type/);
});
test("marketed catalog years use a separate source and do not extend model-year history", () => {
  const current = { ...record, year: 2026, yearBasis: "catalog-year" as const };
  const catalogYearMetadata = { ...metadata, id: "reviewed-catalog", yearBasis: "catalog-year" as const };
  const catalogs = buildReviewedCatalogs({ records: [record, current], metadata, catalogYearMetadata });
  expect(catalogs[0].models.map(r => r[0])).toEqual([2025]);
  expect(catalogs[1].models.map(r => r[0])).toEqual([2026]);
  expect(catalogs[1].metadata.yearBasis).toBe("catalog-year");
  expect(() => buildReviewedCatalogs({ records: [current], metadata })).toThrow(/metadata/);
  expect(() => buildReviewedCatalogs({ records: [record, current], metadata, catalogYearMetadata: { ...catalogYearMetadata, id: metadata.id } })).toThrow(/distinct/);
  expect(() => buildReviewedCatalogs({ records: [{ ...record, yearBasis: "launch-year" as never }], metadata })).toThrow(/basis/);
});
