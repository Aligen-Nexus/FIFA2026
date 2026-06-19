// 1. استيراد حزم Firebase الأساسية بنظام الـ Modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ===== بيانات المجموعات المحدّثة ===== */
const GROUPS = {
  'أ': [{name:'المكسيك',code:'mx'},{name:'جنوب أفريقيا',code:'za'},{name:'كوريا الجنوبية',code:'kr'},{name:'التشيك',code:'cz'}],
  'ب': [{name:'كندا',code:'ca'},{name:'البوسنة والهرسك',code:'ba'},{name:'قطر',code:'qa'},{name:'سويسرا',code:'ch'}],
  'ج': [{name:'البرازيل',code:'br'},{name:'المغرب',code:'ma'},{name:'هايتي',code:'ht'},{name:'اسكتلندا',code:'gb-sct'}],
  'د': [{name:'الولايات المتحدة',code:'us'},{name:'باراجواي',code:'py'},{name:'أستراليا',code:'au'},{name:'تركيا',code:'tr'}],
  'ه': [{name:'ألمانيا',code:'de'},{name:'كوراساو',code:'cw'},{name:'ساحل العاج',code:'ci'},{name:'الإكوادور',code:'ec'}],
  'و': [{name:'هولندا',code:'nl'},{name:'اليابان',code:'jp'},{name:'السويد',code:'se'},{name:'تونس',code:'tn'}],
  'ز': [{name:'بلجيكا',code:'be'},{name:'مصر',code:'eg'},{name:'إيران',code:'ir'},{name:'نيوزيلندا',code:'nz'}],
  'ح': [{name:'إسبانيا',code:'es'},{name:'الرأس الأخضر',code:'cv'},{name:'السعودية',code:'sa'},{name:'أوروجواي',code:'uy'}],
  'ط': [{name:'فرنسا',code:'fr'},{name:'السنغال',code:'sn'},{name:'العراق',code:'iq'},{name:'النرويج',code:'no'}],
  'ي': [{name:'الأرجنتين',code:'ar'},{name:'الجزائر',code:'dz'},{name:'النمسا',code:'at'},{name:'الأردن',code:'jo'}],
  'ك': [{name:'البرتغال',code:'pt'},{name:'الكونغو الديمقراطية',code:'cd'},{name:'أوزبكستان',code:'uz'},{name:'كولومبيا',code:'co'}],
  'ل': [{name:'إنجلترا',code:'gb-eng'},{name:'كرواتيا',code:'hr'},{name:'غانا',code:'gh'},{name:'بنما',code:'pa'}]
}; 

// 2. إعدادات Firebase الخاصة بمشروعك المتصل بسيرفرات التخزين
const firebaseConfig = {
  apiKey: "AIzaSyD7-fU3xxsXDrGT50vWEF13af3QXX4_hI8",
  authDomain: "fifa2026-445a8.firebaseapp.com",
  databaseURL: "https://fifa2026-445a8-default-rtdb.firebaseio.com",
  projectId: "fifa2026-445a8",
  storageBucket: "fifa2026-445a8.firebasestorage.app",
  messagingSenderId: "107657231249",
  appId: "1:107657231249:web:30b1c3b353a2c065df7830",
  measurementId: "G-295PF59B40"
};

// 3. تهيئة التطبيق واستدعاء متغير قاعدة البيانات المزامنة
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// مصفوفة محلية مؤقتة يتم تحديثها تلقائياً عند تغيير السحابي لمطابقة المنطق القديم
let CACHED_MATCHES = [];

/* ===== أدوات مساعدة مشتركة ومحدثة لـ Firebase ===== */
function getFlagUrl(code) {
  if (!code) return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="26"><rect fill="%23333" width="40" height="26" rx="4"/></svg>';
  return `https://flagcdn.com/w40/${code}.png`;
}
function genId() { return 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

// دالة للبحث السريع عن كود علم الدولة بناءً على اسمها المكتوب
function findCountryCode(name) {
  if (!name) return '';
  for (let letter in GROUPS) {
    const found = GROUPS[letter].find(t => t.name.trim() === name.trim());
    if (found) return found.code;
  }
  return '';
}

// تعديل جلب البيانات ليقرأ من الذاكرة السحابية المؤقتة المزامنة فورا
function loadData() { 
  return CACHED_MATCHES; 
}

// دالة الحفظ السحابي بديل الـ localStorage
function saveMatchesToFirebase(matches) {
  set(ref(db, 'wc2026_matches'), matches)
    .catch(err => console.error("Firebase Save Error:", err));
}

function getMatchDateTime(m) { return new Date(`${m.date}T${m.time}:00`); }
function formatCountdown(diff) {
  if (diff <= 0) return { h:'00', m:'00', s:'00', expired:true };
  const h = String(Math.floor(diff / 3600000)).padStart(2,'0');
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2,'0');
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2,'0');
  return { h, m, s, expired:false };
}
function formatDateShort(dateStr) { const d = new Date(dateStr); return d.toLocaleDateString('ar-SA', { month:'short', day:'numeric' }); }
function formatDateAr(dateStr) { const d = new Date(dateStr); return d.toLocaleDateString('ar-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' }); }

function getAutoStatus(match) {
  const matchDateTime = new Date(`${match.date}T${match.time}`);
  const now = new Date();
  const matchEnd = new Date(matchDateTime.getTime() + (105 * 60 * 1000));
  if (now < matchDateTime) return 'scheduled';
  if (now >= matchDateTime && now <= matchEnd) return 'live';
  return 'finished';
}

function syncMatchStatuses() {
  let matches = loadData();
  let updated = false;
  matches.forEach(m => {
    const correctStatus = getAutoStatus(m);
    if (m.status !== correctStatus) {
      m.status = correctStatus;
      updated = true;
    }
  });
  if (updated) saveMatchesToFirebase(matches);
}

function calcGroupStandings(groupKey) {
  const teams = GROUPS[groupKey];
  if (!teams) return [];
  const table = teams.map(t => ({ name:t.name, code:t.code, p:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0 }));
  const matches = loadData().filter(m => m.status === 'finished' && m.group === groupKey);
  matches.forEach(m => {
    const home = table.find(t => t.name === m.homeTeam);
    const away = table.find(t => t.name === m.awayTeam);
    if (!home || !away) return;
    home.p++; away.p++;
    home.gf += m.homeScore; home.ga += m.awayScore;
    away.gf += m.awayScore; away.ga += m.homeScore;
    home.gd = home.gf - home.ga; away.gd = away.gf - away.ga;
    if (m.homeScore > m.awayScore) { home.w++; home.pts+=3; away.l++; }
    else if (m.homeScore < m.awayScore) { away.w++; away.pts+=3; home.l++; }
    else { home.d++; away.d++; home.pts++; away.pts++; }
  });
  table.sort((a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return table;
}

function showToast(type, title, body) {
  const container = document.getElementById('toast-container');
  if(!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  const iconMap = { success:'fa-check', error:'fa-xmark', info:'fa-circle-info' };
  toast.innerHTML = `<div class="toast-icon ${type}"><i class="fas ${iconMap[type]||'fa-bell'}"></i></div><div><div class="toast-title">${title}</div><div class="toast-body">${body}</div></div>`;
  toast.onclick = () => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); };
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 4000);
}

