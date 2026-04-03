# Storico milestone completate (MCP / Skills / Agents)

Versione: 2026-04-03  
Stato: documento storico sintetico (non backlog attivo).

Questo file conserva la memoria architetturale delle Milestone 0–6, gia' completate o sostanzialmente completate nel branch `rework`, senza riproporle come piano operativo corrente.

## Milestone 0 — Baseline governance e compatibilita'

**Scopo originario**  
Creare guardrail comuni, baseline capability e criteri minimi di qualita' per evolvere il repo in modo incrementale.

**Deliverable principali**
- spec tecnica iniziale e governance minima in `AGENTS.md`;
- capability matrix server MCP;
- skill governance matrix;
- PR checklist obbligatoria;
- controlli di coerenza documentale/eval.

**Esito sintetico**  
Raggiunto: il repository ha baseline e regole trasversali verificabili, con focus su compatibilita' schema e disciplina PR.

**Nota storica utile**  
M0 ha fissato il principio "compatibilita' prima della purezza" e il vincolo `array -> items` per host MCP strict.

---

## Milestone 1 — Pilot modernizzazione `git-node`

**Scopo originario**  
Introdurre miglioramenti MCP moderni in un server pilota senza rompere API/tool legacy.

**Deliverable principali**
- rafforzamento output strutturato e metadati operativi;
- estensioni diagnostiche Git/rebase;
- mantenimento del trio tool consolidato.

**Esito sintetico**  
Sostanzialmente raggiunto: `git-node` e' base pilota per compatibilita' + arricchimento semantico.

**Nota storica utile**  
L'approccio pilot-first ha ridotto rischio di regressione prima di estendere pattern agli altri server.

---

## Milestone 2 — `docs-node` resource-native

**Scopo originario**  
Portare `docs-node` oltre il modello tools-only, introducendo resources/templates con URI stabili.

**Deliverable principali**
- navigazione documentale via resources;
- mapping stabile risultati ricerca <-> URI;
- preservazione dei tool legacy di ricerca/scansione.

**Esito sintetico**  
Raggiunto: `docs-node` e' il primo server resource-centric nel rework.

**Nota storica utile**  
La convenzione URI documentale ha migliorato riuso e citabilita' machine-friendly.

---

## Milestone 3 — `office-node` artifact resources + hardening schema

**Scopo originario**  
Evolvere il pattern `save_path` verso artifact resources senza perdere fallback locale.

**Deliverable principali**
- introduzione `resource_link` sugli export rilevanti;
- convenzioni `artifact://...`;
- hardening schema (inclusi payload annidati/tabellari).

**Esito sintetico**  
Sostanzialmente raggiunto: `office-node` combina salvataggio legacy e accesso artifact-oriented.

**Nota storica utile**  
Questa milestone ha reso esplicita la strategia "compatibilita' + modernizzazione progressiva" su output ricchi.

---

## Milestone 4 — Prompt MCP dai workflow principali

**Scopo originario**  
Rendere discoverable i workflow frequenti via prompt MCP, mantenendo fallback skill.

**Deliverable principali**
- introduzione prompt implementati nei server target;
- distinzione prompt-first, hybrid, skill-first;
- regola esplicita di non comprimere il ragionamento analyst in prompt monolitici.

**Esito sintetico**  
Raggiunto in forma selettiva: prompt utili introdotti dove adatti, con separazione chiara rispetto alle skill.

**Nota storica utile**  
M4 ha codificato il principio operativo: prompt per ingresso rapido, skill per robustezza cross-host.

---

## Milestone 5 — Skill modernization + eval

**Scopo originario**  
Rendere le skill principali piu' modulari, misurabili e con confini verificabili.

**Deliverable principali**
- trigger/description ripuliti;
- maggiore uso di `references/`;
- eval suite dedicate per skill core;
- confini rinforzati tra analyst, orchestrator e skill specialistiche.

**Esito sintetico**  
Sostanzialmente raggiunto: governance skill piu' auditabile e meno ambigua sul routing.

**Nota storica utile**  
La separazione analyst/orchestrator e' diventata vincolo strutturale e non solo convenzione narrativa.

---

## Milestone 6 — `.codex/agents/` e workflow disciplinati

**Scopo originario**  
Introdurre profili agentici operativi non generici, con limiti di uso chiari.

**Deliverable principali**
- baseline profili agenti (`explorer`, `implementer`, `technical_analyst`);
- README con regole di ingaggio e anti-overlap;
- allineamento ai confini con skill core.

**Esito sintetico**  
Raggiunto: struttura agentica disponibile e coerente con governance skill.

**Nota storica utile**  
M6 consolida l'approccio "ruoli stretti + delega esplicita" per ridurre drift operativo.

---

## Sintesi finale dello storico M0-M6

- Le milestone 0–6 hanno stabilizzato governance, compatibilita' e routing.
- Il backlog attivo resta concentrato sul post-rework (M7/M8+).
- Le decisioni storiche rilevanti sono mantenute qui per tracciabilita', evitando rumore nella guida viva.
