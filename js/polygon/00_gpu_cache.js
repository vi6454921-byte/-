/* Offline BC1 mip chain. Only selected opaque diffuse material maps.
   Source textures are retained for unsupported GPU/browser or opt-out. */
(function () {
  "use strict";
  let supported = false;
  const buffers = new Map();
  window.GGPUCache = {
    init(renderer) {
      const gl = renderer.getContext();
      supported =
        !!gl.getExtension("WEBGL_compressed_texture_s3tc") &&
        !!gl.getExtension("WEBGL_compressed_texture_s3tc_srgb");
      return supported;
    },
    stats: () => ({ supported, decoded: buffers.size }),
    texture(THREE, key, srgb) {
      const opts = window.AEGIS_SETTINGS || {};
      if (!opts.gpuCompressed || !supported) return null;
      const e = (window.__AEGIS_BC1 || {})[key];
      if (!e) return null;
      let levels = buffers.get(key);
      if (!levels) {
        const b = atob(e.data),
          u = new Uint8Array(b.length);
        for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        levels = [];
        let w = e.w,
          h = e.h,
          offset = 0;
        for (let i = 0; i < e.mips; i++) {
          const n = Math.ceil(w / 4) * Math.ceil(h / 4) * 8;
          if (offset + n > u.length) return null;
          levels.push({
            data: u.subarray(offset, offset + n),
            width: w,
            height: h,
          });
          offset += n;
          w = Math.max(1, w >> 1);
          h = Math.max(1, h >> 1);
        }
        buffers.set(key, levels);
      }
      const t = new THREE.CompressedTexture(
        levels,
        e.w,
        e.h,
        THREE.RGB_S3TC_DXT1_Format,
      );
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.minFilter =
        levels.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.flipY = false;
      t.needsUpdate = true;
      return t;
    },
  };
})();
