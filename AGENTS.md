# AGENTS.md - Repository Governance, Routing & Best Practices

Questo documento definisce le regole operative per gli agenti AI che lavorano su questo repository di MCP server e skill.

Va letto insieme a:

- `docs/codex_mcp_skills_enhancement_spec.md`
- le skill in `skills/`
- l'eventuale documentazione locale dei singoli server

L'obiettivo e' mantenere coerenza, sicurezza, compatibilita' cross-host e massima efficienza nell'interazione tra agente, skill e tool MCP.

---

## 1. Modalita' di lavoro per Codex e agenti analoghi

Prima di modificare MCP server o skill in questo repository:

1. Leggi questo file.
2. Leggi la spec tecnica in `docs/codex_mcp_skills_enhancement_spec.md` o la versione piu' aggiornata disponibile.
3. Mantieni compatibilita' con tool names, pattern `action` e comportamento legacy, salvo istruzioni contrarie.
4. Preferisci modifiche incrementali: una milestone o una PR per volta.
5. Prima di cambiare un server MCP, esplicita sempre:
   - capability attuali
   - capability target
   - file toccati
   - test previsti o da aggiornare
6. Conserva `project_path` come fallback anche se introduci `roots`.
7. Conserva `save_path`; se introduci artifacts/resources, aggiungili senza rompere il comportamento legacy.
8. Non fare refactor estesi fuori scope.
9. Aggiorna codice, test e documentazione nello stesso lavoro.
10. Se una skill diventa troppo lunga o ripetitiva, sposta la parte deterministica in `scripts/` e il materiale di supporto in `references/`.

### Routing iniziale dei task

Usa questa regola prima di scegliere dove intervenire:

- **Task analitico multi-sorgente** che parte da ticket, documento, allegato, commit o fonti miste: valuta prima `skills/mcp-technical-analyst/`.
- **Task multi-fase di coordinamento generale**: valuta `skills/mcp-master-orchestrator/`.
- **Task esecutivo di dominio**: vai prima sulla skill specialistica rilevante o sul server MCP dedicato.
- **Task di evoluzione di skill**: mantieni allineamento con la spec e con le eval gia' presenti.

### Compatibilita' client come requisito esplicito

Ogni modifica deve considerare che gli MCP di questo repo devono funzionare almeno con:

- Codex
- Copilot in VS Code
- altri client MCP relativamente severi nella validazione degli schema

Conseguenze pratiche:

- ogni nodo con `type: "array"` deve dichiarare `items`
- evitare schema incompleti o troppo permissivi
- preferire output strutturati stabili
- non assumere che il client tolleri ambiguita' nello schema JSON

---

## 2. Architettura dei Tool: Strategia di Condensazione

Tutti i nuovi tool, o refactoring di quelli esistenti, DEVONO seguire la **Strategia di Condensazione**. Invece di esporre decine di tool granulari, raggruppali per categoria logica.

### Il Pattern `action`

Ogni tool condensato deve accettare un parametro obbligatorio `action` di tipo `enum`.

```javascript
{
  name: "git_query",
  description: "Esplora lo stato e la storia del repository Git (Sola Lettura).",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "history", "blame"],
        description: "L'operazione specifica da eseguire."
      },
      project_path: {
        type: "string",
        description: "Path root del progetto target."
      }
    },
    required: ["action", "project_path"]
  }
}
```

### Regole per la condensazione

1. **Grouping logico**: raggruppa per intento, per esempio sola lettura vs scrittura, navigazione vs amministrazione.
2. **Descrizioni ricche**: fornisci descrizioni dettagliate per ogni valore dell'enum `action` per aiutare l'agente a scegliere correttamente.
3. **Parametri opzionali**: usa parametri opzionali per coprire le diverse esigenze delle varie `action` all'interno dello stesso tool.
4. **Separazione quando serve**: spezza un tool condensato solo se cambia in modo netto il rischio, il tipo di output, il permesso richiesto o il modello mentale del workflow.

---

## 3. Gestione del contesto e dei progetti

