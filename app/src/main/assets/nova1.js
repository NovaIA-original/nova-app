const B=window.NovaBridge;
const $=s=>document.querySelector(s);
const chatEl=$("#chat"),box=$("#box"),sendBtn=$("#send"),estado=$("#estado"),mname=$("#mname"),scrim=$("#scrim"),drawer=$("#drawer"),sheet=$("#sheet"),cfg=$("#cfg");
let data={chats:[],current:null,model:"nova",web:false,speak:false,instr:"",pitch:1,mem:[]};
let models=[],ready=false,busy=false,gen=false,awaitingWeb=false,pendingQ="",lastSrc=[],viaVoz=false;
let cur=null,ctxChat=null,ctxModel=null,afterReady=null,loadingText="preparando...",saveT=null,toastT=null,fotoOk=false;
const FOTO="file:///android_res/drawable/nova_logo.png";
const SUG=["Cuéntame un chiste","Explícame algo curioso","Ayúdame a escribir un mensaje"];
const MEMRE=/^\s*(?:recuerda|acuérdate|acuerdate|memoriza|anota)\s*(?:que|esto:?)?\s+(.+)$/i;
const ORV=/^\s*(olvida todo|borra tu memoria|olvida lo que te dije)/i;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const chat=()=>data.chats.find(c=>c.id===data.current);

function aplicarFoto(){
  if(!fotoOk)return;
  document.querySelectorAll(".avatar").forEach(a=>{a.style.background="url("+FOTO+") center/cover";a.style.color="transparent";});
}
const im=new Image();
im.onload=()=>{fotoOk=true;aplicarFoto();};
im.src=FOTO;

function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),3200);}
function save(){clearTimeout(saveT);saveT=setTimeout(()=>{if(B)B.saveData(JSON.stringify(data));},300);}
function setStatus(t,on){estado.textContent=t;estado.className=on?"on":"";}
function modelName(){const m=models.find(x=>x.id===data.model);return m?m.name:"Nova";}
function refreshHeader(){
  mname.textContent=modelName();
  const dl=models.find(m=>m.state==="downloading");
  if(awaitingWeb)setStatus("buscando en internet...",true);
  else if(ready&&busy)setStatus("escribiendo...",true);
  else if(ready)setStatus("en línea",true);
  else if(dl)setStatus("descargando "+(dl.pct||0)+"%",false);
  else setStatus(loadingText,false);
  sendBtn.textContent=busy?"■":"➤";
  sendBtn.disabled=!busy&&!ready;
}
function extra(){
  let s=(data.instr||"").trim();
  if(data.mem&&data.mem.length)s+=" Lo que recuerdas de la persona: "+data.mem.join("; ")+".";
  s+=" Hoy es "+new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"})+".";
  return s.trim();
}

function bubble(rol,t){const d=document.createElement("div");d.className="msg "+rol;d.textContent=t;chatEl.appendChild(d);chatEl.scrollTop=chatEl.scrollHeight;return d;}
function addSources(div,src){
  if(!src||!src.length)return;
  const s=document.createElement("div");s.className="srcs";
  src.forEach(r=>{const a=document.createElement("a");a.href=r.u;a.textContent="🔗 "+r.t;s.appendChild(a);});
  div.appendChild(s);
}
function addActs(msg,isLast){
  const a=document.createElement("div");a.className="acts";
  const cp=document.createElement("button");cp.type="button";cp.textContent="📋";
  cp.onclick=()=>{B.copy(msg.content);toast("Copiado");};
  a.appendChild(cp);
  if(isLast){const rg=document.createElement("button");rg.type="button";rg.className="regen";rg.textContent="↻";rg.onclick=regenerar;a.appendChild(rg);}
  chatEl.appendChild(a);chatEl.scrollTop=chatEl.scrollHeight;
}
function quitarRegen(){document.querySelectorAll(".regen").forEach(e=>e.remove());}
function renderChat(){
  chatEl.innerHTML="";
  const c=chat();
  if(!c||!c.msgs.length){
    const w=document.createElement("div");w.className="welcome";
    w.innerHTML='<div class="avatar">N</div><h2>Hola, soy Nova</h2><p>¿En qué te ayudo?</p>';
    const sg=document.createElement("div");sg.className="sugs";
    SUG.forEach(s=>{const b=document.createElement("button");b.type="button";b.textContent=s;b.onclick=()=>{if(ready&&!busy){box.value=s;enviar();}};sg.appendChild(b);});
    w.appendChild(sg);chatEl.appendChild(w);
  }else{
    const last=c.msgs.length-1;
    c.msgs.forEach((m,i)=>{
      if(m.role==="user")bubble("user",m.content);
      else{const d=bubble("bot",m.content);addSources(d,m.src);addActs(m,i===last);}
    });
  }
  chatEl.scrollTop=chatEl.scrollHeight;
  aplicarFoto();
}

