# Specifica tecnica per Codex — potenziamento MCP + Skills nel repository `sophiadeveloper/mcp-servers`

Versione: 2026-03-30
Target: Codex CLI / IDE extension / Codex app
Ambito: evoluzione incrementale dell'ecosistema MCP + skills per sviluppo agentico
Lingua operativa: italiano

## 1. Obiettivo del documento

Questo documento e' il **brief tecnico operativo per Codex** da usare come fonte di verita' per pianificare e implementare i potenziamenti architetturali del repository `sophiadeveloper/mcp-servers`.

L'obiettivo non e' riscrivere il progetto da zero, ma **farlo evolvere da toolbox MCP locale a piattaforma agentica piu' matura**, mantenendo la compatibilita' con l'approccio gia' in uso:

- tool condensati con parametro `action`
- `project_path` come contesto esplicito
- pattern `save_path` per evitare token bloat
- skill specialistiche di dominio
- orchestrazione multi-step tra Git, docs, database, browser, Office e ColdFusion

Questa versione aggiorna la spec per riflettere un cambiamento architetturale gia' visibile nel repo: **`mcp-technical-analyst` e' ora la skill primaria per intake analitico multi-sorgente**, mentre `mcp-master-orchestrator` e' il coordinatore generale dei workflow complessi.

## 2. Come usare questo documento in Codex

### Modalita' consigliata

1. Mantieni questo file in `docs/` oppure nella root del repository.
2. Inserisci in `AGENTS.md` solo una **versione corta** delle regole operative e un riferimento esplicito a questo documento.
3. Chiedi a Codex di lavorare **per milestone o per PR singola**, non su tutto il piano in una volta sola.
4. Per ogni milestone, chiedi a Codex di:
   - proporre file da toccare
   - esplicitare rischi di compatibilita'
   - implementare test e smoke test
   - aggiornare la documentazione locale

### Prompt iniziale consigliato per Codex

```text
Leggi AGENTS.md e poi leggi docs/codex_mcp_skills_enhancement_spec.md.
Lavora solo sulla milestone richiesta.
Non fare refactor estesi fuori scope.
Mantieni la compatibilita' dei tool esistenti, salvo diversa istruzione.
Prima di modificare codice MCP, esplicita:
1) capability attuali
2) capability target
3) file toccati
4) test che aggiungerai o aggiornerai.
Se il task e' analitico e parte da ticket, documento, allegato, commit o fonti miste,
valuta prima la skill `mcp-technical-analyst`.
```

## 3. Contesto corrente del repository

Il repository contiene gia' un insieme coerente di server MCP locali e skill di dominio. Lo stato di partenza, in termini architetturali, puo' essere sintetizzato cosi':

- esistono server locali per Git, SQL, Mantis, ColdFusion, Playwright, documentazione e Office/PDF
- `AGENTS.md` impone una **Strategia di Condensazione**: pochi tool ad alto livello, con `action` enum e `project_path` quasi sempre obbligatorio
- `AGENTS.md` codifica anche il pattern `save_path` per evitare di restituire blob o testi lunghi nel `content`
- i server sono prevalentemente esposti come **tool MCP** con orientamento locale/stdio
- nelle skill custom esiste gia' una chiara distinzione fra coordinamento generale e skill operative di dominio

### 3.1 Cambiamento architetturale da recepire

Il repository ha introdotto una skill che cambia il modello di routing dei task complessi:

- `mcp-technical-analyst` serve per analisi tecniche multi-sorgente che partono da ticket, documenti, allegati, commit o fonti miste
- non sostituisce gli skill specialistici; li coordina quando il task richiede raccolta prove, ricostruzione del contesto e produzione di deliverable finali
- il suo contratto di lavoro separa esplicitamente `evidenza osservata`, `inferenza` e `punto aperto`
- il suo output di default e' uno o piu' documenti `.md` riusabili
- `mcp-master-orchestrator` ora la riconosce come entry point raccomandato per l'analisi tecnica multi-sorgente

### 3.2 Implicazione per questa roadmap

Da questo momento, la roadmap deve distinguere chiaramente:

- **skill di coordinamento generale**: `mcp-master-orchestrator`
- **skill di intake e analisi multi-sorgente**: `mcp-technical-analyst`
- **skill specialistiche / sidecar**: Git/Mantis, Docs, DB, Office, ColdFusion, Browser

Questa distinzione deve riflettersi in:

- ordine delle skill prioritarie
- milestone skill modernization
- prompt MCP derivati dai workflow principali
- bootstrap `AGENTS.md`
- eventuali custom agents Codex

## 4. Obiettivo architetturale

### Stato attuale

Architettura prevalente:

- tools-only o quasi
- forte orientamento a `stdio`
- logica procedurale concentrata nelle skill Markdown
- risultati spesso testuali, con salvataggio locale come workaround ai limiti di contesto

### Stato target

Architettura desiderata:

- **tools + resources + prompts** come primitive MCP native
- uso mirato di `progress`, `roots` e, dove utile, `elicitation`
- skill mantenute come layer procedurale portabile, ma con alcuni workflow tradotti anche in **prompt MCP**
- output piu' strutturati (`structuredContent`, output schema, resource link/artifacts)
- integrazione Codex piu' forte tramite `AGENTS.md`, custom agents e uso selettivo dei subagent workflow
- maggiore attenzione alla **compatibilita' client-side** degli schema tool, in particolare per host come Copilot in VS Code

## 5. Principi guida

### 5.1 Compatibilita' prima della purezza

Non rompere i tool attuali se non c'e' un vantaggio forte e misurabile. La modernizzazione deve essere **incrementale**.

### 5.2 Conservare il pattern `action`

Il pattern `action` va conservato dove migliora discoverability e compattezza. Va spezzato solo quando:

- cambia radicalmente il profilo di rischio del tool
- cambia il tipo di output
- cambia il modello mentale del workflow
- servono annotations diverse o permessi diversi

### 5.3 AGENTS.md corto, spec dettagliata altrove

`AGENTS.md` deve restare piccolo e stabile. Questo documento e' la specifica operativa estesa. Non copiare tutto dentro `AGENTS.md`.

