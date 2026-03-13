import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { hasUtf8Bom, ensureEncoding } from './utils.js';
const execAsync = promisify(exec);
function findConfigFile(startPath) {
    let currentDir = startPath;
    const { root } = path.parse(currentDir);
    while (true) {
        const configPath = path.join(currentDir, '.cflintrc');
        if (fs.existsSync(configPath)) {
            return configPath;
        }
        if (currentDir === root)
            break;
        currentDir = path.dirname(currentDir);
    }
    return null;
}
export async function lintCFML(filePath, fix = false) {
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
    const messages = [];
    let encodingModified = false;
    // --- CHECK FOR UTF-8 BOM (MANDATORY FOR CFML) ---
    if (!hasUtf8Bom(absolutePath)) {
        if (fix) {
            encodingModified = ensureEncoding(absolutePath, true);
        }
        // If we didn't fix it (either fix=false or fixing failed), report it
        if (!encodingModified) {
            messages.push({
                line: 1,
                column: 1,
                severity: 'error',
                message: 'CFML file must be encoded in UTF-8 with BOM.',
                ruleId: 'FILE_ENCODING_ERROR'
            });
        }
    }
    // ----------------------------
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
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonString = stdout.substring(jsonStart, jsonEnd + 1);
            const result = JSON.parse(jsonString);
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
        }
        else {
            console.warn("CFLint output is not valid JSON:", stdout);
        }
        return {
            filePath: absolutePath,
            messages: messages,
            fixable: !hasUtf8Bom(absolutePath) && !encodingModified,
            output: encodingModified ? ("\ufeff" + fs.readFileSync(absolutePath, 'utf8')) : undefined
        };
    }
    catch (error) {
        console.error("Error executing CFLint:", error);
        // Even if CFLint fails, we might have encoding error to report
        if (messages.length > 0) {
            return {
                filePath: absolutePath,
                messages: messages,
                fixable: !hasUtf8Bom(absolutePath) && !encodingModified,
                output: encodingModified ? ("\ufeff" + fs.readFileSync(absolutePath, 'utf8')) : undefined
            };
        }
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
