# Handoffs And Conflicts

## Handoff Verso Skill Tecniche

Quando dal ticket emergono file o sintomi specifici:

* SQL, viste o dati incoerenti -> passa a `mcp-database-expert`
* file `.cfm` / `.cfc`, stack trace applicativi o log -> passa a `mcp-coldfusion-developer`
* documenti, analisi, procedure o allegati testuali -> passa a `mcp-docs-navigator`
* riproduzione UI o validazione finale -> passa a `mcp-browser-automation`

Nel passaggio, porta con te:

* ID ticket
* hash o baseline rilevante
* file coinvolti
* ipotesi gia escluse

## Modello Di Nota Mantis

Usa note brevi ma verificabili. Includi:

* cosa hai controllato
* quali file o query hai toccato
* dove sono salvati allegati o report
* quale validazione resta da fare o e stata completata

## Conflitti

Per merge o rebase:

1. analizza il conflitto con `git_conflict_manager`
2. usa `git_query` `action: "blame"` sulle sezioni in conflitto
3. se il conflitto tocca SQL o CFML, chiedi supporto alla skill tecnica del dominio
4. documenta nel ticket le decisioni non ovvie
