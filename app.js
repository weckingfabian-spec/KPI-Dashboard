/* ================================================
   FABIAN WECKING — LIFE DASHBOARD
   app.js  (v2 — blue redesign + CRM pipeline)
   ================================================ */

'use strict';

// ================================================
// SUPABASE
// ================================================

const SUPABASE_URL = 'https://itsgjkzzrvxlajrfklgd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0c2dqa3p6cnZ4bGFqcmZrbGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTIyNzksImV4cCI6MjA5MDM4ODI3OX0.15Z_xwiiZ0MdBpUKUYuKRsrYMwuZT7vdSeHBnx_r9ug';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ================================================
// DATA DEFINITIONS
// ================================================

const STORAGE_KEY = 'fw_dashboard_v2';

const MORNING = [
  { label: '5:00 – 5:30 aufstehen', min: 30 },
  { label: 'Bewegung / Sport', min: 0 },
  { label: 'TOP 5 Ziele aufschreiben', min: 0 },
  { label: 'Kalte Dusche', min: 0 },
  { label: 'Affirmationen', min: 0 },
  { label: 'Vision Board gecheckt?', min: 0 },
];

const EVENING = [
  { label: '10 Min aufräumen', ta: false },
  { label: 'Wofür bin ich heute besonders dankbar?', ta: true, key: 'gratitude' },
  { label: 'Welche neuen Ideen hatte ich heute?', ta: true, key: 'ideas' },
  { label: 'Welche wichtigen To-Dos gibt es morgen?', ta: true, key: 'todos' },
  { label: 'Was ist die EINE Sache, die ich morgen erledigen kann, damit alles andere einfacher oder überflüssig wird?', ta: true, key: 'one_thing' },
  { label: '30 min lesen oder Englisch lernen', ta: false },
];

const KPI_CATS = [
  {
    name: 'Kunden im Portal',
    items: [
      { id: 'neue_interessenten',       label: 'Neue Interessenten / Potenziale',  target: 30 },
      { id: 'kunden_portal',            label: 'Kunden ges. im Portal',            target: null },
      { id: 'kunden_bewertungsauftrag', label: 'Kunden mit Bewertungsauftrag',     target: 8 },
      { id: 'bewertungsunterlagen',     label: 'Bewertungsunterlagen angefordert', target: null },
      { id: 'bewertungen_tpq',          label: 'Bewertungen über TPQ',             target: null },
    ]
  },
  {
    name: 'Veranstaltungen (BGA)',
    items: [
      { id: 'anmeld_bga_dig',   label: 'Anmeldungen BGA digital',  target: null },
      { id: 'besucher_bga_dig', label: 'Besucher BGA digital',     target: null },
      { id: 'anmeld_bga_ort',   label: 'Anmeldungen BGA vor Ort',  target: null },
      { id: 'besucher_bga_ort', label: 'Besucher BGA vor Ort',     target: null },
    ]
  },
  {
    name: 'Aktiver Beratungsprozess',
    items: [
      { id: 'kai_s2',              label: 'KAI S2 Termine',             target: 10,   fromPipeline: 'kai_s2' },
      { id: 'reservierungsber',    label: 'Reservierungsberatungen',    target: null, fromPipeline: 'reservierung' },
      { id: 'notar_vereinbart',    label: 'Notartermine vereinbart',    target: 2,    fromPipeline: 'notar_vorlage' },
      { id: 'notar_stattgefunden', label: 'Notartermine stattgefunden', target: 2 },
    ]
  },
];

const CTRL_ITEMS = [
  { id: 'gemeldetes_vol',    label: 'Gemeldetes Volumen',               fmt: 'EUR' },
  { id: 'eingereichtes_vol', label: 'Eingereichtes Volumen',            fmt: 'EUR' },
  { id: 'produktivitaet',    label: 'Produktivität',                    fmt: 'EUR' },
  { id: 'anzahl_kunden',     label: 'Anzahl beratener Kunden',          fmt: '#' },
  { id: 'einkommen',         label: 'Einkommen',                        fmt: 'EUR' },
  { id: 'notar_mtl',         label: 'Notartermine stattgefunden (mtl.)',fmt: '#' },
];

// Volume factors
const FAKTOR_NORMAL = 0.7657887917;
const FAKTOR_EIGEN  = 1.5315775834; // = FAKTOR_NORMAL × 2

function calcVolumen(entry) {
  const f = entry.isEigenkunde ? FAKTOR_EIGEN : FAKTOR_NORMAL;
  return (entry.amount || 0) * f;
}

// Pipeline entry types — define type meta here
const PL_TYPES = [
  { id: 'notar_vorlage', label: 'Notartermin in Vorlage', color: '#1db868' },
  { id: 'kai_s2',        label: 'KAI S2 Termin',          color: '#f09b1a' },
  { id: 'reservierung',  label: 'Reservierungsberatung',  color: '#7048e8' },
  { id: 'interessent',   label: 'Neuer Interessent',      color: '#1d7fc4' },
  { id: 'bga',           label: 'BGA Anmeldung',          color: '#0e9e7a' },
];

