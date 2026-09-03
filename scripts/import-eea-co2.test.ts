import { describe, expect, it } from "vitest";
import { buildSourceCatalog, selectYearTables, type EeaRow } from "./import-eea-co2";

describe("EEA CO2 importer", () => {
  it("prefers final per-year register tables over provisional ones", () => {
    const tables = selectYearTables(
      [
        "co2cars",
        "co2cars_2023Pv27",
        "co2cars_2023Fv28",
        "co2cars_2024Pv29",
        "co2cars_2025Pv31",
        "co2cars_2025Pv30",
        "co2vans_2024Fv26",
      ],
      "co2cars",
    );
    expect([...tables]).toEqual([
      [2023, "co2cars_2023Fv28"],
      [2024, "co2cars_2024Pv29"],
      [2025, "co2cars_2025Pv31"],
    ]);
  });

  it("aggregates register rows into model-year entries", () => {
    const rows: EeaRow[] = [
      { Year: 2024, MS: "DE", Mk: "BYD", Cn: "ATTO 3", Ct: "M1", Cr: "M1", n: 900 },
      { Year: 2024, MS: "FR", Mk: "BYD", Cn: "Atto 3", Ct: "M1G", Cr: "M1", n: 100 },
      { Year: 2024, MS: "DE", Mk: "BYD", Cn: "SEAL U", Ct: "", Cr: "M1", n: 50 },
      { Year: 2024, MS: "NL", Mk: "BYD", Cn: "SEAL U", Ct: "M1", Cr: "M1", n: 50 },
      { Year: 2024, MS: "DE", Mk: "BYD", Cn: "SAEL", Ct: "M1", Cr: "M1", n: 2 },
      { Year: 2024, MS: "IT", Mk: "BYD", Cn: "SAEL", Ct: "M1", Cr: "M1", n: 2 },
      // Trim-level names reported by one country only are dropped.
      { Year: 2024, MS: "ES", Mk: "BYD", Cn: "DOLPHIN COMFORT 150 KW", Ct: "M1", Cr: "M1", n: 200 },
      { Year: 2024, MS: "ES", Mk: "BYD", Cn: "DOLPHIN DESIGN 5P", Ct: "M1", Cr: "M1", n: 200 },
      // A single country reporting a model very often is trusted.
      { Year: 2024, MS: "NO", Mk: "BYD", Cn: "TANG", Ct: "M1", Cr: "M1", n: 1_500 },
      // Punctuation variants merge under the most reported spelling.
      { Year: 2024, MS: "DE", Mk: "VOLKSWAGEN, VW", Cn: "ID.4 PRO 150 KW", Ct: "M1", Cr: "M1", n: 300 },
      { Year: 2024, MS: "FR", Mk: "VOLKSWAGEN VW", Cn: "ID 4 PRO", Ct: "M1", Cr: "M1", n: 100 },
      { Year: 2024, MS: "AT", Mk: "VW", Cn: "ID.4 PRO", Ct: "M1", Cr: "M1", n: 300 },
      { Year: 2023, MS: "SE", Mk: "VOLKSWAGEN", Cn: "ID 4 PRO", Ct: "M1", Cr: "M1", n: 100 },
      { Year: 2023, MS: "DK", Mk: "VOLKSWAGEN", Cn: "ID 4 PRO", Ct: "M1", Cr: "M1", n: 100 },
      { Year: 2024, MS: "DE", Mk: "FORD WERKE GMBH", Cn: "TRANSIT CUSTOM", Ct: "N1", Cr: "N1", n: 40, register: "co2vans" },
      { Year: 2024, MS: "PL", Mk: "FORD", Cn: "TRANSIT CUSTOM", Ct: "N1", Cr: "N1", n: 40, register: "co2vans" },
      { Year: 2024, MS: "IT", Mk: "FIAT", Cn: "DUCATO", Ct: "", Cr: "", n: 40, register: "co2vans" },
      { Year: 2024, MS: "FR", Mk: "FIAT", Cn: "DUCATO", Ct: "", Cr: "", n: 40, register: "co2vans" },
      { Year: 2024, MS: "FR", Mk: "PSA AUTOMOBILES SA", Cn: "308", Ct: "M1", Cr: "M1", n: 500 },
      { Year: 2024, MS: "DE", Mk: "PSA AUTOMOBILES SA", Cn: "308", Ct: "M1", Cr: "M1", n: 500 },
      { Year: 2024, MS: "FR", Mk: "1089", Cn: "X", Ct: "M1", Cr: "M1", n: 500 },
      { Year: 2024, MS: "DE", Mk: "1089", Cn: "X", Ct: "M1", Cr: "M1", n: 500 },
    ];

    const catalog = buildSourceCatalog(rows, { minCount: 5, retrievedAt: "2026-09-03" });
    expect(catalog.metadata.id).toBe("eea-co2-monitoring");
    expect(catalog.metadata.retrievedAt).toBe("2026-09-03");
    expect(catalog.makes.map((make) => make.make_name)).toEqual(["BYD", "FIAT", "FORD", "VOLKSWAGEN"]);
    expect(catalog.vehicleTypes.map((type) => type.vehicle_type_id)).toEqual([2, 3]);

    const entries = catalog.models.map((model) => {
      const make = catalog.makes.find((candidate) => candidate.make_id === model[1])!;
      return `${model[0]} ${make.make_name} ${catalog.modelNames[model[3]]} ${model[4]}`;
    });
    expect(entries).toEqual([
      "2023 VOLKSWAGEN ID.4 PRO 2",
      "2024 BYD ATTO 3 2",
      "2024 BYD SEAL U 2",
      "2024 BYD TANG 2",
      "2024 FIAT DUCATO 3",
      "2024 FORD TRANSIT CUSTOM 3",
      "2024 VOLKSWAGEN ID.4 PRO 2",
    ]);
    expect(catalog.modelNames).not.toContain("ID 4 PRO");

    // IDs are deterministic and namespaced away from vPIC IDs.
    expect(catalog.makes.every((make) => make.make_id >= 1_000_000_000)).toBe(true);
    expect(buildSourceCatalog(rows, { minCount: 5, retrievedAt: "2026-09-03" })).toEqual(catalog);
  });
});
