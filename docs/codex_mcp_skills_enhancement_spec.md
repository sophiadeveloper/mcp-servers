# Specifica tecnica MCP/Skills (storicizzata)

Versione originale estesa: 2026-03-30  
Stato dal 2026-04-03: **documento superato come fonte operativa primaria**.

Questa spec era nata come documento ibrido (principi vivi + roadmap milestone dettagliata).  
Con il completamento sostanziale delle Milestone 0–6 nel branch `rework`, il contenuto e' stato separato per ridurre rumore operativo.

## Nuove fonti ufficiali

Per il lavoro corrente usare:

1. **Guida viva**: `docs/mcp-skills-agents-development-guide.md`
2. **Storico milestone completate (M0-M6)**: `docs/completed-milestones-mcp-skills.md`
3. **Backlog futuro (dettaglio M7/M8)**: `docs/future-backlog-mcp-skills.md`

## Cosa resta valido di questa spec storica

Il razionale architetturale rimane coerente con i seguenti principi, ora mantenuti nella guida viva:

- compatibilita' incrementale prima di refactor estesi;
- continuita' dei pattern legacy (`action`, `project_path`, `save_path`) con fallback;
- compatibilita' cross-host/client MCP severi;
- distinzione netta tra `mcp-technical-analyst` (intake multi-sorgente), `mcp-master-orchestrator` (coordinamento) e skill specialistiche.

## Nota di migrazione documentale

- backlog storico M0-M6: **spostato** nello storico dedicato;
- backlog attivo futuro (M7/M8+): **mantenuto** nella guida viva in forma sintetica, con dettaglio operativo in `docs/future-backlog-mcp-skills.md`.
