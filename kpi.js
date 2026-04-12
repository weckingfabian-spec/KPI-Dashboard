'use strict';

// ─── CONFIG & CONSTANTS ────────────────────────────────────────────────────────
let GOOGLE_CLIENT_ID = localStorage.getItem('fw_kpi_gcid') || '665528452958-j1uktpu95nmtpc8vat5ctfokrrcqtu0h.apps.googleusercontent.com';
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

// ─── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SB_URL = 'https://sangtwduzxbbjskgfvrh.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhbmd0d2R1enhiYmpza2dmdnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMDU4MDYsImV4cCI6MjA5MTU4MTgwNn0.QzSbePGQIvBaM5kRQJIetGdpjsQWc0B51zerIJghqeI';
let _sbToken    = null;   // JWT access token
let currentUser = null;

// ─── SUPABASE FETCH HELPERS ────────────────────────────────────────────────────
function _sbHeaders(token) {
  return { 'apikey': SB_KEY, 'Authorization': `Bearer ${token||SB_KEY}`, 'Content-Type': 'application/json' };
}
async function sbSignIn(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method:'POST', headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email,password})
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error_description || d.msg || 'Login fehlgeschlagen');
  _sbToken = d.access_token;
  localStorage.setItem('fw_kpi_token', d.access_token);
  return d.user;
}
async function sbGetUser(token) {
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers:_sbHeaders(token) });
  if (!res.ok) return null;
  return await res.json();
}
async function sbSignOut(token) {
  await fetch(`${SB_URL}/auth/v1/logout`, { method:'POST', headers:_sbHeaders(token) }).catch(()=>{});
}
async function sbLoadData(userId) {
  const res = await fetch(`${SB_URL}/rest/v1/kpi_state?select=data&limit=1`, {
    headers:_sbHeaders(_sbToken)
  });
  if (!res.ok) { console.warn('sbLoadData HTTP', res.status); return null; }
  const rows = await res.json();
  console.log('sbLoadData rows:', rows?.length, rows?.[0]?.data ? 'has data' : 'no data');
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0].data;
}
async function sbSaveData(userId, payload) {
  await fetch(`${SB_URL}/rest/v1/kpi_state`, {
    method:'POST',
    headers:{ ..._sbHeaders(_sbToken), 'Prefer':'resolution=merge-duplicates' },
    body:JSON.stringify({user_id:userId, data:payload, updated_at:new Date().toISOString()})
  });
}

const KEYWORDS = {
  kai_s2:         [
    'kapitalanlageimmobili',   // trifft Singular (-e) UND Plural (-en)
    'kai s0','kai s1','kai s2','kai s3',
    'gespräch kapitalanlage'
  ],
  potenzialarbeit:['potenzialarbeit','potentialarbeit','kai potentiale','kai potenziale'],
  ov:             ['objektvorstellung'],
  notartermin:    ['notartermin']
};

const KPI_LABELS = {
  portal:'Kontakte im Portal', eingewertet:'Eingewertet',
  kai_s2:'KAI S2-Termine', potenzialarbeit:'Potenzialarbeit',
  ov:'OV-Gespräche', reservierungen:'Reservierungen', notartermine:'Notartermine'
};

const KPI_SOURCES = {
  portal:'csv', eingewertet:'csv',
  kai_s2:'cal', potenzialarbeit:'cal', ov:'cal',
  reservierungen:'manual', notartermine:'manual'
};

const KPI_ORDER = ['portal','eingewertet','kai_s2','potenzialarbeit','ov','reservierungen','notartermine'];

const GOALS_DEFAULT = { portal:20, eingewertet:5, kai_s2:10, potenzialarbeit:8, ov:4, reservierungen:2, notartermine:1 };

const MONTHS_DE    = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

// ─── STATE ─────────────────────────────────────────────────────────────────────
let S = {
  customers:        [],
  manual:           {},  // legacy fallback
  manualEntries:    { reservierungen: [], notartermine: [] },
  calendarEvents:   [],
  calendarLastSync: null,
  selectedCalendars:[],
  goals:            { ...GOALS_DEFAULT },
  eventComments:    {},  // { [eventId]: "text" }
  customerNotes:    {},  // { [_key]: "text" }
  bigGoal:          { label: 'Notartermine', target: 25, achieved: 0, forecast: 0 },
  projects:         [],
  customerMeta:     {}   // { [_key]: { projectId, status } }
};

let V = { mode:'M', key:'', tab:'kpi' };

let tokenClient = null;
let accessToken = null;
let gisReady    = false;

// ─── STORAGE ───────────────────────────────────────────────────────────────────
function _applyState(saved) {
  if (saved.customers)         S.customers         = saved.customers;
  if (saved.calendarEvents)    S.calendarEvents    = saved.calendarEvents;
  if (saved.calendarLastSync)  S.calendarLastSync  = saved.calendarLastSync;
  if (saved.selectedCalendars) S.selectedCalendars = saved.selectedCalendars;
  if (saved.goals)             S.goals             = { ...GOALS_DEFAULT, ...saved.goals };
  if (saved.eventComments)     S.eventComments     = saved.eventComments;
  if (saved.customerNotes)     S.customerNotes     = saved.customerNotes;
  if (saved.bigGoal)           S.bigGoal           = { ...S.bigGoal, ...saved.bigGoal };
  if (saved.manualEntries)     S.manualEntries     = saved.manualEntries;
  else if (saved.manual) {
    S.manual = saved.manual;
    for (const [mk, vals] of Object.entries(saved.manual)) {
      for (let i = 0; i < (vals.reservierungen || 0); i++)
        S.manualEntries.reservierungen.push({ id: uid(), monthKey: mk, customerId: null, customerName: '(manuell)', date: mk + '-01', note: '' });
      for (let i = 0; i < (vals.notartermine || 0); i++)
        S.manualEntries.notartermine.push({ id: uid(), monthKey: mk, customerId: null, customerName: '(manuell)', date: mk + '-01', note: '' });
    }
  }
  if (saved.projects) S.projects = saved.projects;
  if (saved.customerMeta) S.customerMeta = saved.customerMeta;
  S.manualEntries.reservierungen = S.manualEntries.reservierungen.map(e =>
    e.projectId === undefined ? { ...e, projectId: null } : e
  );
}

async function loadState() {
  // 1. localStorage sofort (instant paint)
  try { const raw = localStorage.getItem('fw_kpi_v1'); if (raw) _applyState(JSON.parse(raw)); } catch(e) {}

  // 2. Supabase (autoritativ)
  if (!_sbToken || !currentUser) return;
  try {
    const remoteData = await sbLoadData(currentUser.id);
    if (remoteData) {
      _applyState(remoteData);
      try { localStorage.setItem('fw_kpi_v1', JSON.stringify(remoteData)); } catch(_) {}
      render();
    }
  } catch(e) { console.warn('loadState Supabase', e); }
}

let _saveTimer = null;
function saveState() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const payload = {
      customers: S.customers, calendarEvents: S.calendarEvents,
      calendarLastSync: S.calendarLastSync, selectedCalendars: S.selectedCalendars,
      goals: S.goals, eventComments: S.eventComments, customerNotes: S.customerNotes,
      bigGoal: S.bigGoal, manualEntries: S.manualEntries, projects: S.projects,
      customerMeta: S.customerMeta
    };
    try { localStorage.setItem('fw_kpi_v1', JSON.stringify(payload)); } catch(e) {}
    if (_sbToken && currentUser) {
      try { await sbSaveData(currentUser.id, payload); } catch(e) { console.warn('saveState', e); }
    }
  }, 400);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── AUTH ──────────────────────────────────────────────────────────────────────
async function checkSession() {
  try {
    const token = localStorage.getItem('fw_kpi_token');
    if (!token) return null;
    const user = await sbGetUser(token);
    if (!user || user.error) { localStorage.removeItem('fw_kpi_token'); return null; }
    _sbToken = token;
    currentUser = user;
    return user;
  } catch(e) { return null; }
}

async function handleSignIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-submit-btn');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Bitte E-Mail und Passwort eingeben.'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Anmelden…';
  try {
    currentUser = await sbSignIn(email, password);
    hideAuthModal();
    await loadState(); render(); initGoogleAuth();
    document.getElementById('signout-btn').classList.remove('hidden');
    showToast('Angemeldet ✓', 'success');
  } catch(e) {
    errEl.textContent = e.message.includes('Invalid') ? 'E-Mail oder Passwort falsch.' : (e.message || 'Anmeldung fehlgeschlagen.');
    errEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Anmelden';
  }
}

async function handleSignOut() {
  if (!confirm('Abmelden?')) return;
  await sbSignOut(_sbToken).catch(()=>{});
  _sbToken = null; currentUser = null;
  localStorage.removeItem('fw_kpi_token');
  location.reload();
}

function showAuthModal() {
  document.getElementById('auth-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('auth-email').focus(), 50);
}
function hideAuthModal() { document.getElementById('auth-modal').classList.add('hidden'); }

// ─── PERIOD HELPERS ────────────────────────────────────────────────────────────
function getCurrentPeriodKey(mode) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1;
  if (mode === 'M') return `${y}-${String(m).padStart(2,'0')}`;
  if (mode === 'Q') return `${y}-Q${Math.ceil(m/3)}`;
  if (mode === 'H') return `${y}-H${m <= 6 ? 1 : 2}`;
  return String(y);
}

