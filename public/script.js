const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const GIORNI = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
const $ = id => document.getElementById(id);
const p2 = n => String(n).padStart(2, '0');
const PUNTINI = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

let anno = new Date().getFullYear(), mese = new Date().getMonth() + 1;
let utenteCorrente = null;
let classi = [];
let primo = true, inAnalisi = false, bersaglio = null, tt;

function chiaveClassi() {
  return utenteCorrente ? `classi_${utenteCorrente.id}` : 'classi';
}

function caricaClassi() {
  try {
    const raw = localStorage.getItem(chiaveClassi()) ?? localStorage.getItem('classi');
    const l = JSON.parse(raw);
    classi = Array.isArray(l) ? l.filter(x => typeof x === 'string' && x.trim()) : [];
  } catch { classi = []; }
  chips();
}

function toast(msg, err) {
  const t = $('toast'); t.textContent = msg; t.className = 'on' + (err ? ' err' : '');
  clearTimeout(tt); tt = setTimeout(() => t.className = '', 5000);
}

async function chiama(opts, url) {
  const r = await fetch(url, opts), j = await r.json().catch(() => ({}));
  if (r.status === 401) {
    location.href = '/login.html';
    throw new Error('Sessione scaduta');
  }
  if (!r.ok) throw new Error(j.errore || 'Errore di rete');
  return j;
}

