'use strict';
/* Idle Monster Tower. Vanilla JS, no deps. Cloud sync lives in sync.js. */

// ---------- data ----------
const SAVE_KEY = 'imt_save_v1', OFFLINE_CAP = 8 * 3600e3, MAX_LVL = 100;
const ELS = {
  fire: { i: '🔥', n: 'Fire' }, grass: { i: '🌿', n: 'Grass' }, water: { i: '💧', n: 'Water' },
  dark: { i: '🌑', n: 'Dark' }, light: { i: '✨', n: 'Light' },
};
const BASIC = ['fire', 'grass', 'water'];
const ADV = { fire: 'grass', grass: 'water', water: 'fire' };
const RARS = ['Common', 'Rare', 'Epic', 'Legendary'];
const RMUL = [1, 1.4, 2, 3];
const EGG = {
  basic: { cost: 50, rar: [70, 22, 7, 1] },
  premium: { cost: 4000, rar: [30, 40, 22, 8], dl: 0.03 },
};
const TRAITS = {
  firststrike: { n: 'First Strike', d: 'Always acts first each round' },
  lifesteal: { n: 'Lifesteal', d: 'Heals 15% of damage dealt' },
  gold: { n: '+Gold', d: 'While on team: +12% coins (idle & wins)' },
  thorns: { n: 'Thorns', d: 'Reflects 35% of damage taken' },
  fury: { n: 'Fury', d: '25% chance to crit for 2x' },
};
const TRAIT_KEYS = Object.keys(TRAITS);
const ICONS = {
  fire: ['🦊', '🐉', '🦎', '🦁'], grass: ['🐸', '🦌', '🐛', '🐢'], water: ['🐙', '🐟', '🦀', '🐬'],
  dark: ['🦇', '🐺', '🦉', '🕷️'], light: ['🦄', '🐇', '🦢', '🕊️'],
};
const SYL = {
  fire: ['Ember', 'Cinder', 'Pyro', 'Blaz', 'Flare', 'Ashen'],
  grass: ['Moss', 'Fern', 'Thorn', 'Leaf', 'Bramb', 'Sprout'],
  water: ['Tide', 'Ripp', 'Aqua', 'Brine', 'Drip', 'Mist'],
  dark: ['Umbr', 'Gloom', 'Void', 'Shade', 'Nyx', 'Dusk'],
  light: ['Lumi', 'Sol', 'Halo', 'Radi', 'Dawn', 'Glim'],
};
const SUF = ['ling', 'ox', 'ix', 'ador', 'ofin', 'ette', 'urk', 'aw', 'yn', 'umba', 'ito', 'ar'];
// fusion by base rarity: success chance and coin cost
const FUSE = [{ p: .8, c: 100 }, { p: .6, c: 600 }, { p: .4, c: 3600 }];
// ascend: reset a run for permanent shards; each shard +1% monster stats, +5% coins
const ASCEND_AT = 25;

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = (r, a) => a[Math.floor(r() * a.length)];
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi']; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + u[i];
}
const fmtRate = n => n < 100 ? n.toFixed(1) : fmt(n);
function weighted(r, w) { let t = w.reduce((a, b) => a + b, 0) * r(); for (let i = 0; i < w.length; i++) { t -= w[i]; if (t < 0) return i; } return w.length - 1; }
function genName(r, el) { const s = pick(r, SYL[el]) + pick(r, SUF); return s[0].toUpperCase() + s.slice(1).toLowerCase(); }

function mult(a, d) {
  const ad = a === 'dark' || a === 'light', dd = d === 'dark' || d === 'light';
  if (ad) return dd ? (a === d ? 1 : 2) : 1.5;
  if (dd) return 1;
  return ADV[a] === d ? 1.5 : ADV[d] === a ? 0.75 : 1;
}

// ---------- state ----------
const fresh = () => ({ v: 1, coins: 100, gen: 0, eggs: [], mons: [], team: [], floor: 1, best: 1, nextId: 1, saved: Date.now(), hatched: 0, changed: 0, cloud: null, shards: 0, ascends: 0, top: 1 });
let S, last, cur = 'home', B = null;

