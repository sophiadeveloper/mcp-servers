# Guida all'Installazione e Configurazione di Server MCP in Antigravity/VSCode

Questa guida illustra i passaggi necessari per configurare un server MCP (Model Context Protocol) all'interno dell'editor Antigravity (o VSCode con estensione MCP).

La procedura è divisa in due parti:
1.  **Configurazione dell'Editor**: Come dire all'editor dove trovare ed eseguire il server MCP.
2.  **Preparazione del Server**: Come assicurarsi che lo script del server sia pronto per l'esecuzione (dipendenze, variabili d'ambiente).

---

## 1. Configurazione dell'Editor (Antigravity)

Dobbiamo istruire l'editor su come avviare il nostro script MCP.

1.  In Antigravity, apri il menu di configurazione dei server MCP.
    *   Solitamente accessibile cliccando sui tre puntini `...` in alto o cercando "MCP" nella Command Palette (`Ctrl+Shift+P` o `Cmd+Shift+P`).
2.  Seleziona **Configure MCP Servers** o **Edit Configuration**.
3.  Si aprirà un file di configurazione JSON (spesso chiamato `mcp_server_config.json` o situato nelle impostazioni utente).
4.  Individua la sezione `"mcpServers"` e aggiungi la configurazione per il tuo server.

### Struttura Generica JSON

Ecco un modello generico da utilizzare. Sostituisci i percorsi con quelli del tuo sistema.

```json
{
  "mcpServers": {
    "nome-del-tuo-server": {
      "command": "C:\\Percorso\\Assoluto\\Per\\node.exe",
      "args": [
        "C:\\Percorso\\Assoluto\\Del\\Tuo\\Progetto\\index.js"
      ],
      "env": {
        "NOME_VARIABILE": "valore",
        "PATH": "C:\\Percorso\\Binari\\Necessari;${env:PATH}"
      },
      "disabled": false
    }
  }
}
```

### ⚠️ ATTENZIONE AI PERCORSI (WINDOWS)

*   **Node.js**: Verifica il percorso esatto del tuo eseguibile `node.exe`.
    *   Esempio: `C:\\Program Files\\nodejs\\node.exe` o `D:\\programmi\\nodejs\\node.exe`.
    *   Puoi trovarlo eseguendo `where node` nel terminale (prompt dei comandi).
*   **Script Index**: Verifica dove hai salvato il file `index.js` del server MCP.
*   **Doppi Backslash**: Nei file JSON su Windows, usa sempre il doppio backslash `\\` per separare le cartelle (es. `C:\\Cartella\\File`).

---

## 2. Esempi di Configurazione Specifica

Di seguito sono riportati esempi di configurazione per i server presenti in questo workspace.

### A. Git MCP Server (`git-node`)

Questo server richiede l'accesso all'eseguibile `git`. È fondamentale configurare correttamente la variabile `PATH` se Git non è rilevato automaticamente.

```json
"git-mcp-server": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\mcp-servers\\git-node\\index.js"
  ],
  "env": {
    "PATH": "C:\\Program Files\\Git\\cmd;${env:PATH}"
  }
}
```
*Nota: Assicurati che il percorso di `git-node\\index.js` sia corretto e che `C:\\Program Files\\Git\\cmd` corrisponda alla tua installazione di Git.*

### B. SQL MCP Server (`sql-node`)

Questo server potrebbe richiedere variabili d'ambiente per la connessione al database (es. `DB_HOST`, `DB_USER`) se non sono gestite internamente o tramite file `.env`.

```json
"sql-mcp-server": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\mcp-servers\\sql-node\\index.js"
  ]
}
```

#### Configurazione Tunnel SSH (Opzionale)
Il server `sql-node` supporta la connessione tramite tunnel SSH per i database **MySQL** e **PostgreSQL**. Per attivarlo, aggiungi le seguenti variabili nel file `.env` del progetto (o nel blocco `env` della configurazione sopra):

