import fs from "fs";
import { execFileSync } from "child_process";
import type { CatalogSnapshot } from "./identity-types";
const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
export function compareCatalogs(before: CatalogSnapshot, after: CatalogSnapshot) {
  const key = (d: CatalogSnapshot, r: number[]) => [r[0], r[1], norm(d.modelNames[r[3]]), r[4]].join(":");
  const a = new Map(before.models.map(r => [key(before, r), r]));
  const b = new Map(after.models.map(r => [key(after, r), r]));
  const removed: string[] = [], changedIds: string[] = [], changedFirstSelections: string[] = [], changedMakes: number[] = [];
  let additions = 0, provenanceChanges = 0;
  const sources = (d: CatalogSnapshot, r: number[]) => d.sources.filter((_, i) => (r[5] & 2 ** i) !== 0).map(s => s.source_id).sort().join(",");
  for (const [k, r] of a) { const next = b.get(k); if (!next) removed.push(k); else {
    if (next[2] !== r[2]) changedIds.push(k);
    if (sources(before, r) !== sources(after, next)) provenanceChanges++;
  } }
  for (const k of b.keys()) if (!a.has(k)) additions++;
  for (const make of before.makes) if (!after.makes.some(m => m.make_id === make.make_id && norm(m.make_name) === norm(make.make_name))) changedMakes.push(make.make_id);
  const first = (d: CatalogSnapshot) => {
    const map = new Map<string, number[]>();
    for (const r of d.models) { const k = [r[0], r[1], norm(d.modelNames[r[3]])].join(":");
      if (!map.has(k) || r[4] < map.get(k)![4]) map.set(k, r);
    } return map;
  };
  const nextFirst = first(after);
  for (const [k, r] of first(before)) { const next = nextFirst.get(k); if (!next || next[2] !== r[2]) changedFirstSelections.push(k); }
  return { additions, provenanceChanges, removed, changedIds, changedMakes, changedFirstSelections,
    compatible: !removed.length && !changedIds.length && !changedMakes.length && !changedFirstSelections.length };
}
if (require.main === module) {
  const ref = process.argv[2];
  if (!ref || ref.startsWith("-")) throw new Error("Usage: check-compatibility.ts <git-ref>");
  const before = JSON.parse(execFileSync("git", ["show", `${ref}:data/compact.json`], { maxBuffer: 50 * 1024 * 1024 }).toString());
  const report = compareCatalogs(before, JSON.parse(fs.readFileSync("data/compact.json", "utf8")));
  console.log(JSON.stringify(report, null, 2)); if (!report.compatible) process.exitCode = 1;
}