function sanitize(o) {
  if (!o || typeof o !== 'object') throw new Error('bad save');
  const s = fresh(), n = (x, d, mn = 0) => Number.isFinite(x) ? Math.max(mn, x) : d;
  s.coins = n(o.coins, s.coins); s.gen = Math.floor(n(o.gen, 0));
  s.floor = Math.floor(n(o.floor, 1, 1)); s.best = Math.max(s.floor, Math.floor(n(o.best, 1, 1)));
  s.hatched = Math.floor(n(o.hatched, 0)); s.saved = n(o.saved, Date.now());
  s.shards = Math.floor(n(o.shards, 0)); s.ascends = Math.floor(n(o.ascends, 0)); s.top = Math.max(s.best, Math.floor(n(o.top, 1, 1)));
  let maxId = 0;
  s.eggs = (Array.isArray(o.eggs) ? o.eggs : []).filter(e => e && ELS[e.el] && EGG[e.tier]).map(e => { maxId = Math.max(maxId, e.id | 0); return { id: e.id | 0, el: e.el, tier: e.tier }; });
  s.mons = (Array.isArray(o.mons) ? o.mons : []).filter(m => m && ELS[m.el] && TRAITS[m.trait] && m.rar >= 0 && m.rar <= 3 && [m.bh, m.ba, m.sp].every(Number.isFinite)).map(m => {
    maxId = Math.max(maxId, m.id | 0);
    return { id: m.id | 0, name: String(m.name).slice(0, 24), icon: String(m.icon).slice(0, 4), el: m.el, rar: m.rar | 0, trait: m.trait, lvl: Math.min(MAX_LVL, Math.max(1, m.lvl | 0)), bh: m.bh, ba: m.ba, sp: m.sp };
  });
  const ids = new Set(s.mons.map(m => m.id));
  s.team = (Array.isArray(o.team) ? o.team : []).filter((id, i, a) => ids.has(id) && a.indexOf(id) === i).slice(0, 3);
  s.nextId = maxId + 1;
  // changed: last real progress (client clock); cloud: last sync point
  s.changed = n(o.changed, 0);
  s.cloud = o.cloud && typeof o.cloud.at === 'string' ? { at: o.cloud.at.slice(0, 40), local: n(o.cloud.local, 0) } : null;
  return s;
}
function load() { try { const r = localStorage.getItem(SAVE_KEY); if (r) return sanitize(JSON.parse(r)); } catch (e) { } return fresh(); }
function save() { try { tick(); S.saved = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { } }

// ---------- economy ----------
const monById = id => S.mons.find(m => m.id === id);
const teamMons = () => S.team.map(monById).filter(Boolean);
const goldMul = () => 1 + 0.12 * teamMons().filter(m => m.trait === 'gold').length;
const shardCoin = () => 1 + 0.05 * S.shards;
const rate = () => (1 + S.gen) * Math.pow(1.03, S.gen) * (1 + 0.02 * S.mons.length) * (1 + 0.05 * (S.best - 1)) * goldMul() * shardCoin();
const genCost = () => Math.floor(25 * Math.pow(1.2, S.gen));
const lvCost = m => Math.floor(60 * Math.pow(1.2, m.lvl - 1) * RMUL[m.rar]);
const reward = f => Math.floor(15 * Math.pow(1.13, f - 1) * goldMul() * shardCoin());
const shardGain = () => S.best < ASCEND_AT ? 0 : Math.floor(Math.pow(S.best - 20, 1.3) / 4);
function stats(m) { const k = Math.pow(1.045, m.lvl - 1) * (1 + 0.01 * S.shards); return { hp: Math.round(m.bh * k), atk: Math.round(m.ba * k), spd: Math.round(m.sp) }; }

function tick() {
  const now = Date.now(); let dt = now - last; last = now;
  if (dt < 0) dt = 0;
  dt = Math.min(dt, OFFLINE_CAP);
  const gain = rate() * dt / 1000; S.coins += gain;
  if (dt > 60000) toast(`Welcome back! Away ${Math.round(dt / 60000)} min: +🪙${fmt(gain)}`);
  hud();
}
function hud() {
  $('#coins').textContent = fmt(S.coins); $('#rate').textContent = fmtRate(rate()); $('#fl').textContent = S.floor;
  document.querySelectorAll('[data-cost]').forEach(b => b.disabled = S.coins < +b.dataset.cost);
}

// ---------- monsters / eggs ----------
function makeMon(egg) {
  const r = Math.random, rar = weighted(r, EGG[egg.tier].rar), el = egg.el, dl = el === 'dark' || el === 'light';
  const pen = dl ? 0.75 : 1, v = () => 0.9 + r() * 0.2;
  return {
    id: S.nextId++, name: genName(r, el), icon: pick(r, ICONS[el]), el, rar, trait: pick(r, TRAIT_KEYS), lvl: 1,
    bh: 50 * RMUL[rar] * pen * v(), ba: 8 * RMUL[rar] * pen * v(), sp: 8 + r() * 8 + rar,
  };
}
function buyEgg(tier) {
  const c = EGG[tier].cost; if (S.coins < c) return;
  S.coins -= c;
  const el = tier === 'premium' && Math.random() < EGG.premium.dl ? (Math.random() < .5 ? 'dark' : 'light') : pick(Math.random, BASIC);
  S.eggs.push({ id: S.nextId++, el, tier }); save(); render(); toast(`Got a ${ELS[el].i} ${tier} egg`);
}
function card(m, attrs = '', big = false) {
  const s = stats(m);
  return `<div class="mon r${m.rar} ${big ? 'big' : ''}" ${attrs}><div class="ic">${m.icon}</div><b>${esc(m.name)}</b><span>${ELS[m.el].i} ${RARS[m.rar]} · Lv${m.lvl}</span><small>❤${s.hp} ⚔${s.atk} ⚡${s.spd}</small><small class="tr">${TRAITS[m.trait].n}</small></div>`;
}
function hatch(id) {
  const i = S.eggs.findIndex(e => e.id === id); if (i < 0) return;
  const m = makeMon(S.eggs.splice(i, 1)[0]); S.mons.push(m); S.hatched++; save();
  modal(`<div class="hatch"><div class="egg">🥚</div><p>Hatching…</p></div>`, true);
  setTimeout(() => { modal(`<h3>It hatched!</h3>${card(m, '', true)}<p>${TRAITS[m.trait].d}</p><button data-act="close">Nice</button>`); render(); }, 900);
}
function hatchAll() {
  if (!S.eggs.length) return;
  const got = S.eggs.map(e => makeMon(e)); S.eggs = []; S.mons.push(...got); S.hatched += got.length; save(); render();
  modal(`<h3>Hatched ${got.length}</h3><div class="grid">${got.map(m => card(m)).join('')}</div><button data-act="close">Nice</button>`);
}

// ---------- fusion ----------
// two monsters of same element + rarity -> base goes up one rarity; fodder is always consumed
const fuseOk = (a, b) => a && b && a !== b && a.el === b.el && a.rar === b.rar && a.rar < 3;
const fuseChance = (a, b) => Math.min(.95, FUSE[a.rar].p + (a.lvl + b.lvl - 2) * .005);
function fuseMenu(id) {
  const a = monById(id); if (!a || a.rar >= 3) return;
  const l = S.mons.filter(b => fuseOk(a, b)).sort((x, y) => y.lvl - x.lvl);
  modal(`<h3>Fuse ${esc(a.name)} → ${RARS[a.rar + 1]}</h3><p>Pick a ${ELS[a.el].i} ${RARS[a.rar]} to sacrifice. It is lost even if fusion fails.</p>
    ${l.length ? `<div class="grid">${l.map(b => card(b, `data-act="fuseask" data-a="${a.id}" data-b="${b.id}"`)).join('')}</div>` : '<p>No matching monster.</p>'}
    <button class="btn alt" data-act="mon" data-id="${a.id}">Back</button>`);
}
function fuseAsk(aId, bId) {
  const a = monById(aId), b = monById(bId); if (!fuseOk(a, b)) return;
  const c = FUSE[a.rar].c;
  modal(`<h3>Fuse?</h3><div class="grid">${card(a)}${card(b)}</div>
    <p>Success: <b>${Math.round(fuseChance(a, b) * 100)}%</b> → ${esc(a.name)} becomes ${RARS[a.rar + 1]} (stats ×${(RMUL[a.rar + 1] / RMUL[a.rar]).toFixed(2)}).<br>Fail: ${esc(b.name)} is lost, ${esc(a.name)} unchanged.</p>
    <button data-act="fuse" data-a="${a.id}" data-b="${b.id}" data-cost="${c}">Fuse · 🪙${fmt(c)}</button>
    <button class="btn alt" data-act="fusemenu" data-id="${a.id}">Back</button>`);
}
function fuse(aId, bId) {
  const a = monById(aId), b = monById(bId); if (!fuseOk(a, b)) return;
  const c = FUSE[a.rar].c; if (S.coins < c) return;
  S.coins -= c;
  const ok = Math.random() < fuseChance(a, b);
  S.mons = S.mons.filter(m => m !== b); S.team = S.team.filter(id => id !== b.id);
  if (ok) { const k = RMUL[a.rar + 1] / RMUL[a.rar]; a.rar++; a.bh *= k; a.ba *= k; a.sp += 1; a.lvl = Math.max(a.lvl, b.lvl); }
  save(); render();
  modal(`<div class="hatch"><div class="egg">🌀</div><p>Fusing…</p></div>`, true);
  setTimeout(() => modal(`<h3>${ok ? 'Fusion succeeded!' : 'Fusion failed'}</h3>${card(a, '', true)}<p>${ok ? `${esc(a.name)} is now ${RARS[a.rar]}.` : `${esc(b.name)} was lost.`}</p><button data-act="close">OK</button>`), 1000);
}

// ---------- ascend ----------
function ascend() {
  const g = shardGain(); if (!g || B) return;
  if (!confirm(`Ascend for 💎${g}?\n\nResets coins, generator, floor and monster levels.\nKeeps monsters, rarity, eggs and shards.`)) return;
  S.shards += g; S.ascends++; S.top = Math.max(S.top, S.best);
  S.coins = 100; S.gen = 0; S.floor = 1; S.best = 1;
  S.mons.forEach(m => m.lvl = 1);
  save(); render(); toast(`Ascended! 💎${S.shards} total`);
}

// ---------- battle ----------
function enemies(f) {
  const r = mulberry(f * 7919 + 13), boss = f % 10 === 0, k = (boss ? 1.3 : 1) * Math.min(1, .5 + f * .07), dl = Math.min(.5, Math.max(0, (f - 15) * .03));
  return [0, 1, 2].map(() => {
    const el = r() < dl ? (r() < .5 ? 'dark' : 'light') : pick(r, BASIC);
    const pen = el === 'dark' || el === 'light' ? 0.8 : 1;
    const hp = Math.round(50 * Math.pow(1.125, f) * k * pen * (.9 + r() * .2)), atk = Math.round(7 * Math.pow(1.085, f) * k * pen * (.9 + r() * .2));
    return { side: 'e', name: genName(r, el), icon: pick(r, ICONS[el]), el, hp, maxhp: hp, atk, spd: Math.round(8 + r() * 8 + f * .2), trait: null };
  });
}
function simulate(U) {
  const ev = [], alive = s => U.some(u => u.side === s && u.hp > 0);
  for (let round = 1; round <= 60; round++) {
    const key = u => u.spd + (u.trait === 'firststrike' ? 1000 : 0);
    for (const a of U.filter(u => u.hp > 0).sort((x, y) => key(y) - key(x))) {
      if (a.hp <= 0) continue;
      const foes = U.filter(u => u.side !== a.side && u.hp > 0); if (!foes.length) break;
      const d = foes[Math.floor(Math.random() * foes.length)], m = mult(a.el, d.el), crit = a.trait === 'fury' && Math.random() < .25;
      const dmg = Math.max(1, Math.round(a.atk * m * (.9 + Math.random() * .2) * (crit ? 2 : 1)));
      d.hp = Math.max(0, d.hp - dmg);
      let heal = 0, thorn = 0;
      if (a.trait === 'lifesteal') { heal = Math.round(dmg * .15); a.hp = Math.min(a.maxhp, a.hp + heal); }
      if (d.trait === 'thorns') { thorn = Math.max(1, Math.round(dmg * .35)); a.hp = Math.max(0, a.hp - thorn); }
      ev.push({ a: U.indexOf(a), d: U.indexOf(d), dmg, m, crit, heal, thorn, hp: U.map(u => u.hp) });
      if (!alive('p') || !alive('e')) return { win: alive('p') && !alive('e'), ev };
    }
  }
  return { win: false, ev };
}
function fight() {
  const tm = teamMons(); if (!tm.length || B) return;
  const P = tm.map(m => { const s = stats(m); return { side: 'p', name: m.name, icon: m.icon, el: m.el, hp: s.hp, maxhp: s.hp, atk: s.atk, spd: s.spd, trait: m.trait }; });
  const U = [...enemies(S.floor), ...P], init = U.map(u => u.hp), f = S.floor;
  const res = simulate(U), rw = res.win ? reward(f) : 0;
  if (res.win) { S.coins += rw; S.floor++; S.best = Math.max(S.best, S.floor); }
  save();
  B = { U, init, ev: res.ev, idx: 0, win: res.win, rw, f, cur: init, log: [], done: false, t: 0 };
  render(); B.t = setInterval(step, 450 / speed);
}
// battle playback speed, per device
let speed = 1;
try { speed = [1, 2, 4].includes(+localStorage.getItem('imt_speed')) ? +localStorage.getItem('imt_speed') : 1; } catch (e) { }
function cycleSpeed() {
  speed = speed === 4 ? 1 : speed * 2;
  try { localStorage.setItem('imt_speed', speed); } catch (e) { }
  if (B && !B.done) { clearInterval(B.t); B.t = setInterval(step, 450 / speed); }
  const b = $('#spd'); if (b) b.textContent = speed + '×';
}
function logLine(e) {
  const a = B.U[e.a], d = B.U[e.d];
  return `${a.icon} ${esc(a.name)} ➜ ${d.icon} ${esc(d.name)} −${e.dmg}${e.m > 1 ? ' 💥' : e.m < 1 ? ' 🛡' : ''}${e.crit ? ' ⚡CRIT' : ''}${e.heal ? ` +${e.heal}❤` : ''}${e.thorn ? ` (thorns −${e.thorn})` : ''}`;
}
function apply(e, anim) {
  B.cur = e.hp; B.log.push(logLine(e));
  if (cur !== 'tower') return;
  e.hp.forEach((h, i) => paintUnit(i, h));
  const lg = $('#log'); if (lg) { lg.insertAdjacentHTML('beforeend', `<div>${B.log[B.log.length - 1]}</div>`); lg.scrollTop = 1e9; }
  if (anim) {
    const du = $('#u' + e.d), au = $('#u' + e.a);
    if (au) { au.classList.add('atk'); setTimeout(() => au.classList.remove('atk'), 200); }
    if (du) {
      du.classList.remove('hit'); void du.offsetWidth; du.classList.add('hit');
      const b = du.getBoundingClientRect(), p = document.createElement('div');
      p.className = 'pop'; p.textContent = '-' + e.dmg; p.style.cssText = `left:${b.left + b.width / 2 - 10}px;top:${b.top}px;color:${e.m > 1 ? '#ffcf4a' : '#fff'}`;
      document.body.appendChild(p); setTimeout(() => p.remove(), 700);
    }
  }
}
function paintUnit(i, h) {
  const u = $('#u' + i); if (!u) return;
  u.classList.toggle('dead', h <= 0);
  u.querySelector('.bar i').style.width = Math.max(0, h / B.U[i].maxhp * 100) + '%';
  u.querySelector('.hp').textContent = Math.max(0, h) + '/' + B.U[i].maxhp;
}
function step() {
  if (!B) return;
  if (B.idx >= B.ev.length) return finishBattle();
  apply(B.ev[B.idx++], true);
}
function skip() { if (!B || B.done) return; clearInterval(B.t); while (B.idx < B.ev.length) apply(B.ev[B.idx++], false); finishBattle(); }
function finishBattle() { clearInterval(B.t); B.done = true; if (cur === 'tower') render(); }

function arenaUnit(u, i) {
  return `<div class="unit el-${u.el}${B.cur[i] <= 0 ? ' dead' : ''}" id="u${i}"><div class="ic">${u.icon}</div><div class="nm">${ELS[u.el].i} ${esc(u.name)}</div><div class="bar"><i style="width:${Math.max(0, B.cur[i] / u.maxhp * 100)}%"></i></div><small class="hp">${Math.max(0, B.cur[i])}/${u.maxhp}</small></div>`;
}
function vArena() {
  const res = B.done ? `<div class="res ${B.win ? 'win' : 'lose'}"><h2>${B.win ? 'Victory! +🪙' + fmt(B.rw) : 'Defeated'}</h2><p>${B.win ? `Floor ${B.f} cleared.` : `Floor ${B.f} held. Level up or change your team.`}</p><button class="btn" data-act="cont">${B.win ? 'Next floor' : 'Retry'}</button></div>` : '';
  return `<h2>Floor ${B.f}</h2><div class="row">${B.U.slice(0, 3).map((u, i) => arenaUnit(u, i)).join('')}</div>
  <div class="row">${B.U.slice(3).map((u, i) => arenaUnit(u, i + 3)).join('')}</div>
  <div class="log" id="log">${B.log.map(l => `<div>${l}</div>`).join('')}</div>
  ${B.done ? res : `<div class="ctl"><button class="btn alt" id="spd" data-act="speed">${speed}×</button><button data-act="skip">Skip ⏩</button></div>`}`;
}

// ---------- views ----------
function vHome() {
  const eg = S.eggs.map(e => `<button class="egg-i ${e.tier}" data-act="hatch" data-id="${e.id}">🥚<span class="eb">${ELS[e.el].i}</span></button>`).join('');
  return `<section class="card"><h3>⚙️ Generator Lv ${S.gen}</h3><p>+1 coin/s per level. Each monster owned: +2% income.</p>
    <button data-act="gen" data-cost="${genCost()}">Upgrade · 🪙${fmt(genCost())}</button></section>
  <section class="card"><h3>🥚 Egg shop</h3><div class="shop">
    <div><div class="eggb">🥚</div><b>Basic</b><small>Fire / Grass / Water</small><button data-act="buy" data-tier="basic" data-cost="${EGG.basic.cost}">🪙${EGG.basic.cost}</button></div>
    <div class="prem"><div class="eggb">🪺</div><b>Premium</b><small>3% Dark/Light · better rarity</small><button data-act="buy" data-tier="premium" data-cost="${EGG.premium.cost}">🪙${fmt(EGG.premium.cost)}</button></div>
  </div></section>
  <section class="card"><h3>Your eggs (${S.eggs.length})</h3><small>Element shown. Rarity & trait revealed on hatch.</small>
    <div class="eggs">${eg || '<p>No eggs. Buy one above.</p>'}</div>
    ${S.eggs.length > 1 ? '<button data-act="hatchall">Hatch all</button>' : ''}</section>`;
}
function vMons() {
  if (!S.mons.length) return '<p>No monsters yet. Buy and hatch an egg on Home.</p>';
  const pw = m => { const s = stats(m); return s.hp * s.atk; };
  const by = { rar: (a, b) => b.rar - a.rar || b.lvl - a.lvl, lvl: (a, b) => b.lvl - a.lvl || b.rar - a.rar, pow: (a, b) => pw(b) - pw(a) }[monSort];
  const l = S.mons.filter(m => monEl === 'all' || m.el === monEl).sort((a, b) => by(a, b) || a.id - b.id);
  const chip = (act, k, v, label) => `<button class="${v === k ? 'on' : ''}" data-act="${act}" data-k="${k}">${label}</button>`;
  return `<div class="chips">${chip('monel', 'all', monEl, 'All')}${Object.keys(ELS).map(e => chip('monel', e, monEl, ELS[e].i)).join('')}</div>
  <div class="chips">${chip('monsort', 'rar', monSort, 'Rarity')}${chip('monsort', 'lvl', monSort, 'Level')}${chip('monsort', 'pow', monSort, 'Power')}</div>
  <p>${l.length} of ${S.mons.length} · tap for details, level up, fuse</p><div class="grid">${l.map(m => card(m, `data-act="mon" data-id="${m.id}"`)).join('')}</div>`;
}
let monEl = 'all', monSort = 'rar';
function vTower() {
  if (B) return vArena();
  const E = enemies(S.floor), boss = S.floor % 10 === 0;
  const slots = [0, 1, 2].map(i => { const m = monById(S.team[i]); return m ? card(m, `data-act="slot" data-i="${i}"`) : `<div class="mon empty" data-act="slot" data-i="${i}">＋</div>`; }).join('');
  return `<h2>Floor ${S.floor} ${boss ? '<span class="boss">BOSS</span>' : ''}</h2><small>Best: ${S.best} · Reward 🪙${fmt(reward(S.floor))}</small>
  <h3 style="margin-top:8px">Enemies</h3>
  <div class="row">${E.map(u => `<div class="unit el-${u.el}"><div class="ic">${u.icon}</div><div class="nm">${ELS[u.el].i} ${ELS[u.el].n}</div><small>❤${u.hp} ⚔${u.atk}</small></div>`).join('')}</div>
  <h3>Your team</h3><div class="row">${slots}</div>
  <div class="ctl"><button data-act="fight" ${S.team.length ? '' : 'disabled'}>⚔️ Fight</button><button class="btn alt" data-act="auto" style="background:#ffffff22;color:inherit">Auto-pick best</button></div>
  <p class="legend">🔥 > 🌿 > 💧 > 🔥 ×1.5 (weak ×0.75)<br>🌑 / ✨: ×1.5 vs basics, ×2 vs each other</p>
  <section class="card"><h3>🌀 Ascend · 💎${S.shards}</h3>
    <p>Each 💎: +1% monster stats, +5% coins. Ascending resets coins, generator, floor and levels. Monsters, rarity and eggs stay.</p>
    ${shardGain() ? `<button data-act="ascend">Ascend for 💎${shardGain()}</button>` : `<p>Unlocks at floor ${ASCEND_AT}.${S.top > 1 ? ` All-time best: ${S.top}.` : ''}</p>`}</section>`;
}
function vSet() {
  return `${syncPanel()}<section class="card"><h3>Save code</h3><p>Copy to back up or move to another device.</p>
    <textarea id="exp" readonly></textarea><div class="ctl"><button data-act="copy">Copy</button></div></section>
  <section class="card"><h3>Import</h3><textarea id="imp" placeholder="Paste save code (IMT1:…)"></textarea><div class="ctl"><button data-act="import">Import (replaces current)</button></div></section>
  <section class="card"><h3>About</h3><p>Offline earnings capped at 8h. Works offline once loaded. Hatched: ${S.hatched}.</p>
    <div class="ctl"><button data-act="reset" style="background:var(--bad);color:#fff">Reset all progress</button></div></section>`;
}
const exportCode = () => { save(); return 'IMT1:' + btoa(unescape(encodeURIComponent(JSON.stringify(S)))); };

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === cur));
  $('#view').innerHTML = { home: vHome, mons: vMons, tower: vTower, set: vSet }[cur]();
  if (cur === 'set') $('#exp').value = exportCode();
  hud();
}

