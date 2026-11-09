CREATE DATABASE IF NOT EXISTS calendario CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE calendario;

CREATE TABLE IF NOT EXISTS utenti (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(120) NULL,
  password_hash VARCHAR(255) NOT NULL,
  creato_il TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS programma (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,   -- chiave artificiale
  utente_id INT UNSIGNED NULL,                           -- proprietario dell'impegno
  data_inizio DATETIME NOT NULL,
  data_fine DATETIME NOT NULL,
  tipo VARCHAR(35) NOT NULL,
  descrizione VARCHAR(150) NOT NULL DEFAULT '',
  giorno TINYINT UNSIGNED NOT NULL,                      -- numero del giorno (1-31)
  colore CHAR(7) NOT NULL DEFAULT '#0e7c66',
  email VARCHAR(120) NULL,                               -- destinatario promemoria
  promemoria_min SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  inviato TINYINT(1) NOT NULL DEFAULT 0,
  INDEX (data_inizio),
  INDEX (utente_id, data_inizio),
  CONSTRAINT fk_programma_utente FOREIGN KEY (utente_id) REFERENCES utenti(id) ON DELETE CASCADE
);

-- Aggiornamento per database gia esistenti
ALTER TABLE programma ADD COLUMN IF NOT EXISTS utente_id INT UNSIGNED NULL AFTER id;
ALTER TABLE programma ADD INDEX IF NOT EXISTS idx_utente_data (utente_id, data_inizio);

CREATE TABLE IF NOT EXISTS mail_elaborate (              -- email Gmail gia lette
  message_id VARCHAR(255) NOT NULL PRIMARY KEY,
  elaborata_il TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Utente dedicato (cambia la password!)
CREATE USER IF NOT EXISTS 'calendario'@'localhost' IDENTIFIED BY '6647';
CREATE USER IF NOT EXISTS 'calendario'@'127.0.0.1' IDENTIFIED BY '6647';
GRANT ALL PRIVILEGES ON calendario.* TO 'calendario'@'localhost';
GRANT ALL PRIVILEGES ON calendario.* TO 'calendario'@'127.0.0.1';
FLUSH PRIVILEGES;
