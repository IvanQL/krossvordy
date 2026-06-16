// ===== Генератор сканвордов =====
const cw=(typeof require!=="undefined")?require("./crossword.js"):null;
const _make=cw?cw.makeCrossword:makeCrossword;
const _K=cw?cw.K:K;

// ---- кроссвордный конвертер (для bench-совместимости) ----
function _buildScan(gen){
  const letters=new Map();
  for(const w of gen.words) for(let i=0;i<w.answer.length;i++){
    const r=w.r+(w.dir==="d"?i:0)+1,c=w.c+(w.dir==="a"?i:0)+1;
    letters.set(_K(r,c),w.answer[i]);
  }
  const defs=new Map();
  for(const w of gen.words){
    const r=w.r+1,c=w.c+1;
    const dk=w.dir==="a"?_K(r,c-1):_K(r-1,c);
    if(!defs.has(dk))defs.set(dk,[]);
    defs.get(dk).push({dir:w.dir,clue:w.clue,answer:w.answer});
  }
  const rows=gen.rows+1,cols=gen.cols+1;
  for(const[k]of defs)if(letters.has(k))return null;
  return{rows,cols,
    letters:[...letters].map(([k,ch])=>{const[r,c]=k.split(",").map(Number);return{r,c,ch};}),
    defs:[...defs].map(([k,cl])=>{const[r,c]=k.split(",").map(Number);return{r,c,clues:cl};}),
    words:gen.words.map(w=>({answer:w.answer,clue:w.clue,r:w.r+1,c:w.c+1,dir:w.dir})),
    count:gen.words.length};
}

// ---- плотный генератор сканвордов ----
// Ключевое отличие от кроссворда: слова МОГУТ стоять в соседних рядах/столбцах
// без пустых клеток между ними — клетка-вопрос сама является разделителем.

function _normPool(entries,maxLen){
  const seen=new Set(),out=[];
  for(const e of entries){
    const a=(e.answer||"").toUpperCase().replace(/Ё/g,"Е").replace(/[^А-Я]/g,"");
    if(a.length<3||a.length>maxLen||seen.has(a))continue;
    seen.add(a);out.push({answer:a,clue:e.clue||""});
  }
  return out;
}
function _shuf(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];}return a;}

function _canPlace(word,sr,sc,dir,L,C){
  const h=dir==="a";
  // клетка-вопрос не должна лежать на букве
  if(L.has(_K(h?sr:sr-1,h?sc-1:sc)))return false;
  // клетка сразу после слова не должна быть буквой (иначе слово зрительно удлиняется)
  if(L.has(_K(sr+(h?0:word.length),sc+(h?word.length:0))))return false;
  for(let i=0;i<word.length;i++){
    const r=sr+(h?0:i),c=sc+(h?i:0),k=_K(r,c);
    if(C.has(k))return false;            // буква попадает на клетку-вопрос
    const cur=L.get(k);
    if(cur!==undefined&&cur!==word[i])return false; // конфликт букв
  }
  return true;
}
function _place(word,sr,sc,dir,L,C){
  const h=dir==="a";
  for(let i=0;i<word.length;i++)L.set(_K(sr+(h?0:i),sc+(h?i:0)),word[i]);
  C.add(_K(h?sr:sr-1,h?sc-1:sc));
}