// ---------- ui ----------
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2600); }
function modal(html, lock) { const m = $('#modal'); m.innerHTML = `<div class="modal">${html}</div>`; m.hidden = false; m.dataset.lock = lock ? '1' : ''; hud(); }
function closeModal() { $('#modal').hidden = true; }
function detail(id) {
  const m = monById(id); if (!m) return;
  const maxed = m.lvl >= MAX_LVL;
  modal(`${card(m, '', true)}<p>${TRAITS[m.trait].n}: ${TRAITS[m.trait].d}</p>
    ${maxed ? '<p>Max level</p>' : `<button data-act="lvl" data-id="${m.id}" data-cost="${lvCost(m)}">Level up · 🪙${fmt(lvCost(m))}</button>`}
    ${m.rar < 3 ? `<button data-act="fusemenu" data-id="${m.id}">Fuse → ${RARS[m.rar + 1]}</button>` : ''}
    <button class="btn alt" data-act="close">Close</button>`);
}
function picker(i) {
  const l = S.mons.filter(m => !S.team.includes(m.id)).sort((a, b) => b.rar - a.rar || b.lvl - a.lvl);
  modal(`<h3>Slot ${i + 1}</h3>${l.length ? `<div class="grid">${l.map(m => card(m, `data-act="pick" data-id="${m.id}" data-i="${i}"`)).join('')}</div>` : '<p>No free monsters.</p>'}
    ${S.team[i] ? `<button data-act="clear" data-i="${i}">Remove from slot</button>` : ''}<button class="btn alt" data-act="close" style="background:#ffffff22;color:inherit">Cancel</button>`);
}
function autoPick() {
  const pw = m => { const s = stats(m); return s.hp * s.atk; };
  S.team = [...S.mons].sort((a, b) => pw(b) - pw(a)).slice(0, 3).map(m => m.id); save(); render();
}

