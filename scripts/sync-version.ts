/**
 * Syncs server.json (MCP registry manifest) and the Claude plugin manifests to the
 * version in package.json. Runs automatically as the npm "version" lifecycle hook, so
 * `npm version patch` bumps all of them in the same release commit. The Claude plugin
 * directory and `/plugin` installs only pick up a new plugin version when it changes.
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

const PLUGIN_MANIFEST = "plugins/estevao/.claude-plugin/plugin.json";
const plugin = JSON.parse(readFileSync(PLUGIN_MANIFEST, "utf8")) as { name: string; version: string };
plugin.version = pkg.version;
writeFileSync(PLUGIN_MANIFEST, `${JSON.stringify(plugin, null, 2)}\n`);
console.log(`${PLUGIN_MANIFEST} synced to ${pkg.version}`);

// The marketplace file keeps its hand-written layout, so only the plugin entry's
// version string is replaced; the marketplace's own metadata.version is left alone.
const MARKETPLACE = ".claude-plugin/marketplace.json";
const marketplaceText = readFileSync(MARKETPLACE, "utf8");
const marketplace = JSON.parse(marketplaceText) as { plugins: Array<{ name: string; version?: string }> };
const entry = marketplace.plugins.find((p) => p.name === plugin.name);
if (!entry?.version) {
  console.error(`${MARKETPLACE} has no versioned entry for '${plugin.name}'.`);
  process.exit(1);
}
const pluginsAt = marketplaceText.indexOf('"plugins"');
const head = marketplaceText.slice(0, pluginsAt);
const tail = marketplaceText
  .slice(pluginsAt)
  .replace(`"version": "${entry.version}"`, `"version": "${pkg.version}"`);
writeFileSync(MARKETPLACE, head + tail);
console.log(`${MARKETPLACE} synced to ${pkg.version}`);
