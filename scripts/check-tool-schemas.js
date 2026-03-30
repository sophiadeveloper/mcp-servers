#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = process.cwd();

function findServerFiles(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith('-node')) continue;

    const indexJs = path.join(rootDir, entry.name, 'index.js');
    if (fs.existsSync(indexJs)) files.push(indexJs);
  }

  const linterTs = path.join(rootDir, 'linter-node', 'src', 'index.ts');
  if (fs.existsSync(linterTs) && !files.includes(linterTs)) files.push(linterTs);

  return files.sort((a, b) => a.localeCompare(b));
}

function getLineNumber(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function skipString(text, startIndex, quoteChar) {
  let i = startIndex + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quoteChar) return i;
    i += 1;
  }
  return text.length - 1;
}

function skipLineComment(text, startIndex) {
  let i = startIndex + 2;
  while (i < text.length && text[i] !== '\n') i += 1;
  return i;
}

function skipBlockComment(text, startIndex) {
  let i = startIndex + 2;
  while (i < text.length - 1) {
    if (text[i] === '*' && text[i + 1] === '/') return i + 1;
    i += 1;
  }
  return text.length - 1;
}

function findMatchingBrace(text, openBraceIndex) {
  let depth = 0;

  for (let i = openBraceIndex; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i, ch);
      continue;
    }

    if (ch === '/' && next === '/') {
      i = skipLineComment(text, i);
      continue;
    }

    if (ch === '/' && next === '*') {
      i = skipBlockComment(text, i);
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function findInputSchemas(fileText) {
  const schemas = [];
  const schemaToken = 'inputSchema';
  let fromIndex = 0;

  while (fromIndex < fileText.length) {
    const tokenIndex = fileText.indexOf(schemaToken, fromIndex);
    if (tokenIndex === -1) break;

    let colonIndex = tokenIndex + schemaToken.length;
    while (colonIndex < fileText.length && /\s/.test(fileText[colonIndex])) colonIndex += 1;
    if (fileText[colonIndex] !== ':') {
      fromIndex = tokenIndex + schemaToken.length;
      continue;
    }

    let exprStart = colonIndex + 1;
    while (exprStart < fileText.length && /\s/.test(fileText[exprStart])) exprStart += 1;

    if (fileText[exprStart] !== '{') {
      fromIndex = exprStart;
      continue;
    }

    const exprEnd = findMatchingBrace(fileText, exprStart);
    if (exprEnd === -1) {
      fromIndex = exprStart + 1;
      continue;
    }

    const schemaSource = fileText.slice(exprStart, exprEnd + 1);
    const line = getLineNumber(fileText, tokenIndex);

    const backWindow = fileText.slice(Math.max(0, tokenIndex - 500), tokenIndex);
    const nameMatches = [...backWindow.matchAll(/name\s*:\s*["']([^"']+)["']/g)];
    const toolName = nameMatches.length > 0 ? nameMatches[nameMatches.length - 1][1] : '(unknown-tool)';

    schemas.push({ toolName, line, schemaSource });
    fromIndex = exprEnd + 1;
  }

  return schemas;
}

function parseSchemaObject(schemaSource) {
  try {
    const fallbackNode = {
      type: 'object',
      additionalProperties: true,
      x_allow_empty_object: true,
    };

    const dynamicScope = new Proxy(Object.create(null), {
      has() {
        return true;
      },
      get(_target, prop) {
        if (prop === Symbol.unscopables) return undefined;
        if (prop === 'undefined') return undefined;
        return fallbackNode;
      },
    });

    const evaluator = vm.runInNewContext(
      `(function(scope){ with (scope) { return (${schemaSource}); } })`,
      Object.create(null)
    );

    return { value: evaluator(dynamicScope), error: null };
  } catch (error) {
    return { value: null, error };
  }
}

function addIssue(issues, severity, pathTokens, message) {
  issues.push({ severity, path: pathTokens.join('.'), message });
}

function validateSchemaNode(node, state, pathTokens = []) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;

  if (node.type === 'array') {
    const hasItems = Object.prototype.hasOwnProperty.call(node, 'items');
    if (!hasItems) {
      addIssue(state.issues, 'error', pathTokens.concat(['items']), 'Schema array without items.');
    }
  }

  if (node.type === 'object') {
    const hasProperties = Object.prototype.hasOwnProperty.call(node, 'properties');
    const allowEmptyObject = node.additionalProperties === true || node.x_allow_empty_object === true;

    if (!hasProperties && !allowEmptyObject) {
      addIssue(
        state.issues,
        'warning',
        pathTokens.concat(['properties']),
        'Object schema without properties (set additionalProperties: true or x_allow_empty_object: true if intentional).'
      );
    }

    if (Object.prototype.hasOwnProperty.call(node, 'required')) {
      if (!Array.isArray(node.required)) {
        addIssue(state.issues, 'error', pathTokens.concat(['required']), 'required must be an array of strings.');
      } else {
        const duplicates = new Set();
        const seen = new Set();

        for (const key of node.required) {
          if (typeof key !== 'string') {
            addIssue(state.issues, 'error', pathTokens.concat(['required']), `required contains a non-string key: ${String(key)}`);
            continue;
          }
          if (seen.has(key)) duplicates.add(key);
          seen.add(key);

          if (hasProperties && node.properties && !Object.prototype.hasOwnProperty.call(node.properties, key)) {
            addIssue(state.issues, 'error', pathTokens.concat(['required']), `required key \"${key}\" is not defined in properties.`);
          }
        }

        if (duplicates.size > 0) {
          addIssue(
            state.issues,
            'warning',
            pathTokens.concat(['required']),
            `required contains duplicate keys: ${Array.from(duplicates).join(', ')}`
          );
        }
      }
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === 'object') {
          validateSchemaNode(item, state, pathTokens.concat([key, String(index)]));
        }
      });
      continue;
    }

    validateSchemaNode(value, state, pathTokens.concat([key]));
  }
}

function inspectFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const schemas = findInputSchemas(source);

  const toolReports = schemas.map((schemaItem) => {
    const parsed = parseSchemaObject(schemaItem.schemaSource);
    const issues = [];

    if (parsed.error) {
      issues.push({
        severity: 'error',
        path: 'inputSchema',
        message: `Unable to evaluate inputSchema object: ${parsed.error.message}`,
      });
    } else {
      const state = { issues };
      validateSchemaNode(parsed.value, state, ['inputSchema']);
    }

    return {
      toolName: schemaItem.toolName,
      line: schemaItem.line,
      issues,
    };
  });

  return {
    filePath,
    toolReports,
  };
}

function printReport(fileReports) {
  let totalTools = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const fileReport of fileReports) {
    const relativePath = path.relative(REPO_ROOT, fileReport.filePath) || fileReport.filePath;
    console.log(`\nFILE: ${relativePath}`);

    if (fileReport.toolReports.length === 0) {
      console.log('  - No inputSchema definitions found.');
      continue;
    }

    for (const tool of fileReport.toolReports) {
      totalTools += 1;
      console.log(`  TOOL: ${tool.toolName} (line ${tool.line})`);

      if (tool.issues.length === 0) {
        console.log('    ✓ OK');
        continue;
      }

      for (const issue of tool.issues) {
        if (issue.severity === 'error') totalErrors += 1;
        if (issue.severity === 'warning') totalWarnings += 1;
        const marker = issue.severity === 'error' ? '✗' : '!';
        console.log(`    ${marker} [${issue.severity}] ${issue.path}: ${issue.message}`);
      }
    }
  }

  console.log('\nSummary');
  console.log(`  Tools checked: ${totalTools}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`  Warnings: ${totalWarnings}`);

  return { totalTools, totalErrors, totalWarnings };
}

function main() {
  const files = findServerFiles(REPO_ROOT);
  if (files.length === 0) {
    console.error('No MCP server entry files found.');
    process.exit(1);
  }

  const reports = files.map(inspectFile);
  const result = printReport(reports);

  if (result.totalErrors > 0) {
    process.exit(1);
  }
}

main();