const ACT = {
  tab: d => { if (d.t === 'tower' || cur !== d.t) { cur = d.t; render(); } },
  buy: d => buyEgg(d.tier),
  gen: () => { const c = genCost(); if (S.coins < c) return; S.coins -= c; S.gen++; save(); render(); },
  hatch: d => hatch(+d.id),
  hatchall: hatchAll,
  mon: d => detail(+d.id),
  fusemenu: d => fuseMenu(+d.id),
  fuseask: d => fuseAsk(+d.a, +d.b),
  fuse: d => fuse(+d.a, +d.b),
  lvl: d => { const m = monById(+d.id); if (!m || m.lvl >= MAX_LVL) return; const c = lvCost(m); if (S.coins < c) return; S.coins -= c; m.lvl++; save(); detail(m.id); render(); },
  slot: d => picker(+d.i),
  pick: d => { S.team[+d.i] = +d.id; S.team = S.team.filter(Boolean); save(); closeModal(); render(); },
  clear: d => { S.team.splice(+d.i, 1); save(); closeModal(); render(); },
  auto: autoPick,
  fight,
  skip,
  speed: cycleSpeed,
  ascend,
  monel: d => { monEl = d.k; render(); },
  monsort: d => { monSort = d.k; render(); },
  cont: () => { B = null; render(); },
  close: closeModal,
  copy: () => { const t = $('#exp'); t.select(); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => toast('Copied'), () => { document.execCommand('copy'); toast('Copied'); }); },
  import: () => {
    try {
      const c = $('#imp').value.replace(/\s+/g, '');
      if (!c.startsWith('IMT1:')) throw new Error('prefix');
      const s = sanitize(JSON.parse(decodeURIComponent(escape(atob(c.slice(5))))));
      if (!confirm('Replace current progress with this save?' + (auth ? ' The cloud save is overwritten on next sync.' : ''))) return;
      s.saved = Date.now(); s.cloud = S.cloud; S = s; B = null; last = Date.now(); save(); render(); toast('Save imported');
    } catch (e) { toast('Invalid save code'); }
  },
  reset: () => {
    if (!confirm('Delete ALL progress?' + (auth ? ' The cloud save is overwritten on next sync.' : ''))) return;
    const c = S.cloud; S = fresh(); S.cloud = c; B = null; last = Date.now(); save(); render();
  },
};
// acts that change progress; marks the save dirty for cloud sync
const MUTATE = new Set(['buy', 'gen', 'hatch', 'hatchall', 'lvl', 'pick', 'clear', 'auto', 'fight', 'fuse', 'import', 'reset', 'ascend']);
document.addEventListener('click', e => {
  if (e.target.id === 'modal' && !e.target.dataset.lock) return closeModal();
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, f = ACT[a]; if (!f) return;
  f(b.dataset);
  if (MUTATE.has(a)) { S.changed = Date.now(); save(); }
});

// ---------- boot ----------
S = load(); last = S.saved; tick(); render();
setInterval(tick, 250);
setInterval(save, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else tick(); });
addEventListener('pagehide', save);
syncBoot();

// ---------- updates ----------
// a new sw.js version installs in the background; offer a reload instead of waiting for the next launch
let newWorker = null;
let wantReload = false;
ACT.update = () => { save(); wantReload = true; if (newWorker) newWorker.postMessage('skip'); };
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  const offer = w => {
    if (!w || !navigator.serviceWorker.controller) return;
    newWorker = w; $('#upd').hidden = false;
  };
  navigator.serviceWorker.register('sw.js').then(reg => {
    offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => { }); });
  }).catch(() => { });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if ((hadController || wantReload) && !reloading) { reloading = true; location.reload(); } });
}
