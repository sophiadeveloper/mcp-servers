# Source Matrix

## Se hai un ticket

Cerca subito:

- note e allegati;
- relazioni con altri ticket;
- commit o branch citati;
- progetto / handler / date chiave;
- repo e DB menzionati nel testo.

## Se hai un allegato o un documento

Cerca subito:

- ticket, commit, branch o URL presenti nel contenuto;
- nomi di tabelle, datasource, ambienti, shelf docs;
- credenziali o dati sensibili da redigere nei deliverable.

## Se hai una commit o un branch

Cerca subito:

- ticket correlati;
- file toccati e pattern ricorrenti;
- eventuali repo cliente / platform da confrontare;
- dati o configurazioni attese dal codice.

## Se hai un repo esterno alla workspace

Cerca subito:

- root git corretta;
- branch o commit indicati;
- differenze rispetto al repo corrente;
- configurazioni o SQL trasferibili.

## Se ti serve un DB non montato

Usa un `project_path` minimale con `.env` dedicato e read-only, se il contesto lo consente. Documenta sempre:

- host
- DB_NAME usato
- perche quel DB serve all'analisi

## Se hai uno shelf docs

Restringi il corpus con:

- shelf
- query brevi e mirate
- tag se disponibili

Leggi solo i documenti che aiutano a chiudere decisioni o gap.

## Se hai un ambiente applicativo o URL

Usa Playwright solo se serve:

- confermare un comportamento funzionale;
- verificare console/network/frame;
- ispezionare un errore non spiegabile da codice o DB.
