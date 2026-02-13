import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { lintCFML } from './linters/cflint.js';
import { lintJS } from './linters/eslint.js';
import { lintSQL } from './linters/sql.js';
import path from 'path';
// Define the tools
const LINT_CODE_TOOL = {
    name: "lint_code",
    description: "Lints a file and returns a list of errors and warnings. Supports CFML (.cfc, .cfm), JavaScript/TypeScript (.js, .ts), and SQL (.sql).",
    inputSchema: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "Absolute path to the file to lint",
            },
            fix: {
                type: "boolean",
                description: "Attempt to fix the errors (if supported)",
            },
        },
        required: ["file_path"],
    },
};
const GET_LINT_CONFIG_TOOL = {
    name: "get_lint_config",
    description: "Returns the current lint configuration for a given language.",
    inputSchema: {
        type: "object",
        properties: {
            language: {
                type: "string",
                enum: ["cfml", "js", "sql", "php"],
                description: "The language to get configuration for",
            },
        },
        required: ["language"],
    },
};
async function main() {
    const server = new Server({
        name: "linter-mcp-server",
        version: "0.1.0",
    }, {
        capabilities: {
            tools: {},
        },
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [LINT_CODE_TOOL, GET_LINT_CONFIG_TOOL],
        };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        if (name === "lint_code") {
            const filePath = args?.file_path;
            const fix = args?.fix === true;
            if (!filePath) {
                throw new Error("Missing file_path argument");
            }
            const ext = path.extname(filePath).toLowerCase();
            try {
                if (ext === '.cfc' || ext === '.cfm') {
                    const result = await lintCFML(filePath);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    };
                }
                else if (ext === '.js' || ext === '.ts') {
                    const result = await lintJS(filePath, fix);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    };
                }
                else if (ext === '.sql') {
                    const result = await lintSQL(filePath, fix);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    };
                }
                else {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Unsupported file extension: ${ext}. Currently only .cfc, .cfm, .js, .ts, and .sql are supported.`
                            }
                        ]
                    };
                }
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error linting file: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
        if (name === "get_lint_config") {
            return {
                content: [
                    {
                        type: "text",
                        text: "Configuration retrieval not yet implemented.",
                    },
                ],
            };
        }
        throw new Error(`Unknown tool: ${name}`);
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Linter MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
