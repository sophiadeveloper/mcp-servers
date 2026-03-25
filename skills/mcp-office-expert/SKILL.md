---
name: mcp-office-expert
description: Read, create, and edit Word, Excel, and PDF files through MCP, including report generation and document export for docs indexing. Use when the task involves local documents, spreadsheet outputs, PDF extraction, or shared deliverables.
---

# MCP Office Expert

Questo skill guida l'agente nell'uso di `office-mcp-server` per leggere, produrre e rifinire documenti locali senza perdere controllo su struttura, range e destinazione finale.

## Tool Disponibili

| Tool | Formati | Descrizione |
| :--- | :--- | :--- |
| `word_document` | `.docx`, `.doc` | Legge, crea e modifica documenti Word |
| `excel_document` | `.xlsx`, `.xls` | Legge, scrive e crea file Excel |
| `pdf_document` | `.pdf` | Legge metadata e testo dei PDF ed esporta in `.md` o `.txt` |

## Workflow Base

### Word

1. Usa `word_document` `action: "list_paragraphs"` prima di modificare: non indovinare mai l'indice.
2. Usa `edit_paragraph`, `insert_paragraph` o `delete_paragraph` con l'indice corretto.
3. Per file `.doc`, limita il lavoro a `action: "read"` e chiedi conversione a `.docx` se serve scrivere.

### Excel

1. Usa `excel_document` `action: "list_sheets"` per scoprire la struttura del workbook.
2. Leggi il range target con `action: "read_sheet"` prima di sovrascrivere.
3. Usa `write_cells` per aggiornare o `create` per generare un nuovo file.

### PDF

1. Parti da `pdf_document` `action: "metadata"`.
2. Leggi solo `read_page` o `read_range` finche possibile.
3. Usa `export_text` con `format: "md"` se il contenuto deve entrare in `mcp-docs-navigator`.

## Sinergie e Best Practices

* Combina `mcp-database-expert` + `excel_document` per produrre report tabellari riusabili.
* Dopo aver creato o esportato un documento che deve restare ricercabile, usa `mcp-docs-navigator` per `scan_file` e tagging.
* Le modifiche a `.docx` e `.xlsx` sono in-place e non reversibili dal tool: se il file e prezioso, crea prima una copia.
* Per output condivisi, preferisci un percorso chiaro e stabile invece di lasciare il file in cartelle temporanee.

## Carica Riferimenti Solo Se Servono

* [references/report-workflow.md](references/report-workflow.md) per il flusso completo query -> Excel -> Word -> docs/ticket.

## Risoluzione Problemi

* Se un indice Word non torna, riesegui `list_paragraphs`: la struttura puo essere cambiata dopo una modifica precedente.
* Se un PDF non restituisce testo, segnala il limite del file scannerizzato invece di insistere.
* Se `save_path` fallisce, verifica percorso assoluto e permessi filesystem.
