import { expect, test } from "vitest";
import { historicalObservations, mahindraMonthlyRows, type HistoricalReport } from "./import-indian-history";

const header = "SIAM Category Model Fuel Type Jun-23 Jun-24 Jun-23 Jun-24 Jun-23 Jun-24";
test("monthly reports use domestic sales rather than production or exports, and do not split combined rows", () => {
  const rows = mahindraMonthlyRows(header + "\n" + [
    "Utility Vehicles Marazzo Diesel 96 0 79 12 0 0",
    "Utility Vehicles KUV100 Diesel 8 2 0 0 44 8",
    "Utility Vehicles XUV3XO and XUV400 Diesel and Electric 216 2414 636 3077 0 1",
    "Utility Vehicles XUV3XO Petrol 0 5244 0 5957 0 2",
    "Production Sales Export",
  ].join("\n"), 2024);
  expect(rows).toEqual([
    { year: 2023, rawName: "Marazzo", sales: 79 },
    { year: 2024, rawName: "Marazzo", sales: 12 },
    { year: 2024, rawName: "XUV3XO", sales: 5957 },
  ]);
  expect(() => mahindraMonthlyRows(header.replace("Jun-23", "Jul-23") + "\nProduction Sales Export", 2024)).toThrow(/layout/);
});

const report: HistoricalReport = { id: "fixture", batch: "two-wheelers", make: "EXAMPLE", makeId: 1,
  url: "https://example.com/portfolio.pdf", cacheFile: "fixture.pdf", kind: "pdf-portfolio",
  year: 2024, page: 2, dateProof: "Branding Strategy (2024)",
  rows: [{ rawName: "Model 125", model: "Model 125", vehicleTypeId: 1, proof: "Current range: Model 125, Model 150", scope: "family" }] };
test("dated portfolios require proof on the reviewed page and never infer years from fiscal headings", () => {
  const rows = historicalObservations(report, ["Branding Strategy (2024)", "Current range: Model 125, Model 150"]);
  expect(rows[0]).toMatchObject({ year: 2024, yearBasis: "catalog-year", model: "Model 125" });
  expect(() => historicalObservations(report, ["Financial Year 2023-24", "Current range: Model 125, Model 150"])).toThrow(/dated/);
  expect(() => historicalObservations(report, ["Branding Strategy (2024) Current range: Model 125, Model 150", "Unrelated page"])).toThrow(/proof/);
});

test("HTML history is bounded to its dated portfolio, excluding current navigation and scripts", () => {
  const r: HistoricalReport = { ...report, page: 1, kind: "html-portfolio", dateProof: "February 2024", blockStart: "February 2024", blockEnd: "End portfolio" };
  expect(() => historicalObservations(r, ['<a>Current range: Model 125, Model 150</a><div>February 2024 Missing model End portfolio</div>'])).toThrow(/proof/);
});
