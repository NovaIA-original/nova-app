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
    if(t&&ready){
      const r=horaLocal(t);
      if(r){box.value="";crecer();respuestaLocal(t,r);return;}
    }
  }
  _enviar();
};
