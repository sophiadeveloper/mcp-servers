---
name: mcp-docs-navigator
description: Ricerca e gestione della documentazione di progetto tramite docs-node. Utilizzare per indicizzare file Markdown, sfruttare i tag e trovare informazioni tecniche o funzionali velocemente.
---

# MCP Docs Navigator

Questo skill ottimizza l'accesso alla documentazione interna del progetto utilizzando `docs-mcp-server`.

## Workflow Ottimizzato

1. **Stato feature**: Prima di un uso intenso del navigatore, controlla `docs_management` con `action: "feature_status"` per capire se `tags` e `scan_sources` sono inizializzati correttamente.
2. **Indicizzazione mirata**: Usa `scan_folder` solo su vere root documentali e `scan_file` per aggiornare file noti.
   Evita scansioni ricorsive troppo ampie del repository se non servono: aggiungono rumore e consumano token.
3. **Tag first**: Se i tag sono disponibili, usa `list_tags`, `search` con `tags`, `list_documents` con `tag` o `tagged`, e `include_tags` per restringere il corpus prima della full-text search.
4. **Ricerca full-text**: Usa `docs_navigation` con `action: "search"` per trovare termini specifici. Combina `query`, `shelf` e `tags` quando possibile.
5. **Lettura mirata**: Usa `read_document` per leggere il contenuto. Se il documento e lungo, usa `search_string`, `start_line` ed `end_line` per isolare solo i frammenti rilevanti.
6. **Classificazione massiva**: Se `tags` non sono inizializzati, crea il dizionario con `create_tag` e usa `bulk_set_document_tags` per classificare i documenti in blocco una volta sola.
7. **Resync consapevole**: Usa `resync_all` per riallineare il corpus e verificare file mancanti. Se `scan_sources` segnala un setup legacy file-only, completa l'inizializzazione con `scan_folder` sulle root reali.

## Sinergie e Best Practices

* **Pre-analisi**: Prima di iniziare un task SQL o ColdFusion, prova prima `search` con tag ad alto segnale come `database`, `cfml`, `procedura`, `analisi-tecnica`, poi aggiungi la `query`.
* **Riduzione token**: Preferisci `list_documents` con filtri tag o `search` con `limit` basso prima di aprire documenti lunghi.
* **Ingestione PDF indiretta**: `docs-node` indicizza Markdown, non PDF nativi. Se devi rendere un PDF ricercabile, usa prima `mcp-office-expert` / `pdf_document` con `action: "export_text"` e `format: "md"`, poi indicizza il file esportato con `scan_file`.
* **Nuovi corpus verticali**: Quando indicizzi per la prima volta una documentazione omogenea (prodotto, addon, modulo o dominio specifico), crea almeno un tag di dominio condiviso da tutto il corpus e aggiungi tag di capability o entita ricorrenti solo se migliorano davvero la ricerca.
* **Aggiornamento continuo**: Dopo aver modificato un documento noto, esegui `scan_file` invece di rifare una scansione ampia della cartella.
* **Cartelle di export dedicate**: Se importi molti PDF, mantieni una cartella stabile di Markdown esportati e registrala con `scan_folder`, cosi i resync futuri restano semplici e prevedibili.
* **Governance tag**: Non assegnare tag arbitrari ai documenti. Se un tag manca, prima crealo nel dizionario con descrizione chiara.
* **Strategia tag**: In corpus come integrazioni provider-based o moduli multi-funzione, privilegia una combinazione `dominio + capability + provider/modulo` invece di affidarti solo allo scaffale o alla ricerca full-text.
* **Snippet di esempio**: Cerca frammenti o procedure esistenti prima di riscriverli da zero.

## Risoluzione Problemi

* **Risultati vuoti**: Verifica che il file sia effettivamente in formato Markdown (`.md`), che il percorso di scansione sia corretto e che i filtri tag non siano troppo restrittivi. Se la sorgente originale è un PDF, assicurati di averlo prima esportato in Markdown.
* **Troppo rumore**: Restringi il corpus con `shelf`, `tags`, `tagged`, `limit` o usa `list_documents` prima di una nuova `search`.
* **Feature non inizializzata**: Segui le istruzioni restituite da `feature_status` o dal notice della feature (`tags`, `scan_sources`).
* **Errore database**: Se l'indice sembra corrotto, usa `remove_shelf` e rifai una scansione mirata della sola root necessaria.
