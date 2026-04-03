# Skill governance matrix (principali)

Questa matrice sintetizza lo stato delle skill principali richieste per Milestone 0, con focus su:

- precisione dei trigger;
- separazione tra contenuti core (`SKILL.md`) e approfondimenti (`references/`);
- supporto script operativo;
- copertura eval;
- confini con `mcp-master-orchestrator` e `mcp-technical-analyst`.

Scala usata:

- **Alto**: requisito chiaramente coperto e verificabile nel repository.
- **Medio**: copertura presente ma non completa o non formalizzata in test/eval.
- **Basso**: copertura assente o solo implicita.

## Matrice

| Skill | Trigger precisione | Separazione core/references | Script support | Eval coverage | Confini con orchestrator/analyst |
| --- | --- | --- | --- | --- | --- |
| `mcp-technical-analyst` | **Alto** — trigger espliciti per intake multi-sorgente e anti-trigger mono-dominio. | **Alto** — `SKILL.md` snello con rimandi multipli a `references/`. | **Basso** — nessuna cartella `scripts/` locale. | **Alto** — presente `evals/evals.json` dedicato. | **Alto** — confini dichiarati: primario su analisi multi-sorgente; non sostituisce specialistici operativi. |
| `mcp-master-orchestrator` | **Alto** — regole di routing e tabella "Se devi..." molto esplicite. | **Alto** — runbook/checklist demandati a `references/`. | **Basso** — nessuna cartella `scripts/` locale. | **Alto** — presente `evals/evals.json` su routing analyst/specialistico e uso sidecar per fase. | **Alto** — boundary forte: coordina, delega intake analitico a `mcp-technical-analyst`. |
| `mcp-git-mantis-workflow` | **Medio** — trigger pratici chiari ma meno formalizzati rispetto a analyst/orchestrator. | **Alto** — pattern aggiuntivi in `references/handoffs-and-conflicts.md`. | **Basso** — nessuna cartella `scripts/` locale. | **Alto** — presente `evals/evals.json` dedicato a preflight/rebase/conflict/verification. | **Medio** — confine dichiarato: per sintesi multi-sorgente passa a `mcp-technical-analyst`. |
| `mcp-docs-navigator` | **Medio** — trigger orientati a navigazione docs, con escalation esplicita se serve correlazione multi-sorgente. | **Alto** — strategie operative spostate in references dedicate. | **Basso** — nessuna cartella `scripts/` locale. | **Basso** — non risultano eval dedicati. | **Medio** — confine definito verso `mcp-technical-analyst` su task cross-sorgente. |
| `mcp-database-expert` | **Medio** — trigger coerenti con dominio SQL/reporting. | **Medio** — reference presente ma meno articolata. | **Basso** — nessuna cartella `scripts/` locale. | **Basso** — non risultano eval dedicati. | **Medio** — confine implicito con orchestrator/analyst tramite routing per task composti. |
| `mcp-coldfusion-developer` | **Medio** — trigger tecnici concreti (bridge, linter, pattern override) ma senza matrice trigger formale. | **Alto** — checklist/pattern operativi in references. | **Basso** — nessuna cartella `scripts/` locale. | **Basso** — non risultano eval dedicati. | **Medio** — skill esecutiva; passa a analyst quando il task diventa multi-sorgente. |
| `mcp-office-expert` | **Medio** — trigger ben centrati su documenti Office e conversioni. | **Alto** — dettagli operativi in references. | **Basso** — nessuna cartella `scripts/` locale. | **Basso** — non risultano eval dedicati. | **Medio** — confine esplicito: se il documento e solo innesco di indagine tecnica, usare analyst. |
| `mcp-browser-automation` | **Medio** — trigger utili su test browser/automazione con riferimenti pratici. | **Alto** — pattern test in references dedicate. | **Basso** — nessuna cartella `scripts/` locale. | **Basso** — non risultano eval dedicati. | **Medio** — confine operativo: usare orchestrator quando il flusso include dipendenze multi-skill. |

## Lettura rapida dei gap trasversali

1. **Eval coverage in consolidamento**: suite esplicita ora presente per `mcp-technical-analyst`, `mcp-master-orchestrator` e `mcp-git-mantis-workflow`; restano scoperte altre skill esecutive.
2. **Script support uniforme ma debole**: le skill principali non espongono `scripts/` locali.
3. **Boundary analyst/orchestrator ben presidiato**: i due skill core hanno confini reciproci espliciti e coerenti.

## Criteri di routing verificabili (Milestone 0)

Per considerare "verificabile" il routing tra skill core devono risultare tutti i punti:

1. `mcp-technical-analyst` dichiara criteri **pass/fail** per intake multi-sorgente e anti-trigger mono-dominio.
2. `mcp-master-orchestrator` dichiara gate di routing con regola esplicita "coordinatore, non intake universale".
3. Entrambe le skill espongono **stop conditions** e direzioni di escalation (verso analyst, specialistico o utente).
4. La checklist orchestrator include campi `PASS/FAIL` per audit veloce durante handoff/review.

## Backlog minimo consigliato

- Introdurre `evals/` minimi per almeno 2 skill esecutive aggiuntive ad alto uso (oltre al filone Git/Rebase).
- Aggiungere micro-script opzionali (`scripts/`) per checklist ripetitive dove utile (es. preparazione input, validazioni rapide).
- Formalizzare un punteggio di trigger precisione (es. 1-5) per ridurre soggettivita' tra review successive.