### 5.4 Preferire miglioramenti visibili agli agenti

Dare priorita' a cio' che migliora davvero l'efficacia agentica:

- capability negoziate meglio
- output strutturati
- resource URI leggibili
- hint di sicurezza
- prompt MCP discoverable
- skill con trigger piu' chiari
- eval e benchmark piu' aderenti ai task reali

### 5.5 Compatibilita' cross-host come requisito esplicito

Tutti i server MCP e le relative skill devono essere pensati per funzionare almeno con:

- Codex
- Copilot in VS Code
- altri client MCP relativamente stretti nella validazione degli schema

Conseguenze pratiche:

- ogni `type: "array"` nello schema tool deve avere `items`
- evitare schema troppo permissivi o incompleti
- aggiungere smoke test su `tools/list` e validazione degli input schema
- non assumere che tutti i client tollerino lacune o ambiguita' nello schema JSON

### 5.6 Evitare dipendenze da feature troppo immature

Le feature di spec in stato draft o supportate solo da pochi client vanno tenute come **opzioni future**, non come base obbligatoria della prima ondata di implementazione.

## 6. Target tecnico per MCP

## 6.1 Capability minime da introdurre o standardizzare

### A. Server instructions all'inizializzazione

Ogni server MCP dovrebbe restituire `instructions` utili al client durante `initialize`, con:

- scopo del server
- relazione tra i tool
- limitazioni operative
- casi d'uso consigliati
- eventuale relazione con skill o server fratelli

### B. Tool annotations

Dove supportato dalla libreria usata, ogni tool deve avere hint coerenti:

- `readOnlyHint: true` per tool di sola lettura
- `destructiveHint: true/false` per tool di scrittura
- `idempotentHint` quando applicabile
- `title` leggibile per UI/client

### C. Structured output

Tutti i tool critici devono convergere verso questo pattern:

- `content` testuale breve e leggibile
- `structuredContent` con JSON stabile
- eventuale `resource_link` quando il risultato e' grande o riusabile

### D. Resources

Esportare come resources i contenuti che oggi sono soltanto leggibili via tool o file locale:

- documenti indicizzati
- esportazioni Office/PDF
- artefatti di test
- schema DB o viste strutturate
- eventualmente commit, diff o report generati

### E. Resource templates

Per risorse navigabili o parametrizzabili usare template con URI stabili, per esempio:

- `docs://shelf/{shelf}/doc/{id}`
- `docs://shelf/{shelf}/search/{query}`
- `artifact://office/{artifactId}`
- `sql://connection/{alias}/schema/{schema}/table/{table}`

### F. Prompts MCP

Tradurre in prompt MCP i workflow piu' ricorrenti e user-invoked, senza eliminare le skill.

### G. Roots

Supportare `roots` quando il client li espone. `project_path` resta il fallback per compatibilita'.

### H. Progress

Per operazioni lunghe o costose, emettere notifiche di progresso dove sensato:

- scansione docs
- export PDF
- test browser
- query su dataset grandi
- lint/build/report

### I. Schema hygiene per tool compatibility

Ogni server MCP deve rispettare queste regole minime sugli input schema dei tool:

- ogni array dichiara `items`
- gli oggetti annidati hanno `properties` coerenti e, se necessario, `required`
- niente union ambigue se non necessarie
- evitare shape eccessivamente lassiste se il client deve generare input affidabili
- per i parametri complessi, preferire schemi espliciti e riusabili

## 6.2 Convenzioni tecniche da adottare

### Convenzione di output dei tool

```json
{
  "content": [
    { "type": "text", "text": "Export completato" },
    {
      "type": "resource_link",
      "name": "monthly-report-md",
      "title": "Monthly report markdown",
      "uri": "artifact://office/2026-03/monthly-report",
      "mimeType": "text/markdown"
    }
  ],
  "structuredContent": {
    "status": "ok",
    "artifact": {
      "uri": "artifact://office/2026-03/monthly-report",
      "save_path": "exports/monthly-report.md",
      "mimeType": "text/markdown"
    }
  }
}
```

### Convenzione di errore

Gli errori operativi devono:

- non fare crashare il server
- essere restituiti come risultato MCP con `isError: true` o schema equivalente supportato dalla libreria
- avere messaggio breve per il modello
- includere, se utile, un payload strutturato con `code`, `details`, `retryable`

Esempio:

```json
{
  "content": [
    { "type": "text", "text": "Errore: project_path non valido" }
  ],
  "structuredContent": {
    "code": "INVALID_PROJECT_PATH",
    "retryable": false,
    "details": {
      "project_path": "D:/repo/non-esiste"
    }
  },
  "isError": true
}
```

### Convenzione per `save_path`

- `save_path` resta supportato
- se il file viene salvato, restituire anche un `resource_link` quando possibile
- il tool non deve tornare al comportamento legacy di restituire blob/base64 in chiaro, salvo esplicita necessita'

## 7. Strategia per le skill

## 7.1 Obiettivo

Le skill devono passare da "prompt lunghi con tanta procedura" a **workflow modulari, testabili e piu' misurabili**, mantenendo la compatibilita' con il formato `SKILL.md`.

## 7.2 Regole

### Regola 1: mantenere `SKILL.md` leggibile e triggerabile

Ogni skill deve avere:

- `name`
- `description` precisa, con trigger chiari
- istruzioni essenziali
- rinvio a `references/` per materiale opzionale
- rinvio a `scripts/` per attivita' deterministiche o ripetitive

### Regola 2: spostare la ripetizione deterministica in `scripts/`

Se una procedura e' ripetitiva, fragile o lunga, non va lasciata interamente in linguaggio naturale. Va spostata in script o helper.

### Regola 3: introdurre eval e benchmark skill

Per le skill principali va creato un loop di miglioramento:

- prompt di test
- misurazione qualitativa
- benchmark di triggering
- riduzione di falsi positivi e falsi negativi

### Regola 4: non duplicare inutilmente skill e prompt MCP

Una stessa procedura puo' esistere in due forme:

