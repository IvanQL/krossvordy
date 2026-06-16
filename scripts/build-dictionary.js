// Сборка базы слов из открытых датасетов (офлайн).
// Источники (data/raw/):
//   ozhegov.txt  — Толковый словарь Ожегова (Layerex/ozhegov-dict, Unlicense)
//                  формат: VOCAB|BASEFORM|PHONGL|GRCLASSGL|STYLGL|DEF|ANTI|LEGLEXAM
//   freq50k.txt  — 50k самых частых слов по убыванию частоты (hingston/russian)
//
// Что делает: берёт чистые существительные-однословки 4–9 букв, у которых есть
// короткое внятное определение, отбрасывает «лёгкие» (топ частот) и «совсем
// редкие», превращает определение в подсказку и кладёт всё в тему «Эрудит».
// Курируемые 229 слов (web/dictionary.js) сохраняются как есть.
//
// Запуск:  node scripts/build-dictionary.js          (сухой прогон + статистика)
//          node scripts/build-dictionary.js --write   (перезаписать web/dictionary.js)

const fs = require("fs");
const path = require("path");

const RAW = path.join(__dirname, "..", "data", "raw");
const OUT = path.join(__dirname, "..", "web", "dictionary.js");

const HARD_THEME = "Эрудит";
const MIN_LEN = 4, MAX_LEN = 9;     // длина ответа
const RANK_LO = 600, RANK_HI = 35000; // окно «сложно, но честно» по частоте
const MAX_IMPORT = 2600;            // потолок добавляемых слов (размер файла/загрузка)

// ---------- частоты ----------
const freq = fs.readFileSync(path.join(RAW, "freq50k.txt"), "utf8").split(/\r?\n/);
const rank = new Map();
freq.forEach((w, i) => { if (w && !rank.has(w)) rank.set(w, i); });

// ---------- чистка определения → подсказка ----------
function cleanDef(raw, word) {
  let d = (raw || "").trim();
  if (!d) return null;
  // отбрасываем редиректы и грамматические отсылки
  if (/^(==|<=|см\.|то же)/.test(d)) return null;
  if (/\b[NN][0-9]\b|<=|==|\bсм\.\b/.test(d)) return null;
  d = d.replace(/[­¬]/g, "");                    // мягкий перенос / артефакт «¬»
  d = d.replace(/z/g, "ъ").replace(/Z/g, "Ъ");   // в источнике z = твёрдый знак
  if (/[A-Za-z]/.test(d)) return null;           // остаточная латиница = пометы/искажения
  d = d.split(" (")[0];                          // убрать пояснение в скобках
  d = d.split(";")[0];                           // только первая часть
  d = d.split(". ")[0];                           // только первое предложение
  d = d.replace(/,?\s+а также.*$/i, "");
  d = d.replace(/[^А-Яа-яЁёъЪ ,.\-!]/g, " ");     // только базовые символы
  d = d.replace(/^[^А-Яа-яЁё]+/, "");            // ведущие «!», пробелы, маркеры
  d = d.replace(/\s+/g, " ").trim();
  d = d.replace(/[.,:;\s\-]+$/, "");
  if (/\d/.test(d)) return null;                 // номера значений и пр.
  if (d.length < 8 || d.length > 64) return null;
  if (d.split(" ").length < 2) return null;     // одно слово — слишком скудно
  // не должно содержать сам ответ (или его основу)
  const lw = word.toLowerCase();
  const stem = lw.slice(0, Math.min(5, lw.length - 1));
  if (d.toLowerCase().includes(stem)) return null;
  return d.charAt(0).toUpperCase() + d.slice(1);
}

// частицы/предлоги/наречия, проскакивающие сквозь фильтр окончаний
const STOP = new Set(("вроде около возле подле сквозь насчёт насчет взамен наперекор " +
  "однако впрочем иначе почти тоже также ведь даже разве будто словно якобы " +
  "затем зачем оттого потому поэтому отчего нежели дабы покуда покамест " +
  "наоборот напротив навстречу вокруг мимо вдоль поперёк поперек").toUpperCase().split(/\s+/));

