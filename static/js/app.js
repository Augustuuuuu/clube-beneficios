/* ============================================================
   Utils
   ============================================================ */
let toastEl = null;
const U = {
  onlyDigits(s){ return String(s ?? "").replace(/\D+/g, ""); },
  esc(s){
    return String(s ?? "").replace(/[&<>"'`]/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;","`":"&#96;"
    }[m]));
  },
  debounce(fn, ms){
    let t=0; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
  },
  toast(msg,type="ok"){ toastEl?.show(msg,type); },
  randHex(nBytes=16){
    const b=new Uint8Array(nBytes);
    crypto.getRandomValues(b);
    return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
  },
  maskPhone(digits){
    const d = digits.slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  },
  fmtDT(ms){
    try{ return U.fmtDateTimeBR(ms); }catch{ return String(ms); }
  },
  fmtDateTimeBR(val){
    if(val==null||val==="") return "—";
    try{
      const d = val instanceof Date ? val : new Date(val);
      if(!Number.isFinite(d.getTime())) return "—";
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    }catch{ return String(val); }
  },
  fmtTimeBR(val){
    if(val==null||val==="") return "—";
    try{
      const d = val instanceof Date ? val : new Date(val);
      if(!Number.isFinite(d.getTime())) return "—";
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
    }catch{ return String(val); }
  },
  clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
};

/* ============================================================
   Config
   ============================================================ */
const CFG = Object.freeze({
  dbName: "cbo_db_v5",
  dbVer: 1,
  stores: { rec:"records", meta:"meta", admin:"adminlog" },

  apiBase: "/api",
  pollIntervalMs: 45 * 1000,

  pbkdf2: { iter: 150000, hash:"SHA-256", baseSalt:"cbo_base_salt_2026_v5", pepper:"pepper::cbo::v5" },

  maxFails: 10,
  lockMs: 1 * 60 * 1000,
  sessionMs: 25 * 60 * 1000,

  validDDD: new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]),

  accents: [
    { id:"ruby",   name:"Ruby",   a:"#ff3b6b", b:"#ff6f91", glow:"rgba(255,59,107,.22)" },
    { id:"ocean",  name:"Ocean",  a:"#2dd4bf", b:"#60a5fa", glow:"rgba(45,212,191,.22)" },
    { id:"violet", name:"Violet", a:"#a78bfa", b:"#f472b6", glow:"rgba(167,139,250,.22)" },
    { id:"lime",   name:"Lime",   a:"#84cc16", b:"#22c55e", glow:"rgba(132,204,22,.18)" },
    { id:"amber",  name:"Amber",  a:"#f59e0b", b:"#fb7185", glow:"rgba(245,158,11,.18)" }
  ],

  defaults: {
    campaign: {
      ttlMs: 2 * 60 * 60 * 1000,
      antiDup: true,
      termsText:
        "• Um código por WhatsApp (por oferta) dentro do prazo de validade.\n" +
        "• O benefício depende da oferta escolhida.\n" +
        "• Apresente o QR ou o código no balcão para liberar o benefício.\n" +
        "• Em caso de dúvida, consulte o estabelecimento.\n" +
        "• Dados podem ser sincronizados com o servidor quando online.",
      missionText:
        "Mostre este QR no balcão e peça para validar. Se postar no Instagram e marcar o perfil, ganha um extra surpresa."
    },
    /* Multi-ofertas: cada oferta tem janela e descrição */
    offers: [
      {
        id:"of_" + "A1",
        enabled:true,
        title:"Bônus do dia ✨",
        description:"Apresente o QR e desbloqueie um mimo especial hoje.",
        startAt: Date.now() - 60*60*1000,
        endAt: Date.now() + 6*60*60*1000,
        tag:"VIP",
        ctaText:"Ver cardápio",
        ctaUrl:"",
      },
      {
        id:"of_" + "B2",
        enabled:true,
        title:"Happy Hour 🥂",
        description:"Das 18h às 20h: benefício extra em resgates.",
        startAt: Date.now() + 2*60*60*1000,
        endAt: Date.now() + 4*60*60*1000,
        tag:"COMBO",
        ctaText:"",
        ctaUrl:"",
      }
    ]
  }
});

/* ============================================================
   IndexedDB Model
   ============================================================ */
class Model{
  #db=null;

