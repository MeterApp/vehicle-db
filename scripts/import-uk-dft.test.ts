import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSourceCatalog, loadBodyDerivatives, parseCsvLine, type DerivativeObservation } from "./import-uk-dft";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("parseCsvLine", () => {
  it("handles quoted commas and escaped quotes", () => {
    expect(parseCsvLine('Cars,"MAKE, LTD","MODEL ""ONE""",0')).toEqual([
      "Cars",
      "MAKE, LTD",
      'MODEL "ONE"',
      "0",
    ]);
  });
});

describe("buildSourceCatalog", () => {
  it("normalizes useful rows, maps body types, and skips missing data", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle-db-import-test-"));
    temporaryDirectories.push(directory);
    const inputPath = path.join(directory, "sample.csv");
    fs.writeFileSync(
      inputPath,
      [
        "BodyType,Make,GenModel,Model,YearFirstUsed,YearManufacture,LicenceStatus,2025,2024",
        "Motorcycles,HONDA,HONDA CBR,CBR,2024,2024,Licensed,2,1",
        "Buses and coaches,ALEXANDER DENNIS,ALEXANDER DENNIS ENVIRO,ENVIRO,2024,2024,Licensed,[c],[z]",
        "Cars,SKODA,SKODA MODEL MISSING,MODEL MISSING,2024,2024,Licensed,10,5",
        "Cars,BYD,BYD ATTO 3,ATTO 3,2023,[x],Licensed,2,1",
        "Cars,EMPTY,EMPTY ZERO,ZERO,2024,2024,Licensed,0,0",
      ].join("\n"),
    );

    const catalog = await buildSourceCatalog([inputPath]);
    expect(catalog.vehicleTypes).toEqual([
      { vehicle_type_id: 1, vehicle_type_name: "Motorcycle" },
      { vehicle_type_id: 2, vehicle_type_name: "Passenger Car" },
      { vehicle_type_id: 5, vehicle_type_name: "Bus" },
    ]);
    expect(catalog.makes.map((make) => make.make_name)).toEqual([
      "ALEXANDER DENNIS",
      "BYD",
      "HONDA",
    ]);
    expect(catalog.modelNames).toEqual(["ATTO 3", "CBR", "ENVIRO"]);
    expect(catalog.models).toHaveLength(3);
    expect(catalog.models.map((model) => model[0]).sort()).toEqual([2023, 2024, 2024]);
  });

  it("adds reviewed body derivatives only from mapped words above the vehicle threshold", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle-db-import-test-"));
    temporaryDirectories.push(directory);
    const inputPath = path.join(directory, "sample.csv");
    fs.writeFileSync(
      inputPath,
      [
        "BodyType,Make,GenModel,Model,YearFirstUsed,YearManufacture,LicenceStatus,2025,2024",
        "Cars,BMW,BMW 3 SERIES,320D SE TOURING,2008,2008,Licensed,8,9",
        "Cars,BMW,BMW 3 SERIES,318I TOURING AUTO,2008,2008,SORN,[c],2",
        "Cars,BMW,BMW 3 SERIES,320D SE,2009,2009,Licensed,40,41",
        "Cars,BMW,BMW 3 SERIES,320D TOURINGX,2009,2009,Licensed,40,41",
        "Cars,BMW,BMW 3 SERIES,330I TOURING,2010,2010,Licensed,3,4",
        "Cars,FORD,FORD FOCUS,FOCUS ST,2015,2015,Licensed,90,90",
      ].join("\n"),
    );

    const observations: DerivativeObservation[] = [];
    const derivatives = [
      { make: "BMW", genericModel: "BMW 3 SERIES", modelToken: "TOURING", model: "3 SERIES TOURING", bodyStyle: "Estate", minVehicles: 10 },
    ];
    const catalog = await buildSourceCatalog([inputPath], derivatives, observations);
    const touring = catalog.modelNames.indexOf("3 SERIES TOURING");
    expect(touring).toBeGreaterThanOrEqual(0);
    expect(catalog.models.filter((model) => model[3] === touring).map((model) => model[0])).toEqual([2008]);
    expect(catalog.modelNames).toContain("3 SERIES");
    expect(catalog.modelNames).not.toContain("FOCUS ST");
    expect(observations).toEqual([
      { make: "BMW", model: "3 SERIES TOURING", years: [{ year: 2008, vehicles: 11, descriptions: 2 }] },
    ]);
  });

  it("keeps the reviewed derivative list free of trim words", () => {
    const derivatives = loadBodyDerivatives();
    expect(derivatives.length).toBeGreaterThan(0);
    for (const derivative of derivatives) {
      expect(["ST", "TS", "GT", "RS"]).not.toContain(derivative.modelToken);
      expect(derivative.genericModel.startsWith(`${derivative.make} `)).toBe(true);
      expect(derivative.minVehicles).toBeGreaterThanOrEqual(10);
    }
  });
});
