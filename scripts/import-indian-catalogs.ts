/** Refresh reviewed product mappings from official Indian sales catalogs. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildReviewedCatalog, type ReviewedModel } from "./import-reviewed-models";
import { writeSnapshot, type SourceMetadata } from "./catalog-types";

export interface ProductMapping {
  rawName: string;
  url: string;
  model: string;
  vehicleTypeId: number;
  scope: "product" | "family";
}
export interface CatalogGroup {
  id: string;
  url: string;
  cacheFile: string;
  make: string;
  makeId: number;
  batch: string;
  mappings: ProductMapping[];
  headingMappings?: ProductMapping[];
  titleMappings?: ProductMapping[];
  selectorMappings?: ProductMapping[];
}
export interface CatalogObservation extends ReviewedModel {
  rawName: string;
  indexUrl: string;
  scope: "product" | "family";
  yearBasis: "catalog-year";
}

export function decodeText(html: string): string {
  const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", plus: "+" };
  return html.replace(/<[^>]*>/g, " ").replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, key: string) => {
    if (!key.startsWith("#")) return entities[key.toLowerCase()] ?? whole;
    const value = key.toLowerCase().startsWith("#x") ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
  }).replace(/\s+/g, " ").trim();
}
const normalized = (value: string) => decodeText(value).toUpperCase();

export function stripNonCatalogMarkup(html: string): string {
  let previous: string;
  do {
    previous = html;
    // Retain a separator so deleting markup cannot assemble a new tag from its neighbors.
    html = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  } while (html !== previous);
  return html;
}

/** Inspect inert markup only. Script data, image alt labels and manual filenames are not sales evidence. */
export function parseSalesCatalog(html: string, baseUrl: string) {
  const body = stripNonCatalogMarkup(html);
  const links = [...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].flatMap(match => {
    const attribute = match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = attribute?.[1] ?? attribute?.[2] ?? attribute?.[3];
    if (!href) return [];
    try {
      const url = new URL(decodeText(href), baseUrl);
      if (url.protocol !== "https:") return [];
      return [{ url: url.href, name: decodeText(match[2]) }];
    } catch { return []; }
  });
  const headings = [...body.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi)].map(m => decodeText(m[1]));
  const titles = [...body.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(m => decodeText(m[1]));
  // Bajaj exposes reviewed product names in its current vehicle selector, rather than anchor labels.
  const selectors = [...body.matchAll(/<div\b[^>]*class="[^"]*\bbaj-nav-card\b[^"]*"[^>]*data-model-name="([^"]+)"[^>]*>/gi)].map(m => decodeText(m[1]));
  return { links, headings, titles, selectors };
}

