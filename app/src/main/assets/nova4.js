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
    item("📷","Fotos",()=>toast("Las fotos llegan cuando Nova tenga su motor de visión"),true);
    item("📄","Archivos",()=>toast("Los archivos llegan pronto"),true);
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
})();
