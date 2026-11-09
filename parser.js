const pdf = require('pdf-parse');

const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const MESI_ABBR = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const TUTTI_MESI = [...MESI, ...MESI_ABBR];

const getMeseNum = str => {
  if (!str) return null;
  const s = str.toLowerCase().replace('.', '');
  let i = MESI.indexOf(s);
  if (i >= 0) return i + 1;
  i = MESI_ABBR.indexOf(s);
  if (i >= 0) return i + 1;
  return null;
};

const RT = /(?<!\d|\d[:.\/])([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:[\/\-–—−]|(?:fino\s+)?alle(?:\s+ore)?|a(?!\p{L}))?\s*([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d|[:.\/]\d)/giu;

// Supporta:
// 1) "18 novembre 2026", "18 nov 2026", "18 nov.", "18 novembre", "18° di novembre"
// 2) "18/11/2026", "18/11/26", "18/11", "18.11", "18-11"
const RD = new RegExp(
  `(?<!\\d|\\d[:.\\/\\-])(?:` +
  `(?:(0?[1-9]|[12]\\d|3[01])[°º]?\\s*(?:di\\s+)?(${TUTTI_MESI.join('|')})\\.?\\s*(20\\d{2}|\\d{2})?(?!\\p{L}))` +
  `|` +
  `(?:(0?[1-9]|[12]\\d|3[01])([\\/.\\-])(0?[1-9]|1[0-2])(?:\\5(20\\d{2}|\\d{2}))?)` +
  `)(?!\\d|[:.\\/\\-]\\d)`,
  'giu'
);

const R_GIORNO_SETT = /(?<![\p{L}\d])(?:luned[ìi]|marted[ìi]|mercoled[ìi]|gioved[ìi]|venerd[ìi]|sabato|domenica|giorno)\s+([012]?\d|3[01])(?!\d)/giu;
const R_MESE_SEZIONE = new RegExp(`(?<![\\p{L}\\d])(?:nel\\s+mese\\s+di\\s+|mese\\s+di\\s+|calendario\\s+)?(${TUTTI_MESI.join('|')})\\.?(?:\\s+(20\\d{2}|\\d{2}))?(?![\\p{L}\\d])`, 'giu');

const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const p2 = n => String(n).padStart(2, '0');
const errore = (m, status = 422) => Object.assign(new Error(m), { status });

const FATTORE_FINESTRA = 80, FINESTRA_MIN = 200, DISTANZA_RIGA = 40, MS_GIORNO = 864e5;
const ROMANI = ['I', 'II', 'III', 'IV', 'V'];
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function classiValide(input) {
  const l = (Array.isArray(input) ? input : String(input || '').split(',')).map(x => String(x).trim().toUpperCase()).filter(Boolean);
  for (const c of l) if (!/^[0-9A-Z\s\/\-ªº°^]{1,7}$/.test(c)) throw errore(`Classe non valida: ${c}`);
  return [...new Set(l)];
}

async function testoPdf(buf) {
  try { return (await pdf(buf)).text; } catch { throw errore('Il PDF non è leggibile'); }
}

function titoloCircolare(testo, fallback = 'Circolare') {
  const m = testo.match(/circolare\s*(?:n\.?|n°|nº|num\.?)?\s*(\d+)[ \t]*[-–:.]?[ \t]*([^\n]*)\n?([^\n]*)/iu);
  const tipo = m ? `Circolare ${m[1]}`.slice(0, 35) : 'Circolare';
  const pulisci = s => s.trim().replace(/^oggetto\s*[:.\-–]?\s*/iu, '').trim();
  const righe = testo.split(/\r?\n/).map(r => r.trim());
  const idx = righe.findIndex(r => /^oggetto(?:\s*[:.\-–]|\s|$)/iu.test(r));
  if (idx >= 0) {
    let t = pulisci(righe[idx]), k = idx + 1;
    while (k < righe.length && !righe[k]) k++;
    if (!t && righe[k]) t = pulisci(righe[k++]);
    for (let n = 0; n < 3 && righe[k] && /^\p{Ll}/u.test(righe[k]); n++, k++) t += ' ' + righe[k];
    if (t) return [tipo, t.replace(/\s+/g, ' ').slice(0, 150)];
  }
  if (m) {
    const soloData = s => /^(?:del\s+)?\d{1,2}[°º]?(?:[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\s+[a-z]+(?:\s+\d{2,4})?)$/iu.test(s) || /^[\p{L}' ]+,\s*\d{1,2}[\/.\- ]/u.test(s);
    const t = [m[2], m[3]].map(pulisci).find(s => s && !soloData(s));
    if (t) return [tipo, t.slice(0, 150)];
  }
  return [tipo, fallback.slice(0, 150)];
}

function parseDateMatch(m) {
  if (!m) return null;
  if (m[1]) {
    const g = +m[1], mese = getMeseNum(m[2]), aRaw = m[3];
    return { giorno: g, mese, anno: aRaw ? (+aRaw < 100 ? 2000 + +aRaw : +aRaw) : null, s: m.index, e: m.index + m[0].length, g: m };
  }
  const g = +m[4], mese = +m[6], aRaw = m[7];
  return { giorno: g, mese, anno: aRaw ? (+aRaw < 100 ? 2000 + +aRaw : +aRaw) : null, s: m.index, e: m.index + m[0].length, g: m };
}

function trovaDataInTesto(fetta, pData, cercaDopo) {
  const matches = [...fetta.matchAll(RD)];
  if (!matches.length) {
    if (!cercaDopo) {
      const ggArr = [...fetta.matchAll(R_GIORNO_SETT)];
      if (ggArr.length) {
        const uGg = ggArr[ggArr.length - 1];
        const mmArr = [...fetta.slice(0, uGg.index).matchAll(R_MESE_SEZIONE)];
        if (mmArr.length) {
          const uMm = mmArr[mmArr.length - 1], mNum = getMeseNum(uMm[1]);
          if (mNum) return { giorno: +uGg[1], mese: mNum, anno: uMm[2] ? (+uMm[2] < 100 ? 2000 + +uMm[2] : +uMm[2]) : null, s: uGg.index, e: uGg.index + uGg[0].length };
        }
      }
    }
    return null;
  }
  const chosen = cercaDopo ? matches[0] : matches[matches.length - 1];
  const p = parseDateMatch(chosen);
  if (!cercaDopo && pData && p.s === pData.s) {
    const ggArr = [...fetta.matchAll(R_GIORNO_SETT)];
    if (ggArr.length) {
      const uGg = ggArr[ggArr.length - 1];
      const mmArr = [...fetta.slice(0, uGg.index).matchAll(R_MESE_SEZIONE)];
      if (mmArr.length) {
        const uMm = mmArr[mmArr.length - 1], mNum = getMeseNum(uMm[1]);
        if (mNum) return { giorno: +uGg[1], mese: mNum, anno: uMm[2] ? (+uMm[2] < 100 ? 2000 + +uMm[2] : +uMm[2]) : null, s: uGg.index, e: uGg.index + uGg[0].length };
      }
    }
  }
  return p;
}

function trova(rx, s, ultimo) {
  const m = [...s.matchAll(rx)];
  if (!m.length) return null;
  const x = ultimo ? m[m.length - 1] : m[0];
  return { g: x, s: x.index, e: x.index + x[0].length };
}

function annoDaData(g, m, part, toll) {
  const a = part.getFullYear();
  return new Date(a, m - 1, g) < new Date(part.getTime() - toll * MS_GIORNO) ? a + 1 : a;
}

function regexDiClasse(f) {
  const m = /^(I{1,3}|IV|V|[1-5])\s*[ªº°^]?\s*([A-Z](?:\s*[-\/]\s*[A-Z])*|[A-Z]{2,4})$/.exec(f.toUpperCase());
  if (!m) return null;
  const gr = /^\d$/.test(m[1]) ? +m[1] : ROMANI.indexOf(m[1]) + 1;
  if (/^[A-Z]{2,4}$/.test(m[2])) {
    const s = m[2], sP = s.toLowerCase();
    const rom = `(?<![\\p{L}\\d])${ROMANI[gr - 1]}(?:\\s+|\\s*[ªº°^]\\s*)${s}(?![\\p{L}\\d])`;
    const ara = `(?<!\\d)${gr}[ªº°^]?(?:\\s?${s}|${sP})(?!\\p{L})`;
    return new RegExp(`(?:${rom}|${ara})`, 'gu');
  }
  const l = [...new Set(m[2].match(/[A-Z]/g))].join('');
  const sez = `[${l}]`, sezP = `[${l.toLowerCase()}]`;
  const gP = '(?:\\s?[A-Z]\\s*[-\\/]\\s*)*', gD = '(?:\\s*[-\\/]\\s*[A-Z])*';
  const rom = `(?<![\\p{L}\\d])${ROMANI[gr - 1]}(?:\\s+|\\s*[ªº°^]\\s*)${gP}${sez}${gD}(?![\\p{L}\\d])`;
  const ara = `(?<!\\d)${gr}[ªº°^]?${gP}(?:\\s?${sez}|${sezP})${gD}(?!\\p{L})`;
  return new RegExp(`(?:${rom}|${ara})`, 'gu');
}

function estraiImpegni(testoGrezzo, classi, annoFisso, dataRif) {
  const testo = testoGrezzo.replace(/\s+/g, ' '), eventi = [], saltate = [];
  const rif = dataRif instanceof Date && !isNaN(dataRif) ? dataRif : new Date();
  let pData = null, emiss = null;
  for (const m of testo.matchAll(RD)) {
    const d = parseDateMatch(m);
    if (d && d.anno) {
      const dt = new Date(d.anno, d.mese - 1, d.giorno);
      if (dt.getFullYear() === d.anno && dt.getMonth() === d.mese - 1 && dt.getDate() === d.giorno) { pData = d; emiss = dt; break; }
    }
  }

  const creaEv = (cl, t, d) => {
    if (!d || !d.giorno || !d.mese || d.mese < 1 || d.mese > 12) return null;
    let a = d.anno !== null ? d.anno : emiss ? annoDaData(d.giorno, d.mese, emiss, 7) : (annoFisso ?? annoDaData(d.giorno, d.mese, rif, 60));
    const i = `${p2(t.g[1])}:${t.g[2]}`, e = `${p2(t.g[3])}:${t.g[4]}`;
    const dt = new Date(a, d.mese - 1, d.giorno);
    if (a < 2000 || a > 2100 || dt.getFullYear() !== a || dt.getMonth() !== d.mese - 1 || dt.getDate() !== d.giorno || !ORA.test(i) || !ORA.test(e) || i >= e) return null;
    return { classe: cl, giorno: d.giorno, data: `${a}-${p2(d.mese)}-${p2(d.giorno)}`, i, e };
  };

  for (const cl of classi) {
    const f = String(cl).trim().replace(/\s+/g, ' '), fin = Math.max(FINESTRA_MIN, f.length * FATTORE_FINESTRA);
    const rx = regexDiClasse(f) || new RegExp(`(?<![\\p{L}\\d])${escapeRegex(f).replace(/ /g, '\\s+')}(?![\\p{L}\\d])`, 'giu');
    let ok = false;

    for (const mc of testo.matchAll(rx)) {
      const iP = Math.max(0, mc.index - fin), tP = testo.slice(iP, mc.index), tmP = trova(RT, tP, true);
      if (!tmP || tP.length - tmP.e > DISTANZA_RIGA) continue;
      const dS = trovaDataInTesto(testo.slice(0, mc.index), pData, false);
      if (!dS) continue;
      const ev = creaEv(cl, tmP, dS);
      if (ev && !eventi.some(x => x.classe === ev.classe && x.data === ev.data && x.i === ev.i && x.e === ev.e)) { eventi.push(ev); ok = true; }
    }

    if (!ok) {
      for (const mc of testo.matchAll(rx)) {
        const fM = mc.index + mc[0].length, iP = Math.max(0, mc.index - fin);
        const tP = testo.slice(iP, mc.index), tD = testo.slice(fM, fM + fin);
        const tmP = trova(RT, tP, true), tmD = trova(RT, tD, false);
        if (!tmP && !tmD) continue;
        let tmS, dS;
        if (tmP && (!tmD || tP.length - tmP.e <= tmD.s)) {
          tmS = tmP; dS = trovaDataInTesto(testo.slice(0, mc.index), pData, false);
        } else {
          tmS = tmD;
          const dTra = trovaDataInTesto(tD.slice(0, tmS.s), null, true);
          const dDopoR = trovaDataInTesto(tD.slice(tmS.e), null, true);
          const dDopo = dDopoR && !/[.;!?]/.test(tD.slice(tmS.e, tmS.e + dDopoR.s)) ? dDopoR : null;
          const dPrima = trovaDataInTesto(tP, pData, false);
          dS = dTra || dDopo || dPrima || trovaDataInTesto(testo.slice(0, fM), pData, false);
        }
        if (!dS) continue;
        const ev = creaEv(cl, tmS, dS);
        if (ev) { eventi.push(ev); ok = true; break; }
      }
    }
    if (!ok) saltate.push(cl);
  }
  return { eventi, saltate };
}

module.exports = { errore, classiValide, testoPdf, titoloCircolare, estraiImpegni };