  async init(){
    if(this.#db) return;
    this.#db = await new Promise((resolve,reject)=>{
      const req = indexedDB.open(CFG.dbName, CFG.dbVer);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(CFG.stores.rec)){
          const s = db.createObjectStore(CFG.stores.rec, {keyPath:"id"});
          s.createIndex("byPhone","phone",{unique:false});
          s.createIndex("byOfferPhone","offerPhoneKey",{unique:false});
          s.createIndex("byDay","dayKey",{unique:false});
          s.createIndex("byTs","createdAt",{unique:false});
        }
        if(!db.objectStoreNames.contains(CFG.stores.meta)){
          db.createObjectStore(CFG.stores.meta, {keyPath:"k"});
        }
        if(!db.objectStoreNames.contains(CFG.stores.admin)){
          db.createObjectStore(CFG.stores.admin, {keyPath:"id"});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  #tx(mode, stores){
    if(!this.#db) throw new Error("DB not ready");
    return this.#db.transaction(stores, mode);
  }

  async getMeta(k){
    await this.init();
    return await new Promise((resolve)=>{
      const tx = this.#tx("readonly",[CFG.stores.meta]);
      const req = tx.objectStore(CFG.stores.meta).get(k);
      req.onsuccess=()=>resolve(req.result?.v ?? null);
      req.onerror=()=>resolve(null);
    });
  }
  async setMeta(k,v){
    await this.init();
    await new Promise((resolve)=>{
      const tx = this.#tx("readwrite",[CFG.stores.meta]);
      tx.objectStore(CFG.stores.meta).put({k,v});
      tx.oncomplete=()=>resolve(null);
      tx.onerror=()=>resolve(null);
    });
  }

  async ensureDefaults(){
    const camp = await this.getMeta("campaign");
    if(!camp) await this.setMeta("campaign", structuredClone(CFG.defaults.campaign));

    const offers = await this.getMeta("offers");
    if(!offers) await this.setMeta("offers", structuredClone(CFG.defaults.offers));
  }

  async getCampaign(){ return (await this.getMeta("campaign")) || structuredClone(CFG.defaults.campaign); }
  async setCampaign(c){ await this.setMeta("campaign", c); }

  async getOffers(){ return (await this.getMeta("offers")) || structuredClone(CFG.defaults.offers); }
  async setOffers(list){ await this.setMeta("offers", list); }

  async putRecord(rec){
    await this.init();
    await new Promise((resolve)=>{
      const tx = this.#tx("readwrite",[CFG.stores.rec]);
      tx.objectStore(CFG.stores.rec).put(rec);
      tx.oncomplete=()=>resolve(null);
      tx.onerror=()=>resolve(null);
    });
  }

  async findLatestByOfferPhone(offerPhoneKey){
    await this.init();
    return await new Promise((resolve)=>{
      const tx = this.#tx("readonly",[CFG.stores.rec]);
      const idx = tx.objectStore(CFG.stores.rec).index("byOfferPhone");
      const req = idx.getAll(offerPhoneKey);
      req.onsuccess=()=>{
        const all=req.result||[];
        all.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
        resolve(all[0]||null);
      };
      req.onerror=()=>resolve(null);
    });
  }

  async listRecent(limit=5, phoneFilter=null){
    await this.init();
    return await new Promise((resolve)=>{
      const tx = this.#tx("readonly",[CFG.stores.rec]);
      const store = tx.objectStore(CFG.stores.rec);
      if(phoneFilter){
        const idx = store.index("byPhone");
        const req = idx.getAll(phoneFilter);
        req.onsuccess=()=>{
          const all=req.result||[];
          all.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
          resolve(all.slice(0,limit));
        };
        req.onerror=()=>resolve([]);
      }else{
        const req = store.index("byTs").getAll();
        req.onsuccess=()=>{
          const all=req.result||[];
          all.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
          resolve(all.slice(0,limit));
        };
        req.onerror=()=>resolve([]);
      }
    });
  }

  async adminQuery(q,page,pageSize){
    await this.init();
    const query = (q||"").trim().toLowerCase();

    // Tenta buscar direto do servidor (registros globais) quando online
    const base = CFG.apiBase || "/api";
    if (navigator.onLine && base) {
      try{
        const params = new URLSearchParams({
          q: query,
          page: String(page|0),
          page_size: String(pageSize||50),
        });
        const res = await fetch(base + "/redemptions/?" + params.toString(), {
          credentials: "same-origin",
        });
        if(res.ok){
          const data = await res.json();
          const total = Number(data.total||0);
          const raw = Array.isArray(data.slice) ? data.slice : [];
          const slice = raw.map(r=>({
            id: r.id,
            name: r.name || "",
            phone: r.phone || "",
            code: r.code || "",
            tag: r.tag || "",
            createdAt: r.createdAt,
            expiresAt: r.expiresAt,
            offerId: r.offerId,
            offerTitle: r.offerTitle || "",
          }));
          return { total, slice, fromServer:true };
        }
      }catch(_){
        // fallback para IndexedDB local
      }
    }

    return await new Promise((resolve)=>{
      const tx = this.#tx("readonly",[CFG.stores.rec]);
      const req = tx.objectStore(CFG.stores.rec).getAll();
      req.onsuccess=()=>{
        let all=req.result||[];
        if(query){
          all = all.filter(r=>{
            const n=String(r.name||"").toLowerCase();
            const p=String(r.phone||"").toLowerCase();
            const c=String(r.code||"").toLowerCase();
            const o=String(r.offerTitle||"").toLowerCase();
            return n.includes(query)||p.includes(query)||c.includes(query)||o.includes(query);
          });
        }
        all.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
        const total=all.length;
        const start=page*pageSize;
        resolve({total, slice: all.slice(start,start+pageSize), fromServer:false });
      };
      req.onerror=()=>resolve({total:0, slice:[]});
    });
  }

  async deleteRecord(id){
    await this.init();
    await new Promise((resolve)=>{
      const tx=this.#tx("readwrite",[CFG.stores.rec]);
      tx.objectStore(CFG.stores.rec).delete(id);
      tx.oncomplete=()=>resolve(null);
      tx.onerror=()=>resolve(null);
    });
  }

  async clearAll(){
    await this.init();
    await new Promise((resolve)=>{
      const tx=this.#tx("readwrite",[CFG.stores.rec]);
      tx.objectStore(CFG.stores.rec).clear();
      tx.oncomplete=()=>resolve(null);
      tx.onerror=()=>resolve(null);
    });
  }

  async metrics(){
    await this.init();
    const dayKey=(d)=>d.toISOString().slice(0,10);
    const today=new Date();
    const yest=new Date(Date.now()-86400000);
    const kToday=dayKey(today), kYest=dayKey(yest);

    return await new Promise((resolve)=>{
      const tx=this.#tx("readonly",[CFG.stores.rec]);
      const idx=tx.objectStore(CFG.stores.rec).index("byDay");
      const r1=idx.getAll(kToday);
      const r2=idx.getAll(kYest);
      let a=null,b=null;
      r1.onsuccess=()=>{ a=(r1.result||[]).length; if(b!==null) resolve({today:a,yesterday:b}); };
      r2.onsuccess=()=>{ b=(r2.result||[]).length; if(a!==null) resolve({today:a,yesterday:b}); };
      r1.onerror=()=>resolve({today:0,yesterday:0});
      r2.onerror=()=>resolve({today:0,yesterday:0});
    });
  }

  async logAdminAccess(role){
    await this.init();
    const id="adm_"+U.randHex(10);
    const ts=Date.now();
    await new Promise((resolve)=>{
      const tx=this.#tx("readwrite",[CFG.stores.admin, CFG.stores.meta]);
      tx.objectStore(CFG.stores.admin).put({id,ts,role});
      tx.objectStore(CFG.stores.meta).put({k:"lastAdminAccess", v:ts});
      tx.objectStore(CFG.stores.meta).put({k:"lastAdminRole", v:role});
      tx.oncomplete=()=>resolve(null);
      tx.onerror=()=>resolve(null);
    });
  }

  async listAdminLog(limit=20){
    await this.init();
    return await new Promise((resolve)=>{
      const tx=this.#tx("readonly",[CFG.stores.admin]);
      const req=tx.objectStore(CFG.stores.admin).getAll();
      req.onsuccess=()=>{
        const all=req.result||[];
        all.sort((a,b)=>(b.ts||0)-(a.ts||0));
        resolve(all.slice(0,limit));
      };
      req.onerror=()=>resolve([]);
    });
  }
}
/* ============================================================
   CryptoAuth (PBKDF2) + Setup de senha
   ============================================================ */
function toHex(u8){ return [...u8].map(x=>x.toString(16).padStart(2,"0")).join(""); }

const CryptoAuth = {
  async deriveVerifier(pass){
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey(
      "raw",
      enc.encode(pass + "::" + CFG.pbkdf2.pepper),
      { name:"PBKDF2" },
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name:"PBKDF2", salt: enc.encode(CFG.pbkdf2.baseSalt), iterations: CFG.pbkdf2.iter, hash: CFG.pbkdf2.hash },
      base,
      256
    );
    return toHex(new Uint8Array(bits));
  },

  async verifyRole(pass, stored){
    const verifier = await this.deriveVerifier(pass);
    const dynSalt = U.randHex(8);

    const a = await sha256Hex(verifier + dynSalt);
    const bAdmin = await sha256Hex(String(stored.admin||"") + dynSalt);
    if(ctEq(a,bAdmin)) return "admin";

    const bGer = await sha256Hex(String(stored.gerente||"") + dynSalt);
    if(ctEq(a,bGer)) return "gerente";

    return null;

    function ctEq(x,y){
      if(x.length!==y.length) return false;
      let r=0; for(let i=0;i<x.length;i++) r |= x.charCodeAt(i) ^ y.charCodeAt(i);
      return r===0;
    }
    async function sha256Hex(s){
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
      return toHex(new Uint8Array(buf));
    }
  }
};

/* ============================================================
   Controller (user + multi-ofertas)
   ============================================================ */
class Controller{
  constructor(model){
    this.m = model;

    this.tapTimes = [];
    this.expiryTimer = 0;

    this.selectedOfferId = null;

    this.serverData = { offers: [], campaign: null, updatedAt: null };
    this.pollTimer = 0;

    this.admin = {
      open:false,
      role:null,
      sessionUntil:0,
      q:"",
      page:0,
      pageSize:50,
      usesServer:false,
      lock:{ admin:{f:0,l:0}, gerente:{f:0,l:0} },
      storedVerifiers: { admin:"", gerente:"" }
    };
  }

  async init(){
    await this.m.init();
    toastEl = document.querySelector("cbo-toast");

    await this.initPWA();
    this.initNetworkBanner();

    await this.m.ensureDefaults();
    await this.loadRateLimit();
    await this.loadThemeUI();
    await this.ensureAuthSetup();

    await this.syncFromServer();
    await this.renderTermsPreview();
    await this.renderOffers();
    await this.renderRecent();
    this.wireUI();
    this.sysInfo();

    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.syncFromServer(), CFG.pollIntervalMs);

    U.toast("Pronto. Escolha uma oferta e gere seu código. ✨","ok");
  }

  /* ---------------------------
     PWA (offline básico)
     --------------------------- */
  async initPWA(){
    try{
        if (location.protocol !== "https:" && location.hostname !== "localhost") {
  return; // evita tentativa de SW fora de contexto seguro
}
      if("serviceWorker" in navigator){
        const swCode = `
          const CACHE="cbo-cache-v5";
          self.addEventListener("install",(e)=>{
            e.waitUntil((async()=>{
              const c=await caches.open(CACHE);
              try{ await c.addAll(["./"]); }catch{}
              self.skipWaiting();
            })());
          });
          self.addEventListener("activate",(e)=>e.waitUntil((async()=>self.clients.claim())()));
          self.addEventListener("fetch",(e)=>{
            const req=e.request;
            e.respondWith((async()=>{
              const cache=await caches.open(CACHE);
              const cached=await cache.match(req);
              if(cached) return cached;
              try{
                const fresh=await fetch(req);
                if(req.method==="GET" && fresh && fresh.ok){
                  try{ cache.put(req, fresh.clone()); }catch{}
                }
                return fresh;
              }catch{
                return cached || (await cache.match("./")) || new Response("Offline",{status:200});
              }
            })());
          });
        `;
        const blob=new Blob([swCode],{type:"text/javascript"});
        const swUrl=URL.createObjectURL(blob);
        await navigator.serviceWorker.register(swUrl,{scope:"./"});
        URL.revokeObjectURL(swUrl);
      }
    }catch{}
  }

  initNetworkBanner(){
    const upd = ()=>{
      const b = document.getElementById("offlineBanner");
      b.classList.toggle("show", !navigator.onLine);
    };
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    upd();
  }

  sysInfo(){
    const el=document.getElementById("sysInfo");
    const server = this.serverData.updatedAt
      ? ` • Servidor: ${U.fmtTimeBR(this.serverData.updatedAt)}`
      : "";
    el.textContent = `Armazenamento: IndexedDB • Rede: ${navigator.onLine?"online":"offline"}${server} • WebCrypto: ${crypto?.subtle?"ok":"indisp."}`;
  }

