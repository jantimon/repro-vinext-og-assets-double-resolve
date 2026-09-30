// node scripts/compare.mjs [runs]
// Runs each variant `runs` times, interleaved, each in a fresh process with an empty Vite cache.
import { execFileSync } from "node:child_process";
import path from "node:path";

const runs = Number(process.argv[2] ?? 7);
const variants = [
  { name: "1.0.0", vinext: "1.0.0", mode: "stock" },
  { name: "1.0.0, hook removed", vinext: "1.0.0", mode: "off" },
  { name: "main", vinext: "main", mode: "stock" },
  { name: "main, hook removed", vinext: "main", mode: "off" },
  { name: "main, hook returns its resolve result", vinext: "main", mode: "return" },
];

const serveOnce = ({ vinext, mode }) => {
  const output = execFileSync(process.execPath, [path.join(import.meta.dirname, "serve-once.mjs"), "--mode", mode], {
    encoding: "utf8",
    env: { ...process.env, VINEXT: vinext },
  });
  return JSON.parse(output.trim().split("\n").at(-1));
};

const results = new Map(variants.map((v) => [v.name, []]));
for (let run = 1; run <= runs; run++) {
  for (const variant of variants) {
    const result = serveOnce(variant);
    if (result.status !== 200) throw new Error(`${variant.name}: status ${result.status}`);
    results.get(variant.name).push(result);
    console.log(`run ${run}/${runs} ${variant.name}: ${result.firstHtmlMs} ms, cpu ${result.cpuMs} ms`);
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

console.log(`\nMedian of ${runs} runs, min-max in brackets:\n`);
console.log("| vinext | first HTML | CPU time | vite:resolve-dev calls | hook calls | this.resolve() in hook |");
console.log("|---|---:|---:|---:|---:|---:|");
for (const [name, list] of results) {
  const wall = list.map((r) => r.firstHtmlMs);
  const cpu = list.map((r) => r.cpuMs);
  const [first] = list;
  console.log(
    `| ${name} | ${seconds(median(wall))} (${seconds(Math.min(...wall))}-${seconds(Math.max(...wall))}) | ${seconds(median(cpu))} (${seconds(Math.min(...cpu))}-${seconds(Math.max(...cpu))}) | ${first.resolveIdCalls["vite:resolve-dev"]} | ${first.og.calls} | ${first.og.tracked} |`,
  );
}

const all = [...results.values()].flat();
const hashes = new Set(all.map((r) => r.htmlSha1));
const modules = new Set(all.map((r) => r.serverModules));
console.log(`\nserver modules: ${[...modules].join(", ")}`);
console.log(hashes.size === 1 ? `HTML identical in all ${all.length} runs (sha1 ${[...hashes][0]})` : `HTML differs: ${[...hashes].join(", ")}`);