function getPeriodKeyFromDate(date, mode) {
  const y = date.getFullYear(), m = date.getMonth() + 1;
  if (mode === 'M') return `${y}-${String(m).padStart(2,'0')}`;
  if (mode === 'Q') return `${y}-Q${Math.ceil(m/3)}`;
  if (mode === 'H') return `${y}-H${m <= 6 ? 1 : 2}`;
  return String(y);
}

function getPeriodRange(key, mode) {
  if (mode === 'M') { const [y,m] = key.split('-').map(Number); return { start: new Date(y,m-1,1), end: new Date(y,m,0,23,59,59) }; }
  if (mode === 'Q') { const [ys,qs]=key.split('-Q'); const y=+ys,q=+qs,sm=(q-1)*3; return {start:new Date(y,sm,1),end:new Date(y,sm+3,0,23,59,59)}; }
  if (mode === 'H') { const [ys,hs]=key.split('-H'); const y=+ys,h=+hs,sm=(h-1)*6; return {start:new Date(y,sm,1),end:new Date(y,sm+6,0,23,59,59)}; }
  const y = +key; return { start: new Date(y,0,1), end: new Date(y,11,31,23,59,59) };
}

function navigatePeriod(key, mode, dir) {
  if (mode === 'M') { const [y,m]=key.split('-').map(Number); const d=new Date(y,m-1+dir,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
  if (mode === 'Q') { let [y,q]=key.split('-Q').map(Number); q+=dir; if(q>4){q-=4;y++;}if(q<1){q+=4;y--;} return `${y}-Q${q}`; }
  if (mode === 'H') { let [y,h]=key.split('-H').map(Number); h+=dir; if(h>2){h=1;y++;}if(h<1){h=2;y--;} return `${y}-H${h}`; }
  return String(+key+dir);
}

function getPeriodLabel(key, mode) {
  if (mode === 'M') { const [y,m]=key.split('-').map(Number); return `${MONTHS_DE[m-1]} ${y}`; }
  if (mode === 'Q') { const [y,q]=key.split('-Q'); return `Q${q} ${y}`; }
  if (mode === 'H') { const [y,h]=key.split('-H'); return `H${h} ${y}`; }
  return key;
}

function getPeriodShortLabel(key, mode) {
  if (mode === 'M') { const [y,m]=key.split('-').map(Number); return `${MONTHS_SHORT[m-1]} '${String(y).slice(2)}`; }
  if (mode === 'Q') { const [y,q]=key.split('-Q'); return `Q${q}/${String(y).slice(2)}`; }
  if (mode === 'H') { const [y,h]=key.split('-H'); return `H${h}/${String(y).slice(2)}`; }
  return key;
}

function getHistoryPeriods(mode, currentKey, n) {
  const p=[]; let k=currentKey;
  for(let i=0;i<n;i++){p.unshift(k);k=navigatePeriod(k,mode,-1);}
  return p;
}

function dateInRange(date, range) { return date >= range.start && date <= range.end; }

function getMonthKeysInRange(range) {
  const keys=[], c=new Date(range.start.getFullYear(),range.start.getMonth(),1), e=new Date(range.end.getFullYear(),range.end.getMonth(),1);
  while(c<=e){keys.push(`${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,'0')}`);c.setMonth(c.getMonth()+1);}
  return keys;
}

// ─── DATE UTILITIES ────────────────────────────────────────────────────────────
function parseDateDE(str) {
  if(!str||!str.trim()) return null;
  const p=str.trim().split('.'); if(p.length!==3) return null;
  const d=new Date(+p[2],+p[1]-1,+p[0]); return isNaN(d.getTime())?null:d;
}
function formatDateDE(d) { if(!d) return '—'; return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; }
function todayISO() { return new Date().toISOString().substring(0,10); }

function parseEinwertungDates(numStr) {
  if(!numStr||!numStr.trim()) return [];
  const dates=[];
  for(const part of numStr.split(',')) {
    const n=part.trim(); if(n.length<6) continue;
    const yy=parseInt(n.substring(0,2),10), mm=parseInt(n.substring(2,4),10), dd=parseInt(n.substring(4,6),10);
    if(mm>=1&&mm<=12&&dd>=1&&dd<=31){const d=new Date(2000+yy,mm-1,dd);if(!isNaN(d.getTime()))dates.push(d);}
  }
  return dates;
}

// ─── CSV PARSING ───────────────────────────────────────────────────────────────
let CSV_HEADER_MAP = {};
function parseCSVLine(line){return line.split(';');}
function initCSVHeader(cols){CSV_HEADER_MAP={};cols.forEach((h,i)=>{CSV_HEADER_MAP[h.trim()]=i;});}
function getCol(row,name){const idx=CSV_HEADER_MAP[name];return(idx!==undefined&&row[idx]!==undefined)?row[idx].trim():'';}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l=>l.trim());
  if(lines.length<2) return [];
  initCSVHeader(parseCSVLine(lines[0]));
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const cols=parseCSVLine(lines[i]); if(cols.length<10) continue;
    const firstName=getCol(cols,'Vorname'), lastName=getCol(cols,'Nachname');
    const email=getCol(cols,'Email'), kundenNr=getCol(cols,'Kundennummer').replace(/\s/g,'');
    const erstelltStr=getCol(cols,'Erstellt');
    const einwertNrRaw=getCol(cols,'Einwertungsnummern'), rangstelle=getCol(cols,'Beste Rangstelle');
    const erstellt=parseDateDE(erstelltStr), einwertDates=parseEinwertungDates(einwertNrRaw);
    const _key=kundenNr||email||`${firstName}_${lastName}_${erstelltStr}`;
    rows.push({_key,kundenNr,firstName,lastName,email,erstellt,erstelltStr,einwertNrRaw,einwertDates,rangstelle});
  }
  return rows;
}

function mergeCustomers(newRows) {
  const existing=new Set(S.customers.map(c=>c._key)); let added=0;
  for(const row of newRows){if(!existing.has(row._key)){S.customers.push(row);existing.add(row._key);added++;}}
  return added;
}

// ─── GOOGLE AUTH ───────────────────────────────────────────────────────────────
function initGoogleAuth() {
  if(!GOOGLE_CLIENT_ID){document.getElementById('setup-banner').classList.remove('hidden');updateGoogleUI(false);return;}
  const chk=setInterval(()=>{
    if(window.google&&window.google.accounts&&window.google.accounts.oauth2){
      clearInterval(chk); gisReady=true;
      tokenClient=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:CAL_SCOPE,callback:handleTokenResponse});
      updateGoogleUI(false);
      // Silent Re-Auth versuchen wenn E-Mail-Hint vorhanden
      const hint=localStorage.getItem('fw_kpi_googlehint');
      if(hint) tokenClient.requestAccessToken({prompt:'',hint});
    }
  },200);
  setTimeout(()=>clearInterval(chk),10000);
}

