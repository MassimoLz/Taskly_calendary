# 📅 Taskly — Calendario Scolastico Intelligente

**Taskly** è un'applicazione web leggera, autonoma e moderna per la gestione di orari scolastici, lezioni e impegni docenti/studenti. Include un **motore di analisi automatica di circolari scolastiche in formato PDF**, un sistema di **promemoria automatici via email (SMTP)**, un layout **completamente responsive (ottimizzato per smartphone e desktop)** e la possibilità di essere eseguito come **binario autonomo compilato** o direttamente su **Android tramite Termux**.

---

## 🌟 Funzionalità Principali

### 1. 🗓️ Calendario Interattivo Mensile & Settimanale
- **Griglia Oraria Dinamica**: Vista delle 24 ore suddivisa per giorno del mese, con indicatore del giorno corrente e scorrimento fluido.
- **Altezza Fissa Minima per gli Impegni**: Gli eventi brevi (15–30 min) non vengono compressi o schiacciati, ma mantengono una dimensione minima garantita (52px) che ne assicura leggibilità e comfort visivo.
- **Overflow Testuale con Barra di Scorrimento**: Se la descrizione o il titolo dell'evento sono molto lunghi, compare una scrollbar verticale dedicata (`overflow-y: auto`) per scorrere l'intero testo.
- **Slideshow / Carosello per Impegni Sovrapposti**: Se nella stessa ora ci sono più riunioni o lezioni contemporanee (es. Consigli di classe o GLO paralleli), non vengono compressi in colonne minuscole: una pillola interattiva con contatore (`1/N`) e frecce `‹` `›` (con supporto swipe touch da telefono) consente di scorrere tra gli impegni a tutta larghezza.
- **Lista Cronologica Laterale**: Elenco completo di tutti i programmi futuri e passati, con distinzione cromatica e navigazione immediata al giorno desiderato con un clic.

### 2. 📄 Parser Automatico Circolari Scolastiche (PDF)
- Estrazione intelligente di **date, orari, classi e oggetti/titoli** dai file PDF pubblicati dalla scuola.
- **Riconoscimento Classi Flessibile**:
  - Numeri romani e arabi (`III F`, `3F`, `3 F`, `3ªA`, `4^B`).
  - Classi con sezioni multi-lettera (`3AL`, `4BSA`) e classi accorpate (`5C-D`).
- **Riconoscimento Date e Mesi Reali**:
  - Date estese (`18 novembre 2026`, `18 nov`, `18° di novembre`).
  - Date numeriche con o senza anno (`18/11/2026`, `18/11`, `18.11`, `18-11`).
  - Risoluzione contestuale per tabelle (es. "Lunedì 18" associato al mese indicato nella testata della circolare), evitando l'errore di assegnare l'evento al mese di protocollo/emissione della circolare.
- **Dettaglio Classe nella Descrizione**: Ogni impegno registrato dalla circolare include automaticamente il prefisso della classe (es. `Classe III F - Convocazione Consigli di Classe`).

### 3. ✉️ Notifiche e Promemoria Email Automatici
- **Demone in Background (60s)**: Il server controlla ogni minuto gli impegni in arrivo e invia automaticamente una notifica email prima dell'inizio dell'evento.
- **Fallback Email Predefinita**: Se non viene inserita un'email specifica per il promemoria, viene utilizzata in automatico la `DEFAULT_EMAIL` definita nel file `.env`.
- **Sanitizzazione Automatica delle Credenziali**: Supporto alle password per le app di Google, con rimozione automatica di spazi o virgolette accidentali.

### 4. 🔐 Accesso Multi-Utente & Profili Personali
- **Autenticazione Integrata (`login.html`)**: Pagina di login e registrazione in stile Taskly con supporto per tema chiaro/scuro.
- **Isolamento Impegni per Utente**: Ogni utente registrato visualizza, crea, analizza circolari ed elimina esclusivamente i propri impegni personali (`programma.utente_id` collegato a `utenti.id`).
- **Sicurezza Nativa**: Hashing delle password con `crypto.scrypt` e salatura casuale a 128 bit, sessioni tramite cookie `HttpOnly` firmati con `HMAC-SHA256` (validità 30 giorni).

### 5. 📱 Mobile First & Web App (PWA)
- **Menu a Comparsa**: Su smartphone, la barra laterale si trasforma in un cassetto a comparsa (drawer) azionabile dal pulsante `☰`.
- **Supporto PWA**: Include `manifest.json` e icona vettoriale `icon.svg` per l'installazione su schermata Home come app nativa a tutto schermo.
- **Esecuzione Nativa su Android**: Tramite Termux e lo script dedicato, Node.js e MariaDB possono girare al 100% in locale sullo smartphone, con widget di avvio a singolo tocco.

