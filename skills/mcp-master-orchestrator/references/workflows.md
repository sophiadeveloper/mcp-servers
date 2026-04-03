# Workflows

Usa questo riferimento quando il task richiede una sequenza esplicita di piu skill.

## Tabella decisionale rapida: prompt MCP vs skill

| Caso | Prompt MCP | Skill |
| --- | --- | --- |
| Workflow ricorrente, breve e standard | Prima scelta per avvio rapido nel client | Opzionale come fallback |
| Analisi multi-sorgente con evidenze eterogenee | Solo kickoff/brief iniziale | Prima scelta: `mcp-technical-analyst` |
| Task multi-fase con dipendenze tra domini | Utile come ingresso guidato | Prima scelta: `mcp-master-orchestrator` + skill sidecar |
| Task mono-dominio (DB, docs, browser, office, CF) | Utile se il caso e' semplice e ripetibile | Prima scelta: skill specialistica |
| Supporto client MCP parziale/non uniforme | Non usarlo come unico canale | Mantieni sempre il percorso skill completo |

Regola pratica: prompt MCP per discoverability e start rapido; skill per esecuzione completa, portabile e verificabile.

## Prompt di orchestrazione subagent (explorer vs implementer)

Usa questo blocco quando devi orchestrare subagent custom (`explorer`, `implementer`) in task complessi.

### Quando usare `explorer`

Usa `explorer` per fasi di **ricognizione e riduzione incertezza**, senza cambiare codice:

1. mappatura rapida di repository, moduli, dipendenze o capability MCP;
2. confronto tra fonti (ticket/docs/commit/log) per definire il perimetro;
3. preparazione piano operativo con rischi, gap e ipotesi verificabili.

Evita `explorer` se la fase richiede gia' una modifica concreta: in quel caso passa a `implementer`.

### Quando usare `implementer`

Usa `implementer` per fasi di **esecuzione controllata**:

1. modifica incrementale di codice/config/documentazione;
2. test/smoke/check locali legati alla modifica;
3. preparazione evidenze di output (diff, log test, note di validazione).

Evita `implementer` per intake ambiguo o analisi cross-sorgente incompleta: prima chiudi una fase `explorer` o passa da `mcp-technical-analyst`.

### Limiti di parallelismo (max agenti per fase)

Per contenere rumore e conflitti, applica limiti fissi:

- fase di discovery (`explorer`): **max 2 agenti paralleli**;
- fase di implementazione (`implementer`): **max 1 agente attivo** sullo stesso `project_path`;
- fase di validazione/report: **max 2 agenti paralleli** (es. test + packaging evidenze), solo dopo freeze delle modifiche.

Se una fase supera questi limiti, spezzala in sotto-fasi sequenziali con handoff esplicito.

### Limite profondita' handoff/escalation

Imposta un tetto per evitare loop di delega:

- profondita' massima consigliata: **2 livelli** oltre l'orchestrator (es. orchestrator -> explorer -> specialistico);
- al terzo handoff consecutivo senza decisione operativa, fermati e riesegui triage;
- non fare ping-pong tra `explorer` e `implementer` piu' di **1 volta** sullo stesso sotto-task senza nuova evidenza.

### Stop conditions per fallback umano

Attiva fallback umano (reviewer/owner) quando si verifica almeno una condizione:

1. conflitto critico tra evidenze che resta irrisolto dopo 1 ciclo explorer+implementer;
2. impatto potenzialmente distruttivo o non reversibile (dati, sicurezza, compliance) senza guardrail verificabili;
3. blocco su prerequisiti esterni non accessibili localmente (permessi, segreti, ambiente, ticket incompleto);
4. superamento dei limiti: >2 agenti richiesti nella stessa fase o profondita' handoff >2.

Nel fallback umano, consegna sempre:

- stato corrente (fatti verificati);
- opzioni decisionali mutuamente esclusive;
- raccomandazione motivata e rischio residuo.

## Analisi Tecnica Multi-Sorgente

1. `mcp-technical-analyst`: imposta intake, fonti, deliverable e gap aperti.
2. `mcp-git-mantis-workflow`: leggi ticket, note, allegati e commit correlati.
3. `mcp-docs-navigator`: recupera documentazione interna e shelf rilevanti.
4. `mcp-database-expert`: verifica schema e dati reali sugli ambienti necessari.
5. `mcp-coldfusion-developer`: controlla codice CFML e log applicativi se il dominio lo richiede.
6. `mcp-browser-automation`: usa Playwright solo se serve una prova funzionale o browser-side.
7. `mcp-docs-navigator`: indicizza i documenti finali se devono restare ricercabili.

### Variante Di Avvio Rapido Da Ticket

Quando l'utente chiede un kickoff breve:

1. `mcp-technical-analyst` in modalita `ticket-first-light`: snapshot iniziale, evidenze, inferenze e punti aperti prioritari.
2. Se il quadro resta semplice, chiudi con raccomandazioni operative minime.
3. Se emergono dipendenze multi-sorgente, scala al flusso completo `mcp-technical-analyst` (`ticket-first`) e continua la sequenza standard.

## Fix Regressione Con Effetto Su DB E UI

1. `mcp-docs-navigator`: recupera documentazione e tag rilevanti.
2. `mcp-git-mantis-workflow`: leggi ticket, allegati e commit storici.
3. `mcp-database-expert`: verifica schema e dati correnti.
4. `mcp-coldfusion-developer`: controlla lint e log applicativi.
5. Applica la fix.
6. `mcp-browser-automation`: esegui validazione E2E.
7. `mcp-docs-navigator`: aggiorna o indicizza la documentazione cambiata.
8. `mcp-git-mantis-workflow`: lascia nota finale con prove e file prodotti.

## Generare Report Mensile

1. `mcp-docs-navigator`: cerca definizioni del report, periodo, KPI e naming.
2. `mcp-database-expert`: esegui query e salva eventuali risultati intermedi.
3. `mcp-office-expert`: crea Excel e, se richiesto, documento Word con commento sintetico.
4. `mcp-docs-navigator`: indicizza il report o il riepilogo se deve restare ricercabile.
5. `mcp-git-mantis-workflow`: allega o annota il deliverable se nasce da ticket.

## Onboarding Di Un Nuovo Modulo CF

1. `mcp-docs-navigator`: leggi analisi, procedure, naming e dipendenze del modulo.
2. `mcp-git-mantis-workflow`: identifica ticket, baseline e file toccati storicamente.
3. `mcp-coldfusion-developer`: implementa e valida il codice CFML.
4. `mcp-database-expert`: verifica dati o schema se il modulo ne dipende.
5. `mcp-browser-automation`: prova login, navigazione e form principali.
6. `mcp-docs-navigator`: aggiorna guide e tag del nuovo materiale.