// ---------- разбор Ожегова ----------
const oz = fs.readFileSync(path.join(RAW, "ozhegov.txt"), "utf8").split(/\r?\n/);
const cand = new Map();   // ОТВЕТ(без Ё) -> {clue, rank}
let scanned = 0;

for (let i = 1; i < oz.length; i++) {
  const c = oz[i].split("|");
  let w = (c[0] || "").trim().toLowerCase().replace(/z/g, "ъ");
  if (!/^[а-яё]+$/.test(w)) continue;                 // только одно слово кириллицей
  if (w.length < MIN_LEN || w.length > MAX_LEN) continue;
  // отсев прилагательных/глаголов/наречий — нужны существительные
  if (/(ый|ий|ой|ая|яя|ое|ее|ые|ие|ться|еть|ать|ить|ять|уть|ишь|ешь|ти|чь|сь|ся)$/.test(w)) continue;
  const ans = w.replace(/ё/g, "е").toUpperCase();
  if (!/^[А-ЯЪ]+$/.test(ans)) continue;
  if (STOP.has(ans)) continue;
  const r = rank.get(w);
  if (r === undefined || r < RANK_LO || r > RANK_HI) continue; // окно сложности
  scanned++;
  const clue = cleanDef(c[5], w);
  if (!clue) continue;
  const prev = cand.get(ans);
  // при нескольких значениях берём самую короткую внятную подсказку
  if (!prev || clue.length < prev.clue.length) cand.set(ans, { clue, rank: r });
}

// ---------- курируемая база ----------
// берём ТОЛЬКО курируемые темы (без HARD_THEME), чтобы повторный --write был
// идемпотентным и не наслаивал импорт на самого себя.
const { DICTIONARY } = require("../web/dictionary.js");
const base = DICTIONARY.filter(e => e.t !== HARD_THEME);
const curated = new Set(base.map(e => e.a));

// отбираем импортируемые: не пересекаются с курируемыми, сортируем по частоте
// (более частые = более «честные»), берём верхние MAX_IMPORT
let imported = [...cand.entries()]
  .filter(([a]) => !curated.has(a))
  .sort((x, y) => x[1].rank - y[1].rank)
  .slice(0, MAX_IMPORT)
  .map(([a, v]) => ({ a, c: v.clue, t: HARD_THEME }));

// ---------- статистика ----------
console.log("Ожегов строк:", oz.length, "| кандидатов после фильтров:", cand.size);
console.log("Импортируем:", imported.length, "| курируемых:", base.length);
console.log("\nПримеры импортируемых:");
for (const e of imported.slice(0, 5).concat(imported.slice(1200, 1205))) {
  console.log("  " + e.a.padEnd(11) + " — " + e.c);
}

// ---------- запись ----------
if (process.argv.includes("--write")) {
  const themesOrder = ["Животные", "Природа", "Еда", "Дом", "Транспорт", "Люди", "Школа", HARD_THEME];
  const all = base.concat(imported);
  let body = "";
  for (const t of themesOrder) {
    const rows = all.filter(e => e.t === t);
    if (!rows.length) continue;
    body += "// ===== " + t + " =====\n";
    for (const e of rows) {
      body += `{a:${JSON.stringify(e.a)},c:${JSON.stringify(e.c)},t:${JSON.stringify(e.t)}},\n`;
    }
  }
  const out =
    "// База: { a: СЛОВО (без Ё), c: подсказка, t: тема }\n" +
    "// Курируемая часть + импорт из словаря Ожегова (см. scripts/build-dictionary.js).\n" +
    "const DICTIONARY = [\n" + body + "];\n" +
    'if(typeof module!=="undefined") module.exports={DICTIONARY};\n';
  fs.writeFileSync(OUT, out, "utf8");
  console.log("\nЗаписано в web/dictionary.js:", all.length, "слов");
} else {
  console.log("\n(сухой прогон — добавьте --write для записи)");
}
