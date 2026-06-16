// ================= UI / логика =================
const $=id=>document.getElementById(id);
const SIZES={small:{target:10,maxLen:7,tries:42},medium:{target:14,maxLen:8,tries:36},large:{target:18,maxLen:9,tries:30}};
const THEME_ICONS={"Животные":["🦁","🐘"],"Природа":["🌸","🌿"],"Еда":["🍎","🍕"],"Дом":["🏠","🌻"],"Школа":["📚","🎓"],"Транспорт":["✈️","🚂"],"Люди":["🎭","🤝"]};
const SCAN_SIZES={small:{target:20,maxLen:5,tries:14,minWords:12,dense:true},medium:{target:30,maxLen:6,tries:16,minWords:18,dense:true},large:{target:38,maxLen:7,tries:12,minWords:24,dense:true}};

let model=null, activeKey=null, activeDir="a", celebrated=false, mode="crossword";
const gridEl=$("grid"), hidden=$("hidden");

// ---- мобильная клавиатура ----
const isMobile=window.matchMedia("(pointer:coarse) and (hover:none)").matches;
(function buildSoftKbd(){
  if(!isMobile)return;
  hidden.setAttribute("inputmode","none");
  const kbd=$("softkbd");
  ["ЙЦУКЕНГШЩЗХ","ФЫВАПРОЛДЖЭ","ЯЧСМИТЬБЮ"].forEach((row,ri)=>{
    const div=document.createElement("div");div.className="skrow";
    [...row].forEach(ch=>{
      const b=document.createElement("button");b.className="sk";b.textContent=ch;
      b.addEventListener("pointerdown",e=>{e.preventDefault();if(model)typeLetter(ch);});
      div.appendChild(b);
    });
    if(ri===2){
      const d=document.createElement("button");d.className="sk del";d.textContent="⌫";
      d.addEventListener("pointerdown",e=>{e.preventDefault();if(model)backspace();});
      div.appendChild(d);
    }
    kbd.appendChild(div);
  });
})();

// ---- хранилище ----
const Store={
  async get(k){try{if(window.storage&&window.storage.get){const r=await window.storage.get(k);return r?r.value:null;}return localStorage.getItem(k);}catch(e){return null;}},
  async set(k,v){try{if(window.storage&&window.storage.set){await window.storage.set(k,v,false);return;}localStorage.setItem(k,v);}catch(e){}}
};

// ---- темы в выпадающий список ----
(function fillThemes(){
  const sel=$("themeSel"); const themes=[...new Set(DICTIONARY.map(e=>e.t))];
  sel.innerHTML='<option value="all">Все темы</option>'+themes.map(t=>`<option value="${t}">${t}</option>`).join("");
})();

// ---- построение модели кроссворда ----
function buildModel(gen){
  const cells=new Map(), words=[];
  for(const w of gen.words){
    const keys=[];
    for(let i=0;i<w.answer.length;i++){
      const r=w.r+(w.dir==="d"?i:0), c=w.c+(w.dir==="a"?i:0), k=K(r,c);
      if(!cells.has(k)) cells.set(k,{r,c,sol:w.answer[i],user:"",num:0,a:null,d:null,el:null,locked:false,isClue:false});
      keys.push(k);
    }
    words.push({dir:w.dir,r:w.r,c:w.c,answer:w.answer,clue:w.clue,num:w.num,keys,start:keys[0]});
  }
  for(const w of words){for(const k of w.keys) cells.get(k)[w.dir]=w; cells.get(w.start).num=w.num;}
  const ordered=[...words].sort((x,y)=>x.num-y.num||(x.dir==="a"?-1:1));
  return {cells,words,ordered,rows:gen.rows,cols:gen.cols,type:"crossword"};
}

// ---- построение модели сканворда ----
function buildScanModel(gen){
  const cells=new Map(), words=[];
  for(const {r,c,ch} of gen.letters)
    cells.set(K(r,c),{r,c,sol:ch,user:"",a:null,d:null,el:null,locked:false,isClue:false});
  for(const {r,c,clues} of gen.defs)
    cells.set(K(r,c),{r,c,el:null,isClue:true,clues});
  for(const w of gen.words){
    const keys=[];
    for(let i=0;i<w.answer.length;i++){
      const r=w.r+(w.dir==="d"?i:0), c=w.c+(w.dir==="a"?i:0);
      keys.push(K(r,c));
    }
    words.push({dir:w.dir,r:w.r,c:w.c,answer:w.answer,clue:w.clue,keys,start:keys[0]});
  }
  for(const w of words) for(const k of w.keys) cells.get(k)[w.dir]=w;
  return {cells,words,ordered:[...words],rows:gen.rows,cols:gen.cols,type:"scanword"};
}

