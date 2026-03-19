---
name: mcp-master-orchestrator
description: Coordina l'utilizzo di tutti gli MCP server (CF, SQL, Git, Mantis, Playwright, Docs, Office) per task complessi. Utilizzare quando l'obiettivo richiede più fasi (es. fix bug -> test -> deploy -> doc).
---

# MCP Master Orchestrator

Questo skill guida l'agente nella scomposizione di un obiettivo complesso in sotto-task gestibili dagli MCP server specifici.

## Matrice di Decisione

| Se l'obiettivo è... | Usa lo skill... | Server MCP principali |
| :--- | :--- | :--- |
| Investigare un bug segnalato | `mcp-git-mantis-workflow` | `mantis-node`, `git-node` |
| Verificare dati o schema DB | `mcp-database-expert` | `sql-node`, `linter-node` |
| Modificare logica ColdFusion | `mcp-coldfusion-developer` | `cf-node`, `linter-node` |
| Capire regole di business | `mcp-docs-navigator` | `docs-node` |
| Testare l'UI o flussi utente | `mcp-browser-automation` | `playwright-node` |
| Leggere/modificare file Word o Excel | `mcp-office-expert` | `office-node` |

## Workflow Multi-Fase Esempio: "Fix Regressione DB"

1.  **Fase 1: Ricerca**
    *   Usa `mcp-docs-navigator` per cercare documentazione sullo schema.
    *   Usa `mcp-git-mantis-workflow` per trovare il ticket Mantis originale e il commit che ha introdotto il bug.
2.  **Fase 2: Diagnosi**
    *   Usa `mcp-database-expert` per ispezionare lo stato attuale dei dati.
    *   Usa `mcp-coldfusion-developer` per leggere i log di errore del server.
3.  **Fase 3: Correzione**
    *   Applica la fix SQL o CFML (validando sempre con il linter).
4.  **Fase 4: Validazione**
    *   Usa `mcp-browser-automation` per eseguire un test E2E che conferma la risoluzione.
    *   Aggiorna il ticket in Mantis con l'hash del fix.

## Best Practices Trasversali

*   **Project Path**: Assicurati di usare lo stesso `project_path` per tutti i tool per garantire che leggano la stessa configurazione `.env`.
*   **Linter First**: Non eseguire mai codice (SQL o CFML) senza averlo prima passato dal linter.
*   **Log Everything**: Aggiungi sempre note ai ticket Mantis per ogni azione significativa intrapresa.
*   **Docs Update**: Se la fix cambia il comportamento del sistema, aggiorna la documentazione in `docs-node`.
