import { ESLint } from 'eslint';
import path from 'path';
import fs from 'fs';
export async function lintJS(filePath, fix = false) {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
    }
    // 1. Create an instance.
    // In ESLint v9+, overrideConfig expects Flat Config format (array of objects),
    // but types might be tricky. Let's start with empty/default config to rely on local config files.
    // Casting to any to avoid type issues between v8/v9 typings if needed.
    const eslint = new ESLint({
        fix: fix,
        overrideConfig: [] // Empty config override, relies on local config
    });
    // 2. Lint files.
    const results = await eslint.lintFiles([absolutePath]);
    // 3. Apply fixes if needed
    if (fix) {
        await ESLint.outputFixes(results);
    }
    // 4. Transform results
    const messages = [];
    let output;
    for (const result of results) {
        if (result.output) {
            output = result.output;
        }
        else if (fix && !output) {
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
        fixable: results.some(r => r.fixableErrorCount > 0 || r.fixableWarningCount > 0),
        output: output
    };
}