// ---- генерация нового пазла ----
function newPuzzle(){
  const isScan=mode==="scanword";
  $("loading").style.display="flex";
  $("loading").querySelector(".load-text").textContent=isScan?"Собираю сканворд…":"Собираю кроссворд…";
  $("newBtn").textContent="✦ Новый "+(isScan?"сканворд":"кроссворд");
  setTimeout(()=>{
    const theme=$("themeSel").value, size=$("sizeSel").value;
    const pool=theme==="all"?DICTIONARY:DICTIONARY.filter(e=>e.t===theme);
    const entries=pool.map(e=>({answer:e.a,clue:e.c}));
    const opts=isScan?(SCAN_SIZES[size]||SCAN_SIZES.medium):(SIZES[size]||SIZES.medium);
    let gen=null,n=0;
    while(!gen&&n<4){gen=isScan?makeScanword(entries,opts):makeCrossword(entries,opts);n++;}
    if(!gen) gen=isScan?makeScanword(entries,{target:18,maxLen:5,tries:60,minWords:10,attempts:4}):makeCrossword(entries,{target:8,maxLen:7,tries:30});
    model=isScan?buildScanModel(gen):buildModel(gen); celebrated=false;
    isScan?renderScan():render(); selectFirst(); saveState();
    $("loading").style.display="none";
  },30);
}

// ---- отрисовка кроссворда ----
function render(){
  gridEl.classList.remove("scanword");
  gridEl.parentElement.classList.remove("scan-mode");
  gridEl.style.gridTemplateColumns=`repeat(${model.cols}, var(--cs))`;
  gridEl.innerHTML="";
  for(let r=0;r<model.rows;r++) for(let c=0;c<model.cols;c++){
    const k=K(r,c), cell=model.cells.get(k);
    if(!cell){const g=document.createElement("div");g.className="gap";gridEl.appendChild(g);continue;}
    const d=document.createElement("div");d.className="cell";d.dataset.k=k;
    if(cell.num){const nm=document.createElement("span");nm.className="num";nm.textContent=cell.num;d.appendChild(nm);}
    const lt=document.createElement("span");lt.className="ltr";lt.textContent=cell.user||"";d.appendChild(lt);
    d.addEventListener("click",()=>onCellTap(k));
    cell.el=d; gridEl.appendChild(d);
  }
  layoutGrid(); buildClueLists();
}

// ---- отрисовка сканворда ----
function renderScan(){
  gridEl.classList.add("scanword");
  gridEl.style.gridTemplateColumns=`repeat(${model.cols}, var(--cs))`;
  gridEl.innerHTML="";
  // two large background icons based on theme, shown through transparent gap cells
  const _th=$("themeSel").value, _ic=THEME_ICONS[_th]||["🌟","🎉"];
  ["scan-bg scan-bg-1","scan-bg scan-bg-2"].forEach((cls,i)=>{
    const bg=document.createElement("div");bg.className=cls;
    bg.textContent=_ic[i];bg.setAttribute("aria-hidden","true");
    gridEl.appendChild(bg);
  });
  gridEl.parentElement.classList.add("scan-mode");
  for(let r=0;r<model.rows;r++) for(let c=0;c<model.cols;c++){
    const k=K(r,c), cell=model.cells.get(k);
    if(!cell){
      const g=document.createElement("div");g.className="gap";
      gridEl.appendChild(g);continue;
    }
    const d=document.createElement("div");
    if(cell.isClue){
      d.className="cell clue-cell";
      d.innerHTML=cell.clues.map(cl=>`<span class="arrow ${cl.dir}">${cl.dir==="a"?"→":"↓"}</span>`).join("");
      d.addEventListener("click",()=>onClueTap(cell));
    }else{
      d.className="cell"; d.dataset.k=k;
      const lt=document.createElement("span");lt.className="ltr";lt.textContent=cell.user||"";d.appendChild(lt);
      d.addEventListener("click",()=>onCellTap(k));
    }
    cell.el=d; gridEl.appendChild(d);
  }
  layoutGrid();
  $("cluePanel").innerHTML=""; $("mobileClues").innerHTML="";
}

