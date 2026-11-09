# Guida di installazione (Linux & Windows + Node.js + MariaDB/MySQL)

Questa guida illustra come configurare ed eseguire l'applicazione **Taskly** sia su distribuzioni **Linux (Ubuntu / Debian)** sia su **Windows 10/11**.

L'architettura dell'applicazione è semplice:
- **Server:** `server.js` (Express) gestisce l'interfaccia web statica in `public/` e le API REST (`/api/...`).
- **Database:** MariaDB (o MySQL), accessibile localmente su `127.0.0.1:3306`.
- **Nessun server Apache/PHP richiesto**: Node.js gestisce autonomamente sia il backend che il frontend. Se hai già XAMPP installato per altri progetti, puoi utilizzare comodamente il modulo MariaDB/MySQL già integrato in XAMPP.

---

## 1. Node.js (versione LTS >= 18)

### Linux (Ubuntu / Debian)
Nei repository standard di Ubuntu la versione di Node potrebbe essere datata; si consiglia di usare il repository ufficiale NodeSource:
```bash
sudo apt update && sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
```
Verifica l'installazione:
```bash
node -v && npm -v
```

### Windows
- **Opzione A (da terminale winget - PowerShell o Prompt dei comandi):**
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```
- **Opzione B (installer grafico):**
  Scarica l'installer della versione LTS dal sito ufficiale: [https://nodejs.org](https://nodejs.org).

Verifica aprendo una nuova finestra di terminale (PowerShell o CMD):
```cmd
node -v
npm -v
```
Entrambi devono mostrare Node 18 o superiore.

---

## 2. MariaDB / MySQL

### Linux (Ubuntu / Debian)
```bash
sudo apt install -y mariadb-server
sudo systemctl enable --now mariadb
sudo mysql_secure_installation
```
Rispondi alle domande per impostare la password di `root`, disabilitare gli account anonimi e rimuovere i database di prova.

### Windows
- **Opzione A (Se usi già XAMPP):**
  Avvia il pannello **XAMPP Control Panel** e clicca su **Start** accanto al modulo **MySQL**. Assicurati che il riquadro diventi verde e indichi la porta `3306`.
- **Opzione B (Installazione autonoma di MariaDB):**
  - Installa tramite winget:
    ```powershell
    winget install MariaDB.Server
    ```
    oppure scarica il pacchetto `.msi` da [https://mariadb.org/download/](https://mariadb.org/download/).
  - Durante l'installazione guidata, imposta una password per l'utente `root` e seleziona l'opzione per avviare MariaDB come servizio di Windows.
  - Per avviare o riavviare il servizio in futuro (da PowerShell come Amministratore):
    ```powershell
    Start-Service MariaDB
    ```

---

## 3. Configurazione Database

1. Apri il file `db.sql` e definisci una password sicura per l'utente del database al posto di `CAMBIA_PASSWORD` (compare 4 volte nel blocco di creazione utente):
   - **Linux:** `nano db.sql` (usa `Ctrl+\` per sostituire tutte le occorrenze).
   - **Windows:** apri `db.sql` con Blocco note (`notepad db.sql`) o VS Code e usa `Ctrl+H` per cercare e sostituire tutte le occorrenze.

2. Importa lo schema SQL:

### Su Linux:
- **Con MariaDB di sistema:**
  ```bash
  sudo mariadb < db.sql
  sudo mariadb -e "USE calendario; SHOW TABLES;"
  ```
- **Con il MariaDB/MySQL di XAMPP su Linux:**
  ```bash
  /opt/lampp/bin/mysql -u root -p < db.sql
  ```

### Su Windows:
- **Con MariaDB autonomo:**
  ```powershell
  mariadb -u root -p < db.sql
  mariadb -u root -p -e "USE calendario; SHOW TABLES;"
  ```
- **Con il MySQL di XAMPP:**
  ```cmd
  C:\xampp\mysql\bin\mysql.exe -u root < db.sql
  C:\xampp\mysql\bin\mysql.exe -u root -e "USE calendario; SHOW TABLES;"
  ```
  *(In alternativa, puoi aprire phpMyAdmin all'indirizzo `http://localhost/phpmyadmin`, andare nella scheda "Importa" e caricare direttamente il file `db.sql`)*.

---

## 4. Installare e configurare l'applicazione

Entra nella cartella del progetto nel terminale:

### Linux
```bash
cd ~/Scrivania/Taskly   # o il percorso in cui hai clonato il progetto
npm install
cp env.example .env
chmod 600 .env
nano .env
```

### Windows (PowerShell / CMD)
```powershell
cd C:\percorso\verso\Taskly
npm install
copy env.example .env
notepad .env
```

Nel file `.env`, imposta i valori necessari:
- `DB_USER=calendario`
- `DB_PASS=la_password_scelta_in_db_sql`
- `SESSION_SECRET=una_stringa_casuale_segreta_lunga_almeno_32_caratteri`
- Le impostazioni Gmail (vedi punto 5).

---

## 5. Gmail: invio promemoria e lettura email

