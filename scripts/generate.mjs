// Writes PACKAGES local packages with MODULES modules each. package.json links them with `file:`
// Every module imports react and IMPORTS deep specifiers from lower-numbered packages
import fs from "node:fs";
import path from "node:path";

const PACKAGES = 60;
const MODULES = 50;
const IMPORTS = 8;

const root = path.resolve(import.meta.dirname, "..");
const pad = (n) => String(n).padStart(2, "0");
const pkgName = (p) => `pkg-${pad(p)}`;

for (let p = 0; p < PACKAGES; p++) {
  const dir = path.join(root, "packages", pkgName(p));
  fs.rmSync(path.join(dir, "src"), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });

  for (let m = 0; m < MODULES; m++) {
    const lines = [`import { createElement as h } from "react";`];
    const used = [];
    for (let i = 0; p > 0 && i < IMPORTS; i++) {
      const target = `${pkgName((p * 7 + m * 3 + i * 11) % p)}/m${pad((m * 13 + i * 17) % MODULES)}`;
      lines.push(`import { label as d${i} } from "${target}";`);
      used.push(`d${i}`);
    }
    lines.push(
      `export const label = "${pkgName(p)}/m${pad(m)}";`,
      `export const Item = () => h("li", null, label, " ", ${used.length ? `[${used.join(", ")}].length` : "0"});`,
    );
    fs.writeFileSync(path.join(dir, "src", `m${pad(m)}.js`), `${lines.join("\n")}\n`);
  }

  const index = [`import { createElement as h } from "react";`];
  for (let m = 0; m < MODULES; m++) index.push(`import { Item as I${m} } from "./src/m${pad(m)}.js";`);
  index.push(
    `export const List = () => h("ul", null, ${Array.from({ length: MODULES }, (_, m) => `h(I${m})`).join(", ")});`,
  );
  fs.writeFileSync(path.join(dir, "index.js"), `${index.join("\n")}\n`);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify({ name: pkgName(p), private: true, type: "module", exports: { ".": "./index.js", "./*": "./src/*.js" }, peerDependencies: { react: "*" } }, null, 2)}\n`,
  );
}

const page = [`import Link from "next/link";`];
for (let p = 0; p < PACKAGES; p++) page.push(`import { List as L${p} } from "${pkgName(p)}";`);
page.push(
  ``,
  `export default function Home() {`,
  `  return (`,
  `    <main>`,
  `      <Link href="/">home</Link>`,
  ...Array.from({ length: PACKAGES }, (_, p) => `      <L${p} />`),
  `    </main>`,
  `  );`,
  `}`,
);
fs.mkdirSync(path.join(root, "pages"), { recursive: true });
fs.writeFileSync(path.join(root, "pages", "index.jsx"), `${page.join("\n")}\n`);

console.log(`${PACKAGES} packages, ${PACKAGES * (MODULES + 1)} modules, ${(PACKAGES - 1) * MODULES * IMPORTS} cross-package imports`);