  getCsrfToken(){
    const m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1].trim()) : "";
  }

  async syncFromServer(){
    if(!navigator.onLine) return;
    const base = CFG.apiBase || "/api";
    try {
      const [rOffers, rCampaign] = await Promise.all([
        fetch(base + "/offers/", { credentials: "same-origin" }),
        fetch(base + "/campaign/", { credentials: "same-origin" }),
      ]);
      if(!rOffers.ok || !rCampaign.ok) return;
      const dataOffers = await rOffers.json();
      const dataCampaign = await rCampaign.json();
      const offers = (dataOffers.offers || []).map(o => ({
        id: o.id,
        title: o.title,
        description: o.description || "",
        tag: o.tag || "OFERTA",
        startAt: o.start_at ? new Date(o.start_at).getTime() : null,
        endAt: o.end_at ? new Date(o.end_at).getTime() : null,
        ctaText: o.cta_text || "",
        ctaUrl: o.cta_url || "",
        enabled: true,
        partner_name: o.partner_name || "",
      }));
      const updatedAt = dataOffers.updated_at || dataCampaign.updated_at;
      this.serverData = {
        offers,
        campaign: {
          ttlMs: (dataCampaign.ttl_minutes || 120) * 60 * 1000,
          antiDup: !!dataCampaign.anti_duplicate,
          termsText: dataCampaign.terms_text || "",
          missionText: dataCampaign.mission_text || "",
        },
        updatedAt: updatedAt ? new Date(updatedAt).getTime() : Date.now(),
      };
      await this.renderOffers();
      await this.renderTermsPreview();
      this.sysInfo();
    } catch (_) {}
  }

  /* ---------------------------
     Theme
     --------------------------- */
  async loadThemeUI(){
    const accentSel=document.getElementById("accentSelect");
    const modeSel=document.getElementById("modeSelect");

    accentSel.innerHTML = CFG.accents.map(a=>`<option value="${U.esc(a.id)}">${U.esc(a.name)}</option>`).join("");
    const savedAccent = await this.m.getMeta("accentId") || "ruby";
    const savedMode = await this.m.getMeta("mode") || "system";
    accentSel.value = savedAccent;
    modeSel.value = savedMode;
    this.applyTheme(savedAccent, savedMode);
  }

  applyTheme(accentId, mode){
    const pal = CFG.accents.find(x=>x.id===accentId) || CFG.accents[0];
    document.documentElement.style.setProperty("--accent", pal.a);
    document.documentElement.style.setProperty("--accent2", pal.b);
    document.documentElement.style.setProperty("--accentGlow", pal.glow);

    if(mode==="dark"){
      document.documentElement.style.colorScheme="dark";
      document.documentElement.dataset.theme="dark";
      document.documentElement.style.setProperty("--bg","#0b1220");
      document.documentElement.style.setProperty("--bg2","#0f1a33");
    }else if(mode==="light"){
      document.documentElement.style.colorScheme="light";
      document.documentElement.dataset.theme="light";
      document.documentElement.style.setProperty("--bg","#f6f8ff");
      document.documentElement.style.setProperty("--bg2","#eef2ff");
    }else{
      document.documentElement.style.colorScheme="light dark";
      document.documentElement.dataset.theme="system";
    }
  }

  async applyThemeFromUI(){
    const accentId=document.getElementById("accentSelect").value;
    const mode=document.getElementById("modeSelect").value;
    await this.m.setMeta("accentId", accentId);
    await this.m.setMeta("mode", mode);
    this.applyTheme(accentId, mode);
    U.toast("Tema aplicado.","ok");
  }

  /* ---------------------------
     Terms
     --------------------------- */
  async renderTermsPreview(){
    const el=document.getElementById("termsPreview");
    const c = this.serverData.campaign || await this.m.getCampaign();
    const raw = (c.termsText||"").trim();
    const text = raw || "• Um código por WhatsApp (por oferta) dentro do prazo de validade.\n• O benefício depende da oferta escolhida.\n• Apresente o QR ou o código no balcão para liberar o benefício.\n• Em caso de dúvida, consulte o estabelecimento.";
    el.innerHTML = U.esc(text).replace(/\n/g,"<br>");
  }

  /* ---------------------------
     Phone normalize
     --------------------------- */
  normalizePhone(raw){
    const d = U.onlyDigits(raw);
    const core = d.startsWith("55") ? d.slice(2) : d;
    if(!(core.length===10 || core.length===11)) return null;
    const ddd = Number(core.slice(0,2));
    if(!CFG.validDDD.has(ddd)) return null;
    return "55" + core;
  }
  prettyBR(e164){
    const d=U.onlyDigits(e164);
    const core=d.startsWith("55")?d.slice(2):d;
    return U.maskPhone(core);
  }

  /* ---------------------------
     Offers: listar e escolher
     --------------------------- */
  offerActive(of, now){
    if(!of?.enabled) return false;
    const s = Number(of.startAt||0), e = Number(of.endAt||0);
    return now>=s && now<=e && !!of.title;
  }

  async renderOffers(){
    const host = document.getElementById("offerList");
    const now = Date.now();
    let offers = this.serverData.offers?.length ? this.serverData.offers : await this.m.getOffers();
    const active = offers.filter(o=>this.offerActive(o, now))
      .sort((a,b)=>(a.endAt||0)-(b.endAt||0));

    host.innerHTML = "";

    const btn = document.getElementById("btnGerar");
    if(!active.length){
      btn.disabled = true;
      document.getElementById("btnText").textContent = "Sem ofertas ativas agora";
      document.getElementById("btnIcon").textContent = "⏳";
      this.selectedOfferId = null;
      return;
    }

    const frag=document.createDocumentFragment();
    for(const o of active){
      const div=document.createElement("div");
      div.className="offerItem";
      div.innerHTML = `
        <div class="offerTop">
          <div>
            <div class="offerTitle">${U.esc(o.title)}</div>
            <div class="offerMeta">${U.esc(o.description||"")}</div>
            <div class="offerMeta">Janela: <span class="kbd">${U.esc(U.fmtDT(o.startAt))}</span> → <span class="kbd">${U.esc(U.fmtDT(o.endAt))}</span></div>
          </div>
          <div class="tag">${U.esc(o.tag||"OFERTA")}</div>
        </div>
        <div class="offerPickRow">
          <div class="offerMeta">${o.ctaText && o.ctaUrl ? `🔗 <a href="${U.esc(o.ctaUrl)}" target="_blank" rel="noopener noreferrer">${U.esc(o.ctaText)}</a>` : ""}</div>
          <button class="secondary offerBtn" type="button" data-pick="${U.esc(o.id)}">Escolher esta</button>
        </div>
      `;
      frag.appendChild(div);
    }
    host.appendChild(frag);

    const hint = document.getElementById("offerListHint");
    if (hint) {
      hint.textContent = this.serverData.updatedAt
        ? `Sincronizado com o servidor às ${U.fmtTimeBR(this.serverData.updatedAt)}. Atualização automática a cada ${CFG.pollIntervalMs/1000}s.`
        : "Se nenhuma oferta aparecer, o gerente precisa ativar pelo painel.";
    }

    // auto escolher a primeira
    if(!this.selectedOfferId && active.length) this.pickOffer(active[0].id);
  }

  pickOffer(offerId){
    const id = offerId;
    this.selectedOfferId = /^\d+$/.test(String(id)) ? Number(id) : id;
    const btn = document.getElementById("btnGerar");
    btn.disabled = false;
    document.getElementById("btnIcon").textContent = "✨";
    document.getElementById("btnText").textContent = "Gerar meu código";
    U.toast("Oferta selecionada. Agora gere o código.","ok");
  }

  /* ---------------------------
     Record / code
     --------------------------- */
  makeCode(phoneE164, createdAt, offerTag){
    const tail = U.onlyDigits(phoneE164).slice(-6);
    const t = createdAt.toString(36).toUpperCase().slice(-3);
    const a = (parseInt(tail.slice(0,3),10) ^ createdAt).toString(36).toUpperCase().slice(-4).padStart(4,"0");
    const b = (parseInt(tail.slice(3),10) + createdAt).toString(36).toUpperCase().slice(-4).padStart(4,"0");
    const tag = (offerTag||"OFERTA").toUpperCase().slice(0,8);
    return `CBO-${tag}-${a}-${b}-${t}`;
  }

  status(type,msg,sticky=false){
    const s=document.getElementById("statusBox");
    if(!s) return;
    s.className=`status show ${type}`;
    s.textContent=msg;
    s.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if(!sticky){
      setTimeout(()=>{ s.className="status"; s.textContent=""; }, 3800);
    }
  }

  btnState(state){
    const btn=document.getElementById("btnGerar");
    const icon=document.getElementById("btnIcon");
    const txt=document.getElementById("btnText");
    btn.disabled = state==="loading";
    if(state==="loading"){ icon.textContent="⏳"; txt.textContent="Gerando…"; }
    else if(state==="success"){
      icon.textContent="✅"; txt.textContent="Código pronto!";
      setTimeout(()=>{ icon.textContent="✨"; txt.textContent="Gerar meu código"; btn.disabled=false; }, 900);
    } else { icon.textContent="✨"; txt.textContent="Gerar meu código"; btn.disabled=false; }
  }

  startExpiryCountdown(expiresAt){
    clearInterval(this.expiryTimer);
    const out=document.getElementById("expiryText");
    const tick=()=>{
      const ms=Math.max(0, expiresAt-Date.now());
      const h=Math.floor(ms/3600000);
      const m=Math.floor((ms%3600000)/60000);
      const s=Math.floor((ms%60000)/1000);
      out.textContent = ms<=0 ? "Expirado" : `Expira em ${h}h ${m}m ${s}s`;
      if(ms<=0){
        clearInterval(this.expiryTimer);
        U.toast("Seu código expirou. Gere um novo quando quiser.", "warn");
      }
    };
    tick();
    this.expiryTimer=setInterval(tick, 1000);
  }

  async renderMission(){
    const box = document.getElementById("missionBox");
    const text = document.getElementById("missionText");
    const camp = this.serverData.campaign || await this.m.getCampaign();
    const msg = (camp.missionText || "").trim();
    if(!msg){ box.style.display="none"; return; }
    box.style.display="grid";
    text.textContent = msg;
  }

  async generate(){
    const nameEl=document.getElementById("nome");
    const phoneEl=document.getElementById("telefone");
    const resultWrap=document.getElementById("resultWrap");

    const nameRaw=(nameEl.value||"").trim();
    const phoneRaw=(phoneEl.value||"").trim();

    const name = nameRaw.replace(/\s+/g," ").slice(0,60);
    const phone = this.normalizePhone(phoneRaw);

    if(!this.selectedOfferId){
      if(resultWrap) resultWrap.classList.remove("show");
      this.status("warn","Escolha uma oferta acima.", true);
      return U.toast("Escolha uma oferta.","warn");
    }
    if(!name){
      if(resultWrap) resultWrap.classList.remove("show");
      this.status("bad","Informe seu nome.", true);
      nameEl.focus();
      return U.toast("Preencha o nome.","warn");
    }
    if(!phone){
      if(resultWrap) resultWrap.classList.remove("show");
      this.status("bad","WhatsApp inválido. Use DDD + número (ex: 11 99999-9999).", true);
      phoneEl.focus();
      return U.toast("WhatsApp inválido.","bad");
    }

    const offers = this.serverData.offers?.length ? this.serverData.offers : await this.m.getOffers();
    const offer = offers.find(o=>String(o.id)===String(this.selectedOfferId));
    if(!offer || !this.offerActive(offer, Date.now())){
      if(resultWrap) resultWrap.classList.remove("show");
      await this.renderOffers();
      this.status("warn","Oferta não está mais ativa. Escolha outra.", true);
      return U.toast("Oferta mudou. Escolha outra.","warn");
    }

    const camp = this.serverData.campaign || await this.m.getCampaign();
    const now=Date.now();
    this.btnState("loading");

    const isServerOffer = typeof this.selectedOfferId === "number";
    if (isServerOffer && navigator.onLine) {
      try {
        const base = CFG.apiBase || "/api";
        const res = await fetch(base + "/redeem/", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": this.getCsrfToken(),
          },
          body: JSON.stringify({
            offer_id: this.selectedOfferId,
            full_name: name,
            whatsapp: phone,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.btnState("");
          const errMsg = data.error || data.detail || "Erro ao gerar código no servidor.";
          this.status("bad", errMsg, true);
          return U.toast(errMsg, "bad");
        }
        if (data.code) {
          const expiresAt = new Date(data.expires_at).getTime();
          const offerPhoneKey = `${offer.id}::${phone}`;
          let rec = data.reused ? await this.m.findLatestByOfferPhone(offerPhoneKey) : null;
          if (!rec) {
            rec = {
              id: "srv_" + U.randHex(8),
              name,
              phone,
              code: data.code,
              tag: data.tag || offer.tag,
              createdAt: now,
              expiresAt,
              dayKey: new Date(now).toISOString().slice(0, 10),
              offerId: offer.id,
              offerTitle: data.offer_title || offer.title,
              offerPhoneKey,
            };
            await this.m.putRecord(rec);
          } else {
            rec.name = name;
            rec.expiresAt = expiresAt;
            rec.code = data.code;
            await this.m.putRecord(rec);
          }
          this.btnState("success");
          this.status("ok", data.reused ? "Código já existente. Use o tempo restante abaixo." : "Código gerado. Apresente no balcão.", false);
          this.renderResult(rec);
          await this.renderRecent();
          await this.renderMission();
          nameEl.value = ""; phoneEl.value = ""; nameEl.focus();
          return;
        }
      } catch (_) {}
    }

    // Anti-duplicidade por (telefone + oferta)
    const offerPhoneKey = `${offer.id}::${phone}`;
    const existing = camp.antiDup ? await this.m.findLatestByOfferPhone(offerPhoneKey) : null;
    const isReuse = !!(existing && existing.expiresAt > now);

    let rec = existing;
    if(isReuse){
      existing.name = name;
      await this.m.putRecord(existing);
    }else{
      const id="r_"+U.randHex(10);
      const createdAt=Date.now();
      const expiresAt=createdAt + (camp.ttlMs|0);
      const dayKey=new Date(createdAt).toISOString().slice(0,10);
      const code=this.makeCode(phone, createdAt, offer.tag || "OFERTA");

      rec = {
        id,
        name,
        phone,
        code,
        tag: offer.tag || "OFERTA",
        createdAt,
        expiresAt,
        dayKey,
        offerId: offer.id,
        offerTitle: offer.title,
        offerPhoneKey
      };
      await this.m.putRecord(rec);
    }

    this.btnState("success");
    this.status("ok", isReuse
      ? "Código recuperado (mesma oferta, dentro da validade)."
      : "Código gerado. Apresente no balcão.", false);

    this.renderResult(rec);
    await this.renderRecent();
    await this.renderMission();

    nameEl.value=""; phoneEl.value="";
    nameEl.focus();
  }

  renderResult(rec){
    const wrap=document.getElementById("resultWrap");
    document.getElementById("codeValue").textContent=rec.code;
    document.getElementById("codeTag").textContent=rec.tag;
    document.getElementById("phonePretty").textContent=this.prettyBR(rec.phone);
    document.getElementById("offerChosen").textContent=rec.offerTitle || "—";

    document.getElementById("qr").setAttribute("code", rec.code);

    this.startExpiryCountdown(rec.expiresAt);
    wrap.classList.add("show");
  }

  async renderRecent(){
    const host=document.getElementById("recentList");
    const phoneEl=document.getElementById("telefone");
    const phoneRaw=(phoneEl?.value||"").trim();
    const phone=this.normalizePhone(phoneRaw)||null;
    const list=await this.m.listRecent(5, phone);
    host.innerHTML="";
    if(!phone){
      host.innerHTML = `<div class="offerMeta">Digite seu WhatsApp acima para ver apenas os códigos que você gerou.</div>`;
      return;
    }
    if(!list.length){
      host.innerHTML = `<div class="offerMeta">Você ainda não gerou códigos com este WhatsApp. Gere seu primeiro código acima.</div>`;
      return;
    }
    const frag=document.createDocumentFragment();
    for(const r of list){
      const expiresAt = r.expiresAt;
      const isExpired = expiresAt && Date.now() > expiresAt;
      const timeLabel = isExpired ? "Expirado" : (expiresAt ? this._formatTimeLeft(expiresAt) : "");
      const el=document.createElement("div");
      el.className="offerItem";
      el.innerHTML=`
        <div class="offerTop">
          <div>
            <div class="offerTitle">${U.esc(r.offerTitle||"Oferta")}</div>
            <div class="offerMeta">${U.esc(r.name)} • ${U.esc(this.prettyBR(r.phone))}</div>
          </div>
          <div class="kbd">${U.esc(r.code)}</div>
        </div>
        <div class="offerMeta">Criado: ${U.esc(U.fmtDT(r.createdAt))}${timeLabel ? ` • ${timeLabel}` : ""}</div>
      `;
      el.addEventListener("click", ()=> this.copyText(r.code), {passive:true});
      frag.appendChild(el);
    }
    host.appendChild(frag);
  }
  _formatTimeLeft(expiresAt){
    const ms=Math.max(0, expiresAt-Date.now());
    if(ms<=0) return "Expirado";
    const h=Math.floor(ms/3600000);
    const m=Math.floor((ms%3600000)/60000);
    if(h>0) return `Restam ${h}h ${m}m`;
    if(m>0) return `Restam ${m} min`;
    return "Expira em instantes";
  }

  async copyText(txt){
    try{
      await navigator.clipboard.writeText(txt);
      U.toast("Copiado ✅","ok");
    }catch{
      U.toast("Não foi possível copiar.","bad");
    }
  }

  async copyCode(){
    const code = document.getElementById("codeValue")?.textContent || "";
    if(!code || code.includes("…")) return U.toast("Gere um código primeiro.","warn");
    await this.copyText(code);
  }

  async share(){
    const code = document.getElementById("codeValue")?.textContent || "";
    if(!code || code.includes("…")) return U.toast("Gere um código primeiro.","warn");
    const text=`Meu código do Clube de Benefícios Oficial: ${code}`;
    try{
      if(navigator.share){
        await navigator.share({title:"Clube de Benefícios", text});
        U.toast("Compartilhado.","ok");
      }else{
        await this.copyText(text);
        U.toast("Copiamos a mensagem para você colar.","ok");
      }
    }catch{
      U.toast("Compartilhamento cancelado.","warn");
    }
  }

  /* ---------------------------
     Wire UI
     --------------------------- */
  wireUI(){
    document.body.addEventListener("click",(e)=>this.onClick(e));
    document.body.addEventListener("input",(e)=>this.onInput(e),{passive:true});
    document.body.addEventListener("keydown",(e)=>this.onKey(e));

    const secret=document.getElementById("secretEmoji");
    const tap=()=>this.secretTap();
    secret.addEventListener("click", tap, {passive:true});
    secret.addEventListener("keydown",(ev)=>{
      if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); tap(); }
    });

    this.debouncedPhoneMask = U.debounce((digits)=>{
      const input=document.getElementById("telefone");
      if(input) input.value = U.maskPhone(digits);
    }, 18);
    this.debouncedRenderRecent = U.debounce(()=> this.renderRecent(), 400);
  }

  onKey(e){
    const id=e.target?.id;
    if(id==="telefone" && e.key==="Enter") this.generate();
    if(id==="nome" && e.key==="Enter") document.getElementById("telefone")?.focus();
    if(this.admin.open && e.key==="Escape") this.adminClose();
    if(this.admin.open && e.key==="Enter" && document.activeElement?.id==="admPass") this.adminLogin();
  }

  onInput(e){
    const t=e.target;
    if(!t) return;
    if(t.id==="telefone"){
      this.debouncedPhoneMask(U.onlyDigits(t.value));
      this.debouncedRenderRecent();
    }
    if(t.id==="admSearch") this.debouncedAdminSearch(t.value);
  }

  async onClick(e){
    const t=e.target;
    if(!t) return;

    const pick = t.closest?.("[data-pick]");
    if(pick){
      this.pickOffer(pick.getAttribute("data-pick"));
      return;
    }

    if(t.id==="btnGerar") return this.generate();
    if(t.id==="btnCopy") return this.copyCode();
    if(t.id==="btnShare") return this.share();
    if(t.id==="btnApplyTheme") return this.applyThemeFromUI();

    // Admin actions (na PARTE 5)
  }

  /* =========================
     Admin: 7 toques no ícone 🎁 abre o painel de login
     ========================= */
  secretTap(){
    const now=performance.now();
    this.tapTimes = this.tapTimes.filter(x=>now-x<1200);
    this.tapTimes.push(now);
    if(this.tapTimes.length>=7){
      this.tapTimes=[];
      U.toast("Acesso restrito…","ok");
      this.openAdminStealth();
    }
  }

  /* Senhas padrão: admin = "Admin123", gerente = "gerente123".
     Verificadores ficam em IndexedDB (meta "roleVerifiers"). */
  async ensureAuthSetup(){
    const stored = await this.m.getMeta("roleVerifiers");
    if(stored && stored.admin && stored.gerente){
      this.admin.storedVerifiers = stored;
      return;
    }
    const adminV = await CryptoAuth.deriveVerifier("Admin123");
    const gerenteV = await CryptoAuth.deriveVerifier("gerente123");
    const roleVerifiers = { admin: adminV, gerente: gerenteV };
    await this.m.setMeta("roleVerifiers", roleVerifiers);
    this.admin.storedVerifiers = roleVerifiers;
    await this.m.setMeta("gerenteNeedsSetup", true);
  }

  async loadRateLimit(){
    try{
      const raw=localStorage.getItem("_cbo_role_rate_v5");
      if(raw){
        const o=JSON.parse(raw);
        this.admin.lock.admin=o.admin||{f:0,l:0};
        this.admin.lock.gerente=o.gerente||{f:0,l:0};
      }
    }catch{}
  }
  saveRateLimit(){
    try{ localStorage.setItem("_cbo_role_rate_v5", JSON.stringify(this.admin.lock)); }catch{}
  }
  isLocked(_role){ return false; }
  lockMsg(_role){ return "OK"; }
  bumpFail(_role){}

  sessionOk(){ return this.admin.role && Date.now() < this.admin.sessionUntil; }
}

