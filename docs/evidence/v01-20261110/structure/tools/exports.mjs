// List exported names of lib/*.ts (and other given folders) that no other tracked file names.
// Usage: node exports.mjs <repo> <out.tsv> [folder ...]
// Unit: one exported name of one file. "others" = tracked text files other than
// the declaring file that contain the name as a whole word (comments count, so
// "others == 0" is a lower bound on unused exports).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [repo, out, ...folders] = process.argv.slice(2);
const require = createRequire(path.join(repo, "package.json"));
const ts = require("typescript");

const tracked = execFileSync("git", ["-C", repo, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\0").filter(Boolean);
const textual = tracked.filter((file) =>
  /\.(ts|tsx|mts|mjs|cjs|js|py|sh|yml|json|md|css)$/.test(file) &&
  !file.startsWith("source-assets/") && !file.startsWith("docs/"));
const texts = new Map();
for (const file of textual) {
  try { texts.set(file, readFileSync(path.join(repo, file), "utf8")); } catch {}
}
const codeFiles = [...texts.keys()].filter((file) => !/\.(md|json)$/.test(file));

const wanted = (file) => folders.some((folder) => file.startsWith(folder)) && /\.(ts|tsx|mts)$/.test(file) && !file.endsWith(".d.ts");
const rows = [];
for (const file of tracked.filter(wanted)) {
  const text = texts.get(file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names = [];
  const isExported = (node) => (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push([declaration.name.text, "const"]);
      }
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name && isExported(statement)) {
      const isDefault = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      const kind = ts.isFunctionDeclaration(statement) ? "function" : ts.isClassDeclaration(statement) ? "class" :
        ts.isInterfaceDeclaration(statement) ? "interface" : ts.isTypeAliasDeclaration(statement) ? "type" : "enum";
      names.push([statement.name.text, isDefault ? kind + " (default)" : kind]);
    } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) names.push([element.name.text, statement.moduleSpecifier ? "re-export" : "export list"]);
    }
  }
  for (const [name, kind] of names) {
    const word = new RegExp(`(?<![A-Za-z0-9_$])${name.replace(/[$]/g, "\\$")}(?![A-Za-z0-9_$])`, "g");
    const others = codeFiles.filter((other) => other !== file && word.test(texts.get(other)) | (word.lastIndex = 0, false));
    const own = (text.match(word) ?? []).length;
    rows.push([file, name, kind, own, others.length, others.slice(0, 4).join(",")]);
  }
}
writeFileSync(out, "file\tname\tkind\town_mentions\tother_files\tfirst_others\n" + rows.map((row) => row.join("\t")).join("\n") + "\n");
const unused = rows.filter((row) => row[4] === 0);
console.log(`files=${new Set(rows.map((row) => row[0])).size} exports=${rows.length} named_by_no_other_file=${unused.length}`);
