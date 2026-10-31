/* ==========================================================================
   МОДУЛЬ: GGloom — «мрачный лес» (v7)
   ==========================================================================
   Подключается сразу после three.js, до создания материалов.
   1) Сумрак под кронами. Карта крон 256×256 м (1 м/тексель): R — сомкнутость
      полога (размытые диски крон), G — высота земли, B — «низина/сырость»
      (там гуще туман). Во ВСЕ стандартные материалы (Standard/Physical/
      Lambert/Phong) после накопления света встраивается затенение: прямой
      свет под пологом гасится до ~25 %, рассеянный — до ~50 % и уходит в
      холодный сине-зелёный (как в Hunt: Showdown / S.T.A.L.K.E.R.: тени
      «синеют», а не просто темнеют). Действует по высоте над землёй: стволы
      и кроны наверху светлее, низ леса — в сумраке. Бойцы получают
      половину эффекта — силуэт должен читаться.
   2) Тени облаков: медленные пятна по земле (прямой свет).
   3) Сырость: альбедо темнее, поверхности глаже (мокрая кора, листва).
   4) Свет в тумане: вспышки выстрелов и осветительные ракеты подсвечивают
      дымку вдоль луча (аналитический интеграл точечного источника).
   Встраивание — через перехват onBeforeCompile на прототипе Material:
   собственные onBeforeCompile материалов сохраняются, ключ кэша программ
   = исходный ключ + «|gl», поэтому разные шейдеры не склеиваются.
   ========================================================================== */
