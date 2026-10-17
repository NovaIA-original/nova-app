let tStart=0,foto=null,visionBusy=false;
const VURL="http://127.0.0.1:8090";
function fmt(ms){const s=Math.round(ms/1000);return s<60?s+" s":Math.floor(s/60)+" min "+(s%60)+" s";}

function norm(s){return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}

function quitaNova(q){return q.replace(/\bnova\b[,:]?\s*/gi,"").trim();}

function limpiar(q){
  let s=q.replace(/[¿?¡!,.]/g," ");
  s=s.replace(/\bnova\b/gi," ");
  s=s.replace(/\b(dime|dímelo|dimelo|busca|búscame|buscame|investiga|en internet|por internet|por favor|cuéntame|cuentame|explícame|explicame|sabes)\b/gi," ");
  s=s.replace(/\b(quién|quien|qué|que|cuál|cual|cómo|como|cuándo|cuando|dónde|donde)\s+(es|son|fue|era|significa|pasó|paso)\b/gi," ");
  s=s.replace(/\s+/g," ").trim();
  return s.length>=3?s:quitaNova(q);
}

function relevantes(q,r){
  const ws=norm(q).split(/[^a-z0-9]+/).filter(w=>w.length>=4);
  if(!ws.length)return r;
  return r.filter(x=>{const t=norm(x.t+" "+x.s);return ws.some(w=>t.includes(w));});
}

window.novaResults=j=>{
  if(!awaitingWeb)return;
  awaitingWeb=false;
  let r=[];try{r=JSON.parse(j);}catch(e){}
  r=relevantes(limpiar(pendingQ),r);
  lastSrc=r.map(x=>({t:x.t,u:x.u}));
  if(!r.length)toast("No encontré nada relevante, respondo con lo que sé");
  if(cur)cur.textContent="Leyendo resultados";
  gen=true;
  refreshHeader();
  B.send(r.length?promptWeb(quitaNova(pendingQ),r):pendingQ);
};

const ZONAS=[
  [/argentina|buenos aires|córdoba|cordoba|rosario/i,"America/Argentina/Buenos_Aires","Argentina"],
  [/méxico|mexico|cdmx/i,"America/Mexico_City","México"],
  [/españa|espana|madrid|barcelona/i,"Europe/Madrid","España"],
  [/colombia|bogotá|bogota/i,"America/Bogota","Colombia"],
  [/chile|santiago/i,"America/Santiago","Chile"],
  [/perú|peru|lima/i,"America/Lima","Perú"],
  [/uruguay|montevideo/i,"America/Montevideo","Uruguay"],
  [/venezuela|caracas/i,"America/Caracas","Venezuela"],
  [/nueva york|new york|estados unidos/i,"America/New_York","Nueva York"],
  [/los ángeles|los angeles|california/i,"America/Los_Angeles","Los Ángeles"],
  [/japón|japon|tokio/i,"Asia/Tokyo","Japón"],
  [/londres|reino unido|inglaterra/i,"Europe/London","Londres"]
];
const HORARE=/qu[eé]\s+hora|hora\s+es\b/i;
const FECHARE=/qu[eé]\s+(d[ií]a|fecha)|fecha\s+de\s+hoy|a\s+cu[aá]ntos\s+estamos/i;

function horaLocal(t){
  let tz=null,lugar="";
  for(const z of ZONAS){if(z[0].test(t)){tz=z[1];lugar=" en "+z[2];break;}}
  const d=new Date();
  const o=tz?{timeZone:tz}:{};
  if(HORARE.test(t)){
    const h=d.toLocaleTimeString("es-ES",Object.assign({hour:"2-digit",minute:"2-digit"},o));
    return "Son las "+h+lugar+".";
  }
  if(FECHARE.test(t)){
    const f=d.toLocaleDateString("es-ES",Object.assign({weekday:"long",day:"numeric",month:"long",year:"numeric"},o));
    return "Hoy es "+f+lugar+".";
  }
  return null;
}

const _enviar=window.enviar;
window.enviar=function(){
  if(!busy){
    const t=box.value.trim();
    if(foto){enviarFoto(t||"Describe this image in detail.");return;}
    if(t&&ready){
      const r=horaLocal(t);
      if(r){box.value="";crecer();respuestaLocal(t,r);return;}
    }
  }
  _enviar();
};