function _denseAttempt(pool,target,minWords){
  if(!pool.length)return null;
  const L=new Map(),C=new Set(),placed=[];
  const f=pool[0];
  _place(f.answer,0,1,"a",L,C);
  placed.push({...f,r:0,c:1,dir:"a"});
  let minR=0,maxR=0,minC=1,maxC=f.answer.length;

  for(let i=1;i<pool.length&&placed.length<target;i++){
    const ent=pool[i];const w=ent.answer;const wl=w.length;
    let best=null,bestScore=-Infinity;

    const tryPos=(sr,sc,dir)=>{
      if(!_canPlace(w,sr,sc,dir,L,C))return;
      const h=dir==="a";
      let x=0;for(let j=0;j<wl;j++)if(L.has(_K(sr+(h?0:j),sc+(h?j:0))))x++;
      const er=sr+(h?0:wl-1),ec=sc+(h?wl-1:0);
      const area=(Math.max(maxR,er)-Math.min(minR,sr)+2)*(Math.max(maxC,ec)-Math.min(minC,sc)+2);
      const score=x*50-area*0.2;
      if(score>bestScore){bestScore=score;best={sr,sc,dir,er,ec};}
    };

    // вариант 1: пересечение с существующей буквой
    for(let wi=0;wi<wl;wi++){
      for(const[k,ch]of L){
        if(ch!==w[wi])continue;
        const[pr,pc]=k.split(",").map(Number);
        tryPos(pr,pc-wi,"a");
        tryPos(pr-wi,pc,"d");
      }
    }
    // вариант 2: вплотную к уже размещённому слову (без пересечения)
    for(const p of placed){
      const pl=p.answer.length,h=p.dir==="a";
      if(h){
        for(const ar of[p.r-1,p.r+1])
          for(let sc=p.c-wl+1;sc<=p.c+pl-1;sc++)tryPos(ar,sc,"a");
      }else{
        for(const ac of[p.c-1,p.c+1])
          for(let sr=p.r-wl+1;sr<=p.r+pl-1;sr++)tryPos(sr,ac,"d");
      }
    }

    if(best){
      _place(w,best.sr,best.sc,best.dir,L,C);
      placed.push({...ent,r:best.sr,c:best.sc,dir:best.dir});
      minR=Math.min(minR,best.sr);maxR=Math.max(maxR,best.er);
      minC=Math.min(minC,best.sc);maxC=Math.max(maxC,best.ec);
    }
  }
  if(placed.length<minWords)return null;

  // нормализация: буквы начинаются с (1,1), клетки-вопросы — в строке 0 или столбце 0
  const L2=new Map(),D2=new Map();
  for(const p of placed){
    const pr=p.r-minR+1,pc=p.c-minC+1,h=p.dir==="a";
    for(let i=0;i<p.answer.length;i++)L2.set(_K(pr+(h?0:i),pc+(h?i:0)),p.answer[i]);
    const dk=_K(h?pr:pr-1,h?pc-1:pc);
    if(!D2.has(dk))D2.set(dk,[]);
    D2.get(dk).push({dir:p.dir,clue:p.clue,answer:p.answer});
  }
  for(const[k]of D2)if(L2.has(k))return null;
  const rows=maxR-minR+2,cols=maxC-minC+2;
  return{rows,cols,
    letters:[...L2].map(([k,ch])=>{const[r,c]=k.split(",").map(Number);return{r,c,ch};}),
    defs:[...D2].map(([k,cl])=>{const[r,c]=k.split(",").map(Number);return{r,c,clues:cl};}),
    words:placed.map(p=>({answer:p.answer,clue:p.clue,r:p.r-minR+1,c:p.c-minC+1,dir:p.dir})),
    count:placed.length};
}

function makeScanwordDense(entries,opts={}){
  const pool=_normPool(entries,opts.maxLen||7);
  const target=opts.target||28,minW=opts.minWords||14,tries=opts.tries||20;
  let best=null,bestFill=0;
  for(let t=0;t<tries;t++){
    const sw=_denseAttempt(_shuf(pool).slice(0,80),target,minW);
    if(!sw)continue;
    const fill=(sw.letters.length+sw.defs.length)/(sw.rows*sw.cols);
    if(fill>bestFill){bestFill=fill;best=sw;}
    if(bestFill>0.62)break;
  }
  return best;
}

// ---- основная функция (bench: без dense, игра: dense:true) ----
function makeScanword(entries,opts={}){
  if(opts.dense)return makeScanwordDense(entries,opts);
  // crossword-based (bench-совместимый)
  const gen=_make(entries,{target:opts.target||22,maxLen:opts.maxLen||8,tries:opts.tries||40,minWords:opts.minWords||14});
  if(!gen)return null;
  return _buildScan(gen);
}

if(typeof module!=="undefined")module.exports={makeScanword,makeScanwordDense};

// --- прогон при прямом запуске ---
if(typeof require!=="undefined"&&require.main===module){
  const{DICTIONARY}=require("./dictionary.js");
  const entries=DICTIONARY.map(e=>({answer:e.a,clue:e.c}));
  let ok=0,fills=[],words=[];
  for(let i=0;i<30;i++){
    const s=makeScanwordDense(entries,{target:30,maxLen:6,tries:12,minWords:16});
    if(s){ok++;const f=(s.letters.length+s.defs.length)/(s.rows*s.cols);fills.push(f);words.push(s.count);}
  }
  fills.sort((a,b)=>a-b);
  console.log("Dense: "+ok+"/30 | слов~"+(words.reduce((a,b)=>a+b,0)/words.length).toFixed(0)
    +" | fill мед~"+(fills[fills.length>>1]*100).toFixed(0)+"%");
  const s=makeScanwordDense(entries,{target:30,maxLen:6,tries:12,minWords:16});
  if(s){
    const Lm=new Map(s.letters.map(o=>[o.r+","+o.c,o.ch]));
    const Dm=new Map(s.defs.map(o=>[o.r+","+o.c,o.clues]));
    console.log("\n"+s.rows+"x"+s.cols+" ("+s.count+" слов) fill="+(((s.letters.length+s.defs.length)/(s.rows*s.cols))*100).toFixed(0)+"%:");
    for(let r=0;r<s.rows;r++){let l="";for(let c=0;c<s.cols;c++){const k=r+","+c;
      if(Lm.has(k))l+=" "+Lm.get(k)+" ";
      else if(Dm.has(k)){const d=Dm.get(k).map(x=>x.dir==="a"?"→":"↓").join("");l+=(d+"  ").slice(0,2)+" ";}
      else l+=" · ";}console.log(l);}
  }
}
