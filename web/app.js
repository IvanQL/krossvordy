// ================= UI / логика =================
const $=id=>document.getElementById(id);
const SIZES={small:{target:10,maxLen:7,tries:42},medium:{target:14,maxLen:8,tries:36},large:{target:18,maxLen:9,tries:30}};

let model=null, activeKey=null, activeDir="a", celebrated=false;
const gridEl=$("grid"), hidden=$("hidden");

// ---- хранилище: артефакт (window.storage) или localStorage на хостинге ----
const Store={
  async get(k){try{if(window.storage&&window.storage.get){const r=await window.storage.get(k);return r?r.value:null;}return localStorage.getItem(k);}catch(e){return null;}},
  async set(k,v){try{if(window.storage&&window.storage.set){await window.storage.set(k,v,false);return;}localStorage.setItem(k,v);}catch(e){}}
};

// ---- темы в выпадающий список ----
(function fillThemes(){
  const sel=$("themeSel"); const themes=[...new Set(DICTIONARY.map(e=>e.t))];
  sel.innerHTML='<option value="all">Все темы</option>'+themes.map(t=>`<option value="${t}">${t}</option>`).join("");
})();

// ---- построение модели из результата генератора ----
function buildModel(gen){
  const cells=new Map(), words=[];
  for(const w of gen.words){
    const keys=[];
    for(let i=0;i<w.answer.length;i++){
      const r=w.r+(w.dir==="d"?i:0), c=w.c+(w.dir==="a"?i:0), k=K(r,c);
      if(!cells.has(k)) cells.set(k,{r,c,sol:w.answer[i],user:"",num:0,a:null,d:null,el:null,locked:false});
      keys.push(k);
    }
    words.push({dir:w.dir,r:w.r,c:w.c,answer:w.answer,clue:w.clue,num:w.num,keys,start:keys[0]});
  }
  for(const w of words){for(const k of w.keys) cells.get(k)[w.dir]=w; cells.get(w.start).num=w.num;}
  const ordered=[...words].sort((x,y)=>x.num-y.num||(x.dir==="a"?-1:1));
  return {cells,words,ordered,rows:gen.rows,cols:gen.cols};
}

// ---- генерация нового кроссворда ----
function newPuzzle(){
  $("loading").style.display="flex";
  setTimeout(()=>{
    const theme=$("themeSel").value, size=$("sizeSel").value;
    const pool=theme==="all"?DICTIONARY:DICTIONARY.filter(e=>e.t===theme);
    const entries=pool.map(e=>({answer:e.a,clue:e.c}));
    const opts=SIZES[size]||SIZES.medium;
    let gen=null,n=0;
    while(!gen&&n<6){gen=makeCrossword(entries,opts);n++;}
    if(!gen) gen=makeCrossword(entries,{target:8,maxLen:7,tries:30});
    model=buildModel(gen); celebrated=false;
    render(); selectFirst(); saveState();
    $("loading").style.display="none";
  },30);
}

// ---- отрисовка сетки ----
function render(){
  gridEl.style.gridTemplateColumns=`repeat(${model.cols}, var(--cs))`;
  gridEl.innerHTML="";
  for(let r=0;r<model.rows;r++)for(let c=0;c<model.cols;c++){
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
function layoutGrid(){
  const avail=Math.min(gridEl.parentElement.clientWidth, 560)-2;
  let cs=Math.floor(avail/model.cols);
  cs=Math.max(20,Math.min(cs,46));
  document.documentElement.style.setProperty("--cs",cs+"px");
}
window.addEventListener("resize",()=>{if(model)layoutGrid();});

// ---- выбор клетки/слова ----
function wordsAt(k){const c=model.cells.get(k);return [c.a,c.d].filter(Boolean);}
function onCellTap(k){
  const c=model.cells.get(k);
  if(activeKey===k){ // повторное нажатие — сменить направление
    if(c.a&&c.d) activeDir=activeDir==="a"?"d":"a";
  }else{
    activeKey=k;
    if(!c[activeDir]) activeDir=c.a?"a":"d";
  }
  focusHidden(); refresh();
}
function selectFirst(){const w=model.ordered[0];activeDir=w.dir;activeKey=w.start;refresh();}
function activeWord(){return model.cells.get(activeKey)[activeDir];}
function focusHidden(){hidden.value="";try{hidden.focus({preventScroll:true});}catch(e){hidden.focus();}}

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
  else if(e.key===" "){e.preventDefault();const c=model.cells.get(activeKey);if(c.a&&c.d){activeDir=activeDir==="a"?"d":"a";refresh();}}
  else if(e.key==="Tab"){e.preventDefault();nextWord(e.shiftKey?-1:1);}
});
function checkWordAuto(word){
  if(!word||!word.keys.every(k=>model.cells.get(k).user))return false;
  if(!word.keys.every(k=>{const c=model.cells.get(k);return c.user===c.sol;}))return false;
  for(const k of word.keys){const c=model.cells.get(k);c.locked=true;if(c.el){c.el.classList.add("right");c.el.classList.remove("wrong");}}
  return true;
}
function typeLetter(ch){
  if(model.cells.get(activeKey).locked)return;
  const c=model.cells.get(activeKey); c.user=ch; c.el.classList.remove("wrong","right","revealed");
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
  if(c.locked)return;
  if(c.user){c.user="";c.el.querySelector(".ltr").textContent="";c.el.classList.remove("wrong","right","revealed");}
  else{
    const w=activeWord();const i=w.keys.indexOf(activeKey);
    for(let j=i-1;j>=0;j--){const p=model.cells.get(w.keys[j]);if(!p.locked){activeKey=w.keys[j];p.user="";p.el.querySelector(".ltr").textContent="";p.el.classList.remove("wrong","right","revealed");break;}}
  }
  saveState(); refresh();
}
function moveSel(dr,dc){
  let r=model.cells.get(activeKey).r+dr, c=model.cells.get(activeKey).c+dc;
  while(r>=0&&c>=0&&r<model.rows&&c<model.cols){const k=K(r,c);if(model.cells.has(k)){activeKey=k;const cc=model.cells.get(k);if(!cc[activeDir])activeDir=cc.a?"a":"d";refresh();return;}r+=dr;c+=dc;}
}
function nextWord(dir){
  const idx=model.ordered.indexOf(activeWord());
  const w=model.ordered[(idx+dir+model.ordered.length)%model.ordered.length];
  activeDir=w.dir; activeKey=w.start; focusHidden(); refresh();
}

