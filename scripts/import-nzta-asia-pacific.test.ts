import { describe, expect, it } from "vitest";
import { buildSourceCatalog, type NztaRecord } from "./import-nzta-asia-pacific";

describe("NZTA Asia-Pacific importer", () => {
  it("normalizes and deduplicates supported Asian-origin vehicle records", () => {
    const records: NztaRecord[] = [
      { MAKE: "Honda", MODEL: "N-Box", VEHICLE_YEAR: 2024, VEHICLE_TYPE: "PASSENGER CAR/VAN" },
      { MAKE: " HONDA ", MODEL: "N-BOX", VEHICLE_YEAR: 2024, VEHICLE_TYPE: "PASSENGER CAR/VAN" },
      { MAKE: "Bajaj", MODEL: "Chetak", VEHICLE_YEAR: 2025, VEHICLE_TYPE: "MOPED" },
      { MAKE: "Hino", MODEL: "Poncho", VEHICLE_YEAR: 2023, VEHICLE_TYPE: "BUS" },
      { MAKE: "Ignored", MODEL: "Trailer", VEHICLE_YEAR: 2024, VEHICLE_TYPE: "TRAILER/CARAVAN" },
    ];

    const catalog = buildSourceCatalog(records, "2026-08-25");
    expect(catalog.metadata.id).toBe("nzta-asia-pacific-mvr");
    expect(catalog.metadata.retrievedAt).toBe("2026-08-25");
    expect(catalog.makes.map((make) => make.make_name)).toEqual(["BAJAJ", "HINO", "HONDA"]);
    expect(catalog.models).toHaveLength(3);
    expect(catalog.vehicleTypes.map((type) => type.vehicle_type_id)).toEqual([1, 2, 5]);
  });
});
