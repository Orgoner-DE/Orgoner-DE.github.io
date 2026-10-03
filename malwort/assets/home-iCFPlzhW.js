import{g as r,s as o}from"./index-tA5WdjRF.js";const c=[{route:"zahlen",title:"Zahlen",sub:"1 bis 20",icon:'<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="8" width="52" height="48" rx="12" fill="#1F7A4D"/><text x="32" y="42" text-anchor="middle" font-size="26" font-family="ui-rounded,system-ui,sans-serif" fill="#FFF6E8">12</text></svg>'},{route:"woerter",title:"Wörter",sub:"16 Karten",icon:'<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="12" width="48" height="36" rx="10" fill="#2F6FED"/><path d="M24 48 L28 58 L36 48 Z" fill="#2F6FED"/><text x="32" y="36" text-anchor="middle" font-size="16" font-family="ui-rounded,system-ui,sans-serif" fill="#fff">Aa</text></svg>'},{route:"malen",title:"Malen",sub:"Stift und Stern",icon:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 46 L40 16 L48 24 L20 54 Z" fill="#E36A4A"/><path d="M40 16 L46 10 L54 18 L48 24 Z" fill="#F0C000"/><path d="M14 50 L10 56 L18 52 Z" fill="#C4783A"/></svg>'}];function d(e,i){document.title="Malwort";const s=r();e.innerHTML=`
    <main class="shell">
      <header class="hero">
        <p class="brand">Malwort</p>
        <h1>Englisch hören, tippen und malen</h1>
      </header>
      <section class="stats" aria-label="Punkte, Level und Serie">
        <div class="stat">
          <span class="stat-num">${s.points}</span>
          <span class="stat-label">Punkte</span>
        </div>
        <div class="stat">
          <span class="stat-num">${s.level}</span>
          <span class="stat-label">Level</span>
        </div>
        <div class="stat">
          <span class="stat-num">${s.streak}</span>
          <span class="stat-label">${o(s.streak).endsWith("Tag")?"Tag":"Tage"}</span>
        </div>
      </section>
      <nav class="paths" aria-label="Übungen">
        ${c.map(t=>`
          <button type="button" class="path" data-go="${t.route}">
            <span class="path-icon">${t.icon}</span>
            <span class="path-title">${t.title}</span>
            <span class="path-sub">${t.sub}</span>
          </button>`).join("")}
      </nav>
    </main>
  `;const n=t=>{const l=t.target.closest("button[data-go]");if(!(l instanceof HTMLButtonElement))return;const a=l.dataset.go;(a==="zahlen"||a==="woerter"||a==="malen")&&i(a)};return e.addEventListener("click",n),{unmount(){e.removeEventListener("click",n)}}}export{d as default};
