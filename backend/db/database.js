import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, increment, Timestamp, writeBatch, getCountFromServer } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

/* ═══════════════════════════════════════
   🔥 FIREBASE CONFIGURATION
   แทนที่ค่าด้านล่างด้วย config จาก Firebase Console
   Project Settings → Your apps → SDK setup
═══════════════════════════════════════ */
const firebaseConfig = {
  apiKey:            "AIzaSyAL4JgojlEXf-ONqGU286j242zsf5zgqPs",
  authDomain:        "sddi-2025.firebaseapp.com",
  projectId:         "sddi-2025",
  storageBucket:     "sddi-2025.firebasestorage.app",
  messagingSenderId: "731403415236",
  appId:             "1:731403415236:web:cc4f9448c97b52ad6ee391"
};

/* ─── DETECT UNCONFIGURED ─── */
const isConfigured = !firebaseConfig.apiKey.includes('YOUR_');

/* ─── INIT FIREBASE ─── */
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const storage = getStorage(app);

/* ═══════════════════════════════════════
   APP STATE
═══════════════════════════════════════ */
window.APP = { user: null, profile: null, unsubscribers: [] };
const COLLECTIONS = { users:'users', requests:'repair_requests', materials:'materials', notifications:'notifications', evaluations:'evaluations', audit:'audit_logs' };

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
function fmtDate(ts, short=false) {
  if (!ts) return '–';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (short) return d.toLocaleDateString('th-TH', {day:'2-digit',month:'short',year:'2-digit'});
  return d.toLocaleDateString('th-TH', {day:'2-digit',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function timeAgo(ts) {
  if (!ts) return '–';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const m = Math.floor((Date.now()-d)/60000);
  if (m<1) return 'เมื่อกี้'; if (m<60) return `${m} นาทีที่แล้ว`;
  const h=Math.floor(m/60); if (h<24) return `${h} ชม.ที่แล้ว`;
  return `${Math.floor(h/24)} วันที่แล้ว`;
}
function genTID() { return `TRK-${new Date().getFullYear()+543}-${String(Math.floor(Math.random()*90000)+10000).slice(0,4)}`; }
function slaDate(urgency) { const d=new Date(); const map={ฉุกเฉิน:0,เร่งด่วน:1,ปกติ:3,ไม่เร่งด่วน:7}; d.setDate(d.getDate()+(map[urgency]??3)); return Timestamp.fromDate(d); }
function sBadge(s) { const m={'รอดำเนินการ':['b-amber','⏳'],'กำลังดำเนินการ':['b-blue','⚙️'],'รอตรวจสอบ':['b-violet','🔍'],'เสร็จสมบูรณ์':['b-green','✅'],'ต้องส่งซ่อมภายนอก':['b-orange','🔀']}; const[c,i]=m[s]||['b-gray','?']; return`<span class="badge ${c}">${i} ${s}</span>`; }
function uBadge(u) { const m={'ฉุกเฉิน':'b-red','เร่งด่วน':'b-amber','ปกติ':'b-green','ไม่เร่งด่วน':'b-gray'}; return`<span class="badge ${m[u]||'b-gray'}">${u}</span>`; }
function roleBadge(r) { const m={admin:['b-red','🛡️','แอดมิน'],manager:['b-violet','📋','ผู้จัดการ'],technician:['b-blue','🔧','ช่าง'],user:['b-gray','👤','ผู้ใช้']}; const[c,i,l]=m[r]||['b-gray','?',r]; return`<span class="badge ${c}">${i} ${l}</span>`; }
function catIcon(c) { return{'ไฟฟ้า':'⚡','ประปา':'💧','โครงสร้าง':'🏗️','อุปกรณ์อิเล็กทรอนิกส์':'💻','เครื่องปรับอากาศ':'❄️'}[c]||'🔧'; }
function roleTH(r) { return{admin:'ผู้ดูแลระบบ',manager:'ผู้จัดการ',technician:'ช่างซ่อม',user:'ผู้ใช้งาน'}[r]||r; }
function loadingState(msg='กำลังโหลด...') { return`<div class="loading-state"><div class="spinner"></div><span class="text-muted">${msg}</span></div>`; }
function emptyState(i,t) { return`<div class="empty"><div class="ei">${i}</div><div>${t}</div></div>`; }

/* ═══════════════════════════════════════
   TOAST & MODAL
═══════════════════════════════════════ */
window.toast = function(msg, type='ok') {
  let c = document.getElementById('toasts');
  if (!c) { c=document.createElement('div'); c.id='toasts'; document.body.appendChild(c); }
  const el = document.createElement('div');
  const icons = {ok:'✅',err:'❌',warn:'⚠️',fire:'🔥',info:'ℹ️'};
  el.className = `toast t-${type}`;
  el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><div>${msg}</div>`;
  c.appendChild(el); setTimeout(()=>el.remove(), 4000);
};
window.openModal = function(html) {
  closeModal();
  const bd = document.createElement('div'); bd.className='backdrop'; bd.id='modal-bd';
  bd.innerHTML = html;
  bd.addEventListener('click', e=>{ if(e.target===bd) closeModal(); });
  document.body.appendChild(bd);
  document.addEventListener('keydown', escH);
};
window.closeModal = function() { document.getElementById('modal-bd')?.remove(); document.removeEventListener('keydown', escH); };
function escH(e) { if(e.key==='Escape') closeModal(); }

/* ═══════════════════════════════════════
   SHOW SETUP PAGE (when not configured)
═══════════════════════════════════════ */
function showSetupPage() {
  document.getElementById('root').innerHTML = `
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--ink)">
    <div style="max-width:680px;width:100%">
      <div style="text-align:center;margin-bottom:2rem">
        <div style="font-size:3rem;margin-bottom:1rem">🔥</div>
        <h1 style="font-size:1.5rem;font-weight:800;margin-bottom:.5rem">ตั้งค่า Firebase</h1>
        <p style="color:var(--chalk2);font-size:.88rem">กรุณาตั้งค่า Firebase Config ก่อนใช้งานระบบ</p>
      </div>
      <div class="config-setup">
        <div class="alert al-fire mb">🔥 พบ placeholder ใน <code>firebaseConfig</code> — กรุณาใส่ค่าจริงจาก Firebase Console</div>
        <div class="config-steps">
          <div class="config-step"><div class="config-step-body">
            <div class="config-step-title">สร้าง Firebase Project</div>
            <div class="config-step-desc">เปิด <a href="https://console.firebase.google.com" target="_blank" style="color:var(--spark)">console.firebase.google.com</a> → สร้าง Project ใหม่</div>
          </div></div>
          <div class="config-step"><div class="config-step-body">
            <div class="config-step-title">เปิด Firestore Database</div>
            <div class="config-step-desc">Build → Firestore Database → Create database → เลือก <code>test mode</code> (ทดสอบ) หรือตั้ง Security Rules เอง</div>
          </div></div>
          <div class="config-step"><div class="config-step-body">
            <div class="config-step-title">เปิด Authentication</div>
            <div class="config-step-desc">Build → Authentication → Get started → เปิด <code>Email/Password</code> provider</div>
          </div></div>
          <div class="config-step"><div class="config-step-body">
            <div class="config-step-title">เปิด Storage (อัปโหลดรูปภาพ)</div>
            <div class="config-step-desc">Build → Storage → Get started → เลือก region ใกล้บ้าน เช่น <code>asia-southeast1</code></div>
          </div></div>
          <div class="config-step"><div class="config-step-body">
            <div class="config-step-title">ตั้ง Firestore Security Rules</div>
            <div class="config-step-desc">สำหรับ production ให้ตั้ง rules ให้ปลอดภัย:</div>
<pre>rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
    match /repair_requests/{id} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
    }
    match /materials/{id} {
      allow read: if request.auth != null;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin','manager','technician'];
    }
    match /notifications/{id} {
      allow read, write: if request.auth.uid == resource.data.userId;
    }
    match /evaluations/{id} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
  }
}</pre>
          </div></div>
          <div class="config-step"><div class="config-step-body">
            <div class="config-step-title">คัดลอก Config และวางในไฟล์</div>
            <div class="config-step-desc">Project Settings → Your apps → Web app → SDK setup and configuration → Copy config</div>
<pre>const firebaseConfig = {
  apiKey: "AIzaSyAL4JgojlEXf-ONqGU286j242zsf5zgqPs",
  authDomain: "sddi-2025.firebaseapp.com",
  projectId: "sddi-2025",
  storageBucket: "sddi-2025.firebasestorage.app",
  messagingSenderId: "731403415236",
  appId: "1:731403415236:web:cc4f9448c97b52ad6ee391"
};</pre>
            <div class="config-step-desc">แล้วแทนที่ <code>firebaseConfig</code> ในไฟล์ HTML นี้ (บรรทัดที่มี <code>YOUR_API_KEY</code>)</div>
          </div></div>
          <div class="config-step"><div class="config-step-body">
            <div class="config-step-title">Seed ข้อมูลเริ่มต้น (ทำครั้งแรกครั้งเดียว)</div>
            <div class="config-step-desc">หลัง config แล้ว คลิกปุ่มด้านล่างเพื่อสร้าง admin account และข้อมูลทดสอบ</div>
            <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="document.getElementById('seed-section').classList.toggle('hidden')">▼ ดูวิธี Seed ข้อมูล</button>
            <div id="seed-section" class="hidden" style="margin-top:.75rem;padding:.875rem;background:var(--ink3);border-radius:var(--r);border:1px solid var(--wire)">
              <div style="font-size:.75rem;color:var(--chalk2);line-height:1.7">หลังตั้งค่า config แล้ว ให้สมัครบัญชีแรกผ่านหน้า Register จากนั้น:<br>1. เข้า Firestore Console → เปิด collection <code>users</code><br>2. แก้ไข doc ของ user แรก เพิ่ม field: <code>role: "admin"</code><br>3. Login กลับมา จะเห็น Dashboard และสิทธิ์เต็ม</div>
            </div>
          </div></div>
        </div>
        <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--wire);text-align:center">
          <button class="btn btn-primary" onclick="window.location.reload()">🔄 รีโหลดหลังตั้งค่าแล้ว</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════
   AUTH FUNCTIONS
═══════════════════════════════════════ */
async function doLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  const btn   = document.getElementById('login-btn');
  const alertEl = document.getElementById('auth-alert');
  if (!email || !pass) { alertEl.innerHTML=`<div class="alert al-warn">⚠️ กรุณากรอกอีเมลและรหัสผ่าน</div>`; return; }
  btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    toast(`ยินดีต้อนรับ 👋`, 'ok');
  } catch(e) {
    btn.disabled = false; btn.innerHTML = '🔑 เข้าสู่ระบบ';
    const msgs = {'auth/user-not-found':'ไม่พบบัญชีนี้','auth/wrong-password':'รหัสผ่านไม่ถูกต้อง','auth/invalid-credential':'อีเมลหรือรหัสผ่านไม่ถูกต้อง','auth/too-many-requests':'ลองใหม่ภายหลัง (คำขอมากเกินไป)'};
    alertEl.innerHTML = `<div class="alert al-danger">❌ ${msgs[e.code]||e.message}</div>`;
  }
}

