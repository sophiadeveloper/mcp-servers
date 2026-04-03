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

## Regole di escalation prompt -> skill

Usa questo skill come router quando il prompt richiede **piu fasi** o **piu domini** nella stessa consegna.

- Se il prompt chiede analisi da ticket/documenti/allegati/commit, escalare a `mcp-technical-analyst` come skill primario.
- Se il prompt chiede un'azione diretta e circoscritta (es. query DB, edit doc, fix CFML), escalare subito allo skill specialistico senza passaggi inutili.
- Se durante l'esecuzione emergono dipendenze non previste (es. dal fix codice serve verifica docs + ticket + report), ri-escalare a questo orchestratore per ridefinire sequenza e handoff.

Regola pratica: **prompt semplice -> skill specialistico**, **prompt composito o con deliverable multipli -> orchestrator + skill primario di dominio**.

## Criteri verificabili di routing (pass/fail)

Applica questi gate in ordine e registra l'esito nel piano operativo.

1. **Gate analyst primario (intake multi-sorgente)**
   - PASS se il prompt richiede correlazione tra almeno 2 fonti eterogenee (ticket/docs/commit/db/allegati) **oppure** chiede esplicitamente analisi tecnica strutturata.
   - Azione: `mcp-technical-analyst` diventa skill primario.
2. **Gate specialistico diretto (mono-dominio)**
   - PASS se il task e operativo e confinato a un dominio singolo senza ricostruzione cross-sorgente.
   - Azione: delega subito allo skill specialistico; orchestrator resta fuori dal loop.
3. **Gate orchestrator coordinatore**
   - PASS solo se il task ha almeno 2 fasi dipendenti (es. discovery + fix + validazione/report) o richiede handoff tra skill.
   - Azione: orchestrator coordina sequenza e handoff, ma **non** sostituisce l'intake di `mcp-technical-analyst` nei casi del Gate 1.

Se nessun gate passa chiaramente, esegui discovery minima e rivaluta entro il primo checkpoint.

## Stop conditions ed escalation esplicite

Fermati e ri-escalare quando si verifica almeno una condizione:

- conflitto tra evidenze (ticket vs codice, docs vs DB, test vs log) non risolvibile nella fase corrente;
- ambiguita' bloccante su repo/ambiente/output finale con impatto materiale sul risultato;
- il task nasce mono-dominio ma emerge correlazione multi-sorgente significativa.

Escalation obbligatoria:

1. verso `mcp-technical-analyst` se emerge intake analitico multi-sorgente;
2. verso skill specialistico se il perimetro si restringe a esecuzione pura;
3. verso utente solo quando mancano dati non ricavabili localmente e la scelta cambia il deliverable.

## Carica Riferimenti Solo Se Servono

* [references/workflows.md](references/workflows.md) per flussi completi come regressioni, report mensili, onboarding modulo e analisi tecniche multi-sorgente.
* [references/coordination-checklist.md](references/coordination-checklist.md) per checklist trasversale, session reuse e errori comuni.