async function aggiornaTutto(giornoFocus) {
  const adesso = new Date();
  $('mese').value = mese; $('anno').value = anno;
  let tutti = [];
  try { tutti = await chiama({}, '/api/programmi/tutti'); } catch (e) { toast(e.message, true); }

  const prefissoMese = `${anno}-${p2(mese)}-`;
  const perGiorno = new Map();
  for (const e of tutti) {
    if (e.data_inizio.startsWith(prefissoMese)) {
      const g = +e.giorno;
      if (!perGiorno.has(g)) perGiorno.set(g, []);
      perGiorno.get(g).push(e);
    }
  }

  const cal = $('cal'), st = cal.scrollTop, sl = cal.scrollLeft, n = new Date(anno, mese, 0).getDate();
  const fragCal = document.createDocumentFragment();
  const ore = s => { const [a, b] = s.slice(11, 16).split(':'); return +a + b / 60; };
  const celleOre = Array.from({ length: 24 }, (_, o) => `<div class="cell">${o}</div>`).join('');

  for (let g = 1; g <= n; g++) {
    const d = new Date(anno, mese - 1, g), col = document.createElement('div');
    col.className = 'day' + (d.toDateString() === adesso.toDateString() ? ' oggi' : '');
    col.innerHTML = `<div class="head"><span>${GIORNI[d.getDay()]}</span><b>${g}</b></div><div class="hours">${celleOre}</div>`;
    const h = col.lastChild;

    const evs = (perGiorno.get(g) || []).slice().sort((a, b) => a.data_inizio.localeCompare(b.data_inizio));
    const clusters = [];
    for (const e of evs) {
      const i = ore(e.data_inizio), f = Math.max(i + 0.25, ore(e.data_fine));
      const u = clusters[clusters.length - 1];
      if (u && i < u.maxF - 0.05) {
        u.items.push({ e, i, f });
        u.maxF = Math.max(u.maxF, f);
      } else {
        clusters.push({ minI: i, maxF: f, items: [{ e, i, f }] });
      }
    }

    for (const cl of clusters) {
      if (cl.items.length === 1) {
        const { e, i, f } = cl.items[0];
        const b = document.createElement('div'), intest = `${e.data_inizio.slice(11, 16)}–${e.data_fine.slice(11, 16)} ${e.tipo}`;
        b.className = 'ev'; b.style.setProperty('--c', e.colore);
        b.style.top = `calc(var(--u) * ${i})`;
        b.style.height = `max(calc(var(--u) * ${f - i} - 2px), 52px)`;
        const corpo = document.createElement('div'); corpo.className = 'ev-corpo';
        const t = document.createElement('b'); t.textContent = intest; corpo.append(t);
        if (e.descrizione) {
          const dEl = document.createElement('div'); dEl.className = 'desc'; dEl.textContent = e.descrizione; corpo.append(dEl);
        }
        b.append(corpo, bottonePuntini(e.id)); h.append(b);
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'ev-slideshow';
        wrap.style.top = `calc(var(--u) * ${cl.minI})`;
        wrap.style.height = `max(calc(var(--u) * ${cl.maxF - cl.minI} - 2px), 52px)`;
        const track = document.createElement('div'); track.className = 'ev-track';
        let attivo = 0; const tot = cl.items.length;

        const nav = document.createElement('div'); nav.className = 'ev-nav';
        const btnP = document.createElement('button'); btnP.type = 'button'; btnP.textContent = '‹'; btnP.title = 'Precedente';
        const badge = document.createElement('span'); badge.textContent = `1/${tot}`;
        const btnS = document.createElement('button'); btnS.type = 'button'; btnS.textContent = '›'; btnS.title = 'Successivo';

        const aggiornaSlide = () => {
          track.style.transform = `translateX(-${attivo * 100}%)`;
          badge.textContent = `${attivo + 1}/${tot}`;
        };
        btnP.onclick = ev => { ev.stopPropagation(); attivo = (attivo - 1 + tot) % tot; aggiornaSlide(); };
        btnS.onclick = ev => { ev.stopPropagation(); attivo = (attivo + 1) % tot; aggiornaSlide(); };
        nav.append(btnP, badge, btnS);

        for (const { e } of cl.items) {
          const s = document.createElement('div'); s.className = 'ev-slide'; s.style.setProperty('--c', e.colore);
          const corpo = document.createElement('div'); corpo.className = 'ev-corpo';
          const intest = `${e.data_inizio.slice(11, 16)}–${e.data_fine.slice(11, 16)} ${e.tipo}`;
          const t = document.createElement('b'); t.textContent = intest; corpo.append(t);
          if (e.descrizione) {
            const dEl = document.createElement('div'); dEl.className = 'desc'; dEl.textContent = e.descrizione; corpo.append(dEl);
          }
          s.append(corpo, bottonePuntini(e.id)); track.append(s);
        }

        let startX = 0;
        wrap.ontouchstart = ev => { startX = ev.touches[0].clientX; };
        wrap.ontouchend = ev => {
          const diffX = ev.changedTouches[0].clientX - startX;
          if (diffX < -30) { attivo = (attivo + 1) % tot; aggiornaSlide(); }
          else if (diffX > 30) { attivo = (attivo - 1 + tot) % tot; aggiornaSlide(); }
        };
        wrap.append(nav, track); h.append(wrap);
      }
    }
    fragCal.append(col);
  }
  cal.replaceChildren(fragCal);
  const scorriGiorno = g => { const c = cal.children[g - 1]; cal.scrollLeft = c ? c.offsetLeft : 0; };
  if (primo) {
    cal.scrollTop = innerHeight / 12 * 8;
    if (mese === adesso.getMonth() + 1 && anno === adesso.getFullYear()) scorriGiorno(adesso.getDate());
    primo = false;
  } else {
    cal.scrollTop = st;
    if (typeof giornoFocus === 'number') scorriGiorno(giornoFocus);
    else cal.scrollLeft = sl;
  }

  const ul = $('elenco'), oggiIso = `${adesso.getFullYear()}-${p2(adesso.getMonth() + 1)}-${p2(adesso.getDate())}`;
  if (!tutti.length) {
    const li = document.createElement('li'); li.className = 'vuoto'; li.textContent = 'Nessun programma';
    return ul.replaceChildren(li);
  }
  let prossimo = null;
  ul.replaceChildren(...tutti.map(e => {
    const giorno = e.data_inizio.slice(0, 10), [a, m, g] = giorno.split('-');
    const li = document.createElement('li'); li.className = 'voce' + (giorno < oggiIso ? ' passato' : '');
    li.style.setProperty('--c', e.colore);
    const pallino = document.createElement('i'); pallino.className = 'pallino';
    const testo = document.createElement('div'); testo.className = 'testo'; testo.title = 'Mostra nel calendario';
    const quando = document.createElement('b'); quando.textContent = `${g}/${m}/${a} · ${e.data_inizio.slice(11, 16)}–${e.data_fine.slice(11, 16)}`;
    const cosa = document.createElement('span'); cosa.textContent = [e.tipo, e.descrizione].filter(Boolean).join(' — ');
    testo.append(quando, cosa); testo.onclick = () => { chiudiPannello(); vai(+m, +a, +g); };
    li.append(pallino, testo, bottonePuntini(e.id));
    if (!prossimo && giorno >= oggiIso) prossimo = li;
    return li;
  }));
  if (prossimo) ul.scrollTop = prossimo.offsetTop;
}

