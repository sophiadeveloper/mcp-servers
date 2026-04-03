# Rebase Playbook

Checklist operativa per rebase tracciabili tra `git-node` e Mantis.

## 1) Rebase Preflight

Prima di avviare un rebase:

1. Verifica stato working tree con `git_query` `action: "status"`.
2. Verifica il branch di partenza **senza** usare `current_branch`: usa la sequenza supportata `git_query` `action: "status"` (campo branch) + conferma con `git_query` `action: "history"` oppure `git_query` `action: "repo_info"`.
3. Acquisisci baseline commit (HEAD corrente + target base) con `git_query` `action: "history"`.
4. Conferma relazione di ancestry dove rilevante (`git_query` `action: "check_ancestor"`).
5. Se il branch e condiviso o ad alto rischio, annota nel ticket Mantis la finestra operativa prevista.

Output minimo consigliato nel log/nota:

* branch corrente
* commit HEAD pre-rebase
* branch/commit di destinazione
* eventuali file locali non tracciati o modificati

## 2) Semantic Conflicts (oltre al conflitto testuale)

Anche quando Git non segnala conflitti, verifica possibili conflitti semantici:

* **Contract/API drift**: firme o payload cambiati in modo compatibile sintatticamente ma incompatibile a runtime.
* **Behavior drift**: logica equivalente nel diff ma ordine di esecuzione o side effect diversi.
* **Data/SQL drift**: query ancora valide ma semanticamente errate rispetto a schema/migrazioni correnti.
* **Config/feature flag drift**: default o toggle cambiati che alterano comportamento.
* **Doc/Test drift**: test o documentazione non piu allineati alla serie rebased.

Per ridurre rischio:

1. usa `git_diff` `action: "range_diff"` su serie originale vs rebased;
2. isola commit con delta sospetto (`only_left`/`only_right` o patch molto diversa);
3. fai handoff alla skill di dominio (SQL/CFML/UI) quando il conflitto e logico e non solo sintattico;
4. registra nel ticket decisioni e tradeoff non ovvi.

## 3) Post-Rebase Verification

Dopo il rebase, completa verifiche minime prima di dichiarare equivalenza:

1. `git_query` `action: "status"` deve risultare pulito (salvo modifiche intenzionali).
2. `git_query` `action: "history"` per confermare nuova linearizzazione.
3. `git_diff` `action: "range_diff"` tra serie pre e post rebase.
4. Smoke test locali o check rapidi applicabili al dominio toccato.
5. Aggiornamento nota Mantis con:
   * nuovo HEAD
   * esito range-diff
   * test/check eseguiti
   * eventuali rischi residui.

## 4) Stop Condition per Review Umana

Interrompi automazione e richiedi review umana quando si verifica almeno una condizione:

* `range_diff` mostra divergenze sostanziali non spiegabili rapidamente.
* conflitti su aree critiche (migrazioni DB, sicurezza, billing, autorizzazioni, data-loss risk).
* non e possibile provare equivalenza comportamentale con test/smoke disponibili.
* rebase coinvolge commit di piu autori con intenzioni in conflitto.
* il ticket Mantis contiene requisiti ambigui o contraddittori rispetto al codice reale.

Formato consigliato per escalation nel ticket:

* **Motivo stop**: perche il flusso automatico non e affidabile.
* **Evidenza**: commit/range/file coinvolti.
* **Decisione richiesta**: cosa deve confermare il reviewer umano.
* **Impatto temporale**: blocco totale o parziale del delivery.
