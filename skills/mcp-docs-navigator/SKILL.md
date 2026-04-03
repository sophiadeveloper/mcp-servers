---
name: mcp-docs-navigator
description: Search, tag, scan, and maintain project documentation through docs-node. Use when the agent must retrieve procedures, organize Markdown corpora, ingest exported office documents, or classify knowledge for other MCP workflows.
---

# MCP Docs Navigator

Questo skill ottimizza accesso e manutenzione della documentazione di progetto usando `docs-mcp-server`, con enfasi su ricerca mirata, tag coerenti e corpus facili da mantenere nel tempo.

## Workflow Base

1. Controlla `docs_management` `action: "feature_status"` prima di fare uso intensivo di tag o scan sources.
2. Usa `scan_folder` solo su root documentali vere e `scan_file` per aggiornare file noti.
3. Se i tag sono disponibili, restringi subito il corpus con `list_tags`, `search`, `list_documents`, `tag` e `tags`.
4. Usa `read_document` in modo mirato con `search_string`, `start_line` ed `end_line` quando il file e lungo.
5. Usa `bulk_set_document_tags` solo per riallineamenti massivi, non per piccoli update.
6. Usa `resync_all` o `remove_shelf` solo quando serve davvero riallineare o recuperare un indice incoerente.

## Sinergie e Best Practices

* Prima di lavorare su SQL o CFML, prova una ricerca mirata su tag come `database`, `cfml`, `procedura`, `analisi-tecnica`.
* Per rendere un PDF ricercabile, passa prima da `mcp-office-expert` con `pdf_document` `action: "export_text"` e poi indicizza il Markdown.
* Dopo aver creato report o guide con `mcp-office-expert`, esegui `scan_file` e assegna tag coerenti.
* Cerca snippet o procedure esistenti prima di riscriverli da zero.

## Regole di escalation prompt -> skill

Escala a `mcp-docs-navigator` quando il prompt chiede discovery o manutenzione del corpus documentale:

- ricerca procedure/regole di business;
- tagging, classificazione, scansione o riallineamento di scaffali docs;
- recupero rapido di sezioni specifiche da Markdown lunghi.

Escalation secondaria:

1. Se la fonte e un PDF/DOCX/XLSX non ancora normalizzato, passa prima da `mcp-office-expert` e poi torna qui per `scan_file` + tagging.
2. Se i contenuti docs vanno correlati con ticket/commit/database per una valutazione completa, passa a `mcp-technical-analyst`.
3. Se il prompt e esclusivamente operativo su codice o DB senza bisogno di corpus docs, delega allo skill tecnico dedicato.

## Carica Riferimenti Solo Se Servono

* [references/tagging-strategy.md](references/tagging-strategy.md) per convenzioni di tag e combinazioni pratiche.
* [references/maintenance-playbook.md](references/maintenance-playbook.md) per resync, escalation e ingestione di nuovi corpus.

## Risoluzione Problemi

* Se i risultati sono vuoti, verifica formato `.md`, root di scansione e filtri troppo restrittivi.
* Se il corpus genera troppo rumore, restringi con `shelf`, `tags`, `tagged` e `limit`.
* Se l'indice sembra corrotto, restringi il problema e poi valuta `remove_shelf` seguito da una scansione mirata.
