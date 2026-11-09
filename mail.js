const path = require('path');
require('dotenv').config({ path: path.join(process.pkg ? path.dirname(process.execPath) : __dirname, '.env') });
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { pool, registra } = require('./db');
const { errore, testoPdf, titoloCircolare, estraiImpegni } = require('./parser');

function pulisci(val) {
  return String(val || '').trim().replace(/^["']|["']$/g, '').trim();
}

let mailer = null, inLettura = false;
function getMailer() {
  const host = pulisci(process.env.SMTP_HOST || 'smtp.gmail.com');
  const user = pulisci(process.env.SMTP_USER);
  const pass = pulisci(process.env.SMTP_PASS).replace(/\s+/g, '');
  if (!user || !pass || user === 'tuamail@gmail.com' || pass === 'PASSWORD_PER_APP') {
    return null;
  }
  if (!mailer) {
    const port = +process.env.SMTP_PORT || 587;
    mailer = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user, pass }
    });
  }
  return mailer;
}

function pulisciHtml(h) {
  return String(h || '')
    .replace(/<(?:style|script)\b[^>]*>[\s\S]*?<\/(?:style|script)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&deg;/gi, '°')
    .replace(/&ordf;/gi, 'ª')
    .replace(/&ordm;/gi, 'º')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

async function inviaEmailTest(destinatario) {
  const tr = getMailer();
  if (!tr) throw errore('Credenziali SMTP mancanti o non configurate nel file .env (imposta SMTP_USER e SMTP_PASS)', 400);
  const dest = pulisci(destinatario) || pulisci(process.env.DEFAULT_EMAIL) || pulisci(process.env.SMTP_USER);
  if (!dest || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) throw errore('Nessun indirizzo email destinatario valido', 400);
  try {
    await tr.verify();
    const info = await tr.sendMail({
      from: `Calendario <${pulisci(process.env.SMTP_USER)}>`,
      to: dest,
      subject: 'Calendario: Test invio email',
      text: 'Se ricevi questa email, la configurazione SMTP del tuo Calendario funziona correttamente!'
    });
    return { ok: true, messaggio: `Email di test inviata con successo a ${dest}`, messageId: info.messageId };
  } catch (e) {
    throw errore(`Invio email fallito: ${e.message}`, 502);
  }
}

async function inviaPromemoria() {
  const tr = getMailer();
  if (!tr) return;
  const [righe] = await pool.query(`SELECT * FROM programma WHERE inviato=0 AND email IS NOT NULL AND email!=''
    AND data_inizio >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
    AND data_inizio <= DATE_ADD(NOW(), INTERVAL promemoria_min MINUTE)`);
  for (const r of righe) {
    try {
      await tr.sendMail({
        from: `Calendario <${pulisci(process.env.SMTP_USER)}>`, to: r.email, subject: `Promemoria: ${r.tipo}`,
        text: `${r.tipo}\n${r.descrizione}\n\nInizio: ${r.data_inizio}\nFine: ${r.data_fine}`
      });
      await pool.execute('UPDATE programma SET inviato=1 WHERE id=?', [r.id]);
      console.log(`Promemoria inviato a ${r.email} per evento #${r.id} (${r.tipo})`);
    } catch (e) { console.error(`Errore promemoria #${r.id}: ${e.message}`); }
  }
}

async function controllaGmail(classi, utenteId = null, emailUtente = null) {
  if (!classi.length) throw errore('Aggiungi almeno una classe prima di controllare Gmail');
  const user = pulisci(process.env.GMAIL_USER);
  const pass = pulisci(process.env.GMAIL_PASS).replace(/\s+/g, '');
  if (!user || !pass || user === 'tuamail@gmail.com' || pass === 'PASSWORD_PER_APP')
    throw errore('Credenziali Gmail mancanti o non configurate nel file .env (GMAIL_USER e GMAIL_PASS)', 400);
  if (inLettura) return { creati: [], saltate: [], controllate: 0 };
  inLettura = true;
  try {
    const client = new ImapFlow({
      host: 'imap.gmail.com', port: 993, secure: true,
      auth: { user, pass }, logger: false
    });
    try { await client.connect(); } catch (e) { throw errore('Accesso Gmail fallito: ' + e.message, 502); }

    const creati = [], trovati = new Set();
    let nuove = 0;
    const lock = await client.getMailboxLock('INBOX');
    try {
      const crit = { since: new Date(Date.now() - (+process.env.GMAIL_GIORNI || 14) * 864e5) };
      const mitt = pulisci(process.env.GMAIL_MITTENTE);
      if (mitt) crit.from = mitt;
      const uids = (await client.search(crit, { uid: true })) || [];
      for (const uid of uids.slice(-100)) {
        const h = await client.fetchOne(uid, { envelope: true }, { uid: true });
        const id = (h?.envelope?.messageId || `uid-${uid}`).slice(0, 255);
        const [gia] = await pool.execute('SELECT 1 FROM mail_elaborate WHERE message_id=?', [id]);
        if (gia.length) continue;
        nuove++;
        try {
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!msg?.source) continue;
          const m = await simpleParser(msg.source);
          const oggetto = (m.subject || '').trim(), rif = m.date || new Date();
          const corpo = (m.text || '').trim() || pulisciHtml(m.html);
          const pdfFonti = [];
          for (const a of m.attachments || []) {
            if (/pdf/i.test(a.contentType) || /\.pdf$/i.test(a.filename || '')) {
              try { const raw = await testoPdf(a.content); pdfFonti.push([raw, ...titoloCircolare(raw, oggetto)]); } catch {}
            }
          }
          const inEmail = new Set();
          for (const [testo, tipo, desc] of pdfFonti) {
            for (const ev of estraiImpegni(testo, classi, null, rif).eventi) {
              const reg = await registra(ev, tipo, desc, '#6d28d9', utenteId, emailUtente);
              trovati.add(ev.classe); inEmail.add(ev.classe);
              if (reg) creati.push({ ...reg, oggetto });
            }
          }
          const resto = classi.filter(c => !inEmail.has(c));
          if (resto.length && corpo) {
            for (const ev of estraiImpegni(corpo, resto, null, rif).eventi) {
              const reg = await registra(ev, 'Email', oggetto.slice(0, 150), '#6d28d9', utenteId, emailUtente);
              trovati.add(ev.classe);
              if (reg) creati.push({ ...reg, oggetto });
            }
          }
          await pool.execute('INSERT IGNORE INTO mail_elaborate (message_id) VALUES (?)', [id]);
        } catch (e) { console.error(`Email ${id}: ${e.message}`); }
      }
    } finally { lock.release(); await client.logout().catch(() => {}); }
    return { creati, saltate: nuevasSaltate(classi, trovati, nuove), controllate: nuove };
  } finally { inLettura = false; }
}

function nuevasSaltate(classi, trovati, nuove) {
  return nuove ? classi.filter(c => !trovati.has(c)) : [];
}

module.exports = { inviaPromemoria, controllaGmail, inviaEmailTest };