Poiche' i server MCP operano su repository locali diversi, e' fondamentale gestire correttamente il contesto del progetto.

- **`project_path` obbligatorio**: quasi tutti i tool dovrebbero richiedere un `project_path` per individuare correttamente cartella di lavoro, file locali o `.env`.
- **Target configuration**: usa una funzione helper come `getTargetConfig` nei server che devono caricare credenziali o URL bridge specifici dal file `.env` contenuto nel `project_path`.
- **Supporto `roots`**: se il client MCP espone `roots`, puoi usarli per migliorare UX e sicurezza, ma `project_path` resta il fallback di compatibilita'.

---

## 4. Sicurezza, validazione e compatibilita'

- **Read-only guards**: per i server SQL, mantieni sempre una funzione di validazione come `isQueryReadOnly` per bloccare comandi distruttivi, salvo configurazione esplicita di scrittura.
- **Input sanitization**: valida sempre i parametri prima di passarli a script di sistema, query database o bridge remoti.
- **XSS / output safety**: nel server ColdFusion, tratta l'output in base alla destinazione finale anche se i tool MCP restituiscono normalmente JSON o testo.
- **Schema rigorosi**: ogni schema tool deve essere valido e consumabile da client severi.
- **Array completi**: ogni `type: "array"` deve sempre definire `items`, anche per array annidati.
- **Error handling**: non far crashare il server MCP in caso di errore operativo. Restituisci un messaggio chiaro con `isError: true` e, quando possibile, un payload strutturato.
- **Hint e permessi**: quando la libreria usata lo consente, aggiungi annotations coerenti (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `title`).

---

## 5. Output, token bloat e artifacts

Per mantenere le conversazioni fluide ed evitare il limite di token, e' fondamentale gestire correttamente il trasferimento di grandi moli di dati.

### Il pattern `save_path`

NON restituire file binari Base64 o testi estremamente lunghi direttamente nel `content` della risposta del tool se non strettamente necessario.

1. **Parametro `save_path`**: ogni tool di download o export deve accettare un parametro opzionale `save_path`.
2. **Scrittura su disco**: se `save_path` e' fornito, il server MCP deve scrivere il file direttamente sul filesystem locale.
3. **Risposta leggera**: invece del contenuto del file, il tool deve restituire un messaggio di conferma con il path del file salvato.

### Evoluzione consentita

Se introduci artifacts o resources MCP:

- non rompere `save_path`
- affianca al comportamento legacy un output piu' strutturato
- preferisci `content` breve + `structuredContent` stabile
- usa resource link o riferimenti a file/artifact quando il risultato e' riusabile

---

## 6. Manutenzione del repository

- **File encoding**:
  - Server Node/JS: **UTF-8** senza BOM.
  - Bridge ColdFusion (`.cfm`, `.cfc`): **UTF-8 con BOM**.
- **Logging**: usa `console.log` solo per debug critici lato server. In produzione, preferisci risposte JSON strutturate.
- **Build synchronization**:
  - per i progetti TypeScript, dopo ogni modifica in `src/` esegui la build, ad esempio `npx tsc`
  - assicurati che `dist/` o la destinazione indicata nel `main` del `package.json` sia sincronizzata con il sorgente
- **Richiesta riavvio**: dopo ogni modifica al codice di un server MCP, chiedi esplicitamente all'utente di riavviare il server per rendere effettive le modifiche e procedere con i test
- **Aggiornamenti coordinati**: se tocchi schema tool, aggiorna anche test, esempi, documentazione locale e, se opportuno, skill correlate

---

## 7. Sviluppo o refactoring di server MCP

Se devi creare o rifattorizzare un server MCP:

1. Crea o mantieni una cartella dedicata `[nome]-node`.
2. Mantieni un `package.json` chiaro con dipendenze SDK MCP coerenti.
3. Implementa o rifattorizza seguendo il pattern `action` quando appropriato.
4. Crea o aggiorna `.env.example` per documentare le variabili necessarie.
5. Aggiorna gli script di generazione configurazione (`genera_mcp_json.ps1`, `.sh` o equivalenti) quando aggiungi nuovi server.
6. Aggiungi smoke test su `tools/list` e, quando possibile, sulla validita' degli input schema.
7. Se introduci capability nuove come resources, prompts o progress, fallo in modo incrementale e documentato.

