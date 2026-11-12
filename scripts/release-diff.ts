/**
 * What one release changed, for machines (release.json) and people (CHANGELOG.md).
 *
 *   tsx scripts/release-diff.ts [--from <ref>] [--to <ref> | --worktree] [--out release.json]
 *   tsx scripts/release-diff.ts --changelog [CHANGELOG.md] [--from <ref>] [--to <ref> | --worktree]
 *
 * --to defaults to HEAD and --from to the newest release tag below that version.
 * Everything is read from git, so the output depends only on the two refs
 * (apart from generatedAt). --worktree reads the files on disk instead of --to,
 * for the pull request that bumps the version.
 */
import fs from "fs";
import { execFileSync } from "child_process";
import { compareCatalogs, norm, selectionKey } from "./check-compatibility";
import type { CatalogSnapshot, IdentityGraph } from "./identity-types";

export interface ReleaseCatalog extends CatalogSnapshot { vehicleTypes?: { vehicle_type_id: number; vehicle_type_name: string }[] }
type Graph = Pick<IdentityGraph, "identities" | "aliases" | "catalogLinks" | "evidence"> & Partial<Pick<IdentityGraph, "makeAliases" | "visualCompatibility">>;
export interface ReleaseSide { version: string; catalog: ReleaseCatalog; graph?: Graph }
export interface CatalogRow { year: number; make: string; model: string; vehicleType: string; makeId: number; modelId: number; vehicleTypeId: number }

const emptyGraph: Graph = { identities: [], aliases: [], catalogLinks: [], evidence: [], makeAliases: [] };
const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** JSON with sorted object keys, so equal records compare equal however they were written. */
const stable = (value: unknown): string => JSON.stringify(value, (_, v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => text(a, b))) : v);

/** Records of `after` missing from `before` and the reverse, matched by `key` and returned in key order. */
function changes<T>(before: readonly T[], after: readonly T[], key: (record: T) => string) {
  const index = (rows: readonly T[]) => new Map(rows.map(r => [key(r), r]));
  const a = index(before), b = index(after);
  const only = (from: Map<string, T>, other: Map<string, T>) => [...from].filter(([k]) => !other.has(k)).sort(([x], [y]) => text(x, y)).map(([, r]) => r);
  return { added: only(b, a), removed: only(a, b) };
}