function chiudiPannello() {
  document.body.classList.remove('menu-aperto');
  $('velo').hidden = true;
}
$('pannello').onclick = () => {
  const ap = document.body.classList.toggle('menu-aperto');
  $('velo').hidden = !ap;
};
$('velo').onclick = chiudiPannello;

function vai(m, a, g) {
  mese = m; anno = Math.max(2000, Math.min(2100, Math.trunc(a) || anno));
  if (mese < 1) { mese = 12; anno = Math.max(2000, anno - 1); } else if (mese > 12) { mese = 1; anno = Math.min(2100, anno + 1); }
  const d = new Date(), gf = g || (mese === d.getMonth() + 1 && anno === d.getFullYear() ? d.getDate() : 0);
  aggiornaTutto(gf);
}

$('mese').innerHTML = MESI.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
$('mese').onchange = () => vai(+$('mese').value, anno);
$('anno').onchange = () => vai(mese, +$('anno').value || anno);
$('prec').onclick = () => vai(mese - 1, anno);
$('succ').onclick = () => vai(mese + 1, anno);
$('oggi').onclick = () => { const d = new Date(); vai(d.getMonth() + 1, d.getFullYear(), d.getDate()); };

$('nuovo').onclick = () => {
  $('frm').reset();
  const maxG = new Date(anno, mese, 0).getDate();
  $('frm').giorno.max = maxG;
  $('frm').giorno.value = Math.min(new Date().getDate(), maxG);
  if (utenteCorrente?.email && !$('frm').email.value) {
    $('frm').email.value = utenteCorrente.email;
  }
  $('dlg').showModal();
};
$('annulla').onclick = () => $('dlg').close();
$('frm').onsubmit = async e => {
  e.preventDefault();
  const dati = { ...Object.fromEntries(new FormData(e.target)), anno, mese };
  try {
    await chiama({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dati) }, '/api/programmi');
    $('dlg').close(); chiudiPannello(); toast('Programma salvato'); aggiornaTutto(+dati.giorno);
  } catch (err) { toast(err.message, true); }
};

function chips() {
  try { localStorage.setItem(chiaveClassi(), JSON.stringify(classi)); } catch {}
  $('chips').replaceChildren(...classi.map(c => {
    const s = document.createElement('span'); s.textContent = c + ' ×'; s.title = 'Rimuovi';
    s.onclick = () => { classi = classi.filter(x => x !== c); chips(); }; return s;
  }));
}

function aggiungiClasse() {
  const v = $('classe').value.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!/^[0-9A-Z\s\/\-ªº°^]{1,7}$/.test(v)) return toast('Classe non valida (es. III F)', true);
  if (!classi.includes(v)) classi.push(v);
  $('classe').value = ''; chips();
}
$('addClasse').onclick = aggiungiClasse;
$('classe').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); aggiungiClasse(); } };

