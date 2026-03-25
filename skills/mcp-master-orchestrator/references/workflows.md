# Workflows

Usa questo riferimento quando il task richiede una sequenza esplicita di piu skill.

## Fix Regressione Con Effetto Su DB E UI

1. `mcp-docs-navigator`: recupera documentazione e tag rilevanti.
2. `mcp-git-mantis-workflow`: leggi ticket, allegati e commit storici.
3. `mcp-database-expert`: verifica schema e dati correnti.
4. `mcp-coldfusion-developer`: controlla lint e log applicativi.
5. Applica la fix.
6. `mcp-browser-automation`: esegui validazione E2E.
7. `mcp-docs-navigator`: aggiorna o indicizza la documentazione cambiata.
8. `mcp-git-mantis-workflow`: lascia nota finale con prove e file prodotti.

## Generare Report Mensile

1. `mcp-docs-navigator`: cerca definizioni del report, periodo, KPI e naming.
2. `mcp-database-expert`: esegui query e salva eventuali risultati intermedi.
3. `mcp-office-expert`: crea Excel e, se richiesto, documento Word con commento sintetico.
4. `mcp-docs-navigator`: indicizza il report o il riepilogo se deve restare ricercabile.
5. `mcp-git-mantis-workflow`: allega o annota il deliverable se nasce da ticket.

## Onboarding Di Un Nuovo Modulo CF

1. `mcp-docs-navigator`: leggi analisi, procedure, naming e dipendenze del modulo.
2. `mcp-git-mantis-workflow`: identifica ticket, baseline e file toccati storicamente.
3. `mcp-coldfusion-developer`: implementa e valida il codice CFML.
4. `mcp-database-expert`: verifica dati o schema se il modulo ne dipende.
5. `mcp-browser-automation`: prova login, navigazione e form principali.
6. `mcp-docs-navigator`: aggiorna guide e tag del nuovo materiale.
