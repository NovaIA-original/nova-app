function activate(excludeLast){
  const m=models.find(x=>x.id===data.model);
  if(!m||m.state!=="ready"){
    const r=models.find(x=>x.state==="ready");
    if(r){data.model=r.id;save();}
    else{ready=false;loadingText="sin modelo";refreshHeader();showSheet("Descarga un modelo para que Nova pueda pensar. Se hace una sola vez y después funciona sin internet.");return;}
  }
  ready=false;loadingText="cargando...";refreshHeader();
  const c=chat();
  const hist=c?c.msgs.filter(x=>x.content):[];
  B.startChat(data.model,JSON.stringify(excludeLast?hist.slice(0,-1):hist),extra());
}

function promptWeb(q,res){
  const f=new Date().toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"});
  let s="Hoy es "+f+". Resultados de búsqueda en internet:\n";
  res.forEach((r,i)=>{s+=(i+1)+". "+r.t+": "+r.s+"\n";});
  s+="\nUsando solo esos resultados, responde en español y de forma breve a esto: "+q;
  return s;
}

function respuestaLocal(t,r){
  const c=chat();
  const w=document.querySelector(".welcome");if(w)w.remove();
  quitarRegen();
  c.msgs.push({role:"user",content:t});
  const m={role:"assistant",content:r};c.msgs.push(m);
  if(c.title==="Nuevo chat")c.title=t.length>30?t.slice(0,30)+"…":t;
  c.ts=Date.now();data.chats=[c].concat(data.chats.filter(x=>x!==c));
  bubble("user",t);bubble("bot",r);addActs(m,true);
  renderList();save();
  if(data.speak&&B)B.speak(r,data.pitch||1);
}

function enviarTexto(t){
  const c=chat();
  const w=document.querySelector(".welcome");if(w)w.remove();
  quitarRegen();
  c.msgs.push({role:"user",content:t});
  if(c.title==="Nuevo chat")c.title=t.length>30?t.slice(0,30)+"…":t;
  c.ts=Date.now();
  data.chats=[c].concat(data.chats.filter(x=>x!==c));
  bubble("user",t);cur=bubble("bot","");cur.classList.add("typing");
  busy=true;lastSrc=[];refreshHeader();renderList();save();
  B.stopSpeak();
  const go=()=>{
    if(data.web){awaitingWeb=true;pendingQ=t;gen=false;cur.textContent="Buscando en internet";refreshHeader();B.search(t);}
    else{gen=true;B.send(t);}
  };
  if(ctxChat!==data.current||ctxModel!==data.model){afterReady=go;activate(true);}
  else go();
}
function enviar(){
  if(busy){parar();return;}
  const t=box.value.trim();
  if(!t||!ready)return;
  box.value="";crecer();
  if(ORV.test(t)){data.mem=[];memChanged();respuestaLocal(t,"Listo, olvidé todo lo que recordaba de ti.");return;}
  const m=t.match(MEMRE);
  if(m){
    if(addMem(m[1]))respuestaLocal(t,"Listo, lo recordaré: «"+m[1].trim().slice(0,160)+"»");
    return;
  }
  enviarTexto(t);
}
function parar(){
  if(!busy)return;
  B.stopSpeak();
  if(gen){ctxChat=null;B.stop();return;}
  awaitingWeb=false;afterReady=null;
  if(cur){cur.classList.remove("typing");cur.textContent="(detenido)";cur=null;}
  busy=false;ctxChat=null;refreshHeader();
}
function regenerar(){
  if(busy||!ready)return;
  const c=chat();if(!c)return;
  if(!c.msgs.length||c.msgs[c.msgs.length-1].role!=="assistant")return;
  c.msgs.pop();
  const u=c.msgs.pop();
  if(!u)return;
  renderChat();ctxChat=null;
  enviarTexto(u.content);
}
function crecer(){box.style.height="auto";box.style.height=Math.min(box.scrollHeight,120)+"px";}

