# Studio di Fattibilità: MCP Server Linter

## 1. Obiettivo
Creare un server MCP dedicato al **linting del codice** (`linter-mcp-server`) per centralizzare l'analisi statica del codice sorgente (CFML, JavaScript, SQL, ecc.) direttamente all'interno del flusso degli agenti AI (come Antigravity) e dell'IDE.

## 2. Contesto e Motivazione
Attualmente, gli agenti AI devono basarsi sulla conoscenza implicita delle best practice o eseguire comandi CLI manuali per verificare la qualità del codice. Questo processo è frammentato e incline a errori (es. configurazioni mancanti o output non strutturati). Un server MCP dedicato offrirebbe un'interfaccia standardizzata (`lint_file`, `fix_errors`) indipendentemente dal linguaggio sottostante.

## 3. Architettura Proposta
Si propone un'architettura modulare basata su **Node.js** (coerente con gli altri server `cf-node`, `git-node`, ecc.), che agisca da wrapper intelligente attorno agli strumenti di linting standard.

### Componenti Principali:
1.  **Core Server**: Gestione richieste MCP (tools/resources).
2.  **Plugin System**: Moduli specifici per linguaggio.
    *   **CFML**: Wrapper per **CFLint** (Java/CLI).
        *   **Implementazione**: Utilizzo del JAR esistente in `C:\tesisquare\cflint\CFLint-1.5.0-all.jar`.
        *   **Runtime**: Utilizzo della JRE di ColdFusion in `D:\programmi\ColdFusion2023\jre\bin\java.exe`.
        *   **Verifica**: Configurazione testata e funzionante (v1.5.0-SNAPSHOT). Essenziale per i progetti ColdFusion (.cfc, .cfm).
    *   **JavaScript/TypeScript**: Wrapper per **ESLint**.
    *   **SQL**: Wrapper per **SQLFluff** (o simili) per standardizzare le query.
    *   **PHP**: Wrapper per **PHP Code Sniffer (phpcs)**. Utile per analizzare codice PHP legacy o integrazioni.
    *   **Markdown**: Wrapper per **markdownlint** (utile per documentazione).
3.  **Config Manager**: Rilevamento automatico dei file di configurazione (`.cflintrc`, `.eslintrc.js`) nella root del progetto o fallback su configurazioni standard "best practice" interne.

### Strategia di Configurazione (Path)
Per garantire flessibilità e portabilità (es. diversi developer o server CI/CD), i percorsi degli eseguibili saranno configurati tramite **Variabili d'Ambiente** (file `.env`):
*   `CFLINT_JAR`: Percorso al JAR di CFLint (Default: `C:\tesisquare\cflint\CFLint-1.5.0-all.jar`)
*   `JAVA_HOME` o `JAVA_BIN`: Percorso all'eseguibile Java (Default: `D:\programmi\ColdFusion2023\jre\bin\java.exe`)

Il server tenterà di leggere queste variabili; se non definite, cercherà nei percorsi di default "noti" (verified paths).

## 4. Analisi Funzionale (Tools)

Il server esporrà i seguenti Tool MCP:

### `lint_code`
*   **Input**: `file_path` (string), `fix` (boolean, opzionale).
*   **Funzionamento**: Esegue il linter appropriato in base all'estensione del file.
*   **Output**: JSON strutturato con lista di errori (riga, colonna, severity, messaggio, rule_id). Se `fix=true`, tenta di correggere e restituisce il codice modificato o lo stato del file.

### `get_lint_config`
*   **Input**: `language` (enum: cfml, js, sql).
*   **Output**: Restituisce la configurazione attiva (regole abilitate) per quel progetto. Utile all'agente per capire "cosa" viene controllato.

### `check_syntax` (Opzionale)
*   **Input**: `code_snippet` (string), `language`.
*   **Funzionamento**: Linting rapido di uno snippet di codice non salvato (utile durante la generazione di codice da parte dell'LLM).

## 5. Analisi Tecnica e Rischi

### Vantaggi:
*   **Standardizzazione**: L'LLM non deve "immaginare" le regole, ma le riceve direttamente dal tool.
*   **Automazione**: Possibilità di creare workflow (es. `commit -> lint -> fix -> push`) interamente gestiti dall'agente.
*   **Riduzione Errori**: Identificazione proattiva di bug comuni (es. variabili non definite in CFML, SQL injection patterns).

### Sfide:
*   **Performance**: L'esecuzione di tool esterni (es. JVM per CFLint) può essere lenta (secondi). Il server dovrà gestire caching o demoni ove possibile.
*   **Dipendenze**: Necessità di avere i linter sottostanti installati nell'ambiente (Java per CFLint, Node modules per ESLint).
    *   *Soluzione*: Il server MCP potrebbe includere i binari necessari o verificare la loro presenza all'avvio.
*   **Parsing Output**: L'output dei linter CLI (spesso testo grezzo o XML) deve essere parsato robustamente in JSON per l'MCP.

## 6. Stima dello Sforzo (Implementation Plan)

### Fase 1: MVP (Proof of Concept) - 2 Giorni
*   Setup del progetto `linter-node` (TypeScript).
*   Implementazione del wrapper per **ESLint** (più semplice, nativo Node).
*   Implementazione del wrapper per **CFLint** (CLI execution).
*   Tool `lint_file` funzionante per .js e .cfm.

### Fase 2: Configurazione e Fix - 2 Giorni
*   Supporto per file di configurazione personalizzati.
*   Implementazione del flag `--fix` (autocorrezione).
*   Gestione degli errori e timeout.

### Fase 3: Estensione e Ottimizzazione - on-going
*   Aggiunta SQLFluff.
*   Ottimizzazione performance (keep-alive processes).

## 7. Costi
*   **Hardware**: Nullo (gira localmente).
*   **Licenze**: Open Source (CFLint, ESLint sono free).

## 8. Conclusione
L'implementazione di un `mcp-server-linter` è **altamente fattibile** e porterebbe un valore immediato al workflow di sviluppo, specialmente per il codebase ColdFusion dove gli strumenti di analisi statica integrati negli IDE moderni sono meno evoluti rispetto a JS/TS. Si consiglia di procedere con la Fase 1.
