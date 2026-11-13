import type { IdentityGraph, IdentityKind, IdentityScope } from "../src/identity";
import { EXTERIOR_DIFFERENCES, appearancePackageSlug, normalizeIdentityText, type VehicleIdentity } from "../src/identity";
export type { IdentityGraph } from "../src/identity";
export interface CatalogSnapshot {
  makes: { make_id: number; make_name: string }[];
  modelNames: string[];
  models: number[][];
  sources: { source_id: string }[];
}
const parents: Record<IdentityKind, IdentityKind[]> = {
  line: [], generation: ["line"], derivative: ["generation"],
  // A facelift that applies to every body of a generation hangs off the generation itself.
  specification: ["derivative"], visual: ["generation", "derivative", "specification"],
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
    if (s.yearBasis && !["model-year", "manufacture-year", "registration-year", "first-admission-year", "catalog-year"].includes(s.yearBasis)) fail("invalid year basis");
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
    if (link.relation !== undefined && link.relation !== "offered-on") fail(`invalid catalog link relation ${link.identityId}`);
    if (!n || n.makeId !== link.makeId || n.vehicleTypeId !== link.vehicleTypeId ||
      !tuples.has([link.year, link.makeId, link.modelId, link.vehicleTypeId].join(":"))) fail(`invalid catalog link ${link.identityId}`);
    let scoped = n;
    while (scoped) {
      if (scoped.years && !scoped.years.includes(link.year)) fail(`catalog link outside identity years ${link.identityId}`);
      scoped = scoped.parentId ? nodes.get(scoped.parentId) : undefined;
    }
  }
  validateAppearancePackages(graph, nodes, fail);
  for (const [i, alias] of graph.aliases.entries()) {
    refs(alias.evidenceIds); scope(alias);
    const target = nodes.get(alias.targetId);
    if (!target || !normalizeIdentityText(alias.text)) fail(`invalid alias ${alias.text}`);
    for (const other of graph.aliases.slice(0, i)) {
      if (other.targetId !== alias.targetId && nodes.get(other.targetId)?.makeId === target!.makeId &&
        normalizeIdentityText(other.text) === normalizeIdentityText(alias.text) && overlap(alias, other)) fail(`conflicting alias ${alias.text}`);
    }
  }
  for (const [i, alias] of (graph.makeAliases ?? []).entries()) {
    refs(alias.evidenceIds); scope(alias);
    if (!normalizeIdentityText(alias.text) || !catalog.makes.some(m => m.make_id === alias.makeId)) fail(`invalid make alias ${alias.text}`);
    const text = normalizeIdentityText(alias.text);
    if (catalog.makes.some(m => normalizeIdentityText(m.make_name) === text && m.make_id !== alias.makeId)) fail(`make alias shadows catalog make ${alias.text}`);
    if ((graph.makeAliases ?? []).slice(0, i).some(a => normalizeIdentityText(a.text) === text && a.makeId !== alias.makeId && overlap(a, alias))) fail(`conflicting make alias ${alias.text}`);
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
/** A scope fits inside another when every year and market it names is the other's (an unscoped side is open). */
function within(inner: IdentityScope, outer: IdentityScope): boolean {
  return (!outer.years || (!!inner.years && inner.years.every(y => outer.years!.includes(y)))) &&
    (!outer.markets || (!!inner.markets && inner.markets.every(m => outer.markets!.includes(m)))) &&
    (!outer.yearBasis || inner.yearBasis === outer.yearBasis);
}
/**
 * An appearance package is a specification identity with `specification.trim`, years and a year basis, scoped
 * inside its derivative and generation, with exactly one visual child that lists `exteriorDifferences`
 * (the fixed list, at least one, no repeats) and `offered-on` catalog links to the rows it is offered on.
 * Its slug (from the trim) is unique per catalog row and year unless the markets are disjoint.
 */
function validateAppearancePackages(graph: IdentityGraph, nodes: Map<string, VehicleIdentity>, fail: (message: string) => never): void {
  const allowed = new Set<string>(EXTERIOR_DIFFERENCES);
  const ancestors = (n: VehicleIdentity) => { const out: VehicleIdentity[] = []; let p = n.parentId ? nodes.get(n.parentId) : undefined; while (p) { out.push(p); p = p.parentId ? nodes.get(p.parentId) : undefined; } return out; };
  for (const n of graph.identities) {
    if (n.exteriorDifferences === undefined) continue;
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (n.kind !== "visual" || !n.exteriorDifferences.length || new Set(n.exteriorDifferences).size !== n.exteriorDifferences.length ||
      n.exteriorDifferences.some(d => !allowed.has(d))) fail(`invalid exterior differences ${n.id}`);
    if (parent?.kind !== "specification" || !parent.specification?.trim) fail(`exterior differences need a specification parent with a trim ${n.id}`);
    if (graph.identities.some(o => o !== n && o.parentId === n.parentId && o.exteriorDifferences)) fail(`more than one package exterior under ${n.parentId}`);
    if (!within(n, parent!)) fail(`package exterior outside its specification scope ${n.id}`);
  }
  const offered = graph.catalogLinks.filter(l => l.relation === "offered-on");
  for (const link of offered) {
    const spec = nodes.get(link.identityId)!;
    if (spec.kind !== "specification" || !spec.specification?.trim || !graph.identities.some(v => v.parentId === spec.id && v.exteriorDifferences)) fail(`offered-on link without a package ${link.identityId}`);
  }
  const packages = graph.identities.filter(n => n.kind === "specification" && graph.identities.some(v => v.parentId === n.id && v.exteriorDifferences));
  const slugs = new Map<string, VehicleIdentity[]>();
  for (const spec of packages) {
    const slug = appearancePackageSlug(spec.specification!.trim!);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(`invalid package slug ${spec.id}`);
    if (!spec.years || !spec.yearBasis) fail(`package without years and year basis ${spec.id}`);
    if (ancestors(spec).some(a => !within(spec, a))) fail(`package outside its generation scope ${spec.id}`);
    const links = offered.filter(l => l.identityId === spec.id);
    if (!links.length) fail(`package without offered-on catalog links ${spec.id}`);
    for (const l of links) {
      const key = [l.year, l.makeId, l.modelId, slug].join(":"), list = slugs.get(key) ?? [];
      if (list.some(o => o.id !== spec.id && (!o.markets || !spec.markets || o.markets.some(m => spec.markets!.includes(m))))) fail(`duplicate package slug ${slug} on ${l.makeId}:${l.modelId} ${l.year}`);
      if (!list.includes(spec)) list.push(spec);
      slugs.set(key, list);
    }
  }
}
