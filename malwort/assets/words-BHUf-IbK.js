const e=r=>`<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">${r}</svg>`,l=["Tiere","Farben","Körper","Zuhause"],i=[{en:"cat",de:"Katze",group:"Tiere",svg:e(`
      <circle cx="60" cy="70" r="32" fill="#F3C39A"/>
      <path d="M36 50 L30 20 L54 42 Z" fill="#E2A36E"/>
      <path d="M84 50 L90 20 L66 42 Z" fill="#E2A36E"/>
      <ellipse cx="48" cy="68" rx="4" ry="5" fill="#241C14"/>
      <ellipse cx="72" cy="68" rx="4" ry="5" fill="#241C14"/>
      <path d="M60 74 L55 82 L65 82 Z" fill="#E36A4A"/>
      <path d="M22 72 H42 M78 72 H98 M24 82 H42 M78 82 H96" stroke="#241C14" stroke-width="2" stroke-linecap="round"/>
    `)},{en:"dog",de:"Hund",group:"Tiere",svg:e(`
      <ellipse cx="34" cy="58" rx="12" ry="22" fill="#A8652E"/>
      <ellipse cx="86" cy="58" rx="12" ry="22" fill="#A8652E"/>
      <ellipse cx="60" cy="70" r="30" fill="#C4783A"/>
      <ellipse cx="60" cy="80" rx="16" ry="12" fill="#F0C7A0"/>
      <circle cx="50" cy="66" r="4" fill="#241C14"/>
      <circle cx="70" cy="66" r="4" fill="#241C14"/>
      <ellipse cx="60" cy="78" rx="4" ry="3" fill="#241C14"/>
    `)},{en:"bird",de:"Vogel",group:"Tiere",svg:e(`
      <ellipse cx="58" cy="68" rx="30" ry="22" fill="#F5C518"/>
      <circle cx="82" cy="46" r="16" fill="#F5C518"/>
      <path d="M96 44 L114 50 L96 56 Z" fill="#E36A4A"/>
      <path d="M40 64 L16 48 L22 74 Z" fill="#E2B000"/>
      <circle cx="88" cy="44" r="2.5" fill="#241C14"/>
    `)},{en:"fish",de:"Fisch",group:"Tiere",svg:e(`
      <ellipse cx="56" cy="60" rx="34" ry="22" fill="#3D8BFF"/>
      <path d="M88 60 L112 40 L112 80 Z" fill="#2F6FD6"/>
      <circle cx="40" cy="54" r="4" fill="#241C14"/>
      <circle cx="41" cy="53" r="1.4" fill="#fff"/>
      <path d="M52 48 Q64 36 76 48" fill="none" stroke="#1F5FBF" stroke-width="3" stroke-linecap="round"/>
    `)},{en:"red",de:"Rot",group:"Farben",svg:e('<circle cx="60" cy="60" r="36" fill="#E23B3B"/>')},{en:"blue",de:"Blau",group:"Farben",svg:e('<circle cx="60" cy="60" r="36" fill="#2F6FED"/>')},{en:"yellow",de:"Gelb",group:"Farben",svg:e('<circle cx="60" cy="60" r="36" fill="#F0C000"/>')},{en:"green",de:"Grün",group:"Farben",svg:e('<circle cx="60" cy="60" r="36" fill="#1F8A4D"/>')},{en:"hand",de:"Hand",group:"Körper",svg:e(`
      <rect x="28" y="38" width="12" height="36" rx="6" fill="#F3C39A" stroke="#C9895C" stroke-width="2"/>
      <rect x="42" y="22" width="12" height="52" rx="6" fill="#F3C39A" stroke="#C9895C" stroke-width="2"/>
      <rect x="56" y="26" width="12" height="48" rx="6" fill="#F3C39A" stroke="#C9895C" stroke-width="2"/>
      <rect x="70" y="36" width="12" height="38" rx="6" fill="#F3C39A" stroke="#C9895C" stroke-width="2"/>
      <path d="M28 62 H86 V84 Q86 100 60 100 Q34 100 34 84 Z" fill="#F3C39A" stroke="#C9895C" stroke-width="2"/>
    `)},{en:"eye",de:"Auge",group:"Körper",svg:e(`
      <ellipse cx="60" cy="60" rx="46" ry="28" fill="#fff" stroke="#241C14" stroke-width="4"/>
      <circle cx="60" cy="60" r="16" fill="#3D8BFF"/>
      <circle cx="60" cy="60" r="8" fill="#241C14"/>
      <circle cx="66" cy="54" r="4" fill="#fff"/>
    `)},{en:"nose",de:"Nase",group:"Körper",svg:e(`
      <path d="M60 22 C78 48 82 70 70 88 C64 96 56 96 50 88 C38 70 42 48 60 22 Z" fill="#F3C39A" stroke="#C9895C" stroke-width="3"/>
      <ellipse cx="52" cy="86" rx="6" ry="4" fill="#E36A4A"/>
      <ellipse cx="68" cy="86" rx="6" ry="4" fill="#E36A4A"/>
    `)},{en:"foot",de:"Fuß",group:"Körper",svg:e(`
      <path d="M28 58 C28 40 48 36 58 46 L86 46 C100 46 108 58 104 70 L96 86 H36 C28 86 24 76 28 58 Z" fill="#F3C39A" stroke="#C9895C" stroke-width="3"/>
      <circle cx="46" cy="40" r="7" fill="#F3C39A" stroke="#C9895C" stroke-width="3"/>
      <circle cx="60" cy="34" r="7" fill="#F3C39A" stroke="#C9895C" stroke-width="3"/>
      <circle cx="74" cy="36" r="7" fill="#F3C39A" stroke="#C9895C" stroke-width="3"/>
      <circle cx="86" cy="44" r="6" fill="#F3C39A" stroke="#C9895C" stroke-width="3"/>
    `)},{en:"house",de:"Haus",group:"Zuhause",svg:e(`
      <path d="M16 56 L60 22 L104 56 Z" fill="#E36A4A"/>
      <rect x="30" y="56" width="60" height="44" fill="#F6D7A8" stroke="#241C14" stroke-width="3"/>
      <rect x="50" y="72" width="18" height="28" fill="#1F7A4D"/>
      <rect x="36" y="66" width="12" height="12" fill="#9FD0FF" stroke="#241C14" stroke-width="2"/>
    `)},{en:"bed",de:"Bett",group:"Zuhause",svg:e(`
      <rect x="18" y="58" width="84" height="28" rx="8" fill="#6C8CFF"/>
      <rect x="22" y="44" width="30" height="20" rx="6" fill="#fff" stroke="#241C14" stroke-width="3"/>
      <rect x="16" y="84" width="10" height="16" rx="2" fill="#C4A574"/>
      <rect x="94" y="84" width="10" height="16" rx="2" fill="#C4A574"/>
    `)},{en:"door",de:"Tür",group:"Zuhause",svg:e(`
      <rect x="34" y="14" width="52" height="94" rx="4" fill="#C4783A" stroke="#241C14" stroke-width="3"/>
      <circle cx="74" cy="64" r="4" fill="#F5D76E"/>
    `)},{en:"table",de:"Tisch",group:"Zuhause",svg:e(`
      <rect x="14" y="40" width="92" height="14" rx="3" fill="#C4783A" stroke="#241C14" stroke-width="3"/>
      <rect x="26" y="54" width="10" height="42" fill="#A8652E"/>
      <rect x="84" y="54" width="10" height="42" fill="#A8652E"/>
    `)}],t=[{en:"cat",de:"Katze"},{en:"dog",de:"Hund"},{en:"bird",de:"Vogel"},{en:"fish",de:"Fisch"},{en:"house",de:"Haus"},{en:"bed",de:"Bett"},{en:"door",de:"Tür"},{en:"table",de:"Tisch"}];export{t as D,l as G,i as W};
