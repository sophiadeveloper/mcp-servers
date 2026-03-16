---
name: mcp-docs-navigator
description: Ricerca e gestione della documentazione di progetto tramite docs-node. Utilizzare per indicizzare file Markdown e trovare informazioni tecniche o funzionali velocemente.
---

# MCP Docs Navigator

Questo skill ottimizza l'accesso alla documentazione interna del progetto utilizzando `docs-node`.

## Workflow Ottimizzato

1.  **Indicizzazione**: Prima di cercare, assicurati che i file `.md` siano indicizzati. Usa `docs_management` con `action: "scan_folder"` o `scan_file`.
    *   Organizza la documentazione in "scaffali" (`shelf`) logici (es: "Business Logic", "Database", "API").
2.  **Ricerca Full-Text**: Usa `docs_navigation` con `action: "search"` per trovare termini specifici.
3.  **Lettura Mirata**: Usa `action: "read_document"` per leggere il contenuto. Se il documento è lungo, usa `search_string` per isolare solo i frammenti rilevanti.

## Sinergie e Best Practices

*   **Pre-Analisi**: Prima di iniziare un nuovo task SQL o ColdFusion, cerca "schema" o "logic" nel navigatore per vedere se esiste già una specifica.
*   **Aggiornamento Continuo**: Dopo aver modificato la documentazione (es. con `write_file`), esegui sempre `scan_file` per mantenere l'indice sincronizzato.
*   **Snippet di Esempio**: Cerca frammenti di codice esistenti prima di riscriverli da zero.

## Risoluzione Problemi

*   **Risultati Vuoti**: Verifica che il file sia effettivamente in formato Markdown (`.md`) e che il percorso di scansione fosse corretto.
*   **Errore Database**: Se l'indice sembra corrotto, usa `remove_shelf` e rifai la scansione.