/** An opaque id from the consumer's request board: no spaces, no addresses, no names. */
const REQUEST_REF = /^[ \t]*(?:\*[ \t]+)?Request-Ref:[ \t]*(\S.*?)[ \t]*$/gim;
export function collectRequestRefs(commitMessages: readonly string[]): string[] {
  const refs = new Set<string>();
  for (const message of commitMessages) for (const match of message.matchAll(REQUEST_REF)) {
    if (/^[A-Za-z0-9][A-Za-z0-9._:#-]{0,63}$/.test(match[1])) refs.add(match[1]);
  }
  return [...refs].sort(text);
}

export function buildReleaseDiff(before: ReleaseSide, after: ReleaseSide, options: { generatedAt: string; commitMessages?: readonly string[] }) {
  const report = compareCatalogs(before.catalog, after.catalog);
  const rows = (d: ReleaseCatalog) => new Map(d.models.map(r => [selectionKey(d, r), r]));
  const beforeRows = rows(before.catalog), afterRows = rows(after.catalog);
  const describe = (d: ReleaseCatalog, r: number[]): CatalogRow => ({
    year: r[0], make: d.makes.find(m => m.make_id === r[1])?.make_name ?? String(r[1]), model: d.modelNames[r[3]],
    vehicleType: d.vehicleTypes?.find(t => t.vehicle_type_id === r[4])?.vehicle_type_name ?? String(r[4]),
    makeId: r[1], modelId: r[2], vehicleTypeId: r[4],
  });
  const order = (a: CatalogRow, b: CatalogRow) => text(a.make, b.make) || text(a.model, b.model) || a.year - b.year || a.vehicleTypeId - b.vehicleTypeId;
  const catalog = {
    added: [...afterRows].filter(([k]) => !beforeRows.has(k)).map(([, r]) => describe(after.catalog, r)).sort(order),
    removed: report.removed.map(k => describe(before.catalog, beforeRows.get(k)!)).sort(order),
    modelIdsChanged: report.changedIds.map(k => ({ ...describe(after.catalog, afterRows.get(k)!), previousModelId: beforeRows.get(k)![2] })).sort(order),
  };

  const a = before.graph ?? emptyGraph, b = after.graph ?? emptyGraph;
  const makeName = (id: number) => (after.catalog.makes.find(m => m.make_id === id) ?? before.catalog.makes.find(m => m.make_id === id))?.make_name ?? String(id);
  const brief = (n: { id: string; kind: string }) => ({ id: n.id, kind: n.kind });
  const previous = new Map(a.identities.map(n => [n.id, n]));
  const nodes = changes(a.identities, b.identities, n => n.id);
  const identities = {
    added: nodes.added.map(brief),
    changed: b.identities.filter(n => previous.has(n.id) && stable(previous.get(n.id)) !== stable(n)).map(brief).sort((x, y) => text(x.id, y.id)),
    removed: nodes.removed.map(brief),
  };
  const links = changes(a.catalogLinks, b.catalogLinks, l => [l.identityId, l.year, l.makeId, l.modelId, l.vehicleTypeId].join("|"));
  const link = (l: Graph["catalogLinks"][number]) => ({ identityId: l.identityId, year: l.year, makeId: l.makeId, modelId: l.modelId, vehicleTypeId: l.vehicleTypeId });
  // An alias is its text, target and scope: a rescoped alias is one removal and one addition.
  const scope = (s: { years?: number[]; markets?: string[]; yearBasis?: string }) => stable([s.years ?? null, s.markets ?? null, s.yearBasis ?? null]);
  const aliases = changes(a.aliases, b.aliases, x => [x.text, x.targetId, x.kind, scope(x)].join("|"));
  const alias = (x: Graph["aliases"][number]) => ({ text: x.text, targetId: x.targetId, kind: x.kind, ...(x.markets ? { markets: x.markets } : {}), ...(x.years ? { years: x.years } : {}) });
  const makeAliases = changes(a.makeAliases ?? [], b.makeAliases ?? [], x => [x.text, x.makeId, scope(x)].join("|"));
  const makeAlias = (x: NonNullable<Graph["makeAliases"]>[number]) => ({ text: x.text, makeId: x.makeId, make: makeName(x.makeId), ...(x.markets ? { markets: x.markets } : {}), ...(x.years ? { years: x.years } : {}) });
  const evidence = changes(a.evidence, b.evidence, e => e.id);
  // A rule is its pair, direction, decision and scope; the rationale and evidence can be reworded.
  const rules = changes(a.visualCompatibility ?? [], b.visualCompatibility ?? [], r => [r.requestedVisualIdentityId, r.assetVisualIdentityId, r.decision, scope(r)].join("|"));
  const rule = (r: NonNullable<Graph["visualCompatibility"]>[number]) => ({ id: r.id, requestedVisualIdentityId: r.requestedVisualIdentityId, assetVisualIdentityId: r.assetVisualIdentityId, decision: r.decision });

  const modelKey = (makeId: number, model: string) => `${makeId}:${norm(model)}`;
  const knownModels = new Set(before.catalog.models.map(r => modelKey(r[1], before.catalog.modelNames[r[3]])));
  const result = {
    schemaVersion: 1 as const,
    version: after.version,
    previousVersion: before.version,
    generatedAt: options.generatedAt,
    counts: {} as Record<string, number>,
    catalog,
    identities,
    catalogLinks: { added: links.added.map(link), removed: links.removed.map(link) },
    aliases: { added: aliases.added.map(alias), removed: aliases.removed.map(alias) },
    makeAliases: { added: makeAliases.added.map(makeAlias), removed: makeAliases.removed.map(makeAlias) },
    evidence: { added: evidence.added.map(e => ({ id: e.id, url: e.url })) },
    visualCompatibility: { added: rules.added.map(rule), removed: rules.removed.map(rule) },
    requestRefs: collectRequestRefs(options.commitMessages ?? []),
  };
  result.counts = {
    catalogRowsAdded: catalog.added.length, catalogRowsRemoved: catalog.removed.length, modelIdsChanged: catalog.modelIdsChanged.length,
    makesAdded: after.catalog.makes.filter(m => !before.catalog.makes.some(p => p.make_id === m.make_id)).length,
    modelsAdded: new Set(catalog.added.map(r => modelKey(r.makeId, r.model)).filter(k => !knownModels.has(k))).size,
    identitiesAdded: identities.added.length, identitiesChanged: identities.changed.length, identitiesRemoved: identities.removed.length,
    catalogLinksAdded: links.added.length, catalogLinksRemoved: links.removed.length,
    aliasesAdded: aliases.added.length, aliasesRemoved: aliases.removed.length,
    makeAliasesAdded: makeAliases.added.length, makeAliasesRemoved: makeAliases.removed.length,
    evidenceAdded: evidence.added.length, evidenceRemoved: evidence.removed.length,
    visualRulesAdded: rules.added.length, visualRulesRemoved: rules.removed.length,
    requestRefs: result.requestRefs.length,
  };
  return result;
}
export type ReleaseDiff = ReturnType<typeof buildReleaseDiff>;

/** One CHANGELOG.md section: the counts, then the models that gained rows, by make (at most `limit` of them). */
export function renderChangelogSection(diff: ReleaseDiff, date: string, limit = 30): string {
  const c = diff.counts, n = (count: number, noun: string, plural = `${noun}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? noun : plural}`;
  const lines = [`## ${diff.version} (${date})`, "", `Compared with ${diff.previousVersion}:`, "",
    `- Catalog: ${n(c.catalogRowsAdded, "row")} added (${n(c.modelsAdded, "new model")}, ${n(c.makesAdded, "new make")}), ${c.catalogRowsRemoved} removed, ${n(c.modelIdsChanged, "model ID")} changed.`,
    `- Identity graph: ${n(c.identitiesAdded, "identity", "identities")} added, ${c.identitiesChanged} changed, ${c.identitiesRemoved} removed; ${n(c.catalogLinksAdded, "catalog link")} added, ${c.catalogLinksRemoved} removed.`,
    `- Names: ${n(c.aliasesAdded, "alias", "aliases")} added, ${c.aliasesRemoved} removed; ${n(c.makeAliasesAdded, "make alias", "make aliases")} added, ${c.makeAliasesRemoved} removed.`,
    `- Evidence: ${n(c.evidenceAdded, "record")} added.`];
  // Listed only when a release touches them, so sections written before the rules existed do not change.
  if (c.visualRulesAdded || c.visualRulesRemoved) lines.push(`- Appearance rules: ${n(c.visualRulesAdded, "allow/deny rule")} added, ${c.visualRulesRemoved} removed.`);
  const models = new Map<string, { make: string; model: string; years: number[] }>();
  for (const r of diff.catalog.added) {
    const k = `${r.makeId}:${norm(r.model)}`;
    if (!models.has(k)) models.set(k, { make: r.make, model: r.model, years: [] });
    models.get(k)!.years.push(r.year);
  }
  const shown = [...models.values()].slice(0, limit), byMake = new Map<string, string[]>();
  for (const m of shown) {
    const first = Math.min(...m.years), last = Math.max(...m.years);
    byMake.set(m.make, [...(byMake.get(m.make) ?? []), `${m.model} (${first === last ? first : `${first}–${last}`})`]);
  }
  if (shown.length) lines.push("", "Models with added rows:", "", ...[...byMake].map(([make, names]) => `- ${make}: ${names.join(", ")}`));
  if (models.size > shown.length) lines.push(`- …and ${n(models.size - shown.length, "more model")} not listed here; release.json on the GitHub release lists every row.`);
  return lines.join("\n") + "\n";
}

const CHANGELOG_HEADER = "# Changelog\n\nWhat each published version added, generated by `pnpm run changelog` from the same comparison as the\n`release.json` attached to each GitHub release. Do not edit the sections by hand.\n";
/** Puts `section` in place of the one for the same version, or above the newest one. */
export function updateChangelog(existing: string, version: string, section: string): string {
  const [header, ...sections] = (existing.trim() ? existing : CHANGELOG_HEADER).split(/^(?=## )/m);
  const at = sections.findIndex(s => s.startsWith(`## ${version} `));
  if (at >= 0) sections[at] = section; else sections.unshift(section);
  return [header, ...sections].map(s => s.trim() + "\n").join("\n");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (name: string) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined; };
  const git = (...argv: string[]) => execFileSync("git", argv, { maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).toString();
  const worktree = args.includes("--worktree"), to = option("--to") ?? "HEAD";
  const read = (ref: string | undefined, file: string) => (ref ? git("show", `${ref}:${file}`) : fs.readFileSync(file, "utf8"));
  const side = (ref: string | undefined): ReleaseSide => {
    let graph: Graph | undefined;
    try { graph = JSON.parse(read(ref, "data/identity/catalog.json")); } catch { /* releases before the identity graph */ }
    return { version: JSON.parse(read(ref, "package.json")).version, catalog: JSON.parse(read(ref, "data/compact.json")), graph };
  };
  const after = side(worktree ? undefined : to);
  const parts = (v: string) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v)?.slice(1).map(Number);
  const older = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  let from = option("--from");
  if (!from) {
    const version = parts(after.version.replace(/-.*$/, ""));
    if (!version) throw new Error(`Cannot read a release version from ${after.version}`);
    const tags = git("tag", "--list", "v*").split("\n").filter(t => parts(t) && older(parts(t)!, version) < 0).sort((a, b) => older(parts(a)!, parts(b)!));
    from = tags.pop();
    if (!from) throw new Error(`No release tag below ${after.version}; pass --from <ref>`);
  }
  const head = worktree ? "HEAD" : to;
  const commitMessages = git("log", "--format=%B%x00", `${from}..${head}`).split("\0");
  const diff = buildReleaseDiff(side(from), after, { generatedAt: new Date().toISOString(), commitMessages });
  if (args.includes("--changelog")) {
    const file = option("--changelog") ?? "CHANGELOG.md";
    const date = worktree ? diff.generatedAt.slice(0, 10) : git("log", "-1", "--format=%cs", to).trim();
    fs.writeFileSync(file, updateChangelog(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", diff.version, renderChangelogSection(diff, date)));
    console.error(`Wrote the ${diff.version} section of ${file}`);
  } else {
    const out = option("--out") ?? "release.json";
    fs.writeFileSync(out, JSON.stringify(diff, null, 2) + "\n");
    console.error(`Wrote ${out}: ${from} → ${worktree ? "working tree" : to}`);
  }
  if (!args.includes("--changelog")) console.log(JSON.stringify({ version: diff.version, previousVersion: diff.previousVersion, counts: diff.counts, requestRefs: diff.requestRefs }, null, 2));
}
