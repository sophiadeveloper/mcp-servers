---
name: mcp-git-mantis-workflow
description: Correlate tickets, commits, attachments, and merge conflicts across git-node and mantis-node. Use when the agent must investigate issue history, connect code changes to Mantis, download artifacts, or coordinate technical handoffs without losing traceability.
---

# MCP Git & Mantis Workflow

Questo skill unifica gestione del codice e tracking dei bug/task integrando `git-node` e `mantis-node`, con attenzione a contesto, prove e passaggi di consegna verso skill tecniche.

## Workflow Base

1. Leggi il ticket con `mantis_issue_reader` `action: "get_one"` prima di toccare Git.
2. Usa `git_query` e `git_diff` per ricostruire file, commit e baseline del problema.
3. Scarica allegati con `mantis_files` e `save_path` quando il materiale va letto localmente.
4. Usa Git in sola lettura per analisi e handoff, salvo autorizzazione esplicita dell'utente a creare commit o staging.
5. Lascia una nota Mantis quando hai prodotto una fix, un report, un allegato o una prova rilevante.

## Sinergie e Best Practices

* Usa `mcp-docs-navigator` se il ticket richiama procedure, analisi o documenti correlati.
* Se i file toccati sono SQL o CFML, passa subito a `mcp-database-expert` o `mcp-coldfusion-developer` invece di tentare diagnosi profonde solo da Git.
* Usa `git_conflict_manager` per merge o rebase complessi e `git_query` `action: "blame"` per contestualizzare i conflitti.
* Prima di scrivere note operative, verifica lo stato del repo con `git_query` `action: "status"`.

## Regole di escalation prompt -> skill

Escala a `mcp-git-mantis-workflow` quando il prompt contiene relazione tra tracciamento issue e codice, ad esempio:

- "parti dal ticket", "collega commit al bug", "scarica allegato Mantis", "ricostruisci storia fix";
- richieste di handoff tecnico con evidenze verificabili tra Mantis e Git.

Escalation secondaria:

1. Se dai file emerge dominio SQL/CFML/UI, passa rispettivamente a `mcp-database-expert`, `mcp-coldfusion-developer` o `mcp-browser-automation`.
2. Se oltre alla correlazione serve sintesi multi-sorgente strutturata, passa a `mcp-technical-analyst`.
3. Se il prompt parla solo di documentazione o solo di Office senza ticket/commit, non usare questo skill come ingresso primario.

### Uso corretto di `git_diff` `action: "range_diff"`

* Usa `range_diff` solo se `original_range` e `rewritten_range` rappresentano davvero **la stessa serie logica di commit** (prima/dopo rebase).
* Preferisci range con base coerente, ad esempio:
  * originale: `upstream_old..feature_old`
  * riscritto: `upstream_new..feature_rebased`
* Se i range non sono equivalenti (branch errato, base sbagliata, commit aggiunte/rimosse), `only_left`/`only_right` può essere tecnicamente corretto ma fuorviante rispetto all'obiettivo "verifica rebase equivalente".
* In caso di dubbio, valida prima i range con `git_query` (`history`, `check_ancestor`) e poi interpreta `range_summary`.

## Carica Riferimenti Solo Se Servono

* [references/handoffs-and-conflicts.md](references/handoffs-and-conflicts.md) per modelli di nota, passaggi verso skill tecniche e gestione dei conflitti.

## Risoluzione Problemi

* Se Mantis non risponde, controlla `MANTIS_URL` e `MANTIS_TOKEN` nel `.env`.
* Se Git non trova il repository, verifica `project_path` assoluto e che punti alla root giusta.
* Se mancano prove nel ticket, allega file o cita percorsi/output invece di lasciare solo descrizioni generiche.
