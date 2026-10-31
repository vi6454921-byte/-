/* ==========================================================================
   AEGIS · загрузчик ассетов полигона.
   Все внешние файлы (модель бойца, фототекстуры леса, HDRI, звуки) встроены
   в assets/data/*.js как base64: при открытии index.html двойным щелчком
   (file://) браузер не даёт fetch, а встроенные данные работают всегда.
   Модули регистрируют загрузки через add(), игра стартует после ready().
   ========================================================================== */
(function () {
  'use strict';
  const FILES = window.__AEGIS_FILES || (window.__AEGIS_FILES = {});
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', json: 'application/json' };
  const CDN = ['https://cdn.jsdelivr.net/gh/badVIno/you@main/game/'];
  function mimeOf(path) { const m = /\.([a-z0-9]+)$/i.exec(path); return (m && MIME[m[1].toLowerCase()]) || 'application/octet-stream'; }
  function b64ToU8(b64) {
    const s = atob(b64), n = s.length, u8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  /* base64 -> Blob: через data:-URL (быстрый нативный декодер), иначе atob */
  async function embeddedRaw(path) {
    const b64 = FILES[path];
    if (!b64) return null;
    const type = mimeOf(path);
    let blob = null;
    try { const r = await fetch('data:' + type + ';base64,' + b64); blob = await r.blob(); } catch (e) { blob = null; }
    if (!blob || !blob.size) blob = new Blob([b64ToU8(b64)], { type });
    delete FILES[path];                                  // строка больше не нужна — освобождаем память
    return blob;
  }
  const blobCache=new Map(),fetchCache=new Map(),stats={hits:0,decoded:0,persistentHits:0};
  let dbPromise=null;
  function database(){if(!dbPromise)dbPromise=new Promise(resolve=>{try{const r=indexedDB.open('aegis-assets',1);r.onupgradeneeded=()=>r.result.createObjectStore('blobs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);r.onblocked=()=>resolve(null);}catch(e){resolve(null);}});return dbPromise;}
  async function stored(key){const db=await database();if(!db)return null;return new Promise(resolve=>{try{const r=db.transaction('blobs').objectStore('blobs').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null);}catch(e){resolve(null);}});}
  async function persist(key,blob){const db=await database();if(!db)return;try{const tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put(blob,key);tx.onerror=()=>{};}catch(e){/* quota/security: embedded source remains valid */}}
  function embedded(path){if(blobCache.has(path)){stats.hits++;return blobCache.get(path);}const task=(async()=>{const key='9d8c831f08ed:'+path;let blob=await stored(key);if(blob){stats.persistentHits++;delete FILES[path];return blob;}blob=await embeddedRaw(path);if(blob){stats.decoded++;persist(key,blob);}return blob;})();blobCache.set(path,task);return task;}
  /* модель бойца хранится сжатой gzip (−35 % к объёму и времени разбора) */
  async function gunzip(blob) {
    if (typeof DecompressionStream === 'undefined') return null;
    try { return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob(); } catch (e) { return null; }
  }
  async function fetchRaw(path, kind) {
    let blob = null;
    if (FILES[path + '.gz'] || blobCache.has(path + '.gz')) {
      const z = await embedded(path + '.gz');
      blob = z && await gunzip(z);
    }
    if (!blob) blob = await embedded(path);
    if (blob) {
      if (kind === 'blob') return blob;
      if (kind === 'json') return JSON.parse(await blob.text());
      return blob.arrayBuffer();
    }
    let err = new Error('нет встроенного файла ' + path);
    for (const b of CDN) {
      try {
        const r = await fetch(b + path);
        if (!r.ok) throw new Error(r.status + ' ' + path);
        return kind === 'json' ? await r.json() : kind === 'blob' ? await r.blob() : await r.arrayBuffer();
      } catch (e) { err = e; }
    }
    throw err;
  }
  function fetchAny(path,kind){const key=path+'|'+kind;let task=fetchCache.get(key);if(task)stats.hits++;else{task=fetchRaw(path,kind).catch(e=>{fetchCache.delete(key);throw e;});fetchCache.set(key,task);}return task.then(v=>v instanceof ArrayBuffer?v.slice(0):v);}

  /* масштаб текстур: на «Низкой» крупные карты уменьшаются вдвое (видеопамять) */
  let texScale = 1;
  try {
    const st = JSON.parse(localStorage.getItem('aegis.settings') || '{}');
    if (st.quality === 'low'||st.quality==='ultra') texScale = 0.5;
  } catch (e) { /* без хранилища */ }
  async function bitmap(blob, opts) {
    let bmp = await createImageBitmap(blob, opts || {});
    if (texScale < 1 && bmp.width > 1024 && bmp.height >= 512) {
      const w = Math.round(bmp.width * texScale), h = Math.round(bmp.height * texScale);
      const o = Object.assign({}, opts || {}, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
      delete o.imageOrientation;                          // уже перевёрнут при первом декоде
      try { const b2 = await createImageBitmap(bmp, o); bmp.close && bmp.close(); bmp = b2; } catch (e) { /* оставляем как есть */ }
    }
    return bmp;
  }
  async function image(path) {
    return bitmap(await fetchAny(path, 'blob'), { imageOrientation: 'flipY' });
  }
  const data = {}, jobs = [];
  let done = 0;
  function add(name, promise) {
    jobs.push(Promise.resolve(promise).then((v) => { data[name] = v; done++; },
      (e) => { console.warn('asset ' + name + ' failed:', e && e.message); data[name] = null; done++; }));
  }
  const GAssets = {
    data, fetchAny, image, bitmap, add, cacheStats:()=>({...stats,entries:blobCache.size}), get texScale() { return texScale; },
    progress: () => (jobs.length ? done / jobs.length : 0),
    ready: () => Promise.all(jobs)
  };
  window.GAssets = GAssets;
  window.__ADDONS = {
    RoomEnvironment: window.THREE_ADDONS['environments/RoomEnvironment.js'].RoomEnvironment,
    Sky: window.THREE_ADDONS['objects/Sky.js'].Sky
  };
  window.showErr = function (e) {
    const el = document.getElementById('err');
    if (!el) { console.error(e); return; }
    el.style.display = 'flex';
    el.textContent = 'Ошибка:\n' + ((e && e.message) || e) + '\n\n' + ((e && e.stack) || '');
    if (e && e.stack) console.error(e);
  };
})();
