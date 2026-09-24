/** Official EPA bulk feed. Configuration names remain distinct; no suffix stripping. */
import fs from "fs";
import path from "path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { stableSourceId, assertNoIdCollision, writeSnapshot, type SourceCatalog } from "./catalog-types";
export const FEED_URL = "https://www.fueleconomy.gov/feg/epadata/vehicles.csv";
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === "," || c === "\n")) {
      row.push(field.replace(/\r$/, "")); field = "";
      if (c === "\n") { rows.push(row); row = []; }
    } else field += c;
  }
  if (quoted) throw new Error("Unterminated CSV field");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift(); if (!headers) throw new Error("Missing CSV header");
  for (const key of ["id", "make", "model", "year", "VClass"]) if (!headers.includes(key)) throw new Error(`Missing EPA column ${key}`);
  return rows.filter(r => r.some(Boolean)).map(r => {
    if (r.length !== headers.length) throw new Error("CSV column count mismatch");
    return Object.fromEntries(headers.map((h, i) => [h, r[i]]));
  });
}
export function epaVehicleType(value: string): number {
  if (/Special Purpose/i.test(value)) return 10002;
  if (/Pickup|Cargo/i.test(value)) return 3;
  if (/Sport Utility|SUV|Minivan|Passenger Van|Vans, Passenger/i.test(value)) return 7;
  if (/Car|Seater|Station Wagon/i.test(value)) return 2;
  throw new Error(`Unmapped EPA vehicle class: ${value}`);
}
export function buildSourceCatalog(rows: Record<string, string>[], retrievedAt: string): SourceCatalog {
  // Reviewed separator-only spelling: preserve the established catalog phrase.
  // Raw EPA spelling remains in the evidence sidecar; no body/spec tokens are removed.
  rows = rows.map(r => r.make === "Mercedes-Benz" && r.model === "AMG G63" ? { ...r, model: "AMG G 63" } : r);
  const makeNames = [...new Set(rows.map(r => r.make.trim().toUpperCase()))].sort();
  const modelNames = [...new Set(rows.map(r => r.model.trim()))].sort();
  const used = new Map<number, string>();
  const id = (key: string) => { const value = stableSourceId(key); assertNoIdCollision(used, value, key, "EPA"); return value; };
  const makes = makeNames.map(name => ({ make_id: id(`fueleconomy-us:make:${name}`), make_name: name }));
  const makeIds = new Map(makes.map(m => [m.make_name, m.make_id]));
  const names = new Map(modelNames.map((n, i) => [n, i]));
  const unique = new Map<string, SourceCatalog["models"][number]>();
  for (const r of rows) {
    const make = r.make.trim().toUpperCase(), model = r.model.trim(), year = Number(r.year);
    if (!make || !model || !Number.isInteger(year) || year < 1984 || year > 2200 || !/^\d+$/.test(r.id)) throw new Error("Invalid EPA identity");
    const type = epaVehicleType(r.VClass);
    const tuple: SourceCatalog["models"][number] = [year, makeIds.get(make)!, id(`fueleconomy-us:model:${make}:${model.toUpperCase()}`), names.get(model)!, type];
    unique.set(tuple.join(":"), tuple);
  }
  const models = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[3] - b[3] || a[4] - b[4]);
  return { metadata: { id: "fueleconomy-us", name: "FuelEconomy.gov U.S. model configurations", url: "https://www.fueleconomy.gov/feg/ws/", license: "U.S. government public data", region: "United States", retrievedAt,
    description: "EPA model-year configuration names. Body, drivetrain and performance suffixes are preserved; configurations are not assertions of visual equivalence." },
    makes, modelNames, models, vehicleTypes: [{ vehicle_type_id: 10002, vehicle_type_name: "Other Vehicle" }, { vehicle_type_id: 2, vehicle_type_name: "Passenger Car" }, { vehicle_type_id: 3, vehicle_type_name: "Truck" }, { vehicle_type_id: 7, vehicle_type_name: "Multipurpose Passenger Vehicle (MPV)" }].filter(t => models.some(r => r[4] === t.vehicle_type_id)) };
}
async function main() {
  const { values: args } = parseArgs({ options: { input: { type: "string" }, out: { type: "string", default: "data/sources/fueleconomy-us.json" }, "start-year": { type: "string", default: "2022" }, "end-year": { type: "string", default: String(new Date().getUTCFullYear() + 1) }, "retrieved-at": { type: "string" }, "evidence-out": { type: "string", default: "data/evidence/fueleconomy-us.json" }, prune: { type: "boolean", default: false } } });
  const start = Number(args["start-year"]), end = Number(args["end-year"]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1984 || end > 2200 || start > end) throw new Error("Invalid year range");
  let csv: string;
  if (args.input) csv = fs.readFileSync(args.input, "utf8");
  else {
    let downloaded: string | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(120_000) });
      if (response.ok) { downloaded = await response.text(); break; }
      if (attempt === 3 || (response.status < 500 && response.status !== 429)) throw new Error(`EPA HTTP ${response.status}`);
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
    if (!downloaded) throw new Error("Empty EPA download");
    csv = downloaded;
    fs.mkdirSync(".cache/fueleconomy", { recursive: true }); fs.writeFileSync(".cache/fueleconomy/vehicles.csv", csv);
  }
  const rows = parseCsv(csv).filter(r => Number(r.year) >= start && Number(r.year) <= end);
  if (!rows.length) throw new Error("EPA returned no rows in requested range");
  const retrievedAt = args["retrieved-at"] ?? new Date().toISOString().slice(0, 10);
  const catalog = buildSourceCatalog(rows, retrievedAt);
  const fields = ["id", "make", "model", "year", "VClass", "drive", "trany", "cylinders", "displ", "fuelType", "eng_dscr", "atvType"];
  fs.mkdirSync(path.dirname(args["evidence-out"]!), { recursive: true });
  fs.writeFileSync(args["evidence-out"]!, JSON.stringify({ schemaVersion: 1, sourceId: catalog.metadata.id, url: FEED_URL, retrievedAt, sha256: createHash("sha256").update(csv).digest("hex"), yearBasis: "model-year", records: rows.map(r => Object.fromEntries(fields.filter(k => r[k]).map(k => [k, r[k]]))) }));
  writeSnapshot(args.out!, catalog, args.prune!);
  console.log(`EPA: ${rows.length} configurations → ${catalog.models.length} model/year/type records`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
