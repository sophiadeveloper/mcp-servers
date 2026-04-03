# Future backlog MCP / Skills (dettaglio operativo)

Versione: 2026-04-03  
Stato: backlog **attivo** post-M6.

Questo documento raccoglie il dettaglio operativo delle milestone future (M7/M8), separato dalla guida viva per mantenere leggibilita' e ridurre rumore.

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

## Milestone 8 — Packaging e distribuzione

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
