# Dashboard Mac

Una dashboard locale per ritrovare, aprire e gestire i progetti sul Mac. Cerca nelle cartelle configurate, mostra risorse e porte occupate e permette di avviare i comandi dei progetti. Tutti i dati restano sul computer: non sono richiesti account, database o servizi esterni.

## Requisiti

- macOS 13 o successivo per l’app desktop.
- Node.js 22.12 o successivo per la versione web, lo sviluppo e la creazione della build. L’app macOS compilata include il proprio runtime.
- MAMP e VS Code sono facoltativi. Se non usi MAMP, puoi rimuovere la relativa sorgente dalla configurazione.
- Gli strumenti e le dipendenze dei singoli progetti devono essere installati per poterli avviare.

## Sostieni il progetto

Se Dashboard Mac ti è utile, puoi sostenere lo sviluppo con una donazione volontaria tramite PayPal. Il supporto aiuta a dedicare tempo a nuove funzionalità, correzioni e documentazione.

[Sostieni il progetto con PayPal](https://www.paypal.com/paypalme/michelemarseglia1382)

Puoi contribuire anche segnalando problemi, proponendo miglioramenti o inviando una pull request.

## App macOS autonoma

La versione Electron include Node e un browser: per usare l’app non occorre avviare il Terminale, installare Node o tenere aperto Chrome. Apri **Dashboard Mac.app**; il servizio locale parte automaticamente. Chiudendo l’ultima finestra o usando `⌘ Q`, vengono fermati il servizio e i progetti che l’app ha avviato.

Per creare la build su un Mac Apple Silicon:

```sh
npm ci
npm run build
```

Trovi l’app in `dist/mac-arm64/Dashboard Mac.app`. Puoi aprirla direttamente o trascinarla in **Applicazioni** e mantenerla nel Dock. `npm run build:dmg` crea anche il disco di installazione in `dist/`. Per lo sviluppo desktop usa `npm run desktop`. Node è necessario per sviluppare e creare la build, ma non per eseguire l’app compilata.

L’app salva configurazione, note, comandi e preferenze in `~/Library/Application Support/Dashboard Mac`, fuori dal pacchetto `.app`, quindi una nuova build non li elimina. Al primo avvio copia il `config.json` incluso nella build; successivamente usa la propria copia. **Archivio → Modifica configurazione cartelle…** apre quel file: dopo averlo modificato, premi **Aggiorna progetti**. **Archivio → Apri cartella dati** mostra tutti i dati dell’app.

Per recuperare note e comandi della precedente versione, usa **Archivio → Importa note e comandi…** e scegli la cartella originale `dashboard-mac`. L’app si riavvia, conserva i dati già presenti nella versione desktop e non modifica quelli originali. I comandi importati non vengono eseguiti automaticamente. Preferiti, cronologia, vista e indirizzi salvati nel browser sono separati da quelli dell’app desktop e vanno reimpostati.

Il servizio desktop ascolta solo su `127.0.0.1:4319`, mentre la versione web continua a usare la porta 4317. Se un altro programma occupa la porta 4319, l’app mostra un errore e non si collega a quel programma. Per verifiche isolate sono disponibili gli argomenti `--user-data-dir=/percorso/temporaneo` e `--dashboard-port=0`; quest’ultimo assegna una porta temporanea e non va usato normalmente, perché le preferenze del browser dipendono dalla porta.

Gli script di build generano una versione per Apple Silicon, firmata ad hoc per uso locale. La distribuzione pubblica di un’app firmata e notarizzata richiede una configurazione di firma dedicata. Gli strumenti dei singoli progetti (per esempio npm, PHP o Python) restano necessari per avviare quei progetti: l’app include il runtime della dashboard.

## Avvio

Fai doppio clic su **Avvia Dashboard.command**. Si apre il browser; lascia aperta la finestra del terminale. Per arrestare il servizio premi `Ctrl+C`.

Oppure, da questa cartella:

```sh
npm start
```

Apri <http://127.0.0.1:4317>. Se la porta è occupata da un'altra app, usa `PORT=4318 npm start` e apri la porta indicata.

### Installa come app di Chrome

Con la dashboard avviata, apri <http://127.0.0.1:4317> in una finestra normale di Chrome e premi **Installa app** nella barra superiore quando compare. Puoi anche usare l'icona di installazione nella barra degli indirizzi o il menu **⋮ → Trasmetti, salva e condividi → Installa pagina come app…**. L'app si apre in una finestra dedicata e puoi mantenerla nel Dock. Le app installate si trovano anche in `chrome://apps`.

Non serve una build: il server distribuisce già l'interfaccia, il manifest e le icone. Dopo un aggiornamento del codice, riavvia il server e ricarica la pagina. Il pulsante compare solo quando il browser rende disponibile l'installazione e non compare nella finestra dell'app installata.

Il server Node deve restare acceso anche dopo l'installazione: l'icona di Chrome non lo avvia e l'app non funziona con il server spento. Usa sempre lo stesso indirizzo e la stessa porta per ritrovare app e preferenze.

## Uso

- Cerca per nome, percorso o tecnologia. `⌘ K` oppure `/` porta alla ricerca; `Esc` cancella il testo.
- Filtra per Home, MAMP, tecnologia o preferiti. Passa tra schede ed elenco.
- Usa Finder, VS Code, copia percorso e apertura nel browser. VS Code è abilitato quando presente in `/Applications/Visual Studio Code.app`.
- La stella aggiunge un preferito. “Aperti di recente” mostra i progetti aperti **da questa dashboard**, non la cronologia generale del Mac.
- Il pulsante collegamento permette di impostare un indirizzo, per esempio `http://localhost:3000`. Il server del progetto deve essere già avviato. Il pulsante di regolazione modifica un collegamento esistente.
- “Aggiorna progetti” rilegge la configurazione e cerca le nuove cartelle. La pagina mantiene in memoria il catalogo fino al riavvio del servizio.

Preferiti, cronologia e indirizzi personalizzati sono conservati nel browser per questo indirizzo locale. Cambiare browser, porta o usare `localhost` anziché `127.0.0.1` crea preferenze separate. La scansione non modifica i progetti e non ne pubblica i contenuti.

## Cartelle e indirizzi

Il file `config.json` contiene una configurazione iniziale generica: Home e cartella standard di MAMP, senza indirizzi di progetti personali.

Per personalizzare la versione web senza pubblicare percorsi e indirizzi, crea una copia locale:

```sh
cp config.json config.local.json
```

Modifica `config.local.json` e riavvia il server: se presente, questo file viene usato al posto di `config.json` ed è escluso da Git e dalle build desktop. Le modifiche successive al file selezionato vengono rilette con **Aggiorna progetti**. Nell’app desktop usa **Archivio → Modifica configurazione cartelle…**, che apre la configurazione conservata nella cartella dati dell’app.

Campi disponibili:

- `roots`: sorgenti con `id` univoco, `label`, `path` (supporta `~`), `depth` (massimo 8) e `includeChildren`.
- `includeChildren: true`: ogni sottocartella diretta è un progetto, utile per `htdocs`.
- Con `includeChildren: false` vengono cercati indicatori come `.git`, `package.json`, `composer.json`, `index.php`, `index.html`, `pyproject.toml`, `pubspec.yaml` o progetti Xcode.
- `exclude`: nomi delle cartelle da saltare. Le cartelle nascoste e i collegamenti simbolici vengono sempre saltati.
- `maxDirectories`: limite totale di cartelle esplorate; un avviso segnala scansioni incomplete.
- `mampBaseUrl`: indirizzo base del server MAMP, per esempio `http://localhost` oppure `http://localhost:8888`, in base alla propria configurazione.
- `projectUrls`: mappa facoltativa tra percorsi assoluti e indirizzi dei progetti, vuota nella configurazione iniziale. Gli indirizzi impostati nell’interfaccia hanno precedenza. Per esempio, in `config.local.json`:

```json
{
  "projectUrls": {
    "/Applications/MAMP/htdocs/progetto-demo": "http://localhost:3000"
  }
}
```

L’esempio mostra solo il campo `projectUrls`: gli altri campi della configurazione vanno mantenuti.

La scansione iniziale include la Home fino a quattro livelli, `htdocs` e tutte le sue sottocartelle dirette. Quando riconosce un progetto, non entra nei suoi componenti interni: un monorepo resta una scheda. Le cartelle inaccessibili generano avvisi; per includerle occorre concedere al terminale i permessi macOS necessari. La data di modifica considera la cartella e fino a 100 file del primo livello, non tutte le modifiche ricorsive e neppure l'ultimo commit Git. “Git” indica la presenza del repository, non lo stato delle modifiche.

## Scheda del progetto

Clicca sul **nome di un progetto** nelle schede o nell'elenco per aprirne la scheda completa. Salva descrizione, cliente, stato del lavoro (attivo, in pausa, archiviato) e note, ad esempio il prossimo passo da fare. I dati sono salvati sul Mac in `.local/projects.json`, con scritture atomiche e fuori da Git: sopravvivono al riavvio della dashboard e al cambio di browser. Le modifiche vanno confermate con **Salva scheda**; un avviso protegge quelle non salvate quando esci dalla scheda.

La ricerca principale include anche cliente, descrizione e note; il filtro **Tutti gli stati** permette di mostrare solo progetti attivi, in pausa o archiviati. Lo stato del lavoro non corrisponde allo stato di esecuzione del server.

Nella scheda trovi Finder, VS Code, browser, configurazione del comando, avvio/stop, log e un campione delle risorse. **Aggiorna dati** aggiorna lo stato del comando, le risorse e forza una nuova lettura Git. I log continuano a usare la stessa finestra della sezione Avvio e porte.

Git viene letto senza fetch, pull o modifiche al repository, con `GIT_OPTIONAL_LOCKS=0` e fsmonitor disabilitato per la lettura. Mostra ramo, ultimo commit, modifiche in staging/non in staging, voci non tracciate e conflitti; i due conteggi di staging possono sovrapporsi per uno stesso file. Le directory non tracciate sono contate come voci, non come numero di file interni. L'elenco mostra al massimo 30 voci. I commit avanti/indietro sono relativi al riferimento remoto **locale**, che potrebbe non essere aggiornato. Il collegamento al repository viene convertito a HTTP(S) e privato di credenziali, query e frammenti. Un progetto dentro un repository più ampio non eredita uno stato Git attribuito erroneamente alla sola sottocartella. Le letture sono conservate per 10 secondi, con un limite di 10 secondi e 1 MiB per comando; errori e repository senza commit sono gestiti separatamente.

## Spazio da recuperare

Apri **Spazio da recuperare → Avvia analisi**. La ricerca individua cartelle note: `node_modules`, `vendor`, ambienti Python e `Pods` come dipendenze; `.next`, `.nuxt`, `.output`, `dist`, `build` e `target` come build; cache di strumenti, `__pycache__` e `coverage` come cache. La classificazione è un suggerimento basato sul nome: una cartella con un nome generico può contenere file da conservare.

La tabella è ordinabile per dimensione e filtrabile per progetto, percorso e categoria. Usa **Finder** per esaminare la cartella, oppure clicca il nome del progetto per tornare alla sua scheda. Questa funzione **analizza e apre le cartelle, senza eliminarle**.

La scansione esplora fino a 6 livelli e 20.000 cartelle dei progetti indicizzati. Non segue symlink e salta `.git`, file caricati e cartelle di storage. Si ferma quando trova un candidato, così `node_modules/.cache` non viene contato una seconda volta; anche sorgenti sovrapposte sono deduplicate. Le misure `du -sk -P` arrivano in background, due alla volta, con limite di 30 secondi per cartella. Limiti, permessi mancanti e misure fallite sono segnalati; una misura incompleta resta senza dimensione. Il totale somma solo i candidati misurati e non garantisce lo spazio fisico recuperabile, per via di APFS, hard link e file condivisi. Nessun comando di ricostruzione o reinstallazione viene eseguito automaticamente.

I risultati restano in memoria fino al riavvio; **Ripeti analisi** li aggiorna. Una richiesta durante una scansione attiva riutilizza lo stesso lavoro. La vista interroga l'avanzamento ogni 2 secondi solo mentre è aperta e visibile. Un percorso cambiato dopo la scansione non può essere aperto dal pulsante Finder.

## Avvio, stop e porte

Apri **Avvio e porte** dalla barra laterale, oppure usa il pulsante ▶ sulla scheda di un progetto.

1. Premi **Configura** sul progetto.
2. Indica il comando completo, per esempio `npm run dev`, e la cartella relativa di avvio: `.` per la cartella principale, `frontend` per una sottocartella. La cartella deve restare dentro il progetto anche dopo la risoluzione dei collegamenti simbolici.
3. Se vuoi, salva l'indirizzo del progetto, per esempio `http://localhost:3000`. La porta va impostata nel comando o nella configurazione del progetto: questo campo non cambia i parametri del server.
4. Salva e premi **Avvia**. Usa **Log** per vedere l'output, gli errori e il codice di uscita; **Stop** per chiudere il gruppo avviato.

I comandi sono eseguiti sul Mac tramite `zsh -lc`. Eventuali script `dev`, `start` e `serve` presenti nel `package.json` principale vengono suggeriti, ma non eseguiti automaticamente. Le dipendenze devono essere già installate. Il primo stato “Comando in esecuzione” conferma l'avvio del comando, non che il servizio HTTP sia già pronto. I comandi sono salvati in `.local/launch.json`, fuori da Git, e restano disponibili dopo un riavvio.

Lo stop usa un gruppo di processi dedicato: prima invia SIGTERM, poi SIGKILL dopo 3 secondi se il comando non chiude. Gestisce anche i processi figli; i progetti attivi rimossi dal catalogo restano elencati per poterli fermare. Se macOS nega il segnale viene mostrato un errore. Usa comandi in primo piano: programmi che si avviano come demoni o si separano volontariamente dal gruppo non sono supportati. La chiusura regolare della dashboard con `Ctrl+C` o SIGTERM ferma i gruppi che ha avviato. Un arresto forzato del Mac, SIGKILL o un crash può lasciarli attivi: al riavvio appariranno eventualmente tra le porte esterne, senza riassociare vecchi PID a comandi gestiti.

**Porte occupate** elenca le porte TCP in ascolto, l'indirizzo, il nome del processo e il PID, con associazione alla cartella del progetto quando leggibile. Il link “Apri HTTP” è un tentativo verso un servizio web; non tutte le porte usano HTTP. Apache, database e altri programmi avviati altrove si fermano dalla loro applicazione di origine. Il controllo preventivo di una porta locale configurata blocca l'avvio se risulta già occupata; è un controllo best effort e il server del progetto resta responsabile del bind effettivo.

La vista si aggiorna ogni 3 secondi mentre è aperta e visibile. I log mostrano gli ultimi 64.000 caratteri, restano in memoria fino al riavvio della dashboard e vengono sostituiti al successivo avvio del progetto. Non vengono esposti gli argomenti dei processi esterni. Letture parziali o negate delle porte sono segnalate con un avviso.

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