### Capability target raccomandate

La traiettoria del repo e' evolvere da approccio quasi solo `tools` verso una base piu' matura con:

- tools ben tipizzati
- resources per contenuti o artefatti riusabili
- prompts MCP per workflow ricorrenti e user-invoked
- output strutturati
- progress per operazioni lunghe
- supporto `roots` quando disponibile

Non rendere queste capability obbligatorie tutte insieme: introducile per milestone, senza rompere il funzionamento corrente.

---

## 8. Skills: ruolo, gerarchia e uso corretto

Le skill non sono documentazione ornamentale: sono parte della governance operativa del repository.

### Gerarchia attuale da rispettare

- **Coordinamento generale**: `mcp-master-orchestrator`
- **Intake e analisi tecnica multi-sorgente**: `mcp-technical-analyst`
- **Skill specialistiche / sidecar**: Git/Mantis, Docs, DB, Office, ColdFusion, Browser e altre skill di dominio

### Regole di uso

- Se il task richiede ricostruzione tecnica, gap analysis, correlazione fra ticket, documenti, commit, DB o allegati, parti da `mcp-technical-analyst`.
- Se il task e' ampio, multi-fase e richiede routing fra piu' skill o piu' server, usa `mcp-master-orchestrator`.
- Se il task e' diretto e specialistico, usa prima la skill di dominio o il server MCP rilevante.
- Non duplicare in `AGENTS.md` tutto il contenuto delle skill: qui vanno solo le regole di routing e i principi comuni.

### Evoluzione delle skill

Quando una skill cresce troppo:

- lascia in `SKILL.md` il trigger, i confini, i workflow e i criteri di decisione
- sposta la parte deterministica in `scripts/`
- sposta riferimenti lunghi o opzionali in `references/`
- se il workflow e' molto ricorrente, valuta anche una traduzione parziale in prompt MCP

---

## 9. Compatibilita' con Copilot, Codex e altri host

Questo repository non deve essere pensato solo per un host singolo.

### Regole minime

- I nomi tool devono restare stabili salvo migrazioni deliberate e documentate.
- Gli schema input devono essere validi e completi.
- Gli output devono essere chiari sia per UI sia per consumo machine-readable.
- Evita dipendenze da feature di spec troppo immature come requisito obbligatorio.
- Mantieni comportamento coerente tra host locali e remoti per quanto possibile.

### Smoke test consigliati

Per ogni server rilevante, prevedi almeno:

1. avvio server
2. `tools/list`
3. validazione ricorsiva degli `inputSchema`
4. almeno una invocazione read-only di esempio
5. test di regressione per bug di compatibilita' gia' emersi

---

## 10. Definizione di done per una modifica MCP/skill

Una modifica e' considerata completa quando:

- il codice implementa il comportamento richiesto
- la compatibilita' legacy e' preservata, salvo istruzioni contrarie
- gli schema tool sono validi e compatibili con client severi
- test e smoke test sono aggiornati
- la documentazione locale e' aggiornata
- l'utente e' informato se serve riavviare il server
- eventuali skill coinvolte sono state allineate

---

## 11. Regola finale di comportamento

Quando sei in dubbio:

1. privilegia compatibilita' e incrementi piccoli
2. non rompere `action`, `project_path` e `save_path` senza motivo forte
3. instrada prima il task verso la skill giusta
4. mantieni il repository coerente con la spec tecnica aggiornata
5. ottimizza per efficacia agentica reale, non per eleganza astratta

---

Documento unificato per Codex e agenti compatibili.
Base operativa derivata da `AGENTS.md` del repository e aggiornata per allinearsi alla roadmap MCP + skills e all'introduzione di `mcp-technical-analyst`.