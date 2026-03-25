---
name: mcp-database-expert
description: Query, lint, inspect schema, analyze plans, and hand off SQL results to docs, office, and ticket workflows. Use when the agent must interrogate a database via MCP, validate SQL, export results, or trace executed queries back to project context.
---

# MCP Database Expert

Questo skill guida l'agente nell'uso combinato di `sql-mcp-server` e `linter-mcp-server` per lavorare sul database in modo sicuro, tracciabile e riusabile.

## Workflow Base

1. Controlla prima il contesto funzionale con `mcp-docs-navigator` se la query dipende da regole di business, naming o convenzioni di schema.
2. Valida sempre il codice con `lint_code` prima di eseguirlo.
3. Identifica il `project_path` corretto: `sql-mcp-server` legge le credenziali dal `.env` del progetto.
4. Usa `sql_executor` con l'azione giusta:
   * `schema` per capire tabelle e colonne prima di scrivere query complesse.
   * `query` per lettura dati.
   * `explain` per piani di esecuzione o query da ottimizzare.
5. Registra cosa hai eseguito se il task e legato a ticket, audit o report.

## Handoff Rapidi

* Usa `mcp-docs-navigator` prima della query quando serve verificare definizioni di dominio, query gia documentate o convenzioni di naming.
* Usa `mcp-office-expert` quando i risultati devono finire in Excel o in un report Word.
* Usa `mcp-git-mantis-workflow` per allegare query, output o decisioni al ticket. Git resta read-only di default: non proporre commit se l'utente non lo autorizza esplicitamente.

## Carica Riferimenti Solo Se Servono

* [references/reporting-and-audit.md](references/reporting-and-audit.md) per workflow completi di report, audit trail e query paginate.

## Risoluzione Problemi

* Se ricevi un errore di sicurezza, verifica batch multipli, statement non read-only o sintassi non supportata dal guardrail.
* Se la query restituisce troppo rumore, torna prima a `schema` o alla documentazione invece di iterare alla cieca.
* Se il task produce un artefatto condivisibile, non lasciare l'output solo nella conversazione: esportalo o registralo nel ticket.
