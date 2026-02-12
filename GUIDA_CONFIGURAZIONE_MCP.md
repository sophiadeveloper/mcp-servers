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
    *   Crea un file `.env` nella cartella del server (puoi copiare `.env.example` se presente).
    *   Compila le variabili richieste.

## 4. Troubleshooting (Risoluzione Problemi)

*   **Il server non si avvia / Pallino rosso**:
    *   Controlla i percorsi nel JSON: sono corretti? Esistono i file?
    *   Controlla i log dell'editor (Output -> MCP Server Log) per vedere l'errore specifico.
*   **Errore "command not found" (es. git)**:
    *   Aggiungi il percorso del comando alla variabile `PATH` nella sezione `env` del JSON (vedi esempio Git sopra).
*   **Modifiche non rilevate**:
    *   Dopo aver modificato il file JSON di configurazione, riavvia Antigravity o usa il comando "Reload Window".