export function salesObservations(group: CatalogGroup, html: string, date: string): CatalogObservation[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid catalog observation date");
  }
  const parsed = parseSalesCatalog(html, group.url);
  const validate = (mapping: ProductMapping, kind: "link" | "heading" | "title" | "selector") => {
    const expected = normalized(mapping.rawName);
    const found = kind === "link"
      ? parsed.links.some(link => link.url === mapping.url && normalized(link.name) === expected)
      : parsed[kind === "heading" ? "headings" : kind === "selector" ? "selectors" : "titles"].some(name => normalized(name) === expected);
    if (!found) throw new Error(`${group.id}: reviewed ${kind} missing: ${mapping.rawName}`);
    if (new URL(mapping.url).origin !== new URL(group.url).origin) throw new Error("Product evidence must stay on the reviewed official host");
    return { year: Number(date.slice(0, 4)), make: group.make, makeId: group.makeId,
      model: mapping.model, vehicleTypeId: mapping.vehicleTypeId, market: "IN", url: mapping.url,
      rawName: decodeText(mapping.rawName), indexUrl: group.url, scope: mapping.scope, yearBasis: "catalog-year" as const,
      note: `Reviewed ${mapping.scope} name in the official Indian sales catalog observed ${date}. Calendar-year availability only; no historical model-year range, generation, trim or image equivalence inferred.` };
  };
  return [
    ...group.mappings.map(m => validate(m, "link")),
    ...(group.headingMappings ?? []).map(m => validate(m, "heading")),
    ...(group.titleMappings ?? []).map(m => validate(m, "title")),
    ...(group.selectorMappings ?? []).map(m => validate(m, "selector")),
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  if (args.includes("--help")) {
    console.log("Usage: refresh:india [--batch tvs|hero|commercial|passenger|two-wheelers] [--date YYYY-MM-DD] [--offline] [--cache-dir DIR]"); return;
  }
  if (args.includes("--offline") && !args.includes("--date")) throw new Error("Offline refresh requires the original observation --date");
  const root = path.resolve(__dirname, "..");
  const cache = path.resolve(option("--cache-dir", path.join(root, ".cache/indian-catalogs")));
  const date = option("--date", new Date().toISOString().slice(0, 10));
  const groups: CatalogGroup[] = JSON.parse(fs.readFileSync(path.join(root, "data/evidence/indian-catalog-mappings.json"), "utf8")).groups;
  const batches = ["tvs", "hero", "commercial", "passenger", "two-wheelers"];
  const selected = args.includes("--batch") ? [option("--batch", "")] : batches;
  if (selected.some(b => !batches.includes(b))) throw new Error("Unknown India batch");
  fs.mkdirSync(cache, { recursive: true });
  for (const batch of selected) {
    const records: CatalogObservation[] = [];
    const audits: { url: string; sha256: string; recordCount: number }[] = [];
    for (const group of groups.filter(g => g.batch === batch)) {
      const file = path.join(cache, group.cacheFile);
      let html: string;
      if (args.includes("--offline")) html = fs.readFileSync(file, "utf8");
      else {
        const response = await fetch(group.url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`${group.id}: HTTP ${response.status}`);
        if (!response.headers.get("content-type")?.includes("text/html")) throw new Error(`${group.id}: expected sales HTML`);
        html = await response.text();
        fs.writeFileSync(file, html);
      }
      const observed = salesObservations(group, html, date);
      if (!observed.length) throw new Error(`${group.id}: empty reviewed product catalog`);
      records.push(...observed);
      audits.push({ url: group.url, sha256: createHash("sha256").update(html).digest("hex"), recordCount: observed.length });
    }
    const id = `india-${batch}-sales-catalog`;
    const metadata: SourceMetadata = { id, name: `Reviewed Indian ${batch} manufacturer sales catalogs`,
      url: groups.find(g => g.batch === batch)!.url, region: "India", retrievedAt: date,
      license: "Source attribution (factual product names only)", yearBasis: "catalog-year",
      description: "Official Indian product and family names observed in a dated sales catalog. Calendar-year presence is not factory model year; original names, per-manufacturer URLs and scope remain in data/evidence/manufacturer-catalogs/." };
    const unique = [...new Map(records.map(r => [[r.year, r.makeId, r.model, r.vehicleTypeId].join("\0"), r])).values()];
    const catalog = buildReviewedCatalog(unique, metadata);
    const evidencePath = path.join(root, "data/evidence/manufacturer-catalogs", `india-${batch}.json`);
    const previous: { records: CatalogObservation[]; audits?: object[] } = fs.existsSync(evidencePath) ? JSON.parse(fs.readFileSync(evidencePath, "utf8")) : { records: [] };
    const evidenceRecords = [...new Map([...previous.records, ...records].map(r => [[r.year, r.makeId, r.model, r.vehicleTypeId, r.url].join("\0"), r])).values()];
    const evidenceAudits = [...new Map([...(previous.audits ?? []), ...audits].map(a => [JSON.stringify(a), a])).values()];
    fs.writeFileSync(evidencePath, JSON.stringify({ schemaVersion: 1, observedAt: date, audits: evidenceAudits, records: evidenceRecords }, null, 2) + "\n");
    writeSnapshot(path.join(root, "data/sources", id + ".json"), catalog, false);
    console.log(`${id}: ${unique.length} dated product/family selections`);
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