- **skill**: per portabilita' cross-host e workflow complessi
- **prompt MCP**: per discoverability nativa nei client MCP

Ma la logica deve restare coerente e versionata insieme.

### Regola 5: distinguere coordinamento, intake analitico ed esecuzione specialistica

Questa distinzione e' ora obbligatoria:

- `mcp-master-orchestrator`: coordinamento generale multi-step
- `mcp-technical-analyst`: intake analitico multi-sorgente
- skill specialistiche: esecuzione di dominio e raccolta prova mirata

## 7.3 Skill prioritarie da evolvere

### 1. `mcp-technical-analyst`

Ruolo target:

- skill primaria per task di analisi tecnica multi-sorgente
- intake da ticket, documento, allegato, commit o fonti miste
- ricostruzione di contesto, stato attuale, gap e dipendenze
- separazione esplicita tra fatti, inferenze e punti aperti
- produzione di deliverable `.md` riusabili
- uso di Playwright solo se necessario come prova funzionale

### 2. `mcp-master-orchestrator`

Ruolo target:

- skill di coordinamento alto livello
- non deve eseguire tutta la logica da sola
- deve instradare verso skill primarie e sidecar corretti
- per i task analitici multi-sorgente deve delegare l'intake a `mcp-technical-analyst`

### 3. `mcp-git-mantis-workflow`

Ruolo target:

- triage ticket
- raccolta prove
- collegamento commit, ticket e validazione
- generazione nota finale o artefatto
- sidecar tipico dell'analisi tecnica ticket-first

### 4. `mcp-docs-navigator`

Ruolo target:

- discovery nel corpus documentale
- supporto a resources `docs://...`
- citazioni/ID documento stabili
- supporto document-first per `mcp-technical-analyst`

### 5. `mcp-database-expert`

Ruolo target:

- verifica schema, dati e differenze tra ambienti
- supporto a gap analysis e confronto configurazioni
- sidecar strutturale nelle analisi cross-repo/cross-db

### 6. `mcp-office-expert`

Ruolo target:

- lettura e trasformazione di PDF/DOCX/XLSX
- export e consegna artefatti
- ponte tra `office-node`, deliverable Markdown e `docs-node`

### 7. `mcp-browser-automation`

Ruolo target:

- smoke test e validazione finale
- raccolta evidenze browser-side
- da usare come fallback o prova finale, non come primo strumento analitico

## 7.4 Skill da prendere a modello da `anthropics/skills`

Usare come benchmark metodologico:

- `mcp-builder` per design dei server MCP
- `skill-creator` per scrittura, test ed eval delle skill
- `webapp-testing` per separare istruzioni e automazione Playwright/script
- `pdf`, `docx`, `xlsx` per pattern documentali e gestione output strutturati

## 7.5 Regola di routing per Codex

Codex deve applicare questa euristica prima di scegliere una skill:

- **task analitico che parte da evidenze miste** -> parti da `mcp-technical-analyst`
- **task esecutivo o mono-dominio** -> parti dalla skill specialistica piu' vicina
- **task ampio, multi-fase, con sotto-obiettivi diversi** -> usa `mcp-master-orchestrator`, ma fai delegare la fase analitica a `mcp-technical-analyst`

### Tabella decisionale: quando usare prompt MCP vs skill

| Scenario operativo | Preferisci prompt MCP | Preferisci skill | Note di compatibilita' |
| --- | --- | --- | --- |
| Avvio rapido di un workflow frequente e ben standardizzato | Si, soprattutto se vuoi discoverability nativa nel client MCP | Solo se serve una variante procedurale non coperta dal prompt | Mantieni sempre una controparte skill per host MCP con supporto prompt parziale |
| Task complesso multi-fase con dipendenze tra domini | Solo come entrypoint o checklist iniziale | Si, usa skill (eventualmente orchestrate) per esecuzione completa | La skill resta il fallback principale cross-host |
| Analisi tecnica multi-sorgente (ticket + doc + allegati + commit) | Prompt utile per kickoff e raccolta parametri | Si, `mcp-technical-analyst` e' la scelta primaria | Evita prompt monolitici che comprimono tutto il ragionamento |
| Esecuzione mono-dominio (DB, docs, browser, office, CF) | Prompt opzionale per task ripetibili e semplici | Si, skill specialistica come default operativo | Mantieni i pattern legacy (`action`, `project_path`, `save_path`) |
| Onboarding di utenti nuovi o occasionali | Si, per guidare input minimi e ridurre errori | Si, quando servono procedure complete e verificabili | Prompt per discoverability, skill per robustezza |
| Client/host con supporto MCP eterogeneo o limitato | Non come unico canale | Si, per massima portabilita' e prevedibilita' | Se introduci un prompt, documenta sempre il fallback skill equivalente |

Regola pratica: **prompt MCP per ingresso rapido e discoverability; skill per orchestrazione robusta, portabile e verificabile**.

## 8. Integrazione specifica con Codex

## 8.1 Architettura Codex consigliata

Usare quattro livelli, coerenti tra loro:

1. `AGENTS.md` per regole persistenti e corte
2. Skill per workflow riusabili e dominio
3. MCP per tool e contesto esterno
4. Subagents/custom agents solo quando il task e' parallelizzabile o richiede ruoli distinti

## 8.2 File consigliati da aggiungere nel repo

### A. `AGENTS.md` minimale

Deve contenere solo:

- convenzioni di build/test
- regole di compatibilita'
- indicazione di leggere questa spec prima di toccare MCP/skills
- regole sui confini di modifica
- regola esplicita su `mcp-technical-analyst` per i task di analisi multi-sorgente

### B. `.codex/agents/` con custom agents

Creare agenti stretti e opinionated, non generici.

Proposta iniziale:

- `mcp_explorer.toml` — lettura e mappatura capability attuali
- `mcp_implementer.toml` — implementazione incrementale e test
- `docs_researcher.toml` — verifica spec/API/documentazione
- `skill_evaluator.toml` — test di trigger e qualita' skill
- `technical_analyst.toml` — intake e ricostruzione multi-sorgente, allineato a `mcp-technical-analyst`