(function (root) {
  'use strict';
  const THREE = root.THREE;
  if (!THREE || !THREE.Material) return;
  const EXT = 256, N = 256;              // метров / текселей
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { data[i * 4 + 1] = 64; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  const crown = new Float32Array(N * N);

  /* общие uniform: значения — простые объекты {x,y,z,w}, их three не
     копирует при клонировании uniform → один объект на все материалы */
  const P = { x: 1, y: 0.25, z: 0, w: 0.25 };      // x: сила полога, y: тени облаков, z: время, w: сырость
  const W = { x: 0.6, y: 0.35, z: 0, w: 0 };       // ветер для облаков
  const L0 = { x: 0, y: -999, z: 0, w: 0 }, C0 = { x: 1, y: 0.7, z: 0.4, w: 0 };   // вспышка выстрела
  const L1 = { x: 0, y: -999, z: 0, w: 0 }, C1 = { x: 1, y: 0.35, z: 0.25, w: 0 }; // осветительная ракета
  const UNI = {
    uCanopy: { value: tex }, uGloomP: { value: P }, uGloomW: { value: W },
    uFogL0: { value: L0 }, uFogC0: { value: C0 }, uFogL1: { value: L1 }, uFogC1: { value: C1 }
  };

  const PARS = `
uniform sampler2D uCanopy;
uniform vec4 uGloomP, uGloomW, uFogL0, uFogC0, uFogL1, uFogC1;
uniform vec2 uGlK;
float glHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float glNoise( vec2 x ) { vec2 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( glHash( i ), glHash( i + vec2( 1, 0 ) ), f.x ), mix( glHash( i + vec2( 0, 1 ) ), glHash( i + vec2( 1, 1 ) ), f.x ), f.y ); }
`;
  const LIGHT = `
#if defined( USE_FOG )
  {
    vec4 gcn = texture2D( uCanopy, vFogWorld.xz * ${(1 / EXT).toFixed(8)} + 0.5 );
    float gAbove = vFogWorld.y - ( gcn.g * 40.0 - 10.0 );
    float gSh = gcn.r * ( 1.0 - smoothstep( 3.0, 16.0, gAbove ) ) * uGlK.x * uGloomP.x;
    vec2 gq = vFogWorld.xz * 0.012 + uGloomW.xy * uGloomP.z * 0.02;
    float gCl = smoothstep( 0.40, 0.80, glNoise( gq ) * 0.65 + glNoise( gq * 2.3 + 7.1 ) * 0.35 );
    float gDir = ( 1.0 - 0.75 * gSh ) * ( 1.0 - uGloomP.y * gCl );
    reflectedLight.directDiffuse *= gDir;
    reflectedLight.directSpecular *= gDir;
    /* v12: под пологом рассеянный свет — зеленоватый (прошёл сквозь хвою и
       отразился от неё), а не сизо-синий: синий оттенок теней и давал «серость» */
    vec3 gTint = mix( vec3( 1.0 ), vec3( 0.9, 1.0, 0.86 ), gSh );
    reflectedLight.indirectDiffuse *= gTint * ( 1.0 - 0.48 * gSh );
    reflectedLight.indirectSpecular *= gTint * ( 1.0 - 0.55 * gSh );
  }
#endif
`;
  const WET_ALB = `
#if defined( USE_FOG )
  diffuseColor.rgb *= 1.0 - 0.16 * uGloomP.w * uGlK.y;
#endif
`;
  const WET_RGH = `
#if defined( USE_FOG )
  roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.62, uGloomP.w * uGlK.y );
#endif
`;

  function patch(sh, mat) {
    if (!(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) return;
    if (mat.userData && mat.userData.noGloom) return;
    /* мировые координаты тумана (vFogWorld) даёт высотный туман игры (29_game);
       до его установки (заставка, другой рендерер) — без мрака */
    if (!THREE.ShaderChunk || THREE.ShaderChunk.fog_pars_fragment.indexOf('vFogWorld') < 0) return;
    let f = sh.fragmentShader;
    if (f.indexOf('#include <lights_fragment_end>') < 0 || f.indexOf('uCanopy') >= 0) return;
    const K = mat._glU || (mat._glU = { value: new THREE.Vector2(1, 1) });
    Object.assign(sh.uniforms, UNI); sh.uniforms.uGlK = K;
    f = '#define GLOOM\n' + f;
    f = f.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + PARS);
    f = f.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LIGHT);
    if (f.indexOf('#include <emissivemap_fragment>') >= 0) f = f.replace('#include <emissivemap_fragment>', WET_ALB + '#include <emissivemap_fragment>');
    if (f.indexOf('#include <roughnessmap_fragment>') >= 0) f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + WET_RGH);
    sh.fragmentShader = f;
  }

  /* перехват onBeforeCompile */
  const proto = THREE.Material.prototype;
  const base = proto.onBeforeCompile;
  const wrap = (m, fn) => {
    const w = function (sh, r) { if (fn) fn.call(this, sh, r); try { patch(sh, this); } catch (e) { /* без мрака */ } };
    const src = String(fn || base);
    w.toString = () => src + '|gl';
    return w;
  };
  Object.defineProperty(proto, 'onBeforeCompile', {
    configurable: true,
    get() { if (!this.__glW) this.__glW = wrap(this, this.__glF || base); return this.__glW; },
    set(fn) { this.__glF = fn; this.__glW = null; }
  });

  /* ------------------------------------------------ карта крон ------ */
  function buildCanopy(world) {
    const trees = world.trees || [], H = world.heightAt || (() => 0);
    crown.fill(0);
    const s = N / EXT;
    for (const t of trees) {
      const R = 2.6 * (t.rs || 1) * (t.dead ? 0.6 : 1) * s, k = t.dead ? 0.12 : 0.62;
      const cx = (t.x + EXT / 2) * s, cz = (t.z + EXT / 2) * s;
      const x0 = Math.max(0, Math.floor(cx - R - 1)), x1 = Math.min(N - 1, Math.ceil(cx + R + 1));
      const z0 = Math.max(0, Math.floor(cz - R - 1)), z1 = Math.min(N - 1, Math.ceil(cz + R + 1));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / R;
        if (d < 1.25) crown[z * N + x] += k * (d < 0.7 ? 1 : Math.max(0, 1 - (d - 0.7) / 0.55));
      }
    }
    /* размытие (2 прохода бокса r=2): полог сплошной, без «кружков» */
    const tmp = new Float32Array(N * N);
    const blur = (a, b, dx, dz) => {
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        let acc = 0, n = 0;
        for (let k = -2; k <= 2; k++) {
          const xx = x + k * dx, zz = z + k * dz;
          if (xx < 0 || zz < 0 || xx >= N || zz >= N) continue;
          acc += a[zz * N + xx]; n++;
        }
        b[z * N + x] = acc / n;
      }
    };
    for (let i = 0; i < 2; i++) { blur(crown, tmp, 1, 0); blur(tmp, crown, 0, 1); }
    /* высота и низины: местная впадина относительно средней высоты 9×9 м */
    const hh = new Float32Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) hh[z * N + x] = H((x + 0.5) / s - EXT / 2, (z + 0.5) / s - EXT / 2);
    const hb = new Float32Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      let acc = 0, n = 0;
      for (let k = -4; k <= 4; k += 2) for (let j = -4; j <= 4; j += 2) {
        const xx = x + j, zz = z + k;
        if (xx < 0 || zz < 0 || xx >= N || zz >= N) continue;
        acc += hh[zz * N + xx]; n++;
      }
      hb[z * N + x] = acc / n;
    }
    for (let i = 0; i < N * N; i++) {
      const x = i % N, z = (i / N) | 0;
      const wx = (x + 0.5) / s - EXT / 2, wz = (z + 0.5) / s - EXT / 2;
      const wet = world.wetAt ? world.wetAt(wx, wz) : 0;
      const low = Math.min(1, Math.max(0, (hb[i] - hh[i]) * 3.0 + (1.5 - hh[i]) * 0.12) + wet * 0.7);
      data[i * 4] = Math.min(255, crown[i] * 255);
      data[i * 4 + 1] = Math.min(255, Math.max(0, (hh[i] + 10) / 40 * 255));
      data[i * 4 + 2] = Math.min(255, low * 255);
    }
    tex.needsUpdate = true;
  }
  /* сомкнутость полога в точке (для адаптации глаза, звука, тумана) */
  function canopyAt(x, z) {
    const s = N / EXT, fx = (x + EXT / 2) * s - 0.5, fz = (z + EXT / 2) * s - 0.5;
    const ix = Math.max(0, Math.min(N - 2, Math.floor(fx))), iz = Math.max(0, Math.min(N - 2, Math.floor(fz)));
    const ax = Math.min(1, Math.max(0, fx - ix)), az = Math.min(1, Math.max(0, fz - iz));
    const g = (a, b) => data[((iz + b) * N + ix + a) * 4] / 255;
    return (g(0, 0) * (1 - ax) + g(1, 0) * ax) * (1 - az) + (g(0, 1) * (1 - ax) + g(1, 1) * ax) * az;
  }
  const lowAt = (x, z) => {
    const s = N / EXT, ix = Math.max(0, Math.min(N - 1, Math.floor((x + EXT / 2) * s))), iz = Math.max(0, Math.min(N - 1, Math.floor((z + EXT / 2) * s)));
    return data[(iz * N + ix) * 4 + 2] / 255;
  };
  /* сила эффекта для материала: k — полог, wet — сырость (бойцам — половина/ноль) */
  function setK(mat, k, wet) {
    if (!mat) return;
    const U = mat._glU || (mat._glU = { value: new THREE.Vector2(1, 1) });
    U.value.set(k, wet === undefined ? 1 : wet);
  }
  function markTree(obj, k, wet) {
    if (!obj) return;
    obj.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) setK(m, k, wet);
    });
  }

  /* -------------------------------------------- небо: низкие тучи --- */
  /* Фото-небо (equirect → куб) получает слой тяжёлых низких облаков:
     три октавы шума на «потолке» над лесом, медленный дрейф по ветру,
     светлые разрывы ближе к солнцу. Маска — по яркости фото (рисуем
     только по небу, силуэты крон на фото не трогаем). */
  const SKY = { x: 0, y: 0.8, z: 0.4, w: 0.55 }, SKYD = { x: 0.3, y: 0.6, z: 0.5, w: 1 };
  (function sky() {
    const SL = THREE.ShaderLib && THREE.ShaderLib.backgroundCube;
    if (!SL || SL.fragmentShader.indexOf('uSkyA') >= 0) return;
    const k0 = 'texColor.rgb *= backgroundIntensity;';
    if (SL.fragmentShader.indexOf(k0) < 0) return;
    SL.uniforms.uSkyA = { value: SKY }; SL.uniforms.uSkyD = { value: SKYD };
    SL.fragmentShader = SL.fragmentShader
      .replace('varying vec3 vWorldDirection;', `varying vec3 vWorldDirection;
uniform vec4 uSkyA, uSkyD;
float skH( vec2 p ) { p = fract( p * vec2( 233.34, 851.73 ) ); p += dot( p, p + 23.45 ); return fract( p.x * p.y ); }
float skN( vec2 x ) { vec2 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( skH( i ), skH( i + vec2( 1, 0 ) ), f.x ), mix( skH( i + vec2( 0, 1 ) ), skH( i + vec2( 1, 1 ) ), f.x ), f.y ); }
float skF( vec2 p ) { float a = 0.0, w = 0.55; for ( int i = 0; i < 4; i++ ) { a += skN( p ) * w; p = p * 2.07 + vec2( 3.1, 1.7 ); w *= 0.5; } return a; }`)
      .replace(k0, `{
      vec3 d = normalize( vWorldDirection );
      if ( uSkyD.w < 0.5 ) {
        /* v24: ясно — редкие кучевые облака СВЕТЛЕЕ неба (освещены солнцем,
           серебристый край к солнцу, сероватое основание), у горизонта тают в
           дымке; солнце — диск и ореол (Ми). Небо не затемняется. */
        vec3 sd = normalize( uSkyD.xyz );
        float sunD = max( 0.0, dot( d, sd ) );
        float up = smoothstep( -0.01, 0.22, d.y );
        float cov = 0.0;
        if ( uSkyA.y > 0.001 && d.y > -0.02 ) {
          vec2 p = d.xz / ( d.y + 0.12 ) * 0.9 + vec2( uSkyA.x * 0.008, uSkyA.x * 0.005 );
          float f = skF( p ) + 0.3 * skF( p * 2.9 - uSkyA.x * 0.015 );
          cov = smoothstep( 0.80 - uSkyA.y * 0.34, 1.02 - uSkyA.y * 0.26, f ) * up;
          float core = smoothstep( 0.92, 1.30, f );
          float hl = dot( texColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          vec3 cloud = vec3( 1.0, 0.99, 0.97 ) * hl * ( 1.65 + 0.9 * core ) * ( 1.0 + 0.55 * pow( sunD, 5.0 ) );
          cloud = mix( cloud, cloud * vec3( 0.80, 0.83, 0.88 ), smoothstep( 1.05, 1.45, f ) * 0.6 );
          texColor.rgb = mix( texColor.rgb, cloud, cov * 0.92 );
        }
        float glow = pow( sunD, 1400.0 ) * 6.0 + pow( sunD, 90.0 ) * 0.55 + pow( sunD, 8.0 ) * 0.16;
        float disk = smoothstep( 0.99984, 0.99992, sunD );
        texColor.rgb += vec3( 1.0, 0.93, 0.82 ) * ( glow * ( 1.0 - 0.7 * cov ) + disk * 70.0 * ( 1.0 - cov ) ) * smoothstep( -0.03, 0.02, d.y );
      } else if ( uSkyA.y > 0.001 && d.y > -0.02 ) {
        vec2 p = d.xz / ( d.y + 0.16 ) * 1.35 + vec2( uSkyA.x * 0.010, uSkyA.x * 0.006 );
        float f = skF( p ) + 0.25 * skF( p * 3.1 - uSkyA.x * 0.02 );
        float cov = smoothstep( 0.62 - uSkyA.y * 0.42, 1.02 - uSkyA.y * 0.32, f );
        float lum = dot( texColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        float skyM = smoothstep( 0.18, 0.55, lum ) * smoothstep( -0.02, 0.10, d.y );
        float sunD = max( 0.0, dot( d, normalize( uSkyD.xyz ) ) );
        /* разрывы: где облако тонкое и близко к солнцу — свет пробивается */
        float gap = ( 1.0 - cov ) * pow( sunD, 6.0 ) * uSkyA.z;
        vec3 cloud = texColor.rgb * mix( vec3( 0.50, 0.53, 0.57 ), vec3( 0.75, 0.78, 0.80 ), smoothstep( 0.9, 1.4, f ) ) * ( 1.0 - uSkyA.w * 0.45 );
        texColor.rgb = mix( texColor.rgb, cloud, cov * skyM );
        texColor.rgb *= 1.0 + gap * skyM * 1.6;
        texColor.rgb *= mix( 1.0, 1.0 - uSkyA.w * 0.35, skyM );
      }
    }
    ` + k0);
  })();

  root.GGloom = { tex, EXT, N, P, W, L0, C0, L1, C1, SKY, SKYD, UNI, buildCanopy, canopyAt, lowAt, setK, markTree };
})(typeof self !== 'undefined' ? self : this);
