'use strict';
/* Cloud sync via Supabase REST (no SDK). Email one-time code or magic-link login.
   One row per player in public.saves; last write wins by server updated_at.
   Loaded before game.js; everything here runs after game.js boots (syncBoot). */

const SB_URL = 'https://edhxqomwfqtmlykpvehi.supabase.co';
const SB_KEY = 'sb_publishable_ye6sDYTBJLjjMgAbRggKpA_PSmZjnKQ'; // public key; RLS protects rows
const AUTH_KEY = 'imt_auth_v1', SYNC_EVERY = 60e3;

let auth = null, syncing = false, syncMsg = 'Not synced yet', codeFor = '', pendingRemote = null;
try { auth = JSON.parse(localStorage.getItem(AUTH_KEY)); codeFor = localStorage.getItem('imt_otp_email') || ''; } catch (e) { }
// remember the email a code was sent to, so the code box survives a reload
function setCodeFor(v) { codeFor = v; try { v ? localStorage.setItem('imt_otp_email', v) : localStorage.removeItem('imt_otp_email'); } catch (e) { } }

function setAuth(a) {
  auth = a;
  try { a ? localStorage.setItem(AUTH_KEY, JSON.stringify(a)) : localStorage.removeItem(AUTH_KEY); } catch (e) { }
}
async function sb(path, { method = 'GET', body, token, prefer } = {}) {
  const h = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  if (prefer) h.Prefer = prefer;
  const r = await fetch(SB_URL + path, { method, headers: h, body: body && JSON.stringify(body) });
  const t = await r.text(); let j = null;
  try { j = t ? JSON.parse(t) : null; } catch (e) { }
  if (!r.ok) { const err = new Error((j && (j.msg || j.message || j.error_description || j.error)) || 'HTTP ' + r.status); err.status = r.status; throw err; }
  return j;
}
const sessionOf = j => ({
  access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000,
  email: j.user && j.user.email, user_id: j.user && j.user.id,
});
async function token() {
  if (!auth) throw new Error('Not signed in');
  if (Date.now() > auth.expires_at - 60e3) {
    try {
      setAuth({ ...auth, ...sessionOf(await sb('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: auth.refresh_token } })) });
    } catch (e) {
      if (e.status === 400 || e.status === 401) { setAuth(null); refreshPanel(); }
      throw e;
    }
  }
  return auth.access_token;
}

// ---------- sync ----------
const blank = s => !s.mons.length && !s.eggs.length && s.best <= 1 && s.gen === 0;
const summary = s => `Floor ${s.best} · ${s.mons.length} monsters · 🪙${fmt(s.coins)}`;
function setSync(msg) { syncMsg = msg; const el = $('#syncst'); if (el) el.textContent = msg; }

async function sync() {
  if (!auth || syncing) return;
  if (!navigator.onLine) return setSync('Offline. Will sync when back online.');
  syncing = true; setSync('Syncing…');
  try {
    const tk = await token();
    const r = (await sb('/rest/v1/saves?select=save,updated_at', { token: tk }))[0];
    const remoteNew = r && (!S.cloud || r.updated_at !== S.cloud.at); // another device wrote since our last sync
    const localNew = !S.cloud || S.changed > S.cloud.local;
    if (remoteNew && localNew && !blank(S)) { pendingRemote = r; conflict(r); setSync('Waiting for your choice'); return; }
    if (remoteNew) adopt(r);
    else if (localNew) await push(tk);
    setSync('Synced ' + new Date().toLocaleTimeString());
  } catch (e) {
    setSync('Sync failed: ' + e.message);
  } finally { syncing = false; }
}
async function push(tk) {
  save();
  const ch = S.changed, { cloud, ...snap } = S;
  const rows = await sb('/rest/v1/saves?on_conflict=user_id', {
    method: 'POST', token: tk, prefer: 'resolution=merge-duplicates,return=representation',
    body: { user_id: auth.user_id, save: snap },
  });
  S.cloud = { at: rows[0].updated_at, local: ch }; save();
}
function adopt(r) {
  const s = sanitize(r.save);
  // reset the dirty clock so this device's clock skew can't block future pushes
  s.changed = 0; s.cloud = { at: r.updated_at, local: 0 };
  S = s; B = null; last = Math.min(Date.now(), s.saved); save(); render();
  toast('Loaded cloud save: ' + summary(S));
}
function conflict(r) {
  let rs; try { rs = summary(sanitize(r.save)); } catch (e) { rs = 'unreadable'; }
  modal(`<h3>Two different saves</h3><p>Both this device and the cloud have new progress. Pick one to keep. The other is overwritten.</p>
    <div class="card"><b>This device</b><p>${summary(S)}</p><button data-act="keeplocal">Keep this device</button></div>
    <div class="card"><b>Cloud</b> <small>${new Date(r.updated_at).toLocaleString()}</small><p>${rs}</p><button data-act="usecloud">Use cloud save</button></div>`, true);
}
const SYNC_ACT = {};
SYNC_ACT.keeplocal = async () => {
  closeModal(); pendingRemote = null; setSync('Syncing…');
  try { await push(await token()); setSync('Synced ' + new Date().toLocaleTimeString()); } catch (e) { setSync('Sync failed: ' + e.message); }
};
SYNC_ACT.usecloud = () => { closeModal(); if (pendingRemote) adopt(pendingRemote); pendingRemote = null; setSync('Synced ' + new Date().toLocaleTimeString()); };

// ---------- login ----------
SYNC_ACT.sendcode = async () => {
  const email = ($('#sbmail').value || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email');
  if (!navigator.onLine) return toast('You are offline');
  try {
    await sb('/auth/v1/otp?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { method: 'POST', body: { email, create_user: true } });
    setCodeFor(email); refreshPanel(); toast('Check your email');
  } catch (e) { toast('Could not send: ' + e.message); }
};
SYNC_ACT.verify = async () => {
  const code = ($('#sbcode').value || '').replace(/\s/g, '');
  if (!code) return;
  try {
    setAuth(sessionOf(await sb('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: codeFor, token: code } })));
    setCodeFor(''); refreshPanel(); toast('Signed in'); sync();
  } catch (e) { toast('Wrong or expired code'); }
};
SYNC_ACT.syncnow = () => sync();
SYNC_ACT.signout = () => {
  if (!confirm('Sign out? Progress stays on this device.')) return;
  const a = auth; setAuth(null); S.cloud = null; save(); refreshPanel();
  if (a) fetch(SB_URL + '/auth/v1/logout', { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + a.access_token } }).catch(() => { });
};
SYNC_ACT.changemail = () => { setCodeFor(''); refreshPanel(); };

function syncPanel() {
  let body;
  if (auth) body = `<p>Signed in as <b>${esc(auth.email || '?')}</b></p><p id="syncst">${esc(syncMsg)}</p>
    <div class="ctl"><button data-act="syncnow">Sync now</button><button class="btn alt" data-act="signout">Sign out</button></div>`;
  else if (codeFor) body = `<p>Email sent to <b>${esc(codeFor)}</b>. Enter the 6-digit code, or open the link on this device.</p>
    <input id="sbcode" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code">
    <div class="ctl"><button data-act="verify">Verify</button><button class="btn alt" data-act="changemail">Change email</button></div>`;
  else body = `<p>Sign in to back up and play on several devices.</p>
    <input id="sbmail" type="email" autocomplete="email" placeholder="you@example.com">
    <div class="ctl"><button data-act="sendcode">Email me a sign-in link</button></div>`;
  return `<section class="card" id="syncp"><h3>☁️ Cloud sync</h3>${body}</section>`;
}
function refreshPanel() { const p = $('#syncp'); if (p) p.outerHTML = syncPanel(); }

// magic-link redirect lands here with tokens in the URL hash
async function fromHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('error_description')) { history.replaceState(null, '', location.pathname + location.search); return toast('Sign-in link failed: ' + h.get('error_description')); }
  if (!h.get('access_token')) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const user = await sb('/auth/v1/user', { token: h.get('access_token') });
    setAuth(sessionOf({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: +h.get('expires_in'), user }));
    toast('Signed in'); refreshPanel();
  } catch (e) { toast('Sign-in link failed: ' + e.message); }
}

function syncBoot() {
  Object.assign(ACT, SYNC_ACT);
  fromHash().then(() => setTimeout(sync, 1500));
  setInterval(sync, SYNC_EVERY);
  addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sync(); });
}