function closeModal(id) {
  if (id) { document.getElementById(id).classList.remove('open'); } 
  else { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open')); }
}

let countdownInterval = null;

/* =======================================================
   صفحة الأدمن (Admin Page Logic)
   ======================================================= */
let editingEvents = [];

function renderStats() {
  const matches = loadData();
  const scheduled = matches.filter(m => m.status === 'scheduled').length;
  const finished = matches.filter(m => m.status === 'finished').length;
  const now = Date.now();
  const in24h = matches.filter(m => m.status === 'scheduled' && (getMatchDateTime(m).getTime() - now) > 0 && (getMatchDateTime(m).getTime() - now) <= 86400000).length;
  const statsRow = document.getElementById('stats-row');
  if(!statsRow) return;
  statsRow.innerHTML = `
    <div class="stat-card"><div class="stat-card-num" style="color:var(--gold);">${matches.length}</div><div class="stat-card-label">إجمالي المباريات</div></div>
    <div class="stat-card"><div class="stat-card-num" style="color:#60A5FA;">${scheduled}</div><div class="stat-card-label">مباريات قادمة</div></div>
    <div class="stat-card"><div class="stat-card-num" style="color:var(--green);">${finished}</div><div class="stat-card-label">مباريات منتهية</div></div>
    <div class="stat-card"><div class="stat-card-num" style="color:#FBBF24;">${in24h}</div><div class="stat-card-label">خلال 24 ساعة</div></div>
  `;
}

function renderAdminCountdowns() {
  const grid = document.getElementById('countdown-grid');
  if(!grid) return;
  const matches = loadData().filter(m => m.status === 'scheduled');
  const now = Date.now();
  const in24h = matches.filter(m => { const diff = getMatchDateTime(m).getTime() - now; return diff > 0 && diff <= 86400000; }).sort((a,b) => getMatchDateTime(a) - getMatchDateTime(b));
  if (in24h.length === 0) {
    grid.innerHTML = `<div class="glass" style="padding:40px;text-align:center;grid-column:1/-1;"><i class="fas fa-clock" style="font-size:2rem;color:rgba(255,255,255,0.08);margin-bottom:12px;display:block;"></i><p style="color:rgba(255,255,255,0.3);font-size:0.9rem;">لا توجد مباريات خلال الـ 24 ساعة القادمة</p></div>`;
    return;
  }
  grid.innerHTML = in24h.map(m => {
    const dt = getMatchDateTime(m); const diff = dt - now;
    const c = formatCountdown(diff);
    return `<div class="glass countdown-card" data-cd-id="${m.id}" data-cd-target="${dt.getTime()}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:0.7rem;font-weight:700;color:var(--gold);background:rgba(212,175,55,0.1);padding:2px 10px;border-radius:6px;">${m.group}</span>
        <span style="font-size:0.68rem;color:rgba(255,255,255,0.3);">${formatDateShort(m.date)} — ${m.time}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:4px;">
        <img src="${getFlagUrl(m.homeCode)}" style="width:28px;height:20px;border-radius:3px;border:1px solid rgba(255,255,255,0.06);" alt="${m.homeTeam}" onerror="this.style.display='none'">
        <span style="font-weight:700;font-size:0.88rem;">${m.homeTeam}</span>
        <span style="color:rgba(255,255,255,0.15);font-weight:900;font-size:0.8rem;">VS</span>
        <span style="font-weight:700;font-size:0.88rem;">${m.awayTeam}</span>
        <img src="${getFlagUrl(m.awayCode)}" style="width:28px;height:20px;border-radius:3px;border:1px solid rgba(255,255,255,0.06);" alt="${m.awayTeam}" onerror="this.style.display='none'">
      </div>
      <div class="countdown-big">
        <div class="countdown-big-unit"><span class="countdown-big-num cd-h">${c.h}</span><span class="countdown-big-label">ساعة</span></div>
        <div class="countdown-big-unit"><span class="countdown-big-num cd-m">${c.m}</span><span class="countdown-big-label">دقيقة</span></div>
        <div class="countdown-big-unit"><span class="countdown-big-num cd-s">${c.s}</span><span class="countdown-big-label">ثانية</span></div>
      </div>
    </div>`;
  }).join('');
}

function renderAdminGroups() {
  const grid = document.getElementById('admin-groups-grid');
  if(!grid) return;
  grid.innerHTML = Object.entries(GROUPS).map(([letter, teams]) => {
    const standings = calcGroupStandings(letter);
    const hasPlayed = standings.some(t => t.p > 0);
    return `<div class="glass group-card-admin">
      <div class="group-card-admin-header"><div class="group-letter">${letter}</div><span class="group-card-admin-title">المجموعة ${letter}</span></div>
      <div style="overflow-x:auto;"><table class="group-table"><thead><tr><th style="width:18px;"></th><th>المنتخب</th><th>لعب</th><th>فوز</th><th>تع</th><th>خس</th><th>له</th><th>عليه</th><th>فارق</th><th>نقاط</th></tr></thead>
      <tbody>${standings.map((t, i) => {
        const rowClass = i < 2 ? 'gt-qualify' : i === 2 ? 'gt-playoff' : '';
        const gdClass = t.gd > 0 ? 'ga-gd-pos' : t.gd < 0 ? 'ga-gd-neg' : 'gt-gd-zero';
        const gdText = t.gd > 0 ? `+${t.gd}` : String(t.gd);
        return `<tr class="${rowClass}"><td style="color:rgba(255,255,255,0.15);font-weight:700;font-size:0.65rem;">${hasPlayed?(i+1):''}</td>
        <td><img src="${getFlagUrl(t.code)}" class="gt-flag" alt="${t.name}" onerror="this.style.display='none'"><span class="gt-name">${t.name}</span></td>
        <td>${t.p}</td><td style="font-weight:700;color:${t.w>0?'var(--green)':'rgba(255,255,255,0.35)'};">${t.w}</td><td>${t.d}</td><td style="color:${t.l>0?'var(--red)':'rgba(255,255,255,0.35)'};">${t.l}</td>
        <td>${t.gf}</td><td>${t.ga}</td><td class="${gdClass}" style="font-weight:700;">${gdText}</td><td><span class="gt-pts">${t.pts}</span></td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  }).join('');
}

function renderMatchesTable() {
  const matches = loadData();
  const filterG = document.getElementById('filter-group')?.value || 'all';
  const filterS = document.getElementById('filter-status')?.value || 'all';
  let filtered = matches;
  if (filterG !== 'all') filtered = filtered.filter(m => m.group === filterG);
  if (filterS !== 'all') filtered = filtered.filter(m => m.status === filterS);
  filtered.sort((a,b) => new Date(a.date+'T'+a.time) - new Date(b.date+'T'+b.time));
  const tbody = document.getElementById('matches-tbody');
  if(!tbody) return;
  if (filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:rgba(255,255,255,0.25);">لا توجد مباريات</td></tr>`; return; }
  tbody.innerHTML = filtered.map((m, i) => {
    const currentStatus = getAutoStatus(m); 
    const statusText = currentStatus === 'live' ? 'مباشر' : (currentStatus === 'finished' ? 'انتهت' : 'لم تبدأ');
    const statusColor = currentStatus === 'live' ? '#ff4757' : (currentStatus === 'finished' ? '#2ed573' : '#ffa502');
    const statusBadge = `<span style="padding:3px 10px;border-radius:10px;font-size:0.75rem;background:${statusColor}22;color:${statusColor};">${statusText}</span>`;
    return `<tr>
      <td style="color:rgba(255,255,255,0.25);font-weight:600;">${i+1}</td>
      <td><span style="color:var(--gold);font-weight:700;">${m.group}</span></td>
      <td><div style="display:flex;align-items:center;gap:8px;"><img src="${getFlagUrl(m.homeCode)}" style="width:24px;height:17px;border-radius:3px;border:1px solid rgba(255,255,255,0.06);" alt="" onerror="this.style.display='none'"><span style="font-weight:700;">${m.homeTeam}</span></div></td>
      <td style="font-weight:900;font-size:1rem;color:var(--gold-light);text-align:center;">${String(m.homeScore).padStart(2,'0')} - ${String(m.awayScore).padStart(2,'0')}</td>
      <td><div style="display:flex;align-items:center;gap:8px;"><img src="${getFlagUrl(m.awayCode)}" style="width:24px;height:17px;border-radius:3px;border:1px solid rgba(255,255,255,0.06);" alt="" onerror="this.style.display='none'"><span style="font-weight:700;">${m.awayTeam}</span></div></td>
      <td style="white-space:nowrap;">${formatDateShort(m.date)}</td>
      <td style="white-space:nowrap;">${m.time}</td>
      <td>${statusBadge}</td>
      <td style="text-align:center;">${m.events && m.events.length > 0 ? `<span style="background:rgba(212,175,55,0.1);color:var(--gold);padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:700;">${m.events.length}</span>` : '<span style="color:rgba(255,255,255,0.15);">—</span>'}</td>
      <td><button class="admin-btn admin-btn-ghost admin-btn-sm" data-id="${m.id}"><i class="fas fa-pen"></i> تعديل</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.admin-btn').forEach(btn => {
     btn.onclick = () => openEditModal(btn.dataset.id);
  });
}

function populateGroupFilter() {
  const sel = document.getElementById('filter-group');
  if(!sel) return;
  sel.innerHTML = '<option value="all">كل المجموعات</option>';
  Object.keys(GROUPS).forEach(g => { const opt = document.createElement('option'); opt.value = g; opt.textContent = `المجموعة ${g}`; sel.appendChild(opt); });
}
function populateAddGroupSelect() {
  const sel = document.getElementById('add-group');
  if(!sel) return;
  sel.innerHTML = '<option value="">اختر المجموعة...</option>';
  Object.keys(GROUPS).forEach(g => { const opt = document.createElement('option'); opt.value = g; opt.textContent = `المجموعة ${g}`; sel.appendChild(opt); });
}
function updateTeamDropdowns(prefix) {
  const groupKey = document.getElementById(`${prefix}-group`).value;
  const homeSel = document.getElementById(`${prefix}-home`);
  const awaySel = document.getElementById(`${prefix}-away`);
  if(!homeSel || !awaySel) return;
  homeSel.innerHTML = '<option value="">اختر الفريق</option>';
  awaySel.innerHTML = '<option value="">اختر الفريق</option>';
  if (!groupKey || !GROUPS[groupKey]) return;
  GROUPS[groupKey].forEach(t => {
    homeSel.innerHTML += `<option value="${t.name}" data-code="${t.code}">${t.name}</option>`;
    awaySel.innerHTML += `<option value="${t.name}" data-code="${t.code}">${t.name}</option>`;
  });
}

function openAddModal() {
  document.getElementById('add-group').value = '';
  document.getElementById('add-home').innerHTML = '<option value="">اختر الفريق</option>';
  document.getElementById('add-away').innerHTML = '<option value="">اختر الفريق</option>';
  document.getElementById('add-date').value = '';
  document.getElementById('add-time').value = '';
  document.getElementById('add-modal').classList.add('open');
}

function saveMatch() {
  const group = document.getElementById('add-group').value;
  const homeSel = document.getElementById('add-home');
  const awaySel = document.getElementById('add-away');
  const homeTeam = homeSel.value; const awayTeam = awaySel.value;
  const date = document.getElementById('add-date').value; const time = document.getElementById('add-time').value;
  if (!group) { showToast('error','خطأ','اختر المجموعة'); return; }
  if (!homeTeam) { showToast('error','خطأ','اختر الفريق الأول'); return; }
  if (!awayTeam) { showToast('error','خطأ','اختر الفريق الثاني'); return; }
  if (homeTeam === awayTeam) { showToast('error','خطأ','لا يمكن اختيار نفس الفريق مرتين'); return; }
  if (!date) { showToast('error','خطأ','اختر تاريخ المباراة'); return; }
  if (!time) { showToast('error','خطأ','اختر توقيت المباراة'); return; }
  const homeCode = homeSel.options[homeSel.selectedIndex].dataset.code || '';
  const awayCode = awaySel.options[awaySel.selectedIndex].dataset.code || '';
  const matches = loadData();
  matches.push({ id:genId(), group, homeTeam, awayTeam, homeCode, awayCode, date, time, homeScore:0, awayScore:0, status:'scheduled', events:[], createdAt:Date.now() });
  
  saveMatchesToFirebase(matches);
  closeModal('add-modal');
  showToast('success','تمت الإضافة','تمت إضافة المباراة إلى السحابة بنجاح');
}

function openEditModal(id) {
  const m = loadData().find(x => x.id === id); if (!m) return;
  document.getElementById('edit-id').value = m.id;
  document.getElementById('edit-date').value = m.date;
  document.getElementById('edit-time').value = m.time;
  document.getElementById('edit-match-info').innerHTML = `
    <div style="text-align:center;"><img src="${getFlagUrl(m.homeCode)}" style="width:44px;height:32px;border-radius:5px;border:1px solid rgba(255,255,255,0.06);margin-bottom:4px;" alt="" onerror="this.style.display='none'"><div style="font-weight:800;font-size:0.9rem;">${m.homeTeam}</div></div>
    <div style="font-size:1.6rem;font-weight:900;color:var(--gold-light);">${String(m.homeScore).padStart(2,'0')} - ${String(m.awayScore).padStart(2,'0')}</div>
    <div style="text-align:center;"><img src="${getFlagUrl(m.awayCode)}" style="width:44px;height:32px;border-radius:5px;border:1px solid rgba(255,255,255,0.06);margin-bottom:4px;" alt="" onerror="this.style.display='none'"><div style="font-weight:800;font-size:0.9rem;">${m.awayTeam}</div></div>`;
  document.getElementById('edit-home-label').textContent = m.homeTeam;
  document.getElementById('edit-away-label').textContent = m.awayTeam;
  document.getElementById('edit-home-score').value = m.homeScore;
  document.getElementById('edit-away-score').value = m.awayScore;
  document.getElementById('edit-finished').checked = m.status === 'finished';
  toggleScoreEdit();
  editingEvents = JSON.parse(JSON.stringify(m.events || []));
  renderEventsList();
  document.getElementById('edit-modal').classList.add('open');
}

function toggleScoreEdit() {
  const checked = document.getElementById('edit-finished').checked;
  const area = document.getElementById('score-edit-area');
  if(!area) return;
  area.style.opacity = checked ? '1' : '0.3';
  area.style.pointerEvents = checked ? 'auto' : 'none';
}

function renderEventsList() {
  const container = document.getElementById('events-list');
  if(!container) return;
  if (editingEvents.length === 0) { container.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.2);font-size:0.82rem;padding:12px;">لا توجد أحداث مسجلة</p>'; return; }
  editingEvents.sort((a,b) => a.minute - b.minute);
  const typeLabels = { goal:'هدف', yellow:'صفراء', red:'حمراء', sub:'تبديل', other:'أخرى' };
  container.innerHTML = editingEvents.map((e, i) => `
    <div class="event-item"><div class="event-dot ${e.type}"></div>
    <span style="font-weight:800;font-size:0.82rem;color:var(--gold);min-width:32px;">${e.minute}'</span>
    <span style="font-size:0.72rem;padding:2px 8px;border-radius:5px;background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.5);">${typeLabels[e.type] || e.type}</span>
    <span style="font-size:0.78rem;color:rgba(255,255,255,0.6);flex:1;">${e.text}</span>
    <button class="remove-evt-btn" data-index="${i}" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.8rem;padding:4px;"><i class="fas fa-xmark"></i></button></div>
  `).join('');

  container.querySelectorAll('.remove-evt-btn').forEach(btn => {
     btn.onclick = () => removeEvent(parseInt(btn.dataset.index));
  });
}

function addEvent() {
  const minute = parseInt(document.getElementById('evt-minute').value);
  const type = document.getElementById('evt-type').value;
  const team = document.getElementById('evt-team').value;
  const text = document.getElementById('evt-text').value.trim();
  if (!minute || minute < 1 || minute > 120) { showToast('error','خطأ','أدخل دقيقة صحيحة (1-120)'); return; }
  if (!text) { showToast('error','خطأ','أدخل وصف الحدث'); return; }
  const match = loadData().find(m => m.id === document.getElementById('edit-id').value);
  if (!match) return;
  const teamLabel = team === 'home' ? match.homeTeam : match.awayTeam;
  editingEvents.push({ minute, type, team, text: `[${teamLabel}] ${text}` });
  document.getElementById('evt-minute').value = '';
  document.getElementById('evt-text').value = '';
  renderEventsList();
  showToast('success','تمت الإضافة','تم إضافة الحدث بنجاح');
}

function removeEvent(index) { editingEvents.splice(index, 1); renderEventsList(); }

function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const date = document.getElementById('edit-date').value;
  const time = document.getElementById('edit-time').value;
  const isFinished = document.getElementById('edit-finished').checked;
  const homeScore = parseInt(document.getElementById('edit-home-score').value) || 0;
  const awayScore = parseInt(document.getElementById('edit-away-score').value) || 0;
  if (!date) { showToast('error','خطأ','اختر التاريخ'); return; }
  if (!time) { showToast('error','خطأ','اختر التوقيت'); return; }
  const matches = loadData();
  const idx = matches.findIndex(m => m.id === id);
  if (idx === -1) return;
  matches[idx].date = date; matches[idx].time = time;
  matches[idx].status = isFinished ? 'finished' : 'scheduled';
  if (isFinished) { matches[idx].homeScore = Math.max(0, homeScore); matches[idx].awayScore = Math.max(0, awayScore); }
  else { matches[idx].homeScore = 0; matches[idx].awayScore = 0; }
  matches[idx].events = JSON.parse(JSON.stringify(editingEvents));
  
  saveMatchesToFirebase(matches);
  closeModal('edit-modal');
  showToast('success','تم الحفظ','تم تحديث المباراة سحابياً');
}

function deleteMatch() {
  const id = document.getElementById('edit-id').value; if (!id) return;
  const overlay = document.getElementById('edit-modal');
  const confirmDiv = document.createElement('div');
  confirmDiv.id = "confirm-delete-box";
  confirmDiv.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10;border-radius:24px;';
  confirmDiv.innerHTML = `<div style="text-align:center;padding:30px;"><i class="fas fa-triangle-exclamation" style="font-size:2rem;color:var(--red);margin-bottom:14px;display:block;"></i><p style="font-weight:700;font-size:1.1rem;margin-bottom:8px;">تأكيد الحذف</p><p style="color:rgba(255,255,255,0.4);font-size:0.85rem;margin-bottom:20px;">هل أنت متأكد من حذف هذه المباراة؟</p><div style="display:flex;gap:10px;justify-content:center;"><button class="admin-btn admin-btn-danger" id="btn-conf-del"><i class="fas fa-trash"></i> نعم، احذف</button><button class="admin-btn admin-btn-ghost" id="btn-cancel-del">إلغاء</button></div></div>`;
  overlay.style.position = 'relative'; overlay.appendChild(confirmDiv);
  
  document.getElementById('btn-conf-del').onclick = () => confirmDelete(id);
  document.getElementById('btn-cancel-del').onclick = () => confirmDiv.remove();
}

function confirmDelete(id) {
  let matches = loadData(); matches = matches.filter(m => m.id !== id); 
  saveMatchesToFirebase(matches);
  closeModal('edit-modal'); 
  showToast('info','تم الحذف','تم حذف المباراة نهائياً');
}

function renderAdminAll() { renderStats(); renderAdminCountdowns(); renderAdminGroups(); renderMatchesTable(); }

/* =======================================================
   صفحة الزائر (Index Page Logic)
   ======================================================= */
function renderUpcoming() {
  const grid = document.getElementById('upcoming-grid');
  if(!grid) return;
  const matches = loadData().filter(m => m.status === 'scheduled');
  if (matches.length === 0) { grid.innerHTML = `<div class="empty-state col-span-full"><i class="fas fa-calendar-xmark"></i><p>لا توجد مباريات قادمة حالياً</p></div>`; return; }
  matches.sort((a,b) => getMatchDateTime(a) - getMatchDateTime(b));
  grid.innerHTML = matches.map(m => {
    const dt = getMatchDateTime(m); const diff = dt - Date.now(); const c = formatCountdown(diff);
    return `<div class="glass match-card" data-id="${m.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--gold);background:rgba(212,175,55,0.1);padding:3px 10px;border-radius:6px;">المجموعة ${m.group}</span>
        <span class="scheduled-badge"><i class="fas fa-clock" style="font-size:6px;"></i> قادمة</span>
      </div>
      <div class="team-row"><img src="${getFlagUrl(m.homeCode)}" class="team-flag" alt="${m.homeTeam}" onerror="this.style.display='none'"><span class="team-name">${m.homeTeam}</span><span class="team-score">${String(m.homeScore).padStart(2,'0')}</span></div>
      <div class="match-time-label">${m.time} — ${formatDateAr(m.date)}</div>
      <div class="team-row"><img src="${getFlagUrl(m.awayCode)}" class="team-flag" alt="${m.awayTeam}" onerror="this.style.display='none'"><span class="team-name">${m.awayTeam}</span><span class="team-score">${String(m.awayScore).padStart(2,'0')}</span></div>
      <div class="countdown-row" data-countdown-id="${m.id}" data-countdown-target="${dt.getTime()}">
        <div class="countdown-unit"><span class="countdown-num cd-h">${c.h}</span><span class="countdown-label">ساعة</span></div>
        <div class="countdown-unit"><span class="countdown-num cd-m">${c.m}</span><span class="countdown-label">دقيقة</span></div>
        <div class="countdown-unit"><span class="countdown-num cd-s">${c.s}</span><span class="countdown-label">ثانية</span></div>
      </div></div>`;
  }).join('');

  grid.querySelectorAll('.match-card').forEach(card => {
     card.onclick = () => openMatchDetail(card.dataset.id);
  });
  startCountdowns();
}

function renderResults() {
  const grid = document.getElementById('results-grid');
  if(!grid) return;
  const matches = loadData().filter(m => m.status === 'finished');
  if (matches.length === 0) { grid.innerHTML = `<div class="empty-state col-span-full"><i class="fas fa-futbol"></i><p>لا توجد نتائج بعد</p><p class="sub">ستظهر هنا نتائج المباريات المنتهية</p></div>`; return; }
  matches.sort((a,b) => new Date(b.date) - new Date(a.date));
  grid.innerHTML = matches.map(m => `
    <div class="glass match-card" data-id="${m.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--gold);background:rgba(212,175,55,0.1);padding:3px 10px;border-radius:6px;">المجموعة ${m.group}</span>
        <span class="finished-badge"><i class="fas fa-check" style="font-size:6px;"></i> انتهت</span>
      </div>
      <div class="team-row"><img src="${getFlagUrl(m.homeCode)}" class="team-flag" alt="${m.homeTeam}" onerror="this.style.display='none'"><span class="team-name">${m.homeTeam}</span><span class="team-score" style="${m.homeScore > m.awayScore ? 'color:var(--green);' : ''}">${String(m.homeScore).padStart(2,'0')}</span></div>
      <div class="match-time-label">${m.time} — ${formatDateAr(m.date)}</div>
      <div class="team-row"><img src="${getFlagUrl(m.awayCode)}" class="team-flag" alt="${m.awayTeam}" onerror="this.style.display='none'"><span class="team-name">${m.awayTeam}</span><span class="team-score" style="${m.awayScore > m.homeScore ? 'color:var(--green);' : ''}">${String(m.awayScore).padStart(2,'0')}</span></div>
      ${m.events && m.events.length > 0 ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.04);font-size:0.72rem;color:rgba(255,255,255,0.35);"><i class="fas fa-list" style="margin-left:4px;"></i> ${m.events.length} حدث</div>` : ''}</div>
  `).join('');

  grid.querySelectorAll('.match-card').forEach(card => {
     card.onclick = () => openMatchDetail(card.dataset.id);
  });
}

function renderIndexGroups() {
  const grid = document.getElementById('groups-grid');
  if(!grid) return;
  grid.innerHTML = Object.entries(GROUPS).map(([letter, teams]) => {
    const standings = calcGroupStandings(letter);
    const hasPlayed = standings.some(t => t.p > 0);
    return `<div class="glass group-card reveal">
      <div class="group-card-header"><div class="group-letter">${letter}</div><span class="group-card-title">المجموعة ${letter}</span></div>
      <div style="overflow-x:auto;"><table class="group-table"><thead><tr><th style="width:24px;"></th><th>المنتخب</th><th>لعب</th><th>فوز</th><th>تعادل</th><th>خسارة</th><th>له</th><th>عليه</th><th>فارق</th><th>نقاط</th></tr></thead>
      <tbody>${standings.map((t, i) => {
        const rowClass = i < 2 ? 'gt-qualify' : i === 2 ? 'gt-playoff' : '';
        const gdClass = t.gd > 0 ? 'gt-gd-pos' : t.gd < 0 ? 'gt-gd-neg' : 'gt-gd-zero';
        const gdText = t.gd > 0 ? `+${t.gd}` : String(t.gd);
        return `<tr class="${rowClass}"><td><span class="gt-rank">${hasPlayed ? (i+1) : ''}</span></td>
        <td><img src="${getFlagUrl(t.code)}" class="gt-flag" alt="${t.name}" onerror="this.style.display='none'"><span class="gt-name">${t.name}</span></td>
        <td>${t.p}</td><td style="font-weight:700;color:${t.w>0?'var(--green)':'rgba(255,255,255,0.4)'};">${t.w}</td><td>${t.d}</td><td style="color:${t.l>0?'var(--red)':'rgba(255,255,255,0.4)'};">${t.l}</td>
        <td>${t.gf}</td><td>${t.ga}</td><td class="${gdClass}" style="font-weight:700;">${gdText}</td><td><span class="gt-pts">${t.pts}</span></td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  }).join('');
  observeReveal();
}

function openMatchDetail(id) {
  const m = loadData().find(x => x.id === id); if (!m) return;
  const isFinished = m.status === 'finished';
  document.getElementById('match-modal-body').innerHTML = `
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:0.75rem;font-weight:700;color:var(--gold);background:rgba(212,175,55,0.1);padding:4px 14px;border-radius:8px;">المجموعة ${m.group}</span>
      <h3 style="font-size:1.4rem;font-weight:900;margin-top:14px;">${m.homeTeam} vs ${m.awayTeam}</h3>
      <p style="font-size:0.85rem;color:rgba(255,255,255,0.4);margin-top:6px;"><i class="fas fa-calendar" style="margin-left:5px;"></i> ${formatDateAr(m.date)} — ${m.time}</p>
    </div>
    <div class="glass" style="padding:24px;margin-bottom:20px;">
      <div style="display:flex;align-items:center;justify-content:center;gap:20px;">
        <div style="text-align:center;"><img src="${getFlagUrl(m.homeCode)}" style="width:56px;height:40px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);margin-bottom:8px;" alt="${m.homeTeam}" onerror="this.style.display='none'"><div style="font-weight:800;font-size:1rem;">${m.homeTeam}</div></div>
        <div style="text-align:center;"><div style="font-size:2.8rem;font-weight:900;color:var(--gold-light);line-height:1;">${String(m.homeScore).padStart(2,'0')} - ${String(m.awayScore).padStart(2,'0')}</div><div style="font-size:0.75rem;color:rgba(255,255,255,0.3);margin-top:6px;">${isFinished ? 'انتهت المباراة' : 'لم تبدأ'}</div></div>
        <div style="text-align:center;"><img src="${getFlagUrl(m.awayCode)}" style="width:56px;height:40px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);margin-bottom:8px;" alt="${m.awayTeam}" onerror="this.style.display='none'"><div style="font-weight:800;font-size:1rem;">${m.awayTeam}</div></div>
      </div></div>
    ${isFinished && m.events && m.events.length > 0 ? `<div style="margin-bottom:12px;font-weight:700;font-size:1rem;"><i class="fas fa-list-timeline" style="margin-left:6px;color:var(--gold);"></i> أحداث المباراة</div>
    <div class="timeline">${m.events.sort((a,b)=>a.minute-b.minute).map(e => {
      const dotClass = e.type === 'goal' ? 'goal' : e.type === 'yellow' ? 'yellow' : e.type === 'red' ? 'red' : e.type === 'sub' ? 'sub' : 'other';
      const icon = e.type === 'goal' ? '<i class="fas fa-futbol"></i>' : e.type === 'yellow' ? '<i class="fas fa-square"></i>' : e.type === 'red' ? '<i class="fas fa-square"></i>' : e.type === 'sub' ? '<i class="fas fa-arrows-rotate"></i>' : '<i class="fas fa-circle-info"></i>';
      return `<div class="timeline-item"><div class="timeline-dot ${dotClass}">${icon}</div><div class="timeline-min">${e.minute}'</div><div class="timeline-text">${e.text}</div></div>`;
    }).join('')}</div>` : isFinished ? '<p style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.85rem;">لم يتم تسجيل أحداث لهذه المباراة</p>' : '<p style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.85rem;">لم تبدأ المباراة بعد</p>'}`;
  document.getElementById('match-modal').classList.add('open');
}

function initHeroCanvas() {
  const canvas = document.getElementById('hero-canvas'); if(!canvas) return;
  const ctx = canvas.getContext('2d'); let w, h, particles = [];
  function resize() { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; }
  resize(); window.addEventListener('resize', resize);
  for (let i = 0; i < 60; i++) { particles.push({ x:Math.random()*w, y:Math.random()*h, r:Math.random()*1.5+0.5, vx:(Math.random()-0.5)*0.3, vy:(Math.random()-0.5)*0.3, a:Math.random()*0.4+0.1 }); }
  function draw() {
    ctx.clearRect(0,0,w,h);
    particles.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.x < 0) p.x = w; if (p.x > w) p.x = 0; if (p.y < 0) p.y = h; if (p.y > h) p.y = 0; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.r), 0, Math.PI*2); ctx.fillStyle = `rgba(212,175,55,${p.a})`; ctx.fill(); });
    for (let i = 0; i < particles.length; i++) { for (let j = i+1; j < particles.length; j++) { const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y; const dist = Math.sqrt(dx*dx+dy*dy); if (dist < 120) { ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y); ctx.strokeStyle = `rgba(212,175,55,${0.06*(1-dist/120)})`; ctx.stroke(); } } }
    requestAnimationFrame(draw);
  } draw();
}