## 8.3 Esempio di custom agent: explorer

```toml
name = "mcp_explorer"
description = "Analizza i server MCP del repo in sola lettura e propone cambi incrementali con basso rischio."
sandbox_mode = "read-only"
developer_instructions = """
Resta in modalita' esplorazione.
Mappa capability attuali, tool, input schema, output e rischi di compatibilita'.
Non proporre refactor estesi se non richiesti.
Cita sempre file e simboli toccati.
"""
```

## 8.4 Quando usare i subagent workflow

Usare subagent solo per task come:

- review parallela di piu' server MCP
- audit separato di sicurezza, UX tool, test e documentazione
- migrazione multi-modulo con partizionamento chiaro
- analisi complessa in cui un subagent prepara il quadro tecnico e un altro implementa il delta

Non usarli per task lineari piccoli o quando aumentano solo rumore e token.

## 9. Milestone di implementazione

## Milestone 0 — baseline, guardrail e compatibilita' client

### Obiettivo

Preparare il repository alla migrazione senza cambiare ancora il comportamento funzionale dei server.

### Task

- aggiungere questo documento nel repo
- ridurre `AGENTS.md` a bootstrap + regole permanenti
- creare una matrice capability per tutti i server
- creare test smoke minimi di avvio per ogni server
- definire convenzione comune per errori e output
- creare una checklist PR per modifiche MCP/skill
- aggiungere un audit automatico degli input schema dei tool

### Deliverable

- `docs/codex_mcp_skills_enhancement_spec.md`
- `docs/server-capability-matrix.md`
- `docs/pr-checklist-mcp.md`
- eventuale cartella `tests/smoke/`
- `scripts/check-tool-schemas.(js|ts|py)` o equivalente

### Criteri di accettazione

- ogni server ha una scheda capability attuale
- esiste almeno un test di boot/handshake o smoke equivalente per ogni server
- `AGENTS.md` non e' piu' una specifica lunga ma un file guida breve
- esiste un controllo che fallisce se uno schema MCP contiene array senza `items`

## Milestone 1 — pilot su `git-node`

### Obiettivo

Usare `git-node` come server pilota per introdurre le convenzioni moderne senza cambiare il set di tool esposto.

### Task

- migrare, se sensato, a superficie SDK piu' moderna (`McpServer` o equivalente attuale) mantenendo compatibilita'
- mantenere `git_query`, `git_diff`, `git_conflict_manager`
- aggiungere tool annotations coerenti
- aggiungere `structuredContent` ai risultati principali
- aggiungere `instructions` all'inizializzazione
- supportare `roots` come alternativa a `project_path`
- aggiungere test su tool read-only vs write
- aggiungere `git_query action: "repo_info"` con repository top-level, branch, upstream, HEAD e stato di operazioni in corso (`rebase`, `merge`, `cherry-pick`, `bisect`)
- aggiungere `git_query action: "rebase_status"` con commit in replay, todo rimanente, file in conflitto e next step suggerito
- estendere `git_diff action: "compare"` con selezione esplicita `two_dot` / `three_dot` e opzione `stat`
- aggiungere `git_diff action: "range_diff"` per confronto tra serie di commit originaria e serie riscritta dopo rebase
- aggiungere `git_conflict_manager action: "list_detailed"` con metadati su tipo di conflitto, ours/base/theirs, marker, encoding e BOM
- restringere `rebase_step` a `continue`, `skip`, `abort`, eliminando fallback impliciti rischiosi come `commit --no-edit`

### Note di compatibilita'

Non cambiare nomi dei tool nella prima PR, salvo motivazione forte.

### Criteri di accettazione

- un client esistente continua a usare i tool attuali
- un client moderno riceve piu' metadati utili
- output machine-readable disponibile almeno per `status`, `history`, `compare`, `list`
- un agente puo' capire stato repo e stato rebase senza shell generica
- i confronti Git usati nei rebase sono semantici ed espliciti
- `rebase_step` non contiene fallback write impliciti

## Milestone 2 — `docs-node` come primo server resource-native

### Obiettivo

Fare di `docs-node` il primo server con resources reali.

### Task

- mantenere i tool esistenti di scansione e ricerca
- aggiungere `resources/list` per shelf e documenti
- aggiungere `resources/read` per contenuto documento
- aggiungere `resources/templates/list` per pattern parametrizzati
- definire URI stabili per shelf/documento
- valutare completions per shelf o query se supportate dalla libreria/client

### Esempio URI

- `docs://shelf/12-platform-guides`
- `docs://document/245`

### Convenzione URI operativa (`docs://...`)

Per evitare rotture su rename e garantire mapping deterministico tra record DB e risorse MCP:

- shelf URI: `docs://shelf/{shelf_id}-{slug_opzionale}`
  - chiave primaria: `shelf_id`
  - `slug_opzionale` e' solo descrittivo, non usato come chiave di lookup
- document URI: `docs://document/{document_id}`
  - chiave primaria: `document.id`
- helper consigliati in `docs-node/index.js`:
  - `buildShelfUri(shelfId, shelfName)`
  - `buildDocumentUri(documentId)`
  - `parseDocsUri(uri)`

Esempi concreti:

- `docs://shelf/12-platform-guides`
- `docs://shelf/12` (valido: stesso scaffale, slug assente)
- `docs://document/245`

Regole di validazione minime in `resources/read`:

- rifiutare URI non `docs://`
- rifiutare path con segmentazione inattesa
- errore esplicito su identificatore non numerico/<=0
- errore esplicito su shelf/document non trovato

### Criteri di accettazione

- i documenti sono navigabili come resources
- la ricerca continua a funzionare come tool
- il mapping tra risultati ricerca e resource URI e' stabile

## Milestone 3 — artifact resources e compatibilita' forte in `office-node`

### Obiettivo

Evolvere `save_path` in artifact resource, senza perdere la compatibilita' con il salvataggio locale e con i client MCP piu' severi.

### Task

