# Analysis Workflow

## Workflow Ticket-First

1. Leggi il ticket e salva i metadati minimi:
   - id, summary, stato, handler, date, relazioni.
2. Leggi note private/pubbliche e scarica allegati rilevanti.
3. Estrai riferimenti esterni:
   - commit
   - branch
   - repo
   - shelf docs
   - db / ambiente
   - URL applicativi
4. Cerca documentazione interna collegata.
5. Analizza il codice nei repo citati.
6. Verifica dati reali sui DB necessari.
7. Usa Playwright solo se serve validazione funzionale o prova visuale.
8. Genera i documenti finali.

## Workflow Document-First

1. Converti o leggi il documento sorgente.
2. Raccogli i riferimenti tecnici espliciti nel testo.
3. Apri i filoni:
   - ticket
   - repo
   - db
   - docs
   - runtime / UI
4. Confronta il contenuto del documento con stato reale e implementazione.
5. Chiudi con gap analysis e proposta tecnica.

## Sequenza Consigliata Dei Tool

1. `mantis` / `docs` / `office` per intake iniziale.
2. `git` per storia e stato del codice.
3. `sql` per schema e dati reali.
4. `cf` per log o dettagli applicativi CFML.
5. `playwright` solo se i fatti raccolti non bastano o serve validazione finale.

## Artefatti Consigliati

- un file `.md` per ogni punto analitico rilevante;
- un file finale di sintesi tecnica;
- eventuali conversioni `.md` di allegati da tenere locali se sensibili;
- opzionalmente indicizzazione nello scaffale docs richiesto.
