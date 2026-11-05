(() => {
'use strict';
const KEY = 'passage.v1';
const CSV_LIVE = 'https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/passport-index-tidy-iso2.csv';
const CSV_LOCAL = 'data/passport-index-tidy-iso2.csv';
const SCHENGEN = ['AT','BE','BG','HR','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','CH'];
const TYPES = {
  passport: { label: 'Pass', icon: '🛂' },
  eta: { label: 'ETA / VoA', short: 'ETA/VoA', icon: '🪪' },
  evisa: { label: 'e-Visum', short: 'e-Visum', icon: '💻' },
  visa: { label: 'Visum', short: 'Visum', icon: '📄' }
};
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------- State ---------- */
const DEF = () => ({ docs: [], s: { remind: { passport: 6, eta: 1, evisa: 2, visa: 2 }, cls: {}, mode: 'free', filter: 'all', push: { url: '', key: '' }, notified: {}, stamp: null } });
let st = DEF();
try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && Array.isArray(r.docs)) { st = { docs: r.docs, s: Object.assign(DEF().s, r.s) }; st.s.remind = Object.assign(DEF().s.remind, r.s?.remind); } } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} pushSync(); };

/* ---------- Datum ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysTo = s => Math.round((parse(s) - parse(today())) / 864e5);
const addMonths = (s, n) => { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
const fmtDate = s => s ? parse(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * 864e5 + 36e5 * 0));
const passById = id => st.docs.find(x => x.id === id && x.type === 'passport');
// Ein Pass gilt als ersetzt, sobald ein Nachfolger („ersetzt Pass …“) gültig ist (oder kein Datum hat).
function supersededOn(p) {
  let r = null;
  for (const x of st.docs) if (x.type === 'passport' && x.replaces === p.id) { const v = x.validFrom || addDays(today(), 0); if (r === null || v < r) r = v; }
  return r;
}
// Effektives Ablaufdatum: eigenes Datum, begrenzt durch Ablauf/Ersetzung des gebundenen Passes
function eff(d) {
  let e = d.expiry;
  const p = d.type === 'passport' ? d : passById(d.passportId);
  if (p) { if (d !== p && p.expiry < e) e = p.expiry; const sup = supersededOn(p); if (sup && addDays(sup, -1) < e) e = addDays(sup, -1); }
  return e;
}
const remindOn = d => addMonths(eff(d), -st.s.remind[d.type]);
function fmtLeft(n) {
  if (n < 0) return `abgelaufen (${-n} T.)`;
  if (n === 0) return 'läuft heute ab';
  if (n <= 60) return `noch ${n} Tag${n === 1 ? '' : 'e'}`;
  if (n < 730) return `noch ${Math.round(n / 30.4)} Mon.`;
  return `noch ${(n / 365.25).toFixed(1).replace('.', ',')} J.`;
}
const state = d => {
  const n = daysTo(eff(d));
  if (n < 0) return 'exp';
  if (today() >= remindOn(d)) return 'due';
  if (d.validFrom && today() < d.validFrom) return 'future';
  return 'ok';
};
const active = d => {
  const p = d.type === 'passport' ? null : passById(d.passportId);
  return (!d.validFrom || today() >= d.validFrom) && today() <= eff(d) && (!p || !p.validFrom || today() >= p.validFrom);
};

/* ---------- Länder ---------- */
let dn; try { dn = new Intl.DisplayNames(['de'], { type: 'region' }); } catch {}
const NAMES = { XK: 'Kosovo', TW: 'Taiwan', PS: 'Palästina', HK: 'Hongkong', MO: 'Macau' };
const cname = c => NAMES[c] || (dn && (() => { try { const n = dn.of(c); return n && n !== c ? n : c; } catch { return c; } })()) || c;
const flag = c => /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(x => 127397 + x.charCodeAt(0))) : '🏳️';
const isSchengenSet = a => a.length === SCHENGEN.length && SCHENGEN.every(c => a.includes(c));
function cdesc(a) {
  if (!a.length) return '–';
  if (isSchengenSet(a)) return 'Schengen-Raum';
  const n = a.map(cname);
  return n.length <= 2 ? n.join(', ') : `${n[0]}, ${n[1]} +${n.length - 2}`;
}

