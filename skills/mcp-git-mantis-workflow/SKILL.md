---
name: mcp-git-mantis-workflow
description: Gestione del ciclo di vita del software integrando git-node e mantis-node. Utilizzare per legare commit Git a issue Mantis, analizzare conflitti e monitorare lo stato del progetto.
---

# MCP Git & Mantis Workflow

Questo skill unifica la gestione del codice e il tracking dei bug/task integrando `git-node` e `mantis-node`.

## Workflow Ottimizzato

1.  **Analisi Contesto**: Prima di lavorare su un bug, usa `mantis_get_issue` per leggere la descrizione e le note del ticket.
2.  **Tracking Git**: Usa `git_query` per identificare file modificati e storia dei commit.
3.  **Cross-Referencing**:
    *   Cerca l'ID dell'issue nei messaggi di commit (`git_query` con `search_text: "issue_id"`).
    *   Usa `git_diff` per vedere cosa è cambiato rispetto alla baseline del ticket.
4.  **Aggiornamento Stato**: Dopo un commit importante, aggiungi una nota al ticket Mantis usando `mantis_add_note` includendo l'hash del commit.

## Sinergie e Best Practices

*   **Gestione Conflitti**: Usa `git_conflict_manager` per analizzare e risolvere merge/rebase complessi step-by-step.
*   **Blame & Notes**: Se non capisci una riga di codice, usa `git_query` `action: "blame"`, trova l'autore e cerca eventuali note correlate in Mantis risalenti alla data del commit.
*   **Clean Status**: Prima di qualsiasi operazione Mantis, verifica che il repo Git locale sia in uno stato pulito (`status`).

## Risoluzione Problemi

*   **Mantis Connection**: Assicurati che `MANTIS_URL` e `MANTIS_TOKEN` nel `.env` siano corretti.
*   **Git Error**: Molti tool Git richiedono il `project_path` assoluto. Verificalo prima di chiamare il tool.
