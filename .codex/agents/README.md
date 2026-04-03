# `.codex/agents` — profili operativi

Profili disponibili con confini espliciti e anti-overlap:

- `explorer`: discovery/audit read-first, senza modifiche.
- `implementer`: patch/test/doc incrementali con verifica.
- `technical_analyst`: ricostruzione multi-sorgente disciplinata e decision brief.

## Regola di ingaggio rapida
1. Inizia con `explorer` quando il problema non e' ancora ben delimitato.
2. Usa `technical_analyst` quando servono timeline, correlazioni e causalita'.
3. Attiva `implementer` solo con base analitica sufficiente e criterio di accettazione chiaro.

## Compatibilita' con skill consolidate
- Per intake/analisi tecnica multi-sorgente, allinea il profilo `technical_analyst` con la skill `mcp-technical-analyst`.
- Per task multi-fase con handoff, applica i profili agenti sotto coordinamento della skill `mcp-master-orchestrator` e dei suoi limiti di parallelismo/profondita'.


## Riferimento guida viva
- Documentazione operativa corrente: `docs/mcp-skills-agents-development-guide.md`.
- Storico decisioni/milestone completate: `docs/completed-milestones-mcp-skills.md`.