$('analizza').onclick = async () => {
  if (inAnalisi) return;
  if (!$('pdf').files[0] || !classi.length) return toast('Scegli un PDF e aggiungi almeno una classe', true);
  inAnalisi = true;
  try {
    mostra(await chiama({ method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: $('pdf').files[0] },
      `/api/circolare?anno=${anno}&classi=${encodeURIComponent(classi.join(','))}`));
  } catch (err) { toast(err.message, true); }
  finally { inAnalisi = false; }
};

function mostra(j, silenzioso) {
  if (!j.creati.length && 'controllate' in j) {
    if (!silenzioso) toast(`Nessun nuovo impegno · ${j.controllate} email nuove controllate`);
    return aggiornaTutto();
  }
  const dett = j.creati.map(c => `${c.classe}: ${c.data.split('-').reverse().join('/')} ${c.inizio}-${c.fine}` + (c.oggetto ? ` (${c.oggetto})` : '')).join('\n');
  const gia = !j.creati.length && j.giaPresenti ? ' (già presenti)' : '';
  const tot = `${j.creati.length} impegni creati${gia}` + (j.saltate?.length ? ` · non trovati: ${j.saltate.join(', ')}` : '');
  toast([tot, dett].filter(Boolean).join('\n'));
  if ('Notification' in window && j.creati.length) Notification.requestPermission().then(p => p === 'granted' && new Notification('Calendario', { body: tot }));
  if (!silenzioso && j.creati[0]) { chiudiPannello(); const [a, m, g] = j.creati[0].data.split('-'); vai(+m, +a, +g); } else aggiornaTutto();
}

function bottonePuntini(id) {
  const m = document.createElement('button');
  m.type = 'button'; m.className = 'dots'; m.title = 'Opzioni'; m.innerHTML = PUNTINI;
  m.setAttribute('aria-label', 'Opzioni programma'); m.setAttribute('aria-haspopup', 'menu');
  m.onclick = ev => { ev.stopPropagation(); apriMenu(m, id); };
  return m;
}

function chiudiMenu() {
  $('menu').hidden = true; bersaglio = null;
  $('elimina').textContent = 'Elimina'; $('elimina').classList.remove('conferma');
}

function apriMenu(btn, id) {
  const chiudeSoltanto = bersaglio === id && !$('menu').hidden;
  chiudiMenu();
  if (chiudeSoltanto) return;
  bersaglio = id;
  const m = $('menu'), r = btn.getBoundingClientRect();
  m.hidden = false;
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8)) + 'px';
  $('elimina').focus();
}

$('elimina').onclick = async () => {
  const b = $('elimina');
  if (!b.classList.contains('conferma')) { b.classList.add('conferma'); b.textContent = 'Conferma eliminazione'; return; }
  const id = bersaglio; chiudiMenu();
  try {
    await chiama({ method: 'DELETE' }, `/api/programmi/${id}`);
    toast('Programma eliminato'); aggiornaTutto();
  } catch (err) { toast(err.message, true); }
};
document.addEventListener('click', e => { if (!e.target.closest('#menu')) chiudiMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudiMenu(); });
document.addEventListener('scroll', chiudiMenu, true);

$('esci').onclick = async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  location.href = '/login.html';
};

(async () => {
  try {
    utenteCorrente = await chiama({}, '/api/auth/me');
    $('utenteNome').textContent = utenteCorrente.username;
    $('utenteNome').title = utenteCorrente.email ? `${utenteCorrente.username} (${utenteCorrente.email})` : utenteCorrente.username;
    caricaClassi();
    aggiornaTutto();
  } catch {}
})();

function applicaTema(t) {
  document.documentElement.dataset.theme = t;
  $('tema').setAttribute('aria-label', t === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro');
  try { localStorage.setItem('tema', t); } catch {}
}
$('tema').onclick = () => applicaTema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
applicaTema(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
