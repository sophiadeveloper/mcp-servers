# AGENTS.md - Repository Governance & Best Practices

Questo documento definisce le regole e le best practice per gli agenti AI che lavorano su questo repository di MCP server. L'obiettivo è mantenere coerenza, sicurezza e massima efficienza nell'interazione tra agente e tool.

## 1. Architettura dei Tool: Strategia di Condensazione

Tutti i nuovi tool (o refactoring di quelli esistenti) DEVONO seguire la **Strategia di Condensazione**. Invece di esporre decine di tool granulari, raggruppali per categoria logica.

### Il Pattern "Action"
Ogni tool condensato deve accettare un parametro obbligatorio `action` di tipo `enum`.

```javascript
// Esempio di schema condensato
{
  name: "git_query",
  description: "Esplora lo stato e la storia del repository Git (Sola Lettura).",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "history", "blame"], // Enum espliciti
        description: "L'operazione specifica da eseguire."
      },
      project_path: { type: "string", description: "Path root del progetto target." },
      // ... altri parametri specifici per le varie azioni
    },
    required: ["action", "project_path"]
  }
}
```

### Regole per la Condensazione:
1.  **Grouping logico**: Raggruppa per intento (es. sola lettura vs scrittura, admin vs navigazione).
2.  **Descrizioni Ricche**: Fornisci descrizioni dettagliate per ogni valore dell'enum `action` per aiutare l'agente a scegliere correttamente.
3.  **Parametri Opzionali**: Usa parametri opzionali per coprire le diverse esigenze delle varie `action` all'interno dello stesso tool.

## 2. Gestione del Contesto e Progetti

Poiché i server MCP operano su diversi repository locali, è fondamentale gestire correttamente il contesto del progetto.

- **project_path obbligatorio**: Quasi tutti i tool dovrebbero richiedere un `project_path` per individuare correttamente la cartella di lavoro o il file `.env`.
- **Target Configuration**: Usa una funzione helper (come `getTargetConfig` nel CF server) per caricare credenziali o URL bridge specifici dal file `.env` contenuto nel `project_path`.

## 3. Sicurezza e Validazione

- **Read-Only Guards**: Per i server SQL, mantieni sempre una funzione di validazione (es. `isQueryReadOnly`) per bloccare comandi distruttivi (INSERT, UPDATE, DELETE, DROP) a meno che non sia esplicitamente configurato un accesso in scrittura.
- **Input Sanitization**: Valida sempre i parametri prima di passarli a script di sistema o query database.
- **XSS Protection**: Nel server ColdFusion, ricorda che l'output deve essere trattato in base alla destinazione finale (anche se i tool MCP restituiscono tipicamente JSON o testo).

## 4. Manutenzione del Repository

- **File Encoding**: 
    - Server Node/JS: **UTF-8** (senza BOM).
    - Bridge ColdFusion (.cfm, .cfc): **UTF-8 con BOM**.
- **Logging**: Usa `console.log` solo per debug critici lato server. In produzione, rispondi con oggetti JSON strutturati.
- **Error Handling**: Non far crashare il server MCP in caso di errore operativo (es. file non trovato). Restituisci un messaggio di errore chiaro all'agente con `isError: true`.

## 5. Sviluppo di Nuovi Server MCP

Se devi creare un nuovo server (es. `monitoring-node`):
1.  Crea una cartella dedicata `[nome]-node`.
2.  Inizializza `package.json` con le dipendenze SDK MCP.
3.  Implementa `index.js` seguendo il pattern `action`.
4.  Crea un file `.env.example` per documentare le variabili necessarie.
5.  Aggiorna il `genera_mcp_json.ps1` (o .sh) per includere il nuovo server nella configurazione globale.

---
*Documento creato il 2026-03-16 per supportare l'evoluzione del framework MCP interno.*
