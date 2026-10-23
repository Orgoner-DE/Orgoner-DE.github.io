/* EX-TRIBE 3.2 – CC0-Werks-Sounds für die 5 Import-Racks (Pads 160–239).
   Schreibt nur in leere Plätze (IndexedDB add statt put): vom Nutzer importierte Samples werden nie überschrieben.
   Automatisch nur beim ersten Start; danach nur per Knopf "Werks-Sounds laden" im Menü Sample-Racks. */
(function(){
  'use strict';
  var FLAG='extribe-factory-v32', DB='extribe-samples-v1', STORE='samples';
  var base=new URL('sounds/', (document.currentScript&&document.currentScript.src)||location.href);
  function openDB(){return new Promise(function(res,rej){var r=indexedDB.open(DB,1);r.onupgradeneeded=function(){if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'pad'});};r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};});}
  function existingPads(db){return new Promise(function(res,rej){var q=db.transaction(STORE).objectStore(STORE).getAllKeys();q.onsuccess=function(){res(new Set(q.result));};q.onerror=function(){rej(q.error);};});}
  var manifestP=null;
  function manifest(){return manifestP||(manifestP=fetch(new URL('manifest.json',base)).then(function(r){if(!r.ok)throw Error('manifest '+r.status);return r.json();}));}
  async function fill(){
    var m=await manifest(); var db=await openDB();
    try{
      var have=await existingPads(db);
      var todo=m.sounds.filter(function(s){return !have.has(s.pad);});
      var rows=[], i=0;
      async function worker(){while(i<todo.length){var s=todo[i++];try{var r=await fetch(new URL(s.file,base));if(!r.ok)continue;var b=await r.arrayBuffer();if(b.byteLength>0&&b.byteLength<=8*1024*1024)rows.push({pad:s.pad,name:s.name,bytes:b,factory:true,src:s.file});}catch(e){}}}
      await Promise.all([worker(),worker(),worker(),worker(),worker(),worker()]);
      var written=[];
      await new Promise(function(res,rej){
        var tx=db.transaction(STORE,'readwrite'), st=tx.objectStore(STORE);
        rows.forEach(function(row){var q=st.add(row);q.onsuccess=function(){written.push(row);};q.onerror=function(ev){ev.preventDefault();ev.stopPropagation();};});
        tx.oncomplete=res; tx.onabort=function(){rej(tx.error);}; tx.onerror=function(ev){ev.preventDefault();};
      });
      return written;
    } finally { db.close(); }
  }
  var ready;
  try{
    if(localStorage.getItem(FLAG)) ready=Promise.resolve([]);
    else ready=fill().then(function(w){try{localStorage.setItem(FLAG,'1');}catch(e){}return w;});
  }catch(e){ready=Promise.resolve([]);}
  var safeReady=Promise.race([ready.catch(function(){return [];}),new Promise(function(r){setTimeout(function(){r([]);},20000);})]);
  window.EXTRIBE_FACTORY={version:'3.2',ready:safeReady,fill:fill,manifest:manifest};
})();
