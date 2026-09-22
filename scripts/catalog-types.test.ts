import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { retainPublishedEntries, writeSnapshot, type SourceCatalog } from "./catalog-types";

const metadata = {
  id: "test-source",
  name: "Test source",
  url: "https://example.org",
  license: "CC0",
  region: "Test",
  description: "Test",
  retrievedAt: "2026-09-22",
};

function catalog(
  makes: [number, string][],
  models: [number, number, number, string, number][],
): SourceCatalog {
  const modelNames = [...new Set(models.map((model) => model[3]))].sort();
  return {
    metadata,
    vehicleTypes: [...new Set(models.map((model) => model[4]))]
      .sort((left, right) => left - right)
      .map((id) => ({ vehicle_type_id: id, vehicle_type_name: id === 1 ? "Motorcycle" : "Passenger Car" })),
    makes: makes.map(([make_id, make_name]) => ({ make_id, make_name })),
    modelNames,
    models: models.map(([year, makeId, modelId, name, type]) => [
      year,
      makeId,
      modelId,
      modelNames.indexOf(name),
      type,
    ]),
  };
}

function entries(source: SourceCatalog): string[] {
  const makeNames = new Map(source.makes.map((make) => [make.make_id, make.make_name]));
  return source.models.map(
    ([year, makeId, modelId, nameIndex, type]) =>
      `${year} ${makeNames.get(makeId)} ${source.modelNames[nameIndex]} #${modelId} t${type}`,
  );
}

describe("retainPublishedEntries", () => {
  it("returns the refreshed snapshot untouched when nothing disappeared", () => {
    const previous = catalog([[1, "AUDI"]], [[2025, 1, 10, "A4", 2]]);
    const next = catalog([[1, "AUDI"]], [[2025, 1, 10, "A4", 2], [2026, 1, 10, "A4", 2]]);
    const result = retainPublishedEntries(previous, next);
    expect(result.retained).toBe(0);
    expect(result.catalog).toBe(next);
  });

  it("keeps entries, makes and vehicle types the source stopped reporting", () => {
    const previous = catalog(
      [[1, "AUDI"], [2, "ZUNDAPP"]],
      [
        [2025, 1, 10, "A4", 2],
        [2026, 1, 11, "A6", 2],
        [1990, 2, 20, "KS 50", 1],
      ],
    );
    const next = catalog([[1, "AUDI"]], [[2025, 1, 10, "A4", 2], [2026, 1, 12, "Q4", 2]]);
    const result = retainPublishedEntries(previous, next);

    expect(result.retained).toBe(2);
    expect(entries(result.catalog)).toEqual([
      "1990 ZUNDAPP KS 50 #20 t1",
      "2025 AUDI A4 #10 t2",
      "2026 AUDI A6 #11 t2",
      "2026 AUDI Q4 #12 t2",
    ]);
    expect(result.catalog.makes.map((make) => make.make_name)).toEqual(["AUDI", "ZUNDAPP"]);
    expect(result.catalog.vehicleTypes.map((type) => type.vehicle_type_id)).toEqual([1, 2]);
    expect(result.catalog.modelNames).toEqual(["A4", "A6", "KS 50", "Q4"]);
    expect(result.catalog.metadata).toBe(next.metadata);
  });

  it("keeps a renamed model's old entry beside the new one", () => {
    const previous = catalog([[1, "POLESTAR"]], [[2024, 1, 30, "PS2", 2]]);
    const next = catalog([[1, "POLESTAR"]], [[2024, 1, 31, "POLESTAR 2", 2]]);
    expect(entries(retainPublishedEntries(previous, next).catalog)).toEqual([
      "2024 POLESTAR POLESTAR 2 #31 t2",
      "2024 POLESTAR PS2 #30 t2",
    ]);
  });

  it("has nothing to keep for a first import", () => {
    const next = catalog([[1, "AUDI"]], [[2025, 1, 10, "A4", 2]]);
    expect(retainPublishedEntries(undefined, next)).toEqual({ catalog: next, retained: 0 });
  });
});

describe("writeSnapshot", () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  function outPath(): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle-db-snapshot-"));
    directories.push(directory);
    return path.join(directory, "source.json");
  }

  it("keeps published entries unless the refresh prunes", () => {
    const file = outPath();
    fs.writeFileSync(file, JSON.stringify(catalog([[1, "AUDI"]], [[2025, 1, 10, "A4", 2]])));
    const fresh = catalog([[1, "AUDI"]], [[2026, 1, 12, "Q4", 2]]);

    expect(entries(writeSnapshot(file, fresh, false))).toEqual(["2025 AUDI A4 #10 t2", "2026 AUDI Q4 #12 t2"]);
    expect(entries(JSON.parse(fs.readFileSync(file, "utf8")) as SourceCatalog)).toHaveLength(2);

    expect(entries(writeSnapshot(file, fresh, true))).toEqual(["2026 AUDI Q4 #12 t2"]);
    expect(entries(JSON.parse(fs.readFileSync(file, "utf8")) as SourceCatalog)).toEqual(["2026 AUDI Q4 #12 t2"]);
  });
});
