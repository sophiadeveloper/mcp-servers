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

## Sinergie e Best Practices

*   **Test Post-Deployment**: Dopo aver aggiornato un database via `sql-node` o codice via `cf-node`, usa Playwright per verificare che il frontend rifletta correttamente i cambiamenti.
*   **Download Analysis**: Se l'applicazione genera PDF o Excel, usa `browser_read_downloaded_file` per verificarne il contenuto testuale scaricato.
*   **Stato Sessione**: Usa `browser_export_state` e `browser_load_state` per evitare di dover ripetere il login ad ogni test.

## Risoluzione Problemi

*   **Elemento Non Trovato**: Usa `browser_get_dom` per avere una visione testuale semplificata della pagina e identificare il selettore corretto.
*   **Navigazione Bloccata**: Verifica la variabile d'ambiente `ALLOWED_URLS` se il server impedisce la navigazione verso determinati host.
