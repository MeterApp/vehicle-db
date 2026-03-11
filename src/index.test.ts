import { describe, it, expect, afterAll } from "vitest";
import {
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
    expect(years).toContain(2020);
    expect(years).toContain(2000);
  });

  it("returns years in ascending order", () => {
    const years = getAvailableYears();
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBeGreaterThan(years[i - 1]);
    }
  });
});

describe("getMakesForVehicleType", () => {
  it("returns the expected response shape", () => {
    const result = getMakesForVehicleType(2024);
    expect(result).toHaveProperty("Count");
    expect(result).toHaveProperty("Message");
    expect(result).toHaveProperty("SearchCriteria");
    expect(result).toHaveProperty("Results");
    expect(typeof result.Count).toBe("number");
    expect(result.Message).toBe("Results returned successfully");
    expect(result.Count).toBe(result.Results.length);
  });

  it("returns makes for 2024", () => {
    const result = getMakesForVehicleType(2024);
    expect(result.Count).toBeGreaterThan(50);
    const names = result.Results.map((r) => r.MakeName);
    expect(names).toContain("TOYOTA");
    expect(names).toContain("HONDA");
    expect(names).toContain("FORD");
  });

  it("each make has the expected fields", () => {
    const result = getMakesForVehicleType(2024);
    for (const make of result.Results) {
      expect(typeof make.MakeId).toBe("number");
      expect(typeof make.MakeName).toBe("string");
      expect(typeof make.VehicleTypeId).toBe("number");
      expect(typeof make.VehicleTypeName).toBe("string");
      expect(make.MakeName.length).toBeGreaterThan(0);
    }
  });

  it("returns results sorted by make name", () => {
    const result = getMakesForVehicleType(2024);
    for (let i = 1; i < result.Results.length; i++) {
      expect(
        result.Results[i].MakeName.localeCompare(result.Results[i - 1].MakeName)
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns empty results for a year with no data", () => {
    const result = getMakesForVehicleType(1900);
    expect(result.Count).toBe(0);
    expect(result.Results).toEqual([]);
  });

  it("returns consistent results across calls", () => {
    const a = getMakesForVehicleType(2024);
    const b = getMakesForVehicleType(2024);
    expect(a.Count).toBe(b.Count);
    expect(a.Results).toEqual(b.Results);
  });
});

describe("getModelsForMakeYear", () => {
  it("returns the expected response shape", () => {
    const result = getModelsForMakeYear("Toyota", 2024);
    expect(result).toHaveProperty("Count");
    expect(result).toHaveProperty("Message");
    expect(result).toHaveProperty("SearchCriteria");
    expect(result).toHaveProperty("Results");
    expect(typeof result.Count).toBe("number");
    expect(result.Message).toBe("Results returned successfully");
    expect(result.SearchCriteria).toBe("Make:Toyota | ModelYear:2024");
    expect(result.Count).toBe(result.Results.length);
  });

  it("returns Toyota models for 2024", () => {
    const result = getModelsForMakeYear("Toyota", 2024);
    expect(result.Count).toBeGreaterThan(10);
    const models = result.Results.map((r) => r.Model_Name);
    expect(models).toContain("Camry");
    expect(models).toContain("Corolla");
    expect(models).toContain("RAV4");
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
    expect(lower.Results).toEqual(upper.Results);
  });

  it("returns results sorted by model name", () => {
    const result = getModelsForMakeYear("Toyota", 2024);
    // SQLite sorts with binary collation (uppercase before lowercase)
    for (let i = 1; i < result.Results.length; i++) {
      expect(result.Results[i].Model_Name >= result.Results[i - 1].Model_Name).toBe(true);
    }
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
    for (const make of ["Honda", "Ford", "BMW", "Mercedes-Benz"]) {
      const result = getModelsForMakeYear(make, 2024);
      expect(result.Count).toBeGreaterThan(0);
      expect(result.Results[0].Make_Name.toUpperCase()).toContain(
        make.toUpperCase()
      );
    }
  });

  it("returns different models for different years", () => {
    const r2024 = getModelsForMakeYear("Toyota", 2024);
    const r2000 = getModelsForMakeYear("Toyota", 2000);
    // Both should have data but may differ
    expect(r2024.Count).toBeGreaterThan(0);
    expect(r2000.Count).toBeGreaterThan(0);
    // Model counts will likely differ across decades
    expect(r2024.Results).not.toEqual(r2000.Results);
  });
});

describe("close", () => {
  it("can be called multiple times without error", () => {
    expect(() => close()).not.toThrow();
    expect(() => close()).not.toThrow();
  });

  it("allows re-opening after close", () => {
    close();
    const result = getMakesForVehicleType(2024);
    expect(result.Count).toBeGreaterThan(0);
  });
});
