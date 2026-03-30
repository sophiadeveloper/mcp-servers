# Interactive Escalation

## Quando fermarsi a chiedere

Fermati solo se manca un'informazione che cambia materialmente l'analisi e non e ricavabile tramite esplorazione:

- repo esterno corretto non identificabile;
- ticket corretto tra piu candidati plausibili;
- DB o ambiente giusto tra piu opzioni;
- output finale richiesto in un formato diverso da quello standard.

## Quando NON chiedere

Non fermarti per chiedere:

- dove leggere un file se lo puoi scoprire;
- quale tabella usare se lo schema e interrogabile;
- quali documenti leggere se una ricerca docs mirata puo dirtelo;
- se usare Playwright quando e chiaramente inutile.

## Forma Della Domanda

Fai domande corte, concrete, e con contesto:

- “Per il confronto DB vuoi usare `qa` o `prod`? Se non rispondi procedo con `qa`.”
- “Ci sono due repo plausibili: `X` e `Y`. In assenza di indicazioni parto da `X` perche e quello citato nel ticket.”

## Fallback

Se puoi procedere con un default ragionevole:

1. procedi;
2. registra l'assunzione nel documento finale;
3. aggiungi una sezione `Punti aperti` o `Decisioni bloccanti` se serve.
