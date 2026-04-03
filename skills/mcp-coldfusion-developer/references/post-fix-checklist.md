# Post-Fix Checklist

## Dopo Una Modifica CFML

1. Riesegui `lint_code` in modalita audit (solo analisi, senza fix automatici).
2. Controlla i log applicativi piu vicini al flusso toccato.
3. Se la modifica impatta schermate o submit, passa a `mcp-browser-automation`.
4. Se il comportamento e cambiato in modo permanente, aggiorna la documentazione con `mcp-docs-navigator`.
5. Se il lavoro nasce da ticket, annota prove e percorsi validati in Mantis.

## Regola Forte Audit/Remediation

* **Audit**: `lint_code` va eseguito senza fix automatici come default operativo.
* **Remediation**: `fix: true` e consentito solo se esplicitamente richiesto nel task o dall'utente.

## Lettura Log Proattiva

Quando sospetti errori non immediatamente visibili:

* usa `logs_list` per individuare il file corretto
* leggi le ultime righe con `logs_read`
* se trovi file e linee, passa a Git per `blame`
* se il log menziona query o dati, passa a `mcp-database-expert`
