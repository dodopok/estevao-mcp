/**
 * Syncs server.json (MCP registry manifest) to the version in package.json.
 * Runs automatically as the npm "version" lifecycle hook, so `npm version patch`
 * bumps both files in the same release commit.
 */
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const manifest = JSON.parse(readFileSync("server.json", "utf8")) as {
  version: string;
  description: string;
  packages: Array<{ version: string }>;
};

manifest.version = pkg.version;
for (const entry of manifest.packages) entry.version = pkg.version;

if (manifest.description.length > 100) {
  console.error(`server.json description has ${manifest.description.length} chars (registry limit: 100).`);
  process.exit(1);
}

writeFileSync("server.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`server.json synced to ${pkg.version}`);
