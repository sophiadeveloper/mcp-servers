---
name: mcp-browser-automation
description: Navigate, inspect, and validate web interfaces with Playwright MCP, including iframe-heavy pages, downloads, and session reuse. Use when the agent must reproduce UI flows, verify post-fix behavior, or inspect browser-side failures.
---

# MCP Browser Automation

Questo skill guida l'agente nell'uso di `playwright-node` per testare applicazioni web, soprattutto quando serve una prova visiva o funzionale dopo modifiche a codice, dati o configurazioni.

## Workflow Ottimizzato

1. **Navigazione**: Inizia con `browser_navigate` verso l'URL target.
2. **Ispezione Visiva**: Usa `browser_screenshot` o `browser_annotate` prima di interagire.
3. **Interazione Precisa**: Preferisci `browser_click_by_id` o selettori CSS robusti.
4. **Verifica**: Controlla sempre `browser_get_console_logs` e `browser_get_network_errors`.

## Pagine Legacy E Tab In Iframe

Su applicazioni legacy il contenuto operativo puo vivere in iframe invece che nel DOM principale.

### Strategia Consigliata

1. Apri la pagina contenitore con `browser_navigate`.
2. Se il DOM sembra incompleto, usa `browser_list_frames`.
3. Seleziona il frame operativo con `browser_select_frame`.
4. Solo dopo la selezione del frame usa gli altri tool interattivi.
5. Se cambi tab o pagina, ricontrolla il frame attivo.

## Sinergie e Best Practices

* Dopo modifiche via `mcp-database-expert` o `mcp-coldfusion-developer`, usa Playwright per la validazione finale.
* Se l'applicazione genera PDF o Excel, usa `browser_read_downloaded_file` per una verifica veloce del contenuto scaricato.
* Usa `browser_export_state` e `browser_load_state` per evitare login ripetitivi.

## Carica Riferimenti Solo Se Servono

* [references/test-patterns.md](references/test-patterns.md) per pattern comuni di login, tab, form e verifica di report scaricati.

## Risoluzione Problemi

* Se un elemento non si trova, usa `browser_get_dom` per una vista testuale semplificata.
* Se un elemento e visibile ma assente nel DOM, verifica se il contenuto e dentro un iframe.
* Se la navigazione e bloccata, controlla la variabile `ALLOWED_URLS`.
