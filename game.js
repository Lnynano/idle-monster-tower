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
  if (ad) return dd ? (a === d ? 1 : 2.5) : 1.75;
  if (dd) return 1;
  return ADV[a] === d ? 2 : ADV[d] === a ? 0.6 : 1;
}

// ---------- state ----------
const fresh = () => ({ v: 1, coins: 100, gen: 0, eggs: [], mons: [], team: [], floor: 1, best: 1, nextId: 1, saved: Date.now(), hatched: 0, changed: 0, cloud: null, shards: 0, ascends: 0, top: 1,
  seen: [], quest: 0, ach: [], fusions: 0, fed: 0, sweepAt: 0, daily: '', streak: 0, exp: [], trialDay: '' });
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
    return { id: m.id | 0, name: String(m.name).slice(0, 24), icon: String(m.icon).slice(0, 4), el: m.el, rar: m.rar | 0, trait: m.trait, lvl: Math.min(MAX_LVL, Math.max(1, m.lvl | 0)), bh: m.bh, ba: m.ba, sp: m.sp, lock: !!m.lock, xp: Math.max(0, Number(m.xp) || 0) };
  });
  const ids = new Set(s.mons.map(m => m.id));
  s.team = (Array.isArray(o.team) ? o.team : []).filter((id, i, a) => ids.has(id) && a.indexOf(id) === i).slice(0, 3);
  s.nextId = maxId + 1;
  // changed: last real progress (client clock); cloud: last sync point
  s.changed = n(o.changed, 0);
  s.cloud = o.cloud && typeof o.cloud.at === 'string' ? { at: o.cloud.at.slice(0, 40), local: n(o.cloud.local, 0) } : null;
  const strs = (a, ok) => [...new Set((Array.isArray(a) ? a : []).filter(x => typeof x === 'string' && ok(x)))];
  s.seen = strs(o.seen, x => SPECIES.includes(x)); s.mons.forEach(m => { const k = m.el + ':' + m.icon; if (SPECIES.includes(k) && !s.seen.includes(k)) s.seen.push(k); });
  s.ach = strs(o.ach, x => ACH.some(a => a.id === x));
  s.quest = Math.min(QUESTS.length, Math.floor(n(o.quest, 0))); s.fusions = Math.floor(n(o.fusions, 0)); s.fed = Math.floor(n(o.fed, 0));
  s.sweepAt = n(o.sweepAt, 0); s.daily = typeof o.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.daily) ? o.daily : ''; s.streak = Math.floor(n(o.streak, 0));
  s.trialDay = typeof o.trialDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.trialDay) ? o.trialDay : '';
  // expeditions: only known trip types, only monsters that still exist, never a team member
  const used = new Set();
  s.exp = (Array.isArray(o.exp) ? o.exp : []).filter(x => x && EXP[x.k] && Array.isArray(x.mons) && Number.isFinite(x.start)).slice(0, 3).map(x => ({
    k: x.k, start: x.start, coins: n(x.coins, 0), egg: EXP[x.k].egg, mons: x.mons.filter(id => ids.has(id) && !used.has(id) && !s.team.includes(id) && used.add(id)).slice(0, 3),
  })).filter(x => x.mons.length);
  return s;
}
function load() { try { const r = localStorage.getItem(SAVE_KEY); if (r) return sanitize(JSON.parse(r)); } catch (e) { } return fresh(); }
function save() { try { tick(); S.saved = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { } }

// ---------- economy ----------
const monById = id => S.mons.find(m => m.id === id);
const teamMons = () => S.team.map(monById).filter(Boolean);
const goldMul = () => 1 + 0.12 * teamMons().filter(m => m.trait === 'gold').length;
const shardCoin = () => 1 + 0.05 * S.shards;
const rate = () => (1 + S.gen) * Math.pow(1.03, S.gen) * (1 + 0.05 * S.seen.length) * (1 + 0.05 * (S.best - 1)) * goldMul() * shardCoin();
const genCostAt = g => Math.floor(25 * Math.pow(1.2, g));
const lvCostAt = (m, l) => Math.floor(60 * Math.pow(1.2, l - 1) * RMUL[m.rar]);
const genCost = () => genCostAt(S.gen);
const lvCost = m => lvCostAt(m, m.lvl);
// buy quantity (x1 / x10 / max), per device
let qty = 1;
try { const q = localStorage.getItem('imt_qty'); qty = q === 'max' ? 'max' : q === '10' ? 10 : 1; } catch (e) { }
// how many steps the current qty buys from `from` (capped), and their total cost; never 0 so the button shows a price
function bulk(costAt, from, cap = Infinity) {
  const n = qty === 'max' ? Infinity : qty; let k = 0, c = 0;
  while (k < n && from + k < cap) { const x = costAt(from + k); if (qty === 'max' && c + x > S.coins && k) break; c += x; k++; if (qty === 'max' && c > S.coins) break; }
  return { k, c };
}
const qtyChips = () => `<div class="chips qty">${[1, 10, 'max'].map(q => `<button class="${qty === q ? 'on' : ''}" data-act="qty" data-k="${q}">${q === 'max' ? 'Max' : '×' + q}</button>`).join('')}</div>`;
// ---------- sound ----------
// tiny WebAudio synth, no audio files; browsers only allow it after the first tap. Mute is per device.
let ac = null, muted = false;
try { muted = localStorage.getItem('imt_mute') === '1'; } catch (e) { }
function tone(f, d = .1, type = 'square', v = .05, slide = 0, delay = 0) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + .02);
  } catch (e) { }
}
const SFX = {
  buy: () => { tone(880, .06, 'square', .035); tone(1320, .08, 'square', .035, 0, .05); },
  coin: () => [988, 1319, 1568].forEach((f, i) => tone(f, .09, 'square', .035, 0, i * .06)),
  hit: () => tone(200, .08, 'sawtooth', .04, -110),
  big: () => { tone(320, .14, 'sawtooth', .06, -220); tone(1100, .07, 'square', .03, 0, .02); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, 'triangle', .08, 0, i * .1)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, .24, 'triangle', .07, 0, i * .15)),
  hatch: r => [440, 554, 659, 880, 1109, 1319].slice(0, 2 + r).forEach((f, i) => tone(f, .2, 'triangle', .08, 0, i * .09)),
};
const vib = p => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) { } };
// a win pays ~45s of mine income on top of the floor's base; boss floors triple it
const reward = f => Math.floor((15 * Math.pow(1.13, f - 1) * goldMul() * shardCoin() + rate() * 45) * (f % 10 === 0 ? 3 : 1));
const shardGain = () => S.best < ASCEND_AT ? 0 : Math.floor(Math.pow(S.best - 20, 1.3) / 4);
const stats = m => statsAt(m, m.lvl);
function statsAt(m, lvl) { const k = Math.pow(1.045, lvl - 1) * (1 + 0.01 * S.shards); return { hp: Math.round(m.bh * k), atk: Math.round(m.ba * k), spd: Math.round(m.sp) }; }

function tick() {
  const now = Date.now(); let dt = now - last; last = now;
  if (dt < 0) dt = 0;
  dt = Math.min(dt, OFFLINE_CAP);
  const gain = rate() * dt / 1000; S.coins += gain;
  if (dt > 300000) {
    // auto-climb keeps going while away: one floor per minute, up to 25, until a loss
    let climbed = '';
    if (climb && teamMons().length && !B) {
      const f0 = S.floor; let coins = 0, eggs = 0;
      for (let n = Math.min(25, Math.floor(dt / 60000)); n > 0; n--) { const r = resolveFight(); if (!r.win) break; coins += r.rw; if (r.chest) eggs++; }
      if (S.floor > f0) climbed = `<p style="text-align:center">🔁 Auto-climb cleared floor${S.floor - f0 > 1 ? `s ${f0}–${S.floor - 1}` : ' ' + f0}<br>+🪙${fmt(coins)}${eggs ? ` · +${eggs} 🪺` : ''}</p>`;
      else climbed = `<p style="text-align:center">🔁 Auto-climb couldn't beat floor ${f0} yet.</p>`;
    }
    const h = Math.floor(dt / 3600e3), mi = Math.round(dt % 3600e3 / 60000);
    modal(`<h3>Welcome back!</h3><div class="reveal"><div class="eggb">⛏️</div></div>
      <p style="text-align:center">Away ${h ? h + 'h ' : ''}${mi}m${dt >= OFFLINE_CAP ? ' (8h max)' : ''}. Your mine earned:</p>
      <div class="big-num" style="text-align:center">+🪙${fmt(gain)}</div>${climbed}<button data-act="close">Collect</button>`);
  } else if (dt > 60000) toast(`Welcome back! +🪙${fmt(gain)}`);
  hud();
}
function hud() {
  $('#coins').textContent = fmt(S.coins); $('#rate').textContent = '+' + fmtRate(rate()) + '/s';
  $('#fl').textContent = S.floor; $('#shards').textContent = S.shards;
  document.querySelectorAll('[data-cost]').forEach(b => b.disabled = S.coins < +b.dataset.cost);
  const dot = (t, on) => { const b = $(`#tabs [data-t="${t}"]`); if (b) b.classList.toggle('dot', on); };
  const goal = QUESTS[S.quest] && QUESTS[S.quest].done();
  dot('home', S.eggs.length > 0 || S.coins >= genCost() || goal || dailyReady() || ACH.some(achReady) || expReady());
  dot('mons', canFuseAny());
  dot('tower', !!shardGain() || goal || trialReady() || (S.best > 1 && Date.now() >= S.sweepAt) || (!B && !S.team.length && S.mons.length > 0));
}
// any two unlocked-fodder monsters of same element + rarity below Legendary
function canFuseAny() {
  const n = {};
  for (const m of S.mons) if (m.rar < 3) { const k = m.el + m.rar; n[k] = (n[k] || 0) + 1; if (n[k] > 1 && S.mons.some(o => o !== m && !o.lock && o.el === m.el && o.rar === m.rar)) return true; }
  return false;
}

