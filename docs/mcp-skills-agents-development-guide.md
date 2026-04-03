# MCP / Skills / Agents Development Guide (viva)

Versione: 2026-04-03  
Stato: **fonte di verita' attiva** per lo sviluppo futuro nel branch `rework`.

Questa guida sostituisce l'uso operativo della vecchia spec ibrida e separa in modo netto:

- linee guida vive (questo documento);
- storico milestone completate (`docs/completed-milestones-mcp-skills.md`);
- roadmap futura residua (Milestone 7/8+), con sintesi qui e dettaglio in `docs/future-backlog-mcp-skills.md`.

## 1) Ambito e obiettivo

Obiettivo: mantenere evolvibile l'ecosistema MCP/Skills/Agents senza rumore storico, preservando compatibilita' con host/client MCP severi (Codex, Copilot VS Code e equivalenti).

Guardrail permanenti:

1. compatibilita' legacy prima del refactor esteso;
2. cambi incrementali (una milestone/PR per volta);
3. no riscritture monolitiche fuori scope;
4. aggiornamento coerente di codice, test/smoke e documentazione.

## 2) Architettura viva (MCP + Skills + Agents)

### 2.1 Ruoli

- **Server MCP**: espongono tool/resources/prompts con schema robusti.
- **Skills**: workflow procedurali portabili, con trigger chiari.
- **Agenti `.codex/agents/`**: profili operativi di esecuzione (discovery, implementazione, analisi tecnica).

### 2.2 Routing canonico

- Task analitico multi-sorgente -> `mcp-technical-analyst`.
- Task multi-fase di coordinamento -> `mcp-master-orchestrator`.
- Task mono-dominio -> skill specialistica o server MCP dedicato.

### 2.3 Distinzioni obbligatorie

- `mcp-master-orchestrator` coordina; non sostituisce intake analitico.
- `mcp-technical-analyst` gestisce intake multi-sorgente; non sostituisce skill esecutive.
- Le skill specialistiche eseguono dominio e raccolta evidenze mirate.

## 3) Convenzioni obbligatorie di compatibilita'

1. preservare pattern consolidati: `action`, `project_path`, `save_path` (salvo eccezioni motivate);
2. se introduci `roots`, mantenere fallback `project_path`;
3. se introduci resources/artifact URI, mantenere comportamento legacy quando richiesto;
4. input schema MCP compatibili con client strict;
5. ogni nodo schema con `type: "array"` deve dichiarare `items`.

## 4) Policy MCP (tools/resources/prompts/artifacts)

### 4.1 Tool

- preferire output duale: `content` breve + `structuredContent` stabile;
- separare chiaramente tool read-only da write-capable con annotations/hint coerenti;
- evitare shape ambigue negli input schema.

### 4.2 Resources e artifacts

- esporre resources quando il contenuto e' navigabile/riusabile;
- usare URI stabili e parseabili (`docs://...`, `artifact://...`);
- evitare blob/base64 lunghi in `content`, salvo necessita' esplicita.

### 4.3 Prompts MCP

- usare prompt per discoverability e kickoff rapidi;
- non sostituire forzatamente le skill nei workflow complessi;
- documentare sempre fallback skill equivalente.

Regola pratica: prompt MCP per ingresso rapido, skill per orchestrazione robusta e portabile.

## 5) Host/client compatibility discipline

Requisiti minimi per modifiche MCP:

- `tools/list` e schema input validabili da host severi;
- fallback documentati per feature MCP non uniformemente supportate;
- esplicitazione rischio cross-host in PR (`Basso/Medio/Alto` + motivazione).

Riferimenti operativi:

- `docs/server-capability-matrix.md`
- `docs/pr-checklist-mcp.md`

## 6) Test strategy e review discipline

Per ogni server/skill modificato:

1. smoke test/initialize + caso felice + caso errore;
2. validazione schema input (incluso controllo array/items);
3. aggiornamento test/eval/documentazione locale;
4. checklist PR compilata.

Per skill core:

- trigger correctness (corretto/mancato/abuso);
- routing correctness (analyst vs orchestrator vs specialistico);
- output verificabile con separazione fatti/inferenze/punti aperti dove previsto.

## 7) Evoluzione operativa

### 7.1 Nuovi server MCP

Processo consigliato:

1. capability baseline + rischio compatibilita';
2. design schema tool/resources/prompts con fallback legacy;
3. smoke + test schema + docs locali;
4. aggiornamento capability matrix e PR checklist evidence.

### 7.2 Evoluzione skill esistenti

- `SKILL.md` breve e triggerabile;
- dettagli estesi in `references/`;
- `scripts/` dove la procedura e' deterministica/ripetitiva;
- eval minimi per skill ad alto uso.

### 7.3 Nuovi profili in `.codex/agents/`

- profili stretti e non generici;
- confini anti-overlap espliciti;
- limiti di parallelismo/profondita' dichiarati;
- coerenza con routing skill (analyst/orchestrator/specialistiche).

Riferimento locale: `.codex/agents/README.md`.

## 8) Backlog futuro residuo (attivo)

Questa guida considera **attivo** solo il backlog post-M6:

- **Milestone 7**: `projectfs-node` read-only, whitelist-constrained, cross-platform, con test di sicurezza/containment.
- **Milestone 8**: packaging/distribuzione e razionalizzazione configurazioni host-specifiche.

Dettaglio operativo futuro:

- `docs/future-backlog-mcp-skills.md`

Il dettaglio storico M0-M6 e' stato spostato in:

- `docs/completed-milestones-mcp-skills.md`

## 9) Mappa documentale minima

- Guida viva: `docs/mcp-skills-agents-development-guide.md`
- Storico milestone completate: `docs/completed-milestones-mcp-skills.md`
- Backlog futuro (dettaglio M7/M8): `docs/future-backlog-mcp-skills.md`
- Capability matrix server: `docs/server-capability-matrix.md`
- Governance matrix skill: `docs/skill-governance-matrix.md`
- PR checklist: `docs/pr-checklist-mcp.md`
- Regole concise di ingaggio: `AGENTS.md`
- Profili agenti Codex: `.codex/agents/README.md`