function observeReveal() {
  const obs = new IntersectionObserver((entries) => { entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } }); }, { threshold: 0.1 });
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => obs.observe(el));
}

function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => { const target = parseInt(el.dataset.count); let current = 0; const step = Math.max(1, Math.floor(target / 60)); const timer = setInterval(() => { current += step; if (current >= target) { current = target; clearInterval(timer); } el.textContent = current; }, 25); });
}

function startCountdowns() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('[data-countdown-id]').forEach(el => {
      const target = parseInt(el.dataset.countdownTarget); const diff = target - now; const c = formatCountdown(diff);
      const hEl = el.querySelector('.cd-h'), mEl = el.querySelector('.cd-m'), sEl = el.querySelector('.cd-s');
      if(hEl) hEl.textContent = c.h; if(mEl) mEl.textContent = c.m; if(sEl) sEl.textContent = c.s;
    });
    document.querySelectorAll('[data-cd-id]').forEach(el => {
      const target = parseInt(el.dataset.cdTarget); const diff = target - now; const c = formatCountdown(diff);
      const hEl = el.querySelector('.cd-h'), mEl = el.querySelector('.cd-m'), sEl = el.querySelector('.cd-s');
      if(hEl) hEl.textContent = c.h; if(mEl) mEl.textContent = c.m; if(sEl) sEl.textContent = c.s;
    });
  }, 1000);
}

