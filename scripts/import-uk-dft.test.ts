import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSourceCatalog, parseCsvLine } from "./import-uk-dft";

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
});
