(function(){
  const IC={
    menu:'<path d="M4 7h16M4 12h10M4 17h16"/>',
    nuevo:'<path d="M12 20h8"/><path d="M15.5 4.5a2.1 2.1 0 013 3L8 18l-4 1 1-4 10.5-10.5z"/>',
    send:'<path d="M4 12l16-8-6 16-2.6-6.4L4 12z" fill="currentColor"/>',
    stop:'<rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" stroke="none"/>',
    mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    copy:'<rect x="9" y="9" width="11" height="11" rx="3"/><path d="M5 15V6a2 2 0 012-2h8"/>',
    regen:'<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
    pin:'<path d="M9 4h6l-1 6 3 3v1H7v-1l3-3-1-6z"/><path d="M12 14v6"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    camara:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    foto:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    archivo:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    voz:'<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
    exportar:'<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
    importar:'<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14"/>',
    ajustes:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
  };
  function ico(n,s){
    s=s||22;
    return '<svg viewBox="0 0 24 24" width="'+s+'" height="'+s+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[n]+'</svg>';
  }
  const nr=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  function cmd(n,a){
    try{if(typeof B.cmd==="function"){B.cmd(n,a||"");return true;}}catch(e){}
    toast("Instala la última versión de la app para usar esto");
    return false;
  }
  function centrar(e){e.style.display="flex";e.style.alignItems="center";e.style.justifyContent="center";}

  // ---------- botones fijos ----------
  [["#menu","menu"],["#nuevo","nuevo"],["#mic","mic"]].forEach(p=>{
    const e=$(p[0]);if(e){e.innerHTML=ico(p[1]);centrar(e);}
  });
  const plus=$("#plus");if(plus){plus.innerHTML=ico("plus",26);centrar(plus);}
  const nc=$("#newchat");if(nc){nc.innerHTML=ico("nuevo",20)+"<span>Nuevo chat</span>";nc.style.display="flex";nc.style.alignItems="center";nc.style.gap="10px";}
  const ac=$("#abrirCfg");if(ac){ac.innerHTML=ico("ajustes",20)+"<span>Ajustes y memoria</span>";ac.style.display="flex";ac.style.alignItems="center";ac.style.gap="10px";}
  const sb=$("#send");
  function pintarEnviar(){if(sb){sb.innerHTML=ico(busy?"stop":"send",22);centrar(sb);}}
  const _rh=window.refreshHeader;
  window.refreshHeader=function(){_rh();pintarEnviar();};
  pintarEnviar();
  const df=document.querySelector(".dfoot");if(df)df.textContent="Todo funciona sin internet";
  document.querySelectorAll(".note").forEach(e=>{
    e.innerHTML=e.innerHTML.replace(/Con 🌐 activado/g,"Con internet activado").replace(/sin 🌐/g,"sin internet").replace(/Sin 🌐/g,"Sin internet");
  });

   // ---------- botones de cada respuesta ----------
  const _aa=window.addActs;
  window.addActs=function(msg,isLast){
    _aa(msg,isLast);
    const a=chatEl.lastElementChild;
    if(!a||!a.classList||!a.classList.contains("acts"))return;
    a.querySelectorAll("button").forEach(b=>{
      if(b.classList.contains("regen"))b.innerHTML=ico("regen",18);
      else if(b.textContent==="📋")b.innerHTML=ico("copy",18);
    });
  };

  // ---------- menú + ----------
  const menu3=document.createElement("div");
  menu3.style.cssText="position:fixed;left:12px;display:none;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:6px;z-index:30;min-width:250px;box-shadow:0 8px 24px rgba(0,0,0,.45)";
  document.body.appendChild(menu3);
  function item3(name,txt,fn){
    const b=document.createElement("button");
    b.type="button";
    b.style.cssText="display:flex;align-items:center;gap:14px;width:100%;border:0;background:none;padding:12px;border-radius:12px;text-align:left;font-size:16px;color:var(--text)";
    b.innerHTML=ico(name,22)+"<span></span>";
    b.children[1].textContent=txt;
    b.onclick=()=>{menu3.style.display="none";fn();};
    menu3.appendChild(b);
  }
  function libre(f){return()=>{if(busy){toast("Espera un momento");return;}f();};}
  function armar3(){
    menu3.innerHTML="";
    item3("foto","Fotos",libre(()=>B.pickImage()));
    item3("camara","Cámara",libre(()=>cmd("camera")));
    item3("archivo","Archivos (texto y Word)",libre(()=>B.pickFile()));
    item3("mic","Hablar con Nova",()=>$("#mic").click());
    item3("voz","Voz de Nova: "+(data.speak?"activada":"apagada"),()=>$("#chipVoz").click());
    item3("exportar","Exportar chats",libre(()=>cmd("export",JSON.stringify({nova:1,chats:data.chats,mem:data.mem||[],instr:data.instr||"",estilo:data.estilo||"normal"}))));
    item3("importar","Importar chats",libre(()=>cmd("import")));
  }
  if(plus){
    plus.onclick=e=>{
      e.stopPropagation();
      if(menu3.style.display==="block"){menu3.style.display="none";return;}
      armar3();
      const r=$("footer").getBoundingClientRect();
      menu3.style.bottom=(window.innerHeight-r.top+8)+"px";
      menu3.style.display="block";
    };
  }
  document.addEventListener("click",e=>{if(!menu3.contains(e.target)&&e.target!==plus)menu3.style.display="none";});

  // ---------- lista de chats: fijar, renombrar, borrar ----------
  const sq=$("#list").previousElementSibling;
  function renombrar(c,row,t){
    const inp=document.createElement("input");
    inp.type="text";inp.value=c.title;inp.maxLength=40;
    inp.style.cssText="flex:1;min-width:0;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);font:inherit;outline:none";
    row.replaceChild(inp,t);inp.focus();inp.select();
    let hecho=false;
    const fin=ok=>{
      if(hecho)return;hecho=true;
      const v=inp.value.trim();
      if(ok&&v){c.title=v;c.manual=true;save();}
      renderList();
    };
    inp.onkeydown=e=>{if(e.key==="Enter")fin(true);else if(e.key==="Escape")fin(false);};
    inp.onblur=()=>fin(true);
  }
  function botonIc(name,fn){
    const b=document.createElement("button");b.className="cdel";b.type="button";
    b.innerHTML=ico(name,18);centrar(b);b.onclick=fn;return b;
  }
  window.renderList=function(){
    const L=$("#list");L.innerHTML="";
    const q=nr(sq&&sq.value);
    const arr=data.chats.filter(c=>!q||nr(c.title).indexOf(q)>=0||c.msgs.some(m=>nr(m.content).indexOf(q)>=0));
    arr.sort((a,b)=>(b.pin?1:0)-(a.pin?1:0));
    arr.forEach(c=>{
      const row=document.createElement("div");row.className="crow"+(c.id===data.current?" act":"");
      const t=document.createElement("button");t.className="ctitle";t.type="button";
      t.textContent=(c.pin?"• ":"")+c.title;t.onclick=()=>selectChat(c.id);
      const ed=botonIc("nuevo",e=>{e.stopPropagation();renombrar(c,row,t);});
      const p=botonIc("pin",e=>{e.stopPropagation();c.pin=!c.pin;save();renderList();});
      if(c.pin)p.style.color="var(--user)";
      const x=botonIc("trash",e=>{
        e.stopPropagation();
        if(x.dataset.arm){delChat(c.id);}
        else{
          x.dataset.arm="1";x.textContent="¿Borrar?";x.classList.add("arm");
          setTimeout(()=>{if(x.isConnected){delete x.dataset.arm;x.innerHTML=ico("trash",18);x.classList.remove("arm");}},3000);
        }
      });
      row.append(t,ed,p,x);L.appendChild(row);
    });
  };
  renderList();

   // ---------- nombre automático de los chats ----------
  const rows2=$("#cfg").querySelectorAll(".row2");
  if(rows2.length){
    const lb=document.createElement("label");lb.className="lbl";lb.textContent="Nombre automático de los chats";
    const rw=document.createElement("div");rw.className="row2";
    const pintarAuto=()=>{
      const on=data.autotitulo!==false;
      rw.querySelectorAll("button").forEach(b=>{b.className="mbtn"+((b.dataset.k==="si")===on?" pri":"");});
    };
    [["si","Sí"],["no","No"]].forEach(p=>{
      const b=document.createElement("button");b.type="button";b.className="mbtn";
      b.dataset.k=p[0];b.textContent=p[1];
      b.onclick=()=>{data.autotitulo=(p[0]==="si");save();pintarAuto();};
      rw.appendChild(b);
    });
    rows2[0].after(lb,rw);pintarAuto();
  }
  let titulando=null;
  function limpiarTitulo(t){
    let s=String(t||"").split("\n")[0];
    s=s.replace(/^\s*(t[ií]tulo|nombre)\s*:\s*/i,"").replace(/["“”«»'`*#]/g,"").replace(/[.:;,!?\s]+$/,"").trim();
    return s.slice(0,40);
  }
  function autoTitle(c){
    if(!c||titulando||busy||!ready||c.manual||c.titled)return;
    if(data.autotitulo===false)return;
    if(c.msgs.length<2||c.msgs.length>4)return;
    if(ctxChat!==data.current||ctxModel!==data.model||c.id!==data.current)return;
    const u=(c.msgs.find(m=>m.role==="user")||{}).content||"";
    const a=(c.msgs.find(m=>m.role==="assistant")||{}).content||"";
    if(!u||!a)return;
    titulando=c;busy=true;refreshHeader();
    const p="Escribe un título de 3 a 5 palabras para esta conversación. Responde solo con el título, sin comillas.\nUsuario: "+u.slice(0,200)+"\nNova: "+a.slice(0,200);
    gen=true;B.send(p);
  }
  function terminarTitulo(t){
    const c=titulando;titulando=null;
    const s=limpiarTitulo(t);
    if(c&&s.length>=3){c.title=s;c.titled=true;}
    gen=false;busy=false;ctxChat=null;
    refreshHeader();renderList();save();
  }
  const _np=window.novaPartial;
  window.novaPartial=function(t){if(titulando)return;_np(t);};
  const _nd6=window.novaDone;
  window.novaDone=function(t){
    if(titulando){terminarTitulo(t);return;}
    const c=chat();
    _nd6(t);
    setTimeout(()=>autoTitle(c),800);
  };
  const _ne=window.novaError;
  window.novaError=function(m){
    if(titulando){titulando=null;gen=false;busy=false;ctxChat=null;refreshHeader();return;}
    _ne(m);
  };

  try{if(typeof renderChat==="function")renderChat();}catch(e){}
})();