function layoutGrid(){
  const avail=Math.min(gridEl.parentElement.clientWidth, 560)-2;
  let cs=Math.floor(avail/model.cols);
  cs=Math.max(20,Math.min(cs,46));
  document.documentElement.style.setProperty("--cs",cs+"px");
}
window.addEventListener("resize",()=>{if(model)layoutGrid();});

// ---- выбор клетки/слова ----
function onCellTap(k){
  const c=model.cells.get(k);
  if(activeKey===k){if(c.a&&c.d) activeDir=activeDir==="a"?"d":"a";}
  else{activeKey=k;if(!c[activeDir]) activeDir=c.a?"a":"d";}
  focusHidden(); refresh();
}
function onClueTap(cell){
  // prefer the direction matching activeDir, else take first
  const cl=cell.clues.find(x=>x.dir===activeDir)||cell.clues[0];
  const r=cl.dir==="d"?cell.r+1:cell.r, c=cl.dir==="a"?cell.c+1:cell.c;
  const k=K(r,c);
  if(model.cells.has(k)&&!model.cells.get(k).isClue){activeKey=k;activeDir=cl.dir;focusHidden();refresh();}
}
function selectFirst(){const w=model.ordered[0];activeDir=w.dir;activeKey=w.start;if(isMobile)$("softkbd").classList.add("show");refresh();}
function activeWord(){return model.cells.get(activeKey)[activeDir];}
function focusHidden(){
  if(isMobile){$("softkbd").classList.add("show");return;}
  hidden.value="";try{hidden.focus({preventScroll:true});}catch(e){hidden.focus();}
}

// ---- ввод ----
hidden.addEventListener("input",()=>{
  const v=hidden.value; hidden.value="";
  const ch=v.slice(-1).toUpperCase();
  if(/[А-ЯЁ]/.test(ch)) typeLetter(ch==="Ё"?"Е":ch);
});
hidden.addEventListener("keydown",e=>{
  if(e.key==="Backspace"){e.preventDefault();backspace();}
  else if(e.key==="ArrowRight"){e.preventDefault();moveSel(0,1);}
  else if(e.key==="ArrowLeft"){e.preventDefault();moveSel(0,-1);}
  else if(e.key==="ArrowUp"){e.preventDefault();moveSel(-1,0);}
  else if(e.key==="ArrowDown"){e.preventDefault();moveSel(1,0);}
  else if(e.key===" "){e.preventDefault();const c=model.cells.get(activeKey);if(c&&!c.isClue&&c.a&&c.d){activeDir=activeDir==="a"?"d":"a";refresh();}}
  else if(e.key==="Tab"){e.preventDefault();nextWord(e.shiftKey?-1:1);}
});
function checkWordAuto(word){
  if(!word||!word.keys.every(k=>model.cells.get(k).user))return false;
  if(!word.keys.every(k=>{const c=model.cells.get(k);return c.user===c.sol;}))return false;
  for(const k of word.keys){const c=model.cells.get(k);c.locked=true;if(c.el){c.el.classList.add("right");c.el.classList.remove("wrong");}}
  return true;
}
function typeLetter(ch){
  const c=model.cells.get(activeKey);
  if(!c||c.isClue||c.locked)return;
  c.user=ch; c.el.classList.remove("wrong","right","revealed");
  c.el.querySelector(".ltr").textContent=ch;
  const wA=c.a, wD=c.d;
  advance(); saveState(); refresh();
  const lA=checkWordAuto(wA), lD=checkWordAuto(wD);
  if(lA||lD){if(model.cells.get(activeKey).locked)nextWord(1);else refresh();}
}
function advance(){
  const w=activeWord(); const i=w.keys.indexOf(activeKey);
  for(let j=i+1;j<w.keys.length;j++){const c=model.cells.get(w.keys[j]);if(!c.user&&!c.locked){activeKey=w.keys[j];return;}}
  for(let j=i+1;j<w.keys.length;j++){if(!model.cells.get(w.keys[j]).locked){activeKey=w.keys[j];return;}}
}
function backspace(){
  const c=model.cells.get(activeKey);
  if(!c||c.isClue||c.locked)return;
  if(c.user){c.user="";c.el.querySelector(".ltr").textContent="";c.el.classList.remove("wrong","right","revealed");}
  else{
    const w=activeWord();const i=w.keys.indexOf(activeKey);
    for(let j=i-1;j>=0;j--){const p=model.cells.get(w.keys[j]);if(!p.locked){activeKey=w.keys[j];p.user="";p.el.querySelector(".ltr").textContent="";p.el.classList.remove("wrong","right","revealed");break;}}
  }
  saveState(); refresh();
}
function moveSel(dr,dc){
  let r=model.cells.get(activeKey).r+dr, c=model.cells.get(activeKey).c+dc;
  while(r>=0&&c>=0&&r<model.rows&&c<model.cols){
    const k=K(r,c);
    if(model.cells.has(k)){const cc=model.cells.get(k);if(!cc.isClue){activeKey=k;if(!cc[activeDir])activeDir=cc.a?"a":"d";refresh();return;}}
    r+=dr;c+=dc;
  }
}
function nextWord(dir){
  const idx=model.ordered.indexOf(activeWord());
  const w=model.ordered[(idx+dir+model.ordered.length)%model.ordered.length];
  activeDir=w.dir; activeKey=w.start; focusHidden(); refresh();
}

