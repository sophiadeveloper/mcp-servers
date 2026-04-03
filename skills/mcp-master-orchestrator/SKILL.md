---
name: mcp-master-orchestrator
description: Coordinate multi-step MCP work across docs, git, mantis, database, ColdFusion, browser, office, and technical-analysis flows. Use when the goal spans multiple phases such as bug triage, reporting, onboarding, data migration, post-fix validation, or a technical analysis that starts from tickets, documents, attachments, commits, or mixed evidence.
---

# MCP Master Orchestrator

Questo skill guida l'agente nella scomposizione di obiettivi complessi in una sequenza ordinata di skill specialistiche, riducendo salti di contesto, errori di coordinamento e duplicazioni.

## Matrice di Decisione

| Se l'obiettivo e... | Parti da questo skill | Sidecar tipici |
| :--- | :--- | :--- |
| Investigare un bug segnalato | `mcp-git-mantis-workflow` | `mcp-docs-navigator`, `mcp-coldfusion-developer`, `mcp-browser-automation` |
| Fare un'analisi tecnica multi-sorgente da ticket, documento o allegato | `mcp-technical-analyst` | `mcp-git-mantis-workflow`, `mcp-docs-navigator`, `mcp-database-expert` |
| Avviare rapidamente un ticket con prompt guidato e decidere se approfondire | `mcp-technical-analyst` (`ticket-first-light`) | `mcp-git-mantis-workflow`, `mcp-docs-navigator` |
| Verificare dati o schema DB | `mcp-database-expert` | `mcp-docs-navigator`, `mcp-office-expert` |
| Modificare logica ColdFusion | `mcp-coldfusion-developer` | `mcp-docs-navigator`, `mcp-browser-automation`, `mcp-git-mantis-workflow` |
| Capire regole di business o procedure | `mcp-docs-navigator` | `mcp-database-expert`, `mcp-git-mantis-workflow` |
| Testare UI o flussi utente | `mcp-browser-automation` | `mcp-coldfusion-developer`, `mcp-database-expert` |
| Generare report o consegnabili | `mcp-office-expert` | `mcp-database-expert`, `mcp-docs-navigator`, `mcp-git-mantis-workflow` |
| Gestire allegati, commit correlati o conflitti | `mcp-git-mantis-workflow` | `mcp-docs-navigator`, skill tecnica del file coinvolto |
| Ingerire PDF o documenti nel corpus | `mcp-office-expert` | `mcp-docs-navigator` |

## Loop di Coordinamento

1. Definisci outcome, vincoli e `project_path` comune.
2. Scegli uno skill primario e al massimo uno o due sidecar per la fase corrente.
3. Se il task e analitico e multi-sorgente, parti da `mcp-technical-analyst` (usa `ticket-first-light` solo come avvio rapido quando richiesto); se e esecutivo o mono-dominio, parti dallo skill specialistico piu vicino al problema.
4. Esegui prima discovery stretta: docs, ticket, schema, log o DOM a seconda del dominio.
5. Applica la modifica o raccogli la prova, poi valida con il tool piu vicino all'effetto finale.
6. Lascia sempre un artefatto riusabile: nota Mantis, documento indicizzato, file Office o log di test.

## Carica Riferimenti Solo Se Servono

* [references/workflows.md](references/workflows.md) per flussi completi come regressioni, report mensili, onboarding modulo e analisi tecniche multi-sorgente.
* [references/coordination-checklist.md](references/coordination-checklist.md) per checklist trasversale, session reuse e errori comuni.
