// Starts the vite dev server with vinext, requests `/` once and prints JSON stats.
// --mode stock    vinext as installed
// --mode off      without the resolveId hook of vinext:og-inline-fetch-assets
// --mode return   the hook returns the result of its own this.resolve() instead of null
// --html <file>   also writes the HTML to <file>
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values } = parseArgs({ options: { mode: { type: "string", default: "stock" }, html: { type: "string" } } });
const OG_PLUGIN = "vinext:og-inline-fetch-assets";

const calls = new Map();
const og = { calls: 0, tracked: 0 };
const count = (name) => calls.set(name, (calls.get(name) ?? 0) + 1);

function wrapResolveId(plugin) {
  const hook = plugin.resolveId;
  if (!hook) return;
  const handler = typeof hook === "function" ? hook : hook.handler;
  const isOg = plugin.name === OG_PLUGIN;

  const wrapped = async function (source, importer, options) {
    count(plugin.name);
    if (!isOg) return handler.call(this, source, importer, options);

    og.calls++;
    let resolved = null;
    const context = {
      resolve: async (...args) => {
        og.tracked++;
        resolved = await this.resolve(...args);
        return resolved;
      },
    };
    const result = await handler.call(context, source, importer, options);
    if (values.mode === "return" && resolved && !resolved.external) return resolved;
    return result;
  };
  plugin.resolveId = typeof hook === "function" ? wrapped : { ...hook, handler: wrapped };
}

const measure = {
  name: "measure-resolve-id",
  configResolved(config) {
    for (const plugin of config.plugins) {
      if (plugin.name === OG_PLUGIN && values.mode === "off") delete plugin.resolveId;
      wrapResolveId(plugin);
    }
  },
};

const start = performance.now();
const server = await createServer({
  configFile: path.resolve(import.meta.dirname, "../vite.config.js"),
  cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), "vite-cache-")),
  logLevel: "error",
  server: { port: 0 },
  plugins: [measure],
});
await server.listen();
const listening = performance.now();
const { port } = server.httpServer.address();
const response = await fetch(`http://localhost:${port}/`);
const html = await response.text();
const done = performance.now();
await server.close();
const cpu = process.cpuUsage();
if (values.html) fs.writeFileSync(values.html, html);

const serverModules = server.environments.ssr.moduleGraph.idToModuleMap.size;
console.log(
  JSON.stringify({
    mode: values.mode,
    status: response.status,
    vinext: process.env.VINEXT === "main" ? "main" : "1.0.0",
    firstHtmlMs: Math.round(done - start),
    cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    requestMs: Math.round(done - listening),
    serverModules,
    resolveIdCalls: Object.fromEntries([...calls].sort((a, b) => b[1] - a[1])),
    og: { calls: og.calls, tracked: og.tracked },
    htmlSha1: createHash("sha1").update(html).digest("hex").slice(0, 12),
    htmlBytes: html.length,
  }),
);
process.exit(0);
