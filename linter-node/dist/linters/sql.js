import path from 'path';
import fs from 'fs';
import pkg from 'node-sql-parser';
const { Parser } = pkg;
const parser = new Parser();
export async function lintSQL(filePath, fix = false) {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
    }
    const content = fs.readFileSync(absolutePath, 'utf8');
    const messages = [];
    let ast;
    try {
        ast = parser.astify(content, { database: 'TransactSQL' });
    }
    catch (err) {
        // Parser error handling
        // err usually has { LOCATION: { start: { line: 1, column: 1 } }, message: '...' }
        // but structure depends on parser version. Usually standard Error with location properties.
        if (err.location) {
            messages.push({
                line: err.location.start.line,
                column: err.location.start.column,
                severity: 'error',
                message: `Syntax Error: ${err.message}`, // message might be verbose
                ruleId: 'syntax-error'
            });
        }
        else {
            // Fallback if no location info
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
            fixable: false
        };
    }
    // If parsing succeeds, apply AST-based rules
    if (Array.isArray(ast)) {
        ast.forEach(query => checkQuery(query, messages));
    }
    else {
        checkQuery(ast, messages);
    }
    return {
        filePath: absolutePath,
        messages: messages,
        fixable: false // Basic implementation doesn't support fixing yet
    };
}
function checkQuery(query, messages) {
    if (!query)
        return;
    // Rule: Avoid SELECT *
    if (query.type === 'select' && Array.isArray(query.columns)) {
        const starColumn = query.columns.find((col) => (col.expr && col.expr.type === 'column_ref' && col.expr.column === '*') ||
            (col === '*') // sometimes parser returns raw star
        );
        if (starColumn) {
            messages.push({
                line: 1, // AST doesn't always preserve line numbers for nodes easily in this parser version
                column: 1,
                severity: 'warning',
                message: 'Avoid using SELECT *; list columns explicitly.',
                ruleId: 'no-select-star'
            });
        }
    }
    // Add more rules here (e.g., check for missing WHERE in DELETE/UPDATE)
    if ((query.type === 'delete' || query.type === 'update') && !query.where) {
        messages.push({
            line: 1,
            column: 1,
            severity: 'error',
            message: `Unsafe ${query.type.toUpperCase()} statement without WHERE clause.`,
            ruleId: 'unsafe-statement'
        });
    }
}
