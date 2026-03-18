---
name: mcp-coldfusion-developer
description: Gestisce lo sviluppo e il debugging in ambiente ColdFusion utilizzando cf-node e linter-node. Utilizzare per valutare codice CFML, ispezionare log e datasource.
---

# MCP ColdFusion Developer

Questo skill ottimizza lo sviluppo su stack ColdFusion/CFML integrando `cf-node`, `linter-node` e `sql-node`.

## Workflow Ottimizzato

1.  **Analisi Statica**: Usa `lint_code` con `linter-node` su file `.cfm` o `.cfc` prima di ogni deployment o esecuzione. Questo rileva errori di tag non chiusi, variabili non definite o problemi di encoding (UTF-8 BOM).
2.  **Debug in Tempo Reale**: Usa `mcp_cf-mcp-server_cf_bridge` con `action: "evaluate"` per testare piccoli snippet di codice o ispezionare variabili di sistema direttamente sul server.
3.  **Monitoraggio Log**:
    *   Usa `action: "logs_list"` per trovare i file di log rilevanti (es. `exception.log`, `application.log`).
    *   Usa `action: "logs_read"` per estrarre le ultime righe di un log dopo un errore.
4.  **Database Bridge**: Usa `action: "datasources"` per listare i DSN configurati in ColdFusion Administrator e confrontarli con quelli disponibili in `sql-mcp-server`.

## Sinergie e Best Practices

*   **Fix Automatico**: Se `lint_code` rileva problemi di encoding, usa il parametro `fix: true` per correggere automaticamente i file (es. aggiunta UTF-8 BOM necessaria per alcuni motori CFML).
*   **Log + Git**: Quando trovi un errore nei log, usa `git_query` con `action: "blame"` sulle linee di codice sospette per capire quando e da chi è stata introdotta la regressione.
*   **Datasource Sync**: Prima di eseguire query SQL dirette, verifica che il datasource sia "OK" tramite `cf_bridge` action `datasources`.

## Risoluzione Problemi

*   **Bridge Error**: Se il bridge non risponde, verifica l'URL e il `CF_MCP_TOKEN` nel file `.env` del progetto.
*   **Errore di Sintassi**: Se `evaluate` fallisce, ripassa il codice attraverso il linter per assicurarti che non ci siano tag malformati.
