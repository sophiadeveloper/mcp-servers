# Ticket-First Light

Variante leggera derivata dal flusso `ticket-first`, utile come intake rapido prima di un'analisi completa.

## Quando usarla

Usa `ticket-first-light` quando:

- l'utente chiede un avvio veloce o una prima fotografia tecnica;
- serve stimare rapidamente se il ticket e chiaro o incompleto;
- vuoi proporre un piano prima di investire in analisi multi-sorgente estesa.

Non usarla come sostituto definitivo dell'analisi completa quando il task richiede output articolati o verifica su piu fonti.

## Obiettivo

Produrre in tempi brevi un mini-dossier con:

1. contesto minimo del ticket;
2. 2-5 evidenze osservate;
3. inferenze iniziali esplicitate;
4. elenco gap bloccanti e prossimi passi.

## Sequenza operativa minima

1. Leggi ticket + note + allegato principale.
2. Estrai riferimenti tecnici minimi (repo, commit, docs, db, ambienti).
3. Approfondisci una sola sorgente prioritaria (di norma codice o docs).
4. Redigi output corto separando `evidenza`, `inferenza`, `punto aperto`.
5. Valuta escalation.

## Regola di escalation al flusso completo

Escalare da `ticket-first-light` a `ticket-first` completo quando almeno una condizione e vera:

- dipendenze su piu repository;
- dipendenze su piu ambienti/database;
- conflitto tra quanto dichiarato nel ticket e stato reale del codice;
- richiesta esplicita di deliverable completi (requisiti/stato dell'arte/gap analysis finale).

## Prompt guidato di avvio

`Parti dal ticket {ticket_id} in modalita ticket-first-light. Fornisci contesto, evidenze osservate, inferenze iniziali e punti aperti prioritari. Se rilevi complessita multi-sorgente, indica chiaramente l'escalation al ticket-first completo di mcp-technical-analyst.`
