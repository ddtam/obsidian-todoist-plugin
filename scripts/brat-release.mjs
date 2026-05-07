// Single-step release for the Todoist Sync+ fork. Bumps versions, builds,
// commits, pushes, and creates a GitHub release with the build artifacts.
//
// Usage:
//   $ npm run brat:release -- <version> [--notes "..."]
//
// Examples:
//   $ npm run brat:release -- 2.6.0-plus.2
//   $ npm run brat:release -- 2.7.0-plus.1 --notes "added widget X"
//
// If --notes is omitted, the release notes are populated from the
// `git log <previous-version>..HEAD` between the prior release tag and
// HEAD. The user can always edit them on GitHub afterward.

import { execSync } from "node:child_process";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const die = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

const args = process.argv.slice(2);
const version = args[0];
if (!version || version.startsWith("--")) {
  die('version is required\n  usage: npm run brat:release -- <version> [--notes "..."]');
}

let userNotes;
const notesFlagIdx = args.indexOf("--notes");
if (notesFlagIdx !== -1) {
  userNotes = args[notesFlagIdx + 1];
  if (!userNotes) {
    die("--notes flag provided without a value");
  }
}

// 1. Read + bump manifest.json
const manifestPath = resolve(root, "manifest.json");
const manifestRaw = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestRaw);
const previousVersion = manifest.version;
if (previousVersion === version) {
  die(`version ${version} is already the current version in manifest.json`);
}
manifest.version = version;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest.json: ${previousVersion} -> ${version}`);

// 2. Add to versions.json (insert at top so newest is first)
const versionsPath = resolve(root, "versions.json");
const versions = JSON.parse(await readFile(versionsPath, "utf8"));
if (versions[version]) {
  die(`${version} already exists in versions.json`);
}
const newVersions = { [version]: manifest.minAppVersion, ...versions };
await writeFile(versionsPath, `${JSON.stringify(newVersions, null, 2)}\n`);
console.log(`versions.json: + "${version}": "${manifest.minAppVersion}"`);

// 3. Build
console.log("\n--- building ---");
execSync("npm run build --workspace=plugin", { cwd: root, stdio: "inherit" });

// 4. Copy artifacts to repo root
const dist = resolve(root, "plugin", "dist");
for (const f of ["main.js", "styles.css"]) {
  const src = resolve(dist, f);
  try {
    await access(src);
  } catch {
    die(`build did not produce ${f} at ${src}`);
  }
  await copyFile(src, resolve(root, f));
}
console.log("copied: main.js, styles.css");

// 5. Determine fork remote + GitHub repo (org/repo)
let forkRemote = "fork";
try {
  execSync("git remote get-url fork", { cwd: root, stdio: "ignore" });
} catch {
  // Fall back to whatever the current branch tracks.
  forkRemote = execSync("git rev-parse --abbrev-ref --symbolic-full-name @{upstream}", {
    cwd: root,
  })
    .toString()
    .trim()
    .split("/")[0];
}
const remoteUrl = execSync(`git remote get-url ${forkRemote}`, { cwd: root }).toString().trim();
const repoMatch = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
if (!repoMatch) {
  die(`cannot parse GitHub repo from remote URL '${remoteUrl}'`);
}
const repo = repoMatch[1];
console.log(`\nfork remote: ${forkRemote} -> ${repo}`);

// 6. Auto-generate notes from commits since the previous release tag,
//    unless the user supplied --notes.
let notes;
if (userNotes !== undefined) {
  notes = userNotes;
} else {
  try {
    execSync(`git fetch ${forkRemote} --tags --quiet`, { cwd: root });
    const log = execSync(`git log --pretty=format:- %s ${previousVersion}..HEAD`, {
      cwd: root,
    })
      .toString()
      .trim();
    notes = log.length > 0 ? log : `Release ${version}.`;
  } catch {
    notes = `Release ${version}.`;
  }
}

// 7. Commit + push
console.log("\n--- committing + pushing ---");
execSync("git add manifest.json versions.json main.js styles.css", { cwd: root, stdio: "inherit" });
execSync(`git commit -m "release: ${version}"`, { cwd: root, stdio: "inherit" });
execSync("git push", { cwd: root, stdio: "inherit" });

// 8. Create GitHub release
console.log("\n--- creating GitHub release ---");
execSync(
  `gh release create ${version} main.js styles.css manifest.json` +
    ` --repo ${repo}` +
    ` --title "Todoist Sync+ ${version}"` +
    " --notes-file -",
  { cwd: root, stdio: ["pipe", "inherit", "inherit"], input: notes },
);

console.log(`\ndone: Todoist Sync+ ${version} released to ${repo}.`);
