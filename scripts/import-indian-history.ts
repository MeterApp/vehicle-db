/** Consolidates reviewed historical manufacturer portfolios into the existing India sources. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildReviewedCatalog } from "./import-reviewed-models";
import { writeSnapshot, type SourceCatalog } from "./catalog-types";
import { decodeText, type CatalogObservation } from "./import-indian-catalogs";

interface PortfolioRow { rawName: string; model: string; vehicleTypeId: number; proof: string; scope: "family" | "product" }
export interface HistoricalReport {
  id: string; batch: string; make: string; makeId: number; url: string; cacheFile: string;
  kind: "pdf-portfolio" | "html-portfolio" | "mahindra-monthly";
  year: number; page?: number; dateProof: string;
  blockStart?: string; blockEnd?: string;
  rows: PortfolioRow[];
}
const compact = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toUpperCase();

/** Only positive domestic SALES establish the calendar year; production/export are separate columns. */
export function mahindraMonthlyRows(text: string, reportYear: number) {
  if (!Number.isInteger(reportYear) || reportYear < 1991) throw new Error("Invalid monthly report year");
  const header = `Jun-${String(reportYear - 1).slice(-2)} Jun-${String(reportYear).slice(-2)}`;
  if (!text.startsWith(`SIAM Category Model Fuel Type ${header} ${header} ${header}`) || !/Production\s+Sales\s+Export/.test(text)) {
    throw new Error("Unreviewed monthly column layout");
  }
  const result: { year: number; rawName: string; sales: number }[] = [];
  const rows = text.replace(/Diesel and\s*\nElectric/g, "Diesel and Electric").split(/\r?\n/);
  for (const line of rows) {
    const m = line.match(/^Utility Vehicles (.+?) (Diesel and Electric|Diesel|Petrol|CNG|Electric) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)$/);
    if (!m || /\band\b/.test(m[1])) continue; // Never allocate a combined count to individual models.
    for (const [year, sales] of [[reportYear - 1, Number(m[5])], [reportYear, Number(m[6])]]) {
      if (sales > 0) result.push({ year, rawName: m[1], sales });
    }
  }
  if (!result.length) throw new Error("No individual domestic sales rows");
  return result;
}

