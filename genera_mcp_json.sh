#!/bin/bash
# Script di generazione file locale MCP per Ubuntu/Linux
# Data: 2026-03-09

# Funzione per cercare un percorso o chiederlo all'utente
resolve_path_or_prompt() {
    local path_name="$1"
    local auto_path="$2"
    local prompt_text="$3"
    local resolved_path="$auto_path"

    # Cicla finché il percorso è vuoto o non esiste
    while [[ -z "$resolved_path" || ! -e "$resolved_path" ]]; do
        >&2 echo -e "\033[33mATTENZIONE: Impossibile trovare in automatico: $path_name\033[0m"
        >&2 read -p "> $prompt_text: " input_path

        # Gestione tilde (~) nei percorsi inseriti a mano
        input_path="${input_path/#\~/$HOME}"

        if [[ -e "$input_path" ]]; then
            resolved_path="$input_path"
        else
            >&2 echo -e "\033[31mErrore: Percorso non valido o inesistente. Riprova.\033[0m"
            resolved_path=""
        fi
    done

    >&2 echo -e "\033[36mTrovato ${path_name}: $resolved_path\033[0m"
    echo "$resolved_path"
}

echo -e "--- Ricerca dei percorsi di base ---"
NODE_AUTO=$(which node 2>/dev/null)
export NODE_PATH=$(resolve_path_or_prompt "Node.js" "$NODE_AUTO" "Inserisci il percorso assoluto di node (es. /usr/bin/node o ~/.nvm/.../bin/node)")

ROOT_AUTO=$(pwd)
export ROOT_DIR=$(resolve_path_or_prompt "Directory Server MCP" "$ROOT_AUTO" "Inserisci il percorso della cartella contenente i server")

echo -e "\n--- Ricerca delle dipendenze per i server specifici ---"
GIT_EXE=$(which git 2>/dev/null)
GIT_AUTO=$([[ -n "$GIT_EXE" ]] && dirname "$GIT_EXE" || echo "/usr/bin")
export GIT_CMD_PATH=$(resolve_path_or_prompt "Git Directory" "$GIT_AUTO" "Inserisci il percorso della cartella bin di Git")

# Percorso fittizio tipico per installazioni Linux (modificalo se hai un path standard)
export CFLINT_PATH=$(resolve_path_or_prompt "CFLint JAR" "/opt/cflint/CFLint-1.5.0-all.jar" "Inserisci il file .jar di CFLint")

JAVA_AUTO=$(which java 2>/dev/null)
export JAVA_PATH=$(resolve_path_or_prompt "Java BIN" "$JAVA_AUTO" "Inserisci il file eseguibile di java (es. /opt/ColdFusion2023/jre/bin/java)")

echo -e "\nGenerazione del file di configurazione locale..."
echo "-------------------------------------------"

# Utilizziamo Node.js inline per manipolare il JSON in modo sicuro
# ed evitare problemi di sintassi o BOM
node -e "
const fs = require('fs');
const path = require('path');

const nodePath = process.env.NODE_PATH;
const rootDir = process.env.ROOT_DIR;
const gitCmdPath = process.env.GIT_CMD_PATH;
const cfLintPath = process.env.CFLINT_PATH;
const javaPath = process.env.JAVA_PATH;
const envPath = process.env.PATH;

const settingsPath = path.join(rootDir, 'settings.json');
let settings = {};

if (fs.existsSync(settingsPath)) {
    try {
        const raw = fs.readFileSync(settingsPath, 'utf8');
        if (raw.trim() !== '') {
            settings = JSON.parse(raw);
        }
    } catch (e) {
        console.error('\x1b[33mIl file locale settings.json non contiene un JSON valido. Verrà ricreato.\x1b[0m');
    }
}

if (!settings.mcpServers) {
    settings.mcpServers = {};
}

const servers = [
    { name: 'cf-mcp-server', dir: 'cf-node', args: ['index.js'] },
    { name: 'docs-mcp-server', dir: 'docs-node', args: ['index.js'] },
    // In Linux usiamo i due punti (:) per separare i percorsi della variabile PATH
    { name: 'git-mcp-server', dir: 'git-node', args: ['index.js'], env: { PATH: gitCmdPath + ':' + envPath } },
    { name: 'linter-mcp-server', dir: 'linter-node', command: nodePath, args: [path.join(rootDir, 'linter-node', 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(rootDir, 'linter-node', 'src', 'index.ts')], env: { CFLINT_JAR: cfLintPath, JAVA_BIN: javaPath } },
    { name: 'mantis-mcp-server', dir: 'mantis-node', args: ['index.js'] },
    { name: 'playwright-mcp-server', dir: 'playwright-node', args: ['index.js'], env: { ALLOWED_URLS: '*', BLOCK_MEDIA: 'false' } },
    { name: 'sql-mcp-server', dir: 'sql-node', args: ['index.js'] }
];

servers.forEach(server => {
    const serverDir = path.join(rootDir, server.dir);

    const serverConfig = {
        command: server.command || nodePath,
        args: []
    };

    if (server.args) {
        server.args.forEach(arg => {
            if (arg.endsWith('index.js')) {
                serverConfig.args.push(path.join(serverDir, arg));
            } else {
                serverConfig.args.push(arg);
            }
        });
    }

    if (server.env) {
        serverConfig.env = server.env;
    }

    settings.mcpServers[server.name] = serverConfig;
    console.log('\x1b[36mGenerato nodo: ' + server.name + '\x1b[0m');
});

// Scrittura in UTF-8
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
console.log('-------------------------------------------');
console.log('\x1b[32mFile generato con successo in: ' + settingsPath + '\x1b[0m');
"