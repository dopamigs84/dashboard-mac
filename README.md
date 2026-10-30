# Dashboard Mac

Una dashboard locale per ritrovare i progetti nella Home e in `/Applications/MAMP/htdocs`. Richiede Node.js 22 o successivo. Nessun pacchetto da installare, database o servizio esterno.

## Avvio

Fai doppio clic su **Avvia Dashboard.command**. Si apre il browser; lascia aperta la finestra del terminale. Per arrestare il servizio premi `Ctrl+C`.

Oppure, da questa cartella:

```sh
npm start
```

Apri <http://127.0.0.1:4317>. Se la porta è occupata da un'altra app, usa `PORT=4318 npm start` e apri la porta indicata.

## Uso

- Cerca per nome, percorso o tecnologia. `⌘ K` oppure `/` porta alla ricerca; `Esc` cancella il testo.
- Filtra per Home, MAMP, tecnologia o preferiti. Passa tra schede ed elenco.
- Usa Finder, VS Code, copia percorso e apertura nel browser. VS Code è abilitato quando presente in `/Applications/Visual Studio Code.app`.
- La stella aggiunge un preferito. “Aperti di recente” mostra i progetti aperti **da questa dashboard**, non la cronologia generale del Mac.
- Il pulsante collegamento permette di impostare un indirizzo, per esempio `http://localhost:3000`. Il server del progetto deve essere già avviato. Il pulsante di regolazione modifica un collegamento esistente.
- “Aggiorna progetti” rilegge la configurazione e cerca le nuove cartelle. La pagina mantiene in memoria il catalogo fino al riavvio del servizio.

Preferiti, cronologia e indirizzi personalizzati sono conservati nel browser per questo indirizzo locale. Cambiare browser, porta o usare `localhost` anziché `127.0.0.1` crea preferenze separate. La scansione non modifica i progetti e non ne pubblica i contenuti.

## Cartelle e indirizzi

Modifica `config.json`, poi premi **Aggiorna progetti**:

- `roots`: sorgenti con `id` univoco, `label`, `path` (supporta `~`), `depth` (massimo 8) e `includeChildren`.
- `includeChildren: true`: ogni sottocartella diretta è un progetto, utile per `htdocs`.
- Con `includeChildren: false` vengono cercati indicatori come `.git`, `package.json`, `composer.json`, `index.php`, `index.html`, `pyproject.toml`, `pubspec.yaml` o progetti Xcode.
- `exclude`: nomi delle cartelle da saltare. Le cartelle nascoste e i collegamenti simbolici vengono sempre saltati.
- `maxDirectories`: limite totale di cartelle esplorate; un avviso segnala scansioni incomplete.
- `mampBaseUrl`: indirizzo MAMP predefinito. Imposta l’indirizzo del proprio server locale.
- `projectUrls`: indirizzi specifici per percorso assoluto. Gli indirizzi impostati nell'interfaccia hanno precedenza.

La scansione iniziale include la Home fino a quattro livelli, `htdocs` e tutte le sue sottocartelle dirette. Quando riconosce un progetto, non entra nei suoi componenti interni: un monorepo resta una scheda. Le cartelle inaccessibili generano avvisi; per includerle occorre concedere al terminale i permessi macOS necessari. La data di modifica considera la cartella e fino a 100 file del primo livello, non tutte le modifiche ricorsive e neppure l'ultimo commit Git. “Git” indica la presenza del repository, non lo stato delle modifiche.

## Risorse del Mac e dei progetti

Apri **Risorse del Mac** nella barra laterale. Il pulsante con il monitor su ogni scheda apre la stessa sezione filtrata per quel progetto.

- **Mac:** CPU complessiva, stima della RAM impegnata, memoria compressa, swap e spazio del volume che contiene la Home. La CPU globale è normalizzata da 0 a 100 su tutti i core. La RAM è stimata dalle pagine di `vm_stat`, sottraendo la cache dei file; se il comando non è accessibile viene mostrata una stima totale meno memoria libera, segnalata come comprensiva della cache. APFS condivide spazio tra volumi: usato più disponibile può differire dalla capacità totale indicata.
- **Per progetto:** CPU, memoria residente (RSS), processi associati con PID e spazio allocato su disco. Cerca per nome/percorso, mostra solo quelli con processi associati oppure ordina per CPU, RAM e disco.
- **Associazione:** cartella di lavoro del processo nel progetto (`lsof`), oppure discendenza da un processo associato (`ps`). Un processo viene attribuito una sola volta, preferendo il progetto più specifico. Questo non rileva necessariamente programmi avviati da altre cartelle, container, applicazioni remote o schede del browser. “Nessuno associato” non significa che il progetto sia spento.
- **Servizi condivisi:** Apache, PHP-FPM, MySQL/MariaDB e PostgreSQL vengono mostrati separatamente, senza dividerli arbitrariamente tra progetti. I processi sono quelli leggibili dall'utente che avvia la dashboard.
- **Unità:** 100% CPU di un processo equivale a un core; un progetto può superare 100%. Il valore è quello riportato da `ps`, diverso dal campionamento globale. La somma RSS può contare più volte le pagine condivise e non coincide con la RAM fisica impegnata. Le dimensioni usano unità binarie (MiB/GiB).

CPU e RAM si aggiornano ogni 5 secondi solo mentre la sezione è aperta e la scheda del browser è visibile. Puoi disattivare l'aggiornamento automatico o usare **Aggiorna ora**. Il servizio conserva i campioni per 5 secondi e condivide le letture simultanee tra più schede.

Il primo ingresso nella sezione avvia il calcolo dello spazio dei progetti. **Ricalcola spazio progetti** ripete la misura. Si usa `du -sk -P`, con due cartelle contemporaneamente e un limite di 30 secondi per cartella. Dipendenze, cache e file nascosti sono inclusi; i collegamenti simbolici non sono seguiti. I risultati arrivano progressivamente. Cartelle inaccessibili, cambiate o troppo lente mostrano “Non disponibile”, senza spacciare una dimensione parziale per quella completa. Cloni APFS e hard link possono rendere la somma per progetto diversa dallo spazio fisico effettivamente recuperabile. I risultati restano in memoria fino al riavvio; una nuova scansione dei progetti richiede un nuovo calcolo per le cartelle aggiunte.

Se macOS o l'ambiente di esecuzione negano l'accesso ai processi, i consumi risultano non disponibili e viene mostrato un avviso. Il monitor non termina processi, non modifica progetti e non raccoglie gli argomenti dei comandi. Dopo aver aggiornato il codice, un servizio avviato senza modalità `dev` deve essere riavviato per caricare i nuovi endpoint.

## Verifica e API

```sh
npm test
```

Questi test verificano la scansione su cartelle temporanee e gli handler HTTP in memoria, simulando l'apertura delle applicazioni. Per eseguire le stesse verifiche tramite vere connessioni locali: `npm run test:http`. Quest'ultimo comando richiede che l'ambiente consenta l'apertura di porte loopback.

Il contratto dell'API è in `api/openapi.json`. Il server accetta solo connessioni loopback, controlla Host e Origin e richiede un token di sessione per il catalogo, le scansioni e le aperture. Le aperture accettano solo ID già indicizzati, verificano nuovamente il percorso e invocano `open` senza shell. Non sono presenti funzioni di spostamento o eliminazione.
