import{g as m,s as g,a as k}from"./index-tA5WdjRF.js";import{s as v,a as b}from"./speech-oOOcT6OJ.js";const r=[{n:1,en:"one"},{n:2,en:"two"},{n:3,en:"three"},{n:4,en:"four"},{n:5,en:"five"},{n:6,en:"six"},{n:7,en:"seven"},{n:8,en:"eight"},{n:9,en:"nine"},{n:10,en:"ten"},{n:11,en:"eleven"},{n:12,en:"twelve"},{n:13,en:"thirteen"},{n:14,en:"fourteen"},{n:15,en:"fifteen"},{n:16,en:"sixteen"},{n:17,en:"seventeen"},{n:18,en:"eighteen"},{n:19,en:"nineteen"},{n:20,en:"twenty"}];function $(s){const t=s.slice();for(let n=t.length-1;n>0;n-=1){const e=Math.floor(Math.random()*(n+1)),a=t[n];t[n]=t[e],t[e]=a}return t}function y(s){const t=r[s];if(!t)return[];const n=[-1,1].filter(i=>{const l=t.n+i;return l>=1&&l<=20}),e=n[Math.floor(Math.random()*n.length)]??1,a=r.find(i=>i.n===t.n+e),u=r.filter(i=>i.n!==t.n&&i.n!==a?.n),c=u[Math.floor(Math.random()*u.length)];return!a||!c?[t.en]:$([t.en,a.en,c.en])}function Z(s,t){document.title="Zahlen · Malwort";let n=0,e="listen",a=[],u=!1;const c=()=>{const l=m(),o=r[n],d=`${l.points} Punkte · Level ${l.level} · ${g(l.streak)}`;if(e==="end"||!o){s.innerHTML=`
        <main class="shell">
          <header class="bar">
            <button type="button" class="back" data-back>Zurück</button>
            <h1>Zahlen</h1>
            <p class="mini-stats">${d}</p>
          </header>
          <section class="panel">
            <p class="feedback is-good">Geschafft. Die Zahlen von 1 bis 20 sind durch.</p>
            <button type="button" class="primary" data-back>Zur Startseite</button>
          </section>
        </main>
      `;return}const f=e==="listen"?'<p class="hint">Tippe die Zahl an. Dann kommen drei Wörter.</p>':`
          <p class="ask">Wie heißt die Zahl auf Englisch?</p>
          <div class="choices" role="group" aria-label="Drei Antworten">
            ${a.map(p=>`<button type="button" class="choice" data-en="${p}" lang="en" ${e==="solved"?"disabled":""}>${p}</button>`).join("")}
          </div>
          <p class="feedback" role="status" data-feedback></p>
          ${e==="solved"?`<button type="button" class="primary" data-next>${n===r.length-1?"Fertig":"Weiter"}</button>`:""}
        `;s.innerHTML=`
      <main class="shell">
        <header class="bar">
          <button type="button" class="back" data-back>Zurück</button>
          <h1>Zahlen</h1>
          <p class="mini-stats">${d}</p>
        </header>
        <p class="step">${o.n} / ${r.length}</p>
        <button type="button" class="digit" data-hear>
          <span class="digit-num">${o.n}</span>
          <span class="digit-hint">${e==="listen"?"Tippen und hören":"Nochmal hören"}</span>
        </button>
        <div class="listen-row">
          <button type="button" class="ghost" data-hear>${e==="listen"?"Anhören":"Nochmal hören"}</button>
        </div>
        ${f}
      </main>
    `},i=l=>{const o=l.target;if(!(o instanceof HTMLElement))return;if(o.closest("[data-back]")){t("home");return}if(o.closest("[data-hear]")){const h=r[n];if(!h)return;b(h.en),e==="listen"&&(a=y(n),e="quiz",u=!1,c());return}if(o.closest("[data-next]")){if(n>=r.length-1){e="end",c();return}n+=1,e="listen",a=[],u=!1,c();return}const d=o.closest("button[data-en]");if(!(d instanceof HTMLButtonElement)||e!=="quiz")return;const f=r[n];if(!f)return;const p=s.querySelector("[data-feedback]");if(d.dataset.en===f.en){e="solved",u||(u=!0,k(10)),b(f.en),c();const h=s.querySelector("[data-feedback]");h&&(h.textContent="Richtig! +10 Punkte"),h?.classList.add("is-good");return}d.disabled=!0,d.classList.add("is-miss"),p&&(p.textContent="Noch einmal!")};return c(),s.addEventListener("click",i),{unmount(){s.removeEventListener("click",i),v()}}}export{Z as default};
