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
node tests/smoke/playwright-node.smoke.mjs
node tests/smoke/linter-node.smoke.mjs
```

### Esecuzione completa

```bash
node tests/smoke/run-all.mjs
```

## Output atteso

Ogni smoke stampa una riga `[PASS] <server>` con numero di tool rilevati.
In caso di errore stampa `[FAIL] <server>` e, se presente, lo `stderr` del server.
