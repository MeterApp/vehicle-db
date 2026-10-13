import { expect, test } from "vitest";
import { getAvailableYears, getMakes, getModels } from "./index";
import { searchVehicles } from "./search";

const catalogSource = "manufacturer-reviewed-catalog";
const modelYearSource = "manufacturer-reviewed";

test("regional additions preserve published makes and use only evidenced years and bodies", () => {
  const cases = [
    ["CHANGAN", 4638620262, "Hunter", 3, modelYearSource],
    ["CHANGAN", 4638620262, "CS75 Plus", 7, modelYearSource],
    ["CHANGAN", 4638620262, "UNI-V", 2, modelYearSource],
    ["CHANGAN", 4638620262, "Alsvin Plus", 2, catalogSource],
    ["CHANGAN", 4638620262, "CS35 Max", 7, catalogSource],
    ["WULING", 5142354878, "Air ev", 2, catalogSource],
    ["WULING", 5142354878, "Cortez", 7, catalogSource],
    ["BAJAJ", 2485975730, "RE", 10001, catalogSource],
    ["BAJAJ", 2485975730, "Maxima Z", 10001, catalogSource],
    ["BAJAJ", 2485975730, "Maxima X Wide", 10001, catalogSource],
    ["BAJAJ", 2485975730, "Maxima C", 3, catalogSource],
    ["BAJAJ", 2485975730, "Riki P4005", 10001, catalogSource],
    ["BAJAJ", 2485975730, "Riki C4005", 3, catalogSource],
  ] as const;
  for (const [makeName, makeId, modelName, vehicleTypeId, sourceId] of cases) {
    expect(getMakes({ sourceId, year: 2026 })).toContainEqual({ makeId, makeName });
    const rows = getModels({ makeId, year: 2026, sourceId }).filter(m => m.modelName === modelName);
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicleTypeId).toBe(vehicleTypeId);
    expect(getAvailableYears({ makeId, modelId: rows[0].modelId, sourceId })).toEqual([2026]);
  }
});

test("Wuling queries find the Malaysian brand while keeping Indonesia and Malaysia separate", () => {
  const malaysia = { year: 2026, sourceId: "malaysia-jpj-registrations", fuzzy: false };
  const bingo = searchVehicles("wuling bingo", malaysia).find(r => r.kind === "model");
  expect(bingo).toMatchObject({ makeId: 3543148682, makeName: "TQ WULING", modelName: "BINGO", matchKind: "exact" });
  const prefixed = searchVehicles("tq wuling bingo", malaysia).find(r => r.kind === "model");
  expect(prefixed).toMatchObject({ makeId: bingo!.makeId, variants: bingo!.kind === "model" ? bingo!.variants : [] });
  const indonesia = searchVehicles("wuling binguoev", { year: 2026, sourceId: catalogSource, fuzzy: false }).find(r => r.kind === "model");
  expect(indonesia).toMatchObject({ makeId: 5142354878, makeName: "WULING", modelName: "BinguoEV" });
  expect(getModels({ makeId: 5142354878, year: 2026, sourceId: catalogSource }).some(m => m.modelName === "BINGO")).toBe(false);
  expect(searchVehicles("wuling binguoev", { year: 2025, sourceId: catalogSource, fuzzy: false })).toEqual([]);
});