*   `SSH_HOST`: Host del server SSH.
*   `SSH_PORT`: Porta SSH (default 22).
*   `SSH_USER`: Username SSH.
*   `SSH_PASSWORD`: Password SSH (opzionale se si usa la chiave).
*   `SSH_KEY_PATH`: Percorso assoluto alla chiave privata RSA (es. `C:\\Users\\utente\\.ssh\\id_rsa`).

Se `SSH_HOST` è configurato, il server aprirà automaticamente un tunnel sicuro prima di tentare la connessione al database.

### C. Mantis MCP Server (`mantis-node`)

Simile agli altri, punta all'index.js del progetto Mantis.

```json
"mantis-mcp-server": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\mcp-servers\\mantis-node\\index.js"
  ]
}
```

### D. ColdFusion MCP Server (`cf-node`)

```json
"cf-mcp-server": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\mcp-servers\\cf-node\\index.js"
  ]
}
```

### E. Linter MCP Server (`linter-node`)

**Nota Importante**: Questo server è scritto in TypeScript. Per garantire stabilità e performance, deve essere eseguito puntando alla versione compilata nella cartella `dist/`.

```json
"linter-node": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\mcp-servers\\linter-node\\dist\\index.js"
  ],
  "env": {
    "CFLINT_JAR": "C:\\tesisquare\\cflint\\CFLint-1.5.0-all.jar",
    "JAVA_BIN": "D:\\programmi\\ColdFusion2023\\jre\\bin\\java.exe"
  }
}
```

*   **Command**: Percorso assoluto al tuo `node.exe`.
*   **Args[0]**: Punta al file compilato `dist/index.js`.
*   **Env**: Definisce i percorsi per il JAR di CFLint e per l'eseguibile Java. In alternativa al blocco `env` del JSON, puoi creare un file `.env` nella cartella `linter-node/` basandoti sul file `linter-node/.env.example`.
*   **Build**: Se apporti modifiche al codice sorgente in `src/`, ricordati di eseguire `npm run build` nella cartella `linter-node` per aggiornare i file in `dist/`.

### F. Playwright MCP Server (`playwright-node`)

Questo server implementa web-browsing e agentic automation.
Le configurazioni di sicurezza e di ottimizzazione vengono fornite direttamente nel blocco `env` del file di configurazione (`mcp_config.json`), e non necessitano di un file `.env` sparso nella cartella del progetto.

*   `ALLOWED_URLS`: Specifica i domini consentiti separati da virgola in modo da assicurare una navigazione limitata (es. `tuodomino.it,esempio.com`). Non specificandolo o usandolo senza blocchi navigherà nativamente solo su `localhost` e `127.0.0.1`. Se vuoi permettere qualsiasi navigazione senza restrizioni, usa `*`.
*   `BLOCK_MEDIA`: Se impostato a `"true"`, indica al server di intercettare e bloccare tutto il traffico relativo a immagini, video e font, facendoti risparmiare preziosa banda, memoria e cicli CPU (ottimo nei casi in cui all'agente interessa solo testo/DOM e non l'estetica).

```json
"playwright-mcp-server": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\mcp-servers\\playwright-node\\index.js"
  ],
  "env": {
    "ALLOWED_URLS": "localhost,127.0.0.1",
    "BLOCK_MEDIA": "false"
  }
}
```

### G. Documentation MCP Server (`docs-node`)

Questo server indicizza file Markdown (`.md`) e cartelle in un database locale SQLite (senza necessità di database esterni) fornendo capacità di **Full-Text Search (FTS5)**. Permette all'AI di consultare istantaneamente documentazione complessa e raggrupparla in "scaffali".

```json
"docs-mcp-server": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\mcp-servers\\docs-node\\index.js"
  ]
}
```

