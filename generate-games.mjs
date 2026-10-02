// Usage: node generate-arcade.mjs   (run from repo root; writes games.json)
// Scans root folders and ./games/* for playable games. Optional per-game meta.json:
// { "title", "entry", "thumbnail", "description", "category", "tags": [] }
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const SKIP = new Set(["node_modules", ".git", ".github", "assets", "arcade", "docs"]);
const IMG = /\.(png|jpe?g|webp|gif|svg)$/i;
const THUMB = /^(thumbnail|thumb|cover|icon|logo|preview|poster|splash)/i;
const CATS = {
  Racing: /race|racing|car|drift|moto|truck|kart|drive/i,
  Sports: /football|soccer|basket|golf|tennis|baseball|boxing|hockey|sport|bros/i,
  Puzzle: /puzzle|2048|tetris|sudoku|match|block|word|mine/i,
  Platformer: /platform|mario|run|jump|parkour/i,
  Shooter: /shoot|gun|fps|war|sniper|zombie/i,
  Action: /fight|battle|ninja|action|slash|sword/i,
  Arcade: /snake|pong|pac|flappy|breakout|arcade|invader/i,
};
const dirs = (p) => existsSync(p) ? readdirSync(p).filter((d) => !d.startsWith(".") && !SKIP.has(d) && statSync(join(p, d)).isDirectory()) : [];
const pretty = (s) => s.replace(/[-_.]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

function findEntry(dir) {
  for (const f of ["index.html", "game.html", "index.htm"]) if (existsSync(join(dir, f))) return f;
  const files = readdirSync(dir);
  const html = files.find((f) => /\.html?$/i.test(f));
  if (html) return html;
  const swf = files.find((f) => extname(f).toLowerCase() === ".swf");
  return swf || null;
}
function findThumb(dir) {
  const spots = [dir, join(dir, "img"), join(dir, "images"), join(dir, "assets"), join(dir, "TemplateData")];
  for (const s of spots) if (existsSync(s) && statSync(s).isDirectory()) {
    const hit = readdirSync(s).find((f) => IMG.test(f) && THUMB.test(f));
    if (hit) return (s === dir ? "" : s.slice(dir.length + 1) + "/") + hit;
  }
  return null;
}

const roots = [["", dirs(".")], ["games/", dirs("games")]];
const games = [];
for (const [prefix, list] of roots) for (const name of list) {
  const rel = prefix + name, dir = rel;
  let meta = {};
  try { meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")); } catch {}
  const entry = meta.entry || findEntry(dir);
  if (!entry) continue; // not browser-playable (no html/swf)
  const thumb = meta.thumbnail || findThumb(dir);
  const title = meta.title || pretty(name);
  const category = meta.category || Object.keys(CATS).find((c) => CATS[c].test(name)) || "Casual";
  games.push({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    path: rel + "/" + entry,
    type: /\.swf$/i.test(entry) ? "flash" : "html",
    thumbnail: thumb ? rel + "/" + thumb : null,
    description: meta.description || "",
    category,
    tags: meta.tags || [],
    added: Math.floor(statSync(dir).mtimeMs),
  });
}
games.sort((a, b) => a.title.localeCompare(b.title));
writeFileSync("games.json", JSON.stringify(games, null, 1));
console.log(`Found ${games.length} games -> games.json`);
