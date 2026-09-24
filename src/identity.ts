/** Portable identities. These IDs never replace published numeric catalog IDs. */
export type IdentityKind = "line" | "generation" | "derivative" | "specification" | "visual";
export type YearBasis = "model-year" | "manufacture-year" | "registration-year" | "first-admission-year";
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
  evidenceIds: string[];
}
export interface VehicleIdentityAlias extends IdentityScope {
  text: string;
  targetId: string;
  kind: "marketing-name" | "regional-name" | "translation" | "abbreviation" | "misspelling";
  evidenceIds: string[];
}
export interface IdentityCatalogLink {
  identityId: string;
  year: number;
  makeId: number;
  modelId: number;
  vehicleTypeId: number;
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