export function historicalObservations(report: HistoricalReport, pages: string[]): CatalogObservation[] {
  if (!Number.isInteger(report.year) || report.year < 1990 || !compact(pages.join("\n")).includes(compact(report.dateProof))) {
    throw new Error(`${report.id}: missing dated report evidence`);
  }
  let text = pages[(report.page ?? 1) - 1];
  if (text === undefined) throw new Error(`${report.id}: missing page`);
  if (report.kind === "mahindra-monthly") {
    return mahindraMonthlyRows(text, report.year).map(row => {
      const mapping = report.rows.find(m => m.rawName === row.rawName);
      if (!mapping) throw new Error(`${report.id}: unreviewed sales model ${row.rawName}`);
      return observation(report, mapping, row.year,
        `Positive individual domestic sales in June ${row.year}. Production-only, export-only and combined-model counts are excluded. Published sales are unaudited; presence is a calendar-year fact, not a factory model year.`);
    });
  }
  if (report.kind === "html-portfolio") text = decodeText(text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ""));
  if (report.blockStart || report.blockEnd) {
    if (!report.blockStart || !report.blockEnd) throw new Error("Both portfolio bounds required");
    const start = text.indexOf(report.blockStart), end = text.indexOf(report.blockEnd, start);
    if (start < 0 || end < start) throw new Error(`${report.id}: portfolio bounds missing`);
    text = text.slice(start, end);
  }
  return report.rows.map(row => {
    if (!compact(text).includes(compact(row.proof)) || !compact(row.proof).includes(compact(row.rawName))) {
      throw new Error(`${report.id}: original name/proof missing: ${row.rawName}`);
    }
    return observation(report, row, report.year,
      `Reviewed dated Indian portfolio on physical page ${report.page ?? 1}. Original family/product name preserved. Calendar-year availability only; fiscal-year periods, launch dates and variant suffixes do not create inferred histories or image equivalence.`);
  });
}
function observation(report: HistoricalReport, row: PortfolioRow, year: number, note: string): CatalogObservation {
  return { year, make: report.make, makeId: report.makeId, model: row.model,
    vehicleTypeId: row.vehicleTypeId, market: "IN", url: report.url, indexUrl: report.url,
    rawName: row.rawName, scope: row.scope, yearBasis: "catalog-year", note };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  if (args.includes("--help")) { console.log("Usage: refresh:india-history [--offline] [--date YYYY-MM-DD] [--cache-dir DIR] [--python PATH]"); return; }
  if (args.includes("--offline") && !args.includes("--date")) throw new Error("Offline refresh requires original retrieval --date");
  const date = option("--date", new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Invalid retrieval date");
  const root = path.resolve(__dirname, "..");
  const cache = path.resolve(option("--cache-dir", path.join(root, ".cache/indian-history")));
  const python = option("--python", process.env.INDIA_HISTORY_PYTHON ?? "python3");
  const reports: HistoricalReport[] = JSON.parse(fs.readFileSync(path.join(root, "data/evidence/indian-history-mappings.json"), "utf8")).reports;
  fs.mkdirSync(cache, { recursive: true });
  const batches = new Map<string, { records: CatalogObservation[]; audits: object[] }>();
  for (const report of reports) {
    if (!["passenger", "two-wheelers", "commercial", "hero", "tvs"].includes(report.batch)) throw new Error("Unknown existing India batch");
    const target = path.join(cache, report.cacheFile);
    if (!args.includes("--offline")) {
      const response = await fetch(report.url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${report.id}: HTTP ${response.status}`);
      fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    }
    const bytes = fs.readFileSync(target);
    let pages: string[];
    if (report.kind === "html-portfolio") pages = [bytes.toString("utf8")];
    else {
      if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error(`${report.id}: expected PDF, refusing HTML/error response`);
      // Fixed extractor code; no source text is executed. pypdf is an optional refresh-time dependency only.
      const output = execFileSync(python, ["-c", "import json,sys; from pypdf import PdfReader; print(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages]))", target], { maxBuffer: 20 * 1024 * 1024 });
      pages = JSON.parse(output.toString());
    }
    const rows = historicalObservations(report, pages);
    const batch = batches.get(report.batch) ?? { records: [], audits: [] };
    batch.records.push(...rows);
    batch.audits.push({ url: report.url, sha256: createHash("sha256").update(bytes).digest("hex"), reportId: report.id, recordCount: rows.length });
    batches.set(report.batch, batch);
  }
  for (const [batch, fresh] of batches) {
    const id = `india-${batch}-sales-catalog`;
    const out = path.join(root, "data/sources", id + ".json");
    const previous: SourceCatalog = JSON.parse(fs.readFileSync(out, "utf8"));
    const evidencePath = path.join(root, "data/evidence/manufacturer-catalogs", `india-${batch}.json`);
    const evidence: { records: CatalogObservation[]; audits: { url: string; sha256: string }[] } = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    const records = [...new Map([...evidence.records, ...fresh.records].map(r => [[r.year, r.makeId, r.model, r.vehicleTypeId, r.url].join("\0"), r])).values()];
    const audits = [...new Map([...evidence.audits, ...fresh.audits].map(a => [JSON.stringify(a), a])).values()];
    const tuples = [...new Map(records.map(r => [[r.year, r.makeId, r.model, r.vehicleTypeId].join("\0"), r])).values()];
    writeSnapshot(out, buildReviewedCatalog(tuples, { ...previous.metadata, retrievedAt: date }), false);
    fs.writeFileSync(evidencePath, JSON.stringify({ schemaVersion: 1, observedAt: date, audits, records }, null, 2) + "\n");
    console.log(`${id}: ${tuples.length} consolidated current/historical selections`);
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
