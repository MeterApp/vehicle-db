#!/usr/bin/env node
// Install the published shape outside the checkout: no workspace/source aliases.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const work = mkdtempSync(join(tmpdir(), "vehicle-db-consumer-"));
const run = (command, args, cwd = work) => execFileSync(command, args, { cwd, encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
try {
  const packed = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", work], root));
  const [info] = Object.values(packed);
  writeFileSync(join(work, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(work, info.filename)]);
  writeFileSync(join(work, "consumer.mjs"), `
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { getMakes, getModels } from "@meterapp/vehicle-db";
import { searchVehicles } from "@meterapp/vehicle-db/search";
import { resolveVehicle, getVisualCompatibilityRules } from "@meterapp/vehicle-db/resolve";
import { normalizeIdentityText, evaluateVisualCompatibility } from "@meterapp/vehicle-db/identity";
const require = createRequire(import.meta.url);
for (const subpath of ["", "/search", "/resolve", "/identity", "/package.json"]) assert.ok(Object.keys(require("@meterapp/vehicle-db" + subpath)).length);
assert.equal(require("@meterapp/vehicle-db/package.json").version, ${JSON.stringify(manifest.version)});
globalThis.fetch = () => { throw new Error("Offline catalog must never use the network"); };
const toyota = getMakes({ year: 2024 }).find(make => make.makeName.toLowerCase() === "toyota");
assert.ok(toyota);
assert.ok(getModels({ year: 2024, makeId: toyota.makeId }).some(model => model.modelName.toLowerCase() === "camry"));
assert.ok(searchVehicles("2024 Toyota Camry").length);
assert.equal(resolveVehicle("2024 Toyota Camry").status, "MATCHED");
// The market of a reviewed row ships in the bundle; a register row has none.
assert.equal(resolveVehicle("2012 Nissan Navara D40", { market: "AU" }).status, "MATCHED");
assert.equal(resolveVehicle("2012 Nissan Navara D40", { market: "US" }).status, "SCOPE_UNVERIFIED");
assert.equal(resolveVehicle("2019 Ford Ranger", { market: "AU", yearBasis: "catalog-year", depth: "visual" }).selection?.identityId, "ford:ranger:px:facelift-2015");
assert.equal(normalizeIdentityText(" Toyota  Camry "), "toyota camry");
// The bundled appearance rules are readable: a badge twin is allowed in its scope, a look-alike denied, anything else unknown.
const rules = getVisualCompatibilityRules();
const twin = ["opel:corsa:2019:facelift-2023", "vauxhall:corsa:2019:facelift-2023"];
assert.equal(evaluateVisualCompatibility(rules, twin[0], twin[1], { year: 2024, market: "DE", yearBasis: "catalog-year" }), "allow");
assert.equal(evaluateVisualCompatibility(rules, twin[0], twin[1], { year: 2023, market: "DE", yearBasis: "catalog-year" }), "unknown");
assert.equal(evaluateVisualCompatibility(rules, "toyota:bz4x:first:original", "subaru:solterra:first:original", { year: 2024, market: "US", yearBasis: "catalog-year" }), "deny");
assert.ok(rules.every(rule => rule.rationale && rule.evidenceIds.length));
`);
  run(process.execPath, [join(work, "consumer.mjs")]);
  const types = `
import { getMakes, getModels, type Make } from "@meterapp/vehicle-db";
import { searchVehicles } from "@meterapp/vehicle-db/search";
import { resolveVehicle, getVisualCompatibilityRules } from "@meterapp/vehicle-db/resolve";
import { normalizeIdentityText, evaluateVisualCompatibility, type VisualCompatibility } from "@meterapp/vehicle-db/identity";
const rules: readonly VisualCompatibility[] = getVisualCompatibilityRules();
void evaluateVisualCompatibility(rules, "a", "b", { year: 2024, market: "DE", yearBasis: "catalog-year" });
const makes: Make[] = getMakes({year:2024});
void [makes, getModels({year:2024}), searchVehicles("2024 Toyota Camry"), resolveVehicle("2024 Toyota Camry"), normalizeIdentityText("Camry")];
`;
  writeFileSync(join(work, "consumer.ts"), types);
  writeFileSync(join(work, "consumer.cts"), types);
  run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--strict", "--noEmit", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "consumer.ts", "consumer.cts"]);
  console.log(`Packed ${manifest.name}@${manifest.version}: every export works via ESM/CommonJS, offline lookups and strict consumer types passed.`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
