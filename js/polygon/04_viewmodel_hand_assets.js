
/* ==========================================================================
   МОДУЛЬ: viewmodel/hand_assets.js
   ========================================================================== */
/* ============================================================================
   Перчатки GLB (левая и правая кисть с костями пальцев, стандарт WebXR hand)
   из bodycam_angar.html — gzip + base64, распаковываются при загрузке.
   Встроены в страницу, поэтому работают и при открытии файла с диска.
   ========================================================================== */
(function (root) {
  'use strict';
  const B64 = root.__AEGIS_HANDS || {};
  async function inflate(b64) {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ds = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(ds).arrayBuffer();
  }
  const GA = root.GAssets;
  if (!GA || typeof DecompressionStream === 'undefined') return;
  GA.add('vm_hands', Promise.all([
    __addon('loaders/GLTFLoader.js'),
    __addon('utils/SkeletonUtils.js')
  ]).then(async ([GL, SU]) => {
    const loader = new GL.GLTFLoader();
    const parse = (buf) => new Promise((ok, bad) => loader.parse(buf, '', ok, bad));
    const [left, right] = await Promise.all([inflate(B64.left).then(parse), inflate(B64.right).then(parse)]);
    /* GlovedHand перестраивает сцену GLB, поэтому каждой кисти — своя копия */
    const clone = (g) => ({ scene: SU.clone(g.scene) });
    return { left, right, clone };
  }));
})(typeof self !== 'undefined' ? self : this);
