(function(){
  const old=$("#cam");if(old)old.remove();
  const ch=$("#chips");if(ch)ch.style.display="none";

  function fmt4(ms){const s=Math.round(ms/1000);return s<60?s+" s":Math.floor(s/60)+" min "+(s%60)+" s";}

  const plus=document.createElement("button");
  plus.type="button";plus.id="plus";plus.className="ib";plus.textContent="+";
  plus.style.cssText="font-size:28px;background:var(--bot);color:var(--text)";
  box.before(plus);

  const menu=document.createElement("div");
  menu.style.cssText="position:fixed;left:12px;display:none;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:6px;z-index:30;min-width:240px;box-shadow:0 8px 24px rgba(0,0,0,.45)";
  document.body.appendChild(menu);

  function item(ico,txt,fn,pronto){
    const b=document.createElement("button");
    b.type="button";
    b.style.cssText="display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;padding:12px;border-radius:12px;text-align:left;font-size:16px;color:"+(pronto?"var(--muted)":"var(--text)");
    b.innerHTML="<span style='font-size:20px'></span><span></span>";
    b.children[0].textContent=ico;
    b.children[1].textContent=txt+(pronto?"  · pronto":"");
    b.onclick=()=>{menu.style.display="none";fn();};
    menu.appendChild(b);
  }
  function armar(){
    menu.innerHTML="";
    item("📷","Fotos",()=>{if(busy){toast("Espera un momento");return;}B.pickImage();},false);
    item("📄","Archivos",()=>{if(busy){toast("Espera un momento");return;}B.pickFile();},false);
    item("🎞️","Video",()=>toast("El video llega después de las fotos"),true);
    item("🎤","Hablar con Nova",()=>$("#mic").click(),false);
    item("🔊","Voz de Nova: "+(data.speak?"activada":"apagada"),()=>$("#chipVoz").click(),false);
  }
  plus.onclick=e=>{
    e.stopPropagation();
    if(menu.style.display==="block"){menu.style.display="none";return;}
    armar();
    const r=$("footer").getBoundingClientRect();
    menu.style.bottom=(window.innerHeight-r.top+8)+"px";
    menu.style.display="block";
  };
  document.addEventListener("click",e=>{if(!menu.contains(e.target)&&e.target!==plus)menu.style.display="none";});

  let trk=false,t0=0,tFirst=0,tokN=0;
  const _p=window.novaPartial;
  window.novaPartial=function(t){
    if(!tokN){
      tFirst=Date.now();
      data.waitMs=Math.round((data.waitMs||8000)*0.6+(tFirst-t0)*0.4);
      save();
    }
    tokN++;
    _p(t);
  };
  const _d=window.novaDone;
  window.novaDone=function(t){
    const el=cur,n=tokN,ms=Date.now()-t0;
    const sp=tFirst?n/Math.max(0.5,(Date.now()-tFirst)/1000):0;
    _d(t);
    if(el&&t&&t.trim()&&n){
      const m=document.createElement("div");
      m.style.cssText="font-size:11px;color:var(--muted);margin-top:6px";
      m.textContent="⏱ "+fmt4(ms)+" · "+n+" tokens · "+sp.toFixed(1)+" tok/s";
      el.appendChild(m);
    }
  };
  setInterval(()=>{
    if(busy&&ready&&!trk){trk=true;t0=Date.now();tokN=0;tFirst=0;}
    if(!busy&&trk)trk=false;
        if(!trk||(typeof visionBusy!=="undefined"&&visionBusy))return;
    const e=Date.now()-t0;
    if(!tFirst){
      const est=data.waitMs||8000;
      const pct=Math.min(95,Math.round(e/est*100));
      estado.textContent=(awaitingWeb?"buscando":"pensando")+"… "+pct+"% (estimado) · "+fmt4(e);
    }else{
      const dt=(Date.now()-tFirst)/1000;
      const sp=dt>0.5?(tokN/dt).toFixed(1):"…";
      estado.textContent="escribiendo… "+tokN+" tokens · "+sp+" tok/s · "+fmt4(e);
    }
  },300);
  // ---------- visión local ----------
  const _rs=window.renderSheet;
  window.renderSheet=function(){
    _rs();
    document.querySelectorAll("#mlist .mrow").forEach(r=>{
      const n=r.querySelector("b");
      if(n&&n.textContent.indexOf("Nova Vista")===0){
        r.querySelectorAll("button.mbtn").forEach(b=>{if(b.textContent==="Usar"){b.textContent="Listo";b.disabled=true;}});
      }
    });
  };
  const _nd=window.novaDownloaded;
  window.novaDownloaded=function(id){
    if(String(id).indexOf("vista")===0){toast("Descarga lista. Para fotos necesitas las 2 partes de Nova Vista");renderSheet();return;}
    _nd(id);
  };

  let V=null;
  function visionListo(){
    const a=models.find(m=>m.id==="vista"),b=models.find(m=>m.id==="vista_mm");
    return !!(a&&b&&a.state==="ready"&&b.state==="ready");
  }
  function cerrarVision(){
    if(V){clearInterval(V.tm);V=null;}
    visionBusy=false;busy=false;cur=null;
    refreshHeader();save();
  }
  window.enviarFoto=function(texto){
    if(!visionListo()){showSheet("Para que Nova vea fotos descarga las 2 partes de Nova Vista (unos 640 MB en total). Se hace una sola vez.");return;}
    const img=foto;foto=null;mostrarPrev();
    box.value="";crecer();
    const c=chat();
    const w=document.querySelector(".welcome");if(w)w.remove();
    quitarRegen();
    const prompt="Eres Nova. Mira la foto y responde en español solo lo que te preguntan, sin describir todo lo demás. Pregunta: "+texto;
    const um={role:"user",content:"📷 "+texto};
    c.msgs.push(um);
    if(c.title==="Nuevo chat")c.title="Foto: "+texto.slice(0,24);
    c.ts=Date.now();
    data.chats=[c].concat(data.chats.filter(x=>x!==c));
    const ub=bubble("user","");
    const im2=document.createElement("img");
    im2.src=img;
    im2.style.cssText="max-width:100%;height:120px;border-radius:12px;display:block;margin-bottom:6px";
    ub.appendChild(im2);
    ub.appendChild(document.createTextNode(texto));
    const bub=bubble("bot","");
    cur=bub;
    const lab=document.createElement("div");lab.textContent="Preparando…";
    const bar=document.createElement("div");
    bar.style.cssText="height:6px;border-radius:3px;background:#2a3040;margin:8px 0;overflow:hidden;min-width:200px";
    const fill=document.createElement("div");
    fill.style.cssText="height:100%;width:0;background:var(--user);transition:width .4s";
    bar.appendChild(fill);
    const info=document.createElement("small");info.style.color="var(--muted)";
        const txt=document.createElement("div");
    bub.append(lab,bar,info,txt);
    busy=true;visionBusy=true;refreshHeader();renderList();save();
    const t0=Date.now(),est=data.visionMs||60000;
    V={c,bub,lab,fill,info,txt,t0,est,first:0,tokens:0,stage:0};
    V.tm=setInterval(()=>{
      if(!V)return;
      const e=Date.now()-V.t0;
      let p=V.stage;
      if(V.stage<90)p=Math.max(V.stage,Math.min(88,Math.round(e/V.est*100)));
      V.fill.style.width=p+"%";
      estado.textContent="mirando foto… "+p+"% · "+fmt4(e);
    },400);
    B.describe(img,prompt);
  };
  window.novaVisionStage=function(st,tk,partial){
    if(!V)return;
    V.stage=st;V.tokens=tk;
    const e=Date.now()-V.t0;
    if(st<10)V.lab.textContent="Liberando memoria…";
    else if(st<30)V.lab.textContent="Cargando el modelo de visión…";
    else if(st<90)V.lab.textContent="Mirando la foto…";
    else V.lab.textContent="Escribiendo…";
    if(tk>0){
      if(!V.first){V.first=Date.now();data.visionMs=Math.round(V.est*0.5+e*0.5);}
      V.txt.textContent=partial;
      V.info.textContent=tk+" tokens · "+fmt4(e);
      chatEl.scrollTop=chatEl.scrollHeight;
    }else V.info.textContent="Van "+fmt4(e);
  };
  window.novaVisionDone=function(text){
    if(!V)return;
    const v=V,out=String(text||"").trim(),ms=Date.now()-v.t0,tk=v.tokens;
    if(!out){
      v.bub.textContent="No pude ver bien la foto. Intenta con otra.";
      cerrarVision();ctxChat=null;return;
    }
    v.bub.textContent=out;
    const msg={role:"assistant",content:out};
    v.c.msgs.push(msg);
    const m=document.createElement("div");
    m.style.cssText="font-size:11px;color:var(--muted);margin-top:6px";
    m.textContent="⏱ "+fmt4(ms)+" · "+tk+" tokens";
    v.bub.appendChild(m);
    addActs(msg,true);
    if(data.speak&&B)B.speak(out,data.pitch||1);
    cerrarVision();
    ctxChat=null;
  };
  const _act=window.activate;
  window.activate=function(ex){
    const c=chat(),sw=[];
    if(c)c.msgs.forEach(x=>{if(x.ctx){sw.push([x,x.content]);x.content=x.content+x.ctx;}});
    try{_act(ex);}finally{sw.forEach(p=>{p[0].content=p[1];});}
  };
  window.novaVisionError=function(msg){
    if(V)V.bub.textContent="No pude mirar la foto: "+msg;
    cerrarVision();
    ctxChat=null;
  };
  window.novaVisionMissing=function(){
    if(V)V.bub.textContent="Falta descargar Nova Vista.";
    cerrarVision();
    showSheet("Para que Nova vea fotos descarga las 2 partes de Nova Vista (unos 640 MB en total).");
  };
  let adj=null,chip=null;
  function mostrarAdj(){
    if(chip){chip.remove();chip=null;}
    if(!adj)return;
    chip=document.createElement("div");
    chip.style.cssText="margin:0 12px 6px;padding:8px 12px;border-radius:12px;background:var(--bot);color:var(--text);font-size:13px;display:flex;justify-content:space-between;gap:8px";
    const s1=document.createElement("span");s1.textContent="📎 "+adj.name+" · escribe tu pregunta y envía";
        const x=document.createElement("span");x.textContent="✕";x.style.cursor="pointer";
    x.onclick=()=>{adj=null;mostrarAdj();};
    chip.append(s1,x);
    $("footer").before(chip);
  }
  window.novaFile=function(j){
    let o=null;try{o=JSON.parse(j);}catch(e){}
    if(!o||!o.text)return;
    adj=o;mostrarAdj();toast("Archivo listo");
  };
  function enviarArchivo(q){
    const a=adj;adj=null;mostrarAdj();
    const c=chat();
    const w=document.querySelector(".welcome");if(w)w.remove();
    quitarRegen();
    const shown="📎 "+a.name+" — "+q;
    const um={role:"user",content:shown,ctx:"\n[Contenido del archivo «"+a.name+"»]\n"+a.text};
    c.msgs.push(um);
    if(c.title==="Nuevo chat")c.title=a.name.slice(0,30);
    c.ts=Date.now();
    data.chats=[c].concat(data.chats.filter(x=>x!==c));
    bubble("user",shown);cur=bubble("bot","");cur.classList.add("typing");
    busy=true;lastSrc=[];refreshHeader();renderList();save();
    B.stopSpeak();
    const p="Este es el contenido del archivo «"+a.name+"»:\n"+a.text+"\n\nResponde en español, de forma breve, a esto: "+q;
    const go=()=>{gen=true;B.send(p);};
    if(ctxChat!==data.current||ctxModel!==data.model){afterReady=go;activate(true);}
    else go();
  }
  const _e2=window.enviar;
  window.enviar=function(){
    if(visionBusy){B.cancelVision();toast("Cancelando…");return;}
    if(adj&&!busy&&ready){
      const q=box.value.trim()||"Resume este archivo";
      box.value="";crecer();
      enviarArchivo(q);
      return;
    }
    _e2();
  };
  (function(){var s=document.createElement("script");s.src="nova5.js";document.body.appendChild(s);})();
})();
