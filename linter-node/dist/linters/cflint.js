import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
const execAsync = promisify(exec);
export async function lintCFML(filePath) {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
    }
    const cmd = `"${config.cflint.javaPath}" -jar "${config.cflint.jarPath}" -file "${absolutePath}" -stdout -json`;
    try {
        const { stdout, stderr } = await execAsync(cmd);
        // CFLint might output other text before JSON if there are errors or debug info
        // We need to find the JSON part. It usually starts with { and ends with }
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
            console.warn("CFLint output is not valid JSON:", stdout);
            return { filePath: absolutePath, messages: [] };
        }
        const jsonString = stdout.substring(jsonStart, jsonEnd + 1);
        const result = JSON.parse(jsonString);
        const messages = [];
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
    }
    catch (error) {
        console.error("Error executing CFLint:", error);
        // If exec fails (e.g. exit code 1), it might still have valid output if CFLint considers lint errors as failure
        // creating a fallback or re-throwing depending on stderr
        throw new Error(`Failed to lint CFML file: ${error.message}`);
    }
}
function mapSeverity(cflintSeverity) {
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
