(function(){
  const IC={
    foto:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    camara:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    archivo:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
    voz:'<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
    exportar:'<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
    importar:'<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14"/>'
  };
  function ico(n,s){
    return '<svg viewBox="0 0 24 24" width="'+s+'" height="'+s+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[n]+'</svg>';
  }
  function cmd(n,a){
    try{if(typeof B.cmd==="function"){B.cmd(n,a||"");return true;}}catch(e){}
    toast("Instala la última versión de la app para usar esto");
    return false;
  }

  const fondo=document.createElement("div");
  fondo.style.cssText="position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(0,0,0,.5);display:none;z-index:40";
  const hoja=document.createElement("div");
  hoja.style.cssText="position:fixed;left:0;right:0;bottom:0;background:var(--panel);border-top-left-radius:26px;border-top-right-radius:26px;padding:10px 18px 24px;z-index:41;transform:translateY(105%);transition:transform .22s ease;max-height:75vh;overflow-y:auto;box-shadow:0 -8px 30px rgba(0,0,0,.5)";
  document.body.appendChild(fondo);
  document.body.appendChild(hoja);
  let abierta=false;

  function cerrar(){
    abierta=false;
    hoja.style.transform="translateY(105%)";
    fondo.style.display="none";
  }
  function abrir(){
    armar();
    abierta=true;
    fondo.style.display="block";
    hoja.style.transform="translateY(0)";
  }
  fondo.onclick=cerrar;

  function seccion(titulo){
    const t=document.createElement("div");
    t.textContent=titulo;
    t.style.cssText="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:14px 4px 10px";
    hoja.appendChild(t);
    const g=document.createElement("div");
    g.style.cssText="display:grid;grid-template-columns:repeat(3,1fr);gap:12px";
    hoja.appendChild(g);
    return g;
  }
  function ficha(g,icono,texto,fn,activo){
    const b=document.createElement("button");
    b.type="button";
    b.style.cssText="display:flex;flex-direction:column;align-items:center;gap:8px;border:0;background:none;color:var(--text);padding:4px 0;font:inherit;font-size:13px";
    const c=document.createElement("span");
    c.style.cssText="width:58px;height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;border:1px solid "+(activo?"var(--user)":"var(--line)")+";background:"+(activo?"rgba(110,140,255,.18)":"var(--bot)")+";color:"+(activo?"var(--user)":"var(--text)");
    c.innerHTML=ico(icono,26);
    const l=document.createElement("span");
    l.textContent=texto;
    b.append(c,l);
    b.onclick=()=>{cerrar();fn();};
    g.appendChild(b);
  }
  function libre(f){return()=>{if(busy){toast("Espera un momento");return;}f();};}

  function armar(){
    hoja.innerHTML="";
    const barra=document.createElement("div");
    barra.style.cssText="width:40px;height:4px;border-radius:2px;background:var(--line);margin:2px auto 6px";
    hoja.appendChild(barra);
    const a=seccion("Adjuntar");
    ficha(a,"foto","Fotos",libre(()=>B.pickImage()));
    ficha(a,"camara","Cámara",libre(()=>cmd("camera")));
    ficha(a,"archivo","Archivos",libre(()=>B.pickFile()));
    const h=seccion("Hablar");
    ficha(h,"mic","Micrófono",()=>$("#mic").click());
    ficha(h,"voz",data.speak?"Voz activada":"Voz apagada",()=>$("#chipVoz").click(),!!data.speak);
    const c=seccion("Chats");
    ficha(c,"exportar","Exportar",libre(()=>cmd("export",JSON.stringify({nova:1,chats:data.chats,mem:data.mem||[],instr:data.instr||"",estilo:data.estilo||"normal"}))));
    ficha(c,"importar","Importar",libre(()=>cmd("import")));
  }

  const plus=$("#plus");
  if(plus){
    plus.onclick=e=>{
      e.stopPropagation();
      if(abierta)cerrar();else abrir();
    };
  }
  const _nb=window.novaBack;
  window.novaBack=function(){
    if(abierta){cerrar();return true;}
    return _nb?_nb():false;
  };
})();