const TRAINING = {
  push: {
    label: 'Push — Montag',
    exercises: [
      { name: 'Incline Kurzhanteldrücken',     sets: 4, range: '8–12 Wdh' },
      { name: 'Maschine Schulterdrücken',       sets: 4, range: '10–14 Wdh' },
      { name: 'Brustpresse / Cable Flyes',      sets: 4, range: '12–16 Wdh' },
      { name: 'Kabelzug Seitheben',             sets: 4, range: '14–20 Wdh' },
      { name: 'Trizeps Pushdown (Kabelzug)',    sets: 4, range: '12–16 Wdh' },
      { name: 'Dips',                           sets: 3, range: '8–15 Wdh' },
    ]
  },
  pull: {
    label: 'Pull — Mittwoch',
    exercises: [
      { name: 'Klimmzüge / Latzug',             sets: 4, range: '6–12 Wdh' },
      { name: 'T-Bar Rudern',                    sets: 4, range: '8–12 Wdh' },
      { name: 'Rowing Machine (Hammer Strength)',sets: 4, range: '10–14 Wdh' },
      { name: 'Face Pulls / Reverse Flyes',      sets: 3, range: '15–20 Wdh' },
      { name: 'Wechselnde KH Curls',             sets: 3, range: '10–14 Wdh' },
      { name: 'Scott Curls / Kabelzug Curls',    sets: 3, range: '10–15 Wdh' },
    ]
  },
  legs: {
    label: 'Beine — Freitag',
    exercises: [
      { name: 'Kniebeugen',                     sets: 4, range: '8–12 Wdh' },
      { name: 'Beinpresse',                      sets: 4, range: '12–16 Wdh' },
      { name: 'Liegende Beinbeuger',             sets: 4, range: '12–16 Wdh' },
      { name: 'Ausfallschritte',                 sets: 3, range: '12–16 je Bein' },
      { name: 'Sitzende Wadenheben',             sets: 4, range: '15–20 Wdh' },
      { name: 'Ab-Roller / Hängende Beinheben', sets: 3, range: '12–20 Wdh' },
    ]
  },
  optional: {
    label: 'Optional — Sonntag',
    exercises: [
      { name: 'Kabelzug Crunches',              sets: 4, range: '15–20 Wdh' },
      { name: 'Hängende Beinheben',             sets: 3, range: '12–20 Wdh' },
      { name: 'Schulterdrücken',                sets: 3, range: '10–15 Wdh' },
      { name: 'Einarmiges Seitheben',           sets: 3, range: '15–20 je Seite' },
      { name: 'Prowler Push / Komplex',         sets: 3, range: '5–8 Runden' },
    ]
  }
};

const WEEKLY_SECS = [
  {
    id: 's1', title: '1) Reflexion der letzten Woche',
    fields: [
      { key: 'voranschritt',  label: 'Wie gut habe ich meinen Erfolg vorangeschritten?', ml: true },
      { key: 'gut_gelaufen',  label: 'Was lief besonders gut?', ml: true },
      { key: 'one_thing',     label: 'Was ist die EINE Sache, die ich nächste Woche tun kann, um schneller zu wachsen?', ml: true },
    ]
  },
  {
    id: 's2', title: '2) Check Zielvereinbarungsprozess',
    fields: [
      { key: 'on_track',      label: 'Bin ich auf Kurs? (Ja → wie vor Plan? / Nein → warum, was bringt mich zurück?)', ml: true },
      { key: 'eink_transfer', label: 'Einkommen nach Verteilungsschlüssel überwiesen?', ml: false },
    ]
  },
  {
    id: 's3', title: '3) Gute Gewohnheiten',
    fields: [
      { key: 'habits_ok',      label: 'Habe ich meine Gewohnheiten eingehalten?', ml: true },
      { key: 'habits_easy',    label: 'Was fiel leicht?', ml: true },
      { key: 'habits_learned', label: 'Was habe ich über mich gelernt?', ml: true },
      { key: 'one_habit',      label: 'Welche EINE Gewohnheit kann ich nächste Woche optimieren?', ml: false },
    ]
  },
  {
    id: 's4', title: '4) Terminlage / Partnerlage',
    fields: [
      { key: 'top15',    label: 'Kontakt zu allen TOP 15? (Wer fehlt und warum?)', ml: true },
      { key: 'pipeline', label: 'Welche Termine sind in der Pipeline? Revenue-Potenzial?', ml: true },
      { key: 'erfolgs',  label: 'Welche Erfolgstermine sind geplant?', ml: true },
      { key: 'partner',  label: 'Wen treffe ich, um das Team voranzubringen?', ml: true },
    ]
  },
  {
    id: 's5', title: '5) Wochenziel festlegen',
    fields: [
      { key: 'new_people', label: 'Wie viele neue Menschen nächste Woche → GM 01.03.2028-Plan?', ml: false },
      { key: 's1_conv',    label: 'Wie viele S1- und RC-Gespräche, um das Monatsziel zu treffen?', ml: false },
    ]
  },
  {
    id: 's6', title: '6) Monatsziel',
    fields: [
      { key: 'vol_plan',   label: 'Volumen geplant (€)', ml: false },
      { key: 'vol_ist',    label: 'Volumen erreicht (€)', ml: false },
      { key: 'part_plan',  label: 'Partner geplant', ml: false },
      { key: 'part_ist',   label: 'Partner erreicht', ml: false },
      { key: 'monthly_ot', label: 'Was tue ich nächste Woche, um das Monatsziel zu erreichen?', ml: true },
    ]
  },
];

// ================================================
// UTILITIES
// ================================================

function todayKey() { return new Date().toISOString().split('T')[0]; }

function weekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const wn = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(wn).padStart(2, '0')}`;
}

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtEuro(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}

function fmtDate(ds) {
  try {
    const d = new Date(ds + 'T12:00:00');
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch(e) { return ds; }
}

function fmtDateShort(ds) {
  if (!ds) return '';
  try {
    const d = new Date(ds + 'T12:00:00');
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch(e) { return ds; }
}

function fmtMonth(ms) {
  const [y, m] = ms.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function fmtWeek(wk) {
  return `KW ${wk.split('-W')[1]} · ${wk.split('-W')[0]}`;
}

function el(id) { return document.getElementById(id); }

function ensure(obj, key, def) {
  if (obj[key] === undefined || obj[key] === null) {
    obj[key] = typeof def === 'function' ? def() : JSON.parse(JSON.stringify(def));
  }
  return obj[key];
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ================================================
// PERSISTENCE  (Supabase)
// ================================================

let S           = {};
let currentUser = null;
let saveTimer   = null;

async function loadState() {
  const { data } = await db
    .from('dashboard_data')
    .select('data')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  S = (data && data.data) ? data.data : {};
  ensure(S, 'pipeline', []);
  ensure(S, 'daily', {});
  ensure(S, 'weekly', {});
  ensure(S, 'monthly', {});
  ensure(S, 'training', {});
  if (S.customers_csv === undefined) S.customers_csv = null;
}

function saveState() {
  if (!currentUser) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await db.from('dashboard_data').upsert(
      { user_id: currentUser.id, data: S, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }, 600);
}

// ================================================
// PIPELINE HELPERS
// ================================================

function pipelineStats(mk) {
  const all = S.pipeline || [];
  const month = mk || monthKey();

  const active   = all.filter(e => e.status === 'active');
  const thisMonth = all.filter(e => e.month === month);

  return {
    notar_active:       active.filter(e => e.type === 'notar_vorlage').length,
    fdl_active:         active.filter(e => e.type === 'fdl_vorlage').length,
    kai_s2_month:       thisMonth.filter(e => e.type === 'kai_s2').length,
    notar_month:        thisMonth.filter(e => e.type === 'notar_vorlage').length,
    kaufpreis_active:   active.reduce((s, e) => s + (e.amount || 0), 0),
    volumen_active:     active.reduce((s, e) => s + calcVolumen(e), 0),
    vol_active:         active.reduce((s, e) => s + (e.amount || 0), 0), // kept for TV
    by_type: (type) => thisMonth.filter(e => e.type === type).length,
  };
}

function typeLabel(id) {
  const t = PL_TYPES.find(t => t.id === id);
  return t ? t.label : id;
}

function typeColor(id) {
  const t = PL_TYPES.find(t => t.id === id);
  return t ? t.color : '#4a68a8';
}

// ================================================
// NAVIGATION
// ================================================

let activeTab = 'overview';

function switchTab(tab) {
  activeTab = tab;
  // Desktop nav
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  // Mobile nav
  document.querySelectorAll('.mob-nav-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `t-${tab}`));
  const map = {
    overview: renderOverview,
    daily:    renderDaily,
    weekly:   renderWeekly,
    monthly:  renderMonthly,
    pipeline: renderPipeline,
    kunden:   renderKunden,
    training: renderTraining,
  };
  if (map[tab]) map[tab]();
}

// ================================================
// OVERVIEW
// ================================================

function renderOverview() {
  const mk = monthKey();
  const stats = pipelineStats(mk);
  const ctrl = ((S.monthly || {})[mk] || {}).controlling || {};

  // KPI cards from pipeline
  setTxt('ov-notar',  stats.notar_active);
  setTxt('ov-eink',   ctrl.einkommen ? fmtEuro(ctrl.einkommen) : '—');
  setTxt('ov-vol',    ctrl.gemeldetes_vol ? fmtEuro(ctrl.gemeldetes_vol) : '—');

  // Progress bars
  renderPB('pb-kai',   stats.kai_s2_month, 10, 'KAI S2 Termine');
  renderPB('pb-notar', stats.notar_month,  2,  'Notartermine vereinbart');

  // Routine today
  const td = todayKey();
  const day = (S.daily || {})[td] || {};
  const mDone = (day.morning || []).filter(Boolean).length;
  const eDone = (day.evening || []).filter(Boolean).length;
  setTxt('ov-morning', `${mDone} / ${MORNING.length}`);
  setTxt('ov-evening', `${eDone} / ${EVENING.length}`);
  setTxt('ov-date', fmtDate(td));
  setTxt('ov-streak', calcStreak());

  // TV cards
  setTxt('tv-notar', stats.notar_active || '—');
  setTxt('tv-kai',   `${stats.kai_s2_month}/10`);
  setTxt('tv-eink',  ctrl.einkommen ? fmtEuro(ctrl.einkommen) : '—');
}

function setTxt(id, v) {
  const e = el(id);
  if (e) e.textContent = v;
}

function renderPB(cid, val, target, label) {
  const c = el(cid);
  if (!c) return;
  const pct = target ? Math.min(100, (val / target) * 100) : 0;
  const cls = pct >= 100 ? 'g' : pct < 40 ? 'r' : '';
  c.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
      <span style="font-size:12px;color:var(--text-2)">${label}</span>
      <span style="font-size:13px;color:var(--blue-l);font-family:var(--ff-serif);font-weight:600">${val}
        <span style="color:var(--text-3);font-family:var(--ff-sans);font-weight:400;font-size:11px">/ ${target}</span>
      </span>
    </div>
    <div class="pb"><div class="pb-fill ${cls}" style="width:${pct}%"></div></div>`;
}

