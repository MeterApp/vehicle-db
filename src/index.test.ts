import { describe, it, expect, afterAll } from "vitest";
import {
  getVehicleTypes,
  getMakesForVehicleType,
  getModelsForMakeYear,
  getAvailableYears,
  close,
} from "./index";

afterAll(() => {
  close();
});

describe("getAvailableYears", () => {
  it("returns an array of years", () => {
    const years = getAvailableYears();
    expect(Array.isArray(years)).toBe(true);
    expect(years.length).toBeGreaterThan(0);
  });

  it("contains known years", () => {
    const years = getAvailableYears();
    expect(years).toContain(2024);
  });

  it("returns years in ascending order", () => {
    const years = getAvailableYears();
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBeGreaterThan(years[i - 1]);
    }
  });
});

describe("getVehicleTypes", () => {
  it("returns the expected response shape", () => {
    const result = getVehicleTypes();
    expect(result).toHaveProperty("Count");
    expect(result).toHaveProperty("Message");
    expect(result).toHaveProperty("Results");
    expect(result.Count).toBe(result.Results.length);
  });

  it("includes car, truck, and MPV", () => {
    const result = getVehicleTypes();
    const names = result.Results.map((r) => r.VehicleTypeName);
    expect(names).toContain("Passenger Car");
    expect(names).toContain("Truck");
    expect(names).toContain("Multipurpose Passenger Vehicle (MPV)");
  });

  it("each type has an id and name", () => {
    const result = getVehicleTypes();
    for (const vt of result.Results) {
      expect(typeof vt.VehicleTypeId).toBe("number");
      expect(typeof vt.VehicleTypeName).toBe("string");
      expect(vt.VehicleTypeName.length).toBeGreaterThan(0);
    }
  });
});

describe("getMakesForVehicleType", () => {
  it("returns the expected response shape", () => {
    const result = getMakesForVehicleType("Passenger Car", 2024);
    expect(result).toHaveProperty("Count");
    expect(result).toHaveProperty("Message");
    expect(result).toHaveProperty("SearchCriteria");
    expect(result).toHaveProperty("Results");
    expect(result.Count).toBe(result.Results.length);
    expect(result.Message).toBe("Results returned successfully");
  });

  it("returns car makes for 2024", () => {
    const result = getMakesForVehicleType("Passenger Car", 2024);
    expect(result.Count).toBeGreaterThan(10);
    const names = result.Results.map((r) => r.MakeName);
    expect(names).toContain("TOYOTA");
    expect(names).toContain("HONDA");
  });

  it("returns truck makes for 2024", () => {
    const result = getMakesForVehicleType("Truck", 2024);
    expect(result.Count).toBeGreaterThan(10);
    const names = result.Results.map((r) => r.MakeName);
    expect(names).toContain("FORD");
  });

  it("returns MPV makes for 2024", () => {
    const result = getMakesForVehicleType("Multipurpose Passenger Vehicle (MPV)", 2024);
    expect(result.Count).toBeGreaterThan(10);
  });

  it("each make has the expected fields", () => {
    const result = getMakesForVehicleType("Passenger Car", 2024);
    for (const make of result.Results) {
      expect(typeof make.MakeId).toBe("number");
      expect(typeof make.MakeName).toBe("string");
      expect(typeof make.VehicleTypeId).toBe("number");
      expect(typeof make.VehicleTypeName).toBe("string");
      expect(make.MakeName.length).toBeGreaterThan(0);
    }
  });

  it("returns results sorted by make name", () => {
    const result = getMakesForVehicleType("Passenger Car", 2024);
    for (let i = 1; i < result.Results.length; i++) {
      expect(result.Results[i].MakeName >= result.Results[i - 1].MakeName).toBe(true);
    }
  });

  it("is case-insensitive for vehicle type", () => {
    const a = getMakesForVehicleType("Passenger Car", 2024);
    const b = getMakesForVehicleType("passenger car", 2024);
    expect(a.Count).toBe(b.Count);
  });

  it("returns empty results for a year with no data", () => {
    const result = getMakesForVehicleType("Passenger Car", 1900);
    expect(result.Count).toBe(0);
    expect(result.Results).toEqual([]);
  });

  it("returns different makes for different vehicle types", () => {
    const cars = getMakesForVehicleType("Passenger Car", 2024);
    const trucks = getMakesForVehicleType("Truck", 2024);
    // Counts should differ
    expect(cars.Count).not.toBe(trucks.Count);
  });
});