/* =======================================================
   التشغيل والمزامنة الفورية من Firebase (Realtime Sync)
   ======================================================= */
window.addEventListener('DOMContentLoaded', () => {
  
  // الاستماع المباشر للتغيرات السحابية بالوقت الفعلي
  const matchesRef = ref(db, 'wc2026_matches');
  onValue(matchesRef, (snapshot) => {
    const data = snapshot.val();
    CACHED_MATCHES = data ? data : [];
    
    // فحص وتحديث الحالة التلقائية للمباريات (live / finished)
    syncMatchStatuses();

    // تحديث الواجهات فوراً بناءً على الصفحة الحالية تلقائياً
    if (document.getElementById('admin-groups-grid')) {
      renderAdminAll();
    }
    if (document.getElementById('groups-grid')) {
      renderUpcoming(); 
      renderResults(); 
      renderIndexGroups();
    }
  });

  // تكوين الفلاتر والأزرار لصفحة الأدمن
  if (document.getElementById('admin-groups-grid')) {
    populateGroupFilter();
    populateAddGroupSelect();
    startCountdowns();
    
    document.getElementById('filter-group').onchange = renderMatchesTable;
    document.getElementById('filter-status').onchange = renderMatchesTable;
    document.getElementById('add-group').onchange = () => updateTeamDropdowns('add');
    
    // ربط أزرار المودال للأدمن
    document.getElementById('add-match-btn').onclick = openAddModal;
    document.getElementById('save-match-btn').onclick = saveMatch;
    document.getElementById('save-edit-btn').onclick = saveEdit;
    document.getElementById('delete-match-btn').onclick = deleteMatch;
    document.getElementById('add-event-btn').onclick = addEvent;
    document.getElementById('edit-finished').onchange = toggleScoreEdit;
  }

  // تهيئة الصفحة الرئيسية للزوار
  if (document.getElementById('groups-grid')) {
    initHeroCanvas();
    setTimeout(() => { 
      const loader = document.getElementById('loader');
      if(loader) loader.classList.add('hidden'); 
      animateCounters(); 
    }, 600);
    
    window.addEventListener('scroll', () => { 
      const nv = document.getElementById('navbar');
      if(nv) nv.classList.toggle('scrolled', window.scrollY > 50); 
    });
  }

  // إغلاق المودال بالضغط خارجه
  document.querySelectorAll('.modal-overlay').forEach(m => { 
    m.addEventListener('click', function(e) { if (e.target === this) closeModal(); }); 
  });
});