---

## 🏗️ Architettura del Progetto

```
calendario/
├── server.js                   # Server HTTP Express, autenticazione, rotte API REST e timer promemoria
├── db.js                       # Pool MySQL2/MariaDB, auto-migrazione schema, query utenti ed eventi
├── db.sql                      # Schema database (tabelle utenti, programma e mail_elaborate)
├── parser.js                   # Motore di estrazione regex (date, orari, classi, circolari)
├── mail.js                     # Gestione SMTP Nodemailer e IMAP Gmail
├── avvia-calendario.sh         # Script bash di avvio background e apertura browser
├── installa_desktop_ubuntu.sh  # Script di build binario e lanciatore .desktop per Ubuntu
├── installa_telefono_termux.sh # Script di installazione nativa su Android (Termux)
├── package.json                # Dipendenze e script di compilazione (@yao-pkg/pkg)
├── .env / env.example          # Configurazione porte, database e credenziali email
└── public/
    ├── login.html              # Pagina di accesso e registrazione utente
    ├── index.html              # Struttura semantica calendario, modali e branding Taskly
    ├── script.js               # Logica frontend (autenticazione, griglia, slideshow, fetch API)
    ├── style.css               # Design responsive, variabili CSS, temi chiaro/scuro
    ├── manifest.json           # Web App Manifest (PWA)
    └── icon.svg                # Logo vettoriale dell'applicazione
```

---

## 🗄️ Struttura del Database (MariaDB / MySQL)

Database di riferimento: `calendario`

### Tabella `utenti`
Memorizza gli account registrati che possono accedere a Taskly:
| Campo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `id` | INT UNSIGNED AUTO_INCREMENT | Chiave primaria |
| `username` | VARCHAR(50) UNIQUE | Nome utente univoco per il login |
| `email` | VARCHAR(120) NULL | Email predefinita dell'utente per ricevere i promemoria |
| `password_hash` | VARCHAR(255) | Password cifrata con `scrypt` e salt (`salt:hash`) |
| `creato_il` | TIMESTAMP | Data e ora di registrazione dell'account |