- per `pdf_document export_text` restituire anche un `resource_link`
- per output Word/Excel esportati o modificati, esporre artifacts leggibili
- definire convenzione `artifact://...`
- collegare l'export Office/PDF a un eventuale registry locale degli artifacts
- aggiornare la sinergia con `docs-node`
- correggere e testare tutti gli input schema complessi, in particolare array annidati e strutture tabellari Excel
- aggiungere test specifici di compatibilita' su `tools/list` per Copilot/VS Code

### Criteri di accettazione

- il tool salva su disco come oggi
- il client puo' anche seguire un `resource_link`
- il payload testuale e' leggero
- gli schema di `office-node` non falliscono validazione client-side su host stretti

## Milestone 4 — prompt MCP dai workflow principali

### Obiettivo

Tradurre i workflow piu' frequenti in prompt MCP discoverable.

### Prompt candidati (stato M4)

| Candidato | Stato | Tipo | Argomenti minimi |
| --- | --- | --- | --- |
| `triage_bug_ticket` | **Implementato ora** (`git-node`) | **prompt-first** | `ticket_id`, `project_path` (`focus_area` opzionale) |
| `analyze_merge_conflict` | **Rimandato** (coperto temporaneamente da `git_conflict_resolution_plan`) | **hybrid** | `project_path`, `target_branch`, `source_branch` |
| `ingest_pdf_into_docs` | **Implementato ora** (`office-node`) | **prompt-first** | `pdf_path`, `save_path`, `shelf` |
| `generate_monthly_report` | **Rimandato** | **hybrid** | `month`, `year`, `project_path` |
| `post_fix_validation` | **Implementato ora** (`git-node`) | **prompt-first** | `project_path` (`source_branch`, `target_branch` opzionali) |
| `technical_analysis_ticket_first` | **Implementato ora** (`git-node`, thin) **solo se il prompt resta in `git-node`** | **skill-first** (con escalation esplicita) | `ticket_id`, `project_path`, `scope_hint` opzionale |
| `technical_analysis_document_first` | **Rimandato** | **skill-first** | `document_path` o `doc_uri`, `project_path` |
| `technical_gap_analysis` | **Rimandato** | **skill-first** | `target_scope`, `baseline_scope`, `project_path` |

Note operative rapide:

- "Implementato ora" indica prompt gia' esposto via `prompts/list` + `prompts/get`.
- "Rimandato" indica candidato mantenuto in roadmap: il workflow resta coperto da skill o prompt adiacenti finche' non viene introdotto il nome definitivo.
- la famiglia `technical_analysis_*` resta **skill-first per design**: i prompt MCP associati (quando presenti) devono rimanere thin wrapper di ingresso, senza sostituire il workflow completo della skill.
- `technical_analysis_ticket_first` va mantenuto come implementato **solo se** il prompt continua a essere esposto in `git-node`; in caso di scelta skill-first/deferred, rimuovere prima il prompt dal codice server e poi aggiornare questa tabella.
- il kickoff light da ticket e' coperto dalla variante skill `ticket-first-light` (`mcp-technical-analyst`) e **non** da un prompt universale, per evitare compressione impropria del ragionamento analitico.

### Regole

- i prompt devono essere user-controlled
- ogni prompt deve avere argomenti chiari
- i prompt non devono duplicare tutto `SKILL.md`, ma incapsulare il flusso minimo utile
- non comprimere troppo presto tutta la skill `mcp-technical-analyst` in un solo prompt generico
- evitare prompt "intake universale" per il kickoff da ticket: usare `ticket-first-light` come percorso standard e fare escalation esplicita quando emergono segnali multi-sorgente

### Criteri di accettazione

- almeno 3 prompt MCP sono disponibili
- almeno uno dei prompt deriva da `mcp-technical-analyst`
- i workflow corrispondenti restano disponibili anche come skill
- la documentazione spiega quando usare prompt vs skill

## Milestone 5 — skill modernization ed eval

### Obiettivo

Rendere le skill principali piu' modulari, testabili e misurabili, riflettendo l'architettura attuale del repo.

### Task

- ripulire `description` e trigger
- spostare materiale opzionale in `references/`
- aggiungere `scripts/` dove utile
- creare prompt di eval per skill principali
- definire benchmark qualitativo minimo
- promuovere `mcp-technical-analyst` a riferimento principale per le eval dei task analitici multi-sorgente
- allineare `mcp-master-orchestrator` al ruolo di router/coordinatore e non di intake universale
- aggiornare `mcp-git-mantis-workflow` con sezioni dedicate a `rebase preflight`, `semantic conflicts` e `post-rebase verification`
- aggiungere una reference `references/rebase-playbook.md` con pattern per label, `gr*.cfm`, state machine e stop condition per review umana
- aggiornare `mcp-coldfusion-developer` con una regola esplicita: in audit usare `lint_code` senza fix; usare `fix: true` solo in remediation

### Suite minima di eval da garantire

Per `mcp-technical-analyst`:

- ticket-first
- document-first
- cross-repo / cross-db
- browser only-if-needed
- separazione fatti / inferenze / punti aperti
- deliverable `.md` strutturati

Per `mcp-master-orchestrator`:

- routing corretto verso `mcp-technical-analyst` sui task analitici
- routing corretto verso skill specialistica sui task mono-dominio
- uso limitato dei sidecar per fase

Per il filone Git/Rebase:

- rebase preflight
- semantic conflict analysis
- confronto con target branch vs branch sorgente originale
- post-rebase verification
- casi in cui fermarsi per review umana

### Criteri di accettazione

- le skill top hanno trigger piu' precisi
- esiste una suite minima di test prompt
- il comportamento e' meno dipendente da istruzioni lunghe non strutturate
- `mcp-technical-analyst` e `mcp-master-orchestrator` hanno confini piu' netti e verificabili

## Milestone 6 — Codex custom agents e workflow paralleli

### Obiettivo

Usare Codex in modo piu' disciplinato sui task complessi.

### Task

- creare `.codex/agents/` con 3 o 4 agenti mirati
- documentare prompt di orchestrazione subagent
- definire quando usare `explorer` vs `implementer`
- definire limiti di parallelismo e profondita'
- aggiungere un profilo `technical_analyst` o equivalente per task di ricostruzione tecnica