/* =======================================================
   منطق شجرة الأدوار الإقصائية المطور (Knockout Bracket Logic)
   ======================================================= */
const KNOCKOUT_CONFIG = [
  { key: 'R32', title: 'دور الـ 32', matches: 16 },
  { key: 'R16', title: 'دور الـ 16', matches: 8 },
  { key: 'QF',  title: 'ربع النهائي', matches: 4 },
  { key: 'SF',  title: 'نصف النهائي', matches: 2 },
  { key: 'F',   title: 'النهائي', matches: 1 }
];

let LOCAL_BRACKET_DATA = {};

// 1. توليد بنية شجرة فارغة مطورة تدعم الوقت والتاريخ وركلات الترجيح
function generateBlankBracket() {
  let temp = {};
  KNOCKOUT_CONFIG.forEach(round => {
    temp[round.key] = [];
    for (let i = 0; i < round.matches; i++) {
      temp[round.key].push({
        matchId: i,
        date: '',
        time: '',
        home: { name: '', code: '', score: '', penalties: '' },
        away: { name: '', code: '', score: '', penalties: '' },
        winner: ''
      });
    }
  });
  temp['CHAMPION'] = { name: '', code: '' };
  return temp;
}

// 2. الاستماع الحي والتحديث التلقائي من قاعدة البيانات
onValue(ref(db, 'wc2026_knockout'), (snapshot) => {
  const serverData = snapshot.val();
  LOCAL_BRACKET_DATA = serverData ? serverData : generateBlankBracket();
  renderAdminBracketGrid();
});

