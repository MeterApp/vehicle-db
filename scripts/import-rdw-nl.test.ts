import { describe, expect, it } from "vitest";
import { buildSourceCatalog, type RdwRow } from "./import-rdw-nl";

describe("RDW Netherlands importer", () => {
  it("aggregates register rows into model-year entries", () => {
    const rows: RdwRow[] = [
      { year: 2026, merk: "BYD", handelsbenaming: "BYD SEAL U DM-I", voertuigsoort: "Personenauto", n: "2657" },
      { year: 2026, merk: "BYD", handelsbenaming: "SEAL U DM-I", voertuigsoort: "Personenauto", n: "74" },
      { year: 2026, merk: "BYD", handelsbenaming: "SEAL U DMI", voertuigsoort: "Personenauto", n: "1" },
      { year: 2026, merk: "BYD", handelsbenaming: "DOLPIN SURF COMFORT", voertuigsoort: "Personenauto", n: "1" },
      { year: 2026, merk: "BYD", handelsbenaming: "BYD ATTO 2  DM-I", voertuigsoort: "Personenauto", n: "974" },
      { year: 2026, merk: "TOYOTA", handelsbenaming: "TOYOTA AYGO X", voertuigsoort: "Personenauto", n: "5673" },
      { year: 2026, merk: "VW", handelsbenaming: "ID.4 PRO 210KW", voertuigsoort: "Personenauto", n: "1421" },
      { year: 2025, merk: "VOLKSWAGEN", handelsbenaming: "ID.4 PRO", voertuigsoort: "Personenauto", n: "300" },
      { year: 2026, merk: "FORD", handelsbenaming: "TRANSIT CUSTOM", voertuigsoort: "Bedrijfsauto", n: "2435" },
      { year: 2026, merk: "SEAT", handelsbenaming: "CUPRA FORMENTOR", voertuigsoort: "Personenauto", n: "12" },
      { year: 2026, merk: "VDL", handelsbenaming: "CITEA", voertuigsoort: "Bus", n: "40" },
      { year: 2026, merk: "HONDA", handelsbenaming: "CB750", voertuigsoort: "Motorfiets", n: "40" },
      { year: 2026, merk: "BMW", handelsbenaming: "R 1300 GS", voertuigsoort: "Aanhangwagen", n: "40" },
      { year: 2026, merk: "", handelsbenaming: "MYSTERY", voertuigsoort: "Personenauto", n: "40" },
      { year: 2026, merk: "PEUGEOT", handelsbenaming: null, voertuigsoort: "Personenauto", n: "40" },
    ];

    const catalog = buildSourceCatalog(rows, { minCount: 3, retrievedAt: "2026-09-03" });
    expect(catalog.metadata.id).toBe("rdw-nl-vehicle-register");
    expect(catalog.makes.map((make) => make.make_name)).toEqual([
      "BYD",
      "CUPRA",
      "FORD",
      "HONDA",
      "TOYOTA",
      "VDL",
      "VOLKSWAGEN",
    ]);
    expect(catalog.vehicleTypes.map((type) => type.vehicle_type_id)).toEqual([1, 2, 3, 5]);

    const entries = catalog.models.map((model) => {
      const make = catalog.makes.find((candidate) => candidate.make_id === model[1])!;
      return `${model[0]} ${make.make_name} ${catalog.modelNames[model[3]]} ${model[4]}`;
    });
    expect(entries).toEqual([
      "2025 VOLKSWAGEN ID.4 PRO 2",
      "2026 BYD ATTO 2 DM-I 2",
      "2026 BYD SEAL U DM-I 2",
      "2026 CUPRA FORMENTOR 2",
      "2026 FORD TRANSIT CUSTOM 3",
      "2026 HONDA CB750 1",
      "2026 TOYOTA AYGO X 2",
      "2026 VDL CITEA 5",
      "2026 VOLKSWAGEN ID.4 PRO 2",
    ]);
    expect(catalog.makes.every((make) => make.make_id >= 1_000_000_000)).toBe(true);
    expect(buildSourceCatalog(rows, { minCount: 3, retrievedAt: "2026-09-03" })).toEqual(catalog);
  });
});