function calcStreak() {
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().split('T')[0];
    const day = (S.daily || {})[key] || {};
    const done = (day.morning || []).filter(Boolean).length;
    if (done >= MORNING.length) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

// ================================================
// DAILY
// ================================================

function renderDaily() {
  const td = todayKey();
  ensure(S.daily, td, () => ({
    morning: new Array(MORNING.length).fill(false),
    evening: new Array(EVENING.length).fill(false),
    et: {}
  }));
  const day = S.daily[td];

  setTxt('daily-date', fmtDate(td));

  // Morning
  const mList = el('morning-list');
  mList.innerHTML = '';
  MORNING.forEach((item, i) => {
    const done = !!day.morning[i];
    const div = document.createElement('div');
    div.className = `ri${done ? ' done' : ''}`;
    div.innerHTML = `
      <div class="ri-check"></div>
      <div class="ri-body">
        <div class="ri-label">${item.label}</div>
        ${item.min > 0 ? `<div class="ri-time">${item.min} min</div>` : ''}
      </div>`;
    div.addEventListener('click', () => {
      day.morning[i] = !day.morning[i];
      saveState();
      renderDaily();
    });
    mList.appendChild(div);
  });

  const mDone = day.morning.filter(Boolean).length;
  setTxt('m-count', mDone);
  setTxt('m-total', MORNING.length);
  el('m-pb').style.width = `${(mDone / MORNING.length) * 100}%`;

  // Evening
  const eList = el('evening-list');
  eList.innerHTML = '';
  EVENING.forEach((item, i) => {
    const done = !!day.evening[i];
    const div = document.createElement('div');
    div.className = `ri${done ? ' done' : ''}`;

    if (item.ta) {
      div.innerHTML = `
        <div class="ri-check" style="margin-top:3px"></div>
        <div class="ri-body">
          <div class="ri-label" style="margin-bottom:8px">${item.label}</div>
          <textarea class="f-ta" style="min-height:58px" placeholder="...">${(day.et || {})[item.key] || ''}</textarea>
        </div>`;
      const ta = div.querySelector('textarea');
      ta.addEventListener('click', e => e.stopPropagation());
      ta.addEventListener('input', () => {
        if (!day.et) day.et = {};
        day.et[item.key] = ta.value;
        saveState();
      });
      div.querySelector('.ri-check').addEventListener('click', e => {
        e.stopPropagation();
        day.evening[i] = !day.evening[i];
        saveState();
        renderDaily();
      });
    } else {
      div.innerHTML = `<div class="ri-check"></div><div class="ri-label">${item.label}</div>`;
      div.addEventListener('click', () => {
        day.evening[i] = !day.evening[i];
        saveState();
        renderDaily();
      });
    }
    eList.appendChild(div);
  });

  const eDone = day.evening.filter(Boolean).length;
  setTxt('e-count', eDone);
  setTxt('e-total', EVENING.length);
  el('e-pb').style.width = `${(eDone / EVENING.length) * 100}%`;
}

// ================================================
// WEEKLY
// ================================================

function renderWeekly() {
  const wk = weekKey();
  ensure(S.weekly, wk, {});
  const week = S.weekly[wk];

  setTxt('weekly-wk', fmtWeek(wk));

  const container = el('weekly-container');
  container.innerHTML = '';

  WEEKLY_SECS.forEach(sec => {
    ensure(week, sec.id, {});
    const sd = week[sec.id];

    const div = document.createElement('div');
    div.className = 'ws';
    div.innerHTML = `<div class="ws-title">${sec.title}</div>`;

    sec.fields.forEach(f => {
      const fg = document.createElement('div');
      fg.className = 'f-group';
      if (f.ml) {
        fg.innerHTML = `<label class="f-lbl">${f.label}</label>
          <textarea class="f-ta">${sd[f.key] || ''}</textarea>`;
        fg.querySelector('textarea').addEventListener('input', function() {
          sd[f.key] = this.value; saveState();
        });
      } else {
        fg.innerHTML = `<label class="f-lbl">${f.label}</label>
          <input class="f-in" type="text" value="${esc(sd[f.key] || '')}">`;
        fg.querySelector('input').addEventListener('input', function() {
          sd[f.key] = this.value; saveState();
        });
      }
      div.appendChild(fg);
    });
    container.appendChild(div);
  });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

// ================================================
// MONTHLY
// ================================================

let curMonth = monthKey();

function renderMonthly() {
  setTxt('mn-display', fmtMonth(curMonth));

  ensure(S.monthly, curMonth, { kpis: {}, controlling: {} });
  const md = S.monthly[curMonth];
  ensure(md, 'kpis', {});
  ensure(md, 'controlling', {});

  const stats = pipelineStats(curMonth);

  // KPI rows
  const kpiC = el('kpi-container');
  kpiC.innerHTML = '';

  KPI_CATS.forEach(cat => {
    const catDiv = document.createElement('div');
    catDiv.innerHTML = `<div class="cat-div">${cat.name}</div>`;

    cat.items.forEach(item => {
      // Auto-fill from pipeline if available
      let val = md.kpis[item.id] || 0;
      let fromPL = false;
      if (item.fromPipeline) {
        val = stats.by_type(item.fromPipeline);
        fromPL = true;
      }

      const pct = item.target ? Math.min(100, (val / item.target) * 100) : null;
      const cls = pct !== null ? (pct >= 100 ? 'g' : pct < 40 ? 'r' : '') : '';

      const row = document.createElement('div');
      row.className = 'kpi-row';
      row.innerHTML = `
        <div class="kpi-row-name">${item.label}${fromPL ? '<span style="font-size:9px;color:var(--blue-d);margin-left:5px">● Pipeline</span>' : ''}</div>
        <div class="kpi-row-target">${item.target ? `Ziel ${item.target}` : ''}</div>
        <input type="number" class="n-in" value="${val || ''}" placeholder="0" min="0" ${fromPL ? 'readonly style="opacity:0.6;cursor:not-allowed"' : ''}>
        <div>${pct !== null ? `<div class="pb" style="margin:0"><div class="pb-fill ${cls}" style="width:${pct}%"></div></div>` : ''}</div>`;

      if (!fromPL) {
        const inp = row.querySelector('input');
        const fill = row.querySelector('.pb-fill');
        inp.addEventListener('input', () => {
          const v = parseFloat(inp.value) || 0;
          md.kpis[item.id] = v;
          saveState();
          if (fill && item.target) {
            const p = Math.min(100, (v / item.target) * 100);
            fill.style.width = `${p}%`;
            fill.className = `pb-fill ${p >= 100 ? 'g' : p < 40 ? 'r' : ''}`;
          }
        });
      }
      catDiv.appendChild(row);
    });
    kpiC.appendChild(catDiv);
  });

  // Controlling rows
  const ctrlC = el('ctrl-container');
  ctrlC.innerHTML = '';

  CTRL_ITEMS.forEach(item => {
    const val = md.controlling[item.id] || 0;
    const row = document.createElement('div');
    row.className = 'ctrl-row';
    row.innerHTML = `
      <div class="kpi-row-name">${item.label}</div>
      <div class="ctrl-type">${item.fmt === 'EUR' ? '€' : '#'}</div>
      <input type="number" class="n-in" value="${val || ''}" placeholder="0" min="0" step="${item.fmt === 'EUR' ? '1000' : '1'}">`;
    row.querySelector('input').addEventListener('input', function() {
      md.controlling[item.id] = parseFloat(this.value) || 0;
      saveState();
    });
    ctrlC.appendChild(row);
  });
}

// ================================================
// PIPELINE / CRM
// ================================================

let plFilter = 'all';
let editingId = null;

function renderPipeline() {
  const mk = monthKey();
  const stats = pipelineStats(mk);

  setTxt('pl-month', fmtMonth(mk));

  // Stats cards (4 cards)
  const kpFs = s => s > 9999999 ? '22px' : s > 999999 ? '26px' : '38px';
  const statsEl = el('pl-stats');
  statsEl.innerHTML = `
    <div class="pl-stat notar">
      <div class="pl-stat-lbl">Notartermine in Vorlage</div>
      <div class="pl-stat-val green">${stats.notar_active}</div>
      <div class="pl-stat-sub">aktive Einträge</div>
    </div>
    <div class="pl-stat fdl">
      <div class="pl-stat-lbl">KAI S2 Termine (MTD)</div>
      <div class="pl-stat-val blue">${stats.kai_s2_month}</div>
      <div class="pl-stat-sub">Ziel: 10 / Monat</div>
    </div>
    <div class="pl-stat" style="border-bottom-color:var(--text-3)">
      <div class="pl-stat-lbl">Kaufpreise (aktiv)</div>
      <div class="pl-stat-val" style="font-size:${kpFs(stats.kaufpreis_active)}">${fmtEuro(stats.kaufpreis_active)}</div>
      <div class="pl-stat-sub">Summe aller Kaufpreise</div>
    </div>
    <div class="pl-stat vol">
      <div class="pl-stat-lbl">Volumen (aktiv)</div>
      <div class="pl-stat-val amber" style="font-size:${kpFs(stats.volumen_active)}">${fmtEuro(stats.volumen_active)}</div>
      <div class="pl-stat-sub">Kaufpreis × Faktor (0.77 / 1.53)</div>
    </div>`;

  // Entry list
  renderPipelineList();
}

let dragSrcId = null;

function renderPipelineList() {
  const list = el('pl-list');
  if (!list) return;

  let entries = (S.pipeline || []).slice(); // natural order (newest first via unshift)

  if (plFilter !== 'all') {
    if (plFilter === 'done') {
      entries = entries.filter(e => e.status === 'done' || e.status === 'cancelled');
    } else {
      entries = entries.filter(e => e.type === plFilter && e.status === 'active');
    }
  } else {
    entries = [
      ...entries.filter(e => e.status === 'active'),
      ...entries.filter(e => e.status !== 'active'),
    ];
  }

  list.innerHTML = '';

  if (entries.length === 0) {
    list.innerHTML = `<div class="no-entries">Noch keine Einträge. Klick auf "+ Eintrag hinzufügen".</div>`;
    return;
  }

  entries.forEach(entry => {
    const card = document.createElement('div');
    card.className = `pl-entry${entry.status !== 'active' ? ' ' + entry.status : ''}`;
    card.draggable = true;
    card.dataset.id = entry.id;

    const metaParts = [];
    if (entry.date)  metaParts.push(fmtDateShort(entry.date));
    if (entry.notes) metaParts.push(entry.notes.substring(0, 50) + (entry.notes.length > 50 ? '…' : ''));

    // Volumen for this entry
    const vol = calcVolumen(entry);

    card.innerHTML = `
      <div class="drag-handle" title="Verschieben">⠿</div>
      <div class="pl-entry-dot" style="background:${typeColor(entry.type)}"></div>
      <div class="pl-entry-main">
        <div class="pl-entry-name">${esc(entry.name)}</div>
        <div class="pl-entry-meta">${metaParts.join(' · ') || '–'}</div>
      </div>
      ${entry.amount ? `<div class="pl-entry-amount" title="Kaufpreis">${fmtEuro(entry.amount)}</div>` : ''}
      ${vol > 0 ? `<div style="font-size:12px;color:var(--text-3);white-space:nowrap;flex-shrink:0" title="Volumen (×Faktor)">${fmtEuro(vol)}</div>` : ''}
      ${entry.isEigenkunde ? `<div class="eigen-badge">Eigenkunde</div>` : ''}
      <div class="pl-entry-tag tag-${entry.type}">${typeLabel(entry.type)}</div>
      <div class="pl-entry-actions">
        ${entry.status === 'active' ? `<button class="action-btn done-btn" title="Abschließen">✓</button>` : ''}
        <button class="action-btn edit-btn" title="Bearbeiten">✎</button>
        <button class="action-btn del-btn" title="Löschen">✕</button>
      </div>`;

    // Drag & drop
    card.addEventListener('dragstart', e => {
      dragSrcId = entry.id;
      setTimeout(() => card.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      list.querySelectorAll('.pl-entry').forEach(c => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.pl-entry').forEach(c => c.classList.remove('drag-over'));
      if (dragSrcId !== entry.id) card.classList.add('drag-over');
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (!dragSrcId || dragSrcId === entry.id) return;
      const srcIdx = S.pipeline.findIndex(x => x.id === dragSrcId);
      const tgtIdx = S.pipeline.findIndex(x => x.id === entry.id);
      if (srcIdx >= 0 && tgtIdx >= 0) {
        const [moved] = S.pipeline.splice(srcIdx, 1);
        S.pipeline.splice(tgtIdx, 0, moved);
        saveState();
        renderPipeline();
      }
    });

    // Done button
    const doneBtn = card.querySelector('.done-btn');
    if (doneBtn) {
      doneBtn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = S.pipeline.findIndex(x => x.id === entry.id);
        if (idx >= 0) { S.pipeline[idx].status = 'done'; saveState(); renderPipeline(); }
      });
    }

    card.querySelector('.edit-btn').addEventListener('click', e => {
      e.stopPropagation();
      openForm(entry.id);
    });

    card.querySelector('.del-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`"${entry.name}" wirklich löschen?`)) {
        S.pipeline = S.pipeline.filter(x => x.id !== entry.id);
        saveState();
        renderPipeline();
      }
    });

    list.appendChild(card);
  });
}

