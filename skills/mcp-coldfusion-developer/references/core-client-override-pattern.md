# Pattern Override Core -> Client

Usa questa reference quando una modifica CFML non va applicata direttamente in `core`, ma tramite override lato `client`.

## Regola Base

* Prima di modificare un CFC in `core`, verificare se il progetto richiede un override lato `client`.
* Non dedurre il namespace del CFC core dal nome della factory client o dal package di un altro componente.
* Derivare il namespace dal path reale del file sotto `core/<nome-core>/cflib/...`.

## Mapping Path -> Namespace

* Considerare il nome del core come prefisso del namespace.
* Considerare il resto del path sotto `cflib` come struttura package.
* Esempio: `core\\framework\\cflib\\gr_cfc\\managers\\ge\\fge265userges.cfc` corrisponde a `framework.gr_cfc.managers.ge.fge265userges`.
* Applicare la stessa regola a tutti i core, per esempio `framework`, `net`, `netbuyer`, `netmover`.

## Chain of Factories

* Quando si crea un override client di un CFC risolto tramite factory, registrare la stessa chiave CFC nella stessa factory lungo la catena client.
* Non limitarsi a creare il file client: senza il mapping nella factory client corretta, il runtime continuerà a risolvere il componente core.
* Mantenere allineata la catena delle factory: se un componente viene richiesto tramite `fwfactory`, l'override client deve stare nella `fwfactory` client corrispondente.
* Usare il path e il package del CFC core come fonte di verità, e usare la factory solo per capire quale chiave e quale catena di risoluzione aggiornare.