window.novaStatus=m=>{loadingText=m;refreshHeader();};
window.novaReady=()=>{
  ready=true;ctxChat=data.current;ctxModel=data.model;loadingText="";
  if(afterReady){const f=afterReady;afterReady=null;f();}
  else busy=false;
  refreshHeader();
};
window.novaResults=j=>{
  if(!awaitingWeb)return;
  awaitingWeb=false;
  let r=[];try{r=JSON.parse(j);}catch(e){}
  lastSrc=r.map(x=>({t:x.t,u:x.u}));
  if(!r.length)toast("No pude buscar en internet, respondo con lo que sé");
  if(cur)cur.textContent="";
  gen=true;
  refreshHeader();
  B.send(r.length?promptWeb(pendingQ,r):pendingQ);
};
window.novaPartial=t=>{if(cur){cur.classList.remove("typing");cur.textContent=t;chatEl.scrollTop=chatEl.scrollHeight;}};
window.novaDone=t=>{
  const c=chat();
  gen=false;
  if(cur){
    cur.classList.remove("typing");
    const txt=(t||"").trim();
    if(txt){
      const msg={role:"assistant",content:txt};
      if(lastSrc.length)msg.src=lastSrc;
      if(c)c.msgs.push(msg);
      cur.textContent=txt;
      addSources(cur,lastSrc);
      quitarRegen();
      addActs(msg,true);
      if((data.speak||viaVoz)&&B)B.speak(txt,data.pitch||1);
    }else if(!cur.textContent){cur.textContent="…";}
    cur=null;
  }
  viaVoz=false;lastSrc=[];
  busy=false;save();refreshHeader();
};
window.novaError=m=>{
  toast(m);
  if(cur){cur.classList.remove("typing");cur.textContent="⚠️ "+m;cur=null;}
  busy=false;gen=false;awaitingWeb=false;afterReady=null;
  if(!ready)loadingText="error";
  refreshHeader();
};
window.novaNotice=m=>{toast(m);};
window.novaRebuild=()=>{if(!busy)activate(false);};
window.novaModels=j=>{try{models=JSON.parse(j);}catch(e){}renderSheet();refreshHeader();};
window.novaProgress=(id,p)=>{const m=models.find(x=>x.id===id);if(m){m.state="downloading";m.pct=p;}renderSheet();refreshHeader();};
window.novaDownloaded=id=>{
  if(!ready&&!busy){data.model=id;save();closeSheet();activate(false);}
  else toast("Modelo listo para usar");
  renderSheet();
};
window.novaNeedModel=()=>{
  try{models=JSON.parse(B.getModels());}catch(e){}
  showSheet("Descarga un modelo para que Nova pueda pensar. Se hace una sola vez y después funciona sin internet.");
};
window.novaHeard=t=>{viaVoz=true;box.value=t;crecer();enviar();};
window.novaHeardNone=()=>{toast("No te escuché, intenta de nuevo");};
window.novaBack=()=>{
  if(cfg.classList.contains("open")){closeCfg();return true;}
  if(sheet.classList.contains("open")){closeSheet();return true;}
  if(drawer.classList.contains("open")){closeDrawer();return true;}
  return false;
};

function renderChips(){$("#chipWeb").classList.toggle("on",!!data.web);$("#chipVoz").classList.toggle("on",!!data.speak);}
$("#chipWeb").onclick=()=>{data.web=!data.web;save();renderChips();toast(data.web?"Búsqueda en internet activada":"Nova responde sin internet");};
$("#chipVoz").onclick=()=>{data.speak=!data.speak;save();renderChips();if(!data.speak)B.stopSpeak();toast(data.speak?"Nova responderá en voz alta":"Voz desactivada");};
$("#mic").onclick=()=>{if(busy||!ready){toast("Espera un momento");return;}B.listen();};
$("#form").addEventListener("submit",e=>{e.preventDefault();enviar();});
box.addEventListener("input",crecer);
$("#menu").onclick=openDrawer;
$("#nuevo").onclick=newChat;
$("#newchat").onclick=newChat;
$("#modelbtn").onclick=()=>showSheet("");
$("#abrirCfg").onclick=()=>{closeDrawer();openCfg();};
scrim.onclick=()=>{closeSheet();closeDrawer();closeCfg();};
$("#pitch").oninput=()=>{$("#pv").textContent=parseFloat($("#pitch").value).toFixed(1);};
$("#probar").onclick=()=>{B.speak("Hola, soy Nova. ¿Te gusta mi voz?",parseFloat($("#pitch").value)||1);};
$("#guardar").onclick=()=>{
  data.instr=$("#instr").value.trim().slice(0,500);
  data.pitch=parseFloat($("#pitch").value)||1;
  save();ctxChat=null;closeCfg();toast("Guardado. Nova lo aplicará en tu próximo mensaje");
};
$("#addmem").onclick=()=>{if(addMem($("#meminp").value)){$("#meminp").value="";renderMem();}};
$("#clrmem").onclick=()=>{data.mem=[];memChanged();renderMem();};

function init(){
  if(!B){document.body.innerHTML='<p style="padding:24px">Abre esto desde la app Nova.</p>';return;}
  try{const raw=B.loadData();if(raw){const d=JSON.parse(raw);if(d&&d.chats)data=Object.assign(data,d);}}catch(e){}
  if(!Array.isArray(data.mem))data.mem=[];
  if(data.pitch==null)data.pitch=1;
  if(!data.chats.length)data.chats.push({id:uid(),title:"Nuevo chat",msgs:[],ts:Date.now()});
  if(!chat())data.current=data.chats[0].id;
  if(!data.model)data.model="nova";
  try{models=JSON.parse(B.getModels());}catch(e){models=[];}
  B.begin();
  renderChat();renderList();renderSheet();renderChips();refreshHeader();
  activate(false);
}
init();
