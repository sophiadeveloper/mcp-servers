# Playwright MCP - Piano tecnico breve (Phase 1)

## Obiettivo
Introdurre in modo incrementale 2 tool condensati con pattern `action`:

- `browser_session`
- `browser_interact`

senza rimuovere i tool legacy e senza refactor big-bang.

## Scope della prima PR
Questa PR copre **solo design + adapter**:

1. aggiunta dei due nuovi tool in `tools/list`;
2. routing adapter `tool/action -> tool legacy` in `callTool`;
3. mapping inverso documentato nel codice (`legacy -> condensed/action`), utile per deprecazione graduale;
4. output strutturato **progressivo** per i soli ingressi condensati.

## Compatibilità garantita
- I tool legacy restano disponibili e invariati dal punto di vista del chiamante.
- Le operazioni reali continuano ad essere eseguite dalla logica legacy (`executeLegacyTool`), quindi il rischio regressione è ridotto.
- Il nuovo output strutturato viene aggiunto senza eliminare `content` testuale legacy.

## Mapping iniziale
### `browser_session` actions
- `navigate` -> `browser_navigate`
- `get_dom` -> `browser_get_dom`
- `screenshot` -> `browser_screenshot`
- `evaluate_js` -> `browser_evaluate_js`
- `annotate` -> `browser_annotate`
- `click_by_id` -> `browser_click_by_id`
- `export_state` -> `browser_export_state`
- `load_state` -> `browser_load_state`
- `get_network_errors` -> `browser_get_network_errors`
- `get_console_logs` -> `browser_get_console_logs`
- `switch_tab` -> `browser_switch_tab`
- `list_frames` -> `browser_list_frames`
- `select_frame` -> `browser_select_frame`
- `read_downloaded_file` -> `browser_read_downloaded_file`

### `browser_interact` actions
- `click` -> `browser_click`
- `fill` -> `browser_fill`
- `scroll` -> `browser_scroll`
- `hover` -> `browser_hover`
- `press_key` -> `browser_press_key`

## Output strutturato (progressive rollout)
Per invocazioni condensate viene aggiunto un blocco `structuredContent` con:

- `schemaVersion`
- `status`
- `adapter.entryTool`
- `adapter.action`
- `adapter.legacyTool`
- `message`

I tool legacy continuano a rispondere come prima (solo `content`), per evitare breaking changes immediate.

## Step successivi (fuori scope PR1)
1. Estendere `structuredContent` anche ai tool legacy (opt-in o graduale).
2. Introdurre hint di deprecazione soft nei tool legacy.
3. Aggiornare test smoke/e2e su entrambe le interfacce.
4. Solo dopo stabilizzazione, valutare eventuale rimozione dei tool legacy.
