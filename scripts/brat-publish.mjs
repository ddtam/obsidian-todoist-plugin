// Copy the plugin's build artifacts (main.js, styles.css) from
// `plugin/dist/` to the repo root so BRAT (Beta Reviewer's Auto-update
// Tool) can find them when tracking the latest commit on this branch.
//
// Run after `npm run build`:
//   $ npm run brat:build   # from repo root
//
// Then commit + push to your fork; BRAT on other devices picks up the
// new commit on its next "Check for updates."

import { access, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "plugin", "dist");

const artifacts = ["main.js", "styles.css"];

for (const f of artifacts) {
  const src = resolve(dist, f);
  try {
    await access(src);
  } catch {
    console.error(`error: ${f} not found at ${src}`);
    console.error("Run `npm run build --workspace=plugin` first.");
    process.exit(1);
  }
  await copyFile(src, resolve(root, f));
  console.log(`copied: ${f}`);
}

console.log("\nNext steps:");
console.log("  git add manifest.json versions.json main.js styles.css");
console.log('  git commit -m "release: <version>"');
console.log("  git push <fork-remote> <branch>");