/* ============================================================
   Admin modal (rolagem correta) + painel
   ============================================================ */
Controller.prototype.openAdminStealth = function(){
  if(this.admin.open){ this.adminFocus(); return; }
  this.admin.open=true;
  document.body.classList.add("locked");

  const modal=document.createElement("div");
  modal.id="admModal";
  modal.setAttribute("role","dialog");
  modal.setAttribute("aria-modal","true");
  modal.setAttribute("aria-label","Área restrita");

  const box=document.createElement("div");
  box.id="admBox";

  box.innerHTML = `
    <div class="admTopBar">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <strong style="font-size:14px;">Painel Restrito</strong>
        <span class="pill" style="border-color: var(--admLine);">Stealth</span>
        <span id="admRoleBadge" class="pill" style="display:none; border-color: var(--admLine);"></span>
      </div>
      <button id="admClose" class="secondary" type="button" style="width:auto; min-width:120px; min-height:44px;">Fechar</button>
    </div>

    <div id="admScroll">
      <div id="admLoginArea" style="display:grid; gap:10px;">
        <div class="tiny">Faça login para carregar o painel.</div>
        <label for="admPass">Senha</label>
        <input id="admPass" type="password" autocomplete="current-password" placeholder="••••••••" />
        <button id="admLoginBtn" type="button" style="background: linear-gradient(135deg, var(--admAccent), var(--admAccent2));">
          🔐 Autenticar
        </button>
        <div class="tiny" id="admLockInfo"></div>
        <div class="tiny" style="opacity:.9;">Admin = funcionário • Gerente = dono (mais permissões).</div>
      </div>

      <div id="admPanelMount"></div>
    </div>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);

  const info=document.getElementById("admLockInfo");
  info.textContent = `Admin: ${this.lockMsg("admin")} • Gerente: ${this.lockMsg("gerente")}`;

  modal.addEventListener("keydown",(ev)=>{
    if(ev.key==="Escape") this.adminClose();
  });

  this.adminFocus();

  // click handlers do admin
  modal.addEventListener("click",(e)=>{
    const t=e.target;
    if(!t) return;

    if(t.id==="admClose") return this.adminClose();
    if(t.id==="admLoginBtn") return this.adminLogin();
    if(t.id==="admLogout") return this.adminLogout();
    if(t.id==="admRefresh") return this.adminRefresh();
    if(t.id==="admPrev") return this.adminPage(-1);
    if(t.id==="admNext") return this.adminPage(1);
    if(t.id==="admExport") return this.adminExportCSV();
    if(t.id==="admClear") return this.adminClearAll();
    if(t.id==="admSaveCampaign") return this.adminSaveCampaign();
    if(t.id==="admSaveOffers") return this.adminSaveOffersFromUI();
    if(t.id==="admAddOffer") return this.adminAddOfferRow();
    if(t.id==="admChangeGerentePass") return this.adminChangeGerentePass();

    const tab = t.closest?.("[data-adm-tab]");
    if(tab) return this.adminSwitchTab(tab.getAttribute("data-adm-tab"));

    const del = t.closest?.("[data-del]");
    if(del) return this.adminDeleteOne(del.getAttribute("data-del"));

    const delOffer = t.closest?.("[data-del-offer]");
    if(delOffer) return this.adminDeleteOfferRow(delOffer.getAttribute("data-del-offer"));
  });

  // input debounce search
  this.debouncedAdminSearch = U.debounce((val)=>{
    this.admin.q = val || "";
    this.admin.page = 0;
    this.adminRenderPage();
  }, 90);
};

Controller.prototype.adminFocus = function(){
  document.getElementById("admPass")?.focus();
};

Controller.prototype.adminClose = function(){
  document.getElementById("admModal")?.remove();
  document.body.classList.remove("locked");
  this.admin.open=false;
  this.admin.role=null;
  this.admin.sessionUntil=0;
};

Controller.prototype.adminLogin = async function(){
  const passEl=document.getElementById("admPass");
  const loginArea=document.getElementById("admLoginArea");
  const mount=document.getElementById("admPanelMount");
  if(!passEl||!loginArea||!mount) return;

  const pass=passEl.value||"";
  if(!pass){ U.toast("Digite a senha.","warn"); passEl.focus(); return; }

  const stored = await this.m.getMeta("roleVerifiers");
  if(stored?.admin && stored?.gerente) this.admin.storedVerifiers = stored;

  const role = await CryptoAuth.verifyRole(pass, this.admin.storedVerifiers);
  if(!role){
    U.toast("Senha incorreta.","bad");
    document.getElementById("admLockInfo").textContent = `Admin: ${this.lockMsg("admin")} • Gerente: ${this.lockMsg("gerente")}`;
    return;
  }

  this.admin.role = role;
  this.admin.sessionUntil = Date.now() + CFG.sessionMs;
  await this.m.logAdminAccess(role);

  const badge=document.getElementById("admRoleBadge");
  badge.style.display="inline-flex";
  badge.textContent = role==="gerente" ? "Gerente (Dono)" : "Admin (Funcionário)";

  loginArea.style.display="none";
  mount.innerHTML="";
  mount.appendChild(await this.buildAdminPanel(role));

  U.toast("Acesso autorizado.","ok");
  this.admin.page=0;
  this.admin.q="";
  await this.adminRefresh();
};

Controller.prototype.adminLogout = function(){
  U.toast("Sessão encerrada.","ok");
  this.admin.role=null;
  this.admin.sessionUntil=0;

  const mount=document.getElementById("admPanelMount");
  if(mount) mount.innerHTML="";
  const badge=document.getElementById("admRoleBadge");
  if(badge){ badge.style.display="none"; badge.textContent=""; }
  const login=document.getElementById("admLoginArea");
  if(login) login.style.display="grid";
  this.adminFocus();
};

Controller.prototype.buildAdminPanel = async function(role){
  const wrap=document.createElement("div");
  wrap.id="admPanel";
  wrap.style.display="grid";
  wrap.style.gap="12px";

  const tabs = [
    {id:"registros", label:"Registros", badge:"📋"},
    {id:"log", label:"Log", badge:"🕵️"},
  ];
  if(role==="gerente"){
    tabs.unshift({id:"ofertas", label:"Ofertas", badge:"🧾"});
    tabs.unshift({id:"campanha", label:"Campanha", badge:"⚙️"});
  }

  wrap.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
      <div class="admTabs">
        ${tabs.map((t,i)=>`
          <button class="secondary" data-adm-tab="${U.esc(t.id)}" type="button"
                  aria-selected="${i===0?"true":"false"}"
                  style="width:auto; min-height:40px; padding:10px 12px; border-radius:999px;">
            <span aria-hidden="true">${t.badge}</span> ${U.esc(t.label)}
          </button>
        `).join("")}
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <button id="admRefresh" class="ghost" type="button" style="width:auto; min-width:130px;">Atualizar</button>
        <button id="admExport" class="ghost" type="button" style="width:auto; min-width:150px;">Exportar CSV</button>
        <button id="admLogout" class="secondary" type="button" style="width:auto; min-width:120px;">Sair</button>
      </div>
    </div>

    ${role==="gerente" ? `
    <div id="admTab_campanha" style="display:grid; gap:12px;">
      <div class="codeCard">
        <strong style="font-size:14px;">Campanha (Gerente)</strong>
        <div class="tiny">Validade, regras e missão bônus.</div>

        <div class="admGrid2" style="margin-top:10px;">
          <div>
            <label for="admTTL">Validade (min)</label>
            <input id="admTTL" inputmode="numeric" placeholder="Ex: 120" />
          </div>
          <div>
            <label for="admAntiDup">Anti-duplicidade</label>
            <select id="admAntiDup">
              <option value="true">Ativo</option>
              <option value="false">Desativado</option>
            </select>
          </div>
        </div>

        <div style="margin-top:10px;">
          <label for="admTerms">Termos</label>
          <textarea id="admTerms"></textarea>
        </div>

        <div style="margin-top:10px;">
          <label for="admMission">Missão bônus (pós-resgate)</label>
          <textarea id="admMission"></textarea>
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px; flex-wrap:wrap;">
          <button id="admSaveCampaign" type="button" style="width:auto; min-width:180px;">Salvar campanha</button>
        </div>
      </div>

      <div class="codeCard">
        <strong style="font-size:14px;">Segurança</strong>
        <div class="tiny">Trocar senha do gerente (recomendado no primeiro uso).</div>

        <div style="margin-top:10px;">
          <label for="newGerPass1">Nova senha do gerente</label>
          <input id="newGerPass1" type="password" />
        </div>
        <div style="margin-top:10px;">
          <label for="newGerPass2">Confirmar senha</label>
          <input id="newGerPass2" type="password" />
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px; flex-wrap:wrap;">
          <button id="admChangeGerentePass" type="button" style="width:auto; min-width:240px;">Salvar nova senha</button>
        </div>

        <div class="tiny" id="gerSetupHint" style="margin-top:10px;"></div>
      </div>
    </div>

    <div id="admTab_ofertas" style="display:none; gap:12px;">
      <div class="codeCard">
        <strong style="font-size:14px;">Ofertas (Gerente)</strong>
        <div class="tiny">Você pode ter várias ofertas ao mesmo tempo. Usuário escolhe a melhor.</div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:space-between; margin-top:10px;">
          <button id="admAddOffer" class="secondary" type="button" style="width:auto; min-width:200px;">+ Nova oferta</button>
          <button id="admSaveOffers" type="button" style="width:auto; min-width:220px;">Salvar ofertas</button>
        </div>

        <div id="admOffersWrap" style="display:grid; gap:10px; margin-top:12px;"></div>

        <div class="tiny" style="margin-top:10px;">
          Formato: <span class="kbd">DD/MM/AAAA HH:MM</span> (padrão Brasil)
        </div>
      </div>
    </div>
    ` : ""}

    <div id="admTab_registros" style="display:${role==="gerente"?"none":"grid"}; gap:12px;">
      <div class="codeCard" style="margin:0;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <strong style="font-size:14px;">Registros</strong>
            <span class="pill">Página <span id="admPage">1</span></span>
            <span class="pill">Total <span id="admTotal">0</span></span>
          </div>
          <input id="admSearch" placeholder="Buscar (nome/telefone/código/oferta)…"
                 style="min-width:min(540px,100%);" />
        </div>
      </div>

      <div class="admTableWrap">
        <table style="width:100%; border-collapse: collapse; min-width: 860px;">
          <thead>
            <tr>
              <th style="position:sticky; top:0; background: rgba(0,0,0,.28); color: var(--muted); font-size:12px; padding:10px;">Oferta</th>
              <th style="position:sticky; top:0; background: rgba(0,0,0,.28); color: var(--muted); font-size:12px; padding:10px;">Nome</th>
              <th style="position:sticky; top:0; background: rgba(0,0,0,.28); color: var(--muted); font-size:12px; padding:10px;">WhatsApp</th>
              <th style="position:sticky; top:0; background: rgba(0,0,0,.28); color: var(--muted); font-size:12px; padding:10px;">Código</th>
              <th style="position:sticky; top:0; background: rgba(0,0,0,.28); color: var(--muted); font-size:12px; padding:10px;">Criado</th>
              <th style="position:sticky; top:0; background: rgba(0,0,0,.28); color: var(--muted); font-size:12px; padding:10px;">Expira</th>
              <th style="position:sticky; top:0; background: rgba(0,0,0,.28); color: var(--muted); font-size:12px; padding:10px;">Ações</th>
            </tr>
          </thead>
          <tbody id="admTbody"></tbody>
        </table>
      </div>

      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <button id="admPrev" class="secondary" type="button" style="width:auto; min-width:140px;">◀ Página</button>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="admClear" class="danger" type="button" style="width:auto; min-width:160px;">Limpar tudo</button>
          <button id="admNext" class="secondary" type="button" style="width:auto; min-width:140px;">Página ▶</button>
        </div>
      </div>
    </div>

    <div id="admTab_log" style="display:none; gap:12px;">
      <div class="codeCard">
        <strong style="font-size:14px;">Log</strong>
        <div id="admLogList" class="tiny"></div>
        <div class="tiny" style="margin-top:10px;">Último acesso: <span class="kbd" id="admLastAccess">—</span> • Papel: <span class="kbd" id="admLastRole">—</span></div>
      </div>
    </div>
  `;

  return wrap;
};

