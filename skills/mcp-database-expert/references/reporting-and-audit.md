# Reporting And Audit

Usa questo riferimento quando il lavoro SQL non si ferma alla sola query ma deve produrre un report, un handoff o una traccia verificabile.

## Workflow: Query -> Excel -> Ticket

1. Cerca prima in `mcp-docs-navigator` documenti con tag come `database`, `schema`, `report`, `procedura`.
2. Valida la query con `lint_code`.
3. Leggi lo schema con `sql_executor` `action: "schema"` se non e gia chiaro.
4. Esegui la query con `sql_executor` `action: "query"`.
5. Passa i risultati a `mcp-office-expert` e usa `excel_document` `action: "write_cells"` o `action: "create"` per salvare l'output in `.xlsx`.
6. Se il report va condiviso, aggiungi un riassunto in Word o allegalo al ticket con `mcp-git-mantis-workflow`.

## Workflow: Audit Trail

Registra almeno questi elementi quando il task e legato a ticket o indagini:

* tabella o vista interrogata
* filtro temporale o chiave usata
* file o documento dove e stato salvato l'output
* eventuale limite o ipotesi applicata

Usa Mantis per la traccia operativa. Git va usato in sola lettura per recuperare storia, non per creare commit senza autorizzazione esplicita.

## Query Paginate

Per dataset grandi:

* limita i campi alle sole colonne necessarie
* usa `TOP`, `LIMIT`, `OFFSET/FETCH` o l'equivalente del dialetto SQL del progetto
* se devi esportare tutto, procedi per lotti e annota l'ordinamento usato per evitare duplicati o salti

## Errori Frequenti

* Scrivere query senza aver prima verificato schema o naming documentato.
* Esportare risultati senza intestazioni chiare per il destinatario finale.
* Dimenticare di annotare nel ticket da quale query deriva un numero o un report.
