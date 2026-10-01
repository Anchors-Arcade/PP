#!/usr/bin/env node
/**
 * Anchors Arcade - game discovery
 *
 * Scans the repository and writes hub/games.json. Zero dependencies (Node 18+).
 *
 *   node scripts/generate-games.mjs                 # scan the git checkout in cwd
 *   node scripts/generate-games.mjs --list files.txt # scan a plain list of paths (testing)
 *
 * A "game" is any top-level folder that contains something launchable in a
 * browser (an .html entry point). Everything else is reported under "skipped".
 *
 * Optional metadata, in priority order (later wins):
 *   1. inferred from folder name / files
 *   2. <game-folder>/arcade.json   { title, entry, thumbnail, description, category, tags }
 *   3. hub/overrides.json          { "<folder or id>": { ...same fields..., "hidden": true } }
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'hub', 'games.json');
const args = process.argv.slice(2);
const listIdx = args.indexOf('--list');
const LIST_FILE = listIdx >= 0 ? args[listIdx + 1] : null;
const HAS_FS = !LIST_FILE;

// ---------------------------------------------------------------- file list
function listFiles() {
  if (LIST_FILE) return fs.readFileSync(LIST_FILE, 'utf8').split('\n').map(s => s.replace(/\r$/, '')).filter(Boolean);
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 1 << 29 });
    return out.toString('utf8').split('\0').filter(Boolean);
  } catch {
    const acc = [];
    const walk = (dir, rel) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.git' || e.name === 'node_modules') continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        e.isDirectory() ? walk(path.join(dir, e.name), r) : acc.push(r);
      }
    };
    walk(ROOT, '');
    return acc;
  }
}

// First commit time per top-level folder (one pass over history). Falls back to 0.
function addedDates() {
  const map = new Map();
  if (!HAS_FS) return map;
  try {
    const out = execFileSync('git', ['-c', 'core.quotepath=false', 'log', '--diff-filter=A', '--name-only', '--format=@%ct'],
      { cwd: ROOT, maxBuffer: 1 << 29 }).toString('utf8');
    let ts = 0;
    for (const line of out.split('\n')) {
      if (!line) continue;
      if (line[0] === '@') { ts = Number(line.slice(1)); continue; }
      const top = line.split('/')[0];
      if (!map.has(top) || ts < map.get(top)) map.set(top, ts);
    }
  } catch { /* shallow clone or no git: fine */ }
  return map;
}

// ---------------------------------------------------------------- helpers
const SKIP_TOP = new Set(['hub', 'scripts', 'node_modules', 'docs', 'assets', 'public', 'img', 'images']);
const BAD_DIR = /(^|\/)(api|node_modules|assets?|lib|libs|static|css|js|data|vendor|audio|sounds?|images?|img|fonts?|streamingassets|build|templates?)\//i;
const BAD_HTML = /(^|\/)(404|error|offline|test|debug)[^/]*\.html?$/i;
const IMG = /\.(png|jpe?g|webp|gif|svg)$/i;
const MAX_THUMB_BYTES = 2.5 * 1024 * 1024;

const UPPER = new Set(['3d', '2d', 'gta', 'ut', 'io', 'gd', 'ai', 'cn', 'gh', 'ssf2', 'fnaf', 'fnaw', 'fnas', 'fnabr', 'fnf', 'csgo', 'vs', 'ugs', 'hd', 'js', 'ii', 'iii', 'iv']);
const SMALL = new Set(['of', 'the', 'a', 'an', 'in', 'on', 'to', 'and', 'or', 'for']);

function titleFromFolder(name) {
  let s = name.replace(/\.js$/i, '').replace(/[-_ ]*(gh[-_ ]pages|main)[-_ ]*$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) s = name;
  return s.split(' ').map((w, i) => {
    const lw = w.toLowerCase();
    if (UPPER.has(lw) || /^(fnf|ssf)\d/.test(lw)) return w.toUpperCase();
    if (i > 0 && SMALL.has(lw)) return lw;
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  }).join(' ');
}

function slug(s) {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
}

