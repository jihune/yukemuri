// Module import graph of the tracked TS/JS sources; lists modules that the
// built app does not reach and modules nothing imports.
// Usage: node imports.mjs <repo> <out.txt>
// An edge is a static import/export-from, a dynamic import("literal"), a
// require("literal") or new URL("literal", import.meta.url).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [repo, out] = process.argv.slice(2);
const require = createRequire(path.join(repo, "package.json"));
const ts = require("typescript");
const tracked = execFileSync("git", ["-C", repo, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\0").filter(Boolean);
const trackedSet = new Set(tracked);
const sources = tracked.filter((file) => /\.(ts|tsx|mts|mjs|cjs|js)$/.test(file) && !file.startsWith("examples/"));

function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  const candidates = [base, ...[".ts", ".tsx", ".mts", ".mjs", ".js", ".json", ".d.ts"].map((ext) => base + ext),
    base.replace(/\.js$/, ".ts"), base.replace(/\.mjs$/, ".mts"), base + "/index.ts", base + "/index.tsx"];
  for (const candidate of candidates) {
    if (trackedSet.has(candidate)) return candidate;
    const absolute = path.join(repo, candidate);
    if (existsSync(absolute) && statSync(absolute).isFile()) return candidate + " (untracked)";
  }
  return base + " (unresolved)";
}

const edges = new Map();
for (const file of sources) {
  const text = readFileSync(path.join(repo, file), "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const specs = new Set();
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.add(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteralLike(node.arguments[0]) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      specs.add(node.arguments[0].text);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" &&
        node.arguments?.length === 2 && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[0].text.startsWith(".")) {
      specs.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  edges.set(file, [...specs].map((spec) => resolve(file, spec)).filter(Boolean));
}

function reach(roots) {
  const seen = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    for (const next of edges.get(queue.pop()) ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}
const appRoots = sources.filter((file) => /^app\/.*(route|page|layout)\.tsx?$/.test(file)).concat(["build/sites-worker.ts", "vite.config.ts"]);
const appReach = reach(appRoots);
const scriptRoots = sources.filter((file) => file.startsWith("scripts/"));
const scriptReach = reach(scriptRoots);
const importedBy = new Map();
for (const [file, targets] of edges) for (const target of targets) {
  if (!importedBy.has(target)) importedBy.set(target, []);
  importedBy.get(target).push(file);
}
const lines = [`sources=${sources.length} app_roots=${appRoots.length} app_reach=${[...appReach].filter((f) => trackedSet.has(f)).length}`];
lines.push("", "## tracked modules outside scripts/ that the app roots (app/**/route|page|layout, build/sites-worker.ts, vite.config.ts) do not reach");
for (const file of sources) {
  if (file.startsWith("scripts/") || appReach.has(file)) continue;
  const by = importedBy.get(file) ?? [];
  lines.push(`${file}\timported_by=${by.length}\tby_scripts=${scriptReach.has(file) ? "yes" : "no"}\t${by.slice(0, 6).join(",")}`);
}
lines.push("", "## non-source tracked files (json, css, etc.) under lib/ data/ public/ vendor/ imported by a module");
for (const [target, by] of importedBy) {
  if (/\.(json|css)( |$)/.test(target)) lines.push(`${target}\tapp=${appReach.has(target) ? "yes" : "no"}\t${by.slice(0, 6).join(",")}`);
}
lines.push("", "## unresolved or untracked import targets");
for (const [target, by] of importedBy) if (/\((unresolved|untracked)\)$/.test(target)) lines.push(`${target}\t${by.slice(0, 4).join(",")}`);
writeFileSync(out, lines.join("\n") + "\n");
console.log(lines[0]);
