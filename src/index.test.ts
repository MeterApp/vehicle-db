import { describe, it, expect } from "vitest";
import {
  getVehicleTypes,
  getDataSources,
  getMakes,
  getModels,
  getAvailableYears,
} from "./index";

const AUTO_RICKSHAW_TYPE_ID = 10001;
const MOTORCYCLE_TYPE_ID = 1;
const BUS_TYPE_ID = 5;
const ATUL_AUTO_MAKE_ID = 100001;
const UK_DFT_SOURCE_ID = "uk-dft-vehicle-licensing";
const NZTA_ASIA_SOURCE_ID = "nzta-asia-pacific-mvr";
const MALAYSIA_JPJ_SOURCE_ID = "malaysia-jpj-registrations";
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

  it("filters years by make, model, type, and source", () => {
    const toyota = getMakes({ year: 2024, sourceId: "nhtsa-vpic" }).find(
      (make) => make.makeName === "TOYOTA",
    )!;
    const camry = getModels({
      makeId: toyota.makeId,
      year: 2024,
      vehicleTypeId: 2,
      sourceId: "nhtsa-vpic",
    }).find((model) => model.modelName === "Camry")!;

    const makeYears = getAvailableYears({
      makeId: toyota.makeId,
      vehicleTypeId: 2,
      sourceId: "nhtsa-vpic",
    });
    const modelYears = getAvailableYears({
      makeId: toyota.makeId,
      modelId: camry.modelId,
      vehicleTypeId: 2,
      sourceId: "nhtsa-vpic",
    });

    expect(makeYears).toContain(2024);
    expect(modelYears).toContain(2024);
    expect(modelYears.length).toBeLessThanOrEqual(makeYears.length);
    expect(getAvailableYears({ sourceId: "not-a-source" })).toEqual([]);
  });
});

describe("getVehicleTypes", () => {
  it("returns an array directly", () => {
    const types = getVehicleTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
  });

  it("includes passenger, commercial, motorcycle, bus, rickshaw, and special-purpose types", () => {
    const names = getVehicleTypes().map((t) => t.vehicleTypeName);
    expect(names).toContain("Motorcycle");
    expect(names).toContain("Passenger Car");
    expect(names).toContain("Truck");
    expect(names).toContain("Bus");
    expect(names).toContain("Multipurpose Passenger Vehicle (MPV)");
    expect(names).toContain("Auto Rickshaw");
    expect(names).toContain("Other Vehicle");
  });

  it("each type has camelCase id and name", () => {
    for (const vt of getVehicleTypes()) {
      expect(typeof vt.vehicleTypeId).toBe("number");
      expect(typeof vt.vehicleTypeName).toBe("string");
      expect(vt.vehicleTypeName.length).toBeGreaterThan(0);
    }
  });
});

