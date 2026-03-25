---
name: mcp-office-expert
description: Legge, crea e modifica file Office e PDF (Word .docx/.doc, Excel .xlsx/.xls, PDF .pdf) tramite office-mcp-server. Utilizzare quando l'obiettivo riguarda analisi, estrazione o modifica di documenti locali.
---

# MCP Office Expert

Questo skill guida l'agente nell'utilizzo di `office-mcp-server` per operare su file Word, Excel e PDF in modo preciso ed efficiente.

## Tool Disponibili

| Tool | Formati | Descrizione |
| :--- | :--- | :--- |
| `word_document` | `.docx`, `.doc` | Legge, crea e modifica documenti Word |
| `excel_document` | `.xlsx`, `.xls` | Legge, scrive e crea file Excel |
| `pdf_document` | `.pdf` | Legge metadata e testo dei PDF ed esporta in `.md` o `.txt` |

---

## Workflow: Modifica Documento Word (.docx)

Per modificare contenuto esistente, **non indovinare mai l'indice** — recuperalo sempre prima.

1.  **Mappa il documento**: Usa `word_document` con `action: "list_paragraphs"` per ottenere l'elenco numerato di tutti i paragrafi.
2.  **Individua il target**: Identifica l'indice `[N]` del paragrafo da modificare dall'output precedente.
3.  **Applica la modifica**: Usa `word_document` con:
    *   `action: "edit_paragraph"` + `paragraph_index: N` + `text: "..."` per sostituzione in-place.
    *   `action: "insert_paragraph"` + `paragraph_index: N` + `text: "..."` per inserimento prima di N.
    *   `action: "delete_paragraph"` + `paragraph_index: N` per rimozione.

## Workflow: Lettura Documento Word

*   `.docx` e `.doc`: Usa `action: "read"` — restituisce il testo grezzo dell'intero documento.
*   Per file `.doc` la **sola azione supportata è `read`**. Per modifiche, chiedi all'utente di convertire in `.docx`.

## Workflow: Creazione Documento Word (.docx)

Usa `action: "create"` + `paragraphs: [...]`. Ogni elemento dell'array è un oggetto:
```json
{ "text": "Titolo del documento", "heading": "1" }
{ "text": "Testo corpo normale" }
{ "text": "Sottosezione", "heading": "2" }
```
Livelli `heading` supportati: `"1"` – `"6"`. Se omesso, il blocco è un paragrafo normale.

---

## Workflow: Lettura Foglio Excel (.xlsx / .xls)

1.  **Scopri i fogli**: Usa `excel_document` con `action: "list_sheets"` per ottenere i nomi di tutti i fogli.
2.  **Leggi i dati**: Usa `action: "read_sheet"` con:
    *   `sheet_name`: nome del foglio (se omesso, usa il primo).
    *   `range`: range opzionale in formato A1 (es. `"A1:F20"`). Se omesso, legge l'intero foglio.
    *   Il risultato è un **array 2D** (righe × colonne) in JSON.

## Workflow: Scrittura / Aggiornamento Excel

*   **Aggiorna celle esistenti**: `action: "write_cells"` + `values: [[...], [...]]` + `start_cell: "A1"` (default).
    *   I dati vengono scritti a partire dalla cella indicata, sovrascrivendo le celle occupate.
    *   Il foglio e il file devono esistere già, oppure verranno creati automaticamente.
*   **Crea nuovo file**: `action: "create"` + `sheets: [{ "name": "Foglio1", "values": [[...]] }]`.

---

## Workflow: Lettura PDF (.pdf)

1.  **Controlla la struttura**: Usa `pdf_document` con `action: "metadata"` per ottenere numero pagine e metadata principali.
2.  **Leggi solo il necessario**:
    *   `action: "read_page"` + `page_number` per una singola pagina.
    *   `action: "read_range"` + `start_page` / `end_page` per una porzione mirata.
    *   `action: "read_all"` solo se serve davvero l'intero documento.
3.  **Gestisci i limiti del formato**: Se il PDF è scannerizzato o image-only, il tool può restituire `(nessun testo estraibile)`. In quel caso segnala il limite invece di insistere con altre letture testuali.

## Workflow: Export PDF per Reuso o Indicizzazione

*   Usa `pdf_document` con `action: "export_text"` per salvare il contenuto in locale.
*   Parametri chiave:
    *   `save_path`: percorso assoluto del file di output.
    *   `format: "md"` quando il file verrà indicizzato da `docs-node`.
    *   `format: "txt"` quando serve solo un dump testuale semplice.
*   Le cartelle mancanti del `save_path` vengono create automaticamente dal server.
*   L'export in Markdown crea sezioni `## Pagina N`, utili per ricerche e rilettura mirata.

## Sinergie e Best Practices

*   **Analisi documentale**: Combina `read` (word) e `export_text` (pdf) con `mcp-docs-navigator` per indicizzare e cercare nei documenti estratti.
*   **Report automatici**: Usa `excel_document` (`write_cells`) per produrre output tabulari di query SQL ottenuti da `mcp-database-expert`.
*   **PDF -> Docs**: Per rendere un PDF interrogabile con `docs-node`, esportalo in `.md` con `pdf_document` (`export_text`) e poi indicizzalo con `docs_management` (`scan_file`) o tramite una cartella dedicata con `scan_folder`.
*   **Verifica prima di scrivere**: Per Excel, leggi sempre il range target con `read_sheet` prima di sovrascrivere, per evitare perdita di dati.
*   **Backup implicito**: Le modifiche a `.docx` e `.xlsx` sono in-place e **non reversibili** dal tool. Se il file è prezioso, suggerisci all'utente di fare una copia prima di procedere.

## Risoluzione Problemi

*   **"File non trovato"**: Verifica che `file_path` sia un percorso assoluto esistente.
*   **"Indice fuori dai limiti"**: Riesegui `list_paragraphs` — la struttura del documento potrebbe essere cambiata dall'ultima lettura.
*   **Caratteri speciali persi**: L'azione `edit_paragraph` rimuove la formattazione del run (grassetto, corsivo). Per documenti con formattazione complessa, preferisci `insert_paragraph` + `delete_paragraph` per preservare i run vicini.
*   **File `.xls` in sola lettura**: Alcuni `.xls` molto vecchi (pre-Excel 97) potrebbero non essere scrivibili. Chiedi all'utente di salvare il file in `.xlsx` da Excel.
*   **PDF senza testo**: Se `read_page` o `read_all` restituiscono `(nessun testo estraibile)`, il PDF probabilmente contiene solo immagini; il tool non esegue OCR.
*   **Export fallito**: Verifica che `save_path` sia assoluto e punti a una destinazione scrivibile. Il server crea la cartella, ma non può aggirare permessi filesystem insufficienti.
