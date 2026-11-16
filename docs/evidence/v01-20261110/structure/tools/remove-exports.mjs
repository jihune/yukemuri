// Remove named top-level exported declarations from files in the repository COPY.
// Usage (cwd = repo copy): node remove-exports.mjs file:name [file:name ...]
// Prints one line per removal; exits 1 when a name is not found as a top-level statement.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

if (!process.cwd().endsWith('/scratchpad/v01/structure/repo')) throw new Error('run in the scratch copy only');
const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const byFile = new Map();
for (const item of process.argv.slice(2)) {
  const [file, name] = item.split(':');
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push(name);
}
let failed = false;
for (const [file, names] of byFile) {
  let text = readFileSync(file, 'utf8');
  for (const name of names) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const statement = source.statements.find((node) =>
      ((ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.name?.text === name) ||
      (ts.isVariableStatement(node) && node.declarationList.declarations.length === 1 && node.declarationList.declarations[0].name.getText(source) === name));
    if (!statement) { console.log(`NOT FOUND ${file}:${name}`); failed = true; continue; }
    text = text.slice(0, statement.getFullStart()) + text.slice(statement.getEnd());
    console.log(`removed ${file}:${name} (${statement.getEnd() - statement.getStart(source)} chars)`);
  }
  writeFileSync(file, text);
}
process.exit(failed ? 1 : 0);