// 3. بناء واجهة شجرة الأدمن المطورة (تعديل أهداف، ركلات ترجيح، تاريخ ووقت)
function renderAdminBracketGrid() {
  const container = document.getElementById('admin-bracket-wrapper');
  if (!container) return;

  container.innerHTML = '';

  KNOCKOUT_CONFIG.forEach(round => {
    const col = document.createElement('div');
    col.className = 'round-col';
    col.innerHTML = `<div class="text-center text-xs font-bold text-gold bg-gold/5 border border-gold/10 py-2 rounded-lg mb-4">${round.title}</div>`;

    const matches = LOCAL_BRACKET_DATA[round.key] || [];
    matches.forEach((m, idx) => {
      const card = document.createElement('div');
      card.className = 'bg-darkCard border border-white/5 p-3 rounded-xl my-2 flex flex-col gap-2 shadow-xl';
      
      // نتحقق مما إذا كانت ركلات الترجيح مفعلة (إذا انتهت المباراة بالتعادل في الأهداف الأساسية)
      const isDraw = (m.home.score !== '' && m.away.score !== '' && parseInt(m.home.score) === parseInt(m.away.score));

      card.innerHTML = `
        <div class="text-[10px] text-white/30 flex justify-between items-center border-b border-white/5 pb-1">
          <span>مباراة ${idx + 1}</span>
          ${m.winner ? `<span class="text-gold font-bold"><i class="fas fa-check-circle"></i> المتأهل: ${m.winner}</span>` : ''}
        </div>
        
        <!-- حقول التاريخ والوقت للمباراة الإقصائية -->
        <div class="flex gap-1 items-center justify-between mb-1">
          <input type="date" value="${m.date || ''}" class="bg-surface border border-white/5 text-[10px] text-white/60 p-1 rounded w-1/2 focus:outline-none" data-round="${round.key}" data-idx="${idx}" data-field="date">
          <input type="time" value="${m.time || ''}" class="bg-surface border border-white/5 text-[10px] text-white/60 p-1 rounded w-1/2 focus:outline-none" data-round="${round.key}" data-idx="${idx}" data-field="time">
        </div>

        <!-- الفريق الأول (المستضيف) -->
        <div class="flex gap-1 items-center justify-between bg-darkSlot p-1.5 rounded-lg">
          <input type="text" value="${m.home.name || ''}" placeholder="الفريق الأول" class="admin-input-kno h-7 text-xs flex-1" data-round="${round.key}" data-idx="${idx}" data-team="home" data-subfield="name">
          
          <input type="number" value="${m.home.score ?? ''}" placeholder="أهداف" title="الأهداف الأساسية وال can الأضافية" class="w-10 h-7 bg-surface border border-white/10 text-center text-xs text-gold font-bold rounded" data-round="${round.key}" data-idx="${idx}" data-team="home" data-subfield="score">
          
          <input type="number" value="${m.home.penalties ?? ''}" placeholder="(ر.ت)" title="ركلات الترجيح" ${!isDraw ? 'disabled style="opacity:0.2;"' : ''} class="w-10 h-7 bg-surface border border-red-500/20 text-center text-xs text-red-400 font-bold rounded" data-round="${round.key}" data-idx="${idx}" data-team="home" data-subfield="penalties">
          
          <button class="text-[10px] bg-gold/10 text-gold px-1.5 py-1 rounded hover:bg-gold hover:text-black transition font-bold" title="تصعيد هذا الفريق" onclick="promoteKnockoutTeam('${round.key}', ${idx}, 'home')"><i class="fas fa-arrow-left"></i></button>
        </div>

        <!-- الفريق الثاني (الضيف) -->
        <div class="flex gap-1 items-center justify-between bg-darkSlot p-1.5 rounded-lg">
          <input type="text" value="${m.away.name || ''}" placeholder="الفريق الثاني" class="admin-input-kno h-7 text-xs flex-1" data-round="${round.key}" data-idx="${idx}" data-team="away" data-subfield="name">
          
          <input type="number" value="${m.away.score ?? ''}" placeholder="أهداف" title="الأهداف الأساسية والإضافية" class="w-10 h-7 bg-surface border border-white/10 text-center text-xs text-gold font-bold rounded" data-round="${round.key}" data-idx="${idx}" data-team="away" data-subfield="score">
          
          <input type="number" value="${m.away.penalties ?? ''}" placeholder="(ر.ت)" title="ركلات الترجيح" ${!isDraw ? 'disabled style="opacity:0.2;"' : ''} class="w-10 h-7 bg-surface border border-red-500/20 text-center text-xs text-red-400 font-bold rounded" data-round="${round.key}" data-idx="${idx}" data-team="away" data-subfield="penalties">
          
          <button class="text-[10px] bg-gold/10 text-gold px-1.5 py-1 rounded hover:bg-gold hover:text-black transition font-bold" title="تصعيد هذا الفريق" onclick="promoteKnockoutTeam('${round.key}', ${idx}, 'away')"><i class="fas fa-arrow-left"></i></button>
        </div>
      `;
      col.appendChild(card);
    });
    container.appendChild(col);
  });

  // عمود منصة التتويج للبطل النهائي
  const champCol = document.createElement('div');
  champCol.className = 'round-col justify-center';
  const champName = LOCAL_BRACKET_DATA['CHAMPION']?.name || '';
  champCol.innerHTML = `
    <div class="text-center text-xs font-bold text-black bg-gold py-2 rounded-lg mb-4 shadow-lg shadow-gold/20">🏆 بطل العالم</div>
    <div class="bg-darkCard border-2 border-gold/30 p-4 rounded-xl text-center shadow-2xl">
      <input type="text" id="kno-champion-input" value="${champName}" placeholder="اسم البطل النهائي" class="bg-surface border border-gold/30 text-gold font-black text-center text-sm py-2 px-3 rounded-lg w-full focus:outline-none focus:border-gold">
    </div>
  `;
  container.appendChild(champCol);

  // ربط أحداث المدخلات لحفظ القيم فوراً وبشكل مرن
  container.querySelectorAll('input').forEach(input => {
    input.oninput = (e) => {
      if (e.target.id === 'kno-champion-input') {
        LOCAL_BRACKET_DATA['CHAMPION'].name = e.target.value;
        LOCAL_BRACKET_DATA['CHAMPION'].code = findCountryCode(e.target.value);
        return;
      }

      const { round, idx, team, field, subfield } = e.target.dataset;
      const val = e.target.value;
      const matchIdx = parseInt(idx);

      // إذا كان الإدخال يخص الوقت أو التاريخ (مباشرة على مستوى المباراة)
      if (field) {
        LOCAL_BRACKET_DATA[round][matchIdx][field] = val;
        return;
      }

      // إذا كان الإدخال يخص أحد الفريقين (الأهداف، ركلات الترجيح، أو الاسم)
      if (subfield) {
        if (subfield === 'score' || subfield === 'penalties') {
          LOCAL_BRACKET_DATA[round][matchIdx][team][subfield] = (val === '' ? '' : parseInt(val));
          
          // تفعيل أو تعطيل حقول ركلات الترجيح بشكل مرئي فوري قبل عملية الحفظ النهائي
          const currentMatch = LOCAL_BRACKET_DATA[round][matchIdx];
          const isNowDraw = (currentMatch.home.score !== '' && currentMatch.away.score !== '' && parseInt(currentMatch.home.score) === parseInt(currentMatch.away.score));
          const cardEl = e.target.closest('.bg-darkCard');
          const penaltyInputs = cardEl.querySelectorAll('input[data-subfield="penalties"]');
          
          penaltyInputs.forEach(pin => {
            if (isNowDraw) {
              pin.removeAttribute('disabled');
              pin.style.opacity = '1';
            } else {
              pin.setAttribute('disabled', 'true');
              pin.style.opacity = '0.2';
              pin.value = ''; // تصفير ركلات الترجيح إذا انتفت الحاجة لها
              const pTeam = pin.dataset.team;
              LOCAL_BRACKET_DATA[round][matchIdx][pTeam].penalties = '';
            }
          });
        } else {
          LOCAL_BRACKET_DATA[round][matchIdx][team][subfield] = val;
          if (subfield === 'name') {
            LOCAL_BRACKET_DATA[round][matchIdx][team].code = findCountryCode(val);
          }
        }
      }
    };
  });
}