function openForm(editId) {
  editingId = editId || null;
  const form = el('pl-form');
  form.style.display = 'block';

  // Reset
  el('pf-name').value    = '';
  el('pf-type').value    = 'notar_vorlage';
  el('pf-amount').value  = '';
  el('pf-date').value    = todayKey();
  el('pf-notes').value   = '';
  el('pf-eigen').checked = false;
  setTxt('pf-title', editId ? 'Eintrag bearbeiten' : 'Neuen Eintrag anlegen');

  if (editId) {
    const entry = (S.pipeline || []).find(e => e.id === editId);
    if (entry) {
      el('pf-name').value    = entry.name || '';
      el('pf-type').value    = entry.type || 'notar_vorlage';
      el('pf-amount').value  = entry.amount || '';
      el('pf-date').value    = entry.date || todayKey();
      el('pf-notes').value   = entry.notes || '';
      el('pf-eigen').checked = !!entry.isEigenkunde;
    }
  }

  el('pf-name').focus();
}

function closeForm() {
  el('pl-form').style.display = 'none';
  editingId = null;
}

function saveEntry() {
  const name = el('pf-name').value.trim();
  if (!name) { el('pf-name').focus(); return; }

  const isEigen = el('pf-eigen').checked;
  const amount  = parseFloat(el('pf-amount').value) || 0;
  const entry = {
    id:           editingId || genId(),
    name:         name,
    type:         el('pf-type').value,
    amount:       amount,
    volumen:      amount * (isEigen ? FAKTOR_EIGEN : FAKTOR_NORMAL),
    isEigenkunde: isEigen,
    date:         el('pf-date').value || todayKey(),
    notes:        el('pf-notes').value.trim(),
    status:       'active',
    created:      todayKey(),
    month:        monthKey(),
  };

  if (editingId) {
    const idx = S.pipeline.findIndex(e => e.id === editingId);
    if (idx >= 0) {
      entry.status  = S.pipeline[idx].status;
      entry.created = S.pipeline[idx].created;
      entry.month   = S.pipeline[idx].month;
      S.pipeline[idx] = entry;
    }
  } else {
    S.pipeline.unshift(entry); // newest at top
  }

  saveState();
  closeForm();
  renderPipeline();
  // Update overview counts
  if (activeTab === 'overview') renderOverview();
}

