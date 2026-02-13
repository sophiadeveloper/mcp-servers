# Guida alla Personalizzazione delle Regole SQL (Linter MCP)

Il server `linter-mcp-server` supporta la personalizzazione delle regole per il linting SQL tramite un file di configurazione JSON.

## 1. Creazione del File di Configurazione

Crea un file chiamato `.sql-lint.json` nella radice del tuo progetto (o in una qualsiasi cartella padre del file SQL che stai analizzando).

Esempio di contenuto:

```json
{
  "rules": {
    "no-select-star": "error",
    "unsafe-statement": "warning"
  }
}
```

## 2. Valori Supportati

Per ogni regola, puoi specificare uno dei seguenti livelli di severità:

*   `"error"`: Segnala la violazione come errore critico.
*   `"warning"`: Segnala la violazione come avvertimento.
*   `"off"`: Disabilita completamente la regola.

## 3. Regole Disponibili

Attualmente sono supportate le seguenti regole:

### `no-select-star`
Verifica l'uso di `SELECT *` nelle query. Esplicitare le colonne è una best practice per evitare problemi di performance e manutenibilità.
*   **Default**: `"warning"`

### `unsafe-statement`
Verifica che le istruzioni `UPDATE` e `DELETE` contengano sempre una clausola `WHERE` per prevenire modifiche accidentali all'intera tabella.
*   **Default**: `"error"`

## 4. Estensione delle Regole (Per Sviluppatori del Server)

Per aggiungere nuove regole, è necessario modificare il file `src/linters/sql.ts` nel codice sorgente del server:

1.  Apri `src/linters/sql.ts`.
2.  Trova la funzione `checkQuery`.
3.  Aggiungi un nuovo blocco `if` che analizza l'oggetto `query` (AST).
4.  Usa la funzione helper `report` per segnalare errori, passando l'ID della nuova regola.

Esempio di nuova regola custom:

```typescript
// Esempio: Controlla se la query usa 'DROP TABLE'
if (query.type === 'drop' && query.keyword === 'table') {
    report('no-drop-table', 1, 1, 'DROP TABLE is not allowed in production scripts.');
}
```

Ricordati di aggiungere la nuova regola anche all'interfaccia `SqlLintConfig` e all'oggetto `DEFAULT_CONFIG` se vuoi fornire un comportamento predefinito.
