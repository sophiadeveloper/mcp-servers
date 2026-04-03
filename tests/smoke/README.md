# Smoke tests MCP server (stdio)

Questa cartella contiene smoke test minimi (uno per server) che validano:

1. avvio del server MCP su stdio senza crash immediato;
2. handshake MCP (`initialize` + `notifications/initialized`);
3. risposta valida a `tools/list`.

## Prerequisiti

- Node.js 20+ disponibile nel PATH.
- Dipendenze installate in ciascun server (`npm install` nelle cartelle `*-node`).
- Per `linter-node`:
  - preferito: build eseguita (`npm run build`, usa `dist/index.js`);
  - fallback automatico: avvio da `src/index.ts` tramite `tsx` locale.
- Per `playwright-node` servono le variabili usate in configurazione standard (`ALLOWED_URLS=*`, `BLOCK_MEDIA=false`), già impostate dal relativo smoke test.

## Comandi

Eseguire i test dalla root repository (`/workspace/mcp-servers`).

### Esecuzione singolo server

```bash
node tests/smoke/git-node.smoke.mjs
node tests/smoke/sql-node.smoke.mjs
node tests/smoke/mantis-node.smoke.mjs
node tests/smoke/cf-node.smoke.mjs
node tests/smoke/docs-node.smoke.mjs
node tests/smoke/office-node.smoke.mjs
node tests/smoke/office-docs-bridge.smoke.mjs
node tests/smoke/playwright-node.smoke.mjs
node tests/smoke/linter-node.smoke.mjs
```

### Esecuzione completa

```bash
node tests/smoke/run-all.mjs
```

## Output atteso

Ogni smoke stampa una riga `[PASS] <server>` con numero di tool rilevati.

Nota: `git-node.smoke.mjs` include anche verifica handshake prompt (`prompts/list`, `prompts/get`) e controllo shape argomenti per i prompt MCP esposti dal server Git.
In caso di errore stampa `[FAIL] <server>` e, se presente, lo `stderr` del server.

## Smoke bridge `office-node` -> `docs-node`

`office-docs-bridge.smoke.mjs` valida il contratto minimo M3 senza anticipare milestone successive:

1. `office-node` esporta testo PDF in `.md` su `save_path`;
2. verifica che `artifact://office/...` sia registrato con mapping verso lo stesso `save_path`;
3. `docs-node` ingestisce il file esportato usando `docs_management.scan_file` sul percorso locale;
4. la ricerca documentale (`docs_navigation.search`) restituisce contenuto proveniente dall'export Office.