// ---- подсветка и обновление ----
function refresh(){
  const w=activeWord(); const inword=new Set(w?w.keys:[]);
  for(const [k,c] of model.cells){
    if(!c.el)continue;
    if(c.isClue){
      const isActiveClue=w&&((w.dir==="a"&&c.r===w.r&&c.c===w.c-1)||(w.dir==="d"&&c.r===w.r-1&&c.c===w.c));
      c.el.classList.toggle("clue-active",!!isActiveClue);
    }else{
      c.el.classList.toggle("inword",inword.has(k)&&k!==activeKey);
      c.el.classList.toggle("active",k===activeKey);
    }
  }
  if(w){
    if(model.type==="scanword"){
      $("clueTag").textContent=w.dir==="a"?"→ горизонталь":"↓ вертикаль";
      $("clueText").textContent=w.clue;
    }else{
      $("clueTag").textContent=w.dir==="a"?"по горизонтали":"по вертикали";
      $("clueText").textContent=w.num+". "+w.clue;
    }
  }
  document.querySelectorAll(".clue").forEach(el=>{
    el.classList.toggle("active",el.dataset.k===activeKey&&el.dataset.dir===activeDir);
    const ww=model.ordered.find(x=>x.start===el.dataset.k&&x.dir===el.dataset.dir);
    if(ww)el.classList.toggle("solved",ww.keys.every(k=>model.cells.get(k).user===model.cells.get(k).sol));
  });
  let filled=0,total=0;
  for(const[,c]of model.cells){if(c.isClue)continue;total++;if(c.user)filled++;}
  $("progress").innerHTML=`Заполнено <b>${filled}</b> из <b>${total}</b> клеток`;
  if(filled===total&&!celebrated){
    let allRight=true;
    for(const[,c]of model.cells){if(c.isClue)continue;if(c.user!==c.sol){allRight=false;break;}}
    if(allRight)celebrate();
  }
}

// ---- списки вопросов (только для кроссворда) ----
function buildClueLists(){
  const across=model.ordered.filter(w=>w.dir==="a"), down=model.ordered.filter(w=>w.dir==="d");
  const html=col=>col.map(w=>`<div class="clue" data-k="${w.start}" data-dir="${w.dir}"><span class="n">${w.num}</span><span class="t">${w.clue}</span></div>`).join("");
  const block=`<div class="cluecol"><h3>По горизонтали</h3>${html(across)}</div><div class="cluecol"><h3>По вертикали</h3>${html(down)}</div>`;
  $("cluePanel").innerHTML=block; $("mobileClues").innerHTML=block;
  document.querySelectorAll(".clue").forEach(el=>el.addEventListener("click",()=>{activeKey=el.dataset.k;activeDir=el.dataset.dir;focusHidden();refresh();}));
}