async function doRegister() {
  const name  = document.getElementById('r-name').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const pass  = document.getElementById('r-pass').value;
  const sid   = document.getElementById('r-sid').value.trim();
  const dept  = document.getElementById('r-dept').value.trim();
  const alertEl = document.getElementById('auth-alert');
  if (!name || !email || !pass) { alertEl.innerHTML=`<div class="alert al-warn">⚠️ กรุณากรอกข้อมูลที่จำเป็น</div>`; return; }
  if (pass.length < 6) { alertEl.innerHTML=`<div class="alert al-warn">⚠️ รหัสผ่านต้องมีอย่างน้อย 6 ตัว</div>`; return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, COLLECTIONS.users, cred.user.uid), {
      uid: cred.user.uid, name, email: email.toLowerCase(), role: 'user',
      student_id: sid||'', department: dept||'', phone: '',
      is_active: true, created_at: serverTimestamp(), last_login: serverTimestamp()
    });
    toast('สมัครสมาชิกสำเร็จ! 🎉');
  } catch(e) {
    const msgs = {'auth/email-already-in-use':'อีเมลนี้ถูกใช้แล้ว','auth/weak-password':'รหัสผ่านอ่อนเกินไป'};
    alertEl.innerHTML = `<div class="alert al-danger">❌ ${msgs[e.code]||e.message}</div>`;
  }
}

async function doLogout() {
  APP.unsubscribers.forEach(u => u());
  APP.unsubscribers = [];
  await signOut(auth);
}

/* ═══════════════════════════════════════
   SHOW AUTH PAGE
═══════════════════════════════════════ */
function showAuth() {
  document.getElementById('root').innerHTML = `
  <div class="auth-shell">
    <div class="auth-left">
      <div class="auth-grid"></div>
      <div class="auth-left-content">
        <div class="auth-icon">🔧</div>
        <h1 class="auth-h1">ระบบแจ้งซ่อม</h1>
        <p class="auth-sub">Maintenance Reporting System<br>พลังงานจาก Firebase Realtime Database</p>
        <div class="auth-feat">
          <div class="af"><div class="af-i">🔥</div> Firebase Firestore Realtime Sync</div>
          <div class="af"><div class="af-i">🔒</div> Firebase Authentication ปลอดภัย</div>
          <div class="af"><div class="af-i">📸</div> Firebase Storage อัปโหลดรูปภาพ</div>
          <div class="af"><div class="af-i">📊</div> Dashboard อัปเดตอัตโนมัติ</div>
        </div>
      </div>
    </div>
    <div class="auth-right">
      <div class="auth-card">
        <div class="auth-logo"><span class="ico">🔧</span><div><div class="nm">ระบบแจ้งซ่อม</div><span class="sub">🔥 Powered by Firebase</span></div></div>
        <div class="auth-tabs">
          <div class="atab on" id="atab-login" onclick="switchAuthTab('login')">เข้าสู่ระบบ</div>
          <div class="atab" id="atab-register" onclick="switchAuthTab('register')">สมัครสมาชิก</div>
        </div>
        <div id="auth-area"></div>
      </div>
    </div>
  </div>`;
  renderLogin();
}

window.switchAuthTab = function(t) {
  document.querySelectorAll('.atab').forEach(el=>el.classList.toggle('on', el.id===`atab-${t}`));
  if (t==='login') renderLogin(); else renderRegister();
};
function renderLogin() {
  document.getElementById('auth-area').innerHTML = `
    <div id="auth-alert"></div>
    <div class="fg"><label class="fl">อีเมล</label><input class="fc" id="l-email" type="email" placeholder="your@email.com"></div>
    <div class="fg"><label class="fl">รหัสผ่าน</label><input class="fc" id="l-pass" type="password" placeholder="รหัสผ่าน" onkeydown="if(event.key==='Enter')doLogin()"></div>
    <button class="btn btn-primary btn-block btn-lg" id="login-btn" onclick="doLogin()">🔑 เข้าสู่ระบบ</button>`;
}
function renderRegister() {
  document.getElementById('auth-area').innerHTML = `
    <div id="auth-alert"></div>
    <div class="frow"><div class="fg"><label class="fl">ชื่อ-นามสกุล <span class="req">*</span></label><input class="fc" id="r-name" placeholder="ชื่อ นามสกุล"></div><div class="fg"><label class="fl">รหัสนักศึกษา</label><input class="fc" id="r-sid" placeholder="68030xxx"></div></div>
    <div class="fg"><label class="fl">อีเมล <span class="req">*</span></label><input class="fc" id="r-email" type="email" placeholder="your@email.com"></div>
    <div class="frow"><div class="fg"><label class="fl">รหัสผ่าน <span class="req">*</span></label><input class="fc" id="r-pass" type="password" placeholder="≥ 6 ตัวอักษร"></div><div class="fg"><label class="fl">แผนก/สาขา</label><input class="fc" id="r-dept" placeholder="คอมพิวเตอร์"></div></div>
    <button class="btn btn-primary btn-block btn-lg" onclick="doRegister()">📝 สมัครสมาชิก</button>`;
}

/* ═══════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════ */
window.navigate = function(page, params={}) {
  APP.page = page; APP.params = params;
  APP.unsubscribers.forEach(u => u()); APP.unsubscribers = [];
  window.scrollTo(0,0);
  document.querySelectorAll('.sb-link').forEach(el=>el.classList.toggle('on', el.dataset.page===page));
  const titles = {dashboard:'📊 ภาพรวมระบบ','requests-list':'🔧 รายการแจ้งซ่อม','request-new':'➕ แจ้งซ่อมใหม่','request-detail':'📋 รายละเอียดงานซ่อม',materials:'📦 คลังวัสดุ',users:'👥 จัดการผู้ใช้',track:'🔍 ติดตามงาน',profile:'👤 โปรไฟล์'};
  document.getElementById('page-title').textContent = titles[page]||'ระบบแจ้งซ่อม';
  const c = document.getElementById('page-content'); c.innerHTML = loadingState();
  pageDispatch(page, params);
};

/* ═══════════════════════════════════════
   BUILD APP SHELL
═══════════════════════════════════════ */
function buildShell(profile) {
  APP.profile = profile;
  const role = profile.role;
  const nav = [
    {p:'dashboard',i:'📊',l:'ภาพรวม (Dashboard)',r:['manager','admin']},
    {p:'requests-list',i:'🔧',l:'รายการแจ้งซ่อม',r:['user','technician','manager','admin']},
    {p:'request-new',i:'➕',l:'แจ้งซ่อมใหม่',r:['user','manager','admin']},
    {sec:'การจัดการ',r:['technician','manager','admin']},
    {p:'materials',i:'📦',l:'คลังวัสดุ',r:['technician','manager','admin']},
    {sec:'ทั่วไป',r:['user','technician','manager','admin']},
    {p:'track',i:'🔍',l:'ติดตามงาน',r:['user','technician','manager','admin']},
    {p:'users',i:'👥',l:'จัดการผู้ใช้',r:['admin','manager']},
    {p:'profile',i:'👤',l:'โปรไฟล์ของฉัน',r:['user','technician','manager','admin']},
  ];
  document.getElementById('root').innerHTML = `
  <div class="shell" id="shell">
    <nav class="sidebar" id="sidebar">
      <div class="sb-brand">
        <div class="sb-logo">🔧</div>
        <div class="sb-name">ระบบแจ้งซ่อม<small>Maintenance System</small></div>
      </div>
      <div class="sb-firebase-badge">🔥 Firebase Connected</div>
      <div class="sb-nav" id="sb-nav">
        ${nav.filter(n=>n.r.includes(role)).map(n=>n.sec ? `<div class="sb-sec">${n.sec}</div>` : `<div class="sb-link" data-page="${n.p}" onclick="navigate('${n.p}')"><span class="ico">${n.i}</span><span>${n.l}</span></div>`).join('')}
      </div>
      <div class="sb-foot">
        <div class="sb-av">${profile.name?.[0]||'?'}</div>
        <div><div class="sb-uname">${profile.name}</div><div class="sb-urole">${roleTH(role)}</div></div>
        <button class="sb-out" onclick="doLogout()" title="ออกจากระบบ">↩</button>
      </div>
    </nav>
    <div class="main">
      <header class="topbar">
        <div class="tb-title" id="page-title">ระบบแจ้งซ่อม</div>
        <div class="flex ic gap1">
          <div class="rt-dot" title="Realtime sync active"></div>
          <span class="text-xs" style="color:var(--chalk3)">Live</span>
          <div class="icon-btn" onclick="toggleNotif()" id="notif-btn" title="การแจ้งเตือน">🔔</div>
          <div style="font-size:.75rem;color:var(--chalk2);padding:0 .375rem">สวัสดี, <strong style="color:var(--chalk)">${profile.name?.split(' ')[0]}</strong></div>
        </div>
      </header>
      <main class="page" id="page-content"></main>
    </div>
  </div>
  <div id="toasts"></div>`;

  listenNotifications();
  const defPage = role==='user'?'requests-list':role==='technician'?'requests-list':'dashboard';
  navigate(defPage);
}

/* ═══════════════════════════════════════
   REALTIME NOTIFICATIONS
═══════════════════════════════════════ */
function listenNotifications() {
  const q = query(collection(db, COLLECTIONS.notifications), where('userId','==',APP.user.uid), where('is_read','==',false), orderBy('created_at','desc'));
  const unsub = onSnapshot(q, snap => {
    const count = snap.size;
    const btn = document.getElementById('notif-btn');
    if (!btn) return;
    const existing = btn.querySelector('.badge-dot');
    if (count > 0 && !existing) { const d=document.createElement('div'); d.className='badge-dot'; btn.appendChild(d); }
    else if (count === 0 && existing) existing.remove();
  });
  APP.unsubscribers.push(unsub);
}