// 4. دالة التصعيد التلقائي الذكي (ترفع البيانات مع كافة تفاصيل الأهداف وركلات الترجيح)
window.promoteKnockoutTeam = function(roundKey, matchIndex, side) {
  const match = LOCAL_BRACKET_DATA[roundKey][matchIndex];
  const winnerTeamName = match[side].name;
  const winnerTeamCode = match[side].code || findCountryCode(winnerTeamName);
  
  if (!winnerTeamName) {
    alert("من فضلك أدخل اسم الدولة أولاً لتصعيدها!");
    return;
  }

  match.winner = winnerTeamName;

  // الانتقال للدور التالي بناءً على عمق التصفية
  let nextRoundKey = '';
  let nextMatchIdx = Math.floor(matchIndex / 2);
  let nextSide = (matchIndex % 2 === 0) ? 'home' : 'away';

  if (roundKey === 'R32') nextRoundKey = 'R16';
  else if (roundKey === 'R16') nextRoundKey = 'QF';
  else if (roundKey === 'QF') nextRoundKey = 'SF';
  else if (roundKey === 'SF') nextRoundKey = 'F';
  else if (roundKey === 'F') {
    LOCAL_BRACKET_DATA['CHAMPION'].name = winnerTeamName;
    LOCAL_BRACKET_DATA['CHAMPION'].code = winnerTeamCode;
    set(ref(db, 'wc2026_knockout'), LOCAL_BRACKET_DATA);
    return;
  }

  // نقل الاسم والشعار فورا إلى الخانة المحددة في المباراة القادمة
  LOCAL_BRACKET_DATA[nextRoundKey][nextMatchIdx][nextSide].name = winnerTeamName;
  LOCAL_BRACKET_DATA[nextRoundKey][nextMatchIdx][nextSide].code = winnerTeamCode;
  
  // الحفظ السحابي الفوري للمزامنة الحية
  set(ref(db, 'wc2026_knockout'), LOCAL_BRACKET_DATA);
};