const CATEGORY_RULES = [
  ['Horror', /\b(fnaf|fnaw|fnas|fnabr|five nights|nights at|granny|nun|backrooms|haunted|skinwalker|scary|slender|fear|deception|baldi|baldis|dont touch|ghost|zombie|nightmare|dark)\b/],
  ['Idle & Clicker', /\b(idle|clicker|click|clicks|tycoon|incremental|layers|miner|mine|mart|factory|dimensions|cookie|scratch inc|grow|orb farm|space company|farm)\b/],
  ['Card & Casino', /\b(poker|hold em|holdem|roulette|slot|slots|blackjack|card|cards|deck|plinko|buckshot|bluff|casino|gamble|dungeondeck)\b/],
  ['Sports', /\b(soccer|football|basketball|golf|bowl|bowling|hockey|tennis|boxing|volleyball|baseball|wrestle|wrestling|goal|puck|ping pong|table tennis|head soccer|stars|slam|dunk|basket|ice fishing|fishing)\b/],
  ['Racing', /\b(car|cars|race|racer|racers|racing|drift|moto|motocross|kart|truck|traffic|speed|rider|bike|bikes|rally|road|rush|wheelie|stunt|stunts|stunt cars|driving|driver|cardriver|highway|derby|hills of steel|snow rider|rolling sky|poly track)\b/],
  ['Shooter', /\b(shoot|shooter|sniper|snipers|gun|guns|bullet|strike|combat|assault|recoil|quake|doom|half life|blockpost|superhot|forward|battleground|surf|csgo|lolshooter|roof snipe|nzp)\b/],
  ['Fighting', /\b(fight|fighting|fighto|brawl|duel|ragdoll|sword|swordfight|slash|slasher|clash|karate|ssf2|boxing|stickman|stick|bros)\b/],
  ['Strategy', /\b(defend|defenders|defense|conquer|konkr|war|wars|empire|conflict|vikings|mindustry|survivors|survivor|tactics|kingdom|chess|megachess)\b/],
  ['Puzzle', /\b(2048|puzzle|merge|sort|strands|xor|stacktris|tetris|sudoku|word|ztype|trace|lock|escape|door|secrets|brain|logic|maze|linerider|sushi|unroll|odd bot|resizer)\b/],
  ['Platformer', /\b(mario|obby|jump|jumping|parkour|runner|runners|run|climb|platform|only up|tower|gravity|bounce|bouncy|dash|geometry|gd|gdash|gdlite|flappy|slope|level devil|cat mario|doodle|ninja|onion|boy|kid adventure)\b/],
  ['Simulation', /\b(sim|simulator|simulation|life|garden|hotel|townscraper|sandbox|planet|office|house|paint|mowing|worm|duck life|penguin diner|diner)\b/],
];

function inferCategory(name) {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  for (const [cat, re] of CATEGORY_RULES) {
    const m = n.match(re);
    if (m) return { category: cat, keyword: m[0] };
  }
  return { category: 'Arcade', keyword: null };
}

function detectEngine(files) {
  const has = re => files.some(f => re.test(f));
  if (has(/\.unityweb(\.part\d+)?$/i) || has(/(^|\/)UnityLoader\.js$/i) || has(/\.loader\.js$/i) && has(/\.(wasm|data)(\.part\d+)?$/i)) return 'Unity';
  if (has(/(^|\/)renpy\.(js|wasm)$/i)) return "Ren'Py";
  if (has(/\.pck$/i)) return 'Godot';
  if (has(/\.swf$/i)) return 'Flash (Ruffle)';
  if (has(/construct|c3runtime\.js$/i)) return 'Construct';
  return 'HTML5';
}

function pickEntry(rel) {
  if (rel.includes('index.html')) return 'index.html';
  const html = rel.filter(f => /\.html?$/i.test(f) && !BAD_DIR.test(f) && !BAD_HTML.test(f));
  if (!html.length) return null;
  const pref = f => {
    const b = f.split('/').pop().toLowerCase();
    if (b === 'index.html') return 0;
    if (b === 'game.html') return 1;
    if (b === 'play.html') return 2;
    if (b === 'main.html') return 3;
    return 4;
  };
  html.sort((a, b) => (a.split('/').length - b.split('/').length) || (pref(a) - pref(b)) || (a.length - b.length) || a.localeCompare(b));
  return html[0];
}

const THUMB_RANK = [/thumb/, /cover/, /banner|poster|preview|screenshot/, /^og/, /(512|256|192|180|144).*icon|icon.*(512|256|192|180|144)/, /^icon/, /logo/, /^media/, /^splash|presplash/, /^background/];

function pickThumbnail(folder, rel, fileSet) {
  let best = null;
  for (const f of rel) {
    if (!IMG.test(f)) continue;
    const parts = f.split('/');
    if (parts.length > 4) continue;
    if (parts.slice(0, -1).some(p => /^(audio|sounds?|sprites?|tiles?|textures?|fonts?|characters?|levels?|maps?|streamingassets)$/i.test(p))) continue;
    const base = parts[parts.length - 1].replace(/\.[^.]+$/, '').toLowerCase();
    if (/favicon|sprite|sheet|tile|texture|cursor|loading|progress|unity/.test(base)) continue;
    const rank = THUMB_RANK.findIndex(re => re.test(base));
    if (rank < 0) continue;
    const score = rank * 10 + (parts.length - 1) * 3 + (/\.(png|jpe?g|webp)$/i.test(f) ? 0 : 2);
    if (HAS_FS) {
      try { if (fs.statSync(path.join(ROOT, folder, f)).size > MAX_THUMB_BYTES) continue; } catch { continue; }
    }
    if (!best || score < best.score) best = { f, score };
  }
  return best ? `${folder}/${best.f}` : null;
}