// ================================================
// KUNDENÜBERSICHT
// ================================================

const kuOpen = {};

function toggleKuTile(key) {
  kuOpen[key] = !kuOpen[key];
  const body  = el(`kb-${key}`);
  const arrow = el(`ka-${key}`);
  if (body)  body.classList.toggle('open', !!kuOpen[key]);
  if (arrow) arrow.classList.toggle('open', !!kuOpen[key]);
}

function renderKunden() {
  const all    = S.pipeline || [];
  const active = all.filter(e => e.status === 'active');

  const byDate = (a, b) => (a.date || '') < (b.date || '') ? -1 : 1;

  const kaiEntries   = active.filter(e => e.type === 'kai_s2').sort(byDate);
  const resEntries   = active.filter(e => e.type === 'reservierung').sort(byDate);
  const notarEntries = active.filter(e => e.type === 'notar_vorlage').sort(byDate);
  const csvData      = S.customers_csv;

  setTxt('ktn-kai',   kaiEntries.length   || '0');
  setTxt('ktn-res',   resEntries.length   || '0');
  setTxt('ktn-notar', notarEntries.length || '0');
  setTxt('ktn-eing',  csvData ? csvData.rows.length : '—');

  // Render expanded bodies
  renderKuBody('kai',   kaiEntries);
  renderKuBody('res',   resEntries);
  renderKuBody('notar', notarEntries);
  renderKuBodyCSV('eing');
}