/* ---------- Visa-Daten ---------- */
let V = {}, OVR = { manualRestricted: [], byPassport: {} }, OCC = null, WORLD = null, ALL = [], dataInfo = { src: '', stamp: null, snap: null };
function setVisa(text) {
  const out = {};
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].trim().split(',');
    if (p.length < 3) continue;
    (out[p[0]] ||= {})[p[1]] = p[2];
  }
  V = out;
}
async function loadData() {
  const [w, o, m, oc] = await Promise.all([
    fetch('data/world.json').then(r => r.json()),
    fetch('data/overrides.json').then(r => r.json()).catch(() => OVR),
    fetch('data/meta.json').then(r => r.json()).catch(() => ({})),
    fetch('data/occupied.json').then(r => r.json()).catch(() => null)
  ]);
  OCC = oc;
  WORLD = w; OVR = o; dataInfo.snap = m.snapshot || null;
  let text = null;
  try {
    const r = await (await caches.open('passage-data')).match('live-csv');
    if (r) { text = await r.text(); dataInfo.src = 'live'; dataInfo.stamp = Number(r.headers.get('x-fetched')); }
  } catch {}
  if (!text) { text = await (await fetch(CSV_LOCAL)).text(); dataInfo.src = 'snapshot'; }
  setVisa(text);
  buildAll();
  if (!dataInfo.stamp || Date.now() - dataInfo.stamp > 7 * 864e5) refreshLive().then(() => { paint(); renderSettings(); });
}
async function refreshLive() {
  try {
    const r = await fetch(CSV_LIVE, { cache: 'no-store' });
    if (!r.ok) throw 0;
    const t = await r.text();
    if (!t.startsWith('Passport,Destination,Requirement') || t.length < 300000) throw 0;
    await (await caches.open('passage-data')).put('live-csv', new Response(t, { headers: { 'x-fetched': String(Date.now()) } }));
    setVisa(t); dataInfo.src = 'live'; dataInfo.stamp = Date.now(); buildAll();
    return true;
  } catch { return false; }
}
function buildAll() {
  const s = new Set(Object.keys(WORLD.paths));
  Object.values(V).forEach(m => Object.keys(m).forEach(c => s.add(c)));
  Object.keys(V).forEach(c => s.add(c));
  ALL = [...s].filter(c => /^[A-Z]{2}$/.test(c)).sort((a, b) => cname(a).localeCompare(cname(b), 'de'));
}

/* ---------- Einstufung ---------- */
const RANK = { green: 0, yellow: 1, orange: 2, dark: 3, red: 4 };
const reqVal = (pp, dest) => pp === dest ? '-1' : (OVR.byPassport?.[pp]?.[dest] ?? V[pp]?.[dest]);
function reqClass(v) {
  if (v == null) return null;
  if (v === '-1' || v === 'visa free' || /^\d+$/.test(v)) return 'green';
  if (v === 'eta' || v === 'visa on arrival') return 'yellow';
  if (v === 'e-visa') return 'orange';
  if (v === 'no admission') return 'red';
  return 'dark';
}
// Manuelle Einstufung je Pass und Ziel hat Vorrang (Länderdetail), sonst Zuordnung aus der Quelle
const clsFor = (pp, dest) => st.s.cls[pp + '>' + dest] || reqClass(reqVal(pp, dest));
function reqText(v) {
  if (v == null) return 'keine Daten';
  if (v === '-1') return 'Eigener Staat';
  if (/^\d+$/.test(v)) return `visumfrei, bis ${v} Tage`;
  return { 'visa free': 'visumfrei', 'eta': 'ETA / elektronische Reisegenehmigung', 'e-visa': 'e-Visum (online beantragen)', 'visa on arrival': 'Visum bei Ankunft', 'visa required': 'Visum vorab erforderlich', 'no admission': 'Einreise nicht gestattet' }[v] || v;
}
const citizenships = () => [...new Set(st.docs.filter(d => d.type === 'passport').map(d => d.countries[0]).filter(Boolean))];
const restricted = c => (OVR.manualRestricted || []).includes(c);
const warnText = c => restricted(c) ? 'Für Touristen praktisch nicht bereisbar (manuell festgelegt, data/overrides.json)' : '';
function baseClass(dest, pps) {
  if (pps.includes(dest)) return 'green';
  if (restricted(dest)) return 'red';
  let best = null;
  for (const p of pps) { const c = clsFor(p, dest); if (c && (best === null || RANK[c] < RANK[best])) best = c; }
  return best || 'grey';
}
function docClass(dest, mode) {
  const act = st.docs.filter(d => active(d) && d.countries.includes(dest));
  if (mode === 'only') {
    if (act.some(d => d.type === 'passport')) return 'green';
    if (act.some(d => d.type === 'visa')) return 'dark';
    if (act.some(d => d.type === 'evisa')) return 'orange';
    if (act.some(d => d.type === 'eta')) return 'yellow';
    return 'grey';
  }
  return act.some(d => d.type !== 'passport') ? 'green' : null;
}
function classOf(dest, mode) {
  const pps = citizenships();
  if (mode === 'only') return docClass(dest, 'only');
  const dc = mode === 'docs' ? docClass(dest, 'docs') : null;
  return dc || baseClass(dest, pps);
}

