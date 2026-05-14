import { describe, it, expect } from "vitest";
import {
  getVehicleTypes,
  getMakes,
  getModels,
  getAvailableYears,
} from "./index";

const AUTO_RICKSHAW_TYPE_ID = 10001;
const ATUL_AUTO_MAKE_ID = 100001;
const ATUL_AUTO_MODELS = [
  "RIK",
  "RIK+",
  "GEM-PAXX DIESEL",
  "GEM-PAXX CNG AQUA",
  "GEM-CARGO DIESEL",
  "GEM-CARGO AQUA CNG",
  "ELITE PAXX",
  "ELITE CARGO",
  "RIK TWIN",
  "ENERGIE2",
  "SHAKTI",
  "GEMINI+",
];

describe("getAvailableYears", () => {
  it("returns an array of years", () => {
    const years = getAvailableYears();
    expect(Array.isArray(years)).toBe(true);
    expect(years.length).toBeGreaterThan(0);
  });

  it("contains 2024", () => {
    expect(getAvailableYears()).toContain(2024);
  });

  it("returns years in ascending order", () => {
    const years = getAvailableYears();
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBeGreaterThan(years[i - 1]);
    }
  });
});

describe("getVehicleTypes", () => {
  it("returns an array directly", () => {
    const types = getVehicleTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
  });

  it("includes car, truck, MPV, and auto rickshaw", () => {
    const names = getVehicleTypes().map((t) => t.vehicleTypeName);
    expect(names).toContain("Passenger Car");
    expect(names).toContain("Truck");
    expect(names).toContain("Multipurpose Passenger Vehicle (MPV)");
    expect(names).toContain("Auto Rickshaw");
  });

  it("each type has camelCase id and name", () => {
    for (const vt of getVehicleTypes()) {
      expect(typeof vt.vehicleTypeId).toBe("number");
      expect(typeof vt.vehicleTypeName).toBe("string");
      expect(vt.vehicleTypeName.length).toBeGreaterThan(0);
    }
  });
});

describe("getMakes", () => {
  it("returns all makes with no filters", () => {
    const makes = getMakes();
    expect(makes.length).toBeGreaterThan(100);
  });

  it("returns makes filtered by year", () => {
    const makes = getMakes({ year: 2024 });
    expect(makes.length).toBeGreaterThan(50);
    const names = makes.map((m) => m.makeName);
    expect(names).toContain("TOYOTA");
    expect(names).toContain("FORD");
  });

  it("returns makes filtered by vehicle type", () => {
    const trucks = getMakes({ vehicleTypeId: 3 });
    expect(trucks.length).toBeGreaterThan(10);
  });

  it("returns makes filtered by both year and vehicle type", () => {
    const carMakes2024 = getMakes({ year: 2024, vehicleTypeId: 2 });
    const allMakes2024 = getMakes({ year: 2024 });
    expect(carMakes2024.length).toBeGreaterThan(0);
    expect(carMakes2024.length).toBeLessThanOrEqual(allMakes2024.length);
  });

  it("includes Atul Auto for auto rickshaws across the catalog year range", () => {
    for (const year of [1990, 2026]) {
      const makes = getMakes({ year, vehicleTypeId: AUTO_RICKSHAW_TYPE_ID });
      expect(makes).toEqual([{ makeId: ATUL_AUTO_MAKE_ID, makeName: "ATUL AUTO" }]);
    }
  });

  it("each make has camelCase id and name", () => {
    const makes = getMakes({ year: 2024 });
    for (const make of makes) {
      expect(typeof make.makeId).toBe("number");
      expect(typeof make.makeName).toBe("string");
      expect(make.makeName.length).toBeGreaterThan(0);
    }
  });

  it("returns results sorted by make name", () => {
    const makes = getMakes({ year: 2024 });
    for (let i = 1; i < makes.length; i++) {
      expect(makes[i].makeName >= makes[i - 1].makeName).toBe(true);
    }
  });

  it("returns empty for a year with no data", () => {
    expect(getMakes({ year: 1900 })).toEqual([]);
  });

  it("returns different counts for different vehicle types", () => {
    const cars = getMakes({ year: 2024, vehicleTypeId: 2 });
    const trucks = getMakes({ year: 2024, vehicleTypeId: 3 });
    expect(cars.length).not.toBe(trucks.length);
  });
});