// 5. رفع وحفظ شجرة التعديلات بالكامل يدوياً إلى سيرفر Firebase مع حماية الأعلام
document.getElementById('save-bracket-btn').onclick = () => {
  KNOCKOUT_CONFIG.forEach(round => {
    LOCAL_BRACKET_DATA[round.key].forEach(m => {
      if(m.home.name && !m.home.code) m.home.code = findCountryCode(m.home.name);
      if(m.away.name && !m.away.code) m.away.code = findCountryCode(m.away.name);
    });
  });
  if(LOCAL_BRACKET_DATA['CHAMPION'].name) {
    LOCAL_BRACKET_DATA['CHAMPION'].code = findCountryCode(LOCAL_BRACKET_DATA['CHAMPION'].name);
  }

  set(ref(db, 'wc2026_knockout'), LOCAL_BRACKET_DATA)
    .then(() => alert("تم حفظ وتحديث الشجرة الإقصائية (بما في ذلك التوقيت، الأهداف، وركلات الترجيح) سحابياً بنجاح!"))
    .catch(err => console.error("Error saving bracket:", err));
};

// 6. إعادة تهيئة الشجرة وجعلها فارغة تماماً
document.getElementById('reset-bracket-btn').onclick = () => {
  if (confirm("هل أنت متأكد من مسح كافة بيانات شجرة التصفيات الحالية بالكامل؟")) {
    LOCAL_BRACKET_DATA = generateBlankBracket();
    set(ref(db, 'wc2026_knockout'), LOCAL_BRACKET_DATA)
      .then(() => alert("تمت إعادة تهيئة الشجرة سحابياً بنجاح."));
  }
};