/* ---------- Karte ---------- */
const MAXK = 80;
let marksG, occP, occB = [], mapSvg, mapG, view = { k: 1, x: 0, y: 0 }, selected = null;
const LEG = {
  free: [['green', 'Frei bereisbar'], ['yellow', 'ETA / VoA'], ['orange', 'e-Visum'], ['dark', 'Visum'], ['red', 'Nicht regulär bereisbar'], ['grey', 'Keine Daten']],
  docs: [['green', 'Frei / Dokument vorhanden'], ['yellow', 'ETA / VoA'], ['orange', 'e-Visum'], ['dark', 'Visum'], ['red', 'Nicht regulär bereisbar']],
  only: [['green', 'Pass'], ['yellow', 'ETA / VoA'], ['orange', 'e-Visum'], ['dark', 'Visum'], ['grey', 'Kein Dokument']]
};
const COL = { green: 'var(--green)', yellow: 'var(--yellow)', orange: 'var(--orange)', dark: 'var(--dark)', red: 'var(--red)', grey: 'var(--grey)' };
function initMap() {
  const wrap = $('#mapWrap');
  const ns = 'http://www.w3.org/2000/svg';
  mapSvg = document.createElementNS(ns, 'svg');
  mapSvg.setAttribute('viewBox', `0 0 ${WORLD.w} ${WORLD.h}`);
  mapSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  mapG = document.createElementNS(ns, 'g');
  for (const [c, d] of Object.entries(WORLD.paths)) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d); p.dataset.c = c; p.setAttribute('class', 'c-grey');
    mapG.appendChild(p);
  }
  mapSvg.appendChild(mapG);
  if (OCC) {
    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = ['green', 'yellow', 'orange', 'dark', 'red', 'grey'].map(c => `<pattern id="h-${c}" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="0.8" height="1.6" fill="${COL[c]}"/></pattern>`).join('');
    mapSvg.prepend(defs);
    const mk = (d, cls) => { const e = document.createElementNS(ns, 'path'); e.setAttribute('d', d); e.setAttribute('class', cls); mapG.appendChild(e); return e; };
    occB = [mk(OCC.ua, 'occ'), mk(OCC.ge, 'occ')];
    occP = mk(OCC.ua + OCC.ge, 'occ');
  }
  wrap.prepend(mapSvg);
  // Marker für sehr kleine Staaten/Gebiete (Punkt in konstanter Bildschirmgröße, antippbar)
  marksG = document.createElementNS(ns, 'g');
  for (const [c, [x, y, dim]] of Object.entries(WORLD.marks || {})) {
    const m = document.createElementNS(ns, 'circle');
    m.setAttribute('cx', x); m.setAttribute('cy', y); m.dataset.c = c; m.dataset.dim = dim; m.setAttribute('class', 'c-grey');
    marksG.appendChild(m);
  }
  mapG.appendChild(marksG);
  // Gesten
  const ptrs = new Map(); let moved = false, startDist = 0, startK = 1, down = null;
  const size = () => { const r = wrap.getBoundingClientRect(); return [r.width, r.height]; };
  const apply = () => {
    const [w, h] = size();
    view.k = Math.min(MAXK, Math.max(1, view.k));
    view.x = Math.min(0, Math.max(-w * (view.k - 1), view.x)); view.y = Math.min(0, Math.max(-h * (view.k - 1), view.y));
    if (marksG) { const px = w / WORLD.w, r = (3.4 / px / view.k).toFixed(3); for (const m of marksG.children) { m.setAttribute('r', r); m.style.display = Number(m.dataset.dim) * px * view.k > 16 ? 'none' : ''; } }
    mapSvg.style.setProperty('--sw', (0.6 * WORLD.w / w / view.k).toFixed(3));
    mapSvg.style.transformOrigin = '0 0';
    mapSvg.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
  };
  const zoomAt = (f, cx, cy) => {
    const r = wrap.getBoundingClientRect();
    const nk = Math.min(MAXK, Math.max(1, view.k * f)), real = nk / view.k;
    const px = cx - r.left, py = cy - r.top;
    view.x = px - (px - view.x) * real; view.y = py - (py - view.y) * real; view.k = nk; apply();
  };
  wrap.addEventListener('pointerdown', e => {
    if (e.target.closest('.zoom,.legend,.hint')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false; down = { x: e.clientX, y: e.clientY };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; startDist = Math.hypot(a.x - b.x, a.y - b.y); startK = view.k; }
  });
  wrap.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 2) {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((startK * d / startDist) / view.k, (a.x + b.x) / 2, (a.y + b.y) / 2); moved = true; return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) return;
    moved = true; view.x += dx; view.y += dy; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); apply();
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
    if (!moved && e.type === 'pointerup') {
      const t = document.elementFromPoint(e.clientX, e.clientY);
      if (t && t.dataset && t.dataset.c) openCountry(t.dataset.c);
    }
  };
  wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
  wrap.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.25 : .8, e.clientX, e.clientY); }, { passive: false });
  const mid = () => { const r = wrap.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  $('#zIn').onclick = () => zoomAt(1.6, ...mid());
  $('#zOut').onclick = () => zoomAt(1 / 1.6, ...mid());
  $('#zReset').onclick = () => { view = { k: 1, x: 0, y: 0 }; apply(); };
  window.addEventListener('resize', apply); apply();
  window.__mapZoomTo = (c) => {
    const p = mapG.querySelector(`path[data-c="${c}"]`); if (!p) return;
    const [w, h] = size(), bb = p.getBBox();
    const sc = Math.min(w / WORLD.w, h / WORLD.h), ox = (w - WORLD.w * sc) / 2, oy = (h - WORLD.h * sc) / 2;
    const k = Math.min(60, Math.max(1.5, 0.45 * Math.min(WORLD.w / bb.width, WORLD.h / bb.height)));
    view.k = k; view.x = w / 2 - (ox + (bb.x + bb.width / 2) * sc) * k; view.y = h / 2 - (oy + (bb.y + bb.height / 2) * sc) * k;
    apply();
  };
}
function paint() {
  if (!mapG) return;
  const mode = st.s.mode;
  if (occP) { occP.setAttribute('fill', `url(#h-${classOf('RU', mode)})`); occB[0].setAttribute('fill', COL[classOf('UA', mode)]); occB[1].setAttribute('fill', COL[classOf('GE', mode)]); }
  for (const p of [...mapG.children, ...(marksG ? marksG.children : [])]) if (p.dataset.c) p.setAttribute('class', 'c-' + classOf(p.dataset.c, mode) + (p.dataset.c === selected ? ' sel' : ''));
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $('#legend').innerHTML = LEG[mode].map(([c, t]) => `<span><i style="background:${COL[c]}"></i>${t}</span>`).join('');
  const hint = $('#mapHint');
  if (mode !== 'only' && !citizenships().length) {
    hint.hidden = false;
    hint.innerHTML = 'Für die Reisefreiheit fehlt noch eine Staatsbürgerschaft. <button id="hintAdd">Pass eintragen</button>';
    $('#hintAdd').onclick = () => openForm(null, { type: 'passport' });
  } else hint.hidden = true;
}

