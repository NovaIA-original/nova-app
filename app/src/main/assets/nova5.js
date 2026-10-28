(function(){
  const nr=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  function cmd(n,a){
    try{if(typeof B.cmd==="function"){B.cmd(n,a||"");return true;}}catch(e){}
    toast("Instala la última versión de la app para usar esto");
    return false;
  }
  const pad=n=>String(n).padStart(2,"0");

  // ---------- menú + ----------
  const plus=$("#plus");
  const menu2=document.createElement("div");
  menu2.style.cssText="position:fixed;left:12px;display:none;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:6px;z-index:30;min-width:250px;box-shadow:0 8px 24px rgba(0,0,0,.45)";
  document.body.appendChild(menu2);
  function item2(ico,txt,fn){
    const b=document.createElement("button");
    b.type="button";
    b.style.cssText="display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;padding:12px;border-radius:12px;text-align:left;font-size:16px;color:var(--text)";
    b.innerHTML="<span style='font-size:20px'></span><span></span>";
    b.children[0].textContent=ico;b.children[1].textContent=txt;
    b.onclick=()=>{menu2.style.display="none";fn();};
    menu2.appendChild(b);
  }
  function libre(f){return()=>{if(busy){toast("Espera un momento");return;}f();};}
  function armar2(){
    menu2.innerHTML="";
    item2("🖼️","Fotos",libre(()=>B.pickImage()));
    item2("📸","Cámara",libre(()=>cmd("camera")));
    item2("📄","Archivos (texto y Word)",libre(()=>B.pickFile()));
    item2("🎤","Hablar con Nova",()=>$("#mic").click());
    item2("🔊","Voz de Nova: "+(data.speak?"activada":"apagada"),()=>$("#chipVoz").click());
    item2("💾","Exportar chats",libre(()=>cmd("export",JSON.stringify({nova:1,chats:data.chats,mem:data.mem||[],instr:data.instr||"",estilo:data.estilo||"normal"}))));
    item2("📥","Importar chats",libre(()=>cmd("import")));
  }
  plus.onclick=e=>{
    e.stopPropagation();
    if(menu2.style.display==="block"){menu2.style.display="none";return;}
    armar2();
    const r=$("footer").getBoundingClientRect();
    menu2.style.bottom=(window.innerHeight-r.top+8)+"px";
    menu2.style.display="block";
  };
  document.addEventListener("click",e=>{if(!menu2.contains(e.target)&&e.target!==plus)menu2.style.display="none";});

  // ---------- importar / compartir ----------
  window.novaImport=function(txt){
    let o=null;try{o=JSON.parse(txt);}catch(e){}
    if(!o||!Array.isArray(o.chats)){toast("Ese archivo no es de Nova");return;}
    let n=0;const ids=new Set(data.chats.map(c=>c.id));
    o.chats.forEach(c=>{
      if(c&&c.id&&Array.isArray(c.msgs)&&!ids.has(c.id)){data.chats.push(c);ids.add(c.id);n++;}
    });
    if(Array.isArray(o.mem))o.mem.forEach(f=>{
      if(typeof f==="string"&&data.mem.indexOf(f)<0&&data.mem.length<20)data.mem.push(f);
    });
    if(o.instr&&!data.instr)data.instr=o.instr;
    if(o.estilo&&!data.estilo)data.estilo=o.estilo;
    save();renderList();ctxChat=null;
    toast(n?("Importé "+n+" chats"):"No había chats nuevos");
  };
  window.novaShared=function(t){
    box.value=String(t||"").slice(0,3000);crecer();
    toast("Texto recibido. Escribe qué quieres hacer con él");
  };
    // ---------- buscar y fijar chats ----------
  const sq=document.createElement("input");
  sq.type="text";sq.placeholder="Buscar en tus chats";
  sq.style.cssText="margin:0 12px 8px;padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--text);font:inherit;outline:none";
  $("#list").before(sq);
  sq.oninput=()=>renderList();
  window.renderList=function(){
    const L=$("#list");L.innerHTML="";
    const q=nr(sq.value);
    const arr=data.chats.filter(c=>!q||nr(c.title).indexOf(q)>=0||c.msgs.some(m=>nr(m.content).indexOf(q)>=0));
    arr.sort((a,b)=>(b.pin?1:0)-(a.pin?1:0));
    arr.forEach(c=>{
      const row=document.createElement("div");row.className="crow"+(c.id===data.current?" act":"");
      const t=document.createElement("button");t.className="ctitle";t.type="button";
      t.textContent=(c.pin?"📌 ":"")+c.title;t.onclick=()=>selectChat(c.id);
      const p=document.createElement("button");p.className="cdel";p.type="button";p.textContent=c.pin?"📍":"📌";
      p.onclick=e=>{e.stopPropagation();c.pin=!c.pin;save();renderList();};
      const x=document.createElement("button");x.className="cdel";x.type="button";x.textContent="✕";
      x.onclick=e=>{
        e.stopPropagation();
        if(x.dataset.arm){delChat(c.id);}
        else{
          x.dataset.arm="1";x.textContent="¿Borrar?";x.classList.add("arm");
          setTimeout(()=>{if(x.isConnected){delete x.dataset.arm;x.textContent="✕";x.classList.remove("arm");}},3000);
        }
      };
      row.append(t,p,x);L.appendChild(row);
    });
  };
  renderList();

  // ---------- cómo responde Nova ----------
  const h3=$("#cfg").querySelector("h3");
  const lb=document.createElement("label");lb.className="lbl";lb.textContent="Cómo responde Nova";
  const rw=document.createElement("div");rw.className="row2";
  function pintar(){
    const cur=data.estilo||"normal";
    rw.querySelectorAll("button").forEach(b=>{b.className="mbtn"+(b.dataset.k===cur?" pri":"");});
  }
  ["corta","normal","larga"].forEach(k=>{
    const b=document.createElement("button");b.type="button";b.className="mbtn";
    b.dataset.k=k;b.textContent=k.charAt(0).toUpperCase()+k.slice(1);
    b.onclick=()=>{data.estilo=k;save();pintar();ctxChat=null;};
    rw.appendChild(b);
  });
  h3.after(lb,rw);pintar();
  const _ex=window.extra;
  window.extra=function(){
    const e=data.estilo||"normal";
    const s={
      corta:"Responde con frases cortas.",
      normal:"Responde de forma clara y natural.",
      larga:"Responde de forma completa y detallada, con varios párrafos si hace falta."
    }[e]||"";
    return (s+" "+_ex()).trim();
  };
    // ---------- alarmas y temporizadores ----------
  function durTxt(sec){
    if(sec%3600===0)return (sec/3600)+(sec===3600?" hora":" horas");
    if(sec%60===0)return (sec/60)+(sec===60?" minuto":" minutos");
    return sec+" segundos";
  }
  function pedidoReloj(t){
    const s=nr(t);
    let m=s.match(/(?:temporizador|timer|cuenta regresiva)[^0-9]{0,20}(\d+)\s*(segundos?|seg|minutos?|min|horas?|hrs?|h)\b/)
       ||s.match(/(?:avisame|recuerdame|despiertame)\s+(?:en|dentro de)\s+(\d+)\s*(segundos?|seg|minutos?|min|horas?|hrs?|h)\b/);
    if(m){
      const n=parseInt(m[1],10),u=m[2];
      const sec=/^h/.test(u)?n*3600:/^m/.test(u)?n*60:n;
      if(sec>0&&sec<=86400){
        if(!cmd("timer",sec+"|Nova"))return "No pude crear el temporizador.";
        return "Listo, temporizador de "+durTxt(sec)+".";
      }
    }
    m=s.match(/(?:alarma|despiertame)[^0-9]{0,25}(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|de la manana|de la tarde|de la noche|de la madrugada)?/);
    if(m){
      let h=parseInt(m[1],10),mi=m[2]?parseInt(m[2],10):0;
      const suf=m[3]||"";
      if(!m[2]){if(/\by media\b/.test(s))mi=30;else if(/\by cuarto\b/.test(s))mi=15;}
      const pm=/pm|p\.m\.|tarde|noche/.test(suf),am=/^am|a\.m\.|manana|madrugada/.test(suf);
      if(pm&&h<12)h+=12;
      if(am&&h===12)h=0;
      if(/noche/.test(suf)&&h===12)h=0;
      if(h>23||mi>59)return null;
      if(!cmd("alarm",h+":"+mi+"|Nova"))return "No pude crear la alarma.";
      return "Listo, alarma a las "+pad(h)+":"+pad(mi)+"."+(suf?"":" Si era de la tarde, dime por ejemplo «a las 7 de la tarde».");
    }
    return null;
  }
  const _et=window.enviarTexto;
  window.enviarTexto=function(t){
    const r=pedidoReloj(t);
    if(r){respuestaLocal(t,r);return;}
    _et(t);
  };

  // ---------- descargas en fila ----------
  const colaD=[];
  function pedirDescarga(m){
    if(colaD.indexOf(m.id)>=0)return;
    if(models.some(x=>x.state==="downloading")){
      colaD.push(m.id);toast("En fila: empieza cuando termine la descarga actual");renderSheet();return;
    }
    m.state="downloading";m.pct=0;renderSheet();refreshHeader();B.download(m.id);
  }
  const _rs2=window.renderSheet;
  window.renderSheet=function(){
    _rs2();
    const rows=document.querySelectorAll("#mlist .mrow");
    models.forEach((m,i)=>{
      const r=rows[i];if(!r)return;
      if(colaD.indexOf(m.id)>=0){
        const act=r.querySelector(".mact");
        if(act){act.innerHTML="";const s1=document.createElement("small");s1.textContent="En fila…";act.appendChild(s1);}
        return;
      }
      r.querySelectorAll("button.mbtn.pri").forEach(b=>{
        if(b.textContent==="Descargar")b.onclick=()=>pedirDescarga(m);
      });
    });
  };
  const _nm=window.novaModels;
  window.novaModels=function(j){
    _nm(j);
    if(colaD.length&&!models.some(x=>x.state==="downloading")){
      const id=colaD.shift();
      const m=models.find(x=>x.id===id);
      if(m&&m.state==="none"){m.state="downloading";m.pct=0;B.download(id);}
      renderSheet();refreshHeader();
    }
  };

  try{if(typeof B.cmd==="function")B.cmd("ready","");}catch(e){}
})();