**Esempi d'uso per l'Agente AI:**
*   `docs_scan_folder`: Scansiona un'intera directory per file `.md`.
    *   *Esempio*: `folder_path: "D:\\docs\\pte-docs", shelf: "Tesisquare PTE"`
    *   *Esempio*: `folder_path: "D:\\docs\\coding-standards", shelf: "Tesisquare Coding Standards"`
    *   *Nota sull'aggiornamento*: Se i file su disco vengono modificati, basta ri-eseguire lo stesso tool `docs_scan_folder` (o `docs_scan_file`). Il sistema è idempotente: aggiornerà automaticamente il contenuto e l'indice FTS5 per i file già esistenti nello scaffale, senza creare duplicati. I file originali non sono più necessari al server dopo la scansione.
*   `docs_search`: Esegue una query semantica sul database tramite BM25 (es. `query: "come fare il deploy", shelf: "Tesisquare PTE"`). Restituisce gli snippet e un `id` documento.
*   `docs_read_document`: Consente all'AI di estrarre l'intero contenuto testuale markdown di un documento noto il suo ID (proveniente dai risultati di docs_search).
*   `docs_create_shelf` e `docs_update_shelf`: Permettono di associare una `description` parlante allo scaffale in modo che in futuro, tramite list_shelves, si sappia in anticipo quale contesto stiamo interrogando.

---

## 3. Preparazione del Server (Prerequisiti)

Prima che l'editor possa avviare il server, devi assicurarti che il server stesso funzioni.

1.  **Installazione di Node.js**:
    *   Assicurati di avere Node.js installato sul tuo sistema (versione LTS consigliata).
    *   Verifica l'installazione aprendo un terminale e digitando `node -v` e `npm -v`.
2.  **Verifica Moduli (Opzionale)**:
    *   Le dipendenze dovrebbero essere già presenti nella cartella `node_modules` del repository.
    *   Solo se dovessi riscontrare errori di "modulo non trovato", apri un terminale nella cartella del server ed esegui `npm install`.
3.  **Configurazione `.env`**:
    *   Molti server richiedono un file `.env` per funzionare (per password, token API, ecc.).
    *   Copia il file `.env.example` presente nella root del workspace rinominandolo in `.env`.
    *   Compila le variabili necessarie seguendo lo schema riportato di seguito.

### Variabili d'Ambiente (.env)

Il progetto utilizza un file `.env` centrale nella root per gestire le configurazioni sensibili e i percorsi locali. Di seguito il dettaglio delle variabili supportate:

| Variabile | Descrizione | Note |
|:---|:---|:---|
| `DB_TYPE` | Tipo di database | `mssql`, `mysql`, `postgres`, `oracle` |
| `DB_SERVER` | Host del database | IP o hostname |
| `DB_INSTANCE` | Istanza (MSSQL) | Opzionale (es. `SQLEXPRESS`) |
| `DB_PORT` | Porta del database | Default: `1433` (MSSQL), `3306` (MySQL) |
| `DB_NAME` | Nome del database | |
| `DB_USER` | Username DB | |
| `DB_PASSWORD` | Password DB | |
| `MANTIS_URL` | URL Mantis | URL completo dell'istanza Helpdesk |
| `MANTIS_TOKEN` | Token API Mantis | Generabile dal profilo utente |
| `MANTIS_PROJECT_ID`| ID Progetti Mantis | Singolo o lista separata da `;` |
| `CFLINT_JAR` | Path JAR CFLint | Percorso assoluto al file `.jar` |
| `JAVA_BIN` | Path java.exe | Percorso assoluto all'eseguibile Java |
| `CFLINT_CONFIG` | Path .cflintrc | (Opzionale) File di regole globale (JSON) |

4.  **Installazione Browser (Solo per `playwright-node`)**:
    *   Prima dei primissimo avvio, Playwright ha bisogno di scaricare i binari dei browser headless sul tuo sistema.
    *   Apri un terminale dentro la cartella `playwright-node` ed esegui `npx playwright install chromium`.

## 4. Configurazione VSCode Remote (Ubuntu/Linux)

