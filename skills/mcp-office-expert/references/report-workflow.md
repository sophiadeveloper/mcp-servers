# Report Workflow

Usa questo riferimento quando devi trasformare risultati tecnici in un deliverable condivisibile.

## Query -> Excel -> Word

1. Recupera dati con `mcp-database-expert`.
2. Prepara intestazioni chiare e, se serve, un ordinamento stabile.
3. Crea o aggiorna il file Excel con `excel_document`:
   * `action: "create"` se parti da zero
   * `action: "write_cells"` se aggiorni un file esistente
4. Se serve un commento manageriale o procedurale, crea un `.docx` con `word_document` `action: "create"`.
5. Inserisci nel documento Word:
   * titolo del report
   * periodo coperto
   * fonti dati o query di origine
   * note su limiti, esclusioni o filtri

## Indicizzazione E Condivisione

* Se il report deve restare interrogabile, usa `mcp-docs-navigator` `scan_file` sul `.md` esportato o sul documento descrittivo collegato.
* Se il report nasce da un ticket, usa `mcp-git-mantis-workflow` per allegarlo o annotarne il percorso.
* Per grossi lotti di report, definisci una cartella stabile e un set minimo di tag coerenti.

## Precauzioni

* Fai una copia dei file critici prima di edit in-place.
* Leggi il range target in Excel prima di scrivere.
* Evita nomi file ambigui: includi periodo o contesto nel filename.
