#!/usr/bin/env node
// Проверка корректности и замеры генераторов.
//   node scripts/bench.js
const { makeCrossword, K } = require("../web/crossword.js");
const { makeScanword } = require("../web/scanword.js");
const { DICTIONARY } = require("../web/dictionary.js");

const entries = DICTIONARY.map(e => ({ answer: e.a, clue: e.c }));

// дубли в базе
const seen = {}, dups = [];
for (const e of DICTIONARY) { if (seen[e.a]) dups.push(e.a); seen[e.a] = 1; }
console.log(`База: ${DICTIONARY.length} слов, дубли: ${dups.length ? dups.join(",") : "нет"}`);

// валидатор кроссворда: нет конфликтов и нет «паразитных» слов
function validateCrossword(m) {
  const cells = new Map();
  for (const w of m.words) for (let i = 0; i < w.answer.length; i++) {
    const r = w.r + (w.dir === "d" ? i : 0), c = w.c + (w.dir === "a" ? i : 0), key = K(r, c);
    const cur = cells.get(key); if (cur !== undefined && cur !== w.answer[i]) return "CONFLICT"; cells.set(key, w.answer[i]);
  }
  const A = new Set(m.words.filter(w => w.dir === "a").map(w => w.answer + "@" + w.r + "," + w.c));
  const D = new Set(m.words.filter(w => w.dir === "d").map(w => w.answer + "@" + w.r + "," + w.c));
  for (let r = 0; r < m.rows; r++) { let c = 0; while (c < m.cols) { if (cells.has(K(r, c))) { let s = c, t = ""; while (c < m.cols && cells.has(K(r, c))) { t += cells.get(K(r, c)); c++; } if (t.length >= 2 && !A.has(t + "@" + r + "," + s)) return "GHOST"; } else c++; } }
  for (let c = 0; c < m.cols; c++) { let r = 0; while (r < m.rows) { if (cells.has(K(r, c))) { let s = r, t = ""; while (r < m.rows && cells.has(K(r, c))) { t += cells.get(K(r, c)); r++; } if (t.length >= 2 && !D.has(t + "@" + s + "," + c)) return "GHOST"; } else r++; } }
  return "OK";
}

// --- кроссворды ---
let ok = 0, words = [], sides = [];
for (let i = 0; i < 300; i++) { const m = makeCrossword(entries, { target: 14, maxLen: 8, tries: 36 }); if (m && validateCrossword(m) === "OK") { ok++; words.push(m.count); sides.push(Math.max(m.rows, m.cols)); } }
sides.sort((a, b) => a - b);
console.log(`Кроссворды: ${ok}/300 валидных | слов~${(words.reduce((a, b) => a + b, 0) / words.length).toFixed(1)} | сторона мед~${sides[sides.length >> 1]}`);

// --- сканворды: каждая буквенная клетка в слове, у каждого слова есть клетка-вопрос ---
function validateScanword(s) {
  const L = new Set(s.letters.map(o => o.r + "," + o.c));
  const D = new Map(); for (const d of s.defs) D.set(d.r + "," + d.c, d.clues);
  for (const d of s.defs) if (L.has(d.r + "," + d.c)) return "DEF_ON_LETTER";
  for (const w of s.words) {
    const dk = w.dir === "a" ? (w.r) + "," + (w.c - 1) : (w.r - 1) + "," + (w.c);
    if (!D.has(dk)) return "NO_DEF";
  }
  return "OK";
}
let sok = 0, sw = [], ss = [];
for (let i = 0; i < 300; i++) { const s = makeScanword(entries, { target: 22, maxLen: 8, tries: 40 }); if (s && validateScanword(s) === "OK") { sok++; sw.push(s.count); ss.push(Math.max(s.rows, s.cols)); } }
ss.sort((a, b) => a - b);
console.log(`Сканворды:  ${sok}/300 валидных | слов~${(sw.reduce((a, b) => a + b, 0) / sw.length).toFixed(1)} | сторона мед~${ss[ss.length >> 1]}`);
