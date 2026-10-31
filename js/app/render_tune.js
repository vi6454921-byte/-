/* AEGIS · против «ряби вдали». Два дешёвых приёма, без лишних проходов:
   1) snapSun — привязка ортокамеры солнца к сетке текселей карты теней
      (так делают стабильные CSM в UE/Unity/Frostbite: сдвиг камеры только на
      целое число текселей → края теней не «ползут» при движении игрока);
      normalBias растёт вместе с размером текселя (иначе на 1024 — муар/акне).
   2) tuneTextures — анизотропия и мипы для текстур карт: без мипов дальние
      кирпичи/профнастил мерцают, анизотропия убирает «мыло» под скользящим углом.
   Потолок анизотропии зависит от качества (слабым ПК — дешевле). */
(function (root) {
  'use strict';
  const _r = { x: 0, y: 0, z: 0 }, _u = { x: 0, y: 0, z: 0 };
  const ANISO = { ultra: 2, low: 4, medium: 8, high: 16 };

  function snapSun(sun, px, pz, sd) {
    const ox = sd.x * 40, oy = sd.y * 40 + 6, oz = sd.z * 40;
    const cam = sun.shadow.camera, size = sun.shadow.mapSize.x || 1024;
    const ts = (cam.right - cam.left) / size;
    /* взгляд солнца d = -(ox, oy, oz); r = d × up, u = r × d */
    const dl = Math.hypot(ox, oy, oz) || 1, dx = -ox / dl, dy = -oy / dl, dz = -oz / dl;
    let rx = -dz, rz = dx;                       // d × (0,1,0) = (-dz, 0, dx)
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    _r.x = rx; _r.y = 0; _r.z = rz;
    _u.x = _r.y * dz - _r.z * dy; _u.y = _r.z * dx - _r.x * dz; _u.z = _r.x * dy - _r.y * dx;
    const a = px * _r.x + pz * _r.z, b = px * _u.x + pz * _u.z;   // target.y = 0
    const da = Math.round(a / ts) * ts - a, db = Math.round(b / ts) * ts - b;
    const sx = _r.x * da + _u.x * db, sy = _u.y * db, sz = _r.z * da + _u.z * db;
    sun.target.position.set(px + sx, sy, pz + sz);
    sun.position.set(px + ox + sx, oy + sy, pz + oz + sz);
    sun.target.updateMatrixWorld();
    const nb = Math.min(0.08, Math.max(0.02, ts * 1.2));
    if (Math.abs(sun.shadow.normalBias - nb) > 0.004) sun.shadow.normalBias = nb;
  }

  const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
  function tuneTextures(THREE, renderer, scene, tier) {
    const cap = Math.min(ANISO[tier] || 8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 8);
    const seen = new Set(); let n = 0, mip = 0;
    scene.traverse((o) => {
      const L = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of L) {
        if (!m || m.isShaderMaterial || m.isPointsMaterial || m.isSpriteMaterial || m.isLineBasicMaterial) continue;
        for (const k of SLOTS) {
          const t = m[k];
          if (!t || seen.has(t) || !t.isTexture) continue;
          seen.add(t);
          if (t.isCompressedTexture || t.isDataTexture || t.isRenderTargetTexture || t.isCubeTexture || !t.image) continue;
          const w = t.image.width || 0, h = t.image.height || 0;
          if (w < 32 || h < 32) continue;
          if (t.anisotropy < cap && (k === 'map' || k === 'normalMap')) { t.anisotropy = cap; n++; }
          /* только «забытые» мипы: Linear + generateMipmaps — текстуру ещё не грузили в GPU */
          if (t.generateMipmaps && t.minFilter === THREE.LinearFilter && k !== "emissiveMap") {
            t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; mip++;
          }
        }
      }
    });
    return { aniso: cap, tuned: n, mips: mip, total: seen.size };
  }

  root.AEGIS_TUNE = { snapSun, tuneTextures };
})(window);
