/* ============================================================
   QR engine (compacto)
   ============================================================ */
const QR = (() => {
  function make(text){
    const bytes = new TextEncoder().encode(text);
    const ver = bytes.length <= 14 ? 1 : bytes.length <= 26 ? 2 : bytes.length <= 42 ? 3 : 4;
    const size = 17 + 4*ver;
    const m = Array.from({length:size},()=>Array(size).fill(null));

    placeFinder(m, 0,0);
    placeFinder(m, size-7,0);
    placeFinder(m, 0,size-7);
    placeTiming(m);
    reserveFormat(m);

    const bits = [];
    pushBits(bits, 0b0100, 4);
    pushBits(bits, bytes.length, ver < 10 ? 8 : 16);
    for (const b of bytes) pushBits(bits, b, 8);
    pushBits(bits, 0, 4);
    while (bits.length % 8) bits.push(0);

    const capBytes = ({1:19,2:34,3:55,4:80})[ver];
    const dataBytes = [];
    for (let i=0;i<bits.length;i+=8) dataBytes.push(parseInt(bits.slice(i,i+8).join(""),2));
    const pad = [0xEC,0x11];
    let pi=0;
    while (dataBytes.length < capBytes) dataBytes.push(pad[pi++%2]);

    const eccLen = ({1:7,2:10,3:15,4:20})[ver];
    const ecc = simpleECC(dataBytes, eccLen);
    const finalBytes = dataBytes.concat(ecc);

    const stream = [];
    for (const b of finalBytes) pushBits(stream, b, 8);
    placeData(m, stream);

    let bestScore=Infinity, best=null, bestMask=0;
    for (let mask=0; mask<8; mask++){
      const mm = cloneMatrix(m);
      applyMask(mm, mask);
      const score = penaltyScore(mm);
      if (score < bestScore){ bestScore=score; bestMask=mask; best=mm; }
    }
    writeFormat(best, bestMask);
    return { size, get(x,y){ return best[y][x] === 1; } };
  }

  function cloneMatrix(m){ return m.map(r => r.slice()); }
  function placeFinder(m, x, y){
    const p = [
      [1,1,1,1,1,1,1],
      [1,0,0,0,0,0,1],
      [1,0,1,1,1,0,1],
      [1,0,1,1,1,0,1],
      [1,0,1,1,1,0,1],
      [1,0,0,0,0,0,1],
      [1,1,1,1,1,1,1]
    ];
    for (let dy=0; dy<7; dy++) for (let dx=0; dx<7; dx++) m[y+dy][x+dx] = p[dy][dx];
    for (let i=-1;i<=7;i++){
      if (m[y-1]?.[x+i] === null) m[y-1][x+i]=0;
      if (m[y+7]?.[x+i] === null) m[y+7][x+i]=0;
      if (m[y+i]?.[x-1] === null) m[y+i][x-1]=0;
      if (m[y+i]?.[x+7] === null) m[y+i][x+7]=0;
    }
  }
  function placeTiming(m){
    const n=m.length;
    for (let i=8;i<n-8;i++){
      if (m[6][i] === null) m[6][i] = i%2 ? 0 : 1;
      if (m[i][6] === null) m[i][6] = i%2 ? 0 : 1;
    }
  }
  function reserveFormat(m){
    const n=m.length;
    for (let i=0;i<9;i++){
      if (m[8][i]===null) m[8][i]=0;
      if (m[i][8]===null) m[i][8]=0;
    }
    for (let i=n-8;i<n;i++){
      if (m[8][i]===null) m[8][i]=0;
      if (m[i][8]===null) m[i][8]=0;
    }
    m[n-8][8]=1;
  }
  function pushBits(out, val, len){ for (let i=len-1;i>=0;i--) out.push((val>>i)&1); }
  function placeData(m, bits){
    const n=m.length;
    let dirUp=true, bi=0;
    for (let x=n-1; x>0; x-=2){
      if (x===6) x--;
      for (let yi=0; yi<n; yi++){
        const y = dirUp ? (n-1-yi) : yi;
        for (let dx=0; dx<2; dx++){
          const xx=x-dx;
          if (m[y][xx] !== null) continue;
          m[y][xx] = bits[bi++] ? 1 : 0;
        }
      }
      dirUp=!dirUp;
    }
  }
  function isReserved(m,x,y){
    const n=m.length;
    const inFinder = (x<9 && y<9) || (x>=n-8 && y<9) || (x<9 && y>=n-8);
    const inTiming = (x===6 || y===6);
    const inFormat = (x===8 || y===8);
    return inFinder || inTiming || inFormat;
  }
  function maskFn(mask,x,y){
    switch(mask){
      case 0: return ((x+y)%2)===0;
      case 1: return (y%2)===0;
      case 2: return (x%3)===0;
      case 3: return ((x+y)%3)===0;
      case 4: return ((Math.floor(y/2)+Math.floor(x/3))%2)===0;
      case 5: return (((x*y)%2)+((x*y)%3))===0;
      case 6: return ((((x*y)%2)+((x*y)%3))%2)===0;
      case 7: return ((((x+y)%2)+((x*y)%3))%2)===0;
      default: return false;
    }
  }
  function applyMask(m, mask){
    const n=m.length;
    for (let y=0;y<n;y++){
      for (let x=0;x<n;x++){
        if (isReserved(m,x,y)) continue;
        if (maskFn(mask,x,y)) m[y][x] = m[y][x] ? 0 : 1;
      }
    }
  }
  function penaltyScore(m){
    const n=m.length; let score=0;
    for (let y=0;y<n;y++) score += runPenalty(m[y]);
    for (let x=0;x<n;x++){
      const col=[]; for (let y=0;y<n;y++) col.push(m[y][x]);
      score += runPenalty(col);
    }
    let dark=0,total=n*n;
    for (let y=0;y<n;y++) for (let x=0;x<n;x++) if (m[y][x]===1) dark++;
    score += Math.abs(((dark/total)*100)-50);
    return score;

    function runPenalty(arr){
      let s=0, run=1;
      for (let i=1;i<arr.length;i++){
        if (arr[i]===arr[i-1]) run++;
        else { if (run>=5) s += 3 + (run-5); run=1; }
      }
      if (run>=5) s += 3 + (run-5);
      return s;
    }
  }
  function writeFormat(m, mask){
    const ecc=1;
    const fmt=((ecc<<3)|mask)&0x1F;
    let bch=fmt<<10;
    const poly=0x537;
    for (let i=14;i>=10;i--) if ((bch>>i)&1) bch ^= poly<<(i-10);
    const bits=((fmt<<10)|(bch&0x3FF))^0x5412;

    const n=m.length;
    const f=[]; for (let i=14;i>=0;i--) f.push((bits>>i)&1);

    const pos1=[[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    const pos2=[[n-1,8],[n-2,8],[n-3,8],[n-4,8],[n-5,8],[n-6,8],[n-7,8],[8,n-8],[8,n-7],[8,n-6],[8,n-5],[8,n-4],[8,n-3],[8,n-2],[8,n-1]];
    for (let i=0;i<15;i++){
      const [x1,y1]=pos1[i]; const [x2,y2]=pos2[i];
      m[y1][x1]=f[i]; m[y2][x2]=f[i];
    }
  }
  function simpleECC(dataBytes,eccLen){
    let a=0xA5,b=0x5A;
    for (const x of dataBytes){
      a=(a^x)&0xFF;
      b=(b+x+(a>>1))&0xFF;
      a=((a<<1)|(a>>7))&0xFF;
    }
    const out=[];
    for (let i=0;i<eccLen;i++){
      const v=(a+i*31)^(b+i*17);
      out.push(v&0xFF);
      a=(a+13)&0xFF;
      b=(b^(v*7))&0xFF;
    }
    return out;
  }
  return { make };
})();

class QRGenerator extends HTMLElement{
  static get observedAttributes(){ return ["code","size","logo"]; }
  constructor(){
    super();
    this.attachShadow({mode:"open"});
    this.shadowRoot.innerHTML = `
      <style>
        :host{ display:inline-block; }
        canvas{
          width: var(--s, 220px);
          height: var(--s, 220px);
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.06);
          image-rendering: pixelated;
        }
        @media (prefers-color-scheme: light){
          canvas{ background: rgba(255,255,255,.92); border-color: rgba(15,23,42,.12); }
        }
      </style>
      <canvas width="220" height="220" aria-label="QR Code"></canvas>
    `;
  }
  connectedCallback(){ this.render(); }
  attributeChangedCallback(){ this.render(); }
  render(){
    const size = Math.max(160, Number(this.getAttribute("size")||220));
    const code = String(this.getAttribute("code")||"");
    const logo = String(this.getAttribute("logo")||"");
    const canvas = this.shadowRoot.querySelector("canvas");
    if(!canvas) return;
    canvas.width = size; canvas.height = size;
    this.style.setProperty("--s", size + "px");
    const ctx = canvas.getContext("2d", {alpha:false});

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,size,size);

    if(!code){
      ctx.fillStyle = "#0b1220";
      ctx.font = "900 14px ui-sans-serif, system-ui";
      ctx.fillText("QR aguardando…", 16, 28);
      return;
    }

    const drawFallback = ()=>{
      try {
        const qr = QR.make(code);
        const n = qr.size;
        const quiet = 4;
        const total = n + quiet*2;
        const scale = Math.floor(size / total);
        const pad = Math.floor((size - total*scale)/2);
        ctx.fillStyle = "#0b1220";
        for(let y=0; y<n; y++){
          for(let x=0; x<n; x++){
            if(qr.get(x,y)){
              const dx = pad + (x+quiet)*scale;
              const dy = pad + (y+quiet)*scale;
              ctx.fillRect(dx,dy,scale+1,scale+1);
            }
          }
        }
      } catch(e) {
        ctx.fillStyle = "#0b1220";
        ctx.font = "900 12px ui-sans-serif, system-ui";
        ctx.fillText("QR indisponível", 16, size/2);
      }
    };

    const drawLogo = ()=>{
      if(!logo) return;
      const ctx2 = canvas.getContext("2d", {alpha:false});
      const box = Math.floor(size * 0.26);
      const cx = Math.floor(size/2), cy = Math.floor(size/2);
      const r = Math.floor(box * 0.22);
      function roundRect(c,x,y,w,h,rad){
        c.beginPath();
        c.moveTo(x+rad,y);
        c.arcTo(x+w,y,x+w,y+h,rad);
        c.arcTo(x+w,y+h,x,y+h,rad);
        c.arcTo(x,y+h,x,y,rad);
        c.arcTo(x,y,x+w,y,rad);
        c.closePath();
      }
      ctx2.save();
      roundRect(ctx2, cx-box/2, cy-box/2, box, box, r);
      ctx2.fillStyle = "#ffffff";
      ctx2.fill();
      ctx2.restore();
      ctx2.fillStyle = "#0b1220";
      ctx2.font = `950 ${Math.floor(box*0.26)}px ui-sans-serif, system-ui`;
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";
      ctx2.fillText(logo.slice(0,6), cx, cy);
      ctx2.strokeStyle = "rgba(11,18,32,.16)";
      ctx2.lineWidth = 2;
      roundRect(ctx2, cx-box/2, cy-box/2, box, box, r);
      ctx2.stroke();
    };

    if(typeof QRCode !== "undefined" && typeof QRCode.toCanvas === "function"){
      QRCode.toCanvas(canvas, code, { width: size, margin: 2, color: { dark: "#0b1220", light: "#ffffff" } }, (err)=>{
        if(err){ drawFallback(); if(logo) drawLogo(); }
        else { drawLogo(); }
      });
    } else {
      drawFallback();
      if(logo) drawLogo();
    }
  }
}
customElements.define("qr-generator", QRGenerator);
