# Coordination Checklist

## Prima di Iniziare

* Conferma il `project_path` e riusalo per tutti i tool che dipendono dal contesto locale.
* Verifica se il task richiede output finale tecnico, documentale o visivo.
* Se il task e analitico e parte da ticket, documento, allegato o fonti miste, valuta subito `mcp-technical-analyst` come skill primario.
* Se serve solo un kickoff rapido da ticket, usa la variante `ticket-first-light` e pianifica l'eventuale escalation al flusso completo.
* Decidi qual e il punto di validazione finale: query, log, UI, file generato o ticket aggiornato.

## Durante Il Lavoro

* Usa linter prima di SQL o CFML.
* Mantieni stretta la ricerca documentale con tag, shelf e limiti bassi.
* Riusa sessioni Playwright con `browser_export_state` e `browser_load_state` quando il login e ripetitivo.
* Non aprire troppi fronti insieme: completa una fase e lascia un artefatto prima di passare alla successiva.

## Errori Comuni

* Dimenticare il `project_path` e leggere credenziali o log del progetto sbagliato.
* Eseguire query senza aver verificato schema o documentazione di dominio.
* Testare la UI senza controllare console, network o frame attivo.
* Aggiornare file o ticket ma non riallineare la documentazione indicizzata.
* Usare uno skill specialistico puro quando il problema reale e una ricostruzione tecnica cross-ticket, cross-repo o cross-db.
