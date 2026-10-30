// Headless regression tests: node dev/test.js
// Loads game.js in a VM with a stub DOM and checks core rules. Exit code 1 on any failure.
const vm = require('vm'), fs = require('fs'), path = require('path');
const el = new Proxy(function () { }, { get: (t, k) => k === 'classList' ? { toggle() { }, add() { }, remove() { }, contains: () => false } : k === 'style' || k === 'dataset' ? {} : el, apply: () => el, set: () => true });
const store = {};
const ctx = {
  syncBoot() { }, syncPanel: () => '', auth: null,
  document: { querySelector: () => el, querySelectorAll: () => [], addEventListener() { }, hidden: false, getElementById: () => null, createElement: () => el, body: el },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  setInterval() { }, clearInterval() { }, setTimeout() { }, clearTimeout() { }, navigator: {}, location: { protocol: 'file:' },
  addEventListener() { }, confirm: () => true, btoa, atob, escape, unescape, Math, Date, console,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8'), ctx);
const run = c => vm.runInContext(c, ctx);

let fail = 0, pass = 0;
const t = (name, code) => {
  try { const r = run(`(() => { S = fresh(); last = Date.now(); B = null; ${code} })()`); if (r === true) pass++; else { fail++; console.log('FAIL', name, '->', r); } }
  catch (e) { fail++; console.log('FAIL', name, 'threw', e.message); }
};

t('fresh save survives sanitize', `const a = JSON.stringify(fresh()); const b = sanitize(JSON.parse(a)); return b.coins === 100 && b.floor === 1 && Array.isArray(b.seen);`);
t('old save without new fields loads', `const s = sanitize({ coins: 5, gen: 2, mons: [{ id: 3, name: 'x', icon: '🦊', el: 'fire', rar: 1, trait: 'fury', lvl: 4, bh: 50, ba: 8, sp: 10 }], team: [3] });
  return s.mons.length === 1 && s.team[0] === 3 && s.seen.includes('fire:🦊') && s.quest === 0 && s.ach.length === 0 && s.nextId === 4;`);
t('bad monsters dropped, names escaped', `const s = sanitize({ mons: [{ id: 1, name: '<img onerror=x>', icon: '🦊', el: 'fire', rar: 0, trait: 'fury', lvl: 1, bh: 1, ba: 1, sp: 1 }, { id: 2, el: 'lava' }] });
  S = s; return s.mons.length === 1 && !card(s.mons[0]).includes('<img');`);
t('element table', `return mult('fire','grass') === 2 && mult('grass','fire') === 0.6 && mult('water','water') === 1 && mult('dark','light') === 2.5 && mult('dark','fire') === 1.75 && mult('fire','dark') === 1;`);
t('bulk x10 cost matches sum', `qty = 10; S.coins = 1e12; const g = bulk(genCostAt, 0); let c = 0; for (let i = 0; i < 10; i++) c += genCostAt(i); qty = 1; return g.k === 10 && g.c === c;`);
t('bulk max never overspends', `qty = 'max'; S.coins = 1000; const g = bulk(genCostAt, 0); qty = 1; return g.c <= 1000 && g.c + genCostAt(g.k) > 1000;`);
t('hatch fills team and records species', `S.eggs.push({ id: S.nextId++, el: 'fire', tier: 'basic' }); hatchAll(); return S.mons.length === 1 && S.team.length === 1 && S.seen.length === 1 && S.shards === 1;`);
t('new monsters hatch near team level', `const m = makeMon({ el: 'fire', tier: 'basic' }); m.lvl = 50; S.mons.push(m); S.team = [m.id]; return makeMon({ el: 'water', tier: 'basic' }).lvl === 40;`);
t('strong team clears floor 1', `const m = makeMon({ el: 'fire', tier: 'basic' }); m.lvl = 30; S.mons.push(m); S.team = [m.id]; fight(); return B.win && S.floor === 2 && S.coins > 100;`);
t('boss win drops premium egg', `const m = makeMon({ el: 'fire', tier: 'basic' }); m.lvl = 100; m.rar = 3; m.bh *= 3; m.ba *= 3; S.mons.push(m); S.team = [m.id]; S.floor = 10; fight(); return B.win && S.eggs.some(e => e.tier === 'premium');`);
t('feed spends xp on the level curve', `const a = makeMon({ el: 'fire', tier: 'basic' }); S.mons.push(a); S.team = [a.id]; for (let i = 0; i < 10; i++) S.mons.push(makeMon({ el: 'water', tier: 'basic' }));
  S.mons.slice(1).forEach(b => b.rar = 0); feed(a, spare(a)); return S.mons.length === 1 && a.lvl > 1 && a.xp < lvCostAt(a, a.lvl);`);
t('locked monsters are never fodder', `const a = makeMon({ el: 'fire', tier: 'basic' }), b = makeMon({ el: 'fire', tier: 'basic' }); a.rar = b.rar = 0; b.lock = true; S.mons.push(a, b); return spare(a).length === 0;`);
t('fusion success raises rarity', `const a = makeMon({ el: 'fire', tier: 'basic' }), b = makeMon({ el: 'fire', tier: 'basic' }); a.rar = b.rar = 0; S.mons.push(a, b); S.coins = 1e6;
  const r = Math.random; Math.random = () => 0; fuse(a.id, b.id); Math.random = r; return a.rar === 1 && S.mons.length === 1 && S.fusions === 1;`);
t('ascend resets run, keeps monsters', `const m = makeMon({ el: 'fire', tier: 'basic' }); m.lvl = 40; S.mons.push(m); S.best = 40; S.floor = 40; S.gen = 9; const g = shardGain(); ascend();
  return S.shards === g && S.floor === 1 && S.gen === 0 && S.mons.length === 1 && m.lvl === 1 && S.top === 40;`);
t('goal chain claims in order', `S.hatched = 2; claimGoal(); const a = S.quest === 1 && Math.floor(S.coins) === 200; claimGoal(); return a && S.quest === 1;`);
t('daily streak continues from yesterday', `const y = new Date(); y.setDate(y.getDate() - 1); S.daily = dayStr(y); S.streak = 6; claimDaily(); return S.streak === 7 && S.eggs.some(e => e.tier === 'premium') && !dailyReady();`);
t('daily streak resets after a gap', `S.daily = '2000-01-01'; S.streak = 5; claimDaily(); return S.streak === 1;`);
t('offline earnings capped at 8h', `S.coins = 0; last = Date.now() - 24 * 3600e3; tick(); const max = rate() * 8 * 3600; return S.coins <= max * 1.001 && S.coins >= max * .999;`);
t('export/import roundtrip', `S.coins = 1234; S.mons.push(makeMon({ el: 'fire', tier: 'basic' })); const c = exportCode(); const s = sanitize(JSON.parse(decodeURIComponent(escape(atob(c.slice(5))))));
  return c.startsWith('IMT1:') && s.mons.length === 1 && Math.floor(s.coins) >= 1234;`);
t('win chance in 0..1', `const m = makeMon({ el: 'fire', tier: 'basic' }); S.mons.push(m); S.team = [m.id]; const w = winChance(); return w >= 0 && w <= 1;`);

t('offline auto-climb clears floors', `const m = makeMon({ el: 'fire', tier: 'basic' }); m.lvl = 60; m.rar = 3; S.mons.push(m); S.team = [m.id]; climb = true; last = Date.now() - 30 * 60e3; tick(); climb = false; return S.floor > 5;`);
t('enemy weakness hint', `return weakTo('fire') === 'water' && weakTo('dark') === 'light' && weakTo('grass') === 'fire';`);
t('boss floor has one crowned boss', `const E = enemies(20); return E.filter(u => u.boss).length === 1 && E[1].boss && E[1].trait !== null && E[1].name.startsWith('King');`);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
