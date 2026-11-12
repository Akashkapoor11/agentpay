import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
} catch {
  const globalModules = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  ts = require(path.join(globalModules, 'typescript'));
}

const roots = ['backend', 'frontend'];
const extensions = /\.(?:js|jsx|ts|tsx|mjs|cjs)$/;
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'dist', '.git'].includes(entry.name)) walk(fullPath);
    } else if (extensions.test(entry.name)) {
      files.push(fullPath);
    }
  }
}

for (const root of roots) walk(root);
const diagnostics = [];
for (const fileName of files) {
  const source = fs.readFileSync(fileName, 'utf8');
  const result = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      checkJs: false,
      isolatedModules: true
    }
  });
  for (const diagnostic of result.diagnostics || []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    const position = diagnostic.file && diagnostic.start != null
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;
    diagnostics.push({
      file: fileName,
      line: position ? position.line + 1 : null,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
    });
  }
}

if (diagnostics.length) {
  for (const diagnostic of diagnostics) {
    process.stderr.write(`${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''}: ${diagnostic.message}\n`);
  }
  process.exit(1);
}
console.log(`Source syntax check passed: ${files.length} JavaScript/TypeScript/JSX files checked.`);