/* ---------- Sheets ---------- */
function sheet(title, left, right, body) {
  const root = $('#sheetRoot');
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  const sh = document.createElement('div'); sh.className = 'sheet';
  sh.innerHTML = `<div class="sheet-head"><button data-l>${left || ''}</button><span>${esc(title)}</span><button class="b" data-r>${right || ''}</button></div><div class="sheet-body">${body}</div>`;
  root.append(bg, sh);
  requestAnimationFrame(() => { bg.classList.add('on'); sh.classList.add('on'); });
  const close = () => { bg.classList.remove('on'); sh.classList.remove('on'); setTimeout(() => { bg.remove(); sh.remove(); }, 300); };
  bg.onclick = close;
  $('[data-l]', sh).onclick = close;
  return { sh, close, left: $('[data-l]', sh), right: $('[data-r]', sh), body: $('.sheet-body', sh) };
}

function openCountry(c) {
  selected = c; paint();
  const pps = citizenships();
  const cls = classOf(c, st.s.mode === 'only' ? 'free' : st.s.mode);
  const base = baseClass(c, pps);
  const label = { green: 'Frei bereisbar', yellow: 'ETA / VoA', orange: 'e-Visum', dark: 'Visum erforderlich', red: 'Nicht regulär bereisbar', grey: 'Keine Daten' };
  const ovOpts = (p) => [['', 'Automatisch'], ['green', 'Frei'], ['yellow', 'ETA / VoA'], ['orange', 'e-Visum'], ['dark', 'Visum']].map(([v, t]) => `<option value="${v}" ${(st.s.cls[p + '>' + c] || '') === v ? 'selected' : ''}>${t}</option>`).join('');
  const rows = pps.filter(p => p !== c).map(p => `<div class="row"><span class="ico">${flag(p)}</span><div class="meta"><b>${esc(cname(p))}</b><small>${esc(restricted(c) ? warnText(c) : reqText(reqVal(p, c)))}</small></div><select class="ovsel" data-ov="${p}" aria-label="Einstufung">${ovOpts(p)}</select></div>`).join('');
  const docs = st.docs.filter(d => d.countries.includes(c)).sort((a, b) => eff(a).localeCompare(eff(b)));
  const docRows = docs.map(d => `<button class="row" data-edit="${d.id}"><span class="ico ${d.type}">${TYPES[d.type].icon}</span><div class="meta"><b>${esc(d.title || TYPES[d.type].label)}</b><small>bis ${fmtDate(eff(d))}</small></div><span class="badge ${state(d)}">${fmtLeft(daysTo(eff(d)))}</span></button>`).join('');
  const sug = { yellow: 'eta', orange: 'evisa', dark: 'visa' }[base] || 'eta';
  const s = sheet(cname(c), '', 'Fertig', `
    <div style="text-align:center;padding:4px 0 14px"><div class="big-flag">${flag(c)}</div><div style="margin-top:8px"><span class="pill ${base}" id="cPill">${label[base]}</span></div></div>
    ${pps.length ? `<div class="group-title" style="margin-top:4px">Einreise je Staatsbürgerschaft (Einstufung änderbar)</div><div class="group">${rows}</div>` : '<div class="foot" style="margin:0 0 16px">Noch keine Staatsbürgerschaft hinterlegt.</div>'}
    ${docs.length ? `<div class="group-title">Meine Dokumente</div><div class="group">${docRows}</div>` : ''}
    <button class="btn" id="cAdd">Eintrag für ${esc(cname(c))} hinzufügen</button>
    <div class="foot" style="margin-top:0">Angaben ohne Gewähr – vor Reiseantritt beim Auswärtigen Amt bzw. der Botschaft prüfen.</div>`);
  $$('[data-ov]', s.sh).forEach(sel => sel.onchange = () => {
    const k = sel.dataset.ov + '>' + c;
    if (sel.value) st.s.cls[k] = sel.value; else delete st.s.cls[k];
    save(); const b = baseClass(c, citizenships()); const pill = $('#cPill', s.sh); pill.className = 'pill ' + b; pill.textContent = label[b]; paint();
  });
  const end = () => { selected = null; paint(); };
  s.right.onclick = () => { s.close(); end(); };
  s.left.onclick = () => { s.close(); end(); };
  $('#cAdd', s.sh).onclick = () => { s.close(); end(); openForm(null, { type: sug, countries: [c] }); };
  $$('[data-edit]', s.sh).forEach(b => b.onclick = () => { s.close(); end(); openForm(st.docs.find(d => d.id === b.dataset.edit)); });
  if (window.__mapZoomTo) window.__mapZoomTo(c);
}

