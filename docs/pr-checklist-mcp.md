# PR Checklist MCP (Obbligatoria)

Usare questa checklist in ogni PR che modifica server MCP, tool schema, skill o documentazione collegata.

## Check obbligatori

- [ ] **Compatibilita' backward dei tool name**: i nomi dei tool esistenti restano invariati (salvo migrazione esplicita e documentata).
- [ ] **Validazione schema input**: ogni campo `type: "array"` dichiara sempre `items` (anche per array annidati).
- [ ] **Aggiornamento test e documentazione**: i test/smoke test rilevanti sono aggiornati ed e' stata aggiornata la documentazione locale.
- [ ] **Check JSON eval skill**: eseguire `node scripts/check-skill-evals-json.js` e verificare che tutti i `skills/*/evals/evals.json` siano JSON validi.
- [ ] **Verifica doc-driven agenti Codex**: eseguire `node scripts/check-codex-agents-doc.js` per confermare agenti presenti, ruoli non generici, regole di parallelismo/profondita' e compatibilita' analyst/orchestrator.
- [ ] **Verifica fallback/compatibilita' I/O**: `project_path` resta disponibile come fallback e `save_path` continua a funzionare senza regressioni.
- [ ] **Rischio compatibilita' cross-host**: la PR indica esplicitamente il rischio/impatto su Codex, Copilot e client MCP con validazione schema severa.
- [ ] **Nota riavvio server**: quando cambia codice MCP, la PR include una nota esplicita che richiede il riavvio del server.

## Nota operativa consigliata nella PR

Aggiungere una sezione breve, per esempio:

- **Compatibilita'**: Nessuna rottura backward dei tool name / oppure migrazione documentata.
- **Cross-host risk**: Basso/Medio/Alto + motivazione.
- **Restart richiesto**: Sì/No (Sì se e' cambiato codice MCP).