describe("getModels", () => {
  it("returns models filtered by makeId and year", () => {
    const toyota = getMakes({ year: 2024 }).find((m) => m.makeName === "TOYOTA");
    expect(toyota).toBeDefined();
    const models = getModels({ makeId: toyota!.makeId, year: 2024 });
    expect(models.length).toBeGreaterThan(5);
    const names = models.map((m) => m.modelName);
    expect(names).toContain("Camry");
  });

  it("each model has all expected fields", () => {
    const toyota = getMakes({ year: 2024 }).find((m) => m.makeName === "TOYOTA");
    const models = getModels({ makeId: toyota!.makeId, year: 2024 });
    for (const model of models) {
      expect(typeof model.modelId).toBe("number");
      expect(typeof model.modelName).toBe("string");
      expect(typeof model.makeId).toBe("number");
      expect(typeof model.makeName).toBe("string");
      expect(typeof model.vehicleTypeId).toBe("number");
      expect(typeof model.vehicleTypeName).toBe("string");
    }
  });

  it("filters by vehicleTypeId", () => {
    const ford = getMakes({ year: 2024 }).find((m) => m.makeName === "FORD");
    const allFord = getModels({ makeId: ford!.makeId, year: 2024 });
    const trucks = getModels({ makeId: ford!.makeId, year: 2024, vehicleTypeId: 3 });
    const cars = getModels({ makeId: ford!.makeId, year: 2024, vehicleTypeId: 2 });

    expect(trucks.length).toBeGreaterThan(0);
    expect(cars.length).toBeGreaterThan(0);
    expect(trucks.length + cars.length).toBeLessThanOrEqual(allFord.length);

    const truckNames = trucks.map((m) => m.modelName);
    expect(truckNames).toContain("F-150");
  });

  it("filters by year only", () => {
    const models = getModels({ year: 2024 });
    expect(models.length).toBeGreaterThan(100);
  });

  it("filters by vehicleTypeId only", () => {
    const trucks = getModels({ vehicleTypeId: 3 });
    expect(trucks.length).toBeGreaterThan(100);
    for (const m of trucks) {
      expect(m.vehicleTypeId).toBe(3);
    }
  });

  it("returns Atul Auto Rickshaw models with the custom type metadata", () => {
    const models = getModels({
      makeId: ATUL_AUTO_MAKE_ID,
      year: 2026,
      vehicleTypeId: AUTO_RICKSHAW_TYPE_ID,
    });

    expect(new Set(models.map((m) => m.modelName))).toEqual(new Set(ATUL_AUTO_MODELS));
    for (const model of models) {
      expect(model.makeId).toBe(ATUL_AUTO_MAKE_ID);
      expect(model.makeName).toBe("ATUL AUTO");
      expect(model.vehicleTypeId).toBe(AUTO_RICKSHAW_TYPE_ID);
      expect(model.vehicleTypeName).toBe("Auto Rickshaw");
    }
  });

  it("returns empty for unknown makeId", () => {
    expect(getModels({ makeId: 999999, year: 2024 })).toEqual([]);
  });

  it("returns empty for a year with no data", () => {
    expect(getModels({ year: 1900 })).toEqual([]);
  });

  it("returns different models for different years", () => {
    const years = getAvailableYears();
    if (years.length < 2) return;
    const toyota = getMakes({ year: years[0] }).find((m) => m.makeName === "TOYOTA");
    if (!toyota) return;
    const r1 = getModels({ makeId: toyota.makeId, year: years[0] });
    const r2 = getModels({ makeId: toyota.makeId, year: years[years.length - 1] });
    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
  });
});