const NOBUSCAR=/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|gracias|ok|vale|chau|adios|como estas|que haces|quien eres|como te llamas)\b/;
const PERSONAL=/\b(te gusta|tu nombre|tus |eres|opinas|piensas|sientes|crees|puedes|sabes hacer|me llamo|mi nombre|recuerdas)\b/;
const CREAR=/\b(escribe|redacta|inventa|chiste|traduce|resume|corrige|programa|codigo|poema|cancion|historia|cuento|dibuja|imagina|actua como|finge)\b/;
const MATE=/\d+\s*[+\-*\/x×÷]\s*\d+|cuanto es \d/;
const ACTUAL=/\b(hoy|ayer|ahora|actual|actualmente|ultim[oa]s?|noticias?|precio|cotizacion|dolar|euro|clima|pronostico|temperatura|resultado|partido|ganador|gano|estreno|estrenos|presidente|campeon|2024|2025|2026)\b/;
const SININTERNET=/\b(sin internet|no busques|no busques en internet|sin buscar)\b/;
const EXPLICITO=/\b(busca|buscame|investiga|en internet|por internet)\b/;
const PREGUNTA=/^(quien|que|cual|cuales|cuando|donde|cuanto|cuantos|cuantas)\b/;

function debeBuscar(t){
  const s=norm(quitaNova(t)).replace(/[¿?¡!,.]/g," ").replace(/\s+/g," ").trim();
  if(s.length<8)return false;
  if(SININTERNET.test(s))return false;
  if(NOBUSCAR.test(s)||PERSONAL.test(s)||CREAR.test(s)||MATE.test(s))return false;
  if(EXPLICITO.test(s))return true;
  if(ACTUAL.test(s))return true;
  if(PREGUNTA.test(s)&&s.split(" ").length>=3)return true;
  return false;
}

function modoWeb(){return data.webOff?"nunca":"auto";}

function enviarTexto(t){
  const c=chat();
  const w=document.querySelector(".welcome");if(w)w.remove();
  quitarRegen();
  c.msgs.push({role:"user",content:t});
  if(c.title==="Nuevo chat")c.title=t.length>30?t.slice(0,30)+"…":t;
  c.ts=Date.now();
  data.chats=[c].concat(data.chats.filter(x=>x!==c));
  bubble("user",t);cur=bubble("bot","");cur.classList.add("typing");
  busy=true;lastSrc=[];tStart=Date.now();refreshHeader();renderList();save();
  B.stopSpeak();
  const usar=modoWeb()==="auto"&&debeBuscar(t);
  const go=()=>{
    if(usar){awaitingWeb=true;pendingQ=t;gen=false;cur.textContent="Buscando en internet";refreshHeader();B.search(limpiar(t));}
    else{gen=true;B.send(t);}
  };
  if(ctxChat!==data.current||ctxModel!==data.model){afterReady=go;activate(true);}
  else go();
}

function renderChips(){
  $("#chipVoz").classList.toggle("on",!!data.speak);
}
$("#chipWeb").style.display="none";

(function(){
  const note=document.querySelector("#cfg .note");
  if(!note)return;
  const lab=document.createElement("label");
  lab.className="lbl";
  lab.style.cssText="display:flex;align-items:center;gap:10px";
  const cb=document.createElement("input");
  cb.type="checkbox";cb.id="webAuto";
  lab.appendChild(cb);
  lab.appendChild(document.createTextNode("Nova puede buscar en internet cuando lo necesite"));
  note.parentNode.insertBefore(lab,note);
  cb.onchange=()=>{data.webOff=!cb.checked;save();};
  note.textContent="Puedes decirle en el chat: «recuerda que me llamo ...». La memoria se guarda solo en tu celular. Cuando Nova busca en internet, tu pregunta se envía a Wikipedia y DuckDuckGo; si apagas la opción de arriba, nada sale de tu celular.";
})();

const _fill=window.fillCfg;
window.fillCfg=function(){_fill();$("#webAuto").checked=!data.webOff;};
renderChips();

const _done=window.novaDone;
window.novaDone=function(t){
  const el=cur,ms=tStart?Date.now()-tStart:0;
  _done(t);
  if(el&&t&&t.trim()&&ms){
    const m=document.createElement("div");
    m.style.cssText="font-size:11px;color:var(--muted);margin-top:6px";
    m.textContent="⏱ "+fmt(ms);
    el.appendChild(m);
  }
  tStart=0;
};

setInterval(()=>{
  if(visionBusy||!busy||!ready||!tStart)return;
  const s=Math.floor((Date.now()-tStart)/1000);
  const habla=cur&&cur.textContent&&!cur.classList.contains("typing");
  estado.textContent=(awaitingWeb?"buscando en internet":(habla?"escribiendo":"pensando"))+"… "+s+" s";
},500);

const prev=document.createElement("div");
prev.style.cssText="display:none;align-items:center;gap:8px;padding:8px 12px 0";
const pimg=document.createElement("img");
pimg.style.cssText="height:56px;border-radius:10px";
const px=document.createElement("button");
px.type="button";px.textContent="✕";
px.style.cssText="border:0;background:none;color:var(--muted);font-size:18px;padding:6px";
px.onclick=()=>{foto=null;mostrarPrev();};
prev.append(pimg,px);
$("#chips").before(prev);
function mostrarPrev(){prev.style.display=foto?"flex":"none";if(foto)pimg.src=foto;}

