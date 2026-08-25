import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSourceCatalog } from "./import-malaysia-jpj";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Malaysia JPJ importer", () => {
  it("aggregates registration transactions into model-year entries", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "malaysia-jpj-test-"));
    temporaryDirectories.push(directory);
    const input = path.join(directory, "cars.csv");
    fs.writeFileSync(
      input,
      [
        "date_reg,type,maker,model,colour,fuel,state",
        "2026-01-01,motokar,Perodua,Myvi,blue,petrol,Johor",
        "2026-02-01,motokar,PERODUA,MYVI,red,petrol,Selangor",
        "2026-03-01,pick_up,Tata,Xenon,white,diesel,Sabah",
        "2026-04-01,jip,Chery,iCaur V23,orange,electric,Kedah",
      ].join("\n"),
    );

    const catalog = await buildSourceCatalog([input], "2026-08-25");
    expect(catalog.metadata.id).toBe("malaysia-jpj-registrations");
    expect(catalog.makes.map((make) => make.make_name)).toEqual(["CHERY", "PERODUA", "TATA"]);
    expect(catalog.models).toHaveLength(3);
    expect(catalog.vehicleTypes.map((type) => type.vehicle_type_id)).toEqual([2, 3, 7]);
  });
});
