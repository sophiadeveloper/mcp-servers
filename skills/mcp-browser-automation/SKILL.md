---
name: mcp-browser-automation
description: Automazione del browser e test E2E tramite playwright-node. Utilizzare per navigare siti web, eseguire screenshot e verificare il corretto funzionamento delle interfacce.
---

# MCP Browser Automation

Questo skill guida l'agente nell'utilizzo di `playwright-node` per testare applicazioni web (specialmente interfacce ColdFusion).

## Workflow Ottimizzato

1.  **Navigazione**: Inizia sempre con `browser_navigate` verso l'URL target (tipicamente `localhost` per dev).
2.  **Ispezione Visiva**: Usa `browser_screenshot` o `browser_annotate` per capire lo stato della pagina senza dover leggere tutto il DOM.
3.  **Interazione Precisa**: Preferisci `browser_click_by_id` (dopo `annotate`) o selettori CSS robusti.
4.  **Verifica**: Usa `browser_get_console_logs` e `browser_get_network_errors` per assicurarti che non ci siano errori JavaScript o fallimenti di chiamate API nel backend.

## Pagine Legacy E Tab In Iframe

Su applicazioni legacy, specialmente ColdFusion con tab dinamici, il contenuto operativo della pagina può essere caricato dentro iframe invece che nel DOM principale.

### Segnali tipici

*   Il DOM principale mostra titolo, tab e pochi hidden, ma non i pulsanti operativi.
*   Il pulsante atteso esiste a video ma non compare in `browser_get_dom` o nelle query sul main frame.
*   Dopo un click su un tab, il contenitore cambia ma i comandi risultano ancora assenti.

### Strategia consigliata

1.  Apri la pagina contenitore con `browser_navigate`.
2.  Se il DOM sembra incompleto, usa `browser_list_frames`.
3.  Seleziona il frame operativo con `browser_select_frame`.
4.  Solo dopo la selezione del frame usa `browser_get_dom`, `browser_annotate`, `browser_click`, `browser_click_by_id` e gli altri tool interattivi.
5.  Se cambi tab o pagina, considera che il frame attivo potrebbe dover essere riselezionato.

### Attese E Stabilizzazione

*   Su pagine lente o con submit classici, non assumere che l'assenza immediata di un elemento significhi che non esista.
*   Dopo click su tab, salvataggi o inoltri, attendi la stabilizzazione della pagina prima di concludere l'esito del test.
*   Se il risultato atteso non appare nel testo della pagina, controlla anche script, alert o popup applicativi tramite il DOM o il markup restituito.

## Sinergie e Best Practices

*   **Test Post-Deployment**: Dopo aver aggiornato un database via `sql-node` o codice via `cf-node`, usa Playwright per verificare che il frontend rifletta correttamente i cambiamenti.
*   **Download Analysis**: Se l'applicazione genera PDF o Excel, usa `browser_read_downloaded_file` per verificarne il contenuto testuale scaricato.
*   **Stato Sessione**: Usa `browser_export_state` e `browser_load_state` per evitare di dover ripetere il login ad ogni test.

## Risoluzione Problemi

*   **Elemento Non Trovato**: Usa `browser_get_dom` per avere una visione testuale semplificata della pagina e identificare il selettore corretto.
*   **Elemento Visibile ma Assente nel DOM**: Verifica se il contenuto è dentro un iframe con `browser_list_frames` e `browser_select_frame`.
*   **Pulsanti Mancanti Su Tab Legacy**: Verifica di essere nel frame corretto prima di concludere che il comando non sia disponibile.
*   **Navigazione Bloccata**: Verifica la variabile d'ambiente `ALLOWED_URLS` se il server impedisce la navigazione verso determinati host.
