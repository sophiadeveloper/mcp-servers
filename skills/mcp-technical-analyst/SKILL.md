---
name: mcp-technical-analyst
description: Run a technical analysis from a ticket, document, attachment, commit, or mixed evidence set using MCP tools across Mantis, Git, Docs, SQL, Office, ColdFusion, and optionally Playwright. Use this whenever the user asks for a technical analysis, stato dell'arte, gap analysis, dossier tecnico, comparison across repos or databases, investigation starting from a ticket or document, or wants structured Markdown analysis deliverables. Trigger even when the user does not explicitly say "analysis" if they want to reconstruct requirements, current state, missing work, dependencies, configuration mapping, or cross-environment differences from multiple technical sources.
---

# MCP Technical Analyst

Questo skill serve per analisi tecniche multi-sorgente in ambiente Tesisquare/MCP. Non sostituisce gli skill specialistici: li coordina quando il task richiede raccolta prove, ricostruzione del contesto e produzione di documenti finali.

## Quando usarlo

Usalo quando il task parte da almeno una di queste basi:

- ticket Mantis o issue di progetto;
- documento tecnico, PDF, DOCX, wiki, allegato o email esportata;
- commit, branch, MR o patch da correlare a ticket e dati;
- confronto tra repo, DB, ambienti `dev/qa/prod` o configurazioni cliente;
- richiesta di requisiti, specifiche, stato dell'arte, gap analysis o piano tecnico finale.

Non usarlo se il task e chiaramente mono-dominio e puo essere risolto direttamente da uno skill specialistico, per esempio:

- sola query SQL;
- sola lettura/manutenzione docs;
- solo debug CFML;
- sola automazione browser.

## Principi operativi

1. Parti sempre dai fatti disponibili e fai discovery prima di fare domande.
2. Distingui sempre:
   - `evidenza osservata`
   - `inferenza`
   - `punto aperto`
3. Produci artefatti riusabili, di default in `.md`.
4. Usa Playwright solo quando codice, dati, log e documenti non bastano o quando serve una prova funzionale.
5. Se trovi dati sensibili necessari all'analisi, leggili ma redigili nei deliverable finali salvo richiesta esplicita di conversione locale.

## Workflow Base

### Entry point `ticket-first`

1. Leggi ticket, note, relazioni e allegati con `mcp-git-mantis-workflow`.
2. Estrai commit, branch, repo e riferimenti esterni citati.
3. Cerca documentazione interna collegata con `mcp-docs-navigator`.
4. Ricostruisci lo stato del codice con `git-node` e, se serve, `mcp-coldfusion-developer`.
5. Verifica schema e dati reali con `mcp-database-expert`.
6. Solo se serve una prova funzionale, usa `mcp-browser-automation`.
7. Genera i documenti di analisi e, se richiesto, indicizzali.

### Variante light `ticket-first-light` (prompt guidato di avvio)

Usa questa variante quando serve un avvio rapido da ticket con output breve, mantenendo la possibilita di escalation verso il flusso completo.

1. Leggi ticket, note e allegati essenziali con `mcp-git-mantis-workflow`.
2. Estrai riferimenti minimi (repo/commit/docs/db) e formula ipotesi iniziale.
3. Verifica velocemente una sola fonte tecnica prioritaria (di norma codice oppure docs).
4. Produci un mini-output con:
   - contesto del ticket
   - evidenze gia verificate
   - primi gap/punti aperti
   - prossimo passo consigliato
5. Se emergono dipendenze cross-repo, cross-db o dubbi sostanziali, passa subito a `ticket-first` completo.

Prompt guidato di avvio (template):

`Parti dal ticket {ticket_id} in modalita ticket-first-light. Dammi un avvio rapido con evidenze osservate, inferenze iniziali e punti aperti prioritari. Se trovi complessita multi-sorgente, proponi esplicitamente l'escalation al flusso ticket-first completo di mcp-technical-analyst.`

### Entry point `document-first`

1. Leggi il documento sorgente con `mcp-office-expert` o `mcp-docs-navigator`.
2. Estrai nomi di ticket, repo, commit, DB, ambienti, URL e allegati menzionati.
3. Apri i filoni tecnici necessari con gli skill specialistici.
4. Confronta i fatti trovati e chiudi con deliverable strutturati.

## Politica Interattiva

Prima esplora. Fai domande solo se manca davvero uno di questi elementi:

- un identificativo esterno non ricavabile localmente;
- il repository corretto tra piu candidati plausibili;
- il database o ambiente corretto tra piu opzioni equivalenti;
- una scelta di output che cambia materialmente il deliverable.

Quando devi chiedere, fai 1-3 domande mirate, corte e ad alto impatto. Se puoi procedere con un default ragionevole senza rischio alto, procedi e registra l'assunzione.

Vedi [references/interactive-escalation.md](references/interactive-escalation.md).

## Contratto Di Output

Se il task e ampio, genera uno o piu documenti `.md` con sezioni chiare. Di default usa queste famiglie di output:

- requisiti e contesto;
- fonti e specifiche;
- stato attuale / sviluppo gia fatto;
- confronto tra implementazioni o ambienti;
- analisi tecnica finale con gap, rischi e proposta di completamento.

Nei documenti:

- redigi credenziali, token e segreti;
- cita ticket, commit, query, documenti e file in modo verificabile;
- separa le conclusioni dai fatti di partenza.

Vedi [references/deliverable-templates.md](references/deliverable-templates.md).

## Selezione Degli Skill Sidecar

- `mcp-git-mantis-workflow`: ticket, note, allegati, commit, branch, relazioni.
- `mcp-docs-navigator`: wiki, markdown, scaffali docs, tagging finale.
- `mcp-database-expert`: schema, dati reali, confronti `dev/qa/prod`.
- `mcp-office-expert`: PDF, DOCX, Excel, conversioni in Markdown.
- `mcp-coldfusion-developer`: CFML, log applicativi, codice legacy lato server.
- `mcp-browser-automation`: verifica UI, flussi, download, network e console quando strettamente necessario.

## Riferimenti

- [references/analysis-workflow.md](references/analysis-workflow.md)
- [references/ticket-first-light.md](references/ticket-first-light.md)
- [references/source-matrix.md](references/source-matrix.md)
- [references/deliverable-templates.md](references/deliverable-templates.md)
- [references/interactive-escalation.md](references/interactive-escalation.md)
- [references/functional-exploration.md](references/functional-exploration.md)
