import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { LintResult, LintMessage } from './types.js';
import { config } from '../config.js';

const execAsync = promisify(exec);

function findConfigFile(startPath: string): string | null {
  let currentDir = startPath;
  const { root } = path.parse(currentDir);

  while (true) {
    const configPath = path.join(currentDir, '.cflintrc');
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    if (currentDir === root) break;
    currentDir = path.dirname(currentDir);
  }
  return null;
}

interface CFLintIssue {
  severity: string;
  id: string;
  message: string;
  category: string;
  abbrev: string;
  locations: {
    file: string;
    fileName: string;
    function: string;
    column: number;
    line: number;
    message: string;
    variable: string;
    expression: string;
    offset: number;
  }[];
}

interface CFLintOutput {
  version: string;
  timestamp: number;
  issues: CFLintIssue[];
  counts: any;
}

export async function lintCFML(filePath: string): Promise<LintResult> {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const javaPath = config.cflint.javaPath;
  const cflintJarPath = config.cflint.jarPath;

  if (!fs.existsSync(javaPath)) {
    throw new Error(`Java executable not found at: ${javaPath}`);
  }
  if (!fs.existsSync(cflintJarPath)) {
    throw new Error(`CFLint JAR not found at: ${cflintJarPath}`);
  }

  const projectDir = path.dirname(absolutePath);
  const configPath = findConfigFile(projectDir);

  let command = `"${javaPath}" -jar "${cflintJarPath}" -file "${absolutePath}" -q -json`;

  if (configPath) {
    command += ` -configfile "${configPath}"`;
  }

  try {
    const { stdout, stderr } = await execAsync(command);

    // CFLint might output other text before JSON if there are errors or debug info
    // We need to find the JSON part. It usually starts with { and ends with }
    const jsonStart = stdout.indexOf('{');
    const jsonEnd = stdout.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      console.warn("CFLint output is not valid JSON:", stdout);
      return { filePath: absolutePath, messages: [] };
    }

    const jsonString = stdout.substring(jsonStart, jsonEnd + 1);
    const result: CFLintOutput = JSON.parse(jsonString);

    const messages: LintMessage[] = [];

    if (result.issues) {
      for (const issue of result.issues) {
        for (const loc of issue.locations) {
          messages.push({
            line: loc.line,
            column: loc.column,
            severity: mapSeverity(issue.severity),
            message: issue.message || loc.message,
            ruleId: issue.id
          });
        }
      }
    }

    return {
      filePath: absolutePath,
      messages: messages
    };

  } catch (error: any) {
    console.error("Error executing CFLint:", error);
    // If exec fails (e.g. exit code 1), it might still have valid output if CFLint considers lint errors as failure
    // creating a fallback or re-throwing depending on stderr
    throw new Error(`Failed to lint CFML file: ${error.message}`);
  }
}

function mapSeverity(cflintSeverity: string): "error" | "warning" | "info" {
  switch (cflintSeverity.toUpperCase()) {
    case 'FATAL':
    case 'CRITICAL':
    case 'ERROR':
      return 'error';
    case 'WARNING':
    case 'CAUTION':
      return 'warning';
    case 'INFO':
    case 'COSMETIC':
    default:
      return 'info';
  }
}
