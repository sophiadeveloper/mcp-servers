# Maintenance Playbook

## Quando Fare Resync

* dopo rilasci importanti
* dopo ingestione massiva di nuovi documenti
* quando `scan_sources` o `feature_status` segnalano incoerenze

## Ingestione Di Nuovi Corpus

1. scegli una root documentale stabile
2. esegui `scan_folder` sulla root, non sull'intero repository
3. assegna tag minimi e coerenti
4. verifica la ricerca con una `search` a basso `limit`

## Escalation Su Errori Di Indicizzazione

Se l'indice sembra incoerente:

1. restringi il problema con `list_documents` o `search`
2. se necessario usa `remove_shelf`
3. riesegui una scansione mirata della sola root corretta
4. documenta il problema e la soluzione per i prossimi riutilizzi
