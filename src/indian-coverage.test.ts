import { expect, test } from "vitest";
import { getModels, getDataSources, getMakes } from "./index";

test("Indian catalog sources expose current observations without extending historical years", () => {
  const sourceId = "india-tvs-sales-catalog";
  expect(getDataSources().find(s => s.sourceId === sourceId)).toMatchObject({ yearBasis: "catalog-year", yearFrom: 2026, yearTo: 2026 });
  const names = getModels({ sourceId, year: 2026, vehicleTypeId: 1 }).map(r => r.modelName);
  expect(names).toEqual(expect.arrayContaining(["Apache RTR 160", "Apache RTR 160 4V", "Apache RTR 200 4V", "Ntorq 125", "Ntorq 150"]));
  expect(getModels({ sourceId, year: 2025 })).toEqual([]);
});

test("Indian commercial catalogs preserve passenger buses and goods-vehicle categories", () => {
  const sourceId = "india-commercial-sales-catalog";
  expect(getModels({ sourceId, vehicleTypeId: 5 }).map(r => r.modelName)).toEqual(["Starbus"]);
  const goods = getModels({ sourceId, vehicleTypeId: 3 }).map(r => r.modelName);
  expect(goods).toEqual(expect.arrayContaining(["Ace", "Intra", "Pro 2055", "Pro 3015", "Pro 6042"]));
  expect(goods).not.toContain("Starbus");
  expect(getModels({ sourceId }).map(r => r.modelName)).not.toContain("LPO");
});

test("Hero keeps its existing manufacturer ID and does not replace a named derivative with a base family", () => {
  const sourceId = "india-hero-sales-catalog";
  expect(getMakes({ sourceId })).toEqual([{ makeId: 2360746789, makeName: "HERO MOTOCORP LTD" }]);
  const names = getModels({ sourceId }).map(r => r.modelName);
  expect(names).toEqual(expect.arrayContaining(["Splendor Plus", "Xtreme 160R", "Xtreme 160R 4V", "Xpulse 200 4V"]));
  expect(names).not.toContain("Xpulse 200");
});

test("dated Tata and Ather portfolio facts retain their demonstrated calendar years", () => {
  const sourceId = "manufacturer-reviewed-catalog";
  expect(getModels({ sourceId, year: 2025, makeId: 4217729568 }).map(r => r.modelName)).toEqual(expect.arrayContaining(["Punch", "Nexon", "Curvv", "Harrier"]));
  const ather = getMakes({ sourceId }).find(m => m.makeName === "ATHER")!;
  expect(getModels({ sourceId, makeId: ather.makeId, year: 2024 }).map(r => r.modelName)).toEqual(["450 Apex", "450X", "Rizta"]);
  expect(getModels({ sourceId, makeId: ather.makeId, year: 2025 })).toEqual([]);
});
