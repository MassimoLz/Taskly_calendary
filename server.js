const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(process.pkg ? path.dirname(process.execPath) : __dirname, '.env') });
const express = require('express');
const {
  pool,
  initSchema,
  creaUtente,
  trovaUtentePerUsername,
  trovaUtentePerId,
  inserisci,
  registra,
  elimina,
  elencaTutti
} = require('./db');
const { errore, classiValide, testoPdf, titoloCircolare, estraiImpegni } = require('./parser');
const { inviaPromemoria, controllaGmail, inviaEmailTest } = require('./mail');

const app = express();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const p2 = n => String(n).padStart(2, '0');

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME = 'taskly_session';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verificaPassword(password, salvato) {
  const [salt, hash] = String(salvato || '').split(':');
  if (!salt || !hash) return false;
  const calcolato = crypto.scryptSync(password, salt, 64);
  const bufferSalvato = Buffer.from(hash, 'hex');
  if (calcolato.length !== bufferSalvato.length) return false;
  return crypto.timingSafeEqual(calcolato, bufferSalvato);
}

function creaToken(utenteId) {
  const scadenza = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 giorni
  const payload = `${utenteId}.${scadenza}`;
  const firma = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${firma}`;
}

function verificaToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parti = token.split('.');
  if (parti.length !== 3) return null;
  const [idStr, expStr, firma] = parti;
  const id = Number(idStr), exp = Number(expStr);
  if (!Number.isInteger(id) || id < 1 || !Number.isFinite(exp) || Date.now() > exp) return null;
  const attesa = crypto.createHmac('sha256', SESSION_SECRET).update(`${idStr}.${expStr}`).digest('base64url');
  if (firma.length !== attesa.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(attesa))) return null;
  return id;
}

function leggiCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const parte of raw.split(';')) {
    const idx = parte.indexOf('=');
    if (idx > 0) {
      const k = parte.slice(0, idx).trim();
      const v = parte.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

function impostaCookieSessione(res, token) {
  const maxAge = 30 * 24 * 60 * 60;
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

function cancellaCookieSessione(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

const richiediAuth = ah(async (req, res, next) => {
  const cookies = leggiCookies(req);
  const uid = verificaToken(cookies[COOKIE_NAME]);
  if (!uid) throw errore('Accesso richiesto. Effettua il login.', 401);
  const utente = await trovaUtentePerId(uid);
  if (!utente) {
    cancellaCookieSessione(res);
    throw errore('Sessione non valida. Effettua nuovamente il login.', 401);
  }
  req.utente = utente;
  next();
});

function valida(d, emailUtente) {
  const a = +d.anno, m = +d.mese, g = +d.giorno, dt = new Date(a, m - 1, g);
  if (!Number.isInteger(a) || a < 2000 || a > 2100 || !Number.isInteger(m) || !Number.isInteger(g) || dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== g)
    throw errore('Giorno non valido per il mese selezionato');
  const tipo = String(d.tipo || '').trim(), descrizione = String(d.descrizione || '').trim();
  if (!tipo || tipo.length > 35 || descrizione.length > 150) throw errore('Tipo max 35 caratteri, descrizione max 150');
  const ora = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!ora.test(d.ora_inizio) || !ora.test(d.ora_fine)) throw errore('Orario non valido');
  if (d.ora_fine <= d.ora_inizio) throw errore("La fine deve essere dopo l'inizio");
  let email = String(d.email || '').trim().replace(/^["']|["']$/g, '');
  if (!email && emailUtente) {
    email = String(emailUtente).trim();
  }
  if (!email && process.env.DEFAULT_EMAIL && process.env.DEFAULT_EMAIL !== 'tuamail@gmail.com') {
    email = String(process.env.DEFAULT_EMAIL).trim().replace(/^["']|["']$/g, '');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw errore('Email non valida');
  const day = `${a}-${p2(m)}-${p2(g)}`;
  return {
    inizio: `${day} ${d.ora_inizio}:00`, fine: `${day} ${d.ora_fine}:00`,
    tipo, descrizione, giorno: g, email,
    colore: /^#[0-9a-f]{6}$/i.test(d.colore) ? d.colore : '#0e7c66',
    promemoria: Math.max(0, Math.min(1440, Math.trunc(+d.promemoria || 0)))
  };
}

app.get(['/', '/index.html'], (req, res, next) => {
  const cookies = leggiCookies(req);
  if (!verificaToken(cookies[COOKIE_NAME])) {
    return res.redirect('/login.html');
  }
  next();
});

app.get('/login.html', (req, res, next) => {
  const cookies = leggiCookies(req);
  if (verificaToken(cookies[COOKIE_NAME])) {
    return res.redirect('/');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/auth/register', express.json(), ah(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const email = String(req.body?.email || '').trim();

  if (!/^[a-zA-Z0-9._\-]{3,50}$/.test(username)) {
    throw errore('Username non valido (3-50 caratteri: lettere, numeri, punto, trattino o underscore)');
  }
  if (password.length < 4 || password.length > 100) {
    throw errore('La password deve avere almeno 4 caratteri');
  }
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw errore('Indirizzo email non valido');
  }

  const esistente = await trovaUtentePerUsername(username);
  if (esistente) throw errore('Questo nome utente è già registrato', 409);

  const id = await creaUtente(username, hashPassword(password), email || null);
  impostaCookieSessione(res, creaToken(id));
  res.status(201).json({ id, username, email: email || null });
}));

app.post('/api/auth/login', express.json(), ah(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) throw errore('Inserisci nome utente e password');

  const utente = await trovaUtentePerUsername(username);
  if (!utente || !verificaPassword(password, utente.password_hash)) {
    throw errore('Nome utente o password non corretti', 401);
  }

  impostaCookieSessione(res, creaToken(utente.id));
  res.json({ id: utente.id, username: utente.username, email: utente.email });
}));

app.post('/api/auth/logout', (req, res) => {
  cancellaCookieSessione(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', richiediAuth, (req, res) => {
  res.json(req.utente);
});

app.get('/api/programmi', richiediAuth, ah(async (req, res) => {
  const adesso = new Date();
  const qa = +req.query.anno, qm = +req.query.mese;
  const a = Number.isInteger(qa) && qa >= 2000 && qa <= 2100 ? qa : adesso.getFullYear();
  const m = Number.isInteger(qm) && qm >= 1 && qm <= 12 ? qm : adesso.getMonth() + 1;
  const inizioMese = `${a}-${p2(m)}-01 00:00:00`;
  const fineMese = `${m === 12 ? a + 1 : a}-${p2(m === 12 ? 1 : m + 1)}-01 00:00:00`;
  const [righe] = await pool.execute(
    'SELECT id,data_inizio,data_fine,tipo,descrizione,giorno,colore FROM programma WHERE utente_id = ? AND data_inizio >= ? AND data_inizio < ? ORDER BY data_inizio',
    [req.utente.id, inizioMese, fineMese]
  );
  res.json(righe);
}));

app.post('/api/programmi', richiediAuth, express.json(), ah(async (req, res) => {
  const id = await inserisci(valida(req.body || {}, req.utente.email), req.utente.id);
  if (!id) throw errore('Programma identico già presente', 409);
  res.status(201).json({ id });
}));

app.get('/api/programmi/tutti', richiediAuth, ah(async (req, res) => res.json(await elencaTutti(req.utente.id))));

app.delete('/api/programmi/:id', richiediAuth, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw errore('Programma non valido');
  if (!await elimina(id, req.utente.id)) throw errore('Programma non trovato', 404);
  res.json({ eliminato: id });
}));

app.post('/api/circolare', richiediAuth, express.raw({ type: 'application/pdf', limit: '15mb' }), ah(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw errore('Carica un file PDF');
  const classi = classiValide(req.query.classi);
  if (!classi.length) throw errore('Aggiungi almeno una classe');
  const raw = await testoPdf(req.body);
  const [tipo, desc] = titoloCircolare(raw);
  const qa = +req.query.anno, a = Number.isInteger(qa) && qa >= 2000 && qa <= 2100 ? qa : new Date().getFullYear();
  const r = estraiImpegni(raw, classi, a, null);
  const creati = [];
  for (const e of r.eventi) {
    const reg = await registra(e, tipo, desc, '#c2410c', req.utente.id, req.utente.email);
    if (reg) creati.push(reg);
  }
  res.status(201).json({ creati, saltate: r.saltate, giaPresenti: r.eventi.length - creati.length, titolo: desc });
}));

app.post('/api/gmail', richiediAuth, express.json(), ah(async (req, res) => {
  res.json(await controllaGmail(classiValide(req.body?.classi), req.utente.id, req.utente.email));
}));

app.post('/api/email/test', richiediAuth, express.json(), ah(async (req, res) => {
  res.json(await inviaEmailTest(req.body?.email || req.utente.email));
}));

app.use((e, req, res, next) => {
  const msg = e.type === 'entity.too.large' ? 'File troppo grande (max 15 MB)' : (e.status ? e.message : 'Errore server: ' + e.message);
  res.status(e.status || 500).json({ errore: msg });
});

let invio = false;
setInterval(async () => {
  if (invio) return; invio = true;
  try { await inviaPromemoria(); } catch (e) { console.error('Promemoria:', e.message); } finally { invio = false; }
}, 60_000);

const porta = +process.env.PORT || 3000;
initSchema().finally(() => {
  app.listen(porta, '127.0.0.1', () => console.log(`Calendario attivo su http://localhost:${porta}`));
});