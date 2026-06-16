// ===== Чистый генератор кроссвордов (greedy + проверки) =====
// Гарантии: все слова связаны, нет конфликтов букв, нет «паразитных»
// соседних слов (каждый ряд/столбец из >=2 заполненных клеток — это слово).

function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];} return a; }
const K=(r,c)=>r+","+c;

function normalizeEntries(entries, maxLen){
  maxLen=maxLen||10;
  const seen=new Set(), out=[];
  for(const e of entries){
    let a=(e.answer||e.a||"").toUpperCase().replace(/Ё/g,"Е").replace(/[^А-Я]/g,"");
    if(a.length<3||a.length>maxLen) continue;
    if(seen.has(a)) continue; seen.add(a);
    out.push({answer:a, clue:e.clue});
  }
  return out;
}

function tryPlace(word, sr, sc, horiz, grid){
  // returns {ok, crossings} ; checks all rules
  const len=word.length; let crossings=0;
  // before/after along axis must be empty
  const beforeK = horiz?K(sr,sc-1):K(sr-1,sc);
  const afterK  = horiz?K(sr,sc+len):K(sr+len,sc);
  if(grid.has(beforeK)||grid.has(afterK)) return {ok:false};
  for(let k=0;k<len;k++){
    const r=horiz?sr:sr+k, c=horiz?sc+k:sc, key=K(r,c);
    const cur=grid.get(key);
    if(cur!==undefined){
      if(cur!==word[k]) return {ok:false};
      crossings++; // valid crossing, perpendicular neighbours allowed
    }else{
      // empty cell: perpendicular neighbours must be empty
      const n1=horiz?K(r-1,c):K(r,c-1);
      const n2=horiz?K(r+1,c):K(r,c+1);
      if(grid.has(n1)||grid.has(n2)) return {ok:false};
    }
  }
  return {ok:true, crossings};
}

function attempt(entries, target){
  const pool=shuffle(entries).slice(0, Math.min(entries.length, 80));
  pool.sort((a,b)=>b.answer.length-a.answer.length);
  const grid=new Map(); const placed=[];
  const first=pool[0];
  for(let k=0;k<first.answer.length;k++) grid.set(K(0,k), first.answer[k]);
  placed.push({...first, r:0, c:0, horiz:true});
  let bnd={minR:0,minC:0,maxR:0,maxC:first.answer.length-1};
  const usedPool = pool.slice(1);

  for(let pass=0; pass<3 && placed.length<target; pass++){
    for(const cand of usedPool){
      if(placed.some(p=>p.answer===cand.answer)) continue;
      if(placed.length>=target) break;
      const w=cand.answer; let best=null;
      for(let i=0;i<w.length;i++){
        for(const p of placed){
          for(let k=0;k<p.answer.length;k++){
            if(p.answer[k]!==w[i]) continue;
            const cr = p.horiz?p.r:p.r+k;
            const cc = p.horiz?p.c+k:p.c;
            const horiz=!p.horiz;
            const sr=horiz?cr:cr-i, sc=horiz?cc-i:cc;
            const res=tryPlace(w,sr,sc,horiz,grid);
            if(res.ok){
              const er=horiz?sr:sr+w.length-1, ec=horiz?sc+w.length-1:sc;
              const nMaxR=Math.max(bnd.maxR,er), nMinR=Math.min(bnd.minR,sr);
              const nMaxC=Math.max(bnd.maxC,ec), nMinC=Math.min(bnd.minC,sc);
              const side=Math.max(nMaxR-nMinR+1, nMaxC-nMinC+1);
              const area=(nMaxR-nMinR+1)*(nMaxC-nMinC+1);
              const score=res.crossings*50 - side*16 - area*0.12;
              if(!best||score>best.score) best={sr,sc,horiz,score,er,ec};
            }
          }
        }
      }
      if(best){
        for(let k=0;k<w.length;k++){
          const r=best.horiz?best.sr:best.sr+k, c=best.horiz?best.sc+k:best.sc;
          grid.set(K(r,c), w[k]);
        }
        placed.push({...cand, r:best.sr, c:best.sc, horiz:best.horiz});
        bnd.minR=Math.min(bnd.minR,best.sr); bnd.minC=Math.min(bnd.minC,best.sc);
        bnd.maxR=Math.max(bnd.maxR,best.er); bnd.maxC=Math.max(bnd.maxC,best.ec);
      }
    }
  }
  return {placed, grid};
}

function makeCrossword(entries, opts={}){
  const maxLen=opts.maxLen||9;
  entries=normalizeEntries(entries, maxLen);
  const target=opts.target||14;
  let best=null;
  const tries=opts.tries||30;
  const minWords=opts.minWords||Math.max(6,target-3);
  const dims=res=>{let a=1e9,b=1e9,x=-1e9,y=-1e9;for(const k of res.grid.keys()){const [r,c]=k.split(",").map(Number);a=Math.min(a,r);b=Math.min(b,c);x=Math.max(x,r);y=Math.max(y,c);}return {area:(x-a+1)*(y-b+1), side:Math.max(x-a+1,y-b+1)};};
  const better=(r,b)=>{
    if(!b) return true;
    const rOk=r.placed.length>=minWords, bOk=b.placed.length>=minWords;
    if(rOk!==bOk) return rOk;                       // достаточно слов — приоритет
    if(rOk){ // оба норм по словам -> компактнее
      if(r._side!==b._side) return r._side<b._side;
      return r._area<b._area;
    }
    return r.placed.length>b.placed.length;         // иначе больше слов
  };
  for(let t=0;t<tries;t++){
    const res=attempt(entries, target);
    const d=dims(res); res._area=d.area; res._side=d.side;
    if(better(res,best)) best=res;
  }
  if(!best||best.placed.length<3) return null;
  // normalize coords, assign numbers
  let minR=1e9,minC=1e9,maxR=-1e9,maxC=-1e9;
  for(const k of best.grid.keys()){const [r,c]=k.split(",").map(Number);minR=Math.min(minR,r);minC=Math.min(minC,c);maxR=Math.max(maxR,r);maxC=Math.max(maxC,c);}
  const words=best.placed.map(p=>({answer:p.answer, clue:p.clue, r:p.r-minR, c:p.c-minC, dir:p.horiz?"a":"d"}));
  const cells=new Map();
  for(const w of words) for(let i=0;i<w.answer.length;i++){
    const r=w.r+(w.dir==="d"?i:0), c=w.c+(w.dir==="a"?i:0), key=K(r,c);
    if(!cells.has(key)) cells.set(key,{r,c,sol:w.answer[i],a:null,d:null,num:0});
    cells.get(key)[w.dir]=true;
  }
  const rows=maxR-minR+1, cols=maxC-minC+1;
  let n=0;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const key=K(r,c);
    if(cells.has(key)&&words.some(w=>w.r===r&&w.c===c)){ n++; cells.get(key).num=n; }
  }
  for(const w of words) w.num=cells.get(K(w.r,w.c)).num;
  return {words, rows, cols, count:words.length, cellsCount:cells.size};
}

if(typeof module!=="undefined") module.exports={makeCrossword, normalizeEntries, K};