### Criteri di accettazione

- l'uso dei subagent riduce il lavoro manuale su task di audit/review
- i custom agent non sono generici, ma veramente specializzati

## Milestone 7 — Safe Project Filesystem MCP (`projectfs-node`)

### Obiettivo

Realizzare un MCP server TypeScript/Node.js **read-only, cross-platform e whitelist-constrained** da usare come alternativa sicura ai fallback shell per lettura file e navigazione del progetto in Codex e Copilot in VS Code, soprattutto quando le funzioni integrate dell'IDE non sono disponibili o non sono sufficienti.

### Ruolo architetturale

`projectfs-node` non sostituisce:

- `git-node` per stato/storia/confronti Git
- `docs-node` per indicizzazione e ricerca documentale
- `office-node` per parsing/esportazione Office e PDF

Fornisce invece un livello infrastrutturale dedicato a:

- lettura sicura di file di progetto
- navigazione directory controllata
- ricerca testuale controllata
- metadata filesystem
- lettura batch limitata di piu' file

### Tool minimi richiesti

Per questo server si accetta una **eccezione motivata** al pattern repository-wide basato su `action`: sono preferibili tool separati e schema semplici, per compatibilita' con client MCP rigorosi e per chiarezza semantica.

Tool minimi:

- `read_file(path, startLine?, endLine?, maxBytes?)`
- `list_dir(path, depth?, include?, exclude?, includeHidden?)`
- `grep_files(root, pattern, include?, exclude?, caseSensitive?, maxResults?)`
- `stat(path)`
- opzionale ma fortemente consigliato: `read_many(paths[], maxBytesPerFile?)`

### Principi e vincoli di sicurezza

- nessuna scrittura sul filesystem del progetto
- nessun side effect
- accesso consentito solo a target finali che ricadono in `allowedRoots`
- canonicalizzazione obbligatoria del path prima di ogni accesso
- prevenzione di path traversal (`../`, mixed separators, escape via link)
- comportamento esplicito per symlink/junction:
  - risolvere il target reale
  - consentire l'accesso solo se il target finale resta dentro whitelist
  - rifiutare target esterni
- bloccare di default directory rumorose o costose, configurabili:
  - `.git`, `node_modules`, `vendor`, `dist`, `build`, `bin`, `obj`

### Configurazione minima attesa

Supportare file config dedicato + override via env. Campi minimi:

- `allowedRoots`
- `blockedGlobs`
- `blockedDirs`
- `followLinks` (meglio come policy enum: `deny`, `allow-within-whitelist`, `report-only`)
- `maxFileBytes`
- `maxSearchResults`
- `maxDepth`
- `searchTimeoutMs`

Fornire esempi di configurazione per Windows e Linux.

### Compatibilita' cross-platform

Il server deve essere testato su Windows e Linux, con particolare attenzione a:

- separatori Windows/POSIX
- path relativi e assoluti
- case sensitivity dove applicabile
- symlink Linux
- junction e symlink Windows
- differenze di comportamento di `realpath`

Normalizzazione, canonicalizzazione e containment vanno astratti in un modulo dedicato con test mirati.

### Testing richiesto

Unit test obbligatori su:

- path normalization
- authorization / containment
- traversal prevention
- symlink handling
- junction handling dove applicabile
- blocked dirs / blocked globs
- rifiuto di target esterni alla whitelist

Integration test obbligatori su:

- `read_file`
- `list_dir`
- `grep_files`
- `stat`
- `read_many` se implementato

Aggiungere matrix GitHub Actions su:

- `ubuntu-latest`
- `windows-latest`

### Deliverable

- nuova cartella `projectfs-node/`
- README con setup locale, esempi config e limiti noti
- test unit e integration
- workflow GitHub Actions cross-platform
- aggiornamento dei generatori di configurazione host-specifica
- eventuale sezione `AGENTS.md` o README con linee guida per review Codex

### Criteri di accettazione

- nessuna scrittura sul filesystem del progetto
- accessi fuori whitelist sempre negati
- symlink/junction ammessi solo se risolti dentro whitelist
- test verdi su Linux e Windows
- README sufficiente per setup locale e integrazione con Codex/Copilot
- schema MCP validi e compatibili con client rigorosi

## Milestone 8 — packaging e distribuzione

### Obiettivo

Standardizzare packaging, configurazione host e, dove opportuno, distribuzione remota.

### Task

- mantenere `stdio` come default locale
- valutare wrapper `Streamable HTTP` solo per i server che hanno senso in multi-client/team setting
- introdurre un manifest unificato da cui generare config host-specifiche
- valutare `server.json` o packaging compatibile con registry MCP/GitHub MCP Registry

### Criteri di accettazione

- configurazione meno duplicata tra host
- i server condivisibili hanno una strategia di packaging chiara
- nessun degrado del setup locale esistente

## 10. Priorita' dei moduli

### Alta priorita'

- `git-node`
- `docs-node`
- `office-node`
- skill `mcp-technical-analyst`
- skill `mcp-master-orchestrator`
- hardening di compatibilita' MCP per host rigorosi (Codex/Copilot)

### Media priorita'

- `sql-node`
- `playwright-node`
- `mantis-node`
- `mcp-git-mantis-workflow`
- `mcp-docs-navigator`

### Priorita' successiva

- `cf-node`
- `linter-node`
- generatori di configurazione host-specifica
- `projectfs-node` (post-rework, ma ad alto valore operativo)

## 11. Regole di implementazione per Codex

Quando Codex lavora su questo repository deve seguire queste regole:

1. **Prima osserva, poi cambia**
   Mappa capability attuali e file toccati prima di proporre refactor.

2. **Una milestone per branch/PR**
   Non combinare modernizzazione MCP, refactor skill e packaging nella stessa PR.

3. **Compatibilita' in avanti e indietro**
   Se un tool esistente cambia output, mantieni per quanto possibile la forma precedente in `content` e aggiungi il nuovo formato in `structuredContent`.

4. **No big bang rewrite**
   Preferire adattatori, helper condivisi e migrazioni per server pilota.