// ---- кнопки ----
$("hintBtn").addEventListener("click",()=>{
  const c=model.cells.get(activeKey);if(!c||c.locked||c.isClue)return;
  c.user=c.sol;c.el.querySelector(".ltr").textContent=c.sol;
  c.el.classList.remove("wrong");c.el.classList.add("revealed");
  const wA=c.a, wD=c.d;
  advance();saveState();refresh();
  const lA=checkWordAuto(wA), lD=checkWordAuto(wD);
  if(lA||lD){if(model.cells.get(activeKey).locked)nextWord(1);else refresh();}
});
$("clearBtn").addEventListener("click",()=>{
  for(const[,c]of model.cells){if(!c.el||c.isClue)continue;c.user="";c.locked=false;c.el.querySelector(".ltr").textContent="";c.el.classList.remove("wrong","right","revealed");}
  saveState();refresh();
});
$("prevW").addEventListener("click",()=>nextWord(-1));
$("nextW").addEventListener("click",()=>nextWord(1));
$("newBtn").addEventListener("click",newPuzzle);
$("themeSel").addEventListener("change",newPuzzle);
$("sizeSel").addEventListener("change",newPuzzle);
$("modeSel").addEventListener("change",()=>{mode=$("modeSel").value;newPuzzle();});

// ---- победа ----
function celebrate(){
  celebrated=true;
  $("winText").textContent=`Тема: ${$("themeSel").options[$("themeSel").selectedIndex].text}. Отличная работа!`;
  $("win").classList.add("show"); confetti();
}
$("winNew").addEventListener("click",()=>{$("win").classList.remove("show");newPuzzle();});
$("winClose").addEventListener("click",()=>$("win").classList.remove("show"));
function confetti(){
  if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const box=$("confetti"); const cols=["#C44569","#2A9D8F","#E9C46A","#28243D","#F2A1B6"];
  for(let i=0;i<70;i++){const d=document.createElement("div");d.className="conf";
    d.style.left=Math.random()*100+"%";d.style.background=cols[i%cols.length];d.style.borderColor="rgba(40,36,61,.3)";
    const dur=2.2+Math.random()*1.6;d.style.animation=`fall ${dur}s linear ${Math.random()*0.5}s forwards`;
    d.style.opacity=0.9;box.appendChild(d);setTimeout(()=>d.remove(),(dur+1)*1000);}
}

// ---- сохранение / восстановление ----
function saveState(){
  if(!model)return;
  const g={type:model.type,rows:model.rows,cols:model.cols,
    theme:$("themeSel").value,size:$("sizeSel").value,
    words:model.words.map(w=>({answer:w.answer,clue:w.clue,r:w.r,c:w.c,dir:w.dir,num:w.num||0}))};
  if(model.type==="scanword"){
    g.letters=[...model.cells].filter(([,c])=>!c.isClue).map(([,c])=>({r:c.r,c:c.c,ch:c.sol}));
    g.defs=[...model.cells].filter(([,c])=>c.isClue).map(([,c])=>({r:c.r,c:c.c,clues:c.clues}));
  }
  const user={};for(const[k,c]of model.cells)if(!c.isClue&&c.user)user[k]=c.user;
  Store.set("cw_state",JSON.stringify({g,user}));
}
async function start(){
  const raw=await Store.get("cw_state");
  if(raw){try{
    const {g,user}=JSON.parse(raw);
    if(g&&g.words&&g.words.length){
      $("themeSel").value=g.theme||"all"; $("sizeSel").value=g.size||"medium";
      const isScan=g.type==="scanword";
      if(isScan){$("modeSel").value="scanword"; mode="scanword"; $("newBtn").textContent="✦ Новый сканворд";}
      model=isScan?buildScanModel(g):buildModel(g); celebrated=false;
      isScan?renderScan():render();
      if(user)for(const k in user){const c=model.cells.get(k);if(c&&!c.isClue){c.user=user[k];const lt=c.el&&c.el.querySelector(".ltr");if(lt)lt.textContent=user[k];}}
      for(const w of model.words){if(w.keys.every(k=>{const c=model.cells.get(k);return c.user===c.sol;})){for(const k of w.keys){const c=model.cells.get(k);c.locked=true;if(c.el)c.el.classList.add("right");}}}
      selectFirst(); return;
    }
  }catch(e){}}
  newPuzzle();
}
start();