Controller.prototype.adminSwitchTab = function(tabId){
  if(!this.sessionOk()) return U.toast("Sessão expirada. Faça login.","warn");
  this.admin.sessionUntil = Date.now() + CFG.sessionMs;

  const all=["campanha","ofertas","registros","log"];
  for(const id of all){
    const el=document.getElementById("admTab_"+id);
    if(el) el.style.display = (id===tabId) ? "grid" : "none";
  }
};

Controller.prototype.adminRefresh = async function(){
  if(!this.sessionOk()) return U.toast("Sessão expirada.","warn");
  this.admin.sessionUntil = Date.now() + CFG.sessionMs;

  // logs
  const last = await this.m.getMeta("lastAdminAccess");
  const lastRole = await this.m.getMeta("lastAdminRole");
  const lastEl=document.getElementById("admLastAccess");
  const roleEl=document.getElementById("admLastRole");
  if(lastEl) lastEl.textContent = last ? U.fmtDateTimeBR(last) : "—";
  if(roleEl) roleEl.textContent = lastRole || "—";

  const logList=document.getElementById("admLogList");
  if(logList){
    const logs=await this.m.listAdminLog(15);
    logList.innerHTML = logs.length
      ? logs.map(l=>`• ${U.fmtDateTimeBR(l.ts)} (${U.esc(l.role||"—")})`).join("<br>")
      : "Sem logs ainda.";
  }

  await this.adminRenderPage();

  if(this.admin.role==="gerente"){
    // campanha
    const camp = await this.m.getCampaign();
    const needs = await this.m.getMeta("gerenteNeedsSetup");

    const ttlEl=document.getElementById("admTTL");
    const anti=document.getElementById("admAntiDup");
    const terms=document.getElementById("admTerms");
    const mission=document.getElementById("admMission");

    if(ttlEl) ttlEl.value=String(Math.max(1, Math.round((camp.ttlMs|0)/60000)));
    if(anti) anti.value=String(!!camp.antiDup);
    if(terms) terms.value=camp.termsText||"";
    if(mission) mission.value=camp.missionText||"";

    const hint = document.getElementById("gerSetupHint");
    if(hint){
      hint.textContent = needs ? "Recomendação: troque a senha do gerente agora (primeiro uso)." : "Senha do gerente já foi configurada.";
    }

    await this.adminRenderOffersUI();
  }
};