function openForm(doc, preset = {}) {
  const isNew = !doc;
  const d = doc ? JSON.parse(JSON.stringify(doc)) : { id: uid(), type: preset.type || 'eta', countries: preset.countries || [], title: '', number: '', validFrom: '', expiry: '', notes: '' };
  let err = '';
  const s = sheet(isNew ? 'Neuer Eintrag' : 'Eintrag', 'Abbrechen', 'Sichern', '');
  const read = () => {
    const g = n => { const e = $(`[name=${n}]`, s.body); return e ? e.value.trim() : d[n]; };
    d.title = g('title'); d.number = g('number'); d.validFrom = g('validFrom'); d.expiry = g('expiry'); d.notes = g('notes');
    const rp = $('[name=replaces]', s.body); if (rp) d.replaces = rp.value; const pi = $('[name=passportId]', s.body); if (pi) d.passportId = pi.value;
    if (d.type === 'passport') delete d.passportId; else delete d.replaces;
    const sel = $('[name=pcountry]', s.body); if (sel) d.countries = sel.value ? [sel.value] : [];
  };
  const draw = () => {
    const pass = d.type === 'passport';
    const others = st.docs.filter(x => x.type === 'passport' && x.id !== d.id);
    const pl = o => `${cname(o.countries[0])} – ${o.title || 'Pass'} (bis ${fmtDate(o.expiry)})`;
    const opts = ALL.map(c => `<option value="${c}" ${d.countries[0] === c ? 'selected' : ''}>${esc(cname(c))}</option>`).join('');
    s.body.innerHTML = `
      <div class="seg" id="fType" style="margin-bottom:16px">${Object.entries(TYPES).map(([k, v]) => `<button data-t="${k}" class="${d.type === k ? 'on' : ''}">${k === 'passport' ? 'Pass' : v.short}</button>`).join('')}</div>
      <div class="group">
        ${pass ? `<div class="row field"><label>Staatsbürgerschaft</label><select name="pcountry"><option value="">Wählen …</option>${opts}</select></div>` : `
        <div class="row field col"><label>Gültig für</label>
          <div class="chips" id="chips">${d.countries.map(c => `<span class="chip">${flag(c)} ${esc(cname(c))}<button data-rm="${c}" aria-label="Entfernen">✕</button></span>`).join('')}</div>
          <div class="search" style="margin:4px 0 0"><input id="cSearch" type="search" placeholder="Land hinzufügen" autocomplete="off"><div class="suggest" id="cSug" hidden></div></div>
          <button type="button" id="addSch" style="color:var(--accent);text-align:left;margin-top:8px;font-size:15px">+ Schengen-Raum (29 Staaten)</button>
        </div>`}
      </div>
      ${pass ? (others.length ? `<div class="group"><div class="row field"><label>Ersetzt Pass</label><select name="replaces"><option value="">– keinen –</option>${others.map(o => `<option value="${o.id}" ${d.replaces === o.id ? 'selected' : ''}>${esc(pl(o))}</option>`).join('')}</select></div></div><div class="foot" style="margin-top:-12px">Der ersetzte Pass und alle daran gebundenen ETA/Visa werden ungültig, sobald dieser Pass gilt (ab „Gültig ab“, sonst sofort).</div>` : '') : (others.length ? `<div class="group"><div class="row field"><label>An Pass gebunden</label><select name="passportId"><option value="">– nicht gebunden –</option>${others.map(o => `<option value="${o.id}" ${d.passportId === o.id ? 'selected' : ''}>${esc(pl(o))}</option>`).join('')}</select></div></div><div class="foot" style="margin-top:-12px">Läuft der Pass ab oder wird er durch einen neuen ersetzt, wird dieser Eintrag automatisch ungültig.</div>` : '')}
      <div class="group">
        <div class="row field"><label>Bezeichnung</label><input type="text" name="title" value="${esc(d.title)}" placeholder="${pass ? 'z. B. Reisepass' : 'z. B. UK ETA'}"></div>
        <div class="row field"><label>Nummer</label><input type="text" name="number" value="${esc(d.number)}" placeholder="optional"></div>
      </div>
      <div class="group">
        <div class="row field"><label>Gültig ab</label><input type="date" name="validFrom" value="${esc(d.validFrom)}"></div>
        <div class="row field"><label>Gültig bis *</label><input type="date" name="expiry" value="${esc(d.expiry)}"></div>
      </div>
      <div class="group"><div class="row field col"><label>Notizen</label><textarea name="notes" placeholder="optional">${esc(d.notes)}</textarea></div></div>
      ${err ? `<div class="err">${esc(err)}</div>` : ''}
      ${isNew ? '' : '<button class="btn danger" id="del" style="margin-top:12px">Eintrag löschen</button>'}`;
    $$('#fType button', s.body).forEach(b => b.onclick = () => { read(); const t = b.dataset.t; if (t === 'passport' && d.type !== 'passport') d.countries = d.countries.slice(0, 1); d.type = t; draw(); });
    $$('[data-rm]', s.body).forEach(b => b.onclick = () => { read(); d.countries = d.countries.filter(c => c !== b.dataset.rm); draw(); });
    const sch = $('#addSch', s.body); if (sch) sch.onclick = () => { read(); d.countries = [...new Set([...d.countries, ...SCHENGEN])]; draw(); };
    const inp = $('#cSearch', s.body);
    if (inp) inp.oninput = () => {
      const q = inp.value.trim().toLowerCase(), box = $('#cSug', s.body);
      const hits = q ? ALL.filter(c => !d.countries.includes(c) && cname(c).toLowerCase().includes(q)).slice(0, 6) : [];
      box.hidden = !hits.length;
      box.innerHTML = hits.map(c => `<button type="button" data-c="${c}">${flag(c)} ${esc(cname(c))}</button>`).join('');
      $$('button', box).forEach(b => b.onclick = () => { read(); d.countries.push(b.dataset.c); draw(); });
    };
    const del = $('#del', s.body); if (del) del.onclick = () => { if (confirm('Eintrag wirklich löschen?')) { st.docs = st.docs.filter(x => x.id !== d.id).map(x => { if (x.passportId === d.id) delete x.passportId; if (x.replaces === d.id) delete x.replaces; return x; }); save(); s.close(); render(); } };
  };
  draw();
  s.right.onclick = () => {
    read();
    if (!d.countries.length) err = d.type === 'passport' ? 'Bitte eine Staatsbürgerschaft wählen.' : 'Bitte mindestens ein Land angeben.';
    else if (!d.expiry) err = 'Bitte ein Ablaufdatum angeben.';
    else if (d.validFrom && d.validFrom > d.expiry) err = '„Gültig ab“ liegt nach dem Ablaufdatum.';
    else err = '';
    if (err) { draw(); return; }
    const i = st.docs.findIndex(x => x.id === d.id);
    if (i >= 0) st.docs[i] = d; else st.docs.push(d);
    delete st.s.notified[d.id];
    save(); s.close(); render(); checkReminders();
  };
}

