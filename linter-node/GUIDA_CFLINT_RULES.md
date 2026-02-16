# Guida alla Personalizzazione delle Regole CFML (Linter MCP)

Il server `linter-mcp-server` supporta la personalizzazione delle regole per il linting CFML tramite il file di configurazione standard di **CFLint**.

## 1. Creazione del File di Configurazione

Crea un file chiamato `.cflintrc` nella radice del tuo progetto (o in una qualsiasi cartella padre del file CFC/CFM che stai analizzando).

Esempio di contenuto:

```json
{
  "rule": [
    {
      "name": "MISSING_VAR",
      "severity": "INFO",
      "message": "Variable is missing var declaration"
    },
    {
        "name": "COMPONENT_HINT_MISSING",
        "severity": "ERROR"
    }
  ],
  "excludes": [],
  "includes": []
}
```

## 2. Come Funzona

Il server cerca automaticamente questo file risalendo la alberatura delle directory partendo dal file analizzato. Se lo trova, lo passa a CFLint tramite l'opzione `-configfile`.

## 3. Parametri Principali

*   **rule**: Un array di oggetti regola.
    *   **name**: L'ID della regola (es. `MISSING_VAR`, `ARG_TYPE_MISSING`, ecc.).
    *   **severity**: Il livello di gravità (`ERROR`, `WARNING`, `INFO`).
    *   **message**: (Opzionale) Messaggio personalizzato.
*   **excludes**: Un array di regole da escludere completamente.
*   **includes**: Un array di regole da includere (se vuoto, include tutte tranne le escluse).

## 4. Regole Comuni

Ecco alcune regole comuni di CFLint:
*   `MISSING_VAR`: Variabile locale non dichiarata con `var`.
*   `ARG_VAR_CONFLICT`: Un argomento ha lo stesso nome di una variabile locale.
*   `COMPONENT_HINT_MISSING`: Manca l'attributo `hint` nel tag `cfcomponent`.
*   `FUNCTION_HINT_MISSING`: Manca l'attributo `hint` nel tag `cffunction`.
*   `ARG_TYPE_MISSING`: Manca il tipo dell'argomento.
*   `UnusedLocalVar`: Variabile locale dichiarata ma non usata.

Per la lista completa, consultare la documentazione ufficiale di CFLint.