function handleTokenResponse(r) {
  if(r&&r.access_token){
    accessToken=r.access_token;
    updateGoogleUI(true);
    showToast('Google Kalender verbunden ✓','success');
    // E-Mail-Hint für Silent Re-Auth beim nächsten Seitenaufruf speichern
    fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${r.access_token}`)
      .then(res=>res.json())
      .then(info=>{if(info.email) localStorage.setItem('fw_kpi_googlehint',info.email);})
      .catch(()=>{});
  } else {
    accessToken=null;
    updateGoogleUI(false);
    // Nur bei echtem Fehler toasten – silent-auth Codes unterdrücken
    if(r&&r.error&&r.error==='access_denied') showToast('Google-Zugriff verweigert.','error');
  }
}

function connectGoogle() {
  if(!GOOGLE_CLIENT_ID){showSettingsModal();return;}
  if(!gisReady){showToast('Google-Bibliothek lädt noch…','warning');return;}
  tokenClient.requestAccessToken({prompt:'consent'});
}

function updateGoogleUI(connected) {
  const syncBtn=document.getElementById('sync-btn'), cb=document.getElementById('connect-btn'), st=document.getElementById('sync-status');
  if(connected){syncBtn.classList.remove('hidden');cb.classList.add('hidden');if(S.calendarLastSync)st.textContent=`Sync: ${formatDateDE(new Date(S.calendarLastSync))}`;}
  else{syncBtn.classList.add('hidden');cb.classList.remove('hidden');if(!GOOGLE_CLIENT_ID)cb.textContent='⚙️ Einrichten';}
}

// ─── CALENDAR LIST ─────────────────────────────────────────────────────────────
async function loadCalendarList() {
  if(!accessToken){showToast('Bitte zuerst Google verbinden.','warning');return;}
  const wrap=document.getElementById('cal-list-wrap');
  wrap.innerHTML='<span style="font-size:.82rem;color:var(--gray-4)">Lade Kalender…</span>';
  try {
    const res=await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList',{headers:{Authorization:`Bearer ${accessToken}`}});
    if(!res.ok) throw new Error('CalendarList API Fehler: '+res.status);
    const data=await res.json();
    const cals=data.items||[];
    S.selectedCalendars=S.selectedCalendars.length?S.selectedCalendars:cals.map(c=>c.id);
    wrap.innerHTML=cals.map(c=>{
      const checked=S.selectedCalendars.includes(c.id)?'checked':'';
      const color=c.backgroundColor||'#1d7fc4';
      return `<label class="cal-checkbox-row">
        <input type="checkbox" value="${escapeHtml(c.id)}" ${checked} onchange="toggleCalendar(this)">
        <span class="cal-dot" style="background:${color}"></span>
        <span>${escapeHtml(c.summary)}</span>
      </label>`;
    }).join('');
  } catch(e){wrap.innerHTML=`<span style="color:var(--red);font-size:.82rem">${e.message}</span>`;}
}

function toggleCalendar(cb) {
  if(cb.checked){if(!S.selectedCalendars.includes(cb.value))S.selectedCalendars.push(cb.value);}
  else{S.selectedCalendars=S.selectedCalendars.filter(id=>id!==cb.value);}
  saveState();
}

// ─── CALENDAR SYNC ─────────────────────────────────────────────────────────────

// Extrahiert "Name: Max Mustermann" aus Buchungssystem-Beschreibungen
function extractClientName(description) {
  if(!description) return '';
  const m=description.match(/^Name:\s*(.+)$/m);
  return m?m[1].trim():'';
}

function matchEventType(summary, description) {
  const s=(summary||'').toLowerCase();
  const d=(description||'').toLowerCase();
  const combined=s+' '+d;
  if(KEYWORDS.kai_s2.some(kw=>combined.includes(kw))) return 'kai_s2';
  if(KEYWORDS.potenzialarbeit.some(kw=>combined.includes(kw))) return 'potenzialarbeit';
  if(combined.includes('objektvorstellung')||/\bov\b/.test(s)) return 'ov';
  if(combined.includes('notartermin')||/\bnt\b/.test(s)) return 'notartermin';
  return null;
}

async function fetchCalendarEvents(calendarId, timeMin, timeMax) {
  let events=[], pageToken;
  do {
    const params=new URLSearchParams({timeMin,timeMax,singleEvents:'true',maxResults:'250',orderBy:'startTime'});
    if(pageToken) params.set('pageToken',pageToken);
    const res=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,{headers:{Authorization:`Bearer ${accessToken}`}});
    if(res.status===401){accessToken=null;updateGoogleUI(false);throw new Error('Token abgelaufen. Bitte erneut verbinden.');}
    if(!res.ok) throw new Error(`Calendar API ${res.status}`);
    const data=await res.json();
    events=events.concat(data.items||[]);
    pageToken=data.nextPageToken;
  } while(pageToken);
  return events;
}

async function startSync() {
  const fromVal=document.getElementById('sync-from').value, toVal=document.getElementById('sync-to').value;
  if(!fromVal||!toVal){showToast('Bitte Von- und Bis-Datum angeben.','warning');return;}
  if(!accessToken){showToast('Bitte zuerst Google verbinden.','warning');return;}

  const calIds=S.selectedCalendars.length?S.selectedCalendars:['primary'];
  const btn=document.getElementById('start-sync-btn'), resultEl=document.getElementById('sync-result'), statusEl=document.getElementById('sync-status');
  btn.disabled=true; btn.textContent='Lädt…';
  resultEl.innerHTML='<span class="spinner"></span> Synchronisiert…';
  statusEl.className='sync-status loading'; statusEl.innerHTML='<span class="spinner"></span>';

  try {
    const timeMin=new Date(fromVal).toISOString(), timeMax=new Date(toVal+'T23:59:59').toISOString();
    let allRaw=[], processed=[];

    for(const calId of calIds){
      try{const raw=await fetchCalendarEvents(calId,timeMin,timeMax);allRaw=allRaw.concat(raw);}
      catch(err){console.warn('Cal skip',calId,err);}
    }

    processed=allRaw.map(e=>{
      const desc=e.description||'';
      const clientName=extractClientName(desc);
      const type=matchEventType(e.summary,desc);
      return {
        id:    e.id,
        date:  (e.start.date||(e.start.dateTime||'').substring(0,10)),
        summary: e.summary||'',
        clientName: clientName,          // "Name: X" aus Buchungssystem-Notizen
        description: desc.substring(0,600), // Volltext für Kommentarspalte
        type
      };
    }).filter(e=>e.type!==null&&e.date);

    // Replace events in synced range
    S.calendarEvents=S.calendarEvents.filter(e=>e.date<fromVal||e.date>toVal);
    S.calendarEvents=S.calendarEvents.concat(processed);
    S.calendarLastSync=new Date().toISOString();
    saveState();

    const counts=processed.reduce((a,e)=>{a[e.type]=(a[e.type]||0)+1;return a;},{});
    const summary=`KAI S2: ${counts.kai_s2||0} · Potenzialarbeit: ${counts.potenzialarbeit||0} · OV: ${counts.ov||0} · Notar: ${counts.notartermin||0}`;
    resultEl.innerHTML=`<strong style="color:var(--green)">✓ ${processed.length} KPI-Termine gefunden</strong> (${allRaw.length} total aus ${calIds.length} Kalender)<br><span style="color:var(--gray-4)">${summary}</span>`;
    statusEl.className='sync-status success'; statusEl.textContent=`Sync: ${formatDateDE(new Date())}`;
    // Modal bleibt offen – User sieht das Ergebnis
    render();
    showToast(`Kalender synchronisiert: ${processed.length} Termine`,'success');
  } catch(err) {
    resultEl.innerHTML=`<span style="color:var(--red)">⚠️ ${err.message}</span>`;
    statusEl.className='sync-status error'; statusEl.textContent='Fehler';
    showToast(err.message,'error');
  } finally {
    btn.disabled=false; btn.textContent='Synchronisieren';
  }
}

function showSyncModal() {
  document.getElementById('sync-to').value=todayISO();
  document.getElementById('sync-result').innerHTML='';
  document.getElementById('sync-modal').classList.remove('hidden');
}

// ─── KPI CALCULATION ───────────────────────────────────────────────────────────
function getKPIsForPeriod(key, mode) {
  const range=getPeriodRange(key,mode);
  const portal=S.customers.filter(c=>c.erstellt&&dateInRange(c.erstellt,range)).length;
  const eingewertet=S.customers.filter(c=>c.einwertDates&&c.einwertDates.length>0&&c.einwertDates.some(d=>dateInRange(d,range))).length;
  const fromStr=range.start.toISOString().substring(0,10), toStr=range.end.toISOString().substring(0,10);
  const calInRange=S.calendarEvents.filter(e=>e.date>=fromStr&&e.date<=toStr);
  const kai_s2=calInRange.filter(e=>e.type==='kai_s2').length;
  const potenzialarbeit=calInRange.filter(e=>e.type==='potenzialarbeit').length;
  const ov=calInRange.filter(e=>e.type==='ov').length;
  // Manual entries: count by monthKey
  const monthKeys=mode==='M'?[key]:getMonthKeysInRange(range);
  const reservierungen=S.manualEntries.reservierungen.filter(e=>monthKeys.includes(e.monthKey)).length;
  const notartermine=S.manualEntries.notartermine.filter(e=>monthKeys.includes(e.monthKey)).length;
  return {portal,eingewertet,kai_s2,potenzialarbeit,ov,reservierungen,notartermine};
}

// ─── SPARKLINE ─────────────────────────────────────────────────────────────────
function getSparklineData(type,n){return getHistoryPeriods(V.mode,V.key,n).map(k=>getKPIsForPeriod(k,V.mode)[type]||0);}
function renderSparklineSVG(data){
  if(!data||data.length<2) return '';
  const max=Math.max(...data,1), W=60,H=24,P=3;
  const pts=data.map((v,i)=>`${(P+(i/(data.length-1))*(W-P*2)).toFixed(1)},${(H-P-((v/max)*(H-P*2))).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="sparkline" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// ─── INSIGHTS ──────────────────────────────────────────────────────────────────
function generateInsights(kpis, prevKpis) {
  const ins=[], prevLabel=getPeriodLabel(navigatePeriod(V.key,V.mode,-1),V.mode);
  for(const type of KPI_ORDER){
    const curr=kpis[type]||0, prev=prevKpis[type]||0;
    if(prev===0&&curr===0) continue;
    if(prev>0){
      const pct=Math.round(((curr-prev)/prev)*100);
      if(Math.abs(pct)>=10||Math.abs(curr-prev)>=2)
        ins.push({cls:pct>=0?'positive':'negative',msg:`${KPI_LABELS[type]}: ${pct>=0?'▲':'▼'} ${Math.abs(pct)}% ggü. ${prevLabel} (${prev} → ${curr})`});
    }
  }
  for(const type of ['kai_s2','ov','reservierungen','notartermine','portal','eingewertet']){
    const goal=S.goals[type]||0, curr=kpis[type]||0;
    if(goal>0&&curr<goal*0.5) ins.push({cls:'warning',msg:`⚠️ ${KPI_LABELS[type]}: ${curr}/${goal} (${Math.round((curr/goal)*100)}% des Ziels)`});
  }
  if(kpis.kai_s2>0&&kpis.ov===0) ins.push({cls:'warning',msg:`⚠️ Engpass: Keine OV-Gespräche trotz ${kpis.kai_s2} KAI S2-Terminen`});
  else if(kpis.kai_s2>0&&kpis.ov<kpis.kai_s2*0.3) ins.push({cls:'warning',msg:`⚠️ Niedrige Konversion KAI S2 → OV: ${Math.round(kpis.ov/kpis.kai_s2*100)}%`});
  if(kpis.ov>0&&kpis.reservierungen===0) ins.push({cls:'info',msg:`ℹ️ ${kpis.ov} OV-Gespräch${kpis.ov>1?'e':''} ohne Reservierung`});
  if(kpis.reservierungen>0&&kpis.notartermine===0) ins.push({cls:'info',msg:`ℹ️ ${kpis.reservierungen} Reservierung${kpis.reservierungen>1?'en':''} ohne Notartermin`});
  return ins;
}

// ─── BIG GOAL BANNER ───────────────────────────────────────────────────────────
function renderBigGoalBanner() {
  const {label,target,achieved,forecast}=S.bigGoal;
  const t=Math.max(target,1);
  const achPct=Math.min(100,Math.round((achieved/t)*100));
  const forPct=Math.min(100-achPct,Math.round((forecast/t)*100));
  const open=Math.max(0,target-achieved-forecast);
  const total=achieved+forecast;
  const totalPct=Math.round((total/t)*100);
  const now=new Date();
  const yearPct=Math.round(((now-new Date(now.getFullYear(),0,1))/(new Date(now.getFullYear()+1,0,1)-new Date(now.getFullYear(),0,1)))*100);
  const diff=achPct-yearPct;
  const trendLabel=diff>=0?`<span style="color:var(--green)">▲ +${diff}% Vorsprung</span>`:`<span style="color:var(--red)">▼ ${diff}% Rückstand</span>`;

  document.getElementById('bg-label-display').textContent=label||(target?`Ziel: ${target}`:'Jahres-Ziel einrichten');
  document.getElementById('bg-pct-display').innerHTML=target?`<strong>${achieved} von ${target}</strong>`:'' ;
  document.getElementById('bg-achieved-bar').style.width=achPct+'%';
  document.getElementById('bg-forecast-bar').style.width=forPct+'%';
  document.getElementById('bg-legend').innerHTML=`
    <span class="legend-chip chip-achieved">■ ${achieved} stattgefunden (${achPct}%)</span>
    <span class="legend-chip chip-forecast">▦ ${forecast} Forecast</span>
    <span class="legend-chip chip-open">□ ${open} offen</span>
    <span class="legend-chip chip-target">Ziel: ${target}</span>
    <span class="legend-chip chip-year-pct">⏱ ${yearPct}% Jahr vergangen</span>
    ${target?trendLabel:''}`;
}

function showBigGoalModal() {
  const bg=S.bigGoal;
  document.getElementById('bg-label-input').value=bg.label||'';
  document.getElementById('bg-target-input').value=bg.target||25;
  document.getElementById('bg-achieved-input').value=bg.achieved||0;
  document.getElementById('bg-forecast-input').value=bg.forecast||0;
  document.getElementById('big-goal-modal').classList.remove('hidden');
}

function saveBigGoal() {
  S.bigGoal={
    label:   document.getElementById('bg-label-input').value.trim()||'Notartermine',
    target:  parseInt(document.getElementById('bg-target-input').value,10)||25,
    achieved:parseInt(document.getElementById('bg-achieved-input').value,10)||0,
    forecast:parseInt(document.getElementById('bg-forecast-input').value,10)||0
  };
  saveState(); closeModal('big-goal-modal'); renderBigGoalBanner();
}

// ─── RENDER ────────────────────────────────────────────────────────────────────
function render() {
  document.getElementById('period-label').textContent=getPeriodLabel(V.key,V.mode);
  renderBigGoalBanner();
  if(V.tab==='kpi') renderKPITab();
  else if(V.tab==='kunden') renderKundenTab();
  else if(V.tab==='projekte') renderProjects();
}

function renderKPITab() {
  const kpis=getKPIsForPeriod(V.key,V.mode), prevKpis=getKPIsForPeriod(navigatePeriod(V.key,V.mode,-1),V.mode);
  renderKPICards(kpis,prevKpis); renderFunnel(kpis); renderInsightsSection(kpis,prevKpis); renderStatsTable();
}

// ─── KPI CARDS ─────────────────────────────────────────────────────────────────
function renderKPICards(kpis, prevKpis) {
  const container=document.getElementById('kpi-cards');
  container.innerHTML=KPI_ORDER.map(type=>{
    const val=kpis[type]||0, prev=prevKpis[type]||0, goal=S.goals[type]||0, source=KPI_SOURCES[type];
    let trendHtml='';
    if(prev>0){const pct=Math.round(((val-prev)/prev)*100);trendHtml=`<span class="trend ${pct>=0?'up':'down'}">${pct>=0?'▲':'▼'} ${Math.abs(pct)}%</span>`;}
    else if(prev===0&&val>0) trendHtml=`<span class="trend up">▲ Neu</span>`;
    let cardCls='';
    if(goal>0){const p=val/goal;if(p>=1)cardCls='good';else if(p>=0.5)cardCls='ok';else if(val>0)cardCls='low';}
    let sourceBadge='';
    if(source==='cal') sourceBadge=`<span class="badge badge-cal">📅 Kalender</span>`;
    else if(source==='csv') sourceBadge=`<span class="badge badge-csv">📊 CSV</span>`;
    else sourceBadge=`<span class="badge badge-manual">✏️ Manuell</span>`;
    const sparkHtml=renderSparklineSVG(getSparklineData(type,6));
    // Goal inline edit
    const goalHtml=goal>0?`<span class="goal goal-editable" onclick="editGoalInline(event,'${type}')" title="Ziel bearbeiten">Ziel: ${goal}</span>`:'<span class="goal goal-editable" onclick="editGoalInline(event,\''+type+'\')" title="Ziel setzen">Ziel setzen</span>';
    return `<div class="kpi-card ${cardCls}" onclick="showDetailModal('${type}')" style="cursor:pointer">
      <div class="kpi-card-header"><span class="kpi-label">${KPI_LABELS[type]}</span>${sourceBadge}</div>
      <div class="kpi-value">${val}</div>
      <div class="kpi-meta">${trendHtml}${goalHtml}</div>
      ${sparkHtml}
    </div>`;
  }).join('');
}

function editGoalInline(e, type) {
  e.stopPropagation();
  const span=e.target;
  const current=S.goals[type]||0;
  const input=document.createElement('input');
  input.type='number'; input.min='0'; input.value=current;
  input.className='goal-inline-input';
  input.onclick=ev=>ev.stopPropagation();
  const save=()=>{
    const v=parseInt(input.value,10)||0;
    S.goals[type]=v; saveState();
    span.textContent=`Ziel: ${v}`; input.replaceWith(span);
    render();
  };
  input.onblur=save;
  input.onkeydown=ev=>{if(ev.key==='Enter')save();if(ev.key==='Escape')input.replaceWith(span);};
  span.replaceWith(input); input.focus(); input.select();
}

// ─── DETAIL MODAL ──────────────────────────────────────────────────────────────
function showDetailModal(type) {
  document.getElementById('detail-modal-title').textContent=KPI_LABELS[type]+' – '+getPeriodLabel(V.key,V.mode);
  document.getElementById('detail-modal-body').innerHTML=buildDetailContent(type);
  document.getElementById('detail-modal').classList.remove('hidden');
  // Init autocomplete for manual types
  if(type==='reservierungen'||type==='notartermine') initCustomerSearch(type);
}

function buildDetailContent(type) {
  const range=getPeriodRange(V.key,V.mode);
  const fromStr=range.start.toISOString().substring(0,10), toStr=range.end.toISOString().substring(0,10);

  // ── Portal ──
  if(type==='portal'){
    const list=S.customers.filter(c=>c.erstellt&&dateInRange(c.erstellt,range)).sort((a,b)=>b.erstellt-a.erstellt);
    if(!list.length) return '<p class="no-data">Keine Kontakte in diesem Zeitraum.</p>';
    return `<div class="table-scroll"><table class="detail-table">
      <thead><tr><th>#</th><th>Name</th><th>Anmeldedatum</th><th>Notiz</th></tr></thead>
      <tbody>${list.map((c,i)=>`<tr>
        <td style="color:var(--gray-4)">${i+1}</td>
        <td>${escapeHtml(c.firstName+' '+c.lastName)}</td>
        <td>${formatDateDE(c.erstellt)}</td>
        <td><input class="comment-input" placeholder="Notiz…" value="${escapeHtml(S.customerNotes[c._key]||'')}" onblur="saveCustomerNote('${c._key}',this.value)" onclick="event.stopPropagation()"></td>
      </tr>`).join('')}</tbody>
    </table></div><p style="margin-top:8px;font-size:.75rem;color:var(--gray-4)">${list.length} Kontakte</p>`;
  }

  // ── Eingewertet ──
  if(type==='eingewertet'){
    const list=S.customers.filter(c=>c.einwertDates&&c.einwertDates.length>0&&c.einwertDates.some(d=>dateInRange(d,range)));
    list.sort((a,b)=>{const ad=a.einwertDates.find(d=>dateInRange(d,range)),bd=b.einwertDates.find(d=>dateInRange(d,range));return (bd||0)-(ad||0);});
    if(!list.length) return '<p class="no-data">Keine Einwertungen in diesem Zeitraum.</p>';
    return `<div class="table-scroll"><table class="detail-table">
      <thead><tr><th>#</th><th>Name</th><th>Datum</th><th>Nummer</th><th>Notiz</th></tr></thead>
      <tbody>${list.map((c,i)=>{
        const d=c.einwertDates.find(d=>dateInRange(d,range))||c.einwertDates[0];
        return `<tr>
          <td style="color:var(--gray-4)">${i+1}</td>
          <td>${escapeHtml(c.firstName+' '+c.lastName)}</td>
          <td>${formatDateDE(d)}</td>
          <td class="mono" style="font-size:.75rem">${escapeHtml(c.einwertNrRaw)}</td>
          <td><input class="comment-input" placeholder="Notiz…" value="${escapeHtml(S.customerNotes[c._key]||'')}" onblur="saveCustomerNote('${c._key}',this.value)" onclick="event.stopPropagation()"></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div><p style="margin-top:8px;font-size:.75rem;color:var(--gray-4)">${list.length} Kunden</p>`;
  }

  // ── Calendar Types ──
  if(['kai_s2','potenzialarbeit','ov'].includes(type)){
    const events=S.calendarEvents.filter(e=>e.type===type&&e.date>=fromStr&&e.date<=toStr).sort((a,b)=>a.date.localeCompare(b.date));
    if(!events.length) return `<p class="no-data">Keine ${KPI_LABELS[type]} in diesem Zeitraum.<br><small style="color:var(--gray-4)">Kalender synchronisieren um Termine zu laden.</small></p>`;
    return `<div class="table-scroll"><table class="detail-table">
      <thead><tr><th>Datum</th><th>Kunde / Termin</th><th>Kommentar</th><th style="width:40px"></th></tr></thead>
      <tbody>${events.map(e=>{
        const nameHtml=e.clientName
          ?`<strong>${escapeHtml(e.clientName)}</strong><br><span style="font-size:.72rem;color:var(--gray-4)">${escapeHtml(e.summary)}</span>`
          :escapeHtml(e.summary);
        return `<tr>
          <td style="white-space:nowrap">${e.date.split('-').reverse().join('.')}</td>
          <td>${nameHtml}</td>
          <td><input class="comment-input" placeholder="Kommentar…" value="${escapeHtml(S.eventComments[e.id]||'')}" onblur="saveEventComment('${e.id}',this.value)" onclick="event.stopPropagation()"></td>
          <td><button class="btn-delete" title="Termin entfernen" onclick="event.stopPropagation();deleteCalendarEvent('${e.id}','${type}')">🗑️</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div><p style="margin-top:8px;font-size:.75rem;color:var(--gray-4)">${events.length} Termine</p>`;
  }

  // ── Reservierungen / Notartermine ──
  if(type==='reservierungen'||type==='notartermine'){
    const monthKeys=V.mode==='M'?[V.key]:getMonthKeysInRange(range);
    const entries=S.manualEntries[type].filter(e=>monthKeys.includes(e.monthKey)).sort((a,b)=>a.date.localeCompare(b.date));
    const isRes=type==='reservierungen';
    const projectSelectHtml=(e)=>isRes
      ?`<td>
          <select class="comment-input project-select" style="min-width:110px"
                  onchange="saveEntryProject('${e.id}',this.value)"
                  onclick="event.stopPropagation()">
            <option value="">–</option>
            ${S.projects.map(p=>`<option value="${p.id}"${e.projectId===p.id?' selected':''}>${escapeHtml(p.name)}${p.hashtag?' #'+escapeHtml(p.hashtag):''}</option>`).join('')}
          </select>
          ${e.projectId?(()=>{const p=S.projects.find(x=>x.id===e.projectId);return p&&p.hashtag?`<span class="project-hashtag" style="margin-left:4px;display:inline-block">#${escapeHtml(p.hashtag)}</span>`:''})():''}
        </td>`
      :'';
    const tableRows=entries.map((e,i)=>`<tr data-entry-id="${e.id}" data-type="${type}">
      <td style="color:var(--gray-4)">${i+1}</td>
      <td><strong>${escapeHtml(e.customerName)}</strong></td>
      <td><input type="date" class="comment-input" value="${e.date}" onblur="updateEntryDate('${type}','${e.id}',this.value)" onclick="event.stopPropagation()"></td>
      <td><input class="comment-input" placeholder="Notiz…" value="${escapeHtml(e.note||'')}" onblur="updateEntryNote('${type}','${e.id}',this.value)" onclick="event.stopPropagation()"></td>
      ${projectSelectHtml(e)}
      ${isRes?`<td><button class="btn-promote" title="Zu Notarterminen verschieben" onclick="event.stopPropagation();promoteEntry('${e.id}')">🚀</button></td>`:''}
      <td><button class="btn-delete" title="Löschen" onclick="event.stopPropagation();deleteEntry('${type}','${e.id}')">🗑️</button></td>
    </tr>`).join('');

    // Build project info panel for referenced projects
    const refPids=[...new Set(entries.filter(e=>e.projectId).map(e=>e.projectId))];
    const projectInfoHtml=isRes&&refPids.length
      ?`<div class="project-date-info" style="margin-top:12px">
          ${refPids.map(pid=>{const p=S.projects.find(x=>x.id===pid);if(!p)return '';
            return `<div class="project-info-row">
              <span class="project-hashtag">#${escapeHtml(p.hashtag||p.name)}</span>
              ${p.reservStart?`<span class="project-date-chip">Reserv. Start: ${p.reservStart}</span>`:''}
              ${p.reservEnd?`<span class="project-date-chip">Reserv. Ende: ${p.reservEnd}</span>`:''}
              ${p.zuteilung?`<span class="project-date-chip">Zuteilung: ${p.zuteilung}</span>`:''}
            </div>`;}).join('')}
        </div>`
      :'';

    const colCount=isRes?7:6;
    return `<div class="table-scroll"><table class="detail-table">
      <thead><tr><th>#</th><th>Kundenname</th><th>Datum</th><th>Notiz</th>${isRes?'<th>Projekt</th><th></th>':''}<th></th></tr></thead>
      <tbody id="manual-entries-tbody">${tableRows||`<tr><td colspan="${colCount}" class="no-data" style="padding:16px">Noch keine Einträge.</td></tr>`}</tbody>
    </table></div>${projectInfoHtml}
    <div class="add-customer-section" id="add-customer-section">
      <button class="btn-secondary" style="margin-top:12px" onclick="toggleAddCustomer('${type}')">+ Kunde hinzufügen</button>
      <div id="customer-add-form" class="hidden" style="margin-top:10px">
        <div style="position:relative">
          <input type="text" id="customer-search-input" class="search-input" placeholder="Name eingeben…" autocomplete="off" oninput="onCustomerSearch('${type}',this.value)" onclick="event.stopPropagation()">
          <div id="customer-dropdown" class="customer-dropdown hidden"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
          <input type="date" id="new-entry-date" class="text-input" value="${todayISO()}" style="width:160px" onclick="event.stopPropagation()">
          <button class="btn-primary btn-sm" onclick="event.stopPropagation();confirmAddEntry('${type}')">Hinzufügen</button>
          <button class="btn-secondary btn-sm" onclick="event.stopPropagation();toggleAddCustomer('${type}')">Abbrechen</button>
        </div>
        <div id="selected-customer-hint" style="font-size:.78rem;color:var(--blue);margin-top:4px"></div>
      </div>
    </div>`;
  }

  return '<p class="no-data">Keine Daten verfügbar.</p>';
}

// ── Entry helpers ──
function saveEventComment(id, text){S.eventComments[id]=text;saveState();}
function saveCustomerNote(key, text){S.customerNotes[key]=text;saveState();}

function deleteCalendarEvent(id, type) {
  S.calendarEvents=S.calendarEvents.filter(e=>e.id!==id);
  delete S.eventComments[id];
  saveState(); render(); showDetailModal(type);
}

function saveEntryProject(entryId, projectId) {
  const entry=S.manualEntries.reservierungen.find(e=>e.id===entryId);
  if(entry){ entry.projectId=projectId||null; saveState(); }
}
function saveCustomerMeta(_key, field, value) {
  if (!S.customerMeta[_key]) S.customerMeta[_key] = {};
  S.customerMeta[_key][field] = value || null;
  saveState();
}
function getCustomerMeta(_key) {
  return S.customerMeta[_key] || {};
}

function updateEntryDate(type, id, val) {
  const e=S.manualEntries[type].find(e=>e.id===id);
  if(e){e.date=val;saveState();}
}
function updateEntryNote(type, id, val) {
  const e=S.manualEntries[type].find(e=>e.id===id);
  if(e){e.note=val;saveState();}
}

function deleteEntry(type, id) {
  if(!confirm('Eintrag löschen?')) return;
  S.manualEntries[type]=S.manualEntries[type].filter(e=>e.id!==id);
  saveState(); render(); showDetailModal(type);
}

function promoteEntry(id) {
  const entry=S.manualEntries.reservierungen.find(e=>e.id===id);
  if(!entry) return;
  const alreadyExists=S.manualEntries.notartermine.some(e=>e.customerId&&e.customerId===entry.customerId&&e.customerId!==null);
  if(alreadyExists){showToast(`${entry.customerName} ist bereits bei Notarterminen.`,'warning');return;}
  if(!confirm(`„${entry.customerName}" zu Notarterminen verschieben?`)) return;
  // Copy to notartermine with today's date
  const copy={...entry,id:uid(),date:todayISO()};
  // Determine correct monthKey based on today
  copy.monthKey=getCurrentPeriodKey('M');
  S.manualEntries.notartermine.push(copy);
  S.manualEntries.reservierungen=S.manualEntries.reservierungen.filter(e=>e.id!==id);
  saveState(); render(); showDetailModal('reservierungen');
  showToast(`${entry.customerName} → Notartermine ✓`,'success');
}

// ── Customer autocomplete ──
let _selectedCustomer = null;

function toggleAddCustomer(type) {
  const form=document.getElementById('customer-add-form');
  form.classList.toggle('hidden');
  if(!form.classList.contains('hidden')){
    _selectedCustomer=null;
    document.getElementById('customer-search-input').value='';
    document.getElementById('selected-customer-hint').textContent='';
    document.getElementById('customer-dropdown').classList.add('hidden');
    document.getElementById('customer-search-input').focus();
  }
}

function onCustomerSearch(type, query) {
  _selectedCustomer=null;
  document.getElementById('selected-customer-hint').textContent='';
  const dropdown=document.getElementById('customer-dropdown');
  if(query.length<2){dropdown.classList.add('hidden');return;}
  const q=query.toLowerCase();
  const matches=S.customers.filter(c=>`${c.firstName} ${c.lastName}`.toLowerCase().includes(q)).slice(0,8);
  if(!matches.length){dropdown.innerHTML='<div class="dropdown-item" style="color:var(--gray-4)">Keine Treffer</div>';dropdown.classList.remove('hidden');return;}
  dropdown.innerHTML=matches.map(c=>`<div class="dropdown-item" onclick="selectCustomer('${escapeAttr(c._key)}','${escapeAttr(c.firstName+' '+c.lastName)}')">
    ${escapeHtml(c.firstName+' '+c.lastName)}
    ${c.kundenNr?`<span style="color:var(--gray-4);font-size:.75rem"> · ${c.kundenNr}</span>`:''}
  </div>`).join('');
  dropdown.classList.remove('hidden');
}

function selectCustomer(key, name) {
  _selectedCustomer={_key:key,name:name};
  document.getElementById('customer-search-input').value=name;
  document.getElementById('customer-dropdown').classList.add('hidden');
  document.getElementById('selected-customer-hint').textContent='✓ '+name+' ausgewählt';
}

function confirmAddEntry(type) {
  if(!_selectedCustomer){
    // Allow free-text entry if no customer from CSV
    const rawName=document.getElementById('customer-search-input').value.trim();
    if(!rawName){showToast('Bitte Kundennamen eingeben.','warning');return;}
    _selectedCustomer={_key:null,name:rawName};
  }
  const date=document.getElementById('new-entry-date').value||todayISO();
  const monthKey=date.substring(0,7);
  const newName=_selectedCustomer.name;
  S.manualEntries[type].push({id:uid(),monthKey,customerId:_selectedCustomer._key,customerName:_selectedCustomer.name,date,note:'',projectId:null});
  _selectedCustomer=null;
  saveState(); render(); showDetailModal(type);
  showToast(`${newName} hinzugefügt`,'success');
}

function initCustomerSearch(type) {
  // Close dropdown when clicking outside
  document.addEventListener('click',function handler(e){
    const dd=document.getElementById('customer-dropdown');
    if(dd&&!dd.contains(e.target))dd.classList.add('hidden');
    if(!document.getElementById('detail-modal').contains(e.target)) document.removeEventListener('click',handler);
  });
}

// ─── FUNNEL ────────────────────────────────────────────────────────────────────
function renderFunnel(kpis) {
  const container=document.getElementById('funnel');
  const stages=[{label:'Kontakte Portal',val:kpis.portal},{label:'KAI S2',val:kpis.kai_s2},{label:'Eingewertet',val:kpis.eingewertet},{label:'OV-Gespräch',val:kpis.ov},{label:'Reservierung',val:kpis.reservierungen},{label:'Notar',val:kpis.notartermine}];
  const maxVal=Math.max(...stages.map(s=>s.val),1);
  container.innerHTML=`<h3 class="section-title">Conversion Funnel</h3><div class="funnel-stages">${stages.map((stage,i)=>{
    const bw=Math.max(5,Math.round((stage.val/maxVal)*100));
    const conv=(i>0&&stages[i-1].val>0)?Math.round((stage.val/stages[i-1].val)*100):null;
    return `<div class="funnel-stage">
      <div class="funnel-label">${stage.label}</div>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${bw}%"><span class="funnel-val">${stage.val}</span></div></div>
      <div class="funnel-conv">${conv!==null?conv+'%':''}</div>
    </div>`;
  }).join('')}</div>`;
}

function renderInsightsSection(kpis, prevKpis) {
  const container=document.getElementById('insights'), list=generateInsights(kpis,prevKpis);
  container.innerHTML=`<h3 class="section-title">Analyse</h3>${list.length?`<div class="insights-list">${list.map(ins=>`<div class="insight-item ${ins.cls}">${ins.msg}</div>`).join('')}</div>`:'<p class="no-data">Keine Auffälligkeiten.</p>'}`;
}

function renderStatsTable() {
  const container=document.getElementById('stats-table');
  const n=V.mode==='M'?12:V.mode==='Q'?8:V.mode==='H'?6:5;
  const periods=getHistoryPeriods(V.mode,V.key,n), allKpis=periods.map(k=>getKPIsForPeriod(k,V.mode));
  const headerCols=periods.map((k,i)=>`<th style="${k===V.key?'color:var(--blue)':''}">${getPeriodShortLabel(k,V.mode)}</th>`);
  const tableRows=KPI_ORDER.map(type=>`<tr><td class="kpi-name">${KPI_LABELS[type]}</td>${allKpis.map((kpi,i)=>`<td class="${getCellClass(kpi[type]||0,S.goals[type]||0)}">${kpi[type]||'–'}</td>`).join('')}</tr>`);
  container.innerHTML=`<h3 class="section-title">Verlauf</h3><div class="table-scroll"><table class="stats-table"><thead><tr><th>KPI</th>${headerCols.join('')}</tr></thead><tbody>${tableRows.join('')}</tbody></table></div><div style="margin-top:12px;text-align:right"><button class="btn-secondary" onclick="exportStatsCSV()" style="font-size:.75rem">⬇️ Als CSV exportieren</button></div>`;
}

function getCellClass(val,goal){if(!val)return'cell-zero';if(!goal)return'';const p=val/goal;if(p>=1)return'cell-good';if(p>=0.5)return'cell-ok';return'cell-low';}

// ─── KUNDEN TAB ────────────────────────────────────────────────────────────────
function renderKundenTab() {
  const container=document.getElementById('tab-kunden-content');
  if(!S.customers.length){container.innerHTML='<div class="empty-state"><span class="icon">📊</span><p>Lade eine CSV-Datei hoch.</p></div>';return;}
  const eingewertet=S.customers.filter(c=>c.einwertDates&&c.einwertDates.length>0);
  document.getElementById('csv-info').textContent=`${S.customers.length} Kunden · ${eingewertet.length} eingewertet`;

  // ── Filterwerte ──────────────────────────────────────────────────────────────
  const search=(document.getElementById('kunden-search')?.value||'').toLowerCase().trim();
  const filterProject=document.getElementById('kf-project')?.value||'';
  const filterStatus=document.getElementById('kf-status')?.value||'';
  const filterDateRef=document.getElementById('kf-date')?.value||''; // YYYY-MM-DD or ''

  let filtered=eingewertet;
  if(search) filtered=filtered.filter(c=>`${c.firstName} ${c.lastName}`.toLowerCase().includes(search)||c.einwertNrRaw.toLowerCase().includes(search));
  if(filterProject) filtered=filtered.filter(c=>{const m=getCustomerMeta(c._key);return m.projectId===filterProject;});
  if(filterStatus) filtered=filtered.filter(c=>{const m=getCustomerMeta(c._key);return (m.status||'')=== filterStatus;});
  if(filterDateRef) {
    const refDate=new Date(filterDateRef);
    const sixMonthsAgo=new Date(refDate); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth()-6);
    filtered=filtered.filter(c=>c.einwertDates.some(d=>d>=sixMonthsAgo&&d<=refDate));
  }
  filtered.sort((a,b)=>Math.max(...b.einwertDates.map(d=>d.getTime()))-Math.max(...a.einwertDates.map(d=>d.getTime())));

  // ── Projekt-Optionen ──────────────────────────────────────────────────────────
  const projectOpts=S.projects.map(p=>`<option value="${p.id}">${escapeHtml(p.hashtag||p.name)}</option>`).join('');

  const STATUS_OPTS=[
    {val:'',label:'— Status —'},
    {val:'reservierungsberatung',label:'Reservierungsberatung'},
    {val:'abwartend',label:'abwartend'},
    {val:'aktuell_raus',label:'aktuell raus'}
  ];
  const STATUS_COLORS={reservierungsberatung:'#e8f5e9',abwartend:'#fff8e1',aktuell_raus:'#ffebee'};

  const currentFilterProject=filterProject;
  const currentFilterStatus=filterStatus;
  const currentFilterDate=filterDateRef;

  container.innerHTML=`
    <div class="kunden-filter-bar">
      <select id="kf-project" class="filter-select" onchange="renderKundenTab()">
        <option value="">Alle Projekte</option>${projectOpts}
      </select>
      <select id="kf-status" class="filter-select" onchange="renderKundenTab()">
        ${STATUS_OPTS.map(o=>`<option value="${o.val}">${o.label}</option>`).join('')}
      </select>
      <div class="filter-date-wrap">
        <label style="font-size:.78rem;color:var(--gray-4)">Eingewertet bis:</label>
        <input type="date" id="kf-date" class="text-input filter-date-input" value="${currentFilterDate}" onchange="renderKundenTab()" title="Zeigt Kunden der 6 Monate vor diesem Datum">
        ${currentFilterDate?`<button class="btn-icon-sm" onclick="document.getElementById('kf-date').value='';renderKundenTab()">✕</button>`:''}
      </div>
      <span class="kunden-count">${filtered.length} Kunden</span>
      <button class="btn-secondary" onclick="exportKunden()">⬇️ CSV</button>
    </div>
    <div class="table-scroll"><table class="kunden-table">
      <thead><tr><th>#</th><th>Vorname</th><th>Nachname</th><th>Einwertungsnr.</th><th>Datum</th><th>Rang</th><th>Projekt</th><th>Status</th></tr></thead>
      <tbody>${filtered.map((c,i)=>{
        const meta=getCustomerMeta(c._key);
        const rowBg=STATUS_COLORS[meta.status]||'';
        const projSel=`<select class="customer-dropdown" onchange="saveCustomerMeta('${escapeAttr(c._key)}','projectId',this.value)">
          <option value="">—</option>${S.projects.map(p=>`<option value="${p.id}"${meta.projectId===p.id?' selected':''}>${escapeHtml(p.hashtag||p.name)}</option>`).join('')}
        </select>`;
        const statSel=`<select class="customer-dropdown status-dropdown" onchange="saveCustomerMeta('${escapeAttr(c._key)}','status',this.value)">
          ${STATUS_OPTS.map(o=>`<option value="${o.val}"${(meta.status||'')===o.val?' selected':''}>${o.label}</option>`).join('')}
        </select>`;
        return `<tr style="${rowBg?'background:'+rowBg+';':''}">`+
          `<td style="color:var(--gray-4)">${i+1}</td>`+
          `<td>${escapeHtml(c.firstName)}</td>`+
          `<td>${escapeHtml(c.lastName)}</td>`+
          `<td class="mono">${escapeHtml(c.einwertNrRaw)}</td>`+
          `<td>${c.einwertDates.map(d=>formatDateDE(d)).join(', ')}</td>`+
          `<td>${c.rangstelle||'—'}</td>`+
          `<td>${projSel}</td>`+
          `<td>${statSel}</td>`+
          `</tr>`;
      }).join('')}</tbody>
    </table></div>`;

  // Filter-Werte wiederherstellen nach Re-Render
  if(currentFilterProject){const el=document.getElementById('kf-project');if(el)el.value=currentFilterProject;}
  if(currentFilterStatus){const el=document.getElementById('kf-status');if(el)el.value=currentFilterStatus;}
}

// ─── PROJEKTE TAB ──────────────────────────────────────────────────────────────
function renderProjects() {
  const container=document.getElementById('tab-projekte');
  const toolbar=`<div class="projekte-toolbar">
    <button class="btn-primary" onclick="openProjectModal(null)">+ Neues Projekt hinzufügen</button>
  </div>`;
  const grid=S.projects.length
    ?`<div class="project-grid">${S.projects.map(p=>renderProjectCard(p)).join('')}</div>`
    :`<div class="empty-state" style="padding:60px 24px">
        <span class="icon">🏗️</span>
        <p style="font-size:.95rem;font-weight:600;color:var(--gray-5);margin-bottom:8px">Noch keine Projekte</p>
        <p style="font-size:.85rem">Klicke auf „+ Neues Projekt hinzufügen" um dein erstes Projekt anzulegen.</p>
      </div>`;
  container.innerHTML=toolbar+grid;
}

function renderProjectCard(p) {
  const hasPDF=!!p.pdfData;
  const pdfSizeKB=p.pdfData?Math.round((p.pdfData.length*3/4)/1024):0;
  const datesHtml=[
    p.reservStart?`<span class="project-date-chip">📅 Start: ${p.reservStart}</span>`:'',
    p.reservEnd?`<span class="project-date-chip">🔚 Ende: ${p.reservEnd}</span>`:'',
    p.zuteilung?`<span class="project-date-chip">🏁 Zuteilung: ${p.zuteilung}</span>`:''
  ].filter(Boolean).join('');
  return `<div class="project-card">
    <div class="project-card-header">
      <div class="project-card-title">${escapeHtml(p.name)}</div>
      <div class="project-card-actions">
        <button class="icon-btn" title="Bearbeiten" onclick="openProjectModal('${p.id}')">✏️</button>
        <button class="icon-btn" title="Löschen" onclick="deleteProject('${p.id}')">🗑️</button>
      </div>
    </div>
    ${p.hashtag?`<div><span class="project-hashtag">#${escapeHtml(p.hashtag)}</span></div>`:''}
    ${(p.city||p.street)?`<div class="project-location">📍 ${escapeHtml([p.city,p.street].filter(Boolean).join(', '))}</div>`:''}
    ${datesHtml?`<div class="project-dates">${datesHtml}</div>`:''}
    <div class="project-pdf-row">
      <label class="pdf-upload-btn" title="PDF hochladen (max. ~2,5 MB)">
        ${hasPDF?'🔄 PDF ersetzen':'📎 PDF hochladen'}
        <input type="file" accept=".pdf" style="display:none" onchange="uploadProjectPDF('${p.id}',this)">
      </label>
      ${hasPDF?`<button class="btn-secondary btn-sm" onclick="downloadProjectPDF('${p.id}')">⬇️ ${escapeHtml(p.pdfName||'PDF')}</button>
               <span class="pdf-size-hint">${pdfSizeKB} KB</span>`:''}
    </div>
  </div>`;
}

function openProjectModal(projectId) {
  const p=projectId?S.projects.find(x=>x.id===projectId):null;
  document.getElementById('project-modal-title').textContent=p?'Projekt bearbeiten':'Neues Projekt';
  document.getElementById('pm-id').value        =p?p.id:'';
  document.getElementById('pm-name').value      =p?p.name:'';
  document.getElementById('pm-city').value      =p?p.city:'';
  document.getElementById('pm-street').value    =p?p.street:'';
  document.getElementById('pm-hashtag').value   =p?p.hashtag:'';
  document.getElementById('pm-reservStart').value=p?p.reservStart:'';
  document.getElementById('pm-reservEnd').value  =p?p.reservEnd:'';
  document.getElementById('pm-zuteilung').value  =p?p.zuteilung:'';
  document.getElementById('pm-pdf-hint').textContent=p&&p.pdfName?`Aktuell: ${p.pdfName}`:'';
  document.getElementById('project-modal').classList.remove('hidden');
}

function saveProjectModal() {
  const id=document.getElementById('pm-id').value;
  const name=document.getElementById('pm-name').value.trim();
  if(!name){showToast('Bitte Projektname eingeben.','warning');return;}
  const data={
    name,
    city:       document.getElementById('pm-city').value.trim(),
    street:     document.getElementById('pm-street').value.trim(),
    hashtag:    document.getElementById('pm-hashtag').value.trim(),
    reservStart:document.getElementById('pm-reservStart').value,
    reservEnd:  document.getElementById('pm-reservEnd').value,
    zuteilung:  document.getElementById('pm-zuteilung').value,
  };
  if(id){
    const existing=S.projects.find(p=>p.id===id);
    if(existing) Object.assign(existing,data);
  } else {
    S.projects.push({id:uid(),...data,pdfName:'',pdfData:''});
  }
  saveState(); closeModal('project-modal'); renderProjects();
  showToast(id?'Projekt aktualisiert ✓':'Projekt hinzugefügt ✓','success');
}

function deleteProject(id) {
  const p=S.projects.find(x=>x.id===id);
  if(!p) return;
  if(!confirm(`Projekt „${p.name}" löschen?`)) return;
  S.projects=S.projects.filter(x=>x.id!==id);
  // Remove project references from reservierungen entries
  S.manualEntries.reservierungen.forEach(e=>{if(e.projectId===id) e.projectId=null;});
  saveState(); renderProjects();
  showToast('Projekt gelöscht.','success');
}

function uploadProjectPDF(projectId, input) {
  const file=input.files[0]; if(!file) return;
  const sizeKB=Math.round(file.size/1024);
  if(file.size>2.5*1024*1024) showToast(`PDF ist ${sizeKB} KB – empfohlen max. 2.500 KB (localStorage-Limit).`,'warning');
  const reader=new FileReader();
  reader.onload=ev=>{
    const p=S.projects.find(x=>x.id===projectId); if(!p) return;
    p.pdfData=ev.target.result; p.pdfName=file.name;
    try{saveState();renderProjects();showToast(`PDF „${file.name}" gespeichert (${sizeKB} KB) ✓`,'success');}
    catch(e){p.pdfData='';p.pdfName='';showToast('Speicher voll – PDF zu groß für localStorage.','error');}
  };
  reader.onerror=()=>showToast('PDF konnte nicht gelesen werden.','error');
  reader.readAsDataURL(file); input.value='';
}

function downloadProjectPDF(projectId) {
  const p=S.projects.find(x=>x.id===projectId);
  if(!p||!p.pdfData) return;
  const a=Object.assign(document.createElement('a'),{href:p.pdfData,download:p.pdfName||'projekt.pdf'});
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ─── SETTINGS ──────────────────────────────────────────────────────────────────
function showSettingsModal() {
  document.getElementById('gcid-input').value=GOOGLE_CLIENT_ID;
  document.getElementById('goals-grid').innerHTML=KPI_ORDER.map(type=>`<div class="goal-row"><label>${KPI_LABELS[type]}</label><input type="number" min="0" value="${S.goals[type]||0}" data-goal="${type}" class="text-input"></div>`).join('');
  document.getElementById('settings-modal').classList.remove('hidden');
}

function saveSettings() {
  const newCid=document.getElementById('gcid-input').value.trim();
  if(newCid!==GOOGLE_CLIENT_ID){GOOGLE_CLIENT_ID=newCid;localStorage.setItem('fw_kpi_gcid',newCid);if(newCid){accessToken=null;tokenClient=null;gisReady=false;initGoogleAuth();}}
  document.querySelectorAll('#goals-grid input').forEach(inp=>{S.goals[inp.dataset.goal]=parseInt(inp.value,10)||0;});
  saveState(); closeModal('settings-modal'); render(); showToast('Einstellungen gespeichert','success');
}

function resetCalendarData(){if(!confirm('Kalender-Daten löschen?'))return;S.calendarEvents=[];S.calendarLastSync=null;saveState();closeModal('settings-modal');render();showToast('Gelöscht','success');}
function resetCSVData(){if(!confirm('CSV-Daten löschen?'))return;S.customers=[];saveState();closeModal('settings-modal');render();showToast('Gelöscht','success');}

// ─── MODALS ────────────────────────────────────────────────────────────────────
function closeModal(id){document.getElementById(id).classList.add('hidden');}

// ─── CSV UPLOAD ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('csv-input').addEventListener('change',function(e){
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{const rows=parseCSV(ev.target.result);const added=mergeCustomers(rows);saveState();render();showToast(`CSV: ${added} neue (${rows.length} in Datei, ${S.customers.length} gesamt)`,'success');}
      catch(err){showToast('CSV-Fehler: '+err.message,'error');}
    };
    reader.onerror=()=>showToast('Datei konnte nicht gelesen werden.','error');
    reader.readAsText(file,'UTF-8'); this.value='';
  });
});

// ─── EXPORT ────────────────────────────────────────────────────────────────────
function exportStatsCSV(){
  const n=V.mode==='M'?12:V.mode==='Q'?8:V.mode==='H'?6:5;
  const periods=getHistoryPeriods(V.mode,V.key,n);
  const header=['KPI',...periods.map(k=>getPeriodShortLabel(k,V.mode))].join(';');
  const rows=KPI_ORDER.map(type=>[KPI_LABELS[type],...periods.map(k=>getKPIsForPeriod(k,V.mode)[type]||0)].join(';'));
  downloadCSV([header,...rows].join('\n'),`KPI_${V.key}.csv`);
}
function exportKunden(){
  const header='Vorname;Nachname;Einwertungsnummern;Datum;Rangstelle';
  const rows=S.customers.filter(c=>c.einwertDates&&c.einwertDates.length>0).map(c=>[c.firstName,c.lastName,c.einwertNrRaw,c.einwertDates.map(d=>formatDateDE(d)).join(', '),c.rangstelle||''].join(';'));
  downloadCSV([header,...rows].join('\n'),'Eingewertete_Kunden.csv');
}
function downloadCSV(content,filename){
  const blob=new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob), a=Object.assign(document.createElement('a'),{href:url,download:filename});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

function exportState() {
  const data=localStorage.getItem('fw_kpi_v1')||'{}';
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:`kpi_backup_${todayISO()}.json`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  showToast('Backup heruntergeladen ✓','success');
}

function importState(input) {
  const file=input.files[0]; if(!file) return;
  if(!confirm('Alle aktuellen Daten werden durch das Backup ersetzt. Fortfahren?')){input.value='';return;}
  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      const parsed=JSON.parse(ev.target.result);
      localStorage.setItem('fw_kpi_v1',ev.target.result);
      if(_sbToken&&currentUser){
        try{ await sbSaveData(currentUser.id,parsed); }catch(e){}
      }
      showToast('Backup importiert – App wird neu geladen…','success');
      setTimeout(()=>location.reload(),1000);
    }catch(e){showToast('Ungültige Backup-Datei.','error');}
    input.value='';
  };
  reader.onerror=()=>showToast('Datei konnte nicht gelesen werden.','error');
  reader.readAsText(file,'UTF-8');
}