function readHead(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(32768);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const s = buf.toString('utf8', 0, n);
    const meta = re => (s.match(re) || [])[1];
    return {
      description: meta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,300})["']/i) || meta(/<meta[^>]+content=["']([^"']{10,300})["'][^>]+name=["']description["']/i),
      ogImage: meta(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i),
    };
  } catch { return {}; }
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const clean = s => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

// ---------------------------------------------------------------- main
const all = listFiles();
const byTop = new Map();
for (const f of all) {
  const i = f.indexOf('/');
  if (i < 0) continue;
  const top = f.slice(0, i);
  if (!byTop.has(top)) byTop.set(top, []);
  byTop.get(top).push(f.slice(i + 1));
}

const overrides = HAS_FS ? (readJson(path.join(ROOT, 'hub', 'overrides.json')) || {}) : {};
const added = addedDates();
const games = [];
const skipped = [];
const usedIds = new Set();

for (const [folder, rel] of [...byTop.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (SKIP_TOP.has(folder) || !/^[A-Za-z0-9]/.test(folder)) { skipped.push({ folder, reason: 'not a game folder' }); continue; }

  const relSet = new Set(rel);
  const meta = HAS_FS && relSet.has('arcade.json') ? (readJson(path.join(ROOT, folder, 'arcade.json')) || {}) : {};

  let entry = clean(meta.entry);
  if (!entry || !relSet.has(entry)) entry = pickEntry(rel);
  if (!entry) { skipped.push({ folder, reason: 'no .html entry point (not directly browser-playable)' }); continue; }

  const baseId = slug(clean(meta.id) || folder);
  let id = baseId, n = 2;
  while (usedIds.has(id)) id = `${baseId}-${n++}`;
  usedIds.add(id);

  const head = HAS_FS ? readHead(path.join(ROOT, folder, entry)) : {};
  const inferred = inferCategory(folder);
  const engine = detectEngine(rel);

  let thumbnail = null;
  if (meta.thumbnail && relSet.has(meta.thumbnail)) thumbnail = `${folder}/${meta.thumbnail}`;
  if (!thumbnail) thumbnail = pickThumbnail(folder, rel, relSet);
  if (!thumbnail && head.ogImage && !/^(https?:)?\/\//i.test(head.ogImage)) {
    const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
    const cand = path.posix.normalize(dir + head.ogImage.replace(/^\.?\//, ''));
    if (relSet.has(cand)) thumbnail = `${folder}/${cand}`;
  }

  const title = clean(meta.title) || titleFromFolder(folder);
  const category = clean(meta.category) || inferred.category;
  let description = clean(meta.description) || clean(head.description);
  if (description.length > 180) description = description.slice(0, 177).trimEnd() + '...';
  const generated = !description;
  if (generated) description = `Play ${title} in your browser.`;

  const tags = [...new Set([category.toLowerCase(), engine.toLowerCase(), inferred.keyword, ...(Array.isArray(meta.tags) ? meta.tags : [])]
    .filter(Boolean).map(t => String(t).toLowerCase()))];

  const game = {
    id, title, folder, path: `${folder}/${entry}`, thumbnail, description, category, engine, tags,
    added: added.get(folder) || 0,
  };
  if (generated) game.descriptionGenerated = true;

  const ov = overrides[id] || overrides[folder];
  if (ov) {
    if (ov.hidden) { skipped.push({ folder, reason: 'hidden via overrides.json' }); continue; }
    for (const k of ['title', 'description', 'category']) if (ov[k]) game[k] = clean(ov[k]);
    if (ov.thumbnail) game.thumbnail = ov.thumbnail;
    if (ov.entry) game.path = `${folder}/${ov.entry}`;
    if (Array.isArray(ov.tags)) game.tags = ov.tags.map(t => String(t).toLowerCase());
    if (ov.description) delete game.descriptionGenerated;
  }
  games.push(game);
}

games.sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: games.length, games, skipped }, null, 1));

const cats = {};
for (const g of games) cats[g.category] = (cats[g.category] || 0) + 1;
console.log(`Discovered ${games.length} games (${games.filter(g => g.thumbnail).length} with thumbnails), skipped ${skipped.length}.`);
console.log('Categories:', cats);
for (const s of skipped) console.log(`  skipped: ${s.folder} - ${s.reason}`);