### Tabella `programma`
Memorizza tutti gli eventi, promemoria e impegni estratti o creati manualmente, collegati al singolo utente:
| Campo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `id` | INT UNSIGNED AUTO_INCREMENT | Chiave primaria |
| `utente_id` | INT UNSIGNED NULL | Chiave esterna verso `utenti(id)` (`ON DELETE CASCADE`) |
| `data_inizio` | DATETIME | Data e ora di inizio impegno (indicizzata) |
| `data_fine` | DATETIME | Data e ora di termine |
| `tipo` | VARCHAR(35) | Tipologia (es. "Circolare 42", "Lezione", "GLO") |
| `descrizione` | VARCHAR(150) | Dettaglio o oggetto (include la classe) |
| `giorno` | TINYINT UNSIGNED | Numero del giorno del mese (1–31) |
| `colore` | CHAR(7) | Colore HEX per il badge grafico (#0e7c66, #c2410c, ecc.) |
| `email` | VARCHAR(120) NULL | Indirizzo a cui recapitare il promemoria |
| `promemoria_min`| SMALLINT UNSIGNED | Minuti di anticipo per l'invio dell'email (default: 30 o 60) |
| `inviato` | TINYINT(1) | Flag `0/1` per tracciare se l'avviso è già stato spedito |

### Tabella `mail_elaborate`
Memorizza i `message_id` dei messaggi di posta già letti per evitare elaborazioni o duplicazioni ridondanti.

---

## 🚀 Guida all'Installazione

### Prerequisiti
- **Node.js**: versione 18.x o 20.x LTS
- **MariaDB / MySQL**: attivo localmente (`127.0.0.1:3306`)

---

### Installazione su Ubuntu / Debian

1. **Clona o copia la cartella del progetto**:
   ```bash
   cd /percorso/del/progetto/calendario
   ```

2. **Inizializza il database**:
   ```bash
   sudo mariadb < db.sql
   ```

3. **Installa le dipendenze e configura l'ambiente**:
   ```bash
   npm install
   cp env.example .env
   chmod 600 .env
   nano .env
   ```

4. **Avvia l'applicazione**:
   ```bash
   npm start
   # Oppure tramite lo script:
   ./avvia-calendario.sh
   ```
   L'applicazione sarà attiva su: **`http://localhost:3000`**.

---

### Configurazione del file `.env`

```ini
PORT=3000
TZ=Europe/Rome

# Connessione Database
DB_HOST=127.0.0.1
DB_USER=calendario
DB_PASS=6647
DB_NAME=calendario

# Configurazione Invio Promemoria (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tuoindirizzo@gmail.com
SMTP_PASS=tuapasswordperleapp    # 16 caratteri generati da Account Google
DEFAULT_EMAIL=tuoindirizzo@gmail.com

# Parametri Lettura Gmail (facoltativi)
GMAIL_USER=tuoindirizzo@gmail.com
GMAIL_PASS=tuapasswordperleapp
GMAIL_GIORNI=14
GMAIL_MITTENTE=
```

> [!TIP]
> **Come ottenere la password per le app di Gmail**:
> 1. Accedi a [myaccount.google.com](https://myaccount.google.com).
> 2. Assicurati che la **Verifica in due passaggi** sia attiva.
> 3. Cerca **"Password per le app"** ([myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
> 4. Genera una password (es. per l'app "Taskly") e incollala in `SMTP_PASS` e `GMAIL_PASS`.

---

## 📦 Compilazione in Eseguibile Autonomo (`calendario-bin`)

È possibile generare un binario ELF a 64-bit per Linux completamente autonomo che include il runtime Node e gli asset web:

```bash
./installa_desktop_ubuntu.sh
```

Lo script:
1. Compila il file `calendario-bin` tramite `@yao-pkg/pkg`.
2. Genera il file lanciatore `Calendario.desktop` sulla Scrivania/Desktop di Ubuntu, che permette di avviare il server e aprire il browser predefinito con un doppio clic.

---

## 📱 Utilizzo su Smartphone (Android con Termux)

Per far girare sia il server Node sia MariaDB direttamente dentro il dispositivo Android in `localhost` (senza bisogno di PC o connessione LAN):

1. Installa **Termux** e **Termux:Widget** da F-Droid.
2. In Termux, clona la repository ed esegui lo script:
   ```bash
   git clone <URL_REPO> ~/calendario
   cd ~/calendario
   chmod +x installa_telefono_termux.sh
   ./installa_telefono_termux.sh
   ```
3. Aggiungi il widget **Termux:Widget** alla schermata Home selezionando la scorciatoia `Calendario`.
4. Una volta aperto nel browser, seleziona **"Aggiungi a schermata Home"** dal menu di Chrome per ottenere l'app a schermo intero.

---

## 🔌 API REST

| Metodo | Endpoint | Descrizione |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Registra un nuovo utente (`username`, `password`, `email`) e avvia la sessione |
| `POST` | `/api/auth/login` | Effettua il login dell'utente e imposta il cookie `HttpOnly` di sessione |
| `POST` | `/api/auth/logout` | Termina la sessione dell'utente corrente |
| `GET` | `/api/auth/me` | Restituisce i dati dell'utente autenticato (`id`, `username`, `email`) |
| `GET` | `/api/programmi?anno=YYYY&mese=M` | Restituisce gli eventi del mese richiesto per l'utente loggato |
| `GET` | `/api/programmi/tutti` | Restituisce la lista cronologica di tutti i programmi dell'utente loggato |
| `POST` | `/api/programmi` | Crea un nuovo impegno manuale associato all'utente loggato |
| `DELETE`| `/api/programmi/:id` | Elimina l'impegno specificato (solo se appartiene all'utente loggato) |
| `POST` | `/api/circolare?anno=YYYY&classi=C1,C2` | Analizza il PDF inviato ed estrae gli impegni per l'utente loggato |
| `POST` | `/api/email/test` | Invia un'email di test per verificare la configurazione SMTP |

---

## 🎨 Teoria dei Colori & Design System

L'interfaccia adotta il principio **60-30-10** per garantire comfort visivo prolungato ed evitare l'affaticamento oculare:
- **60% (Base/Sfondo)**: Tonalità neutre ardesia/ghiaccio (`#eef1f5` chiaro / `#0f141d` scuro).
- **30% (Struttura/Testo)**: Colore inchiostro ad alto contrasto (`#16233b` chiaro / `#e4e8f0` scuro).
- **10% (Accento/Brand)**: Verde smeraldo/ottanio (`#0e7c66` chiaro / `#49756c` scuro), applicato al logo, al giorno odierno e ai bottoni primari.
- **Codifica Cromatica Impegni**:
  - 🟢 `#0e7c66`: Impegni inseriti manualmente.
  - 🟠 `#c2410c`: Impegni estratti da Circolari scolastiche in PDF.
  - 🟣 `#6d28d9`: Impegni importati da Email.

---

## 📄 Licenza

Rilasciato sotto licenza [MIT](LICENSE).