function renderKuBody(key, entries) {
  const body = el(`kb-${key}`);
  if (!body) return;

  if (entries.length === 0) {
    body.innerHTML = `<div style="text-align:center;padding:28px 0;color:var(--text-3);font-size:13px">
      Keine aktiven Einträge. Eintrag in der Pipeline anlegen.
    </div>`;
    return;
  }

  body.innerHTML = entries.map(e => `
    <div class="ku-customer-row">
      <div class="ku-customer-date">${e.date ? fmtDateShort(e.date) : '—'}</div>
      <div class="ku-customer-main">
        <div class="ku-customer-name">${esc(e.name)}</div>
        ${e.notes ? `<div class="ku-customer-extras">${esc(e.notes.substring(0, 60))}${e.notes.length > 60 ? '…' : ''}</div>` : ''}
      </div>
      ${e.amount ? `<div style="font-size:13px;font-family:var(--ff-serif);font-weight:700;color:var(--amber);flex-shrink:0">${fmtEuro(e.amount)}</div>` : ''}
    </div>
  `).join('');
}

function renderKuBodyCSV(key) {
  const body = el(`kb-${key}`);
  if (!body) return;

  const csv = S.customers_csv;

  if (!csv || !csv.rows || csv.rows.length === 0) {
    body.innerHTML = `
      <div class="ku-csv-area">
        <p>Noch keine CSV-Datei importiert.<br>
        Einmal einspielen — Rangstelle wird automatisch angezeigt.</p>
        <label class="ku-csv-btn">
          &#8679; CSV importieren
          <input type="file" accept=".csv,.txt" style="display:none" id="csv-file-input">
        </label>
      </div>`;
    const inp = body.querySelector('#csv-file-input');
    if (inp) inp.addEventListener('change', handleCSVImport);
    return;
  }

  const { headers, rows } = csv;
  const rangIdx = headers.findIndex(h => /rang/i.test(h));
  const nameIdx = headers.findIndex(h => /name/i.test(h));
  const rIdx = rangIdx >= 0 ? rangIdx : 0;
  const nIdx = nameIdx >= 0 ? nameIdx : (rIdx === 0 ? 1 : 0);

  const sorted = [...rows].sort((a, b) => {
    const ra = parseInt(a[rIdx]) || 9999;
    const rb = parseInt(b[rIdx]) || 9999;
    return ra - rb;
  });

  const extraCols = headers.reduce((acc, h, i) => {
    if (i !== rIdx && i !== nIdx) acc.push({ header: h, idx: i });
    return acc;
  }, []);

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)">
      <span style="font-size:11px;color:var(--text-3);letter-spacing:0.03em">${rows.length} Kunden &middot; ${headers.join(' · ')}</span>
      <label class="ku-csv-btn" style="padding:5px 12px;font-size:11px">
        Neu importieren
        <input type="file" accept=".csv,.txt" style="display:none" id="csv-file-input">
      </label>
    </div>`;

  html += sorted.map(row => {
    const extras = extraCols
      .map(c => row[c.idx] ? `${esc(c.header)}: ${esc(String(row[c.idx]))}` : '')
      .filter(Boolean).join(' · ');
    return `<div class="ku-customer-row">
      <div class="ku-customer-rank">#${row[rIdx] || '?'}</div>
      <div class="ku-customer-main">
        <div class="ku-customer-name">${esc(String(row[nIdx] || '—'))}</div>
        ${extras ? `<div class="ku-customer-extras">${extras}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  body.innerHTML = html;
  const inp = body.querySelector('#csv-file-input');
  if (inp) inp.addEventListener('change', handleCSVImport);
}

function handleCSVImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    S.customers_csv = parseCSV(ev.target.result);
    saveState();
    renderKunden();
    // Ensure the CSV tile body stays open after import
    if (!kuOpen['eing']) toggleKuTile('eing');
  };
  reader.readAsText(file, 'UTF-8');
}

function parseCSV(text) {
  const firstLine = text.split('\n')[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = line => line.split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
  const headers = split(lines[0]);
  const rows    = lines.slice(1).map(split);
  return { headers, rows };
}

// ================================================
// TRAINING
// ================================================

let trDay = 'push';

function renderTraining() {
  const td = todayKey();
  ensure(S.training, td, { sets: {} });
  const tData = S.training[td];

  document.querySelectorAll('.tr-btn').forEach(b => b.classList.toggle('active', b.dataset.day === trDay));
  setTxt('tr-label', TRAINING[trDay].label);

  const container = el('ex-container');
  container.innerHTML = '';

  TRAINING[trDay].exercises.forEach((ex, ei) => {
    const key = `${trDay}_${ei}`;
    ensure(tData.sets, key, () => Array.from({ length: ex.sets }, () => ({ r: '', w: '' })));
    const exSets = tData.sets[key];

    const card = document.createElement('div');
    card.className = 'ex-card';

    let sHTML = '<div class="sets-grid">';
    for (let s = 0; s < ex.sets; s++) {
      const set = exSets[s] || { r: '', w: '' };
      sHTML += `
        <div class="set-col">
          <div class="set-lbl">Satz ${s + 1}</div>
          <div class="set-pair">
            <input class="s-in" type="number" placeholder="Wdh" value="${esc(set.r)}" data-ei="${ei}" data-si="${s}" data-t="r" min="0">
            <input class="s-in" type="number" placeholder="kg" value="${esc(set.w)}" data-ei="${ei}" data-si="${s}" data-t="w" min="0" step="0.5">
          </div>
        </div>`;
    }
    sHTML += '</div>';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:11px">
        <div class="ex-name">${ex.name}</div>
        <div class="ex-range">${ex.sets} × ${ex.range}</div>
      </div>${sHTML}`;

    card.querySelectorAll('.s-in').forEach(inp => {
      inp.addEventListener('change', () => {
        const k = `${trDay}_${inp.dataset.ei}`;
        const si = parseInt(inp.dataset.si);
        ensure(tData.sets, k, () => Array.from({ length: ex.sets }, () => ({ r: '', w: '' })));
        if (!tData.sets[k][si]) tData.sets[k][si] = { r: '', w: '' };
        tData.sets[k][si][inp.dataset.t] = inp.value;
        saveState();
      });
    });

    container.appendChild(card);
  });
}

