import type { IdentityGraph, IdentityKind, IdentityScope } from "../src/identity";
import { normalizeIdentityText } from "../src/identity";
export type { IdentityGraph } from "../src/identity";
export interface CatalogSnapshot {
  makes: { make_id: number; make_name: string }[];
  modelNames: string[];
  models: number[][];
  sources: { source_id: string }[];
}
const parents: Record<IdentityKind, IdentityKind[]> = {
  line: [], generation: ["line"], derivative: ["generation"],
  specification: ["derivative"], visual: ["derivative", "specification"],
};
function overlap(a: IdentityScope, b: IdentityScope): boolean {
  return (!a.years || !b.years || a.years.some(y => b.years!.includes(y))) &&
    (!a.markets || !b.markets || a.markets.some(m => b.markets!.includes(m))) &&
    (!a.yearBasis || !b.yearBasis || a.yearBasis === b.yearBasis);
}
export function validateIdentityGraph(graph: IdentityGraph, catalog: CatalogSnapshot): void {
  const fail = (message: string): never => { throw new Error(`Identity graph: ${message}`); };
  if (graph.schemaVersion !== 1 || !graph.revision) fail("unsupported schema/revision");
  const allIds = new Set<string>();
  for (const record of [...graph.identities, ...graph.evidence, ...graph.homologation, ...graph.visualCompatibility]) {
    if (!record.id || allIds.has(record.id)) fail(`duplicate/empty ID ${record.id}`);
    allIds.add(record.id);
  }
  const nodes = new Map(graph.identities.map(n => [n.id, n]));
  const evidence = new Set(graph.evidence.map(e => e.id));
  const refs = (ids: string[]) => { if (!ids.length || ids.some(id => !evidence.has(id))) fail("missing evidence"); };
  const scope = (s: IdentityScope) => {
    if (s.years && (!s.years.length || s.years.some(y => !Number.isInteger(y) || y < 1886 || y > 2200) || !s.yearBasis)) fail("invalid year scope/basis");
    if (s.markets && (!s.markets.length || s.markets.some(m => !/^[A-Z]{2}$/.test(m)))) fail("invalid market scope");
    if (s.yearBasis && !["model-year", "manufacture-year", "registration-year", "first-admission-year"].includes(s.yearBasis)) fail("invalid year basis");
  };
  for (const e of graph.evidence) {
    if (!/^https:\/\//.test(e.url) || !e.sourceId || !/^\d{4}-\d{2}-\d{2}$/.test(e.retrievedAt) || !e.note) fail(`invalid evidence ${e.id}`);
  }
  for (const n of graph.identities) {
    refs(n.evidenceIds); scope(n);
    if (n.specification && (n.kind !== "specification" || !n.specification.rawText)) fail(`invalid specification ${n.id}`);
    if (!parents[n.kind] || !n.name || !Array.isArray(n.names) || n.names.some(s => !normalizeIdentityText(s))) fail(`invalid node ${n.id}`);
    if (!catalog.makes.some(m => m.make_id === n.makeId) || !catalog.models.some(m => m[4] === n.vehicleTypeId)) fail(`unknown make/type ${n.id}`);
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (n.kind === "line" ? !!n.parentId : !parent || !parents[n.kind].includes(parent.kind) || parent.makeId !== n.makeId || parent.vehicleTypeId !== n.vehicleTypeId) fail(`invalid parent ${n.id}`);
    const seen = new Set([n.id]); let ancestor = parent;
    while (ancestor) {
      if (seen.has(ancestor.id)) fail(`cycle ${n.id}`);
      seen.add(ancestor.id); ancestor = ancestor.parentId ? nodes.get(ancestor.parentId) : undefined;
    }
  }
  const tuples = new Set(catalog.models.map(r => [r[0], r[1], r[2], r[4]].join(":")));
  for (const link of graph.catalogLinks) {
    refs(link.evidenceIds);
    const n = nodes.get(link.identityId);
    if (!n || n.makeId !== link.makeId || n.vehicleTypeId !== link.vehicleTypeId ||
      !tuples.has([link.year, link.makeId, link.modelId, link.vehicleTypeId].join(":"))) fail(`invalid catalog link ${link.identityId}`);
    let scoped = n;
    while (scoped) {
      if (scoped.years && !scoped.years.includes(link.year)) fail(`catalog link outside identity years ${link.identityId}`);
      scoped = scoped.parentId ? nodes.get(scoped.parentId) : undefined;
    }
  }
  for (const [i, alias] of graph.aliases.entries()) {
    refs(alias.evidenceIds); scope(alias);
    const target = nodes.get(alias.targetId);
    if (!target || !normalizeIdentityText(alias.text)) fail(`invalid alias ${alias.text}`);
    for (const other of graph.aliases.slice(0, i)) {
      if (other.targetId !== alias.targetId && nodes.get(other.targetId)?.makeId === target!.makeId &&
        normalizeIdentityText(other.text) === normalizeIdentityText(alias.text) && overlap(alias, other)) fail(`conflicting alias ${alias.text}`);
    }
  }
  for (const h of graph.homologation) {
    refs(h.evidenceIds);
    if (!h.sourceId || !h.market || (h.derivativeId && nodes.get(h.derivativeId)?.kind !== "derivative")) fail(`invalid homologation ${h.id}`);
  }
  for (const [i, rule] of graph.visualCompatibility.entries()) {
    refs(rule.evidenceIds); scope(rule);
    if (nodes.get(rule.requestedVisualIdentityId)?.kind !== "visual" || nodes.get(rule.assetVisualIdentityId)?.kind !== "visual" ||
      !["allow", "deny"].includes(rule.decision) || !rule.rationale || !rule.reviewedBy || !rule.reviewedAt || !rule.revision) fail(`invalid visual rule ${rule.id}`);
    for (const other of graph.visualCompatibility.slice(0, i)) {
      if (other.requestedVisualIdentityId === rule.requestedVisualIdentityId && other.assetVisualIdentityId === rule.assetVisualIdentityId && other.decision !== rule.decision && overlap(rule, other)) fail(`contradictory visual rules ${rule.id}`);
    }
  }
}