window.toggleNotif = async function() {
  const ex = document.getElementById('notif-panel');
  if (ex) { ex.remove(); return; }
  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.style.cssText = 'position:fixed;top:56px;right:0;width:340px;max-height:calc(100vh - 56px);background:var(--ink2);border-left:1px solid var(--wire);overflow-y:auto;z-index:150;box-shadow:var(--sh2);animation:slideInR .2s ease';
  panel.innerHTML = `<div style="padding:.875rem 1rem;border-bottom:1px solid var(--wire);display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:.83rem">🔔 การแจ้งเตือน</span><button class="btn btn-ghost btn-sm" onclick="markAllRead()">อ่านทั้งหมด</button></div><div id="notif-list">${loadingState()}</div>`;
  document.getElementById('shell').appendChild(panel);
  const q = query(collection(db, COLLECTIONS.notifications), where('userId','==',APP.user.uid), orderBy('created_at','desc'), limit(30));
  const snap = await getDocs(q);
  document.getElementById('notif-list').innerHTML = snap.empty ? emptyState('🔔','ไม่มีการแจ้งเตือน') :
    snap.docs.map(d=>{ const n=d.data(); return `<div style="padding:.875rem 1rem;border-bottom:1px solid var(--wire);cursor:pointer;display:flex;gap:.625rem;background:${!n.is_read?'rgba(0,212,255,.05)':'transparent'}" onclick="clickNotif('${d.id}','${n.ref_request_id||''}')">
      ${!n.is_read?'<div style="width:7px;height:7px;border-radius:50%;background:var(--spark);margin-top:5px;flex-shrink:0"></div>':'<div style="width:7px"></div>'}
      <div><div style="font-size:.78rem;font-weight:700;margin-bottom:1px">${n.title}</div><div style="font-size:.73rem;color:var(--chalk2);line-height:1.4">${n.message}</div><div style="font-size:.65rem;color:var(--chalk3);margin-top:3px">${timeAgo(n.created_at)}</div></div>
    </div>`; }).join('');
};

window.markAllRead = async function() {
  const q = query(collection(db, COLLECTIONS.notifications), where('userId','==',APP.user.uid), where('is_read','==',false));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, {is_read:true}));
  await batch.commit();
  document.getElementById('notif-panel')?.remove();
  toast('อ่านทั้งหมดแล้ว');
};

window.clickNotif = async function(id, reqId) {
  await updateDoc(doc(db, COLLECTIONS.notifications, id), {is_read:true});
  document.getElementById('notif-panel')?.remove();
  if (reqId) navigate('request-detail', {id:reqId});
};

async function sendNotif(userId, title, message, type='info', refId='') {
  await addDoc(collection(db, COLLECTIONS.notifications), { userId, title, message, type, is_read:false, ref_request_id:refId, created_at:serverTimestamp() });
}

/* ═══════════════════════════════════════
   PAGE DISPATCH
═══════════════════════════════════════ */
async function pageDispatch(page, params) {
  try {
    switch(page) {
      case 'dashboard':       await pageDashboard(); break;
      case 'requests-list':  await pageRequestsList(); break;
      case 'request-new':    await pageNewRequest(); break;
      case 'request-detail': await pageRequestDetail(params.id); break;
      case 'materials':      await pageMaterials(); break;
      case 'users':          await pageUsers(); break;
      case 'track':          pageTrack(); break;
      case 'profile':        await pageProfile(); break;
      default: document.getElementById('page-content').innerHTML = emptyState('🚧','กำลังพัฒนา');
    }
  } catch(e) {
    console.error(e);
    document.getElementById('page-content').innerHTML = `<div class="alert al-danger">❌ ${e.message}</div>`;
  }
}

