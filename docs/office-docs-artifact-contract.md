# Contratto minimo Office -> Docs (M3 compatibile, senza anticipare M4/M5)

Obiettivo: definire un'interfaccia stabile e minima per riusare un artifact testuale prodotto da `office-node` dentro `docs-node` tramite percorso locale (`save_path`).

## Ambito

Questo contratto copre solo:

- export testuale Office (`.md` o `.txt`) con salvataggio locale;
- emissione metadata artifact (`artifact://...`) da parte di `office-node`;
- ingestione documento in `docs-node` via `docs_management.scan_file` con `file_path` locale.

Non copre (out of scope):

- passaggio diretto `artifact://...` come input tool in `docs-node`;
- refactor cross-server o registry centralizzato multi-server;
- capability avanzate pianificate per milestone successive (M4/M5).

## Contratto minimo

### 1) Produzione artifact testuale (`office-node`)

Quando viene usato `pdf_document.export_text` (formato `md` o `txt`), la risposta deve mantenere:

- compatibilita' legacy: file scritto su `save_path` locale;
- metadata esteso: `structuredContent.resource_link` con URI `artifact://office/{year}/{month}/{artifact_id}`;
- mapping persistito nel registry locale Office con almeno:
  - `artifact_uri`
  - `save_path`
  - `mime_type`
  - `producer_tool`
  - `created_at`

### 2) Ingestione (`docs-node`)

`docs-node` continua a usare il contratto file-based esistente:

- tool: `docs_management`
- action: `scan_file`
- input minimo: `file_path` (percorso locale assoluto o risolvibile localmente)
- opzionale: `shelf`

Precondizione: il file su `save_path` deve esistere localmente ed essere leggibile da `docs-node`.

## Mapping `artifact://...` <-> `save_path`

Regola operativa minima:

1. il client riceve `resource_link = artifact://office/...` e `save_path` nello stesso output (`structuredContent`);
2. il registry Office conserva la coppia (`artifact_uri`, `save_path`);
3. per passare il risultato a `docs-node` si usa **`save_path`** come `file_path`.

In altri termini:

- `artifact://...` e' un identificatore resource-oriented (tracciabilita'/lettura via `resources/read` di `office-node`);
- `save_path` e' il ponte di compatibilita' locale per ingestione in `docs-node` oggi.

## Esempio end-to-end (shape minima)

1) export Office:

- input: `pdf_document.export_text` con `save_path: /tmp/export.md`, `format: md`
- output minimo atteso:
  - `structuredContent.save_path = "/tmp/export.md"`
  - `structuredContent.resource_link = "artifact://office/..."`

2) ingestione Docs:

- input: `docs_management.scan_file` con `file_path: /tmp/export.md`
- esito: documento indicizzato e ricercabile via `docs_navigation.search`.

## Smoke integrabile

Per validare questo contratto in modo incrementale e integrabile e' disponibile:

- `tests/smoke/office-docs-bridge.smoke.mjs`

Lo smoke:

- esegue export testuale con `office-node`;
- verifica mapping registry `artifact_uri` -> `save_path`;
- ingestisce il `save_path` con `docs-node`;
- verifica ricerca del contenuto indicizzato.