Se utilizzi VSCode collegato a una macchina remota (SSH, WSL, DevContainers) con sistema operativo Ubuntu/Linux, la configurazione cambia leggermente. I server MCP girano nell'ambiente **remoto**, quindi i percorsi devono riferirsi al filesystem di Ubuntu.

### 1. Preparazione dell'Ambiente Remoto
Poiché i server girano sulla macchina Linux, **Node.js e i file dei server devono essere presenti SUL SERVER REMOTO**, non sulla tua macchina locale (Windows).

**A. Installa Node.js (se non presente):**
Apri il terminale integrato in VSCode (connesso al remoto) ed esegui:
```bash
# Aggiorna i repository
sudo apt update
# Installa Node.js e npm
sudo apt install nodejs npm -y
# Verifica l'installazione
node -v
```

**D. Installa Dipendenze in ogni Server:**
Questa è la fase più importante per evitare problemi di binari (come `esbuild`). Per ogni cartella di server (`linter-node`, `git-node`, ecc.), devi eseguire l'installazione delle dipendenze:
1.  Apri il terminale.
2.  Entra nella cartella (es. `cd linter-node`).
3.  Esegui `npm install`.
    *   Questo comando scarica i pacchetti e compila i binari per il *tuo* sistema operativo specifico.

---

**B. Scarica i Server MCP:**
Scarica il repository ufficiale direttamente sul filesystem del server remoto.
```bash
# Vai nella tua home directory (o altra cartella di destinazione)
cd ~
# Clona il repository
git clone https://github.com/sophiadeveloper/mcp-servers.git
# Entra nella cartella scaricata
cd mcp-servers
```

**C. Installa Dipendenze:**
Per ogni server che intendi utilizzare, entra nella cartella ed esegui `npm install`.
```bash
cd git-node
npm install
cd ..
# Ripeti per sql-node, ecc.
```