// ---------- creature art ----------
// procedural SVG monsters: species (element + icon slot) picks the body plan, the individual seed varies details
const PAL = {
  fire: ['#ff7a3d', '#ffc89a', '#a8321a'], grass: ['#5ccf6a', '#d2f5b4', '#2c7a3a'], water: ['#4aa8ff', '#cdeaff', '#24589a'],
  dark: ['#8a6cff', '#d6caff', '#3b2a80'], light: ['#ffd84a', '#fff6cf', '#a8801a'],
};
function hashStr(t) { let h = 2166136261; for (const c of String(t)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; }
function art(el, icon, seed, rar = 0) {
  const r = mulberry(seed), [c, lt, dk] = PAL[el], sp = Math.max(0, ICONS[el].indexOf(icon));
  // body plans: round, tall, wide, pear
  const P = [[50, 60, 30, 28], [50, 58, 24, 33], [50, 64, 35, 24], [50, 61, 27, 30]][sp];
  const cx = P[0], cy = P[1], rx = P[2] * (.92 + r() * .16), ry = P[3] * (.92 + r() * .16);
  const top = cy - ry, eyeY = cy - ry * .28, eyeR = 4 + r() * 3, gap = rx * (.34 + r() * .14), cyc = r() < .12, f = n => n.toFixed(1);
  let o = '';
  // element crest behind the body
  if (el === 'fire') o += `<path d="M${f(cx - 12)} ${f(top + 6)}Q${f(cx - 9)} ${f(top - 16)} ${cx} ${f(top - 22)}Q${f(cx - 2)} ${f(top - 8)} ${f(cx + 6)} ${f(top - 15)}Q${f(cx + 13)} ${f(top - 4)} ${f(cx + 12)} ${f(top + 6)}Z" fill="${c}" stroke="${dk}" stroke-width="2"/><path d="M${f(cx - 6)} ${f(top + 6)}Q${f(cx - 3)} ${f(top - 7)} ${f(cx + 1)} ${f(top - 11)}Q${f(cx + 4)} ${f(top - 2)} ${f(cx + 7)} ${f(top + 6)}Z" fill="#ffe08a"/>`;
  if (el === 'grass') o += `<path d="M${cx} ${f(top + 4)}C${f(cx - 4)} ${f(top - 14)} ${f(cx - 20)} ${f(top - 16)} ${f(cx - 24)} ${f(top - 6)}C${f(cx - 14)} ${f(top - 2)} ${f(cx - 6)} ${top} ${cx} ${f(top + 4)}Z" fill="${dk}"/><path d="M${cx} ${f(top + 4)}C${f(cx + 4)} ${f(top - 16)} ${f(cx + 18)} ${f(top - 20)} ${f(cx + 22)} ${f(top - 10)}C${f(cx + 14)} ${f(top - 4)} ${f(cx + 6)} ${top} ${cx} ${f(top + 4)}Z" fill="${c}" stroke="${dk}" stroke-width="2"/>`;
  if (el === 'water') o += `<path d="M${f(cx - 8)} ${f(top + 5)}Q${cx} ${f(top - 20)} ${f(cx + 15)} ${f(top - 12)}Q${f(cx + 6)} ${f(top - 2)} ${f(cx + 8)} ${f(top + 6)}Z" fill="${dk}"/><path d="M${f(cx - rx + 3)} ${cy}Q${f(cx - rx - 14)} ${cy - 6} ${f(cx - rx - 9)} ${cy + 10}Z" fill="${dk}"/><path d="M${f(cx + rx - 3)} ${cy}Q${f(cx + rx + 14)} ${cy - 6} ${f(cx + rx + 9)} ${cy + 10}Z" fill="${dk}"/>`;
  if (el === 'dark') o += `<path d="M${f(cx - rx * .6)} ${f(top + 8)}L${f(cx - rx * .95)} ${f(top - 14)}L${f(cx - rx * .2)} ${f(top + 3)}Z" fill="${dk}"/><path d="M${f(cx + rx * .6)} ${f(top + 8)}L${f(cx + rx * .95)} ${f(top - 14)}L${f(cx + rx * .2)} ${f(top + 3)}Z" fill="${dk}"/><path d="M${f(cx - rx + 2)} ${cy - 4}Q${f(cx - rx - 20)} ${cy - 20} ${f(cx - rx - 16)} ${cy + 8}Q${f(cx - rx - 7)} ${cy} ${f(cx - rx + 2)} ${cy + 6}Z" fill="${dk}" opacity=".9"/><path d="M${f(cx + rx - 2)} ${cy - 4}Q${f(cx + rx + 20)} ${cy - 20} ${f(cx + rx + 16)} ${cy + 8}Q${f(cx + rx + 7)} ${cy} ${f(cx + rx - 2)} ${cy + 6}Z" fill="${dk}" opacity=".9"/>`;
  if (el === 'light') o += `<ellipse cx="${cx}" cy="${f(top - 8)}" rx="13" ry="4" fill="none" stroke="#ffe46b" stroke-width="3"/><path d="M${f(cx - rx + 2)} ${cy - 6}Q${f(cx - rx - 20)} ${cy - 24} ${f(cx - rx - 15)} ${cy + 5}Z" fill="#fff" stroke="${dk}" stroke-width="1.5"/><path d="M${f(cx + rx - 2)} ${cy - 6}Q${f(cx + rx + 20)} ${cy - 24} ${f(cx + rx + 15)} ${cy + 5}Z" fill="#fff" stroke="${dk}" stroke-width="1.5"/>`;
  // feet, body, belly
  o += `<ellipse cx="${f(cx - rx * .45)}" cy="${f(cy + ry - 2)}" rx="7" ry="5" fill="${dk}"/><ellipse cx="${f(cx + rx * .45)}" cy="${f(cy + ry - 2)}" rx="7" ry="5" fill="${dk}"/>`;
  o += `<ellipse cx="${cx}" cy="${cy}" rx="${f(rx)}" ry="${f(ry)}" fill="${c}" stroke="${dk}" stroke-width="2.5"/><ellipse cx="${cx}" cy="${f(cy + ry * .35)}" rx="${f(rx * .6)}" ry="${f(ry * .45)}" fill="${lt}" opacity=".9"/>`;
  o += `<ellipse cx="${f(cx - rx * .45)}" cy="${f(cy - ry * .55)}" rx="${f(rx * .2)}" ry="${f(ry * .1)}" fill="#fff" opacity=".45"/>`;
  // rarity marks: spots (Rare+), stripes (Epic+), forehead gem (Legendary)
  if (rar >= 1) for (let i = 0; i < 3; i++) o += `<circle cx="${f(cx - rx * .65 + r() * rx * 1.3)}" cy="${f(cy + r() * ry * .3)}" r="${f(2 + r() * 2)}" fill="${dk}" opacity=".35"/>`;
  if (rar >= 2) o += `<path d="M${f(cx - rx * .85)} ${cy + 6}q${f(rx * .2)} -7 ${f(rx * .4)} 0M${f(cx + rx * .45)} ${cy + 6}q${f(rx * .2)} -7 ${f(rx * .4)} 0" stroke="${dk}" stroke-width="2.5" fill="none" opacity=".55"/>`;
  if (rar >= 3) o += `<path d="M${cx} ${f(top + 3)}l5 6-5 6-5-6Z" fill="#ff5f8a" stroke="#fff" stroke-width="1.2"/>`;
  // face
  const eye = x => `<g class="eye"><ellipse cx="${f(x)}" cy="${f(eyeY)}" rx="${f(eyeR)}" ry="${f(eyeR * 1.15)}" fill="#fff" stroke="${dk}" stroke-width="1.5"/><circle cx="${f(x + 1)}" cy="${f(eyeY + 1)}" r="${f(eyeR * .55)}" fill="#1b1030"/><circle cx="${f(x + 2)}" cy="${f(eyeY - 1)}" r="${f(eyeR * .2)}" fill="#fff"/></g>`;
  o += cyc ? eye(cx) : eye(cx - gap) + eye(cx + gap);
  const my = eyeY + eyeR + 6, mo = r();
  o += mo < .4 ? `<path d="M${cx - 6} ${f(my)}q6 6 12 0" stroke="#1b1030" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
    : mo < .75 ? `<path d="M${cx - 6} ${f(my)}q6 7 12 0Z" fill="#1b1030"/><path d="M${cx - 4} ${f(my)}l2 3 2-3Z" fill="#fff"/>`
      : `<ellipse cx="${cx}" cy="${f(my + 2)}" rx="4" ry="3" fill="#1b1030"/>`;
  if (r() < .5) o += `<circle cx="${f(cx - gap - 5)}" cy="${f(my)}" r="3" fill="#ff7a9a" opacity=".55"/><circle cx="${f(cx + gap + 5)}" cy="${f(my)}" r="3" fill="#ff7a9a" opacity=".55"/>`;
  return `<svg class="beast" viewBox="0 0 100 100" aria-hidden="true">${o}</svg>`;
}
// ---------- sprite monsters (Kenney Monster Builder Pack, CC0) ----------
// assembled from parts on a canvas once per monster and cached; the SVG art above is the fallback until the sheet loads
const KCOL = { fire: 'red', grass: 'green', water: 'blue', dark: 'dark', light: 'yellow' };
const KDET = { fire: ['horn_large', 'horn_small'], grass: ['antenna_large', 'ear'], water: ['ear_round', 'antenna_small'], dark: ['horn_large', 'ear'], light: ['antenna_small', 'ear_round'] };
const KEYES = [['eye_cute_light', 'eye_cute_dark'], ['eye_human', 'eye_human_blue', 'eye_human_green'], ['eye_yellow', 'eye_blue', 'eye_human_red'], ['eye_psycho_light', 'eye_psycho_dark']];
let sheet = null, sheetReady = false;
const artCache = new Map();
function loadSheet() {
  if (typeof Image === 'undefined' || typeof ATLAS === 'undefined') return;
  sheet = new Image();
  sheet.onload = () => { sheetReady = true; artCache.clear(); render(); };
  sheet.src = 'assets/monsters/sheet.png';
}
function sprite(el, icon, seed, rar, foe, boss) {
  const key = [el, icon, seed, rar, foe ? 1 : 0, boss ? 1 : 0].join('|');
  if (artCache.has(key)) return artCache.get(key);
  const r = mulberry(seed), col = KCOL[el], sp = Math.max(0, ICONS[el].indexOf(icon)), pk = a => a[Math.floor(r() * a.length)];
  const c = document.createElement('canvas'); c.width = 168; c.height = 184;
  const g = c.getContext('2d'); g.scale(.4, .4);
  const P = (n, x, y, flip, k = 1) => {
    const a = ATLAS[n]; if (!a) return;
    const [sx, sy, w, h] = a;
    g.save(); g.translate(x + (flip ? w * k : 0), y); g.scale(flip ? -k : k, k); g.drawImage(sheet, sx, sy, w, h, 0, 0, w, h); g.restore();
  };
  const sz = n => ATLAS[n] || [0, 0, 0, 0];
  // species picks the body; the seed picks limbs, eyes, mouth and crest
  const B = 'body_' + col + (boss ? 'E' : 'ABDF'[sp]), [, , bw, bh] = sz(B), cx = 210, bot = 290, top = bot - bh;
  const L = 'leg_' + col + pk(['A', 'B', 'C', 'D', 'E']), lw = sz(L)[2];
  const A = 'arm_' + col + pk(['A', 'B', 'C', 'D', 'E']), aw = sz(A)[2], up = r() < .3;
  P(L, cx + bw * .12, bot - 30); P(L, cx - bw * .12 - lw, bot - 30, true);
  P(A, cx + bw / 2 - 22, top + bh * .35, up); P(A, cx - bw / 2 + 22 - aw, top + bh * .35, !up);
  if (boss || r() < [.4, .7, 1, 1][rar]) {
    const D = 'detail_' + col + '_' + pk(KDET[el]), [, , dw, dh] = sz(D), k = boss ? 1.6 : 1.25;
    P(D, cx + bw * .24 - dw * k / 2, top - dh * k + 16, false, k); P(D, cx - bw * .24 - dw * k / 2, top - dh * k + 16, true, k);
  }
  P(B, cx - bw / 2, top);
  // face: foes glare, friends get eyes that get fancier with rarity
  const E = foe ? pk(['eye_angry_blue', 'eye_angry_green', 'eye_angry_red']) : pk(KEYES[rar]), [, , ew, eh] = sz(E);
  const ey = top + bh * (bh > 200 ? .14 : .2), n = bw < 150 ? (r() < .5 ? 1 : 2) : (r() < .25 ? 1 : r() < .75 ? 2 : 3);
  let mouthY;
  if (n === 1) { const k = 1.15; P(E, cx - ew * k / 2, ey, false, k); mouthY = ey + eh * k + 8; }
  else if (n === 2) { const k = .78; P(E, cx - 6 - ew * k, ey, false, k); P(E, cx + 6, ey, false, k); mouthY = ey + eh * k + 10; if (foe) { P('eyebrowB', cx - 6 - ew * k, ey - 22, false, .8); P('eyebrowB', cx + 10, ey - 22, true, .8); } }
  else { const k = .62; P(E, cx - ew * k / 2, ey - 6, false, k); P(E, cx - 8 - ew * k, ey + eh * k * .55, false, k); P(E, cx + 8, ey + eh * k * .55, false, k); mouthY = ey + eh * k * 1.55 + 8; }
  const M = foe ? pk(['mouth_closed_fangs', 'mouth_closed_teeth', 'mouthC', 'mouthH', 'mouthJ']) : pk(['mouthA', 'mouthB', 'mouthD', 'mouthE', 'mouthF', 'mouthG', 'mouthI', 'mouth_closed_happy']);
  const mw = sz(M)[2]; P(M, cx - mw * .45, Math.min(mouthY, bot - 40), false, .9);
  // crop to the drawn pixels so every monster fills its frame, feet on the bottom edge
  const px = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (px[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const w = Math.max(1, x1 - x0 + 1), h = Math.max(1, y1 - y0 + 1), sq = Math.max(w, h) + 4, o = document.createElement('canvas');
  o.width = o.height = sq; o.getContext('2d').drawImage(c, x0, y0, w, h, (sq - w) / 2, sq - h - 2, w, h);
  const out = `<img class="beast spr" src="${o.toDataURL()}" alt="">`;
  artCache.set(key, out);
  return out;
}
const monArt = m => sheetReady ? sprite(m.el, m.icon, hashStr(m.id + m.name), m.rar) : art(m.el, m.icon, hashStr(m.id + m.name), m.rar);
const unitArt = u => sheetReady ? sprite(u.el, u.icon, u.seed, Math.min(3, u.rar | 0), u.side === 'e', u.boss) : art(u.el, u.icon, u.seed, u.rar);

// ---------- monsters / eggs ----------
// new monsters arrive at 80% of the team's average level so fresh pulls are usable right away
function hatchLvl() { const t = teamMons(); return t.length ? Math.max(1, Math.floor(t.reduce((a, m) => a + m.lvl, 0) / t.length * .8)) : 1; }
// add a hatched monster: fill empty team slots, record new species (+💎1 each)
function addMon(m) {
  S.mons.push(m); S.hatched++;
  if (S.team.length < 3) S.team.push(m.id);
  const k = m.el + ':' + m.icon;
  if (!S.seen.includes(k)) { S.seen.push(k); S.shards++; return true; }
  return false;
}
function makeMon(egg) {
  const r = Math.random, rar = weighted(r, EGG[egg.tier].rar), el = egg.el, dl = el === 'dark' || el === 'light';
  const pen = dl ? 0.75 : 1, v = () => 0.9 + r() * 0.2;
  return {
    id: S.nextId++, name: genName(r, el), icon: pick(r, ICONS[el]), el, rar, trait: pick(r, TRAIT_KEYS), lvl: hatchLvl(),
    bh: 50 * RMUL[rar] * pen * v(), ba: 8 * RMUL[rar] * pen * v(), sp: 8 + r() * 8 + rar,
  };
}
const eggQty = tier => qty === 'max' ? Math.max(1, Math.min(50, Math.floor(S.coins / EGG[tier].cost))) : qty;
function buyEgg(tier) {
  const n = eggQty(tier), c = EGG[tier].cost * n; if (S.coins < c) return;
  S.coins -= c;
  for (let i = 0; i < n; i++) {
    const el = tier === 'premium' && Math.random() < EGG.premium.dl ? (Math.random() < .5 ? 'dark' : 'light') : pick(Math.random, BASIC);
    S.eggs.push({ id: S.nextId++, el, tier });
  }
  save(); render(); toast(n > 1 ? `Got ${n} ${tier} eggs` : `Got a ${ELS[S.eggs[S.eggs.length - 1].el].i} ${tier} egg`);
}
function card(m, attrs = '', big = false, extra = '') {
  const s = stats(m);
  return `<div class="mon r${m.rar} el-${m.el}${big ? ' big' : ''}" ${attrs}><div class="rib">${RARS[m.rar]}</div>
    <div class="art"><span class="ic">${monArt(m)}</span><span class="elb">${ELS[m.el].i}</span><span class="lv">Lv${m.lvl}</span>${m.lock ? '<span class="lk">🔒</span>' : ''}${!big && S.team.includes(m.id) && cur !== 'tower' ? '<span class="tm">TEAM</span>' : ''}${!big && busy(m.id) ? '<span class="tm away">AWAY</span>' : ''}${extra}</div>
    <b class="nm">${esc(m.name)}</b><div class="st"><span>❤${fmt(s.hp)}</span><span>⚔${fmt(s.atk)}</span><span>⚡${s.spd}</span></div><div class="tr">${TRAITS[m.trait].n}</div></div>`;
}
function hatch(id) {
  const i = S.eggs.findIndex(e => e.id === id); if (i < 0) return;
  const m = makeMon(S.eggs.splice(i, 1)[0]), isNew = addMon(m); save();
  modal(`<div class="hatch"><div class="egg">🥚</div><p>Hatching…</p></div>`, true);
  setTimeout(() => { vib(m.rar >= 2 ? [40, 60, 40, 60, 80] : 30); SFX.hatch(m.rar); modal(`<h3>${m.rar === 3 ? 'LEGENDARY!' : m.rar === 2 ? 'Epic hatch!' : 'It hatched!'}</h3>${reveal(m)}<p style="text-align:center">${isNew ? '<b>New species! +💎1</b><br>' : ''}${TRAITS[m.trait].n}: ${TRAITS[m.trait].d}</p><button data-act="close">Nice!</button>`); render(); }, 900);
}
const reveal = m => `<div class="reveal r${m.rar}"><div class="rays"></div>${card(m, '', true)}</div>`;
function hatchAll() {
  if (!S.eggs.length) return;
  const got = S.eggs.map(e => makeMon(e)); S.eggs = [];
  const nNew = got.filter(addMon).length; save(); render();
  // only Rare+ get cards; the best one gets the full reveal
  const good = got.filter(m => m.rar >= 1).sort((a, b) => b.rar - a.rar), best = good[0], cnt = [0, 1, 2, 3].map(r => got.filter(m => m.rar === r).length);
  vib(best && best.rar >= 2 ? [40, 60, 40, 60, 80] : 30); SFX.hatch(best ? best.rar : 0);
  modal(`<h3>Hatched ${got.length}</h3><p style="text-align:center">${cnt.map((c, r) => c ? `${c} ${RARS[r]}` : '').filter(Boolean).join(' · ')}${nNew ? `<br><b>${nNew} new species! +💎${nNew}</b>` : ''}</p>
    ${best ? reveal(best) : ''}${good.length > 1 ? `<div class="grid">${good.slice(1).map(m => card(m)).join('')}</div>` : ''}<button data-act="close">Nice!</button>`);
}

// ---------- fusion ----------
// two monsters of same element + rarity -> base goes up one rarity; fodder is always consumed
const fuseOk = (a, b) => a && b && a !== b && a.el === b.el && a.rar === b.rar && a.rar < 3;
const fuseChance = (a, b) => Math.min(.95, FUSE[a.rar].p + (a.lvl + b.lvl - 2) * .005);
function fuseMenu(id) {
  const a = monById(id); if (!a || a.rar >= 3) return;
  const l = S.mons.filter(b => fuseOk(a, b) && !b.lock && !busy(b.id)).sort((x, y) => y.lvl - x.lvl);
  modal(`<h3>Fuse ${esc(a.name)} → ${RARS[a.rar + 1]}</h3><p>Pick a ${ELS[a.el].i} ${RARS[a.rar]} to sacrifice. It is lost even if fusion fails. 🔒 locked monsters are hidden.</p>
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
  const a = monById(aId), b = monById(bId); if (!fuseOk(a, b) || b.lock) return;
  const c = FUSE[a.rar].c; if (S.coins < c) return;
  S.coins -= c;
  const ok = Math.random() < fuseChance(a, b);
  S.mons = S.mons.filter(m => m !== b); S.team = S.team.filter(id => id !== b.id);
  if (ok) { const k = RMUL[a.rar + 1] / RMUL[a.rar]; a.rar++; a.bh *= k; a.ba *= k; a.sp += 1; a.lvl = Math.max(a.lvl, b.lvl); }
  S.fusions++;
  save(); render();
  modal(`<div class="hatch"><div class="egg">🌀</div><p>Fusing…</p></div>`, true);
  setTimeout(() => modal(`<h3>${ok ? 'Fusion succeeded!' : 'Fusion failed'}</h3>${ok ? reveal(a) : card(a, '', true)}<p>${ok ? `${esc(a.name)} is now ${RARS[a.rar]}.` : `${esc(b.name)} was lost.`}</p><button data-act="close">OK</button>`), 1000);
}

// ---------- feed ----------
// sacrifice spare monsters for XP: worth about what they cost to get (egg price by rarity, more if levelled),
// spent on the same curve as coin level-ups; leftover XP stays on the monster
const feedXP = b => Math.floor(EGG.basic.cost * [1, 3, 10, 30][b.rar] * (1 + (b.lvl - 1) * .1));
function levelsFrom(a, xp) { let l = a.lvl, x = (a.xp || 0) + xp; while (l < MAX_LVL && x >= lvCostAt(a, l)) { x -= lvCostAt(a, l); l++; } return { l, x }; }
const spare = a => S.mons.filter(b => b !== a && !b.lock && !S.team.includes(b.id) && !busy(b.id));
function feedMenu(id) {
  const a = monById(id); if (!a) return;
  const l = spare(a).sort((x, y) => x.rar - y.rar || x.lvl - y.lvl), commons = l.filter(b => b.rar === 0);
  const all = levelsFrom(a, commons.reduce((t, b) => t + feedXP(b), 0)).l - a.lvl;
  const need = lvCostAt(a, a.lvl) - (a.xp || 0);
  modal(`<h3>Feed ${esc(a.name)}</h3><p style="text-align:center">Lv${a.lvl} · ${fmt(need)} XP to next level. Sacrifice spare monsters for XP. Team and 🔒 locked monsters are hidden.</p>
    ${commons.length ? `<button data-act="feedall" data-id="${a.id}">Feed all ${commons.length} spare Commons (+${all} Lv)</button>` : ''}
    ${l.length ? `<div class="grid">${l.map(b => card(b, `data-act="feed" data-a="${a.id}" data-b="${b.id}"`, false, `<span class="adv up">${fmt(feedXP(b))}xp</span>`)).join('')}</div>` : '<p>No spare monsters.</p>'}
    <button class="btn alt" data-act="mon" data-id="${a.id}">Back</button>`);
}
function feed(a, list) {
  if (!a || !list.length || a.lvl >= MAX_LVL) return;
  const ids = new Set(list.map(b => b.id)), before = a.lvl;
  const r = levelsFrom(a, list.reduce((t, b) => t + feedXP(b), 0)); a.lvl = r.l; a.xp = r.l >= MAX_LVL ? 0 : r.x;
  S.mons = S.mons.filter(b => !ids.has(b.id)); S.fed += list.length;
  save(); render(); detail(a.id); toast(`${esc(a.name)} Lv${before} → Lv${a.lvl}`);
}

// ---------- sweep ----------
// re-clear the highest cleared floor for its reward, every 10 minutes
const SWEEP_CD = 10 * 60e3;
function sweep() {
  if (S.best <= 1) return;
  const w = S.sweepAt - Date.now(); if (w > 0) return toast(`Sweep ready in ${Math.ceil(w / 60000)} min`);
  const r = reward(S.best - 1); S.coins += r; S.sweepAt = Date.now() + SWEEP_CD;
  save(); render(); toast(`Swept floor ${S.best - 1}: +🪙${fmt(r)}`);
}

// ---------- goals, achievements, daily ----------
const QUESTS = [
  { t: 'Buy and hatch 2 eggs', done: () => S.hatched >= 2, r: { coins: 100 } },
  { t: 'Clear floor 3 in the Tower', done: () => S.best > 3, r: { coins: 150 } },
  { t: 'Upgrade the Coin Mine', done: () => S.gen >= 1, r: { coins: 100 } },
  { t: 'Level a monster to Lv5', done: () => S.mons.some(m => m.lvl >= 5), r: { coins: 300 } },
  { t: 'Beat the floor 10 boss', done: () => S.best > 10, r: { egg: 'premium' } },
  { t: 'Feed a monster', done: () => S.fed >= 1, r: { coins: 500 } },
  { t: 'Fuse two monsters', done: () => S.fusions >= 1, r: { shards: 1 } },
  { t: 'Beat the floor 20 boss', done: () => S.best > 20, r: { egg: 'premium' } },
  { t: 'Reach floor 25, then Ascend', done: () => S.ascends >= 1, r: { shards: 3 } },
];
const SPECIES = Object.keys(ICONS).flatMap(e => ICONS[e].map(i => e + ':' + i));
const topFloor = () => Math.max(S.top, S.best) - 1;
const ACH = [
  ...[10, 25, 50, 75, 100].map((f, i) => ({ id: 'f' + f, t: `Clear floor ${f}`, v: topFloor, goal: f, r: [1, 2, 4, 6, 10][i] })),
  ...[10, 50].map((n, i) => ({ id: 'o' + n, t: `Own ${n} monsters`, v: () => S.mons.length, goal: n, r: i + 1 })),
  { id: 'e1', t: 'Own an Epic', v: () => S.mons.filter(m => m.rar >= 2).length, goal: 1, r: 1 },
  { id: 'l1', t: 'Own a Legendary', v: () => S.mons.filter(m => m.rar === 3).length, goal: 1, r: 2 },
  { id: 'l5', t: 'Own 5 Legendaries', v: () => S.mons.filter(m => m.rar === 3).length, goal: 5, r: 4 },
  { id: 'u10', t: 'Fuse 10 times', v: () => S.fusions, goal: 10, r: 3 },
  ...[50, 250].map((n, i) => ({ id: 'h' + n, t: `Hatch ${n} eggs`, v: () => S.hatched, goal: n, r: [2, 4][i] })),
  { id: 's10', t: 'Discover 10 species', v: () => S.seen.length, goal: 10, r: 2 },
  { id: 's20', t: 'Complete the Bestiary', v: () => S.seen.length, goal: SPECIES.length, r: 5 },
];
const achReady = a => !S.ach.includes(a.id) && a.v() >= a.goal;
const dayStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dayStr(new Date());
const dailyReady = () => S.daily !== today();
function giveReward(r) {
  const out = [];
  if (r.coins) { S.coins += r.coins; out.push('🪙' + fmt(r.coins)); }
  if (r.shards) { S.shards += r.shards; out.push('💎' + r.shards); }
  if (r.egg) { S.eggs.push({ id: S.nextId++, el: pick(Math.random, BASIC), tier: r.egg }); out.push(r.egg === 'premium' ? '🪺 Premium egg' : '🥚 Egg'); }
  return out.join(' + ');
}
function claimGoal() {
  const q = QUESTS[S.quest]; if (!q || !q.done()) return;
  const got = giveReward(q.r); S.quest++; save(); render(); toast('Goal done! ' + got); vib(30);
}
function claimAch(id) {
  const a = ACH.find(x => x.id === id); if (!a || !achReady(a)) return;
  S.ach.push(a.id); S.shards += a.r; save(); render(); toast(`🏆 ${a.t}: +💎${a.r}`); vib(30);
}
function claimDaily() {
  if (!dailyReady()) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  S.streak = S.daily === dayStr(y) ? S.streak + 1 : 1; S.daily = today();
  const got = giveReward({ coins: Math.floor(Math.max(200, rate() * 900)), egg: S.streak % 7 === 0 ? 'premium' : 'basic' });
  save(); render(); toast(`🎁 Day ${S.streak}: ${got}`); vib(30);
}
function goalCard() {
  const q = QUESTS[S.quest]; if (!q) return '';
  const r = q.r.coins ? '🪙' + q.r.coins : q.r.shards ? '💎' + q.r.shards : '🪺 Premium egg';
  return `<section class="card goal"><h3>🎯 Goal ${S.quest + 1}/${QUESTS.length}</h3><p style="text-align:center"><b>${q.t}</b><br>Reward: ${r}</p>
    ${q.done() ? '<div class="ctl"><button data-act="goal">Claim reward</button></div>' : ''}</section>`;
}
function achCard() {
  const l = [...ACH].sort((a, b) => achReady(b) - achReady(a) || S.ach.includes(a.id) - S.ach.includes(b.id));
  return `<section class="card"><h3>🏆 Achievements ${S.ach.length}/${ACH.length}</h3>${l.map(a => {
    const done = S.ach.includes(a.id), v = Math.min(a.v(), a.goal);
    return `<div class="ach${done ? ' done' : ''}"><span>${done ? '✅' : '🏆'} ${a.t}<small>${done ? 'Claimed' : `${v}/${a.goal}`} · 💎${a.r}</small></span>${achReady(a) ? `<button data-act="ach" data-id="${a.id}">Claim</button>` : ''}</div>`;
  }).join('')}</section>`;
}
function dailyCard() {
  if (!dailyReady()) return '';
  return `<section class="card"><h3>🎁 Daily chest</h3><p style="text-align:center">~15 min of mine income + an egg. Day 7 of a streak: Premium egg.${S.streak ? `<br>Streak: ${S.streak} day${S.streak > 1 ? 's' : ''}` : ''}</p>
    <div class="ctl"><button data-act="daily">Open chest</button></div></section>`;
}

// ---------- expeditions ----------
// send spare monsters away; they come back with coins (and eggs on longer trips). Timestamps, so it runs offline.
const EXP = {
  s: { n: 'Short trip', dur: 15 * 60e3, coin: .5, egg: null },
  m: { n: 'Day hike', dur: 3600e3, coin: .45, egg: 'basic' },
  l: { n: 'Grand quest', dur: 4 * 3600e3, coin: .4, egg: 'premium' },
};
const busy = id => S.exp.some(x => x.mons.includes(id));
const expLeft = x => x.start + EXP[x.k].dur - Date.now();
const expReady = () => S.exp.some(x => expLeft(x) <= 0);
// coins = income over the trip x rate, more for bigger and rarer parties
const expCoins = (k, party) => Math.floor(rate() * EXP[k].dur / 1000 * EXP[k].coin * (.5 + .25 * party.length + .1 * party.reduce((t, m) => t + m.rar, 0)));
let expPick = { k: 's', ids: [] };
function expMenu() {
  const free = S.mons.filter(m => !S.team.includes(m.id) && !busy(m.id)).sort((a, b) => b.rar - a.rar || b.lvl - a.lvl);
  const party = expPick.ids.map(monById).filter(Boolean), e = EXP[expPick.k];
  modal(`<h3>🧭 New expedition</h3><div class="chips qty">${Object.keys(EXP).map(k => `<button class="${expPick.k === k ? 'on' : ''}" data-act="expk" data-k="${k}">${EXP[k].n} · ${EXP[k].dur / 60e3 >= 60 ? EXP[k].dur / 3600e3 + 'h' : EXP[k].dur / 60e3 + 'm'}</button>`).join('')}</div>
    <p style="text-align:center">Pick up to 3 spare monsters (${party.length}/3). Team members stay home.<br>Reward: 🪙${fmt(expCoins(expPick.k, party))}${e.egg ? ` + ${e.egg === 'premium' ? '🪺' : '🥚'}` : ''}</p>
    ${free.length ? `<div class="grid">${free.map(m => card(m, `data-act="exptog" data-id="${m.id}"`, false, expPick.ids.includes(m.id) ? '<span class="adv up">✔</span>' : '')).join('')}</div>` : '<p>No spare monsters. Hatch more eggs.</p>'}
    <button data-act="expgo" ${party.length ? '' : 'disabled'}>Send party</button><button class="btn alt" data-act="close">Cancel</button>`);
}
function expSend() {
  const party = expPick.ids.map(monById).filter(m => m && !S.team.includes(m.id) && !busy(m.id));
  if (!party.length || S.exp.length >= 3) return;
  S.exp.push({ k: expPick.k, start: Date.now(), coins: expCoins(expPick.k, party), egg: EXP[expPick.k].egg, mons: party.map(m => m.id) });
  expPick.ids = []; save(); closeModal(); render(); toast(`Party left on a ${EXP[S.exp[S.exp.length - 1].k].n}`);
}
function expClaim(i) {
  const x = S.exp[i]; if (!x || expLeft(x) > 0) return;
  S.exp.splice(i, 1);
  const got = giveReward({ coins: x.coins, egg: x.egg });
  save(); render(); toast('🧭 Expedition back: ' + got);
}
const fmtLeft = ms => { if (ms <= 0) return 'Done!'; const m = Math.ceil(ms / 60e3); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
function expCard() {
  return `<section class="card"><h3>🧭 Expeditions ${S.exp.length}/3</h3>${S.exp.map((x, i) => {
    const left = expLeft(x), pct = Math.min(100, 100 - left / EXP[x.k].dur * 100);
    return `<div class="ach"><span><b class="party">${x.mons.map(monById).filter(Boolean).map(m => `<i class="mini">${monArt(m)}</i>`).join('')} ${EXP[x.k].n}</b><small>${fmtLeft(left)} · 🪙${fmt(x.coins)}${x.egg ? (x.egg === 'premium' ? ' + 🪺' : ' + 🥚') : ''}</small>
      <div class="bar"><i style="width:${pct}%"></i></div></span>${left <= 0 ? `<button data-act="expclaim" data-i="${i}">Claim</button>` : ''}</div>`;
  }).join('')}${S.exp.length < 3 ? '<div class="ctl"><button data-act="expmenu">Send a party</button></div>' : ''}</section>`;
}

// ---------- daily trial ----------
// one element per day; all enemies share it, so counter-picking wins. Retry until cleared.
const trialEl = () => Object.keys(ELS)[Math.floor(new Date(today()).getTime() / 864e5) % 5];
const trialFloor = () => Math.max(5, S.best + 2);
const trialReady = () => S.trialDay !== today() && S.mons.length > 0;
function trialEnemies() {
  const el = trialEl(), r = mulberry(hashStr(today()));
  return enemies(trialFloor()).map((u, i) => ({ ...u, el, icon: pick(r, ICONS[el]), name: genName(r, el), seed: hashStr(today() + i), boss: i === 1, trait: i === 1 ? 'firststrike' : u.trait }));
}
function trialCard() {
  const el = trialEl();
  return `<section class="card"><h3>🏟️ Daily Trial</h3><p style="text-align:center">Today: <b>${ELS[el].i} ${ELS[el].n}</b> foes at floor ${trialFloor()} power.<br>Bring ${ELS[weakTo(el)].i} ${ELS[weakTo(el)].n}! Reward: 💎2 + 🪺</p>
    ${trialReady() ? '<div class="ctl"><button data-act="trial">Enter the Trial</button></div>' : `<p style="text-align:center">${S.trialDay === today() ? '✅ Cleared today. New trial tomorrow.' : 'Hatch a monster first.'}</p>`}</section>`;
}
function trialResult(win) {
  if (!win) return { rw: 0, chest: false };
  S.trialDay = today(); S.shards += 2; S.eggs.push({ id: S.nextId++, el: pick(Math.random, BASIC), tier: 'premium' }); S.changed = Date.now();
  return { rw: 0, chest: true };
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
// every 10 floors is a biome; half its enemies share the biome's element
const BIOMES = [
  { n: 'Mossy Halls', el: 'grass', c: '#3f5a3c' }, { n: 'Ember Depths', el: 'fire', c: '#5e2f24' }, { n: 'Tidal Vault', el: 'water', c: '#24476a' },
  { n: 'Shadow Spire', el: 'dark', c: '#33264f' }, { n: 'Radiant Peak', el: 'light', c: '#5f5530' },
];
const biome = f => BIOMES[Math.floor((f - 1) / 10) % BIOMES.length];
// element that hits this one for the most damage
const weakTo = el => Object.keys(ELS).reduce((b, a) => mult(a, el) > mult(b, el) ? a : b, 'fire');
function enemies(f) {
  const r = mulberry(f * 7919 + 13), boss = f % 10 === 0, k = Math.min(1, .4 + f * .07), dl = Math.min(.5, Math.max(0, (f - 15) * .03));
  const bm = biome(f), tr = Math.min(.6, Math.max(0, (f - 10) * .03));
  return [0, 1, 2].map(i => {
    let el = r() < dl ? (r() < .5 ? 'dark' : 'light') : pick(r, BASIC);
    if (r() < .5 && (BASIC.includes(bm.el) || f > 15)) el = bm.el;
    // boss floors: the middle enemy is a big crowned boss with a trait
    const isBoss = boss && i === 1, pen = el === 'dark' || el === 'light' ? 0.8 : 1;
    const bh = isBoss ? 2.4 : 1, ba = isBoss ? 1.5 : 1;
    const hp = Math.round(50 * Math.pow(1.125, f) * k * bh * pen * (.9 + r() * .2)), atk = Math.round(7 * Math.pow(1.085, f) * k * ba * pen * (.9 + r() * .2));
    const trait = isBoss || r() < tr ? pick(r, TRAIT_KEYS.filter(t => t !== 'gold')) : null;
    return { side: 'e', name: (isBoss ? 'King ' : '') + genName(r, el), icon: pick(r, ICONS[el]), el, hp, maxhp: hp, atk, spd: Math.round(8 + r() * 8 + f * .2 + (isBoss ? 4 : 0)), trait, boss: isBoss, rar: isBoss ? 3 : Math.min(2, Math.floor(f / 15)), seed: hashStr(f + ':' + i) };
  });
}
// ---------- battle engine ----------
// one action per step so the player can fire skills between steps; simulate() runs it to the end with auto skills
const SKILLS = {
  fire: { n: 'Inferno', d: 'Burns every enemy (0.9× ATK each)' },
  grass: { n: 'Bloom', d: 'Heals every ally 25% HP' },
  water: { n: 'Tsunami', d: 'Huge hit on one enemy (2.6× ATK)' },
  dark: { n: 'Hex', d: 'Enemies deal 30% less damage; 0.5× ATK hit to all' },
  light: { n: 'Aegis', d: 'Allies take 40% less damage for 2 rounds, heal 15%' },
};
// only player monsters and bosses charge skills
const charges = u => u.side === 'p' || u.boss;
function newBattle(U) { U.forEach(u => { u.en = 0; u.weak = false; u.shield = 0; }); return { U, queue: [], round: 0, over: false, win: false }; }
const snap = st => ({ hp: st.U.map(u => u.hp), en: st.U.map(u => u.en) });
function checkEnd(st) {
  const pa = st.U.some(u => u.side === 'p' && u.hp > 0), ea = st.U.some(u => u.side === 'e' && u.hp > 0);
  if (!pa || !ea) { st.over = true; st.win = pa && !ea; }
}
function hurt(a, d, base, st) {
  const m = mult(a.el, d.el), crit = a.trait === 'fury' && Math.random() < .25;
  const dmg = Math.max(1, Math.round(base * m * (.9 + Math.random() * .2) * (crit ? 2 : 1) * (a.weak ? .7 : 1) * (d.shield > st.round ? .6 : 1)));
  d.hp = Math.max(0, d.hp - dmg);
  if (charges(d)) d.en = Math.min(100, d.en + 12);
  let heal = 0, thorn = 0;
  if (a.trait === 'lifesteal') { heal = Math.round(dmg * .15); a.hp = Math.min(a.maxhp, a.hp + heal); }
  if (d.trait === 'thorns') { thorn = Math.max(1, Math.round(dmg * .35)); a.hp = Math.max(0, a.hp - thorn); }
  return { d: st.U.indexOf(d), dmg, m, crit, heal, thorn };
}
function castSkill(st, a) {
  if (st.over || a.hp <= 0 || a.en < 100) return null;
  a.en = 0;
  const foes = st.U.filter(u => u.side !== a.side && u.hp > 0), mates = st.U.filter(u => u.side === a.side && u.hp > 0);
  const hits = [], heals = [];
  const heal = (u, amt) => { const h = Math.min(u.maxhp - u.hp, Math.round(amt)); u.hp += h; heals.push({ i: st.U.indexOf(u), h }); };
  if (a.el === 'fire') foes.forEach(d => hits.push(hurt(a, d, a.atk * .9, st)));
  if (a.el === 'grass') mates.forEach(u => heal(u, u.maxhp * .25));
  if (a.el === 'water' && foes.length) hits.push(hurt(a, foes.reduce((x, y) => mult(a.el, y.el) > mult(a.el, x.el) || (mult(a.el, y.el) === mult(a.el, x.el) && y.hp < x.hp) ? y : x), a.atk * 2.6, st));
  if (a.el === 'dark') foes.forEach(d => { d.weak = true; hits.push(hurt(a, d, a.atk * .5, st)); });
  if (a.el === 'light') mates.forEach(u => { u.shield = st.round + 2; heal(u, u.maxhp * .15); });
  checkEnd(st);
  return { type: 'skill', a: st.U.indexOf(a), skill: a.el, hits, heals, ...snap(st) };
}
function stepOnce(st, auto) {
  if (st.over) return null;
  const U = st.U;
  if (!st.queue.length) {
    if (++st.round > 60) { st.over = true; st.win = false; return null; }
    const key = u => u.spd + (u.trait === 'firststrike' ? 1000 : 0);
    st.queue = U.filter(u => u.hp > 0).sort((x, y) => key(y) - key(x));
  }
  const a = st.queue.shift();
  if (a.hp <= 0) return stepOnce(st, auto);
  // bosses always use skills; players only when auto skills are on
  if (charges(a) && a.en >= 100 && (a.side === 'e' || auto)) return castSkill(st, a);
  const foes = U.filter(u => u.side !== a.side && u.hp > 0);
  // focus fire: hit the foe you're strongest against, then the weakest one
  const d = foes.reduce((x, y) => mult(a.el, y.el) > mult(a.el, x.el) || (mult(a.el, y.el) === mult(a.el, x.el) && y.hp < x.hp) ? y : x);
  const h = hurt(a, d, a.atk, st);
  if (charges(a)) a.en = Math.min(100, a.en + 25);
  checkEnd(st);
  return { type: 'atk', a: U.indexOf(a), ...h, ...snap(st) };
}
function simulate(U) {
  const st = newBattle(U), ev = [];
  while (!st.over) { const e = stepOnce(st, true); if (e) ev.push(e); }
  return { win: st.win, ev };
}
const teamUnits = tm => tm.map(m => { const s = stats(m); return { side: 'p', name: m.name, icon: m.icon, el: m.el, hp: s.hp, maxhp: s.hp, atk: s.atk, spd: s.spd, trait: m.trait, rar: m.rar, seed: hashStr(m.id + m.name) }; });
// estimated win chance from quick simulations, cached per team/floor state
let oddsKey = '', oddsVal = 0;
function winChance() {
  const tm = teamMons(); if (!tm.length) return 0;
  const k = S.floor + '|' + S.shards + '|' + tm.map(m => m.id + ':' + m.lvl + ':' + m.rar).join();
  if (k !== oddsKey) {
    let w = 0; const N = 60;
    for (let i = 0; i < N; i++) if (simulate([...enemies(S.floor), ...teamUnits(tm)]).win) w++;
    oddsKey = k; oddsVal = w / N;
  }
  return oddsVal;
}
// fight the current floor and apply its rewards; returns the result (used live and for offline auto-climb)
// pay out a finished floor fight
function applyResult(f, win) {
  const rw = win ? reward(f) : 0, chest = win && f % 10 === 0;
  if (win) { S.coins += rw; S.floor = f + 1; S.best = Math.max(S.best, S.floor); }
  if (chest) S.eggs.push({ id: S.nextId++, el: pick(Math.random, BASIC), tier: 'premium' });
  S.changed = Date.now();
  return { rw, chest };
}
// instant fight with auto skills (offline auto-climb)
function resolveFight() { const f = S.floor, res = simulate([...enemies(f), ...teamUnits(teamMons())]); return { win: res.win, f, ...applyResult(f, res.win) }; }
// auto skills: per device; always on while auto-climbing
let autoSk = false;
try { autoSk = localStorage.getItem('imt_autosk') === '1'; } catch (e) { }
function fight(mode) {
  if (!teamMons().length || B) return;
  const trial = mode === 'trial'; if (trial && !trialReady()) return;
  const f = trial ? trialFloor() : S.floor, U = [...(trial ? trialEnemies() : enemies(f)), ...teamUnits(teamMons())], st = newBattle(U);
  if (trial) cur = 'tower';
  B = { st, U, f, trial, cur: U.map(u => u.hp), en: U.map(() => 0), log: [], done: false, t: 0 };
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
  const a = B.U[e.a];
  if (e.type === 'skill') return `${a.icon} ${esc(a.name)} used <b>${SKILLS[e.skill].n}</b>!${e.hits.length ? ' ' + e.hits.map(h => '−' + fmt(h.dmg)).join(' ') : ''}${e.heals.length ? ' ' + e.heals.map(h => '+' + fmt(h.h) + '❤').join(' ') : ''}`;
  const d = B.U[e.d];
  return `${a.icon} ${esc(a.name)} ➜ ${d.icon} ${esc(d.name)} −${e.dmg}${e.m > 1 ? ' 💥' : e.m < 1 ? ' 🛡' : ''}${e.crit ? ' ⚡CRIT' : ''}${e.heal ? ` +${e.heal}❤` : ''}${e.thorn ? ` (thorns −${e.thorn})` : ''}`;
}
// floating text over a unit
function popAt(i, text, cls) {
  const u = $('#u' + i); if (!u) return;
  const b = u.getBoundingClientRect(), p = document.createElement('div');
  p.className = 'pop ' + cls; p.textContent = text; p.style.cssText = `left:${b.left + b.width / 2 - 24}px;top:${b.top + 10}px`;
  document.body.appendChild(p); setTimeout(() => p.remove(), 800);
}
function apply(e, anim) {
  B.cur = e.hp; B.en = e.en; B.log.push(logLine(e));
  if (cur !== 'tower') return;
  e.hp.forEach((h, i) => paintUnit(i, h));
  const lg = $('#log'); if (lg) { lg.insertAdjacentHTML('beforeend', `<div>${B.log[B.log.length - 1]}</div>`); lg.scrollTop = 1e9; }
  if (anim && e.type === 'skill') {
    SFX.big(); vib(40);
    const au = $('#u' + e.a); if (au) { au.classList.remove('cast'); void au.offsetWidth; au.classList.add('cast'); }
    popAt(e.a, SKILLS[e.skill].n.toUpperCase() + '!', 'skillname');
    e.hits.forEach(h => { popAt(h.d, '-' + fmt(h.dmg), h.m > 1 ? 'super' : ''); const du = $('#u' + h.d); if (du) { du.classList.remove('hit'); void du.offsetWidth; du.classList.add('hit'); } });
    e.heals.forEach(h => h.h > 0 && popAt(h.i, '+' + fmt(h.h), 'heal'));
    return;
  }
  if (anim) {
    (e.crit || e.m > 1 ? SFX.big : SFX.hit)();
    const du = $('#u' + e.d), au = $('#u' + e.a);
    if (au) { au.classList.add('atk'); setTimeout(() => au.classList.remove('atk'), 200); }
    if (du) {
      du.classList.remove('hit'); void du.offsetWidth; du.classList.add('hit');
      const b = du.getBoundingClientRect(), p = document.createElement('div');
      p.className = 'pop' + (e.crit ? ' crit' : e.m > 1 ? ' super' : ''); p.textContent = (e.crit ? 'CRIT ' : e.m > 1 ? 'SUPER ' : '') + '-' + fmt(e.dmg);
      // element burst on the target
      const fx = document.createElement('div'); fx.className = 'burst'; fx.textContent = ELS[B.U[e.a].el].i;
      fx.style.cssText = `left:${b.left + b.width / 2 - 18}px;top:${b.top + b.height / 2 - 24}px`;
      document.body.appendChild(fx); setTimeout(() => fx.remove(), 450);
      p.style.cssText = `left:${b.left + b.width / 2 - 20}px;top:${b.top + 10}px`;
      document.body.appendChild(p); setTimeout(() => p.remove(), 700);
    }
  }
}
function paintUnit(i, h) {
  const u = $('#u' + i); if (!u) return;
  const en = B.en[i] || 0, bar = u.querySelector('.en i');
  if (bar) bar.style.width = en + '%';
  u.classList.toggle('ready', en >= 100 && h > 0 && !B.done);
  u.classList.toggle('dead', h <= 0); u.classList.toggle('low', h > 0 && h < B.U[i].maxhp * .3);
  u.querySelector('.bar i').style.width = Math.max(0, h / B.U[i].maxhp * 100) + '%';
  u.querySelector('.hp').textContent = Math.max(0, h) + '/' + B.U[i].maxhp;
}
function step() {
  if (!B || B.done) return;
  const e = stepOnce(B.st, autoSk || climb);
  if (e) apply(e, true);
  if (B.st.over) finishBattle();
}
// tap a charged monster to fire its skill
function tapSkill(i) {
  if (!B || B.done) return;
  const u = B.U[i]; if (!u || u.side !== 'p') return;
  if (u.en < 100) return toast(`${SKILLS[u.el].n} charging… ${Math.floor(u.en)}%`);
  const e = castSkill(B.st, u); if (e) apply(e, true);
  if (B.st.over) finishBattle();
}
function skip() {
  if (!B || B.done) return;
  clearInterval(B.t);
  while (!B.st.over) { const e = stepOnce(B.st, true); if (e) apply(e, false); }
  finishBattle();
}
function finishBattle() {
  if (B.done) return;
  clearInterval(B.t); B.done = true; B.win = B.st.win;
  Object.assign(B, B.trial ? trialResult(B.win) : applyResult(B.f, B.win)); save();
  if (cur === 'tower') render();
  if (B.win) { vib(30); SFX.win(); } else SFX.lose();
  if (!climb || B.trial) return;
  if (!B.win) { toast(`Auto-climb stopped at floor ${B.f}`); return; }
  const b = B;
  // keep climbing only while the player is watching the tower with nothing open
  setTimeout(() => { if (climb && B === b && cur === 'tower' && $('#modal').hidden) { B = null; fight(); } }, 1200 / speed);
}
// auto-climb: start the next floor after each win, stop on a loss; per device
let climb = false;
try { climb = localStorage.getItem('imt_climb') === '1'; } catch (e) { }
function toggleClimb() {
  climb = !climb; try { localStorage.setItem('imt_climb', climb ? '1' : ''); } catch (e) { }
  toast(climb ? 'Auto-climb ON: keeps fighting until a loss' : 'Auto-climb OFF');
  if (climb && B && B.done && B.win && cur === 'tower') { B = null; fight(); } else render();
}

function arenaUnit(u, i) {
  const en = B.en[i] || 0, ch = charges(u), tap = u.side === 'p' && !B.done;
  return `<div class="unit ${u.side} el-${u.el}${u.boss ? ' king' : ''}${B.cur[i] <= 0 ? ' dead' : ''}${tap && en >= 100 && B.cur[i] > 0 ? ' ready' : ''}" id="u${i}"${tap ? ` data-act="skill" data-i="${i}"` : ''}>
    <div class="ic">${unitArt(u)}</div><div class="nm">${ELS[u.el].i} ${esc(u.name)}</div><div class="bar"><i style="width:${Math.max(0, B.cur[i] / u.maxhp * 100)}%"></i></div>
    ${ch ? `<div class="en"><i style="width:${en}%"></i></div>` : ''}<small class="hp">${Math.max(0, B.cur[i])}/${u.maxhp}</small>${u.side === 'p' ? `<small class="sk">⚡${SKILLS[u.el].n}</small>` : ''}</div>`;
}
function vArena() {
  const alive = B.U.filter((u, i) => u.side === 'p' && B.cur[i] > 0).length;
  const res = B.done ? `<div class="res ${B.win ? 'win' : 'lose'}">${B.win ? `<div class="stars">${'★'.repeat(alive)}${'☆'.repeat(3 - alive)}</div>` : ''}
    <h2>${B.win ? 'VICTORY!' : 'DEFEAT'}</h2><p>${B.trial ? (B.win ? 'Trial cleared! +💎2 + 🪺 Premium egg' : `Bring ${ELS[weakTo(trialEl())].i} monsters and try again.`) : B.win ? `Floor ${B.f} cleared · +🪙${fmt(B.rw)}${B.chest ? '<br>🎁 Boss chest: Premium egg!' : ''}` : `Floor ${B.f} holds. Level up, feed, or try a team with ▲ arrows.`}</p>
    <button data-act="cont">${B.trial ? 'Back' : B.win ? 'Next floor ▶' : 'Try again'}</button></div>` : '';
  return `<div class="floorhead"><h2>${B.trial ? 'Daily Trial' : 'Floor ' + B.f}</h2></div>
  <div class="arena" style="--arena:${biome(B.f).c}"><div class="row">${B.U.slice(0, 3).map((u, i) => arenaUnit(u, i)).join('')}</div>
  <div class="vs">VS</div>
  <div class="row">${B.U.slice(3).map((u, i) => arenaUnit(u, i + 3)).join('')}</div>${res}</div>
  <div class="log" id="log">${B.log.map(l => `<div>${l}</div>`).join('')}</div>
  ${B.done ? '' : '<p class="legend">Tap a glowing monster to fire its ⚡ skill</p>'}
  <div class="ctl"><button class="btn alt" id="spd" data-act="speed">${speed}×</button><button class="btn alt${autoSk ? ' on' : ''}" data-act="autosk">⚡ Auto ${autoSk ? 'ON' : 'OFF'}</button><button class="btn alt${climb ? ' on' : ''}" data-act="climb">🔁 Climb ${climb ? 'ON' : 'OFF'}</button>${B.done ? '' : '<button data-act="skip">Skip ⏩</button>'}</div>`;
}

// ---------- views ----------
function vHome() {
  const eg = S.eggs.map(e => `<button class="egg-i ${e.tier}" data-act="hatch" data-id="${e.id}">🥚<span class="eb">${ELS[e.el].i}</span></button>`).join('');
  return `${goalCard()}${dailyCard()}<section class="card"><h3>⛏️ Coin Mine · Lv ${S.gen}</h3>
    <div style="text-align:center"><div class="big-num">+${fmtRate(rate())}/s</div><p>+1/s per level · +5% per species discovered</p></div>
    ${qtyChips()}<div class="ctl">${(() => { const g = bulk(genCostAt, S.gen); return `<button data-act="gen" data-cost="${g.c}">Upgrade${g.k > 1 ? ' ×' + g.k : ''} · 🪙${fmt(g.c)}</button>`; })()}</div></section>
  <section class="card"><h3>🥚 Hatchery</h3><div class="shop">
    <div><div class="eggb">🥚</div><b>Basic Egg</b><small>Fire · Grass · Water</small><button data-act="buy" data-tier="basic" data-cost="${EGG.basic.cost * eggQty('basic')}">${eggQty('basic') > 1 ? '×' + eggQty('basic') + ' · ' : ''}🪙 ${fmt(EGG.basic.cost * eggQty('basic'))}</button></div>
    <div class="prem"><div class="eggb">🪺</div><b>Premium Egg</b><small>Better rarity · 3% 🌑/✨</small><button data-act="buy" data-tier="premium" data-cost="${EGG.premium.cost * eggQty('premium')}">${eggQty('premium') > 1 ? '×' + eggQty('premium') + ' · ' : ''}🪙 ${fmt(EGG.premium.cost * eggQty('premium'))}</button></div>
  </div></section>
  <section class="card"><h3>🪹 Nest (${S.eggs.length})</h3><p style="text-align:center">Tap an egg to hatch. Element shown, rarity is a surprise.</p>
    <div class="eggs">${eg || '<p>Empty nest. Buy an egg above.</p>'}</div>
    ${S.eggs.length > 1 ? '<div class="ctl"><button data-act="hatchall">Hatch all</button></div>' : ''}</section>${expCard()}${achCard()}`;
}
function vMons() {
  if (!S.mons.length) return '<section class="card"><h3>📖 Bestiary</h3><p style="text-align:center">No monsters yet. Buy and hatch an egg in the Village.</p></section>';
  const pw = m => { const s = stats(m); return s.hp * s.atk; };
  const by = { rar: (a, b) => b.rar - a.rar || b.lvl - a.lvl, lvl: (a, b) => b.lvl - a.lvl || b.rar - a.rar, pow: (a, b) => pw(b) - pw(a) }[monSort];
  const l = S.mons.filter(m => monEl === 'all' || m.el === monEl).sort((a, b) => by(a, b) || a.id - b.id);
  const chip = (act, k, v, label) => `<button class="${v === k ? 'on' : ''}" data-act="${act}" data-k="${k}">${label}</button>`;
  const best = `<section class="card"><h3>📖 Bestiary ${S.seen.length}/${SPECIES.length}</h3><div class="bestiary">${SPECIES.map(k => S.seen.includes(k) ? `<span class="el-${k.split(':')[0]}">${sheetReady ? sprite(k.split(':')[0], k.split(':')[1], hashStr(k), 0) : art(k.split(':')[0], k.split(':')[1], hashStr(k))}</span>` : '<span class="unseen">❔</span>').join('')}</div>
    <p style="text-align:center">Each new species: +💎1</p></section>`;
  return `${best}<div class="chips">${chip('monel', 'all', monEl, 'All')}${Object.keys(ELS).map(e => chip('monel', e, monEl, ELS[e].i)).join('')}</div>
  <div class="chips">${chip('monsort', 'rar', monSort, 'Rarity')}${chip('monsort', 'lvl', monSort, 'Level')}${chip('monsort', 'pow', monSort, 'Power')}</div>
  <p>${l.length} of ${S.mons.length} · tap for details, level up, feed, fuse</p><div class="grid">${l.map(m => card(m, `data-act="mon" data-id="${m.id}"`)).join('')}</div>`;
}
let monEl = 'all', monSort = 'rar';
function vTower() {
  if (B) return vArena();
  const E = enemies(S.floor), boss = S.floor % 10 === 0;
  // average damage multiplier of each team member against this floor's enemies
  const adv = m => { const v = E.reduce((t, u) => t + mult(m.el, u.el), 0) / E.length; return v > 1.05 ? '<span class="adv up">▲</span>' : v < .95 ? '<span class="adv down">▼</span>' : ''; };
  const slots = [0, 1, 2].map(i => { const m = monById(S.team[i]); return m ? card(m, `data-act="slot" data-i="${i}"`, false, adv(m)) : `<div class="mon empty" data-act="slot" data-i="${i}">＋<small>Add</small></div>`; }).join('');
  const odds = Math.round(winChance() * 100), sw = S.sweepAt - Date.now();
  return `${goalCard()}<div class="floorhead"><small class="biome">${biome(S.floor).n}</small><h2>Floor ${S.floor}</h2>${boss ? '<span class="boss">BOSS · 🎁 chest</span>' : ''}<small>Best ${S.best} · Reward 🪙${fmt(reward(S.floor))}</small>
    ${S.team.length ? `<div class="odds ${odds >= 70 ? 'good' : odds >= 35 ? 'mid' : 'bad'}">Win chance ~${odds}%</div>` : ''}</div>
  <div class="arena" style="--arena:${biome(S.floor).c}"><div class="row">${E.map(u => `<div class="unit e el-${u.el}${u.boss ? ' king' : ''}"><div class="ic">${unitArt(u)}</div><div class="nm">${ELS[u.el].i} ${u.boss ? 'BOSS' : ELS[u.el].n}</div><small>❤${fmt(u.hp)} ⚔${fmt(u.atk)}</small>${u.trait ? `<small class="etr">${TRAITS[u.trait].n}</small>` : ''}<small class="weak">Weak: ${ELS[weakTo(u.el)].i}</small></div>`).join('')}</div>
  <div class="vs">VS</div><div class="row">${slots}</div></div>
  <button class="fightbtn" data-act="fight" ${S.team.length ? '' : 'disabled'}>⚔️ FIGHT!</button>
  <div class="ctl"><button class="btn alt" data-act="auto">Auto-pick team</button><button class="btn alt${climb ? ' on' : ''}" data-act="climb">🔁 Auto ${climb ? 'ON' : 'OFF'}</button></div>
  ${S.best > 1 ? `<div class="ctl"><button class="btn alt" data-act="sweep" ${sw > 0 ? 'disabled' : ''}>🧹 Sweep floor ${S.best - 1}${sw > 0 ? ` · ready in ${Math.ceil(sw / 60000)}m` : ` · +🪙${fmt(reward(S.best - 1))}`}</button></div>` : ''}
  <p class="legend">▲ strong / ▼ weak vs this floor · 🔥 > 🌿 > 💧 > 🔥 ×2 (weak ×0.6)<br>🌑 / ✨: ×1.75 vs basics, ×2.5 vs each other</p>
  ${trialCard()}<section class="card"><h3>🌀 Ascend · 💎${S.shards}</h3>
    <p>Each 💎: +1% monster stats, +5% coins. Ascending resets coins, generator, floor and levels. Monsters, rarity and eggs stay.</p>
    ${shardGain() ? `<button data-act="ascend">Ascend for 💎${shardGain()}</button>` : `<p>Unlocks at floor ${ASCEND_AT}.${S.top > 1 ? ` All-time best: ${S.top}.` : ''}</p>`}</section>`;
}
function vSet() {
  return `${syncPanel()}<section class="card"><h3>Save code</h3><p>Copy to back up or move to another device.</p>
    <textarea id="exp" readonly></textarea><div class="ctl"><button data-act="copy">Copy</button></div></section>
  <section class="card"><h3>Import</h3><textarea id="imp" placeholder="Paste save code (IMT1:…)"></textarea><div class="ctl"><button data-act="import">Import (replaces current)</button></div></section>
  <section class="card"><h3>🔊 Sound</h3><div class="ctl"><button class="btn alt${muted ? '' : ' on'}" data-act="mute">${muted ? '🔇 Sound off' : '🔊 Sound on'}</button></div></section>
  <section class="card"><h3>About</h3><p>Offline earnings capped at 8h. Works offline once loaded. Hatched: ${S.hatched}.</p>
    <div class="ctl"><button class="danger" data-act="reset">Reset all progress</button></div></section>`;
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
function modal(html, lock, mon) { const m = $('#modal'); m.innerHTML = `<div class="modal">${html}</div>`; m.hidden = false; m.dataset.lock = lock ? '1' : ''; m.dataset.mon = mon || ''; hud(); }
function closeModal() { $('#modal').hidden = true; }
function detail(id) {
  const m = monById(id); if (!m) return;
  const maxed = m.lvl >= MAX_LVL, g = bulk(l => lvCostAt(m, l), m.lvl, MAX_LVL), now = stats(m), nx = statsAt(m, m.lvl + g.k);
  if (busy(m.id)) return modal(`${card(m, '', true)}<p style="text-align:center">🧭 Away on an expedition. Back in ${fmtLeft(expLeft(S.exp.find(x => x.mons.includes(m.id))))}.</p><button class="btn alt" data-act="close">Close</button>`);
  modal(`${card(m, '', true)}<p style="text-align:center">${TRAITS[m.trait].n}: ${TRAITS[m.trait].d}<br>⚡ ${SKILLS[m.el].n}: ${SKILLS[m.el].d}</p>
    ${maxed ? '<p style="text-align:center">Max level</p>' : `${qtyChips()}<p style="text-align:center">Lv${m.lvl} → <b>Lv${m.lvl + g.k}</b>: ❤${fmt(now.hp)} → <b>${fmt(nx.hp)}</b> · ⚔${fmt(now.atk)} → <b>${fmt(nx.atk)}</b></p>
    <button data-act="lvl" data-id="${m.id}" data-cost="${g.c}">Level up${g.k > 1 ? ' ×' + g.k : ''} · 🪙${fmt(g.c)}</button>`}
    <button class="btn alt" data-act="lock" data-id="${m.id}">${m.lock ? '🔓 Unlock' : '🔒 Lock (protect from fusion)'}</button>
    ${m.lvl < MAX_LVL ? `<button data-act="feedmenu" data-id="${m.id}">🍖 Feed spare monsters</button>` : ''}
    ${m.rar < 3 ? `<button data-act="fusemenu" data-id="${m.id}">Fuse → ${RARS[m.rar + 1]}</button>` : ''}
    <button class="btn alt" data-act="close">Close</button>`, false, m.id);
}
function picker(i) {
  const l = S.mons.filter(m => !S.team.includes(m.id) && !busy(m.id)).sort((a, b) => b.rar - a.rar || b.lvl - a.lvl);
  modal(`<h3>Slot ${i + 1}</h3>${l.length ? `<div class="grid">${l.map(m => card(m, `data-act="pick" data-id="${m.id}" data-i="${i}"`)).join('')}</div>` : '<p>No free monsters.</p>'}
    ${S.team[i] ? `<button data-act="clear" data-i="${i}">Remove from slot</button>` : ''}<button class="btn alt" data-act="close">Cancel</button>`);
}
function autoPick() {
  // power x (damage dealt / damage taken) against this floor's enemies
  const E = enemies(S.floor), avg = f => E.reduce((t, u) => t + f(u), 0) / E.length;
  const pw = m => { const s = stats(m); return s.hp * s.atk * avg(u => mult(m.el, u.el)) / avg(u => mult(u.el, m.el)); };
  S.team = S.mons.filter(m => !busy(m.id)).sort((a, b) => pw(b) - pw(a)).slice(0, 3).map(m => m.id); save(); render();
}

const ACT = {
  tab: d => { if (d.t === 'tower' || cur !== d.t) { cur = d.t; render(); } },
  buy: d => buyEgg(d.tier),
  gen: () => { const g = bulk(genCostAt, S.gen); if (S.coins < g.c) return; S.coins -= g.c; S.gen += g.k; save(); render(); },
  qty: d => { qty = d.k === 'max' ? 'max' : +d.k; try { localStorage.setItem('imt_qty', qty); } catch (e) { } const m = $('#modal'); if (!m.hidden && m.dataset.mon) detail(+m.dataset.mon); render(); },
  climb: toggleClimb,
  skill: d => tapSkill(+d.i),
  autosk: () => { autoSk = !autoSk; try { localStorage.setItem('imt_autosk', autoSk ? '1' : ''); } catch (e) { } const b = document.querySelector('[data-act=autosk]'); if (b) { b.classList.toggle('on', autoSk); b.textContent = `⚡ Auto ${autoSk ? 'ON' : 'OFF'}`; } },
  mute: () => { muted = !muted; try { localStorage.setItem('imt_mute', muted ? '1' : ''); } catch (e) { } if (!muted) SFX.coin(); render(); },
  lock: d => { const m = monById(+d.id); if (!m) return; m.lock = !m.lock; save(); detail(m.id); render(); },
  hatch: d => hatch(+d.id),
  hatchall: hatchAll,
  mon: d => detail(+d.id),
  fusemenu: d => fuseMenu(+d.id),
  feedmenu: d => feedMenu(+d.id),
  feed: d => { const a = monById(+d.a), b = monById(+d.b); if (!a || !b || b.lock || S.team.includes(b.id)) return; if (b.rar >= 2 && !confirm(`Feed ${RARS[b.rar]} ${b.name}? It will be gone.`)) return; feed(a, [b]); },
  feedall: d => { const a = monById(+d.id); if (a) feed(a, spare(a).filter(b => b.rar === 0)); },
  sweep,
  goal: claimGoal,
  ach: d => claimAch(d.id),
  daily: claimDaily,
  fuseask: d => fuseAsk(+d.a, +d.b),
  fuse: d => fuse(+d.a, +d.b),
  lvl: d => { const m = monById(+d.id); if (!m || m.lvl >= MAX_LVL) return; const g = bulk(l => lvCostAt(m, l), m.lvl, MAX_LVL); if (S.coins < g.c) return; S.coins -= g.c; m.lvl += g.k; save(); detail(m.id); render(); },
  slot: d => picker(+d.i),
  pick: d => { S.team[+d.i] = +d.id; S.team = S.team.filter(Boolean); save(); closeModal(); render(); },
  clear: d => { S.team.splice(+d.i, 1); save(); closeModal(); render(); },
  auto: autoPick,
  fight: () => fight(),
  trial: () => fight('trial'),
  expmenu: () => { expPick.ids = expPick.ids.filter(id => monById(id) && !busy(id) && !S.team.includes(id)); expMenu(); },
  expk: d => { expPick.k = d.k; expMenu(); },
  exptog: d => { const id = +d.id, i = expPick.ids.indexOf(id); if (i >= 0) expPick.ids.splice(i, 1); else if (expPick.ids.length < 3) expPick.ids.push(id); expMenu(); },
  expgo: expSend,
  expclaim: d => expClaim(+d.i),
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
const MUTATE = new Set(['buy', 'gen', 'hatch', 'hatchall', 'lvl', 'pick', 'clear', 'auto', 'fight', 'fuse', 'import', 'reset', 'ascend', 'lock', 'feed', 'feedall', 'sweep', 'goal', 'ach', 'daily', 'expgo', 'expclaim']);
document.addEventListener('click', e => {
  if (e.target.id === 'modal' && !e.target.dataset.lock) return closeModal();
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, f = ACT[a]; if (!f) return;
  f(b.dataset);
  if (a === 'buy' || a === 'gen' || a === 'lvl' || a === 'feed' || a === 'feedall') SFX.buy();
  else if (a === 'goal' || a === 'ach' || a === 'daily' || a === 'sweep' || a === 'expclaim') SFX.coin();
  if (MUTATE.has(a)) { S.changed = Date.now(); save(); }
});

// ---------- boot ----------
S = load(); last = S.saved; tick(); render();
setInterval(tick, 250);
setInterval(save, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else tick(); });
addEventListener('pagehide', save);
syncBoot();
loadSheet();

// ---------- what's new ----------
// shown once per device after an update; brand-new players skip it
const NEWS_VER = 21, NEWS = [
  '🎨 Every monster now has its own hand-made look (no more emoji!)',
  '⚡ Battles are live: each monster charges a skill. Tap it when it glows',
  '🔥 Inferno · 🌿 Bloom · 💧 Tsunami · 🌑 Hex · ✨ Aegis',
  '🧭 Expeditions: send spare monsters on trips for coins and eggs (Village)',
  '🏟️ Daily Trial: one element per day, win 💎2 + a Premium egg (Tower)',
  '👑 Bosses fire skills too, so watch their red charge bar',
]
try {
  const seenVer = +localStorage.getItem('imt_news') || 0;
  if (seenVer < NEWS_VER) {
    localStorage.setItem('imt_news', NEWS_VER);
    if (S.hatched > 0 && $('#modal').hidden) modal(`<h3>What's new</h3><div class="card">${NEWS.map(n => `<p>${n}</p>`).join('')}</div><button data-act="close">Let's go!</button>`);
  }
} catch (e) { }

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
