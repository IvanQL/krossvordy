// ===== Генератор сканвордов =====
// Идея: плотно пакуем слова движком кроссвордов (у него уже гарантируется
// пустая клетка ПЕРЕД началом каждого слова) — и эти пустые клетки-предшественники
// становятся клетками-вопросами со стрелкой. Структура генерируется каждый раз заново.
const cw = (typeof require!=="undefined") ? require("./crossword.js") : null;
const _make = cw ? cw.makeCrossword : makeCrossword;
const _K = cw ? cw.K : K;

function makeScanword(entries, opts={}){
  const gen=_make(entries, {
    target: opts.target||22, maxLen: opts.maxLen||8,
    tries: opts.tries||40, minWords: opts.minWords||14
  });
  if(!gen) return null;

  // буквенная сетка (сдвиг +1,+1 — оставляем место под верхний/левый ряд вопросов)
  const letters=new Map();           // key -> буква
  for(const w of gen.words) for(let i=0;i<w.answer.length;i++){
    const r=w.r+(w.dir==="d"?i:0)+1, c=w.c+(w.dir==="a"?i:0)+1;
    letters.set(_K(r,c), w.answer[i]);
  }
  // клетки-вопросы: предшественник начала каждого слова
  const defs=new Map();              // key -> [{dir, clue, answer}]
  for(const w of gen.words){
    const r=w.r+1, c=w.c+1;
    const dk = w.dir==="a" ? _K(r, c-1) : _K(r-1, c);
    if(!defs.has(dk)) defs.set(dk, []);
    defs.get(dk).push({dir:w.dir, clue:w.clue, answer:w.answer});
  }
  const rows=gen.rows+1, cols=gen.cols+1;

  // валидация: каждая буквенная клетка входит хотя бы в одно слово (по построению),
  // и у каждого слова есть клетка-вопрос (она пустая, не буквенная)
  for(const [k] of defs) if(letters.has(k)) return null; // конфликт — не должно случаться

  const out={rows, cols,
    letters:[...letters].map(([k,ch])=>{const [r,c]=k.split(",").map(Number);return {r,c,ch};}),
    defs:[...defs].map(([k,cl])=>{const [r,c]=k.split(",").map(Number);return {r,c,clues:cl};}),
    words: gen.words.map(w=>({answer:w.answer, clue:w.clue, r:w.r+1, c:w.c+1, dir:w.dir})),
    count: gen.words.length
  };
  return out;
}
if(typeof module!=="undefined") module.exports={makeScanword};

// --- быстрый прогон при прямом запуске ---
if(typeof require!=="undefined" && require.main===module){
  const {DICTIONARY}=require("./dictionary.js");
  const entries=DICTIONARY.map(e=>({answer:e.a,clue:e.c}));
  let ok=0, sizes=[], words=[];
  for(let i=0;i<200;i++){const s=makeScanword(entries,{});if(s){ok++;sizes.push(Math.max(s.rows,s.cols));words.push(s.count);}}
  sizes.sort((a,b)=>a-b);
  console.log("Сканвордов сгенерировано:",ok+"/200","| слов~"+(words.reduce((a,b)=>a+b,0)/words.length).toFixed(0),"| сторона мед~"+sizes[sizes.length>>1]);

  // пример с разметкой: буквы — буквы; вопросы — # (со стрелкой)
  const s=makeScanword(entries,{});
  const L=new Map(s.letters.map(o=>[o.r+","+o.c,o.ch]));
  const D=new Map(s.defs.map(o=>[o.r+","+o.c,o.clues]));
  console.log("\nПример сканворда "+s.rows+"x"+s.cols+" ("+s.count+" слов):");
  for(let r=0;r<s.rows;r++){let line="";for(let c=0;c<s.cols;c++){
    const k=r+","+c;
    if(L.has(k)) line+=" "+L.get(k)+" ";
    else if(D.has(k)){const dirs=D.get(k).map(x=>x.dir==="a"?"→":"↓").join("");line+=(dirs+"  ").slice(0,2)+" ".slice(0,1);line=line.slice(0,-1)+" ";}
    else line+=" · ";
  }console.log(line);}
  console.log("\nПримеры вопросов (первые 6):");
  s.defs.slice(0,6).forEach(d=>d.clues.forEach(cl=>console.log("  ("+d.r+","+d.c+") "+(cl.dir==="a"?"→":"↓")+" "+cl.clue+" = "+cl.answer)));
}