// ================================================
// TV MODE
// ================================================

let tvTick = null;

function openTV() {
  el('tv-ov').classList.add('open');
  renderOverview();
  tickTV();
  tvTick = setInterval(tickTV, 1000);
  document.body.style.overflow = 'hidden';
}

function closeTV() {
  el('tv-ov').classList.remove('open');
  if (tvTick) { clearInterval(tvTick); tvTick = null; }
  document.body.style.overflow = '';
}

function tickTV() {
  const now = new Date();
  setTxt('tv-time',    now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
  setTxt('tv-datestr', now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
}

// ================================================
// AUTH
// ================================================

function showApp()   {
  el('loading-screen').style.display = 'none';
  el('login-screen').style.display   = 'none';
  el('app').style.display            = 'block';
}
function showLogin() {
  el('loading-screen').style.display = 'none';
  el('login-screen').style.display   = 'flex';
  el('app').style.display            = 'none';
}

async function doLogin() {
  const email = (el('login-email').value || '').trim();
  const pw    = el('login-password').value || '';
  const msg   = el('login-msg');
  msg.textContent = '';
  if (!email || !pw) { msg.textContent = 'E-Mail und Passwort eingeben.'; return; }
  el('login-btn').textContent = '…';
  el('login-btn').disabled    = true;
  const { error } = await db.auth.signInWithPassword({ email, password: pw });
  el('login-btn').textContent = 'Anmelden';
  el('login-btn').disabled    = false;
  if (error) msg.textContent = 'Falsche E-Mail oder Passwort.';
}

async function doLogout() {
  await db.auth.signOut();
}

// ================================================
// INIT
// ================================================

function setupUI() {
  // Build pipeline type select
  const sel = el('pf-type');
  if (sel) {
    PL_TYPES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      sel.appendChild(opt);
    });
  }

  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  // TV
  el('tv-open').addEventListener('click', openTV);
  el('tv-close').addEventListener('click', closeTV);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTV(); });

  // Month nav
  el('mn-prev').addEventListener('click', () => {
    const [y, m] = curMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    curMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderMonthly();
  });
  el('mn-next').addEventListener('click', () => {
    const [y, m] = curMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    curMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderMonthly();
  });

  // Training day buttons
  document.querySelectorAll('.tr-btn').forEach(b => {
    b.addEventListener('click', () => { trDay = b.dataset.day; renderTraining(); });
  });

  // Pipeline controls
  el('pl-add-btn').addEventListener('click', () => openForm(null));
  el('pf-save').addEventListener('click', saveEntry);
  el('pf-cancel').addEventListener('click', closeForm);

  // Filter buttons
  document.querySelectorAll('.pl-filter').forEach(b => {
    b.addEventListener('click', () => {
      plFilter = b.dataset.f;
      document.querySelectorAll('.pl-filter').forEach(x => x.classList.toggle('active', x.dataset.f === plFilter));
      renderPipelineList();
    });
  });

  // Enter key in form
  el('pf-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveEntry(); });

  // Login form
  el('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  el('login-btn').addEventListener('click', doLogin);
  el('logout-btn').addEventListener('click', doLogout);

  // Mobile bottom nav
  document.querySelectorAll('.mob-nav-btn[data-tab]').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  // Mobile "Mehr" sheet
  const sheet    = el('mob-sheet');
  const backdrop = el('mob-backdrop');

  function openSheet()  { sheet.classList.add('open'); backdrop.classList.add('open'); }
  function closeSheet() { sheet.classList.remove('open'); backdrop.classList.remove('open'); }

  el('mob-more-btn').addEventListener('click', openSheet);
  backdrop.addEventListener('click', closeSheet);

  document.querySelectorAll('.mob-sheet-item[data-tab]').forEach(b => {
    b.addEventListener('click', () => { switchTab(b.dataset.tab); closeSheet(); });
  });

  el('mob-logout-btn').addEventListener('click', () => { closeSheet(); doLogout(); });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupUI();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // onAuthStateChange handles INITIAL_SESSION (already logged in) + SIGNED_IN (new login) + SIGNED_OUT
  let authHandled = false;
  db.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && !currentUser) {
      authHandled = true;
      if (session) {
        currentUser = session.user;
        await loadState();
        showApp();
        switchTab('overview');
      } else {
        showLogin();
      }
    } else if (event === 'SIGNED_OUT') {
      authHandled = true;
      currentUser = null;
      showLogin();
    }
  });

  // Fallback: if auth never initializes (stale session, network hang), show login after 6s
  setTimeout(() => { if (!authHandled) showLogin(); }, 6000);
});