const cam=document.createElement("button");
cam.className="ib";cam.id="cam";cam.type="button";cam.textContent="📷";
cam.onclick=()=>{if(busy){toast("Espera un momento");return;}B.pickImage();};
$("#mic").before(cam);

window.novaImage=uri=>{foto=uri;mostrarPrev();toast("Foto lista. Escribe qué quieres saber, o toca ➤");};

async function enviarFoto(texto){
  const img=foto;foto=null;mostrarPrev();
  box.value="";crecer();
  const c=chat();
  const w=document.querySelector(".welcome");if(w)w.remove();
  quitarRegen();
  c.msgs.push({role:"user",content:"📷 "+texto});
  if(c.title==="Nuevo chat")c.title="Foto: "+texto.slice(0,24);
  c.ts=Date.now();
  data.chats=[c].concat(data.chats.filter(x=>x!==c));
  const ub=bubble("user","");
  const im2=document.createElement("img");
  im2.src=img;
  im2.style.cssText="max-width:100%;height:120px;border-radius:12px;display:block;margin-bottom:6px";
  ub.appendChild(im2);
  ub.appendChild(document.createTextNode(texto));
  cur=bubble("bot","");
  const lab=document.createElement("div");
  lab.textContent="Analizando la foto…";
  const bar=document.createElement("div");
  bar.style.cssText="height:6px;border-radius:3px;background:#2a3040;margin:8px 0;overflow:hidden;min-width:200px";
  const fill=document.createElement("div");
  fill.style.cssText="height:100%;width:0;background:var(--user);transition:width .4s";
  bar.appendChild(fill);
  const info=document.createElement("small");
  info.style.color="var(--muted)";
  cur.append(lab,bar,info);
  busy=true;visionBusy=true;refreshHeader();renderList();save();
  const bub=cur;
  const t0=Date.now();
  const est=data.visionMs||60000;
  const tm=setInterval(()=>{
    const e=Date.now()-t0;
    fill.style.width=Math.min(95,Math.round(e/est*100))+"%";
    const rest=Math.max(0,Math.round((est-e)/1000));
    info.textContent="Van "+fmt(e)+" · faltan unos "+(rest>0?rest+" s":"segundos")+" (estimado)";
    estado.textContent="analizando foto… "+Math.floor(e/1000)+" s";
  },500);
  let out="",primero=0,fallo="";
  try{
    const body=JSON.stringify({stream:true,max_tokens:220,temperature:0.2,messages:[{role:"user",content:[{type:"image_url",image_url:{url:img}},{type:"text",text:texto}]}]});
    const r=await fetch(VURL+"/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json"},body:body});
    if(!r.ok)throw new Error("HTTP "+r.status);
    const rd=r.body.getReader(),dec=new TextDecoder();
    let buf="";
    while(true){
      const x=await rd.read();
      if(x.done)break;
      buf+=dec.decode(x.value,{stream:true});
      const ls=buf.split("\n");
      buf=ls.pop();
      for(const l of ls){
        if(!l.startsWith("data:"))continue;
        const d=l.slice(5).trim();
        if(d==="[DONE]")continue;
        try{
          const ch=JSON.parse(d).choices[0].delta.content;
          if(ch){
            if(!primero){primero=Date.now()-t0;data.visionMs=Math.round(est*0.6+primero*0.4);}
            out+=ch;
            bub.textContent=out;
            chatEl.scrollTop=chatEl.scrollHeight;
          }
        }catch(e){}
      }
    }
  }catch(e){fallo=String(e&&e.message?e.message:e);}
  clearInterval(tm);
  visionBusy=false;busy=false;cur=null;
  if(!out.trim()){
    bub.textContent="No pude usar el servidor de visión ("+(fallo||"sin respuesta")+"). En Termux enciéndelo con: ./vision.sh";
    toast("Servidor de visión apagado");
  }else{
    const msg={role:"assistant",content:"[Foto] "+out.trim()};
    c.msgs.push(msg);
    const m=document.createElement("div");
    m.style.cssText="font-size:11px;color:var(--muted);margin-top:6px";
    m.textContent="⏱ "+fmt(Date.now()-t0)+" · modelo de visión (en inglés)";
    bub.appendChild(m);
    addActs(msg,true);
    const tr=document.createElement("button");
    tr.type="button";tr.textContent="🇪🇸";
    tr.onclick=()=>{
      if(busy||!ready){toast("Espera a que Nova esté lista");return;}
      box.value="Traduce al español: "+out.trim();
      enviar();
    };
    chatEl.lastElementChild.appendChild(tr);
    ctxChat=null;
  }
  save();refreshHeader();
}
