import { LintResult, LintMessage } from './types.js';
import path from 'path';
import fs from 'fs';
import pkg from 'node-sql-parser';
const { Parser } = pkg;

const parser = new Parser();

interface SqlLintConfig {
  rules: {
    [key: string]: 'error' | 'warning' | 'off';
  };
}

const DEFAULT_CONFIG: SqlLintConfig = {
  rules: {
    'no-select-star': 'warning',
    'unsafe-statement': 'error'
  }
};

function loadConfig(filePath: string): SqlLintConfig {
  let currentDir = path.dirname(path.resolve(filePath));
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(currentDir, '.sql-lint.json');
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        const userConfig = JSON.parse(content);
        // Merge with default
        return {
          rules: { ...DEFAULT_CONFIG.rules, ...userConfig.rules }
        };
      } catch (e) {
        console.error(`Failed to parse .sql-lint.json at ${configPath}`, e);
      }
    }
    currentDir = path.dirname(currentDir);
  }
  return DEFAULT_CONFIG;
}

export async function lintSQL(filePath: string, fix: boolean = false): Promise<LintResult> {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const messages: LintMessage[] = [];
  const config = loadConfig(absolutePath);
  let ast: any;

  try {
    ast = parser.astify(content, { database: 'TransactSQL' });
  } catch (err: any) {
    if (err.location) {
      messages.push({
        line: err.location.start.line,
        column: err.location.start.column,
        severity: 'error',
        message: `Syntax Error: ${err.message}`,
        ruleId: 'syntax-error'
      });
    } else {
      messages.push({
        line: 1,
        column: 1,
        severity: 'error',
        message: `Syntax Error: ${err.message || 'Unknown parsing error'}`,
        ruleId: 'syntax-error'
      });
    }

    return {
      filePath: absolutePath,
      messages: messages,
      fixable: false,
      output: undefined
    };
  }

  const checkQueryFn = (query: any) => checkQuery(query, messages, config);

  if (Array.isArray(ast)) {
    ast.forEach(checkQueryFn);
  } else {
    checkQueryFn(ast);
  }

  return {
    filePath: absolutePath,
    messages: messages,
    fixable: false,
    output: undefined
  };
}

function checkQuery(query: any, messages: LintMessage[], config: SqlLintConfig) {
  if (!query) return;

  // Helper to add message if rule is not 'off'
  const report = (ruleId: string, line: number, column: number, message: string) => {
    const severity = config.rules[ruleId] || DEFAULT_CONFIG.rules[ruleId] || 'off';
    if (severity !== 'off') {
      messages.push({
        line,
        column,
        severity: severity as 'error' | 'warning',
        message,
        ruleId
      });
    }
  };

  // Rule: Avoid SELECT *
  if (query.type === 'select' && Array.isArray(query.columns)) {
    const starColumn = query.columns.find((col: any) =>
      (col.expr && col.expr.type === 'column_ref' && col.expr.column === '*') ||
      (col === '*')
    );
    if (starColumn) {
      report('no-select-star', 1, 1, 'Avoid using SELECT *; list columns explicitly.');
    }
  }

  // Rule: Unsafe UPDATE/DELETE
  if ((query.type === 'delete' || query.type === 'update') && !query.where) {
    report('unsafe-statement', 1, 1, `Unsafe ${query.type.toUpperCase()} statement without WHERE clause.`);
  }
}
