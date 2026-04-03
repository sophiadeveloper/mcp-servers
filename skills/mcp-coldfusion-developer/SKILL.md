---
name: mcp-coldfusion-developer
description: Develop and debug CFML safely with linting, bridge inspection, log analysis, and post-fix validation handoffs. Use when the agent must inspect ColdFusion code, trace runtime errors, or validate a CFML change through docs, logs, and UI checks.
---

# MCP ColdFusion Developer

Questo skill ottimizza sviluppo e debugging su stack ColdFusion/CFML integrando `cf-node`, `linter-node` e, quando serve, i sidecar di docs, browser e ticketing.

## Workflow Base

1. Parti da `mcp-docs-navigator` se devi recuperare esempi, naming o procedure prima di scrivere nuovo CFML.
2. **Audit obbligatorio**: usa `lint_code` su file `.cfm` e `.cfc` prima di ogni esecuzione o consegna con comportamento di sola analisi (nessun fix automatico).
3. Usa `cf_bridge` `action: "evaluate"` solo per espressioni pure o ispezione mirata di variabili, mai per side effect come query, HTTP o file I/O.
4. Usa `logs_list` e `logs_read` per ricostruire il problema dopo errori runtime.
5. Dopo una fix, valida con la UI o con il percorso utente piu vicino al comportamento corretto.

## Sinergie e Best Practices

* **Remediation esplicita**: usa `fix: true` solo quando richiesto in modo esplicito dall'utente o dal task; default sempre audit senza fix.
* Quando un log punta a una regressione, usa `mcp-git-mantis-workflow` o `git_query` `action: "blame"` per collegare il problema alla storia del file.
* Usa `mcp-browser-automation` dopo modifiche che cambiano UI, navigazione o submit.
* Se la fix introduce regole o procedure nuove, aggiorna la documentazione e riallinea l'indice con `mcp-docs-navigator`.

## Carica Riferimenti Solo Se Servono

* [references/post-fix-checklist.md](references/post-fix-checklist.md) per una checklist rapida dopo la modifica e per la lettura proattiva dei log.
* [references/core-client-override-pattern.md](references/core-client-override-pattern.md) quando devi estendere un componente `core` dal `client`, derivare il namespace dal path reale del core, o aggiornare la catena di factory corretta.

## Risoluzione Problemi

* Se il bridge non risponde, controlla URL e `CF_MCP_TOKEN` nel `.env`.
* Se `evaluate` fallisce, torna prima al linter: spesso il problema e nel codice o nel contesto, non nel bridge.
* Se la UI continua a fallire dopo una fix apparentemente corretta, verifica log, network e frame prima di dichiarare risolto.
