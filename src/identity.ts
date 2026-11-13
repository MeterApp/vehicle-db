/** Portable identities. These IDs never replace published numeric catalog IDs. */
export type IdentityKind = "line" | "generation" | "derivative" | "specification" | "visual";
export type YearBasis = "model-year" | "manufacture-year" | "registration-year" | "first-admission-year" | "catalog-year";
export interface IdentityScope {
  years?: number[];
  markets?: string[];
  yearBasis?: YearBasis;
}
export interface IdentityEvidence {
  id: string;
  sourceId: string;
  url: string;
  retrievedAt: string;
  note: string;
}
/** The exterior parts an appearance package can change, a fixed list. */
export const EXTERIOR_DIFFERENCES = ["grille", "front_bumper", "rear_bumper", "side_skirts", "wheels", "badges", "mirrors", "spoiler", "exhaust", "lamps", "trim_color"] as const;
export type ExteriorDifference = typeof EXTERIOR_DIFFERENCES[number];
export interface VehicleIdentity extends IdentityScope {
  id: string;
  kind: IdentityKind;
  makeId: number;
  vehicleTypeId: number;
  name: string;
  /** Full model phrases, excluding make/year. No suffix stripping is implied. */
  names: string[];
  parentId?: string;
  codes?: string[];
  bodyStyle?: string;
  appearanceRevision?: string;
  specification?: {
    trim?: string;
    powertrain?: string;
    engine?: string;
    drivetrain?: string;
    transmission?: string;
    rawText: string;
  };
  /**
   * On the visual identity of an appearance package (under a specification with `specification.trim`):
   * the parts its evidence shows differ from the base car.
   */
  exteriorDifferences?: ExteriorDifference[];
  evidenceIds: string[];
}
export interface VehicleIdentityAlias extends IdentityScope {
  text: string;
  targetId: string;
  kind: "marketing-name" | "regional-name" | "translation" | "abbreviation" | "misspelling";
  evidenceIds: string[];
}
/** Reviewed brand names only; never a rule to discard vehicle category words. */
export interface VehicleMakeAlias extends IdentityScope {
  text: string;
  makeId: number;
  evidenceIds: string[];
}
export interface IdentityCatalogLink {
  identityId: string;
  year: number;
  makeId: number;
  modelId: number;
  vehicleTypeId: number;
  /**
   * Absent: the identity describes the row. `offered-on`: the identity (an appearance package's
   * specification) is an option on the row's vehicle; the row still describes the base car, so
   * resolution ignores these links.
   */
  relation?: "offered-on";
  evidenceIds: string[];
}
export interface VisualCompatibility extends IdentityScope {
  id: string;
  requestedVisualIdentityId: string;
  assetVisualIdentityId: string;
  decision: "allow" | "deny";
  evidenceIds: string[];
  rationale: string;
  reviewedBy: string;
  reviewedAt: string;
  revision: string;
}
export interface HomologationIdentity {
  id: string;
  sourceId: string;
  market: string;
  approvalNumber?: string;
  type?: string;
  variant?: string;
  version?: string;
  derivativeId?: string;
  evidenceIds: string[];
}
export interface IdentityGraph {
  schemaVersion: 1;
  revision: string;
  identities: VehicleIdentity[];
  aliases: VehicleIdentityAlias[];
  makeAliases?: VehicleMakeAlias[];
  catalogLinks: IdentityCatalogLink[];
  evidence: IdentityEvidence[];
  homologation: HomologationIdentity[];
  visualCompatibility: VisualCompatibility[];
}
export interface ScopeContext { year?: number; market?: string; yearBasis?: YearBasis }
/** Missing context cannot satisfy a restricted scope. */
export function scopeMatches(scope: IdentityScope, context: ScopeContext): boolean {
  return (!scope.years || (context.year !== undefined && scope.years.includes(context.year))) &&
    (!scope.markets || (context.market !== undefined && scope.markets.includes(context.market))) &&
    (!scope.yearBasis || scope.yearBasis === context.yearBasis);
}
export function normalizeIdentityText(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    // A plus badge can identify a distinct body/performance model (03 vs 03+).
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9\p{L}]+/gu, " ").trim().replace(/\s+/g, " ");
}
/** Direct, directional facts only; no reverse or transitive inference. */
export function evaluateVisualCompatibility(
  rules: readonly VisualCompatibility[], requestedId: string, assetId: string, context: ScopeContext,
): "allow" | "deny" | "unknown" {
  const applicable = rules.filter(rule => rule.requestedVisualIdentityId === requestedId &&
    rule.assetVisualIdentityId === assetId && scopeMatches(rule, context));
  if (applicable.some(rule => rule.decision === "deny")) return "deny";
  return applicable.some(rule => rule.decision === "allow") ? "allow" : "unknown";
}
/** An appearance package offered on a catalog vehicle: a specification identity and its exterior. */
export interface AppearancePackage {
  /** The package name in lower-case kebab form ("F SPORT" → "f-sport"); unique per catalog vehicle and year. */
  slug: string;
  /** The maker's package name, `specification.trim`. */
  name: string;
  specificationId: string;
  visualIdentityId: string;
  exteriorDifferences: ExteriorDifference[];
  years: number[];
  markets?: string[];
  yearBasis: YearBasis;
  evidenceIds: string[];
}
export interface AppearancePackageQuery { makeId: number; modelId: number; year: number; market?: string }
/** The stable slug of a package name: lower-case kebab, accents and punctuation dropped. */
export function appearancePackageSlug(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
/** The package's exterior: the visual child of a specification that lists its exterior differences. */
export function packageVisual(graph: Pick<IdentityGraph, "identities">, specificationId: string): VehicleIdentity | undefined {
  return graph.identities.find(n => n.kind === "visual" && n.parentId === specificationId && n.exteriorDifferences?.length);
}
/**
 * The appearance packages offered on a catalog vehicle in a year. A market-scoped package is returned
 * only when `market` is given and in its scope; with no market, only packages without a market scope.
 */
export function listAppearancePackages(graph: IdentityGraph, query: AppearancePackageQuery): AppearancePackage[] {
  const { makeId, modelId, year, market } = query;
  if (![makeId, modelId, year].every(Number.isInteger)) return [];
  const nodes = new Map(graph.identities.map(n => [n.id, n]));
  const inMarkets = (scope: IdentityScope) => !scope.markets || (market !== undefined && scope.markets.includes(market));
  const result = new Map<string, AppearancePackage>();
  for (const link of graph.catalogLinks) {
    if (link.relation !== "offered-on" || link.makeId !== makeId || link.modelId !== modelId || link.year !== year || result.has(link.identityId)) continue;
    const spec = nodes.get(link.identityId);
    const visual = spec && packageVisual(graph, spec.id);
    if (!spec?.specification?.trim || !visual || !spec.years || !spec.yearBasis) continue;
    if (!spec.years.includes(year) || (visual.years && !visual.years.includes(year)) || !inMarkets(spec) || !inMarkets(visual)) continue;
    const markets = visual.markets ?? spec.markets;
    result.set(spec.id, {
      slug: appearancePackageSlug(spec.specification.trim), name: spec.specification.trim,
      specificationId: spec.id, visualIdentityId: visual.id, exteriorDifferences: [...visual.exteriorDifferences!],
      years: [...spec.years], ...(markets ? { markets: [...markets] } : {}), yearBasis: spec.yearBasis,
      evidenceIds: [...new Set([...spec.evidenceIds, ...visual.evidenceIds])],
    });
  }
  return [...result.values()].sort((a, b) => a.slug.localeCompare(b.slug) || a.specificationId.localeCompare(b.specificationId));
}