// ─── UTILS ─────────────────────────────────────────────────────────────────────
function escapeHtml(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escapeAttr(s){return(s||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;');}

function showToast(msg,type='info'){
  const el=Object.assign(document.createElement('div'),{className:`toast toast-${type}`,textContent:msg});
  document.body.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('show')));
  setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),300);},3500);
}

// ─── EVENT LISTENERS ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  // Period tabs
  document.getElementById('period-tabs').addEventListener('click',e=>{
    const btn=e.target.closest('.period-tab'); if(!btn) return;
    const mode=btn.dataset.mode;
    const range=getPeriodRange(V.key,V.mode), mid=new Date((range.start.getTime()+range.end.getTime())/2);
    V.mode=mode; V.key=getPeriodKeyFromDate(mid,mode);
    document.querySelectorAll('.period-tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    render();
  });

  // Period nav
  document.getElementById('prev-period').addEventListener('click',()=>{V.key=navigatePeriod(V.key,V.mode,-1);render();});
  document.getElementById('next-period').addEventListener('click',()=>{V.key=navigatePeriod(V.key,V.mode,1);render();});

  // Tab switching
  document.querySelector('.tab-nav').addEventListener('click',e=>{
    const btn=e.target.closest('.tab-btn'); if(!btn) return;
    const tab=btn.dataset.tab; V.tab=tab;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c=>{c.classList.toggle('active',c.id===`tab-${tab}`);c.classList.toggle('hidden',c.id!==`tab-${tab}`);});
    render();
  });

  // Kunden search
  document.getElementById('kunden-search').addEventListener('input',()=>{if(V.tab==='kunden')renderKundenTab();});

  // Keyboard navigation
  document.addEventListener('keydown',e=>{
    // Enter im Auth-Modal → anmelden
    if(e.key==='Enter'&&!document.getElementById('auth-modal').classList.contains('hidden')){
      e.preventDefault(); handleSignIn(); return;
    }
    if(e.key==='Escape') document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m=>{if(m.id!=='auth-modal')m.classList.add('hidden');});
    if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if(e.key==='ArrowLeft'){V.key=navigatePeriod(V.key,V.mode,-1);render();}
    if(e.key==='ArrowRight'){V.key=navigatePeriod(V.key,V.mode,1);render();}
  });
});

// ─── INIT ──────────────────────────────────────────────────────────────────────
(async function init(){
  V.key=getCurrentPeriodKey(V.mode);
  const user=await checkSession();
  if(user){
    document.getElementById('signout-btn').classList.remove('hidden');
    await loadState();
    render();
    initGoogleAuth();
    if(S.customers.length>0){
      const e=S.customers.filter(c=>c.einwertDates&&c.einwertDates.length>0);
      document.getElementById('csv-info').textContent=`${S.customers.length} Kunden · ${e.length} eingewertet`;
    }
  } else {
    // Render mit localStorage-Daten während Auth angezeigt wird
    try{const raw=localStorage.getItem('fw_kpi_v1');if(raw)_applyState(JSON.parse(raw));}catch(e){}
    render();
    showAuthModal();
  }
})();