// ---- подсветка и обновление ----
function refresh(){
  const w=activeWord(); const inword=new Set(w?w.keys:[]);
  for(const [k,c] of model.cells){if(!c.el)continue;c.el.classList.toggle("inword",inword.has(k)&&k!==activeKey);c.el.classList.toggle("active",k===activeKey);}
  if(w){$("clueTag").textContent=w.dir==="a"?"по горизонтали":"по вертикали";$("clueText").textContent=w.num+". "+w.clue;}
  document.querySelectorAll(".clue").forEach(el=>{
    el.classList.toggle("active",el.dataset.k===activeKey&&el.dataset.dir===activeDir);
    const ww=model.ordered.find(x=>x.start===el.dataset.k&&x.dir===el.dataset.dir);
    if(ww)el.classList.toggle("solved",ww.keys.every(k=>model.cells.get(k).user===model.cells.get(k).sol));
  });
  let filled=0,total=model.cells.size;
  for(const[,c]of model.cells)if(c.user)filled++;
  $("progress").innerHTML=`Заполнено <b>${filled}</b> из <b>${total}</b> клеток`;
  if(filled===total&&!celebrated){let allRight=true;for(const[,c]of model.cells)if(c.user!==c.sol){allRight=false;break;}if(allRight)celebrate();}
}

// ---- списки вопросов ----
function buildClueLists(){
  const across=model.ordered.filter(w=>w.dir==="a"), down=model.ordered.filter(w=>w.dir==="d");
  const html=col=>col.map(w=>`<div class="clue" data-k="${w.start}" data-dir="${w.dir}"><span class="n">${w.num}</span><span class="t">${w.clue}</span></div>`).join("");
  const block=`<div class="cluecol"><h3>По горизонтали</h3>${html(across)}</div><div class="cluecol"><h3>По вертикали</h3>${html(down)}</div>`;
  $("cluePanel").innerHTML=block; $("mobileClues").innerHTML=block;
  document.querySelectorAll(".clue").forEach(el=>el.addEventListener("click",()=>{activeKey=el.dataset.k;activeDir=el.dataset.dir;focusHidden();refresh();}));
}

// ---- кнопки ----
$("checkBtn").addEventListener("click",()=>{
  for(const[,c]of model.cells){if(!c.el)continue;c.el.classList.remove("wrong","right");if(c.user){c.el.classList.add(c.user===c.sol?"right":"wrong");}}
  refresh();
});
$("hintBtn").addEventListener("click",()=>{
  const c=model.cells.get(activeKey);if(!c||c.locked)return;
  c.user=c.sol;c.el.querySelector(".ltr").textContent=c.sol;
  c.el.classList.remove("wrong");c.el.classList.add("revealed");
  const wA=c.a, wD=c.d;
  advance();saveState();refresh();
  const lA=checkWordAuto(wA), lD=checkWordAuto(wD);
  if(lA||lD){if(model.cells.get(activeKey).locked)nextWord(1);else refresh();}
});
$("clearBtn").addEventListener("click",()=>{
  for(const[,c]of model.cells){if(!c.el)continue;c.user="";c.locked=false;c.el.querySelector(".ltr").textContent="";c.el.classList.remove("wrong","right","revealed");}
  saveState();refresh();
});
$("prevW").addEventListener("click",()=>nextWord(-1));
$("nextW").addEventListener("click",()=>nextWord(1));
$("newBtn").addEventListener("click",newPuzzle);
$("themeSel").addEventListener("change",newPuzzle);
$("sizeSel").addEventListener("change",newPuzzle);

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
  const g={rows:model.rows,cols:model.cols,theme:$("themeSel").value,size:$("sizeSel").value,
    words:model.words.map(w=>({answer:w.answer,clue:w.clue,r:w.r,c:w.c,dir:w.dir,num:w.num}))};
  const user={};for(const[k,c]of model.cells)if(c.user)user[k]=c.user;
  Store.set("cw_state",JSON.stringify({g,user}));
}
async function start(){
  const raw=await Store.get("cw_state");
  if(raw){try{
    const {g,user}=JSON.parse(raw);
    if(g&&g.words&&g.words.length){
      $("themeSel").value=g.theme||"all"; $("sizeSel").value=g.size||"medium";
      model=buildModel(g); celebrated=false; render();
      if(user)for(const k in user){const c=model.cells.get(k);if(c){c.user=user[k];const lt=c.el&&c.el.querySelector(".ltr");if(lt)lt.textContent=user[k];}}
      for(const w of model.words){if(w.keys.every(k=>{const c=model.cells.get(k);return c.user===c.sol;})){for(const k of w.keys){const c=model.cells.get(k);c.locked=true;if(c.el)c.el.classList.add("right");}}}
      selectFirst(); return;
    }
  }catch(e){}}
  newPuzzle();
}
start();
