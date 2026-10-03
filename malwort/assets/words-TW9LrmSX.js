import{G as b,W as p}from"./words-BHUf-IbK.js";import{g as h,s as v}from"./index-tA5WdjRF.js";import{s as g,a as u}from"./speech-oOOcT6OJ.js";function L(t,m){document.title="Wörter · Malwort";let n=null;const r=h(),f=a=>p.filter(e=>e.group===a).map(e=>`
        <button type="button" class="vcard" data-en="${e.en}">
          <span class="vsvg">${e.svg}</span>
          <span class="ven" lang="en">${e.en}</span>
          <span class="vde">${e.de}</span>
        </button>`).join("");t.innerHTML=`
    <main class="shell">
      <header class="bar">
        <button type="button" class="back" data-back>Zurück</button>
        <h1>Wörter</h1>
        <p class="mini-stats">${r.points} Punkte · Level ${r.level} · ${v(r.streak)}</p>
      </header>
      <div class="listen-row">
        <p class="hint" data-heard>Tippe eine Karte an.</p>
        <button type="button" class="ghost" data-replay disabled>Nochmal hören</button>
      </div>
      ${b.map(a=>`
          <section class="word-group">
            <h2>${a}</h2>
            <div class="grid">${f(a)}</div>
          </section>`).join("")}
    </main>
  `;const i=t.querySelector("[data-heard]"),o=t.querySelector("[data-replay]"),d=a=>{const e=a.target;if(!(e instanceof HTMLElement))return;if(e.closest("[data-back]")){m("home");return}if(e.closest("[data-replay]")){n&&u(n.en);return}const l=e.closest("button[data-en]");if(!(l instanceof HTMLButtonElement))return;const s=p.find(c=>c.en===l.dataset.en);s&&(n=s,u(s.en),i&&(i.textContent=`${s.en} · ${s.de}`),o instanceof HTMLButtonElement&&(o.disabled=!1),t.querySelectorAll(".vcard").forEach(c=>c.classList.remove("is-on")),l.classList.add("is-on"))};return t.addEventListener("click",d),{unmount(){t.removeEventListener("click",d),g()}}}export{L as default};