5. **Test obbligatori**
   Ogni modifica a un server deve avere almeno smoke test + un test funzionale sul nuovo comportamento.

6. **Documentare l'intento**
   Ogni PR deve spiegare: capability nuove, rischio compatibilita', fallback, rollback.

7. **Non ipotizzare supporto client universale**
   Feature come prompts, roots, elicitation, completions o resource rendering possono avere supporto diverso a seconda dell'host. Prevedere fallback.

8. **Per i task analitici, scegliere il punto di ingresso corretto**
   Se il task parte da ticket, documento, allegato, commit o fonti miste e richiede ricostruzione tecnica, usa `mcp-technical-analyst` come riferimento primario.

## 12. Contratti specifici per server e skill

## 12.1 `git-node`

### Target

- mantenere il trio `git_query`, `git_diff`, `git_conflict_manager`
- classificare esplicitamente tool read-only vs write-capable
- migliorare output strutturato
- introdurre `repo_info` e `rebase_status` come primitive diagnostiche di alto livello
- rendere esplicite le semantiche di confronto (`two_dot`, `three_dot`, `range_diff`)
- esporre conflitti come oggetti strutturati e non solo come testo
- rendere `rebase_step` trasparente, conservativo e senza fallback impliciti

### Non fare

- non fondere lettura e scrittura nello stesso tool se peggiora la sicurezza
- non introdurre dipendenze remote GitHub in `git-node`; per il remoto valutare integrazione separata
- non lasciare `compare` con semantica implicita nei casi di rebase
- non usare fallback automatici come `commit --no-edit` dentro `rebase_step`

## 12.2 `docs-node`

### Target

- primo server resource-centric
- shelf e documenti trattati come contesto navigabile e non solo come righe di DB/FTS

### Non fare

- non rimuovere i tool di scansione e search gia' utili ai client meno evoluti

## 12.3 `office-node`

### Target

- conservare il ruolo di tool locale universale per Word/Excel/PDF
- aggiungere artifact resources e output strutturato
- rafforzare il ponte con `docs-node`
- garantire schema tool compatibili con client MCP rigorosi

### Non fare

- non tornare a restituire contenuti binari lunghi nel `content`
- non lasciare array senza `items` o shape tabellari ambigue nei parametri dei tool

## 12.4 `sql-node`

### Target

- mantenere guardrail read-only come default
- valutare resources per schema, table metadata, explain output o report

### Non fare

- non espandere la scrittura DB senza guardrail piu' forti e capability esplicite

## 12.5 `playwright-node`

### Target

- progress notification per task lunghi
- artifact per screenshot/log/report
- integrazione con skill/browser validation

### Non fare

- non perdere i guardrail `ALLOWED_URLS`/`BLOCK_MEDIA`

## 12.6 `mcp-technical-analyst`

### Target

- skill primaria per intake tecnico multi-sorgente
- discovery prima delle domande
- output `.md` riusabili e verificabili
- uso disciplinato degli skill sidecar
- chiara distinzione tra fatti, inferenze e punti aperti

### Non fare

- non usarla per task chiaramente mono-dominio che una skill specialistica puo' risolvere direttamente
- non aprire tutti i filoni tecnici in parallelo senza priorita'
- non usare Playwright in automatico se l'analisi e' gia' chiudibile con codice, dati e documenti

## 12.7 `mcp-master-orchestrator`

### Target

- coordinamento multi-step
- routing corretto tra skill primarie e sidecar
- riduzione di salti di contesto e duplicazioni

### Non fare

- non sostituire `mcp-technical-analyst` come intake standard per i task di analisi tecnica multi-sorgente
- non diventare una skill monolitica che replica tutto il contenuto delle skill figlie

## 12.8 `projectfs-node`

### Target

- server read-only, cross-platform e whitelist-constrained per lettura file e navigazione progetto
- tool separati (`read_file`, `list_dir`, `grep_files`, `stat`, opzionalmente `read_many`) per compatibilita' e chiarezza
- enforcement rigoroso di `allowedRoots` sul target finale canonicalizzato
- policy esplicita per symlink e junction
- schema tool semplici e validabili da client rigorosi

### Non fare

- non introdurre alcuna operazione write sul filesystem del progetto
- non eseguire shell generica
- non sostituire `git-node`, `docs-node` o `office-node` nei loro ruoli specialistici
- non assumere equivalenza perfetta tra `realpath` Windows e Linux

## 13. Test strategy

## 13.1 Test minimi richiesti

Per ogni server modificato:

- avvio server senza crash
- handshake/initialize
- lista tool/resources/prompts coerente
- almeno un caso felice
- almeno un caso errore
- compatibilita' legacy minima
- validazione degli input schema restituiti da `tools/list`
- per `projectfs-node`, test cross-platform su path normalization, whitelist enforcement e gestione symlink/junction

## 13.2 Test consigliati

- snapshot di output strutturato
- test sui resource URI
- test di fallback `roots` -> `project_path`
- test di `save_path` + `resource_link`
- test di prompt arguments validation
- test automatici che cercano array senza `items`
- test di compatibilita' focalizzati su `office-node` e altri tool con payload tabellari

## 13.3 Test skill

Per le skill principali creare una suite di prompt di regressione, con classificazione minima:

- trigger corretto
- trigger mancato
- uso improprio di una skill simile
- output troppo lungo o troppo generico
- errori di routing verso i tool/server giusti
- per `mcp-technical-analyst`, corretta separazione tra evidenza, inferenza e punti aperti

## 14. Rischi e mitigazioni

### Rischio 1: rottura della compatibilita' con host attuali

Mitigazione:

- mantenere `stdio`
- conservare tool names e `action`
- usare fallback quando una capability non e' supportata

### Rischio 2: rottura della compatibilita' con client piu' severi

Mitigazione:

- audit sistematico degli schema
- test su `tools/list`
- eliminare shape ambigue o incomplete
- trattare la compatibilita' con Copilot/VS Code come requisito reale, non secondario

### Rischio 3: spec creep

Mitigazione:

- introdurre solo primitive ad alto impatto nella prima ondata
- rimandare task API/draft feature a una fase successiva

### Rischio 4: skill troppo verbosa o fragile

Mitigazione:

- spostare le parti deterministiche in `scripts/`
- introdurre eval veri

### Rischio 5: orchestrazione confusa tra analyst e orchestrator

Mitigazione:

- definire confini espliciti
- testare routing e intake
- usare `mcp-technical-analyst` come standard per task analitici multi-sorgente

### Rischio 6: AGENTS.md troppo grande

Mitigazione:

- lasciare in `AGENTS.md` solo regole operative brevi e riferimenti a questo documento

### Rischio 7: troppi cambi in una sola PR

Mitigazione:

- milestone rigide
- massimo uno o due server toccati per PR tecnica

## 15. Non-obiettivi espliciti

Questa iniziativa **non** deve, nella prima fase:

- riscrivere simultaneamente tutti i server MCP
- eliminare il pattern `action`
- imporre HTTP remoto ovunque
- introdurre dipendenze cloud non necessarie nei server locali
- adottare per forza tutte le feature della spec draft
- sostituire le skill con i prompt MCP o viceversa
- trasformare `mcp-master-orchestrator` in un intake universale che ingloba `mcp-technical-analyst`

## 16. Deliverable finali attesi

A regime, il repository dovrebbe arrivare a questo stato:

- server MCP principali con metadata e output piu' moderni
- almeno un server pilota tool-modernized (`git-node`)
- almeno un server resource-native (`docs-node`)
- artifact resources introdotti (`office-node`)
- prompt MCP per workflow principali
- skill principali ripulite, modulari e con eval minimi
- `mcp-technical-analyst` riconosciuta come skill primaria per l'analisi tecnica multi-sorgente
- `mcp-master-orchestrator` consolidato come coordinatore e router
- `AGENTS.md` breve + spec estesa separata
- custom agents Codex per audit e implementazione
- strategia chiara di packaging locale/remoto
- compatibilita' verificata con Codex e Copilot/VS Code

## 17. Checklist PR standard

Ogni PR che implementa questa roadmap deve rispondere a queste domande:

- Qual e' la milestone di riferimento?
- Quali capability MCP aggiunge o modifica?
- Cambia i nomi dei tool o solo metadata/output?
- Esiste un fallback per i client meno evoluti?
- Esiste un controllo di compatibilita' schema per client MCP piu' severi?
- Quali test nuovi sono stati aggiunti?
- Quale documentazione e' stata aggiornata?
- Come si valida manualmente la modifica?
- Qual e' il piano di rollback?

## 18. Primo ordine di esecuzione consigliato

Ordine raccomandato per Codex:

1. Milestone 0
2. Milestone 1 (`git-node`)
3. Milestone 2 (`docs-node`)
4. Milestone 3 (`office-node`)
5. Milestone 4 (prompt MCP)
6. Milestone 5 (skill modernization)
7. Milestone 6 (custom agents/subagents)
8. Milestone 7 (`projectfs-node`, post-rework)
9. Milestone 8 (packaging/distribuzione)

## 19. Allegato operativo: esempio AGENTS breve

Questo testo non deve sostituire tutta la documentazione, ma puo' essere usato come base per un `AGENTS.md` compatto.

```md
# AGENTS.md

Prima di modificare MCP server o skill in questo repository:

1. leggi `docs/codex_mcp_skills_enhancement_spec.md`
2. mantieni compatibilita' con tool names e pattern `action`, salvo istruzioni contrarie
3. preferisci modifiche incrementali, una milestone per branch/PR
4. prima di cambiare un server MCP, esplicita capability attuali, capability target, file toccati e test previsti
5. conserva `project_path` come fallback anche se introduci `roots`
6. conserva `save_path`; se introduci artifacts/resources, aggiungili senza rompere il comportamento legacy
7. se il task e' analitico e parte da ticket, documento, allegato, commit o fonti miste, valuta prima `skills/mcp-technical-analyst/`
8. non fare rewrite estesi fuori scope
9. aggiorna test e documentazione insieme al codice
10. per gli input schema MCP, ogni array deve avere `items`
```

## 20. Riferimenti

### OpenAI Codex

- Custom instructions with AGENTS.md — Codex
  https://developers.openai.com/codex/guides/agents-md
- Customization — Codex
  https://developers.openai.com/codex/concepts/customization
- Agent Skills — Codex
  https://developers.openai.com/codex/skills
- Subagents — Codex
  https://developers.openai.com/codex/subagents
- Use Codex with the Agents SDK
  https://developers.openai.com/codex/guides/agents-sdk

### MCP specification

- Overview / Server features
  https://modelcontextprotocol.io/specification/2025-06-18/server
- Tools
  https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- Resources
  https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- Prompts
  https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
- Roots
  https://modelcontextprotocol.io/specification/2025-06-18/client/roots
- Progress
  https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/progress
- Transports
  https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Changelog 2025-06-18
  https://modelcontextprotocol.io/specification/2025-06-18/changelog
- Schema reference 2025-06-18 / draft per dettagli su ResourceLink e ToolAnnotations
  https://modelcontextprotocol.io/specification/2025-06-18/schema
  https://modelcontextprotocol.io/specification/draft/schema

### Repository e skill di riferimento

- `sophiadeveloper/mcp-servers` README e AGENTS
  https://github.com/sophiadeveloper/mcp-servers
- `anthropics/skills`
  https://github.com/anthropics/skills
- `mcp-builder`
  https://github.com/anthropics/skills/tree/main/skills/mcp-builder
- `skill-creator`
  https://github.com/anthropics/skills/tree/main/skills/skill-creator
- `webapp-testing`
  https://github.com/anthropics/skills/tree/main/skills/webapp-testing

### Skill del repo da considerare prioritariamente

- `skills/mcp-technical-analyst/`
- `skills/mcp-master-orchestrator/`
- `skills/mcp-git-mantis-workflow/`
- `skills/mcp-docs-navigator/`
- `skills/mcp-database-expert/`
- `skills/mcp-office-expert/`
- `skills/mcp-browser-automation/`
