import { ESLint } from 'eslint';
import { LintResult, LintMessage } from './types.js';
import { hasUtf8Bom, ensureEncoding } from './utils.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to check for existing config
function hasLocalConfig(startPath: string): boolean {
  let currentDir = startPath;
  const root = path.parse(currentDir).root;
  const configFiles = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    '.eslintrc.js',
    '.eslintrc.json',
    '.eslintrc.yml',
    '.eslintrc'
  ];

  while (currentDir !== root) {
    for (const file of configFiles) {
      if (fs.existsSync(path.join(currentDir, file))) {
        return true;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  return false;
}

export async function lintJS(filePath: string, fix: boolean = false, projectPath?: string): Promise<LintResult> {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const projectDir = path.dirname(absolutePath);
  const useDefaultConfig = !hasLocalConfig(projectDir);

  let eslintOptions: any = {
    fix: fix,
    overrideConfig: []
  };

  if (useDefaultConfig) {
    // Point to our internal default config if none found
    // Note: We use absolute path to our internal config file
    const defaultConfigPath = path.resolve(__dirname, '../../eslint.config.default.mjs');
    if (fs.existsSync(defaultConfigPath)) {
      eslintOptions.overrideConfigFile = defaultConfigPath;
    } else {
      // Fallback or error if internal config missing?
      // Should not happen if deployed correctly.
      console.warn(`Default ESLint config not found at ${defaultConfigPath}`);
    }
  }

  const eslint = new ESLint(eslintOptions);

  // 2. Lint files.
  const results = await eslint.lintFiles([absolutePath]);

  // 3. Apply fixes if needed
  if (fix) {
    await ESLint.outputFixes(results);
  }

  // 4. Transform results
  const messages: LintMessage[] = [];

  // --- CHECK FOR UTF-8 BOM (FORBIDDEN FOR JS/TS) --- 
  let encodingModified = false;
  if (hasUtf8Bom(absolutePath)) {
    if (fix) {
      encodingModified = ensureEncoding(absolutePath, false);
    }
    
    if (!encodingModified) {
      messages.push({
        line: 1,
        column: 1,
        severity: 'error',
        message: 'JS/TS file must be encoded in UTF-8 without BOM.',
        ruleId: 'FILE_ENCODING_ERROR'
      });
    }
  }
  // ----------------------------

  let output: string | undefined;

  for (const result of results) {
    if (result.output) {
      output = result.output;
    } else if (fix && !output) {
      // If fix was requested but ESLint didn't change anything, output is undefined.
      // We could return fs.readFileSync(absolutePath) here if we wanted to guarantee content.
    }

    for (const msg of result.messages) {
      messages.push({
        line: msg.line,
        column: msg.column,
        severity: msg.severity === 2 ? 'error' : 'warning',
        message: msg.message,
        ruleId: msg.ruleId || 'unknown'
      });
    }
  }

  return {
    filePath: absolutePath,
    messages: messages,
    fixable: (results.some(r => r.fixableErrorCount > 0 || r.fixableWarningCount > 0)) || (hasUtf8Bom(absolutePath) && !encodingModified),
    output: encodingModified ? (output || fs.readFileSync(absolutePath, 'utf8')) : output
  };
}
