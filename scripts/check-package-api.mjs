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
import { resolveVehicle } from "@meterapp/vehicle-db/resolve";
import { normalizeIdentityText } from "@meterapp/vehicle-db/identity";
const require = createRequire(import.meta.url);
for (const subpath of ["", "/search", "/resolve", "/identity", "/package.json"]) assert.ok(Object.keys(require("@meterapp/vehicle-db" + subpath)).length);
assert.equal(require("@meterapp/vehicle-db/package.json").version, ${JSON.stringify(manifest.version)});
globalThis.fetch = () => { throw new Error("Offline catalog must never use the network"); };
const toyota = getMakes({ year: 2024 }).find(make => make.makeName.toLowerCase() === "toyota");
assert.ok(toyota);
assert.ok(getModels({ year: 2024, makeId: toyota.makeId }).some(model => model.modelName.toLowerCase() === "camry"));
assert.ok(searchVehicles("2024 Toyota Camry").length);
assert.equal(resolveVehicle("2024 Toyota Camry").status, "MATCHED");
assert.equal(normalizeIdentityText(" Toyota  Camry "), "toyota camry");
`);
  run(process.execPath, [join(work, "consumer.mjs")]);
  const types = `
import { getMakes, getModels, type Make } from "@meterapp/vehicle-db";
import { searchVehicles } from "@meterapp/vehicle-db/search";
import { resolveVehicle } from "@meterapp/vehicle-db/resolve";
import { normalizeIdentityText } from "@meterapp/vehicle-db/identity";
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
