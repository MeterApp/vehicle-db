/** Refreshes official sales catalogs. Names/body mappings are reviewed; dates are never inferred from manual updates. */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { buildReviewedCatalog, type ReviewedModel } from "./import-reviewed-models";
import { writeSnapshot, type SourceMetadata } from "./catalog-types";

export interface Mapping { make: string; makeId: number; model: string; vehicleTypeId: number; panelVan?: string }
interface Rules {
  changan: Record<string, Mapping>;
  sgmw: Record<string, Mapping>;
  bajaj: Record<string, Mapping>;
}
export interface Observation extends ReviewedModel { rawName: string; sourceRecordId: string; yearBasis: "model-year" | "catalog-year" }
export interface SgmwProduct { id: number; brand: string; marketNaming: string; vehicleSeries: string | null; isOnSale: number; enableStatus: number; isDelete: number; configLabels: string[]; bodyFacts: string[] }
export interface ChanganProduct { id: string; rawName: string; status: string; url: string; trimLabels: string[] }
interface Audit { url: string; sha256?: string; status: string; count?: number; note?: string }
const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "data/evidence/manufacturer-catalogs");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

/** Decode only scalar fields from Nuxt's inert pointer table; never execute site JavaScript. */
export function nuxtObjects(html: string): Record<string, unknown>[] {
  const match = html.match(/<script\b[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Missing SGMW server-rendered data");
  const table: unknown[] = JSON.parse(match[1]);
  if (!Array.isArray(table)) throw new Error("Invalid SGMW pointer table");
  const scalar = (ref: unknown): unknown => {
    if (!Number.isInteger(ref)) throw new Error("Invalid SGMW reference");
    const i = ref as number;
    if (i < 0) return null;
    if (i >= table.length) throw new Error("SGMW reference out of bounds");
    return table[i];
  };
  return table.filter(x => x && typeof x === "object" && !Array.isArray(x))
    .map(x => Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([key, ref]) => [key, scalar(ref)])));
}
export function parseSgmwProducts(html: string): SgmwProduct[] {
  const objects = nuxtObjects(html);
  return objects.filter(x => typeof x.marketNaming === "string").map(x => {
    const config = objects.find(c => c.vehicleId === x.id && typeof c.configDetails === "string");
    const labels: { name: string; value: string[] }[] = config
      ? (JSON.parse(config.configDetails as string) as { value: { name: string; value: string[] }[] }[]).flatMap(g => g.value ?? []) : [];
    return { id: x.id as number, brand: x.brand as string, marketNaming: x.marketNaming as string,
      vehicleSeries: x.vehicleSeries as string | null, isOnSale: x.isOnSale as number,
      enableStatus: x.enableStatus as number, isDelete: x.isDelete as number,
      configLabels: labels.filter(r => /车型/.test(r.name)).flatMap(r => r.value).filter(v => typeof v === "string"),
      bodyFacts: labels.filter(r => /乘员|座位|车身结构/.test(r.name)).flatMap(r => r.value).filter(v => typeof v === "string") };
  });
}
export function parseChanganProducts(index: unknown, configurations: unknown): ChanganProduct[] {
  const a = index as { code: number; data: { car_model_id: string; car_model_name: string; car_model_status: string; car_model_url: string }[] };
  const b = configurations as { code: number; data: { carModels: { car_model_id: string; children: { car_type_name: string }[] }[] }[] };
  if (a.code !== 0 || b.code !== 0 || !Array.isArray(a.data) || !Array.isArray(b.data)) throw new Error("Invalid Changan catalog response");
  const labels = new Map(b.data.flatMap(g => g.carModels).map(x => [x.car_model_id, x.children.map(c => c.car_type_name)]));
  return a.data.map(x => ({ id: x.car_model_id, rawName: x.car_model_name.trim(), status: x.car_model_status,
    url: new URL(x.car_model_url, "https://www.changan.com.cn").href, trimLabels: labels.get(x.car_model_id) ?? [] }));
}
/** Only an explicit marketed XX款 label establishes a Chinese manufacturer model year. */
export function explicitModelYears(labels: string[]): number[] {
  return [...new Set(labels.flatMap(s => [...s.matchAll(/\b(20\d{2})\s*款|\b(20\d{2})\s*[^\d\s]*款/g)].map(m => Number(m[1] ?? m[2]))))].sort();
}
export function productLinks(html: string, market?: string): string[] {
  return [...new Set([...html.matchAll(/href=["']([^"']+)["']/g)].flatMap(m => {
    let u: URL; try { u = new URL(m[1].replace(/&amp;/g, "&"), "https://www.bajajauto.com"); } catch { return []; }
    if (!/^(www\.)?bajajauto\.com$/.test(u.hostname)) return [];
    const prefix = market ? `/en-${market.toLowerCase()}/` : "/";
    if (!market && !u.pathname.startsWith("/three-wheelers/")) return [];
    if (!u.pathname.startsWith(prefix) || !/\/(?:three-wheelers|threewheelersandqute)\/.+[^/]$/.test(u.pathname)) return [];
    return [u.origin + u.pathname];
  }))].sort();
}
export function observedRecords(mapping: Mapping, rawName: string, id: string, url: string, market: string,
  date: string, labels: string[], note: string): Observation[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0,10) !== date) throw new Error("Invalid observation date");
  const base = { ...mapping, market, url, rawName, sourceRecordId: id, note };
  delete (base as Partial<Mapping>).panelVan;
  const records: Observation[] = [{ ...base, year: Number(date.slice(0,4)), yearBasis: "catalog-year" }];
  for (const year of explicitModelYears(labels)) records.push({ ...base, year, yearBasis: "model-year",
    note: `Explicit manufacturer model-year label; ${note}` });
  return records;
}
export function compileObservations(records: Observation[], metadata: SourceMetadata) {
  const unique = [...new Map(records.map(r => [[r.year,r.makeId,r.model,r.vehicleTypeId].join("\0"),r])).values()];
  return buildReviewedCatalog(unique, metadata);
}
export function parseChanganManuals(html: string, baseUrl: string) {
  // Accept a plain-text title, rather than attempting to sanitize arbitrary nested HTML.
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]*news\.jsp\?noticeId=\d+)"[^>]*>([^<>]*)<\/a>/g)];
  return { totalArchiveEntries: links.length,
    guides: links.filter(m=>/维修手册|使用手册|使用说明书|用户维修|服务手册/.test(m[2])).map(m=>({
      title:m[2].trim(),url:new URL(m[1],baseUrl).href,
    })) };
}
function metadata(brand: string, basis: "model-year" | "catalog-year", date: string): SourceMetadata {
  const specs: Record<string, [string, string, string]> = {
    changan: ["Changan official manufacturer catalogs", "https://www.changan.com.cn/dealer_inquiry", "China, Saudi Arabia and Mexico"],
    sgmw: ["SGMW official manufacturer sales catalogs", "https://www.sgmw.com.cn/mobile/wulingRedBadge", "China and Indonesia"],
    bajaj: ["Bajaj official global three-wheeler and Qute catalogs", "https://www.bajajauto.com/global", "India and official export country catalogs"],
  };
  const [name,url,region] = specs[brand];
  return { id: `${brand}-manufacturer-${basis === "model-year" ? "model-years" : "catalog"}`, name, url, region,
    retrievedAt: date, license: "Source attribution (factual product names only)", yearBasis: basis,
    description: basis === "model-year" ? "Explicit manufacturer model-year labels only. Regional evidence and original names remain in data/evidence/manufacturer-catalogs/."
      : "On-sale products in the observed calendar-year catalog. No launch dates, document update dates or historical year ranges are inferred. Regional evidence and original names remain in data/evidence/manufacturer-catalogs/." };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log("Usage: refresh:manufacturer-catalogs [--date YYYY-MM-DD] [--cache-dir DIR] [--offline] [--brand changan|sgmw|bajaj]"); return; }
  const option = (s: string, fallback: string) => { const i = args.indexOf(s); return i < 0 ? fallback : args[i+1]; };
  const offline = args.includes("--offline");
  if (offline && !args.includes("--date")) throw new Error("Offline refresh requires the original --date of observation");
  const date = option("--date", new Date().toISOString().slice(0,10));
  const cache = path.resolve(option("--cache-dir", path.join(ROOT,".cache/manufacturer-catalogs")));
  fs.mkdirSync(cache,{recursive:true}); fs.mkdirSync(EVIDENCE,{recursive:true});
  const rules: Rules = JSON.parse(fs.readFileSync(path.join(ROOT,"data/evidence/manufacturer-catalog-mappings.json"),"utf8"));
  const legacy: (Observation & { brand: string })[] = JSON.parse(fs.readFileSync(path.join(EVIDENCE,"legacy-regional.json"),"utf8")).records;
  const brands = args.includes("--brand") ? [option("--brand","")] : ["changan","sgmw","bajaj"];
  if (brands.some(b => !["changan","sgmw","bajaj"].includes(b))) throw new Error("Unknown brand");
  for (const brand of brands) {
    const audits: Audit[] = [], pending: { rawName: string; url: string; reason: string }[] = [], records: Observation[] = legacy.filter(r => r.brand === brand).map(({ brand: _, ...r }) => r);
    const retrieve = async (url: string, file: string, headers?: Record<string,string>) => {
      const target = path.join(cache,file);
      let text: string;
      if (offline) text = fs.readFileSync(target,"utf8");
      else {
        const response = await fetch(url,{headers,signal:AbortSignal.timeout(30000)});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        text = await response.text(); fs.writeFileSync(target,text);
      }
      audits.push({url,sha256:hash(text),status:"retrieved"}); return text;
    };
    if (brand === "changan") {
      let headers: Record<string,string> | undefined;
      if (!offline) {
        // The same unauthenticated public token handshake used by Changan's website. Never cached or logged.
        const r = await fetch("https://ows.changan.com.cn/v2/newindex/anonymousToken",{signal:AbortSignal.timeout(30000)});
        const t = await r.json() as {code:number;data:{token:string}};
        if (!r.ok || t.code !== 0 || !t.data?.token) throw new Error("Changan public catalog token unavailable");
        headers = {Authorization:t.data.token};
      }
      const index = JSON.parse(await retrieve("https://ows.changan.com.cn/v2/car-model/index","changan-index.json",headers));
      const configurations = JSON.parse(await retrieve("https://ows.changan.com.cn/v2/NewIndex/getCarModelsWithType","changan-models.json",headers));
      const products = parseChanganProducts(index,configurations);
      for (const p of products) {
        if (p.status !== "1") continue;
        const m = rules.changan[p.rawName];
        if (!m) { pending.push({rawName:p.rawName,url:p.url,reason:"Unreviewed name/body mapping"}); continue; }
        records.push(...observedRecords(m,p.rawName,p.id,p.url,"CN",date,[p.rawName,...p.trimLabels],
          "Manufacturer active sales/configuration feed. Full Chinese marketed name retains generation/trim evidence; family catalog names do not establish visual equivalence."));
      }
      const url = "https://ats.changan.com.cn/jsp/web/newslist.jsp?noticeType=10021004";
      const html = await retrieve(url,"changan-manuals.html");
      const {totalArchiveEntries,guides} = parseChanganManuals(html,url);
      fs.writeFileSync(path.join(EVIDENCE,"changan-manuals.json"),JSON.stringify({observedAt:date,url,
        totalArchiveEntries,note:"Named manual discovery only. Update dates and technical document codes never establish vehicle years.",guides},null,2)+"\n");
    } else if (brand === "sgmw") {
      for (const route of ["mobile/wulingRedBadge","mobile/wulingSilverBadge","mobile/baojun"]) {
        const url = `https://www.sgmw.com.cn/${route}`;
        const products = parseSgmwProducts(await retrieve(url,route.replace("/","-")+".html"));
        if (!products.length) throw new Error("Empty SGMW sales catalog");
        for (const p of products) {
          if (p.isOnSale !== 1 || p.enableStatus !== 1 || p.isDelete !== 0) continue;
          const m = rules.sgmw[p.marketNaming];
          if (!m) { pending.push({rawName:p.marketNaming,url,reason:"Unreviewed name/body mapping"}); continue; }
          if ((p.brand === "五菱" && m.make !== "WULING") || (p.brand === "宝骏" && m.make !== "BAOJUN")) throw new Error("SGMW brand mapping mismatch");
          records.push(...observedRecords(m,p.marketNaming,String(p.id),url,"CN",date,[p.marketNaming,...p.configLabels],
            "Manufacturer sales feed explicitly marks this product on sale. Owner-manual and upload dates are not year evidence; family names do not establish generation or asset equivalence."));
          if (m.panelVan && p.configLabels.some(s=>/封窗/.test(s))) {
            records.push(...observedRecords({...m,model:m.panelVan,vehicleTypeId:3},p.marketNaming+" 封窗",String(p.id),url,"CN",date,[p.marketNaming],
              "Manufacturer configuration table explicitly distinguishes a sealed-window two-seat cargo body from the passenger van. No engine/fuel trim split."));
          }
        }
      }
      // Keep the complete official owner-guide discovery index outside the runtime catalog.
      const url = "https://www.sgmw.com.cn/mobile/carGuide";
      const html = await retrieve(url,"wuling.html");
      const manuals = nuxtObjects(html).filter(r=>typeof r.vehicleName==="string").map(r=>({name:r.vehicleName,brand:r.brand,url:r.instructionUrl,
        note:"Owner guide only; inclusion and document update dates do not establish model year or current sales."}));
      fs.writeFileSync(path.join(EVIDENCE,"sgmw-owner-guides.json"),JSON.stringify({observedAt:date,url,manuals},null,2)+"\n");
    } else {
      const global = await retrieve("https://www.bajajauto.com/global","bajaj.html");
      const markets = [...new Set([...global.matchAll(/https:\/\/(?:www\.)?bajajauto\.com\/en-([a-z]{2})\b/g)].map(m=>m[1].toUpperCase()))].sort();
      if (!markets.length) throw new Error("Empty Bajaj country index");
      const countries: {market:string;url:string;html:string}[] = [];
      const indiaUrl = "https://www.bajajauto.com/three-wheelers";
      countries.push({market:"IN",url:indiaUrl,html:await retrieve(indiaUrl,"bajaj-in.html")});
      for (const market of markets) {
        let html: string | undefined, url = "";
        for (const route of ["three-wheelers","threewheelersandqute"]) {
          url = `https://www.bajajauto.com/en-${market.toLowerCase()}/${route}`;
          try { html = await retrieve(url,`bajaj-${market.toLowerCase()}.html`); break; }
          catch (e) { audits.push({url,status:offline ? "not-cached" : "unavailable",
            note:offline ? "No cached response; availability is not established by an offline refresh." : e instanceof Error ? e.message : "Fetch error"}); }
        }
        if (html) countries.push({market,url,html});
      }
      for (const country of countries) {
        const links = productLinks(country.html,country.market === "IN" ? undefined : country.market);
        if (!links.length) audits.push({url:country.url,status:"no-product-links"});
        for (const url of links) {
          const slug = new URL(url).pathname.replace(/^\/(?:en-[a-z]{2}\/)?(?:three-wheelers|threewheelersandqute)\//,"");
          const m = rules.bajaj[slug];
          if (!m) { pending.push({rawName:slug,url,reason:"Unreviewed regional product/body mapping"}); continue; }
          // Product navigation links are dated catalog observations, not factory model years.
          records.push(...observedRecords(m,slug,slug,url,country.market,date,[],
            "Product listed in the official country sales catalog at observation. Reviewed fuel/battery options aggregate only within the documented regional family; passenger, cargo and four-wheel Qute bodies remain separate."));
        }
      }
    }
    if (records.length === legacy.filter(r=>r.brand===brand).length) throw new Error(`No fresh ${brand} observations; refusing to publish a legacy-only refresh`);
    const deduped = [...new Map(records.map(r=>[[r.year,r.makeId,r.model,r.vehicleTypeId,r.market,r.yearBasis,r.sourceRecordId].join("\0"),r])).values()];
    const document = {schemaVersion:1,observedAt:date,brand,audits,pending,records:deduped};
    fs.writeFileSync(path.join(EVIDENCE,brand+".json"),JSON.stringify(document,null,2)+"\n");
    for (const basis of ["model-year","catalog-year"] as const) {
      const rows = deduped.filter(r=>r.yearBasis===basis);
      if (!rows.length) continue;
      const meta = metadata(brand,basis,date);
      const catalog = writeSnapshot(path.join(ROOT,`data/sources/${meta.id}.json`),compileObservations(rows,meta),false);
      console.log(`${meta.id}: ${catalog.models.length} selections, ${rows.length} regional evidence records, ${pending.length} pending mappings`);
    }
  }
}
if (require.main === module) main().catch(e=>{console.error(e.message);process.exitCode=1;});