Controller.prototype.adminPage = async function(dir){
  if(!this.sessionOk()) return U.toast("Sessão expirada.","warn");
  this.admin.page=Math.max(0,(this.admin.page|0)+dir);
  await this.adminRenderPage();
};

Controller.prototype.adminRenderPage = async function(){
  const tbody=document.getElementById("admTbody");
  const totalEl=document.getElementById("admTotal");
  const pageEl=document.getElementById("admPage");
  if(!tbody||!totalEl||!pageEl) return;

  const {total, slice, fromServer}=await this.m.adminQuery(this.admin.q, this.admin.page, this.admin.pageSize);
  this.admin.usesServer = !!fromServer;
  totalEl.textContent=String(total);
  pageEl.textContent=String(this.admin.page+1);

  tbody.innerHTML="";
  if(!slice.length){
    tbody.innerHTML = `<tr><td colspan="7" style="padding:12px; color: var(--muted);">Sem resultados.</td></tr>`;
    return;
  }

  const frag=document.createDocumentFragment();
  for(const r of slice){
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td style="padding:10px; border-top:1px solid var(--line);">${U.esc(r.offerTitle||"—")}</td>
      <td style="padding:10px; border-top:1px solid var(--line);">${U.esc(r.name)}</td>
      <td style="padding:10px; border-top:1px solid var(--line);">${U.esc(this.prettyBR(r.phone))}</td>
      <td style="padding:10px; border-top:1px solid var(--line);"><span class="kbd">${U.esc(r.code)}</span></td>
      <td style="padding:10px; border-top:1px solid var(--line); color:var(--muted)">${U.fmtDateTimeBR(r.createdAt)}</td>
      <td style="padding:10px; border-top:1px solid var(--line); color:var(--muted)">${U.fmtDateTimeBR(r.expiresAt)}</td>
      <td style="padding:10px; border-top:1px solid var(--line);">
        <button class="danger" data-del="${U.esc(r.id)}" type="button" style="width:auto; min-height:38px; padding:8px 10px;">Deletar</button>
      </td>
    `;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
};

Controller.prototype.adminDeleteOne = async function(id){
  if(!this.sessionOk()) return U.toast("Sessão expirada.","warn");
  if(!id) return;
  if(!confirm("Deletar este registro?")) return;

  if(this.admin.usesServer){
    const base = CFG.apiBase || "/api";
    if(!navigator.onLine) return U.toast("Precisa estar online para excluir registro do servidor.","warn");
    try{
      const res = await fetch(base + "/redemptions/" + encodeURIComponent(id) + "/", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-CSRFToken": this.getCsrfToken() },
      });
      if(!res.ok){
        const err = await res.json().catch(()=>({}));
        return U.toast(err.error || "Erro ao excluir registro no servidor.","bad");
      }
      U.toast("Registro excluído.","ok");
      await this.adminRefresh();
    }catch(_){
      U.toast("Não foi possível excluir registro no servidor.","bad");
    }
    return;
  }

  await this.m.deleteRecord(id);
  U.toast("Registro deletado.","ok");
  await this.adminRefresh();
};

Controller.prototype.adminClearAll = async function(){
  if(!this.sessionOk()) return U.toast("Sessão expirada.","warn");
  if(!confirm("Apagar TODOS os registros?")) return;

  if(this.admin.usesServer){
    const base = CFG.apiBase || "/api";
    if(!navigator.onLine) return U.toast("Precisa estar online para limpar registros do servidor.","warn");
    try{
      const res = await fetch(base + "/redemptions/clear/", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-CSRFToken": this.getCsrfToken() },
      });
      if(!res.ok){
        const err = await res.json().catch(()=>({}));
        return U.toast(err.error || "Erro ao limpar registros no servidor.","bad");
      }
      const data = await res.json().catch(()=>({}));
      U.toast(data.deleted ? `${data.deleted} registro(s) removido(s).` : "Registros limpos.","ok");
      await this.adminRefresh();
    }catch(_){
      U.toast("Não foi possível limpar registros no servidor.","bad");
    }
    return;
  }

  await this.m.clearAll();
  U.toast("Banco limpo.","ok");
  await this.adminRefresh();
};

Controller.prototype.adminExportCSV = async function(){
  if(!this.sessionOk()) return U.toast("Sessão expirada.","warn");
  const {total, slice}=await this.m.adminQuery(this.admin.q, 0, 1000000);
  if(!total){ U.toast("Nada para exportar.","warn"); return; }

  const rows=["Oferta,Nome,WhatsApp,Codigo,Tag,CriadoEm,ExpiraEm"];
  for(const r of slice){
    rows.push([
      csv(r.offerTitle), csv(r.name), csv(this.prettyBR(r.phone)), csv(r.code), csv(r.tag),
      csv(U.fmtDateTimeBR(r.createdAt)),
      csv(U.fmtDateTimeBR(r.expiresAt)),
    ].join(","));
  }
  const bom="\uFEFF";
  const blob=new Blob([bom+rows.join("\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download="clube_beneficios_registros.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);

  function csv(v){
    const s=String(v??"").replace(/"/g,'""');
    return `"${s}"`;
  }
};

Controller.prototype.adminSaveCampaign = async function(){
  if(!this.sessionOk()) return U.toast("Sessão expirada.","warn");
  if(this.admin.role!=="gerente") return U.toast("Somente o Gerente pode editar campanha.","warn");

  const ttlMin=Number(U.onlyDigits(document.getElementById("admTTL").value));
  const anti=document.getElementById("admAntiDup").value==="true";
  const terms=document.getElementById("admTerms").value||"";
  const mission=document.getElementById("admMission").value||"";

  if(!ttlMin || ttlMin<1 || ttlMin>1440) return U.toast("Validade inválida (1 a 1440).","bad");

  const camp={ ttlMs: ttlMin*60000, antiDup: anti, termsText: terms.slice(0,1400), missionText: mission.slice(0,900) };

  // Atualiza no servidor (API) quando online
  const base = CFG.apiBase || "/api";
  if (navigator.onLine) {
    try{
      const res = await fetch(base + "/campaign/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": this.getCsrfToken(),
        },
        body: JSON.stringify({
          ttl_minutes: ttlMin,
          anti_duplicate: anti,
          terms_text: camp.termsText,
          mission_text: camp.missionText,
        }),
      });
      if(!res.ok){
        U.toast("Erro ao salvar campanha no servidor.","bad");
      }
    }catch(_){
      U.toast("Não foi possível falar com o servidor. Campanha só atualizada localmente.","warn");
    }
  }

  // Mantém cópia local para modo offline
  await this.m.setCampaign(camp);
  await this.syncFromServer();
  await this.renderTermsPreview();
  await this.renderMission();
  U.toast("Campanha salva.","ok");
};

Controller.prototype.parseDT = function(s){
  const raw=(s||"").trim();
  if(!raw) return 0;
  const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(brMatch){
    const [, day, month, year, h=0, m=0] = brMatch.map(n=>parseInt(n,10)||0);
    const d = new Date(year, month - 1, day, h, m, 0, 0);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(iso);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/* --------- Ofertas (CRUD UI) --------- */
Controller.prototype.adminRenderOffersUI = async function(){
  const wrap=document.getElementById("admOffersWrap");
  if(!wrap) return;
  let offers = [];

  // Busca ofertas diretamente do servidor para CRUD do gerente/admin
  if (navigator.onLine) {
    try{
      const base = CFG.apiBase || "/api";
      const res = await fetch(base + "/offers/manage/", { credentials: "same-origin" });
      if(res.ok){
        const data = await res.json();
        const raw = data.offers || [];
        offers = raw.map(o => ({
          id: String(o.id),
          enabled: !!o.enabled,
          title: o.title || "",
          description: o.description || "",
          startAt: this.parseDT(o.start_at),
          endAt: this.parseDT(o.end_at),
          tag: o.tag || "OFERTA",
          ctaText: o.cta_text || "",
          ctaUrl: o.cta_url || "",
        }));
      }
    }catch(_){
      U.toast("Não foi possível carregar ofertas do servidor. Exibindo dados locais.","warn");
    }
  }

  // Fallback para dados locais (modo offline)
  if (!offers.length) {
    offers = await this.m.getOffers();
  }

  wrap.innerHTML="";

  offers.forEach((o, idx)=>{
    const row=document.createElement("div");
    row.className="codeCard";
    row.dataset.offerRow = o.id;

    row.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <strong style="font-size:14px;">Oferta ${idx+1}</strong>
        <button class="danger" type="button" data-del-offer="${U.esc(o.id)}" style="width:auto; min-width:150px;">Remover</button>
      </div>

      <div class="admGrid2">
        <div>
          <label>Ativa</label>
          <select data-k="enabled">
            <option value="true"${o.enabled?" selected":""}>Sim</option>
            <option value="false"${!o.enabled?" selected":""}>Não</option>
          </select>
        </div>
        <div>
          <label>Tag (curta)</label>
          <input data-k="tag" value="${U.esc(o.tag||"OFERTA")}" placeholder="VIP / COMBO / ..." />
        </div>
      </div>

      <div>
        <label>Título</label>
        <input data-k="title" value="${U.esc(o.title||"")}" />
      </div>

      <div>
        <label>Descrição</label>
        <textarea data-k="description">${U.esc(o.description||"")}</textarea>
      </div>

      <div class="admGrid2">
        <div>
          <label>Início (DD/MM/AAAA HH:MM)</label>
          <input data-k="startAt" value="${U.esc(this.dtToInput(o.startAt))}" placeholder="25/02/2026 18:00" />
        </div>
        <div>
          <label>Fim (DD/MM/AAAA HH:MM)</label>
          <input data-k="endAt" value="${U.esc(this.dtToInput(o.endAt))}" placeholder="25/02/2026 20:00" />
        </div>
      </div>

      <div class="admGrid2">
        <div>
          <label>CTA texto (opcional)</label>
          <input data-k="ctaText" value="${U.esc(o.ctaText||"")}" placeholder="Ver cardápio" />
        </div>
        <div>
          <label>CTA URL (opcional)</label>
          <input data-k="ctaUrl" value="${U.esc(o.ctaUrl||"")}" placeholder="https://..." />
        </div>
      </div>
    `;
    wrap.appendChild(row);
  });
};