function anyOpen(){return sheet.classList.contains("open")||cfg.classList.contains("open")||drawer.classList.contains("open");}
function syncScrim(){scrim.classList.toggle("open",anyOpen());}
function openDrawer(){drawer.classList.add("open");syncScrim();}
function closeDrawer(){drawer.classList.remove("open");syncScrim();}
function showSheet(msg){
  $("#sheetmsg").textContent=msg||"Elige qué cerebro usa Nova. Los que ya descargaste funcionan sin internet.";
  renderSheet();sheet.classList.add("open");syncScrim();
}
function closeSheet(){sheet.classList.remove("open");syncScrim();}
function openCfg(){fillCfg();cfg.classList.add("open");syncScrim();}
function closeCfg(){cfg.classList.remove("open");syncScrim();}

function renderList(){
  const L=$("#list");L.innerHTML="";
  data.chats.forEach(c=>{
    const row=document.createElement("div");row.className="crow"+(c.id===data.current?" act":"");
    const t=document.createElement("button");t.className="ctitle";t.type="button";t.textContent=c.title;t.onclick=()=>selectChat(c.id);
    const x=document.createElement("button");x.className="cdel";x.type="button";x.textContent="✕";
    x.onclick=e=>{
      e.stopPropagation();
      if(x.dataset.arm){delChat(c.id);}
      else{
        x.dataset.arm="1";x.textContent="¿Borrar?";x.classList.add("arm");
        setTimeout(()=>{if(x.isConnected){delete x.dataset.arm;x.textContent="✕";x.classList.remove("arm");}},3000);
      }
    };
    row.append(t,x);L.appendChild(row);
  });
}
function selectChat(id){
  if(busy){toast("Espera a que Nova termine de responder");return;}
  data.current=id;save();renderChat();renderList();closeDrawer();
}
function newChat(){
  if(busy){toast("Espera a que Nova termine de responder");return;}
  const c0=chat();
  if(c0&&!c0.msgs.length){closeDrawer();return;}
  const c={id:uid(),title:"Nuevo chat",msgs:[],ts:Date.now()};
  data.chats.unshift(c);data.current=c.id;save();renderChat();renderList();closeDrawer();
}
function delChat(id){
  if(busy){toast("Espera a que Nova termine de responder");return;}
  data.chats=data.chats.filter(c=>c.id!==id);
  if(!data.chats.length)data.chats.push({id:uid(),title:"Nuevo chat",msgs:[],ts:Date.now()});
  if(!chat())data.current=data.chats[0].id;
  save();renderChat();renderList();
}

function renderSheet(){
  const L=$("#mlist");L.innerHTML="";
  models.forEach(m=>{
    const row=document.createElement("div");row.className="mrow"+(m.id===data.model&&m.state==="ready"?" sel":"");
    const info=document.createElement("div");info.className="minfo";
    const b1=document.createElement("b");b1.textContent=m.name;
    const s1=document.createElement("small");
    s1.textContent=m.desc+" · "+(m.size>=1000?(m.size/1000).toFixed(1)+" GB":m.size+" MB");
    info.append(b1,s1);row.appendChild(info);
    const act=document.createElement("div");act.className="mact";
    if(m.state==="ready"){
      const b=document.createElement("button");b.type="button";b.className="mbtn";
      if(m.id===data.model){b.textContent="✓ En uso";b.disabled=true;}
      else{b.textContent="Usar";b.onclick=()=>selectModel(m.id);}
      act.appendChild(b);
    }else if(m.state==="downloading"){
      const p=document.createElement("div");p.className="prog";
      const f=document.createElement("div");f.className="pfill";f.style.width=(m.pct||0)+"%";p.appendChild(f);
      const t=document.createElement("small");t.textContent="Descargando "+(m.pct||0)+"%";
      act.append(p,t);
    }else{
      const b=document.createElement("button");b.type="button";b.className="mbtn pri";b.textContent="Descargar";
      b.onclick=()=>{m.state="downloading";m.pct=0;renderSheet();refreshHeader();B.download(m.id);};
      const a=document.createElement("button");a.type="button";a.className="mlink";a.textContent="Ya tengo el archivo";a.onclick=()=>B.pick(m.id);
      act.append(b,a);
    }
    row.appendChild(act);L.appendChild(row);
  });
}
function selectModel(id){
  if(busy){toast("Espera a que Nova termine de responder");return;}
  data.model=id;save();closeSheet();activate(false);
}

function renderMem(){
  const L=$("#memlist");L.innerHTML="";
  if(!data.mem.length){
    const p=document.createElement("p");p.className="note";
    p.textContent="Nova aún no recuerda nada tuyo.";L.appendChild(p);return;
  }
  data.mem.forEach((f,i)=>{
    const r=document.createElement("div");r.className="mem";
    const t=document.createElement("span");t.textContent=f;
    const x=document.createElement("button");x.type="button";x.textContent="✕";
    x.onclick=()=>{data.mem.splice(i,1);memChanged();renderMem();};
    r.append(t,x);L.appendChild(r);
  });
}
function memChanged(){save();ctxChat=null;}
function addMem(f){
  f=(f||"").trim().slice(0,160);
  if(!f)return false;
  if(data.mem.length>=20){toast("La memoria está llena (20 cosas). Borra alguna.");return false;}
  data.mem.push(f);memChanged();return true;
}
function fillCfg(){
  $("#instr").value=data.instr||"";
  $("#pitch").value=data.pitch||1;
  $("#pv").textContent=(parseFloat(data.pitch)||1).toFixed(1);
  renderMem();
  }
