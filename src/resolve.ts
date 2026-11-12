import data from "./data";
import graph from "./identity-data";
import { normalizeIdentityText as norm, scopeMatches, type IdentityGraph, type IdentityKind, type ScopeContext, type VehicleIdentity, type VisualCompatibility } from "./identity";
export type { IdentityGraph, VehicleIdentity } from "./identity";
export interface ResolveVehicleOptions extends ScopeContext {
  makeId?: number;
  vehicleTypeId?: number;
  sourceId?: string;
  /** Default catalog. Rendering consumers should request visual depth. */
  depth?: "catalog" | IdentityKind;
}
export interface ResolvedCatalogSelection { year: number; makeId: number; modelId: number; modelName: string; vehicleTypeId: number; sourceIds: string[] }
export interface VehicleResolutionCandidate {
  identityId?: string;
  depth: "catalog" | IdentityKind;
  lineage: Partial<Record<IdentityKind, string>>;
  catalogSelections: ResolvedCatalogSelection[];
  visualIdentityIds: string[];
  evidenceIds: string[];
}
export type VehicleResolutionStatus = "MATCHED" | "UNKNOWN_MAKE" | "UNKNOWN_MODEL" | "UNRESOLVED_TOKENS" | "GENERATION_UNRESOLVED" | "AMBIGUOUS" | "YEAR_UNVERIFIED" | "SCOPE_UNVERIFIED" | "KNOWN_DERIVATIVE_UNSUPPORTED" | "INVALID_INPUT";
export type VehicleResolution = {
  status: "MATCHED"; selection: VehicleResolutionCandidate; candidates: VehicleResolutionCandidate[]; unresolvedTokens: string[]; revision: string;
} | { status: Exclude<VehicleResolutionStatus, "MATCHED">; candidates: VehicleResolutionCandidate[]; unresolvedTokens: string[]; revision: string };
interface Catalog {
  makes: { make_id: number; make_name: string }[];
  modelNames: string[];
  models: readonly (readonly number[])[];
  sources: { source_id: string }[];
  /** Markets the reviewed manufacturer rows were evidenced for: `rows` holds (index into `models`, index into `sets`) pairs. */
  reviewedMarkets?: { sets: readonly (readonly string[])[]; rows: readonly number[] };
}
const rank = { catalog: 0, line: 1, generation: 2, derivative: 3, specification: 4, visual: 5 };
/** Create an isolated resolver for a validated graph and catalog, including test fixtures. */
export function createVehicleResolver(catalog: Catalog, identities: IdentityGraph) {
  const nodes = new Map(identities.identities.map(n => [n.id, n]));
  const ancestry = (node: VehicleIdentity): VehicleIdentity[] => {
    const result = [node], seen = new Set([node.id]); let parent = node.parentId ? nodes.get(node.parentId) : undefined;
    while (parent && !seen.has(parent.id)) { result.push(parent); seen.add(parent.id); parent = parent.parentId ? nodes.get(parent.parentId) : undefined; }
    return result;
  };
  const makeNames = catalog.makes.map(m => ({ id: m.make_id, name: norm(m.make_name) })).sort((a,b) => b.name.length-a.name.length);
  const byMake = new Map<number, (readonly number[])[]>();
  for (const r of catalog.models) { const list = byMake.get(r[1]) ?? []; list.push(r); byMake.set(r[1], list); }
  const names = catalog.modelNames.map(norm);
  // A flat row is verified for a market by its reviewed evidence or by a scoped identity linked to it.
  const reviewed = new Map<readonly number[], readonly string[]>();
  const mask = catalog.reviewedMarkets;
  if (mask) for (let i = 0; i + 1 < mask.rows.length; i += 2) reviewed.set(catalog.models[mask.rows[i]], mask.sets[mask.rows[i + 1]] ?? []);
  const rowKey = (year: number, makeId: number, modelId: number, vehicleTypeId: number) => `${year}:${makeId}:${modelId}:${vehicleTypeId}`;
  let linkIndex: Map<string, VehicleIdentity[]> | undefined;
  const linkedTo = (r: readonly number[]): VehicleIdentity[] => {
    if (!linkIndex) {
      linkIndex = new Map();
      for (const l of identities.catalogLinks) {
        const node = nodes.get(l.identityId); if (!node) continue;
        const key = rowKey(l.year, l.makeId, l.modelId, l.vehicleTypeId), list = linkIndex.get(key) ?? [];
        if (!list.includes(node)) list.push(node);
        linkIndex.set(key, list);
      }
    }
    return linkIndex.get(rowKey(r[0], r[1], r[2], r[4])) ?? [];
  };
  const select = (r: readonly number[]): ResolvedCatalogSelection => ({ year: r[0], makeId: r[1], modelId: r[2], modelName: catalog.modelNames[r[3]], vehicleTypeId: r[4], sourceIds: catalog.sources.filter((_, i) => (r[5] & 2 ** i) !== 0).map(s => s.source_id) });
  return function resolve(query: string, options: ResolveVehicleOptions = {}): VehicleResolution {
    const result = (status: VehicleResolutionStatus, candidates: VehicleResolutionCandidate[] = [], unresolvedTokens: string[] = []): VehicleResolution => status === "MATCHED"
      ? { status, selection: candidates[0], candidates, unresolvedTokens, revision: identities.revision }
      : { status, candidates, unresolvedTokens, revision: identities.revision };
    if (!query.trim() || query.length > 512 || (options.year !== undefined && (!Number.isInteger(options.year) || options.year < 1886 || options.year > 2200))) return result("INVALID_INPUT");
    let text = norm(query), year = options.year;
    // Only a leading year is inferred. Model names such as Peugeot 2008 are preserved.
    const prefix = text.match(/^((?:19|20)\d{2})\s+/);
    if (prefix) { if (year !== undefined && year !== Number(prefix[1])) return result("INVALID_INPUT"); year = Number(prefix[1]); text = text.slice(prefix[0].length); }
    const context = { year, market: options.market, yearBasis: options.yearBasis ?? "model-year" };
    let makeId = options.makeId;
    const make = [...makeNames, ...(identities.makeAliases ?? [])
      .filter(a => scopeMatches(a, context)).map(a => ({ id: a.makeId, name: norm(a.text) }))]
      .sort((a, b) => b.name.length - a.name.length)
      .find(m => text === m.name || text.startsWith(m.name + " "));
    if (make && (makeId === undefined || make.id === makeId)) { makeId = make.id; text = text.slice(make.name.length).trim(); }
    if (makeId === undefined || !byMake.has(makeId)) return result("UNKNOWN_MAKE");
    if (!text) return result("UNKNOWN_MODEL");
    const sourceIndex = options.sourceId === undefined ? undefined : catalog.sources.findIndex(s => s.source_id === options.sourceId);
    if (sourceIndex === -1) return result("SCOPE_UNVERIFIED");
    const rows = (byMake.get(makeId) ?? []).filter(r => (options.vehicleTypeId === undefined || r[4] === options.vehicleTypeId) && (sourceIndex === undefined || (r[5] & 2 ** sourceIndex) !== 0));
    const scopeOk = (n: VehicleIdentity) => ancestry(n).every(p => scopeMatches(p, context));
    const candidateOf = (n: VehicleIdentity, from: readonly (readonly number[])[]): VehicleResolutionCandidate => {
      const chain = ancestry(n), lineage = Object.fromEntries(chain.map(p => [p.kind, p.id]));
      const links = identities.catalogLinks.filter(l => (l.identityId === n.id || (n.kind === "visual" && chain.some(p => p.id === l.identityId))) && (year === undefined || l.year === year));
      const catalogSelections = from.filter(r => links.some(l => l.year === r[0] && l.makeId === r[1] && l.modelId === r[2] && l.vehicleTypeId === r[4])).map(select);
      const visuals = identities.identities.filter(v => v.kind === "visual" && ancestry(v).some(p => p.id === n.id) && scopeOk(v));
      return { identityId: n.id, depth: n.kind, lineage, catalogSelections, visualIdentityIds: visuals.map(v => v.id), evidenceIds: [...new Set(chain.flatMap(p => p.evidenceIds))] };
    };
    const allNamed = identities.identities.filter(n => n.makeId === makeId && (options.vehicleTypeId === undefined || options.vehicleTypeId === n.vehicleTypeId) && n.names.some(s => norm(s) === text));
    const aliases = identities.aliases.filter(a => norm(a.text) === text && nodes.get(a.targetId)?.makeId === makeId && (options.vehicleTypeId === undefined || nodes.get(a.targetId)?.vehicleTypeId === options.vehicleTypeId));
    const named = [...new Map([...allNamed, ...aliases.filter(a => scopeMatches(a, context)).map(a => nodes.get(a.targetId)!)].map(n => [n.id,n])).values()];
    if (allNamed.length || aliases.length) {
      let matching = named.filter(scopeOk);
      if (!matching.length) {
        const otherScopeFits = named.some(n => ancestry(n).every(p => scopeMatches({ ...p, years: undefined }, context)));
        return result(year !== undefined && otherScopeFits ? "YEAR_UNVERIFIED" : "SCOPE_UNVERIFIED");
      }
      const requestedDepth = options.depth ?? "catalog";
      // A line/generation can be completed only when all scope constraints leave one child.
      if (requestedDepth !== "catalog") {
        matching = matching.flatMap(n => rank[n.kind] >= rank[requestedDepth] ? [n] : identities.identities.filter(child => rank[child.kind] === rank[requestedDepth] && ancestry(child).some(p => p.id === n.id) && scopeOk(child)));
      }
      matching = [...new Map(matching.map(n => [n.id,n])).values()];
      if (!matching.length) return result("GENERATION_UNRESOLVED");
      const candidates = matching.map(n => candidateOf(n, rows));
      if (sourceIndex !== undefined && candidates.every(c => !c.catalogSelections.length)) return result("SCOPE_UNVERIFIED", candidates);
      if (candidates.length !== 1) return result("AMBIGUOUS", candidates);
      if (requestedDepth === "catalog" && !candidates[0].catalogSelections.length) {
        const knownLinks = identities.catalogLinks.some(l => l.identityId === candidates[0].identityId);
        return result(knownLinks && year !== undefined ? "YEAR_UNVERIFIED" : "KNOWN_DERIVATIVE_UNSUPPORTED", candidates);
      }
      return result("MATCHED", candidates);
    }
    const exact = rows.filter(r => names[r[3]] === text);
    const yearRows = exact.filter(r => year === undefined || r[0] === year);
    if (exact.length && !yearRows.length) return result("YEAR_UNVERIFIED");
    if (yearRows.length) {
      const groups = new Map<string, (readonly number[])[]>();
      for (const r of yearRows) { const k = `${names[r[3]]}:${r[4]}`; const group = groups.get(k) ?? []; group.push(r); groups.set(k, group); }
      const flat = (rs: readonly (readonly number[])[]): VehicleResolutionCandidate => ({ depth: "catalog", lineage: {}, catalogSelections: rs.map(select), visualIdentityIds: [], evidenceIds: [] });
      const candidates = [...groups.values()].map(flat);
      if (options.market === undefined) {
        if (options.depth && options.depth !== "catalog") return result("GENERATION_UNRESOLVED", candidates);
        return result(candidates.length === 1 ? "MATCHED" : "AMBIGUOUS", candidates);
      }
      // With a market, only rows evidenced for it answer: reviewed for that market, or linked to an
      // identity whose whole scope (market, year and year basis) fits the request.
      const market = options.market;
      const inScope = (r: readonly number[]) => linkedTo(r).filter(scopeOk);
      const verified = yearRows.filter(r => reviewed.get(r)?.includes(market) || inScope(r).length);
      if (!verified.length) return result("SCOPE_UNVERIFIED", candidates);
      const depth = options.depth ?? "catalog";
      if (depth === "catalog") {
        const verifiedGroups = [...groups.values()].map(rs => rs.filter(r => verified.includes(r))).filter(rs => rs.length);
        const scoped = verifiedGroups.map(rs => {
          const linked = [...new Set(rs.flatMap(inScope))];
          const visuals = identities.identities.filter(v => v.kind === "visual" && scopeOk(v) && ancestry(v).some(p => linked.includes(p)));
          return { ...flat(rs), visualIdentityIds: visuals.map(v => v.id), evidenceIds: [...new Set(linked.flatMap(n => ancestry(n)).flatMap(p => p.evidenceIds))] };
        });
        return result(scoped.length === 1 ? "MATCHED" : "AMBIGUOUS", scoped);
      }
      const linked = [...new Set(verified.flatMap(inScope))];
      // A linked identity deeper than the request answers with its ancestor at that depth; a shallower one with its scoped children.
      const deep = [...new Set(linked.flatMap(n => rank[n.kind] >= rank[depth] ? [ancestry(n).find(p => p.kind === depth) ?? n] : identities.identities.filter(child => rank[child.kind] === rank[depth] && ancestry(child).some(p => p.id === n.id) && scopeOk(child))))];
      if (!deep.length) return result("GENERATION_UNRESOLVED", [...groups.values()].map(rs => rs.filter(r => verified.includes(r))).filter(rs => rs.length).map(flat));
      // The selections are the verified rows that led to the identity, through itself, a descendant or an ancestor.
      const scoped = deep.map(n => ({ ...candidateOf(n, verified), catalogSelections: verified.filter(r => inScope(r).some(x => ancestry(x).some(p => p.id === n.id) || ancestry(n).some(p => p.id === x.id))).map(select) }));
      return result(scoped.length === 1 ? "MATCHED" : "AMBIGUOUS", scoped);
    }
    const prefixes = [...rows.map(r => names[r[3]]), ...identities.identities.filter(n => n.makeId === makeId).flatMap(n => n.names.map(norm))].filter(n => text.startsWith(n + " ")).sort((a,b) => b.length-a.length);
    return prefixes.length ? result("UNRESOLVED_TOKENS", [], text.slice(prefixes[0].length).trim().split(" ")) : result("UNKNOWN_MODEL");
  };
}
let resolver: ReturnType<typeof createVehicleResolver> | undefined;
/** Exact identity resolution, separate from autocomplete and render availability. */
export function resolveVehicle(query: string, options: ResolveVehicleOptions = {}): VehicleResolution {
  resolver ??= createVehicleResolver(data, graph);
  return resolver(query, options);
}
/** The bundled allow/deny rules between visual identities, with rationale and scope: pass them to evaluateVisualCompatibility(). */
export function getVisualCompatibilityRules(): readonly VisualCompatibility[] {
  return graph.visualCompatibility;
}
