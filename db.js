const path = require('path');
require('dotenv').config({ path: path.join(process.pkg ? path.dirname(process.execPath) : __dirname, '.env') });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'calendario',
  dateStrings: true,
  connectionLimit: 5
});

async function initSchema() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS utenti (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(120) NULL,
        password_hash VARCHAR(255) NOT NULL,
        creato_il TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await pool.execute('ALTER TABLE programma ADD COLUMN IF NOT EXISTS utente_id INT UNSIGNED NULL AFTER id');
    await pool.execute('ALTER TABLE programma ADD INDEX IF NOT EXISTS idx_utente_data (utente_id, data_inizio)');
  } catch (e) {
    console.warn('Nota verifica schema DB:', e.message);
  }
}

async function creaUtente(username, passwordHash, email) {
  const [r] = await pool.execute(
    'INSERT INTO utenti (username, email, password_hash) VALUES (?, ?, ?)',
    [username, email || null, passwordHash]
  );
  return r.insertId;
}

async function trovaUtentePerUsername(username) {
  const [r] = await pool.execute(
    'SELECT id, username, email, password_hash FROM utenti WHERE username = ? LIMIT 1',
    [username]
  );
  return r[0] || null;
}

async function trovaUtentePerId(id) {
  const [r] = await pool.execute(
    'SELECT id, username, email FROM utenti WHERE id = ? LIMIT 1',
    [id]
  );
  return r[0] || null;
}

async function inserisci(e, utenteId = null) {
  const uid = utenteId || e.utente_id || null;
  const [r] = await pool.execute(
    `INSERT INTO programma (utente_id,data_inizio,data_fine,tipo,descrizione,giorno,colore,email,promemoria_min)
     SELECT ?,?,?,?,?,?,?,?,? FROM DUAL WHERE NOT EXISTS (
       SELECT 1 FROM programma WHERE utente_id <=> ? AND data_inizio=? AND data_fine=? AND tipo=? AND descrizione=?
     )`,
    [uid, e.inizio, e.fine, e.tipo, e.descrizione, e.giorno, e.colore, e.email || null, e.promemoria,
     uid, e.inizio, e.fine, e.tipo, e.descrizione]
  );
  return r.insertId;
}

async function registra(e, tipo, descrizione, colore, utenteId = null, emailUtente = null) {
  const def = (emailUtente || process.env.DEFAULT_EMAIL || '').trim();
  const email = def && def !== 'tuamail@gmail.com' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(def) ? def : null;
  let descFinale = String(descrizione || '').trim();
  if (e.classe) {
    const prefisso = `Classe ${e.classe}`;
    if (!descFinale) {
      descFinale = prefisso;
    } else if (!descFinale.toUpperCase().includes(e.classe.toUpperCase())) {
      descFinale = `${prefisso} - ${descFinale}`;
    }
  }
  descFinale = descFinale.slice(0, 150);

  const id = await inserisci({
    inizio: `${e.data} ${e.i}:00`,
    fine: `${e.data} ${e.e}:00`,
    tipo,
    descrizione: descFinale,
    giorno: e.giorno,
    colore,
    email,
    promemoria: 60
  }, utenteId);
  return id ? { classe: e.classe, data: e.data, inizio: e.i, fine: e.e } : null;
}

async function elimina(id, utenteId) {
  const [r] = await pool.execute('DELETE FROM programma WHERE id=? AND utente_id=?', [id, utenteId]);
  return r.affectedRows > 0;
}

async function elencaTutti(utenteId) {
  const [r] = await pool.execute(
    'SELECT id,data_inizio,data_fine,tipo,descrizione,giorno,colore FROM programma WHERE utente_id=? ORDER BY data_inizio, id',
    [utenteId]
  );
  return r;
}

module.exports = {
  pool,
  initSchema,
  creaUtente,
  trovaUtentePerUsername,
  trovaUtentePerId,
  inserisci,
  registra,
  elimina,
  elencaTutti
};