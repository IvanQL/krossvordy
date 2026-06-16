#!/usr/bin/env node
// Офлайн-генерация пазлов: кроссворды + сканворды -> data/puzzles.json
// и (опционально) заливка в Supabase.
//
// Запуск:
//   node scripts/generate.js                       # по умолчанию: 40 кроссвордов + 20 сканвордов
//   node scripts/generate.js --crosswords 100 --scanwords 50
//   node scripts/generate.js --supabase            # ещё и залить в Supabase (нужен .env)
//
const fs = require("fs");
const path = require("path");
const { makeCrossword } = require("../web/crossword.js");
const { makeScanword } = require("../web/scanword.js");
const { DICTIONARY } = require("../web/dictionary.js");

// --- аргументы ---
const args = process.argv.slice(2);
const getNum = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? parseInt(args[i + 1], 10) : def; };
const NC = getNum("--crosswords", 40);
const NS = getNum("--scanwords", 20);
const TO_SUPABASE = args.includes("--supabase");
const OUT = path.join(__dirname, "..", "data", "puzzles.json");

const THEMES = ["all", ...new Set(DICTIONARY.map(e => e.t))];
const SIZES = { small: { target: 10, maxLen: 7, tries: 42 }, medium: { target: 14, maxLen: 8, tries: 36 }, large: { target: 18, maxLen: 9, tries: 30 } };

const poolFor = (theme) => (theme === "all" ? DICTIONARY : DICTIONARY.filter(e => e.t === theme)).map(e => ({ answer: e.a, clue: e.c }));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function genCrosswords(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const theme = pick(THEMES), size = pick(Object.keys(SIZES));
    const g = makeCrossword(poolFor(theme), SIZES[size]);
    if (g) out.push({ type: "crossword", theme, difficulty: size, data: g });
  }
  return out;
}
function genScanwords(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const theme = pick(THEMES.filter(t => t === "all" || DICTIONARY.filter(e => e.t === t).length >= 20));
    const s = makeScanword(poolFor(theme), { target: 22, maxLen: 8, tries: 40 });
    if (s) out.push({ type: "scanword", theme, difficulty: "medium", data: s });
  }
  return out;
}

const puzzles = [...genCrosswords(NC), ...genScanwords(NS)];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(puzzles, null, 0));
console.log(`Сгенерировано: ${puzzles.filter(p=>p.type==="crossword").length} кроссвордов, ${puzzles.filter(p=>p.type==="scanword").length} сканвордов`);
console.log(`Записано в ${path.relative(process.cwd(), OUT)}`);

// --- заливка в Supabase (через REST, без зависимостей; нужен Node 18+) ---
async function upload() {
  try { require("dotenv").config(); } catch (_) { /* dotenv не обязателен: переменные можно задать в окружении */ }
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error("Нет SUPABASE_URL / SUPABASE_SERVICE_KEY в .env — пропускаю заливку."); return; }
  const rows = puzzles.map(p => ({ type: p.type, theme: p.theme, difficulty: p.difficulty, data: p.data }));
  const res = await fetch(`${url}/rest/v1/puzzles`, {
    method: "POST",
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify(rows)
  });
  console.log(res.ok ? `Залито в Supabase: ${rows.length} пазлов` : `Ошибка Supabase: ${res.status} ${await res.text()}`);
}
if (TO_SUPABASE) upload();
