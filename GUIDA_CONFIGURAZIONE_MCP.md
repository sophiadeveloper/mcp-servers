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

**Nota Importante**: A differenza degli altri server, questo utilizza `tsx` per eseguire direttamente i file TypeScript (`src/index.ts`) e richiede la configurazione di variabili d'ambiente specifiche per ColdFusion.

```json
"linter-node": {
  "command": "node",
  "args": [
    "D:\\mcp-servers\\linter-node\\node_modules\\tsx\\dist\\cli.mjs",
    "D:\\mcp-servers\\linter-node\\src\\index.ts"
  ],
  "env": {
    "CFLINT_JAR": "C:\\tesisquare\\cflint\\CFLint-1.5.0-all.jar",
    "JAVA_BIN": "D:\\programmi\\ColdFusion2023\\jre\\bin\\java.exe"
  }
}
```

*   **Command**: Usa `node` generico.
*   **Args[0]**: Punta al loader `tsx` installato nei `node_modules` del progetto (in formato Windows con doppi backslash `\\`).
*   **Args[1]**: Punta al file sorgente `src/index.ts`.
*   **Env**: Definisce i percorsi per il JAR di CFLint e per l'eseguibile Java (JRE di ColdFusion).

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
    *   Crea un file `.env` nella cartella root del tuo workspace o affidati al blocco `env` del file `mcp_config.json`.
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

---

## 5. Troubleshooting (Risoluzione Problemi)

*   **Il server non si avvia / Pallino rosso**:
    *   Controlla i percorsi nel JSON: sono corretti? Esistono i file?
    *   Controlla i log dell'editor (Output -> MCP Server Log) per vedere l'errore specifico.
*   **Errore "command not found" (es. git)**:
    *   Su Windows: Aggiungi il percorso alla variabile `PATH` nel JSON.
    *   Su Linux: Verifica che il comando sia nel PATH o usa il percorso assoluto (es. `/usr/bin/git`).
*   **Modifiche non rilevate**:
    *   Dopo aver modificato il file JSON di configurazione, riavvia Antigravity o usa il comando "Reload Window".
*   **Errore `esbuild` su nuovo ambiente**:
    *   Se il server `linter-node` non parte e ricevi errori legati a `esbuild` o binari mancanti, prova a eseguire `npm rebuild esbuild` nella cartella `d:\mcp-servers\linter-node`. Questo ricompila le dipendenze native per il tuo sistema corrente.
