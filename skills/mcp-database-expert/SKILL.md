---
name: mcp-database-expert
description: Ottimizza l'interazione con database SQL utilizzando sql-node e linter-node. Utilizzare per scrivere, validare ed eseguire query SQL sicure su MSSQL, MySQL, PostgreSQL e Oracle.
---

# MCP Database Expert

Questo skill guida l'agente nell'utilizzo combinato di `sql-mcp-server` e `linter-mcp-server` per gestire operazioni su database con la massima sicurezza ed efficienza.

## Workflow Ottimizzato

1.  **Validazione (Mandatoria)**: Prima di ogni esecuzione, usa `lint_code` (del server `linter-mcp-server`) su file `.sql` o frammenti di codice per intercettare errori di sintassi o violazioni di policy (es. query non read-only se richiesto).
2.  **Configurazione**: Identifica il `project_path` corretto. Il server `sql-mcp-server` legge le credenziali dal file `.env` nel root del progetto (DB_TYPE, DB_SERVER, DB_USER, DB_NAME, DB_PASSWORD).
3.  **Esecuzione**: Usa `sql_executor` con l'azione appropriata:
    *   `query`: Per SELECT e lettura dati.
    *   `execute`: Per INSERT, UPDATE, DELETE (se consentito e sicuro).
    *   `schema`: Per recuperare lo schema delle tabelle (indispensabile prima di scrivere query complesse).

## Sinergie e Best Practices

*   **Ispezione Preventiva**: Se non conosci la struttura della tabella, usa sempre `sql_executor` con `action: "schema"` prima di tentare una query.
*   **Sicurezza**: Il server `sql-mcp-server` ha controlli integrati per query read-only. Se ricevi un errore di sicurezza, verifica che la query non contenga istruzioni di modifica o batch multipli.
*   **Performance**: Per query pesanti, usa `action: "explain"` (se supportato dal driver) per analizzare il piano di esecuzione.
*   **Integrazione ColdFusion**: Usa `mcp_cf-mcp-server_cf_bridge` con `action: "datasources"` per confermare quali database sono visibili al server applicativo prima di interrogarli direttamente via SQL.

## Risoluzione Problemi

*   **Errore Connessione**: Verifica che il file `.env` esista nel `project_path` e contenga le chiavi corrette.
*   **Timeout**: Per dataset molto grandi, preferisci query paginate o limita i risultati con clausole `TOP` o `LIMIT`.
