import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAvailableYears, getDataSources, getMakes, getModels, getVehicleTypes } from "./index";

/**
 * The README's figures, counted from the data so a release cannot ship stale
 * ones: the repository description still said 1,599 makes and 36,998 models
 * two releases after the package had moved on, and assistants quote the README.
 * Makes, models and model years are distinct names with case, accents and
 * punctuation ignored -- the key the Car Image API builds its slugs with, so
 * the two quote one catalog -- and the records are what getMakes() and
 * getModels() return.
 */
const key = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const format = (value: number) => value.toLocaleString("en-US");

function snapshot() {
  const makes = new Set<string>();
  const models = new Set<string>();
  const modelYears = new Set<string>();
  const years = getAvailableYears();
  for (const year of years) {
    for (const row of getModels({ year })) {
      const make = key(row.makeName);
      const model = key(row.modelName);
      if (!make || !model) continue;
      makes.add(make);
      models.add(`${make}/${model}`);
      modelYears.add(`${make}/${model}/${year}`);
    }
  }
  const records = getModels();
  return {
    years: `${Math.min(...years)}–${Math.max(...years)}`,
    sources: getDataSources().length,
    vehicleTypes: getVehicleTypes().length,
    makes: makes.size,
    models: models.size,
    modelYears: modelYears.size,
    makeRecords: getMakes().length,
    modelRecords: new Set(records.map((model) => model.modelId)).size,
    modelYearRecords: records.length,
  };
}

describe("README", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const stats = snapshot();

  it("leads with the snapshot's makes, models and model years", () => {
    expect(readme).toContain(
      `The current snapshot spans **${stats.years}** and includes **${format(stats.makes)} makes** and **${format(stats.models)} models** in **${format(stats.modelYears)} model years**, from **${stats.sources} data sources**.`,
    );
    expect(readme).toContain(`(${format(stats.makeRecords)} makes from \`getMakes()\`)`);
  });

  it("tabulates the same figures and the records behind them", () => {
    const rows: Record<string, string | number> = {
      Years: stats.years,
      Sources: stats.sources,
      "Vehicle types": stats.vehicleTypes,
      Makes: format(stats.makes),
      Models: format(stats.models),
      "Model years": format(stats.modelYears),
      "Make records (`getMakes()`)": format(stats.makeRecords),
      "Model records (distinct `modelId`)": format(stats.modelRecords),
      "Model-year records (`getModels()`)": format(stats.modelYearRecords),
    };
    for (const [label, value] of Object.entries(rows)) expect(readme).toContain(`| ${label} | ${value} |`);
  });
});