describe("getDataSources", () => {
  it("returns transparent source, license, and coverage metadata", () => {
    const sources = getDataSources();
    expect(sources.map((source) => source.sourceId)).toEqual([
      "nhtsa-vpic",
      UK_DFT_SOURCE_ID,
      "atul-auto-catalog",
      NZTA_ASIA_SOURCE_ID,
      MALAYSIA_JPJ_SOURCE_ID,
    ]);

    const ukSource = sources.find((source) => source.sourceId === UK_DFT_SOURCE_ID)!;
    expect(ukSource.license).toBe("Open Government Licence v3.0");
    expect(ukSource.vehicleTypeIds).toEqual(expect.arrayContaining([MOTORCYCLE_TYPE_ID, BUS_TYPE_ID]));
    expect(ukSource.makeCount).toBeGreaterThan(500);
    expect(ukSource.modelCount).toBeGreaterThan(50_000);

    const asiaSource = sources.find((source) => source.sourceId === NZTA_ASIA_SOURCE_ID)!;
    expect(asiaSource.license).toBe("Creative Commons Attribution 4.0 International");
    expect(asiaSource.vehicleTypeIds).toEqual(
      expect.arrayContaining([MOTORCYCLE_TYPE_ID, BUS_TYPE_ID]),
    );
    expect(asiaSource.modelCount).toBeGreaterThan(30_000);

    const malaysiaSource = sources.find(
      (source) => source.sourceId === MALAYSIA_JPJ_SOURCE_ID,
    )!;
    expect(malaysiaSource.region).toBe("Malaysia");
    expect(malaysiaSource.yearFrom).toBe(2024);
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

  it("includes Atul Auto only for the sourced product-catalog years", () => {
    for (const year of [2024, 2026]) {
      const makes = getMakes({ year, vehicleTypeId: AUTO_RICKSHAW_TYPE_ID });
      expect(makes).toEqual([{ makeId: ATUL_AUTO_MAKE_ID, makeName: "ATUL AUTO" }]);
    }
    expect(getMakes({ year: 1990, vehicleTypeId: AUTO_RICKSHAW_TYPE_ID })).toEqual([]);
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
      expect(Array.isArray(model.sourceIds)).toBe(true);
      expect(model.sourceIds.length).toBeGreaterThan(0);
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
      expect(model.sourceIds).toEqual(["atul-auto-catalog"]);
    }
  });

  it("returns empty for unknown makeId", () => {
    expect(getModels({ makeId: 999999, year: 2024 })).toEqual([]);
  });

  it("filters by modelId", () => {
    const toyota = getMakes({ year: 2024 }).find((make) => make.makeName === "TOYOTA")!;
    const camry = getModels({ makeId: toyota.makeId, year: 2024 }).find(
      (model) => model.modelName === "Camry",
    )!;
    const models = getModels({ modelId: camry.modelId, year: 2024 });

    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model.modelId === camry.modelId)).toBe(true);
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

  it("includes sourced European and Asian market models", () => {
    const ukMakes = getMakes({ year: 2024, sourceId: UK_DFT_SOURCE_ID });
    const skoda = ukMakes.find((make) => make.makeName === "SKODA");
    const byd = ukMakes.find((make) => make.makeName === "BYD");
    expect(skoda).toBeDefined();
    expect(byd).toBeDefined();

    expect(
      getModels({ makeId: skoda!.makeId, year: 2024, sourceId: UK_DFT_SOURCE_ID }).map(
        (model) => model.modelName,
      ),
    ).toContain("OCTAVIA");
    expect(
      getModels({ makeId: byd!.makeId, year: 2024, sourceId: UK_DFT_SOURCE_ID }).map(
        (model) => model.modelName,
      ),
    ).toContain("ATTO 3");
  });

  it("includes motorcycles and buses/coaches from the UK source", () => {
    const honda = getMakes({
      year: 2024,
      vehicleTypeId: MOTORCYCLE_TYPE_ID,
      sourceId: UK_DFT_SOURCE_ID,
    }).find((make) => make.makeName === "HONDA");
    expect(honda).toBeDefined();
    expect(
      getModels({
        makeId: honda!.makeId,
        year: 2024,
        vehicleTypeId: MOTORCYCLE_TYPE_ID,
        sourceId: UK_DFT_SOURCE_ID,
      }).map((model) => model.modelName),
    ).toContain("CBR");

    const alexanderDennis = getMakes({
      year: 2024,
      vehicleTypeId: BUS_TYPE_ID,
      sourceId: UK_DFT_SOURCE_ID,
    }).find((make) => make.makeName === "ALEXANDER DENNIS");
    expect(alexanderDennis).toBeDefined();
    expect(
      getModels({
        makeId: alexanderDennis!.makeId,
        year: 2024,
        vehicleTypeId: BUS_TYPE_ID,
        sourceId: UK_DFT_SOURCE_ID,
      }).map((model) => model.modelName),
    ).toContain("ENVIRO");
  });

  it("includes Japanese kei cars, Chinese EVs, Indian vehicles, and Asian motorcycles", () => {
    const honda = getMakes({ year: 2022, sourceId: NZTA_ASIA_SOURCE_ID }).find(
      (make) => make.makeName === "HONDA",
    );
    expect(honda).toBeDefined();
    expect(
      getModels({
        makeId: honda!.makeId,
        year: 2022,
        vehicleTypeId: 2,
        sourceId: NZTA_ASIA_SOURCE_ID,
      }).map((model) => model.modelName),
    ).toContain("N-BOX");

    const byd = getMakes({ year: 2024, sourceId: NZTA_ASIA_SOURCE_ID }).find(
      (make) => make.makeName === "BYD",
    );
    expect(byd).toBeDefined();
    expect(
      getModels({ makeId: byd!.makeId, year: 2024, sourceId: NZTA_ASIA_SOURCE_ID }).map(
        (model) => model.modelName,
      ),
    ).toContain("DOLPHIN");

    const mahindra = getMakes({ year: 2024, sourceId: NZTA_ASIA_SOURCE_ID }).find(
      (make) => make.makeName === "MAHINDRA",
    );
    expect(mahindra).toBeDefined();
    expect(
      getModels({
        makeId: mahindra!.makeId,
        year: 2024,
        vehicleTypeId: 2,
        sourceId: NZTA_ASIA_SOURCE_ID,
      }).map((model) => model.modelName),
    ).toContain("SCORPIO N");

    expect(
      getModels({
        makeId: honda!.makeId,
        year: 2024,
        vehicleTypeId: MOTORCYCLE_TYPE_ID,
        sourceId: NZTA_ASIA_SOURCE_ID,
      }).map((model) => model.modelName),
    ).toContain("CBR");
  });

  it("includes Malaysian and regional Southeast Asian market models", () => {
    const perodua = getMakes({ year: 2026, sourceId: MALAYSIA_JPJ_SOURCE_ID }).find(
      (make) => make.makeName === "PERODUA",
    );
    expect(perodua).toBeDefined();
    expect(
      getModels({ makeId: perodua!.makeId, year: 2026, sourceId: MALAYSIA_JPJ_SOURCE_ID }).map(
        (model) => model.modelName,
      ),
    ).toEqual(expect.arrayContaining(["AXIA", "BEZZA", "MYVI"]));

    const proton = getMakes({ year: 2026, sourceId: MALAYSIA_JPJ_SOURCE_ID }).find(
      (make) => make.makeName === "PROTON",
    );
    expect(proton).toBeDefined();
    expect(
      getModels({ makeId: proton!.makeId, year: 2026, sourceId: MALAYSIA_JPJ_SOURCE_ID }).map(
        (model) => model.modelName,
      ),
    ).toContain("S70");
  });

  it("filters by source and returns empty for an unknown source", () => {
    const models = getModels({ year: 2024, sourceId: UK_DFT_SOURCE_ID });
    expect(models.length).toBeGreaterThan(1_000);
    expect(models.every((model) => model.sourceIds.includes(UK_DFT_SOURCE_ID))).toBe(true);
    expect(getModels({ sourceId: "not-a-source" })).toEqual([]);
    expect(getMakes({ sourceId: "not-a-source" })).toEqual([]);
  });
});
