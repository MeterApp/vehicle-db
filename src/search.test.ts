import { describe, expect, it } from "vitest";
import { getModels } from "./index";
import {
  searchVehicles,
  type VehicleModelSearchResult,
  type VehicleSearchResult,
} from "./search";

const NHTSA_SOURCE_ID = "nhtsa-vpic";
const UK_DFT_SOURCE_ID = "uk-dft-vehicle-licensing";
const NZTA_ASIA_SOURCE_ID = "nzta-asia-pacific-mvr";
const PASSENGER_CAR_TYPE_ID = 2;
const TRUCK_TYPE_ID = 3;
const MPV_TYPE_ID = 7;

function firstModel(results: VehicleSearchResult[]): VehicleModelSearchResult {
  const result = results.find((candidate) => candidate.kind === "model");
  expect(result).toBeDefined();
  return result as VehicleModelSearchResult;
}

describe("searchVehicles", () => {
  it("finds a complete year, make, and model query", () => {
    const results = searchVehicles("2020 toy cam", {
      sourceId: NHTSA_SOURCE_ID,
      vehicleTypeId: PASSENGER_CAR_TYPE_ID,
    });
    const result = firstModel(results);

    expect(result.makeName).toBe("TOYOTA");
    expect(result.modelName).toBe("Camry");
    expect(result.years).toEqual([2020]);
    expect(result.matchKind).toBe("token");
    expect(result.variants).toHaveLength(1);
  });

  it("accepts make, model, and year tokens in any order", () => {
    const result = firstModel(
      searchVehicles("camry toyota 2020", {
        sourceId: NHTSA_SOURCE_ID,
        vehicleTypeId: PASSENGER_CAR_TYPE_ID,
      }),
    );

    expect(result.makeName).toBe("TOYOTA");
    expect(result.modelName).toBe("Camry");
    expect(result.years).toEqual([2020]);
  });

  it("distinguishes numeric model names from year tokens", () => {
    const modelOnly = searchVehicles("peugeot 2008", {
      sourceId: UK_DFT_SOURCE_ID,
      vehicleTypeId: PASSENGER_CAR_TYPE_ID,
    });
    const yearAndModel = firstModel(
      searchVehicles("2020 peugeot 2008", {
        sourceId: UK_DFT_SOURCE_ID,
        vehicleTypeId: PASSENGER_CAR_TYPE_ID,
      }),
    );

    expect(modelOnly[0]).toMatchObject({
      kind: "model",
      makeName: "PEUGEOT",
      modelName: "2008",
      matchKind: "exact",
    });
    expect(modelOnly.some((result) => result.kind === "make")).toBe(false);
    expect(yearAndModel).toMatchObject({
      makeName: "PEUGEOT",
      modelName: "2008",
      years: [2020],
    });
  });

  it("groups a model across years instead of returning one result per year", () => {
    const results = searchVehicles("toy cam", {
      sourceId: NHTSA_SOURCE_ID,
      vehicleTypeId: PASSENGER_CAR_TYPE_ID,
    });
    const camryResults = results.filter(
      (result) => result.kind === "model" && result.makeName === "TOYOTA" && result.modelName === "Camry",
    );

    expect(camryResults).toHaveLength(1);
    const result = camryResults[0] as VehicleModelSearchResult;
    expect(result.years).toContain(1990);
    expect(result.years).toContain(2024);
    expect(new Set(result.variants.map((variant) => variant.year)).size).toBe(
      result.variants.length,
    );
  });

  it("returns a make candidate without flooding results with all of its models", () => {
    const results = searchVehicles("toy", {
      sourceId: NHTSA_SOURCE_ID,
      vehicleTypeId: PASSENGER_CAR_TYPE_ID,
    });

    expect(results[0]).toMatchObject({
      kind: "make",
      makeName: "TOYOTA",
      matchKind: "prefix",
    });
    expect(results.every((result) => result.kind === "make")).toBe(true);
  });

  it("normalizes punctuation and compact model input", () => {
    const f150 = firstModel(
      searchVehicles("f150 2024", {
        sourceId: NHTSA_SOURCE_ID,
        vehicleTypeId: TRUCK_TYPE_ID,
      }),
    );
    const crv = firstModel(
      searchVehicles("crv 2024", {
        sourceId: NHTSA_SOURCE_ID,
        vehicleTypeId: MPV_TYPE_ID,
      }),
    );

    expect(f150).toMatchObject({ makeName: "FORD", modelName: "F-150", matchKind: "exact" });
    expect(crv).toMatchObject({ makeName: "HONDA", modelName: "CR-V", matchKind: "exact" });
  });

  it("supports common make aliases without changing catalog identities", () => {
    const vw = firstModel(
      searchVehicles("vw golf", {
        year: 2024,
        sourceId: UK_DFT_SOURCE_ID,
        vehicleTypeId: PASSENGER_CAR_TYPE_ID,
      }),
    );
    const mercedes = firstModel(
      searchVehicles("merc glc", {
        year: 2024,
        sourceId: NHTSA_SOURCE_ID,
        vehicleTypeId: MPV_TYPE_ID,
      }),
    );

    expect(vw).toMatchObject({ makeName: "VOLKSWAGEN", modelName: "GOLF" });
    expect(mercedes.makeName).toBe("MERCEDES-BENZ");
    expect(mercedes.modelName).toContain("GLC");
  });

  it("uses conservative fuzzy matching only when lexical matching finds nothing", () => {
    const fuzzy = firstModel(
      searchVehicles("toyta camry", {
        sourceId: NHTSA_SOURCE_ID,
        vehicleTypeId: PASSENGER_CAR_TYPE_ID,
      }),
    );
    const disabled = searchVehicles("toyta camry", {
      sourceId: NHTSA_SOURCE_ID,
      vehicleTypeId: PASSENGER_CAR_TYPE_ID,
      fuzzy: false,
    });
    const exact = searchVehicles("f150 2024", {
      sourceId: NHTSA_SOURCE_ID,
      vehicleTypeId: TRUCK_TYPE_ID,
    });

    expect(fuzzy).toMatchObject({ makeName: "TOYOTA", modelName: "Camry", matchKind: "fuzzy" });
    expect(disabled).toEqual([]);
    expect(exact.every((result) => result.matchKind !== "fuzzy")).toBe(true);
  });

  it("applies market, year, and vehicle-type filters before returning candidates", () => {
    const nzta = firstModel(
      searchVehicles("nbox", {
        year: 2022,
        sourceId: NZTA_ASIA_SOURCE_ID,
        vehicleTypeId: PASSENGER_CAR_TYPE_ID,
      }),
    );
    const nhtsa = searchVehicles("nbox", {
      year: 2022,
      sourceId: NHTSA_SOURCE_ID,
      vehicleTypeId: PASSENGER_CAR_TYPE_ID,
      fuzzy: false,
    });

    expect(nzta).toMatchObject({ makeName: "HONDA", modelName: "N-BOX", years: [2022] });
    expect(nzta.sourceIds).toContain(NZTA_ASIA_SOURCE_ID);
    expect(nhtsa).toEqual([]);
  });

  it("returns a valid year-specific model identity for direct selection", () => {
    const result = firstModel(
      searchVehicles("2024 toyota camry", {
        sourceId: NHTSA_SOURCE_ID,
        vehicleTypeId: PASSENGER_CAR_TYPE_ID,
      }),
    );
    const variant = result.variants[0];
    const selected = getModels({
      year: variant.year,
      makeId: result.makeId,
      modelId: variant.modelId,
      vehicleTypeId: result.vehicleTypeId,
      sourceId: NHTSA_SOURCE_ID,
    });

    expect(selected).toHaveLength(1);
    expect(selected[0].modelName).toBe("Camry");
  });

  it("handles invalid or ambiguous search input safely", () => {
    expect(searchVehicles("")).toEqual([]);
    expect(searchVehicles("2020")).toEqual([]);
    expect(searchVehicles("2020 camry", { year: 2021 })).toEqual([]);
    expect(searchVehicles("2020 2021 camry")).toEqual([]);
    expect(searchVehicles("camry", { sourceId: "not-a-source" })).toEqual([]);
    expect(searchVehicles("camry", { limit: 0 })).toEqual([]);
  });

  it("serves repeated autocomplete queries within a practical local budget", () => {
    const startedAt = performance.now();
    for (let index = 0; index < 25; index++) {
      expect(
        searchVehicles(index % 2 === 0 ? "toy cam" : "hond civ", {
          sourceId: NHTSA_SOURCE_ID,
          vehicleTypeId: PASSENGER_CAR_TYPE_ID,
        }).length,
      ).toBeGreaterThan(0);
    }
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });
});
