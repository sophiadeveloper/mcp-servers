# Server capability matrix (analisi statica)

Questa matrice e' compilata **da analisi statica del codice corrente** (senza handshake runtime), come baseline Milestone 0.

Riferimenti di governance aggiornati:
- guida viva: `docs/mcp-skills-agents-development-guide.md`
- storico milestone completate: `docs/completed-milestones-mcp-skills.md`

Legenda rapida:
- ✅ presente/implementato
- ❌ non presente
- ⚠️ parziale o da approfondire

| Server | Tools | Resources | Prompts | Progress | Roots | Pattern API | `action` | `project_path` | `save_path` | Schema hygiene (statica) | Note compatibilita' Copilot/VS Code |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `git-node` | ✅ | ❌ | ✅ (`ListPromptsRequestSchema` presente) | ❌ | ✅ (fallback da `roots[]`) | `Server` low-level (`setRequestHandler`) | ✅ forte (enum su tutti i tool) | ✅ supportato (non piu' obbligatorio se presenti `roots`) | ❌ | ✅ buono (schema semplici/espliciti; nessun array complesso) | Buona base per host severi: include `instructions`, annotations, output strutturato e azioni read-only estese (`repo_info`, `rebase_status`, `range_diff`). Su `compare` sono ora esplicitati `left_ref`, `right_ref`, `diff_direction` e metadati file (`exists_in_left/right`, `change_type`) per ridurre ambiguita' semantiche; `status` espone `entries` strutturate e `rebase_status` mantiene shape stabile anche quando non attivo. Da M4 pilota espone anche `prompts/list` + `prompts/get` con workflow Git-centrici (es. `triage_bug_ticket`, `post_fix_validation`, review/conflitti), senza cambiare la API tool legacy. |
| `docs-node` | ✅ | ✅ | ❌ (nessun handler prompt) | ❌ | ❌ | `Server` low-level (`setRequestHandler`) | ✅ forte (tool condensati) | ❌ | ❌ | ✅ buono (array con `items`, oggetti annidati dichiarati) | Compatibile con host severi anche su superficie MCP moderna: supporta `resources/templates` e mapping `resource_uri` coerente con i tool di lettura documenti. Baseline M0 superata per `docs-node`. |
| `office-node` | ✅ | ✅ | ✅ (`ListPromptsRequestSchema` presente) | ✅ (`ingest_pdf_into_docs`) | ❌ | `Server` low-level (`setRequestHandler`) | ✅ forte (`word/excel/pdf` con enum) | ❌ | ✅ (`pdf_document.export_text`) | ⚠️ discreto/buono (array annidati con `items`; schema ricchi ma da testare con client strict su payload tabellari) | Ora espone resources native per artifact (`resources/list`, `resources/read`) con template URI `artifact://office/{year}/{month}/{artifact_id}` e fallback metadata per artifact non testuali; il prompt `ingest_pdf_into_docs` rende esplicito il bridge operativo verso `docs-node`. |
| `sql-node` | ✅ | ❌ | ❌ (nessun handler prompt) | ❌ | ❌ | `Server` low-level (`setRequestHandler`) | ✅ forte (`query/schema/explain`) | ✅ richiesto | ❌ | ✅ buono (input minimali; error path con `isError`) | Solido per host severi; nessun supporto nativo resources/prompts per metadata DB. |
| `mantis-node` | ✅ | ❌ | ❌ (nessun handler prompt) | ❌ | ❌ | `Server` low-level (`setRequestHandler`) | ⚠️ misto (presente su alcuni tool, non tutti) | ✅ richiesto | ✅ opzionale (`attachments` download) | ✅ buono (schema espliciti, enum dove usato) | Generalmente compatibile; naming e shape eterogenei tra tool (condensazione non uniforme). |
| `cf-node` | ✅ | ❌ | ❌ (nessun handler prompt) | ❌ | ❌ | `Server` low-level (`setRequestHandler`) | ✅ forte (tool condensato con enum) | ✅ richiesto | ❌ | ✅ buono (schema lineare e chiaro) | Compatibile per host severi; dipende da bridge esterno CF ma superficie MCP e' semplice. |
| `playwright-node` | ✅ | ❌ | ❌ (nessun handler prompt) | ❌ | ❌ | `Server` low-level (`setRequestHandler`) | ❌ (tool granulari, no enum `action`) | ❌ | ⚠️ non standard (usa `path` su screenshot, non `save_path`) | ⚠️ discreto (schema semplici ma numerosi; approccio non condensato) | Compatibilita' generalmente buona, ma forte cardinalita' tool e output screenshot base64 possono peggiorare UX/token in alcuni host. |
| `linter-node` | ✅ | ❌ | ❌ (nessun handler prompt) | ❌ | ❌ | `Server` low-level (`setRequestHandler`) in TS compilato | ❌ (tool separati) | ⚠️ opzionale (solo `lint_code`) | ❌ | ✅ buono (schema essenziali e stabili) | Buona compatibilita' di base; manca condensazione `action` e feature MCP moderne. |

## Criteri usati per la compilazione

1. Presenza capability MCP valutata cercando handler espliciti (`ListToolsRequestSchema`, `ListResourcesRequestSchema`, `ListPromptsRequestSchema`) nei file server.
2. Pattern API classificato come "low-level" quando il server usa `new Server(...)` + `setRequestHandler(...)`.
3. `action` / `project_path` / `save_path` classificati dal relativo `inputSchema` e dalla gestione in `CallTool`.
4. "Schema hygiene" e' una valutazione statica preliminare (qualitativa), non sostituisce smoke test runtime su host specifici.

## Nota operativa

Questa tabella resta una baseline utile per pianificare milestone incrementalmente (es. `git-node` pilot modernizzazione, `docs-node` resource-native, `office-node` hardening schema-compatibility).
