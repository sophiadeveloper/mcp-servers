# Test Patterns

Usa questo riferimento quando devi orchestrare un test E2E ripetitivo o confrontare output UI con dati attesi.

## Login E Sessione

1. Effettua il login una sola volta.
2. Salva lo stato con `browser_export_state`.
3. Riutilizza la sessione con `browser_load_state` nei test successivi.

## Tab E Iframe

1. Naviga alla pagina contenitore.
2. Se il DOM principale e incompleto, usa `browser_list_frames`.
3. Seleziona il frame corretto prima di annotare o cliccare.
4. Dopo cambi tab o submit, ricontrolla il frame attivo.

## Form E Submit

* ispeziona la pagina con `browser_annotate` o `browser_get_dom`
* compila con `browser_fill`
* esegui click o `browser_press_key`
* verifica risultato con DOM, screenshot, console e network

## Verifica Report Scaricati

Quando l'app genera PDF o Excel:

1. scarica il file dal browser
2. leggi il contenuto testuale con `browser_read_downloaded_file`
3. se serve confrontare numeri o righe, usa `mcp-database-expert` per recuperare la fonte dati
4. se il file deve restare disponibile, passa a `mcp-office-expert` o salvalo nel percorso richiesto dal task