Controller.prototype.dtToInput = function(ms){
  if(!ms) return "";
  const d = new Date(ms);
  const pad=(n)=>String(n).padStart(2,"0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

Controller.prototype.adminAddOfferRow = async function(){
  if(!this.sessionOk()) return U.toast("Sessão expirada.","warn");
  if(this.admin.role!=="gerente") return U.toast("Somente gerente.","warn");

  const base = CFG.apiBase || "/api";
  if(!navigator.onLine){
    return U.toast("Precisa estar online para criar oferta no servidor.","warn");
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + 2*60*60*1000);
  const pad = (n)=> String(n).padStart(2,"0");
  const toLocalIso = (d)=> `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startIso = toLocalIso(now);
  const endIso = toLocalIso(endDate);

  try{
    const res = await fetch(base + "/offers/manage/create/", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": this.getCsrfToken(),
      },
      body: JSON.stringify({
        title: "Nova oferta",
        description: "Descreva o benefício aqui.",
        enabled: true,
        tag: "OFERTA",
        start_at: startIso,
        end_at: endIso,
        cta_text: "",
        cta_url: "",
      }),
    });
    if(!res.ok){
      return U.toast("Erro ao criar oferta no servidor.","bad");
    }
    await this.syncFromServer();
    await this.adminRenderOffersUI();
    await this.renderOffers();
    U.toast("Oferta adicionada no servidor.","ok");
  }catch(_){
    U.toast("Não foi possível criar oferta no servidor.","bad");
  }
};

Controller.prototype.adminDeleteOfferRow = async function(offerId){
  if(!this.sessionOk()) return U.toast("Sessão expirada.","warn");
  if(this.admin.role!=="gerente") return U.toast("Somente gerente.","warn");
  if(!confirm("Remover esta oferta?")) return;

  const base = CFG.apiBase || "/api";
  if(!navigator.onLine){
    const offers = await this.m.getOffers();
    const next = offers.filter(o => String(o.id) !== String(offerId));
    if(next.length === offers.length) return U.toast("Oferta não encontrada localmente.","warn");
    await this.m.setOffers(next);
    await this.adminRenderOffersUI();
    await this.renderOffers();
    U.toast("Oferta removida (lista local).","ok");
    return;
  }

  try{
    const res = await fetch(base + `/offers/manage/${encodeURIComponent(offerId)}/`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "X-CSRFToken": this.getCsrfToken() },
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({}));
      return U.toast(err.error || "Erro ao remover oferta no servidor.","bad");
    }
    await this.syncFromServer();
    await this.adminRenderOffersUI();
    await this.renderOffers();
    U.toast("Oferta removida.","ok");
  }catch(_){
    U.toast("Não foi possível remover oferta no servidor.","bad");
  }
};

Controller.prototype.adminSaveOffersFromUI = async function(){
  if(!this.sessionOk()) return U.toast("Sessão expirada.","warn");
  if(this.admin.role!=="gerente") return U.toast("Somente gerente.","warn");

  const wrap=document.getElementById("admOffersWrap");
  if(!wrap) return;

  const rows = Array.from(wrap.querySelectorAll("[data-offer-row]"));
  const base = CFG.apiBase || "/api";
  if(!navigator.onLine){
    return U.toast("Precisa estar online para salvar ofertas no servidor.","warn");
  }

  const updates = [];

  for(const row of rows){
    const id = row.getAttribute("data-offer-row");
    const get=(k)=> row.querySelector(`[data-k="${k}"]`)?.value ?? "";

    const enabled = get("enabled")==="true";
    const title = String(get("title")).slice(0,70).trim();
    const description = String(get("description")).slice(0,500).trim();
    const tag = String(get("tag")||"OFERTA").slice(0,10).trim();

    const startAtMs = this.parseDT(get("startAt"));
    const endAtMs = this.parseDT(get("endAt"));

    const ctaText = String(get("ctaText")).slice(0,40).trim();
    const ctaUrl = String(get("ctaUrl")).slice(0,300).trim();

    if(enabled){
      if(!title) return U.toast("Oferta ativa precisa de título.","bad");
      if(!startAtMs || !endAtMs || endAtMs<=startAtMs) return U.toast("Datas inválidas em uma oferta ativa.","bad");
    }

    const toIso = (ms)=> {
      if(!ms) return null;
      const d = new Date(ms);
      const pad = (n)=> String(n).padStart(2,"0");
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    updates.push({
      id,
      payload: {
        enabled,
        title,
        description,
        tag,
        start_at: toIso(startAtMs),
        end_at: toIso(endAtMs),
        cta_text: ctaText,
        cta_url: ctaUrl,
      },
    });
  }

  try{
    await Promise.all(updates.map(u =>
      fetch(base + `/offers/manage/${u.id}/`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": this.getCsrfToken(),
        },
        body: JSON.stringify(u.payload),
      })
    ));
    await this.syncFromServer();
    await this.adminRenderOffersUI();
    await this.renderOffers();
    U.toast("Ofertas salvas no servidor.","ok");
  }catch(_){
    U.toast("Erro ao salvar ofertas no servidor.","bad");
  }
};

Controller.prototype.adminChangeGerentePass = async function(){
  if(!this.sessionOk()) return U.toast("Sessão expirada.","warn");
  if(this.admin.role!=="gerente") return U.toast("Somente o Gerente pode trocar a senha.","warn");

  const p1 = document.getElementById("newGerPass1").value || "";
  const p2 = document.getElementById("newGerPass2").value || "";
  if(p1.length < 6) return U.toast("Senha muito curta (mín 6).","bad");
  if(p1 !== p2) return U.toast("As senhas não batem.","bad");

  const v = await CryptoAuth.deriveVerifier(p1);
  const stored = await this.m.getMeta("roleVerifiers");
  const next = { admin: stored.admin, gerente: v };

  await this.m.setMeta("roleVerifiers", next);
  await this.m.setMeta("gerenteNeedsSetup", false);
  this.admin.storedVerifiers = next;

  document.getElementById("newGerPass1").value="";
  document.getElementById("newGerPass2").value="";
  const hint = document.getElementById("gerSetupHint");
  if(hint) hint.textContent = "Senha do gerente atualizada ✅";

  U.toast("Senha do gerente salva.","ok");
};

/* ============================================================
   Conectar botões do user para admin + ofertas
   ============================================================ */
(function patchUserClicks(){
  const orig = Controller.prototype.onClick;
  Controller.prototype.onClick = async function(e){
    const t=e.target;
    if(!t) return orig.call(this,e);

    // pick oferta
    const pick = t.closest?.("[data-pick]");
    if(pick){
      this.pickOffer(pick.getAttribute("data-pick"));
      return;
    }

    // user buttons
    if(t.id==="btnGerar") return this.generate();
    if(t.id==="btnCopy") return this.copyCode();
    if(t.id==="btnShare") return this.share();
    if(t.id==="btnApplyTheme") return this.applyThemeFromUI();

    return orig.call(this,e);
  };
})();

/* ============================================================
   BOOT
   ============================================================ */
window.addEventListener("DOMContentLoaded", async ()=>{
  const model=new Model();
  const app=new Controller(model);
  await app.init();
});