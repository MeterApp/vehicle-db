// A pull request from a `request/*` branch is opened by the missing-vehicle
// automation and merges itself once CI passes, which publishes to npm with no
// person reading the diff. Such a pull request may therefore change catalog
// data and the files a data release regenerates, and nothing else: not code,
// not the workflows, not dependencies. Anything else needs a person, on a
// branch with another name.
//
// Run by .github/workflows/request-pr-scope.yml from the base branch's copy of
// this file, so a pull request cannot loosen its own rule.
import { execFileSync } from "node:child_process";

export const REQUEST_BRANCH_PREFIX = "request/";

const ALLOWED_PATHS = [
  /^CHANGELOG\.md$/,
  /^README\.md$/,
  /^package\.json$/, // its `version` only; see packageJsonChangesBeyondVersion
  /^data\//,
  /^src\/(?:data|identity-data)\.ts$/,
  /^scripts\/fixtures\//,
];

/** Changed paths (a rename counts under both names) a request may not touch. */
export function outOfScopePaths(paths: string[]): string[] {
  return [...new Set(paths)].filter(path => !ALLOWED_PATHS.some(allowed => allowed.test(path))).sort();
}

/** Top-level package.json keys, other than `version`, that differ. */
export function packageJsonChangesBeyondVersion(base: string, head: string): string[] {
  const before = JSON.parse(base) as Record<string, unknown>, after = JSON.parse(head) as Record<string, unknown>;
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => key !== "version" && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort();
}

export function requestScopeProblems(input: { headRef: string; paths: string[]; basePackageJson: string; headPackageJson: string }): string[] {
  if (!input.headRef.startsWith(REQUEST_BRANCH_PREFIX)) return [];
  return [
    ...outOfScopePaths(input.paths).map(path => `${path}: a request pull request may only change catalog data and its generated files`),
    ...(input.paths.includes("package.json")
      ? packageJsonChangesBeyondVersion(input.basePackageJson, input.headPackageJson).map(key => `package.json: "${key}" changed; a request pull request may only change "version"`)
      : []),
  ];
}

if (require.main === module) {
  const env = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  const gh = (...args: string[]) => execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  const headRef = env("HEAD_REF");
  if (!headRef.startsWith(REQUEST_BRANCH_PREFIX)) {
    console.log(`${headRef} is not a ${REQUEST_BRANCH_PREFIX}* branch; nothing to check.`);
  } else {
    const repo = env("REPO"), raw = ["-H", "Accept: application/vnd.github.raw"];
    const paths = gh("--paginate", `repos/${repo}/pulls/${env("PR_NUMBER")}/files`, "--jq", ".[] | .filename, (.previous_filename // empty)").split("\n").filter(Boolean);
    const problems = requestScopeProblems({
      headRef, paths,
      basePackageJson: gh(...raw, `repos/${repo}/contents/package.json?ref=${env("BASE_SHA")}`),
      headPackageJson: gh(...raw, `repos/${env("HEAD_REPO")}/contents/package.json?ref=${env("HEAD_SHA")}`),
    });
    for (const problem of problems) console.error(`::error::${problem}`);
    if (problems.length) process.exitCode = 1;
    else console.log(`${paths.length} changed files, all within a catalog data release.`);
  }
}