/* ---------- Liste ---------- */
function renderList() {
  $$('#filterSeg button').forEach(b => b.classList.toggle('on', b.dataset.f === st.s.filter));
  const f = st.s.filter;
  const docs = st.docs.filter(d => f === 'all' || d.type === f).sort((a, b) => eff(a).localeCompare(eff(b)));
  const due = st.docs.filter(d => state(d) === 'due' || state(d) === 'exp' && daysTo(eff(d)) > -90);
  let h = '';
  if (due.length) h += `<div class="banner">⏰ ${due.length} Eintrag${due.length === 1 ? '' : 'e'} laufen bald ab oder sind kürzlich abgelaufen.</div>`;
  if (!docs.length) h += `<div class="empty"><div class="big">🛂</div><p>${st.docs.length ? 'Keine Einträge in dieser Kategorie.' : 'Noch keine Einträge.<br>Lege deinen Pass, ETAs und Visa an – die Karte und Erinnerungen entstehen daraus.'}</p></div>`;
  else h += `<div class="group">${docs.map(d => `<button class="row" data-id="${d.id}"><span class="ico ${d.type}">${TYPES[d.type].icon}</span><div class="meta"><b>${esc(d.title || TYPES[d.type].label)}</b><small>${esc(cdesc(d.countries))} · bis ${fmtDate(eff(d))}</small></div><span class="badge ${state(d)}">${state(d) === 'future' ? 'ab ' + fmtDate(d.validFrom) : fmtLeft(daysTo(eff(d)))}</span></button>`).join('')}</div><div class="foot" style="margin-top:-8px">Sortiert nach Ablaufdatum, früheste zuerst.</div>`;
  $('#listBody').innerHTML = h;
  $$('#listBody [data-id]').forEach(b => b.onclick = () => openForm(st.docs.find(x => x.id === b.dataset.id)));
}

