/* ============================================================
   Toast (Web Component)
   ============================================================ */
class CBToast extends HTMLElement{
  constructor(){
    super();
    this.attachShadow({mode:"open"});
    this.shadowRoot.innerHTML = `
      <style>
        :host{
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          bottom: calc(14px + env(safe-area-inset-bottom));
          z-index: 9999;
          display: grid;
          gap: 8px;
          pointer-events: none;
          width: min(92vw, 720px);
        }
        .t{
          pointer-events:auto;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(0,0,0,.35);
          border: 1px solid rgba(255,255,255,.16);
          color: #f8fafc;
          font: 800 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          box-shadow: 0 10px 36px rgba(0,0,0,.35);
          backdrop-filter: blur(10px);
          opacity: 0;
          transform: translateY(10px);
          transition: opacity .18s ease, transform .18s ease;
        }
        @media (prefers-color-scheme: light){
          .t{ background: rgba(255,255,255,.92); color:#0b1220; border-color: rgba(15,23,42,.12); }
        }
        .t.show{ opacity:1; transform: translateY(0); }
        .ok{ border-color: rgba(65,209,143,.35); }
        .bad{ border-color: rgba(255,92,92,.40); }
        .warn{ border-color: rgba(255,209,102,.45); }
      </style>
      <div id="host"></div>
    `;
  }
  show(msg, type="ok"){
    const host = this.shadowRoot.getElementById("host");
    const el = document.createElement("div");
    el.className = `t ${type}`;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(()=> el.classList.add("show"));
    setTimeout(()=>{
      el.classList.remove("show");
      setTimeout(()=> el.remove(), 220);
    }, 2800);
  }
}
customElements.define("cbo-toast", CBToast);