/* ═══════════════════════════════════════
   PAGE: DASHBOARD (Realtime)
═══════════════════════════════════════ */
async function pageDashboard() {
  const c = document.getElementById('page-content');
  const colRef = collection(db, COLLECTIONS.requests);
  const [snap, matSnap] = await Promise.all([getDocs(colRef), getDocs(collection(db, COLLECTIONS.materials))]);
  const reqs = snap.docs.map(d=>({id:d.id,...d.data()}));
  const mats = matSnap.docs.map(d=>d.data());

  const counts = { total:reqs.length, pending:0, inprog:0, review:0, done:0, overdue:0, emerg:0 };
  reqs.forEach(r => {
    if (r.status==='รอดำเนินการ') counts.pending++;
    if (r.status==='กำลังดำเนินการ') counts.inprog++;
    if (r.status==='รอตรวจสอบ') counts.review++;
    if (r.status==='เสร็จสมบูรณ์') counts.done++;
    const sla = r.sla_deadline?.toDate?.();
    if (sla && sla < new Date() && r.status!=='เสร็จสมบูรณ์') counts.overdue++;
    if (r.urgency==='ฉุกเฉิน' && r.status!=='เสร็จสมบูรณ์') counts.emerg++;
  });
  const catMap = {}; reqs.forEach(r=>{ catMap[r.category]=(catMap[r.category]||0)+1; });
  const catArr = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  const maxCat = Math.max(...catArr.map(x=>x[1]),1);
  const lowMats = mats.filter(m=>m.quantity<=m.reorder_point&&m.reorder_point>0).length;

  // Setup realtime listener for request count badge
  const unsub = onSnapshot(query(colRef, where('status','in',['รอดำเนินการ','ฉุกเฉิน'])), snap2 => {
    const el = document.getElementById('live-pending');
    if (el) el.textContent = snap2.size;
  });
  APP.unsubscribers.push(unsub);

  c.innerHTML = `
  <div class="flex ic gap1 mb" style="color:var(--chalk3);font-size:.72rem"><div class="rt-dot"></div> ข้อมูลอัปเดตอัตโนมัติผ่าน Firestore Realtime</div>
  <div class="stats-grid">
    ${[['📋',counts.total,'ทั้งหมด','c-blue'],['⏳',`<span id="live-pending">${counts.pending}</span>`,'รอ (realtime)','c-amber'],['⚙️',counts.inprog,'กำลังดำเนินการ','c-blue'],['🔍',counts.review,'รอตรวจสอบ','c-violet'],['✅',counts.done,'เสร็จสมบูรณ์','c-green'],['🚨',counts.overdue,'เกิน SLA','c-red'],['📦',lowMats,'วัสดุใกล้หมด','c-orange']].map(([ico,val,lbl,cls])=>`
    <div class="scard ${cls}"><div class="scard-row"><div class="scard-ico">${ico}</div></div><div class="scard-val">${val}</div><div class="scard-lbl">${lbl}</div><div class="scard-bar"></div></div>`).join('')}
  </div>

  <div class="g2 mb">
    <div class="card">
      <div class="card-h"><div class="card-t">🏷️ ประเภทงานซ่อม</div></div>
      <div class="card-b">
        <div style="display:flex;flex-direction:column;gap:.75rem">
          ${catArr.map(([cat,cnt])=>`
          <div style="display:grid;grid-template-columns:130px 1fr 40px;align-items:center;gap:.75rem">
            <div style="font-size:.75rem;color:var(--chalk2);text-align:right">${catIcon(cat)} ${cat}</div>
            <div style="background:var(--ink3);border-radius:4px;height:7px"><div style="width:${Math.round(cnt/maxCat*100)}%;background:var(--spark);height:100%;border-radius:4px;transition:width .6s"></div></div>
            <div style="font-size:.72rem;color:var(--chalk2);font-family:var(--mono);text-align:right">${cnt}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><div class="card-t">📊 สถิติสรุป</div></div>
      <div class="card-b">
        ${[['🎯','อัตราสำเร็จ', counts.total?Math.round(counts.done/counts.total*100)+'%':'0%','var(--green)'],['⚡','ฉุกเฉินที่รอ',counts.emerg+' งาน','var(--red)'],['⏰','เกิน SLA',counts.overdue+' งาน',counts.overdue>0?'var(--red)':'var(--green)']].map(([ico,l,v,color])=>`
        <div class="flex ic jb" style="padding:.5rem .75rem;background:var(--ink3);border-radius:var(--r);border:1px solid var(--wire);margin-bottom:.5rem">
          <div class="flex ic gap1"><span style="font-size:.9rem">${ico}</span><span style="font-size:.82rem;color:var(--chalk2)">${l}</span></div>
          <span style="font-weight:700;color:${color};font-family:var(--mono)">${v}</span>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-h"><div class="card-t">🔧 งานล่าสุด <span class="badge b-blue" style="margin-left:.5rem">Firestore</span></div><button class="btn btn-ghost btn-sm" onclick="navigate('requests-list')">ดูทั้งหมด →</button></div>
    <div class="tw"><table>
      <thead><tr><th>Tracking ID</th><th>ประเภท</th><th>ความเร่งด่วน</th><th>สถานะ</th><th>วันที่แจ้ง</th></tr></thead>
      <tbody>${reqs.slice(0,8).map(r=>`<tr>
        <td><span class="tid">${r.tracking_id}</span></td>
        <td>${catIcon(r.category)} <span class="text-sm">${r.category}</span></td>
        <td>${uBadge(r.urgency)}</td>
        <td>${sBadge(r.status)}</td>
        <td class="text-xs">${fmtDate(r.created_at,true)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

/* ═══════════════════════════════════════
   PAGE: REQUESTS LIST (Realtime)
═══════════════════════════════════════ */
let _reqFilters = {};
async function pageRequestsList(flt={}) {
  _reqFilters = flt;
  const c = document.getElementById('page-content');
  const role = APP.profile?.role;
  const uid  = APP.user?.uid;
  const canCreate = ['user','manager','admin'].includes(role);
  const canAssign = ['manager','admin'].includes(role);

  let q = collection(db, COLLECTIONS.requests);
  let constraints = [orderBy('created_at','desc')];
  if (role==='user') constraints.push(where('requester_id','==',uid));
  if (role==='technician') constraints.push(where('assigned_tech_id','==',uid));
  if (flt.status) constraints.push(where('status','==',flt.status));
  if (flt.urgency) constraints.push(where('urgency','==',flt.urgency));

  // Realtime listener
  const unsub = onSnapshot(query(q,...constraints), snap => {
    let items = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (flt.search) { const s=flt.search.toLowerCase(); items=items.filter(r=>r.tracking_id?.toLowerCase().includes(s)||r.description?.toLowerCase().includes(s)); }

    const tbody = document.getElementById('req-tbody');
    if (!tbody) return;

    const urgOrd = {'ฉุกเฉิน':1,'เร่งด่วน':2,'ปกติ':3,'ไม่เร่งด่วน':4};
    items.sort((a,b)=>(urgOrd[a.urgency]||5)-(urgOrd[b.urgency]||5));

    tbody.innerHTML = items.length ? items.map(r=>{
      const overdue = r.sla_deadline?.toDate?.() < new Date() && r.status!=='เสร็จสมบูรณ์';
      return`<tr${overdue?' style="background:rgba(255,71,87,.04)"':''}>
        <td><span class="tid">${r.tracking_id}</span>${overdue?'<br><span class="badge b-red" style="font-size:.6rem;margin-top:2px">⏰ เกิน SLA</span>':''}</td>
        <td>${catIcon(r.category)} <span class="text-sm">${r.category}</span></td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.description||''}</td>
        <td class="text-sm">${r.location||'–'}</td>
        <td>${uBadge(r.urgency)}</td>
        <td>${sBadge(r.status)}</td>
        ${canAssign?`<td class="text-sm">${r.tech_name||'<span class="text-muted">–</span>'}</td>`:''}
        <td class="text-xs">${fmtDate(r.created_at,true)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" onclick="navigate('request-detail',{id:'${r.id}'})">ดู →</button>
          ${canAssign&&r.status==='รอดำเนินการ'?`<button class="btn btn-primary btn-sm" style="display:block;margin-top:2px" onclick="openAssignModal('${r.id}','${r.tracking_id}')">มอบหมาย</button>`:''}
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="9">${emptyState('📭','ไม่มีรายการ')}</td></tr>`;
    document.getElementById('req-count').textContent = `${items.length} รายการ (Realtime)`;
  }, err => { if(err.code==='failed-precondition') toast('กรุณา enable Firestore index ก่อน','warn'); });
  APP.unsubscribers.push(unsub);

  c.innerHTML = `
  <div class="card">
    <div style="padding:.875rem 1.25rem;border-bottom:1px solid var(--wire);display:flex;flex-wrap:wrap;gap:.625rem;align-items:flex-end">
      <div class="fg" style="flex:2 1 200px;margin:0"><label class="fl">ค้นหา</label>
        <div class="igrp"><input class="fc" id="f-s" placeholder="Tracking ID / รายละเอียด..." value="${flt.search||''}"><button class="btn btn-primary" onclick="applyF()">🔍</button></div>
      </div>
      <div class="fg" style="flex:1 1 130px;margin:0"><label class="fl">สถานะ</label><select class="fc" id="f-st" onchange="applyF()"><option value="">ทั้งหมด</option>${['รอดำเนินการ','กำลังดำเนินการ','รอตรวจสอบ','เสร็จสมบูรณ์','ต้องส่งซ่อมภายนอก'].map(s=>`<option${flt.status===s?' selected':''}>${s}</option>`).join('')}</select></div>
      <div class="fg" style="flex:1 1 120px;margin:0"><label class="fl">ความเร่งด่วน</label><select class="fc" id="f-ur" onchange="applyF()"><option value="">ทั้งหมด</option>${['ฉุกเฉิน','เร่งด่วน','ปกติ','ไม่เร่งด่วน'].map(s=>`<option${flt.urgency===s?' selected':''}>${s}</option>`).join('')}</select></div>
      <div style="align-self:flex-end;display:flex;gap:.375rem">
        <button class="btn btn-ghost btn-sm" onclick="navigate('requests-list',{})">↺</button>
        ${canCreate?`<button class="btn btn-primary btn-sm" onclick="navigate('request-new')">➕ แจ้งซ่อม</button>`:''}
      </div>
    </div>
    <div style="padding:.6rem 1.25rem;border-bottom:1px solid var(--wire);display:flex;align-items:center;gap:.5rem"><div class="rt-dot"></div><span id="req-count" class="text-muted">กำลังโหลด...</span></div>
    <div class="tw"><table>
      <thead><tr><th>Tracking ID</th><th>ประเภท</th><th>รายละเอียด</th><th>สถานที่</th><th>ความเร่งด่วน</th><th>สถานะ</th>${canAssign?'<th>ช่าง</th>':''}<th>วันที่แจ้ง</th><th></th></tr></thead>
      <tbody id="req-tbody"><tr><td colspan="9">${loadingState()}</td></tr></tbody>
    </table></div>
  </div>`;
}

window.applyF = function() {
  const f={};
  const s=document.getElementById('f-s')?.value; const st=document.getElementById('f-st')?.value; const ur=document.getElementById('f-ur')?.value;
  if(s)f.search=s; if(st)f.status=st; if(ur)f.urgency=ur;
  navigate('requests-list',f);
};

/* ─── ASSIGN MODAL ─── */
window.openAssignModal = async function(reqId, tid) {
  const snap = await getDocs(query(collection(db, COLLECTIONS.users), where('role','==','technician'), where('is_active','==',true)));
  const techs = snap.docs.map(d=>({id:d.id,...d.data()}));
  openModal(`<div class="modal"><div class="mh"><div class="mt">👷 มอบหมายช่างซ่อม</div><button class="mx" onclick="closeModal()">✕</button></div>
  <div class="mb2">
    <div class="alert al-info">📋 งาน: <strong>${tid}</strong></div>
    <div class="fg"><label class="fl">เลือกช่าง <span class="req">*</span></label><select class="fc" id="a-tech"><option value="">-- เลือกช่าง --</option>${techs.map(t=>`<option value="${t.id}">${t.name} (${t.department||'–'})</option>`).join('')}</select></div>
  </div>
  <div class="mf"><button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button><button class="btn btn-primary" onclick="doAssign('${reqId}')">✅ ยืนยัน</button></div></div>`);
};

window.doAssign = async function(reqId) {
  const techId = document.getElementById('a-tech').value;
  if (!techId) { toast('กรุณาเลือกช่าง','warn'); return; }
  const techDoc = await getDoc(doc(db, COLLECTIONS.users, techId));
  const tech = techDoc.data();
  const reqRef = doc(db, COLLECTIONS.requests, reqId);
  const reqDoc = await getDoc(reqRef);
  await updateDoc(reqRef, { assigned_tech_id:techId, tech_name:tech.name, status:'กำลังดำเนินการ', assigned_at:serverTimestamp() });
  await sendNotif(techId, 'งานใหม่ถูกมอบหมาย', `งาน ${reqDoc.data()?.tracking_id} ถูกมอบหมายให้คุณ`, 'info', reqId);
  toast(`มอบหมายให้ ${tech.name} สำเร็จ`);
  closeModal();
};

/* ═══════════════════════════════════════
   PAGE: NEW REQUEST
═══════════════════════════════════════ */
async function pageNewRequest() {
  const c = document.getElementById('page-content');
  const locSnap = await getDocs(query(collection(db, 'locations'), orderBy('building')));
  const buildings = [...new Set(locSnap.docs.map(d=>d.data().building))];
  window._locs = locSnap.docs.map(d=>({id:d.id,...d.data()}));

  // Fallback if no locations seeded
  if (!buildings.length) {
    window._locs = [
      {id:'1',building:'อาคาร A',floor:'ชั้น 1',room:'ห้อง 101'},
      {id:'2',building:'อาคาร A',floor:'ชั้น 2',room:'ห้อง 201'},
      {id:'3',building:'อาคาร B',floor:'ชั้น 1',room:'ห้องปฏิบัติการ 1'},
    ];
    buildings.push('อาคาร A','อาคาร B');
  }

  c.innerHTML = `
  <div style="max-width:720px;margin:0 auto">
    <div class="card">
      <div class="card-h"><div class="card-t">➕ แบบฟอร์มแจ้งซ่อม</div><button class="btn btn-ghost btn-sm" onclick="navigate('requests-list')">← กลับ</button></div>
      <div class="card-b">
        <div id="req-alert"></div>

        <div style="margin-bottom:1.5rem">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--chalk3);margin-bottom:.75rem">1. ประเภทปัญหา</div>
          <div class="cat-grid">
            ${[['ไฟฟ้า','⚡'],['ประปา','💧'],['โครงสร้าง','🏗️'],['อุปกรณ์อิเล็กทรอนิกส์','💻'],['เครื่องปรับอากาศ','❄️']].map(([cat,ico])=>`
            <div class="catcard" id="c-${cat}" onclick="selCat('${cat}',this)"><div class="cc-i">${ico}</div><div class="cc-t">${cat}</div></div>`).join('')}
          </div>
          <input type="hidden" id="req-cat">
        </div>

        <div style="margin-bottom:1.5rem">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--chalk3);margin-bottom:.75rem">2. สถานที่เกิดเหตุ</div>
          <div class="frow3">
            <div class="fg"><label class="fl">อาคาร</label><select class="fc" id="req-bld" onchange="upFloor()"><option value="">-- เลือก --</option>${buildings.map(b=>`<option>${b}</option>`).join('')}</select></div>
            <div class="fg"><label class="fl">ชั้น</label><select class="fc" id="req-fl" onchange="upRoom()" disabled><option value="">-- เลือก --</option></select></div>
            <div class="fg"><label class="fl">ห้อง</label><select class="fc" id="req-rm" disabled><option value="">-- เลือก --</option></select></div>
          </div>
        </div>

        <div style="margin-bottom:1.5rem">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--chalk3);margin-bottom:.75rem">3. รายละเอียดปัญหา</div>
          <textarea class="fc" id="req-desc" rows="4" placeholder="อธิบายรายละเอียดปัญหา..."></textarea>
        </div>

        <div style="margin-bottom:1.5rem">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--chalk3);margin-bottom:.75rem">4. ระดับความเร่งด่วน</div>
          <div class="u-grid">
            ${[['ฉุกเฉิน','u-red','🚨','ต้องดำเนินการทันที'],['เร่งด่วน','u-amber','⚡','ภายใน 24 ชั่วโมง'],['ปกติ','u-green','📋','ภายใน 3 วันทำการ'],['ไม่เร่งด่วน','u-gray','📌','ภายใน 7 วันทำการ']].map(([u,cls,ico,d])=>`
            <div class="ucard ${cls}" id="u-${u}" onclick="selUrg('${u}',this)"><div class="uc-t">${ico} ${u}</div><div class="uc-d">${d}</div></div>`).join('')}
          </div>
          <input type="hidden" id="req-urg">
        </div>

        <div style="margin-bottom:1.5rem">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--chalk3);margin-bottom:.75rem">5. รูปภาพประกอบ (ไม่บังคับ) — Firebase Storage</div>
          <label style="border:2px dashed var(--wire);border-radius:var(--r2);padding:1.5rem;text-align:center;cursor:pointer;display:block;transition:border-color .15s;color:var(--chalk2);font-size:.8rem" for="req-img" id="img-zone" onmouseover="this.style.borderColor='var(--spark)'" onmouseout="this.style.borderColor='var(--wire)'">
            <div style="font-size:2rem;margin-bottom:.5rem">📷</div>
            <div>คลิกหรือลากไฟล์มาวาง</div>
            <div style="font-size:.7rem;color:var(--chalk3);margin-top:.25rem">JPG, PNG ≤ 10MB → อัปโหลดขึ้น Firebase Storage</div>
          </label>
          <input type="file" id="req-img" accept=".jpg,.jpeg,.png" class="hidden" onchange="previewImg(this)">
          <img id="img-preview" class="hidden" style="max-height:200px;border-radius:var(--r);border:1px solid var(--wire);margin-top:.75rem">
        </div>

        <div class="flex gap1" style="justify-content:flex-end">
          <button class="btn btn-ghost" onclick="navigate('requests-list')">ยกเลิก</button>
          <button class="btn btn-primary btn-lg" id="submit-btn" onclick="submitRequest()">📨 ส่งคำขอแจ้งซ่อม</button>
        </div>
      </div>
    </div>
  </div>`;
}

window.selCat = function(v,el) { document.querySelectorAll('.catcard').forEach(e=>e.classList.remove('sel')); el.classList.add('sel'); document.getElementById('req-cat').value=v; };
window.selUrg = function(v,el) { document.querySelectorAll('.ucard').forEach(e=>e.classList.remove('sel')); el.classList.add('sel'); document.getElementById('req-urg').value=v; };
window.upFloor = function() {
  const bld=document.getElementById('req-bld').value;
  const floors=[...new Set(window._locs.filter(l=>l.building===bld).map(l=>l.floor))];
  const sel=document.getElementById('req-fl');
  sel.innerHTML='<option value="">-- เลือก --</option>'+floors.map(f=>`<option>${f}</option>`).join('');
  sel.disabled=!floors.length;
  document.getElementById('req-rm').innerHTML='<option value="">-- เลือก --</option>';
  document.getElementById('req-rm').disabled=true;
};
window.upRoom = function() {
  const bld=document.getElementById('req-bld').value; const fl=document.getElementById('req-fl').value;
  const rooms=window._locs.filter(l=>l.building===bld&&l.floor===fl);
  const sel=document.getElementById('req-rm');
  sel.innerHTML='<option value="">-- เลือก --</option>'+rooms.map(r=>`<option value="${r.id}">${r.room}</option>`).join('');
  sel.disabled=!rooms.length;
};
window.previewImg = function(input) {
  const p=document.getElementById('img-preview');
  if (input.files?.[0]) { const r=new FileReader(); r.onload=e=>{p.src=e.target.result;p.classList.remove('hidden');}; r.readAsDataURL(input.files[0]); document.getElementById('img-zone').innerHTML='<div style="color:var(--green)">✅ '+input.files[0].name+'</div>'; }
};

window.submitRequest = async function() {
  const cat=document.getElementById('req-cat').value;
  const desc=document.getElementById('req-desc').value.trim();
  const urg=document.getElementById('req-urg').value;
  const bld=document.getElementById('req-bld').value;
  const fl=document.getElementById('req-fl').value;
  const rm=document.getElementById('req-rm').value;
  const imgFile=document.getElementById('req-img').files?.[0];
  const alertEl=document.getElementById('req-alert');

  if (!cat){alertEl.innerHTML=`<div class="alert al-warn">⚠️ กรุณาเลือกประเภทปัญหา</div>`;return;}
  if (!desc){alertEl.innerHTML=`<div class="alert al-warn">⚠️ กรุณากรอกรายละเอียด</div>`;return;}
  if (!urg){alertEl.innerHTML=`<div class="alert al-warn">⚠️ กรุณาเลือกความเร่งด่วน</div>`;return;}

  const btn=document.getElementById('submit-btn'); btn.disabled=true; btn.textContent='กำลังบันทึก...';
  try {
    let imageUrl = '';
    if (imgFile) {
      toast('กำลังอัปโหลดรูปภาพขึ้น Firebase Storage...','info');
      const storageRef = ref(storage, `requests/${APP.user.uid}/${Date.now()}_${imgFile.name}`);
      await uploadBytes(storageRef, imgFile);
      imageUrl = await getDownloadURL(storageRef);
    }
    const tid = genTID();
    const loc = window._locs.find(l=>l.id===rm) || {};
    await addDoc(collection(db, COLLECTIONS.requests), {
      tracking_id: tid, requester_id: APP.user.uid,
      requester_name: APP.profile.name, requester_dept: APP.profile.department||'',
      category: cat, location: bld&&fl?`${bld} ${fl}${loc.room?` ${loc.room}`:''}`:bld||'ไม่ระบุ',
      location_id: rm||'', description: desc, urgency: urg,
      status: 'รอดำเนินการ', image_url: imageUrl,
      assigned_tech_id: '', tech_name: '', repair_detail: '',
      sla_deadline: slaDate(urg), created_at: serverTimestamp()
    });
    // notify managers
    const mgrSnap = await getDocs(query(collection(db, COLLECTIONS.users), where('role','in',['manager','admin'])));
    for (const d of mgrSnap.docs) await sendNotif(d.id, 'มีการแจ้งซ่อมใหม่', `${APP.profile.name} แจ้งซ่อม ${cat} (${urg}) — ${tid}`, 'info');

    document.getElementById('page-content').innerHTML = `
      <div style="max-width:480px;margin:4rem auto;text-align:center">
        <div style="font-size:5rem;margin-bottom:1.5rem">✅</div>
        <h2 style="color:var(--green);margin-bottom:.75rem">แจ้งซ่อมสำเร็จ!</h2>
        <p class="text-muted mb2">บันทึกลง Firestore เรียบร้อยแล้ว</p>
        <div class="track-box mb2">
          <div class="text-xs" style="color:var(--chalk3);margin-bottom:.5rem">Tracking ID</div>
          <div class="track-id">${tid}</div>
        </div>
        ${imageUrl?`<div class="mb2"><img src="${imageUrl}" style="max-height:160px;border-radius:var(--r);border:1px solid var(--wire)"><div class="text-xs text-muted mt1">✅ รูปภาพบน Firebase Storage</div></div>`:''}
        <div class="flex gap1" style="justify-content:center">
          <button class="btn btn-ghost" onclick="navigate('track')">🔍 ติดตามงาน</button>
          <button class="btn btn-primary" onclick="navigate('requests-list')">📋 ดูรายการ</button>
        </div>
      </div>`;
  } catch(e) {
    btn.disabled=false; btn.textContent='📨 ส่งคำขอแจ้งซ่อม';
    alertEl.innerHTML=`<div class="alert al-danger">❌ ${e.message}</div>`;
  }
};

/* ═══════════════════════════════════════
   PAGE: REQUEST DETAIL (Realtime)
═══════════════════════════════════════ */
async function pageRequestDetail(id) {
  const c = document.getElementById('page-content');
  const docRef = doc(db, COLLECTIONS.requests, id);
  const evalSnap = await getDocs(query(collection(db, COLLECTIONS.evaluations), where('request_id','==',id)));
  const eval_ = evalSnap.empty ? null : evalSnap.docs[0].data();

  // Realtime listener for this request
  const unsub = onSnapshot(docRef, snap => {
    if (!snap.exists()) { c.innerHTML=`<div class="alert al-danger">❌ ไม่พบข้อมูล</div>`; return; }
    const r = {id:snap.id, ...snap.data()};
    renderDetail(r, eval_);
  });
  APP.unsubscribers.push(unsub);
}

function renderDetail(r, eval_) {
  const c = document.getElementById('page-content');
  const role = APP.profile?.role; const uid = APP.user?.uid;
  const overdue = r.sla_deadline?.toDate?.() < new Date() && r.status!=='เสร็จสมบูรณ์';
  const statusOrder = ['รอดำเนินการ','กำลังดำเนินการ','รอตรวจสอบ','เสร็จสมบูรณ์'];
  const si = statusOrder.indexOf(r.status);
  const canTech = role==='technician' && r.assigned_tech_id===uid;
  const canManager = ['manager','admin'].includes(role);
  const canEval = role==='user' && r.requester_id===uid && r.status==='เสร็จสมบูรณ์' && !eval_;

  c.innerHTML = `
  <div style="max-width:820px;margin:0 auto">
    <div class="flex ic jb mb" style="flex-wrap:wrap;gap:.5rem">
      <button class="btn btn-ghost btn-sm" onclick="navigate('requests-list')">← กลับ</button>
      <div class="flex gap1 ic" style="flex-wrap:wrap">
        <div class="rt-dot"></div><span class="text-xs" style="color:var(--chalk3)">Live update</span>
        ${canManager&&!r.assigned_tech_id?`<button class="btn btn-primary btn-sm" onclick="openAssignModal('${r.id}','${r.tracking_id}')">👷 มอบหมายช่าง</button>`:''}
        ${canTech&&r.status!=='เสร็จสมบูรณ์'?`<button class="btn btn-amber btn-sm" onclick="openStatusModal('${r.id}')">🔄 อัปเดตสถานะ</button>`:''}
        ${canEval?`<button class="btn btn-amber btn-sm" onclick="openEvalModal('${r.id}')">⭐ ประเมินงาน</button>`:''}
      </div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div><div class="flex ic gap1"><span class="tid">${r.tracking_id}</span>${overdue?'<span class="badge b-red">⏰ เกิน SLA</span>':''}</div><div class="text-muted text-xs" style="margin-top:3px">${catIcon(r.category)} ${r.category} · ${fmtDate(r.created_at)}</div></div>
        <div class="flex gap1">${uBadge(r.urgency)} ${sBadge(r.status)}</div>
      </div>
      <div class="card-b">
        <div class="g2">
          <div><div class="text-xs" style="color:var(--chalk3);margin-bottom:3px">ผู้แจ้งซ่อม</div><div style="font-weight:700">${r.requester_name||'–'}</div><div class="text-muted text-xs">${r.requester_dept||''}</div></div>
          <div><div class="text-xs" style="color:var(--chalk3);margin-bottom:3px">สถานที่</div><div style="font-weight:700">${r.location||'–'}</div></div>
          <div><div class="text-xs" style="color:var(--chalk3);margin-bottom:3px">ช่างที่รับผิดชอบ</div><div style="font-weight:700">${r.tech_name||'– ยังไม่ได้มอบหมาย –'}</div></div>
          <div><div class="text-xs" style="color:var(--chalk3);margin-bottom:3px">กำหนด SLA</div><div style="font-weight:700;color:${overdue?'var(--red)':'inherit'}">${fmtDate(r.sla_deadline)}</div></div>
        </div>
        <div class="divider"></div>
        <p style="line-height:1.8;font-size:.85rem">${r.description}</p>
        ${r.image_url?`<div class="mt2"><div class="text-xs" style="color:var(--chalk3);margin-bottom:5px">รูปภาพ (Firebase Storage)</div><img src="${r.image_url}" style="max-height:260px;border-radius:var(--r);border:1px solid var(--wire)"></div>`:''}
        ${r.repair_detail?`<div class="alert al-info mt2">🔧 <strong>รายละเอียดการซ่อม:</strong> ${r.repair_detail}</div>`:''}
      </div>
    </div>

    <div class="card mb">
      <div class="card-h"><div class="card-t">⏱️ ความคืบหน้า (Realtime)</div></div>
      <div class="card-b">
        <div class="tl">
          ${statusOrder.map((s,i)=>`
          <div style="display:flex;align-items:center;flex:1">
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
              <div class="tl-dot ${i<si?'done':i===si?'curr':''}">${i<si?'✓':i+1}</div>
              <div class="tl-lbl ${i<si?'done':i===si?'curr':''}">${s}</div>
            </div>
          </div>
          ${i<statusOrder.length-1?`<div class="tl-line ${i<si?'done':''}"></div>`:''}`).join('')}
        </div>
      </div>
    </div>

    ${eval_?`
    <div class="card">
      <div class="card-h"><div class="card-t">⭐ ผลการประเมิน</div><span class="badge b-amber">เฉลี่ย ${Number(eval_.avg_score).toFixed(2)}</span></div>
      <div class="card-b">
        <div class="g3">${[['คุณภาพงาน',eval_.quality_score],['ความรวดเร็ว',eval_.speed_score],['การบริการ',eval_.service_score]].map(([l,s])=>`
        <div style="text-align:center;padding:1rem;background:var(--ink3);border-radius:var(--r2);border:1px solid var(--wire)">
          <div style="font-size:1.4rem;margin-bottom:.25rem;color:var(--amber)">${'★'.repeat(s)}${'☆'.repeat(5-s)}</div>
          <div style="font-weight:700;color:var(--amber);font-family:var(--mono)">${s}/5</div>
          <div class="text-xs" style="color:var(--chalk2)">${l}</div>
        </div>`).join('')}</div>
        ${eval_.comment?`<div class="alert al-info mt2">💬 "${eval_.comment}"</div>`:''}
      </div>
    </div>`:''}
  </div>`;
}

window.openStatusModal = function(reqId) {
  openModal(`<div class="modal"><div class="mh"><div class="mt">🔄 อัปเดตสถานะ</div><button class="mx" onclick="closeModal()">✕</button></div>
  <div class="mb2">
    <div class="fg"><label class="fl">สถานะใหม่</label><select class="fc" id="ns"><option>กำลังดำเนินการ</option><option>รอตรวจสอบ</option><option>เสร็จสมบูรณ์</option><option>ต้องส่งซ่อมภายนอก</option></select></div>
    <div class="fg"><label class="fl">รายละเอียดการดำเนินการ</label><textarea class="fc" id="rd" rows="4" placeholder="อธิบายสิ่งที่ทำ..."></textarea></div>
  </div>
  <div class="mf"><button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button><button class="btn btn-primary" onclick="doUpdateStatus('${reqId}')">✅ บันทึก</button></div></div>`);
};

window.doUpdateStatus = async function(reqId) {
  const status=document.getElementById('ns').value; const rd=document.getElementById('rd').value;
  const updates = { status, repair_detail:rd||'' };
  if (status==='เสร็จสมบูรณ์') updates.completed_at = serverTimestamp();
  const reqRef = doc(db, COLLECTIONS.requests, reqId);
  const reqDoc = await getDoc(reqRef);
  await updateDoc(reqRef, updates);
  if (status==='เสร็จสมบูรณ์') {
    await sendNotif(reqDoc.data()?.requester_id, 'งานซ่อมเสร็จแล้ว', `งาน ${reqDoc.data()?.tracking_id} เสร็จแล้ว กรุณาประเมินผล`, 'success', reqId);
  }
  toast('อัปเดตสถานะสำเร็จ'); closeModal();
};

window.openEvalModal = function(reqId) {
  openModal(`<div class="modal"><div class="mh"><div class="mt">⭐ ประเมินความพึงพอใจ</div><button class="mx" onclick="closeModal()">✕</button></div>
  <div class="mb2">
    ${[['quality','คุณภาพงาน'],['speed','ความรวดเร็ว'],['service','การบริการ']].map(([k,l])=>`
    <div class="sg"><div class="sg-l">${l}</div>
    <div class="stars" id="st-${k}">${[1,2,3,4,5].map(n=>`<span class="star" data-v="${n}" onclick="setStar('${k}',${n})">★</span>`).join('')}</div>
    <input type="hidden" id="sc-${k}" value="0"></div>`).join('')}
    <div class="fg"><label class="fl">ความคิดเห็น</label><textarea class="fc" id="ec" rows="3" placeholder="บอกเราเพิ่มเติม..."></textarea></div>
  </div>
  <div class="mf"><button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button><button class="btn btn-primary" onclick="doEval('${reqId}')">⭐ ส่ง</button></div></div>`);
};
window.setStar = function(k,v) { document.getElementById(`sc-${k}`).value=v; document.querySelectorAll(`#st-${k} .star`).forEach(s=>s.classList.toggle('on',parseInt(s.dataset.v)<=v)); };
window.doEval = async function(reqId) {
  const q=parseInt(document.getElementById('sc-quality').value),sp=parseInt(document.getElementById('sc-speed').value),sv=parseInt(document.getElementById('sc-service').value),cm=document.getElementById('ec').value;
  if(!q||!sp||!sv){toast('กรุณาให้คะแนนทุกหัวข้อ','warn');return;}
  await addDoc(collection(db, COLLECTIONS.evaluations), { request_id:reqId, evaluator_id:APP.user.uid, quality_score:q, speed_score:sp, service_score:sv, avg_score:((q+sp+sv)/3).toFixed(2), comment:cm, created_at:serverTimestamp() });
  toast('บันทึกผลประเมินสำเร็จ 🙏'); closeModal();
};

/* ═══════════════════════════════════════
   PAGE: MATERIALS (Realtime)
═══════════════════════════════════════ */
async function pageMaterials() {
  const c = document.getElementById('page-content');
  const role = APP.profile?.role;
  const canManage = ['admin','manager'].includes(role);

  const unsub = onSnapshot(query(collection(db, COLLECTIONS.materials), orderBy('category')), snap => {
    const items = snap.docs.map(d=>({id:d.id,...d.data()}));
    const low = items.filter(m=>m.quantity<=m.reorder_point&&m.reorder_point>0).length;
    const totalVal = items.reduce((a,m)=>a+(m.quantity||0)*(m.unit_price||0),0);

    const statsEl = document.getElementById('mat-stats');
    if (statsEl) { statsEl.innerHTML = matStatsHTML(items.length, low, totalVal); }

    const tbody = document.getElementById('mat-tbody');
    if (tbody) tbody.innerHTML = matRowsHTML(items, canManage);
  });
  APP.unsubscribers.push(unsub);

  c.innerHTML = `
  <div id="mat-stats" class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"></div>
  <div class="card">
    <div style="padding:.875rem 1.25rem;border-bottom:1px solid var(--wire);display:flex;flex-wrap:wrap;gap:.625rem;align-items:flex-end">
      <div class="fg" style="flex:2 1 180px;margin:0"><label class="fl">ค้นหา</label>
        <div class="igrp"><input class="fc" id="ms" placeholder="ชื่อหรือรหัสวัสดุ..." oninput="filterMat()"><button class="btn btn-primary">🔍</button></div>
      </div>
      <div style="align-self:flex-end">${canManage?`<button class="btn btn-primary btn-sm" onclick="openAddMatModal()">➕ เพิ่มวัสดุ</button>`:''}</div>
    </div>
    <div class="flex ic gap1" style="padding:.6rem 1.25rem;border-bottom:1px solid var(--wire)"><div class="rt-dot"></div><span class="text-xs text-muted">Realtime sync</span></div>
    <div class="tw"><table>
      <thead><tr><th>รหัส</th><th>ชื่อวัสดุ</th><th>หมวด</th><th>ยี่ห้อ</th><th>คงเหลือ</th><th>Reorder</th><th>ราคา/หน่วย</th><th>มูลค่า</th><th>สถานะ</th>${canManage?'<th></th>':''}</tr></thead>
      <tbody id="mat-tbody"><tr><td colspan="10">${loadingState()}</td></tr></tbody>
    </table></div>
  </div>`;
}

function matStatsHTML(total, low, val) {
  return [['📦',total,'รายการทั้งหมด','c-blue'],['⚠️',low,'ใกล้หมด/หมด','c-red'],['💰',`฿${val.toLocaleString()}`,'มูลค่าคลัง','c-green']].map(([ico,v,l,cls])=>`
  <div class="scard ${cls}"><div class="scard-row"><div class="scard-ico">${ico}</div></div><div class="scard-val" style="font-size:${String(v).length>6?'1.3rem':'2rem'}">${v}</div><div class="scard-lbl">${l}</div><div class="scard-bar"></div></div>`).join('');
}

function matRowsHTML(items, canManage) {
  if (!items.length) return `<tr><td colspan="10">${emptyState('📦','ไม่มีรายการวัสดุ')}</td></tr>`;
  const search = document.getElementById('ms')?.value?.toLowerCase()||'';
  const filtered = search ? items.filter(m=>m.name?.toLowerCase().includes(search)||m.code?.toLowerCase().includes(search)) : items;
  return filtered.map(m=>{
    const low=m.quantity<=m.reorder_point&&m.reorder_point>0, empty=m.quantity===0;
    return`<tr${empty?' style="background:rgba(255,71,87,.04)"':low?' style="background:rgba(255,184,0,.04)"':''}>
      <td><span class="tid">${m.code}</span></td>
      <td><strong>${m.name}</strong></td>
      <td><span class="badge b-gray">${m.category}</span></td>
      <td class="text-muted text-sm">${m.brand||'–'}</td>
      <td><strong style="color:${empty?'var(--red)':low?'var(--amber)':'var(--chalk)'}">${m.quantity}</strong> <span class="text-xs text-muted">${m.unit}</span></td>
      <td class="mono text-sm">${m.reorder_point}</td>
      <td class="mono text-sm">฿${(m.unit_price||0).toLocaleString()}</td>
      <td class="mono text-sm">฿${((m.quantity||0)*(m.unit_price||0)).toLocaleString()}</td>
      <td>${empty?'<span class="badge b-red">❌ หมด</span>':low?'<span class="badge b-amber">⚠️ ใกล้หมด</span>':'<span class="badge b-green">✅ ปกติ</span>'}</td>
      ${canManage?`<td><button class="btn btn-ghost btn-sm" onclick="openStockIn('${m.id}','${m.name}',${m.quantity})">+รับเข้า</button></td>`:''}
    </tr>`;
  }).join('');
}
window.filterMat = function() { const tbody=document.getElementById('mat-tbody'); if(!tbody)return; };

window.openStockIn = function(id, name, current) {
  openModal(`<div class="modal"><div class="mh"><div class="mt">📥 รับวัสดุเข้าคลัง</div><button class="mx" onclick="closeModal()">✕</button></div>
  <div class="mb2"><div class="alert al-info">📦 <strong>${name}</strong> (คงเหลือ: ${current})</div>
    <div class="frow"><div class="fg"><label class="fl">จำนวน <span class="req">*</span></label><input class="fc" type="number" id="si-q" min="1" value="1"></div>
    <div class="fg"><label class="fl">หมายเหตุ</label><input class="fc" id="si-n" placeholder="แหล่งที่มา..."></div></div>
  </div>
  <div class="mf"><button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button><button class="btn btn-success" onclick="doStockIn('${id}')">✅ บันทึก Firestore</button></div></div>`);
};
window.doStockIn = async function(id) {
  const q=parseInt(document.getElementById('si-q').value);
  if(!q||q<=0){toast('จำนวนไม่ถูกต้อง','warn');return;}
  await updateDoc(doc(db, COLLECTIONS.materials, id), { quantity: increment(q) });
  toast('รับวัสดุเข้าคลังสำเร็จ (Firestore updated)');
  closeModal();
};

window.openAddMatModal = function() {
  openModal(`<div class="modal modal-lg"><div class="mh"><div class="mt">➕ เพิ่มวัสดุใหม่ → Firestore</div><button class="mx" onclick="closeModal()">✕</button></div>
  <div class="mb2">
    <div class="frow"><div class="fg"><label class="fl">รหัส <span class="req">*</span></label><input class="fc" id="nm-c" placeholder="MAT011"></div><div class="fg"><label class="fl">ชื่อ <span class="req">*</span></label><input class="fc" id="nm-n"></div></div>
    <div class="frow"><div class="fg"><label class="fl">หมวด <span class="req">*</span></label><input class="fc" id="nm-cat" placeholder="ไฟฟ้า"></div><div class="fg"><label class="fl">ยี่ห้อ</label><input class="fc" id="nm-b"></div></div>
    <div class="frow3"><div class="fg"><label class="fl">จำนวน</label><input class="fc" id="nm-q" type="number" value="0"></div><div class="fg"><label class="fl">หน่วย</label><input class="fc" id="nm-u" value="ชิ้น"></div><div class="fg"><label class="fl">ราคา/หน่วย</label><input class="fc" id="nm-p" type="number" value="0"></div></div>
    <div class="fg"><label class="fl">Reorder Point</label><input class="fc" id="nm-r" type="number" value="5"></div>
  </div>
  <div class="mf"><button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button><button class="btn btn-primary" onclick="doAddMat()">✅ บันทึก</button></div></div>`);
};
window.doAddMat = async function() {
  const code=document.getElementById('nm-c').value.trim(),name=document.getElementById('nm-n').value.trim(),category=document.getElementById('nm-cat').value.trim();
  if(!code||!name||!category){toast('กรุณากรอกข้อมูลที่จำเป็น','warn');return;}
  await addDoc(collection(db, COLLECTIONS.materials), { code, name, category, brand:document.getElementById('nm-b').value||'', quantity:+document.getElementById('nm-q').value||0, unit:document.getElementById('nm-u').value||'ชิ้น', unit_price:+document.getElementById('nm-p').value||0, reorder_point:+document.getElementById('nm-r').value||5, created_at:serverTimestamp() });
  toast('เพิ่มวัสดุสำเร็จ 📦'); closeModal();
};

/* ═══════════════════════════════════════
   PAGE: USERS (Firestore)
═══════════════════════════════════════ */
async function pageUsers() {
  const c = document.getElementById('page-content');
  const snap = await getDocs(query(collection(db, COLLECTIONS.users), orderBy('role')));
  const users = snap.docs.map(d=>({id:d.id,...d.data()}));
  const isAdmin = APP.profile?.role==='admin';
  const byRole = {}; users.forEach(u=>byRole[u.role]=(byRole[u.role]||0)+1);

  c.innerHTML = `
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
    ${[['👥',users.length,'ทั้งหมด','c-blue'],['🛡️',byRole.admin||0,'Admin','c-red'],['📋',byRole.manager||0,'Manager','c-violet'],['🔧',byRole.technician||0,'ช่างซ่อม','c-blue'],['👤',byRole.user||0,'ผู้ใช้งาน','']].map(([ico,v,l,cls])=>`
    <div class="scard ${cls}" style="${!cls?'--c:var(--chalk2)':''}"><div class="scard-row"><div class="scard-ico" style="${!cls?'background:rgba(255,255,255,.05);color:var(--chalk2)':''}">${ico}</div></div><div class="scard-val" style="${!cls?'color:var(--chalk2)':''}">${v}</div><div class="scard-lbl">${l}</div>${cls?`<div class="scard-bar"></div>`:''}</div>`).join('')}
  </div>
  <div class="card">
    <div class="card-h"><div class="card-t">👥 ผู้ใช้งาน <span class="badge b-blue" style="margin-left:.5rem">Firestore Auth + DB</span></div></div>
    <div class="tw"><table>
      <thead><tr><th>UID/รหัส</th><th>ชื่อ-นามสกุล</th><th>อีเมล</th><th>บทบาท</th><th>แผนก</th><th>สถานะ</th>${isAdmin?'<th></th>':''}</tr></thead>
      <tbody>${users.map(u=>`<tr${!u.is_active?' style="opacity:.45"':''}>
        <td><span class="tid" style="font-size:.6rem">${u.student_id||u.id?.slice(0,8)+'...'}</span></td>
        <td><strong>${u.name}</strong></td>
        <td class="text-sm text-muted">${u.email}</td>
        <td>${roleBadge(u.role)}</td>
        <td class="text-sm">${u.department||'–'}</td>
        <td>${u.is_active?'<span class="badge b-green">✅ ใช้งาน</span>':'<span class="badge b-red">❌ ระงับ</span>'}</td>
        ${isAdmin?`<td style="display:flex;gap:.375rem;align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="doToggleUser('${u.id}',${u.is_active})">${u.is_active?'ระงับ':'เปิดใช้'}</button>
          <select class="fc" style="width:auto;padding:.2rem .5rem;font-size:.72rem" onchange="doChangeRole('${u.id}',this.value)">
            ${['user','technician','manager','admin'].map(r=>`<option${u.role===r?' selected':''}>${r}</option>`).join('')}
          </select>
        </td>`:''}
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
window.doToggleUser = async function(id, current) {
  await updateDoc(doc(db, COLLECTIONS.users, id), {is_active:!current});
  toast(`${!current?'เปิดใช้':'ระงับ'}บัญชีสำเร็จ`); pageUsers();
};
window.doChangeRole = async function(id, role) {
  await updateDoc(doc(db, COLLECTIONS.users, id), {role});
  toast('เปลี่ยนบทบาทสำเร็จ');
};

/* ═══════════════════════════════════════
   PAGE: TRACK (Firestore query)
═══════════════════════════════════════ */
function pageTrack() {
  document.getElementById('page-content').innerHTML = `
  <div style="max-width:600px;margin:0 auto">
    <div class="card">
      <div class="card-h"><div class="card-t">🔍 ติดตามสถานะงานซ่อม (Firestore)</div></div>
      <div class="card-b">
        <div class="fg"><label class="fl">หมายเลขติดตามงาน (Tracking ID)</label>
          <div class="igrp"><input class="fc" id="ti" placeholder="TRK-2568-xxxx" style="font-family:var(--mono);letter-spacing:.05em" onkeydown="if(event.key==='Enter')doTrack()"><button class="btn btn-primary" onclick="doTrack()">🔍 ค้นหา</button></div>
        </div>
        <div id="track-result"></div>
      </div>
    </div>
  </div>`;
}

window.doTrack = async function() {
  const id=document.getElementById('ti').value.trim().toUpperCase();
  const el=document.getElementById('track-result');
  if(!id){el.innerHTML=`<div class="alert al-warn">⚠️ กรุณากรอก Tracking ID</div>`;return;}
  el.innerHTML=loadingState('กำลังค้นหาใน Firestore...');
  const q=query(collection(db, COLLECTIONS.requests), where('tracking_id','==',id));
  const snap=await getDocs(q);
  if(snap.empty){el.innerHTML=`<div class="alert al-danger">❌ ไม่พบหมายเลขนี้ใน Firestore</div>`;return;}
  const r={id:snap.docs[0].id,...snap.docs[0].data()};
  const statusOrder=['รอดำเนินการ','กำลังดำเนินการ','รอตรวจสอบ','เสร็จสมบูรณ์'];
  const si=statusOrder.indexOf(r.status);
  el.innerHTML=`
    <div class="divider"></div>
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.875rem;font-size:.72rem;color:var(--chalk3)"><div class="rt-dot"></div>ดึงข้อมูลจาก Firestore</div>
    <div class="track-box mb2">
      <div class="text-xs" style="color:var(--chalk3);margin-bottom:.5rem">Tracking ID</div>
      <div class="track-id">${r.tracking_id}</div>
      <div class="flex gap1 ic" style="justify-content:center;margin-top:.75rem">${uBadge(r.urgency)} ${sBadge(r.status)}</div>
    </div>
    <div class="g2 mb2" style="font-size:.8rem">
      ${[['📂','ประเภท',`${catIcon(r.category)} ${r.category}`],['📍','สถานที่',r.location||'–'],['👷','ช่างซ่อม',r.tech_name||'ยังไม่ได้มอบหมาย'],['📅','กำหนด SLA',fmtDate(r.sla_deadline)]].map(([ico,l,v])=>`
      <div style="padding:.625rem .875rem;background:var(--ink3);border-radius:var(--r);border:1px solid var(--wire)">
        <div class="text-xs" style="color:var(--chalk3);margin-bottom:3px">${ico} ${l}</div><div style="font-weight:600">${v}</div>
      </div>`).join('')}
    </div>
    <p class="text-muted mb2" style="line-height:1.7">${r.description}</p>
    <div class="tl">
      ${statusOrder.map((s,i)=>`
      <div style="display:flex;align-items:center;flex:1">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <div class="tl-dot ${i<si?'done':i===si?'curr':''}">${i<si?'✓':i+1}</div>
          <div class="tl-lbl ${i<si?'done':i===si?'curr':''}">${s}</div>
        </div>
      </div>
      ${i<statusOrder.length-1?`<div class="tl-line ${i<si?'done':''}"></div>`:''}`).join('')}
    </div>
    <button class="btn btn-primary btn-sm mt2" onclick="navigate('request-detail',{id:'${r.id}'})">📋 ดูรายละเอียดเต็ม →</button>`;
};

/* ═══════════════════════════════════════
   PAGE: PROFILE (Firebase Auth + Firestore)
═══════════════════════════════════════ */
async function pageProfile() {
  const c = document.getElementById('page-content');
  const u = APP.user; const p = APP.profile;
  const mySnap = await getCountFromServer(query(collection(db, COLLECTIONS.requests), where('requester_id','==',u.uid)));
  const doneSnap = await getCountFromServer(query(collection(db, COLLECTIONS.requests), where('requester_id','==',u.uid), where('status','==','เสร็จสมบูรณ์')));

  c.innerHTML = `
  <div style="max-width:680px;margin:0 auto">
    <div class="card mb">
      <div class="card-b">
        <div class="flex gap2 mb2">
          <div style="width:60px;height:60px;border-radius:12px;background:linear-gradient(135deg,var(--spark),var(--violet));display:flex;align-items:center;justify-content:center;font-size:1.75rem;font-weight:900;color:#fff;flex-shrink:0">${p.name?.[0]||'?'}</div>
          <div>
            <div style="font-size:1.1rem;font-weight:800">${p.name}</div>
            <div>${roleBadge(p.role)}</div>
            <div class="text-xs text-muted mt1">Firebase UID: <span class="mono" style="font-size:.65rem;color:var(--chalk3)">${u.uid}</span></div>
          </div>
        </div>
        <div class="g2" style="font-size:.8rem">
          ${[['📧','อีเมล (Firebase Auth)',u.email],['🎓','รหัสนักศึกษา',p.student_id||'–'],['🏫','แผนก',p.department||'–'],['📞','โทรศัพท์',p.phone||'–']].map(([ico,l,v])=>`
          <div style="padding:.625rem .875rem;background:var(--ink3);border-radius:var(--r);border:1px solid var(--wire)">
            <div class="text-xs" style="color:var(--chalk3);margin-bottom:3px">${ico} ${l}</div>
            <div style="font-weight:600">${v}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="stats-grid mb">
      <div class="scard c-blue"><div class="scard-row"><div class="scard-ico">📋</div></div><div class="scard-val">${mySnap.data().count}</div><div class="scard-lbl">งานทั้งหมด</div><div class="scard-bar"></div></div>
      <div class="scard c-green"><div class="scard-row"><div class="scard-ico">✅</div></div><div class="scard-val">${doneSnap.data().count}</div><div class="scard-lbl">เสร็จสมบูรณ์</div><div class="scard-bar"></div></div>
    </div>

    <div class="card mb">
      <div class="card-h"><div class="card-t">✏️ แก้ไขข้อมูล → Firestore</div></div>
      <div class="card-b">
        <div id="p-alert"></div>
        <div class="frow"><div class="fg"><label class="fl">ชื่อ-นามสกุล</label><input class="fc" id="p-n" value="${p.name||''}"></div><div class="fg"><label class="fl">แผนก</label><input class="fc" id="p-d" value="${p.department||''}"></div></div>
        <div class="fg"><label class="fl">โทรศัพท์</label><input class="fc" id="p-ph" value="${p.phone||''}"></div>
        <button class="btn btn-primary" onclick="saveProfile()">💾 บันทึก</button>
      </div>
    </div>

    <div class="card mb">
      <div class="card-h"><div class="card-t">🔒 เปลี่ยนรหัสผ่าน → Firebase Auth</div></div>
      <div class="card-b">
        <div id="pw-alert"></div>
        <div class="frow"><div class="fg"><label class="fl">รหัสผ่านเดิม</label><input class="fc" id="pw-o" type="password"></div><div class="fg"><label class="fl">รหัสผ่านใหม่ (≥6)</label><input class="fc" id="pw-n" type="password"></div></div>
        <button class="btn btn-amber" onclick="changePw()">🔒 เปลี่ยนรหัสผ่าน</button>
      </div>
    </div>

    ${APP.profile?.role==='admin'?`<div class="card mt2">
      <div class="card-h"><div class="card-t">🔥 Admin Tools (Firebase)</div></div>
      <div class="card-b">
        <div class="alert al-warn mb">ดำเนินการเพียงครั้งเดียว — ข้อมูลที่มีอยู่จะไม่ถูกลบ</div>
        <div class="flex gap1" style="flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="seedInitialData()">🌱 Seed locations + materials</button>
        </div>
        <div class="text-xs text-muted mt1">หรือพิมพ์ seedInitialData() ใน Browser Console</div>
      </div>
    </div>`:''}
  </div>`;
}

window.saveProfile = async function() {
  const name=document.getElementById('p-n').value, dept=document.getElementById('p-d').value, phone=document.getElementById('p-ph').value;
  await updateDoc(doc(db, COLLECTIONS.users, APP.user.uid), {name, department:dept, phone});
  APP.profile.name=name; APP.profile.department=dept; APP.profile.phone=phone;
  document.getElementById('p-alert').innerHTML=`<div class="alert al-success">✅ บันทึกลง Firestore สำเร็จ</div>`;
  toast('อัปเดตโปรไฟล์สำเร็จ');
};
window.changePw = async function() {
  const oldPw=document.getElementById('pw-o').value, newPw=document.getElementById('pw-n').value;
  const el=document.getElementById('pw-alert');
  if(!oldPw||!newPw){el.innerHTML=`<div class="alert al-warn">⚠️ กรุณากรอกให้ครบ</div>`;return;}
  try {
    const cred = EmailAuthProvider.credential(APP.user.email, oldPw);
    await reauthenticateWithCredential(APP.user, cred);
    await updatePassword(APP.user, newPw);
    el.innerHTML=`<div class="alert al-success">✅ เปลี่ยนรหัสผ่านสำเร็จ (Firebase Auth)</div>`;
    document.getElementById('pw-o').value=''; document.getElementById('pw-n').value='';
  } catch(e) {
    const msgs={'auth/wrong-password':'รหัสผ่านเดิมไม่ถูกต้อง','auth/weak-password':'รหัสผ่านใหม่อ่อนเกินไป'};
    el.innerHTML=`<div class="alert al-danger">❌ ${msgs[e.code]||e.message}</div>`;
  }
};


/* ═══════════════════════════════════════
   SEED INITIAL DATA (run once)
   เรียกใช้ผ่าน browser console: seedInitialData()
═══════════════════════════════════════ */
window.seedInitialData = async function() {
  if (!APP.user) { toast('กรุณาเข้าสู่ระบบก่อน', 'warn'); return; }
  const role = APP.profile?.role;
  if (role !== 'admin') { toast('ต้องเป็น admin ถึงจะ seed ได้', 'warn'); return; }
  toast('กำลัง seed ข้อมูลทดสอบ...', 'fire');
  try {
    const batch = writeBatch(db);

    // Locations
    const locsData = [
      {building:'อาคาร A',floor:'ชั้น 1',room:'ห้อง 101'},{building:'อาคาร A',floor:'ชั้น 1',room:'ห้อง 102'},
      {building:'อาคาร A',floor:'ชั้น 2',room:'ห้อง 201'},{building:'อาคาร A',floor:'ชั้น 3',room:'ห้อง 301'},
      {building:'อาคาร B',floor:'ชั้น 1',room:'ห้องปฏิบัติการ 1'},{building:'อาคาร B',floor:'ชั้น 1',room:'ห้องปฏิบัติการ 2'},
      {building:'อาคาร B',floor:'ชั้น 2',room:'ห้องประชุม'},{building:'อาคาร C',floor:'ชั้น 1',room:'สำนักงาน'},
      {building:'อาคาร C',floor:'ชั้น 1',room:'ห้องน้ำ ชั้น 1'},{building:'อาคาร D',floor:'ชั้น 1',room:'ห้องพัก 101'},
    ];
    locsData.forEach(l => { const r = doc(collection(db,'locations')); batch.set(r, l); });

    // Materials
    const matsData = [
      {code:'MAT001',name:'หลอดไฟ LED 18W',category:'ไฟฟ้า',brand:'Philips',quantity:45,unit:'หลอด',unit_price:120,reorder_point:10},
      {code:'MAT002',name:'สายไฟ VCT 2x1.5',category:'ไฟฟ้า',brand:'Thai Wire',quantity:180,unit:'เมตร',unit_price:25,reorder_point:30},
      {code:'MAT003',name:'เบรกเกอร์ 20A',category:'ไฟฟ้า',brand:'Siemens',quantity:18,unit:'อัน',unit_price:350,reorder_point:5},
      {code:'MAT004',name:'เต้ารับ 3 ขา',category:'ไฟฟ้า',brand:'Panasonic',quantity:3,unit:'อัน',unit_price:85,reorder_point:15},
      {code:'MAT005',name:'ก๊อกน้ำมิกเซอร์',category:'ประปา',brand:'American Standard',quantity:12,unit:'อัน',unit_price:580,reorder_point:3},
      {code:'MAT006',name:'ท่อ PVC 1/2"',category:'ประปา',brand:'SCG',quantity:90,unit:'เมตร',unit_price:35,reorder_point:20},
      {code:'MAT007',name:'ปูนซ่อมรอยร้าว',category:'โครงสร้าง',brand:'TPI',quantity:4,unit:'ถุง',unit_price:180,reorder_point:5},
      {code:'MAT008',name:'น้ำยาล้างแอร์',category:'เครื่องปรับอากาศ',brand:null,quantity:2,unit:'กระป๋อง',unit_price:95,reorder_point:5},
      {code:'MAT009',name:'ฟิลเตอร์แอร์',category:'เครื่องปรับอากาศ',brand:'Carrier',quantity:30,unit:'แผ่น',unit_price:150,reorder_point:8},
      {code:'MAT010',name:'เทปพันสายไฟ',category:'ทั่วไป',brand:'3M',quantity:80,unit:'ม้วน',unit_price:25,reorder_point:20},
    ];
    matsData.forEach(m => { const r = doc(collection(db, COLLECTIONS.materials)); batch.set(r, {...m, brand: m.brand||'', created_at: serverTimestamp()}); });

    await batch.commit();
    toast('Seed ข้อมูลสำเร็จ! 🎉 10 สถานที่ + 10 วัสดุ', 'ok');
  } catch(e) { toast('Seed error: ' + e.message, 'err'); }
};

/* ═══════════════════════════════════════
   MAIN AUTH OBSERVER (Firebase onAuthStateChanged)
═══════════════════════════════════════ */
onAuthStateChanged(auth, async (user) => {
  if (!isConfigured) { showSetupPage(); return; }
  if (user) {
    APP.user = user;
    try {
      const uDoc = await getDoc(doc(db, COLLECTIONS.users, user.uid));
      if (!uDoc.exists()) {
        // First time login — create profile
        await setDoc(doc(db, COLLECTIONS.users, user.uid), {
          uid: user.uid, name: user.displayName || user.email?.split('@')[0] || 'ผู้ใช้',
          email: user.email, role: 'user', student_id: '', department: '', phone: '',
          is_active: true, created_at: serverTimestamp(), last_login: serverTimestamp()
        });
        const newDoc = await getDoc(doc(db, COLLECTIONS.users, user.uid));
        buildShell(newDoc.data());
      } else {
        await updateDoc(doc(db, COLLECTIONS.users, user.uid), { last_login: serverTimestamp() });
        buildShell(uDoc.data());
      }
    } catch(e) {
      console.error('Profile load error:', e);
      buildShell({ uid: user.uid, name: user.email, role: 'user', department: '' });
    }
  } else {
    APP.user = null; APP.profile = null;
    showAuth();
  }
});

/* ─── expose for HTML onclick ─── */
window.doLogin = doLogin;
window.doRegister = doRegister;
window.doLogout = doLogout;
window.navigate = navigate;