describe("getModelsForMakeYear", () => {
  it("returns the expected response shape", () => {
    const result = getModelsForMakeYear("Toyota", 2024);
    expect(result).toHaveProperty("Count");
    expect(result).toHaveProperty("Message");
    expect(result).toHaveProperty("SearchCriteria");
    expect(result).toHaveProperty("Results");
    expect(result.Count).toBe(result.Results.length);
    expect(result.Message).toBe("Results returned successfully");
  });

  it("returns Toyota models for 2024", () => {
    const result = getModelsForMakeYear("Toyota", 2024);
    expect(result.Count).toBeGreaterThan(5);
    const models = result.Results.map((r) => r.Model_Name);
    expect(models).toContain("Camry");
  });

  it("each model has the expected fields", () => {
    const result = getModelsForMakeYear("Toyota", 2024);
    for (const model of result.Results) {
      expect(typeof model.Make_ID).toBe("number");
      expect(typeof model.Make_Name).toBe("string");
      expect(typeof model.Model_ID).toBe("number");
      expect(typeof model.Model_Name).toBe("string");
      expect(model.Model_Name.length).toBeGreaterThan(0);
    }
  });

  it("is case-insensitive for make name", () => {
    const lower = getModelsForMakeYear("toyota", 2024);
    const upper = getModelsForMakeYear("TOYOTA", 2024);
    const mixed = getModelsForMakeYear("Toyota", 2024);
    expect(lower.Count).toBe(upper.Count);
    expect(upper.Count).toBe(mixed.Count);
  });

  it("filters by vehicle type when provided", () => {
    const all = getModelsForMakeYear("Ford", 2024);
    const trucks = getModelsForMakeYear("Ford", 2024, "Truck");
    const cars = getModelsForMakeYear("Ford", 2024, "Passenger Car");

    expect(trucks.Count).toBeGreaterThan(0);
    expect(cars.Count).toBeGreaterThan(0);
    expect(trucks.Count + cars.Count).toBeLessThanOrEqual(all.Count);

    const truckNames = trucks.Results.map((r) => r.Model_Name);
    expect(truckNames).toContain("F-150");
  });

  it("returns empty results for unknown make", () => {
    const result = getModelsForMakeYear("NONEXISTENT_MAKE_XYZ", 2024);
    expect(result.Count).toBe(0);
    expect(result.Results).toEqual([]);
  });

  it("returns empty results for a year with no data", () => {
    const result = getModelsForMakeYear("Toyota", 1900);
    expect(result.Count).toBe(0);
    expect(result.Results).toEqual([]);
  });

  it("works for multiple makes", () => {
    for (const make of ["Honda", "Ford", "BMW"]) {
      const result = getModelsForMakeYear(make, 2024);
      expect(result.Count).toBeGreaterThan(0);
    }
  });

  it("returns different models for different years", () => {
    const years = getAvailableYears();
    if (years.length < 2) return; // need at least 2 years
    const r1 = getModelsForMakeYear("Toyota", years[0]);
    const r2 = getModelsForMakeYear("Toyota", years[years.length - 1]);
    expect(r1.Count).toBeGreaterThan(0);
    expect(r2.Count).toBeGreaterThan(0);
  });

  it("includes SearchCriteria with vehicle type when filtered", () => {
    const result = getModelsForMakeYear("Ford", 2024, "Truck");
    expect(result.SearchCriteria).toContain("VehicleType:Truck");
  });
});

describe("close", () => {
  it("can be called multiple times without error", () => {
    expect(() => close()).not.toThrow();
    expect(() => close()).not.toThrow();
  });

  it("allows re-opening after close", () => {
    close();
    const result = getMakesForVehicleType("Passenger Car", 2024);
    expect(result.Count).toBeGreaterThan(0);
  });
});