/* ---------- Erinnerungen ---------- */
async function notify(title, body, tag) {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
  } catch {}
}
function checkReminders() {
  const due = st.docs.filter(d => { const s = state(d); return s === 'due' || (s === 'exp' && daysTo(eff(d)) > -30); });
  try { if ('setAppBadge' in navigator) due.length ? navigator.setAppBadge(due.length) : navigator.clearAppBadge(); } catch {}
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  for (const d of due) {
    if (st.s.notified[d.id] === today()) continue;
    st.s.notified[d.id] = today();
    notify(`${d.title || TYPES[d.type].label} (${cdesc(d.countries)})`, `${fmtLeft(daysTo(eff(d)))} – Ablauf am ${fmtDate(eff(d))}`, d.id);
  }
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {}
}
function ics() {
  const dt = s => s.replace(/-/g, '');
  const nx = s => dt(iso(new Date(parse(s).getTime() + 864e5 + 3600e3)));
  const ev = st.docs.map(d => {
    const n = Math.max(1, Math.round((parse(eff(d)) - parse(remindOn(d))) / 864e5));
    const title = `${d.title || TYPES[d.type].label} (${cdesc(d.countries)}) läuft ab`;
    const al = (trig, txt) => `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:${txt}\r\nTRIGGER:${trig}\r\nEND:VALARM\r\n`;
    return `BEGIN:VEVENT\r\nUID:${d.id}@passage\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}\r\nDTSTART;VALUE=DATE:${dt(eff(d))}\r\nDTEND;VALUE=DATE:${nx(eff(d))}\r\nSUMMARY:${title.replace(/[,;]/g, ' ')}\r\n` +
      al(`-P${n - 1}DT15H`, 'Erinnerung: ' + title.replace(/[,;]/g, ' ')) + (n > 8 ? al('-P6DT15H', 'In einer Woche: ' + title.replace(/[,;]/g, ' ')) : '') + `END:VEVENT\r\n`;
  }).join('');
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Passage//DE\r\nCALSCALE:GREGORIAN\r\n${ev}END:VCALENDAR\r\n`;
}
async function shareFile(name, type, content) {
  const file = new File([content], name, { type });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- Server-Push (optional) ---------- */
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
async function pushSubscribe() {
  const { url, key } = st.s.push;
  if (!url || !key) throw new Error('Worker-URL und VAPID-Public-Key eintragen.');
  if (await Notification.requestPermission() !== 'granted') throw new Error('Mitteilungen nicht erlaubt.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
  await pushSync(sub);
}
async function pushSync(sub) {
  const { url } = st.s.push; if (!url) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    sub = sub || await reg.pushManager.getSubscription(); if (!sub) return;
    const reminders = st.docs.map(d => ({ id: d.id, title: `${d.title || TYPES[d.type].label} (${cdesc(d.countries)})`, remindOn: remindOn(d), expiry: eff(d) }));
    const r = await fetch(url.replace(/\/$/, '') + '/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub, reminders }) });
    if (!r.ok) throw new Error('Server: ' + r.status);
  } catch (e) { if (sub) throw e; }
}

/* ---------- Einstellungen ---------- */
function renderSettings() {
  const perm = 'Notification' in window ? Notification.permission : 'nicht verfügbar';
  const stp = (k, lab) => `<div class="row"><div class="meta"><b>${lab}</b></div><div class="stepper"><button data-s="${k}" data-d="-1">−</button><span>${st.s.remind[k]} ${st.s.remind[k] === 1 ? 'Monat' : 'Monate'}</span><button data-s="${k}" data-d="1">+</button></div></div>`;
  const when = dataInfo.stamp ? new Date(dataInfo.stamp).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  $('#settingsBody').innerHTML = `
    <div class="group-title">Erinnerung vor Ablauf</div>
    <div class="group plain">${stp('passport', 'Pass')}${stp('eta', 'ETA / VoA')}${stp('evisa', 'e-Visum')}${stp('visa', 'Visum')}</div>
    <div class="group-title">Benachrichtigungen</div>
    <div class="group plain">
      <button class="row" id="bNotif"><div class="meta"><b>Mitteilungen auf diesem Gerät</b><small>Status: ${perm === 'granted' ? 'erlaubt' : perm === 'denied' ? 'abgelehnt (in iOS-Einstellungen ändern)' : perm === 'default' ? 'noch nicht erlaubt' : perm}</small></div><span class="chev">›</span></button>
      <button class="row" id="bIcs"><div class="meta"><b>Kalender-Erinnerungen (.ics)</b><small>Funktioniert zuverlässig auf dem iPhone, auch ohne Server</small></div><span class="chev">›</span></button>
    </div>
    <div class="foot">Ohne eigenen Push-Server erscheinen Mitteilungen nur, wenn die App geöffnet wird. Für echte Hintergrund-Push: siehe unten und README.</div>
    <div class="group-title">Länder-Einstufung</div>
    <div class="group plain">
      <div class="row"><div class="meta"><b>Gelb · ETA / VoA</b><small>einfacher Online-Antrag mit schneller Erteilung oder Visum bei Ankunft</small></div></div>
      <div class="row"><div class="meta"><b>Orange · e-Visum</b><small>aufwendigerer Online-Antrag mit Bearbeitungszeit</small></div></div>
      <div class="row"><div class="meta"><b>Dunkelorange · Visum</b><small>physisches Visum (Botschaft/Konsulat)</small></div></div>
    </div>
    <div class="foot">Die Quelle unterscheidet bei „e-Visum“ nicht zwischen schnell und aufwendig; alle e-Visa starten daher orange. Pro Land und Pass lässt sich das im Länderdetail (Karte antippen) korrigieren.</div>
    <div class="group-title">Reisedaten</div>
    <div class="group plain">
      <div class="row"><div class="meta"><b>Quelle</b><small>Passport Index Dataset (GitHub, ilyankou) · ${dataInfo.src === 'live' ? 'live abgerufen ' + when : 'eingebauter Stand ' + (dataInfo.snap || '')}</small></div></div>
      <div class="row"><div class="meta"><b>Rot (manuell festgelegt)</b><small>${(OVR.manualRestricted || []).map(cname).join(', ') || '–'} · Änderung: data/overrides.json</small></div></div>
      <div class="row"><div class="meta"><b>Besetzte Gebiete (Schraffur)</b><small>DeepState (OSINT, kein amtlicher Datensatz), Stand ${OCC ? OCC.fetched : '–'}</small></div></div>
      <button class="row" id="bData"><div class="meta"><b>Jetzt aktualisieren</b></div><span class="chev">›</span></button>
    </div>
    <div class="group-title">Push-Server (optional, fortgeschritten)</div>
    <div class="group plain">
      <div class="row field"><label>Worker-URL</label><input type="url" id="pUrl" value="${esc(st.s.push.url)}" placeholder="https://…workers.dev"></div>
      <div class="row field"><label>VAPID Public Key</label><input type="text" id="pKey" value="${esc(st.s.push.key)}" placeholder="B…"></div>
      <button class="row" id="bPush"><div class="meta"><b>Push aktivieren</b></div><span class="chev">›</span></button>
    </div>
    <div class="group-title">Daten</div>
    <div class="group plain">
      <button class="row" id="bExp"><div class="meta"><b>Sicherung exportieren (JSON)</b></div><span class="chev">›</span></button>
      <button class="row" id="bImp"><div class="meta"><b>Sicherung importieren</b></div><span class="chev">›</span></button>
    </div>
    <input type="file" id="fImp" accept="application/json" hidden>
    <div class="foot">Alle Einträge liegen nur lokal auf diesem Gerät. Bitte gelegentlich eine Sicherung exportieren.</div>
    <div class="foot" style="margin-top:0">Angaben zu Einreisebestimmungen ohne Gewähr. Karte: Natural Earth.</div>`;
  const root = $('#settingsBody');
  $$('[data-s]', root).forEach(b => b.onclick = () => { const k = b.dataset.s; st.s.remind[k] = Math.min(36, Math.max(1, st.s.remind[k] + Number(b.dataset.d))); save(); renderSettings(); renderList(); checkReminders(); });
  $('#bNotif').onclick = async () => { if (!('Notification' in window)) return alert('Mitteilungen werden hier nicht unterstützt. Auf dem iPhone: App zum Home-Bildschirm hinzufügen (iOS 16.4+).'); await Notification.requestPermission(); renderSettings(); checkReminders(); if (Notification.permission === 'granted') notify('Passage', 'Mitteilungen sind aktiv.', 'test'); };
  $('#bIcs').onclick = () => st.docs.length ? shareFile('passage-erinnerungen.ics', 'text/calendar', ics()) : alert('Noch keine Einträge.');
  $('#bData').onclick = async () => { $('#bData small')?.remove(); const ok = await refreshLive(); alert(ok ? 'Reisedaten aktualisiert.' : 'Aktualisierung fehlgeschlagen (offline oder Quelle nicht erreichbar). Der bisherige Stand bleibt aktiv.'); paint(); renderSettings(); };
  $('#pUrl').onchange = e => { st.s.push.url = e.target.value.trim(); save(); };
  $('#pKey').onchange = e => { st.s.push.key = e.target.value.trim(); save(); };
  $('#bPush').onclick = async () => { try { st.s.push.url = $('#pUrl').value.trim(); st.s.push.key = $('#pKey').value.trim(); await pushSubscribe(); alert('Push aktiviert.'); } catch (e) { alert('Fehler: ' + e.message); } };
  $('#bExp').onclick = () => shareFile(`passage-sicherung-${today()}.json`, 'application/json', JSON.stringify({ docs: st.docs, s: st.s }, null, 2));
  $('#bImp').onclick = () => $('#fImp').click();
  $('#fImp').onchange = async e => {
    try { const j = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(j.docs)) throw 0; if (!confirm(`${j.docs.length} Einträge importieren? Bestehende Daten werden ersetzt.`)) return; st = { docs: j.docs, s: Object.assign(DEF().s, j.s) }; save(); render(); } catch { alert('Datei nicht lesbar.'); }
  };
}

/* ---------- Navigation ---------- */
function tab(t) {
  $$('.view').forEach(v => v.hidden = v.id !== 'view-' + t);
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  if (t === 'map') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}
function render() { paint(); renderList(); renderSettings(); }
function wire() {
  $$('#tabbar button').forEach(b => b.onclick = () => tab(b.dataset.tab));
  $$('#modeSeg button').forEach(b => b.onclick = () => { st.s.mode = b.dataset.mode; save(); paint(); });
  $$('#filterSeg button').forEach(b => b.onclick = () => { st.s.filter = b.dataset.f; save(); renderList(); });
  $('#addBtn').onclick = () => openForm(null);
  const inp = $('#mapSearch'), box = $('#mapSuggest');
  inp.oninput = () => {
    const q = inp.value.trim().toLowerCase();
    const hits = q ? ALL.filter(c => cname(c).toLowerCase().includes(q)).slice(0, 6) : [];
    box.hidden = !hits.length;
    box.innerHTML = hits.map(c => `<button data-c="${c}">${flag(c)} ${esc(cname(c))}</button>`).join('');
    $$('button', box).forEach(b => b.onclick = () => { box.hidden = true; inp.value = ''; inp.blur(); openCountry(b.dataset.c); });
  };
}

/* ---------- Start ---------- */
(async function () {
  wire();
  renderList(); renderSettings();
  try { await loadData(); initMap(); render(); } catch (e) { $('#mapWrap').insertAdjacentHTML('afterbegin', '<div class="hint">Kartendaten konnten nicht geladen werden.</div>'); console.error(e); }
  checkReminders();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); renderList(); } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
})();
