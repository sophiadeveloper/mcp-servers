# Functional Exploration

## Quando usare Playwright

Usa Playwright solo se almeno una di queste condizioni vale:

- serve provare un flusso utente o batch da interfaccia;
- serve raccogliere prove su errori browser-side;
- il comportamento dipende da iframe, download o rendering UI;
- i dati e il codice non bastano a spiegare il problema.

## Cosa raccogliere

Quando usi Playwright, raccogli sempre almeno:

- URL o pagina visitata;
- frame attivo se rilevante;
- screenshot o annotazione se utile;
- console logs;
- network errors.

## Quando evitarlo

Evitalo se il task e gia chiudibile con:

- ticket + allegati;
- docs + git;
- query DB;
- lettura statica del codice;
- log applicativi.

## Output atteso

Se Playwright e usato, riporta nei deliverable:

- perche e stato necessario;
- cosa e stato osservato;
- se l'evidenza e conclusiva o solo di supporto.