1. Accedi al tuo account Google e assicurati che sia attiva la **Verifica in due passaggi**.
2. Crea una **Password per le app** da: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
   - Nome app ad esempio: `Taskly`.
   - Verrà generata una stringa di 16 caratteri (es. `abcd efgh ilmn opqr`).
3. Se in Gmail (*Impostazioni → Visualizza tutte le impostazioni → Inoltro e POP/IMAP*) è presente la voce IMAP, assicurati che sia impostata su **Attiva IMAP**.
4. Inserisci i dati nel file `.env`:
   - `SMTP_USER=tuonome@gmail.com`
   - `SMTP_PASS=tuapasswordperleapp16caratteri`
   - `DEFAULT_EMAIL=tuonome@gmail.com`
   - `GMAIL_USER=tuonome@gmail.com`
   - `GMAIL_PASS=tuapasswordperleapp16caratteri`
   - `GMAIL_GIORNI=14` *(opzionale: quanti giorni a ritroso scansionare)*
   - `GMAIL_MITTENTE=` *(opzionale: per filtrare solo circolari da un mittente specifico)*

---

## 6. Avvio dell'Applicazione

### Avvio manuale:
```bash
npm start
```
Apri il browser su: **http://localhost:3000**

> [!NOTE]
> Il server è in ascolto solo localmente sul tuo computer. I promemoria vengono verificati automaticamente ogni 60 secondi: per continuare a ricevere i promemoria via email, il terminale di Node e il servizio del database devono rimanere attivi.

### Fuso orario (importante per la puntualità dei promemoria)
- **Linux:** controlla con `timedatectl`. Se necessario imposta: `sudo timedatectl set-timezone Europe/Rome`.
- **Windows:** controlla in *Impostazioni Windows → Data e ora* che il fuso orario sia impostato su *(UTC+01:00) Amsterdam, Berlino, Berna, Roma*. Da PowerShell puoi verificare con:
  ```powershell
  Get-TimeZone
  ```

---

## 7. Avvio automatico all'accensione (Opzionale)

### Linux (tramite systemd)
Crea il file di servizio:
```bash
sudo nano /etc/systemd/system/taskly.service
```
Contenuto:
```ini
[Unit]
Description=Taskly Calendar Server
After=network.target mariadb.service

[Service]
User=TUO_UTENTE
WorkingDirectory=/home/TUO_UTENTE/Taskly
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
Attiva il servizio:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now taskly
journalctl -u taskly -f
```

### Windows (tramite PM2 o file batch)
**Opzione consigliata con PM2 (gestore di processi Node):**
```powershell
npm install -g pm2
pm2 start server.js --name "taskly"
pm2 save
```
Per avviare PM2 automaticamente all'avvio di Windows puoi usare `pm2-windows-service`:
```powershell
npm install -g pm2-windows-service
pm2-service-install
```

**Opzione semplice (script di avvio rapido):**
Crea un file `avvia_taskly.bat` nella cartella del progetto:
```bat
@echo off
cd /d "%~dp0"
start http://localhost:3000
node server.js
pause
```
Puoi creare un collegamento a questo file `.bat` e posizionarlo sul Desktop o nella cartella Esecuzione automatica (`shell:startup`).

---

## 8. Risoluzione Problemi Comuni

- **Errore server / Access denied for user 'calendario':**
  La password `DB_PASS` nel file `.env` non coincide con quella inserita in `db.sql`.
  Per reimpostarla da riga di comando:
  - *Linux:*
    ```bash
    sudo mariadb -e "ALTER USER 'calendario'@'localhost' IDENTIFIED BY 'NUOVA_PASS'; ALTER USER 'calendario'@'127.0.0.1' IDENTIFIED BY 'NUOVA_PASS';"
    ```
  - *Windows:*
    ```cmd
    mariadb -u root -p -e "ALTER USER 'calendario'@'localhost' IDENTIFIED BY 'NUOVA_PASS'; ALTER USER 'calendario'@'127.0.0.1' IDENTIFIED BY 'NUOVA_PASS';"
    ```
    *(oppure esegui la query direttamente nell'interfaccia SQL di phpMyAdmin se usi XAMPP)*.

- **ECONNREFUSED 127.0.0.1:3306:**
  Il servizio MariaDB/MySQL non è avviato.
  - *Linux:* `sudo systemctl start mariadb`
  - *Windows:* Clicca su Start accanto a MySQL nel pannello di XAMPP, oppure da PowerShell come Admin: `Start-Service MariaDB`.

- **EADDRINUSE (porta 3000 occupata):**
  Un'altra applicazione sta già usando la porta 3000.
  - Cambia porta nel file `.env`, ad esempio `PORT=3001`, e visita `http://localhost:3001`.

- **Accesso a Gmail non riuscito:**
  - Non usare la normale password dell'account Google: è richiesta la **Password per le app** da 16 caratteri.
  - Verifica che la verifica in due passaggi sia attiva sull'account Google.
  - Controlla che il protocollo IMAP sia abilitato nelle impostazioni di Gmail.

- **I promemoria via email non arrivano:**
  - Verifica nei log (`npm start` o log di sistema) se compaiono errori SMTP.
  - Assicurati che l'evento nel calendario abbia un indirizzo email associato (o che `DEFAULT_EMAIL` sia configurata nel file `.env`).
