import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import graph from "../src/identity-data";
import { getVisualCompatibilityRules } from "../src/resolve";
import { evaluateVisualCompatibility, type VisualCompatibility } from "../src/identity";
import { replayVisualCompatibility, type VisualReplayCase } from "./replay-catalog";

const cases: VisualReplayCase[] = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/visual-compatibility-replay.json"), "utf8"));
const rules = graph.visualCompatibility;
const allows = rules.filter(r => r.decision === "allow");
const node = (id: string) => graph.identities.find(n => n.id === id)!;
/** A context inside the rule's own scope, or inside the requested identity's scope for an unscoped rule. */
const inScope = (r: VisualCompatibility) => {
  const s = r.years ? r : node(r.requestedVisualIdentityId);
  return { year: s.years![0], market: s.markets![0], yearBasis: s.yearBasis! };
};

describe("appearance rules replay", () => {
  test("every fixture case answers as recorded", () => {
    const failed = replayVisualCompatibility(cases).filter(r => !r.passed);
    expect(failed).toEqual([]);
  });
  test("every bundled allow and deny has a replay case that reaches it", () => {
    for (const r of rules) {
      const hit = cases.some(c => c.requested === r.requestedVisualIdentityId && c.asset === r.assetVisualIdentityId && c.expected === r.decision &&
        evaluateVisualCompatibility([r], c.requested, c.asset, c.context) === r.decision);
      expect(hit, r.id).toBe(true);
    }
    expect(allows.length).toBeGreaterThan(0);
    expect(cases.filter(c => c.expected === "unknown").length).toBeGreaterThan(0);
  });
  test("a deny wins over an allow of the same pair", () => {
    for (const r of allows) {
      const ctx = inScope(r);
      expect(evaluateVisualCompatibility(rules, r.requestedVisualIdentityId, r.assetVisualIdentityId, ctx)).toBe("allow");
      const deny: VisualCompatibility = { ...r, id: r.id + ":deny", decision: "deny" };
      expect(evaluateVisualCompatibility([...rules, deny], r.requestedVisualIdentityId, r.assetVisualIdentityId, ctx)).toBe("deny");
      expect(evaluateVisualCompatibility([deny, ...rules], r.requestedVisualIdentityId, r.assetVisualIdentityId, ctx)).toBe("deny");
      // An unscoped deny also wins inside the allow's scope; a deny scoped elsewhere does not reach it.
      expect(evaluateVisualCompatibility([...rules, { ...deny, years: undefined, markets: undefined, yearBasis: undefined }], r.requestedVisualIdentityId, r.assetVisualIdentityId, ctx)).toBe("deny");
      expect(evaluateVisualCompatibility([...rules, { ...deny, markets: ["ZZ"] }], r.requestedVisualIdentityId, r.assetVisualIdentityId, ctx)).toBe("allow");
    }
  });
  test("an allow is never reversed unless the other direction is recorded", () => {
    for (const r of allows) {
      const reverse = allows.find(o => o.requestedVisualIdentityId === r.assetVisualIdentityId && o.assetVisualIdentityId === r.requestedVisualIdentityId);
      // The twins are symmetric, so both directions are recorded, each in the requesting side's market.
      expect(reverse, r.id).toBeDefined();
      const ctx = inScope(r);
      const without = rules.filter(o => o !== reverse);
      expect(evaluateVisualCompatibility(without, r.assetVisualIdentityId, r.requestedVisualIdentityId, inScope(reverse!))).toBe("unknown");
      expect(evaluateVisualCompatibility(without, r.assetVisualIdentityId, r.requestedVisualIdentityId, ctx)).toBe("unknown");
      // Recorded, the reverse holds in its own scope only.
      expect(evaluateVisualCompatibility(rules, r.assetVisualIdentityId, r.requestedVisualIdentityId, inScope(reverse!))).toBe("allow");
      expect(evaluateVisualCompatibility(rules, r.assetVisualIdentityId, r.requestedVisualIdentityId, ctx)).toBe("unknown");
    }
  });
  test("an allow is never chained", () => {
    const a = "opel:corsa:2019:facelift-2023", b = "vauxhall:corsa:2019:facelift-2023", c = "opel:astra:2021:original";
    const ctx = { year: 2024, market: "DE", yearBasis: "catalog-year" as const };
    const ab = allows.find(r => r.requestedVisualIdentityId === a && r.assetVisualIdentityId === b)!;
    // A allows B (bundled); add B allows C in the same scope: A still knows nothing about C.
    const bc: VisualCompatibility = { ...ab, id: "fixture:b-c", requestedVisualIdentityId: b, assetVisualIdentityId: c };
    expect(evaluateVisualCompatibility([...rules, bc], a, b, ctx)).toBe("allow");
    expect(evaluateVisualCompatibility([...rules, bc], b, c, ctx)).toBe("allow");
    expect(evaluateVisualCompatibility([...rules, bc], a, c, ctx)).toBe("unknown");
    // Nor does a bundled allow reach a third identity through a bundled deny or allow.
    for (const r of allows) for (const o of rules) {
      if (o.requestedVisualIdentityId !== r.assetVisualIdentityId || o.assetVisualIdentityId === r.requestedVisualIdentityId) continue;
      expect(evaluateVisualCompatibility(rules, r.requestedVisualIdentityId, o.assetVisualIdentityId, inScope(r))).toBe("unknown");
    }
  });
  test("an allow is scoped, evidenced and says what still differs", () => {
    for (const r of allows) {
      expect(r.years?.length && r.markets?.length && r.yearBasis, r.id).toBeTruthy();
      const requested = node(r.requestedVisualIdentityId), asset = node(r.assetVisualIdentityId);
      // Inside both identities' years, in the requesting identity's market.
      expect(r.years!.every(y => requested.years!.includes(y) && asset.years!.includes(y)), r.id).toBe(true);
      expect(r.markets!.every(m => requested.markets!.includes(m)), r.id).toBe(true);
      expect(r.evidenceIds.length).toBeGreaterThanOrEqual(2);
      // A badge twin is allowed for its shape only: the rationale names the emblem the consumer must redraw.
      expect(r.rationale).toMatch(/only visible difference is the brand emblem/);
      expect(r.rationale).toMatch(/redraw or check/);
    }
  });
  test("the package hands out the bundled rules", () => {
    expect(getVisualCompatibilityRules()).toBe(graph.visualCompatibility);
    expect(evaluateVisualCompatibility(getVisualCompatibilityRules(), "opel:mokka:2021:original", "vauxhall:mokka:2021:original", { year: 2022, market: "DE", yearBasis: "catalog-year" })).toBe("allow");
  });
  test("identities added for the rules capture no name", () => {
    for (const id of ["opel:corsa", "vauxhall:corsa", "opel:astra", "vauxhall:astra", "opel:mokka", "vauxhall:mokka"]) {
      expect(graph.identities.filter(n => n.id === id || n.id.startsWith(id + ":")).every(n => n.names.length === 0), id).toBe(true);
    }
  });
});
