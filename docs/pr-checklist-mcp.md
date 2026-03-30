# PR checklist MCP

Questa checklist aiuta a validare velocemente i server MCP prima di aprire una PR.

## Validazione schema tool

Esegui il controllo ricorsivo degli `inputSchema`:

```bash
node scripts/check-tool-schemas.js
```

Lo script:

- individua automaticamente i server `*-node/index.js` e `linter-node/src/index.ts`;
- estrae e valuta ogni `inputSchema` dei tool;
- segnala **errore** se trova nodi `type: "array"` senza `items`;
- aggiunge controlli minimi extra:
  - `type: "object"` senza `properties` (warning, salvo casi intenzionali con `additionalProperties: true` o `x_allow_empty_object: true`);
  - `required` non coerente (`required` non-array, chiavi non stringa, chiavi non presenti in `properties`, duplicati);
- stampa un report leggibile per file/tool;
- termina con exit code non-zero in presenza di errori.

## Uso in CI (opzionale)

Puoi integrare lo stesso check nella pipeline PR come step bloccante.