### 2. Differenze Chiave nella Configurazione JSON
*   **Percorsi**: Usa gli slash in avanti `/` invece dei backslash `\`. Non servono doppi slash.
*   **Eseguibili**: Usa `node` anziché `node.exe`.
*   **Separatori**: Nelle variabili d'ambiente (es. `PATH`), il separatore è i due punti `:` invece del punto e virgola `;`.

### 3. Come trovare i percorsi corretti (Linux)
1.  Apri il terminale integrato in VSCode (che sarà collegato a Ubuntu).
2.  **Percorso Node**: Digita `which node` nel terminale.
    *   *Output tipico*: `/usr/bin/node` oppure `/home/nomeutente/.nvm/versions/node/v20.x/bin/node`.
3.  **Percorso Script**: Naviga nella cartella dello script e digita `pwd` per ottenere il percorso assoluto.

### 4. Esempio di Configurazione JSON (Linux)

Ecco come appare la configurazione per un ambiente Ubuntu.
> **NOTA**: Usa `pwd` per trovare il percorso assoluto della cartella `mcp-servers` che hai appena clonato.
> Supponiamo che tu abbia clonato in `/home/utente/mcp-servers`.

```json
{
  "mcpServers": {
    "git-mcp-server": {
      "command": "/usr/bin/node",
      "args": [
        "/home/utente/mcp-servers/git-node/index.js"
      ],
      "env": {
        "PATH": "/usr/bin:/usr/local/bin:${env:PATH}"
      },
      "disabled": false
    }
  }
}
```

### Note Specifiche
*   **Permessi**: Assicurati che l'utente remoto abbia i permessi di lettura sulla cartella dei server e di esecuzione su Node.
*   **NVM**: Se usi NVM, il percorso di Node cambia tra le versioni. È consigliabile usare il path assoluto restituito da `which node` per evitare problemi di avvio.

## 6. Integrazione Skills e MCP negli IDE

Oltre alla configurazione tecnica dei server (Capitolo 1 e 2), è possibile "istruire" gli agenti AI all'interno dei vari IDE per utilizzare al meglio le procedure definite nella cartella `skills/`.

### A. VSCode (GitHub Copilot / Cline / Roo Code)
A partire dalle versioni 2026, VS Code e le estensioni agentiche hanno standardizzato il supporto nativo per le Agent Skills.

1.  **Server MCP**: Usa `cline_mcp_settings.json` come descritto sopra.
2.  **Percorso Skills (Nativo)**: Copia l'alberatura della cartella `skills/` in:
    *   **Progetto**: `.github/skills/` (per GitHub Copilot Agent Mode).
    *   **Progetto**: `.cursorrules` (per Cursor, incollando il contenuto testuale).
3.  **Utilizzo**: Puoi invocare le skill con i comandi slash (es. `/mcp-database-expert`) o lasciare che l'agente le attivi automaticamente.

### B. Goose (Block)
Goose supporta le skills in modo fluido e scansiona automaticamente diverse directory all'avvio.

1.  **Percorso Skills (Globale)**: Incolla le cartelle delle skills in:
    *   `~/.config/goose/skills/` (Specifico Goose)
    *   `~/.config/agents/skills/` (Generico per più agenti)
    *   `~/.claude/skills/` (Condiviso con Claude Desktop)
2.  **Sinergia**: L'MCP fornisce l'accesso tecnico (strumenti), mentre la skill nel file `SKILL.md` detta il processo aziendale e le regole operative.

### C. Google Antigravity
Essendo un IDE "agent-first", Antigravity mette le skills al centro del flusso di lavoro seguendo il principio della *progressive disclosure*.

1.  **Percorso Skills**:
    *   **Progetto**: `.agent/skills/`
    *   **Globale**: `~/.gemini/antigravity/skills/`
2.  **Funzionamento**: L'agente legge nomi e descrizioni all'avvio e carica l'intero contenuto solo quando la skill diventa rilevante per il task, ottimizzando i token.

### D. Claude Code (CLI)
1.  **Percorso Skills**: Claude Code scansiona la root del progetto. Mantenere la cartella `skills/` nella root è sufficiente affinché l'agente le utilizzi come contesto operativo.

### E. GPT Codex (VS Code Extension)
Codex utilizza una configurazione unificata per i server MCP e le skills, preferendo il formato **TOML**.

1.  **Server MCP**:
    *   **File di configurazione**: `~/.codex/config.toml` (globale) o `.codex/config.toml` (progetto).
    *   Esempio di aggiunta server:
        ```toml
        [mcp_servers.git-server]
        command = "node"
        args = ["C:/mcp-servers/git-node/index.js"]
        ```
    *   Puoi anche aggiungerli tramite comando CLI: `codex mcp add <nome> -- node index.js`.
2.  **Percorso Skills**: Incolla le cartelle delle skills in:
    *   **Progetto**: `.codex/skills/`
3.  **Attivazione**: Puoi attivare una skill manualmente scrivendo `$` seguito dal nome della skill nella chat, oppure lasciare che Codex la attivi automaticamente in base alla `description` nel frontmatter del file `SKILL.md`.

### F. Altri IDE AI-First
Per strumenti che non hanno ancora un'integrazione MCP nativa tramite configurazione JSON:

1.  **Proxy**: Usa un tool come `mcp-proxy` per esporre i server locali.
2.  **Skills come Prompt**: Inserisci le istruzioni delle skills nel "System Prompt" o "Context Window" dell'IDE. Le nostre skills sono scritte in formato Markdown proprio per essere facilmente digerite da qualsiasi LLM come istruzioni di sistema.

---

## 7. Manutenzione delle Skills

Le skills contenute nella cartella `skills/` sono pacchettizzate per **Gemini CLI**. Se desideri aggiornarle o crearne di nuove:

1.  Modifica il file `SKILL.md` nella sottocartella specifica.
2.  (Opzionale) Se usi Gemini CLI, ricrea il pacchetto:
    ```bash
    node ./scripts/package_skill.cjs ./skills/nome-skill
    ```
3.  Reinstalla la skill per aggiornare la memoria globale dell'agente.

