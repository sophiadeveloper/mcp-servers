# AGENTS.md - Governance minima (Milestone 0)

Questo file contiene **solo regole permanenti concise** e routing essenziale.
I dettagli operativi estesi sono nella guida viva:

- `docs/mcp-skills-agents-development-guide.md`
- storico milestone completate: `docs/completed-milestones-mcp-skills.md`
- backlog futuro (dettaglio M7/M8): `docs/future-backlog-mcp-skills.md`
- skill locali in `skills/` (+ eventuale documentazione locale dei server)

## 1) Priorita' e modalita' operative

1. Applica prima questo file, poi la guida tecnica viva e le skill rilevanti.
2. Mantieni compatibilita' legacy salvo istruzioni esplicite contrarie.
3. Preferisci cambi incrementali, una milestone/PR per volta.
4. Non fare refactor estesi fuori scope.
5. Aggiorna in modo coerente codice, test/smoke e documentazione.

## 2) Routing essenziale delle skill

- **Analisi tecnica multi-sorgente** (ticket + doc + commit + allegati + correlazioni): usa prima `skills/mcp-technical-analyst/`.
- **Task multi-fase di coordinamento**: usa prima `skills/mcp-master-orchestrator/`.
- **Task esecutivo di dominio**: usa prima la skill specialistica o il server MCP dedicato.
- Mantieni `AGENTS.md` sintetico: non duplicare contenuti lunghi delle skill.

## 3) Guardrail permanenti di compatibilita'

- Non rompere senza motivo forte i pattern consolidati: `action`, `project_path`, `save_path`.
- Se introduci `roots`/artifacts/resources, mantieni fallback e comportamento legacy.
- Gli input schema devono restare compatibili con client MCP severi (Codex, Copilot VS Code, host equivalenti).
- Ogni nodo schema con `type: "array"` deve dichiarare `items`.

## 4) Done minimo per modifiche MCP/skill

Una modifica e' chiusa quando:

- comportamento richiesto implementato;
- compatibilita' legacy preservata (se non diversamente richiesto);
- smoke test e schema check eseguiti;
- documentazione locale aggiornata;
- se cambia codice server MCP, informare l'utente che serve riavvio server.

## 5) Dove trovare il dettaglio esteso

Per standard completi (policy MCP, sicurezza, output strutturati, backlog futuro, checklist PR, test strategy), fare riferimento alla guida viva:

- `docs/mcp-skills-agents-development-guide.md`
