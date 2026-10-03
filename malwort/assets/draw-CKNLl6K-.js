import{D as m}from"./words-BHUf-IbK.js";import{g as F,s as B,a as A}from"./index-tA5WdjRF.js";import{s as H,a as D}from"./speech-oOOcT6OJ.js";const x=[{id:"rot",label:"Rot",value:"#E23B3B"},{id:"blau",label:"Blau",value:"#2F6FED"},{id:"gelb",label:"Gelb",value:"#F0C000"},{id:"gruen",label:"Grün",value:"#1F8A4D"}];function O(a,q){document.title="Malen · Malwort";let v=Math.floor(Math.random()*m.length),g=x[0].value,l=!1,b=!1;const d=[];let c=null,w=0;const u=()=>m[v]??m[0],y=()=>{const t=F();return`${t.points} Punkte · Level ${t.level} · ${B(t.streak)}`};a.innerHTML=`
    <main class="shell draw-shell">
      <header class="bar">
        <button type="button" class="back" data-back>Zurück</button>
        <h1>Malen</h1>
        <p class="mini-stats" data-stats>${y()}</p>
      </header>
      <p class="prompt" lang="en" data-prompt>Draw a ${u()?.en??"cat"}</p>
      <p class="hint" data-de>${u()?.de??""}</p>
      <p class="hint" data-note></p>
      <div class="listen-row">
        <button type="button" class="ghost" data-hear>Anhören</button>
      </div>
      <div class="stage">
        <canvas data-canvas></canvas>
      </div>
      <div class="tools" role="group" aria-label="Farben und Radierer">
        ${x.map((t,e)=>`
            <button type="button" class="swatch ${e===0?"is-on":""}" data-color="${t.value}" aria-label="${t.label}" aria-pressed="${e===0?"true":"false"}" style="--swatch:${t.value}"></button>`).join("")}
        <button type="button" class="swatch eraser" data-eraser aria-label="Radierer" aria-pressed="false">Radierer</button>
      </div>
      <button type="button" class="primary" data-done>Fertig</button>
      <section class="star-pop" data-star hidden>
        <svg viewBox="0 0 64 64" aria-hidden="true" data-star-svg>
          <path d="M32 6 L39 24 H58 L43 35 L48 54 L32 43 L16 54 L21 35 L6 24 H25 Z" fill="#F0C000" stroke="#241C14" stroke-width="2"/>
        </svg>
        <p class="feedback is-good">Stern fürs Mitmachen! +5 Punkte</p>
        <button type="button" class="ghost" data-new>Neues Bild</button>
      </section>
    </main>
  `;const s=a.querySelector("canvas");if(!(s instanceof HTMLCanvasElement))return{unmount(){}};const r=s.getContext("2d");if(!r)return{unmount(){}};const $=()=>`Draw a ${u()?.en??"cat"}`,L=()=>{const t=s.getBoundingClientRect(),e=Math.min(window.devicePixelRatio||1,2);s.width=Math.max(1,Math.round(t.width*e)),s.height=Math.max(1,Math.round(t.height*e)),r.setTransform(e,0,0,e,0,0),f()},f=()=>{const t=s.getBoundingClientRect();r.clearRect(0,0,t.width,t.height),r.fillStyle="#ffffff",r.fillRect(0,0,t.width,t.height),r.lineCap="round",r.lineJoin="round";for(const e of d){if(e.points.length===0)continue;r.beginPath(),r.strokeStyle=e.color,r.lineWidth=e.width;const n=e.points[0];if(n){r.moveTo(n.x,n.y);for(const i of e.points.slice(1))r.lineTo(i.x,i.y);e.points.length===1&&r.lineTo(n.x+.2,n.y+.2),r.stroke()}}},E=t=>{const e=s.getBoundingClientRect();return{x:t.clientX-e.left,y:t.clientY-e.top}},T=()=>d.some(t=>t.points.length>1),M=()=>{a.querySelectorAll("[data-color]").forEach(e=>{if(!(e instanceof HTMLButtonElement))return;const n=!l&&e.dataset.color===g;e.classList.toggle("is-on",n),e.setAttribute("aria-pressed",n?"true":"false")});const t=a.querySelector("[data-eraser]");t instanceof HTMLButtonElement&&(t.classList.toggle("is-on",l),t.setAttribute("aria-pressed",l?"true":"false"))},P=()=>{const t=a.querySelector("[data-star-svg]");if(!(t instanceof SVGElement))return;if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){t.style.transform="scale(1)";return}const e=performance.now(),n=i=>{const o=Math.min(1,(i-e)/520),h=.3+.7*(1-(1-o)**3);t.style.transform=`scale(${h})`,o<1&&(w=requestAnimationFrame(n))};w=requestAnimationFrame(n)},R=()=>{const t=u(),e=a.querySelector("[data-prompt]"),n=a.querySelector("[data-de]");e&&t&&(e.textContent=`Draw a ${t.en}`),n&&t&&(n.textContent=t.de);const i=a.querySelector("[data-hear]");i&&(i.textContent="Anhören")},k=t=>{s.setPointerCapture(t.pointerId),c={color:l?"#ffffff":g,width:l?28:14,points:[E(t)]},d.push(c),f()},S=t=>{c&&(c.points.push(E(t)),f())},p=()=>{c=null},C=t=>{const e=t.target;if(!(e instanceof HTMLElement))return;if(e.closest("[data-back]")){q("home");return}if(e.closest("[data-hear]")){D($());const o=a.querySelector("[data-hear]");o&&(o.textContent="Nochmal hören");return}const n=e.closest("[data-color]");if(n instanceof HTMLButtonElement&&n.dataset.color){g=n.dataset.color,l=!1,M();return}if(e.closest("[data-eraser]")){l=!0,M();return}if(e.closest("[data-new]")){d.length=0,b=!1,v=(v+1)%m.length,R();const o=a.querySelector("[data-star]");o instanceof HTMLElement&&(o.hidden=!0);const h=a.querySelector("[data-note]");h&&(h.textContent=""),f();return}if(!e.closest("[data-done]"))return;const i=a.querySelector("[data-star]");if(!T()){const o=a.querySelector("[data-note]");o&&(o.textContent="Mal zuerst etwas auf die Fläche.");return}if(!b){b=!0,A(5);const o=a.querySelector("[data-stats]");o&&(o.textContent=y())}i instanceof HTMLElement&&(i.hidden=!1),P()};return L(),window.addEventListener("resize",L),s.addEventListener("pointerdown",k),s.addEventListener("pointermove",S),s.addEventListener("pointerup",p),s.addEventListener("pointercancel",p),a.addEventListener("click",C),{unmount(){window.removeEventListener("resize",L),s.removeEventListener("pointerdown",k),s.removeEventListener("pointermove",S),s.removeEventListener("pointerup",p),s.removeEventListener("pointercancel",p),a.removeEventListener("click",C),cancelAnimationFrame(w),H()}}}export{O as default};
