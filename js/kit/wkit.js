/* AEGIS · оружейный набор: движок оружейной (модели, модули, баллистика, звук, сцена)
   + описания всех 8 образцов. Собрано из исходных weapons/*.html. */
(function () {
'use strict';
// Фонарь и ЛЦУ в оружейной — на тех же клавишах, что и в бою (настройки игры).
// Раньше здесь были жёсткие C и Z — те же, что «присесть» и «лечь».
const __AB = (() => {
  let b = {};
  try { b = (JSON.parse(localStorage.getItem("aegis.settings") || "{}") || {}).binds || {}; } catch (e) { b = {}; }
  const light = typeof b.light === "string" ? b.light : "KeyT", laser = typeof b.laser === "string" ? b.laser : "KeyL";
  const name = (c) => String(c || "").replace(/^Key/, "").replace(/^Digit/, "");
  return { light, laser, L: name(light), Z: name(laser) };
})();

var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
// ==== engine/scene.js
const THREE = window.THREE;
const { RectAreaLightUniformsLib } = window.THREE_ADDONS["lights/RectAreaLightUniformsLib.js"];
const { mergeGeometries } = window.THREE_ADDONS["utils/BufferGeometryUtils.js"];
const { EffectComposer } = window.THREE_ADDONS["postprocessing/EffectComposer.js"];
const { RenderPass } = window.THREE_ADDONS["postprocessing/RenderPass.js"];
const { GTAOPass } = window.THREE_ADDONS["postprocessing/GTAOPass.js"];
const { UnrealBloomPass } = window.THREE_ADDONS["postprocessing/UnrealBloomPass.js"];
const { OutputPass } = window.THREE_ADDONS["postprocessing/OutputPass.js"];
// Защита HDR-буфера (half float, предел 65504). Острый GGX-блик от точечного света вспышки на стекле
// или латуни даёт Inf, вырожденная нормаль — NaN; UnrealBloom разносит такой пиксель по мип-цепочке
// в чёрный прямоугольник на пол-экрана. Ограничение 16384 после ACES неотличимо от белого.
var HDR_SAFE = (v, mx = "16384.0") => `${v} = clamp(${v}, 0.0, ${mx}); if (any(isnan(${v}))) ${v} = vec3(0.0);`;
// вариант для RawShaderMaterial на GLSL ES 1.0 (нет isnan): NaN не равен сам себе
var HDR_SAFE1 = (v) => `${v} = clamp(${v}, 0.0, 16384.0); if (!(${v}.r == ${v}.r && ${v}.g == ${v}.g && ${v}.b == ${v}.b)) ${v} = vec3(0.0);`;
THREE.ShaderChunk.opaque_fragment = THREE.ShaderChunk.opaque_fragment.replace("gl_FragColor = vec4( outgoingLight", HDR_SAFE("outgoingLight") + "\ngl_FragColor = vec4( outgoingLight");
function hdrGuardPass(mat, line) {
  if (!mat.fragmentShader.includes(line)) return;
  // вход bloom ограничен сильнее: одиночный пересвеченный пиксель иначе размывается в квадрат свечения
  mat.fragmentShader = mat.fragmentShader.replace(line, line + "\n" + HDR_SAFE("texel.rgb", "64.0"));
  mat.needsUpdate = true;
}
var GUN_Y = 1.42;
var RANGE = { back: -4.2, end: 102, halfW: 6, ceil: 3.6, line: 0.62 };
var LUX = 1 / 200;
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296;
}
function canvasTex(w, h, draw2, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw2(c.getContext("2d", { willReadFrequently: true }), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function blotches(g, w, h, n, r0, r1, col, a0, a1, R4) {
  for (let i = 0; i < n; i++) {
    const x = R4() * w, y = R4() * h, r = r0 + R4() * (r1 - r0);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const a = a0 + R4() * (a1 - a0);
    gr.addColorStop(0, `rgba(${col},${a})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
  }
}
function speckle(g, w, h, n, lo, hi, a, R4, s0 = 0.5, s1 = 2) {
  for (let i = 0; i < n; i++) {
    const v = lo + R4() * (hi - lo);
    g.fillStyle = `rgba(${v},${v},${v},${R4() * a})`;
    const s = s0 + R4() * (s1 - s0);
    g.fillRect(R4() * w, R4() * h, s, s);
  }
}
function floorTex() {
  const R4 = rng(7);
  const map = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = "#77756f";
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, 90, 40, 220, "96,94,88", 0.05, 0.22, R4);
    blotches(g, w, h, 70, 30, 160, "140,137,128", 0.04, 0.16, R4);
    blotches(g, w, h, 18, 10, 60, "45,42,38", 0.08, 0.25, R4);
    speckle(g, w, h, 6e4, 70, 160, 0.35, R4);
    g.strokeStyle = "rgba(150,148,140,0.05)";
    for (let i = 0; i < 160; i++) {
      g.lineWidth = 6 + R4() * 20;
      g.beginPath();
      g.arc(R4() * w, R4() * h, 80 + R4() * 200, R4() * 6, R4() * 6 + 1.5);
      g.stroke();
    }
    g.fillStyle = "rgba(30,30,30,.85)";
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, 0, 3, h);
  });
  const rough = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#9a9a9a";
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, 80, 20, 120, "60,60,60", 0.1, 0.35, R4);
    blotches(g, w, h, 40, 20, 90, "220,220,220", 0.1, 0.3, R4);
    speckle(g, w, h, 12e3, 120, 255, 0.5, R4);
  }, false);
  return { map, rough };
}
function blockTex() {
  const R4 = rng(21);
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = "#a9a7a0";
    g.fillRect(0, 0, w, h);
    const bw = w / 4, bh = h / 4;
    for (let r = 0; r < 4; r++) for (let c = -1; c < 5; c++) {
      const x = c * bw + r % 2 * bw / 2, y = r * bh;
      const v = 178 + R4() * 18;
      g.fillStyle = `rgb(${v},${v - 2},${v - 8})`;
      g.fillRect(x + 4, y + 4, bw - 8, bh - 8);
    }
    speckle(g, w, h, 4e4, 120, 210, 0.3, R4, 0.5, 2.5);
    blotches(g, w, h, 30, 20, 140, "120,116,105", 0.04, 0.14, R4);
  });
}
function acousticTex() {
  const R4 = rng(33);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#34363a";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3e4, 30, 90, 0.5, R4, 0.6, 1.6);
    g.fillStyle = "rgba(0,0,0,.5)";
    for (let y = 8; y < h; y += 12) for (let x = 8 + y / 12 % 2 * 6; x < w; x += 12) {
      g.beginPath();
      g.arc(x, y, 2.2, 0, 7);
      g.fill();
    }
    g.fillStyle = "rgba(15,15,16,.9)";
    g.fillRect(0, 0, w, 5);
    g.fillRect(0, 0, 5, h);
    blotches(g, w, h, 12, 20, 90, "90,86,78", 0.03, 0.08, R4);
  });
}
function woodTex(seed = 55) {
  const R4 = rng(seed);
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = "#8b7355";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      const v = (R4() - 0.5) * 30;
      g.fillStyle = `rgba(${90 + v},${70 + v},${48 + v},.35)`;
      g.fillRect(0, y, w, 1 + R4() * 2);
    }
    speckle(g, w, h, 5e3, 50, 120, 0.25, R4);
    blotches(g, w, h, 20, 10, 60, "40,30,20", 0.1, 0.3, R4);
  });
}
function boothTex() {
  const R4 = rng(91);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#8f9290";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5e4, 100, 170, 0.35, R4, 0.5, 1.5);
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = `rgba(0,0,0,${0.03 + R4() * 0.03})`;
      g.fillRect(0, y, w, 1);
    }
    blotches(g, w, h, 25, 20, 90, "70,70,68", 0.05, 0.15, R4);
    g.fillStyle = "#3b3d3f";
    g.fillRect(0, 0, w, 14);
    g.fillRect(0, h - 14, w, 14);
    g.fillRect(0, 0, 14, h);
    g.fillRect(w - 14, 0, 14, h);
    g.fillStyle = "#1e1f20";
    for (const [x, y] of [[7, 7], [w - 7, 7], [7, h - 7], [w - 7, h - 7], [w / 2, 7], [w / 2, h - 7]]) {
      g.beginPath();
      g.arc(x, y, 3.5, 0, 7);
      g.fill();
    }
  });
}
function signTex(text, o = {}) {
  return canvasTex(o.w || 512, o.h || 192, (g, w, h) => {
    g.fillStyle = o.bg || "#e8e3d4";
    g.fillRect(0, 0, w, h);
    g.fillStyle = o.fg || "#1e1e1e";
    g.font = `bold ${o.size || 96}px Arial`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 4);
  });
}
function envScene(night) {
  const s = new THREE.Scene();
  const dim = night ? 4e-3 : 1;
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, RANGE.ceil, RANGE.halfW * 2), new THREE.MeshBasicMaterial({ color: 7170918, side: THREE.BackSide }));
  room.material.color.multiplyScalar(dim);
  room.position.set(14, RANGE.ceil / 2 - GUN_Y, 0);
  s.add(room);
  const plane = (w, d, color, k, x, y, z, rx = Math.PI / 2) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.material.color.multiplyScalar(k);
    m.rotation.x = rx;
    m.position.set(x, y, z);
    s.add(m);
    return m;
  };
  plane(40, RANGE.halfW * 2, 5592143, dim, 14, -GUN_Y + 0.01, 0);
  plane(40, RANGE.halfW * 2, 2500394, dim, 14, RANGE.ceil - GUN_Y - 0.01, 0);
  if (!night) {
    for (const x of [4, 8, 12, 16, 20, 24]) plane(0.25, 9, 16774114, 9, x, RANGE.ceil - GUN_Y - 0.05, 0);
    for (const x of [-2.6, -0.9]) for (const z of [-2.4, 0, 2.4]) plane(1.2, 0.6, 16774114, 8, x, RANGE.ceil - GUN_Y - 0.06, z);
    for (let x = 3; x < 30; x += 4) plane(1.5, 9, 14674679, 5, x + 1.65, RANGE.ceil - GUN_Y + 0.3, 0);
  } else {
    plane(0.5, 0.2, 4259712, 2.5, RANGE.back + 0.05, 2.3 - GUN_Y, -3, 0).rotation.y = Math.PI / 2;
  }
  return s;
}
function createScene(canvasHost) {
  // Сглаживание — MSAA в HDR-буфере композитора; MSAA самого холста только тратило память и
  // пропускную способность на каждом кадре (в него пишет лишь финальный полноэкранный проход).
  const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  canvasHost.appendChild(renderer.domElement);
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envDay = pmrem.fromScene(envScene(false), 0.035).texture;
  const envNight = pmrem.fromScene(envScene(true), 0.035).texture;
  scene.environment = envDay;
  scene.environmentIntensity = 1.05;
  scene.fog = new THREE.FogExp2(7828847, 45e-4);
  const hemi = new THREE.HemisphereLight(16774374, 6117970, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(16773856, 2.1);
  sun.position.set(-0.7, RANGE.ceil - 0.15, 0.7);
  sun.target.position.set(0, GUN_Y, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -1.1;
  sc.right = 1.1;
  sc.top = 1.1;
  sc.bottom = -1.1;
  sc.near = 0.2;
  sc.far = 6;
  sun.shadow.bias = -4e-4;
  sun.shadow.normalBias = 0.012;
  scene.add(sun, sun.target);
  const area = new THREE.RectAreaLight(16774114, 5.5, 1.2, 0.6);
  area.position.set(-0.9, RANGE.ceil - 0.08, 0);
  area.lookAt(-0.9, 0, 0);
  scene.add(area);
  const down = new THREE.DirectionalLight(16773340, 1.3);
  down.position.set(-10, 20, 3);
  down.target.position.set(40, 0, 0);
  scene.add(down, down.target);
  const fill = new THREE.DirectionalLight(16774374, 0.7);
  fill.position.set(0.5, 0.6, 3);
  fill.target.position.set(0, GUN_Y, 0);
  scene.add(fill, fill.target);
  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 8e-3, 400);
  camera.position.set(-0.25, GUN_Y + 0.25, 1.35);
  const range = buildRange(scene);
  const rangeUpdate = range.update;
  const sunDir = new THREE.Vector3(0.22, -1, -0.62).normalize();
  const sky = new THREE.DirectionalLight(16773336, 7);
  sky.position.set(49, 0, 0).addScaledVector(sunDir, -30);
  sky.target.position.set(49, 0, 0);
  sky.castShadow = true;
  sky.shadow.mapSize.set(4096, 4096);
  Object.assign(sky.shadow.camera, { left: -76, right: 76, top: 76, bottom: -76, near: 1, far: 70 });
  sky.shadow.bias = -6e-4;
  sky.shadow.normalBias = 0.03;
  scene.add(sky, sky.target);
  const shaftU = { uCol: { value: new THREE.Color(16773336).multiplyScalar(0.05) }, uTime: { value: 0 } };
  const shaftM = new THREE.ShaderMaterial({
    uniforms: shaftU,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform vec3 uCol; uniform float uTime; varying vec3 vW;
      float h3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
        return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        float h = clamp(vW.y / ${RANGE.ceil.toFixed(1)}, 0., 1.);
        float d = 0.55 + 0.9 * n3(vW * 1.7 + vec3(0., uTime * 0.03, 0.));
        vec3 c = uCol * d * (0.35 + 0.65 * h);
        ${HDR_SAFE("c")}
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  {
    const G2 = [];
    const t = RANGE.ceil / -sunDir.y;
    for (const [x0, x1, z0, z1] of range.skylights) {
      const top = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => new THREE.Vector3(x, RANGE.ceil, z));
      const bot = top.map((v) => v.clone().addScaledVector(sunDir, t));
      const pos = [];
      for (let i = 0; i < 4; i++) {
        const a = top[i], b = top[(i + 1) % 4], c = bot[(i + 1) % 4], d = bot[i];
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      G2.push(g);
    }
    const shafts = new THREE.Mesh(mergeGeometries(G2), shaftM);
    shafts.renderOrder = 1;
    shafts.userData.noAO = true;
    shafts.frustumCulled = false;
    scene.add(shafts);
  }
  const DAY = { hemi: 0.5, sun: 2.1, area: 5.5, down: 0.9, fill: 0.7, env: 1.05, fog: 7828847, sky: 7, shaft: 0.04 };
  const NIGHT = { hemi: 5e-3, sun: 0, area: 0, down: 0, fill: 15e-4, env: 1, fog: 263173, sky: 0.03, shaft: 2e-3 };
  let night = false;
  const setNight = (on) => {
    night = !!on;
    const P = night ? NIGHT : DAY;
    hemi.intensity = P.hemi;
    sun.intensity = P.sun;
    area.intensity = P.area;
    down.intensity = P.down;
    fill.intensity = P.fill;
    hemi.color.set(night ? 9413320 : 16774374);
    fill.color.set(night ? 10466520 : 16774374);
    scene.environment = night ? envNight : envDay;
    scene.environmentIntensity = P.env;
    scene.fog.color.set(P.fog);
    sky.intensity = P.sky;
    sky.color.set(night ? 10335456 : 16773336);
    shaftU.uCol.value.copy(sky.color).multiplyScalar(P.shaft);
    range.setNight(night);
  };
  const ambient = () => night ? 4e-3 : 2.6;
  const rt = new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, stencilBuffer: true, depthBuffer: true, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.overrideVisibility = function() {
    const cache2 = this._visibilityCache;
    this.scene.traverse((o) => {
      cache2.set(o, o.visible);
      const m = o.material;
      if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO || o.userData.reticle || m && (m.transparent || m.isShaderMaterial)) o.visible = false;
    });
  };
  gtao.updateGtaoMaterial({ radius: 0.07, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.25, 0.45, 1.2);
  composer.addPass(bloom);
  hdrGuardPass(bloom.materialHighPassFilter, "vec4 texel = texture2D( tDiffuse, vUv );");
  const outPass = new OutputPass();
  // Пост-обработка без промежуточных полноэкранных проходов. Раньше GTAO копировал кадр во второй
  // буфер и домножал его на AO, bloom дорисовывал свечение поверх — три лишних чтения/записи кадра
  // в HDR, да ещё в MSAA-буфер 4× (буферы композитора менялись ролями каждый кадр). Теперь AO и
  // свечение применяются в самом OutputPass (AO — ещё и на входе bloom) по той же формуле и с той же
  // выборкой текстур: картинка та же, а в полном разрешении остаётся один проход. Второй буфер
  // композитора больше не используется и на GPU не выделяется.
  const aoTex = gtao.pdRenderTarget.texture, bloomTex = bloom.renderTargetsHorizontal[0].texture;
  gtao.output = GTAOPass.OUTPUT.Off;
  gtao.needsSwap = false;
  const hp = bloom.materialHighPassFilter;
  Object.assign(hp.uniforms, { tAO: { value: aoTex }, uAOk: { value: 0 } });
  hp.fragmentShader = hp.fragmentShader.replace("uniform sampler2D tDiffuse;", "uniform sampler2D tDiffuse;\nuniform sampler2D tAO;\nuniform float uAOk;").replace("vec4 texel = texture2D( tDiffuse, vUv );", "vec4 texel = texture2D( tDiffuse, vUv );\ntexel.rgb *= mix( vec3( 1.0 ), texture2D( tAO, vUv ).rgb, uAOk );");
  const bloomQuadRender = bloom.fsQuad.render.bind(bloom.fsQuad);
  bloom.fsQuad.render = (r) => {
    if (bloom.fsQuad.material !== bloom.blendMaterial) bloomQuadRender(r);
  };
  Object.assign(outPass.material.uniforms, { tAO: { value: aoTex }, uAOk: { value: 0 }, tBloom: { value: bloomTex }, uBloomK: { value: 0 } });
  // свечение раньше накладывалось смешиванием AdditiveBlending (SRC_ALPHA, ONE) — отсюда множитель .a
  outPass.material.fragmentShader = outPass.material.fragmentShader.replace("uniform sampler2D tDiffuse;", "uniform sampler2D tDiffuse;\nuniform sampler2D tAO, tBloom;\nuniform float uAOk, uBloomK;").replace("gl_FragColor = texture2D( tDiffuse, vUv );", "vec4 texel = texture2D( tDiffuse, vUv );\ntexel.rgb *= mix( vec3( 1.0 ), texture2D( tAO, vUv ).rgb, uAOk );\nvec4 bl = texture2D( tBloom, vUv );\ntexel.rgb += bl.rgb * bl.a * uBloomK;\n" + HDR_SAFE1("texel.rgb") + "\ngl_FragColor = texel;");
  outPass.needsSwap = false;
  composer.addPass(outPass);
  // сцена рисуется в readBuffer (у EffectComposer это renderTarget2); MSAA нужен только ему
  composer.writeBuffer.samples = 0;
  const post = { composer, gtao, bloom };
  // Уровни качества. «Высокое» — исходная картинка: AO в полном разрешении, 16 сэмплов, MSAA 4×,
  // тени 4096/2048. Ниже — те же эффекты дешевле: AO в половинном разрешении с меньшим числом
  // сэмплов, реже MSAA, меньше карты теней и пиксельная плотность. Ничего не выключается целиком.
  const QUALITY = [
    { id: "low", label: "Низкое", dpr: 1, ao: 0.5, aoS: 8, pdS: 6, msaa: 2, sky: 2048, sun: 1024, spot: 1024, steps: 20, motes: 350, bloom: 0.5 },
    { id: "mid", label: "Среднее", dpr: 1.5, ao: 0.5, aoS: 12, pdS: 8, msaa: 4, sky: 4096, sun: 2048, spot: 1024, steps: 28, motes: 600 },
    { id: "high", label: "Высокое", dpr: 2, ao: 1, aoS: 16, pdS: 16, msaa: 4, sky: 4096, sun: 2048, spot: 2048, steps: 40, motes: 900 }
  ];
  let qi = 2;
  // свечение и так размыто: на «низком» его цепочка мипов начинается с четверти разрешения
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(1, Math.round(w * (QUALITY[qi].bloom ?? 1))), Math.max(1, Math.round(h * (QUALITY[qi].bloom ?? 1))));
  const gtaoSetSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => gtaoSetSize(Math.max(1, Math.round(w * QUALITY[qi].ao)), Math.max(1, Math.round(h * QUALITY[qi].ao)));
  const shadowSize = (light, n) => {
    if (light.shadow.mapSize.x === n) return;
    light.shadow.mapSize.set(n, n);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.shadow.needsUpdate = true;
  };
  // Небесный свет освещает статичный тир: его карта 4096² перерисовывается только по запросу
  // (старт, смена качества, качнувшиеся мишени), а не каждый активный кадр.
  sky.shadow.autoUpdate = false;
  sky.shadow.needsUpdate = true;
  range.update = (dt) => {
    if (rangeUpdate(dt)) sky.shadow.needsUpdate = true;
  };
  const setQuality = (i) => {
    qi = Math.max(0, Math.min(QUALITY.length - 1, i));
    const q = QUALITY[qi];
    gtao.updateGtaoMaterial({ samples: q.aoS });
    gtao.updatePdMaterial({ samples: q.pdS });
    for (const t of [composer.readBuffer]) if (t.samples !== q.msaa) {
      t.samples = q.msaa;
      t.dispose();
    }
    shadowSize(sky, q.sky);
    shadowSize(sun, q.sun);
    resize();
    return q;
  };
  const render = () => {
    shaftU.uTime.value = performance.now() / 1e3;
    const e = renderer.toneMappingExposure;
    bloom.threshold = 1.15 / e;
    bloom.strength = night ? 0.55 : 0.22;
    gtao.blendIntensity = night ? 0.4 : 0.85;
    const aoK = gtao.enabled ? gtao.blendIntensity : 0;
    hp.uniforms.uAOk.value = aoK;
    const ou = outPass.material.uniforms;
    ou.uAOk.value = aoK;
    ou.uBloomK.value = bloom.enabled ? 1 : 0;
    composer.render();
  };
  const resize = () => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(innerWidth, innerHeight);
  };
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    resize();
  });
  return { renderer, scene, camera, sun, sky, range, env: envDay, setNight, ambient, render, resize, post, QUALITY, setQuality,
    get quality() {
      return QUALITY[qi];
    },
    get night() {
      return night;
    } };
}
function buildRange(scene) {
  const grp = new THREE.Group();
  scene.add(grp);
  const { back, end, halfW, ceil, line } = RANGE;
  const L = end - back, cx = (end + back) / 2;
  const hitables = [];
  const add = (m, surface, hit2 = true) => {
    m.userData.surface = surface;
    grp.add(m);
    if (hit2) hitables.push(m);
    return m;
  };
  const ft = floorTex();
  ft.map.repeat.set(L / 4, halfW * 2 / 4);
  ft.rough.repeat.set(L / 3, halfW * 2 / 3);
  const floorM = new THREE.MeshStandardMaterial({ map: ft.map, roughnessMap: ft.rough, roughness: 0.62, metalness: 0, envMapIntensity: 0.5 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, halfW * 2), floorM);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, 0);
  add(floor, "concrete");
  const paint = (w, d, color, x, z, rough = 0.5) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: rough, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 2e-3, z);
    grp.add(m);
    return m;
  };
  paint(0.1, halfW * 2, 13214247, line, 0);
  paint(0.05, halfW * 2, 11023403, line + 0.9, 0);
  for (const z of [-3.6, -1.2, 1.2, 3.6]) paint(end - line - 2, 0.05, 14210248, (end + line) / 2, z, 0.6);
  for (const d of [5, 10, 15, 25, 50, 75, 100]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshStandardMaterial({ map: signTex(d + " м", { bg: "#77756f", fg: "#e4dfd0", size: 120 }), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    t.rotation.x = -Math.PI / 2;
    t.rotation.z = Math.PI / 2;
    t.position.set(line + d, 3e-3, halfW - 0.6);
    grp.add(t);
  }
  const bt = blockTex();
  bt.repeat.set(L / 1.6, ceil / 0.8);
  const wallM = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.9, envMapIntensity: 0.4 });
  const at = acousticTex();
  at.repeat.set(12, 2);
  const panelM = new THREE.MeshStandardMaterial({ map: at, roughness: 0.95, envMapIntensity: 0.3 });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(L, ceil), wallM);
    w.position.set(cx, ceil / 2, s * halfW);
    w.rotation.y = s > 0 ? Math.PI : 0;
    add(w, "concrete");
    const p = new THREE.Mesh(new THREE.BoxGeometry(18, 2.2, 0.06), panelM);
    p.position.set(back + 9.2, 1.5, s * (halfW - 0.03));
    add(p, "panel");
  }
  const at2 = at.clone();
  at2.repeat.set(6, 2);
  at2.needsUpdate = true;
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, ceil), new THREE.MeshStandardMaterial({ map: at2, roughness: 0.95, envMapIntensity: 0.3 }));
  bw.position.set(back, ceil / 2, 0);
  bw.rotation.y = Math.PI / 2;
  add(bw, "panel", false);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.1, 1), new THREE.MeshStandardMaterial({ color: 5922659, roughness: 0.5, metalness: 0.6 }));
  door.position.set(back + 0.03, 1.05, -3);
  grp.add(door);
  const exitT = signTex("ВЫХОД", { bg: "#0f7a3a", fg: "#e8ffe8", size: 110 });
  const exitM = new THREE.MeshStandardMaterial({ map: exitT, emissiveMap: exitT, emissive: 16777215, emissiveIntensity: 0.9, roughness: 0.4 });
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), exitM);
  exit.position.set(back + 0.07, 2.3, -3);
  exit.rotation.y = Math.PI / 2;
  grp.add(exit);
  const gapM = new THREE.MeshBasicMaterial({ color: 16769712 });
  const gap = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.012), gapM);
  gap.position.set(back + 0.065, 6e-3, -3);
  gap.rotation.y = Math.PI / 2;
  grp.add(gap);
  const skylights = [];
  for (let x = 3; x < 30; x += 4) skylights.push([x + 0.9, x + 2.4, -4.5, 4.5]);
  const cs = new THREE.Shape();
  cs.moveTo(back, -halfW);
  cs.lineTo(end, -halfW);
  cs.lineTo(end, halfW);
  cs.lineTo(back, halfW);
  cs.closePath();
  for (const [x0, x1, z0, z1] of skylights) {
    const h = new THREE.Path();
    h.moveTo(x0, z0);
    h.lineTo(x0, z1);
    h.lineTo(x1, z1);
    h.lineTo(x1, z0);
    h.closePath();
    cs.holes.push(h);
  }
  const ceilMesh = new THREE.Mesh(new THREE.ShapeGeometry(cs), new THREE.MeshStandardMaterial({ color: 2039842, roughness: 0.95 }));
  ceilMesh.rotation.x = Math.PI / 2;
  ceilMesh.position.y = ceil;
  ceilMesh.castShadow = true;
  add(ceilMesh, "concrete");
  const curbM = new THREE.MeshStandardMaterial({ color: 9277329, roughness: 0.6, metalness: 0.4 });
  const curbG = [], paneG = [];
  for (const [x0, x1, z0, z1] of skylights) {
    const H = 0.45, xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
    curbG.push(new THREE.BoxGeometry(x1 - x0 + 0.1, H, 0.05).translate(xm, ceil + H / 2, z0 - 0.025));
    curbG.push(new THREE.BoxGeometry(x1 - x0 + 0.1, H, 0.05).translate(xm, ceil + H / 2, z1 + 0.025));
    curbG.push(new THREE.BoxGeometry(0.05, H, z1 - z0).translate(x0 - 0.025, ceil + H / 2, zm));
    curbG.push(new THREE.BoxGeometry(0.05, H, z1 - z0).translate(x1 + 0.025, ceil + H / 2, zm));
    for (let i = 1; i < 6; i++) curbG.push(new THREE.BoxGeometry(x1 - x0, 0.06, 0.05).translate(xm, ceil + H - 0.03, z0 + (z1 - z0) * i / 6));
    curbG.push(new THREE.BoxGeometry(0.05, 0.06, z1 - z0).translate(xm, ceil + H - 0.03, zm));
    paneG.push(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2).translate(xm, ceil + H, zm));
  }
  const curbs = new THREE.Mesh(mergeGeometries(curbG), curbM);
  curbs.castShadow = true;
  grp.add(curbs);
  const skyM = new THREE.MeshBasicMaterial({ color: 14674679 });
  skyM.color.multiplyScalar(5);
  grp.add(new THREE.Mesh(mergeGeometries(paneG), skyM));
  const wt = woodTex();
  wt.repeat.set(6, 1);
  const bafG = [], fixtures = [];
  for (let x = 3; x < end - 4; x += x < 30 ? 4 : 8) {
    bafG.push(new THREE.BoxGeometry(0.03, 1, halfW * 2 - 0.1).rotateZ(-0.52).translate(x, ceil - 0.5, 0));
    fixtures.push(x + (x < 30 ? 3.1 : 4));
  }
  const baffles = new THREE.Mesh(mergeGeometries(bafG), new THREE.MeshStandardMaterial({ map: wt, color: 9079434, roughness: 0.85 }));
  baffles.castShadow = true;
  add(baffles, "wood");
  const fixM = new THREE.MeshStandardMaterial({ color: 2236962, emissive: 16774114, emissiveIntensity: 2.2, roughness: 0.4 });
  const housingM = new THREE.MeshStandardMaterial({ color: 10132896, roughness: 0.4, metalness: 0.7 });
  const fixG = [], houseG = [];
  const bar = (x, y, z, w, d) => {
    houseG.push(new THREE.BoxGeometry(w + 0.04, 0.05, d + 0.04).translate(x, y + 0.03, z));
    fixG.push(new THREE.BoxGeometry(w, 0.012, d).translate(x, y, z));
  };
  for (const x of fixtures) bar(x, ceil - 0.06, 0, 0.14, halfW * 2 - 1.5);
  for (const x of [-2.6, -0.9]) for (const z of [-2.4, 0, 2.4]) bar(x, ceil - 0.06, z, 1.2, 0.6);
  grp.add(new THREE.Mesh(mergeGeometries(houseG), housingM));
  grp.add(new THREE.Mesh(mergeGeometries(fixG), fixM));
  const boothM = new THREE.MeshStandardMaterial({ map: boothTex(), roughness: 0.85, metalness: 0.05 });
  for (const z of [-3.6, -1.2, 1.2, 3.6]) {
    for (const s of [-1, 1]) {
      const inner = z === 1.2 && s > 0 || z === -1.2 && s < 0;
      if (Math.abs(z) === 1.2 && !inner) continue;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.9), boothM);
      p.position.set(line - 0.85, 1.05, z);
      p.rotation.y = s > 0 ? Math.PI : 0;
      p.userData.noShadow = true;
      grp.add(p);
    }
  }
  const st = woodTex(77);
  st.repeat.set(1, 18);
  st.rotation = Math.PI / 2;
  const shelf = new THREE.Mesh(new THREE.PlaneGeometry(0.45, halfW * 2 - 0.2), new THREE.MeshStandardMaterial({ map: st, roughness: 0.7 }));
  shelf.rotation.x = -Math.PI / 2;
  shelf.position.set(line - 0.25, 0.95, 0);
  add(shelf, "wood");
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, halfW * 2 - 0.2), new THREE.MeshStandardMaterial({ color: 2763565, roughness: 0.5, metalness: 0.6 }));
  edge.position.set(line - 0.02, 0.93, 0);
  grp.add(edge);
  const shelfFront = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2 - 0.2, 0.93), boothM);
  shelfFront.position.set(line, 0.465, 0);
  shelfFront.rotation.y = Math.PI / 2;
  grp.add(shelfFront);
  shelfFront.material = new THREE.MeshStandardMaterial({ color: 4869456, roughness: 0.7, metalness: 0.2 });
  const trapG = [];
  for (let i = 0; i < 7; i++) trapG.push(new THREE.BoxGeometry(0.02, 0.62, halfW * 2).rotateZ(0.55).translate(end - 0.3 - i % 2 * 0.15, 0.3 + i * 0.5, 0));
  add(new THREE.Mesh(mergeGeometries(trapG), new THREE.MeshStandardMaterial({ color: 3815992, roughness: 0.55, metalness: 0.75 })), "trap");
  const trapWall = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, ceil), new THREE.MeshStandardMaterial({ color: 1381653, roughness: 0.9 }));
  trapWall.position.set(end, ceil / 2, 0);
  trapWall.rotation.y = -Math.PI / 2;
  add(trapWall, "trap");
  const targets = [];
  const steelM = new THREE.MeshStandardMaterial({ color: 14736591, roughness: 0.55, metalness: 0.3 });
  const postM = new THREE.MeshStandardMaterial({ color: 3816252, roughness: 0.7, metalness: 0.4 });
  const ipsc = new THREE.Shape();
  ipsc.moveTo(-0.15, 0);
  ipsc.lineTo(0.15, 0);
  ipsc.lineTo(0.23, 0.12);
  ipsc.lineTo(0.23, 0.52);
  ipsc.lineTo(0.14, 0.6);
  ipsc.lineTo(0.08, 0.6);
  ipsc.lineTo(0.08, 0.76);
  ipsc.lineTo(-0.08, 0.76);
  ipsc.lineTo(-0.08, 0.6);
  ipsc.lineTo(-0.14, 0.6);
  ipsc.lineTo(-0.23, 0.52);
  ipsc.lineTo(-0.23, 0.12);
  ipsc.closePath();
  const ipscG = new THREE.ExtrudeGeometry(ipsc, { depth: 0.012, bevelEnabled: false });
  ipscG.translate(0, 0, -6e-3);
  ipscG.rotateY(Math.PI / 2);
  const plateG = new THREE.CylinderGeometry(0.15, 0.15, 0.012, 32);
  plateG.rotateZ(Math.PI / 2);
  const addTarget = (x, z, kind, label) => {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    const hinge = new THREE.Group();
    hinge.position.y = kind === "plate" ? 1.25 : 1.05;
    const plate = new THREE.Mesh(kind === "plate" ? plateG : ipscG, steelM.clone());
    plate.position.y = kind === "plate" ? -0.15 : -0.76;
    plate.castShadow = true;
    plate.userData.surface = "steel";
    plate.userData.target = t;
    hinge.add(plate);
    t.add(hinge);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, hinge.position.y + 0.04, 0.05), postM);
    post.position.set(0.04, (hinge.position.y + 0.04) / 2, 0);
    post.castShadow = true;
    t.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), postM);
    foot.position.y = 0.025;
    t.add(foot);
    if (label) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.24), new THREE.MeshStandardMaterial({ roughness: 0.8, map: signTex(label) }));
      sign.position.set(-0.3, 0.3, z > 0 ? -0.4 : 0.4);
      sign.rotation.y = -Math.PI / 2;
      t.add(sign);
    }
    t.userData = { hinge, plate, swing: 0, vel: 0, kind };
    grp.add(t);
    targets.push(t);
    hitables.push(plate);
    return t;
  };
  const paperTex = canvasTex(256, 384, (g) => {
    g.fillStyle = "#b89a6c";
    g.fillRect(0, 0, 256, 384);
    g.fillStyle = "#cdb184";
    g.beginPath();
    g.moveTo(64, 380);
    g.lineTo(192, 380);
    g.lineTo(236, 320);
    g.lineTo(236, 130);
    g.lineTo(200, 96);
    g.lineTo(160, 96);
    g.lineTo(160, 20);
    g.lineTo(96, 20);
    g.lineTo(96, 96);
    g.lineTo(56, 96);
    g.lineTo(20, 130);
    g.lineTo(20, 320);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(60,40,20,.7)";
    g.lineWidth = 2.5;
    g.strokeRect(88, 120, 80, 150);
    g.strokeRect(104, 32, 48, 48);
    g.strokeRect(60, 110, 136, 220);
    g.fillStyle = "rgba(60,40,20,.8)";
    g.font = "bold 20px Arial";
    g.textAlign = "center";
    g.fillText("A", 128, 200);
    g.fillText("C", 76, 300);
    g.fillText("D", 36, 200);
  });
  paperTex.wrapS = paperTex.wrapT = THREE.ClampToEdgeWrapping;
  const paperM = new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.95, side: THREE.DoubleSide });
  const railM = new THREE.MeshStandardMaterial({ color: 5593179, roughness: 0.45, metalness: 0.7 });
  const addPaper = (x, z) => {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    const hinge = new THREE.Group();
    hinge.position.y = 2.62;
    hinge.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), railM));
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(6e-3, 6e-3, 0.5), railM);
    rod.position.y = -0.28;
    hinge.add(rod);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.69), paperM);
    sheet.rotation.y = -Math.PI / 2;
    sheet.position.y = -0.9;
    sheet.castShadow = true;
    sheet.userData.surface = "paper";
    sheet.userData.target = t;
    hinge.add(sheet);
    t.add(hinge);
    t.userData = { hinge, plate: sheet, swing: 0, vel: 0, kind: "paper" };
    grp.add(t);
    targets.push(t);
    hitables.push(sheet);
    return t;
  };
  const railG = [];
  for (const z of [-2.4, 0, 2.4]) railG.push(new THREE.BoxGeometry(26, 0.08, 0.06).translate(line + 13, 2.7, z));
  grp.add(new THREE.Mesh(mergeGeometries(railG), railM));
  addPaper(line + 7, 0);
  addPaper(line + 15, 2.4);
  addPaper(line + 25, -2.4);
  addTarget(line + 10, -1.6, "plate", "10 м");
  addTarget(line + 25, 1, "ipsc", "25 м");
  addTarget(line + 25, 3.4, "plate");
  addTarget(line + 50, -0.8, "ipsc", "50 м");
  addTarget(line + 50, 2.2, "plate");
  addTarget(line + 75, 0.6, "ipsc", "75 м");
  addTarget(line + 100, -1, "ipsc", "100 м");
  addTarget(line + 100, 1.8, "plate");
  grp.traverse((o) => {
    if (o.isMesh) o.receiveShadow = !o.userData.noShadow;
  });
  const update = (dt) => {
    let moving = false;
    for (const t of targets) {
      const u = t.userData;
      if (Math.abs(u.vel) + Math.abs(u.swing) < 1e-5) continue;
      const k = u.kind === "paper" ? 14 : 60, d = u.kind === "paper" ? 1.8 : 4.5;
      u.vel += (-u.swing * k - u.vel * d) * dt;
      u.swing += u.vel * dt;
      u.hinge.rotation.z = -u.swing;
      moving = true;
    }
    return moving;
  };
  const hit = (t, energy) => {
    if (t) t.userData.vel += t.userData.kind === "paper" ? energy * 0.12 : energy;
  };
  const floorAt = (x, z) => x > line - 0.47 && x < line && Math.abs(z) < halfW - 0.1 ? 0.95 : 0;
  const setNight = (on) => {
    skyM.color.set(on ? 858672 : 14674679).multiplyScalar(on ? 0.12 : 5);
    fixM.emissiveIntensity = on ? 0 : 2.2;
    gapM.color.set(16769712).multiplyScalar(on ? 0.08 : 0.3);
    exitM.emissiveIntensity = on ? 0.35 : 0.9;
  };
  return { group: grp, targets, hitables, update, hit, floorAt, setNight, ground: floor, skylights };
}

// ==== engine/materials.js
const THREE2 = window.THREE;
function rng2(seed) {
  let s = seed >>> 0;
  return () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296;
}
function valueNoise(size, cells, seed) {
  const r = rng2(seed);
  const grid = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  for (let i = 0; i <= cells; i++) {
    grid[i * (cells + 1) + cells] = grid[i * (cells + 1)];
    grid[cells * (cells + 1) + i] = grid[i];
  }
  const out = new Float32Array(size * size);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = x / size * cells, gy = y / size * cells;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = sm(gx - x0), fy = sm(gy - y0);
    const g = (i, j) => grid[j * (cells + 1) + i];
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * fx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * fx;
    out[y * size + x] = a + (b - a) * fy;
  }
  return out;
}
function fbm(size, octaves, seed, base = 4) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, base << o, seed + o * 17);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function toTex(size, fill, srgb) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = fill(i);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE2.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE2.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE2.SRGBColorSpace;
  return t;
}
function normalFrom(h, size, strength) {
  return toTex(size, (i) => {
    const x = i % size, y = i / size | 0;
    const hx = h[y * size + (x + 1) % size] - h[y * size + (x - 1 + size) % size];
    const hy = h[(y + 1) % size * size + x] - h[(y - 1 + size) % size * size + x];
    let nx = -hx * strength, ny = -hy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    return [(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (nz / l * 0.5 + 0.5) * 255];
  });
}
function roughFrom(h, size, lo, hi) {
  return toTex(size, (i) => {
    const v = (lo + (hi - lo) * h[i]) * 255;
    return [v, v, v];
  });
}
/* v10: процедурные текстуры оружия детерминированы (фиксированные зёрна) —
   считаем один раз на страницу: раньше их пересчитывали заставка, оружейная
   и игра (3 × ~0,8–2,5 с главного потока при загрузке). Texture не привязана
   к конкретному WebGLRenderer, общий экземпляр безопасен. */
let _MT_CACHE = null;
function makeTextures() {
  return _MT_CACHE || (_MT_CACHE = makeTextures0());
}
function makeTextures0() {
  const S = 256;
  const coarse = fbm(S, 5, 11, 4);
  const fine = fbm(S, 3, 77, 32);
  const stipple = fbm(S, 2, 123, 64);
  const brushed = new Float32Array(S * S);
  const br = fbm(S, 4, 5, 8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) brushed[y * S + x] = br[y * S + x * 7 % S] * 0.3 + br[y * 3 % S * S + x] * 0.7;
  const mix = new Float32Array(S * S);
  for (let i = 0; i < mix.length; i++) mix[i] = coarse[i] * 0.55 + fine[i] * 0.45;
  const streak = (() => {
    const n = fbm(S, 4, 555, 16), out = new Float32Array(S * S), R4 = 18;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let a = 0;
      for (let d = -R4; d <= R4; d++) a += n[y * S + (x + d + S) % S];
      out[y * S + x] = a / (2 * R4 + 1);
    }
    return out;
  })();
  const woodVal = (i) => {
    const y = (i / S | 0) / S;
    const ply = 0.5 + 0.5 * Math.sin((y + coarse[i] * 0.06) * Math.PI * 2 * 28);
    return (streak[i] - 0.5) * 1.6 + (ply - 0.5) * 0.12 + (coarse[i] - 0.5) * 0.25;
  };
  const wood = (hue) => toTex(S, (i) => {
    const k = 0.9 + woodVal(i) * 0.5;
    return [hue[0] * k, hue[1] * k, hue[2] * k];
  }, true);
  const woodH = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) woodH[i] = woodVal(i) * 0.5 + 0.5;
  return {
    rough: roughFrom(mix, S, 0.72, 1),
    roughStrong: roughFrom(coarse, S, 0.55, 1),
    roughBrushed: roughFrom(brushed, S, 0.7, 1),
    nMetal: normalFrom(fine, S, 1.4),
    nCast: normalFrom(mix, S, 3.2),
    nPoly: normalFrom(stipple, S, 5.5),
    nWood: normalFrom(woodH, S, 1.6),
    woodBirch: wood([100, 42, 24]),
    woodWalnut: wood([92, 58, 36])
  };
}
var WEAR_GLSL = `
varying vec3 vObjP;
uniform float uWear, uWearMetal, uWearRough, uGrime;
uniform vec3 uWearCol;
float wH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wH(i), wH(i + vec3(1, 0, 0)), f.x), mix(wH(i + vec3(0, 1, 0)), wH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wH(i + vec3(0, 0, 1)), wH(i + vec3(1, 0, 1)), f.x), mix(wH(i + vec3(0, 1, 1)), wH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
function addWear(mat, o) {
  const U = {
    uWear: { value: o.wear ?? 0.6 },
    uWearMetal: { value: o.metal ?? mat.metalness },
    uWearRough: { value: o.rough ?? 0.35 },
    uGrime: { value: o.grime ?? 1 },
    uWearCol: { value: new THREE2.Color(o.col ?? 9409174) }
  };
  mat.userData.wear = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObjP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + WEAR_GLSL).replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      {
        vec3 nn = normalize(vNormal);
        float px = max(length(fwidth(vViewPosition)), 1e-6);
        float curv = length(fwidth(nn)) / px;               // 1/м
        float brk = wN(vObjP * 0.45) * 0.65 + wN(vObjP * 2.1) * 0.35;
        float edge = smoothstep(170.0, 750.0, curv) * smoothstep(0.3, 0.6, brk);
        float m = clamp(edge * uWear, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, uWearCol, m);
        metalnessFactor = mix(metalnessFactor, uWearMetal, m);
        roughnessFactor = mix(roughnessFactor, uWearRough, m);
        float g1 = wN(vObjP * 0.018 + 3.1), g2 = wN(vObjP * 0.06 + 11.7);
        roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.8 + 0.4 * g1, uGrime), 0.04, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.93 + 0.14 * g2, uGrime);
      }`);
  };
  mat.customProgramCacheKey = () => "wear";
  return mat;
}
function createMaterials(envMap) {
  const tex2 = makeTextures();
  const rep = (t, mm) => {
    const c = t.clone();
    c.needsUpdate = true;
    c.repeat.set(1 / mm, 1 / mm);
    return c;
  };
  const R4 = {};
  const std = (o) => new THREE2.MeshStandardMaterial(o);
  const phys = (o) => new THREE2.MeshPhysicalMaterial(o);
  const metal = (color, rough, metal2, o = {}) => std({
    color,
    roughness: rough,
    metalness: metal2,
    roughnessMap: rep(o.brushed ? tex2.roughBrushed : tex2.rough, o.tile ?? 40),
    normalMap: rep(o.cast ? tex2.nCast : tex2.nMetal, o.tile ?? 30),
    normalScale: new THREE2.Vector2((o.ns ?? 0.35) * 0.45, (o.ns ?? 0.35) * 0.45),
    envMapIntensity: o.env ?? 1
  });
  const poly = (color, rough, o = {}) => std({
    color,
    roughness: rough,
    metalness: 0,
    roughnessMap: rep(tex2.rough, 50),
    normalMap: rep(tex2.nPoly, o.tile ?? 14),
    normalScale: new THREE2.Vector2((o.ns ?? 0.45) * 0.55, (o.ns ?? 0.45) * 0.55),
    envMapIntensity: o.env ?? 0.8
  });
  R4.steel = metal(2829358, 0.38, 0.82, { ns: 0.18, tile: 18 });
  R4.steelPark = metal(3487030, 0.62, 0.55, { cast: true, ns: 0.5 });
  R4.steelWorn = metal(5592666, 0.36, 0.9, { brushed: true });
  R4.steelBright = metal(10987949, 0.26, 1, { brushed: true });
  R4.chrome = metal(13224910, 0.14, 1);
  R4.alu = metal(2039842, 0.44, 0.6, { ns: 0.14, tile: 16 });
  R4.aluGrey = metal(3882304, 0.44, 0.6, { ns: 0.25 });
  R4.aluFde = metal(7693130, 0.58, 0.25, { cast: true, ns: 0.35, env: 0.8 });
  R4.aluOd = metal(4999992, 0.6, 0.25, { cast: true });
  R4.cast = metal(2500393, 0.66, 0.55, { cast: true, ns: 0.7 });
  R4.brass = metal(13148240, 0.3, 1);
  R4.copper = metal(11889982, 0.32, 1);
  R4.steelCase = metal(6249532, 0.45, 0.6);
  R4.spring = metal(4868942, 0.35, 0.9);
  R4.poly = poly(1776412, 0.74);
  R4.polySoft = poly(2105377, 0.86, { ns: 0.7 });
  R4.polyFde = poly(8350800, 0.78);
  R4.polyFdeDark = poly(6049338, 0.8);
  // текстура рукояти (Glock RTF / HK): мелкая «наждачка», заметнее обычного полимера
  R4.polyGrip = poly(1250067, 0.84, { ns: 1.15, tile: 5, env: 0.6 });
  // пластиковая гильза 12 калибра и зелёная «Бреннеке»
  R4.hullRed = poly(0xa3201c, 0.5, { ns: 0.2, env: 1 });
  R4.hullGreen = poly(0x2f5a32, 0.5, { ns: 0.2, env: 1 });
  R4.lead = metal(0x6b6f74, 0.55, 0.4);
  // оксидированная сталь HK/Glock: чуть глубже и матовее «steel»
  R4.steelMatte = metal(0x232426, 0.55, 0.65, { ns: 0.45 });
  R4.polyPlum = poly(4991522, 0.58, { ns: 0.3 });
  R4.polyOd = poly(4868662, 0.78);
  R4.polyGrey = poly(3948097, 0.7);
  R4.polyTan = poly(11573876, 0.78);
  R4.rubber = poly(1315860, 0.92, { ns: 0.9, tile: 14 });
  R4.bakelite = std({ color: 4856846, roughness: 0.4, metalness: 0, normalMap: rep(tex2.nCast, 60), normalScale: new THREE2.Vector2(0.2, 0.2), roughnessMap: rep(tex2.rough, 60) });
  R4.wood = phys({
    color: 16777215,
    map: rep(tex2.woodBirch, 160),
    roughness: 0.52,
    metalness: 0,
    normalMap: rep(tex2.nWood, 160),
    normalScale: new THREE2.Vector2(0.15, 0.15),
    clearcoat: 0.3,
    clearcoatRoughness: 0.35
  });
  R4.woodDark = phys({
    color: 16777215,
    map: rep(tex2.woodWalnut, 160),
    roughness: 0.5,
    metalness: 0,
    normalMap: rep(tex2.nWood, 160),
    normalScale: new THREE2.Vector2(0.25, 0.25),
    clearcoat: 0.3,
    clearcoatRoughness: 0.45
  });
  const glass = (color, op) => phys({
    color,
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: op,
    depthWrite: false,
    envMapIntensity: 2.2,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    side: THREE2.DoubleSide
  });
  R4.glass = glass(12113124, 0.08);
  R4.glassAmber = glass(14725232, 0.1);
  R4.glassRed = glass(15245456, 0.09);
  R4.glassBlue = glass(9087208, 0.1);
  R4.glassDark = glass(2241348, 0.55);
  R4.lensBlack = std({ color: 329223, roughness: 0.25, metalness: 0.2 });
  R4.emRed = std({ color: 2228224, emissive: 16722458, emissiveIntensity: 3, roughness: 0.4 });
  R4.emGreen = std({ color: 8704, emissive: 7208794, emissiveIntensity: 2.5, roughness: 0.4 });
  R4.tritium = std({ color: 1714704, emissive: 9240426, emissiveIntensity: 1.2, roughness: 0.4 });
  R4.lampLens = std({ color: 14542574, emissive: 16774108, emissiveIntensity: 0, roughness: 0.08, metalness: 0.2 });
  R4.laserLens = std({ color: 3346448, emissive: 16719888, emissiveIntensity: 0, roughness: 0.1 });
  R4.irLens = std({ color: 1381653, roughness: 0.05, metalness: 0.4 });
  R4.ledPhos = std({ color: 13615226, emissive: 16774108, emissiveIntensity: 0, roughness: 0.45 });
  R4.reflector = std({ color: 15132908, roughness: 0.22, metalness: 1, emissive: 16774108, emissiveIntensity: 0, side: THREE2.DoubleSide, envMapIntensity: 2.4 });
  R4.white = std({ color: 15263456, roughness: 0.5 });
  R4.paintRed = std({ color: 11805724, roughness: 0.5 });
  R4.paintWhite = std({ color: 14605266, roughness: 0.55 });
  R4.paper = std({ color: 15328211, roughness: 0.95 });
  R4.target = std({ color: 13617334, roughness: 0.6, metalness: 0.2 });
  const W = {
    steel: { col: 9343896, metal: 1, rough: 0.3, wear: 0.75 },
    steelPark: { col: 7106161, metal: 0.9, rough: 0.38, wear: 0.55 },
    steelWorn: { col: 11120050, metal: 1, rough: 0.28, wear: 0.5 },
    steelMatte: { col: 7895160, metal: 0.95, rough: 0.34, wear: 0.5 },
    alu: { col: 9146004, metal: 1, rough: 0.3, wear: 0.4 },
    aluGrey: { col: 10132898, metal: 1, rough: 0.3, wear: 0.4 },
    aluFde: { col: 9407622, metal: 0.95, rough: 0.35, wear: 0.45 },
    aluOd: { col: 9407622, metal: 0.95, rough: 0.35, wear: 0.45 },
    cast: { col: 8224642, metal: 0.95, rough: 0.35, wear: 0.35 },
    poly: { col: 3815996, metal: 0, rough: 0.5, wear: 0.55 },
    polySoft: { col: 3815996, metal: 0, rough: 0.6, wear: 0.35 },
    polyGrip: { col: 3815996, metal: 0, rough: 0.55, wear: 0.4 },
    polyFde: { col: 11047538, metal: 0, rough: 0.55, wear: 0.5 },
    polyFdeDark: { col: 8153938, metal: 0, rough: 0.55, wear: 0.5 },
    polyTan: { col: 11969151, metal: 0, rough: 0.55, wear: 0.5 },
    polyOd: { col: 6974034, metal: 0, rough: 0.55, wear: 0.5 },
    polyGrey: { col: 6448232, metal: 0, rough: 0.55, wear: 0.5 },
    polyPlum: { col: 7224368, metal: 0, rough: 0.4, wear: 0.45 },
    bakelite: { col: 9062954, metal: 0, rough: 0.35, wear: 0.4 },
    rubber: { col: 3026479, metal: 0, rough: 0.7, wear: 0.2, grime: 0.6 }
  };
  for (const [k, o] of Object.entries(W)) if (R4[k]) addWear(R4[k], o);
  const cache2 = /* @__PURE__ */ new Map();
  return {
    tex: tex2,
    all: R4,
    get(key) {
      if (typeof key !== "string") return key;
      if (R4[key]) return R4[key];
      if (cache2.has(key)) return cache2.get(key);
      const [base, col] = key.split("#");
      if (R4[base] && col) {
        const m = R4[base].clone();
        m.color = new THREE2.Color("#" + col);
        if (W[base]) addWear(m, W[base]);
        cache2.set(key, m);
        return m;
      }
      console.warn("нет материала", key);
      return R4.poly;
    }
  };
}

// ==== engine/geo.js
var geo_exports = {};
__export(geo_exports, {
  D2R: () => D2R,
  Kit: () => Kit,
  PICA: () => PICA,
  T: () => T,
  THREE: () => THREE3,
  box: () => box,
  circle: () => circle,
  cylX: () => cylX,
  cylY: () => cylY,
  cylZ: () => cylZ,
  extrudeX: () => extrudeX,
  extrudeY: () => extrudeY,
  extrudeZ: () => extrudeZ,
  flutesX: () => flutesX,
  gripLoft: () => gripLoft,
  latheX: () => latheX,
  loftX: () => loftX,
  loftPath: () => loftPath,
  loftY: () => loftY,
  merge: () => merge,
  mirrorZ: () => mirrorZ,
  mlokHoles: () => mlokHoles,
  node: () => node,
  path: () => path,
  picatinny: () => picatinny,
  pin: () => pin,
  place: () => place,
  reverse: () => reverse,
  ringGrooves: () => ringGrooves,
  rrect: () => rrect,
  screwHead: () => screwHead,
  shape: () => shape,
  sideLoft: () => sideLoft,
  slot: () => slot,
  sphere: () => sphere,
  spring: () => spring,
  superEllipse: () => superEllipse,
  tubeX: () => tubeX,
  wire: () => wire
});
const THREE3 = window.THREE;
const { mergeGeometries: mergeGeometries2, toCreasedNormals } = window.THREE_ADDONS["utils/BufferGeometryUtils.js"];
var D2R = Math.PI / 180;
function path(pts, target) {
  const s = target || new THREE3.Shape();
  const n = pts.length;
  const P = pts.map((p) => new THREE3.Vector2(p[0], p[1]));
  const R4 = pts.map((p) => p[2] || 0);
  const corner = (i) => {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    const r = R4[i];
    const la = b.distanceTo(a), lc = b.distanceTo(c);
    const d = Math.min(r, la * 0.5, lc * 0.5);
    const pa = b.clone().add(a.clone().sub(b).setLength(d));
    const pc = b.clone().add(c.clone().sub(b).setLength(d));
    return [pa, pc, b];
  };
  for (let i = 0; i < n; i++) {
    if (R4[i] > 0) {
      const [pa, pc, b] = corner(i);
      if (i === 0) s.moveTo(pa.x, pa.y);
      else s.lineTo(pa.x, pa.y);
      s.quadraticCurveTo(b.x, b.y, pc.x, pc.y);
    } else if (i === 0) s.moveTo(P[i].x, P[i].y);
    else s.lineTo(P[i].x, P[i].y);
  }
  s.closePath();
  return s;
}
function shape(pts, holes = []) {
  const s = path(pts);
  for (const h of holes) s.holes.push(path(h, new THREE3.Path()));
  return s;
}
function rrect(cx, cy, w, h, r = 0) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  return [[x0, y0, r], [x1, y0, r], [x1, y1, r], [x0, y1, r]];
}
function circle(cx, cy, r, n = 24) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
function slot(x0, x1, cy, h, n = 8) {
  const r = h / 2, out = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + i / n * Math.PI;
    out.push([x1 - r + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + i / n * Math.PI;
    out.push([x0 + r + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
function reverse(pts) {
  return pts.slice().reverse();
}
function fixUV(g, k = 1) {
  const uv = g.attributes.uv;
  if (uv && k !== 1) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return g;
}
function finish(g, crease = 32) {
  let out = g.index ? g.toNonIndexed() : g;
  out = toCreasedNormals(out, crease * D2R);
  if (!out.attributes.uv) out.setAttribute("uv", new THREE3.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  return out;
}
function extrudeZ(shp, width, o = {}) {
  const b = Math.min(o.bevel ?? 0.6, width * 0.45);
  const depth = Math.max(0.01, width - 2 * b);
  const g = new THREE3.ExtrudeGeometry(Array.isArray(shp) ? shape(shp) : shp, {
    depth,
    steps: 1,
    curveSegments: o.curve ?? 6,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: o.bevelSeg ?? 2
  });
  g.translate(0, 0, -depth / 2 + (o.z || 0));
  return finish(g, o.crease);
}
function extrudeX(shp, x0, x1, o = {}) {
  const len = x1 - x0;
  const b = Math.min(o.bevel ?? 0.5, len * 0.45);
  const depth = Math.max(0.01, len - 2 * b);
  const g = new THREE3.ExtrudeGeometry(Array.isArray(shp) ? shape(shp) : shp, {
    depth,
    steps: 1,
    curveSegments: o.curve ?? 6,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: o.bevelSeg ?? 2
  });
  g.rotateY(-Math.PI / 2);
  g.translate(x1 - b, 0, 0);
  return finish(g, o.crease);
}
function extrudeY(shp, y0, y1, o = {}) {
  const len = y1 - y0;
  const b = Math.min(o.bevel ?? 0.5, len * 0.45);
  const depth = Math.max(0.01, len - 2 * b);
  const g = new THREE3.ExtrudeGeometry(Array.isArray(shp) ? shape(shp) : shp, {
    depth,
    steps: 1,
    curveSegments: o.curve ?? 6,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: o.bevelSeg ?? 2
  });
  g.rotateX(-Math.PI / 2);
  g.scale(1, 1, -1);
  const idx = g.index;
  flipWinding(g);
  g.translate(0, y0 + b, 0);
  return finish(g, o.crease);
}
function flipWinding(g) {
  const pos = g.attributes.position;
  const attrs = Object.values(g.attributes);
  for (let i = 0; i < pos.count; i += 3) {
    for (const a of attrs) {
      for (let c = 0; c < a.itemSize; c++) {
        const t = a.array[(i + 1) * a.itemSize + c];
        a.array[(i + 1) * a.itemSize + c] = a.array[(i + 2) * a.itemSize + c];
        a.array[(i + 2) * a.itemSize + c] = t;
      }
    }
  }
}
function latheX(prof, o = {}) {
  const seg = o.seg ?? 32;
  const a0 = (o.a0 ?? 0) * D2R, arc2 = (o.arc ?? 360) * D2R;
  const crease = Math.cos((o.crease ?? 40) * D2R);
  const pts = prof.filter((p, i) => i === 0 || p[0] !== prof[i - 1][0] || p[1] !== prof[i - 1][1]);
  const segN = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dr = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dx, dr) || 1;
    segN.push([-dr / l, dx / l]);
  }
  const pos = [], nor = [], uv = [], idx = [];
  let vlen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const nA = segN[i].slice(), nB = segN[i].slice();
    if (i > 0) {
      const p = segN[i - 1];
      if (p[0] * nA[0] + p[1] * nA[1] > crease) {
        nA[0] += p[0];
        nA[1] += p[1];
      }
    }
    if (i < segN.length - 1) {
      const q = segN[i + 1];
      if (q[0] * nB[0] + q[1] * nB[1] > crease) {
        nB[0] += q[0];
        nB[1] += q[1];
      }
    }
    for (const n of [nA, nB]) {
      const l = Math.hypot(n[0], n[1]) || 1;
      n[0] /= l;
      n[1] /= l;
    }
    const [x0, r0] = pts[i], [x1, r1] = pts[i + 1];
    const sl = Math.hypot(x1 - x0, r1 - r0);
    const base = pos.length / 3;
    for (let j = 0; j <= seg; j++) {
      const a = a0 + j / seg * arc2;
      const c = Math.cos(a), s = Math.sin(a);
      pos.push(x0, r0 * c, r0 * s, x1, r1 * c, r1 * s);
      nor.push(nA[0], nA[1] * c, nA[1] * s, nB[0], nB[1] * c, nB[1] * s);
      const u = j / seg * arc2 * Math.max(r0, r1, 1);
      uv.push(u, vlen, u, vlen + sl);
    }
    vlen += sl;
    for (let j = 0; j < seg; j++) {
      const a = base + j * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE3.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE3.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g.toNonIndexed();
}
function cylX(r, x0, x1, o = {}) {
  const c = Math.min(o.c ?? 0.4, r * 0.4, (x1 - x0) * 0.3);
  const ri = o.ri || 0;
  if (ri > 0) {
    return latheX([[x0, ri + c], [x0, r - c], [x0 + c, r], [x1 - c, r], [x1, r - c], [x1, ri + c], [x1 - c, ri], [x0 + c, ri], [x0, ri + c]], o);
  }
  return latheX([[x0, 0], [x0, r - c], [x0 + c, r], [x1 - c, r], [x1, r - c], [x1, 0]], o);
}
function tubeX(rOut, rIn, x0, x1, o = {}) {
  return cylX(rOut, x0, x1, { ...o, ri: rIn });
}
function cylY(r, y0, y1, o = {}) {
  return T(cylX(r, y0, y1, o), { r: [0, 0, 90] });
}
function cylZ(r, z0, z1, o = {}) {
  return T(cylX(r, z0, z1, o), { r: [0, -90, 0] });
}
function sphere(r, o = {}) {
  const g = new THREE3.SphereGeometry(r, o.seg ?? 20, o.seg2 ?? 14);
  return fixUV(g.toNonIndexed(), r * 3);
}
function box(w, h, d, o = {}) {
  const b = Math.min(o.bevel ?? 0.5, w * 0.45, h * 0.45, d * 0.45);
  return extrudeZ(rrect(0, 0, w, h, o.r ?? b), d, { bevel: b, curve: 3 });
}
var _m = new THREE3.Matrix4();
var _q = new THREE3.Quaternion();
var _e = new THREE3.Euler();
var _v = new THREE3.Vector3();
var _s = new THREE3.Vector3();
function T(g, t = {}) {
  const r = t.r || [0, 0, 0];
  _e.set(r[0] * D2R, r[1] * D2R, r[2] * D2R, t.order || "XYZ");
  _q.setFromEuler(_e);
  const s = t.s == null ? [1, 1, 1] : Array.isArray(t.s) ? t.s : [t.s, t.s, t.s];
  _s.set(s[0], s[1], s[2]);
  const p = t.p || [0, 0, 0];
  _v.set(p[0], p[1], p[2]);
  _m.compose(_v, _q, _s);
  g.applyMatrix4(_m);
  if (s[0] * s[1] * s[2] < 0) flipWinding(g);
  return g;
}
function mirrorZ(g) {
  return T(g.clone(), { s: [1, 1, -1] });
}
function merge(list) {
  const gs = list.filter(Boolean).map((g) => {
    let o = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(o.attributes)) if (!["position", "normal", "uv"].includes(k)) o.deleteAttribute(k);
    if (!o.attributes.uv) o.setAttribute("uv", new THREE3.BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
    if (!o.attributes.normal) o.computeVertexNormals();
    return o;
  });
  if (!gs.length) return null;
  return mergeGeometries2(gs, false);
}
var Kit = class {
  constructor(mats) {
    this.mats = mats;
    this.buckets = /* @__PURE__ */ new Map();
  }
  add(mat, geo, t) {
    if (!geo) return this;
    if (Array.isArray(geo)) {
      for (const g of geo) this.add(mat, g, t);
      return this;
    }
    if (t) T(geo, t);
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(geo);
    return this;
  }
  // Добавить с зеркальной копией на левый борт.
  pair(mat, geo, t) {
    if (t) T(geo, t);
    this.add(mat, geo);
    this.add(mat, mirrorZ(geo));
    return this;
  }
  build(name) {
    const grp = new THREE3.Group();
    grp.name = name || "";
    for (const [mk, list] of this.buckets) {
      const g = merge(list);
      if (!g) continue;
      const m = new THREE3.Mesh(g, this.mats.get(mk));
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.mat = mk;
      grp.add(m);
    }
    this.buckets.clear();
    return grp;
  }
};
function node(name, children = [], t) {
  const g = new THREE3.Group();
  g.name = name;
  for (const c of children) if (c) g.add(c);
  if (t) place(g, t);
  return g;
}
function place(obj, t = {}) {
  if (t.p) obj.position.set(t.p[0], t.p[1], t.p[2]);
  if (t.r) obj.rotation.set(t.r[0] * D2R, t.r[1] * D2R, t.r[2] * D2R, t.order || "XYZ");
  if (t.s != null) Array.isArray(t.s) ? obj.scale.set(...t.s) : obj.scale.setScalar(t.s);
  return obj;
}
var PICA = { PITCH: 10.01, SLOT: 5.23, TOP: 15.6, WIDE: 21.2, H: 9.4 };
function picaSection(top, base) {
  const t = PICA.TOP / 2, w = PICA.WIDE / 2;
  if (top <= -2.8) {
    return [[-w, -3], [w, -3], [w, -3.3], [t, -6], [t, -base], [-t, -base], [-t, -6], [-w, -3.3]];
  }
  return [[-t, 0], [t, 0], [w, -2.8], [w, -3.3], [t, -6], [t, -base], [-t, -base], [-t, -6], [-w, -3.3], [-w, -2.8]];
}
function picatinny(len, o = {}) {
  const base = o.base ?? PICA.H;
  const nSlots = Math.max(1, Math.floor((len - 3) / PICA.PITCH));
  const first = o.first ?? (len - (nSlots - 1) * PICA.PITCH) / 2;
  const gs = [];
  gs.push(extrudeX(picaSection(-3, base), 0, len, { bevel: 0.3 }));
  let x = 0;
  for (let i = 0; i <= nSlots; i++) {
    const sx = first + i * PICA.PITCH - PICA.SLOT / 2;
    const x1 = Math.min(len, i < nSlots ? sx : len);
    if (x1 - x > 0.8) gs.push(extrudeX(picaSection(0, 6.2), x, x1, { bevel: 0.35 }));
    x = sx + PICA.SLOT;
  }
  return { geo: merge(gs), slots: nSlots, first };
}
function mlokHoles(x0, x1, cy, o = {}) {
  const pitch = o.pitch ?? 40, L = o.len ?? 32, H = o.h ?? 7;
  const n = Math.floor((x1 - x0 + (pitch - L)) / pitch);
  const start = x0 + (x1 - x0 - (n * pitch - (pitch - L))) / 2;
  const out = [];
  for (let i = 0; i < n; i++) out.push(rrect(start + i * pitch + L / 2, cy, L, H, H / 2 - 0.2));
  return out;
}
function screwHead(r = 2.4, h = 1.2, o = {}) {
  const g = latheX([[0, 0], [0, r * 0.95], [h * 0.3, r], [h, r * 0.8], [h, 0]], { seg: o.seg ?? 16 });
  return T(g, { r: [0, -90, 0] });
}
function pin(r = 2, len = 2) {
  return cylZ(r, -len / 2, len / 2, { c: 0.25, seg: 14 });
}
// Рифлёный поясок. o.rIn — внутренний радиус: кольцо вместо сплошного тела (корпуса прицелов с каналом)
function ringGrooves(r, x0, x1, n, depth = 0.5, o = {}) {
  const r0 = o.rIn ?? 0;
  const prof = [[x0, r0], [x0, r]];
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * step;
    prof.push([a + step * 0.2, r], [a + step * 0.35, r - depth], [a + step * 0.65, r - depth], [a + step * 0.8, r]);
  }
  prof.push([x1, r], [x1, r0]);
  if (r0 > 0) prof.push([x0, r0]);
  return latheX(prof, { seg: o.seg ?? 28 });
}
function flutesX(r, x0, x1, n, w, h, o = {}) {
  const gs = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * 360 + (o.a0 || 0);
    gs.push(T(box(x1 - x0, h, w, { bevel: Math.min(0.3, w * 0.3) }), { p: [(x0 + x1) / 2, r + h / 2 - 0.2, 0] }));
    T(gs[gs.length - 1], { r: [a, 0, 0] });
  }
  return merge(gs);
}
function spring(R4, wire2, x0, x1, turns, o = {}) {
  const pts = [];
  const n = Math.max(24, Math.round(turns * 14));
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * turns * Math.PI * 2;
    pts.push(new THREE3.Vector3(x0 + (x1 - x0) * t, Math.cos(a) * R4, Math.sin(a) * R4));
  }
  const curve = new THREE3.CatmullRomCurve3(pts);
  return new THREE3.TubeGeometry(curve, n * 2, wire2, o.seg ?? 6, false).toNonIndexed();
}
function wire(points, r, o = {}) {
  const curve = new THREE3.CatmullRomCurve3(points.map((p) => new THREE3.Vector3(...p)), !!o.closed, "catmullrom", o.tension ?? 0.5);
  return new THREE3.TubeGeometry(curve, o.n ?? points.length * 10, r, o.seg ?? 8, !!o.closed).toNonIndexed();
}
function loftX(rings, o = {}) {
  const pos = [], idx = [];
  const m = rings[0].pts.length;
  rings.forEach((r) => r.pts.forEach(([z, y]) => pos.push(r.x, y, z)));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * m + j, b = i * m + (j + 1) % m, c = (i + 1) * m + j, d = (i + 1) * m + (j + 1) % m;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (ri, flip) => {
    const base = pos.length / 3;
    const r = rings[ri];
    let cz = 0, cy = 0;
    r.pts.forEach(([z, y]) => {
      cz += z / m;
      cy += y / m;
    });
    pos.push(r.x, cy, cz);
    for (let j = 0; j < m; j++) {
      const a = ri * m + j, b = ri * m + (j + 1) % m;
      flip ? idx.push(base, b, a) : idx.push(base, a, b);
    }
  };
  if (o.caps !== false) {
    cap(0, false);
    cap(rings.length - 1, true);
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (o.flip) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
  const ng = g.toNonIndexed();
  const uv = new Float32Array(ng.attributes.position.count * 2);
  const p = ng.attributes.position;
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = p.getY(i) + p.getZ(i);
  }
  ng.setAttribute("uv", new THREE3.BufferAttribute(uv, 2));
  return toCreasedNormals(ng, (o.crease ?? 40) * D2R);
}
function superEllipse(a, b, k = 3, n = 32, cy = 0, cz = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    out.push([cz + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / k), cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / k)]);
  }
  return out;
}
function loftY(rings, o = {}) {
  const r2 = rings.map((r) => ({ x: r.y, pts: r.pts.map(([x, z]) => [z, x]) }));
  const g = loftX(r2, o);
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setXY(i, y, x);
    const nx = n.getX(i), ny = n.getY(i);
    n.setXY(i, ny, nx);
  }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}
function gripLoft(front, back, o = {}) {
  const at = (pts, y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (y <= y0 && y >= y1 || y >= y0 && y <= y1) return x0 + (x1 - x0) * ((y - y0) / (y1 - y0 || 1));
    }
    return y > pts[0][1] ? pts[0][0] : pts[pts.length - 1][0];
  };
  const yTop = Math.min(front[0][1], back[0][1]), yBot = Math.max(front[front.length - 1][1], back[back.length - 1][1]);
  const N = o.rings ?? 18, M = o.seg ?? 28, W = (o.w ?? 30) / 2, k = o.k ?? 2.6, taper = o.taper ?? 0.28;
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = yTop + (yBot - yTop) * t;
    const xf = at(front, y), xb = at(back, y);
    const cx = (xf + xb) / 2, a3 = Math.abs(xf - xb) / 2;
    const wk = o.width ? o.width(t) : 1;
    const end = i === N ? 0.9 : 1;
    const pts = [];
    for (let j = 0; j < M; j++) {
      const th = j / M * Math.PI * 2, c2 = Math.cos(th), s = Math.sin(th);
      const ex = Math.sign(c2) * Math.pow(Math.abs(c2), 2 / k), ez = Math.sign(s) * Math.pow(Math.abs(s), 2 / k);
      const zk = 1 - taper * Math.max(0, c2) ** 2;
      pts.push([cx + a3 * ex * end, W * wk * zk * ez * end]);
    }
    rings.push({ y, pts });
  }
  const g = loftY(rings, { crease: o.crease ?? 60 });
  const p = g.attributes.position, nr = g.attributes.normal;
  const c = new THREE3.Vector3(), a = new THREE3.Vector3(), b = new THREE3.Vector3(), d = new THREE3.Vector3(), f = new THREE3.Vector3();
  for (let i = 0; i < p.count; i++) c.add(a.fromBufferAttribute(p, i));
  c.divideScalar(p.count);
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t);
    b.fromBufferAttribute(p, t + 1);
    d.fromBufferAttribute(p, t + 2);
    f.crossVectors(b.clone().sub(a), d.clone().sub(a));
    if (f.dot(a.add(b).add(d).divideScalar(3).sub(c)) >= 0) continue;
    for (const attr of [p, nr, g.attributes.uv]) {
      if (!attr) continue;
      for (let k2 = 0; k2 < attr.itemSize; k2++) {
        const v = attr.array[(t + 1) * attr.itemSize + k2];
        attr.array[(t + 1) * attr.itemSize + k2] = attr.array[(t + 2) * attr.itemSize + k2];
        attr.array[(t + 2) * attr.itemSize + k2] = v;
      }
    }
    for (let k2 = t; k2 < t + 3; k2++) nr.setXYZ(k2, -nr.getX(k2), -nr.getY(k2), -nr.getZ(k2));
  }
  return g;
}
function sideLoft(upper, lower, o = {}) {
  const at = (pts, x) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x02, y0] = pts[i], [x12, y1] = pts[i + 1];
      if (x >= x02 && x <= x12) return y0 + (y1 - y0) * ((x - x02) / (x12 - x02 || 1));
    }
    return x < pts[0][0] ? pts[0][1] : pts[pts.length - 1][1];
  };
  const x0 = Math.max(upper[0][0], lower[0][0]), x1 = Math.min(upper[upper.length - 1][0], lower[lower.length - 1][0]);
  const N = o.rings ?? 24, M = o.seg ?? 32, W = (o.w ?? 30) / 2, k = o.k ?? 3.2;
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = x0 + (x1 - x0) * t;
    const yu = at(upper, x), yl = at(lower, x);
    const wk = o.width ? o.width(t) : 1;
    const end = i === 0 && o.round0 || i === N && o.round1 ? 0.92 : 1;
    rings.push({ x, pts: superEllipse(W * wk * end, Math.abs(yu - yl) / 2 * end, k, M, (yu + yl) / 2, 0) });
  }
  return loftX(rings, { crease: o.crease ?? 60, flip: true });
}
// Лофт по кривой оси в плоскости XY (рукояти, шейки прикладов). secs: [{c:[x,y], a, b, k?, f?, r?}]
// a — полутолщина вдоль нормали к оси (спереди/сзади), b — полуширина по Z, f — смещение центра
// сечения вдоль нормали (выемки под пальцы, горб), r — радиус-скругление передней грани (0…1: доля a).
function loftPath(secs, o = {}) {
  const n = o.seg ?? 36, m = secs.length;
  const pos = [], idx = [];
  const tan = (i) => {
    const a = secs[Math.max(0, i - 1)].c, b = secs[Math.min(m - 1, i + 1)].c;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  for (let i = 0; i < m; i++) {
    const S2 = secs[i], [tx, ty] = tan(i), nx = -ty, ny = tx, k = S2.k ?? o.k ?? 3, kb = S2.kb ?? k;
    for (let j = 0; j < n; j++) {
      const t = j / n * Math.PI * 2, c = Math.cos(t), s2 = Math.sin(t);
      // передняя (c>0) и задняя половины могут иметь разную толщину: a — вперёд, a2 — назад
      const aa = c >= 0 ? S2.a : S2.a2 ?? S2.a;
      const u = aa * Math.sign(c) * Math.pow(Math.abs(c), 2 / (c >= 0 ? k : kb)) + (S2.f || 0);
      const w = S2.b * Math.sign(s2) * Math.pow(Math.abs(s2), 2 / k);
      pos.push(S2.c[0] + nx * u, S2.c[1] + ny * u, w);
    }
  }
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + j, d = (i + 1) * n + (j + 1) % n;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (ri, flip) => {
    const base = pos.length / 3;
    let cx = 0, cy = 0;
    for (let j = 0; j < n; j++) cx += pos[(ri * n + j) * 3] / n, cy += pos[(ri * n + j) * 3 + 1] / n;
    pos.push(cx, cy, 0);
    for (let j = 0; j < n; j++) {
      const a = ri * n + j, b = ri * n + (j + 1) % n;
      flip ? idx.push(base, a, b) : idx.push(base, b, a);
    }
  };
  if (o.caps !== false) {
    cap(0, false);
    cap(m - 1, true);
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (o.flip) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
  const ng = g.toNonIndexed();
  const p = ng.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) + p.getZ(i) * 0.3;
    uv[i * 2 + 1] = p.getY(i) + p.getZ(i);
  }
  ng.setAttribute("uv", new THREE3.BufferAttribute(uv, 2));
  return toCreasedNormals(ng, (o.crease ?? 60) * D2R);
}

// ==== engine/lib/common.js
var common_exports = {};
__export(common_exports, {
  CAL: () => CAL,
  bulletGeo: () => bulletGeo,
  capScrew: () => capScrew,
  cartridge: () => cartridge,
  caseGeo: () => caseGeo,
  clampBody: () => clampBody,
  crimpStar: () => crimpStar,
  crossBolt: () => crossBolt,
  feedLips: () => feedLips,
  flipCap: () => flipCap,
  hashMarks: () => hashMarks,
  hollowLathe: () => hollowLathe,
  knob: () => knob,
  latheMod: () => latheMod,
  lensDisc: () => lensDisc,
  qdLever: () => qdLever,
  sectorRing: () => sectorRing,
  shotHead: () => shotHead,
  shotHull: () => shotHull,
  thumbNut: () => thumbNut,
  turret: () => turret
});
// Зажим на Пикатинни: в торце виден профиль планки (ласточкин хвост 45°), губки заходят под полки.
function clampBody(x0, x1, y1, o = {}) {
  const w = (o.w ?? 26) / 2, jaw = o.jaw ?? -6.6, r = o.r ?? 1.2;
  const tip = Math.max(7.9, 10.9 - Math.max(0, -3.3 - jaw));
  const sec = [[-w, jaw, 1], [-tip, jaw], [-10.9, -3.2], [-10.9, -2.9], [-8, 0.05], [8, 0.05], [10.9, -2.9], [10.9, -3.2], [tip, jaw], [w, jaw, 1], [w, y1, r], [-w, y1, r]];
  return extrudeX(sec, x0, x1, { bevel: o.bevel ?? 0.8 });
}
// Поперечный болт зажима: шестигранная гайка справа, головка под шестигранник слева.
function crossBolt(x, y = -2.5, w = 13, o = {}) {
  const out = [];
  const nutR = o.nutR ?? 4.2, nutH = o.nutH ?? 3.2;
  if (nutR > 0) {
    out.push(T(latheX([[0, 0], [0, nutR - 0.5], [0.4, nutR], [nutH - 0.4, nutR], [nutH, nutR - 0.5], [nutH, 0]], { seg: 6, crease: 30 }), { r: [0, -90, 0], p: [x, y, w] }));
    out.push(T(latheX([[0, 0], [0, 1.9], [1.1, 1.8], [1.4, 1.2], [1.4, 0]], { seg: 12 }), { r: [0, -90, 0], p: [x, y, w + nutH] }));
  }
  const hr = o.headR ?? 3.4, h = 2;
  out.push(T(latheX([[0, 0], [0, hr], [h - 0.5, hr], [h, hr - 0.5], [h, 1.7], [h - 0.9, 1.4], [h - 0.9, 0]], { seg: 18 }), { r: [0, 90, 0], p: [x, y, -w] }));
  return out;
}
// Быстросъёмный рычаг (ADM/LaRue): изогнутый рычаг вдоль левого борта, ось с гайкой натяжения.
function qdLever(x0, x1, y, w = 13) {
  const len = x1 - x0;
  const pro = [[0, 1.2, 1.2], [len * 0.55, -0.4, 6], [len, 0.6, 2.4], [len, 6.4, 3], [len * 0.62, 5.6, 8], [len * 0.12, 7.4, 2.6], [0, 5.2, 1.4]];
  const g = extrudeZ(pro, 3.2, { bevel: 0.9, curve: 8 });
  const pivot = latheX([[0, 0], [0, 4.2], [0.5, 4.6], [2.6, 4.6], [3.1, 4.1], [3.1, 2], [3.5, 1.6], [3.5, 0]], { seg: 20 });
  const grip = [];
  for (let i = 0; i < 4; i++) grip.push(T(box(0.9, 1, 1.2, { bevel: 0.25 }), { p: [x0 + 2.2 + i * 1.6, y - 3 + 5.6 - i * 0.05, -w - 3.4] }));
  return [T(g, { p: [x0, y - 3, -w - 1.6] }), T(pivot, { r: [0, 90, 0], p: [x1 - 3, y, -w - 0.6] }), ...grip];
}
// Рифлёный барабан вдоль +x: юбка, насечка, гладкая крышка с фаской и винтом по центру.
function knob(r, h, grooves = 24, o = {}) {
  const lip = o.lipH ?? 0.8;
  const gs = [latheX([[0, 0], [0, r - 0.9], [0.4, r - 0.6], [h - lip - 0.2, r - 0.6], [h - lip, r - 0.9], [h - 0.35, r - 1.1], [h, r - 1.5], [h, 1.2], [h - 0.35, 1.1], [h - 0.35, 0]], { seg: Math.max(24, grooves + 8) })];
  if (grooves) gs.push(flutesX(r - 0.9, 0.6, h - lip - 0.2, grooves, 1.1, 0.9));
  return merge(gs);
}
// Откидная крышка Butler Creek: чашка с бортиком, шарнир с осью и язычок под палец.
function flipCap(r, t = 2.4) {
  const disc = latheX([[0, 0], [0, r + 1.3], [0.4, r + 1.7], [t, r + 1.7], [t, r + 0.4], [t - 0.6, r], [t - 0.6, 0]], { seg: 32 });
  const hinge = T(box(6, 5, 10, { bevel: 1 }), { p: [t / 2, r + 3, 0] });
  const pinG = T(cylZ(1.4, -6, 6, { seg: 10 }), { p: [t / 2, r + 4.2, 0] });
  const tab = T(extrudeZ([[-1.5, 0, 0.5], [1.5, 0, 0.5], [1.2, 7, 1.2], [-1.8, 7, 1.2]], 8, { bevel: 0.8 }), { p: [t / 2, -r - 7.4, 0] });
  return merge([disc, hinge, pinG, tab]);
}
function lensDisc(r, x, t = 1.2) {
  return cylX(r, x - t / 2, x + t / 2, { c: 0.2, seg: 32 });
}
function hollowLathe(prof, rIn, o = {}) {
  const x0 = prof[0][0], x1 = prof[prof.length - 1][0];
  const inner = typeof rIn === "number" ? [[x1, rIn], [x0, rIn]] : rIn.slice().reverse();
  return latheX([[x0, inner[inner.length - 1][1]], ...prof, ...inner, [x0, inner[inner.length - 1][1]]], o);
}
// Винт с внутренним шестигранником, ось +y, головка над y=0.
function capScrew(r = 1.8, h = 1.2) {
  return T(latheX([[0, 0], [0, r], [h * 0.7, r], [h, r * 0.8], [h, r * 0.55], [h - 0.5, r * 0.45], [h - 0.5, 0]], { seg: 12, crease: 50 }), { r: [0, 0, 90] });
}
// Барашек/гайка с крупными лепестками, ось +x (зажимы кронштейнов, ПСО, сошки).
function thumbNut(r, h, lobes = 8) {
  const pts = [];
  for (let i = 0; i < lobes * 6; i++) {
    const a = i / (lobes * 6) * Math.PI * 2;
    const k = 0.84 + 0.16 * Math.pow(Math.abs(Math.cos(a * lobes / 2)), 0.6);
    pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
  }
  return merge([extrudeX(pts, 0, h, { bevel: 0.5, curve: 2 }), cylX(r * 0.55, h - 0.2, h + 1.2, { c: 0.4, seg: 20 })]);
}
// Штрихи шкалы по окружности радиуса r на участке оси x (ось +x). major — каждый n-й длиннее.
function hashMarks(r, xm, n, o = {}) {
  const gs = [], arc = o.arc ?? 360, a0 = o.a0 ?? 0, len = o.len ?? 1.6, maj = o.major ?? 5;
  for (let i = 0; i < n; i++) {
    const L = i % maj === 0 ? len * 1.9 : len;
    const g = T(box(L, 0.3, o.w ?? 0.34, { bevel: 0.08 }), { p: [xm + (o.dir ?? 1) * (L - len) / 2, r, 0] });
    gs.push(T(g, { r: [a0 + i / n * arc, 0, 0] }));
  }
  return merge(gs);
}
// Барабан поправок прицела (ось +y, основание на y=0): юбка-основание, нулевой упор,
// рифлёная крышка, штрихи шкалы и цифровые метки. Возвращает { m: металл, w: белая краска }.
function turret(o) {
  const r = o.r, h = o.h ?? r * 0.9, base = o.base ?? 3, rb = o.rb ?? r + 0.6;
  const m = [], w = [];
  const up = (g) => T(g, { r: [0, 0, 90] });
  if (o.cap) {
    // закрытый колпачок (ACOG, Aimpoint): гладкий цилиндр с насечкой и торцевой фаской
    m.push(up(latheX([[0, 0], [0, rb], [base, rb], [base, r], [base + h - 1, r], [base + h, r - 1], [base + h, 0]], { seg: 32 })));
    m.push(up(flutesX(r - 0.35, base + 1, base + h - 1.6, o.knurl ?? 28, 1, 0.7)));
    m.push(up(latheX([[base + h - 0.2, 0], [base + h - 0.2, r * 0.45], [base + h + 0.5, r * 0.45], [base + h + 0.5, r * 0.3], [base + h + 0.2, r * 0.25], [base + h + 0.2, 0]], { seg: 16 })));
    return { m, w };
  }
  const zs = o.zero ?? 1.2;
  m.push(up(latheX([[0, 0], [0, rb], [base, rb], [base, r - 0.8], [base + zs, r - 0.8], [base + zs, r], [base + h - 1.2, r], [base + h, r - 1.2], [base + h, r * 0.5], [base + h + 1.2, r * 0.45], [base + h + 1.2, 0]], { seg: 40, crease: 50 })));
  const kn0 = base + zs + h * 0.42, kn1 = base + h - 1.4;
  m.push(up(flutesX(r - 0.35, kn0, kn1, o.knurl ?? 40, 1.1, 0.75)));
  const marks = o.marks ?? 40;
  if (marks) {
    w.push(up(hashMarks(r + 0.02, base + zs + (o.markLen ?? 1.5) / 2 + 0.15, marks, { len: o.markLen ?? 1.5, major: o.major ?? 5, dir: 1 })));
    // индексная линия на основании
    w.push(up(T(box(base * 0.8, 0.35, 0.5, { bevel: 0.08 }), { p: [base * 0.45, rb + 0.02, 0] })));
  }
  return { m, w };
}
// Кольцевые секторы (сплошные, с боковыми стенками) вдоль оси x: прорези пламегасителей, окна ДТК.
// Углы в градусах: 0 — вверх (+y), 90 — вправо (+z).
function sectorRing(ri, ro, x0, x1, sectors, o = {}) {
  const gs = [];
  for (const [a0, a1] of sectors) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (o.step ?? 8)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (a0 + (a1 - a0) * i / n) * D2R;
      pts.push([Math.sin(a) * ro, Math.cos(a) * ro]);
    }
    for (let i = n; i >= 0; i--) {
      const a = (a0 + (a1 - a0) * i / n) * D2R;
      pts.push([Math.sin(a) * ri, Math.cos(a) * ri]);
    }
    gs.push(extrudeX(pts, x0, x1, { bevel: o.bevel ?? 0.3, curve: 2, crease: 40 }));
  }
  return merge(gs);
}
// Тело вращения с радиальной модуляцией dr(x, a) — рёбра гильзы, гофры; нормали по излому.
function latheMod(prof, seg, dr) {
  const pos = [], idx = [];
  const m = prof.length;
  for (let i = 0; i < m; i++) for (let j = 0; j <= seg; j++) {
    const a = j / seg * Math.PI * 2, [x, r] = prof[i];
    const rr = r + (r > 0.01 ? dr(x, a, r) : 0);
    pos.push(x, rr * Math.cos(a), rr * Math.sin(a));
  }
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, b, c, c, b, d);
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = toCreasedNormals(g.toNonIndexed(), 40 * D2R);
  ng.setAttribute("uv", new THREE3.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  return ng;
}
// Звёздочная закрутка дробовой гильзы: вогнутый торец с n складками, смотрит в +x.
function crimpStar(R, x, n = 6, depth = 1.6) {
  const seg = n * 8, rings = 7, pos = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, r = R * (1 - t);
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2;
      const fold = Math.pow(Math.abs(Math.cos(a * n / 2)), 3);
      const d = depth * Math.pow(Math.sin(t * Math.PI * 0.5), 0.8) + fold * 0.55 * Math.sin(t * Math.PI);
      pos.push(x - d, r * Math.cos(a), r * Math.sin(a));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = toCreasedNormals(g.toNonIndexed(), 50 * D2R);
  ng.setAttribute("uv", new THREE3.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  return ng;
}
// Калибры. Базовые поля (L, rim, sh, neck, shX, oal, steel, rimmed, base, shot, head) читает движок.
// Доп. поля: rimT — толщина закраины, groove — Ø проточки экстрактора, ang — угол ската (°),
// pr — Ø капсюля, bd/bl — Ø и длина пули, bt — длина «лодочки», ogL — длина оживала,
// mep — радиус притупления, seal — лак-герметик (капсюль и дульце), tip — окраска носика.
var CAL = {
  "556": { L: 44.7, rim: 9.6, sh: 9, neck: 6.43, shX: 36.5, oal: 57.4, steel: false, base: 9.58, rimT: 1.14, groove: 8.43, ang: 23, pr: 4.45, bd: 5.7, bl: 23.1, bt: 2.2, ogL: 12.4, mep: 0.35, tip: "paintWhite#3d7a3c" },
  "545": { L: 39.8, rim: 10, sh: 9.25, neck: 6.29, shX: 31.5, oal: 57, steel: true, base: 10, rimT: 1.5, groove: 8.6, ang: 28, pr: 4.5, bd: 5.62, bl: 25.5, bt: 2.8, ogL: 15.4, mep: 0.25, seal: "paintRed#8a1f3c" },
  "762x39": { L: 38.6, rim: 11.35, sh: 10.07, neck: 8.6, shX: 30.5, oal: 56, steel: true, base: 11.35, rimT: 1.5, groove: 9.6, ang: 18, pr: 5.5, bd: 7.91, bl: 26.8, bt: 3, ogL: 14.2, mep: 0.5, seal: "paintRed#8a1f3c" },
  "762x51": { L: 51.2, rim: 11.9, sh: 11.53, neck: 8.77, shX: 39.6, oal: 71.1, steel: false, base: 11.96, rimT: 1.37, groove: 10.39, ang: 20, pr: 5.33, bd: 7.82, bl: 28.6, bt: 3.2, ogL: 16.6, mep: 0.5 },
  // 9×19 — слегка коническая гильза без ската, пуля с круглой оживальной головкой, обжим «на конус»
  "9x19": { L: 19.15, rim: 9.96, sh: 9.93, neck: 9.65, shX: 18.4, oal: 29.7, steel: false, base: 9.93, rimT: 1.27, groove: 8.79, taper: true, pr: 4.45, bd: 9.01, bl: 15.5, bt: 0, ogL: 8.6, mep: 1.5 },
  // 7,62×54R — с выступающей закраиной, пуля ЛПС с «лодочкой», капсюль Бердана под лаком
  "762x54R": { L: 53.7, rim: 14.4, base: 12.37, sh: 11.61, neck: 8.53, shX: 42.8, oal: 77.2, steel: true, rimmed: true, rimT: 1.6, ang: 20, pr: 5.5, bd: 7.92, bl: 32.5, bt: 4, ogL: 19.5, mep: 0.5, seal: "paintRed#8a1f3c" },
  // 12/70: латунное донце + пластиковая гильза с рёбрами и звёздочной закруткой
  "12ga": { L: 65, rim: 22.3, sh: 20.5, neck: 20.5, shX: 60, oal: 65, head: 12, shot: true, rimT: 1.5, pr: 6.2 }
};
// Профиль гильзы от донца (x=0) к дульцу: капсюль в гнезде, закраина, проточка, скат, дульце.
function caseProfile(c) {
  const rr = c.rim / 2, rb = (c.base ?? c.rim) / 2, s = c.sh / 2, n = c.neck / 2, t = c.rimT ?? 1.2, pr = (c.pr ?? 4.5) / 2;
  const P = [[0.14, 0], [0.14, pr - 0.3], [0.2, pr - 0.08], [0.45, pr + 0.02], [0.1, pr + 0.28], [0, pr + 0.5], [0, rr - 0.35], [0.3, rr], [t - 0.22, rr], [t, rr - 0.28]];
  let x;
  if (c.rimmed) {
    P.push([t + 0.1, rb + 0.25], [t + 0.6, rb]);
    x = t + 0.6;
  } else {
    const rg = (c.groove ?? c.rim - 1.6) / 2;
    P.push([t + 0.08, rg], [t + 0.75, rg]);
    x = t + 0.75 + (rb - rg) / Math.tan(35 * D2R);
    P.push([x, rb]);
  }
  if (c.taper) {
    P.push([c.L - 1.6, n + 0.05], [c.L - 0.2, n - 0.07], [c.L, n - 0.12]);
  } else {
    const nx = c.shX + (s - n) / Math.tan((c.ang ?? 20) * D2R);
    P.push([c.shX - 0.5, s + 0.01], [c.shX, s - 0.02], [c.shX + 0.25 * (nx - c.shX), s - 0.3 * (s - n)], [nx - 0.3, n + 0.04], [nx, n], [c.L - 0.25, n], [c.L, n - 0.1]);
  }
  const wall = c.taper ? 0.28 : 0.33;
  P.push([c.L, n - wall], [c.L - 4, n - wall - 0.05], [c.L - 4, 0]);
  return P;
}
function caseGeo(cal) {
  const c = CAL[cal] || CAL["556"];
  if (c.shot) return merge([shotHead(c), shotHull(c)]);
  return latheX(caseProfile(c), { seg: 22, crease: 45 });
}
// Профиль пули: «лодочка», ведущая часть с канавкой-каннелюрой у дульца, касательное оживало.
function bulletPts(c) {
  const R = (c.bd ?? c.neck - 0.7) / 2, bl = c.bl ?? c.oal - c.L + 5, x0 = c.oal - bl, xt = c.oal;
  const bt = c.bt ?? 0, ogL = Math.min(c.ogL ?? bl * 0.55, bl - bt - 2), mep = Math.min(c.mep ?? 0.4, R * 0.6);
  const pts = [[x0, 0]];
  if (bt > 0) {
    const rb = R - bt * Math.tan(9 * D2R);
    pts.push([x0, rb - 0.25], [x0 + 0.25, rb], [x0 + bt, R - 0.02], [x0 + bt + 0.4, R]);
  } else pts.push([x0, R - 0.5], [x0 + 0.5, R]);
  const xo = xt - ogL, cx = c.L + 0.35;
  if (!c.taper && cx - 0.7 > x0 + bt + 0.5 && cx + 0.7 < xo) pts.push([cx - 0.6, R], [cx - 0.35, R - 0.14], [cx + 0.35, R - 0.14], [cx + 0.6, R]);
  pts.push([xo, R]);
  const rho = (ogL * ogL + R * R) / (2 * R);
  const um = Math.sqrt(Math.max(0, rho * rho - Math.pow(mep + rho - R, 2)));
  const N = 12;
  for (let i = 1; i <= N; i++) {
    const u = um * (1 - Math.pow(1 - i / N, 1.35));
    pts.push([xo + u * ogL / um, Math.sqrt(Math.max(0, rho * rho - u * u)) - (rho - R)]);
  }
  pts.push([xt, mep * 0.55], [xt, 0]);
  return { pts, R, xt };
}
function bulletGeo(cal) {
  const c = CAL[cal] || CAL["556"];
  return latheX(bulletPts(c).pts, { seg: 18, crease: 50 });
}
// Латунное донце 12 калибра: капсюль-«наковаленка» в чашечке, кольцо клейма, закраина, завальцовка.
function shotHead(c) {
  const r = c.rim / 2, s = c.sh / 2, hb = s + 0.2, t = c.rimT ?? 1.5, H = c.head, pr = (c.pr ?? 6.2) / 2;
  return latheX([
    [0.16, 0], [0.16, pr - 0.9], [0.05, pr - 0.75], [0.05, pr - 0.1], [0.35, pr], [0.02, pr + 0.3], [0, pr + 0.5],
    [0, 6.8], [0.14, 7], [0, 7.2], [0, r - 0.45], [0.4, r], [t - 0.3, r], [t, r - 0.3], [t + 0.35, hb],
    [H - 3.6, hb], [H - 3.3, hb + 0.12], [H - 2.6, hb + 0.12], [H - 2.3, hb], [H - 0.7, hb], [H - 0.15, hb - 0.12], [H, s + 0.02], [H, 0]
  ], { seg: 32, crease: 45 });
}
// Пластиковая гильза: продольные рёбра, закрутка (или раскрывшиеся лепестки у стреляной).
function shotHull(c, fired) {
  const s = c.sh / 2, L = c.L, H = c.head;
  const x0 = H - 0.8, rib0 = H + 1.5, rib1 = L - 3.2;
  const ribs = (x, a) => x > rib0 && x < rib1 ? 0.2 * Math.pow(Math.max(0, Math.cos(a * 12)), 6) : 0;
  if (fired) {
    const E = L + 6;
    return latheMod([[x0, 0], [x0, s - 0.1], [H + 0.2, s], [rib0, s], [(rib0 + rib1) / 2, s], [rib1, s], [E - 4, s + 0.05], [E - 1, s + 0.45], [E, s + 0.6], [E, s], [E - 3, s - 0.55], [H + 2, s - 0.6], [H + 2, 0]], 48, (x, a, r) => x > E - 5 ? 0.25 * Math.cos(a * 6) * (x - (E - 5)) / 5 : r > s - 0.3 ? ribs(x, a) : 0);
  }
  const R0 = s - 1.9;
  const body = latheMod([[x0, 0], [x0, s - 0.1], [H + 0.2, s], [rib0, s], [(rib0 + rib1) / 2, s], [rib1, s], [L - 2.2, s], [L - 1.1, s - 0.35], [L - 0.4, s - 1], [L, R0]], 48, ribs);
  return merge([body, crimpStar(R0, L, 6, 1.7)]);
}
function cartridge(k, cal, t) {
  const c = CAL[cal] || CAL["556"];
  const tt = () => t && { ...t };
  if (c.shot) {
    k.add("brass", shotHead(c), tt());
    k.add("hullRed", shotHull(c), tt());
    return;
  }
  k.add(c.steel ? "steelCase" : "brass", caseGeo(cal), tt());
  const b = bulletPts(c);
  k.add("copper", latheX(b.pts, { seg: 18, crease: 50 }), tt());
  const pr = (c.pr ?? 4.5) / 2, n = c.neck / 2;
  // капсюль: медный у стальных гильз, латунный — у латунных
  k.add(c.steel ? "copper" : "brass", latheX([[0.1, 0], [0.1, pr - 0.3], [0.2, pr - 0.1], [0.3, pr - 0.1], [0.3, 0]], { seg: 16 }), tt());
  if (c.seal) {
    k.add(c.seal, tubeX(pr + 0.35, pr - 0.15, -0.04, 0.06, { seg: 18, c: 0.01 }), tt());
    k.add(c.seal, tubeX(n - 0.05, b.R - 0.1, c.L - 0.05, c.L + 0.3, { seg: 18, c: 0.02 }), tt());
  }
  if (c.tip) {
    const x0 = b.xt - 4.2, tip = b.pts.filter((p) => p[0] > x0);
    let r0 = 0;
    for (let i = 1; i < b.pts.length; i++) if (b.pts[i][0] >= x0 && b.pts[i - 1][0] <= x0) {
      const [xa, ra] = b.pts[i - 1], [xb, rb2] = b.pts[i];
      r0 = ra + (rb2 - ra) * (x0 - xa) / (xb - xa || 1);
    }
    k.add(c.tip, latheX([[x0, 0], [x0, r0 + 0.03], ...tip.map(([x, r]) => [x + 0.02, r > 0 ? r + 0.03 : 0])], { seg: 18, crease: 50 }), tt());
  }
}
function feedLips(k, mat, x0, x1, y, hw, o = {}) {
  const rise = o.rise ?? 4.5, t = o.t ?? 1.1, curl = o.curl ?? 2.8;
  const sec = [[hw, y - 2], [hw, y + rise - 1.2], [hw - curl * 0.55, y + rise, 0.6], [hw - curl, y + rise - 0.6, 0.4], [hw - curl + 0.3, y + rise - 1.6], [hw - t - 0.4, y + rise - 1.4], [hw - t, y - 2]];
  for (const s of [-1, 1]) {
    k.add(mat, extrudeX(sec.map(([z, yy, r]) => [s * z, yy, r || 0]), x0, x1, { bevel: 0.3 }));
  }
  k.add(mat, extrudeX([[-hw, y - 2], [hw, y - 2], [hw, y + 1.2], [-hw, y + 1.2]], x0, x0 + 1.6, { bevel: 0.3 }));
}

// ==== engine/mounts.js
const THREE4 = window.THREE;
function mount(o) {
  const n = new THREE4.Group();
  n.name = "mount:" + o.id;
  if (o.p) n.position.set(...o.p);
  const face = o.face || "top";
  if (face === "left") n.rotation.x = -Math.PI / 2;
  else if (face === "right") n.rotation.x = Math.PI / 2;
  else if (face === "bottom") n.rotation.x = Math.PI;
  n.userData.mount = { pitch: PICA.PITCH, ...o, face };
  return n;
}
function railMount(id, p, face, slots, extra = {}) {
  return mount({ id, type: "pica", p, face, slots, ...extra });
}
var _m2 = new THREE4.Matrix4();
var _v2 = new THREE4.Vector3();
function toRoot(obj, root) {
  const m = new THREE4.Matrix4();
  const chain = [];
  let o = obj;
  while (o && o !== root) {
    chain.push(o);
    o = o.parent;
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    chain[i].updateMatrix();
    m.multiply(chain[i].matrix);
  }
  return m;
}
var Assembler = class _Assembler {
  // def — описание оружия, lib — общая библиотека модулей, ctx — {THREE, G, mats, Kit}
  constructor(def, lib, ctx) {
    this.def = def;
    this.ctx = ctx;
    this.parts = /* @__PURE__ */ new Map();
    for (const p of [...lib, ...def.parts || []]) this.parts.set(p.id, p);
    this.base = def.build(ctx);
    this.root = new THREE4.Group();
    this.root.name = def.id;
    this.root.add(this.base.root);
    this.cache = /* @__PURE__ */ new Map();
    this.installed = /* @__PURE__ */ new Map();
    this.mounts = /* @__PURE__ */ new Map();
    this.config = {};
  }
  partList() {
    return [...this.parts.values()];
  }
  part(id) {
    return this.parts.get(id);
  }
  // Статическая совместимость: может ли модуль в принципе встать на это оружие.
  static fits(part, slot2, def) {
    // пистолетные фонари держатся на любой планке 1913 — их можно ставить и на длинные стволы
    const railLight = part.cat === "plight" && !part.pistolOnly && slot2.accepts.includes("light");
    if (!slot2.accepts.includes(part.cat) && !railLight) return false;
    if (part.only && !part.only.includes(def.id)) return false;
    if (part.fit?.thread && !part.fit.thread.includes(slot2.thread || def.thread)) return false;
    if (part.fit?.iface && slot2.iface && !part.fit.iface.includes(slot2.iface)) return false;
    return true;
  }
  slotOptions(slot2) {
    return this.partList().filter((p) => _Assembler.fits(p, slot2, this.def));
  }
  collectMounts() {
    this.mounts.clear();
    const walk = (o) => {
      if (o.userData.mount) this.mounts.set(o.userData.mount.id, o);
      for (const c of o.children) walk(c);
    };
    walk(this.root);
  }
  // Все допустимые позиции модуля на наборе планок, отсортированные вдоль оси.
  railPositions(slot2, part, ignoreSlot) {
    const out = [];
    const foot = part.foot || [-5, 5];
    for (const rid of slot2.rails || []) {
      const m = this.mounts.get(rid);
      if (!m) continue;
      const md = m.userData.mount;
      const accepts = part.mountTypes || ["pica"];
      if (!accepts.includes(md.type)) continue;
      const mat = toRoot(m, this.root);
      const n = md.slots || 1;
      for (let i = 0; i < n; i++) {
        const lx = i * (md.pitch || PICA.PITCH);
        if (md.type === "pica") {
          const lo = -PICA.PITCH / 2 - 1.5, hi = (n - 1) * PICA.PITCH + PICA.PITCH / 2 + 1.5;
          if (lx + foot[0] < lo - 0.01 || lx + foot[1] > hi + 0.01) continue;
        }
        const wx = _v2.set(lx, 0, 0).applyMatrix4(mat).x;
        out.push({ rail: rid, i, x: wx, face: md.face, axis: md.axis || md.face });
      }
    }
    out.sort((a, b) => a.x - b.x);
    const body = part.body || part.foot || [-5, 5];
    let limit = Infinity;
    if (slot2.behind) {
      const o = this.installed.get(slot2.behind);
      if (o?.railPos) limit = o.railPos.x + (o.part.body || o.part.foot)[0];
    }
    return out.map((p) => ({ ...p, clash: p.x + body[1] > limit + 0.5 ? "перед прицелом" : this.clash(p, part, ignoreSlot, slot2) }));
  }
  // Модулю «позади прицела» не хватает места: ищем ближайшую позицию прицела
  // дальше вперёд, при которой он встаёт. Возвращает эту позицию или null.
  roomBehind(slot2, part) {
    const tgt = slot2.behind && this.installed.get(slot2.behind);
    if (!tgt?.railPos) return null;
    const save = tgt.railPos;
    const cands = this.railPositions(tgt.slot, tgt.part, tgt.slot.id).filter((p) => !p.clash && p.x > save.x);
    let found = null;
    for (const c of cands) {
      tgt.railPos = c;
      if (this.railPositions(slot2, part, slot2.id).some((p) => !p.clash)) {
        found = c;
        break;
      }
    }
    tgt.railPos = save;
    return found;
  }
  clash(p, part, ignoreSlot, slot2) {
    const ext = (q) => q.body || q.foot || [-5, 5];
    const body = ext(part);
    const x0 = p.x + body[0], x1 = p.x + body[1];
    for (const [sid, it] of this.installed) {
      if (sid === ignoreSlot || !it.railPos) continue;
      if (it.railPos.axis !== p.axis) continue;
      const side = part.side || it.part.side;
      const a = side ? part.foot || body : body, b = side ? it.part.foot || ext(it.part) : ext(it.part);
      const u0 = p.x + a[0], u1 = p.x + a[1];
      const y0 = it.railPos.x + b[0], y1 = it.railPos.x + b[1];
      if (u0 < y1 - 0.5 && y0 < u1 - 0.5) return this.def.slots.find((s) => s.id === sid)?.label || sid;
    }
    for (const z of this.def.keepOut || []) {
      if (z.axis !== p.axis) continue;
      if (z.slots && !z.slots.includes(slot2.id)) continue;
      if (x0 < z.x1 && z.x0 < x1) return z.label;
    }
    return null;
  }
  built(slotId, part) {
    const key = slotId + "|" + part.id;
    if (!this.cache.has(key)) {
      const res = part.build(this.ctx, { weapon: this.def, slot: slotId });
      const obj = res.root || res;
      obj.name = "part:" + part.id;
      obj.userData.partId = part.id;
      obj.userData.slotId = slotId;
      obj.traverse((o) => {
        if (o.isMesh) {
          o.userData.partId = part.id;
          o.userData.slotId = slotId;
        }
      });
      this.cache.set(key, { obj, info: res.root ? res : { root: obj } });
    }
    return this.cache.get(key);
  }
  // Применяет конфигурацию {slotId: {id, pos}}; возвращает исправленную версию.
  apply(config) {
    for (const it of this.installed.values()) it.obj.parent?.remove(it.obj);
    this.installed.clear();
    const out = {};
    const hidden = /* @__PURE__ */ new Set();
    this.collectMounts();
    for (const slot2 of this.def.slots) {
      const want = config[slot2.id];
      const pid = want && typeof want === "object" ? want.id : want;
      if (!pid) {
        out[slot2.id] = null;
        continue;
      }
      const part = this.parts.get(pid);
      if (!part || !_Assembler.fits(part, slot2, this.def)) {
        out[slot2.id] = null;
        continue;
      }
      if (part.needs && !part.needs(out, this)) {
        out[slot2.id] = null;
        continue;
      }
      let host = null, railPos = null;
      if (slot2.rails) {
        const ps = this.railPositions(slot2, part, slot2.id).filter((p) => !p.clash);
        if (!ps.length) {
          out[slot2.id] = null;
          continue;
        }
        const wantPos = want && typeof want === "object" && want.pos != null ? want.pos : null;
        let pick = null;
        if (wantPos) pick = ps.find((p) => p.rail === wantPos.rail && p.i === wantPos.i);
        if (!pick) {
          const pref = slot2.prefer;
          if (pref && typeof pref === "object") pick = ps.reduce((a, b) => Math.abs(b.x - pref.x) < Math.abs(a.x - pref.x) ? b : a);
          else if (pref === "front") pick = ps[ps.length - 1];
          else if (pref === "rear") pick = ps[0];
          else pick = ps[Math.floor(ps.length / 2)];
        }
        railPos = pick;
        host = this.mounts.get(pick.rail);
      } else {
        host = this.mounts.get(slot2.mount);
      }
      if (!host) {
        out[slot2.id] = null;
        continue;
      }
      const { obj, info } = this.built(slot2.id, part);
      obj.position.set(railPos ? railPos.i * (host.userData.mount.pitch || PICA.PITCH) : 0, 0, 0);
      obj.rotation.set(0, 0, 0);
      host.add(obj);
      this.installed.set(slot2.id, { part, obj, info, host, railPos, slot: slot2 });
      for (const h of part.hides || []) hidden.add(h);
      out[slot2.id] = { id: pid, pos: railPos ? { rail: railPos.rail, i: railPos.i } : null };
      obj.traverse((o) => {
        if (o.userData.mount) this.mounts.set(o.userData.mount.id, o);
      });
    }
    this.base.root.traverse((o) => {
      if (o.userData.hideKey) o.visible = !hidden.has(o.userData.hideKey);
    });
    this.config = out;
    return out;
  }
  info(slotId) {
    return this.installed.get(slotId)?.info || null;
  }
  // Все установленные модули с заданным свойством info (sight, light, laser ...).
  withInfo(key) {
    const out = [];
    for (const [sid, it] of this.installed) if (it.info && it.info[key]) out.push({ slotId: sid, ...it, data: it.info[key] });
    if (this.base[key]) out.unshift({ slotId: "_base", obj: this.base.root, data: this.base[key], info: this.base });
    return out;
  }
  stats() {
    const s = { ...this.def.base };
    const mods = [];
    for (const it of this.installed.values()) if (it.part.stats) mods.push(it.part.stats);
    for (const m of mods) {
      for (const [k, v] of Object.entries(m)) {
        if (k === "mag") continue;
        if (k.endsWith("%")) {
          const kk = k.slice(0, -1);
          s[kk] = (s[kk] ?? 0) * (1 + v / 100);
        } else if (k === "loud" || k === "flash" || k === "velocity" || k === "rangeAdd") s[k] = (s[k] ?? 0) + v;
        else s[k] = (s[k] ?? 0) + v;
      }
    }
    for (const it of this.installed.values()) if (it.part.stats?.mag) s.mag = it.part.stats.mag;
    return s;
  }
};

// ==== engine/ctx.js
const THREE5 = window.THREE;
function makeCtx(mats) {
  return {
    THREE: THREE5,
    G: geo_exports,
    C: common_exports,
    mats,
    mount,
    railMount,
    kit: () => new Kit(mats),
    // Узел, скрываемый при установке модуля с part.hides = [key]
    hideable(obj, key) {
      obj.userData.hideKey = key;
      return obj;
    }
  };
}

const AUDIO_FAMILY = {
  B: (() => {
// ---- engine/audio_b/foley.js
var R = Math.random;
// пик удара уровня 1 (≈ −10 дБ полной шкалы): самый громкий звук механики — удар рамы — остаётся
// заметно тише выстрела, мелочь (кнопки, трение) — соответственно тише
var FOLEY_REF = 0.4;
var jit = (v, k = 0.1) => v * (1 - k + R() * 2 * k);
function biquad(d, sr, type, f, q = 0.707) {
  const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, cw = Math.cos(w), sw = Math.sin(w), a = sw / (2 * q);
  let b0, b1, b2;
  if (type === "lp") {
    b0 = (1 - cw) / 2;
    b1 = 1 - cw;
    b2 = b0;
  } else if (type === "hp") {
    b0 = (1 + cw) / 2;
    b1 = -(1 + cw);
    b2 = b0;
  } else {
    b0 = a;
    b1 = 0;
    b2 = -a;
  }
  const a0 = 1 + a, a1 = -2 * cw, a22 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i], y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a22 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    d[i] = y;
  }
  return d;
}
var BODY = {
  // фрезерованный алюминий ствольной коробки AR/SCAR: плотный, сухой
  alu: { f0: 380, f1: 9e3, n: 48, tau: 7e-3, tilt: -0.25, decK: 0.75 },
  // штампованная сталь АК: тонкий лист — ярче и чуть дольше
  sheet: { f0: 450, f1: 9500, n: 56, tau: 0.011, tilt: -0.15, decK: 0.7 },
  // массивные стальные детали (затворная рама, защёлка)
  steel: { f0: 900, f1: 11e3, n: 40, tau: 4e-3, tilt: -0.1, decK: 0.8 },
  // мелкая пружинная сталь (кнопка, защёлка, фиксатор)
  small: { f0: 2200, f1: 13e3, n: 30, tau: 22e-4, tilt: 0, decK: 0.85 },
  // полимерный магазин / накладки — глухо и коротко
  poly: { f0: 250, f1: 5e3, n: 36, tau: 4e-3, tilt: -0.6, decK: 0.6 },
  // стальной магазин — корпус из тонкого листа
  magSteel: { f0: 500, f1: 8e3, n: 44, tau: 6e-3, tilt: -0.3, decK: 0.7 },
  // латунь патронов в магазине
  brass: { f0: 2500, f1: 12e3, n: 24, tau: 18e-4, tilt: -0.1, decK: 0.8 },
  // бетон/земля при падении
  ground: { f0: 150, f1: 3500, n: 30, tau: 4e-3, tilt: -0.8, decK: 0.5 }
};
var Track = class {
  constructor(sr, sec) {
    this.sr = sr;
    this.d = new Float32Array(Math.ceil(sr * sec));
  }
  // Банк резонаторов, возбуждаемых сигналом x (начиная с отсчёта i0).
  // level — пиковая амплитуда события (×REF): раньше выход рос с длительностью контакта и числом
  // микроударов (пластик — в 50 раз громче стали, трение — десятки единиц), а буфер затем
  // резался tanh в «прямоугольник» и нормировался в 0,9 — щелчок звучал как удар рамы, с хрипом.
  resonate(x, i0, body, level, damp = 1) {
    const sr = this.sr, d = this.d, B = BODY[body] || body;
    const tail = Math.ceil(sr * Math.min(0.12, B.tau * 8 * damp));
    const n = Math.min(d.length - i0, x.length + tail);
    if (n <= 0) return;
    const out = new Float32Array(n);
    const lf0 = Math.log(B.f0), lf1 = Math.log(B.f1);
    let norm = 0;
    for (let m = 0; m < B.n; m++) {
      const f = Math.exp(lf0 + (lf1 - lf0) * R());
      const tau = B.tau * damp * Math.pow(f / 1e3, -B.decK) * (0.6 + R() * 0.8);
      const r = Math.exp(-1 / (Math.max(4e-4, tau) * sr));
      const w = 2 * Math.PI * f / sr;
      const c1 = 2 * r * Math.cos(w), c2 = -r * r;
      const g = (0.25 + R() * 0.75) * Math.pow(f / 1e3, B.tilt) * (1 - r) * 2;
      norm += g;
      let y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) {
        const y = (i < x.length ? x[i] : 0) * g + c1 * y1 + c2 * y2;
        y2 = y1;
        y1 = y;
        out[i] += y;
      }
    }
    let pk = 0;
    for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out[i]));
    const k = level * FOLEY_REF / Math.max(1e-9, pk);
    for (let i = 0; i < n; i++) d[i0 + i] += out[i] * k;
  }
  // Удар: контакт длительностью tc (с) + шумовой «треск» контакта + корпус.
  hit(t, level, body, o = {}) {
    const sr = this.sr, i0 = Math.floor(t * sr);
    if (i0 >= this.d.length) return this;
    const tc = jit(o.tc ?? 2e-4, 0.2);
    const nc = Math.max(2, Math.round(tc * sr));
    const nn = Math.round((o.noise ?? 12e-4) * sr);
    const x = new Float32Array(Math.max(nc, nn) + 2);
    for (let i = 0; i < nc; i++) x[i] += Math.sin(Math.PI * i / nc) ** 2 * (o.push ?? 1);
    const na = o.grit ?? 0.35;
    for (let i = 0; i < nn; i++) x[i] += (R() * 2 - 1) * na * Math.exp(-i / (nn * 0.3 + 1));
    this.resonate(x, i0, body, level, o.damp ?? 1);
    if (o.click) {
      const m = Math.round(15e-4 * sr), b = new Float32Array(m);
      for (let i = 0; i < m; i++) b[i] = (R() * 2 - 1) * Math.exp(-i / (sr * 25e-5));
      biquad(b, sr, "hp", o.clickHp ?? 3e3, 0.7);
      for (let i = 0; i < m && i0 + i < this.d.length; i++) this.d[i0 + i] += b[i] * level * o.click;
    }
    return this;
  }
  // Масса оружия: низкий глухой «тук» (руки гасят его за 20–40 мс).
  mass(t, level, f = 160, dec = 0.025) {
    const sr = this.sr, i0 = Math.floor(t * sr), n = Math.min(this.d.length - i0, Math.ceil(sr * dec * 6));
    if (n <= 0) return this;
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = (R() * 2 - 1) * Math.exp(-i / (sr * dec * 0.35));
    biquad(b, sr, "lp", jit(f * 2.2), 0.7);
    biquad(b, sr, "lp", jit(f * 2.2), 0.7);
    biquad(b, sr, "hp", 45, 0.7);
    const np = Math.round(sr / f * 0.5);
    const k = level * FOLEY_REF * 1.6;
    for (let i = 0; i < n; i++) this.d[i0 + i] += k * (b[i] * 2.2 + (i < np ? Math.sin(Math.PI * i / np) * 0.5 : 0));
    return this;
  }
  // Трение: поток микрозацепов через корпус + широкополосное шуршание.
  scrape(t, dur, level, body, o = {}) {
    const sr = this.sr, i0 = Math.floor(t * sr), n = Math.min(this.d.length - i0, Math.floor(dur * sr));
    if (n <= 0) return this;
    const x = new Float32Array(n), hiss = new Float32Array(n);
    const rate0 = o.rate ?? 700, rate1 = o.rate1 ?? rate0;
    const shape2 = o.shape || ((k) => Math.sin(Math.PI * Math.min(1, k * 1.1)) ** 0.6);
    let next = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n, env = shape2(k), rate = rate0 + (rate1 - rate0) * k;
      if (i >= next) {
        const a = env * (0.3 + R() * 0.7) * (R() < 0.08 ? 2.2 : 1);
        const m = Math.max(2, Math.round(sr * jit(o.tc ?? 15e-5, 0.4)));
        for (let j = 0; j < m && i + j < n; j++) x[i + j] += a * Math.sin(Math.PI * j / m) ** 2;
        next = i + Math.max(1, Math.round(sr / rate * (0.2 + R() * 1.6)));
      }
      hiss[i] = (R() * 2 - 1) * env;
    }
    this.resonate(x, i0, body, level * 0.7, o.damp ?? 0.8);
    biquad(hiss, sr, "bp", o.hissF ?? 3200, 0.6);
    biquad(hiss, sr, "hp", 900, 0.7);
    biquad(hiss, sr, "lp", 6500, 0.7);
    const h = (o.hiss ?? 0.25) * level * FOLEY_REF * 2;
    for (let i = 0; i < n; i++) this.d[i0 + i] += hiss[i] * h;
    return this;
  }
  // Патроны в магазине: n мелких латунных касаний за dur.
  rattle(t, dur, level, n = 6) {
    for (let i = 0; i < n; i++) this.hit(t + R() * dur, level * (0.3 + R() * 0.7), "brass", { tc: 8e-5, noise: 6e-4, grit: 0.5, damp: 0.8 });
    return this;
  }
  // Ладонь по дну магазина: мягкий контакт + шлепок кожи.
  palm(t, level, body = "poly") {
    this.hit(t, level * 0.6, body, { tc: 4e-3, noise: 4e-3, grit: 0.25, damp: 0.7 });
    const sr = this.sr, i0 = Math.floor(t * sr), n = Math.min(this.d.length - i0, Math.round(sr * 0.02));
    const b = new Float32Array(Math.max(0, n));
    for (let i = 0; i < n; i++) b[i] = (R() * 2 - 1) * Math.exp(-i / (sr * 3e-3));
    biquad(b, sr, "bp", jit(1400), 0.8);
    for (let i = 0; i < n; i++) this.d[i0 + i] += b[i] * level * FOLEY_REF * 1.4;
    return this.mass(t + 1e-3, level * 0.5, 120, 0.02);
  }
  // Ткань и снаряжение: шуршание нейлона (полосовой шум с рваной огибающей) и хруст складок.
  cloth(t, dur, level, o = {}) {
    const sr = this.sr, i0 = Math.floor(t * sr), n = Math.min(this.d.length - i0, Math.floor(dur * sr));
    if (n <= 0) return this;
    const b = new Float32Array(n);
    let env = 0, target = 0, next = 0;
    for (let i = 0; i < n; i++) {
      if (i >= next) {
        target = R() < 0.25 ? 0.15 : 0.4 + R() * 0.6;
        next = i + Math.round(sr * (6e-3 + R() * 0.02));
      }
      env += (target - env) * 4e-3;
      const k = i / n, shape2 = Math.sin(Math.PI * Math.min(1, k * 1.05)) ** 0.7;
      b[i] = (R() * 2 - 1) * env * shape2 * (R() < 3e-3 ? 4 : 1);
    }
    biquad(b, sr, "bp", o.f ?? 2400, 0.55);
    biquad(b, sr, "hp", 700, 0.7);
    for (let i = 0; i < n; i++) this.d[i0 + i] += b[i] * level * FOLEY_REF * 1.2;
    return this;
  }
  buffer(ctx) {
    const d = this.d, sr = this.sr;
    biquad(d, sr, "hp", 40, 0.7);
    // уровни событий сохраняются как есть; мягкое колено только выше 0,8 — без клиппинга
    const fade = Math.min(d.length, Math.floor(sr * 0.01));
    for (let i = 0; i < d.length; i++) {
      const v = d[i], a = Math.abs(v);
      const s = a < 0.8 ? v : Math.sign(v) * (0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18));
      d[i] = s * (i > d.length - fade ? (d.length - i) / fade : 1);
    }
    const b = ctx.createBuffer(1, d.length, sr);
    b.getChannelData(0).set(d);
    return b;
  }
};
var recv = (o) => o.fam === "ak" ? "sheet" : "alu";
var magB = (o) => o.kind === "steel" ? "magSteel" : "poly";
var RECIPES = {
  // Сброс магазина. AR/SCAR: кнопка → защёлка отпускает → магазин выскальзывает
  // под собственным весом (трение о шахту, патроны шевелятся).
  // АК: нажим на рычаг защёлки, магазин проворачивают вперёд и выводят зацеп.
  magOut(T2, o) {
    const fr = o.fill === 0 ? 0 : o.fill === 1 ? 0.7 : 1;
    const r0 = T2.rattle.bind(T2);
    T2.rattle = (t, dur, lv, n) => fr ? r0(t, dur, lv * fr, n) : T2.hit(t + dur * 0.5, lv * 0.6, "small", { tc: 2e-4, damp: 1.4 });
    if (o.fam === "ak") {
      T2.hit(0, 0.35, "small", { tc: 15e-4, noise: 2e-3, grit: 0.2 });
      T2.hit(0.03, 0.7, "steel", { tc: 12e-5, click: 0.25 });
      T2.hit(0.032, 0.45, "sheet", { tc: 2e-4, damp: 0.8 });
      T2.scrape(0.05, 0.1, 0.35, magB(o), { rate: 500, rate1: 300, tc: 3e-4 });
      T2.hit(0.15, 0.55, magB(o), { tc: o.kind === "steel" ? 3e-4 : 8e-4 });
      T2.hit(0.152, 0.3, "sheet", { tc: 3e-4, damp: 0.7 });
      T2.rattle(0.15, 0.1, 0.12, 5);
    } else {
      T2.hit(0, 0.3, "small", { tc: 18e-4, noise: 2e-3, grit: 0.2 });
      T2.hit(0.012, 0.6, "small", { tc: 1e-4, click: 0.3 });
      T2.hit(0.013, 0.35, recv(o), { tc: 15e-5, damp: 0.6 });
      T2.scrape(0.02, 0.12, 0.4, magB(o), { rate: 900, rate1: 500, tc: 18e-5, hiss: 0.3, shape: (k) => (1 - k) ** 0.7 * Math.min(1, k * 8) });
      T2.rattle(0.03, 0.12, 0.1, 6);
      T2.hit(0.135, 0.3, magB(o), { tc: 4e-4 });
    }
  },
  // Магазин входит в шахту: касание раструба, скольжение.
  magInsert(T2, o) {
    if (o.fam === "ak") {
      T2.hit(0, 0.55, magB(o), { tc: o.kind === "steel" ? 25e-5 : 7e-4 });
      T2.hit(2e-3, 0.35, "sheet", { tc: 2e-4, damp: 0.7 });
      T2.scrape(0.012, 0.06, 0.28, magB(o), { rate: 600, tc: 2e-4 });
      T2.rattle(0, 0.05, 0.1, 4);
    } else {
      T2.hit(0, 0.4, magB(o), { tc: o.kind === "steel" ? 3e-4 : 8e-4 });
      T2.scrape(6e-3, 0.1, 0.42, magB(o), { rate: 600, rate1: 1300, tc: 16e-5, hiss: 0.35, hissF: 2600, shape: (k) => Math.min(1, k * 5) * (1 - 0.4 * k) });
      T2.rattle(0.01, 0.09, 0.08, 5);
    }
  },
  // Посадка: магазин в упор, защёлка заскакивает в окно (+ ладонь по дну у AR/SCAR).
  magIn(T2, o) {
    if (o.fam === "ak") {
      T2.scrape(0, 0.045, 0.22, "sheet", { rate: 450, tc: 25e-5, hiss: 0.15 });
      T2.hit(0.048, 1, "steel", { tc: 1e-4, click: 0.35 });
      T2.hit(0.048, 0.8, "sheet", { tc: 15e-5 });
      T2.hit(0.05, 0.45, magB(o), { tc: 3e-4 });
      T2.mass(0.048, 0.35, 170, 0.02);
      T2.rattle(0.052, 0.06, 0.1, 4);
    } else {
      T2.hit(0, 0.9, recv(o), { tc: 18e-5, click: 0.15 });
      T2.hit(1e-3, 0.5, magB(o), { tc: 4e-4 });
      T2.mass(0, 0.45, 150, 0.025);
      T2.hit(9e-3, 0.75, "small", { tc: 8e-5, click: 0.35 });
      T2.rattle(4e-3, 0.05, 0.1, 5);
      T2.palm(0.05, 0.55, magB(o));
      T2.hit(0.052, 0.3, recv(o), { tc: 3e-4, damp: 0.7 });
    }
  },
  // Рукоять назад: хват, отпирание, трение рамы, сжатие пружины, упор.
  chargeBack(T2, o) {
    const ak = o.fam === "ak";
    T2.hit(0, 0.2, "poly", { tc: 3e-3, noise: 3e-3, grit: 0.2 });
    if (!ak) T2.hit(0.012, 0.45, "small", { tc: 1e-4, click: 0.2 });
    T2.hit(0.02, 0.55, "steel", { tc: 15e-5 });
    T2.scrape(0.03, 0.15, 0.5, ak ? "sheet" : "steel", { rate: ak ? 500 : 900, rate1: ak ? 900 : 1500, tc: 16e-5, hiss: 0.3, hissF: 3800 });
    T2.hit(0.18, 0.6, ak ? "sheet" : recv(o), { tc: 2e-4 });
    T2.hit(0.181, 0.4, "steel", { tc: 12e-5, damp: 0.7 });
  },
  // Рама вперёд: пружина разгоняет, досылание патрона, мощное запирание.
  chargeRelease(T2, o) {
    const big = o.fam === "ak" || o.cal === "762x51" ? 1.15 : 1;
    T2.scrape(0, 0.035, 0.45, "steel", { rate: 1800, tc: 12e-5, hiss: 0.35, hissF: 4500 });
    T2.scrape(0.02, 0.02, 0.3, "brass", { rate: 1500, tc: 1e-4 });
    T2.hit(0.042, 1 * big, "steel", { tc: 1e-4, click: 0.3 });
    T2.hit(0.042, 0.9 * big, recv(o), { tc: 15e-5 });
    T2.mass(0.042, 0.5 * big, 140, 0.028);
    T2.hit(0.05, 0.4, "small", { tc: 1e-4, damp: 0.8 });
    if (o.fam !== "ak") T2.hit(0.075, 0.3, "small", { tc: 1e-4, click: 0.15 });
  },
  // Затворная задержка: ладонь по кнопке, рама вперёд.
  boltCatch(T2, o) {
    T2.hit(0, 0.35, "small", { tc: 15e-4, noise: 2e-3 });
    T2.hit(0.01, 0.45, "small", { tc: 1e-4, click: 0.2 });
    T2.scrape(0.012, 0.03, 0.4, "steel", { rate: 1800, tc: 12e-5, hiss: 0.3, hissF: 4500 });
    T2.hit(0.043, 1, "steel", { tc: 1e-4, click: 0.3 });
    T2.hit(0.043, 0.85, recv(o), { tc: 15e-5 });
    T2.mass(0.043, 0.45, 140, 0.028);
  },
  // Магазин падает на бетон и подпрыгивает.
  // Магазин о бетонный пол. Полный — тяжёлый глухой удар и почти без отскока;
  // пустой — лёгкий, звонкий, скачет и дребезжит пружиной с подавателем.
  magGround(T2, o) {
    const steel = o.kind === "steel";
    const full = o.fill === 2, empty = o.fill === 0;
    const ground = { ...BODY.ground, f0: 220, f1: 5200, tau: 5e-3 };
    T2.hit(0, full ? 1 : 0.75, ground, { tc: full ? 9e-4 : 5e-4 });
    T2.hit(1e-3, full ? 0.7 : 0.85, magB(o), { tc: steel ? 15e-5 : 5e-4, click: steel ? 0.25 : 0.06 });
    T2.mass(0, full ? 0.6 : 0.25, full ? 95 : 140, 0.02);
    if (!empty) T2.rattle(2e-3, 0.08, full ? 0.28 : 0.2, full ? 10 : 6);
    else {
      T2.hit(4e-3, 0.3, "small", { tc: 2e-4 });
      T2.hit(0.03, 0.2, "small", { tc: 2e-4 });
    }
    let t = 0.08 + R() * 0.04, a = full ? 0.25 : 0.55;
    for (let i = 0; i < (full ? 1 : 3); i++) {
      T2.hit(t, a, magB(o), { tc: steel ? 2e-4 : 6e-4 });
      T2.hit(t, a * 0.8, ground, { tc: 6e-4 });
      if (empty) T2.hit(t + 3e-3, a * 0.4, "small", { tc: 2e-4 });
      t += (0.07 + R() * 0.05) * (1 - i * 0.3);
      a *= 0.5;
    }
  },
  // Магазин из подсумка: рука, шуршание нейлона, магазин выходит из кармана, патроны.
  pouch(T2, o) {
    T2.cloth(0, 0.34, 0.5, { f: 2100 });
    T2.hit(0.05, 0.25, "poly", { tc: 3e-3, noise: 4e-3, grit: 0.3 });
    T2.scrape(0.12, 0.16, 0.3, magB(o), { rate: 400, rate1: 250, tc: 4e-4, hiss: 0.45, hissF: 1800 });
    T2.rattle(0.15, 0.16, 0.12, 6);
    T2.hit(0.29, 0.2, magB(o), { tc: 6e-4 });
    T2.cloth(0.3, 0.12, 0.25, { f: 2800 });
  },
  // Проверка посадки: рывок магазина вниз — стук в защёлку.
  tug(T2, o) {
    T2.hit(0, 0.35, magB(o), { tc: 4e-4 });
    T2.hit(2e-3, 0.25, "small", { tc: 15e-5 });
    T2.rattle(3e-3, 0.03, 0.06, 3);
  },
  // Вскидка: ткань, приклад в плечо (глухой удар в плечевую накладку).
  shoulder(T2) {
    T2.cloth(0, 0.16, 0.35, { f: 2e3 });
    T2.hit(0.11, 0.3, "poly", { tc: 4e-3, noise: 4e-3, grit: 0.2, damp: 0.6 });
    T2.mass(0.11, 0.2, 90, 0.03);
  },
  // Опускание оружия.
  unshoulder(T2) {
    T2.cloth(0, 0.14, 0.25, { f: 2300 });
  },
  // Спуск без выстрела: удар курка по ударнику.
  dryFire(T2, o) {
    T2.hit(0, 0.25, "small", { tc: 1e-4 });
    T2.hit(6e-3, 0.8, "steel", { tc: 1e-4, click: 0.25 });
    T2.hit(6e-3, 0.45, recv(o), { tc: 2e-4, damp: 0.7 });
  },
  // Переводчик: подпружиненный фиксатор перескакивает в лунку.
  selector(T2, o) {
    // у АК длинный штампованный рычаг бьёт по крышке — громкий «клац», у AR/SCAR — короткий щелчок
    const ak = o.fam === "ak";
    T2.scrape(0, 0.03, 0.18, "small", { rate: 1500, tc: 1e-4, hiss: 0.1 });
    T2.hit(0.03, ak ? 1 : 0.6, "small", { tc: 1e-4, click: 0.25 });
    T2.hit(0.031, ak ? 0.75 : 0.3, recv(o), { tc: 2e-4, damp: ak ? 0.9 : 0.6 });
  },
  click(T2) {
    T2.hit(0, 0.5, "small", { tc: 1e-4, click: 0.2 });
  },
  // Короткий удар металла общего назначения (детали на планке, сошки, приклад).
  tick(T2, o) {
    T2.hit(0, 0.6, o.kind === "poly" ? "poly" : "steel", { tc: o.kind === "poly" ? 6e-4 : 12e-5, click: 0.15 });
  },
  // Механика при выстреле: отпирание, удар рамы в буфер, накат и запирание.
  cycle(T2, o) {
    const cyc = 60 / (o.rpm || 700);
    T2.hit(1e-3, 0.45, "steel", { tc: 1e-4 });
    T2.scrape(4e-3, cyc * 0.35, 0.25, "steel", { rate: 2e3, tc: 1e-4, hiss: 0.2, hissF: 4500 });
    T2.hit(cyc * 0.45, 0.4, recv(o), { tc: 2e-4 });
    T2.hit(cyc * 0.85, 0.7, "steel", { tc: 1e-4, click: 0.15 });
    T2.hit(cyc * 0.85, 0.5, recv(o), { tc: 15e-5 });
  },
  // Литиевые элементы CR123A: стальной корпус, щёлкают друг о друга и о трубку фонаря.
  battCells(T2) {
    const cell = { ...BODY.small, f0: 1500, f1: 9e3, tau: 4e-3, n: 26 };
    T2.scrape(0, 0.08, 0.15, "alu", { rate: 700, tc: 2e-4, hiss: 0.15 });
    T2.hit(0.07, 0.5, cell, { tc: 15e-5, click: 0.1 });
    T2.hit(0.1 + R() * 0.02, 0.35, cell, { tc: 15e-5 });
    T2.hit(0.2, 0.25, "poly", { tc: 2e-3, noise: 3e-3 });
  },
  // Гильза о бетон: тонкостенная латунная (стальная) трубка звенит коротко.
  casing(T2, o) {
    const body = o.kind === "steel" ? { ...BODY.magSteel, f0: 1800, f1: 9e3, tau: 0.02, n: 30 } : { ...BODY.brass, f0: 2600, f1: 11e3, tau: 0.03, n: 26, decK: 0.5 };
    T2.hit(0, 1.2, body, { tc: 8e-5, noise: 8e-4 });
    T2.hit(0.06 + R() * 0.05, 0.6, body, { tc: 1e-4 });
    T2.hit(0.15 + R() * 0.08, 0.3, body, { tc: 1e-4 });
  }
};
var LEN = { pouch: 0.48, tug: 0.08, shoulder: 0.22, unshoulder: 0.16, battCells: 0.3, magOut: 0.3, magInsert: 0.16, magIn: 0.16, chargeBack: 0.26, chargeRelease: 0.16, boltCatch: 0.14, magGround: 0.5, dryFire: 0.08, selector: 0.08, click: 0.05, tick: 0.06, cycle: 0.14, casing: 0.36 };
var VARIANTS = 3;
var Foley = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.cache = /* @__PURE__ */ new Map();
  }
  buffer(name, o = {}) {
    const key = name + "|" + (o.fam || "") + "|" + (o.kind || "") + "|" + (o.cal || "") + "|" + (o.rpm || "") + "|" + (o.fill ?? "");
    let list = this.cache.get(key);
    if (!list) {
      list = [];
      for (let v = 0; v < VARIANTS; v++) {
        const T2 = new Track(this.ctx.sampleRate, LEN[name] || 0.2);
        RECIPES[name](T2, o);
        list.push(T2.buffer(this.ctx));
      }
      this.cache.set(key, list);
    }
    return list[Math.random() * list.length | 0];
  }
};
var FOLEY_NAMES = Object.keys(RECIPES);

// ---- engine/audio_b/audio.js
var CAL2 = {
  "556": { blastF: 7200, blastT: 0.075, bodyF: 150, bodyT: 0.09, body: 0.55, crack: 0.9, level: 1, mechF: 3400 },
  "545": { blastF: 7600, blastT: 0.07, bodyF: 140, bodyT: 0.09, body: 0.55, crack: 0.95, level: 1, mechF: 2900 },
  "762x39": { blastF: 5200, blastT: 0.1, bodyF: 105, bodyT: 0.13, body: 0.85, crack: 0.75, level: 1.08, mechF: 2500 },
  "762x51": { blastF: 5600, blastT: 0.12, bodyF: 90, bodyT: 0.15, body: 1, crack: 1, level: 1.18, mechF: 2300 }
};
var MUZ = {
  bare: { blast: 1.1, lp: 1.1, body: 1, crack: 1, wet: 1, attack: 6e-4, tail: 1, harsh: 0.15 },
  fh: { blast: 1, lp: 0.95, body: 1, crack: 1, wet: 1, attack: 7e-4, tail: 1, harsh: 0.1 },
  comp: { blast: 1.2, lp: 1.1, body: 1.05, crack: 1, wet: 1.15, attack: 5e-4, tail: 1.1, harsh: 0.35 },
  // линейный: волна уходит вперёд — глуше и мягче у стрелка, без резкого «треска»
  linear: { blast: 0.72, lp: 0.7, body: 0.95, crack: 1, wet: 0.8, attack: 9e-4, tail: 0.85, harsh: 0 },
  brake: { blast: 1.45, lp: 1.3, body: 1.1, crack: 1, wet: 1.35, attack: 4e-4, tail: 1.2, harsh: 0.6 },
  supp: { blast: 0.075, lp: 0.2, body: 0.32, crack: 0.55, wet: 0.22, attack: 4e-3, tail: 0.6, harsh: 0 }
};

/* Reference gunshot samples supplied with this package. PCM16 WAV is decoded
   synchronously so the very first shot is immediate and every HTML stays standalone. */
var CUSTOM_SHOT_SAMPLE_DATA = null;
function customShotWavBuffer(b64, ctx) {
  const raw = atob(b64), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const v = new DataView(bytes.buffer);
  const tag = (p) => String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Invalid embedded WAV");
  let p = 12, fmt = 0, data = 0, dataSize = 0;
  while (p + 8 <= bytes.length) {
    const id = tag(p), n = v.getUint32(p + 4, true), body = p + 8;
    if (id === "fmt ") fmt = body;
    if (id === "data") { data = body; dataSize = Math.min(n, bytes.length - body); break; }
    p = body + n + (n & 1);
  }
  if (!fmt || !data || v.getUint16(fmt, true) !== 1 || v.getUint16(fmt + 14, true) !== 16)
    throw new Error("Embedded WAV must be PCM16");
  const channels = v.getUint16(fmt + 2, true), rate = v.getUint32(fmt + 4, true);
  const frames = Math.floor(dataSize / (channels * 2));
  const out = ctx.createBuffer(channels, frames, rate);
  for (let ch = 0; ch < channels; ch++) {
    const dst = out.getChannelData(ch);
    for (let i = 0; i < frames; i++) dst[i] = v.getInt16(data + (i * channels + ch) * 2, true) / 32768;
  }
  return out;
}
function customBuildShotBuffers(ctx, wid) {
  const CUSTOM_SHOT_SAMPLE_DATA = (window.__SHOT_DATA || {})[wid || window.__WK_CUR] || { normal: [], suppressed: [] };
  return {
    normal: CUSTOM_SHOT_SAMPLE_DATA.normal.map((s) => customShotWavBuffer(s, ctx)),
    suppressed: CUSTOM_SHOT_SAMPLE_DATA.suppressed.map((s) => customShotWavBuffer(s, ctx))
  };
}
var GunAudio = class {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.profile = { cal: "556", mech: 0.8 };
    this.muzzle = "fh";
    this.lastShot = -10;
  }
  init(extCtx, extDest) {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !extCtx) return;
    const c = this.ctx = extCtx || new AC();
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 1e-3;
    comp.release.value = 0.12;
    this.master.connect(comp).connect(extDest || c.destination);
    if (!this.sampleBuffers) this.sampleBuffers = customBuildShotBuffers(c, this.wid);
    this.dry = c.createGain();
    this.dry.connect(this.master);
    this.verb = c.createConvolver();
    const B = this.pre || this.buildBuffers();
    this.pre = null;
    // свёртке нужна частота контекста — импульс (дешёвый) строится здесь
    this.verb.buffer = this.impulse(2.2);
    this.wet = c.createGain();
    this.wet.gain.value = 0.55;
    this.verb.connect(this.wet).connect(this.master);
    this.noise = B.noise;
    this.pink = B.pink;
    this.crackBuf = B.crack;
    this.foley = B.foley;
    this.foley.ctx = c;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    idle(() => this.warm());
  }
  buildBuffers() {
    return { noise: this.noiseBuf(1.5, "white"), pink: this.noiseBuf(1.5, "pink"), crack: this.nwave(), foley: new Foley(this.ctx) };
  }
  // Синтез буферов в простое после загрузки, до первого клика: AudioContext нужен только для
  // воспроизведения, а AudioBuffer создаётся и без него (частота 48 кГц, при другой — ресэмплинг).
  // Раньше всё это считалось синхронно на первом клике/выстреле — фриз 0,2–0,5 с.
  prewarm() {
    if (this.ctx || this.pre || typeof AudioBuffer === "undefined") return;
    this.ctx = { sampleRate: 48e3, createBuffer: (ch, n, sr) => new AudioBuffer({ numberOfChannels: ch, length: n, sampleRate: sr }) };
    try {
      this.pre = this.buildBuffers();
      this.sampleBuffers = customBuildShotBuffers(this.ctx, this.wid);
      this.foley = this.pre.foley;
      this.warm();
    } catch (e) {
      console.warn("audio prewarm", e);
      this.pre = null;
      this.foley = null;
      this.shots = null;
    }
    this.ctx = null;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }
  noiseBuf(sec, kind) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "pink") {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else d[i] = w;
    }
    return b;
  }
  // N-волна сверхзвуковой пули: короткий двуполярный импульс.
  nwave() {
    const c = this.ctx, n = Math.floor(c.sampleRate * 6e-3);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    const L = Math.floor(c.sampleRate * 9e-4);
    for (let i = 0; i < n; i++) {
      if (i < L) d[i] = 1 - 2 * i / L;
      else d[i] = Math.exp(-(i - L) / (c.sampleRate * 6e-4)) * -0.3 * Math.sin(i * 0.9);
    }
    return b;
  }
  // Импульсная характеристика закрытого тира: ранние отражения от перегородок кабинки,
  // пола и козырьков, порхающее эхо между параллельными стенами (12 м → 35 мс),
  // диффузный хвост RT60 ≈ 1,3 с, темнеющий со временем, и слабый отклик пулеулавливателя.
  impulse(sec) {
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * sec);
    const b = c.createBuffer(2, n, sr);
    const early = [[65e-4, 0.55], [8e-3, 0.5], [0.0125, 0.42], [0.021, 0.3], [0.028, 0.33], [0.035, 0.36], [0.047, 0.22], [0.063, 0.2], [0.082, 0.16]];
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        lp += (w - lp) * (0.5 - Math.min(0.42, t * 0.32));
        const onset = Math.min(1, t / 0.02);
        d[i] = lp * Math.exp(-6.9 * t / 1.3) * 0.3 * onset;
      }
      const tap = (t, a, len = 360) => {
        const s0 = Math.floor(t * sr);
        let f = 0;
        for (let j = 0; j < len && s0 + j < n; j++) {
          f += (Math.random() * 2 - 1 - f) * 0.6;
          d[s0 + j] += f * a * Math.exp(-j / (len * 0.22));
        }
      };
      for (const [t, a] of early) tap(t + (ch ? 11e-4 : 0) + Math.random() * 8e-4, a);
      for (let k = 1; k < 18; k++) tap(0.035 * k + (ch ? 6e-4 : 0), 0.34 * Math.pow(0.8, k), 280);
      tap(0.62 + (ch ? 4e-3 : 0), 0.07, 900);
    }
    return b;
  }
  env(g, t, a, peak, tau, end) {
    g.gain.setValueAtTime(1e-4, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(1e-4, t + a, tau);
    if (end) g.gain.setValueAtTime(0, t + end);
  }
  src(buf, t, dur, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    s.start(t, Math.random() * (buf.duration - dur - 0.01), dur);
    return s;
  }
  out(node2, wet = 0, pan = 0) {
    let n = node2;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      n.connect(p);
      n = p;
    }
    n.connect(this.dry);
    if (wet > 0) {
      const w = this.ctx.createGain();
      w.gain.value = wet;
      n.connect(w).connect(this.verb);
    }
  }
  /* --------------------------------------------------------------- выстрел */
  shot(o = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + 5e-3;
    const bank = this.muzzle === "supp" ? this.sampleBuffers?.suppressed : this.sampleBuffers?.normal;
    if (bank?.length) {
      const source = c.createBufferSource();
      source.buffer = bank[Math.floor(Math.random() * bank.length)];
      source.playbackRate.value = 0.985 + Math.random() * 0.03;
      const gain = c.createGain();
      gain.gain.value = 0.96 + Math.random() * 0.08;
      source.connect(gain).connect(this.master);
      source.start(t);
      this.lastShot = t;
      return;
    }
    const P = CAL2[this.profile.cal] || CAL2["556"];
    const M = MUZ[this.muzzle] || MUZ.fh;
    const v = 0.92 + Math.random() * 0.16;
    const frp = this.muzzle === "supp" && t - this.lastShot > 3 ? 1.9 : 1;
    this.lastShot = t;
    const L = P.level * v;
    if (this.muzzle === "supp") {
      this.shotSupp(t, P, L, v, frp > 1);
      return;
    }
    {
      const s = this.src(this.noise, t, 0.6, 0.9 + Math.random() * 0.2);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(P.blastF * M.lp * (0.9 + Math.random() * 0.2), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(300, P.blastF * M.lp * 0.18), t + P.blastT * 2.5);
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = this.muzzle === "supp" ? 90 : 55;
      const g = c.createGain();
      this.env(g, t, M.attack, 1.25 * L * M.blast * frp, P.blastT * M.tail, 0.7);
      s.connect(lp).connect(hp).connect(g);
      this.out(g, 0.9 * M.wet);
    }
    if (M.harsh > 0) {
      const s = this.src(this.noise, t, 0.25);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 1.2;
      const g = c.createGain();
      this.env(g, t, 4e-4, 0.9 * L * M.harsh, 0.035, 0.3);
      s.connect(bp).connect(g);
      this.out(g, 0.6 * M.wet);
    }
    {
      const osc = c.createOscillator();
      osc.type = "sine";
      const f = P.bodyF * (this.muzzle === "supp" ? 0.8 : 1) * (0.95 + Math.random() * 0.1);
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.33, t + P.bodyT);
      const g = c.createGain();
      this.env(g, t, 2e-3, 1.1 * L * P.body * M.body * frp, P.bodyT * 0.5, P.bodyT * 3);
      const ws = c.createWaveShaper();
      ws.curve = this.softclip || (this.softclip = (() => {
        const a = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = i / 128 - 1;
          a[i] = Math.tanh(x * 2.2);
        }
        return a;
      })());
      osc.connect(ws).connect(g);
      this.out(g, 0.35 * M.wet);
      osc.start(t);
      osc.stop(t + P.bodyT * 3 + 0.05);
      const s = this.src(this.pink, t, 0.3);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = this.muzzle === "supp" ? 380 : 700;
      const g2 = c.createGain();
      this.env(g2, t, 1e-3, 1.6 * L * P.body * M.body * frp, P.bodyT * 0.7, 0.35);
      s.connect(lp).connect(g2);
      this.out(g2, 0.5 * M.wet);
    }
    {
      const s = c.createBufferSource();
      s.buffer = this.crackBuf;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1800;
      const g = c.createGain();
      g.gain.value = 0.55 * P.crack * M.crack * v;
      s.connect(hp).connect(g);
      this.out(g, 0.25);
      s.start(t + 2e-3);
    }
    {
      const mech = (this.profile.mech ?? 0.8) * (this.muzzle === "supp" ? 1.3 : 1);
      this.play("cycle", { gain: 0.32 * mech, delay: 4e-3, wet: 0.05, pan: 0.15 });
    }
  }
  // Выстрел с глушителем. voice: длина корпуса (мм) и снижение громкости (дБ).
  // Слои: приглушённый хлопок с мягкой атакой, «первый выстрел» (кислород в холодной
  // банке догорает — глухой удар), звон тонкостенного корпуса и перегородок,
  // шипение газов из торца, газы из окна выброса (у АК и SCAR — сильнее, в лицо),
  // щелчок пули и механика — теперь они главные в звуке.
  shotSupp(t, P, L, v, first) {
    const c = this.ctx;
    const V = this.voice || { len: 170, loud: -27 };
    const k = Math.pow(10, ((V.loud ?? -27) + 27) / 20);
    const fam = this.profile.family;
    {
      const s = this.src(this.noise, t, 0.4, 0.9 + Math.random() * 0.2);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      const f0 = Math.min(3200, P.blastF * 0.38);
      lp.frequency.setValueAtTime(f0, t);
      lp.frequency.exponentialRampToValueAtTime(320, t + 0.05);
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 70;
      const g = c.createGain();
      this.env(g, t, 22e-4, 0.4 * L * k * (first ? 2.2 : 1), 0.022, 0.4);
      s.connect(lp).connect(hp).connect(g);
      this.out(g, 0.35);
      const osc = c.createOscillator();
      const f = P.bodyF * 0.72 * (0.95 + Math.random() * 0.1);
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.08);
      const g2 = c.createGain();
      this.env(g2, t, 3e-3, 0.22 * L * P.body * (first ? 1.9 : 1), 0.035, 0.25);
      osc.connect(g2);
      this.out(g2, 0.2);
      osc.start(t);
      osc.stop(t + 0.26);
    }
    if (first) {
      const s = this.src(this.pink, t + 2e-3, 0.35);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 520;
      const g = c.createGain();
      this.env(g, t + 2e-3, 4e-3, 0.9 * L * P.body, 0.06, 0.35);
      s.connect(lp).connect(g);
      this.out(g, 0.45);
    }
    {
      const f0 = 1450 * 170 / Math.max(90, V.len || 170);
      for (const [m, a, tau] of [[1, 1, 0.05], [2.76, 0.55, 0.032], [5.4, 0.3, 0.02], [8.9, 0.16, 0.012]]) {
        const o = c.createOscillator();
        o.frequency.value = f0 * m * (0.97 + Math.random() * 0.06);
        const g = c.createGain();
        this.env(g, t + 1e-3, 8e-4, 0.035 * L * a, tau, 0.25);
        o.connect(g);
        this.out(g, 0.15, 0.05);
        o.start(t);
        o.stop(t + 0.26);
      }
    }
    {
      const s = this.src(this.noise, t + 3e-3, 0.3);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2100;
      bp.Q.value = 0.7;
      const g = c.createGain();
      this.env(g, t + 3e-3, 4e-3, 0.16 * L * k, 0.045, 0.3);
      s.connect(bp).connect(g);
      this.out(g, 0.2);
    }
    {
      const pg = fam === "ak" ? 0.28 : fam === "scar" ? 0.24 : 0.14;
      const s = this.src(this.pink, t + 5e-3, 0.2);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1600;
      const g = c.createGain();
      this.env(g, t + 5e-3, 15e-4, pg * L, 0.028, 0.2);
      s.connect(lp).connect(g);
      this.out(g, 0.15, 0.2);
    }
    {
      const s = c.createBufferSource();
      s.buffer = this.crackBuf;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1800;
      const g = c.createGain();
      g.gain.value = 0.5 * P.crack * v;
      s.connect(hp).connect(g);
      this.out(g, 0.55);
      s.start(t + 2e-3);
    }
    this.play("cycle", { gain: 0.38 * (this.profile.mech ?? 0.8), delay: 4e-3, wet: 0.08, pan: 0.15 });
  }
  // Механика и перезарядка — синтезированные буферы (foley.js): без тональных «звонов».
  play(name, o = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    if (!this.foley) this.foley = new Foley(c);
    const P = this.profile;
    const s = c.createBufferSource();
    s.buffer = this.foley.buffer(name, { fam: P.family, cal: P.cal, kind: o.kind, fill: o.fill, rpm: name === "cycle" ? P.rpm : void 0 });
    s.playbackRate.value = 0.96 + Math.random() * 0.08;
    const g = c.createGain();
    g.gain.value = (o.gain ?? 1) * 0.9;
    s.connect(g);
    this.out(g, o.wet ?? 0.07, o.pan ?? 0.12);
    s.start(c.currentTime + (o.delay || 0));
  }
  dryFire() {
    this.play("dryFire", { gain: 0.7 });
  }
  selector() {
    this.play("selector", { gain: 0.8 });
  }
  click() {
    this.play("click", { gain: 0.6, pan: 0 });
  }
  magOut(kind = "steel", fill = 2) {
    this.play("magOut", { kind, fill, gain: 0.95 });
  }
  pouch(kind = "steel") {
    this.play("pouch", { kind, fill: 2, gain: 0.7, pan: 0.25 });
  }
  tug(kind = "steel") {
    this.play("tug", { kind, gain: 0.6 });
  }
  shoulder(on) {
    this.play(on ? "shoulder" : "unshoulder", { gain: on ? 0.42 : 0.35, pan: 0 });
  }
  magInsert(kind = "steel") {
    this.play("magInsert", { kind, gain: 0.85 });
  }
  magIn(kind = "steel") {
    this.play("magIn", { kind, gain: 1.1 });
  }
  magDropGround(kind = "steel", fill = 2) {
    this.play("magGround", { kind, fill, gain: 0.75, pan: 0.3, wet: 0.2 });
  }
  chargeBack() {
    this.play("chargeBack", { gain: 0.95 });
  }
  chargeRelease() {
    this.play("chargeRelease", { gain: 1.05 });
  }
  boltCatch() {
    this.play("boltCatch", { gain: 1.05 });
  }
  // заранее синтезировать буферы (вызывается при первом взаимодействии)
  warm() {
    if (!this.ctx) return;
    if (!this.foley) this.foley = new Foley(this.ctx);
    const P = this.profile, o = { fam: P.family, cal: P.cal };
    for (const n of ["magOut", "magInsert", "magIn", "magGround"]) for (const kind of ["steel", "poly"]) this.foley.buffer(n, { ...o, kind });
    for (const n of ["chargeBack", "chargeRelease", "boltCatch", "dryFire", "selector", "click"]) this.foley.buffer(n, o);
    this.foley.buffer("cycle", { ...o, rpm: P.rpm });
    for (const kind of ["steel", "poly"]) this.foley.buffer("tick", { ...o, kind });
    for (const kind of ["steel", "brass"]) this.foley.buffer("casing", { ...o, kind });
  }
  // Установка модуля: щелчки прижима или храповик резьбы.
  attach(kind) {
    if (!this.ctx || this.muted) return;
    if (kind === "thread" || kind === "supp") {
      for (let i = 0; i < 6; i++) this.play("tick", { kind: "steel", gain: 0.25 + Math.random() * 0.1, delay: i * 0.06 + Math.random() * 0.01, pan: 0 });
      this.play("tick", { kind: "steel", gain: 0.6, delay: 0.42, pan: 0 });
    } else if (kind === "poly") {
      this.play("tick", { kind: "poly", gain: 0.6, pan: 0 });
      this.play("tick", { kind: "steel", gain: 0.25, delay: 0.03, pan: 0 });
    } else {
      this.play("tick", { kind: "steel", gain: 0.55, pan: 0 });
      this.play("tick", { kind: "steel", gain: 0.35, delay: 0.09, pan: 0 });
    }
  }
  fold() {
    this.play("tick", { kind: "steel", gain: 0.5 });
    this.play("tick", { kind: "steel", gain: 0.8, delay: 0.22 });
  }
  bipod() {
    this.play("tick", { kind: "steel", gain: 0.6, delay: 0.12, pan: 0 });
    this.play("tick", { kind: "steel", gain: 0.5, delay: 0.15, pan: 0 });
  }
  // Гильза падает на бетон/землю.
  casing(delay = 0.5, steel = false, vol = 1) {
    // общий движок передаёт вид гильзы строкой: "brass" | "steel" | "hull"
    if (typeof steel === "string") steel = steel === "steel";
    if (!this.ctx || this.muted) return;
    this.play("casing", { kind: steel ? "steel" : "brass", gain: 0.22 * vol, delay, pan: 0.35 + Math.random() * 0.3, wet: 0.1 });
  }
  // Попадание в стальную мишень: звон, приходит с задержкой по дальности.
  ding(dist, level = 1) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + dist / 343;
    const a = Math.min(1, 12 / Math.max(6, dist)) * level;
    for (const [f, k] of [[820, 1], [2150, 0.6], [3710, 0.35], [5120, 0.2]]) {
      const o = c.createOscillator();
      o.frequency.value = f * (0.98 + Math.random() * 0.04);
      const g = c.createGain();
      this.env(g, t, 1e-3, 0.22 * a * k, 0.18 / (1 + k * 0.2), 1.4);
      o.connect(g);
      this.out(g, 0.5);
      o.start(t);
      o.stop(t + 1.45);
    }
  }
  thump(dist) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + dist / 343;
    const a = Math.min(1, 10 / Math.max(6, dist));
    const c = this.ctx, s = this.src(this.pink, t, 0.2);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const g = c.createGain();
    this.env(g, t, 3e-3, 0.25 * a, 0.05, 0.2);
    s.connect(lp).connect(g);
    this.out(g, 0.3);
  }
  // Попадание по поверхности тира: бетон — сухой щелчок с крошкой, дерево — глухой тук,
  // стальной пулеулавливатель — короткий звон ламелей.
  impact(surf, dist) {
    if (!this.ctx || this.muted) return;
    if (surf === "trap") {
      this.ding(dist, 0.3);
      this.thump(dist);
      return;
    }
    const c = this.ctx, t = c.currentTime + dist / 343;
    const a = Math.min(1, 10 / Math.max(5, dist));
    const s = this.src(this.noise, t, 0.12);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = surf === "wood" ? 700 : surf === "panel" ? 1800 : 2400;
    bp.Q.value = 0.9;
    const g = c.createGain();
    this.env(g, t, 1e-3, 0.3 * a, surf === "wood" ? 0.03 : 0.018, 0.14);
    s.connect(bp).connect(g);
    this.out(g, 0.35);
    this.thump(dist);
  }
  // Кнопка фонаря на торцевой крышке: мягкий нажим и щелчок фиксации.
  tailcap(on) {
    this.play("tick", { kind: "poly", gain: 0.35, pan: 0.1 });
    this.play("click", { gain: on ? 0.55 : 0.45, delay: 0.012, pan: 0.1 });
  }
  // Рубильник освещения тира — далёкий щелчок и эхо зала.
  lightSwitch() {
    if (!this.ctx || this.muted) return;
    this.play("tick", { kind: "steel", gain: 0.25, pan: -0.5, wet: 0.5 });
    this.play("tick", { kind: "steel", gain: 0.18, delay: 0.05, pan: -0.5, wet: 0.6 });
  }
  // Замена батарей: крышка откручивается (резьба), элементы выпадают в ладонь,
  // новые вставляются, крышка закручивается до упора. Возвращает длительность, с.
  batteryChange() {
    const D = 3.1;
    if (!this.ctx || this.muted) return D;
    let t = 0;
    for (let i = 0; i < 7; i++) {
      this.play("tick", { kind: "steel", gain: 0.2 + Math.random() * 0.08, delay: t, pan: 0.2 });
      t += 0.07 + Math.random() * 0.03;
    }
    this.play("battCells", { delay: 0.85, gain: 0.3, pan: 0.15 });
    this.play("battCells", { delay: 1.55, gain: 0.25, pan: 0.15 });
    t = 2.05;
    for (let i = 0; i < 7; i++) {
      this.play("tick", { kind: "steel", gain: 0.2 + Math.random() * 0.08, delay: t, pan: 0.2 });
      t += 0.07 + Math.random() * 0.03;
    }
    this.play("tick", { kind: "steel", gain: 0.5, delay: t + 0.05, pan: 0.2 });
    return D;
  }
};

return { GunAudio, customShotWavBuffer };
})(),
  A: (() => {
// ---- engine/foley.js
// Механика, перезарядка, гильзы — синтезированные буферы.
// Металл здесь — плотный набор неоднородных, быстро гаснущих мод + контактный щелчок:
// такой спектр слышится как «лязг», а не как нота. Несколько чистых синусоид с долгим
// затуханием (как было в шаблоне) звучат как «колокольчики» — этого избегаем.
function biquad(d, sr, type, f, q = 0.707) {
  const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, cw = Math.cos(w), sw = Math.sin(w), a = sw / (2 * q);
  let b0, b1, b2;
  if (type === "lp") {
    b0 = (1 - cw) / 2;
    b1 = 1 - cw;
    b2 = b0;
  } else if (type === "hp") {
    b0 = (1 + cw) / 2;
    b1 = -(1 + cw);
    b2 = b0;
  } else {
    b0 = a;
    b1 = 0;
    b2 = -a;
  }
  const a0 = 1 + a, a1 = -2 * cw, a22 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i], y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a22 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    d[i] = y;
  }
  return d;
}
var R = Math.random;
var jit = (v, k = 0.08) => v * (1 - k + R() * 2 * k);
var Track = class {
  constructor(sr, sec) {
    this.sr = sr;
    this.d = new Float32Array(Math.ceil(sr * sec));
  }
  // Металл: n мод со случайными частотами в полосе lo…hi (лог-равномерно), верхние гаснут быстрее.
  // dec — постоянная затухания нижних мод, с; grit — доля полосового шума (шероховатость контакта).
  metal(t, level, lo, hi, dec, o = {}) {
    const sr = this.sr, d = this.d, i0 = Math.floor(t * sr);
    const n = o.n ?? 30, grit = o.grit ?? 0.5;
    const norm = level * 2.2 / Math.sqrt(n);
    const att = Math.max(2, sr * 15e-5);
    for (let m = 0; m < n; m++) {
      const f = lo * Math.pow(hi / lo, R());
      const dk = dec * (0.45 + R() * 0.9) * Math.pow(lo / f, o.tilt ?? 0.45);
      const a = norm * (0.25 + R() * 0.75) * Math.pow(lo / f, 0.2);
      const w = 2 * Math.PI * f / sr, ph = R() * 6.28;
      const len = Math.min(d.length - i0, Math.ceil(dk * sr * 6));
      const k = Math.exp(-1 / (dk * sr));
      let env = a;
      for (let i = 0; i < len; i++) {
        d[i0 + i] += env * Math.min(1, i / att) * Math.sin(w * i + ph);
        env *= k;
      }
    }
    if (grit > 0) this.noise(t, level * grit, dec * 0.5, { bp: Math.sqrt(lo * hi), q: 0.9 });
    if (o.tick !== false) this.tick(t, level * (o.tick ?? 0.6));
    return this;
  }
  // Контактный щелчок: доли миллисекунды широкополосного шума.
  tick(t, level, hp = 1800) {
    return this.noise(t, level, 25e-5, { hp });
  }
  noise(t, level, dec, f = {}) {
    const sr = this.sr, d = this.d, i0 = Math.floor(t * sr);
    const n = Math.min(d.length - i0, Math.ceil(dec * sr * 7));
    if (n <= 0 || !level) return this;
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = (R() * 2 - 1) * Math.exp(-i / (dec * sr));
    if (f.lp) biquad(b, sr, "lp", f.lp, 0.8);
    if (f.hp) biquad(b, sr, "hp", f.hp, 0.7);
    if (f.bp) biquad(b, sr, "bp", f.bp, f.q || 1.5);
    for (let i = 0; i < n; i++) d[i0 + i] += b[i] * level;
    return this;
  }
  // Трение: длительность, полоса f0→f1, плотность зацепов в секунду.
  scrape(t, dur, level, f0, f1, o = {}) {
    const sr = this.sr, i0 = Math.floor(t * sr), n = Math.min(this.d.length - i0, Math.floor(dur * sr));
    if (n <= 0) return this;
    const b = new Float32Array(n);
    const rate = o.rate ?? 900, rough = o.rough ?? 0.6;
    let next = 0;
    for (let i = 0; i < n; i++) {
      let v = (R() * 2 - 1) * (1 - rough) * 0.35;
      if (i >= next) {
        v += (R() * 2 - 1) * rough * 2.2;
        next = i + Math.floor(sr / rate * (0.3 + R() * 1.4));
      }
      b[i] = v;
    }
    const seg = 256, out = new Float32Array(n);
    for (let s = 0; s < n; s += seg) {
      const f = f0 * Math.pow(f1 / f0, s / n);
      const from = Math.max(0, s - 64);
      const part = biquad(b.slice(from, Math.min(n, s + seg)), sr, "bp", f, o.q ?? 1.8);
      for (let i = s - from; i < part.length; i++) out[from + i] = part[i];
    }
    const shape2 = o.shape || ((k) => Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.7);
    for (let i = 0; i < n; i++) this.d[i0 + i] += out[i] * level * 3.2 * shape2(i / n);
    return this;
  }
  // Глухой удар (ладонь, пластик, дерево, земля): шум ниже lp + пара периодов низкой «массы».
  thud(t, level, lp, dec = 0.03, body = 0) {
    const sr = this.sr, d = this.d, i0 = Math.floor(t * sr);
    this.noise(t, level * 1.4, dec, { lp, hp: 50 });
    if (body) {
      const w = 2 * Math.PI * jit(body, 0.1) / sr, dk = dec * 0.6;
      const n = Math.min(d.length - i0, Math.ceil(dk * sr * 5));
      for (let i = 0; i < n; i++) d[i0 + i] += level * 0.9 * Math.exp(-i / (dk * sr)) * Math.sin(w * i);
    }
    return this;
  }
  // Сжатие пружины: мягкий шорох с «жужжанием» витков.
  spring(t, dur, level, f = 2600) {
    return this.scrape(t, dur, level, f * 0.8, f * 1.3, { rate: 3200, rough: 0.25, q: 3.5, shape: (k) => (1 - k) * Math.min(1, k * 8) });
  }
  buffer(ctx) {
    const d = this.d;
    let pk = 0;
    for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    const g = pk > 0.98 ? 0.98 / pk : 1;
    const fade = Math.min(d.length, Math.floor(this.sr * 0.01));
    for (let i = 0; i < d.length; i++) d[i] *= g * (i > d.length - fade ? (d.length - i) / fade : 1);
    const b = ctx.createBuffer(1, d.length, this.sr);
    b.getChannelData(0).set(d);
    return b;
  }
};
// Полосы и затухания типовых деталей: [нижняя, верхняя частота (Гц), затухание (с)].
var PART = {
  pin: [3200, 9e3, 18e-4],
  small: [2200, 7500, 3e-3],
  bolt: [900, 5200, 45e-4],
  boltBig: [650, 4200, 6e-3],
  recv: [420, 3200, 7e-3],
  stamped: [700, 4800, 5e-3],
  frame: [500, 2600, 26e-4],
  magSteel: [900, 4800, 4e-3],
  magAlu: [700, 3800, 4e-3],
  magPoly: [420, 1900, 22e-4],
  tube: [1100, 5600, 5e-3]
};
var MT = (T2, t, lvl, part, o) => T2.metal(t, lvl, part[0], part[1], part[2], o);
var RECIPES = {
  release(T2) {
    MT(T2, 0, 0.32, PART.small, { n: 18 });
    MT(T2, 0.011, 0.14, PART.pin, { n: 12, tick: 0.2 });
  },
  // Магазин выходит из шахты.
  magOut(T2, o) {
    const poly = o.kind === "poly", fam = o.fam;
    if (fam === "ak" || fam === "svd") {
      MT(T2, 0, 0.3, PART.small, { n: 16 });
      T2.scrape(0.02, 0.11, 0.16, 1500, 1000, { rate: 700, rough: 0.7 });
      MT(T2, 0.12, 0.42, poly ? PART.magPoly : PART.stamped, { tick: 0.5 });
      T2.scrape(0.14, 0.09, 0.1, 1200, 800, { rate: 500 });
      T2.thud(0.2, 0.2, 700, 0.02, 160);
    } else if (fam === "glock") {
      MT(T2, 0, 0.26, PART.frame, { n: 14, tick: 0.7 });
      MT(T2, 4e-3, 0.18, PART.small, { n: 12, tick: 0 });
      T2.scrape(0.012, 0.075, 0.2, 1300, 900, { rate: 900, rough: 0.5 });
      MT(T2, 0.085, 0.16, PART.magPoly, { n: 14, tick: 0.3 });
    } else {
      RECIPES.release(T2, o);
      T2.scrape(0.018, 0.13, poly ? 0.18 : 0.22, poly ? 1400 : 2e3, poly ? 900 : 1300, { rate: poly ? 600 : 1100, rough: 0.55 });
      MT(T2, 0.14, 0.24, poly ? PART.magPoly : PART.magSteel, { n: 20, tick: 0.3 });
      T2.thud(0.19, 0.16, 700, 0.02);
    }
  },
  magInsert(T2, o) {
    const poly = o.kind === "poly";
    if (o.fam === "ak" || o.fam === "svd") {
      MT(T2, 0, 0.38, poly ? PART.magPoly : PART.stamped, { tick: 0.4 });
      T2.scrape(0.01, 0.07, 0.15, 1500, 2200, { rate: 800 });
    } else {
      T2.scrape(0, 0.1, poly ? 0.2 : 0.24, poly ? 900 : 1300, poly ? 1600 : 2500, { rate: poly ? 700 : 1300, rough: 0.5, shape: (k) => Math.min(1, k * 3) * (1 - k * 0.3) });
    }
  },
  // Посадка: удар в упор + щелчок защёлки (+ ладонь по дну).
  magIn(T2, o) {
    const poly = o.kind === "poly", fam = o.fam;
    if (fam === "ak" || fam === "svd") {
      T2.scrape(0, 0.05, 0.12, 1200, 1800, { rate: 600 });
      MT(T2, 0.05, 0.8, PART.recv, { tick: 0.4 });
      MT(T2, 0.057, 0.45, PART.small, { n: 18 });
      T2.thud(0.05, 0.3, 500, 0.025, 170);
    } else if (fam === "glock") {
      T2.thud(0, 0.7, 900, 0.028, 190);
      MT(T2, 2e-3, 0.45, PART.frame, { tick: 0.5 });
      MT(T2, 9e-3, 0.4, PART.small, { n: 16 });
    } else {
      T2.thud(0, 0.5, 900, 0.03, poly ? 210 : 250);
      MT(T2, 2e-3, 0.55, poly ? PART.magPoly : PART.stamped, { tick: 0.4 });
      MT(T2, 0.015, 0.45, PART.small, { n: 18 });
    }
  },
  // Затвор/рукоять назад.
  chargeBack(T2, o) {
    const fam = o.fam;
    if (fam === "mp5") {
      // рукоять в трубке: хват, отпирание роликов, трение по трубке, сжатие пружины
      T2.thud(0, 0.12, 1400, 0.01);
      MT(T2, 6e-3, 0.3, PART.small, { n: 14 });
      MT(T2, 0.02, 0.36, PART.bolt, { tick: 0.4 });
      T2.scrape(0.025, 0.15, 0.24, 2200, 3800, { rate: 1500, rough: 0.45, q: 2.6 });
      T2.spring(0.03, 0.15, 0.06, 3800);
      MT(T2, 0.18, 0.3, PART.tube, { n: 18 });
    } else if (fam === "glock") {
      T2.thud(0, 0.14, 1200, 0.012);
      MT(T2, 8e-3, 0.3, PART.small, { n: 14 });
      T2.scrape(0.012, 0.085, 0.22, 1800, 3200, { rate: 1600, rough: 0.5, q: 2.2 });
      MT(T2, 0.1, 0.34, PART.bolt, { tick: 0.4 });
    } else {
      T2.thud(0, 0.14, 1200, 0.012);
      MT(T2, 4e-3, 0.28, PART.bolt, { n: 18 });
      T2.scrape(0.01, 0.17, 0.24, 1300, 3200, { rate: fam === "ak" || fam === "svd" ? 700 : 1200, rough: 0.5, q: 2.4 });
      T2.spring(0.02, 0.16, 0.05, 5200);
      MT(T2, 0.19, 0.45, fam === "svd" ? PART.boltBig : PART.bolt);
    }
  },
  // Затвор вперёд: трение, мощный удар запирания, доворот.
  chargeRelease(T2, o) {
    const fam = o.fam;
    if (fam === "mp5") {
      // «HK slap»: удар ладонью, рукоять выходит из выреза, затвор с роликами бьёт в казённик
      T2.thud(0, 0.7, 1100, 0.022, 200);
      MT(T2, 3e-3, 0.4, PART.small, { n: 16 });
      T2.scrape(6e-3, 0.04, 0.2, 3800, 2e3, { rate: 1800, rough: 0.5 });
      MT(T2, 0.046, 1, PART.bolt, { tick: 0.6 });
      MT(T2, 0.047, 0.5, PART.stamped, { tick: 0 });
      MT(T2, 0.054, 0.3, PART.small, { n: 14 });
    } else if (fam === "glock") {
      T2.scrape(0, 0.03, 0.18, 3200, 1800, { rate: 1800 });
      MT(T2, 0.032, 0.9, PART.bolt, { tick: 0.6 });
      MT(T2, 0.033, 0.4, PART.frame, { tick: 0 });
      MT(T2, 0.04, 0.24, PART.small, { n: 12 });
    } else {
      T2.scrape(0, 0.05, 0.2, 3e3, 1600, { rate: 1600, rough: 0.5 });
      const big = fam === "ak" || fam === "svd" ? 1.12 : 1;
      MT(T2, 0.05, 0.95 * big, fam === "svd" ? PART.boltBig : PART.bolt, { tick: 0.6 });
      MT(T2, 0.051, 0.45, PART.recv, { tick: 0 });
      MT(T2, 0.059, 0.3, PART.small, { n: 14 });
    }
  },
  // HK: рукоять уходит вверх в вырез трубки и держит затвор открытым.
  hkLock(T2) {
    MT(T2, 0, 0.35, PART.tube, { n: 18 });
    MT(T2, 9e-3, 0.28, PART.small, { n: 12 });
  },
  // Затвор закрывается сам (СВД: магазин вынут при затворе на задержке).
  boltSlam(T2) {
    T2.scrape(0, 0.04, 0.16, 2800, 1600, { rate: 1500 });
    MT(T2, 0.042, 0.9, PART.boltBig, { tick: 0.6 });
    MT(T2, 0.043, 0.45, PART.recv, { tick: 0 });
  },
  // Затворная задержка: нажатие рычага, затем удар затвора/кожуха.
  boltCatch(T2, o) {
    const g = o.fam === "glock";
    MT(T2, 0, 0.28, g ? PART.frame : PART.small, { n: 14 });
    MT(T2, 0.03, 0.95, PART.bolt, { tick: 0.6 });
    MT(T2, 0.031, 0.4, g ? PART.frame : PART.recv, { tick: 0 });
    MT(T2, 0.038, 0.26, PART.small, { n: 12 });
  },
  // Помпа назад: хват цевья, отпирание, трение планок по трубке, выброс гильзы, упор.
  pumpBack(T2) {
    T2.thud(0, 0.3, 900, 0.018, 150);
    MT(T2, 0.01, 0.55, PART.bolt, { tick: 0.5 });
    T2.scrape(0.018, 0.1, 0.3, 900, 1700, { rate: 700, rough: 0.6, q: 1.6 });
    T2.scrape(0.02, 0.1, 0.12, 3200, 4600, { rate: 2200, rough: 0.35, q: 3 });
    MT(T2, 0.07, 0.25, PART.small, { n: 12 });
    MT(T2, 0.125, 0.7, PART.recv, { tick: 0.5 });
    MT(T2, 0.127, 0.3, PART.bolt, { tick: 0 });
  },
  // Помпа вперёд: подача патрона, подъём лотка, запирание — «чк-чак».
  pumpForward(T2) {
    T2.scrape(0, 0.09, 0.26, 1500, 900, { rate: 700, rough: 0.6, q: 1.6 });
    MT(T2, 0.03, 0.3, PART.small, { n: 14 });
    MT(T2, 0.09, 0.95, PART.bolt, { tick: 0.6 });
    MT(T2, 0.091, 0.45, PART.recv, { tick: 0 });
    MT(T2, 0.1, 0.35, PART.small, { n: 12 });
    T2.thud(0.09, 0.3, 600, 0.02, 130);
  },
  // Патрон в подствольный магазин: гильза мимо лотка, отсечка, упор большим пальцем.
  shellLoad(T2) {
    T2.thud(0, 0.2, 1400, 0.012);
    T2.scrape(4e-3, 0.08, 0.2, 1100, 2200, { rate: 900, rough: 0.55 });
    MT(T2, 0.03, 0.22, PART.small, { n: 12 });
    T2.scrape(0.05, 0.05, 0.12, 900, 700, { rate: 600 });
    MT(T2, 0.1, 0.38, PART.tube, { n: 16, tick: 0.5 });
    T2.thud(0.1, 0.28, 700, 0.02, 180);
  },
  magGround(T2, o) {
    const poly = o.kind === "poly";
    T2.thud(0, 0.7, 700, 0.03, 140);
    MT(T2, 4e-3, 0.35, poly ? PART.magPoly : PART.magSteel, { tick: 0.4 });
    T2.thud(0.11 + R() * 0.04, 0.25, 600, 0.02, 160);
    if (!poly) MT(T2, 0.12, 0.16, PART.magSteel, { n: 16 });
  },
  // Гильза о бетон: латунь звенит заметно дольше стали; пластиковая гильза дроби — глухо.
  casing(T2, o) {
    if (o.kind === "hull") {
      T2.thud(0, 0.4, 1600, 0.012, 320);
      T2.metal(2e-3, 0.22, 2400, 7e3, 5e-3, { n: 16, tick: 0.3 });
      T2.thud(0.07 + R() * 0.03, 0.15, 1400, 0.01, 300);
      return;
    }
    const steel = o.kind === "steel", k = o.cal === "762x54R" ? 0.75 : o.cal === "9x19" ? 1.25 : 1;
    const lo = (steel ? 2600 : 3600) * k, hi = steel ? 9e3 : 12e3, dec = steel ? 7e-3 : 0.016;
    const oo = { tick: 0.5, grit: 0.2, tilt: 0.3 };
    T2.metal(0, 0.5, lo, hi, dec, { n: 26, ...oo });
    T2.metal(0.06 + R() * 0.04, 0.24, lo, hi, dec, { n: 20, ...oo, tick: 0.3 });
    T2.metal(0.13 + R() * 0.06, 0.1, lo, hi, dec, { n: 14, ...oo, tick: 0.2 });
  },
  // Цикл автоматики при выстреле (тайминг — от темпа стрельбы).
  cycle(T2, o) {
    const cyc = 60 / (o.rpm || 700), fam = o.fam;
    if (fam === "m870") return;
    if (fam === "glock") {
      MT(T2, 0.25 * cyc, 0.5, PART.frame, { tick: 0.4 });
      MT(T2, 0.8 * cyc, 0.55, PART.bolt, { tick: 0.4 });
      return;
    }
    if (fam === "mp5") MT(T2, 3e-3, 0.3, PART.small, { n: 12 });
    MT(T2, 0.42 * cyc, fam === "svd" ? 0.55 : 0.45, fam === "mp5" ? PART.stamped : PART.recv, { tick: 0.3 });
    MT(T2, 0.86 * cyc, 0.7, fam === "svd" ? PART.boltBig : PART.bolt, { tick: 0.5 });
    MT(T2, 0.86 * cyc + 1e-3, 0.3, PART.recv, { tick: 0 });
  },
  dryFire(T2, o) {
    if (o.fam === "glock") {
      MT(T2, 0, 0.35, PART.small, { n: 14 });
      MT(T2, 2e-3, 0.2, PART.frame, { tick: 0 });
      return;
    }
    MT(T2, 0, 0.55, PART.bolt, { tick: 0.5 });
    MT(T2, 3e-3, 0.22, PART.small, { n: 12 });
  },
  // Переводчик / предохранитель: пружинный фиксатор.
  selector(T2, o) {
    const fam = o.fam;
    if (fam === "m870") {
      MT(T2, 0, 0.35, PART.small, { n: 14 });
      return;
    }
    if (fam === "glock") {
      MT(T2, 0, 0.3, PART.small, { n: 12 });
      MT(T2, 0.02, 0.2, PART.pin, { n: 10, tick: 0.2 });
      return;
    }
    const big = fam === "svd" || fam === "ak";
    T2.scrape(0, 0.035, 0.07, 2500, 3500, { rate: 1500 });
    MT(T2, 0.03, big ? 0.5 : 0.38, big ? PART.stamped : PART.small, { n: 18 });
  },
  click(T2) {
    MT(T2, 0, 0.26, PART.pin, { n: 12, tick: 0.4 });
  }
};
var LEN = { release: 0.05, magOut: 0.34, magInsert: 0.14, magIn: 0.16, chargeBack: 0.26, chargeRelease: 0.16, hkLock: 0.08, boltSlam: 0.14, boltCatch: 0.14, pumpBack: 0.2, pumpForward: 0.18, shellLoad: 0.18, magGround: 0.26, casing: 0.3, dryFire: 0.06, selector: 0.07, click: 0.04 };
var VARIANTS = 3;
var Foley = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.cache = /* @__PURE__ */ new Map();
  }
  buffer(name, o = {}) {
    const key = [name, o.fam, o.kind, o.cal, o.rpm].join("|");
    let list = this.cache.get(key);
    if (!list) {
      list = [];
      const len = name === "cycle" ? 60 / (o.rpm || 700) + 0.06 : LEN[name] || 0.2;
      for (let v = 0; v < VARIANTS; v++) {
        const T2 = new Track(this.ctx.sampleRate, len);
        RECIPES[name](T2, o);
        list.push(T2.buffer(this.ctx));
      }
      this.cache.set(key, list);
    }
    return list[Math.random() * list.length | 0];
  }
};

// ---- engine/gunshot.js
// Выстрел рендерится заранее в буфер (стерео, 3 варианта на конфигурацию) — так можно
// позволить себе нормальную физику вместо пары фильтров на шуме:
//   дульная волна — импульс Фридлендера (положительная фаза T+ растёт с зарядом и калибром),
//   турбулентный выхлоп газов — шум с падающим срезом, «масса» — низкий удар, который ощущается телом,
//   N-волна сверхзвуковой пули (у СВД — хлёсткий щелчок раньше хлопка), отражение от земли (≈7 мс),
//   механика цикла своего семейства (кожух Glock, роликовый затвор MP5, газовый поршень СВД),
//   эхо стрельбища: боковые валы, вал за мишенями, лесополоса; для крупных калибров — раскатистый хвост.
// Глушитель: волна почти срезана и сдвинута вниз, «пфф» из торца, выхлоп из окна, механика слышна;
// сверхзвуковая пуля СВД щёлкает и с глушителем.
var SHOT = {
  // T — положительная фаза волны (с); peak — уровень; thumpF/thumpT — низ; gas — длит. выхлопа (с), gasF — срез
  glock: { T: 32e-5, peak: 0.95, thumpF: 150, thumpT: 0.022, thump: 0.55, gas: 0.016, gasF: 9500, gasLo: 1700, crack: 0, tail: 0.95, echo: 0.8, drive: 2.4, room: 0.9, bright: 1.25 },
  mp5: { T: 42e-5, peak: 0.9, thumpF: 118, thumpT: 0.03, thump: 0.62, gas: 0.022, gasF: 8200, gasLo: 1400, crack: 0.12, tail: 1.15, echo: 0.9, drive: 2.2, room: 1, bright: 1.05 },
  svd: { T: 95e-5, peak: 1.15, thumpF: 74, thumpT: 0.06, thump: 1, gas: 0.05, gasF: 6200, gasLo: 800, crack: 1, tail: 2.4, echo: 1.35, drive: 2.8, room: 1.3, bright: 0.95 },
  m870: { T: 16e-4, peak: 1.25, thumpF: 52, thumpT: 0.1, thump: 1.35, gas: 0.075, gasF: 3600, gasLo: 420, crack: 0, tail: 2.7, echo: 1.45, drive: 3.2, room: 1.4, bright: 0.7 },
  ak: { T: 7e-4, peak: 1.05, thumpF: 95, thumpT: 0.045, thump: 0.85, gas: 0.04, gasF: 6800, gasLo: 900, crack: 0.8, tail: 1.9, echo: 1.2, drive: 2.6, room: 1.2, bright: 1 }
};
var MUZ2 = {
  bare: { blast: 1, gas: 1, lp: 1, thump: 1, echo: 1, harsh: 0 },
  fh: { blast: 0.95, gas: 0.8, lp: 0.92, thump: 1, echo: 1, harsh: 0 },
  choke: { blast: 1.02, gas: 1, lp: 1, thump: 1, echo: 1, harsh: 0 },
  comp: { blast: 1.2, gas: 1.25, lp: 1.15, thump: 1.05, echo: 1.15, harsh: 0.35 },
  brake: { blast: 1.4, gas: 1.5, lp: 1.2, thump: 1.1, echo: 1.3, harsh: 0.6 },
  linear: { blast: 0.7, gas: 0.6, lp: 0.7, thump: 0.95, echo: 0.85, harsh: 0 },
  supp: { blast: 0.09, gas: 0.12, lp: 0.16, thump: 0.3, echo: 0.22, harsh: 0 }
};
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296;
}
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
// одно-полюсный ФНЧ по месту
function lp1(d, sr, f, i0 = 0, i1 = d.length) {
  const a = 1 - Math.exp(-2 * Math.PI * f / sr);
  let y = 0;
  for (let i = i0; i < i1; i++) d[i] = y += (d[i] - y) * a;
  return d;
}
function renderGunshot(sr, fam, muzzle, cal, variant) {
  const P = SHOT[fam] || SHOT.ak, M = MUZ2[muzzle] || MUZ2.bare;
  const supp = muzzle === "supp";
  const len = supp ? Math.max(0.9, P.tail * 0.45) : P.tail + 0.35;
  const n = Math.ceil(sr * len);
  const L = new Float32Array(n), Rt = new Float32Array(n);
  const rnd = Math.random;
  const v = 0.93 + rnd() * 0.14;
  const t0 = Math.floor(sr * 3e-3);
  // --- ядро (моно): волна + выхлоп + низ -----------------------------------
  const coreN = Math.ceil(sr * 0.25);
  const core = new Float32Array(coreN);
  // импульс Фридлендера: p(t) = (1 - t/T)·e^(-b·t/T); у глушителя фаза длиннее и мягче
  const T = P.T * (supp ? 3.2 : 1) * (0.95 + rnd() * 0.1), b = 1.7;
  const blastA = P.peak * M.blast * v;
  for (let i = 0; i < coreN; i++) {
    const t = i / sr;
    if (t > T * 6) break;
    core[i] += blastA * (1 - t / T) * Math.exp(-b * t / T);
  }
  // турбулентный выхлоп: белый шум, срез падает от gasF к gasLo, огибающая ~ быстрый спад
  {
    const g = new Float32Array(coreN);
    const dur = P.gas * (supp ? 0.7 : 1);
    for (let i = 0; i < coreN; i++) {
      const t = i / sr;
      g[i] = (rnd() * 2 - 1) * Math.exp(-t / dur) * (1 - Math.exp(-t / 4e-4));
    }
    // ФНЧ с падающей частотой — кусками по 64 отсчёта
    let y1 = 0, y2 = 0;
    for (let i = 0; i < coreN; i++) {
      const t = i / sr;
      const f = P.gasLo * M.lp + (P.gasF * M.lp - P.gasLo * M.lp) * Math.exp(-t / (dur * 0.8));
      const a = 1 - Math.exp(-2 * Math.PI * Math.min(f, sr * 0.45) / sr);
      y1 += (g[i] - y1) * a;
      y2 += (y1 - y2) * a;
      core[i] += y2 * 0.9 * M.gas * v * (supp ? 1.6 : 1);
    }
  }
  // «масса»: полтора периода низкой частоты с быстрым спадом и уходом частоты вниз
  {
    const f0 = P.thumpF * (0.95 + rnd() * 0.1);
    let ph = 0;
    for (let i = 0; i < coreN; i++) {
      const t = i / sr;
      if (t > P.thumpT * 6) break;
      const f = f0 * (0.55 + 0.45 * Math.exp(-t / (P.thumpT * 0.7)));
      ph += 2 * Math.PI * f / sr;
      core[i] += Math.sin(ph) * P.thump * M.thump * v * Math.exp(-t / P.thumpT) * (1 - Math.exp(-t / 6e-4)) * 0.8;
    }
  }
  // резкость дульных тормозов/компенсаторов: полоса 2–3 кГц
  if (M.harsh > 0) {
    const h = new Float32Array(coreN);
    for (let i = 0; i < coreN; i++) h[i] = (rnd() * 2 - 1) * Math.exp(-i / sr / 0.03);
    biquad(h, sr, "bp", 2600, 1.1);
    for (let i = 0; i < coreN; i++) core[i] += h[i] * M.harsh * 1.4;
  }
  // глушитель: «пфф» из торца (узкая полоса ~900 Гц) + выхлоп из окна (3–6 кГц, чуть позже)
  if (supp) {
    const pf = new Float32Array(coreN), port = new Float32Array(coreN);
    const pd = fam === "m870" || fam === "svd" ? 0.035 : 0.02;
    for (let i = 0; i < coreN; i++) {
      const t = i / sr;
      pf[i] = (rnd() * 2 - 1) * Math.exp(-t / pd) * (1 - Math.exp(-t / 1.5e-3));
      const tp = t - (fam === "glock" ? 4e-3 : 7e-3);
      port[i] = tp > 0 ? (rnd() * 2 - 1) * Math.exp(-tp / 0.012) : 0;
    }
    biquad(pf, sr, "bp", fam === "m870" ? 520 : fam === "svd" ? 700 : 950, 1.3);
    biquad(port, sr, "bp", 4200, 1.2);
    const first = variant === 0 ? 1.8 : 1;
    for (let i = 0; i < coreN; i++) core[i] += pf[i] * 1.5 * v * first + port[i] * (fam === "svd" ? 0.35 : 0.22);
  }
  // яркость: подъём верхов у пистолета (короткий ствол «хлещет»), завал у ружья
  {
    const hp = core.slice();
    biquad(hp, sr, "hp", 2500, 0.7);
    for (let i = 0; i < coreN; i++) core[i] += hp[i] * (P.bright - 1) * 1.2;
  }
  // насыщение: без него выстрел звучит как «хлопушка» — любой реальный записанный выстрел перегружен
  {
    const dr = P.drive * (supp ? 0.55 : 1);
    const nrm = Math.tanh(dr);
    for (let i = 0; i < coreN; i++) core[i] = Math.tanh(core[i] * dr) / nrm;
  }
  // --- сборка: прямой звук + отражение от земли/площадки ---------------------
  const put = (src, at, g, gl = 1, gr = 1) => {
    const i0 = Math.floor(at * sr);
    for (let i = 0; i < src.length && i0 + i < n; i++) {
      L[i0 + i] += src[i] * g * gl;
      Rt[i0 + i] += src[i] * g * gr;
    }
  };
  put(core, t0 / sr, 1, 1, 0.94);
  {
    const gnd = core.slice();
    lp1(gnd, sr, 3200);
    put(gnd, t0 / sr + 72e-4, 0.42, 0.95, 1);
  }
  // N-волна пули: перед хлопком (пуля обгоняет звук), двуполярный импульс ~0,5 мс
  if (P.crack > 0) {
    const cn = Math.ceil(sr * 25e-4), cr = new Float32Array(cn);
    const w = Math.floor(sr * 5e-4);
    for (let i = 0; i < cn; i++) cr[i] = i < w ? 1 - 2 * i / w : i < w + 3 ? -1 + (i - w) / 3 : 0;
    const ringN = Math.ceil(sr * 0.02), ring = new Float32Array(ringN);
    for (let i = 0; i < ringN; i++) ring[i] = (rnd() * 2 - 1) * Math.exp(-i / sr / 3e-3);
    biquad(ring, sr, "hp", 3500, 0.7);
    const ca = P.crack * (supp ? 0.85 : 0.75) * v;
    put(cr, (t0 - Math.floor(sr * 6e-4)) / sr, ca, 1, 0.9);
    put(ring, t0 / sr, ca * 0.25, 0.8, 1);
  }
  // --- механика цикла: моды фиксированы для семейства (seeded), это «голос» оружия ---------
  if (fam !== "m870") {
    const Tm = new Track(sr, 0.2);
    const saveR = R;
    R = seeded(hashStr("mech|" + fam));
    const cyc = fam === "glock" ? 0.05 : fam === "mp5" ? 0.075 : fam === "svd" ? 0.12 : 0.085;
    if (fam === "glock") {
      Tm.metal(0.2 * cyc, 0.42, 1800, 7200, 3e-3, { n: 20, tick: 0.5 });
      Tm.thud(0.2 * cyc, 0.25, 1100, 0.01, 260);
      Tm.metal(0.78 * cyc, 0.5, 1300, 6200, 4e-3, { n: 22, tick: 0.6 });
    } else if (fam === "mp5") {
      Tm.metal(0.25 * cyc, 0.35, 900, 5200, 5e-3, { n: 22, tick: 0.4 });
      Tm.metal(0.82 * cyc, 0.6, 700, 4600, 6e-3, { n: 26, tick: 0.6 });
      Tm.spring(0.3 * cyc, 0.05, 0.06, 2400);
    } else {
      Tm.noise(0.08 * cyc, 0.25, 0.01, { bp: 2200, q: 1.2 });
      Tm.metal(0.35 * cyc, 0.45, 600, 4200, 7e-3, { n: 26, tick: 0.4 });
      Tm.metal(0.88 * cyc, 0.75, 480, 3600, 9e-3, { n: 30, tick: 0.6 });
      Tm.thud(0.88 * cyc, 0.3, 500, 0.02, 120);
    }
    R = saveR;
    const mg = (supp ? 0.55 : 0.28) * (fam === "svd" ? 1.2 : 1);
    put(Tm.d, t0 / sr + 2e-3, mg, 0.85, 1);
  }
  // --- окружение ------------------------------------------------------------
  // раннее: скамья/площадка стрелка (плотные короткие отражения 3–25 мс)
  const echoSrc = core.slice(0, Math.ceil(sr * 0.09));
  lp1(echoSrc, sr, 2400);
  for (let i = 0, m = echoSrc.length, f = Math.floor(sr * 0.05); i < f; i++) echoSrc[m - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / f);
  const E = M.echo * P.echo * (supp ? 1.4 : 1);
  for (let i = 0; i < 6; i++) put(echoSrc, t0 / sr + 0.003 + rnd() * 0.022, 0.035 * P.room * E, 0.5 + rnd() * 0.5, 0.5 + rnd() * 0.5);
  // дальние: боковые валы (42 м), вал за мишенями (~128 м), лесополоса (150–190 м)
  const refl = [[0.245, 0.2, 1500, 1, 0.55], [0.262, 0.16, 1400, 0.5, 1], [0.75, 0.22, 900, 0.8, 0.8], [0.9, 0.1, 700, 1, 0.6], [1.04, 0.09, 600, 0.6, 1], [1.21, 0.05, 500, 0.9, 0.8]];
  for (const [dt, g, f, gl, gr] of refl) {
    if (dt > len - 0.2) continue;
    const e = echoSrc.slice();
    lp1(e, sr, f);
    lp1(e, sr, f * 1.5);
    // размазывание: несколько копий с разбросом — отражение от неровного вала, а не от стены
    for (let k = 0; k < 4; k++) put(e, t0 / sr + dt + rnd() * 0.035, g * E * (0.14 + rnd() * 0.1), gl, gr);
  }
  // диффузный хвост: шум по трём полосам, верха гаснут быстрее (поглощение воздухом)
  {
    const tl = P.tail * (supp ? 0.35 : 1);
    const bands = [[260, tl * 0.5, 0.9], [1100, tl * 0.32, 0.55], [3800, tl * 0.14, 0.3]];
    for (const ch of [L, Rt]) {
      for (const [f, T60, a] of bands) {
        const tn = Math.min(n, Math.ceil(sr * T60 * 1.6));
        const d = new Float32Array(tn);
        for (let i = 0; i < tn; i++) {
          const t = i / sr;
          d[i] = (rnd() * 2 - 1) * Math.exp(-6.9 * t / T60) * Math.min(1, t / 0.035);
        }
        biquad(d, sr, "bp", f, 0.8);
        // раскаты у крупных калибров: медленная модуляция низкой полосы
        if (f < 400 && P.tail > 2) for (let i = 0; i < tn; i++) d[i] *= 0.6 + 0.4 * Math.sin(i / sr * 7.3 + 1.3) * Math.sin(i / sr * 2.1);
        const g = a * 0.22 * E * P.peak;
        const i0 = t0 + Math.floor(sr * 0.012);
        for (let i = 0; i < tn && i0 + i < n; i++) ch[i0 + i] += d[i] * g;
      }
    }
  }
  // нормировка по пику + мягкий срез конца
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rt[i]));
  const gN = 0.97 / Math.max(1e-6, pk);
  const fade = Math.floor(sr * 0.08);
  for (let i = 0; i < n; i++) {
    const f = i > n - fade ? (n - i) / fade : 1;
    L[i] *= gN * f;
    Rt[i] *= gN * f;
  }
  return [L, Rt];
}
// Громкость на выходе (после нормировки буферов) — соотношение калибров как у стрелка.
var SHOT_LEVEL = { glock: 0.8, mp5: 0.84, svd: 1, m870: 1, ak: 0.95 };
var SUPP_LEVEL = { glock: 0.32, mp5: 0.3, svd: 0.62, m870: 0.42, ak: 0.45 };

// ---- engine/audio.js
// Выстрел: дульная волна (полосовой шум с падающим срезом), удар давления (низкий импульс),
// N-волна сверхзвуковой пули, механика цикла (буфер foley), эхо стрельбища.
var CAL2 = {
  "556": { blastF: 7200, blastT: 0.075, bodyF: 150, bodyT: 0.09, body: 0.55, crack: 0.9, level: 1 },
  "545": { blastF: 7600, blastT: 0.07, bodyF: 140, bodyT: 0.09, body: 0.55, crack: 0.95, level: 1 },
  "762x39": { blastF: 5200, blastT: 0.1, bodyF: 105, bodyT: 0.13, body: 0.85, crack: 0.75, level: 1.08 },
  "762x51": { blastF: 5600, blastT: 0.12, bodyF: 90, bodyT: 0.15, body: 1, crack: 1, level: 1.18 },
  // 9×19 из короткого ствола: сухой хлёсткий хлопок, трескотня почти нет (≈400 м/с)
  "9x19": { blastF: 6400, blastT: 0.055, bodyF: 165, bodyT: 0.06, body: 0.45, crack: 0.3, level: 0.84, subSupp: true },
  // 12 калибр: тяжёлый длинный «бум», много низа, дробь почти не трещит
  "12ga": { blastF: 4300, blastT: 0.15, bodyF: 68, bodyT: 0.2, body: 1.2, crack: 0.12, level: 1.26 },
  // 7,62×54R: самый громкий, резкий щелчок пули 830 м/с и длинный хвост
  "762x54R": { blastF: 5100, blastT: 0.125, bodyF: 84, bodyT: 0.16, body: 1.08, crack: 1.15, level: 1.24 }
};
var MUZ = {
  bare: { blast: 1.1, lp: 1.1, body: 1, crack: 1, wet: 1, attack: 6e-4, tail: 1, harsh: 0.15 },
  fh: { blast: 1, lp: 0.95, body: 1, crack: 1, wet: 1, attack: 7e-4, tail: 1, harsh: 0.1 },
  comp: { blast: 1.2, lp: 1.1, body: 1.05, crack: 1, wet: 1.15, attack: 5e-4, tail: 1.1, harsh: 0.35 },
  // линейный: волна уходит вперёд — глуше и мягче у стрелка
  linear: { blast: 0.72, lp: 0.7, body: 0.95, crack: 1, wet: 0.8, attack: 9e-4, tail: 0.85, harsh: 0 },
  brake: { blast: 1.45, lp: 1.3, body: 1.1, crack: 1, wet: 1.35, attack: 4e-4, tail: 1.2, harsh: 0.6 },
  // дульные насадки гладкоствольного ружья звучат как голый ствол
  choke: { blast: 1.08, lp: 1.05, body: 1, crack: 1, wet: 1, attack: 6e-4, tail: 1, harsh: 0.12 },
  supp: { blast: 0.075, lp: 0.2, body: 0.32, crack: 0.55, wet: 0.22, attack: 4e-3, tail: 0.6, harsh: 0 }
};

/* Reference gunshot samples supplied with this package. PCM16 WAV is decoded
   synchronously so the very first shot is immediate and every HTML stays standalone. */
var CUSTOM_SHOT_SAMPLE_DATA = null;
function customShotWavBuffer(b64, ctx) {
  const raw = atob(b64), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const v = new DataView(bytes.buffer);
  const tag = (p) => String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Invalid embedded WAV");
  let p = 12, fmt = 0, data = 0, dataSize = 0;
  while (p + 8 <= bytes.length) {
    const id = tag(p), n = v.getUint32(p + 4, true), body = p + 8;
    if (id === "fmt ") fmt = body;
    if (id === "data") { data = body; dataSize = Math.min(n, bytes.length - body); break; }
    p = body + n + (n & 1);
  }
  if (!fmt || !data || v.getUint16(fmt, true) !== 1 || v.getUint16(fmt + 14, true) !== 16)
    throw new Error("Embedded WAV must be PCM16");
  const channels = v.getUint16(fmt + 2, true), rate = v.getUint32(fmt + 4, true);
  const frames = Math.floor(dataSize / (channels * 2));
  const out = ctx.createBuffer(channels, frames, rate);
  for (let ch = 0; ch < channels; ch++) {
    const dst = out.getChannelData(ch);
    for (let i = 0; i < frames; i++) dst[i] = v.getInt16(data + (i * channels + ch) * 2, true) / 32768;
  }
  return out;
}
function customBuildShotBuffers(ctx, wid) {
  const CUSTOM_SHOT_SAMPLE_DATA = (window.__SHOT_DATA || {})[wid || window.__WK_CUR] || { normal: [], suppressed: [] };
  return {
    normal: CUSTOM_SHOT_SAMPLE_DATA.normal.map((s) => customShotWavBuffer(s, ctx)),
    suppressed: CUSTOM_SHOT_SAMPLE_DATA.suppressed.map((s) => customShotWavBuffer(s, ctx))
  };
}
var GunAudio = class {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.profile = { cal: "556", mech: 0.8 };
    this.muzzle = "fh";
    this.lastShot = -10;
  }
  init(extCtx, extDest) {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !extCtx) return;
    const c = this.ctx = extCtx || new AC();
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 1e-3;
    comp.release.value = 0.12;
    this.master.connect(comp).connect(extDest || c.destination);
    if (!this.sampleBuffers) this.sampleBuffers = customBuildShotBuffers(c, this.wid);
    this.dry = c.createGain();
    this.dry.connect(this.master);
    this.verb = c.createConvolver();
    const B = this.pre || this.buildBuffers();
    this.pre = null;
    // свёртке нужна частота контекста — импульс (дешёвый) строится здесь
    this.verb.buffer = this.impulse(2.6);
    this.wet = c.createGain();
    this.wet.gain.value = 0.55;
    this.verb.connect(this.wet).connect(this.master);
    this.noise = B.noise;
    this.pink = B.pink;
    this.crackBuf = B.crack;
    this.foley = B.foley;
    this.foley.ctx = c;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    idle(() => this.warm());
  }
  buildBuffers() {
    return { noise: this.noiseBuf(1.5, "white"), pink: this.noiseBuf(1.5, "pink"), crack: this.nwave(), foley: new Foley(this.ctx) };
  }
  // Синтез буферов в простое после загрузки, до первого клика: AudioContext нужен только для
  // воспроизведения, а AudioBuffer создаётся и без него (частота 48 кГц, при другой — ресэмплинг).
  // Раньше всё это считалось синхронно на первом клике/выстреле — фриз 0,2–0,5 с.
  prewarm() {
    if (this.ctx || this.pre || typeof AudioBuffer === "undefined") return;
    this.ctx = { sampleRate: 48e3, createBuffer: (ch, n, sr) => new AudioBuffer({ numberOfChannels: ch, length: n, sampleRate: sr }) };
    try {
      this.pre = this.buildBuffers();
      this.sampleBuffers = customBuildShotBuffers(this.ctx, this.wid);
      this.foley = this.pre.foley;
      this.warm();
    } catch (e) {
      console.warn("audio prewarm", e);
      this.pre = null;
      this.foley = null;
      this.shots = null;
    }
    this.ctx = null;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }
  noiseBuf(sec, kind) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "pink") {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else d[i] = w;
    }
    return b;
  }
  // N-волна сверхзвуковой пули: короткий двуполярный импульс.
  nwave() {
    const c = this.ctx, n = Math.floor(c.sampleRate * 6e-3);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    const L = Math.floor(c.sampleRate * 9e-4);
    for (let i = 0; i < n; i++) {
      if (i < L) d[i] = 1 - 2 * i / L;
      else d[i] = Math.exp(-(i - L) / (c.sampleRate * 6e-4)) * -0.3 * Math.sin(i * 0.9);
    }
    return b;
  }
  // Импульсная характеристика открытого стрельбища: плотный хвост + отражения от валов.
  impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    const refl = [[0.045, 0.5], [0.11, 0.35], [0.19, 0.3], [0.31, 0.42], [0.52, 0.22], [0.78, 0.16]];
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / c.sampleRate;
        const w = Math.random() * 2 - 1;
        lp += (w - lp) * (0.35 - Math.min(0.3, t * 0.14));
        d[i] = lp * Math.pow(1 - t / sec, 3.2) * 0.35;
      }
      for (const [t, a] of refl) {
        const s = Math.floor((t + (ch ? 7e-3 : 0)) * c.sampleRate);
        for (let j = 0; j < 900 && s + j < n; j++) d[s + j] += (Math.random() * 2 - 1) * a * Math.exp(-j / 180);
      }
    }
    return b;
  }
  env(g, t, a, peak, tau, end) {
    g.gain.setValueAtTime(1e-4, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(1e-4, t + a, tau);
    if (end) g.gain.setValueAtTime(0, t + end);
  }
  src(buf, t, dur, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    s.start(t, Math.random() * (buf.duration - dur - 0.01), dur);
    return s;
  }
  out(node2, wet = 0, pan = 0) {
    let n = node2;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      n.connect(p);
      n = p;
    }
    n.connect(this.dry);
    if (wet > 0) {
      const w = this.ctx.createGain();
      w.gain.value = wet;
      n.connect(w).connect(this.verb);
    }
  }
  // Щелчок металла: два полосовых шума с разнесёнными частотами, без синусоид.
  clank(t, f, level, dur = 0.05, q = 6, pan = 0.1, wet = 0.08) {
    const c = this.ctx;
    for (const [k, a] of [[1, 1], [1.61 + Math.random() * 0.3, 0.6]]) {
      const s = this.src(this.noise, t, dur + 0.02, 1);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f * k;
      bp.Q.value = Math.min(q, 4);
      const g = c.createGain();
      this.env(g, t, 5e-4, level * a, dur * 0.22, dur + 0.02);
      s.connect(bp).connect(g);
      this.out(g, wet, pan);
    }
  }
  // Глухой удар (пластик, ладонь).
  thud(t, f, level, dur = 0.06, pan = 0) {
    const c = this.ctx;
    const s = this.src(this.pink, t, dur + 0.02);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = f;
    const g = c.createGain();
    this.env(g, t, 1e-3, level, dur * 0.35, dur + 0.02);
    s.connect(lp).connect(g);
    this.out(g, 0.05, pan);
  }
  // Шорох/скольжение.
  slide(t, f0, f1, level, dur, pan = 0.1) {
    const c = this.ctx;
    const s = this.src(this.noise, t, dur + 0.02);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(1e-4, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(1e-4, t + dur);
    s.connect(bp).connect(g);
    this.out(g, 0.03, pan);
  }
  params() {
    return { ...CAL2[this.profile.cal] || CAL2["556"], ...this.profile.shot || {} };
  }
  /* --------------------------------------------------------------- выстрел */
  shot(o = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + 5e-3;
    const bank = this.muzzle === "supp" ? this.sampleBuffers?.suppressed : this.sampleBuffers?.normal;
    if (bank?.length) {
      const source = c.createBufferSource();
      source.buffer = bank[Math.floor(Math.random() * bank.length)];
      source.playbackRate.value = 0.985 + Math.random() * 0.03;
      const gain = c.createGain();
      gain.gain.value = 0.96 + Math.random() * 0.08;
      source.connect(gain).connect(this.master);
      source.start(t);
      this.lastShot = t;
      return;
    }
    const fam = this.shotFamily();
    const supp = this.muzzle === "supp";
    // холодный глушитель: первый выстрел громче (кислород в камерах догорает)
    const cold = supp && t - this.lastShot > 3;
    this.lastShot = t;
    const buf = this.shotBuffer(fam, this.muzzle, cold);
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = 0.975 + Math.random() * 0.05;
    const g = c.createGain();
    g.gain.value = (supp ? SUPP_LEVEL[fam] ?? 0.4 : SHOT_LEVEL[fam] ?? 0.9) * (o.gain ?? 1) * 1.15;
    s.connect(g).connect(this.dry);
    s.start(t);
  }
  shotFamily() {
    const f = this.profile.family;
    return SHOT[f] ? f : this.profile.cal === "12ga" ? "m870" : this.profile.cal === "9x19" ? "mp5" : this.profile.cal === "762x54R" ? "svd" : "ak";
  }
  // Буферы выстрела: 3 варианта на (оружие, дульное устройство); вариант 0 у глушителя — «холодный».
  shotBuffer(fam, muzzle, cold) {
    this.shots = this.shots || new Map();
    const key = fam + "|" + muzzle;
    let list = this.shots.get(key);
    if (!list) {
      list = [];
      const sr = this.ctx.sampleRate;
      for (let v = 0; v < 3; v++) {
        const [l, r] = renderGunshot(sr, fam, muzzle, this.profile.cal, v);
        const b = this.ctx.createBuffer(2, l.length, sr);
        b.getChannelData(0).set(l);
        b.getChannelData(1).set(r);
        list.push(b);
      }
      this.shots.set(key, list);
    }
    if (muzzle === "supp") return cold ? list[0] : list[1 + (Math.random() * 2 | 0)];
    return list[Math.random() * list.length | 0];
  }
  // Кнопка фонаря на торце: резиновый колпачок — глухой «тык» и щелчок микропереключателя.
  tailcap(on) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.thud(t, 1800, 0.12, 0.012, 0);
    this.clank(t + 4e-3, on ? 5200 : 4600, 0.1, 8e-3, 4, 0.1, 0.02);
  }
  // Замена батарей: отвернуть крышку, вытряхнуть CR123, вставить, завернуть.
  batteryChange() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) this.slide(t + i * 0.07, 2600, 3400, 0.05, 0.05, 0.05);
    this.clank(t + 0.42, 3200, 0.12, 0.02, 3, 0.2);
    this.clank(t + 0.47, 2900, 0.1, 0.02, 3, 0.25);
    this.thud(t + 0.8, 1500, 0.15, 0.02, 0);
    this.thud(t + 0.9, 1500, 0.15, 0.02, 0);
    for (let i = 0; i < 5; i++) this.slide(t + 1.05 + i * 0.07, 3400, 2600, 0.05, 0.05, 0.05);
    this.clank(t + 1.45, 4200, 0.12, 0.012, 4, 0);
  }
  play(name, o = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const P = this.profile;
    const s = c.createBufferSource();
    s.buffer = this.foley.buffer(name, { fam: P.family, cal: P.cal, kind: o.kind });
    s.playbackRate.value = 0.96 + Math.random() * 0.08;
    const g = c.createGain();
    g.gain.value = (o.gain ?? 1) * 0.9;
    s.connect(g);
    this.out(g, o.wet ?? 0.07, o.pan ?? 0.12);
    s.start(c.currentTime + (o.delay || 0));
  }
  dryFire() {
    this.play("dryFire", { gain: 0.7 });
  }
  selector() {
    this.play("selector", { gain: 0.8 });
  }
  click() {
    this.play("click", { gain: 0.6, pan: 0 });
  }
  magOut(kind = "steel") {
    this.play("magOut", { kind, gain: 0.95 });
  }
  magInsert(kind = "steel") {
    this.play("magInsert", { kind, gain: 0.85 });
  }
  magIn(kind = "steel") {
    this.play("magIn", { kind, gain: 1.1 });
  }
  magDropGround(kind = "steel") {
    this.play("magGround", { kind, gain: 0.7, pan: 0.3, wet: 0.12 });
  }
  chargeBack() {
    this.play("chargeBack", { gain: 0.95 });
  }
  chargeRelease() {
    this.play("chargeRelease", { gain: 1.05 });
  }
  boltCatch() {
    this.play("boltCatch", { gain: 1.05 });
  }
  boltSlam() {
    this.play("boltSlam", { gain: 1 });
  }
  hkLock() {
    this.play("hkLock", { gain: 0.9 });
  }
  pumpBack() {
    this.play("pumpBack", { gain: 1 });
  }
  pumpForward() {
    this.play("pumpForward", { gain: 1.05 });
  }
  shellLoad() {
    this.play("shellLoad", { gain: 0.95, pan: 0 });
  }
  // Заранее синтезировать буферы этого оружия (вызывается при первом взаимодействии).
  warm() {
    if (!this.ctx) return;
    const P = this.profile, o = { fam: P.family, cal: P.cal };
    const names = P.family === "m870" ? ["pumpBack", "pumpForward", "shellLoad"] : ["magOut", "magInsert", "magIn", "magGround", "chargeBack", "chargeRelease", "boltCatch"];
    for (const n of names) for (const kind of ["steel", "poly"]) this.foley.buffer(n, { ...o, kind });
    for (const n of ["dryFire", "selector", "click", "hkLock", "boltSlam"]) this.foley.buffer(n, o);
    for (const kind of ["brass", "steel", "hull"]) this.foley.buffer("casing", { ...o, kind });
    this.foley.buffer("cycle", { fam: P.family, rpm: P.rpm });
    this.shotBuffer(this.shotFamily(), this.muzzle || "bare");
  }
  // Установка модуля: щелчки прижима или храповик резьбы.
  attach(kind) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (kind === "thread" || kind === "supp") {
      for (let i = 0; i < 7; i++) this.clank(t + i * 0.055, 3600 + Math.random() * 400, 0.08, 0.01, 4, 0);
      this.clank(t + 0.42, 2300, 0.18, 0.03, 3, 0);
    } else if (kind === "poly") {
      this.thud(t, 1400, 0.25, 0.04);
      this.clank(t + 0.03, 3e3, 0.1, 0.015, 4, 0);
    } else {
      this.clank(t, 2600, 0.2, 0.025, 3, 0);
      this.clank(t + 0.09, 3900, 0.14, 0.015, 4, 0);
      this.slide(t + 0.12, 3e3, 5e3, 0.05, 0.08, 0);
    }
  }
  fold() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.clank(t, 2400, 0.22, 0.025, 3, 0.1);
    this.clank(t + 0.22, 1900, 0.35, 0.035, 3, 0.1);
  }
  bipod() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.slide(t, 1500, 3e3, 0.08, 0.12);
    this.clank(t + 0.12, 2100, 0.3, 0.035, 3, 0);
    this.clank(t + 0.15, 2300, 0.25, 0.035, 3, 0);
  }
  // Гильза падает на бетон/землю.
  casing(delay = 0.5, kind = "brass", vol = 1) {
    this.play("casing", { kind, gain: 0.5 * vol, delay, pan: 0.35 + Math.random() * 0.3, wet: 0.1 });
  }
  // Попадание в стальную мишень: плита действительно звенит; приходит с задержкой по дальности.
  ding(dist, level = 1) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + dist / 343;
    const a = Math.min(1, 12 / Math.max(6, dist)) * level;
    for (const [f, k] of [[820, 1], [2150, 0.6], [3710, 0.35], [5120, 0.2]]) {
      const o = c.createOscillator();
      o.frequency.value = f * (0.98 + Math.random() * 0.04);
      const g = c.createGain();
      this.env(g, t, 1e-3, 0.22 * a * k, 0.18 / (1 + k * 0.2), 1.4);
      o.connect(g);
      this.out(g, 0.5);
      o.start(t);
      o.stop(t + 1.45);
    }
  }
  thump(dist) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + dist / 343;
    const a = Math.min(1, 10 / Math.max(6, dist));
    const c = this.ctx, s = this.src(this.pink, t, 0.2);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const g = c.createGain();
    this.env(g, t, 3e-3, 0.25 * a, 0.05, 0.2);
    s.connect(lp).connect(g);
    this.out(g, 0.3);
  }
};

return { GunAudio, customShotWavBuffer };
})()
};
let GunAudio = AUDIO_FAMILY.B.GunAudio;
// ==== engine/fx.js
const THREE6 = window.THREE;
function tex(size, draw2) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw2(c.getContext("2d", { willReadFrequently: true }), size);
  const t = new THREE6.CanvasTexture(c);
  t.colorSpace = THREE6.SRGBColorSpace;
  return t;
}
function texWH(w, h, draw2) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw2(c.getContext("2d", { willReadFrequently: true }), w, h);
  const t = new THREE6.CanvasTexture(c);
  t.colorSpace = THREE6.SRGBColorSpace;
  return t;
}
var R2 = Math.random;
var TEX = {};
function textures() {
  if (TEX.glow) return TEX;
  TEX.glow = tex(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.2, "rgba(255,255,255,.8)");
    gr.addColorStop(0.5, "rgba(255,255,255,.2)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
  const flameSide = (o) => texWH(256, 96, (g, w, h) => {
    g.globalCompositeOperation = "lighter";
    const env = (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u / o.peak) * 0.5), 0.8) * Math.pow(1 - u, o.taper);
    for (let i = 0; i < o.n; i++) {
      const u = Math.pow(R2(), o.bias) * 0.92;
      const r = h * 0.5 * env(u) * (0.35 + R2() * 0.65);
      if (r < 1) continue;
      const x = u * w, y = h / 2 + (R2() - 0.5) * h * 0.5 * env(u);
      const hot = Math.max(0, 1 - u * 2.2);
      const gr2 = g.createRadialGradient(x, y, 0, x, y, r);
      const a = (0.1 + R2() * 0.14) * (1 - u * 0.6);
      gr2.addColorStop(0, `rgba(255,${Math.round(190 + 60 * hot)},${Math.round(90 + 150 * hot)},${a * 1.6})`);
      gr2.addColorStop(0.45, `rgba(255,${Math.round(140 + 60 * hot)},${Math.round(40 + 60 * hot)},${a})`);
      gr2.addColorStop(1, "rgba(255,90,20,0)");
      g.fillStyle = gr2;
      g.beginPath();
      g.ellipse(x, y, r * (1.3 + R2()), r, (R2() - 0.5) * 0.6, 0, 7);
      g.fill();
    }
    const cr = h * 0.2;
    const gr = g.createRadialGradient(4, h / 2, 0, 4, h / 2, cr * 2.4);
    gr.addColorStop(0, "rgba(255,252,235,1)");
    gr.addColorStop(0.3, "rgba(255,230,160,.7)");
    gr.addColorStop(1, "rgba(255,160,60,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(4, h / 2, cr * 2.4, cr, 0, 0, 7);
    g.fill();
    g.globalCompositeOperation = "destination-in";
    const fx = g.createLinearGradient(0, 0, w, 0);
    fx.addColorStop(0, "rgba(0,0,0,1)");
    fx.addColorStop(0.75, "rgba(0,0,0,.9)");
    fx.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fx;
    g.fillRect(0, 0, w, h);
  });
  TEX.flameLong = [0, 1, 2].map(() => flameSide({ n: 170, peak: 0.42, taper: 0.8, bias: 1.25 }));
  TEX.flameShort = [0, 1, 2].map(() => flameSide({ n: 120, peak: 0.25, taper: 1.6, bias: 1.8 }));
  const star = (petals) => tex(256, (g, s) => {
    g.translate(s / 2, s / 2);
    g.globalCompositeOperation = "lighter";
    const n = petals || 9;
    const a0 = R2() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * Math.PI * 2 + (petals ? 0 : (R2() - 0.5) * 0.5);
      const L = s * (petals ? 0.4 + R2() * 0.08 : 0.2 + R2() * 0.26), wd = s * (petals ? 0.05 : 0.03 + R2() * 0.03);
      g.save();
      g.rotate(a);
      for (let j = 0; j < 5; j++) {
        const gr2 = g.createLinearGradient(0, 0, L, 0);
        gr2.addColorStop(0, "rgba(255,244,215,.5)");
        gr2.addColorStop(0.5, "rgba(255,175,70,.3)");
        gr2.addColorStop(1, "rgba(255,100,20,0)");
        g.fillStyle = gr2;
        const jw = wd * (0.5 + R2() * 0.7), jl = L * (0.6 + R2() * 0.4), dy = (R2() - 0.5) * wd;
        g.beginPath();
        g.moveTo(0, dy - jw);
        g.quadraticCurveTo(jl * 0.55, dy - jw * (0.6 + R2() * 0.6), jl, dy + (R2() - 0.5) * jw);
        g.quadraticCurveTo(jl * 0.55, dy + jw * (0.6 + R2() * 0.6), 0, dy + jw);
        g.fill();
      }
      g.restore();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.2);
    gr.addColorStop(0, "rgba(255,255,240,1)");
    gr.addColorStop(0.4, "rgba(255,215,130,.75)");
    gr.addColorStop(1, "rgba(255,140,40,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, s * 0.2, 0, 7);
    g.fill();
  });
  TEX.star = [star(0), star(0), star(0)];
  TEX.star3 = [star(3), star(3)];
  TEX.star4 = [star(4), star(4)];
  TEX.smoke = tex(256, (g, s) => {
    const h = s / 2, img = g.createImageData(s, s), d = img.data;
    const N = 32, grid = [];
    for (let i = 0; i < 4 * N * N; i++) grid.push(R2());
    const vn = (c, x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const at = (a, b) => grid[c * N * N + (b % N + N) % N * N + (a % N + N) % N];
      const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
      return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
    };
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const c = (x >= h ? 1 : 0) + (y >= h ? 2 : 0);
      const u = x % h / h - 0.5, v = y % h / h - 0.5;
      let f = 0, amp = 0.5, fr = 3;
      for (let o = 0; o < 5; o++) {
        f += vn(c, u * fr + 7 * c, v * fr) * amp;
        amp *= 0.5;
        fr *= 2.03;
      }
      const r = Math.hypot(u, v) * 2;
      const fall = Math.max(0, 1 - r * r) ** 1.4;
      const a = Math.max(0, f - 0.32) * 1.9 * fall;
      const i = (y * s + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255 * (0.85 + f * 0.15);
      d[i + 3] = Math.min(255, a * 255);
    }
    g.putImageData(img, 0, 0);
  });
  TEX.spark = tex(64, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,250,230,1)");
    gr.addColorStop(0.25, "rgba(255,200,110,.9)");
    gr.addColorStop(1, "rgba(255,120,30,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
  TEX.hole = tex(64, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(20,18,16,1)");
    gr.addColorStop(0.35, "rgba(40,36,30,.9)");
    gr.addColorStop(0.6, "rgba(120,110,95,.4)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
  TEX.glare = tex(256, (g, s) => {
    const c = s / 2;
    g.globalCompositeOperation = "lighter";
    let gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.04, "rgba(255,255,255,.9)");
    gr.addColorStop(0.12, "rgba(255,250,240,.35)");
    gr.addColorStop(0.35, "rgba(255,245,230,.08)");
    gr.addColorStop(1, "rgba(255,240,220,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    g.translate(c, c);
    for (let i = 0; i < 6; i++) {
      g.save();
      g.rotate(i * Math.PI / 3 + 0.2);
      const lg = g.createLinearGradient(0, 0, c, 0);
      lg.addColorStop(0, "rgba(255,255,255,.55)");
      lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(0, -1.6);
      g.lineTo(c, 0);
      g.lineTo(0, 1.6);
      g.fill();
      g.restore();
    }
  });
  return TEX;
}
var additive = (map, color, opacity = 1) => new THREE6.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE6.AdditiveBlending, depthWrite: false, toneMapped: false });
var LIT = {
  uAmb: { value: new THREE6.Color(1, 1, 1) },
  uSpotPos: { value: new THREE6.Vector3() },
  uSpotDir: { value: new THREE6.Vector3(1, 0, 0) },
  uSpotCol: { value: new THREE6.Color(0, 0, 0) },
  uSpotProf: { value: new THREE6.Vector3(0.08, 0.55, 0.035) },
  // σ пятна, край засветки (рад), уровень засветки
  uFlashPos: { value: new THREE6.Vector3() },
  uFlashCol: { value: new THREE6.Color(0, 0, 0) }
};
var LIT_GLSL = `
uniform vec3 uAmb, uSpotPos, uSpotDir, uSpotCol, uSpotProf, uFlashPos, uFlashCol;
float beamProf(float ang) {
  return exp(-(ang * ang) / (uSpotProf.x * uSpotProf.x)) + uSpotProf.z * (1.0 - smoothstep(uSpotProf.y * 0.72, uSpotProf.y, ang));
}
// Хеньи–Гринстейн, нормирована к 1 в среднем по сфере
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5); }
vec3 spotAt(vec3 p, float g) {
  vec3 d = p - uSpotPos; float r2 = max(dot(d, d), 4e-4); vec3 n = d * inversesqrt(r2);
  float ang = acos(clamp(dot(n, uSpotDir), -1.0, 1.0));
  return uSpotCol * beamProf(ang) / r2 * hg(dot(n, normalize(cameraPosition - p)), g);
}
vec3 flashAt(vec3 p) { vec3 d = p - uFlashPos; return uFlashCol / max(dot(d, d), 0.01); }
`;
function beamProfile(b, ang) {
  const hot = Math.exp(-(ang * ang) / (b.hot * b.hot));
  const edge = 1 - smooth(b.spill * 0.72, b.spill, ang);
  const ring = (b.ring || 0) * Math.exp(-(((ang - b.hot * 1.9) / (b.hot * 0.5)) ** 2));
  return hot + b.spillK * edge + ring;
}
var smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
var COOKIES = /* @__PURE__ */ new Map();
function beamCookie(b) {
  const key = [b.hot, b.spill, b.spillK, b.ring, b.tir].join("|");
  if (COOKIES.has(key)) return COOKIES.get(key);
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true }), img = g.createImageData(S, S), d = img.data;
  const tanA = Math.tan(b.spill * 1.02);
  let s = 1234;
  const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  const ph = [0, 1, 2, 3, 4].map(() => rnd() * 6.28);
  let peak = 0;
  const vals = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1;
    const rho = Math.hypot(u, v), a = Math.atan2(v, u);
    const ang = Math.atan(rho * tanA);
    let val = beamProfile(b, ang);
    const k = b.tir ? 0.25 : 1;
    val *= 1 + k * (0.05 * Math.sin(ang * 90 + ph[0]) * smooth(b.hot, b.hot * 2, ang) + 0.035 * Math.sin(a * 3 + ph[1]) * smooth(b.hot * 0.5, b.hot * 1.5, ang) + 0.02 * Math.sin(a * 7 + ph[2]));
    if (!b.tir) val *= 1 - 0.18 * Math.exp(-(((ang - b.spill * 0.55) / (b.spill * 0.05)) ** 2));
    vals[y * S + x] = Math.max(0, val);
    if (rho < 0.02) peak = Math.max(peak, val);
  }
  for (let i = 0; i < S * S; i++) {
    const q = Math.min(255, Math.round((vals[i] / (peak || 1)) ** (1 / 2.2) * 255));
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = q;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE6.CanvasTexture(c);
  t.colorSpace = THREE6.SRGBColorSpace;
  COOKIES.set(key, t);
  return t;
}
var CONE_VS = `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
var CONE_FS = `
uniform float uTan, uLen, uDensity, uTime, uInside;
varying vec3 vW;
${LIT_GLSL}
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec3 ro = cameraPosition, rd = normalize(vW - ro);
  vec3 A = uSpotPos, V = uSpotDir;
  float c2 = 1.0 / (1.0 + uTan * uTan);
  vec3 co = ro - A;
  float dv = dot(rd, V), cv = dot(co, V);
  float a = dv * dv - c2, b = 2.0 * (dv * cv - c2 * dot(rd, co)), c = cv * cv - c2 * dot(co, co);
  // луч вдоль образующей конуса: a → 0, деление дало бы Inf/NaN
  if (abs(a) < 1e-6) a = a < 0.0 ? -1e-6 : 1e-6;
  float disc = max(b * b - 4.0 * a * c, 0.0), sq = sqrt(disc);
  float t1 = (-b - sq) / (2.0 * a), t2 = (-b + sq) / (2.0 * a);
  if (t1 > t2) { float t = t1; t1 = t2; t2 = t; }
  float tn = 0.0, tf = 1e4;
  if (a < 0.0) { tn = t1; tf = t2; } else { if (dv > 0.0) { tn = t2; } else { tf = t1; } }
  // срез по длине луча: 0 ≤ h ≤ uLen
  if (abs(dv) > 1e-5) { float ta = -cv / dv, tb = (uLen - cv) / dv; tn = max(tn, min(ta, tb)); tf = min(tf, max(ta, tb)); }
  tn = max(tn, 0.0);
  if (tf <= tn) discard;
  const int N = STEPS;
  float dt = (tf - tn) / float(N);
  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (tn + (float(i) + j) * dt);
    float dens = uDensity * (0.55 + 0.9 * n3(p * 2.3 + vec3(0.0, uTime * 0.04, uTime * 0.02)));
    acc += spotAt(p, 0.72) * dens;
  }
  acc *= dt;
  ${HDR_SAFE("acc")}
  gl_FragColor = vec4(acc, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
var MOTE_VS = `
attribute float aSeed;
uniform float uTime, uSize, uGain;
uniform vec3 uBoxMin, uBoxMax;
varying vec3 vL;
${LIT_GLSL}
void main() {
  vec3 box = uBoxMax - uBoxMin;
  vec3 p = position + vec3(0.012, -0.004, 0.008) * uTime + 0.03 * sin(vec3(uTime * 0.21, uTime * 0.17, uTime * 0.23) + aSeed * vec3(12.9, 78.2, 37.7));
  p = uBoxMin + mod(p - uBoxMin, box);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * (0.5 + aSeed) / -mv.z, 1.0, 6.0);
  vL = spotAt(p, 0.8) * uGain * (0.3 + aSeed * aSeed);
}`;
var MOTE_FS = `
varying vec3 vL;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d);
  vec3 c = vL * a;
  ${HDR_SAFE("c")}
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
var VS = `
attribute vec3 iPos;
attribute vec4 iData;   // размер, поворот, альфа, кадр атласа
attribute vec4 iCol;    // цвет + растяжение (искры)
varying vec2 vUv;
varying float vA;
varying vec3 vC;
varying vec3 vL;
#include <fog_pars_vertex>
${LIT_GLSL}
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.y), s = sin(iData.y);
  vec2 q = position.xy;
  q.x *= 1.0 + iCol.w;
  mvPosition.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c) * iData.x;
  gl_Position = projectionMatrix * mvPosition;
  float f = iData.w;
  vUv = ATLAS > 1.0 ? (uv + vec2(mod(f, 2.0), floor(f / 2.0))) * 0.5 : uv;
  vA = iData.z;
  vC = iCol.rgb;
  #ifdef LIT
  vL = uAmb + spotAt(iPos, 0.55) + flashAt(iPos);
  #else
  vL = vec3(1.0);
  #endif
  #include <fog_vertex>
}`;
var FS = `
uniform sampler2D map;
varying vec2 vUv;
varying float vA;
varying vec3 vC;
varying vec3 vL;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  vec3 c = vC * t.rgb * vL;
  ${HDR_SAFE("c")}
  gl_FragColor = vec4(c, t.a * vA);
  if (gl_FragColor.a < 0.003) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
var Particles = class {
  constructor(scene, map, max, o = {}) {
    this.max = max;
    const g = new THREE6.InstancedBufferGeometry();
    const quad = new THREE6.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    this.aPos = new THREE6.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE6.DynamicDrawUsage);
    this.aData = new THREE6.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE6.DynamicDrawUsage);
    this.aCol = new THREE6.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE6.DynamicDrawUsage);
    g.setAttribute("iPos", this.aPos);
    g.setAttribute("iData", this.aData);
    g.setAttribute("iCol", this.aCol);
    g.instanceCount = 0;
    const uniforms = { ...THREE6.UniformsUtils.merge([THREE6.UniformsLib.fog, { map: { value: null } }]), ...LIT };
    uniforms.map.value = map;
    const mat = new THREE6.ShaderMaterial({
      uniforms,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: o.additive ? THREE6.AdditiveBlending : THREE6.NormalBlending,
      defines: { ATLAS: (o.atlas ? 2 : 1).toFixed(1), ...o.additive ? {} : { LIT: 1 } }
    });
    mat.toneMapped = !o.additive;
    this.mesh = new THREE6.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.additive ? 3 : 2;
    scene.add(this.mesh);
    this.list = [];
    this.pool = [];
    this.sort = !!o.sort;
  }
  // p: {pos, vel, life, size, grow, alpha, color, drag, buoy, gravity, turb, rot, spin, frame, stretch, fadeIn}
  add(p) {
    if (this.list.length >= this.max) this.pool.push(this.list.shift());
    const q = this.pool.pop() || {};
    Object.assign(q, { t: 0, drag: 2, buoy: 0, gravity: 0, rot: R2() * 6.28, spin: (R2() - 0.5) * 1.2, frame: R2() * 4 | 0, stretch: 0, fadeIn: 0.06, grow: 0, turb: 0, bounce: 0 }, p);
    q.px = p.pos.x;
    q.py = p.pos.y;
    q.pz = p.pos.z;
    q.vx = p.vel.x;
    q.vy = p.vel.y;
    q.vz = p.vel.z;
    q.pos = q.vel = null;
    this.list.push(q);
  }
  update(dt, cam, wind) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.pool.push(p);
        L.splice(i, 1);
        continue;
      }
      const dr = Math.exp(-p.drag * dt);
      p.vx = p.vx * dr + wind.x * (1 - dr);
      p.vz = p.vz * dr + wind.z * (1 - dr);
      p.vy = p.vy * dr + (p.buoy - p.gravity) * dt;
      if (p.turb) {
        p.vx += (R2() - 0.5) * p.turb * dt;
        p.vy += (R2() - 0.5) * p.turb * dt;
        p.vz += (R2() - 0.5) * p.turb * dt;
      }
      p.px += p.vx * dt;
      p.py += p.vy * dt;
      p.pz += p.vz * dt;
      p.rot += p.spin * dt;
      // искры и крошка отскакивают от пола и катятся, теряя скорость
      if (p.bounce && this.floorAt) {
        const fl = this.floorAt(p.px, p.pz) + p.size * 0.3;
        if (p.py < fl) {
          p.py = fl;
          if (p.vy < -0.4) {
            p.vy = -p.vy * p.bounce * (0.7 + R2() * 0.5);
            p.vx *= 0.55;
            p.vz *= 0.55;
            p.spin *= 0.5;
          } else {
            p.vy = 0;
            p.vx *= Math.exp(-6 * dt);
            p.vz *= Math.exp(-6 * dt);
            p.spin *= Math.exp(-6 * dt);
          }
        }
      }
    }
    if (this.sort && L.length > 1 && cam) {
      const c = cam.position;
      for (const p of L) p.d = (p.px - c.x) ** 2 + (p.py - c.y) ** 2 + (p.pz - c.z) ** 2;
      L.sort((a, b) => b.d - a.d);
    }
    const P = this.aPos.array, D = this.aData.array, C = this.aCol.array;
    for (let i = 0; i < L.length; i++) {
      const p = L[i], k = p.t / p.life;
      P[i * 3] = p.px;
      P[i * 3 + 1] = p.py;
      P[i * 3 + 2] = p.pz;
      D[i * 4] = p.size + p.grow * Math.sqrt(k);
      D[i * 4 + 1] = p.rot;
      const fin = p.fadeIn > 0 ? Math.min(1, p.t / p.fadeIn) : 1;
      D[i * 4 + 2] = p.alpha * fin * (1 - k) * (1 - k * 0.5);
      D[i * 4 + 3] = p.frame;
      C[i * 4] = p.color[0];
      C[i * 4 + 1] = p.color[1];
      C[i * 4 + 2] = p.color[2];
      C[i * 4 + 3] = p.stretch * (1 - k);
    }
    this.mesh.geometry.instanceCount = L.length;
    if (L.length) {
      for (const a of [this.aPos, this.aData, this.aCol]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, L.length * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }
};
// След пули: квад вдоль отрезка траектории, развёрнутый к камере. Ширина не меньше ≈1 пикселя,
// при расширении яркость делится — далёкий трассер остаётся точкой, а не исчезает.
var ST_VS = `
attribute vec3 iA;
attribute vec3 iB;
attribute vec4 iP;   // ширина (м), альфа, яркость ядра, —
attribute vec3 iC;
uniform float uPix;
varying vec2 vUv;
varying float vAl;
varying vec3 vCol;
varying float vCore;
void main() {
  vec3 ax = iB - iA;
  float L = length(ax);
  vec3 A = L > 1e-6 ? ax / L : vec3(1.0, 0.0, 0.0);
  vec3 mid = (iA + iB) * 0.5;
  vec3 toCam = cameraPosition - mid;
  float dist = length(toCam);
  vec3 side = cross(A, toCam / max(dist, 1e-4));
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
  float w = max(iP.x, dist * uPix);
  vec3 p = mix(iA, iB, position.x + 0.5) + side * position.y * w;
  vUv = uv;
  vAl = iP.y * min(1.0, iP.x / w);
  vCol = iC;
  vCore = iP.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
var ST_FS = `
varying vec2 vUv;
varying float vAl;
varying vec3 vCol;
varying float vCore;
void main() {
  float a = abs(vUv.y - 0.5) * 2.0;
  float across = exp(-a * a * 5.0);
  float along = pow(vUv.x, 1.6);
  vec3 c = mix(vCol, vec3(1.0), vCore * exp(-a * a * 30.0) * along);
  ${HDR_SAFE("c")}
  gl_FragColor = vec4(c, vAl * across * along);
  if (gl_FragColor.a < 0.002) discard;
}`;
var Streaks = class {
  constructor(scene, max, additive) {
    this.max = max;
    const g = new THREE6.InstancedBufferGeometry();
    const quad = new THREE6.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    const mk = (n) => new THREE6.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE6.DynamicDrawUsage);
    this.a = { iA: mk(3), iB: mk(3), iP: mk(4), iC: mk(3) };
    for (const k in this.a) g.setAttribute(k, this.a[k]);
    g.instanceCount = 0;
    this.u = { uPix: { value: 1e-3 } };
    this.mesh = new THREE6.Mesh(g, new THREE6.ShaderMaterial({ uniforms: this.u, vertexShader: ST_VS, fragmentShader: ST_FS, transparent: true, depthWrite: false, blending: additive ? THREE6.AdditiveBlending : THREE6.NormalBlending, toneMapped: false, side: THREE6.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 4 : 3;
    scene.add(this.mesh);
    this.n = 0;
  }
  begin(cam) {
    this.n = 0;
    if (cam) this.u.uPix.value = 2 * Math.tan(cam.fov * Math.PI / 360) / Math.max(300, innerHeight) * 1.3;
  }
  push(A, B, width, alpha, core, col) {
    if (this.n >= this.max) return;
    const i = this.n++, a = this.a;
    a.iA.array.set([A.x, A.y, A.z], i * 3);
    a.iB.array.set([B.x, B.y, B.z], i * 3);
    a.iP.array.set([width, alpha, core, 0], i * 4);
    a.iC.array.set([col.r, col.g, col.b], i * 3);
  }
  end() {
    this.mesh.geometry.instanceCount = this.n;
    if (this.n) for (const k in this.a) {
      const at = this.a[k];
      at.clearUpdateRanges();
      at.addUpdateRange(0, this.n * at.itemSize);
      at.needsUpdate = true;
    }
  }
};
// Световая установка одного фонаря: прожектор с куки-профилем отражателя и тенью, объёмный
// конус (рассеяние в воздухе), отражённый свет от препятствия и пола, блик линзы.
// Основная установка пишет в LIT — ею подсвечиваются дым и пылинки; вторая — облегчённая.
var BeamRig = class {
  constructor(scene, T2, primary) {
    this.primary = primary;
    this.on = false;
    this.U = primary ? LIT : { ...LIT, uSpotPos: { value: new THREE6.Vector3() }, uSpotDir: { value: new THREE6.Vector3(1, 0, 0) }, uSpotCol: { value: new THREE6.Color(0, 0, 0) }, uSpotProf: { value: new THREE6.Vector3(0.08, 0.55, 0.035) } };
    this.spot = new THREE6.SpotLight(16777215, 0, 0, 0.55, 0.04, 2);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(primary ? 2048 : 1024, primary ? 2048 : 1024);
    this.spot.shadow.camera.near = 0.02;
    this.spot.shadow.camera.far = 160;
    this.spot.shadow.bias = -15e-5;
    this.spot.shadow.normalBias = 0.012;
    this.spot.shadow.autoUpdate = false;
    this.spot.map = beamCookie({ hot: 0.075, spill: 0.55, spillK: 0.035, ring: 0.06 });
    // второй прожектор добавляется в расчёт освещения только когда включён
    this.spot.visible = primary;
    scene.add(this.spot, this.spot.target);
    if (primary) {
      this.bounce = new THREE6.PointLight(16777215, 0, 0, 2);
      this.bounceFloor = new THREE6.PointLight(16777215, 0, 0, 2);
      scene.add(this.bounce, this.bounceFloor);
    }
    this.cone = new THREE6.Mesh(
      new THREE6.CylinderGeometry(1, 1e-4, 1, 64, 1, true).translate(0, 0.5, 0).rotateZ(-Math.PI / 2),
      new THREE6.ShaderMaterial({
        uniforms: { ...this.U, uTan: { value: 0.5 }, uLen: { value: 30 }, uDensity: { value: 2e-3 }, uTime: { value: 0 }, uInside: { value: 0 } },
        defines: { STEPS: 40 },
        vertexShader: CONE_VS,
        fragmentShader: CONE_FS,
        transparent: true,
        depthWrite: false,
        blending: THREE6.AdditiveBlending,
        side: THREE6.FrontSide
      })
    );
    this.cone.visible = false;
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 1;
    scene.add(this.cone);
    this.lampGlow = new THREE6.Sprite(additive(T2.glow, 16774886, 0));
    this.lampGlow.renderOrder = 6;
    this.glare = new THREE6.Sprite(additive(T2.glare, 16774886, 0));
    this.glare.renderOrder = 6;
    scene.add(this.lampGlow, this.glare);
    this._v = new THREE6.Vector3();
  }
  // s: { pos, dir, beam, k — световой поток 0..1, warm, dist — до препятствия по оси, hit, cam, exposure }.
  // beam: { cd (кд-ед.), hot, spill, spillK, ring, tir, color, lensR }.
  set(s, haze) {
    const on = !!s && s.k > 1e-3;
    this.on = on;
    this.spot.shadow.autoUpdate = on;
    this.cone.visible = on;
    if (!this.primary) this.spot.visible = on;
    const U = this.U;
    if (!on) {
      this.spot.intensity = 0;
      if (this.bounce) this.bounce.intensity = this.bounceFloor.intensity = 0;
      this.lampGlow.material.opacity = 0;
      this.glare.material.opacity = 0;
      U.uSpotCol.value.setRGB(0, 0, 0);
      return;
    }
    const { pos, dir, beam: b, k } = s;
    const map = beamCookie(b);
    if (this.spot.map !== map) this.spot.map = map;
    this.spot.angle = b.spill * 1.02;
    const col = this.spot.color.set(b.color ?? 16054015);
    if (s.warm) col.lerp(WARM, s.warm);
    this.spot.intensity = b.cd * k;
    this.spot.position.copy(pos).addScaledVector(dir, 4e-3);
    this.spot.target.position.copy(pos).addScaledVector(dir, 10);
    this.spot.target.updateMatrixWorld();
    U.uSpotPos.value.copy(pos);
    U.uSpotDir.value.copy(dir);
    U.uSpotCol.value.copy(col).multiplyScalar(b.cd * k / 2.2);
    U.uSpotProf.value.set(b.hot, b.spill, b.spillK);
    if (this.bounce) {
      if (s.hit) {
        const flux = b.cd * k * (Math.tan(b.hot) ** 2 + b.spillK * Math.tan(b.spill) ** 2) * 0.4;
        this.bounce.intensity = flux;
        this.bounce.color.copy(col).lerp(s.hitColor || col, 0.5);
        this.bounce.position.copy(s.hit).addScaledVector(dir, -Math.min(0.5, (s.dist ?? 1) * 0.1));
      } else this.bounce.intensity = 0;
      if (dir.y < Math.sin(b.spill * 0.8)) {
        const down = Math.max(0.2, pos.y - 0.02);
        const a = Math.max(0.05, b.spill * 0.8 + Math.asin(Math.max(-1, Math.min(1, dir.y))));
        const reach = Math.min(12, down / Math.tan(a));
        this.bounceFloor.position.copy(pos).addScaledVector(dir, reach * 1.3);
        this.bounceFloor.position.y = 0.15;
        this.bounceFloor.intensity = b.cd * k * b.spillK * Math.tan(b.spill) ** 2 * 0.5 * 0.3;
        this.bounceFloor.color.copy(col);
      } else this.bounceFloor.intensity = 0;
    }
    const L = Math.min(s.dist ?? 60, 80) + 0.3, tn = Math.tan(b.spill);
    this.cone.position.copy(pos);
    this.cone.quaternion.setFromUnitVectors(X_AXIS, dir);
    this.cone.scale.set(L, L * tn, L * tn);
    const CU = this.cone.material.uniforms;
    CU.uTan.value = tn;
    CU.uLen.value = L;
    CU.uDensity.value = 12e-4 + haze * 0.045;
    const cam = s.cam;
    const v = this._v.subVectors(cam.position, pos), vl = v.length(), hh = v.dot(dir);
    const inside = hh > 0 && hh < L && Math.acos(Math.min(1, hh / vl)) < b.spill;
    this.cone.material.side = inside ? THREE6.BackSide : THREE6.FrontSide;
    CU.uInside.value = inside ? 1 : 0;
    const ang = Math.acos(Math.max(-1, Math.min(1, hh / vl)));
    const E = b.cd * k * beamProfile(b, ang) / (vl * vl);
    const g = Math.max(0, Math.min(1, Math.log2(1 + E * (s.exposure ?? 1) * 0.4) / 8));
    this.glare.position.copy(pos).addScaledVector(dir, 6e-3);
    this.glare.scale.setScalar(vl * (0.01 + 0.35 * g * g));
    this.glare.material.opacity = g;
    this.glare.material.color.copy(col);
    const face = Math.max(0, Math.cos(Math.min(Math.PI / 2, ang)));
    this.lampGlow.position.copy(pos).addScaledVector(dir, 3e-3);
    this.lampGlow.scale.setScalar((b.lensR ?? 0.013) * 2.6);
    this.lampGlow.material.opacity = Math.min(1, k * (0.25 + 0.75 * face));
    this.lampGlow.material.color.copy(col);
  }
};
var MAX_SHELLS = 60;
var WARM = new THREE6.Color(16763274);
var X_AXIS = new THREE6.Vector3(1, 0, 0);
var FX = class {
  constructor(scene, mats) {
    this.scene = scene;
    const T2 = textures();
    this.T = T2;
    this.mats = mats;
    this.flash = new THREE6.Group();
    this.flash.visible = false;
    scene.add(this.flash);
    const flameMat = () => new THREE6.MeshBasicMaterial({ map: T2.flameLong[0], transparent: true, blending: THREE6.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE6.DoubleSide, fog: false });
    const along = new THREE6.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    this.flameAxis = new THREE6.Group();
    this.flamePlanes = [0, 1, 2].map(() => {
      const m = new THREE6.Mesh(along, flameMat());
      m.renderOrder = 4;
      m.frustumCulled = false;
      this.flameAxis.add(m);
      return m;
    });
    const across = new THREE6.PlaneGeometry(1, 1).rotateY(Math.PI / 2);
    this.flameStar = new THREE6.Mesh(across, flameMat());
    this.flameStar.renderOrder = 4;
    this.flameStar.frustumCulled = false;
    this.flameAxis.add(this.flameStar);
    this.jets = [0, 1].map(() => {
      const g = new THREE6.Group();
      for (let i = 0; i < 2; i++) {
        const m = new THREE6.Mesh(along, flameMat());
        m.rotation.x = i * Math.PI / 2;
        m.renderOrder = 4;
        m.frustumCulled = false;
        g.add(m);
      }
      this.flameAxis.add(g);
      return g;
    });
    this.flash.add(this.flameAxis);
    this.flashFade = 1;
    this.flashLight = new THREE6.PointLight(16754768, 0, 16, 2);
    scene.add(this.flashLight);
    this.flashT = 0;
    this.smoke = new Particles(scene, T2.smoke, 420, { atlas: true, sort: true });
    this.fire = new Particles(scene, T2.spark, 260, { additive: true });
    this.smoke.floorAt = this.fire.floorAt = (x, z) => this.floorAt(x, z);
    this.wind = new THREE6.Vector3(0.18, 0, 0.1);
    this.noWind = new THREE6.Vector3();
    this.heat = 0;
    this.wispT = 0;
    this.haze = 0;
    this.floorAt = () => 0;
    this.shells = [];
    this.inst = /* @__PURE__ */ new Map();
    this.holes = [];
    this.holeGeo = new THREE6.CircleGeometry(0.012, 12);
    this.holeMat = new THREE6.MeshBasicMaterial({ map: T2.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.tracers = new Streaks(scene, 64, true);
    this.traces = new Streaks(scene, 64, false);
    this.night = false;
    this._c = new THREE6.Color();
    // до двух ЛЦУ и двух фонарей одновременно — у каждого свой луч
    this.lasers = [0, 1].map(() => {
      const beamGeo = new THREE6.CylinderGeometry(7e-4, 16e-4, 1, 6, 1, true).translate(0, 0.5, 0).rotateZ(-Math.PI / 2);
      const beam = new THREE6.Mesh(
        beamGeo,
        new THREE6.MeshBasicMaterial({ color: 16722458, transparent: true, opacity: 0.2, blending: THREE6.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })
      );
      beam.visible = false;
      beam.frustumCulled = false;
      /* v26: днём луч виден. Аддитивное свечение на светлом фоне (стена, небо) ничего не добавляет:
         красный канал там уже почти 1. Поэтому поверх — «сердцевина» с обычным смешиванием: тонкая
         насыщенная нить шириной ~2 пикселя на любом расстоянии (не тоньше пикселя — не мерцает),
         плотнее у модуля и гаснет к 40–60 м. Реальный 5-мВт луч на солнце почти не виден — это
         игровая условность, как в большинстве шутеров; ночью работает прежнее свечение. */
      const core = new THREE6.Mesh(beamGeo, new THREE6.ShaderMaterial({
        uniforms: { uColor: { value: new THREE6.Color(16722458) }, uA: { value: 0.6 }, uPx: { value: 1e-3 }, uLen: { value: 1 } },
        vertexShader: `uniform float uPx, uLen; varying float vT, vR;
          void main() {
            vec3 axisL = vec3(position.x, 0.0, 0.0);
            vec3 radL = vec3(0.0, position.y, position.z);
            float rl = length(radL);
            vec3 Pw = (modelMatrix * vec4(axisL, 1.0)).xyz;
            vec3 Rw = normalize(mat3(modelMatrix) * (rl > 0.0 ? radL / rl : vec3(0.0, 1.0, 0.0)));
            float d = length(cameraPosition - Pw);
            float r = max(rl, 1.1 * uPx * d);
            vT = position.x * uLen; vR = rl > 0.0 ? 1.0 : 0.0;
            gl_Position = projectionMatrix * viewMatrix * vec4(Pw + Rw * r, 1.0);
          }`,
        fragmentShader: `uniform vec3 uColor; uniform float uA; varying float vT;
          void main() {
            float a = uA * smoothstep(0.03, 0.35, vT) * (0.25 + 0.75 * exp(-vT / 28.0));
            gl_FragColor = vec4(uColor, a);
          }`,
        transparent: true, depthWrite: false, toneMapped: false
      }));
      core.visible = false;
      core.frustumCulled = false;
      core.renderOrder = 4;
      scene.add(core);
      const dot = new THREE6.Sprite(new THREE6.SpriteMaterial({ map: T2.glow, color: 16724e3, transparent: true, depthWrite: false, toneMapped: false }));
      const halo = new THREE6.Sprite(additive(T2.glow, 16724e3, 0.3));
      dot.visible = halo.visible = false;
      dot.renderOrder = halo.renderOrder = 5;
      scene.add(beam, dot, halo);
      return { beam, dot, halo, core };
    });
    this.rigs = [new BeamRig(scene, T2, true), new BeamRig(scene, T2, false)];
    {
      const N = 900, pos = new Float32Array(N * 3), seed = new Float32Array(N);
      this.moteBox = [new THREE6.Vector3(-0.6, 0.5, -1.6), new THREE6.Vector3(7, 2.8, 1.6)];
      const [a, b] = this.moteBox;
      for (let i = 0; i < N; i++) {
        pos[i * 3] = a.x + R2() * (b.x - a.x);
        pos[i * 3 + 1] = a.y + R2() * (b.y - a.y);
        pos[i * 3 + 2] = a.z + R2() * (b.z - a.z);
        seed[i] = R2();
      }
      const g = new THREE6.BufferGeometry();
      g.setAttribute("position", new THREE6.BufferAttribute(pos, 3));
      g.setAttribute("aSeed", new THREE6.BufferAttribute(seed, 1));
      this.motes = new THREE6.Points(g, new THREE6.ShaderMaterial({
        uniforms: { ...LIT, uTime: { value: 0 }, uSize: { value: 4 }, uGain: { value: 22e-4 }, uBoxMin: { value: a }, uBoxMax: { value: b } },
        vertexShader: MOTE_VS,
        fragmentShader: MOTE_FS,
        transparent: true,
        depthWrite: false,
        blending: THREE6.AdditiveBlending
      }));
      this.motes.visible = false;
      this.motes.frustumCulled = false;
      scene.add(this.motes);
    }
    this.time = 0;
    this.beamOn = false;
    this.ray = new THREE6.Raycaster();
    this._v = new THREE6.Vector3();
    this._v2 = new THREE6.Vector3();
    this._q = new THREE6.Quaternion();
    this._m = new THREE6.Matrix4();
    this._s = new THREE6.Vector3(1, 1, 1);
  }
  // Что-то ещё движется — кадр нужно перерисовать.
  active() {
    return this.flashT > 0 || this.smoke.list.length > 0 || this.fire.list.length > 0 || this.heat > 0.3 || this.shells.some((s) => s.alive && !s.rest) || this.beamOn || this.tracers.n > 0 || this.traces.n > 0;
  }
  smokePuff(pos, vel, o = {}) {
    const g = o.grey ?? 0.58 + R2() * 0.1;
    this.smoke.add({
      pos,
      vel,
      life: o.life ?? 1.6 + R2(),
      size: o.size ?? 0.03,
      grow: o.grow ?? 0.3,
      alpha: o.alpha ?? 0.35,
      color: o.tint ? [g * 0.96, g * 0.98, g * 1.04] : [g * 1.02, g, g * 0.95],
      drag: o.drag ?? 3.5,
      buoy: o.buoy ?? 0.12,
      turb: o.turb ?? 0.25,
      fadeIn: o.fadeIn ?? 0.03,
      gravity: o.gravity ?? 0
    });
  }
  // kind: bare | fh | comp | linear | brake | supp; q — ориентация оружия (боковые струи),
  // o.flash — заметность вспышки дульного устройства (0..1), o.first — первый выстрел из холодного глушителя
  muzzleFlash(pos, dir, kind, size = 1, q = null, o = {}) {
    const T2 = this.T, supp = kind === "supp";
    const pick = (a3) => a3[R2() * a3.length | 0];
    this.flash.position.copy(pos);
    if (q) this.flameAxis.quaternion.copy(q);
    else this.flameAxis.quaternion.setFromUnitVectors(X_AXIS, dir);
    this.flash.visible = true;
    this.flashT = 0.03;
    this.flashFade = 1;
    const vis = o.flash ?? 1;
    const k = size * (0.85 + R2() * 0.3);
    const P = {
      bare: { L: 0.3, W: 0.12, a: 1, long: true, star: 0 },
      fh: { L: 0.11, W: 0.05, a: 0.55, long: false, star: 4 },
      comp: { L: 0.16, W: 0.07, a: 0.85, long: false, star: 0 },
      linear: { L: 0.22, W: 0.05, a: 0.8, long: true, star: 0 },
      brake: { L: 0.1, W: 0.06, a: 0.75, long: false, star: 0 },
      supp: { L: 0.035, W: 0.025, a: o.first ? 0.7 : 0.25, long: false, star: 0 }
    }[kind] || { L: 0.2, W: 0.08, a: 0.9, long: true, star: 0 };
    const a = P.a * (0.35 + 0.65 * Math.min(1, vis * 1.4));
    const tex2 = P.long ? T2.flameLong : T2.flameShort;
    const roll = R2() * Math.PI;
    this.flamePlanes.forEach((m, i) => {
      m.rotation.x = roll + i * Math.PI / 3;
      m.material.map = pick(tex2);
      m.userData.a = a * (i ? 0.75 : 1);
      m.material.opacity = m.userData.a;
      m.scale.set(P.L * k * (0.8 + R2() * 0.4), P.W * k * (0.8 + R2() * 0.4), 1);
    });
    this.flameStar.material.map = pick(P.star === 4 ? T2.star4 : P.star === 3 ? T2.star3 : T2.star);
    this.flameStar.userData.a = a * (supp ? 0.5 : 0.9);
    this.flameStar.material.opacity = this.flameStar.userData.a;
    this.flameStar.position.set(P.L * 0.12 * k, 0, 0);
    this.flameStar.rotation.x = R2() * 6.28;
    this.flameStar.scale.setScalar(P.W * 1.5 * k * (0.8 + R2() * 0.4));
    const jetDirs = kind === "brake" ? [[0, 0, 1], [0, 0, -1]] : kind === "comp" ? [[0.25, 1, 0.3], [0.25, 1, -0.3]] : [];
    this.jets.forEach((g, i) => {
      const d = jetDirs[i];
      g.visible = !!d;
      if (!d) return;
      g.quaternion.setFromUnitVectors(X_AXIS, new THREE6.Vector3(...d).normalize());
      g.position.set(P.L * 0.3 * k, 0, 0);
      const L = (kind === "brake" ? 0.14 : 0.08) * k * (0.8 + R2() * 0.4);
      g.children.forEach((m) => {
        m.material.map = pick(T2.flameShort);
        m.material.opacity = a * 0.8;
        m.scale.set(L, L * 0.45, 1);
      });
    });
    this.flashLight.position.copy(pos).addScaledVector(dir, 0.08);
    this.flashLight.intensity = (supp ? 0.6 : 7) * a * size;
    this.heat = Math.min(3, this.heat + 0.22 * size);
    this.haze = Math.min(1, this.haze + 0.025 * size * (supp ? 0.8 : 1));
    const nSp = supp ? 0 : Math.round((kind === "bare" ? 5 : kind === "brake" ? 4 : 2) * size * (0.5 + R2()));
    for (let i = 0; i < nSp; i++) {
      const v = dir.clone().multiplyScalar(5 + R2() * 9).add(new THREE6.Vector3((R2() - 0.5) * 2, (R2() - 0.5) * 2, (R2() - 0.5) * 2));
      this.fire.add({ pos: pos.clone().addScaledVector(dir, 0.03), vel: v, life: 0.04 + R2() * 0.07, size: 25e-4 + R2() * 3e-3, alpha: 1, color: [1, 0.66, 0.3], drag: 7, gravity: 3, stretch: 3, fadeIn: 0, spin: 0 });
    }
    const lvl = size * (supp ? 0.7 : kind === "brake" ? 0.8 : 1) * (o.smoke ?? 1);
    const gas = size < 1 ? Math.pow(size, 1.5) : 1 + (size - 1) * 0.5;
    const haze = (p, v, op) => this.smokePuff(p, v, { grey: 0.5 + R2() * 0.12, tint: 1, ...op, size: op.size * gas, grow: op.grow * gas });
    const n = supp ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar((supp ? 0.4 : 1.2) + R2() * (supp ? 0.8 : 2.4)).add(new THREE6.Vector3((R2() - 0.5) * 0.35, (R2() - 0.3) * 0.3, (R2() - 0.5) * 0.35));
      haze(pos.clone().addScaledVector(dir, 0.02 + R2() * 0.12), v, { size: 0.02 + R2() * 0.02, grow: 0.22 + R2() * 0.28, alpha: (0.1 + R2() * 0.07) * lvl, life: 0.9 + R2() * 1.3, drag: 6 + R2() * 3, buoy: 0.06, turb: 0.5, fadeIn: 0.02 });
    }
    const side = new THREE6.Vector3(0, 0, 1).applyQuaternion(this.flameAxis.quaternion);
    const up = new THREE6.Vector3(0, 1, 0);
    if (kind === "brake" || kind === "comp") {
      for (let i = 0; i < 6; i++) {
        const sg = kind === "comp" ? (R2() - 0.5) * 0.6 : i % 2 ? 1 : -1;
        const v = side.clone().multiplyScalar(sg * (1.5 + R2() * 2)).addScaledVector(up, kind === "comp" ? 1.2 + R2() * 1.5 : (R2() - 0.2) * 0.6).addScaledVector(dir, R2() * 0.6);
        haze(pos.clone(), v, { size: 0.02, grow: 0.25 + R2() * 0.2, alpha: 0.09 * size, life: 0.9 + R2() * 0.8, drag: 7, turb: 0.5 });
      }
    }
    for (let i = 0; i < 2; i++) {
      haze(pos.clone().addScaledVector(dir, 0.05 + R2() * 0.2), dir.clone().multiplyScalar(0.15 + R2() * 0.3).add(new THREE6.Vector3(0, 0.04, 0)), { size: 0.05, grow: 0.5 + R2() * 0.3, alpha: 0.045 * lvl, life: 2.2 + R2() * 1.5, drag: 2.5, buoy: 0.07, turb: 0.35, fadeIn: 0.2 });
    }
    // Дульная волна: газ за пулей срывается вихревым кольцом — оно быстро расширяется поперёк
    // оси, тормозится воздухом (большое сопротивление) и расплывается. Тормоз режет кольцо вбок.
    if (!supp && kind !== "brake") {
      const ringN = 10, up2 = new THREE6.Vector3(0, 1, 0).applyQuaternion(this.flameAxis.quaternion);
      const ringV = (kind === "bare" ? 3.2 : kind === "comp" ? 2.4 : 1.8) * gas, fwd = (kind === "linear" ? 3 : 1.6) * gas;
      const d0 = 0.04 + R2() * 0.03;
      for (let i = 0; i < ringN; i++) {
        const a = i / ringN * Math.PI * 2 + R2() * 0.3;
        const rad = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(up2, Math.sin(a));
        haze(pos.clone().addScaledVector(dir, d0).addScaledVector(rad, 0.01), rad.multiplyScalar(ringV * (0.8 + R2() * 0.4)).addScaledVector(dir, fwd * (0.8 + R2() * 0.4)), { size: 0.016, grow: 0.16 + R2() * 0.08, alpha: 0.075 * lvl, life: 0.7 + R2() * 0.5, drag: 9 + R2() * 3, buoy: 0.05, turb: 0.6, fadeIn: 0.01 });
      }
    }
  }
  // пороховые газы из окна выброса
  portSmoke(pos, dir, k = 1) {
    for (let i = 0; i < 2; i++) {
      const v = dir.clone().multiplyScalar(0.35 + R2() * 0.3).add(new THREE6.Vector3((R2() - 0.5) * 0.1, 0.18 + R2() * 0.1, 0));
      this.smokePuff(pos.clone(), v, { size: 0.01, grow: 0.1 + R2() * 0.08, alpha: Math.min(0.2, 0.09 * k), life: 0.8 + R2() * 0.6, drag: 3.5, grey: 0.6, tint: 1, turb: 0.3 });
    }
  }
  shellMesh(key, cal, live) {
    let m = this.inst.get(key);
    if (m) return m;
    const c = CAL[cal] || CAL["556"];
    const brass = c.steel ? this.mats.get("steelCase") : this.mats.get("brass");
    let g = caseGeo(cal), mat = brass;
    if (c.shot || live) {
      // гильза дроби — два материала (латунь + пластик); живой патрон — гильза + пуля
      const parts = (c.shot ? [shotHead(c), shotHull(c, !live)] : [g, bulletGeo(cal)]).map((x) => x.index ? x.toNonIndexed() : x);
      g = new THREE6.BufferGeometry();
      for (const a of ["position", "normal"]) {
        const arr = new Float32Array(parts[0].getAttribute(a).array.length + parts[1].getAttribute(a).array.length);
        arr.set(parts[0].getAttribute(a).array, 0);
        arr.set(parts[1].getAttribute(a).array, parts[0].getAttribute(a).array.length);
        g.setAttribute(a, new THREE6.BufferAttribute(arr, 3));
      }
      const n0 = parts[0].getAttribute("position").count;
      g.addGroup(0, n0, 0);
      g.addGroup(n0, parts[1].getAttribute("position").count, 1);
      mat = c.shot ? [this.mats.get("brass"), this.mats.get("hullRed")] : [brass, this.mats.get("copper")];
    }
    g.scale(1e-3, 1e-3, 1e-3);
    g.translate(-c.L * 5e-4, 0, 0);
    m = new THREE6.InstancedMesh(g, mat, live ? 8 : MAX_SHELLS);
    m.castShadow = true;
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE6.DynamicDrawUsage);
    this.scene.add(m);
    this.inst.set(key, m);
    return m;
  }
  // Гильза: вылет из окна с кувырком, дымок из дульца, отскоки от бетона.
  shell(pos, vel, cal, quat, live = false) {
    const c = CAL[cal] || CAL["556"];
    const key = cal + (live ? ":live" : "");
    this.shellMesh(key, cal, live);
    const cap = live ? 8 : MAX_SHELLS;
    const same = this.shells.filter((x) => x.key === key);
    let s = same.find((x) => !x.alive);
    if (!s) {
      if (same.length >= cap) s = same.reduce((a, b) => a.t > b.t ? a : b);
      else {
        s = { key, pos: new THREE6.Vector3(), quat: new THREE6.Quaternion(), vel: new THREE6.Vector3(), w: new THREE6.Vector3() };
        this.shells.push(s);
      }
    }
    s.pos.copy(pos);
    s.quat.copy(quat);
    s.vel.copy(vel);
    const axis = X_AXIS.clone().applyQuaternion(quat);
    const tumble = new THREE6.Vector3().crossVectors(axis, vel).normalize();
    s.w.copy(tumble).multiplyScalar((live ? 12 : 24) + R2() * 22).addScaledVector(axis, (R2() - 0.5) * 12);
    s.alive = true;
    s.rest = false;
    s.t = 0;
    s.bounced = 0;
    s.steel = c.steel;
    s.live = live;
    s.prevY = pos.y;
    s.r = c.rim * 5e-4;
    s.kind = c.shot ? "hull" : c.steel ? "steel" : "brass";
    s.trail = live ? 0 : c.shot ? 0.5 : 0.28;
    return s;
  }
  // Попадание. Сталь — искры и отметина; бумага — пробоина и клочки картона;
  // бетон — серая пыль и крошка; дерево — щепа; пулеулавливатель — искры и тёмная пыль.
  // o: { v — скорость у цели, м/с; graze — рикошет под скользящим углом; pellet — картечина; dir — направление полёта }
  impact(hit, surface, o = {}) {
    const p = hit.point, n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE6.Vector3(0, 1, 0);
    // энергия удара относительно винтовочной пули 5,56 у дульного среза
    const E = o.v ? Math.max(0.25, Math.min(2.2, Math.pow(o.v / 800, 2) * (o.mass ?? 4) / 4)) : 1;
    const q = o.pellet ? 0.35 : Math.sqrt(E);
    if (o.graze) {
      // рикошет: веер искр/пыли вдоль отражённого направления, отметины нет
      const d = o.dir ? o.dir.clone() : n.clone().negate();
      const refl = d.sub(n.clone().multiplyScalar(2 * d.dot(n))).normalize();
      const hard = surface === "steel" || surface === "trap" || surface === "panel" || surface === "concrete";
      for (let i = 0; i < (hard ? 6 : 3); i++) {
        const v = refl.clone().multiplyScalar(4 + R2() * 6).add(new THREE6.Vector3((R2() - 0.5) * 1.5, R2() * 1.2, (R2() - 0.5) * 1.5));
        if (hard) this.fire.add({ pos: p.clone().addScaledVector(n, 0.01), vel: v, life: 0.08 + R2() * 0.12, size: 0.01 + R2() * 0.008, alpha: 1, color: [1, 0.72, 0.38], drag: 2, gravity: 9.8, stretch: 3, fadeIn: 0, spin: 0 });
        this.smoke.add({ pos: p.clone(), vel: v.multiplyScalar(0.15), life: 0.6 + R2() * 0.4, size: 0.03, grow: 0.25, alpha: 0.25, color: [0.6, 0.58, 0.55], drag: 3, gravity: 0.3, turb: 0.3 });
      }
      return;
    }
    const sparks = (cnt, spd, col = [1, 0.75, 0.4]) => {
      cnt = Math.max(1, Math.round(cnt * q));
      for (let i = 0; i < cnt; i++) {
        const v = n.clone().multiplyScalar(1 + R2() * spd).add(new THREE6.Vector3((R2() - 0.5) * 4, R2() * 3, (R2() - 0.5) * 4));
        this.fire.add({ pos: p.clone().addScaledVector(n, 0.01), vel: v.multiplyScalar(0.7 + 0.3 * q), life: 0.25 + R2() * 0.35, size: 0.012 + R2() * 0.01, alpha: 1, color: col, drag: 1.5, gravity: 9.8, stretch: 2, fadeIn: 0, spin: 0, bounce: 0.45 });
      }
    };
    const dust = (cnt, col, size = 0.08, alpha = 0.55) => {
      cnt = Math.max(1, Math.round(cnt * q));
      size *= 0.7 + 0.3 * q;
      for (let i = 0; i < cnt; i++) {
        this.smoke.add({ pos: p.clone(), vel: n.clone().multiplyScalar(0.8 + R2() * 1.4).add(new THREE6.Vector3((R2() - 0.5) * 0.9, R2() * 1.2, (R2() - 0.5) * 0.9)), life: 1 + R2() * 0.8, size, grow: size * 7, alpha, color: col, drag: 2.5, gravity: 0.4, turb: 0.3 });
      }
    };
    const chips = (cnt, col, size = 0.025) => {
      cnt = Math.max(1, Math.round(cnt * q));
      for (let i = 0; i < cnt; i++) {
        this.smoke.add({ pos: p.clone(), vel: n.clone().multiplyScalar(2 + R2() * 2).add(new THREE6.Vector3((R2() - 0.5) * 2, R2() * 2, (R2() - 0.5) * 2)), life: 0.9 + R2() * 0.6, size, alpha: 0.9, color: col, drag: 0.8, gravity: 9.8, fadeIn: 0, bounce: 0.3, spin: (R2() - 0.5) * 12 });
      }
    };
    const hole = (scale = 1) => {
      const m = new THREE6.Mesh(this.holeGeo, this.holeMat);
      hit.object.worldToLocal(m.position.copy(p).addScaledVector(n, 15e-4));
      const ln = n.clone().transformDirection(new THREE6.Matrix4().copy(hit.object.matrixWorld).invert());
      m.lookAt(m.position.clone().add(ln));
      m.scale.setScalar(scale * (o.hole ?? 1));
      hit.object.add(m);
      this.holes.push(m);
      if (this.holes.length > 120) {
        const h = this.holes.shift();
        h.parent?.remove(h);
      }
    };
    // касательный базис к поверхности попадания
    const t1 = new THREE6.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE6.Vector3(0, 1, 0) : new THREE6.Vector3(1, 0, 0)).normalize();
    const t2 = new THREE6.Vector3().crossVectors(n, t1);
    // пылевая корона: выброс конусом от поверхности + медленно оседающая взвесь
    const crown = (cnt, col, spd, size) => {
      cnt = Math.max(2, Math.round(cnt * q));
      for (let i = 0; i < cnt; i++) {
        const a = R2() * Math.PI * 2, open = 0.35 + R2() * 0.5;
        const v = n.clone().multiplyScalar(spd * (0.6 + R2() * 0.6)).addScaledVector(t1, Math.cos(a) * spd * open).addScaledVector(t2, Math.sin(a) * spd * open);
        this.smoke.add({ pos: p.clone().addScaledVector(n, 0.01), vel: v, life: 0.5 + R2() * 0.5, size: size * 0.5, grow: size * 4, alpha: 0.5, color: col, drag: 7, gravity: 1.2, turb: 0.4, fadeIn: 0.01 });
      }
      for (let i = 0; i < Math.max(1, Math.round(2 * q)); i++) this.smoke.add({ pos: p.clone().addScaledVector(n, 0.05), vel: n.clone().multiplyScalar(0.2).add(new THREE6.Vector3((R2() - 0.5) * 0.2, 0.05, (R2() - 0.5) * 0.2)), life: 3 + R2() * 2, size: size * 1.5, grow: size * 9, alpha: 0.12, color: col, drag: 1.5, gravity: 0.05, buoy: 0.01, turb: 0.15, fadeIn: 0.3 });
    };
    if (surface === "steel") {
      for (let i = 0; i < 3; i++) this.smokePuff(p.clone().addScaledVector(n, 0.02), n.clone().multiplyScalar(0.4).add(new THREE6.Vector3((R2() - 0.5) * 0.6, R2() * 0.5, (R2() - 0.5) * 0.6)), { life: 0.7, size: 0.06, grow: 0.25, alpha: 0.4, drag: 3 });
      sparks(10, 2);
      // вспышка удара и «брызги» свинца: пуля растекается по плите — веер почти вдоль поверхности
      this.fire.add({ pos: p.clone().addScaledVector(n, 0.015), vel: new THREE6.Vector3(), life: 0.05, size: 0.07 * (0.7 + 0.3 * q), alpha: 1, color: [1, 0.85, 0.6], drag: 0, fadeIn: 0, spin: 0 });
      const splash = Math.round(14 * q);
      for (let i = 0; i < splash; i++) {
        const a = R2() * Math.PI * 2, s = 6 + R2() * 10;
        const v = t1.clone().multiplyScalar(Math.cos(a) * s).addScaledVector(t2, Math.sin(a) * s).addScaledVector(n, s * (0.05 + R2() * 0.15));
        this.fire.add({ pos: p.clone().addScaledVector(n, 0.008), vel: v, life: 0.06 + R2() * 0.1, size: 5e-3 + R2() * 5e-3, alpha: 0.9, color: [1, 0.8, 0.55], drag: 4, gravity: 9.8, stretch: 4, fadeIn: 0, spin: 0 });
        if (i % 3 === 0) this.smoke.add({ pos: p.clone().addScaledVector(n, 0.01), vel: v.clone().multiplyScalar(0.12), life: 0.5 + R2() * 0.4, size: 0.015, grow: 0.12, alpha: 0.3, color: [0.55, 0.55, 0.56], drag: 5, gravity: 0.2, turb: 0.3 });
      }
      hole();
    } else if (surface === "paper") {
      hole(0.55);
      chips(4, [0.72, 0.6, 0.42], 0.012);
      // волокна картона: лёгкое облачко с обеих сторон (пуля прошла насквозь)
      for (const sgn of [1, -1]) this.smoke.add({ pos: p.clone().addScaledVector(n, 0.01 * sgn), vel: n.clone().multiplyScalar(sgn * (0.3 + R2() * 0.3)), life: 0.5 + R2() * 0.3, size: 0.01, grow: 0.08, alpha: 0.35, color: [0.75, 0.66, 0.5], drag: 4, gravity: 0.3, turb: 0.2 });
    } else if (surface === "trap") {
      sparks(6, 1.5, [1, 0.7, 0.35]);
      dust(3, [0.3, 0.29, 0.27], 0.1, 0.4);
    } else if (surface === "wood") {
      dust(3, [0.55, 0.45, 0.33], 0.05, 0.45);
      chips(6, [0.6, 0.48, 0.32], 0.02);
      crown(4, [0.58, 0.48, 0.36], 1.4, 0.03);
    } else if (surface === "panel") {
      sparks(2, 1);
      dust(3, [0.35, 0.35, 0.36], 0.06, 0.4);
    } else {
      dust(6, [0.62, 0.61, 0.58]);
      chips(5, [0.45, 0.44, 0.42]);
      crown(8, [0.6, 0.59, 0.56], 2.2, 0.04);
    }
  }
  // ЛЦУ. s: { pos, dir, hitables, color, k — мощность 0..1 (батарея), night }; i — номер излучателя.
  // Луч в чистом воздухе почти не виден; в темноте и в дыму — тонкая нить.
  setLaser(s, i = 0) {
    const L = this.lasers[i];
    const on = !!s && s.k > 2e-3;
    L.beam.visible = L.dot.visible = L.halo.visible = on;
    L.core.visible = on;
    if (!on) return;
    const { pos, dir } = s;
    this.ray.set(pos, dir);
    this.ray.far = 250;
    const h = this.ray.intersectObjects(s.hitables, false)[0];
    const d = h ? h.distance : 250;
    const col = s.color ?? 16722458;
    L.beam.material.color.set(col);
    L.dot.material.color.set(col);
    L.halo.material.color.set(col);
    L.beam.position.copy(pos);
    L.beam.scale.set(d, 1, 1);
    L.beam.quaternion.setFromUnitVectors(X_AXIS, dir);
    L.beam.material.opacity = s.k * ((s.night ? 0.045 : 6e-3) + this.haze * (s.night ? 0.4 : 0.12));
    L.core.position.copy(L.beam.position); L.core.quaternion.copy(L.beam.quaternion); L.core.scale.copy(L.beam.scale);
    {
      const U2 = L.core.material.uniforms, cam = this._cam;
      U2.uColor.value.set(col); U2.uLen.value = d;
      const hgt = (this._rh || 720);
      U2.uPx.value = cam ? 2 * Math.tan(cam.fov * Math.PI / 360) / hgt : 1.5e-3;
      /* ночью нить слабее (луч и так светится), днём — заметная; зелёный глаз видит лучше */
      const green = (col & 65280) > ((col >> 16) & 255) << 8;
      U2.uA.value = Math.min(0.85, s.k * (s.night ? 0.22 : 0.55) * (green ? 1.25 : 1));
    }
    L.dot.position.copy(pos).addScaledVector(dir, d - 0.01);
    L.halo.position.copy(L.dot.position);
    const ds = 7e-3 + d * 9e-4;
    L.dot.scale.setScalar(ds);
    L.dot.material.opacity = Math.min(1, s.k * 1.1);
    L.halo.scale.setScalar(ds * (s.night ? 5 : 2.2));
    L.halo.material.opacity = s.k * (s.night ? 0.4 : 0.12);
  }
  // Фонарь i (0 — основной, подсвечивает дым и пылинки; 1 — второй).
  setLight(s, i = 0) {
    this.rigs[i].set(s, this.haze);
    this.beamOn = this.rigs[0].on || this.rigs[1].on;
    this.motes.visible = this.rigs[0].on;
  }
  // Качество: шаги объёмного луча, число пылинок, размер тени второго фонаря.
  setQuality(q) {
    for (const r of this.rigs) {
      const m = r.cone.material;
      if (m.defines.STEPS !== q.steps) {
        m.defines.STEPS = q.steps;
        m.needsUpdate = true;
      }
    }
    this.motes.geometry.setDrawRange(0, q.motes);
    const sp = this.rigs[0].spot.shadow;
    if (sp.mapSize.x !== q.spot) {
      sp.mapSize.set(q.spot, q.spot);
      sp.map?.dispose();
      sp.map = null;
    }
  }
  // Трасса пули: след ударной волны/тёплого воздуха за пулей или трассер (гореть начинает с 10 м).
  bullets(list, mode, cam) {
    this.tracers.begin(cam);
    this.traces.begin(cam);
    if (mode !== "off") {
      const vis = this.night ? 1 : 0.45;
      const amb = this.night ? [0.035, 0.042, 0.06] : [0.92, 0.94, 0.98];
      const A = this._v, dirV = this._v2;
      for (const b of list) {
        const head = b.p, fade = b.alive ? 1 : Math.max(0, (b.fade ?? 0) / 0.12);
        if (fade <= 0) continue;
        const v = b.v.length();
        dirV.copy(b.v).divideScalar(Math.max(v, 1));
        const flown = b.origin.distanceTo(head);
        if (b.tracer || mode === "tracer") {
          const burn = flown - 10;
          if (burn <= 0) continue;
          const len = Math.min(burn, v * 0.022, 25);
          A.copy(head).addScaledVector(dirV, -len);
          this._c.setHex(b.spec.tracer ?? 16725558);
          this.tracers.push(A, head, 0.012, (0.55 + 0.45 * vis) * fade, 0.8, this._c);
        } else {
          if (flown < 2.5) continue;
          const len = Math.min(flown - 2, 3.5);
          A.copy(head).addScaledVector(dirV, -len);
          this._c.setRGB(amb[0], amb[1], amb[2]);
          const sup = v > 360 ? 1 : 0.55;
          this.traces.push(A, head, 0.006, 0.16 * sup * fade, 0, this._c);
        }
      }
    }
    this.tracers.end();
    this.traces.end();
  }
  setAmbient(k) {
    LIT.uAmb.value.setScalar(k);
  }
  // muzzle — текущий дульный срез: от нагретого ствола после очереди идёт струйка дыма
  update(dt, onShellBounce, cam, muzzle) {
    this.time += dt;
    this.haze *= Math.exp(-dt / 30);
    for (const r of this.rigs) r.cone.material.uniforms.uTime.value = this.time;
    this.motes.material.uniforms.uTime.value = this.time;
    LIT.uFlashPos.value.copy(this.flashLight.position);
    LIT.uFlashCol.value.setRGB(1, 0.66, 0.31).multiplyScalar(this.flashLight.intensity / 2.2);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flash.visible = false;
        this.flashLight.intensity = 0;
      } else {
        this.flashLight.intensity *= 0.5;
        this.flashFade *= 0.55;
      }
    }
    if (this.flash.visible && cam) {
      const ax = this._v.set(1, 0, 0).applyQuaternion(this.flameAxis.quaternion);
      const f = Math.abs(ax.dot(this._v2.subVectors(this.flash.position, cam.position).normalize()));
      const F = this.flashFade;
      this.flameStar.material.opacity = this.flameStar.userData.a * (0.15 + 0.85 * f * f) * F;
      for (const m of this.flamePlanes) m.material.opacity = m.userData.a * (1 - 0.55 * f * f) * F;
    }
    if (this.heat > 0) {
      this.heat = Math.max(0, this.heat - dt * 0.35);
      this.wispT -= dt;
      if (this.wispT <= 0 && this.heat > 0.3 && muzzle) {
        this.wispT = 0.06 + R2() * 0.05;
        this.smokePuff(muzzle.clone(), new THREE6.Vector3((R2() - 0.5) * 0.02, 0.1 + R2() * 0.06, (R2() - 0.5) * 0.02), { size: 0.01, grow: 0.09, alpha: Math.min(0.08, this.heat * 0.035), life: 1.8 + R2(), drag: 1.2, buoy: 0.06, turb: 0.12, grey: 0.6, tint: 1, fadeIn: 0.3 });
      }
    }
    for (const s of this.shells) {
      if (!s.alive) continue;
      s.t += dt;
      if (s.t > 10) {
        s.alive = false;
        continue;
      }
      if (s.rest) continue;
      s.vel.y -= 9.81 * dt;
      s.vel.multiplyScalar(Math.exp(-0.25 * dt));
      s.pos.addScaledVector(s.vel, dt);
      const wl = s.w.length();
      if (wl > 1e-3) {
        this._q.setFromAxisAngle(this._v.copy(s.w).divideScalar(wl), wl * dt);
        s.quat.premultiply(this._q);
      }
      if (s.trail > 0) {
        s.trail -= dt;
        if (R2() < 0.45) this.smokePuff(s.pos.clone(), s.vel.clone().multiplyScalar(0.1), { size: 6e-3, grow: 0.05, alpha: 0.06, life: 0.5 + R2() * 0.4, drag: 4, grey: 0.62, tint: 1, fadeIn: 0.02 });
      }
      let fl = this.floorAt(s.pos.x, s.pos.z);
      if (fl > 0 && s.prevY < fl) fl = 0;
      s.prevY = s.pos.y;
      const floor = fl + s.r;
      if (s.pos.y < floor) {
        s.pos.y = floor;
        if (s.vel.y < -0.35) {
          s.vel.y *= -(0.28 + R2() * 0.12);
          s.vel.x *= 0.55;
          s.vel.z *= 0.55;
          s.w.multiplyScalar(0.5).add(this._v.set((R2() - 0.5) * 20, (R2() - 0.5) * 30, (R2() - 0.5) * 20));
          if (s.bounced++ < 2 && onShellBounce) onShellBounce(s, s.bounced);
        } else {
          s.rest = true;
          const ax = X_AXIS.clone().applyQuaternion(s.quat);
          ax.y = 0;
          if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0);
          s.quat.setFromUnitVectors(X_AXIS, ax.normalize()).multiply(this._q.setFromAxisAngle(X_AXIS, R2() * 6.28));
        }
      }
    }
    const counts = /* @__PURE__ */ new Map();
    for (const s of this.shells) {
      if (!s.alive) continue;
      const m = this.inst.get(s.key), i = counts.get(s.key) || 0;
      m.setMatrixAt(i, this._m.compose(s.pos, s.quat, this._s));
      counts.set(s.key, i + 1);
    }
    for (const [k, m] of this.inst) {
      const n = counts.get(k) || 0;
      if (n || m.count) m.instanceMatrix.needsUpdate = true;
      m.count = n;
    }
    this.smoke.update(dt, cam, this.wind);
    this.fire.update(dt, cam, this.noWind);
  }
};

/* v9 (полигон AEGIS): облегчённые эффекты выстрела из оружейной — те же
   вспышка (пламя вдоль оси, «звезда», боковые струи тормоза/компенсатора),
   искры, дым из ствола и окна выброса, кольцо дульной волны и струйка с
   горячего ствола, но без лазеров, фонарей, пылинок и гильз (их в полигоне
   ведёт свой модуль). Методы muzzleFlash / smokePuff / portSmoke — общие с FX. */
var ShotFX = class {
  constructor(scene, o = {}) {
    const T2 = textures();
    this.T = T2;
    this.scene = scene;
    this.flash = new THREE6.Group();
    this.flash.visible = false;
    scene.add(this.flash);
    const flameMat = () => new THREE6.MeshBasicMaterial({ map: T2.flameLong[0], transparent: true, blending: THREE6.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE6.DoubleSide, fog: false });
    const along = new THREE6.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    this.flameAxis = new THREE6.Group();
    this.flamePlanes = [0, 1, 2].map(() => {
      const m = new THREE6.Mesh(along, flameMat());
      m.renderOrder = 4; m.frustumCulled = false; m.userData.noAO = true;
      this.flameAxis.add(m);
      return m;
    });
    const across = new THREE6.PlaneGeometry(1, 1).rotateY(Math.PI / 2);
    this.flameStar = new THREE6.Mesh(across, flameMat());
    this.flameStar.renderOrder = 4; this.flameStar.frustumCulled = false;
    this.flameAxis.add(this.flameStar);
    this.jets = [0, 1].map(() => {
      const g = new THREE6.Group();
      for (let i = 0; i < 2; i++) {
        const m = new THREE6.Mesh(along, flameMat());
        m.rotation.x = i * Math.PI / 2; m.renderOrder = 4; m.frustumCulled = false;
        g.add(m);
      }
      this.flameAxis.add(g);
      return g;
    });
    this.flash.add(this.flameAxis);
    this.flashFade = 1;
    /* свет вспышки в сцене даёт полигон (свой PointLight); здесь — только
       «виртуальный», для подсветки дыма (LIT.uFlashPos/uFlashCol) */
    this.flashLight = { position: new THREE6.Vector3(), intensity: 0 };
    this.flashT = 0;
    this.smoke = new Particles(scene, T2.smoke, o.maxSmoke || 360, { atlas: true, sort: true });
    this.fire = new Particles(scene, T2.spark, o.maxFire || 120, { additive: true });
    this.smoke.mesh.userData.noAO = this.fire.mesh.userData.noAO = true;
    this.floorAt = () => -1e9;
    this.smoke.floorAt = this.fire.floorAt = (x, z) => this.floorAt(x, z);
    this.wind = new THREE6.Vector3(0.18, 0, 0.1);
    this.noWind = new THREE6.Vector3();
    this.heat = 0; this.wispT = 0; this.haze = 0;
    this.lite = !!o.lite;
    this._v = new THREE6.Vector3(); this._v2 = new THREE6.Vector3();
  }
  /* общий свет сцены для дыма (в тёмном лесу дым не должен «светиться») */
  setAmbient(r, g, b) { LIT.uAmb.value.setRGB(r, g, b); }
  update(dt, cam, muzzle) {
    this.haze *= Math.exp(-dt / 30);
    LIT.uFlashPos.value.copy(this.flashLight.position);
    LIT.uFlashCol.value.setRGB(1, 0.66, 0.31).multiplyScalar(this.flashLight.intensity / 2.2);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
      else { this.flashLight.intensity *= 0.5; this.flashFade *= 0.55; }
    }
    if (this.flash.visible && cam) {
      const ax = this._v.set(1, 0, 0).applyQuaternion(this.flameAxis.quaternion);
      const f = Math.abs(ax.dot(this._v2.subVectors(this.flash.position, cam.position).normalize()));
      const F = this.flashFade;
      this.flameStar.material.opacity = this.flameStar.userData.a * (0.15 + 0.85 * f * f) * F;
      for (const m of this.flamePlanes) m.material.opacity = m.userData.a * (1 - 0.55 * f * f) * F;
    }
    if (this.heat > 0) {
      this.heat = Math.max(0, this.heat - dt * 0.35);
      this.wispT -= dt;
      if (this.wispT <= 0 && this.heat > 0.3 && muzzle) {
        this.wispT = (0.06 + R2() * 0.05) * (this.lite ? 1.8 : 1);
        this.smokePuff(muzzle.clone(), new THREE6.Vector3((R2() - 0.5) * 0.02, 0.1 + R2() * 0.06, (R2() - 0.5) * 0.02), { size: 0.01, grow: 0.09, alpha: Math.min(0.08, this.heat * 0.035), life: 1.8 + R2(), drag: 1.2, buoy: 0.06, turb: 0.12, grey: 0.6, tint: 1, fadeIn: 0.3 });
      }
    }
    this.smoke.update(dt, cam, this.wind);
    this.fire.update(dt, cam, this.noWind);
  }
};
ShotFX.prototype.smokePuff = FX.prototype.smokePuff;
ShotFX.prototype.muzzleFlash = FX.prototype.muzzleFlash;
ShotFX.prototype.portSmoke = FX.prototype.portSmoke;

// ==== engine/ballistics.js
const THREE9 = window.THREE;
// Внешняя баллистика: точечная масса, закон сопротивления G1 (таблица McCoy), стандартная
// атмосфера (15 °C, 760 мм рт. ст.), ветер, деривация (эмпирика Litz). Дробь — сферы со своим Cd(M).
// Интегрирование — полунеявный Эйлер с шагом 0,5 мс: на 100 м ошибка по снижению < 0,1 мм.
var G1_TABLE = [
  [0, 0.2629], [0.05, 0.2558], [0.1, 0.2487], [0.15, 0.2413], [0.2, 0.2344], [0.25, 0.2278], [0.3, 0.2214], [0.35, 0.2155],
  [0.4, 0.2104], [0.45, 0.2061], [0.5, 0.2032], [0.55, 0.202], [0.6, 0.2034], [0.7, 0.2165], [0.725, 0.223], [0.75, 0.2313],
  [0.775, 0.2417], [0.8, 0.2546], [0.825, 0.2706], [0.85, 0.2901], [0.875, 0.3136], [0.9, 0.3415], [0.925, 0.3734], [0.95, 0.4084],
  [0.975, 0.4448], [1, 0.4805], [1.025, 0.5136], [1.05, 0.5427], [1.075, 0.5677], [1.1, 0.5883], [1.125, 0.6053], [1.15, 0.6191],
  [1.2, 0.6393], [1.25, 0.6518], [1.3, 0.6589], [1.35, 0.6621], [1.4, 0.6625], [1.45, 0.6607], [1.5, 0.6573], [1.55, 0.6528],
  [1.6, 0.6474], [1.65, 0.6413], [1.7, 0.6347], [1.75, 0.628], [1.8, 0.621], [1.85, 0.6141], [1.9, 0.6072], [1.95, 0.6003],
  [2, 0.5934], [2.05, 0.5867], [2.1, 0.5804], [2.15, 0.5743], [2.2, 0.5685], [2.25, 0.563], [2.3, 0.5577], [2.35, 0.5527],
  [2.4, 0.5481], [2.45, 0.5438], [2.5, 0.5397], [2.6, 0.5325], [2.7, 0.5264], [2.8, 0.5211], [2.9, 0.5168], [3, 0.5133],
  [3.2, 0.5077], [3.4, 0.5041], [3.6, 0.5019], [4, 0.4993]
];
// Сфера (картечь/дробь): докритический режим ≈0,47, волновой кризис у M≈0,8…1,2
var SPHERE_TABLE = [[0, 0.47], [0.5, 0.47], [0.6, 0.49], [0.7, 0.53], [0.8, 0.6], [0.9, 0.72], [1, 0.86], [1.1, 0.94], [1.2, 0.97], [1.5, 0.98], [2, 0.96], [3, 0.94]];
function tableLookup(T, m) {
  if (m <= T[0][0]) return T[0][1];
  let lo = 0, hi = T.length - 1;
  if (m >= T[hi][0]) return T[hi][1];
  while (hi - lo > 1) {
    const mid = lo + hi >> 1;
    if (T[mid][0] > m) hi = mid;
    else lo = mid;
  }
  const [m0, c0] = T[lo], [m1, c1] = T[hi];
  return c0 + (c1 - c0) * (m - m0) / (m1 - m0);
}
var AIR = window.GBallistics ? window.GBallistics.AIR : { rho: 1.225, sound: 340.3, g: 9.80665 };
var LB_IN2 = 703.0696;
// Пули по калибрам (масса г, BC G1 фунт/дюйм², диаметр мм, шаг нарезов мм, цвет трассера).
// Отечественные трассеры (Т-46, 7Т2, 7Т3) горят зелёным, натовские M62/M856 — красным.
var BULLETS = {
  "556": { name: "M855", mass: 4, bc: 0.304, d: 5.7, twist: 178, tracer: 16725558 },
  "545": { name: "7Н6", mass: 3.42, bc: 0.336, d: 5.6, twist: 255, tracer: 6750070 },
  "762x39": { name: "57-Н-231", mass: 7.9, bc: 0.275, d: 7.9, twist: 240, tracer: 6750070 },
  "762x51": { name: "M80", mass: 9.5, bc: 0.393, d: 7.82, twist: 305, tracer: 16725558 },
  "762x54R": { name: "7Н1", mass: 9.8, bc: 0.42, d: 7.92, twist: 320, tracer: 6750070 },
  "9x19": { name: "57-Н-181С", mass: 8, bc: 0.145, d: 9.01, twist: 250, tracer: 16725558 },
  "12ga": { name: "картечь 00", mass: 3.48, d: 8.38, sphere: true }
};
// 12 калибр: снаряд определяется выбранным патроном
var SHELLS = {
  buck00: { name: "картечь 00", mass: 3.48, d: 8.38, sphere: true },
  shot4: { name: "картечь №4", mass: 1.34, d: 6.1, sphere: true },
  slug: { name: "пуля Бреннеке", mass: 31.5, bc: 0.078, d: 18.5, twist: 0 }
};
function bulletSpec(cal, ammoId) {
  if (window.GBallistics) return window.GBallistics.spec(cal, ammoId);
  return SHELLS[ammoId] || BULLETS[cal] || BULLETS["556"];
}
// Коэффициент в a = k(M)·v·v⃗: G1 — через BC, сфера — через площадь миделя
function dragK(spec, mach) {
  if (window.GBallistics) return window.GBallistics.dragK(spec, mach, AIR);
  if (spec.sphere) {
    const A = Math.PI * Math.pow(spec.d / 2e3, 2);
    return AIR.rho * tableLookup(SPHERE_TABLE, mach) * A / (2 * spec.mass / 1e3);
  }
  return Math.PI * AIR.rho * tableLookup(G1_TABLE, mach) / (8 * spec.bc * LB_IN2);
}
// Деривация по Litz: SD[дюйм] = 1,25·(Sg + 1,2)·t^1,83; вправо при правых нарезах
function spinDrift(spec, t) {
  if (!spec.twist) return 0;
  return 1.25 * (1.7 + 1.2) * Math.pow(t, 1.83) * 0.0254;
}
var STEP = 5e-4;
// Плоская траектория в системе ствола (x — вдоль оси, y — вверх) для пристрелки и BDC.
// Возвращает точки через каждые dx метров: {x, y, t, v}.
function trajectory2D(spec, v0, angle, maxX, dx = 1) {
  if (window.GBallistics) return window.GBallistics.trajectory(spec,v0,angle,maxX,dx,AIR);
  let x = 0, y = 0, t = 0, vx = v0 * Math.cos(angle), vy = v0 * Math.sin(angle);
  const out = [{ x: 0, y: 0, t: 0, v: v0 }];
  let next = dx;
  while (x < maxX && t < 6) {
    const v = Math.hypot(vx, vy), k = dragK(spec, v / AIR.sound) * v;
    vx -= k * vx * STEP;
    vy -= (k * vy + AIR.g) * STEP;
    const px = x, py = y, pt = t;
    x += vx * STEP;
    y += vy * STEP;
    t += STEP;
    while (x >= next && next <= maxX) {
      const f = (next - px) / (x - px);
      out.push({ x: next, y: py + (y - py) * f, t: pt + STEP * f, v: Math.hypot(vx, vy) });
      next += dx;
    }
    if (vx < 30) break;
  }
  return out;
}
var zeroCache = /* @__PURE__ */ new Map();
// Пристрелка: угол возвышения ствола над линией прицеливания, при котором траектория пересекает
// линию прицеливания (высота h м над осью канала, боковой вынос z м) на дальности Z.
function zeroSolution(spec, v0, h, z, Z) {
  if (window.GBallistics) return window.GBallistics.zero(spec,v0,h,z,Z,AIR);
  const key = [spec.name, spec.mass, v0.toFixed(1), h.toFixed(4), z.toFixed(4), Z].join("|");
  if (zeroCache.has(key)) return zeroCache.get(key);
  const yAt = (a) => {
    const tr = trajectory2D(spec, v0, a, Z, Z);
    const p = tr[tr.length - 1];
    return p.x >= Z - 1e-6 ? p : null;
  };
  let a0 = Math.atan2(h, Z), a1 = a0 + 2e-3;
  let p0 = yAt(a0), p1 = yAt(a1), f0 = p0 ? p0.y - h : -1, f1 = p1 ? p1.y - h : -1;
  for (let i = 0; i < 12 && Math.abs(f1) > 1e-6 && f1 !== f0; i++) {
    const a2 = a1 - f1 * (a1 - a0) / (f1 - f0);
    a0 = a1;
    f0 = f1;
    a1 = Math.min(0.2, Math.max(-0.05, a2));
    p1 = yAt(a1);
    f1 = p1 ? p1.y - h : -1;
  }
  const tZ = p1 ? p1.t : 0;
  const sol = { elev: a1, wind: Math.atan2(z - spinDrift(spec, tZ), Z), Z, h, z, v0 };
  zeroCache.set(key, sol);
  if (zeroCache.size > 64) zeroCache.delete(zeroCache.keys().next().value);
  return sol;
}
// Поправки на дальности R (в угловых минутах вниз от точки прицеливания) для BDC-сеток
function holdovers(spec, v0, sol, ranges) {
  const maxR = Math.max(...ranges);
  const tr = trajectory2D(spec, v0, sol.elev, maxR, 1);
  return ranges.map((R) => {
    const p = tr[Math.min(tr.length - 1, Math.round(R))];
    if (!p || p.x < R - 1) return null;
    return { R, moa: Math.atan2(sol.h - p.y, R) / (Math.PI / 10800), t: p.t, v: p.v };
  });
}
// Пули в полёте. Попадания определяются отрезками траектории за кадр (raycast по сегменту),
// поэтому время подлёта, снижение, снос ветром и потеря скорости — честные.
var Ballistics = class {
  constructor() {
    this.list = [];
    this.ray = new THREE9.Raycaster();
    this._d = new THREE9.Vector3();
    this._n = new THREE9.Vector3();
  }
  // o: {pos, vel, spec, right(Vector3 — вправо от стрелка), tracer, trace, onHit(hit, b)}
  fire(o) {
    const b = {
      p: o.pos.clone(),
      v: o.vel.clone(),
      prev: o.pos.clone(),
      origin: o.pos.clone(),
      right: o.right.clone(),
      spec: o.spec,
      v0: o.vel.length(),
      t: 0,
      sd: 0,
      dist: 0,
      alive: true,
      tracer: !!o.tracer,
      trace: o.trace !== false,
      ricochets: 0,
      onHit: o.onHit,
      hist: [o.pos.clone()]
    };
    this.list.push(b);
    return b;
  }
  get active() {
    return this.list.length > 0;
  }
  update(dt, hitables, wind) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (!b.alive) {
        b.fade = (b.fade ?? 0.12) - dt;
        if (b.fade <= 0) this.list.splice(i, 1);
        continue;
      }
      b.prev.copy(b.p);
      let left = dt;
      while (left > 1e-7) {
        const h = Math.min(STEP * 4, left);
        left -= h;
        window.GBallistics.advance(b.p,b.v,b.spec,h,wind,AIR);
        b.t += h;
      }
      const sd = spinDrift(b.spec, b.t);
      b.p.addScaledVector(b.right, sd - b.sd);
      b.sd = sd;
      const seg = this._d.subVectors(b.p, b.prev), L = seg.length();
      if (L > 1e-6) {
        this.ray.set(b.prev, seg.divideScalar(L));
        this.ray.far = L;
        this.ray.near = 0;
        const hit = this.ray.intersectObjects(hitables, false)[0];
        if (hit) {
          b.p.copy(hit.point);
          b.dist = b.origin.distanceTo(hit.point);
          const n = hit.face ? this._n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld) : this._n.set(0, 1, 0);
          const vl = b.v.length(), cosI = -b.v.dot(n) / vl;
          const surf = hit.object.userData.surface || "dirt";
          // рикошет от грунта под скользящим углом (< ≈7°): пуля теряет большую часть скорости
          const graze = surf !== "steel" && cosI < 0.12 && vl > 180 && b.ricochets < 1 && Math.random() < 0.65;
          b.onHit?.(hit, b, vl, graze);
          // бумагу/картон пуля пробивает почти без потери скорости и летит дальше, до вала
          if (surf === "paper" && (b.pierced = (b.pierced || 0) + 1) < 4) {
            b.v.multiplyScalar(0.985);
            b.p.addScaledVector(b.v, 4e-3 / vl);
          } else if (graze) {
            b.ricochets++;
            b.v.addScaledVector(n, -2 * b.v.dot(n)).multiplyScalar(0.45 + Math.random() * 0.15);
            b.v.x += (Math.random() - 0.5) * 0.12 * vl;
            b.v.y += Math.random() * 0.1 * vl;
            b.v.z += (Math.random() - 0.5) * 0.12 * vl;
            b.p.addScaledVector(n, 0.01);
          } else b.alive = false;
        }
      }
      b.hist.push(b.p.clone());
      if (b.hist.length > 6) b.hist.shift();
      if (b.alive && (b.t > 4 || b.p.y < -3 || b.v.length() < 50)) b.alive = false;
    }
  }
};

// ==== engine/reticle.js
const THREE7 = window.THREE;
// Прицельные сетки. Каждая сетка — набор примитивов в угловых минутах (MOA), ось y — вниз.
// Подсвечиваемые элементы (ill) рисуются цветом подсветки, остальные — «гравировка» (чёрные).
// Сетки BDC строятся по реальной баллистике текущего патрона: ctx.hold(R) → поправка в MOA.
// Один набор примитивов → два рендера: текстура в линзе (коллиматоры, 1×) и SVG поверх
// изображения оптики (увеличение > 1,5×), где масштаб честный — 1 MOA на экране = 1 MOA в мире.
var TH = 3.6;
var MIL = 3.4377;
var MAN_W = 0.48;
var RET_COLORS = [
  { id: "red", hex: "#ff2a1a", name: "красная" },
  { id: "green", hex: "#38ff5a", name: "зелёная" },
  { id: "amber", hex: "#ff8a1a", name: "янтарная" },
  {id:"blue",hex:"#45bfff",name:"синяя"},{id:"yellow",hex:"#fff04a",name:"жёлтая"},{id:"white",hex:"#ffffff",name:"белая"}
];
var BLACK = "#0b0b0b";
// примитивы: L — отрезок, C — окружность, A — дуга, D — точка, P — ломаная, T — надпись, G — группа
// с минимальным экранным размером (прицельная марка не должна превращаться в пиксель)
var L = (x1, y1, x2, y2, w, ill = false) => ["L", x1, y1, x2, y2, w, ill];
var C = (x, y, r, w, ill = false) => ["C", x, y, r, w, ill];
var ARC = (x, y, r, a0, a1, w, ill = false) => ["A", x, y, r, a0, a1, w, ill];
var D = (x, y, r, ill = true) => ["D", x, y, r, ill];
var P = (pts, w, ill = false) => ["P", pts, w, ill];
// top — привязка по верхнему краю: подпись не наезжает на линию при минимальном размере шрифта
var TX = (x, y, s, str, ill = false, anchor = "start", top = false) => ["T", x, y, s, str, ill, anchor, top];
var G = (x, y, minPx, sizeMoa, items) => ["G", x, y, minPx, sizeMoa, items];
var chev = (x, y, w, h, lw, ill = true) => P([[x - w / 2, y + h], [x, y], [x + w / 2, y + h]], lw, ill);
function bdc(ctx, ranges) {
  return ranges.map((R) => ({ R, h: ctx.hold?.(R) })).filter((b) => b.h != null && isFinite(b.h) && b.h > 0.3);
}
var RETICLES = {
  // ---------------- коллиматоры
  dot2: { name: "Точка 2 MOA", field: 16, boost: 3.4, build: () => [D(0, 0, 1)] },
  dot1: { name: "Точка 1 MOA", field: 16, boost: 2.4, build: () => [D(0, 0, 0.5)] },
  cdot: { name: "Кольцо 65 MOA + точка", field: 72, boost: 1.2, build: () => [C(0, 0, 32.5, 1, true), D(0, 0, 1)] },
  cross: { name: "Перекрестие с точкой", field: 24, boost: 2.2, build: () => [L(-10, 0, -2.2, 0, 0.6, true), L(2.2, 0, 10, 0, 0.6, true), L(0, -10, 0, -2.2, 0.6, true), L(0, 2.2, 0, 10, 0.6, true), D(0, 0, 0.5)] },
  eotech: {
    name: "Кольцо 68 MOA + точка",
    field: 96,
    boost: 1.25,
    build: () => [C(0, 0, 34, 1.4, true), ...[0, 90, 180, 270].map((a) => {
      const r = a * Math.PI / 180;
      return L(Math.cos(r) * 34, Math.sin(r) * 34, Math.cos(r) * 29, Math.sin(r) * 29, 1.4, true);
    }), D(0, 0, 0.6)]
  },
  eotech2: {
    name: "Кольцо + две точки (EXPS3-2)",
    field: 96,
    boost: 1.25,
    build: (ctx) => {
      const h = ctx.hold?.(ctx.far || 200) ?? 7;
      return [C(0, 0, 34, 1.4, true), L(0, -34, 0, -29, 1.4, true), L(-34, 0, -29, 0, 1.4, true), L(34, 0, 29, 0, 1.4, true), D(0, 0, 0.6), D(0, Math.min(28, Math.max(3, h)), 0.6)];
    }
  },
  kobra: { name: "Угольник с точкой", field: 60, boost: 1.25, build: () => [chev(0, 1, 24, 7, 1.2), D(0, -3, 1.3), L(0, -22, 0, -12, 1.2, true)] },
  kobraChev: { name: "Угольник", field: 60, boost: 1.25, build: () => [chev(0, 0, 24, 8, 1.3)] },
  kobraDot: { name: "Точка 3 MOA", field: 60, boost: 1.4, build: () => [D(0, 0, 1.5)] },
  kobraCross: { name: "Разорванное перекрестие", field: 60, boost: 1.25, build: () => [L(-20, 0, -5, 0, 1.2, true), L(5, 0, 20, 0, 1.2, true), L(0, 5, 0, 20, 1.2, true), D(0, 0, 1)] },
  // ---------------- призма ACOG TA31: марка + шкала BDC, ширина рисок = 19" (ширина плеч) на дальности
  acogChev: { name: "Шеврон + BDC", field: 60, mag: true, build: (ctx) => [...acogLadder(ctx), G(0, 0, 18, 4, [chev(0, 0, 4, 2.6, 0.5)])] },
  acogCross: { name: "Перекрестие + BDC", field: 60, mag: true, build: (ctx) => [L(-30, 0, -2, 0, 0.35), L(2, 0, 30, 0, 0.35), L(0, -30, 0, -2, 0.35), ...acogLadder(ctx), G(0, 0, 8, 1, [D(0, 0, 0.5)])] },
  acogHorse: { name: "Подкова + точка", field: 60, mag: true, build: (ctx) => [...acogLadder(ctx), G(0, 0, 26, 8, [ARC(0, 0, 4, -0.15 * Math.PI, 1.15 * Math.PI, 0.45, true), D(0, 0, 0.45)])] },
  acogDot: { name: "Точка + BDC", field: 60, mag: true, build: (ctx) => [...acogLadder(ctx), G(0, 0, 7, 1, [D(0, 0, 0.5)])] },
  // ---------------- LPVO
  lpvo: { name: "Кольцо-точка + дуплекс", field: 140, mag: true, build: () => [...duplex(34, 70, 0.9, 0.4, 10), ...[1, 2, 3, 4].map((i) => L(-2.5, i * 6, 2.5, i * 6, 0.35)), G(0, 0, 40, 36, [C(0, 0, 18, 1.1, true), D(0, 0, 1)])] },
  lpvoDot: { name: "Дуплекс + точка", field: 140, mag: true, build: () => [...duplex(34, 70, 0.9, 0.4, 4), G(0, 0, 6, 1.2, [D(0, 0, 0.6)])] },
  lpvoBdc: {
    name: "Дуплекс + BDC",
    field: 140,
    mag: true,
    build: (ctx) => {
      const out = [...duplex(34, 70, 0.9, 0.4, 4).filter((p) => !(p[0] === "L" && p[2] === 4 && p[4] > 4)), L(0, 2, 0, 34, 0.35), G(0, 0, 6, 1.2, [D(0, 0, 0.6)])];
      for (const b of bdc(ctx, [200, 300, 400, 500, 600])) {
        if (b.h > 33) continue;
        const w = MAN_W / b.R * 3437.7 / 2;
        out.push(L(-w, b.h, w, b.h, 0.35), TX(w + 1, b.h + 1.2, 3, String(b.R / 100)));
      }
      return out;
    }
  },
  // ---------------- ПСО-1: шкала боковых поправок в тысячных, угольник, три нижних угольника
  // (1100/1200/1300 м при барабане на «10»), дальномерная шкала под рост 1,7 м.
  pso1: { name: "Угольник ПСО-1", field: 90, mag: true, build: (ctx) => [...psoBase(ctx), G(0, 0, 22, 5, [chev(0, 0, 3 * 1.6, 3 * 1.1, 0.55)]), ...psoLower(ctx)] },
  psoDot: { name: "ПСО-1 с точкой", field: 90, mag: true, build: (ctx) => [...psoBase(ctx), G(0, 0, 8, 1.2, [D(0, 0, 0.6)]), ...psoLower(ctx)] },
  psoCross: {
    name: "Перекрестие в тысячных",
    field: 90,
    mag: true,
    build: () => {
      const out = [L(-40, 0, -1.5, 0, 0.3), L(1.5, 0, 40, 0, 0.3), L(0, -40, 0, -1.5, 0.3), L(0, 1.5, 0, 40, 0.3)];
      for (let i = -10; i <= 10; i++) if (i) out.push(L(i * TH, -(i % 5 ? 0.8 : 1.6), i * TH, i % 5 ? 0.8 : 1.6, 0.3), L(-(i % 5 ? 0.8 : 1.6), i * TH, i % 5 ? 0.8 : 1.6, i * TH, 0.3));
      out.push(G(0, 0, 6, 1, [D(0, 0, 0.45)]));
      return out;
    }
  },
  // ---------------- оптика
  mil: {
    name: "Mil-Dot",
    field: 360,
    mag: true,
    build: () => {
      const out = duplex(5 * MIL, 180, 2.4, 0.3, 0);
      for (let i = -4; i <= 4; i++) if (i) out.push(D(i * MIL, 0, 0.35, false), D(0, i * MIL, 0.35, false));
      out.push(G(0, 0, 5, 0.6, [D(0, 0, 0.3)]));
      return out;
    }
  },
  duplex: { name: "Дуплекс", field: 360, mag: true, build: () => [...duplex(5 * MIL, 180, 2.4, 0.3, 0), G(0, 0, 5, 0.6, [D(0, 0, 0.3)])] },
  milTree: {
    name: "Ёлочка (поправки на дальность)",
    field: 360,
    mag: true,
    build: (ctx) => {
      const out = duplex(8 * MIL, 180, 2.4, 0.25, 0);
      for (let i = -8; i <= 8; i++) if (i) out.push(L(i * MIL, -(i % 2 ? 0.6 : 1.2), i * MIL, i % 2 ? 0.6 : 1.2, 0.25));
      for (const b of bdc(ctx, [200, 300, 400, 500, 600, 700, 800])) {
        if (b.h > 8 * MIL) continue;
        const w = MAN_W / b.R * 3437.7 / 2;
        out.push(L(-w, b.h, w, b.h, 0.25), TX(w + 0.8, b.h + 0.8, 2, String(b.R / 100)));
      }
      out.push(G(0, 0, 5, 0.6, [D(0, 0, 0.3)]));
      return out;
    }
  },
  milDot: { name: "Тонкое перекрестие + точка", field: 360, mag: true, build: () => [L(-180, 0, -1.2, 0, 0.2), L(1.2, 0, 180, 0, 0.2), L(0, -180, 0, -1.2, 0.2), L(0, 1.2, 0, 180, 0.2), G(0, 0, 6, 0.8, [D(0, 0, 0.4)])] }
};
function duplex(inner, outer, thick, thin, gap) {
  const out = [];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
    out.push(L(dx * inner, dy * inner, dx * outer, dy * outer, thick));
    out.push(L(dx * gap, dy * gap, dx * inner, dy * inner, thin));
  }
  return out;
}
function acogLadder(ctx) {
  const out = [];
  let bs = bdc(ctx, [300, 400, 500, 600, 700, 800]).filter((b) => b.h < 28);
  // пистолетный патрон падает круче — шкала уходит за поле, строим её на ближние дистанции
  if (bs.length < 3) bs = bdc(ctx, [150, 200, 250, 300, 350]).filter((b) => b.h < 28);
  const bottom = bs.length ? bs[bs.length - 1].h + 2 : 20;
  out.push(L(0, 2.4, 0, bottom, 0.3));
  for (const b of bs) {
    const w = MAN_W / b.R * 3437.7 / 2;
    out.push(L(-w, b.h, w, b.h, 0.3), TX(w + 0.9, b.h + 0.9, 2.2, String(b.R / 100).replace(".", ",")));
  }
  return out;
}
function psoBase(ctx) {
  const out = [L(-10 * TH, 0, -1.4 * TH, 0, 0.6, true), L(1.4 * TH, 0, 10 * TH, 0, 0.6, true)];
  for (let i = -10; i <= 10; i++) if (i) out.push(L(i * TH, 0, i * TH, -(i % 5 ? 0.9 : 1.8), 0.3));
  // дальномер: цель ростом 1,7 м между горизонталью и кривой; риски 2…10 (сотни метров)
  const x0 = -12.5 * TH, y0 = 6 * TH, W = 9 * TH;
  const curve = [];
  for (let i = 0; i <= 20; i++) {
    const R = 200 + i * 40;
    curve.push([x0 + i / 20 * W, y0 - 1.7 / R * 3437.7]);
  }
  out.push(L(x0, y0, x0 + W, y0, 0.3), P(curve, 0.3));
  for (const n of [2, 4, 6, 8, 10]) out.push(TX(x0 + (n * 100 - 200) / 800 * W, y0 + 0.9, 1.9, String(n), false, "middle", true));
  return out;
}
function psoLower(ctx) {
  const base = ctx.hold?.(1e3);
  const out = [];
  [1100, 1200, 1300].forEach((R, i) => {
    const h = ctx.hold?.(R);
    const y = base != null && h != null ? h - base : (i + 1) * 2.2 * TH;
    out.push(G(0, y, 12, 3.5, [chev(0, y, 3.4, 2.4, 0.45)]));
  });
  return out;
}
// Наборы сеток по типу прицела (ключ — reticle у прицела); G переключает внутри набора
var RET_SETS = {
  dot: ["dot2", "dot1", "cdot", "cross"],
  holo: ["eotech", "eotech2", "dot2", "cross"],
  kobra: ["kobra", "kobraChev", "kobraDot", "kobraCross"],
  chevron: ["acogChev", "acogCross", "acogHorse", "acogDot"],
  lpvo: ["lpvo", "lpvoDot", "lpvoBdc"],
  pso1: ["pso1", "psoDot", "psoCross"],
  mil: ["mil", "duplex", "milTree", "milDot"]
};
var RET_DEFAULT_COLOR = { pso1: "amber" };
function reticleSet(kind) {
  return RET_SETS[kind] || [kind in RETICLES ? kind : "dot2"];
}
function colorHex(id) {
  return (RET_COLORS.find((c) => c.id === id) || RET_COLORS[0]).hex;
}
// ------------------------------------------------------------------ canvas (текстура в линзе)
function drawPrims(g, prims, u, c, col, glowK) {
  const X = (x) => c + x * u, Y = (y) => c + y * u;
  for (const p of prims) {
    const t = p[0];
    if (t === "G") {
      drawPrims(g, p[5], u, c, col, glowK);
      continue;
    }
    const ill = t === "D" ? p[4] : t === "T" ? p[5] : t === "P" ? p[3] : t === "A" ? p[7] : p[p.length - 1];
    const cc = ill ? col : BLACK;
    g.save();
    g.strokeStyle = g.fillStyle = cc;
    g.lineCap = "round";
    g.lineJoin = "round";
    if (ill) {
      g.shadowColor = col;
      g.shadowBlur = glowK * u;
    }
    if (t === "L") {
      g.lineWidth = Math.max(1, p[5] * u);
      g.beginPath();
      g.moveTo(X(p[1]), Y(p[2]));
      g.lineTo(X(p[3]), Y(p[4]));
      g.stroke();
    } else if (t === "C" || t === "A") {
      g.lineWidth = Math.max(1, (t === "C" ? p[4] : p[6]) * u);
      g.beginPath();
      if (t === "C") g.arc(X(p[1]), Y(p[2]), p[3] * u, 0, Math.PI * 2);
      else g.arc(X(p[1]), Y(p[2]), p[3] * u, p[4], p[5]);
      g.stroke();
    } else if (t === "D") {
      const rr = Math.max(0.8, p[3] * u);
      if (ill && glowK > 1) {
        /* светящаяся точка коллиматора: ореол рассеяния, насыщенная точка и почти белое ядро
           (так выглядит пересвеченный светодиод в стекле днём) */
        g.shadowBlur = 0;
        const hg = g.createRadialGradient(X(p[1]), Y(p[2]), rr * 0.6, X(p[1]), Y(p[2]), rr * 2.6);
        hg.addColorStop(0, col + "88"); hg.addColorStop(1, col + "00");
        g.fillStyle = hg; g.beginPath(); g.arc(X(p[1]), Y(p[2]), rr * 2.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = col; g.shadowColor = col; g.shadowBlur = rr * 0.8;
        g.beginPath(); g.arc(X(p[1]), Y(p[2]), rr, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0; g.fillStyle = hotCore(col);
        g.beginPath(); g.arc(X(p[1]), Y(p[2]), rr * 0.45, 0, Math.PI * 2); g.fill();
      } else {
        g.beginPath();
        g.arc(X(p[1]), Y(p[2]), rr, 0, Math.PI * 2);
        g.fill();
      }
    } else if (t === "P") {
      g.lineWidth = Math.max(1, p[2] * u);
      g.beginPath();
      p[1].forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)));
      g.stroke();
    } else if (t === "T") {
      g.font = `600 ${Math.max(8, p[3] * u)}px sans-serif`;
      g.textAlign = p[6] === "middle" ? "center" : "left";
      g.textBaseline = p[7] ? "top" : "alphabetic";
      g.fillText(p[4], X(p[1]), Y(p[2]));
    }
    g.restore();
  }
}
var texCache = /* @__PURE__ */ new Map();
function reticleTexture(id, colorId, ctx = {}) {
  const def = RETICLES[id] || RETICLES.dot2;
  const prims = def.build(ctx);
  const key = id + "|" + colorId + "|" + JSON.stringify(prims).length + "|" + (ctx.key || "");
  if (texCache.has(key)) return texCache.get(key);
  const s = 512, cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d", { willReadFrequently: true });
  drawPrims(g, prims, s / def.field, s / 2, colorHex(colorId), def.mag ? 0.4 : 1.4);
  const t = new THREE7.CanvasTexture(cv);
  t.colorSpace = THREE7.SRGBColorSpace;
  texCache.set(key, t);
  if (texCache.size > 48) {
    const k0 = texCache.keys().next().value;
    texCache.get(k0).dispose();
    texCache.delete(k0);
  }
  return t;
}
function reticleMesh(kind, sight, ref, dist = 6e4) {
  const m = new THREE7.Mesh(new THREE7.PlaneGeometry(1, 1), new THREE7.MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    stencilWrite: true,
    stencilRef: ref,
    stencilFunc: THREE7.EqualStencilFunc,
    stencilFail: THREE7.KeepStencilOp,
    stencilZFail: THREE7.KeepStencilOp,
    stencilZPass: THREE7.KeepStencilOp
  }));
  m.rotation.y = -Math.PI / 2;
  m.position.set(dist, sight.y, sight.z || 0);
  m.renderOrder = 12;
  m.frustumCulled = false;
  m.userData.reticle = true;
  m.userData.dist = dist;
  /* минимальный экранный размер точки: на 1080p точка 2 MOA меньше пикселя и тонет
     в фильтрации текстуры; глаз же видит яркий светодиод всегда. Для сеток «только точка»
     марка масштабируется так, чтобы радиус был не меньше ~2,4 px экрана */
  m.onBeforeRender = (r, sc, cam) => {
    const u = m.userData;
    if (!u.dotR || !cam.isPerspectiveCamera) return;
    const rs = globalThis.AEGIS_RS || 1, hpx = (r.domElement.height || 1080) * rs, dpr = (r.getPixelRatio ? r.getPixelRatio() : 1) * rs;
    const ppu = hpx / (cam.fov * 60), px = u.dotR * ppu, want = 2.4 * dpr;
    const k = px < want ? Math.min(6, want / px) : 1;
    if (Math.abs(k - (u.k || 1)) > 1e-3) {
      u.k = k;
      m.scale.set(u.baseSize * k, u.baseSize * k, 1);
      m.updateMatrixWorld(true);
      m.modelViewMatrix.multiplyMatrices(cam.matrixWorldInverse, m.matrixWorld);
      m.normalMatrix.getNormalMatrix(m.modelViewMatrix);
    }
  };
  const id = reticleSet(kind)[0];
  reticleApply(m, id, RET_DEFAULT_COLOR[kind] || "red", {});
  return m;
}
// Сменить сетку/цвет у уже созданной марки в линзе
function reticleApply(m, id, colorId, ctx) {
  const def = RETICLES[id] || RETICLES.dot2;
  const size = def.field * 0.2909 * (m.userData.dist / 1e3) * (def.boost || 1);
  m.scale.set(size, size, 1);
  m.userData.baseSize = size; m.userData.k = 1;
  const prims = def.mag ? null : def.build(ctx || {});
  const dotOnly = prims && prims.length && prims.every((q) => q[0] === "D");
  m.userData.dotR = dotOnly ? Math.max(...prims.map((q) => q[3])) * (def.boost || 1) : 0;
  const mat = m.material;
  mat.map = reticleTexture(id, colorId, ctx);
  // обычное смешивание и для коллиматоров: при сложении красная марка пропадала на светлом фоне
  // (тир, небо); настоящий светодиод ярче фона, поэтому марка непрозрачная
  mat.blending = THREE7.NormalBlending;
  mat.needsUpdate = true;
}
// ------------------------------------------------------------------ SVG (поверх изображения оптики)
// ppu — пикселей на угловую минуту; W, H — размер экрана. Мелкие элементы не тоньше 1 px.
function hotCore(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  const m = (v) => Math.round(v + (255 - v) * 0.72);
  return "#" + [m(r), m(g), m(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function reticleSVG(id, o = {}) {
  const def = RETICLES[id] || RETICLES.dot2;
  const ppu = o.ppu || 2, W = o.W || innerWidth, H = o.H || innerHeight;
  const col = colorHex(o.color || "red");
  const prims = def.build(o.ctx || {});
  const vb = [-W / 2 / ppu, -H / 2 / ppu, W / ppu, H / ppu].map((v) => v.toFixed(3)).join(" ");
  const px = (v) => (v / ppu).toFixed(4);
  const out = [];
  const emit = (ps, k, ax, ay) => {
    const tx = (x) => ((ax + (x - ax) * k) || 0).toFixed(3), ty = (y) => ((ay + (y - ay) * k) || 0).toFixed(3);
    for (const p of ps) {
      const t = p[0];
      if (t === "G") {
        const kk = Math.max(1, p[3] / (p[4] * ppu));
        emit(p[5], kk * k, ax + (p[1] - ax) * k, ay + (p[2] - ay) * k);
        continue;
      }
      const ill = t === "D" ? p[4] : t === "T" ? p[5] : t === "P" ? p[3] : t === "A" ? p[7] : p[p.length - 1];
      const c = ill ? col : BLACK;
      const f = ill ? ' filter="url(#gl)"' : "";
      const sw = (w) => Math.max(w * k, (ill ? 1.6 : 1.1) / ppu).toFixed(4);
      if (t === "L") out.push(`<line x1="${tx(p[1])}" y1="${ty(p[2])}" x2="${tx(p[3])}" y2="${ty(p[4])}" stroke="${c}" stroke-width="${sw(p[5])}" stroke-linecap="round"${f}/>`);
      else if (t === "C") out.push(`<circle cx="${tx(p[1])}" cy="${ty(p[2])}" r="${(p[3] * k).toFixed(3)}" fill="none" stroke="${c}" stroke-width="${sw(p[4])}"${f}/>`);
      else if (t === "A") {
        const r = p[3] * k, x0 = +tx(p[1]) + Math.cos(p[4]) * r, y0 = +ty(p[2]) + Math.sin(p[4]) * r, x1 = +tx(p[1]) + Math.cos(p[5]) * r, y1 = +ty(p[2]) + Math.sin(p[5]) * r;
        out.push(`<path d="M${x0.toFixed(3)} ${y0.toFixed(3)} A${r.toFixed(3)} ${r.toFixed(3)} 0 ${p[5] - p[4] > Math.PI ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}" fill="none" stroke="${c}" stroke-width="${sw(p[6])}" stroke-linecap="round"${f}/>`);
      } else if (t === "D") {
        const rr = Math.max(p[3] * k, (o.hot && ill ? o.minDot || 2.4 : 1.3) / ppu);
        if (o.hot && ill) {
          /* яркий коллиматор: насыщенный ореол + цветная марка + перенасыщенная сердцевина (как светодиод при дневной яркости) */
          out.push(`<circle cx="${tx(p[1])}" cy="${ty(p[2])}" r="${(rr * 2.6).toFixed(4)}" fill="${c}" opacity=".35" filter="url(#gl2)"/>`);
          out.push(`<circle cx="${tx(p[1])}" cy="${ty(p[2])}" r="${rr.toFixed(4)}" fill="${c}"${f}/>`);
          out.push(`<circle cx="${tx(p[1])}" cy="${ty(p[2])}" r="${(rr * 0.5).toFixed(4)}" fill="${hotCore(c)}"/>`);
        } else out.push(`<circle cx="${tx(p[1])}" cy="${ty(p[2])}" r="${rr.toFixed(4)}" fill="${c}"${f}/>`);
      }
      else if (t === "P") out.push(`<path d="${p[1].map(([x, y], i) => (i ? "L" : "M") + tx(x) + " " + ty(y)).join(" ")}" fill="none" stroke="${c}" stroke-width="${sw(p[2])}" stroke-linecap="round" stroke-linejoin="round"${f}/>`);
      else if (t === "T") out.push(`<text x="${tx(p[1])}" y="${ty(p[2])}" font-size="${Math.max(p[3] * k, 7.5 / ppu).toFixed(3)}" font-family="sans-serif" font-weight="600" fill="${c}" text-anchor="${p[6] === "middle" ? "middle" : "start"}"${p[7] ? ' dominant-baseline="hanging"' : ""}>${p[4]}</text>`);
    }
  };
  emit(prims, 1, 0, 0);
  return `<svg viewBox="${vb}" width="${W}" height="${H}" style="position:absolute;left:0;top:0"><defs><filter id="gl2" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${px(2.2)}"/></filter><filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${px(o.hot ? 0.8 : 1.1)}"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${out.join("")}</svg>`;
}

// ==== engine/ui.js
var STATS = [
  { k: "weight", l: "Масса", u: "кг", f: (v) => (v / 1e3).toFixed(2), better: -1 },
  { k: "length", l: "Длина", u: "мм", f: (v) => Math.round(v), better: -1 },
  { k: "ergo", l: "Эргономика", f: (v) => Math.round(v), better: 1, bar: 100 },
  { k: "recoilV", l: "Отдача вертикальная", f: (v) => Math.round(v), better: -1, bar: 160 },
  { k: "recoilH", l: "Отдача горизонтальная", f: (v) => Math.round(v), better: -1, bar: 160 },
  { k: "moa", l: "Кучность", u: "MOA", f: (v) => v.toFixed(1), better: -1 },
  { k: "velocity", l: "Начальная скорость", u: "м/с", f: (v) => Math.round(v), better: 1 },
  { k: "loud", l: "Громкость выстрела", u: "дБ", f: (v) => Math.round(v), better: -1 },
  { k: "flash", l: "Заметность вспышки", f: (v) => Math.max(0, Math.round(v)), better: -1, bar: 100 },
  { k: "adsTime", l: "Вскидка", u: "мс", f: (v) => Math.round(v), better: -1 },
  { k: "mag", l: "Магазин", u: "патр.", f: (v) => Math.round(v), better: 1 }
];
var CHIP = { "recoilV%": "отдача", "recoilH%": "увод", ergo: "эрг.", loud: "дБ", weight: "г", adsTime: "мс", flash: "вспышка", moa: "MOA", velocity: "м/с", mag: "патр.", length: "мм" };
var CHIP_BETTER = { "recoilV%": -1, "recoilH%": -1, ergo: 1, loud: -1, weight: -1, adsTime: -1, flash: -1, moa: -1, velocity: 1, mag: 1, length: -1 };
var MODE = { safe: "ПРЕДОХР.", semi: "ОДИНОЧНЫЙ", auto: "АВТО", burst: "ОЧЕРЕДЬ", pump: "ПОМПА" };
var el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
var esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
var UI = class {
  constructor(app) {
    this.app = app;
    this.open = null;
    const d = app.def;
    const root = this.root = el("div", "ui");
    document.body.appendChild(root);
    const left = el("div", "col-left");
    this.card = el("div", "panel card", `<div class="c-name">${esc(d.short || d.title)}</div><div class="c-sub">${esc(d.title)} · ${esc(d.caliber)}</div>
      <div class="c-spec">${(d.specs || []).map(([a, b]) => `<span>${esc(a)}</span><b>${esc(b)}</b>`).join("")}</div>`);
    this.stats = el("div", "panel stats");
    left.append(this.card, this.stats);
    this.mods = el("div", "panel mods");
    this.modsHead = el("div", "m-head", `<span>Модификация</span>`);
    const reset = el("button", "btn ghost sm", "Сброс");
    reset.onclick = () => {
      this.open = null;
      app.resetCfg();
    };
    this.modsHead.appendChild(reset);
    this.modsBody = el("div", "m-body");
    this.mods.append(this.modsHead, this.modsBody);
    const modsToggle = this.modsToggle = el("button", "btn mods-toggle", "Модификация");
    modsToggle.onclick = () => root.classList.toggle("show-mods");
    this.ammo = el("div", "panel ammo");
    this.bar = el("div", "panel bar");
    this.help = el("div", "panel help", `<div class="h-t">Управление</div>
      <div><kbd>Пробел</kbd>огонь (в прицеле — ЛКМ)</div><div><kbd>ПКМ</kbd><kbd>F</kbd>прицелиться</div>
      <div><kbd>R</kbd>перезарядка</div><div><kbd>X</kbd>режим огня</div><div><kbd>СКМ</kbd>сменить прицел</div>
      <div><kbd>N</kbd>откинуть увеличитель</div><div><kbd>Колесо</kbd>кратность / зум</div>
      <div><kbd>G</kbd>сменить прицельную сетку</div><div><kbd>Shift</kbd><kbd>G</kbd>цвет подсветки сетки</div><div><kbd>Y</kbd>трасса пули: след / трассер / выкл</div>
      <div><kbd>${__AB.L}</kbd>фонарь (основной)</div><div><kbd>Shift</kbd><kbd>${__AB.L}</kbd>второй фонарь</div><div><kbd>${__AB.Z}</kbd>ЛЦУ (основной)</div><div><kbd>Shift</kbd><kbd>${__AB.Z}</kbd>второй ЛЦУ</div><div><kbd>U</kbd>заменить батареи</div><div><kbd>P</kbd>день / ночь (свет в тире)</div><div><kbd>Q</kbd>качество: авто / высокое / среднее / низкое</div><div><kbd>B</kbd>сошки</div><div><kbd>K</kbd>приклад</div>
      <div><kbd>O</kbd>${esc(d.chargeLabel || "затвор")}</div>${d.feed === "tube" ? "" : "<div><kbd>M</kbd>магазин</div>"}<div><kbd>H</kbd>эта подсказка</div>
      <div class="h-n">Клик по детали — открыть её слот. Перетаскивание — вращение, колесо — масштаб.</div>`);
    this.helpBtn = el("button", "btn help-btn", "?");
    this.helpBtn.title = "Управление (H)";
    this.helpBtn.onclick = () => this.toggleHelp();
    this.toastEl = el("div", "toast");
    this.tipEl = el("div", "tip");
    this.scopeEl = el("div", "scope", '<div class="s-ret"></div>');
    this.nvEl = el("div", "nv-ov");
    this.adsHint = el("div", "ads-hint");
    this.shotEl = el("div", "shot-info");
    const bottom = el("div", "bottom");
    bottom.append(this.ammo, this.bar, modsToggle, this.helpBtn);
    root.append(left, this.mods, bottom, this.help, this.toastEl, this.tipEl, this.nvEl, this.scopeEl, this.adsHint, this.shotEl);
    this.buildBar();
    if (innerWidth > 900) root.classList.add("show-mods");
  }
  /* --------------------------------------------------------------- панель */
  buildBar() {
    const a = this.app;
    const b = (id, label, fn, cls = "") => {
      const e = el("button", "btn " + cls, label);
      e.dataset.id = id;
      e.addEventListener("click", (ev) => {
        ev.preventDefault();
        a.audio.init();
        fn();
      });
      this.bar.appendChild(e);
      return e;
    };
    this.fireBtn = b("fire", "Огонь", () => {
    }, "fire");
    this.fireBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      a.triggerDown();
    });
    this.fireBtn.addEventListener("pointerup", () => a.triggerUp());
    this.fireBtn.addEventListener("pointerleave", () => a.triggerUp());
    this.btn = {
      reload: b("reload", a.def.feed === "tube" ? "Зарядить" : "Перезарядка", a.reload),
      mode: b("mode", "Режим", a.cycleMode),
      ads: b("ads", "Прицел", () => a.setADS(!a.st.ads)),
      sight: b("sight", "Сменить прицел", a.cycleSight),
      mag3: b("mag3", "Увеличитель", () => a.toggleMagnifier()),
      reticle: b("reticle", "Сетка", a.cycleReticle),
      light: b("light", "Фонарь", () => a.toggleLight("main")),
      light2: b("light2", "Фонарь 2", () => a.toggleLight(1)),
      laser: b("laser", "ЛЦУ", () => a.toggleLaser("main")),
      laser2: b("laser2", "ЛЦУ 2", () => a.toggleLaser(1)),
      trace: b("trace", "Трасса", a.cycleTrace),
      bipod: b("bipod", "Сошки", a.toggleBipod),
      fold: b("fold", "Приклад", a.toggleFold),
      batt: b("batt", "Батареи", a.replaceBatteries),
      time: Object.assign(b("time", "День", a.cycleTime), { hidden: true }),
      sound: b("sound", "Звук", a.toggleSound, "icon")
    };
  }
  refresh() {
    this.renderMods();
    this.renderStats();
    this.hud();
  }
  slotAvailable(slot2) {
    const asm = this.app.asm;
    if (slot2.rails) return slot2.rails.some((r) => asm.mounts.has(r));
    return asm.mounts.has(slot2.mount);
  }
  // Можно ли поставить модуль сейчас; иначе — причина.
  canPut(slot2, part) {
    const asm = this.app.asm, cfg = this.app.cfg;
    if (part.needs && !part.needs(cfg, asm)) {
      if (part.cat === "magnifier") return "нужен коллиматор 1× с осью 39 мм";
      if (part.needsWhy) return part.needsWhy;
      return "несовместимо с текущей сборкой";
    }
    if (slot2.rails) {
      const ps = asm.railPositions(slot2, part, slot2.id);
      if (!ps.length) return part.mountTypes?.includes("dovetail") ? "нужен «ласточкин хвост»" : "нет подходящей планки";
      if (!ps.some((p) => !p.clash) && !asm.roomBehind(slot2, part)) return "мешает: " + ps[0].clash;
    }
    return null;
  }
  renderMods() {
    const { def, asm, cfg } = this.app;
    const body = this.modsBody;
    const scroll = body.scrollTop;
    body.innerHTML = "";
    const groups = /* @__PURE__ */ new Map();
    const hiddenSlots = [];
    for (const slot2 of def.slots) {
      const opts = asm.slotOptions(slot2);
      if (!opts.length) continue;
      if (!this.slotAvailable(slot2) && !slot2.via) {
        hiddenSlots.push(slot2.label);
        continue;
      }
      if (!groups.has(slot2.group)) groups.set(slot2.group, []);
      groups.get(slot2.group).push({ slot: slot2, opts });
    }
    for (const [g, list] of groups) {
      const ge = el("div", "m-group");
      ge.appendChild(el("div", "m-gt", esc(g)));
      for (const { slot: slot2, opts } of list) {
        const cur = cfg[slot2.id]?.id;
        const part = cur && asm.part(cur);
        const row = el("button", "m-row" + (this.open === slot2.id ? " open" : "") + (part ? "" : " empty"));
        row.innerHTML = `<span class="m-l">${esc(slot2.label)}</span><span class="m-v">${esc(part ? part.name : "нет")}</span><span class="m-c">${this.open === slot2.id ? "–" : "+"}</span>`;
        row.onclick = () => {
          this.open = this.open === slot2.id ? null : slot2.id;
          if (this.open) {
            this.app.focusSlot(slot2.id);
            this.app.prebuildSlot?.(slot2.id);
          }
          else this.app.unfocus();
          this.renderMods();
        };
        ge.appendChild(row);
        if (this.open === slot2.id) ge.appendChild(this.renderOptions(slot2, opts, cur));
      }
      body.appendChild(ge);
    }
    if (hiddenSlots.length) body.appendChild(el("div", "m-note", `Ещё слоты (${esc(hiddenSlots.join(", "))}) появятся после установки модулей с планками.`));
    body.scrollTop = scroll;
  }
  renderOptions(slot2, opts, cur) {
    const a = this.app;
    const box2 = el("div", "m-opts");
    const ri = cur && a.railInfo(slot2.id);
    if (ri && ri.n > 1) {
      const pos = el("div", "m-pos");
      const l = el("button", "btn sm", "◀"), r = el("button", "btn sm", "▶");
      const isStock = slot2.id === "stock";
      l.onclick = () => {
        a.railMove(slot2.id, isStock ? 1 : -1);
      };
      r.onclick = () => {
        a.railMove(slot2.id, isStock ? -1 : 1);
      };
      const label = isStock ? "Длина приклада" : "Положение на планке";
      const idx = isStock ? ri.n - ri.i : ri.i + 1;
      pos.append(el("span", "m-pl", label), l, el("b", "", `${idx} / ${ri.n}`), r);
      box2.appendChild(pos);
    }
    const item = (part) => {
      const on = (part ? part.id : null) === (cur || null);
      const why = part && !on ? this.canPut(slot2, part) : null;
      const e = el("button", "m-opt" + (on ? " on" : "") + (why ? " off" : ""));
      if (!part) {
        e.innerHTML = `<div class="o-n">Не устанавливать</div>`;
      } else {
        const chips = Object.entries(part.stats || {}).filter(([k, v]) => CHIP[k] && v && k !== "weight").slice(0, 4).map(([k, v]) => {
          const good = Math.sign(v) === CHIP_BETTER[k] || k === "mag";
          const txt = k.endsWith("%") ? `${v > 0 ? "+" : ""}${v}% ${CHIP[k]}` : `${v > 0 && k !== "mag" ? "+" : ""}${v} ${CHIP[k]}`;
          return `<i class="${k === "mag" ? "n" : good ? "g" : "b"}">${esc(txt)}</i>`;
        }).join("");
        const w = part.stats?.weight ? `<i class="n">${part.stats.weight} г</i>` : "";
        e.innerHTML = `<div class="o-n">${esc(part.name)}</div><div class="o-d">${esc(why ? "⚠ " + why : part.desc || "")}</div><div class="o-c">${chips}${w}</div>`;
      }
      e.disabled = !!why;
      if (part && !on) e.onpointerenter = () => a.prebuild?.(slot2.id, part.id);
      e.onclick = () => {
        if (!on) a.setPart(slot2.id, part ? part.id : null);
      };
      box2.appendChild(e);
    };
    if (!slot2.required) item(null);
    for (const p of opts) item(p);
    return box2;
  }
  renderStats() {
    const s = this.app.st.stats, b = this.app.defaultStats || s;
    this.stats.innerHTML = '<div class="s-t">Характеристики</div>' + STATS.filter((d) => s[d.k] != null && !Number.isNaN(s[d.k])).map((d) => {
      const v = s[d.k], v0 = b[d.k] ?? v, diff = v - v0;
      const cls = Math.abs(diff) < 1e-6 ? "" : Math.sign(diff) === d.better ? "g" : "b";
      const bar = d.bar ? `<div class="s-bar"><i style="width:${Math.max(2, Math.min(100, v / d.bar * 100))}%"></i></div>` : "";
      const dd = Math.abs(diff) < 1e-6 ? "" : `<em>${diff > 0 ? "+" : "−"}${d.f(Math.abs(diff))}</em>`;
      return `<div class="s-r ${cls}"><span>${d.l}</span><b>${d.f(v)}${d.u ? `<small> ${d.u}</small>` : ""}${dd}</b>${bar}</div>`;
    }).join("");
  }
  hud() {
    const a = this.app, st = a.st;
    const key = [
      st.mag,
      st.magIn,
      st.chambered,
      st.cap,
      st.mode,
      st.busy,
      st.holdOpen,
      st.spent,
      st.handleLocked,
      st.ads,
      st.sightIdx,
      st.zoom.toFixed(2),
      st.magAside,
      st.light,
      st.laser,
      a.time,
      a.battInfo().map((b) => b.pct + b.time + (b.on ? "*" : "")).join(","),
      st.trace,
      a.reticleInfo()?.id,
      a.reticleInfo()?.color,
      st.bipod,
      st.folded,
      a.audio.muted,
      a.sights.length,
      a.sights[st.sightIdx]?.label,
      a.asm.installed.size
    ].join("|");
    if (key === this.hudKey && this.lastStats === st.stats && this.hudCfg === a.cfg) return;
    this.hudKey = key;
    this.hudCfg = a.cfg;
    this.vo = null;
    const n = st.magIn ? st.mag : 0;
    const low = n + (st.chambered ? 1 : 0) <= Math.ceil(st.cap * 0.2);
    this.ammo.className = "panel ammo" + (low ? " low" : "");
    this.ammo.innerHTML = `<div class="a-n">${st.magIn ? n : "—"}${st.chambered ? "<sup>+1</sup>" : ""}<small>/${st.cap}</small></div>
      <div class="a-m"><b>${MODE[st.mode]}</b><span>${st.busy ? a.def.feed === "tube" ? "заряжание…" : "перезарядка…" : !st.magIn ? "нет магазина" : st.spent ? "передёрнуть цевьё" : !st.chambered ? "патронник пуст" : st.holdOpen ? a.def.id === "glock18c" ? "кожух на задержке" : "затвор на задержке" : st.handleLocked ? "рукоять в вырезе" : "готов"}</span></div>`;
    const bi = a.battInfo();
    // батареи: заряд и обратный отсчёт м:сс (у включённого идёт в реальном времени)
    if (bi.length) this.ammo.innerHTML += `<div class="a-batt">${bi.map((b) => `<div class="bt${b.on ? " on" : ""}${b.pct <= 15 ? " low" : ""}" title="${esc(b.slot)} · ${b.on ? "осталось" : "хватит на"} ${b.time} (${b.pct}%) · ${esc(b.keys)}"><span>${esc(b.label)}<kbd>${esc(b.keys)}</kbd></span><i><em style="width:${b.pct}%"></em></i><b>${b.time}<small>мин</small></b></div>`).join("")}</div>`;
    const B = this.btn;
    B.mode.textContent = MODE[st.mode];
    B.time.textContent = a.timeLabel();
    B.batt.hidden = !bi.length || bi.every((b) => b.pct >= 100);
    B.ads.classList.toggle("on", st.ads);
    const multi = a.sights.length > 1;
    B.sight.hidden = !multi;
    const mgPart = a.asm.installed.get("magnifier");
    B.mag3.hidden = !mgPart;
    if (mgPart) B.mag3.textContent = mgPart.info?.sight?.nv ? "ПНВ" : "Увеличитель";
    B.mag3.classList.toggle("on", !st.magAside);
    const em = a.emitterList();
    B.light.hidden = !em.lights.length;
    B.light.textContent = em.lights.length > 1 ? "Фонарь 1" : "Фонарь";
    B.light.classList.toggle("on", em.lights.length > 1 ? em.lights[0].on : st.light);
    B.light2.hidden = em.lights.length < 2;
    B.light2.classList.toggle("on", !!em.lights[1]?.on);
    B.laser.hidden = !em.lasers.length;
    B.laser.textContent = em.lasers.length > 1 ? "ЛЦУ 1" : "ЛЦУ";
    B.laser.classList.toggle("on", em.lasers.length > 1 ? em.lasers[0].on : st.laser);
    B.laser2.hidden = em.lasers.length < 2;
    B.laser2.classList.toggle("on", !!em.lasers[1]?.on);
    const ri = a.reticleInfo();
    B.reticle.hidden = !ri || ri.n < 2;
    if (ri) B.reticle.title = "Сетка: " + ri.name + " (G, Shift+G — цвет)";
    B.trace.textContent = st.trace === "tracer" ? "Трассеры" : st.trace === "off" ? "Трасса выкл" : "След пули";
    B.trace.classList.toggle("on", st.trace !== "off");
    B.bipod.hidden = !a.asm.withInfo("bipod").length;
    B.bipod.classList.toggle("on", st.bipod);
    B.fold.hidden = !a.asm.withInfo("fold").length;
    const slideStock = a.asm.withInfo("fold")[0]?.data.slide;
    B.fold.textContent = slideStock ? st.folded ? "Выдвинуть приклад" : "Задвинуть приклад" : st.folded ? "Разложить приклад" : "Сложить приклад";
    B.sound.textContent = a.audio.muted ? "Звук выкл" : "Звук вкл";
    B.sound.classList.toggle("off", a.audio.muted);
    B.reload.disabled = st.busy;
    const s = a.sights[st.sightIdx];
    const zm = s && !s.zoom ? st.zoomMul : 1, magNow = s ? (s.zoom ? st.zoom : s.mag * zm) : 1;
    this.adsHint.innerHTML = st.ads && s ? `<b>${esc(s.label)}</b>${s.zoom || s.mag > 1 || zm !== 1 ? ` · ${magNow.toFixed(magNow % 1 ? 1 : 0)}×` : ""}${ri ? ` · <i>${esc(ri.name)}</i>` : ""}<span>ЛКМ — огонь · ПКМ — выйти${multi ? " · колесо (нажатие) — другой прицел" : ""}${ri && ri.n > 1 ? " · G — сетка" : ""}${ri ? " · Shift+G — цвет" : ""} · колесо, +/− — ${s.zoom || s.mag > 1.2 ? "кратность" : "приближение"}</span>` : "";
    this.adsHint.classList.toggle("on", !!(st.ads && s));
    this.root.classList.toggle("ads", st.ads);
    if (this.lastStats !== st.stats) {
      this.lastStats = st.stats;
      this.renderStats();
    }
  }
  // Ночной монокуляр: зелёный люминофор, круглое поле зрения.
  nv(on) {
    if (on === this.nvOn) return;
    this.nvOn = on;
    document.body.classList.toggle("nv", on);
  }
  // Сетка оптики поверх изображения. Масштаб честный: ppu — пикселей на угловую минуту при текущем
  // поле зрения камеры. Сетка во второй фокальной плоскости (переменная кратность) откалибрована
  // на максимальной кратности; увеличитель увеличивает и марку коллиматора.
  scope(mag, ads, force) {
    const on = !!mag;
    if (force) this.scopeKey = null;
    if (on !== this.scopeOn) {
      this.scopeOn = on;
      this.scopeEl.classList.toggle("on", on);
      this.scopeKey = null;
    }
    if (!on) return;
    const ri = this.app.reticleInfo();
    if (!ri) {
      if (this.scopeKey !== "none") this.scopeEl.firstChild.innerHTML = "", this.scopeKey = "none";
      return;
    }
    const fov = this.app.S.camera.fov;
    let ppu = innerHeight / 2 / Math.tan(fov * Math.PI / 360) * Math.tan(Math.PI / 10800);
    const s = mag.s;
    if (!s.withMag && s.zoom) ppu *= s.zoom[1] / Math.max(1, mag.mag);
    const def = RETICLES[ri.id];
    if (def && !def.mag) ppu *= def.boost || 1;
    const key = [ri.id, ri.color, ppu.toFixed(3), innerWidth, innerHeight, ri.ctx.key].join("|");
    if (key === this.scopeKey) return;
    this.scopeKey = key;
    this.scopeEl.firstChild.innerHTML = reticleSVG(ri.id, { ppu, color: ri.color, ctx: ri.ctx, W: innerWidth, H: innerHeight });
  }
  // Итог последнего выстрела: дальность, время полёта, скорость и энергия у цели
  shot(h) {
    if (!h) return;
    const E = h.E >= 1e3 ? (h.E / 1e3).toFixed(2).replace(".", ",") + " кДж" : Math.round(h.E) + " Дж";
    const what = h.surf === "steel" ? "попадание в сталь" : "попадание в грунт";
    this.shotEl.innerHTML = `<b>${what}</b> ${h.dist.toFixed(1).replace(".", ",")} м · полёт ${(h.t * 1e3).toFixed(0)} мс · ${Math.round(h.v)} м/с · ${E}${h.pellets > 1 ? " (на дробину)" : ""}`;
    this.shotEl.classList.add("on");
    clearTimeout(this.shotT);
    this.shotT = setTimeout(() => this.shotEl.classList.remove("on"), 4e3);
  }
  openSlot(id) {
    this.root.classList.add("show-mods");
    this.open = id;
    this.app.focusSlot(id);
    this.app.prebuildSlot?.(id);
    this.renderMods();
    const r = this.modsBody.querySelector(".m-row.open");
    if (r) r.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  // Сдвиг центра кадра (px): середина между левой колонкой и меню.
  viewOffset() {
    const now = performance.now();
    if (this.vo && now - this.vo.t < 250 && this.vo.w === innerWidth) return this.vo.v;
    this.vo = { t: now, w: innerWidth, v: this.viewOffsetNow() };
    return this.vo.v;
  }
  viewOffsetNow() {
    if (innerWidth <= 900 || document.body.classList.contains("noui")) return 0;
    const cr = (document.getElementById("aeg-left") || this.card).getBoundingClientRect(), mr = this.mods.getBoundingClientRect();
    const l = cr.width ? cr.right : 0;
    const r = mr.width ? innerWidth - mr.left : 0;
    return (l - r) / 2;
  }
  toggleHelp() {
    this.help.classList.toggle("on");
  }
  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("on");
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toastEl.classList.remove("on"), 2200);
  }
  tip(text, x, y) {
    if (!text) {
      this.tipEl.classList.remove("on");
      return;
    }
    this.tipEl.textContent = text;
    this.tipEl.style.left = x + 14 + "px";
    this.tipEl.style.top = y + 14 + "px";
    this.tipEl.classList.add("on");
  }
};

// ==== engine/pip.js
// Картинка в оптике вне прицеливания (picture-in-picture): сцена рендерится с объектива в небольшую
// текстуру и выводится на окуляр вместе с сеткой. Выходной зрачок: при взгляде сбоку картинку
// закрывает тень кромки, как у настоящей оптики. Размер текстуры — по размеру окуляра на экране.
var PIP_VS = `
varying vec3 vP;
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
var PIP_FS = `
uniform sampler2D uImg, uRet;
uniform vec2 uC;
uniform float uR, uRetK, uHasRet, uGain, uLive;
uniform vec3 uCamL, uTint;
varying vec3 vP;
void main() {
  // координаты на окуляре: x — вправо (+z объекта), y — вверх; ±1 — кромка линзы
  vec2 q = vec2(vP.z - uC.y, vP.y - uC.x) / uR;
  float r = length(q);
  vec3 v = normalize(vP - uCamL);
  vec2 off = vec2(v.z, v.y) / max(v.x, 0.25);
  vec3 col = texture2D(uImg, 0.5 + 0.5 * q).rgb * uGain;
  if (uHasRet > 0.5) {
    vec2 ru = 0.5 + 0.5 * q * uRetK;
    if (ru.x > 0.0 && ru.x < 1.0 && ru.y > 0.0 && ru.y < 1.0) {
      vec4 rt = texture2D(uRet, ru);
      col = mix(col, rt.rgb * 1.6, rt.a);
    }
  }
  float pupil = length(q + off * 0.55);
  float vig = (1.0 - smoothstep(0.72, 1.02, pupil)) * (1.0 - smoothstep(0.93, 1.0, r));
  col *= mix(0.0, vig, uLive);
  // просветление: слабый цветной отблеск к краю стекла
  col += uTint * (0.015 + 0.05 * smoothstep(0.35, 1.0, r));
  ${HDR_SAFE("col")}
  gl_FragColor = vec4(col, 1.0);
}`;
var PipScope = class {
  constructor(renderer, scene) {
    this.R = renderer;
    this.scene = scene;
    this.cam = new THREE.PerspectiveCamera(8, 1, 0.02, 400);
    this.rt = null;
    this.size = 0;
    this.lens = null;
    this.frame = 0;
    this.every = 1;
    this.maxSize = 512;
    this._v = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._m = new THREE.Matrix4();
  }
  target(px) {
    // шаги по степеням двойки с запасом ×1,6 к размеру окуляра: без мерцания при уменьшении
    let n = 128;
    while (n < px * 1.6 && n < this.maxSize) n *= 2;
    if (n === this.size && this.rt) return this.rt;
    this.rt?.dispose();
    this.size = n;
    this.rt = new THREE.WebGLRenderTarget(n, n, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, samples: 0 });
    if (this.lens) this.lens.userData.pipMat.uniforms.uImg.value = this.rt.texture;
    return this.rt;
  }
  material(lens) {
    if (lens.userData.pipMat) return lens.userData.pipMat;
    const g = lens.geometry;
    g.computeBoundingBox();
    const b = g.boundingBox;
    const glass = lens.material;
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uImg: { value: null },
        uRet: { value: null },
        uC: { value: new THREE.Vector2((b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2) },
        uR: { value: Math.max(b.max.y - b.min.y, b.max.z - b.min.z) / 2 },
        uRetK: { value: 1 },
        uHasRet: { value: 0 },
        uGain: { value: 0.9 },
        uLive: { value: 0 },
        uCamL: { value: new THREE.Vector3() },
        uTint: { value: (glass.color || new THREE.Color(0.3, 0.4, 0.6)).clone().multiplyScalar(0.5) }
      },
      vertexShader: PIP_VS,
      fragmentShader: PIP_FS
    });
    for (const k of ["stencilWrite", "stencilRef", "stencilFunc", "stencilZPass"]) m[k] = glass[k];
    lens.userData.pipMat = m;
    lens.userData.glassMat = glass;
    return m;
  }
  // вернуть стекло: прицеливание, модуль снят, картинка не нужна
  release() {
    const l = this.lens;
    if (!l) return;
    if (l.userData.glassMat) l.material = l.userData.glassMat;
    if (this.hidRet) this.hidRet.visible = true;
    this.lens = null;
    this.hidRet = null;
  }
  // o: { lens, gun, pos, dir, up, fov, retTex, retK, retMesh, main }
  render(o, camera, H) {
    const { lens } = o;
    if (this.lens !== lens) {
      this.release();
      this.lens = lens;
      lens.material = this.material(lens);
      lens.material.uniforms.uImg.value = this.rt?.texture ?? null;
      lens.material.uniforms.uLive.value = 0;
    }
    if (o.retMesh && o.retMesh.visible) {
      o.retMesh.visible = false;
      this.hidRet = o.retMesh;
    }
    const u = lens.material.uniforms;
    u.uRet.value = o.retTex || null;
    u.uHasRet.value = o.retTex ? 1 : 0;
    u.uRetK.value = o.retK || 1;
    lens.updateWorldMatrix(true, false);
    u.uCamL.value.copy(camera.position).applyMatrix4(this._m.copy(lens.matrixWorld).invert());
    // окуляр на экране: размер в пикселях и видимость; сзади камеры или спереди прицела — не рисуем
    const c = this._c.set(0, u.uC.value.x, u.uC.value.y).applyMatrix4(lens.matrixWorld);
    const toLens = this._v.copy(c).sub(camera.position);
    const dist = toLens.length();
    if (toLens.dot(o.dir) <= 0) return false;
    const rWorld = u.uR.value * lens.matrixWorld.getMaxScaleOnAxis();
    const px = rWorld / Math.max(1e-4, dist) / Math.tan(camera.fov * Math.PI / 360) * H;
    const ndc = c.clone().project(camera);
    if (ndc.z > 1 || Math.abs(ndc.x) > 1.2 || Math.abs(ndc.y) > 1.2 || px < 5) return false;
    if (u.uLive.value && this.frame++ % this.every) return false;
    const rt = this.target(px);
    u.uImg.value = rt.texture;
    const cam = this.cam;
    cam.fov = o.fov;
    cam.updateProjectionMatrix();
    cam.position.copy(o.pos);
    cam.up.copy(o.up);
    cam.lookAt(this._v.copy(o.pos).add(o.dir));
    cam.updateMatrixWorld();
    // оружие в кадр объектива не попадает (ось прицела выше ствола), а его сотни мешей — самое дорогое
    const vis = o.gun.visible;
    o.gun.visible = false;
    const prev = this.R.getRenderTarget();
    // карты теней обновляет основной кадр: иначе этот проход (без оружия) забирал флаг обновления,
    // и в основном кадре ствол оставался без собственной тени, пока стоит оптика
    const sm = this.R.shadowMap, shadowNeeds = sm.needsUpdate;
    sm.needsUpdate = false;
    this.R.setRenderTarget(rt);
    this.R.render(this.scene, cam);
    this.R.setRenderTarget(prev);
    sm.needsUpdate = shadowNeeds;
    o.gun.visible = vis;
    u.uLive.value = 1;
    return true;
  }
  dispose() {
    this.release();
    this.rt?.dispose();
    this.rt = null;
    this.size = 0;
  }
};

// ==== engine/app.js
const THREE8 = window.THREE;
const { OrbitControls } = window.THREE_ADDONS["controls/OrbitControls.js"];
var D2R2 = Math.PI / 180;
var Y_UP = new THREE8.Vector3(0, 1, 0);
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var lerp = (a, b, t) => a + (b - a) * t;
var ease = (t) => t * t * (3 - 2 * t);
var KICK = { "556": 0.75, "545": 0.7, "762x39": 1.15, "762x51": 1.6, "9x19": 0.42, "762x54R": 1.9, "12ga": 2.6 };
// размер вспышки и энергия удара по гонгу — по патрону
var FLASH = { "762x51": 1.3, "762x39": 1.15, "762x54R": 1.45, "12ga": 1.5, "9x19": 0.7 };
var HIT = { "556": 2.5, "545": 2.5, "762x39": 3.2, "762x51": 4.5, "762x54R": 5, "9x19": 1.6, "12ga": 5.5 };
// дальность пристрелки прицела, м: пистолет-пулемёт/пистолет и ружьё — 25, винтовки — 100
var ZERO = { "9x19": 25, "12ga": 25 };
var TRACE_MODES = ["trace", "tracer", "off"];
var TRACE_LABEL = { trace: "след пули", tracer: "трассирующие", off: "трасса скрыта" };
// Луч и питание по умолчанию: кд, профиль отражателя (σ пятна и край засветки в радианах), ёмкость в минутах
var BEAM_DEF = { candela: 2e4, hot: 0.075, spill: 0.55, spillK: 0.035, ring: 0.06, color: 15922687, lensR: 0.014 };
var POWER_DEF = { light: 22, laser: 30, driver: "reg", cells: "2 × CR123A" };
var fract = (x) => x - Math.floor(x);
var hash1 = (i) => fract(Math.sin(i * 12.9898) * 43758.5453);
// мерцание почти севшего светодиода: плавный шум с провалами
function flicker(t, rate = 9) {
  const a = Math.floor(t * rate), f = t * rate - a, s = f * f * (3 - 2 * f);
  const v = hash1(a) * (1 - s) + hash1(a + 1) * s;
  return v > 0.38 ? 0.8 + 0.2 * v : 0.06 + 0.1 * v;
}
// Световой поток от заряда: «reg» — стабилизированный драйвер (ровно до ~12 %, дальше садится и желтеет),
// «step» — ступенчатый (18650: 100 % → 42 % → гаснет).
function lightOutput(lv, driver, t) {
  if (lv <= 0) return { k: 0, warm: 0 };
  let k, warm = 0;
  if (driver === "step") k = lv > 0.15 ? 1 : lv > 0.03 ? 0.42 : 0.42 * Math.sqrt(lv / 0.03);
  else {
    k = lv > 0.12 ? 1 - 0.04 * (1 - lv) : 0.95 * Math.pow(lv / 0.12, 0.9);
    warm = lv < 0.12 ? (1 - lv / 0.12) * 0.4 : 0;
  }
  if (lv < 0.035) k *= flicker(t);
  return { k, warm };
}
function laserOutput(lv, t) {
  if (lv <= 0) return 0;
  let k = lv > 0.1 ? 1 : 0.3 + 0.7 * (lv / 0.1);
  if (lv < 0.03) k *= flicker(t * 1.6, 13);
  return k;
}
// цветовая температура светодиода → hex (приближение Таннера Хелланда)
function kelvinHex(K) {
  const t = K / 100, c = (v) => Math.round(Math.min(255, Math.max(0, v)));
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  return c(r) << 16 | c(g) << 8 | c(b);
}
// Луч фонаря в едином формате. У модулей набора M416 есть beam; у остальных — сила света (кд),
// размер пятна и засветки в долях конуса 0,62 рад и цветовая температура.
function beamOf(d) {
  if (d.beam) return { ...BEAM_DEF, ...d.beam, lensR: d.beam.lensR ?? (d.lensR ?? 13) / 1e3 };
  const lm = d.lumens || 500, cd = d.cd ?? lm * 22;
  const hot = d.hot ?? (cd / lm > 28 ? 0.15 : 0.21);
  return { ...BEAM_DEF, candela: cd, hot: hot * 0.45, spillK: (d.spill ?? 0.085) * 0.45, color: kelvinHex(d.kelvin ?? 6200), lensR: (d.lensR ?? 11) / 1e3 };
}
// м:сс — обратный отсчёт работы батареи
var mmss = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
var Tweens = class {
  constructor() {
    this.list = [];
  }
  add(obj, key, to, dur, ease2 = (t) => t, done) {
    this.list = this.list.filter((t) => !(t.obj === obj && t.key === key));
    this.list.push({ obj, key, from: obj[key], to, dur: Math.max(dur, 1e-4), t: 0, ease: ease2, done });
  }
  wait(dur, done) {
    this.list.push({ obj: null, dur, t: 0, done });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      if (w.obj) w.obj[w.key] = w.from + (w.to - w.from) * w.ease(k);
      if (k >= 1) {
        this.list.splice(i, 1);
        w.done && w.done();
      }
    }
  }
};
async function boot(def, lib) {
  const host = document.getElementById("app");
  // Сцена тира, окружение, материалы и скомпилированные шейдеры — общие для всех образцов:
  // смена оружия в оружейной больше не перезагружает страницу и не собирает всё заново.
  const S = ARM_SHARED.S || (ARM_SHARED.S = createScene(host));
  const mats = ARM_SHARED.mats || (ARM_SHARED.mats = createMaterials(S.env));
  const ctx = makeCtx(mats);
  const baseScene = new Set(S.scene.children), baseCam = new Set(S.camera.children), baseBody = new Set(document.body.children);
  const asm = new Assembler(def, lib, ctx);
  const base = asm.base;
  const audio = new GunAudio();
  audio.profile = { ...def.audio, rpm: def.base.rpm, family: def.family || (def.id.startsWith("ak") ? "ak" : def.id) };
  const fx = new FX(S.scene, mats);
  const pip = new PipScope(S.renderer, S.scene);
  const ironRay = new THREE8.Raycaster();
  fx.floorAt = S.range.floorAt;
  const ball = new Ballistics();
  const tw = new Tweens();
  const aim = new THREE8.Group();
  aim.position.set(0, GUN_Y, 0);
  S.scene.add(aim);
  const rig = new THREE8.Group();
  aim.add(rig);
  const gun = asm.root;
  gun.scale.setScalar(1e-3);
  rig.add(gun);
  const pivotX = (base.pivotX ?? base.eyeX ?? -240) / 1e3;
  const st = {
    mode: def.modes.includes("auto") ? "auto" : def.modes[1] || "semi",
    mag: 0,
    cap: 30,
    chambered: true,
    magIn: true,
    busy: false,
    trigger: false,
    lastShot: 0,
    burst: 0,
    held: false,
    ads: false,
    adsT: 0,
    sightIdx: 0,
    zoom: 1,
    // кратность «сверх штатной» для прицелов без переменной кратности (колесо в прицеливании)
    zoomMul: 1,
    light: false,
    laser: false,
    emOn: {},
    trace: "trace",
    ret: {},
    lastHit: null,
    batt: {},
    folded: false,
    bipod: false,
    magAside: false,
    holdOpen: false,
    spent: false,
    handleLocked: false,
    burstLeft: 0,
    yaw: 0,
    pitch: 0,
    climb: 0,
    rec: { p: 0, y: 0, z: 0, vp: 0, vy: 0, vz: 0 },
    stats: {},
    baseStats: {},
    night: false,
    exposure: 1,
    expTarget: 1
  };
  let cfg = {};
  let ui = null;
  let sights = [];
  let lights = [], lasers = [];
  let stencilRef = 1;
  let lastOptic = null;
  function magKind() {
    const it = asm.installed.get("mag");
    const m = it?.obj;
    let steel = false;
    m?.traverse((o) => {
      if (o.isMesh && /steel|alu/.test(o.userData.mat || "")) steel = true;
    });
    return steel ? "steel" : "poly";
  }
  function applyConfig(next, opts = {}) {
    pip.release();
    // v25: окраска (js/kit/skins.js) — не слот, переживает смену модулей и сброс
    const skin = next && typeof next.skin === "string" ? next.skin : cfg && cfg.skin;
    // v26: окраска модулей (skinMods) и маскировка (wrap: сеть / «кикимора») — так же переживают смену модулей
    const skinMods = next && "skinMods" in next ? next.skinMods : cfg && cfg.skinMods;
    const wrap = next && "wrap" in next ? next.wrap : cfg && cfg.wrap;
    cfg = asm.apply(next);
    if (skin && skin !== "factory") cfg.skin = skin;
    const sm = window.GSkins && window.GSkins.normMods ? window.GSkins.normMods(skinMods) : null;
    if (sm) cfg.skinMods = sm;
    const wr = window.GWCover && window.GWCover.supports(def.id) ? window.GWCover.norm(wrap) : null;
    if (wr) cfg.wrap = wr;
    if (window.GSkins) try { window.GSkins.apply(asm.root, def.id, cfg.skin || "factory", mats, cfg.skinMods); } catch (e) { console.warn("skin", e); }
    if (window.GWCover) try { window.GWCover.apply(asm, def.id, cfg.wrap); } catch (e) { console.warn("wcover", e); }
    // побывавший на оружии модуль уже на GPU: из кэша предсборки его не выбрасываем
    for (const it of asm.installed.values()) it.obj.userData.shown = true;
    const magInfo = asm.info("mag")?.mag;
    const prevCap = st.cap;
    st.cap = magInfo?.cap || def.base.mag || 30;
    if (opts.init || st.mag > st.cap || prevCap !== st.cap) st.mag = st.cap;
    if (!magInfo) st.magIn = false;
    else if (opts.init || def.feed === "tube") st.magIn = true;
    const ms = fireModes();
    if (!ms.includes(st.mode)) st.mode = ms.includes("auto") ? "auto" : ms.find((m) => m !== "safe") || ms[0];
    poseSelector(true);
    const mz = asm.info("muzzle")?.muzzle;
    audio.muzzle = mz ? mz.kind : "bare";
    if (audio.ctx && audio.shotBuffer) (window.requestIdleCallback || setTimeout)(() => audio.shotBuffer(audio.shotFamily(), audio.muzzle));
    // голос глушителя (звуковой стек M416/АК/SCAR): длина корпуса и заявленное снижение
    const mzPart = asm.installed.get("muzzle")?.part;
    audio.voice = mz?.kind === "supp" ? { len: mzPart?.stats?.length || 170, loud: mzPart?.stats?.loud ?? -27, ...mz.voice || {} } : null;
    st.stats = asm.stats();
    for (const it of asm.installed.values()) for (const s of [it.info?.sight, ...it.info?.alt || [], ...it.info?.sights || []]) {
      if (!s || !s.lens || s.lens.userData.stencilSet) continue;
      const ref = stencilRef++;
      const m = s.lens.material;
      m.stencilWrite = true;
      m.stencilRef = ref;
      m.stencilFunc = THREE8.AlwaysStencilFunc;
      m.stencilZPass = THREE8.ReplaceStencilOp;
      s.lens.userData.stencilSet = true;
      if (s.reticle) {
        s.retMesh = reticleMesh(s.reticle, s, ref);
        (s.node || it.obj).add(s.retMesh);
      }
    }
    const hasOptic = !!asm.info("optic")?.sight;
    for (const it of asm.installed.values()) {
      const f2 = it.info?.flip;
      if (f2) tw.add(f2.node.rotation, "z", hasOptic ? f2.angle * D2R2 : 0, opts.init ? 1e-3 : 0.35, ease);
      const fa = it.info?.flipAside;
      if (fa) fa.node.rotation.x = st.magAside ? fa.angle * D2R2 : 0;
      const fo = it.info?.fold;
      if (fo && fo.slide) fo.node.position.x = st.folded ? fo.slide : 0;
      else if (fo) fo.node.rotation[fo.axis || "y"] = st.folded ? fo.angle * D2R2 : 0;
      const bp = it.info?.bipod;
      if (bp) for (const l of bp.legs) l.rotation.z = st.bipod ? bp.angle * D2R2 : 0;
    }
    if (!asm.withInfo("bipod").length) st.bipod = false;
    if (!asm.withInfo("fold").length) st.folded = false;
    const slotOrder = (x) => {
      const i = def.slots.findIndex((s) => s.id === x.slotId);
      return i < 0 ? 99 : i;
    };
    lights = asm.withInfo("light").sort((a, b) => slotOrder(a) - slotOrder(b));
    lasers = asm.withInfo("laser").sort((a, b) => slotOrder(a) - slotOrder(b));
    // включённые излучатели, которых больше нет на оружии, забываем
    const alive = new Set([...lights.map((l) => emKey(l, "light")), ...lasers.map((l) => emKey(l, "laser"))]);
    for (const k of Object.keys(st.emOn)) if (!alive.has(k)) delete st.emOn[k];
    syncEmitterFlags();
    for (const it of [...lights, ...lasers]) if (st.batt[battKey(it)] == null) st.batt[battKey(it)] = 1;
    lensGlow();
    const mi = asm.info("mag")?.mag;
    if (mi?.rounds) mi.rounds.visible = st.mag > 0;
    const magObj = asm.installed.get("mag")?.obj;
    if (magObj) {
      magObj.visible = st.magIn;
      magObj.position.y = 0;
      magObj.rotation.z = 0;
    }
    buildSights();
    applyReticles();
    if (ui) ui.refresh();
    app?.invalidate?.();
  }
  function buildSights() {
    const prev = sights[st.sightIdx]?.id;
    sights = [];
    const m = new THREE8.Matrix4();
    const push = (id, label, obj, s, rkey) => {
      m.copy(toRoot(s.node || obj, gun));
      const eye = new THREE8.Vector3(s.x0 ?? 0, s.y, s.z || 0).applyMatrix4(m);
      const dir = new THREE8.Vector3(1, 0, 0).transformDirection(m);
      const up = new THREE8.Vector3(0, 1, 0).transformDirection(m);
      sights.push({ id, label, eye, dir, up, mag: s.mag || 1, zoom: s.zoom, reticle: s.reticle, eyeRelief: s.eyeRelief, magnifier: s.magnifier, x0: eye.x, src: s, rkey });
    };
    // дополнительные прицельные оси модуля (коллиматор поверх призмы/оптики): V переключает на них
    const pushAlt = (it) => (it.info?.alt || []).forEach((a, i) => push(it.slot.id + ":alt" + i, it.part.name + " — " + (a.label || "коллиматор"), it.obj, a, it.part.id + ":alt" + i));
    const opt = asm.installed.get("optic");
    if (opt?.info?.sight) push("optic", opt.part.name, opt.obj, opt.info.sight, opt.part.id);
    if (opt) pushAlt(opt);
    for (const it of asm.installed.values()) if (it !== opt) pushAlt(it);
    for (const it of asm.installed.values()) if (it.slot.id !== "optic" && it.info?.sight && !it.info.sight.magnifier) push(it.slot.id, it.part.name, it.obj, it.info.sight, it.part.id);
    const mg = asm.installed.get("magnifier");
    if (mg?.info?.sight && sights[0]) {
      m.copy(toRoot(mg.obj, gun));
      const eye = new THREE8.Vector3(mg.info.sight.x0, mg.info.sight.y, 0).applyMatrix4(m);
      sights.splice(1, 0, { ...sights[0], id: "magnifier", label: sights[0].label + (mg.info.sight.suffix || ""), eye, mag: mg.info.sight.mag, eyeRelief: mg.info.sight.eyeRelief, nv: !!mg.info.sight.nv, hide: mg.info.sight.hide, withMag: mg.info.sight.mag > 1 });
    }
    let rear = null, front = null;
    const pts = (it, key) => {
      const v = it.info?.irons?.[key];
      if (!v) return null;
      return new THREE8.Vector3(...v).applyMatrix4(toRoot(it.obj, gun));
    };
    let rearIt = null;
    for (const it of asm.installed.values()) {
      if (!rear && (rear = pts(it, "rear"))) rearIt = it;
      front = front || pts(it, "front");
    }
    if (base.irons?.rear && !rear) rear = new THREE8.Vector3(...base.irons.rear);
    if (base.irons?.front && !front) front = new THREE8.Vector3(...base.irons.front);
    const opticFolds = !!opt && [...asm.installed.values()].some((it) => it.info?.flip);
    // механика, перекрытая установленным модулем (ПСО-1 над коробкой, кронштейн оптики, ЛЦУ сверху),
    // в список прицелов не попадает: смотреть через неё нельзя
    const ironsClear = () => {
      gun.updateMatrixWorld(true);
      // от глаза (там же, где встанет камера), а не от целика: корпус ПСО бывает позади целика
      const type = rearIt ? rearIt.info.irons.type || "aperture" : base.irons?.type || "notch";
      const back = type === "aperture" ? (rearIt ? rearIt.info.irons.eye : base.irons?.eye) ?? 75 : 220;
      const eye = rear.clone().addScaledVector(front.clone().sub(rear).normalize(), -back);
      const a = gun.localToWorld(eye), b = gun.localToWorld(front.clone());
      const d = b.sub(a), len = d.length();
      ironRay.set(a, d.divideScalar(len));
      ironRay.near = 0;
      ironRay.far = len;
      const meshes = [];
      for (const it of asm.installed.values()) {
        if (it.info?.irons) continue;
        it.obj.traverseVisible((o) => {
          if (o.isMesh && !o.userData.lens && !o.userData.reticle && !o.material?.transparent) meshes.push(o);
        });
      }
      return !ironRay.intersectObjects(meshes, false).length;
    };
    if (rear && front && !opticFolds && ironsClear()) {
      const dir = front.clone().sub(rear).normalize();
      const type = rearIt ? rearIt.info.irons.type || "aperture" : base.irons?.type || "notch";
      const eyeDist = rearIt ? rearIt.info.irons.eye : base.irons?.eye;
      const apertureR = rearIt ? rearIt.info.irons.hole : base.irons?.hole;
      sights.push({ id: "irons", label: "Механический прицел", eye: rear, dir, mag: 1, irons: true, type, eyeDist, apertureR, rearObj: rearIt?.obj || base.nodes?.rearSight || null, x0: rear.x });
    }
    if (!sights.length) {
      const bs = boreSight();
      if (bs) sights.push(bs);
    }
    const optNow = sights.find((s) => s.id === "optic")?.label || null;
    const i = sights.findIndex((s) => s.id === prev);
    st.sightIdx = i >= 0 && optNow === lastOptic ? i : 0;
    lastOptic = optNow;
    if (sights[st.sightIdx]?.id === "magnifier" && st.magAside) st.sightIdx = 0;
    /* v26: увеличитель стоит на линии — по умолчанию смотрим через него (не в глухой корпус) */
    else if (sights[st.sightIdx]?.id === "optic" && !st.magAside) {
      const mi = sights.findIndex((s) => s.id === "magnifier");
      if (mi >= 0) st.sightIdx = mi;
    }
  }
  // Без прицела целятся «по стволу»: глаз над верхом ствольной коробки, линия — параллельно оси
  // канала. Высота — наименьшая, при которой линия до дульного среза ничего не задевает.
  function boreSight() {
    gun.updateMatrixWorld(true);
    const mx = muzzleX(), ex = base.eyeX ?? -240;
    const meshes = [];
    gun.traverseVisible((o) => {
      if (o.isMesh && !o.userData.lens && !o.userData.reticle && !o.material?.transparent) meshes.push(o);
    });
    const a = new THREE8.Vector3(), b = new THREE8.Vector3();
    for (let h = 14; h <= 140; h += 3) {
      gun.localToWorld(a.set(ex, h, 0));
      gun.localToWorld(b.set(mx, h, 0));
      const d = b.sub(a), len = d.length();
      ironRay.set(a, d.divideScalar(len));
      ironRay.near = 0;
      ironRay.far = len;
      if (ironRay.intersectObjects(meshes, false).length) continue;
      // sightPose для механики ставит глаз на 220 мм позади «целика» — ровно в ex
      const eye = new THREE8.Vector3(ex + 220, h + 4, 0);
      return { id: "bore", label: "По стволу (без прицела)", eye, dir: new THREE8.Vector3(1, 0, 0), mag: 1, irons: true, type: "notch", bore: true, x0: eye.x };
    }
    return null;
  }
  const f = base.focus || { center: [0, 0, 0], size: 900 };
  const controls = new OrbitControls(S.camera, S.renderer.domElement);
  controls.target.set(f.center[0] / 1e3, GUN_Y + f.center[1] / 1e3, f.center[2] / 1e3);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.12;
  controls.maxDistance = 3.5;
  controls.mouseButtons = { LEFT: THREE8.MOUSE.ROTATE, MIDDLE: THREE8.MOUSE.DOLLY, RIGHT: null };
  const orbitHome = () => {
    S.camera.position.set(controls.target.x - 0.2, controls.target.y + 0.17, controls.target.z + f.size / 1e3 * 1.75);
    controls.update();
  };
  orbitHome();
  const focusTarget = new THREE8.Vector3().copy(controls.target);
  const homeTarget = controls.target.clone();
  let focusDist = null;
  // v26: «домой» — к исходному ракурсу целиком (мастерская окраски после крупного плана модуля)
  const homeDist = S.camera.position.distanceTo(controls.target);
  let homeFocus = false;
  const orbitPose = { pos: new THREE8.Vector3(), quat: new THREE8.Quaternion(), fov: 38 };
  const baseFov = 38;
  function sightPose(out) {
    const s = sights[st.sightIdx];
    if (!s) return null;
    let ex = base.eyeX ?? -240;
    if (s.eyeRelief) ex = s.eye.x - s.eyeRelief;
    else if (s.irons) ex = s.type === "aperture" ? s.eye.x - (s.eyeDist ?? 75) : Math.min(ex, s.eye.x - 220);
    else if (!s.irons) ex = Math.min(ex, s.eye.x - 60);
    const t = (ex - s.eye.x) / (s.dir.x || 1);
    const eyeGun = s.eye.clone().addScaledVector(s.dir, t);
    const m = new THREE8.Matrix4().makeScale(1e-3, 1e-3, 1e-3);
    out.pos.copy(eyeGun).applyMatrix4(m);
    const right = new THREE8.Vector3().crossVectors(s.dir, s.up || Y_UP).normalize();
    const up = new THREE8.Vector3().crossVectors(right, s.dir);
    const back = s.dir.clone().negate();
    out.quat.setFromRotationMatrix(new THREE8.Matrix4().makeBasis(right, up, back));
    const mag = s.zoom ? st.zoom : s.mag;
    // zoomMul меняет только поле зрения: режим (оптика/коллиматор) задаёт штатная кратность
    const zm = s.zoom ? 1 : st.zoomMul;
    out.fov = (s.irons ? baseFov * 0.78 : baseFov / Math.max(1, mag) * (mag > 1 ? 1 : 0.88)) / zm;
    out.mag = mag;
    out.s = s;
    return out;
  }
  const tmp = new THREE8.Vector3(), tmp2 = new THREE8.Vector3(), tq = new THREE8.Quaternion(), mzTmp = new THREE8.Vector3();
  function muzzleWorld(out, dir) {
    const mz = asm.mounts.get("muzzle");
    const len = asm.info("muzzle")?.muzzle?.x || 0;
    if (mz) mz.localToWorld(out.set(len, 0, 0));
    else gun.localToWorld(out.set(...base.muzzle || [400, 0, 0]));
    if (dir) dir.set(1, 0, 0).transformDirection(gun.matrixWorld).normalize();
    return out;
  }
  function canFire() {
    return st.mode !== "safe" && !st.busy;
  }
  /* ---------------------------------------------------------- баллистика и пристрелка */
  function ammoInfo() {
    return asm.info("ammo")?.ammo || def.ammo || {};
  }
  function bulletNow() {
    return bulletSpec(def.cal, asm.installed.get("ammo")?.part?.id);
  }
  function muzzleX() {
    const mz = asm.mounts.get("muzzle");
    if (!mz) return (base.muzzle || [400])[0];
    const p = mz.localToWorld(new THREE8.Vector3(asm.info("muzzle")?.muzzle?.x || 0, 0, 0));
    return gun.worldToLocal(p).x;
  }
  // Решение пристрелки для прицела s: линия прицеливания и траектория пересекаются на дальности Z.
  // Высота линии прицеливания над осью канала берётся в точке пересечения (для механики линия
  // «целик — мушка» слегка наклонена к оси ствола).
  function zeroFor(s) {
    const Z = def.zero ?? ZERO[def.cal] ?? 100;
    const v0 = st.stats.velocity || def.base.velocity || 800;
    if (!s) return { sol: zeroSolution(bulletNow(), v0, 0.03, 0, Z), v0, spec: bulletNow(), Z };
    const xm = muzzleX();
    const t = (xm + Z * 1e3 - s.eye.x) / (s.dir.x || 1);
    const h = (s.eye.y + s.dir.y * t) / 1e3, z = (s.eye.z + s.dir.z * t) / 1e3;
    const spec = bulletNow();
    return { sol: zeroSolution(spec, v0, h, z, Z), v0, spec, Z };
  }
  // функция поправок для BDC-сеток: R (м) → MOA ниже точки прицеливания
  function holdCtx(s) {
    const zf = zeroFor(s);
    const ranges = [100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1e3, 1100, 1200, 1300];
    const hs = holdovers(zf.spec, zf.v0, zf.sol, ranges);
    const map = new Map(ranges.map((R, i) => [R, hs[i]?.moa ?? null]));
    return { hold: (R) => map.get(R) ?? null, far: def.cal === "9x19" || def.cal === "12ga" ? 100 : 300, key: [zf.spec.name, zf.v0.toFixed(0), zf.sol.h.toFixed(3), zf.Z].join("|") };
  }
  function trailMode() {
    return st.trace;
  }
  const PUMP = def.action === "pump";
  const TUBE = def.feed === "tube";
  function roundsVisible() {
    const mi = asm.info("mag")?.mag;
    if (mi?.rounds) mi.rounds.visible = st.mag > 0;
  }
  function fireOnce() {
    const now = performance.now() / 1e3;
    if (!st.chambered) {
      audio.dryFire();
      st.held = false;
      if (ui) ui.toast(PUMP ? st.mag > 0 ? "Передёрните цевьё (T)" : "Магазин пуст — зарядить (R)" : st.magIn ? "Патронник пуст — перезарядка (R)" : "Нет магазина");
      return false;
    }
    st.lastShot = now;
    audio.shot();
    const mzInfo = asm.info("muzzle")?.muzzle;
    const kind = mzInfo ? mzInfo.kind : asm.info("barrel")?.muzzleKind || def.bareKind || "bare";
    const pos = muzzleWorld(new THREE8.Vector3(), tmp2);
    const bore = tmp2.clone();
    gun.getWorldQuaternion(tq);
    // холодный глушитель: первый выстрел даёт хлопок — кислород в камерах догорает
    const coldCan = kind === "supp" && now - (st.prevShot ?? -10) > 3;
    st.prevShot = now;
    fx.muzzleFlash(pos, bore, kind, def.flashSize ?? FLASH[def.cal] ?? 1, tq, { flash: mzInfo ? mzInfo.flash ?? 0.8 : 1, first: coldCan, smoke: def.cal === "12ga" ? 1.4 : 1 });
    const ammo = ammoInfo();
    const pellets = ammo.pellets || 1;
    const spreadMoa = (st.stats.moa || 1.5) + Math.min(st.burst, 10) * 0.7 * (st.stats.recoilV || 100) / 100 + (st.ads ? 0 : def.hipMoa ?? 60);
    // дробь: диаметр осыпи задаёт чок (сужение дульца) и сам патрон
    const pattern = pellets > 1 ? (ammo.pattern || 90) * (mzInfo?.pattern ?? 1) : 0;
    // ствол задран над линией прицеливания на угол пристрелки (+ боковой вынос для прицела сбоку)
    const zf = zeroFor(sights[st.sightIdx]);
    const elev = zf.sol.elev, wd = zf.sol.wind;
    const launch = new THREE8.Vector3(Math.cos(elev) * Math.cos(wd), Math.sin(elev), Math.cos(elev) * Math.sin(wd)).transformDirection(gun.matrixWorld);
    const right = new THREE8.Vector3().crossVectors(bore, Y_UP).normalize();
    const upV = new THREE8.Vector3().crossVectors(right, bore).normalize();
    const spec = zf.spec, v0 = zf.v0 * (pellets > 1 ? 0.99 + Math.random() * 0.02 : 1 + (Math.random() - 0.5) * 0.008);
    const shot = { hits: 0, steel: 0, dist: 0, thumped: false, reported: false };
    const tracerShot = st.trace === "tracer";
    const onHit = (hit, b, v, graze) => {
      const surf = hit.object.userData.surface || "dirt";
      fx.impact(hit, surf, { v, graze, pellet: pellets > 1, dir: b.v.clone().normalize(), mass: spec.mass });
      const E = 0.5 * spec.mass / 1e3 * v * v;
      if (surf === "steel") {
        S.range.hit(hit.object.userData.target, (HIT[def.cal] ?? 2.5) * (ammo.energy ?? 1) / Math.sqrt(pellets) * Math.min(1.4, Math.pow(v / b.v0, 2) * 1.15));
        audio.ding(b.dist, Math.min(1.3, 0.6 + ++shot.steel * 0.12));
      } else if (!shot.thumped && !graze) {
        // у звукового стека M416 свой звук на каждую поверхность; бумагу пуля пробивает — слышен вал
        if (audio.impact) audio.impact(surf === "paper" ? "trap" : surf, surf === "paper" ? Math.max(b.dist, 100) : b.dist);
        else audio.thump(b.dist);
        shot.thumped = true;
      }
      if (!shot.reported && !graze) {
        shot.reported = true;
        st.lastHit = { dist: b.dist, t: b.t, v, E, surf, name: spec.name, pellets };
        ui?.shot?.(st.lastHit);
      }
    };
    for (let i = 0; i < pellets; i++) {
      // рассеивание: круговое нормальное (кучность в MOA ≈ диаметр группы), дробь — осыпь чока
      const sp = spreadMoa / 60 * D2R2 * 0.25;
      const gx = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(Math.random() * Math.PI * 2);
      const gy = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(Math.random() * Math.PI * 2);
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * pattern / 60 * D2R2 * 0.5;
      const dir = launch.clone().addScaledVector(upV, gy * sp + Math.sin(a) * rr).addScaledVector(right, gx * sp + Math.cos(a) * rr).normalize();
      ball.fire({ pos, vel: dir.multiplyScalar(v0), spec, right, tracer: tracerShot && (pellets === 1 || i === 0), onHit });
    }
    cycleAction();
    const K = def.kick ?? KICK[def.cal] ?? 0.8;
    const kick = K * (ammo.recoil ?? 1) * (st.stats.recoilV || 100) / 100 * (st.bipod ? 0.45 : 1);
    const side = K * 0.5 * (st.stats.recoilH || 100) / 100 * (st.bipod ? 0.4 : 1);
    st.rec.vp += kick * 60 * (0.85 + Math.random() * 0.3);
    st.rec.vy += (Math.random() - 0.45) * side * 55;
    st.rec.vz += kick * 1.6;
    st.climb += kick * 0.55 * D2R2;
    st.burst++;
    if (PUMP) {
      // помповое ружьё: стреляная гильза остаётся в патроннике до передёргивания цевья
      st.chambered = false;
      st.spent = true;
      if (def.autoPump !== false) {
        st.busy = true;
        setTimeout(() => pump(() => {
          st.busy = false;
          ui?.hud();
        }), 170);
      }
    } else if (st.magIn && st.mag > 0) {
      st.mag--;
      st.chambered = true;
    } else {
      st.chambered = false;
      if (base.anim?.holdOpen !== false && def.boltHold !== false && st.magIn) st.holdOpen = true;
    }
    roundsVisible();
    if (ui) ui.hud();
    return true;
  }
  function ejectShell(live = false) {
    const ej = base.eject;
    if (!ej) return;
    const p = gun.localToWorld(new THREE8.Vector3(...ej.p));
    const d = new THREE8.Vector3(...ej.dir).normalize().transformDirection(gun.matrixWorld);
    const v = live ? d.multiplyScalar(1.5) : d.multiplyScalar((ej.speed ?? 3.2) + Math.random() * 1.2).add(new THREE8.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.6, 0));
    gun.getWorldQuaternion(tq);
    fx.shell(p, v, def.cal, tq, live);
    if (!live) fx.portSmoke(p, d, audio.muzzle === "supp" ? 2.2 : 1);
  }
  function cycleAction() {
    const tr = base.nodes?.trigger;
    const cyc = 60 / (def.base.rpm || 700);
    if (tr) {
      tr.rotation.z = -(base.anim?.triggerAngle ?? 0.16);
      tw.add(tr.rotation, "z", 0, PUMP ? 0.25 : cyc * 0.9);
    }
    const ham = base.nodes?.hammer;
    if (ham) {
      ham.rotation.z = 0;
    }
    if (PUMP) return;
    const car = base.nodes?.carrier;
    const travel = base.anim?.carrierTravel || 80;
    if (car) {
      tw.add(car.position, "x", -travel, cyc * 0.32, (t) => 1 - (1 - t) * (1 - t), () => {
        if (!st.chambered && st.holdOpen) return;
        tw.add(car.position, "x", 0, cyc * 0.45, (t) => t * t);
      });
    }
    const pc = base.anim?.portCover;
    if (pc && pc.rotation.x < 1) tw.add(pc.rotation, "x", 1.9, 0.08, (t) => 1 - (1 - t) * (1 - t));
    if (base.eject) setTimeout(() => ejectShell(false), cyc * 300);
  }
  // Цикл помпы: цевьё с затвором назад (выброс гильзы/патрона), вперёд (подача из трубки).
  function pump(done) {
    const fe = base.nodes?.forend, car = base.nodes?.carrier;
    const travel = base.anim?.pumpTravel || 95;
    audio.pumpBack();
    if (fe) tw.add(fe.position, "x", -travel, 0.14, ease);
    if (car) tw.add(car.position, "x", -travel, 0.14, ease);
    setTimeout(() => {
      if (st.spent || st.chambered) ejectShell(!st.spent);
      st.spent = false;
      st.chambered = false;
      ui?.hud();
    }, 110);
    setTimeout(() => {
      audio.pumpForward();
      if (fe) tw.add(fe.position, "x", 0, 0.12, ease);
      if (car) tw.add(car.position, "x", 0, 0.12, ease);
      setTimeout(() => {
        if (st.mag > 0) {
          st.mag--;
          st.chambered = true;
        }
        ui?.hud();
        setTimeout(() => done && done(), 90);
      }, 90);
    }, 210);
  }
  function magNode() {
    return asm.installed.get("mag")?.obj || null;
  }
  function magMount() {
    return asm.mounts.get("magwell")?.userData.mount || {};
  }
  function dropMag(done) {
    const m = magNode();
    if (!m || !st.magIn) {
      done && done();
      return;
    }
    const kind = magKind();
    audio.magOut(kind);
    const rock = magMount().rock;
    const fall = () => {
      tw.add(m.position, "y", -420, 0.42, (t) => t * t, () => {
        m.visible = false;
        m.position.y = 0;
        m.rotation.z = 0;
        audio.magDropGround(kind, st.mag / Math.max(1, st.cap));
      });
      st.magIn = false;
      // СВД: затвор на задержке держит подаватель магазина — без магазина он уходит вперёд
      if (st.holdOpen && def.holdByFollower) {
        setTimeout(() => {
          audio.boltSlam();
          const car = base.nodes?.carrier;
          if (car) tw.add(car.position, "x", 0, 0.06, (t) => t * t);
          st.holdOpen = false;
          ui?.hud();
        }, 120);
      }
      if (ui) ui.hud();
      setTimeout(() => done && done(), 380);
    };
    if (rock) tw.add(m.rotation, "z", rock[2] * D2R2, 0.16, ease, fall);
    else fall();
  }
  function insertMag(done) {
    const m = magNode();
    if (!m) {
      done && done();
      return;
    }
    m.visible = true;
    m.position.y = -300;
    const rock = magMount().rock;
    m.rotation.z = rock ? rock[2] * D2R2 : 0;
    const kind = magKind();
    st.mag = st.cap;
    roundsVisible();
    setTimeout(() => audio.magInsert(kind), 190);
    tw.add(m.position, "y", 0, 0.35, (t) => 1 - Math.pow(1 - t, 3), () => {
      const fin = () => {
        if (!rock) audio.magIn(kind);
        // проверка рывком за магазин
        if (!rock && audio.tug) setTimeout(() => audio.tug(kind), 170);
        st.magIn = true;
        if (ui) ui.hud();
        setTimeout(() => done && done(), !rock && audio.tug ? 260 : 150);
      };
      if (rock) {
        setTimeout(() => audio.magIn(kind), 90);
        tw.add(m.rotation, "z", 0, 0.14, ease, fin);
      } else fin();
    });
  }
  function release() {
    if (st.magIn && st.mag > 0 && !st.chambered) {
      st.mag--;
      st.chambered = true;
    }
    st.holdOpen = false;
    roundsVisible();
    if (ui) ui.hud();
  }
  // Рукоять/затвор назад; lock — оставить открытым (HK: рукоять в вырезе трубки).
  function chargeBack(lock, done) {
    const car = base.nodes?.carrier, hd = base.nodes?.handle;
    const ch = asm.installed.get("charger");
    const travel = base.anim?.carrierTravel || 80;
    audio.chargeBack();
    const chObj = ch?.obj;
    const chTravel = ch?.info?.charger?.travel || 0;
    if (car) tw.add(car.position, "x", -travel, 0.2, ease);
    if (chObj) tw.add(chObj.position, "x", -chTravel, 0.2, ease);
    if (hd) tw.add(hd.position, "x", -(base.anim?.handleTravel ?? travel), 0.2, ease);
    const wasChambered = st.chambered;
    setTimeout(() => {
      if (wasChambered) {
        ejectShell(true);
        st.chambered = false;
      }
      if (lock) {
        audio.hkLock();
        const r = base.anim?.handleLock;
        if (hd && r) tw.add(hd.rotation, "x", r * D2R2, 0.08, ease);
        st.handleLocked = true;
        ui?.hud();
      }
      done && done();
    }, lock ? 240 : 330);
  }
  function chargeForward(done) {
    const car = base.nodes?.carrier, hd = base.nodes?.handle;
    const ch = asm.installed.get("charger");
    audio.chargeRelease();
    if (hd && base.anim?.handleLock) hd.rotation.x = 0;
    if (car) tw.add(car.position, "x", 0, 0.07, (t) => t * t);
    if (hd) tw.add(hd.position, "x", 0, 0.07, (t) => t * t);
    if (ch?.obj) tw.add(ch.obj.position, "x", 0, 0.12, ease);
    st.handleLocked = false;
    release();
    setTimeout(() => done && done(), 200);
  }
  function charge(done) {
    if (PUMP) return pump(done);
    if (st.holdOpen && def.boltCatch !== false) {
      audio.boltCatch();
      release();
      const car = base.nodes?.carrier;
      if (car) tw.add(car.position, "x", 0, 0.06, (t) => t * t);
      setTimeout(() => done && done(), 250);
      return;
    }
    if (st.handleLocked) return chargeForward(done);
    chargeBack(false, () => chargeForward(done));
  }
  // Патроны по одному в подствольный магазин через окно снизу.
  function loadTube(done) {
    const sh = base.nodes?.loadShell;
    const step = () => {
      if (st.mag >= st.cap || st.trigger) {
        if (sh) sh.visible = false;
        return done && done();
      }
      audio.shellLoad();
      if (sh) {
        sh.visible = true;
        sh.position.set(-60, -70, 0);
        tw.add(sh.position, "y", 0, 0.12, ease);
        tw.add(sh.position, "x", 90, 0.3, (t) => t * t, () => sh.visible = false);
      }
      setTimeout(() => {
        st.mag++;
        ui?.hud();
        setTimeout(step, 170);
      }, 300);
    };
    step();
  }
  function reload() {
    if (st.busy || !asm.info("mag")) return;
    if ((TUBE || st.magIn) && st.mag >= st.cap && st.chambered) {
      ui?.toast(TUBE ? "Магазин полный" : "Магазин полный");
      return;
    }
    st.busy = true;
    st.trigger = false;
    if (ui) ui.hud();
    const fin = () => {
      st.busy = false;
      ui?.hud();
    };
    const after = () => {
      if (!st.chambered) charge(fin);
      else fin();
    };
    if (TUBE) {
      loadTube(() => !st.chambered && st.mag > 0 ? pump(fin) : fin());
      return;
    }
    if (def.reload === "hk" && !st.chambered && !st.handleLocked) {
      // HK: рукоять назад и в вырез → смена магазина → удар ладонью по рукояти
      chargeBack(true, () => setTimeout(() => dropMag(() => setTimeout(() => insertMag(() => setTimeout(() => chargeForward(fin), 120)), 250)), 150));
      return;
    }
    dropMag(() => {
      if (audio.pouch) {
        audio.pouch(magKind());
        setTimeout(() => insertMag(after), 480);
      } else setTimeout(() => insertMag(after), 250);
    });
  }
  function toggleMag() {
    if (TUBE) {
      ui?.toast("Подствольный магазин не отстёгивается — R: зарядить");
      return;
    }
    if (st.busy || !asm.info("mag")) return;
    st.busy = true;
    if (st.magIn) dropMag(() => {
      st.busy = false;
      ui?.hud();
    });
    else insertMag(() => {
      st.busy = false;
      ui?.hud();
    });
  }
  function fireModes() {
    for (const it of asm.installed.values()) if (it.info?.modes) return it.info.modes;
    return def.modes;
  }
  function selectorAnim() {
    for (const it of asm.installed.values()) if (it.info?.selector) return it.info.selector;
    return { node: base.nodes?.selector, angles: base.anim?.selector, axis: base.anim?.selectorAxis };
  }
  function poseSelector(instant) {
    const sa = selectorAnim(), a = sa.angles?.[st.mode];
    if (!sa.node || a == null) return;
    const ax = sa.axis || "z";
    if (instant) sa.node.rotation[ax] = a * D2R2;
    else tw.add(sa.node.rotation, ax, a * D2R2, 0.12, ease);
  }
  function setMode(m) {
    st.mode = m;
    audio.selector();
    poseSelector(false);
    ui?.hud();
  }
  function cycleMode() {
    const ms = fireModes();
    setMode(ms[(ms.indexOf(st.mode) + 1) % ms.length]);
  }
  function setADS(on) {
    if (on && !sights.length) {
      ui?.toast("Нет прицельного приспособления");
      return;
    }
    if (on === st.ads) return;
    st.ads = on;
    try {
      if (on) {
        pointer.x = 0.5;
        pointer.y = 0.5;
        if (cvs.requestPointerLock) cvs.requestPointerLock();
      } else if (document.pointerLockElement) document.exitPointerLock();
    } catch (e) {
    }
    if (on) {
      orbitPose.pos.copy(S.camera.position);
      orbitPose.quat.copy(S.camera.quaternion);
      controls.enabled = false;
      st.yaw = 0;
      st.pitch = 0;
      const s = sights[st.sightIdx];
      if (s?.zoom) st.zoom = clamp(st.zoom, s.zoom[0], s.zoom[1]);
    }
    audio.shoulder ? audio.shoulder(on) : audio.click();
    ui?.hud();
  }
  function cycleSight() {
    if (sights.length < 2) {
      ui?.toast(sights.length ? "Другого прицела нет" : "Нет прицела");
      return;
    }
    const cur = sights[st.sightIdx];
    st.sightIdx = (st.sightIdx + 1) % sights.length;
    st.zoomMul = 1;
    const nx = sights[st.sightIdx];
    /* v26: увеличитель откидывается вбок, когда уходим с него (или берём сам коллиматор), и
       возвращается на линию, когда круг доходит до него. Раньше «Прицел: коллиматор» при
       стоящем увеличителе смотрел в его глухой корпус — «ничего не видно» */
    const mgFlip = asm.installed.get("magnifier")?.info?.flipAside;
    if (nx.id === "magnifier") { if (st.magAside) toggleMagnifier(false); }
    else if (mgFlip && !st.magAside && (cur?.id === "magnifier" || nx.id === "optic")) toggleMagnifier(true);
    ui?.toast("Прицел: " + sights[st.sightIdx].label + (mgFlip && cur?.id === "magnifier" && nx.id !== "magnifier" ? " · увеличитель откинут" : ""));
    ui?.hud();
  }
  function toggleMagnifier(aside) {
    const mg = asm.installed.get("magnifier");
    if (!mg?.info?.flipAside) return;
    st.magAside = aside ?? !st.magAside;
    const fa = mg.info.flipAside;
    tw.add(fa.node.rotation, "x", st.magAside ? fa.angle * D2R2 : 0, 0.22, ease);
    audio.click();
    const mi = sights.findIndex((s) => s.id === "magnifier");
    if (st.magAside && sights[st.sightIdx]?.id === "magnifier") st.sightIdx = 0;
    else if (!st.magAside && mi >= 0) st.sightIdx = mi;
    ui?.hud();
  }
  /* ---------------------------------------------------------- батареи, фонари, ЛЦУ */
  // Каждый модуль с фонарём/ЛЦУ — своя батарея (у комбо-блоков общая на оба излучателя).
  // Время работы на полной мощности — 20…30 мин; стабилизированный драйвер держит яркость
  // до ≈15 % заряда, дальше свет садится, под конец мерцает и гаснет.
  // Каждый излучатель включается отдельно: C/Z — основной (первый заряженный), Shift+C/Shift+Z —
  // второй. Если включённый сел, а второй того же типа заряжен — второй включается сам.
  const BATT_LS = "gunsmith:batt:" + def.id;
  try {
    Object.assign(st.batt, JSON.parse(localStorage.getItem(BATT_LS) || "{}"));
  } catch (e) {
  }
  function battKey(it) {
    return it.slotId + ":" + (it.part?.id || "base");
  }
  function emKey(it, kind) {
    return battKey(it) + ":" + kind;
  }
  function charged(it) {
    return (st.batt[battKey(it)] ?? 1) > 0;
  }
  function isOn(it, kind) {
    return !!st.emOn[emKey(it, kind)];
  }
  function syncEmitterFlags() {
    st.light = lights.some((l) => isOn(l, "light"));
    st.laser = lasers.some((l) => isOn(l, "laser"));
  }
  function slotLabel(it) {
    return def.slots.find((s) => s.id === it.slotId)?.label || it.part?.name || "";
  }
  function emName(kind, i, n) {
    return (kind === "light" ? "Фонарь" : "ЛЦУ") + (n > 1 ? " " + (i + 1) : "");
  }
  function powerOf(it) {
    return { ...POWER_DEF, ...it.part?.power || {} };
  }
  function lightSpec(it) {
    const d = it.data, lm = d.lumens || 500;
    const cd = d.cd ?? lm * 22;
    return {
      key: it.slotId + ":" + (it.part?.id || ""),
      lm,
      cd,
      hot: d.hot ?? (cd / lm > 28 ? 0.15 : 0.21),
      spill: d.spill ?? 0.085,
      angle: d.angle ?? 0.62,
      kelvin: d.kelvin ?? 6200,
      throw: Math.min(130, 2 * Math.sqrt(cd) * 0.45),
      lensR: (d.lensR ?? 11) / 1e3,
      batt: it.part?.power?.light ?? d.batt ?? (lm >= 1000 ? 21 : lm >= 600 ? 24 : 28)
    };
  }
  function laserBatt(it) {
    return it.part?.power?.laser ?? it.data.batt ?? (it.info?.light ? 26 : 30);
  }
  // расход заряда в секунду: доля батареи; у комбо-блока складывается из включённых излучателей
  function drainRate(k, assumeOn = false) {
    let r = 0;
    for (const l of lights) if (battKey(l) === k && (assumeOn || isOn(l, "light"))) r += 1 / (lightSpec(l).batt * 60);
    for (const l of lasers) if (battKey(l) === k && (assumeOn || isOn(l, "laser"))) r += 1 / (laserBatt(l) * 60);
    return r;
  }
  function battLevel(c) {
    if (c <= 0) return 0;
    let v = c > 0.15 ? 1 : 0.2 + 0.8 * Math.pow(c / 0.15, 1.6);
    if (c < 0.04) v *= Math.random() < 0.12 ? 0.15 : 0.75 + Math.random() * 0.25;
    return v;
  }
  function lensGlow() {
    const t = performance.now() / 1e3;
    for (const l of lights) {
      const k = isOn(l, "light") ? lightOutput(st.batt[battKey(l)] ?? 1, powerOf(l).driver, t).k : 0;
      l.data.lens.material.emissiveIntensity = 7 * k;
      if (l.data.refl) l.data.refl.material.emissiveIntensity = 0.9 * k;
    }
    for (const l of lasers) l.data.lens.material.emissiveIntensity = isOn(l, "laser") ? 5 * laserOutput(st.batt[battKey(l)] ?? 1, t) : 0;
  }

  function saveBatt() {
    try {
      localStorage.setItem(BATT_LS, JSON.stringify(st.batt));
    } catch (e) {
    }
  }
  let battSaveT = 0, battHudT = 0;
  function drainBatteries(dt) {
    if (!st.light && !st.laser) return;
    const used = /* @__PURE__ */ new Set();
    for (const l of lights) if (isOn(l, "light")) used.add(battKey(l));
    for (const l of lasers) if (isOn(l, "laser")) used.add(battKey(l));
    const died = [];
    for (const k of used) {
      const before = st.batt[k] ?? 1;
      st.batt[k] = Math.max(0, before - drainRate(k) * dt);
      if (before > 0 && st.batt[k] === 0) died.push(k);
    }
    if (died.length) {
      const msgs = [];
      for (const [kind, list] of [["light", lights], ["laser", lasers]]) {
        const dead = list.filter((l) => died.includes(battKey(l)) && isOn(l, kind));
        if (!dead.length) continue;
        for (const l of dead) st.emOn[emKey(l, kind)] = false;
        const name = emName(kind, list.indexOf(dead[0]), list.length);
        // резерв: другой излучатель того же типа с зарядом — включается сам, если ничего не светит
        const spare = list.find((l) => !isOn(l, kind) && charged(l));
        if (spare && !list.some((l) => isOn(l, kind))) {
          st.emOn[emKey(spare, kind)] = true;
          msgs.push(`${name}: батарея села — включён ${emName(kind, list.indexOf(spare), list.length).toLowerCase()}`);
        } else msgs.push(`${name}: батарея села — U: заменить`);
      }
      syncEmitterFlags();
      if (msgs.length) ui?.toast(msgs.join(" · "));
      audio.click();
    }
    lensGlow();
    battSaveT += dt;
    battHudT += dt;
    if (battSaveT > 5) {
      battSaveT = 0;
      saveBatt();
    }
    if (battHudT > 1 || died.length) {
      battHudT = 0;
      ui?.hud();
    }
  }
  // Состояние батарей для HUD: заряд, оставшееся время (обратный отсчёт м:сс при текущем расходе;
  // для выключенного — на полной мощности), клавиша управления.
  function battInfo() {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const [kind, list] of [["light", lights], ["laser", lasers]]) list.forEach((l, i) => {
      const k = battKey(l);
      if (seen.has(k)) return;
      seen.add(k);
      const c = st.batt[k] ?? 1;
      const both = lights.some((x) => battKey(x) === k) && lasers.some((x) => battKey(x) === k);
      const onNow = drainRate(k) > 0;
      const rate = onNow ? drainRate(k) : 1 / ((kind === "light" ? lightSpec(l).batt : laserBatt(l)) * 60);
      const sec = c / rate;
      const li = lights.findIndex((x) => battKey(x) === k), zi = lasers.findIndex((x) => battKey(x) === k);
      const keysTxt = [li >= 0 ? (li ? "⇧" + __AB.L : __AB.L) : null, zi >= 0 ? (zi ? "⇧" + __AB.Z : __AB.Z) : null].filter(Boolean).join("/");
      out.push({
        key: k,
        label: both ? "Фонарь+ЛЦУ" + (lights.length > 1 || lasers.length > 1 ? " " + (Math.max(li, zi) + 1) : "") : emName(kind, i, list.length),
        slot: slotLabel(l),
        pct: Math.round(c * 100),
        sec,
        time: mmss(sec),
        min: Math.round(sec / 60),
        on: onNow,
        keys: keysTxt
      });
    });
    return out;
  }
  function replaceBatteries() {
    const all = [...lights, ...lasers];
    if (!all.length) {
      ui?.toast("Нет модулей с батареями");
      return;
    }
    for (const l of all) st.batt[battKey(l)] = 1;
    const cells = [...new Set(all.map((l) => powerOf(l).cells))];
    audio.batteryChange ? audio.batteryChange(cells[0]) : audio.click();
    saveBatt();
    lensGlow();
    ui?.toast("Батареи заменены: " + cells.join(", ") + " — 100 %");
    ui?.hud();
  }
  // which: "main" — основной (C/Z): выключает все излучатели типа или включает первый заряженный;
  // число — конкретный излучатель (Shift — второй).
  function toggleEmitter(kind, which = "main") {
    const list = kind === "light" ? lights : lasers;
    const noun = kind === "light" ? "Фонарь" : "ЛЦУ";
    if (!list.length) {
      ui?.toast(noun + " не установлен");
      return;
    }
    let msg = null;
    if (which === "main") {
      if (list.some((l) => isOn(l, kind))) for (const l of list) st.emOn[emKey(l, kind)] = false;
      else {
        const l = list.find(charged);
        if (!l) {
          audio.click();
          ui?.toast(`Батарея ${kind === "light" ? "фонаря" : "ЛЦУ"} разряжена — U: заменить`);
          return;
        }
        st.emOn[emKey(l, kind)] = true;
        if (l !== list[0]) msg = `${emName(kind, 0, list.length)} разряжен — включён ${emName(kind, list.indexOf(l), list.length).toLowerCase()}`;
      }
    } else {
      const l = list[Math.min(which, list.length - 1)];
      if (!isOn(l, kind) && !charged(l)) {
        audio.click();
        ui?.toast(`${emName(kind, list.indexOf(l), list.length)}: батарея разряжена — U: заменить`);
        return;
      }
      st.emOn[emKey(l, kind)] = !isOn(l, kind);
    }
    syncEmitterFlags();
    if (kind === "light") audio.tailcap?.(st.light) ?? audio.click();
    else audio.click();
    lensGlow();
    if (msg) ui?.toast(msg);
    ui?.hud();
  }
  const toggleLight = (which) => toggleEmitter("light", which);
  const toggleLaser = (which) => toggleEmitter("laser", which);
  function emitterList() {
    return { lights: lights.map((l, i) => ({ i, on: isOn(l, "light"), charged: charged(l), slot: slotLabel(l) })), lasers: lasers.map((l, i) => ({ i, on: isOn(l, "laser"), charged: charged(l), slot: slotLabel(l) })) };
  }
  /* ---------------------------------------------------------- прицельные сетки */
  // Выбор сетки и цвета подсветки хранится по модулю прицела (у всех образцов оружия общий).
  const RET_LS = "gunsmith:reticle";
  try {
    Object.assign(st.ret, JSON.parse(localStorage.getItem(RET_LS) || "{}"));
  } catch (e) {
  }
  function retOf(s) {
    if (!s || !s.reticle) return null;
    const set = reticleSet(s.reticle);
    const saved = st.ret[s.rkey || s.id] || {};
    return { set, id: set.includes(saved.id) ? saved.id : set[0], color: saved.color || RET_DEFAULT_COLOR[s.reticle] || "red" };
  }
  function applyReticles() {
    for (const s of sights) {
      const r = retOf(s);
      if (r && s.src?.retMesh) reticleApply(s.src.retMesh, r.id, r.color, holdCtx(s));
    }
    ui?.scope(null, null, true);
    app?.invalidate?.();
  }
  // текущий прицел с сеткой (увеличитель — сетка основного коллиматора)
  function retSight() {
    const s = sights[st.sightIdx];
    if (s?.id === "magnifier") return sights[0];
    return s?.reticle ? s : null;
  }
  function cycleReticle() {
    const s = retSight();
    if (!s) {
      ui?.toast(sights[st.sightIdx]?.irons ? "У механического прицела сетки нет" : "Нет прицела с сеткой");
      return;
    }
    const r = retOf(s);
    if (r.set.length < 2) {
      ui?.toast("У этого прицела одна сетка");
      return;
    }
    const id = r.set[(r.set.indexOf(r.id) + 1) % r.set.length];
    st.ret[s.rkey || s.id] = { ...st.ret[s.rkey || s.id], id };
    try {
      localStorage.setItem(RET_LS, JSON.stringify(st.ret));
    } catch (e) {
    }
    applyReticles();
    audio.click();
    ui?.toast(`Сетка: ${RETICLES[id]?.name || id} (${r.set.indexOf(id) + 1}/${r.set.length})`);
    ui?.hud();
  }
  function cycleReticleColor() {
    const s = retSight();
    if (!s) {
      ui?.toast("Нет прицела с подсветкой");
      return;
    }
    const r = retOf(s);
    const i = RET_COLORS.findIndex((c) => c.id === r.color);
    const c = RET_COLORS[(i + 1) % RET_COLORS.length];
    st.ret[s.rkey || s.id] = { ...st.ret[s.rkey || s.id], id: r.id, color: c.id };
    try {
      localStorage.setItem(RET_LS, JSON.stringify(st.ret));
    } catch (e) {
    }
    applyReticles();
    audio.click();
    ui?.toast("Подсветка: " + c.name);
    ui?.hud();
  }
  function reticleInfo() {
    const s = retSight();
    const r = retOf(s);
    if (!r) return null;
    return { id: r.id, name: RETICLES[r.id]?.name || r.id, color: r.color, n: r.set.length, i: r.set.indexOf(r.id), ctx: holdCtx(s), sight: s };
  }
  function cycleTrace() {
    st.trace = TRACE_MODES[(TRACE_MODES.indexOf(st.trace) + 1) % TRACE_MODES.length];
    try {
      localStorage.setItem("gunsmith:trace", st.trace);
    } catch (e) {
    }
    audio.click();
    ui?.toast("Трасса: " + TRACE_LABEL[st.trace]);
    ui?.hud();
  }
  try {
    const tm = localStorage.getItem("gunsmith:trace");
    if (TRACE_MODES.includes(tm)) st.trace = tm;
  } catch (e) {
  }
  /* ---------------------------------------------------------- освещение тира: день / ночь */
  const TIME_LABEL = { day: "День", night: "Ночь" };
  function setNight(on, silent) {
    on = false; // v21: ночи нет совсем — тир всегда при дневном освещении
    st.night = !!on;
    S.setNight(st.night);
    fx.night = st.night;
    try {
      localStorage.setItem("gunsmith:night", st.night ? "1" : "0");
    } catch (e) {
    }
    if (!silent) {
      audio.lightSwitch ? audio.lightSwitch() : audio.click();
      ui?.toast(st.night ? "Ночь: освещение тира выключено" + (lights.length ? "" : " — поставьте фонарь") : "День: освещение тира включено");
    }
    app?.invalidate?.();
    ui?.hud();
  }
  function cycleTime() {
    /* v21: ночь убрана — переключатель времени суток выключен */
  }
  function toggleBipod() {
    const b = asm.withInfo("bipod")[0];
    if (!b) {
      ui?.toast("Сошки не установлены");
      return;
    }
    st.bipod = !st.bipod;
    for (const l of b.data.legs) tw.add(l.rotation, "z", st.bipod ? b.data.angle * D2R2 : 0, 0.3, ease);
    audio.bipod();
    ui?.hud();
  }
  function toggleFold() {
    const f2 = asm.withInfo("fold")[0];
    if (!f2) {
      ui?.toast("Приклад не складывается");
      return;
    }
    st.folded = !st.folded;
    const ax = f2.data.axis || "y";
    // телескопический приклад: сдвиг вдоль оси вместо поворота
    if (f2.data.slide) tw.add(f2.data.node.position, "x", st.folded ? f2.data.slide : 0, 0.3, ease);
    else tw.add(f2.data.node.rotation, ax, st.folded ? f2.data.angle * D2R2 : 0, 0.4, ease);
    audio.fold();
    ui?.hud();
  }
  function setPart(slotId, partId, pos) {
    const next = { ...cfg, [slotId]: partId ? { id: partId, pos: pos ?? (cfg[slotId]?.id === partId ? cfg[slotId].pos : null) } : null };
    const slotDef = def.slots.find((s) => s.id === slotId);
    // слот, которому нужен определённый модуль-носитель (резьба на стволе Glock): ставим его сами
    let via = null;
    if (partId && slotDef?.via && !asm.mounts.has(slotDef.mount) && cfg[slotDef.via.slot]?.id !== slotDef.via.part) {
      next[slotDef.via.slot] = { id: slotDef.via.part };
      via = asm.part(slotDef.via.part)?.name;
    }
    const newPart = partId && asm.part(partId);
    if (newPart && slotDef?.behind && !asm.railPositions(slotDef, newPart, slotId).some((p) => !p.clash)) {
      const room = asm.roomBehind(slotDef, newPart);
      if (room) next[slotDef.behind] = { id: cfg[slotDef.behind].id, pos: { rail: room.rail, i: room.i } };
    }
    const before = JSON.stringify(cfg);
    applyConfig(next);
    const part = partId && asm.part(partId);
    if (part) {
      const slot2 = def.slots.find((s) => s.id === slotId);
      audio.attach(slot2?.mount === "muzzle" ? "thread" : /poly/.test(part.cat) ? "poly" : "rail");
    } else audio.click();
    const lost = def.slots.filter((s) => next[s.id]?.id && !cfg[s.id]).map((s) => asm.part(next[s.id].id)?.name).filter(Boolean);
    if (partId && !cfg[slotId]) ui?.toast("Не помещается: " + (asm.part(partId)?.name || ""));
    else if (via && cfg[slotId]) ui?.toast("Установлен " + via.charAt(0).toLowerCase() + via.slice(1));
    else if (lost.length && before !== JSON.stringify(cfg)) ui?.toast("Снято: " + lost.join(", "));
    saveCfg();
  }
  function railMove(slotId, dir) {
    const it = asm.installed.get(slotId);
    if (!it?.railPos) return;
    const slot2 = def.slots.find((s) => s.id === slotId);
    const ps = asm.railPositions(slot2, it.part, slotId).filter((p) => !p.clash);
    const i = ps.findIndex((p) => p.rail === it.railPos.rail && p.i === it.railPos.i);
    const n = ps[clamp(i + dir, 0, ps.length - 1)];
    if (!n || n === ps[i]) return;
    applyConfig({ ...cfg, [slotId]: { id: it.part.id, pos: { rail: n.rail, i: n.i } } });
    audio.click();
    saveCfg();
  }
  function railInfo(slotId) {
    const it = asm.installed.get(slotId);
    if (!it?.railPos) return null;
    const slot2 = def.slots.find((s) => s.id === slotId);
    const ps = asm.railPositions(slot2, it.part, slotId).filter((p) => !p.clash);
    const i = ps.findIndex((p) => p.rail === it.railPos.rail && p.i === it.railPos.i);
    return { i, n: ps.length };
  }
  const LS = (window.__AEGIS_LS || "gunsmith:") + def.id;
  function saveCfg() {
    try {
      localStorage.setItem(LS, JSON.stringify(cfg));
    } catch (e) {
    }
    try {
      if (window.__AEGIS_ONCFG) window.__AEGIS_ONCFG(def.id, JSON.parse(JSON.stringify(cfg)));
      if (window.parent && window.parent !== window) window.parent.postMessage({ aegis: "cfg", id: def.id, cfg: JSON.parse(JSON.stringify(cfg)) }, "*");
    } catch (e) {
    }
  }
  function resetCfg() {
    applyConfig(def.defaults, { init: true });
    saveCfg();
    audio.click();
  }
  function focusSlot(slotId) {
    if (st.ads) return;
    const it = asm.installed.get(slotId);
    const slot2 = def.slots.find((s) => s.id === slotId);
    let obj = it?.obj;
    if (!obj) {
      const mid = slot2?.mount || slot2?.rails?.find((r) => asm.mounts.get(r));
      obj = mid && asm.mounts.get(mid);
    }
    if (!obj) {
      focusTarget.copy(homeTarget);
      focusDist = null;
      return;
    }
    const box2 = boundsOf(obj);
    if (box2.isEmpty()) obj.getWorldPosition(focusTarget);
    else box2.getCenter(focusTarget);
    focusDist = 0.55;
    homeFocus = false;
  }
  // Габарит модуля без сеток коллиматоров: плоскость сетки вынесена на 60 м вперёд
  // (так она не зависит от параллакса), и в Box3.setFromObject камера улетала за стрельбище.
  function boundsOf(obj) {
    const box2 = new THREE8.Box3(), b = new THREE8.Box3();
    obj.updateWorldMatrix(true, true);
    obj.traverse((o) => {
      if (!o.isMesh || o.userData.reticle || o.userData.wcover || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box2.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    });
    return box2;
  }
  function unfocus(home) {
    focusTarget.copy(homeTarget);
    focusDist = home ? homeDist : null;
    homeFocus = !!home;
  }
  const pointer = { x: 0.5, y: 0.5 };
  const cvs = S.renderer.domElement;
  cvs.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement && st.ads) setADS(false);
  });
  /* смена прицела: та же кнопка, что в полигоне (по умолчанию нажатие колеса),
     берётся из настроек AEGIS, если оружейная открыта из игры */
  const sightCode = () => {
    try { const b = window.AEGIS && window.AEGIS.loadSettings && window.AEGIS.loadSettings().binds; if (b && b.sight) return b.sight; } catch (er) {}
    return "Mouse1";
  };
  cvs.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
  cvs.addEventListener("pointerdown", (e) => {
    audio.init();
    if ("Mouse" + e.button === sightCode()) {
      cycleSight();
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      setADS(!st.ads);
      e.preventDefault();
      return;
    }
    if (e.button === 0 && st.ads) {
      triggerDown();
      e.preventDefault();
    }
  });
  addEventListener("pointerup", (e) => {
    if (e.button === 0) triggerUp();
  });
  cvs.addEventListener("pointermove", (e) => {
    if (st.ads) {
      /* наводка в прицеле — как в шутере: смещение мыши сразу поворачивает
         оружие (накопление угла), без сглаживания к позиции курсора;
         в оптике чувствительность падает пропорционально полю зрения */
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      const k = (window.__AEGIS_SENS || 1) * 0.0016 * clamp(S.camera.fov / 60, 0.08, 1);
      st.yaw = clamp(st.yaw - dx * k, -0.7, 0.7);
      st.pitch = clamp(st.pitch - dy * k, -0.45, 0.45);
      return;
    }
    if (document.pointerLockElement === cvs) return;
    pointer.x = e.clientX / innerWidth;
    pointer.y = e.clientY / innerHeight;
    hover(e);
  });
  cvs.addEventListener("wheel", (e) => {
    if (!st.ads) return;
    zoomStep(e.deltaY < 0 ? 1 : -1);
    e.preventDefault();
  }, { passive: false });
  cvs.addEventListener("click", (e) => {
    if (!st.ads && !dragged) pick(e);
  });
  let downAt = null, dragged = false;
  cvs.addEventListener("pointerdown", (e) => {
    downAt = [e.clientX, e.clientY];
    dragged = false;
  });
  cvs.addEventListener("pointermove", (e) => {
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) dragged = true;
  });
  function triggerDown() {
    audio.init();
    if (st.trigger) return;
    st.trigger = true;
    st.held = true;
    st.burst = 0;
    if (st.mode === "safe") {
      audio.click();
      ui?.toast("Предохранитель (X — режим огня)");
      return;
    }
    if (!canFire()) return;
    if (fireOnce()) {
      st.nextShot = performance.now() / 1e3 + 60 / (st.stats.rpm || def.base.rpm);
      if (st.mode === "burst") st.burstLeft = (def.burstN || 3) - 1;
    }
  }
  function triggerUp() {
    st.trigger = false;
    st.burst = 0;
  }
  // Кратность в прицеливании: у переменной — её диапазон; у постоянной — 0,75…2 от штатной;
  // у коллиматора, механики и «по стволу» — до 2× (прищур, как ближе к мишени).
  function zoomRange(s) {
    if (!s) return [1, 1];
    if (s.zoom) return s.zoom;
    return s.mag > 1.2 ? [0.75, 2] : [1, 2];
  }
  function zoomStep(dir) {
    const s = sights[st.sightIdx];
    if (!s) return;
    const [lo, hi] = zoomRange(s);
    const k = dir > 0 ? 1.18 : 1 / 1.18;
    if (s.zoom) st.zoom = clamp(st.zoom * k, lo, hi);
    else {
      st.zoomMul = clamp(st.zoomMul * k, lo, hi);
      if (Math.abs(st.zoomMul - 1) < 0.05) st.zoomMul = 1;
    }
    ui?.hud();
    app?.invalidate?.();
  }
  const keys = {
    Equal: () => zoomStep(1),
    NumpadAdd: () => zoomStep(1),
    Minus: () => zoomStep(-1),
    NumpadSubtract: () => zoomStep(-1),
    KeyR: reload,
    KeyX: cycleMode,
    KeyF: () => setADS(!st.ads),
    KeyN: () => toggleMagnifier(),
    KeyG: (e) => e?.shiftKey ? cycleReticleColor() : cycleReticle(),
    KeyY: cycleTrace,
    KeyP: cycleTime,
    KeyQ: () => app.cycleQuality?.(),
    KeyU: replaceBatteries,
    KeyB: toggleBipod,
    KeyK: toggleFold,
    KeyO: () => {
      if (!st.busy) {
        st.busy = true;
        charge(() => {
          st.busy = false;
          ui?.hud();
        });
      }
    },
    KeyM: toggleMag,
    Escape: () => setADS(false),
    KeyH: () => ui?.toggleHelp()
  };
  keys[__AB.light] = (e) => toggleLight(e?.shiftKey ? 1 : "main");
  keys[__AB.laser] = (e) => toggleLaser(e?.shiftKey ? 1 : "main");
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (window.parent && window.parent !== window) {
      if (e.code === "Escape" && !st.ads) {
        try { window.parent.postMessage({ aegis: "esc" }, "*"); } catch (er) {}
        return;
      }
      if (e.code === "Tab") { e.preventDefault(); return; }
    }
    audio.init();
    if (e.code === "Space") {
      if (!e.repeat) triggerDown();
      e.preventDefault();
      return;
    }
    if (e.repeat && !/^(Equal|Minus|NumpadAdd|NumpadSubtract)$/.test(e.code)) return;
    if (e.code === sightCode()) { cycleSight(); e.preventDefault(); return; }
    const fn = keys[e.code];
    if (fn) {
      fn(e);
      e.preventDefault();
    }
  });
  addEventListener("keyup", (e) => {
    if (e.code === "Space") triggerUp();
  });
  const ray = new THREE8.Raycaster();
  let hoverT = 0;
  function partUnder(e) {
    const p = new THREE8.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(p, S.camera);
    const hs = ray.intersectObject(gun, true);
    for (const h of hs) {
      if (!h.object.visible || h.object.userData.reticle) continue;
      let o = h.object;
      while (o && !o.userData.slotId && o !== gun) o = o.parent;
      if (o && o.userData.slotId) return o.userData;
      return { base: true };
    }
    return null;
  }
  function hover(e) {
    if (st.ads || e.buttons) {
      ui?.tip(null);
      return;
    }
    const now = performance.now();
    if (now - hoverT < 60) return;
    hoverT = now;
    const u = partUnder(e);
    if (u && u.partId) ui?.tip(asm.part(u.partId)?.name, e.clientX, e.clientY);
    else if (u && u.base) ui?.tip(def.title, e.clientX, e.clientY);
    else ui?.tip(null);
  }
  function pick(e) {
    const u = partUnder(e);
    if (u?.slotId) ui?.openSlot(u.slotId);
  }
  const adsPose = { pos: new THREE8.Vector3(), quat: new THREE8.Quaternion(), fov: baseFov };
  const clock = new THREE8.Clock();
  const camKick = new THREE8.Quaternion();
  const eulerTmp = new THREE8.Euler();
  function applyViewOffset() {
    const o = Math.round(st.viewOff || 0);
    if (o === lastViewOff) return;
    lastViewOff = o;
    camDirty = true;
    if (Math.abs(o) < 1) {
      if (S.camera.view) S.camera.clearViewOffset();
      return;
    }
    S.camera.setViewOffset(innerWidth, innerHeight, -o, 0, innerWidth, innerHeight);
  }
  let lastViewOff = null;
  addEventListener("resize", () => {
    lastViewOff = null;
  });
  let defocused = null;
  function restoreFocus() {
    defocused?.traverse((m) => {
      if (m.userData.sharpMat) {
        m.material.dispose();
        m.material = m.userData.sharpMat;
        delete m.userData.sharpMat;
      }
    });
    defocused = null;
  }
  function defocus(obj, k) {
    if (defocused && defocused !== obj) restoreFocus();
    if (!obj || k < 0.01) {
      if (defocused) restoreFocus();
      return;
    }
    defocused = obj;
    obj.traverse((m) => {
      if (!m.isMesh || m.userData.reticle) return;
      if (!m.userData.sharpMat) {
        m.userData.sharpMat = m.material;
        m.material = m.material.clone();
        m.material.transparent = true;
        m.material.depthWrite = false;
      }
      // глаз сфокусирован на мушке: близкий диоптр размыт и «просвечивает»
      m.material.opacity = 1 - 0.62 * k;
    });
  }
  // Диоптр вблизи глаза: глаз держит в фокусе мушку, барабан вокруг отверстия размыт.
  // Размытие — backdrop-filter по маске-кольцу, радиус отверстия считается из геометрии.
  const ghost = document.createElement("div");
  ghost.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;transition:none";
  document.body.appendChild(ghost);
  let ghostKey = "";
  function ghostRing(p, k) {
    if (!p || k < 0.02) {
      if (ghostKey) ghost.style.opacity = "0", ghostKey = "";
      return;
    }
    const rh = p.s.apertureR ?? 1.8, d = (p.s.eyeDist ?? 75) + 0.5;
    const px = Math.atan(rh / d) / Math.tan(S.camera.fov * D2R2 / 2) * innerHeight / 2;
    const key = Math.round(px) + "|" + k.toFixed(2);
    if (key === ghostKey) return;
    ghostKey = key;
    const r0 = px * 0.92, r1 = px * 1.35;
    const m = `radial-gradient(circle at 50% 50%, transparent ${r0}px, #000 ${r1}px)`;
    ghost.style.backdropFilter = ghost.style.webkitBackdropFilter = `blur(${(9 * k).toFixed(1)}px) brightness(${(1 - 0.25 * k).toFixed(2)})`;
    ghost.style.maskImage = ghost.style.webkitMaskImage = m;
    ghost.style.opacity = String(Math.min(1, k * 1.2));
  }
  function update(dt) {
    tw.update(dt);
    const now = performance.now() / 1e3;
    if (st.burstLeft > 0 && st.mode === "burst" && now >= (st.nextShot || 0)) {
      if (st.chambered && canFire()) {
        fireOnce();
        st.nextShot = Math.max(now, st.nextShot || now) + 60 / (st.stats.rpm || def.base.rpm);
        st.burstLeft--;
      } else st.burstLeft = 0;
    }
    if (st.trigger && st.held && st.mode === "auto" && canFire() && st.chambered && now >= (st.nextShot || 0)) {
      fireOnce();
      st.nextShot = Math.max(now, st.nextShot || now) + 60 / (st.stats.rpm || def.base.rpm);
    }
    if (st.trigger && st.mode === "auto" && !st.chambered && st.held && now >= (st.nextShot || 0)) {
      audio.dryFire();
      st.held = false;
    }
    const r = st.rec;
    const k = 180, d = 20;
    r.vp += (-k * r.p - d * r.vp) * dt;
    r.p += r.vp * dt;
    r.vy += (-k * r.y - d * r.vy) * dt;
    r.y += r.vy * dt;
    r.vz += (-260 * r.z - 26 * r.vz) * dt;
    r.z += r.vz * dt;
    st.climb *= Math.pow(0.12, dt);
    if (!st.ads) {
      st.yaw = lerp(st.yaw, 0, 1 - Math.pow(0.01, dt));
      st.pitch = lerp(st.pitch, 0, 1 - Math.pow(0.01, dt));
    }
    const cs = sights[st.sightIdx];
    const cant = st.adsT > 0 && cs?.up ? -Math.atan2(cs.up.z, cs.up.y) * ease(st.adsT) : 0;
    aim.rotation.set(cant, st.yaw, st.pitch + st.climb, "YZX");
    rig.position.set(-r.z * 1e-3 * 12 + pivotX * 0, 0, 0);
    rig.rotation.set(0, r.y * D2R2 * 0.6, r.p * D2R2 * 0.5);
    rig.position.x -= pivotX * (Math.cos(r.p * D2R2 * 0.5) - 1);
    rig.position.y = -pivotX * Math.sin(r.p * D2R2 * 0.5);
    st.adsT = clamp(st.adsT + (st.ads ? 1 : -1) * dt / ((st.stats.adsTime || 280) / 1e3 + 0.05), 0, 1);
    if (st.adsT > 0) {
      const p = sightPose(adsPose);
      if (p) {
        aim.updateMatrixWorld();
        const wpos = p.pos.clone().applyMatrix4(aim.matrixWorld);
        eulerTmp.set(0, r.y * D2R2 * 0.15, r.p * D2R2 * 0.22, "YZX");
        camKick.setFromEuler(eulerTmp);
        const wq = aim.getWorldQuaternion(new THREE8.Quaternion()).multiply(camKick).multiply(p.quat);
        const e = ease(st.adsT);
        S.camera.position.lerpVectors(orbitPose.pos, wpos, e);
        S.camera.quaternion.slerpQuaternions(orbitPose.quat, wq, e);
        S.camera.fov = lerp(baseFov, p.fov, e);
        st.viewOff = lerp(st.viewOff || 0, 0, e);
        applyViewOffset();
        S.camera.updateProjectionMatrix();
        const magnified = p.mag > 1.5 && st.adsT > 0.92;
        gun.visible = !magnified;
        ui?.scope(magnified ? p : null, st.adsT > 0.92 ? p : null);
        const nv = !!p.s.nv && !st.magAside && st.adsT > 0.85;
        ui?.nv(nv);
        for (const q of sights) if (q.hide) q.hide.visible = !(nv && q === p.s);
        ghostRing(p.s.irons && p.s.type === "aperture" ? p : null, e);
      }
      if (!st.ads && st.adsT === 0) {
        controls.enabled = true;
      }
    } else {
      if (S.camera.fov !== baseFov) {
        S.camera.fov = baseFov;
        S.camera.updateProjectionMatrix();
      }
      const off = ui ? ui.viewOffset() : 0;
      st.viewOff = lerp(st.viewOff || 0, off, 1 - Math.pow(0.01, dt));
      gun.visible = true;
      ui?.scope(null, null);
      ui?.nv(false);
      for (const q of sights) if (q.hide) q.hide.visible = true;
      if (defocused) restoreFocus();
      ghostRing(null, 0);
      controls.enabled = true;
      controls.target.lerp(focusTarget, 1 - Math.pow(0.02, dt));
      if (focusDist) {
        const off2 = S.camera.position.clone().sub(controls.target);
        const l = off2.length();
        if (Math.abs(l - focusDist) > 0.01) S.camera.position.copy(controls.target).addScaledVector(off2.normalize(), lerp(l, focusDist, 1 - Math.pow(0.05, dt)));
        else if (homeFocus) { focusDist = null; homeFocus = false; }
      }
      applyViewOffset();
      controls.update();
    }
    gun.updateMatrixWorld(true);
    drainBatteries(dt);
    // каждый включённый излучатель — свой луч (до двух фонарей и двух ЛЦУ)
    const tNow = performance.now() / 1e3;
    let ti = 0, beamE = 0;
    for (const L of lights) {
      if (!isOn(L, "light") || ti > 1) continue;
      const p = L.obj.localToWorld(new THREE8.Vector3(...L.data.p));
      const dv = new THREE8.Vector3(1, 0, 0).transformDirection(L.obj.matrixWorld);
      const b = beamOf(L.data);
      b.cd = b.candela * LUX;
      const lo = lightOutput(st.batt[battKey(L)] ?? 1, powerOf(L).driver, tNow + ti * 3.7);
      ray.set(p, dv);
      ray.far = 150;
      const h = ray.intersectObjects(S.range.hitables, false)[0];
      const dist = h ? h.distance : 150;
      fx.setLight({ pos: p, dir: dv, beam: b, k: lo.k, warm: lo.warm, dist, hit: h?.point, hitColor: h?.object.material?.color, cam: S.camera, exposure: st.exposure }, ti++);
      // освещённость в кадре от пятна — для адаптации глаза
      const half = Math.tan(S.camera.fov * D2R2 / 2);
      const cover = Math.min(1, (Math.tan(b.hot * 1.6) / half) ** 2);
      const E = b.cd * lo.k / Math.max(0.35, dist) ** 2;
      beamE += E * 0.5 * (cover + b.spillK) + E * 0.6 * 0.35;
    }
    for (; ti < 2; ti++) fx.setLight(null, ti);
    let zi = 0;
    for (const L of lasers) {
      if (!isOn(L, "laser") || zi > 1) continue;
      const p = L.obj.localToWorld(new THREE8.Vector3(...L.data.p));
      const dv = new THREE8.Vector3(1, 0, 0).transformDirection(L.obj.matrixWorld);
      const zk = laserOutput(st.batt[battKey(L)] ?? 1, tNow + zi * 2.3);
      fx._cam = S.camera; fx._rh = innerHeight || 720;
      fx.setLaser({ pos: p, dir: dv, hitables: S.range.hitables, color: L.data.color ?? 16722458, k: zk, night: st.night }, zi++);
    }
    for (; zi < 2; zi++) fx.setLaser(null, zi);
    // адаптация глаза: к темноте — секунды, к яркому — доли секунды
    const amb = S.ambient();
    const Lsc = amb * 0.5 + beamE;
    st.expTarget = clamp(Math.pow(1.2 / Math.max(1e-5, Lsc), 0.62), 0.32, 11);
    const nvOn = document.body.classList.contains("nv");
    /* v26: у ЭОП автоматическая регулировка яркости (ABC): ночью усиление ×18, днём почти ×1 —
       раньше днём через PVS-14 был сплошной засвет («ничего не видно») */
    const nvGain = nvOn ? clamp(18 * Math.pow(st.expTarget / 11, 1.5), 1.1, 18) : 1;
    const tgt = st.expTarget * nvGain;
    const tau = tgt > st.exposure ? 2.2 : 0.22;
    st.exposure += (tgt - st.exposure) * (1 - Math.exp(-dt / tau));
    if (Math.abs(tgt - st.exposure) < 1e-3) st.exposure = tgt;
    S.renderer.toneMappingExposure = st.exposure;
    fx.setAmbient(amb / 2.2);
    ball.update(dt, S.range.hitables, fx.wind);
    fx.bullets(ball.list, st.trace, S.camera);
    fx.update(dt, (s, n) => audio.casing(0, s.kind, n > 1 ? 0.35 : 0.8), S.camera, fx.heat > 0.3 ? muzzleWorld(mzTmp) : null);
    S.range.update(dt);
  }
  const app = {
    def,
    asm,
    /* v25: окраска оружия: список вариантов и выбор (сохраняется в конфигурации) */
    skins: () => window.GSkins ? window.GSkins.list(def.id) : [],
    get skin() {
      return cfg && cfg.skin || "factory";
    },
    setSkin(sid) {
      if (!window.GSkins || !window.GSkins.valid(def.id, sid)) return false;
      applyConfig({ ...cfg, skin: sid });
      audio.click();
      saveCfg();
      return true;
    },
    /* v26: вся палитра по разделам, окраска отдельных модулей и маскировка */
    catalog: () => window.GSkins && window.GSkins.catalog ? window.GSkins.catalog(def.id) : [],
    get skinMods() {
      return cfg && cfg.skinMods || null;
    },
    /* slot — слот модуля или '*' (все модули); sid — окраска, 'same' (как оружие), 'factory' или null (сбросить) */
    setSkinMod(slot, sid) {
      if (!window.GSkins || !slot) return false;
      if (sid != null && sid !== "same" && sid !== "factory" && !window.GSkins.valid(def.id, sid)) return false;
      const m = { ...(cfg && cfg.skinMods || {}) };
      if (sid == null) delete m[slot];
      else m[slot] = sid;
      applyConfig({ ...cfg, skinMods: Object.keys(m).length ? m : null });
      audio.click();
      saveCfg();
      return true;
    },
    setSkinMods(m) {
      if (!window.GSkins) return false;
      applyConfig({ ...cfg, skinMods: m || null });
      audio.click();
      saveCfg();
      return true;
    },
    /* модули, которые можно покрасить отдельно: { slot, label, name, eff } */
    paintTargets() {
      const G = window.GSkins;
      if (!G || !G.paintable) return [];
      const out = [];
      for (const [slot, it] of asm.installed) {
        if (!it || !it.obj || slot === "ammo" || G.PAINT_SLOTS.has(slot) || !G.paintable(it.obj)) continue;
        const sd = def.slots.find((x) => x.id === slot);
        out.push({ slot, label: sd && sd.label || slot, name: it.part && it.part.name || "", eff: G.effFor(slot, cfg && cfg.skin || "factory", cfg && cfg.skinMods), own: !!(cfg && cfg.skinMods && cfg.skinMods[slot] != null) });
      }
      return out;
    },
    get canWrap() {
      return !!(window.GWCover && window.GWCover.supports(def.id));
    },
    get wrap() {
      return cfg && cfg.wrap || null;
    },
    /* w — { t: 'net' | 'ghillie', c: 'forest' | 'autumn' | 'steppe' | 'winter' } или null */
    setWrap(w) {
      if (!window.GWCover || !window.GWCover.supports(def.id)) return false;
      const t0 = performance.now();
      applyConfig({ ...cfg, wrap: window.GWCover.norm(w) });
      if (window.__WCOVER_LOG) console.info("wrap", JSON.stringify(cfg.wrap || null), (performance.now() - t0).toFixed(1) + " мс");
      audio.click();
      saveCfg();
      return true;
    },
    st,
    S,
    gun,
    rig,
    aim,
    fx,
    audio,
    mats,
    get cfg() {
      return cfg;
    },
    get sights() {
      return sights;
    },
    setPart,
    railMove,
    railInfo,
    resetCfg,
    focusSlot,
    unfocus,
    triggerDown,
    triggerUp,
    reload,
    cycleMode,
    setADS,
    cycleSight,
    toggleMagnifier,
    toggleLight,
    toggleLaser,
    emitterList,
    cycleReticle,
    cycleReticleColor,
    reticleInfo,
    cycleTrace,
    get ball() {
      return ball;
    },
    replaceBatteries,
    battInfo,
    cycleTime,
    setNight,
    get time() {
      return st.night ? "night" : "day";
    },
    timeLabel: () => TIME_LABEL[st.night ? "night" : "day"],
    toggleBipod,
    toggleFold,
    toggleMag,
    charge: () => keys.KeyO(),
    toggleSound: () => {
      audio.init();
      audio.setMuted(!audio.muted);
      ui?.hud();
    },
    defaultStats: null
  };
  let start = def.defaults;
  try {
    const sv = window.__AEGIS_CFG_INIT || JSON.parse(localStorage.getItem(LS) || "null");
    if (sv) start = { ...def.defaults, ...sv };
  } catch (e) {
  }
  const qs = new URLSearchParams(location.search);
  if (qs.get("cfg")) {
    try {
      start = { ...def.defaults, ...JSON.parse(qs.get("cfg")) };
    } catch (e) {
      console.error("cfg", e);
    }
  }
  {
    let tm = qs.get("time") || qs.get("night");
    try {
      tm = tm || (localStorage.getItem("gunsmith:night") === "1" ? "night" : "day");
    } catch (e) {
    }
    setNight(tm === "night" || tm === "1", true);
  }
  applyConfig(def.defaults, { init: true });
  app.defaultStats = { ...st.stats };
  applyConfig(start, { init: true });
  poseSelector(true);
  ui = new UI(app);
  ui.refresh();
  const setView = (v, zoom = 1) => {
    const t = controls.target, dd = f.size / 1e3 * 1.25 / zoom;
    const V = { right: [0, 0.05, 1], left: [0, 0.05, -1], top: [0, 1, 1e-3], front: [1, 0.1, 0.02], back: [-1, 0.1, 0.02], iso: [-0.5, 0.35, 0.8], isoL: [-0.5, 0.35, -0.8], under: [0, -1, 1e-3] }[v] || [-0.15, 0.13, 1];
    const l = Math.hypot(...V);
    S.camera.position.set(t.x + V[0] / l * dd, t.y + V[1] / l * dd, t.z + V[2] / l * dd);
    controls.update();
  };
  if (qs.get("at")) {
    const a = qs.get("at").split(",").map(Number);
    controls.target.set(a[0] / 1e3, GUN_Y + a[1] / 1e3, (a[2] || 0) / 1e3);
    focusTarget.copy(controls.target);
    homeTarget.copy(controls.target);
  }
  if (qs.get("view") || qs.get("zoom") || qs.get("at")) setView(qs.get("view"), +(qs.get("zoom") || 1));
  if (qs.get("ads")) {
    setADS(true);
    st.adsT = 1;
  }
  if (qs.get("ui") === "0") document.body.classList.add("noui");
  app.setView = setView;
  // Прогрев шейдеров: вспышка, дым, искры, гильзы, пробоины и следы пуль компилировались в момент
  // первого выстрела — фриз на секунды на слабой видеокарте. Прогоняем их один кадр под экраном загрузки.
  function prewarm() {
    const V = THREE8.Vector3, p = muzzleWorld(new V(), tmp2), d = tmp2.clone();
    gun.getWorldQuaternion(tq);
    fx.muzzleFlash(p, d, "brake", 1, tq, {});
    fx.shell(p.clone(), new V(0, 1, 0), def.cal, tq, false);
    fx.shell(p.clone(), new V(0, 1, 0), def.cal, tq, true);
    const tgt = S.range.hitables[0];
    if (tgt) {
      tgt.updateWorldMatrix(true, false);
      const hp = new V().setFromMatrixPosition(tgt.matrixWorld);
      for (const surf of ["steel", "dirt"]) fx.impact({ point: hp, object: tgt }, surf, { v: 800 });
    }
    const fake = { p: p.clone().addScaledVector(d, 30), v: d.clone().multiplyScalar(800), origin: p.clone(), alive: true, tracer: true, spec: bulletNow() };
    fx.bullets([fake, { ...fake, tracer: false }], "trace", S.camera);
    const vis = fx.flash.visible;
    S.render();
    fx.flash.visible = vis;
    // всё созданное — убрать
    fx.flash.visible = false;
    fx.flashT = 0;
    fx.flashLight.intensity = 0;
    fx.heat = fx.haze = 0;
    fx.smoke.pool.push(...fx.smoke.list.splice(0));
    fx.fire.pool.push(...fx.fire.list.splice(0));
    fx.smoke.mesh.geometry.instanceCount = fx.fire.mesh.geometry.instanceCount = 0;
    for (const s of fx.shells) s.alive = false;
    for (const m of fx.inst.values()) m.count = 0;
    for (const h of fx.holes.splice(0)) h.parent?.remove(h);
    fx.bullets([], "off", S.camera);
  }
  try {
    prewarm();
  } catch (e) {
    console.warn("prewarm", e);
  }
  if (window.requestIdleCallback) requestIdleCallback(() => audio.prewarm?.(), { timeout: 4e3 });
  else setTimeout(() => audio.prewarm?.(), 1500);
  const bootEl = document.getElementById("boot");
  if (bootEl) bootEl.classList.add("off");
  window.__app = app;
  const R4 = S.renderer;
  R4.shadowMap.autoUpdate = false;
  R4.shadowMap.needsUpdate = true;
  let camDirty = true, sceneDirty = true, idleT = 0;
  controls.addEventListener("change", () => {
    camDirty = true;
  });
  addEventListener("resize", () => {
    camDirty = true;
    sceneDirty = true;
  });
  app.invalidate = () => {
    sceneDirty = true;
  };
  /* ---------------------------------------------------------- предсборка модулей в простое */
  // Процедурная сборка модуля занимает 5–400 мс главного потока (дольше всех — большие прицелы), и
  // раньше она шла прямо в момент клика. Теперь модули открытого слота и модуль под курсором
  // собираются заранее, по одному за простой и только пока кадры не рисуются. Клик берёт готовое
  // из asm.cache. Собрать всё сразу нельзя: это ~140 МБ и секунды CPU, поэтому держим ограниченное
  // число заготовок, лишние (ни разу не показанные, без GPU-ресурсов) выбрасываем.
  const pre = { q: [], lru: [], busyT: 0, pending: false };
  const PRE_KEEP = 24, PRE_SLOT = 12;
  const ric = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 12, didTimeout: false }), 50));
  function preSchedule() {
    if (pre.pending || !pre.q.length) return;
    pre.pending = true;
    ric(prePump);
  }
  function prePump(dl) {
    pre.pending = false;
    if (performance.now() - pre.busyT < 300 || dl.timeRemaining() < 8) {
      setTimeout(preSchedule, 150);
      return;
    }
    const e = pre.q.shift();
    if (e && !asm.cache.has(e.key) && asm.part(e.id)) {
      try {
        asm.built(e.slotId, asm.part(e.id));
        pre.lru.push(e.key);
      } catch (err) {
        console.warn("prebuild", e.key, err);
      }
      while (pre.lru.length > PRE_KEEP) {
        const k = pre.lru.shift(), c = asm.cache.get(k);
        if (c && !c.obj.userData.shown) asm.cache.delete(k);
      }
    }
    preSchedule();
  }
  function prebuild(slotId, ids, urgent = false) {
    for (const id of urgent ? [...ids].reverse() : ids) {
      const key = slotId + "|" + id;
      if (asm.cache.has(key)) continue;
      const i = pre.q.findIndex((e) => e.key === key);
      if (i >= 0) {
        if (!urgent) continue;
        pre.q.splice(i, 1);
      }
      const e = { key, slotId, id };
      if (urgent) pre.q.unshift(e);
      else pre.q.push(e);
    }
    preSchedule();
  }
  // модуль под курсором — первым; открытый слот — его варианты по порядку списка
  app.prebuild = (slotId, id) => id && prebuild(slotId, [id], true);
  app.prebuildSlot = (slotId) => {
    const slot2 = def.slots.find((s) => s.id === slotId);
    if (slot2) prebuild(slotId, asm.slotOptions(slot2).slice(0, PRE_SLOT).map((p) => p.id));
  };
  /* ---------------------------------------------------------- качество картинки */
  // Стартовый уровень — по видеокарте: программный рендер и телефоны — «низкое», встроенная графика —
  // «среднее», дискретная — «высокое» (исходная картинка). Дальше уровень подстраивается по времени
  // кадра: сначала снижается плотность пикселей, потом уровень. Q — авто/высокое/среднее/низкое.
  function gpuTier() {
    try {
      const gl = R4.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
      const r = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).toLowerCase();
      if (/swiftshader|llvmpipe|softpipe|basic render|software/.test(r)) return 0;
      if (/android|iphone|ipad|mobile/i.test(navigator.userAgent)) return 0;
      if ((navigator.deviceMemory || 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2) return 0;
      // старая встроенная графика (HD/UHD 5xx–6xx, Vega 3/8) — с «низкого»: дальше уровень сам
      // поднимется, если кадр стабильно быстрый
      if (/hd graphics|uhd graphics [56]\d\d|uhd graphics\)|gma|vega [38] graphics|radeon r[2-5]/.test(r)) return 0;
      if (/intel|uhd|iris|mali|adreno|powervr|radeon\(tm\) graphics|vega \d+ graphics/.test(r)) return 1;
      if ((navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4) return 1;
      return 2;
    } catch (e) {
      return 1;
    }
  }
  const Q_MODES = ["auto", "high", "mid", "low"], Q_LABEL = { auto: "авто", high: "высокое", mid: "среднее", low: "низкое" };
  const Q_INDEX = { low: 0, mid: 1, high: 2 };
  let qMode = qs.get("q");
  try {
    qMode = qMode || localStorage.getItem("gunsmith:quality");
  } catch (e) {
  }
  if (!Q_MODES.includes(qMode)) qMode = "auto";
  const qAuto = gpuTier();
  let qLevel = qMode === "auto" ? qAuto : Q_INDEX[qMode];
  let maxDpr = 1, minDpr = 0.6, fastStreak = 0;
  function applyQuality(i) {
    qLevel = i;
    const q = S.setQuality(i);
    fx.setQuality(q);
    // картинка в оптике: на «низком» — до 256² и через кадр, пока камера движется
    pip.maxSize = i === 0 ? 256 : i === 1 ? 384 : 512;
    pip.every = i === 0 ? 2 : 1;
    maxDpr = Math.min(devicePixelRatio || 1, q.dpr);
    minDpr = Math.max(0.6, maxDpr * 0.6);
    activeDpr = Math.min(Math.max(activeDpr, minDpr), maxDpr);
    R4.shadowMap.needsUpdate = true;
    sceneDirty = true;
  }
  function cycleQuality() {
    qMode = Q_MODES[(Q_MODES.indexOf(qMode) + 1) % Q_MODES.length];
    try {
      localStorage.setItem("gunsmith:quality", qMode);
    } catch (e) {
    }
    activeDpr = 9;
    applyQuality(qMode === "auto" ? qAuto : Q_INDEX[qMode]);
    ui?.toast("Качество: " + Q_LABEL[qMode] + (qMode === "auto" ? " (" + S.quality.label.toLowerCase() + ")" : ""));
  }
  let activeDpr = 9, curDpr = R4.getPixelRatio(), fts = [], ftT = 0, slowStreak = 0, adaptN = 0;
  // потолок авто-подъёма: не выше уровня, с которого уже пришлось спускаться
  let qCeil = 2;
  applyQuality(qLevel);
  const bootT = performance.now();
  const gunPrev = new THREE8.Matrix4();
  const setDpr = (v) => {
    if (Math.abs(v - curDpr) < 0.01) return;
    curDpr = v;
    R4.setPixelRatio(v);
    R4.setSize(innerWidth, innerHeight);
    S.resize();
  };
  function simBusy() {
    const r = st.rec;
    if (st.ads || st.adsT > 0 || st.trigger || st.busy || st.burstLeft || st.light || st.laser || tw.list.length || ball.active || fx.active()) return true;
    if (Math.abs(r.p) + Math.abs(r.y) + Math.abs(r.z) + Math.abs(r.vp) + Math.abs(r.vy) + Math.abs(r.vz) > 1e-3 || st.climb > 1e-4) return true;
    for (const t of S.range.targets) if (Math.abs(t.userData.vel) + Math.abs(t.userData.swing) > 1e-4) return true;
    return false;
  }
  function adapt(raw) {
    if (performance.now() - bootT < 1500) return;
    if (raw < 0.25) fts.push(raw);
    ftT += raw;
    // первые замеры — короче: на слабой машине лаг не должен тянуться секундами
    const win = adaptN < 3 ? 0.6 : 1.5;
    if (ftT < win || fts.length < 8) return;
    adaptN++;
    fts.sort((a, b) => a - b);
    const med = fts[fts.length >> 1];
    fts = [];
    ftT = 0;
    let next = activeDpr;
    if (med > 1 / 40) {
      slowStreak++;
      fastStreak = 0;
      next = Math.max(minDpr, activeDpr * (med > 1 / 25 ? 0.8 : 0.9));
    } else {
      slowStreak = 0;
      if (med < 1 / 55) {
        next = Math.min(maxDpr, activeDpr * 1.1);
        fastStreak++;
      } else fastStreak = 0;
    }
    activeDpr = next;
    // в режиме «авто»: сильно медленно (< 25 к/с) — сразу уровень ниже; упёрлись в минимальную
    // плотность — уровень ниже; стабильно быстро — выше, вплоть до «высокого» (исходная картинка)
    const verySlow = med > 1 / 25 && adaptN <= 4;
    if (qMode === "auto" && qLevel > 0 && (verySlow || slowStreak >= 3 && activeDpr <= minDpr + 1e-3)) {
      slowStreak = 0;
      applyQuality(qLevel - 1);
      activeDpr = verySlow ? minDpr : maxDpr;
      qCeil = Math.min(qCeil, qLevel);
    } else if (qMode === "auto" && fastStreak >= 6 && activeDpr >= maxDpr - 1e-3 && qLevel < qCeil) {
      fastStreak = 0;
      applyQuality(qLevel + 1);
    }
  }
  // пошаговый кадр для отладки и скриншотов (при window.__pause основной цикл стоит)
  app.step = (dt = 1 / 60, n = 1) => {
    for (let i = 0; i < n; i++) update(dt);
    gun.updateMatrixWorld();
    R4.shadowMap.needsUpdate = true;
    pipFrame();
    S.render();
  };
  app.quality = () => ({ mode: qMode, level: S.quality.id, auto: qAuto, activeDpr, curDpr, maxDpr, shadow: S.sun.shadow.mapSize.x });
  app.cycleQuality = cycleQuality;
  app.setQuality = (m) => {
    qMode = Q_MODES[(Q_MODES.indexOf(m) + Q_MODES.length - 1) % Q_MODES.length];
    cycleQuality();
  };
  /* ---------------------------------------------------------- картинка в оптике вне прицеливания */
  const pipDir = new THREE8.Vector3(), pipUp = new THREE8.Vector3();
  function pipFrame() {
    const cur = sights[st.sightIdx];
    const mags = st.adsT > 0 ? [] : sights.filter((s) => (s.zoom || s.mag > 1.2) && !(s.id === "magnifier" && st.magAside));
    const s = mags.includes(cur) ? cur : mags[0];
    const lens = s && (s.id === "magnifier" ? asm.installed.get("magnifier")?.info?.sight?.lens : s.src?.lens);
    if (!lens) return pip.release();
    const bs = s.id === "magnifier" ? sights[0] : s;
    const x0 = bs.src?.x0 ?? 0, x1 = bs.src?.x1 ?? x0 + 60;
    const pos = gun.localToWorld(bs.eye.clone().addScaledVector(bs.dir, x1 - x0 + 4));
    pipDir.copy(s.dir).transformDirection(gun.matrixWorld);
    pipUp.copy(s.up || Y_UP).transformDirection(gun.matrixWorld);
    const mag = (s.zoom ? st.zoom : s.mag) * (s === cur && !s.zoom ? st.zoomMul : 1);
    // поле как у круга оптики в прицеливании: 0,84 высоты кадра при baseFov / кратность
    const fov = 0.84 * baseFov / Math.max(1, mag);
    const rs = s.id === "magnifier" ? sights[0] : s;
    const r = retOf(rs), rdef = r && RETICLES[r.id];
    let retK = 1;
    if (rdef) {
      const sfp = s.zoom && !s.withMag ? s.zoom[1] / mag : 1;
      retK = fov * 60 / (rdef.field * sfp * (rdef.mag ? 1 : rdef.boost || 1));
      // окуляр на экране мал: сетка в честном масштабе (шеврон ACOG — 1 % линзы) не видна
      retK = Math.min(retK, 3.2);
    }
    pip.render({ lens, gun, pos, dir: pipDir, up: pipUp, fov, retTex: rs.src?.retMesh?.material.map, retK, retMesh: s.id === "magnifier" ? null : rs.src?.retMesh }, S.camera, innerHeight);
  }
  app.pip = pip;
  /* ---------------------------------------------------------- прогрев шейдеров в фоне */
  // Раньше при загрузке компилировались только материалы стоящих на оружии модулей, а первая
  // установка прицела, фонаря, деревянного приклада, включение второго фонаря (другой набор
  // источников света у всех материалов) компилировали программы прямо в кадре — фриз от десятков
  // миллисекунд до секунд на слабой видеокарте. Теперь после загрузки в фоне готовятся все материалы
  // библиотеки, их полупрозрачные копии (размытый диоптр, стекло фонарей), служебные материалы
  // (нормали GTAO, глубина теней, инстансы гильз), марка сетки и PiP — в обоих вариантах освещения.
  // compileAsync не ждёт компиляции (KHR_parallel_shader_compile), крошечные меши живут в сцене
  // только на время синхронного вызова. Цель рендера — буфер сцены композитора, чтобы варианты
  // программ совпали с настоящим кадром. Экран загрузки из-за этого дольше не висит.
  const warmGrp = new THREE8.Group();
  {
    const g = new THREE8.BoxGeometry(1e-3, 1e-3, 1e-3);
    const add = (m, inst = false) => {
      const o = inst ? new THREE8.InstancedMesh(g, m, 1) : new THREE8.Mesh(g, m);
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false;
      warmGrp.add(o);
    };
    for (const m of new Set(Object.values(mats.all))) {
      add(m);
      if (!m.transparent) {
        const t = m.clone();
        t.transparent = true;
        t.depthWrite = false;
        add(t);
      }
    }
    const depthM = [THREE8.FrontSide, THREE8.BackSide, THREE8.DoubleSide].map((side) => new THREE8.MeshDepthMaterial({ depthPacking: THREE8.RGBADepthPacking, side }));
    for (const m of [S.post.gtao.normalMaterial, ...depthM]) {
      add(m);
      add(m, true);
    }
    add(new THREE8.MeshBasicMaterial({ map: mats.tex.rough, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    add(pip.material(new THREE8.Mesh(g, mats.all.glass)));
  }
  const compileWarm = () => {
    const R0 = S.renderer, prev = R0.getRenderTarget();
    aim.add(warmGrp);
    R0.setRenderTarget(S.post.composer.readBuffer);
    try {
      return R0.compileAsync(S.scene, S.camera);
    } finally {
      R0.setRenderTarget(prev);
      aim.remove(warmGrp);
    }
  };
  const idleOnly = (fn) => ric(function tick(dl) {
    if (performance.now() - pre.busyT < 300 || dl.timeRemaining() < 6) return setTimeout(() => ric(tick), 120);
    fn(dl);
  });
  app.warm = new Promise((done) => {
    idleOnly(async () => {
      const spot2 = fx.rigs?.[1]?.spot;
      try {
        const jobs = [compileWarm()];
        if (spot2 && !spot2.visible) {
          spot2.visible = true;
          try {
            jobs.push(compileWarm());
          } finally {
            spot2.visible = false;
          }
        }
        await Promise.all(jobs);
      } catch (e) {
        console.warn("warm", e);
      }
      // Без KHR_parallel_shader_compile драйвер доделывает программу при первом использовании —
      // это делаем сами, по одной в простое, а не в кадре. С расширением это лишь чтение uniform-ов.
      const list = [...S.renderer.info.programs];
      const next = () => idleOnly((dl) => {
        while (list.length && dl.timeRemaining() > 4) {
          try {
            list.shift().getUniforms();
          } catch (e) {
          }
        }
        if (list.length) next();
        else done();
      });
      next();
    });
  });
  const loop = () => {
    requestAnimationFrame(loop);
    if (window.__pause) return;
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.05);
    update(dt);
    const busy = simBusy();
    const active = busy || camDirty;
    idleT = active ? 0 : idleT + raw;
    const still = !active && idleT > 0.35 && curDpr !== maxDpr;
    if (active) pre.busyT = performance.now();
    if (!active && !sceneDirty && !still) return;
    if (active) {
      setDpr(activeDpr);
      adapt(raw);
    } else {
      setDpr(maxDpr);
      fts = [];
      ftT = 0;
    }
    gun.updateMatrixWorld();
    if (busy || sceneDirty || !gunPrev.equals(gun.matrixWorld)) R4.shadowMap.needsUpdate = true;
    gunPrev.copy(gun.matrixWorld);
    camDirty = false;
    sceneDirty = false;
    pipFrame();
    S.render();
  };
  /* разбор образца при смене оружия: общая сцена остаётся, всё своё — убираем */
  app.dispose = () => {
    const safe = (f) => { try { f(); } catch (e) { console.warn("dispose", e); } };
    safe(() => { if (st.ads) setADS(false); });
    safe(() => { st.trigger = false; st.light = st.laser = false; st.emOn = {}; });
    safe(() => controls.dispose());
    safe(() => pip.release());
    safe(() => pip.rt && pip.rt.dispose());
    safe(() => { for (const h of fx.holes || []) h.parent && h.parent.remove(h); });
    safe(() => { if (audio.ctx && audio.ctx.close) audio.ctx.close(); });
    const keep = new Set(Object.values(mats.all || {}));
    const geos = new Set(), mtls = new Set();
    const collect = (root) => root.traverse((o) => {
      if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) geos.add(o.geometry);
      for (const m of [].concat(o.material || [])) if (m && !keep.has(m)) mtls.add(m);
    });
    for (const o of [...S.scene.children]) if (!baseScene.has(o)) { S.scene.remove(o); safe(() => collect(o)); }
    for (const o of [...S.camera.children]) if (!baseCam.has(o)) { S.camera.remove(o); safe(() => collect(o)); }
    safe(() => { for (const c of asm.cache.values()) if (c && c.obj) collect(c.obj); });
    for (const n of [...document.body.children]) if (!baseBody.has(n) && n.id !== "boot") n.remove();
    // буферы — сразу; материалы — после первого кадра нового образца, чтобы их программы
    // шейдеров успели перейти к новым материалам и не компилировались заново
    for (const g of geos) safe(() => g.dispose());
    return () => { for (const m of mtls) safe(() => m.dispose()); };
  };
  loop();
  return app;
}

// ==== engine/lib/optics.js
function lens(ctx, geo, mat = "glass") {
  const m = new ctx.THREE.Mesh(geo, ctx.mats.get(mat).clone());
  m.renderOrder = 10;
  m.userData.lens = true;
  return m;
}
// Барабан из общего конструктора: металл + белые штрихи шкалы. t — поворот/перенос оси +y.
function optTurret(k, mat, o, t) {
  const tt = turret(o);
  k.add(mat, tt.m, t);
  if (tt.w.length) k.add(o.paint || "paintWhite", tt.w, t);
}
// Радиальные риски на торце ручки (ось +x, торец в плоскости x).
function faceTicks(r0, r1, n, x, o = {}) {
  const gs = [], arc = o.arc ?? 360, a0 = o.a0 ?? 0;
  for (let i = 0; i < n; i++) {
    const L = (i % (o.major ?? 1000) === 0 ? 1.4 : 1) * (r1 - r0);
    gs.push(T(T(box(0.3, L, o.w ?? 0.5, { bevel: 0.08 }), { p: [x, r1 - L / 2, 0] }), { r: [a0 + i / n * arc, 0, 0] }));
  }
  return merge(gs);
}
// Ручка яркости с рисками на торце, ось +z (правый борт) или -z (dir=-1).
function dialZ(k, mat, r, h, p, dir = 1, n = 12) {
  const t = { r: [0, dir > 0 ? -90 : 90, 0], p };
  k.add(mat, knob(r, h, Math.round(r * 2.8)), t);
  k.add("paintWhite", faceTicks(r * 0.45, r * 0.78, n, h + 0.05, { arc: 300, a0: 30, major: 4 }), { ...t });
}
function t2(ctx, A) {
  const k = ctx.kit();
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  k.add("alu", clampBody(-18, 18, 5.5));
  if (A > 30) {
    // LaRue LT660: башня с окном облегчения, рычаг QD слева, гайка натяжения справа
    const tower = shape([[-17, 5], [17, 5], [17, A - 12, 3], [-17, A - 12, 3]], [slot(-9, 9, (A - 7) / 2 + 3, 9)]);
    k.add("alu", extrudeZ(tower, 18, { bevel: 1.2 }));
    k.add("steel", qdLever(-14, 12, -1));
    k.add("steel", crossBolt(0, -2.5, 13).slice(0, 2));
    for (const x of [-12, 12]) k.add("steel", capScrew(1.8, 1), { p: [x, A - 12, 5] });
  } else {
    k.add("steel", crossBolt(0));
  }
  // корпус: трубка с фирменным пояском, расширенная бленда спереди
  k.add("alu", at(hollowLathe([[-34, 14], [-33.4, 15.2], [-25, 15.2], [-24.4, 15.7], [-21, 15.7], [-20.4, 15.2], [16, 15.2], [18, 16], [20.5, 16.6], [32.6, 16.6], [33.6, 16.1], [34, 15.2]], 12.2, { seg: 44 })));
  k.add("lensBlack", at(tubeX(12.3, 11.6, -32, 32, { seg: 32 })));
  // интегральное основание и блок барабанов
  k.add("alu", extrudeX([[-11, A - 16, 2], [11, A - 16, 2], [11, A - 8], [-11, A - 8]], -17, 17, { bevel: 1 }));
  // блок барабанов охватывает трубку: канал на оси открыт
  k.add("alu", extrudeX(shape(rrect(0, A, 31.4, 31.4, 10), [circle(0, A, 15.1, 40)]), -6, 12, { bevel: 1.2 }));
  optTurret(k, "alu", { cap: true, r: 7, h: 6.2, base: 1, knurl: 24 }, { p: [3, A + 15.4, 0] });
  optTurret(k, "alu", { cap: true, r: 7, h: 6.2, base: 1, knurl: 24 }, { r: [90, 0, 0], p: [3, A, 15.4] });
  // ручка яркости (12 положений) справа сзади
  k.add("alu", at(cylZ(6.5, 12, 14.6, { seg: 24 }), { p: [-17, -1, 0] }));
  dialZ(k, "alu", 10, 6.2, [-17, A - 1, 14.2]);
  k.add("steel", at(cylZ(3.2, -16.6, -15, { seg: 16 }), { p: [-17, -1, 0] }));
  const capR = T(flipCap(12.5).translate(0, -15.5, 0), { r: [0, 0, -100], p: [-35, 15.5, 0] });
  const capF = T(flipCap(13.5).translate(0, -16.5, 0), { r: [0, 0, 100], p: [34, 16.5, 0] });
  k.add("rubber", at(capR));
  k.add("rubber", at(capF));
  k.add("rubber", at(tubeX(16.8, 15.1, -31, -25.6, { seg: 32 })));
  k.add("rubber", at(tubeX(17.8, 16.5, 25, 31, { seg: 32 })));
  const root = node("t2", [k.build()]);
  const rear = lens(ctx, at(ctx.C.lensDisc(12.4, -31)), "glassBlue");
  const front = lens(ctx, at(ctx.C.lensDisc(12.6, 31)), "glassRed");
  root.add(rear, front);
  return { root, sight: { y: A, z: 0, x0: -34, x1: 34, r: 12, mag: 1, reticle: "dot", lens: front } };
}
// EOTech EXPS3 / XPS2: основание с батарейным отсеком CR123 поперёк, капюшон с плоскими бортами,
// кнопки (EXPS — слева сзади, XPS — на заднем торце), винты поправок справа под окном.
function exps3(ctx, o = {}) {
  const k = ctx.kit();
  const A = 39, xs = !!o.xps2, X0 = xs ? -40 : -48;
  k.add("alu", clampBody(xs ? -16 : -22, xs ? 16 : 22, 6));
  if (xs) {
    k.add("steel", crossBolt(0, -2.5, 13, { nutR: 0 }));
    k.add("steel", T(thumbNut(6.6, 4.2), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  } else k.add("steel", qdLever(-16, 12, -1.5));
  k.add("alu", extrudeX([[-17, 5, 1], [17, 5, 1], [17, 15, 3], [-17, 15, 3]], X0, 46, { bevel: 1.2 }));
  k.add("alu", extrudeX([[-17, 12], [17, 12], [17, 28, 6], [-17, 28, 6]], X0, -21, { bevel: 2 }));
  if (xs) {
    for (const [y, z] of [[21, -7], [21, 7], [15.5, 0]]) k.add("rubber", cylX(2.9, X0 - 2.2, X0 + 1, { c: 0.8, seg: 16 }), { p: [0, y, z] });
  } else {
    for (const [x, y] of [[-42, 22], [-34, 22], [-38, 16]]) k.add("rubber", cylZ(3.1, -19.4, -16.5, { c: 0.8, seg: 16 }), { p: [x, y, 0] });
    k.add("alu", extrudeZ(rrect(-38, 19.5, 18, 15, 3), 1.2, { bevel: 0.4, z: -17.2 }));
  }
  // винты поправок справа: утоплены в прилив, шлиц + стрелки
  k.add("alu", extrudeZ(rrect(-35, 20, 16, 11, 4), 3, { bevel: 0.8, z: 17.5 }));
  for (const x of [-40, -30]) {
    k.add("steel", cylZ(3.3, 18.5, 19.6, { c: 0.5, seg: 18 }), { p: [x, 21, 0] });
    k.add("lensBlack", T(box(0.8, 4.2, 0.6, { bevel: 0.1 }), { p: [x, 21, 19.6] }));
    k.add("paintWhite", T(box(2.2, 0.4, 0.3), { p: [x, 25.3, 19.1] }));
  }
  // капюшон: прямые борта, скруглённая крыша; утолщённые рамки у окон
  const outer = [[-21, 12, 0], [21, 12, 0], [21, 63, 13], [-21, 63, 13]];
  const inner = [[-16.4, 21, 2], [16.4, 21, 2], [16.4, 58, 9], [-16.4, 58, 9]];
  const hx0 = xs ? -19 : -22;
  k.add("alu", extrudeX(shape(outer, [inner]), hx0, 44, { bevel: 1.2 }));
  k.add("alu", extrudeX(shape(outer.map(([z, y, r]) => [z * 1.03, y === 12 ? 12 : y + 0.6, r]), [inner]), 40.5, 44.6, { bevel: 0.8 }));
  k.add("alu", extrudeX(shape(outer.map(([z, y, r]) => [z * 1.03, y === 12 ? 12 : y + 0.6, r]), [inner]), hx0 - 0.4, hx0 + 3, { bevel: 0.8 }));
  // фирменная площадка на бортах капюшона
  for (const s of [-1, 1]) k.add("aluGrey", extrudeZ(rrect(12, 44, 30, 9, 2), 0.8, { bevel: 0.2, z: s * 21.2 }));
  // батарейный отсек CR123 поперёк, рифлёная крышка справа
  k.add("alu", T(cylZ(9.5, -17, 17, { c: 1, seg: 28 }), { p: [34, 16, 0] }));
  k.add("alu", T(ctx.C.knob(9.8, 6, 24), { r: [0, -90, 0], p: [34, 16, 17] }));
  k.add("steel", T(capScrew(1.6, 1), { r: [90, 0, 0], p: [34, 16, 23.1] }));
  const root = node(xs ? "xps2" : "exps3", [k.build()]);
  const rp = rrect(0, A - 1, 30, 28, 8);
  const rear = lens(ctx, extrudeX(rp, -14, -12.8, { bevel: 0.2 }), "glassBlue");
  const front = lens(ctx, extrudeX(rp, 36, 37.2, { bevel: 0.2 }), "glassAmber");
  root.add(rear, front);
  return { root, sight: { y: A, z: 0, x0: -14, x1: 37, r: 14, mag: 1, reticle: "holo", lens: front } };
}
// Trijicon MRO: короткая трубка с расширяющимся объективом 25 мм, колпачки сверху и справа,
// крупная ручка яркости слева, быстросъёмное основание.
function mro(ctx, A) {
  const k = ctx.kit();
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  k.add("alu", clampBody(-20, 20, 5.5));
  k.add("steel", qdLever(-14, 14, -1));
  k.add("alu", extrudeZ(shape([[-18, 4, 2], [18, 4, 2], [16, A - 12, 3], [-16, A - 12, 3]], [slot(-8, 8, (A - 8) / 2 + 2, 8)]), 16, { bevel: 1.2 }));
  k.add("alu", extrudeX([[-9, A - 14, 2], [9, A - 14, 2], [9, A - 9], [-9, A - 9]], -15, 15, { bevel: 1 }));
  k.add("alu", at(hollowLathe([[-30, 11.6], [-29, 12.8], [-24, 12.9], [-23.6, 13.3], [-20.5, 13.4], [-20, 13], [-8, 13.4], [14, 16.2], [26, 17.6], [30, 17.6], [31, 16.6]], 10.8, { seg: 44 })));
  k.add("lensBlack", at(tubeX(10.9, 10.2, -29, 30, { seg: 32 })));
  // поясок барабанов — кольцо вокруг трубки, канал на оси открыт
  k.add("alu", at(hollowLathe([[-9, 13.8], [-8, 14.4], [8, 15.2], [9, 14.6]], 12.9, { seg: 32 })));
  optTurret(k, "alu", { cap: true, r: 6.6, h: 5.6, base: 1, knurl: 22 }, { p: [0, A + 14, 0] });
  optTurret(k, "alu", { cap: true, r: 6.6, h: 5.6, base: 1, knurl: 22 }, { r: [90, 0, 0], p: [0, A, 14.2] });
  dialZ(k, "alu", 8.6, 5.5, [-6, A, -13.8], -1, 8);
  k.add("paintWhite", at(box(0.6, 3, 0.6), { p: [-6, -9.6, -19.4] }));
  const root = node("mro", [k.build()]);
  const rear = lens(ctx, at(ctx.C.lensDisc(10.8, -28)), "glassBlue");
  const front = lens(ctx, at(ctx.C.lensDisc(16.6, 29.5)), "glassRed");
  root.add(rear, front);
  return { root, sight: { y: A, z: 0, x0: -30, x1: 31, r: 10, mag: 1, reticle: "dot", lens: front } };
}
// Holosun HS510C: открытая рамка-щит, солнечная панель сверху, батарейный лоток справа,
// кнопки слева, излучатель в основании за стеклом.
function hs510c(ctx) {
  const k = ctx.kit();
  const A = 35;
  k.add("alu", clampBody(-22, 22, 6));
  k.add("steel", qdLever(-16, 12, -1.5));
  k.add("alu", extrudeX([[-17, 5, 1], [17, 5, 1], [17, 17, 3], [-17, 17, 3]], -34, 30, { bevel: 1.2 }));
  const fr = shape([[-19, 14], [19, 14], [19, 50, 7], [-19, 50, 7]], [[[-14.5, 20, 3], [14.5, 20, 3], [14.5, 45, 5], [-14.5, 45, 5]]]);
  k.add("alu", extrudeX(fr, 6, 16, { bevel: 1.2 }));
  for (const s of [-1, 1]) k.add("alu", extrudeZ([[-30, 14], [16, 14], [16, 48, 4], [4, 50, 3], [-20, 20, 4]], 3, { bevel: 0.8, z: s * 17.5 }));
  // солнечная панель в рамке
  k.add("alu", extrudeX(rrect(0, 50.2, 30, 2.4, 1), -9, 13, { bevel: 0.5 }));
  k.add("lensBlack", extrudeX(rrect(0, 51.5, 24, 0.8, 0.3), -8, 12, { bevel: 0.2 }));
  k.add("glassBlue", extrudeX(rrect(0, 51.9, 22, 0.4, 0.15), -7, 11, { bevel: 0.1 }));
  // кнопки +/− слева, батарейный лоток CR2032 справа
  for (const x of [-22, -12]) k.add("rubber", cylZ(3.2, -20.4, -18, { c: 0.8, seg: 16 }), { p: [x, 12, 0] });
  k.add("alu", T(extrudeX(rrect(0, 0, 4, 12, 1.5), -28, -6, { bevel: 0.8 }), { p: [0, 11, 18.8] }));
  k.add("steel", T(capScrew(1.8, 1), { r: [90, 0, 0], p: [-10, 11, 20.8] }));
  // излучатель и винты поправок
  k.add("alu", extrudeX(rrect(0, 20, 9, 6, 2), -24, -16, { bevel: 0.8 }));
  k.add("lensBlack", cylX(1.6, -16.2, -15.6, { seg: 12 }), { p: [0, 20.5, 0] });
  k.add("steel", T(capScrew(2, 1), {}), { p: [-4, 17, 0] });
  k.add("steel", T(capScrew(2, 1), { r: [90, 0, 0] }), { p: [-2, 12, 17] });
  const root = node("hs510c", [k.build()]);
  const glass = lens(ctx, extrudeX(rrect(0, A - 2.4, 29, 25, 4), 10.4, 11.4, { bevel: 0.2 }), "glassBlue");
  root.add(glass);
  return { root, sight: { y: A, z: 0, x0: -30, x1: 16, r: 12, mag: 1, reticle: "holo", lens: glass } };
}
// Trijicon ACOG TA31RCO + RMR: кованый корпус со скруглённым сечением, окуляр с рёбрами,
// раструб объектива 32 мм, оптоволокно в канале сверху, колпачки поправок, основание TA51
// с двумя барашками слева, RMR на переходнике над корпусом.
function acog(ctx) {
  const k = ctx.kit();
  const A = 38;
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  k.add("alu", clampBody(-32, 32, 7));
  for (const x of [-18, 18]) {
    k.add("steel", T(thumbNut(7.6, 5, 8), { r: [0, 90, 0], p: [x, -2, -13] }));
    k.add("steel", cylZ(2.6, -13, 16.6, { seg: 12 }), { p: [x, -2, 0] });
    k.add("steel", crossBolt(x, -2, 13).slice(0, 1));
  }
  k.add("alu", extrudeX([[-12, 6], [12, 6], [12, A - 14, 3], [-12, A - 14, 3]], -34, 34, { bevel: 1.2 }));
  for (const s of [-1, 1]) k.add("alu", extrudeZ([[-30, 10, 2], [30, 10, 2], [22, A - 16, 3], [-22, A - 16, 3]], 2, { bevel: 0.5, z: s * 12.6 }));
  // окуляр с рёбрами
  const oc = [[-75, 15.6], [-74.6, 18.2], [-73.4, 19.4]];
  for (let i = 0; i < 6; i++) { const x = -71.5 + i * 3.4; oc.push([x, 19.4], [x + 0.6, 18.6], [x + 1.6, 18.6], [x + 2.2, 19.4]); }
  oc.push([-50, 19.4], [-48.5, 18.2], [-44, 18.2]);
  k.add("alu", at(hollowLathe(oc, 15.9, { seg: 44 })));
  // корпус призмы: скруглённое сечение
  const ring = (x, a, b, cy = 0) => ({ x, pts: superEllipse(a, b, 3.2, 40, A + cy, 0) });
  k.add("alu", loftX([ring(-46, 16.6, 17.4, 0.6), ring(-43, 18, 19.2, 0.8), ring(22, 18, 19.2, 0.8), ring(30, 17, 18.6, 0.4)], { crease: 60 }));
  k.add("alu", at(hollowLathe([[28, 18.6], [36, 19.2], [44, 21.5], [60, 24.2], [66, 24.2], [66.6, 24.6], [71, 24.6], [71.6, 24.2], [74, 24.2], [75.5, 23]], 16.5, { seg: 48 })));
  k.add("lensBlack", at(tubeX(16.6, 15.5, -72, 73, { seg: 32 })));
  // колпачки поправок: сверху и справа, за RMR
  optTurret(k, "alu", { cap: true, r: 7.4, h: 7.5, base: 1.4, knurl: 26 }, { p: [-31, A + 19.4, 0] });
  optTurret(k, "alu", { cap: true, r: 7.4, h: 7.5, base: 1.4, knurl: 26 }, { r: [90, 0, 0], p: [-31, A + 0.8, 17.6] });
  // оптоволокно: канал с поперечными перемычками над объективом
  k.add("alu", extrudeX(shape([[-7, A + 16, 2], [7, A + 16, 2], [7, A + 26.5, 2], [-7, A + 26.5, 2]], [rrect(0, A + 26.5, 5.4, 4, 1)]), 29, 62, { bevel: 1.2 }));
  k.add("emGreen", extrudeX(rrect(0, A + 25, 3.4, 2.4, 1.1), 30, 61, { bevel: 0.3 }));
  for (let i = 0; i < 7; i++) k.add("alu", T(box(1.6, 1.6, 6.4, { bevel: 0.3 }), { p: [32.5 + i * 4.6, A + 26.4, 0] }));
  // переходник RMR и сам RMR
  const rb = A + 19.2;
  k.add("alu", extrudeX(shape([[-13, rb - 3, 2], [13, rb - 3, 2], [13, rb + 2.4, 1.5], [-13, rb + 2.4, 1.5]]), -22, 27, { bevel: 1 }));
  for (const x of [-15, 20]) k.add("steel", capScrew(1.7, 0.8), { p: [x, rb + 2.4, 8.5] });
  const m = ctx.kit();
  const RA = rmrBody(ctx, m);
  const rm = m.build();
  rm.position.set(4, rb + 2.4, 0);
  const root = node("acog", [k.build(), rm]);
  const ocL = lens(ctx, at(ctx.C.lensDisc(15.8, -72)), "glassBlue");
  const ob = lens(ctx, at(ctx.C.lensDisc(17, 73)), "glassAmber");
  const ry = rb + 2.4 + RA + 0.5;
  const rmr = lens(ctx, extrudeX(shape(rrect(0, ry, 18.6, 13.4, 5)), 10, 11, { bevel: 0.2 }), "glassAmber");
  root.add(ocL, ob, rmr);
  return {
    root,
    sight: { y: A, z: 0, x0: -74, x1: 75, r: 15, mag: 4, reticle: "chevron", eyeRelief: 38, lens: ocL },
    alt: [{ label: "RMR сверху", y: ry, z: 0, x0: -18, x1: 11, r: 6, mag: 1, reticle: "dot", lens: rmr }]
  };
}
// Прицел 1–6×24 (класс Vortex Razor/Nightforce ATACR): трубка 30 мм, окуляр с диоптрийным кольцом,
// кольцо кратности с рычагом и цифрами, открытые барабаны, подсветка слева, моноблок-кронштейн.
function lpvo(ctx) {
  const k = ctx.kit();
  const A = 40;
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  k.add("alu", at(hollowLathe([
    [-132, 18], [-131, 21.6], [-126, 22.2], [-98, 22.2], [-92, 20], [-74, 18.2], [-72, 19.4], [-54, 19.4], [-52, 15.2],
    [-30, 15.2], [-28, 18], [14, 18], [16, 15.2], [30, 15.2], [46, 18.6], [96, 18.6], [96.6, 19], [100, 19], [100.6, 18.6], [104, 17.8]
  ], 14.5, { seg: 48 })));
  k.add("rubber", at(tubeX(22.8, 21.5, -125, -106, { seg: 44 })));
  k.add("alu", at(flutesX(21.8, -130.6, -127, 44, 1, 0.8)));
  k.add("paintWhite", at(hashMarks(22.25, -101, 9, { arc: 80, a0: -40, major: 4, len: 1.2 })));
  k.add("lensBlack", at(tubeX(14.6, 13.6, -130, 102, { seg: 32 })));
  k.add("rubber", at(flutesX(19.2, -71, -56, 24, 1.6, 0.9)));
  k.add("paintWhite", at(hashMarks(19.3, -72.6, 6, { arc: 120, a0: -60, major: 1, len: 1.1 })));
  // рычаг смены кратности с рифлёным пальцевым упором
  k.add("alu", at(extrudeZ([[-70, 17], [-60, 17], [-61.4, 27, 3], [-68.6, 27, 3]], 5, { bevel: 1 }), { r: [-25, 0, 0] }));
  k.add("alu", at(extrudeZ([[-71.5, 26, 2], [-58.5, 26, 2], [-58.5, 31, 2.4], [-71.5, 31, 2.4]], 7, { bevel: 1.4 }), { r: [-25, 0, 0] }));
  // седло и барабаны
  optTurret(k, "alu", { r: 11.6, h: 11, base: 2, marks: 40, knurl: 40 }, { p: [-8, A + 17.6, 0] });
  optTurret(k, "alu", { r: 11.6, h: 10, base: 2, marks: 40, knurl: 40 }, { r: [90, 0, 0], p: [-8, A, 17.6] });
  dialZ(k, "alu", 10.5, 8, [-8, A, -17.2], -1, 11);
  k.add("paintWhite", at(box(0.6, 3, 0.6), { p: [-8, 11.6, -17.4] }));
  // моноблок: две полукольца на общей базе, облегчающие выборки
  k.add("alu", clampBody(-38, 34, 7));
  k.add("steel", crossBolt(-20));
  k.add("steel", crossBolt(18));
  k.add("alu", extrudeX([[-12, 6, 1], [12, 6, 1], [12, A - 16], [-12, A - 16]], -40, 36, { bevel: 1.5 }));
  for (const s of [-1, 1]) for (const x of [-12, 2]) k.add("lensBlack", extrudeZ(rrect(x, 14, 10, 6, 3), 0.8, { bevel: 0.2, z: s * 12.2 }));
  for (const x of [-44, 20]) {
    k.add("alu", at(tubeX(20.5, 15.3, x, x + 16, { seg: 44, c: 1.2 })));
    k.add("alu", extrudeX([[-13, A - 18], [13, A - 18], [13, A - 8], [-13, A - 8]], x, x + 16, { bevel: 1 }));
    for (const s of [-1, 1]) k.add("lensBlack", T(box(15.2, 0.5, 2.2, { bevel: 0.1 }), { p: [x + 8, A, s * 19.6] }));
    for (const s of [-1, 1]) for (const d of [4, 12]) k.add("steel", capScrew(2.1, 1.2), { p: [x + d, A + 19.7, s * 9] });
  }
  const root = node("lpvo", [k.build()]);
  const oc = lens(ctx, at(ctx.C.lensDisc(20, -129)), "glassBlue");
  const ob = lens(ctx, at(ctx.C.lensDisc(16.6, 101)), "glassAmber");
  root.add(oc, ob);
  return { root, sight: { y: A, z: 0, x0: -132, x1: 104, r: 15, mag: 1, zoom: [1, 6], reticle: "lpvo", eyeRelief: 95, lens: oc } };
}
// Aimpoint 3XMag-1 на FTS: откидной кронштейн с кнопкой, винты выверки, резиновый наглазник.
function magnifier(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  const A = 39;
  k.add("alu", clampBody(-16, 16, 6));
  k.add("steel", crossBolt(0));
  k.add("alu", extrudeZ([[-14, 5], [14, 5], [14, 16, 3], [-14, 16, 3]], 24, { bevel: 1.2 }));
  k.add("alu", extrudeX([[-18, 10, 2], [-8, 10, 2], [-8, 22, 3], [-18, 22, 3]], -14, 14, { bevel: 1 }));
  k.add("steel", cylX(3.6, -16, 16, { seg: 16 }), { p: [0, 17, -17] });
  for (const x of [-16, 16]) k.add("steel", cylX(4.4, x - 0.8, x + 0.8, { seg: 16 }), { p: [0, 17, -17] });
  k.add("steel", T(ctx.C.knob(6, 5, 16), { r: [0, -90, 0], p: [0, 10, 12] }));
  // кнопка откидывания справа
  k.add("rubber", cylZ(3.2, 11.5, 14.4, { c: 1, seg: 18 }), { p: [10, 9, 0] });
  f.add("alu", extrudeX(shape([[-17, 12, 2], [-10, 12, 2], [4, A - 20, 4], [12, A - 12, 3], [-6, A - 10, 3], [-19, 22, 2]]), -12, 12, { bevel: 1.2 }));
  f.add("alu", hollowLathe([[-56, 15], [-55, 17.5], [-40, 17.5], [-36, 16.4], [48, 16.4], [54, 15.2]], 12.5, { seg: 44 }).translate(0, A, 0));
  const eye = [[-56.5, 16.5], [-56, 19.6]];
  for (let i = 0; i < 4; i++) { const x = -55 + i * 3.6; eye.push([x, 19.6], [x + 0.8, 18.9], [x + 2, 18.9], [x + 2.8, 19.6]); }
  eye.push([-40, 19.6], [-39.5, 16.5]);
  f.add("rubber", hollowLathe(eye, 16.5, { seg: 44 }).translate(0, A, 0));
  f.add("alu", T(flutesX(16.2, 0, 12, 20, 1.4, 0.8), { p: [20, A, 0] }));
  // башенки выверки сверху и справа (на корпусе увеличителя)
  optTurret(f, "alu", { cap: true, r: 5.6, h: 4.5, base: 1, knurl: 18 }, { p: [-8, A + 16, 0] });
  optTurret(f, "alu", { cap: true, r: 5.6, h: 4.5, base: 1, knurl: 18 }, { r: [90, 0, 0], p: [-8, A, 16] });
  f.add("alu", T(latheX([[-15, 0], [-15, 16.2], [-14, 17.4], [-2, 17.4], [-1, 16.2], [-1, 0]], { seg: 40 }), { p: [0, A, 0] }));
  f.add("alu", extrudeX([[-6, A - 17], [6, A - 17], [6, A - 12], [-6, A - 12]], -12, 12, { bevel: 0.8 }));
  const lensM = lens(ctx, ctx.C.lensDisc(12.6, -53).translate(0, A, 0), "glassBlue");
  const lensF = lens(ctx, ctx.C.lensDisc(12.6, 51).translate(0, A, 0), "glassAmber");
  const body = node("magBody", [f.build(), lensM, lensF]);
  const flip = node("flip", [body]);
  flip.position.set(0, 17, -17);
  body.position.set(0, -17, 17);
  return { root: node("mag3x", [k.build(), flip]), sight: { y: A, z: 0, x0: -56, x1: 54, r: 12, mag: 3, eyeRelief: 70, magnifier: true, suffix: " + 3×", lens: lensM }, flipAside: { node: flip, angle: -88 } };
}
// Trijicon RMR Type 2: корпус-«клин» с закруглённым капюшоном, ушки защиты стекла,
// винты поправок сверху и справа, кнопки с обеих сторон, окно излучателя сзади.
function rmrBody(ctx, k) {
  const A = 15;
  // основание: трапециевидное сечение, скос к затылку
  k.add("alu", loftX([{ x: -22, pts: superEllipse(10.6, 3.4, 5, 32, 4, 0) }, { x: -19.5, pts: superEllipse(12.3, 4.5, 5, 32, 4.5, 0) }, { x: 23, pts: superEllipse(12.3, 4.5, 5, 32, 4.5, 0) }], { crease: 50 }));
  k.add("alu", extrudeZ([[-21, 8], [-6, 8], [-6, 10.8, 1.5], [-10, 11.8, 2], [-19, 11.2, 2], [-21, 9.5, 1]], 22.6, { bevel: 1.2 }));
  const arch = (w, h, y0) => {
    const pts = [[w, y0]];
    for (let i = 0; i <= 14; i++) {
      const a = i / 14 * Math.PI;
      pts.push([Math.cos(a) * w, h - w * 0.55 + Math.sin(a) * w * 0.55]);
    }
    pts.push([-w, y0]);
    return pts;
  };
  const hood = shape(arch(12.7, 25.4, 7), [arch(9.6, 22.4, 8.6)]);
  k.add("alu", extrudeX(hood, -3, 15, { bevel: 1 }));
  // «ушки»: утолщения капюшона у основания спереди
  for (const s of [-1, 1]) k.add("alu", extrudeX([[s * 12.9, 7], [s * 9.8, 7], [s * 9.8, 13], [s * 12.9, 16, 1]], 9, 16.4, { bevel: 0.6 }));
  for (const s of [-1, 1]) k.add("rubber", T(cylZ(3.2, 0, 1.6, { c: 0.6, seg: 16 }), { p: [-15, 10, s * 12.2], r: s < 0 ? [0, 180, 0] : [0, 0, 0] }));
  // окно излучателя и винты поправок
  k.add("lensBlack", extrudeX(rrect(0, 9.8, 5, 2.6, 1), -6.4, -5.8, { bevel: 0.1 }));
  k.add("steel", T(cylY(2.6, 10.5, 12.2, { seg: 14 }), { p: [-16, 0, 0] }));
  k.add("lensBlack", T(box(3.6, 0.5, 0.7, { bevel: 0.1 }), { p: [-16, 12.2, 0] }));
  k.add("steel", T(cylZ(2.6, 12.2, 13.8, { seg: 14 }), { p: [-2, 12, 0] }));
  k.add("lensBlack", T(box(0.7, 3.6, 0.5, { bevel: 0.1 }), { p: [-2, 12, 13.8] }));
  for (const s of [-1, 1]) k.add("steel", T(capScrew(1.5, 0.6), { r: [s * 90, 0, 0] }), { p: [-15, 4.5, s * 12.2] });
  return A;
}
function rmrOffset(ctx) {
  const k = ctx.kit(), m = ctx.kit();
  k.add("alu", clampBody(-12, 12, 5, { w: 24 }));
  k.add("steel", crossBolt(0));
  k.add("alu", extrudeX([[-12, 3, 1], [12, 3, 1], [30, 14, 3], [26, 21, 3], [6, 12, 3], [-12, 8, 2]], -12, 12, { bevel: 1.2 }));
  k.add("steel", T(capScrew(2, 1), { r: [-45, 0, 0] }), { p: [0, 14, 21] });
  m.add("alu", extrudeX(rrect(0, -1.5, 27, 5, 1.5), -23, 24, { bevel: 0.8 }));
  const A = rmrBody(ctx, m);
  const glass = lens(ctx, extrudeX(shape(rrect(0, A + 0.5, 18.6, 13.4, 5)), 6, 7, { bevel: 0.2 }), "glassAmber");
  const cant = node("rmrCant", [m.build(), glass]);
  cant.position.set(0, 16.5, 22);
  cant.rotation.x = Math.PI / 4;
  return {
    root: node("rmr_offset", [k.build(), cant]),
    // прицельная ось задана в системе наклонной площадки: при прицеливании оружие заваливается на 45°
    sight: { node: cant, y: A, z: 0, x0: -22, x1: 15, r: 9, mag: 1, reticle: "dot", lens: glass }
  };
}
// AN/PVS-14 на J-образном кронштейне: корпус с батарейным отсеком AA, ручка усиления,
// кольцо фокусировки объектива, наглазник, ИК-подсветка.
function pvs14(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  const A = 39;
  k.add("alu", clampBody(-16, 16, 6));
  k.add("steel", crossBolt(0));
  k.add("alu", extrudeX([[-18, 5, 2], [-6, 5, 2], [-6, 14, 3], [-18, 14, 3]], -15, 15, { bevel: 1 }));
  k.add("steel", cylX(3.6, -17, 17, { seg: 16 }), { p: [0, 11, -15] });
  for (const x of [-17, 17]) k.add("steel", cylX(4.4, x - 0.8, x + 0.8, { seg: 16 }), { p: [0, 11, -15] });
  f.add("alu", extrudeX(shape([[-17, 8, 2], [-9, 7, 2], [0, 12, 2], [10, 12, 2], [10, 16, 2], [-17, 16, 2]]), -14, 14, { bevel: 1 }));
  f.add("poly", T(extrudeX(shape(rrect(0, 0, 36, 12, 3)), -26, 16, { bevel: 1.5 }), { p: [0, 20, 0] }));
  const at = (g) => g.translate(0, A, 0);
  f.add("poly", at(hollowLathe([[-34, 17], [-30, 20], [22, 20], [26, 17.5]], 13, { seg: 44 })));
  f.add("poly", at(hollowLathe([[-62, 16.5], [-34, 16.5]], 13, { seg: 36 })));
  f.add("rubber", at(flutesX(16.5, -58, -40, 24, 1.6, 0.9)));
  // наглазник с «лепестком» и рёбрами
  f.add("rubber", at(hollowLathe([[-86, 20.5], [-84, 21.8], [-80, 21.5], [-72, 19.6], [-64, 18.5], [-62, 17]], 15, { seg: 44 })));
  f.add("rubber", at(flutesX(19.4, -71, -64, 16, 1.4, 0.7)));
  f.add("poly", at(hollowLathe([[26, 19.5], [58, 19.5], [60, 18]], 15, { seg: 44 })));
  f.add("rubber", at(flutesX(19.5, 30, 54, 28, 1.8, 1)));
  f.add("lensBlack", at(tubeX(15, 13.6, 52, 60.2, { seg: 32 })));
  // батарейный отсек слева с рифлёной крышкой, ручка усиления и поворотный выключатель
  f.add("poly", T(cylZ(10, -36, -18, { c: 1, seg: 28 }), { p: [0, A + 4, 0] }));
  f.add("poly", T(ctx.C.knob(10.6, 5, 24), { r: [0, 90, 0], p: [0, A + 4, -36] }));
  f.add("poly", T(ctx.C.knob(8, 7, 12), { r: [0, 90, 0], p: [-22, A, -19] }));
  f.add("poly", T(ctx.C.knob(6.5, 5, 14), { r: [0, 0, 90], p: [-14, A + 20, 0] }));
  f.add("poly", T(box(10, 3, 2.4, { bevel: 0.6 }), { p: [-14, A + 26.2, 0] }));
  f.add("poly", T(extrudeX(rrect(0, 0, 8, 6, 2), 16, 24, { bevel: 0.8 }), { p: [0, A + 19, 9] }));
  f.add("irLens", T(cylX(2.2, 23.6, 24.4, { seg: 14 }), { p: [0, A + 19, 9] }));
  const lensO = lens(ctx, ctx.C.lensDisc(13.8, 56).translate(0, A, 0), "glassBlue");
  const lensE = lens(ctx, ctx.C.lensDisc(14, -64).translate(0, A, 0), "glassRed");
  const body = node("pvsBody", [f.build(), lensO, lensE]);
  const flip = node("flip", [body]);
  flip.position.set(0, 11, -15);
  body.position.set(0, -11, 15);
  return { root: node("pvs14", [k.build(), flip]), sight: { y: A, z: 0, x0: -86, x1: 60, r: 14, mag: 1, eyeRelief: 22, magnifier: true, nv: true, hide: body, suffix: " + PVS-14", lens: lensE }, flipAside: { node: flip, angle: -95 } };
}
// Magpul MBUS Gen 2: полимерный складной диоптр с двумя апертурами и барабаном поправки справа.
function mbusRear(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  k.add("poly", clampBody(-13, 13, 6, { w: 25 }));
  k.add("steel", crossBolt(0));
  k.add("poly", extrudeZ([[-13, 5], [13, 5], [13, 11, 3], [-13, 11, 3]], 30, { bevel: 1.5 }));
  for (const s of [-1, 1]) k.add("poly", extrudeZ([[-10, 9, 1], [6, 9, 1], [4, 15, 2], [-10, 14, 2]], 3, { bevel: 0.8, z: s * 11 }));
  for (let i = 0; i < 4; i++) k.add("poly", T(box(1.2, 1, 22, { bevel: 0.3 }), { p: [-10 + i * 2.6, 11.2, 0] }));
  f.add("poly", extrudeX(shape([[-13, 0, 1], [13, 0, 1], [13, 42, 3], [-13, 42, 3]], [circle(0, 29.5, 2.7, 24)]), -3.5, 3.5, { bevel: 1 }));
  f.add("poly", T(tubeX(8, 2.6, -2.5, 2.5, { seg: 28 }), { p: [0, 29.5, 0] }));
  f.add("poly", T(tubeX(5.4, 1, -2.2, 2.2, { seg: 20 }), { p: [0, 29.5, 0] }));
  f.add("poly", T(ctx.C.knob(5.2, 5, 16), { r: [0, -90, 0], p: [0, 22, 12] }));
  f.add("paintWhite", T(box(0.5, 2.4, 0.3), { p: [0, 26.2, 13.2] }));
  const flip = node("flip", [f.build()]);
  flip.position.set(4, 10, 0);
  flip.children[0].position.set(-4, -4, 0);
  return { root: node("mbus_rear", [k.build(), flip]), irons: { rear: [0, 35.5, 0], type: "aperture" }, flip: { node: flip, angle: -90 } };
}
function mbusFront(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  k.add("poly", clampBody(-13, 13, 6, { w: 25 }));
  k.add("steel", crossBolt(0));
  k.add("poly", extrudeZ([[-13, 5], [13, 5], [13, 11, 3], [-13, 11, 3]], 30, { bevel: 1.5 }));
  for (let i = 0; i < 4; i++) k.add("poly", T(box(1.2, 1, 22, { bevel: 0.3 }), { p: [4 + i * 2.6, 11.2, 0] }));
  const ear = [[-6, 0, 1], [6, 0, 1], [5, 32, 2], [1, 42, 2], [-2, 42, 2], [-6, 30, 2]];
  f.add("poly", extrudeZ(shape(ear), 3.4, { bevel: 0.8, z: 8 }));
  f.add("poly", extrudeZ(shape(ear), 3.4, { bevel: 0.8, z: -8 }));
  f.add("poly", extrudeZ([[-6, 0, 1], [6, 0, 1], [6, 14, 2], [-6, 14, 2]], 19, { bevel: 1 }));
  // барабан высоты под мушкой (4 защёлки) и стальная мушка
  f.add("poly", T(ctx.C.knob(5.5, 4, 12), { r: [0, 0, 90], p: [0, 14, 0] }));
  f.add("steel", cylY(2, 12, 29.5, { seg: 12 }));
  f.add("steel", extrudeZ([[-1.1, 28], [1.1, 28], [0.8, 35.5, 0.3], [-0.8, 35.5, 0.3]], 1.8, { bevel: 0.2 }));
  const flip = node("flip", [f.build()]);
  flip.position.set(-6, 10, 0);
  flip.children[0].position.set(6, -4, 0);
  return { root: node("mbus_front", [k.build(), flip]), irons: { front: [0, 35.5, 0] }, flip: { node: flip, angle: 90 } };
}
// Корпус оптического прицела вокруг оси: окуляр с быстрой диоптрийной фокусировкой, кольцо
// кратности с рычагом и цифрами, трубка, седло с открытыми барабанами, объектив с резьбой бленды.
// at — перенос на высоту оси; o.tube — радиус трубки (15 = 30 мм, 17 = 34 мм), o.obj — радиус объектива.
function scopeBody(ctx, k, at, o) {
  const r = o.tube, R0 = o.obj + 2.2, x0 = o.x0, x1 = o.x1, M = o.mat || "alu";
  k.add(M, at(hollowLathe([
    [x0, 17], [x0 + 1, 20.5], [x0 + 8, 21.4], [x0 + 48, 21.4], [x0 + 54, 19.2], [x0 + 62, r + 3], [x0 + 86, r + 3], [x0 + 90, r],
    [x1 - 70, r], [x1 - 50, R0 - 3], [x1 - 34, R0], [x1 - 12, R0], [x1 - 11.4, R0 + 0.5], [x1 - 1, R0 + 0.5], [x1, R0 - 0.7]
  ], Math.min(r - 1.6, 14), { seg: 48 })));
  k.add(M, at(flutesX(21.1, x0 + 1.5, x0 + 7.5, 48, 1.1, 0.8)));
  k.add("rubber", at(tubeX(21.8, 20.6, x0 + 11, x0 + 40, { seg: 44 })));
  k.add("paintWhite", at(hashMarks(21.45, x0 + 44, 9, { arc: 80, a0: -40, major: 4, len: 1.2 })));
  k.add("rubber", at(flutesX(r + 2.6, x0 + 64, x0 + 84, 30, 1.6, 1)));
  k.add("paintWhite", at(hashMarks(r + 3.05, x0 + 62.4, 7, { arc: 130, a0: -65, major: 1, len: 1 })));
  k.add(M, at(extrudeZ([[x0 + 70, r + 2], [x0 + 80, r + 2], [x0 + 79, r + 10, 2], [x0 + 71, r + 10, 2]], 6, { bevel: 1 })));
  k.add(M, at(extrudeZ([[x0 + 68.6, r + 9, 2], [x0 + 81.4, r + 9, 2], [x0 + 81.4, r + 13, 2.2], [x0 + 68.6, r + 13, 2.2]], 7, { bevel: 1.3 })));
  k.add("paintWhite", at(T(box(0.6, 3, 0.6), { p: [x0 + 89, r + 0.1, 5] })));
  k.add(M, at(flutesX(R0 + 0.4, x1 - 10.6, x1 - 1.8, 40, 1, 0.6)));
  k.add("lensBlack", at(tubeX(Math.min(r - 1.5, 14), Math.min(r - 2.5, 13), x0 + 1, x1 - 1, { seg: 32 })));
  const sx = o.saddle ?? -10;
  const sl = o.saddleL ?? 26;
  k.add(M, at(extrudeX(shape(rrect(0, 0, 2 * r + 8, 2 * r + 6, r)), sx - sl, sx + sl, { bevel: 2 })));
  // барабаны: высота сверху (с нулевым упором), ветер справа, параллакс слева
  const put = (oo, t) => {
    const tt = turret(oo);
    for (const g of tt.m) k.add(M, at(g, t));
    for (const g of tt.w) k.add("paintWhite", at(g, t));
  };
  put({ r: o.turret, h: o.turret * 0.95, base: 2.4, marks: 50, knurl: 44, markLen: 1.6 }, { p: [sx, r + 3, 0] });
  put({ r: o.turret - 1, h: (o.turret - 1) * 0.8, base: 2.4, marks: 40, knurl: 40, markLen: 1.4 }, { r: [90, 0, 0], p: [sx, 0, r + 4] });
  put({ r: o.turret - 2.5, h: (o.turret - 2.5) * 0.75, base: 2, marks: 20, major: 4, knurl: 34, markLen: 1.2 }, { r: [-90, 0, 0], p: [sx, 0, -r - 4] });
}
// Кольца: основание-зажим, полукольца с разъёмом по горизонтали, по два винта на сторону.
function scopeRings(ctx, k, xs, A, r) {
  for (const x of xs) {
    k.add("alu", clampBody(x - 10, x + 10, 6));
    k.add("steel", crossBolt(x, -2.5, 13));
    k.add("alu", extrudeX([[-10, 5, 1], [10, 5, 1], [8, A - r + 2], [-8, A - r + 2]], x - 9, x + 9, { bevel: 1 }));
    k.add("alu", T(tubeX(r + 4, r + 0.1, x - 9, x + 9, { seg: 44, c: 1 }), { p: [0, A, 0] }));
    for (const s of [-1, 1]) k.add("alu", T(box(16, 5, 7, { bevel: 1.2 }), { p: [x, A, s * (r + 5)] }));
    for (const s of [-1, 1]) k.add("lensBlack", T(box(17.4, 0.45, 8.4, { bevel: 0.1 }), { p: [x, A, s * (r + 4.6)] }));
    for (const s of [-1, 1]) for (const d of [-4.5, 4.5]) k.add("steel", capScrew(2, 1.2), { p: [x + d, A + 2.5, s * (r + 5)] });
  }
}
function sniperScope(ctx, o) {
  const k = ctx.kit();
  const A = o.A, at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  scopeBody(ctx, k, at, o);
  // подсветка сетки: ручка поверх барабана параллакса
  const sx = o.saddle ?? -10;
  k.add("alu", at(T(ctx.C.knob(o.turret - 5, 5, 20), { r: [0, 90, 0] }), { p: [sx, 0, -o.tube - 4 - 2 - (o.turret - 2.5) * 0.75 - 0.6] }));
  k.add("steel", at(cylZ(o.turret - 8, -o.tube - 7 - (o.turret - 2.5) * 0.75, -o.tube - 5.5 - (o.turret - 2.5) * 0.75, { seg: 20 }), { p: [sx, 0, 0] }));
  scopeRings(ctx, k, o.rings, A, o.tube);
  const root = node(o.name, [k.build()]);
  const oc = lens(ctx, at(ctx.C.lensDisc(18.5, o.x0 + 2)), "glassBlue");
  const ob = lens(ctx, at(ctx.C.lensDisc(o.obj, o.x1 - 2)), "glassAmber");
  root.add(oc, ob);
  return { root, sight: { y: A, z: 0, x0: o.x0, x1: o.x1, r: o.tube, mag: o.zoom[0], zoom: o.zoom, reticle: o.reticle || "mil", eyeRelief: o.eyeRelief ?? 90, lens: oc } };
}
var mag1x39 = (cfg, asm) => {
  const it = asm.installed.get("optic");
  const s = it?.info?.sight;
  return !!s && s.mag === 1 && !s.zoom && Math.abs(s.y - 39) < 1.5;
};
// ---- прицелы и крепления из набора M416/АК/SCAR
function cantOptic(ctx, name, body) {
  const k = ctx.kit(), m = ctx.kit();
  k.add("alu", clampBody(-13, 13, 5, { w: 24 }));
  k.add("steel", crossBolt(0));
  k.add("alu", extrudeX([[-12, 3, 1], [12, 3, 1], [31, 14, 3], [27, 22, 3], [6, 12, 3], [-12, 8, 2]], -13, 13, { bevel: 1.2 }));
  for (const x of [-7, 7]) k.add("steel", T(cylX(1.9, 0, 1.4, { seg: 6 }).rotateY(Math.PI / 2), { p: [x, 17, 24] }));
  m.add("alu", extrudeX(rrect(0, -1.5, 28, 5, 1.5), -24, 25, { bevel: 0.8 }));
  const b = body(ctx, m);
  const cant = node(name + "Cant", [m.build(), b.glass]);
  cant.position.set(0, 16.5, 22);
  cant.rotation.x = Math.PI / 4;
  return {
    root: node(name, [k.build(), cant]),
    sight: { node: cant, y: b.A, z: 0, x0: b.x0, x1: b.x1, r: 9, mag: 1, reticle: b.reticle || "dot", lens: b.glass }
  };
}
function dppBody(ctx, k) {
  const A = 17;
  k.add("alu", extrudeX(rrect(0, 4, 26, 8, 2), -24, 22, { bevel: 1.2 }));
  k.add("alu", extrudeZ([[-24, 7], [-8, 7], [-8, 11], [-14, 13.5, 2], [-24, 12.5, 2]], 24, { bevel: 1.2 }));
  const hood = shape([[-13, 7], [13, 7], [13, 22, 3], [8, 29, 5], [-8, 29, 5], [-13, 22, 3]], [[[-10, 8.6], [10, 8.6], [10, 21.5, 2], [6.5, 26.5, 4], [-6.5, 26.5, 4], [-10, 21.5, 2]]]);
  k.add("alu", extrudeX(hood, 0, 17, { bevel: 1 }));
  k.add("steel", T(box(10, 2.4, 20, { bevel: 0.6 }), { p: [8, 28.6, 0] }));
  k.add("rubber", T(cylY(3, 11, 13.6, { seg: 16, c: 0.6 }), { p: [-18, 0, 0] }));
  for (const s of [-1, 1]) k.add("steel", T(cylZ(2.2, 12.6, 13.6, { seg: 12 }), { p: [-4, 11, s > 0 ? 0 : -26.2] }));
  const glass = lens(ctx, extrudeX(shape([[-9.6, 9], [9.6, 9], [9.6, 21, 2], [6, 26, 4], [-6, 26, 4], [-9.6, 21, 2]]), 11, 12, { bevel: 0.2 }), "glassAmber");
  return { A, glass, x0: -24, x1: 17, reticle: "dot" };
}
function acroBody(ctx, k) {
  const A = 16;
  const sec = shape(rrect(0, 14, 30, 28, 5), [rrect(0, 16, 20, 17, 3)]);
  k.add("alu", extrudeX(sec, -12, 16, { bevel: 1.4 }));
  k.add("alu", extrudeX(rrect(0, 4, 30, 8, 2), -24, 16, { bevel: 1.2 }));
  // задний торец закрытого корпуса — рамка с окном, прицельная линия через неё открыта
  k.add("alu", extrudeX(shape(rrect(0, 14.5, 30, 15, 3), [rrect(0, 15.5, 20, 11, 2)]), -24, -12, { bevel: 1.2 }));
  for (const s of [-1, 1]) k.add("rubber", T(box(6, 5, 1.6, { bevel: 0.6 }), { p: [-18, 12, s * 13.8] }));
  k.add("steel", T(cylY(3.4, 1, 2, { seg: 20 }), { p: [-2, -1, 0] }));
  const glass = lens(ctx, extrudeX(shape(rrect(0, 16, 20, 17, 3)), 12, 13, { bevel: 0.2 }), "glassBlue");
  return { A, glass, x0: -12, x1: 16, reticle: "dot" };
}
function hs507Body(ctx, k) {
  const A = rmrBody(ctx, k);
  k.add("alu", T(box(16, 9, 2.2, { bevel: 0.8 }), { p: [-10, 5, 13.3] }));
  k.add("steel", T(cylZ(1.5, 14.2, 15, { seg: 10 }), { p: [-15, 5, 0] }));
  const glass = lens(ctx, extrudeX(shape(rrect(0, A + 0.5, 18.6, 13.4, 5)), 6, 7, { bevel: 0.2 }), "glassBlue");
  return { A, glass, x0: -22, x1: 15, reticle: "cdot" };
}
function compm4(ctx) {
  const k = ctx.kit();
  const A = 39;
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  k.add("alu", clampBody(-16, 16, 6));
  k.add("alu", extrudeZ(shape([[-15, 5, 1], [15, 5, 1], [13, A - 17, 3], [-13, A - 17, 3]], [slot(-7, 7, (A - 12) / 2 + 3, 8)]), 20, { bevel: 1.2 }));
  k.add("alu", at(tubeX(22.4, 19.6, -11, 11, { seg: 44, c: 1.2 })));
  k.add("alu", extrudeX([[-6, A - 26], [6, A - 26], [6, A - 18], [-6, A - 18]], -11, 11, { bevel: 0.8 }));
  k.add("alu", T(ctx.C.knob(11, 9, 20), { r: [0, -90, 0], p: [0, -1, 13] }));
  k.add("steel", cylZ(3.4, -15, 13, { seg: 12 }), { p: [0, -1, 0] });
  k.add("alu", at(hollowLathe([[-60, 18.8], [-59, 21], [-50, 21], [-48, 19.6], [36, 19.6], [40, 21.6], [58, 21.6], [60, 20.2]], [[-60, 15.2], [60, 17.4]], { seg: 48 })));
  k.add("rubber", at(tubeX(21.4, 20.2, -58, -50, { seg: 44 })));
  k.add("lensBlack", at(tubeX(17.5, 16.8, -58, 58, { seg: 32 })));
  k.add("alu", at(ringGrooves(21.6, 44, 56, 4, 0.5, { seg: 44, rIn: 17.5 })));
  // блок барабанов охватывает трубку: канал на оси открыт
  k.add("alu", at(extrudeX(shape(rrect(0, 0, 34, 34, 9), [circle(0, 0, 16.4, 44)]), 8, 30, { bevel: 1.6 })));
  k.add("alu", at(cylY(9.5, 16, 26, { c: 1.2, seg: 28 }), { p: [19, 0, 0] }));
  k.add("alu", at(cylZ(9.5, 16, 26, { c: 1.2, seg: 28 }), { p: [19, 0, 0] }));
  k.add("alu", at(cylX(9.4, 14, 58, { c: 1, seg: 28 }), { p: [0, -21, 0] }));
  k.add("alu", at(extrudeX([[-7, -19], [7, -19], [7, -12], [-7, -12]], 14, 58, { bevel: 0.8 })));
  k.add("alu", at(ctx.C.knob(10, 8, 24), { r: [0, 0, -90], p: [58, -21, 0] }));
  k.add("alu", at(ctx.C.knob(9, 7, 20), { r: [0, 90, 0], p: [-30, 0, -19.5] }));
  const root = node("compm4", [k.build()]);
  root.add(lens(ctx, at(ctx.C.lensDisc(15.4, -57)), "glassBlue"));
  const front = lens(ctx, at(ctx.C.lensDisc(17.4, 57)), "glassRed");
  root.add(front);
  return { root, sight: { y: A, z: 0, x0: -60, x1: 60, r: 15, mag: 1, reticle: "dot", lens: front } };
}
function rmrRiser(ctx) {
  const k = ctx.kit(), m = ctx.kit();
  const H = 24;
  k.add("alu", clampBody(-17, 17, 5, { w: 25 }));
  k.add("steel", crossBolt(-8));
  k.add("steel", crossBolt(8));
  k.add("alu", extrudeZ(shape([[-18, 4, 1], [18, 4, 1], [17, H, 1.5], [-17, H, 1.5]], [slot(-10, 10, H / 2 + 2, 8)]), 24, { bevel: 1 }));
  k.add("alu", extrudeX(rrect(0, H - 1.5, 26, 3, 1), -22, 22, { bevel: 0.6 }));
  const A = rmrBody(ctx, m);
  const glass = lens(ctx, extrudeX(shape(rrect(0, A + 0.5, 18.6, 13.4, 5)), 6, 7, { bevel: 0.2 }), "glassAmber");
  const body = node("rmr", [m.build(), glass]);
  body.position.set(-3, H, 0);
  return { root: node("rmr_riser", [k.build(), body]), sight: { node: body, y: A, z: 0, x0: -22, x1: 15, r: 9, mag: 1, reticle: "dot", lens: glass } };
}
function pk120(ctx) {
  const k = ctx.kit();
  const A = 40;
  k.add("alu", clampBody(-24, 24, 6));
  k.add("steel", crossBolt(-10));
  k.add("steel", T(ctx.C.knob(8, 7, 18), { r: [0, -90, 0], p: [12, -1, 13] }));
  k.add("alu", extrudeX([[-15, 5, 1], [15, 5, 1], [15, A - 16, 2], [-15, A - 16, 2]], -30, 30, { bevel: 1.2 }));
  const oct = (w, h, c, cy) => [[-w + c, cy - h], [w - c, cy - h], [w, cy - h + c], [w, cy + h - c], [w - c, cy + h], [-w + c, cy + h], [-w, cy + h - c], [-w, cy - h + c]];
  k.add("alu", extrudeX(shape(oct(20, 17, 6, A), [oct(16, 13, 5, A)]), -34, 34, { bevel: 1.2 }));
  k.add("alu", extrudeX(shape(oct(21, 18, 6.5, A), [oct(16.5, 13.5, 5, A)]), 26, 36, { bevel: 1 }));
  k.add("alu", T(cylX(7.5, -30, 6, { c: 1, seg: 24 }), { p: [0, A - 4, 24] }));
  k.add("alu", T(ctx.C.knob(7.8, 5, 18), { r: [0, 180, 0], p: [-30, A - 4, 24] }));
  k.add("alu", T(ctx.C.knob(9, 7, 22), { r: [0, 90, 0], p: [-18, A - 6, -20] }));
  const root = node("pk120", [k.build()]);
  const win = lens(ctx, extrudeX(shape(oct(16, 13, 5, A)), 24, 25, { bevel: 0.2 }), "glassRed");
  root.add(win);
  return { root, sight: { y: A, z: 0, x0: -34, x1: 36, r: 12, mag: 1, reticle: "dot", lens: win } };
}
function okp7(ctx) {
  const k = ctx.kit();
  const Y = 50, Z = 19;
  k.add("steel", extrudeX(shape([[-3, -9, 1], [4, -9], [4, 9], [-3, 9, 1], [-11, 7, 2], [-11, -7, 2]]), -46, 46, { bevel: 0.8 }));
  k.add("steel", T(ctx.C.knob(7, 6, 18), { r: [0, 90, 0], p: [-26, 0, -11] }));
  k.add("alu", extrudeX(shape([[-11, 6, 2], [4, 6, 2], [Z - 6, Y - 18, 3], [Z - 10, Y - 12, 3], [-11, 20, 2]]), -44, 44, { bevel: 1.4 }));
  const trap = (w0, w1, y0, y1) => [[Z - w0, y0, 2], [Z + w0, y0, 2], [Z + w1, y1, 5], [Z - w1, y1, 5]];
  k.add("alu", extrudeX(shape(trap(22, 17, Y - 17, Y + 15), [trap(17.5, 13.5, Y - 13, Y + 11.5)]), -48, 40, { bevel: 1.4 }));
  k.add("alu", extrudeX([[Z - 18, Y - 22, 2], [Z + 18, Y - 22, 2], [Z + 18, Y - 16], [Z - 18, Y - 16]], -48, -8, { bevel: 1 }));
  k.add("alu", T(ctx.C.knob(8, 6, 20), { r: [0, -90, 0], p: [-30, Y - 6, Z + 21] }));
  const root = node("okp7", [k.build()]);
  const win = lens(ctx, extrudeX(shape(trap(17.5, 13.5, Y - 13, Y + 11.5)), 30, 31, { bevel: 0.2 }), "glassAmber");
  root.add(win);
  return { root, sight: { y: Y - 1, z: Z, x0: -48, x1: 31, r: 12, mag: 1, reticle: "dot", lens: win } };
}
var OPTICS = [
  { id: "t2_low", cat: "optic", name: "Aimpoint Micro T-2", desc: "Коллиматор, низкое крепление (ось 20 мм). Для высоких планок АК", needs: (cfg) => !cfg.rearsight, needsWhy: "ось 20 мм ниже сложенного целика — снимите целик", foot: [-18, 18], body: [-38, 38], stats: { weight: 135, ergo: -1, adsTime: 8 }, build: (c) => t2(c, 20) },
  { id: "t2_lrp", cat: "optic", name: "Aimpoint T-2 + LRP 39 мм", desc: "Коллиматор на кронштейне, нижняя треть с механикой AR", foot: [-18, 18], body: [-38, 38], stats: { weight: 190, ergo: -1, adsTime: 10 }, build: (c) => t2(c, 39) },
  { id: "compm4", cat: "optic", name: "Aimpoint CompM4s", desc: "Армейский коллиматор, точка 2 MOA, батарея АА на 8 лет", foot: [-16, 16], body: [-62, 62], stats: { weight: 380, ergo: -3, adsTime: 14 }, build: compm4 },
  { id: "rmr_riser", cat: "optic", name: "Trijicon RMR на райзере Unity", desc: "Мини-коллиматор открытого типа, самый лёгкий", foot: [-17, 17], body: [-25, 22], stats: { weight: 90, ergo: 0, adsTime: 6 }, build: rmrRiser },
  { id: "exps3", cat: "optic", name: "EOTech EXPS3", desc: "Голографический, кольцо 68 MOA с точкой", foot: [-22, 22], body: [-48, 46], stats: { weight: 320, ergo: -3, adsTime: 14 }, build: (c) => exps3(c) },
  { id: "xps2", cat: "optic", name: "EOTech XPS2", desc: "Короткий голографический, одна батарея CR123", foot: [-18, 18], body: [-40, 46], stats: { weight: 255, ergo: -2, adsTime: 12 }, build: (c) => exps3(c, { xps2: true }) },
  { id: "mro", cat: "optic", name: "Trijicon MRO", desc: "Коллиматор-трубка, объектив 25 мм, точка 2 MOA, нижняя треть", foot: [-20, 20], body: [-31, 32], stats: { weight: 150, ergo: -1, adsTime: 9 }, build: (c) => mro(c, 39) },
  { id: "hs510c", cat: "optic", name: "Holosun HS510C", desc: "Открытый коллиматор с рамкой, кольцо 65 MOA + точка, широкое поле", foot: [-22, 22], body: [-34, 30], stats: { weight: 250, ergo: -2, adsTime: 10 }, build: hs510c },
  { id: "pk120", cat: "optic", name: "ПК-120 (БелОМО)", desc: "Коллиматор в защищённом кожухе-тоннеле", foot: [-24, 24], body: [-40, 37], stats: { weight: 310, ergo: -2, adsTime: 12 }, build: pk120 },
  { id: "okp7d", cat: "optic", name: "ОКП-7Д «Валдай»", desc: "Низкий коллиматор на боковую планку АК, окно над крышкой", mountTypes: ["dovetail"], only: ["akm", "ak74"], foot: [-46, 46], body: [-48, 46], needs: (cfg) => !cfg.sidemount, stats: { weight: 290, ergo: -2, adsTime: 11 }, build: okp7 },
  { id: "acog", cat: "optic", name: "Trijicon ACOG TA31 4×32", desc: "Призменный 4×, шеврон с дальномерной шкалой", foot: [-32, 32], body: [-75, 76], stats: { weight: 480, ergo: -6, adsTime: 40 }, build: acog },
  { id: "lpvo", cat: "optic", name: "Прицел 1–6×24", desc: "Переменная кратность, колёсико — зум в прицеле", foot: [-38, 34], body: [-132, 106], stats: { weight: 720, ergo: -9, adsTime: 55 }, build: lpvo },
  { id: "mk5hd", cat: "optic", name: "Leupold Mark 5HD 3,6–18×44", desc: "Снайперский, трубка 35 мм, сетка mil-dot, колесо — кратность", foot: [-58, 34], body: [-178, 112], stats: { weight: 880, ergo: -12, adsTime: 70 }, build: (c) => sniperScope(c, { name: "mk5hd", A: 36, tube: 17.5, obj: 23, turret: 15, x0: -178, x1: 112, saddle: -12, saddleL: 20, rings: [-48, 24], zoom: [3.6, 18], eyeRelief: 92 }) },
  { id: "sb_pm2", cat: "optic", name: "Schmidt & Bender PM II 5–25×56", desc: "Тяжёлый дальнобойный прицел, объектив 56 мм — высокие кольца", foot: [-56, 36], body: [-190, 142], stats: { weight: 1100, ergo: -15, adsTime: 85 }, build: (c) => sniperScope(c, { name: "pm2", A: 44, tube: 17.5, obj: 29, turret: 16, x0: -190, x1: 142, saddle: -8, saddleL: 20, rings: [-46, 26], zoom: [5, 25], eyeRelief: 90 }) },
  { id: "mag3x", cat: "magnifier", name: "Aimpoint 3XMag-1 + FTS", desc: "Увеличитель 3×, откидывается вбок", foot: [-16, 16], body: [-57, 55], needs: mag1x39, stats: { weight: 330, ergo: -4, adsTime: 20 }, build: magnifier },
  { id: "pvs14", cat: "magnifier", name: "Монокуляр AN/PVS-14", desc: "ПНВ за коллиматором на откидном кронштейне (N — откинуть)", foot: [-16, 16], body: [-86, 60], needs: mag1x39, stats: { weight: 420, ergo: -6, adsTime: 25 }, build: pvs14 },
  { id: "rmr_off", cat: "offset", side: true, name: "Trijicon RMR на 45° кронштейне", desc: "Мини-коллиматор сбоку для ближнего боя: нажатие колеса переключает, оружие заваливается", foot: [-12, 12], body: [-23, 24], stats: { weight: 95, ergo: -1 }, build: rmrOffset },
  { id: "dpp_off", cat: "offset", side: true, name: "Leupold DeltaPoint Pro на 45°", desc: "Наклонный коллиматор с большим окном, точка 2,5 MOA (нажатие колеса переключает)", foot: [-13, 13], body: [-24, 25], stats: { weight: 110, ergo: -1 }, build: (c) => cantOptic(c, "dpp_off", dppBody) },
  { id: "acro_off", cat: "offset", side: true, name: "Aimpoint ACRO P-2 на 45°", desc: "Наклонный закрытый коллиматор: излучатель защищён от грязи и воды", foot: [-13, 13], body: [-24, 25], stats: { weight: 120, ergo: -1 }, build: (c) => cantOptic(c, "acro_off", acroBody) },
  { id: "hs507_off", cat: "offset", side: true, name: "Holosun HS507C на 45°", desc: "Наклонный коллиматор: кольцо 32 MOA + точка, боковой лоток батареи", foot: [-13, 13], body: [-24, 25], stats: { weight: 100, ergo: -1 }, build: (c) => cantOptic(c, "hs507_off", hs507Body) },
  { id: "mbus_rear", cat: "rearsight", name: "Magpul MBUS (целик)", desc: "Складной диоптр, полимер", foot: [-13, 13], body: [-13, 13], stats: { weight: 34 }, build: mbusRear },
  { id: "mbus_front", cat: "frontsight", name: "Magpul MBUS (мушка)", desc: "Складная мушка, полимер", foot: [-13, 13], body: [-13, 13], stats: { weight: 26 }, build: mbusFront }
];

// ==== engine/lib/dovetail.js
// Боковой «ласточкин хвост» (АК/СВД): кронштейн под Пикатинни и прицелы на прямом креплении.
// Система координат — у планки на левом борту ствольной коробки: z<0 — наружу, z>0 — к оси.
// Зажимной рычаг на наружной стороне колодки: лежит вдоль борта, ось с гайкой натяжения.
function dovetailLever(k, x0, x1, o = {}) {
  const z = o.z ?? -11, len = x1 - x0;
  k.add("steel", extrudeZ([[0, -3.2, 1.6], [len - 6, -2.6, 3], [len, -1.2, 2.4], [len, 3.6, 2.4], [len - 6, 5.2, 3], [4, 4.4, 2], [0, 2.6, 1.6]], 3, { bevel: 0.8, curve: 6 }), { p: [x0, o.y ?? 0, z - 1.5] });
  for (let i = 0; i < 5; i++) k.add("steel", T(box(0.9, 5.6, 1, { bevel: 0.25 }), { p: [x0 + len - 2 - i * 1.7, (o.y ?? 0) + 1.2, z - 3.2] }));
  k.add("steel", latheX([[0, 0], [0, 4.4], [0.6, 5], [2.4, 5], [3, 4.4], [3, 2.2], [3.6, 1.8], [3.6, 0]], { seg: 20 }), { r: [0, 90, 0], p: [x0 + 3.5, o.y ?? 0, z] });
}
function dovetailClamp(k, x0, x1, o = {}) {
  k.add("steel", extrudeX(shape([[-3, -9, 1], [4, -9], [4, 9], [-3, 9, 1], [-11, 7, 2], [-11, -7, 2]]), x0, x1, { bevel: 0.8 }));
  // канавка-упор и винты крепления колодки
  k.add("lensBlack", extrudeX([[-11.1, -0.3], [-10.6, -0.3], [-10.6, 0.3], [-11.1, 0.3]], x0 + 4, x1 - 4, { bevel: 0.05 }));
  for (const x of o.screws ?? []) k.add("steel", T(capScrew(2, 0.9), { r: [-90, 0, 0] }), { p: [x, 4, -11] });
  // гайка натяжения на заднем торце
  k.add("steel", T(thumbNut(6, 4, 8), { r: [0, 180, 0] }), { p: [x0, 0, -4] });
}
function sideMount(ctx) {
  const k = ctx.kit();
  dovetailClamp(k, -55, 55, { screws: [-40, 40] });
  dovetailLever(k, 14, 46);
  const riser = shape([[-55, 8, 2], [55, 8, 2], [55, 20, 3], [40, 46, 4], [-40, 46, 4], [-55, 20, 3]], [slot(-30, 30, 26, 14)]);
  k.add("alu", T(extrudeZ(riser, 8, { bevel: 1.2 }), { p: [0, 0, -5] }));
  const top = 58, cz = 19;
  k.add("alu", extrudeX(shape([[-6, 42, 2], [cz + 11, 42, 2], [cz + 11, top - 9, 2], [-6, top - 9, 2]]), -52, 52, { bevel: 1 }));
  for (const x of [-26, 0, 26]) k.add("lensBlack", extrudeZ(rrect(x, 45.5, 14, 3, 1.5), 0.6, { bevel: 0.1, z: cz + 11.2 }));
  const r = picatinny(104, { base: 9.4 });
  k.add("alu", r.geo, { p: [-52, top, cz] });
  const m = ctx.railMount("sideRail", [-52 + r.first, top, cz], "top", r.slots, { axis: "top" });
  return { root: node("sidemount", [k.build(), m]) };
}
// ПСО-1 4×24: трубка с длинным резиновым наглазником, корпус механизмов с маховичком
// углов прицеливания (цифры 0–10) сверху и боковых поправок слева, осветитель сетки
// с батарейным отсеком и тумблером, кронштейн с зажимным рычагом и гайкой.
function pso1(ctx) {
  const k = ctx.kit();
  dovetailClamp(k, -60, 40, { screws: [-48, 28] });
  dovetailLever(k, -46, -12);
  const Y = 60, Z = 13;
  const at = (g) => g.translate(0, Y, Z);
  // кронштейн: наклонная стенка от колодки к корпусу механизмов, рёбра жёсткости
  k.add("steel", extrudeX(shape([[-12, 6, 2], [4, 6, 2], [Z + 6, Y - 22, 4], [Z - 8, Y - 14, 4], [-12, 18, 2]]), -58, 36, { bevel: 1.5 }));
  for (const x of [-40, 18]) k.add("steel", extrudeX(shape([[-8, 8, 1], [2, 8, 1], [Z + 2, Y - 20, 2], [Z - 6, Y - 18, 2]]), x - 2, x + 2, { bevel: 0.6 }));
  // трубка: окулярная часть, корпус, объектив с блендой
  k.add("steel", at(latheX([[-150, 0], [-150, 17], [-146, 19], [-136, 19], [-135.4, 18.4], [-133.8, 18.4], [-133.2, 19], [-120, 19], [-114, 16], [-96, 16], [-92, 17.2], [100, 17.2], [104, 18.4], [134, 18.4], [136, 20], [150, 20], [150.6, 20.5], [153, 20.5], [153.6, 20], [176, 20], [177, 18.8], [177, 0]], { seg: 44 })));
  k.add("lensBlack", at(tubeX(18.9, 17.8, 136, 177.2, { seg: 32 })));
  // резиновый наглазник: складки у основания, раструб
  const cup = [[-151, 16], [-151, 19.6], [-156, 20.4], [-158, 19.8], [-161, 20.6], [-163, 20], [-166, 20.8], [-170, 21], [-190, 22.6], [-204, 24], [-209, 24.6], [-212, 24], [-212, 22]];
  k.add("rubber", at(latheX(cup.map(([x, r]) => [x, r]).reverse(), { seg: 40 })));
  k.add("lensBlack", at(tubeX(22.1, 16.2, -212.2, -150, { seg: 32 })));
  // корпус механизмов вокруг трубки
  k.add("steel", extrudeX(shape(rrect(Z, Y + 1, 36, 40, 9)), -34, 24, { bevel: 1.8 }));
  k.add("steel", extrudeX(shape(rrect(Z, Y + 1, 37.2, 41.2, 9.5)), -35, -32, { bevel: 0.6 }));
  // маховичок углов прицеливания: шкала 0–10, рифлёный верхний обод, стопорный винт
  const ey = Y + 21;
  k.add("steel", T(latheX([[0, 0], [0, 16], [2, 16], [2, 15.2], [11, 15.2], [11, 16.2], [15, 16.2], [15.6, 15.4], [15.6, 6], [16.8, 5.4], [16.8, 0]], { seg: 48 }), { r: [0, 0, 90], p: [-5, ey, Z] }));
  k.add("steel", T(flutesX(15.9, 11.4, 15, 44, 1.2, 0.8), { r: [0, 0, 90], p: [-5, ey, Z] }));
  k.add("paintWhite", T(hashMarks(15.22, 3.8, 11, { arc: 300, a0: 30, major: 1, len: 2 }), { r: [0, 0, 90], p: [-5, ey, Z] }));
  k.add("paintWhite", T(hashMarks(15.22, 7.6, 22, { arc: 315, a0: 30, major: 1000, len: 0.8 }), { r: [0, 0, 90], p: [-5, ey, Z] }));
  k.add("steel", T(screwHead(4.5, 1.6), { r: [-90, 0, 0] }), { p: [-5, ey + 16.6, Z] });
  // маховичок боковых поправок — слева
  const wz = Z - 18;
  k.add("steel", T(latheX([[0, 0], [0, 13.6], [1.6, 13.6], [1.6, 13], [9, 13], [9, 13.8], [12, 13.8], [12.6, 13], [12.6, 5], [13.6, 4.4], [13.6, 0]], { seg: 44 }), { r: [0, 90, 0], p: [-5, Y + 1, wz] }));
  k.add("steel", T(flutesX(13.5, 9.3, 12.1, 40, 1.1, 0.7), { r: [0, 90, 0], p: [-5, Y + 1, wz] }));
  k.add("paintWhite", T(hashMarks(13.02, 3.4, 21, { arc: 300, a0: 30, major: 5, len: 1.5 }), { r: [0, 90, 0], p: [-5, Y + 1, wz] }));
  // осветитель сетки: батарейный отсек вдоль трубы сверху-слева, рифлёная крышка, тумблер
  const by = Y + 14, bz = Z - 13;
  k.add("steel", T(cylX(6.2, 22, 50, { c: 0.8, seg: 24 }), { p: [0, by, bz] }));
  k.add("steel", T(ctx.C.knob(7, 7, 18), { p: [50, by, bz] }));
  k.add("steel", extrudeX(shape(rrect(bz + 5, by - 4, 8, 8, 2)), 22, 44, { bevel: 0.8 }));
  k.add("steel", T(cylY(2.6, 0, 3, { seg: 14 }), { p: [34, by + 5.6, bz] }));
  k.add("steelWorn", T(cylY(0.9, 2, 8, { seg: 8 }), { r: [0, 0, -20], p: [34, by + 6.4, bz] }));
  // упор-«бровь» объектива (отражатель бликов снизу) и винты корпуса
  for (const [x, y] of [[-28, Y + 16], [18, Y + 16], [-28, Y - 14], [18, Y - 14]]) k.add("steel", T(screwHead(1.8, 0.8), { r: [0, 180, 0] }), { p: [x, y, Z + 18] });
  const root = node("pso1", [k.build()]);
  const oc = lens(ctx, at(ctx.C.lensDisc(15, -148)), "glassBlue");
  const ob = lens(ctx, at(ctx.C.lensDisc(17.4, 134)), "glassAmber");
  root.add(oc, ob);
  return { root, sight: { y: Y, z: Z, x0: -150, x1: 177, r: 15, mag: 4, reticle: "pso1", eyeRelief: 68, lens: oc } };
}
// ЭКП-1С-03 «Кобра»: корпус-короб с наклонным стеклом в защитной рамке, переключатель сеток
// и яркости справа, батарейный отсек сзади, кронштейн с рычагом.
function kobra(ctx) {
  const k = ctx.kit();
  dovetailClamp(k, -50, 40, { screws: [-38, 26] });
  dovetailLever(k, -40, -8);
  const Y = 54, Z = 19;
  k.add("alu", extrudeX(shape([[-12, 4, 2], [4, 4, 2], [Z + 16, 26, 3], [Z + 16, 34, 3], [-12, 18, 2]]), -48, 38, { bevel: 1.4 }));
  // корпус-короб
  k.add("alu", extrudeX(shape([[Z - 18, 28, 3], [Z + 18, 28, 3], [Z + 18, 38, 3], [Z - 18, 38, 3]]), -50, 40, { bevel: 1.4 }));
  k.add("alu", extrudeX(shape([[Z - 14, 37, 2], [Z + 14, 37, 2], [Z + 12, 41, 2], [Z - 12, 41, 2]]), -38, 26, { bevel: 1 }));
  const frame = shape([[Z - 19, 36, 2], [Z + 19, 36, 2], [Z + 19, Y + 20, 6], [Z - 19, Y + 20, 6]], [rrect(Z, Y + 1, 30, 30, 4)]);
  k.add("alu", T(extrudeX(frame, -6, 6, { bevel: 1.2 }), { p: [28, 0, 0] }));
  k.add("alu", T(extrudeX(frame, -3, 3, { bevel: 0.8 }), { p: [-40, 0, 0] }));
  k.add("alu", extrudeX(shape([[Z - 19, Y + 16, 3], [Z + 19, Y + 16, 3], [Z + 19, Y + 21, 4], [Z - 19, Y + 21, 4]]), -42, 34, { bevel: 1 }));
  for (const s of [-1, 1]) k.add("alu", extrudeZ([[-40, 36], [-34, 36], [22, Y + 16], [22, Y + 18], [-40, Y + 18]], 2.4, { bevel: 0.6, z: Z + s * 17.8 }));
  // переключатель: 4 сетки × яркость, риски на торце
  k.add("alu", T(cylZ(7, Z + 17, Z + 19.4, { seg: 24 }), { p: [-18, 33, 0] }));
  dialZ(k, "alu", 10, 8, [-18, 33, Z + 18], 1, 8);
  k.add("paintWhite", T(box(1, 0.8, 3.2), { p: [-18, 43.8, Z + 18.6] }));
  // батарейный отсек сзади
  k.add("alu", T(cylX(7.5, -50, -38, { c: 1, seg: 24 }), { p: [0, 33, Z] }));
  k.add("alu", T(ctx.C.knob(8.2, 5, 22), { r: [0, 180, 0], p: [-50, 33, Z] }));
  for (const [x, z] of [[-32, Z - 14], [-32, Z + 14], [18, Z - 14], [18, Z + 14]]) k.add("steel", capScrew(1.5, 0.6), { p: [x, 41, z] });
  const root = node("kobra", [k.build()]);
  const win = lens(ctx, T(extrudeX(rrect(Z, Y + 1, 30, 30, 4), -0.6, 0.6, { bevel: 0.2 }), { p: [28, 0, 0] }), "glassAmber");
  root.add(win);
  return { root, sight: { y: Y + 1, z: Z, x0: -42, x1: 28, r: 14, mag: 1, reticle: "kobra", lens: win } };
}
// ПОСП 4–12×42: переменная кратность, штатный кронштейн на «ласточкин хвост» с кольцами.
function posp(ctx) {
  const k = ctx.kit();
  dovetailClamp(k, -70, 50, { screws: [-58, 38] });
  dovetailLever(k, -52, -18);
  const Y = 62, Z = 13;
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, Y + (t.p?.[1] || 0), Z + (t.p?.[2] || 0)] });
  k.add("steel", extrudeX(shape([[-12, 6, 2], [4, 6, 2], [Z + 6, Y - 24, 4], [Z - 8, Y - 16, 4], [-12, 18, 2]]), -66, 46, { bevel: 1.5 }));
  for (const x of [-48, 26]) {
    k.add("steel", T(tubeX(19.5, 15.1, x - 9, x + 9, { seg: 44, c: 1 }), { p: [0, Y, Z] }));
    for (const s of [-1, 1]) k.add("steel", T(box(16, 4.4, 6, { bevel: 1 }), { p: [x, Y, Z + s * 19.6] }));
    for (const s of [-1, 1]) k.add("lensBlack", T(box(17, 0.4, 7.2, { bevel: 0.1 }), { p: [x, Y, Z + s * 19.3] }));
    for (const s of [-1, 1]) for (const d of [-4, 4]) k.add("steel", capScrew(1.8, 1), { p: [x + d, Y + 2.2, Z + s * 19.6] });
  }
  scopeBody(ctx, k, at, { tube: 15, obj: 21, turret: 13, x0: -186, x1: 116, saddle: -8, mat: "steel" });
  const root = node("posp", [k.build()]);
  const oc = lens(ctx, at(ctx.C.lensDisc(18.5, -184)), "glassBlue");
  const ob = lens(ctx, at(ctx.C.lensDisc(21, 114)), "glassAmber");
  root.add(oc, ob);
  return { root, sight: { y: Y, z: Z, x0: -186, x1: 116, r: 15, mag: 4, zoom: [4, 12], reticle: "pso1", eyeRelief: 80, lens: oc } };
}
var DOVETAIL = [
  { id: "side_mount", cat: "sidemount", name: "Кронштейн «ласточкин хвост» — Пикатинни", desc: "Боковое крепление с планкой над крышкой", only: ["svd", "ak74", "akm"], mountTypes: ["dovetail"], stats: { weight: 190 }, build: sideMount },
  { id: "pso1", cat: "optic", name: "ПСО-1 4×24", desc: "Снайперский прицел с дальномерной шкалой и подсветкой", only: ["svd", "ak74", "akm"], mountTypes: ["dovetail"], foot: [-60, 40], body: [-212, 177], needs: (cfg) => !cfg.sidemount, stats: { weight: 580, ergo: -8, adsTime: 45 }, build: pso1 },
  { id: "posp", cat: "optic", name: "ПОСП 4–12×42 В", desc: "Переменная кратность, сетка типа ПСО, колесо — кратность", only: ["svd", "ak74", "akm"], mountTypes: ["dovetail"], foot: [-70, 50], body: [-186, 116], needs: (cfg) => !cfg.sidemount, stats: { weight: 760, ergo: -10, adsTime: 55 }, build: posp },
  { id: "kobra", cat: "optic", name: "ЭКП-1С-03 «Кобра»", desc: "Коллиматор, четыре сетки, крепление на боковую планку", only: ["svd", "ak74", "akm"], mountTypes: ["dovetail"], foot: [-50, 40], body: [-50, 40], needs: (cfg) => !cfg.sidemount, stats: { weight: 380, ergo: -3, adsTime: 15 }, build: kobra }
];

// ==== engine/lib/muzzle.js
// Глушитель SureFire SOCOM-RC2: хвостовик с храповым стопорным кольцом (QD), корпус с
// валиками сварных швов у торцевых крышек, лыски под ключ, передняя крышка с отверстием и
// каналами сброса газа.
function socom(ctx, o) {
  const k = ctx.kit();
  const R4 = 19.05, L = o.len;
  k.add("steel", latheX([[0, 0], [0, 10.4], [1, 11], [14, 11], [15, 10], [15, 0]], { seg: 28 }));
  k.add("cast", latheX([[10, 0], [10, 14.6], [12, 16.4], [30, 16.4], [31, 18.2], [36, R4 - 0.2], [L - 6, R4], [L - 3, R4 - 1.2], [L, R4 - 3], [L, 5.4], [L - 2, 4.6], [L - 2, 0]], { seg: 48, crease: 30 }));
  k.add("cast", flutesX(16.2, 12, 30, 30, 1.8, 1));
  k.add("steel", ringGrooves(17.2, 31, 36, 3, 0.4, { seg: 40 }));
  // храповик стопорного кольца и защёлка
  for (let i = 0; i < 12; i++) k.add("steel", T(T(box(3, 1.6, 2.2, { bevel: 0.3 }), { p: [33.5, 18.4, 0] }), { r: [i * 30, 0, 0] }));
  k.add("steel", T(box(10, 2.4, 5, { bevel: 0.8 }), { p: [26, 17.2, 0] }));
  // сварные швы у крышек
  for (const x of [38, L - 8]) k.add("cast", latheX([[x - 1.2, 0], [x - 1.2, R4], [x - 0.6, R4 + 0.45], [x + 0.6, R4 + 0.45], [x + 1.2, R4], [x + 1.2, 0]], { seg: 48 }));
  k.add("cast", flutesX(R4 - 0.3, L - 22, L - 11, 12, 3.2, 0.7));
  // передняя крышка: каналы сброса вокруг отверстия
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    k.add("lensBlack", cylX(1.1, L - 0.4, L + 0.05, { seg: 8 }), { p: [0, Math.cos(a) * 10.5, Math.sin(a) * 10.5] });
  }
  k.add("lensBlack", cylX(5.2, L - 2.2, L + 0.05, { seg: 20 }));
  return { root: k.build("socom"), muzzle: { x: L, kind: "supp", flash: 0.04 } };
}
// «Птичья клетка» A2: пять продольных прорезей сверху и по бокам, низ закрыт — не пылит лёжа.
function a2(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 10.5], [1, 11], [9, 11], [9.5, 10.6], [14, 10.6], [14, 0]], { seg: 32 }));
  const slots = [-72, -36, 0, 36, 72], hw = 6;
  const sec = [];
  for (let i = 0; i < slots.length - 1; i++) sec.push([slots[i] + hw, slots[i + 1] - hw]);
  sec.push([slots[slots.length - 1] + hw, 360 + slots[0] - hw]);
  k.add("steel", sectorRing(6.2, 10.6, 13.8, 40.2, sec, { bevel: 0.25 }));
  k.add("steel", latheX([[40, 0], [40, 10.6], [43, 10.6], [44, 9.8], [44, 5.6], [40, 5.6]], { seg: 32 }));
  k.add("lensBlack", tubeX(6.3, 5.6, 13, 41, { seg: 24 }));
  k.add("steel", flutesX(10.6, 2, 8, 2, 5, 0.6, { a0: 90 }));
  return { root: k.build("a2"), muzzle: { x: 44, kind: "fh", flash: 0.4 } };
}
// SureFire WarComp: три зубца (открытые прорези), компенсаторные окна сверху, лыски, резьба под QD.
function warcomp(ctx, R4) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, R4 - 0.5], [1, R4], [26, R4], [27, R4 - 1.5], [30, R4 - 1.5], [30, R4 * 0.5], [0, R4 * 0.5]], { seg: 32 }));
  k.add("steel", ringGrooves(R4 - 1.4, 26.6, 30, 4, 0.3, { seg: 32 }));
  const sec = [];
  for (let i = 0; i < 3; i++) sec.push([i * 120 + 14, i * 120 + 106]);
  k.add("steel", sectorRing(R4 * 0.55, R4 - 0.6, 30, 57, sec, { bevel: 0.3 }));
  for (let i = 0; i < 3; i++) k.add("steel", T(T(box(4, 2.4, (R4 - 0.6) * 1.2, { bevel: 0.6 }), { p: [57.6, R4 - 2.4, 0] }), { r: [i * 120 + 60, 0, 0] }));
  for (const a of [-40, 0, 40]) k.add("lensBlack", T(box(3.2, 3, 6, { bevel: 0.6 }), { p: [18, R4 - 1.2, 0], r: [a, 0, 0] }));
  k.add("lensBlack", tubeX(R4 * 0.56, R4 * 0.5, 29, 57, { seg: 24 }));
  k.add("steel", flutesX(R4, 2, 10, 2, 6, 0.5, { a0: 90 }));
  return { root: k.build("warcomp"), muzzle: { x: 59, kind: "fh", flash: 0.3 } };
}
function linear(ctx, r) {
  const k = ctx.kit();
  const R4 = 14.3, L = 62;
  k.add("steel", latheX([[0, 0], [0, r + 1.5], [1, r + 3], [14, r + 3], [15, R4 - 0.6], [16, R4], [L - 1.5, R4], [L, R4 - 1.4], [L, 10.2], [L - 3, 9.6], [L - 3, 0]], { seg: 40 }));
  k.add("steel", flutesX(r + 3, 3, 12, 2, 8, 0.8, { a0: 90 }));
  k.add("steel", ringGrooves(R4, 18, 24, 2, 0.4, { seg: 40 }));
  // внутренний ствол-дефлектор виден в торце
  k.add("steel", tubeX(r + 1.6, r + 0.4, L - 14, L - 1.5, { seg: 24 }));
  k.add("lensBlack", tubeX(9.7, r + 1.7, L - 3.2, L + 0.05, { seg: 28 }));
  return { root: k.build("linear"), muzzle: { x: L, kind: "linear", flash: 0.15 } };
}
// Дульный тормоз Precision Armament: три пары боковых окон с перегородками, верхние порты.
function brake(ctx, R4) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, R4 - 0.4], [0.8, R4], [12, R4], [12, 4.5], [0, 4.5]], { seg: 32 }));
  k.add("steel", latheX([[52, 0], [52, R4], [56, R4], [57, R4 - 1], [57, 4.5], [52, 4.5]], { seg: 32 }));
  // верх и низ корпуса — секторы, окна по бокам открыты
  k.add("steel", sectorRing(R4 - 2.4, R4, 11.8, 52.2, [[-50, 50], [130, 230]], { bevel: 0.3 }));
  for (let i = 0; i < 3; i++) k.add("steel", latheX([[22 + i * 12, 0], [22 + i * 12, R4 - 0.2], [24.6 + i * 12, R4 - 0.2], [24.6 + i * 12, 0]].map(([x, rr], j) => [x, j === 0 || j === 3 ? 4.6 : rr]).concat([[22 + i * 12, 4.6]]), { seg: 32 }));
  k.add("lensBlack", tubeX(4.7, 4.2, 11, 53, { seg: 16 }));
  for (let i = 0; i < 3; i++) k.add("lensBlack", T(cylY(1.6, 0, 3, { seg: 10 }), { p: [17 + i * 12, R4 - 2.4, 0] }));
  k.add("steel", flutesX(R4, 2, 10, 2, 6, 0.5, { a0: 90 }));
  return { root: k.build("brake"), muzzle: { x: 57, kind: "brake", flash: 0.7 } };
}
function rotexV(ctx) {
  const k = ctx.kit();
  const R4 = 20, L = 158;
  k.add("steel", latheX([[0, 0], [0, 10.4], [1, 11], [16, 11], [17, 10], [17, 0]], { seg: 28 }));
  k.add("steelPark", latheX([[8, 0], [8, 15.2], [10, 17], [34, 17], [35, 18.6], [38, R4 - 0.3], [L - 10, R4], [L - 5, R4 - 1], [L - 1.5, R4 - 3.6], [L, R4 - 5], [L, 5.2], [L - 3, 4.6], [L - 3, 0]], { seg: 52, crease: 30 }));
  k.add("steelPark", flutesX(17.3, 12, 32, 36, 1.6, 0.9));
  k.add("steel", ringGrooves(R4, 42, 46, 2, 0.35, { seg: 48 }));
  k.add("steel", ringGrooves(R4, L - 18, L - 14, 2, 0.35, { seg: 48 }));
  k.add("steel", T(box(10, 3, 6, { bevel: 0.8 }), { p: [22, -17.8, 0] }));
  k.add("lensBlack", cylX(5, L - 3.2, L + 0.05, { seg: 20 }));
  return { root: k.build("rotex"), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
function nt4(ctx) {
  const k = ctx.kit();
  const R4 = 19.05, L = 168;
  k.add("steel", latheX([[0, 0], [0, 10.4], [1, 11], [14, 11], [15, 10], [15, 0]], { seg: 28 }));
  k.add("cast", latheX([[6, 0], [6, 14.5], [8, 16.5], [30, 16.5], [34, R4 - 0.4], [L - 14, R4], [L - 6, R4 - 2], [L - 2, R4 - 5.5], [L, R4 - 8], [L, 4.8], [L - 2, 4.4], [L - 2, 0]], { seg: 52, crease: 30 }));
  k.add("cast", flutesX(16.7, 10, 28, 24, 2, 1.1));
  k.add("steel", T(extrudeZ([[0, -3, 1], [26, -2.4, 1.5], [28, 0, 1], [26, 2.4, 1.5], [0, 3, 1]], 2.6, { bevel: 0.6 }), { p: [8, 0, 17.6] }));
  k.add("steel", T(cylZ(3, 15.5, 19.4, { seg: 14 }), { p: [10, 0, 0] }));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    k.add("lensBlack", T(cylX(1.3, L - 4, L + 0.05, { seg: 10 }), { p: [0, Math.cos(a) * 8, Math.sin(a) * 8] }));
  }
  k.add("lensBlack", cylX(4.6, L - 2.2, L + 0.05, { seg: 20 }));
  return { root: k.build("nt4"), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
var MUZZLES = [
  { id: "sf_socom556", cat: "muzzle", name: "SureFire SOCOM556-RC2", desc: "Глушитель 5,56, быстросъёмный", fit: { thread: ["1/2x28"] }, stats: { weight: 620, length: 168, loud: -28, flash: -70, "recoilV%": -10, ergo: -8, adsTime: 25, velocity: 6 }, build: (c) => socom(c, { len: 168 }) },
  { id: "bt_rotex_hk", cat: "muzzle", only: ["m416"], name: "B&T Rotex-V (HK416)", desc: "Штатный глушитель к HK416: ставится на пламегаситель HK, стопорное кольцо", fit: { thread: ["1/2x28"] }, stats: { weight: 560, length: 158, loud: -29, flash: -72, "recoilV%": -11, ergo: -7, adsTime: 22, velocity: 5 }, build: rotexV },
  { id: "kac_nt4", cat: "muzzle", only: ["m416"], name: "Knight's Armament NT4 QDSS", desc: "Глушитель M27 IAR (USMC, база HK416): быстросъёмный, рычаг-защёлка", fit: { thread: ["1/2x28"] }, stats: { weight: 640, length: 168, loud: -30, flash: -75, "recoilV%": -12, ergo: -8, adsTime: 25, velocity: 6 }, build: nt4 },
  { id: "sf_socom762", cat: "muzzle", name: "SureFire SOCOM762-RC2", desc: "Глушитель 7,62, быстросъёмный", fit: { thread: ["5/8x24"] }, stats: { weight: 720, length: 188, loud: -27, flash: -70, "recoilV%": -12, ergo: -10, adsTime: 30, velocity: 6 }, build: (c) => socom(c, { len: 188 }) },
  { id: "a2_fh", cat: "muzzle", name: "Пламегаситель A2", desc: "Классическая «птичья клетка»", fit: { thread: ["1/2x28"] }, stats: { weight: 50, length: 34, flash: -35, "recoilV%": -3 }, build: a2 },
  { id: "warcomp556", cat: "muzzle", name: "SureFire WarComp 5,56", desc: "Пламегаситель-компенсатор", fit: { thread: ["1/2x28"] }, stats: { weight: 90, length: 49, flash: -45, "recoilV%": -8, "recoilH%": -6, loud: 1 }, build: (c) => warcomp(c, 11) },
  { id: "warcomp762", cat: "muzzle", name: "SureFire WarComp 7,62", desc: "Пламегаситель-компенсатор", fit: { thread: ["5/8x24"] }, stats: { weight: 110, length: 49, flash: -45, "recoilV%": -8, "recoilH%": -6, loud: 1 }, build: (c) => warcomp(c, 12) },
  { id: "pa_brake556", cat: "muzzle", name: "Precision Armament M4-72", desc: "Дульный тормоз: меньше отдача, громче", fit: { thread: ["1/2x28"] }, stats: { weight: 85, length: 47, flash: 25, "recoilV%": -22, "recoilH%": -18, loud: 5 }, build: (c) => brake(c, 11.2) },
  { id: "pa_brake762", cat: "muzzle", name: "Precision Armament M11", desc: "Дульный тормоз 7,62", fit: { thread: ["5/8x24"] }, stats: { weight: 120, length: 47, flash: 25, "recoilV%": -24, "recoilH%": -18, loud: 5 }, build: (c) => brake(c, 12.5) },
  { id: "linear556", cat: "muzzle", name: "Линейный компенсатор KAK", desc: "Уводит газы вперёд: тише для стрелка, чуть больше отдача", fit: { thread: ["1/2x28"] }, stats: { weight: 115, length: 62, flash: -30, loud: -3, "recoilV%": 3 }, build: (c) => linear(c, 6.4) },
  { id: "linear762", cat: "muzzle", name: "Линейный компенсатор KAK 7,62", desc: "Уводит газы вперёд: тише для стрелка, чуть больше отдача", fit: { thread: ["5/8x24"] }, stats: { weight: 130, length: 62, flash: -30, loud: -3, "recoilV%": 3 }, build: (c) => linear(c, 7.9) },
  { id: "linear_ak", cat: "muzzle", name: "Линейный компенсатор (АК)", desc: "Уводит газы вперёд: тише для стрелка, чуть больше отдача", fit: { thread: ["m14x1L", "m24x1.5"] }, stats: { weight: 125, length: 62, flash: -30, loud: -3, "recoilV%": 3 }, build: (c) => linear(c, 8.5) }
];

// ==== engine/lib/muzzle2.js
var DEG = Math.PI / 180;
function flatsX(r, cut, x0, x1, o = {}) {
  const lim = r - cut, pts = [];
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2;
    pts.push([Math.max(-lim, Math.min(lim, Math.cos(a) * r)), Math.sin(a) * r]);
  }
  const clean = pts.filter((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.abs(p[0] - q[0]) > 1e-3 || Math.abs(p[1] - q[1]) > 1e-3;
  });
  return extrudeX(clean, x0, x1, { bevel: o.bevel ?? 0.6 });
}
function hexX(af, x0, x1, o = {}) {
  const R4 = af / 2 / Math.cos(30 * DEG), pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (30 + i * 60) * DEG;
    pts.push([Math.cos(a) * R4, Math.sin(a) * R4, o.rc ?? 2]);
  }
  return extrudeX(pts, x0, x1, { bevel: o.bevel ?? 1, crease: 25 });
}
function slotOn(x0, x1, w, r, a, o = {}) {
  const g = extrudeY(slot(x0, x1, 0, w), r - (o.depth ?? 0.8), r + (o.lift ?? 0.12), { bevel: 0.2 });
  if (o.tilt) {
    T(g, { p: [-(x0 + x1) / 2, -r, 0] });
    T(g, { r: [0, 0, o.tilt] });
    T(g, { p: [(x0 + x1) / 2, r, 0] });
  }
  return T(g, { r: [a, 0, 0] });
}
function spiralBody(R4, x0, x1, o = {}) {
  const n = o.n ?? 8, depth = o.depth ?? 1.5, twist = (o.twist ?? 120) * DEG, width = o.width ?? 0.45;
  const m = n * 12, rings = [], steps = Math.max(12, Math.round((x1 - x0) / (o.dx ?? 3)));
  const fade = o.fade ?? 10;
  for (let s = 0; s <= steps; s++) {
    const x = x0 + s / steps * (x1 - x0);
    const ramp = Math.min(1, (x - x0) / fade, (x1 - x) / fade);
    const ph = twist * (x - x0) / (x1 - x0);
    const pts = [];
    for (let i = 0; i < m; i++) {
      const t0 = i / m * Math.PI * 2, t = t0 + ph;
      const c = Math.cos(n * t0);
      const g = c > 1 - width * 2 ? Math.min(1, (c - (1 - width * 2)) / (width * 0.9)) : 0;
      const r = R4 - depth * g * Math.max(0, ramp);
      pts.push([Math.cos(t) * r, Math.sin(t) * r]);
    }
    rings.push({ x, pts });
  }
  return loftX(rings, { caps: false, crease: 50, flip: true });
}
function faceHoles(k, x, rr, n, r, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + (o.a0 ?? 0) * DEG;
    k.add("lensBlack", T(cylX(r, x - (o.depth ?? 1.6), x + 0.05, { seg: 10, c: 0.1 }), { p: [0, Math.cos(a) * rr, Math.sin(a) * rr] }));
  }
}
function flow556k(ctx) {
  const k = ctx.kit(), M = "cast#3b3d40";
  const R4 = 19.8, L = 169;
  k.add("steel", latheX([[0, 0], [0, 7.4], [2, 7.4], [2, 0]], { seg: 20 }));
  k.add(M, hexX(25.4, 0, 12, { rc: 1.2, bevel: 0.8 }));
  k.add(M, latheX([
    [11, 0],
    [11, 14.2],
    [13, 15.6],
    [19, R4 - 1.2],
    [22, R4],
    [L - 12, R4],
    [L - 8, R4 - 1.2],
    [L - 4, R4 - 3.4],
    [L, R4 - 4.4],
    [L, R4 - 6],
    [L - 1.4, R4 - 7],
    [L - 1.4, 8.2],
    [L, 7.2],
    [L, 4.3],
    [L - 3, 3.8],
    [L - 3, 0]
  ], { seg: 56, crease: 30 }));
  k.add(M, ringGrooves(R4 + 0.05, 24, 34, 5, 0.45, { seg: 56 }));
  for (let row = 0; row < 6; row++) {
    const x = 44 + row * 18;
    for (let i = 0; i < 12; i++) k.add("lensBlack", slotOn(x - 7, x + 7, 3.4, R4, i * 30 + row % 2 * 15));
  }
  for (let row = 0; row <= 6; row++) k.add(M, tubeX(R4 + 0.35, R4 - 0.5, 34.4 + row * 18, 36.2 + row * 18, { seg: 56, c: 0.3 }));
  for (let i = 0; i < 16; i++) k.add("lensBlack", T(box(1.6, 3.6, 2.4, { bevel: 0.5 }), { p: [L - 1.3, 10.6, 0], r: [i * 22.5, 0, 0] }));
  k.add("lensBlack", cylX(4.3, L - 2.9, L + 0.05, { seg: 20 }));
  return { root: k.build("flow556k"), muzzle: { x: L, kind: "supp", flash: 0.05, voice: { len: 169, loud: -24 } } };
}
function omega36m(ctx) {
  const k = ctx.kit(), M = "cast";
  const R4 = 21.85, L = 181;
  k.add("steel", latheX([[0, 0], [0, 10.6], [1, 11.2], [6, 11.2], [6, 0]], { seg: 28 }));
  k.add(M, latheX([
    [4, 0],
    [4, 15.4],
    [5.5, 17],
    [27, 17],
    [28, 18.4],
    [30, R4 - 0.8],
    [32, R4],
    [L - 26.5, R4],
    [L - 26, R4 - 0.7],
    [L - 25.5, R4],
    [L - 15, R4],
    [L - 3, R4 - 5.2],
    [L, R4 - 6.6],
    [L, R4 - 8.4],
    [L - 1, R4 - 9.4],
    [L - 1, 6.6],
    [L, 5.8],
    [L, 4.9],
    [L - 3, 4.4],
    [L - 3, 0]
  ], { seg: 60, crease: 30 }));
  k.add("steelPark", flutesX(17, 7, 26, 32, 1.7, 1));
  k.add("steelPark", ringGrooves(18.6, 27.6, 30, 1, 0.3, { seg: 48 }));
  k.add("steel", T(box(9, 2.6, 5, { bevel: 0.7 }), { p: [16, -18.6, 0] }));
  for (const x of [40, 43.5, L - 40]) k.add("cast#6b6e72", tubeX(R4 + 0.04, R4 - 0.3, x, x + 0.9, { seg: 60, c: 0.1 }));
  k.add("cast#5d6064", T(extrudeY(slot(58, 96, 0, 4.4), R4 - 0.6, R4 + 0.06, { bevel: 0.1 }), { r: [90, 0, 0] }));
  for (let i = 0; i < 4; i++) k.add("lensBlack", T(box(3, 3.2, 4, { bevel: 0.4 }), { p: [L - 0.9, R4 - 7.5, 0], r: [45 + i * 90, 0, 0] }));
  k.add("steelPark", tubeX(9.6, 7.4, L - 1.6, L - 0.6, { seg: 40, c: 0.2 }));
  k.add("lensBlack", cylX(4.9, L - 2.9, L + 0.05, { seg: 20 }));
  return { root: k.build("omega36m"), muzzle: { x: L, kind: "supp", flash: 0.03, voice: { len: 181, loud: -30 } } };
}
function spiral762(ctx) {
  const k = ctx.kit(), M = "cast#5a5040";
  const R4 = 22.25, L = 198, X0 = 42, X1 = L - 30;
  k.add("steel", latheX([[0, 0], [0, 11.8], [1, 12.4], [8, 12.4], [8, 0]], { seg: 28 }));
  k.add("steelPark", latheX([[5, 0], [5, 16.4], [6.5, 17.8], [30, 17.8], [31, 16.8], [31, 0]], { seg: 52 }));
  k.add("steelPark", flutesX(17.6, 9, 28, 36, 1.4, 0.8));
  k.add("steelPark", ringGrooves(18.3, 9, 28, 6, 0.5, { seg: 52 }));
  k.add(M, latheX([[30, 0], [30, 18.6], [32, 20], [37, R4 - 0.4], [39, R4], [X0 + 0.5, R4], [X0 + 0.5, 0]], { seg: 60, crease: 30 }));
  k.add(M, spiralBody(R4, X0, X1, { n: 10, depth: 1.7, twist: 150, width: 0.38 }));
  k.add(M, latheX([
    [X1 - 0.5, 0],
    [X1 - 0.5, R4],
    [L - 16, R4],
    [L - 15, R4 - 0.6],
    [L - 14, R4],
    [L - 5, R4 - 2.6],
    [L, R4 - 4.2],
    [L, R4 - 6.4],
    [L - 1.2, R4 - 7.2],
    [L - 1.2, 7.2],
    [L, 6.4],
    [L, 5.4],
    [L - 3, 4.9],
    [L - 3, 0]
  ], { seg: 60, crease: 30 }));
  k.add(M, flutesX(R4 - 0.3, L - 13, L - 6, 12, 2.6, 0.5));
  faceHoles(k, L - 1.2, 11.2, 8, 1.3, { a0: 22.5 });
  k.add("lensBlack", cylX(5.4, L - 2.9, L + 0.05, { seg: 20 }));
  return { root: k.build("spiral762"), muzzle: { x: L, kind: "supp", flash: 0.04, voice: { len: 198, loud: -29 } } };
}
function dtk4m(ctx) {
  const k = ctx.kit(), M = "steelPark";
  const R4 = 22, L = 192, XC = L - 38, RC = 14;
  k.add("steel", latheX([[0, 0], [0, 11.4], [1, 12.2], [10, 12.2], [10, 0]], { seg: 28 }));
  k.add(M, latheX([
    [6, 0],
    [6, 15.6],
    [7.5, 17.2],
    [34, 17.2],
    [36, 19],
    [38, R4 - 0.4],
    [40, R4],
    [XC, R4],
    [L - 6, RC],
    [L - 6, RC - 0.4],
    [L, RC],
    [L, 11],
    [L - 5.5, 8.4],
    [L - 5.5, 0]
  ], { seg: 60, crease: 25 }));
  k.add("steel", ringGrooves(17.5, 10, 24, 8, 0.45, { seg: 52 }));
  for (const a of [60, 180, 300]) k.add(M, T(box(8, 2.2, 3, { bevel: 0.6 }), { p: [30, 17.8, 0], r: [a, 0, 0] }));
  k.add("steel", T(extrudeZ([[0, -2.6, 1], [22, -2.2, 1.2], [25, 0, 1], [22, 2.8, 1.4], [0, 2.8, 1]], 2.4, { bevel: 0.5 }), { p: [12, 0, 18.4] }));
  k.add("steel", T(cylZ(2.8, 16.6, 19.8, { seg: 14 }), { p: [33, 0, 0] }));
  for (const x of [52, 96, 140]) k.add(M, tubeX(R4 + 0.6, R4 - 0.2, x, x + 3.2, { seg: 60, c: 0.6 }));
  k.add("steel", tubeX(R4 + 0.25, R4 - 0.2, 44, 45.6, { seg: 60, c: 0.4 }));
  const tilt = -Math.atan((R4 - RC) / (L - 6 - XC)) / DEG;
  for (let i = 0; i < 8; i++) k.add("lensBlack", slotOn(XC + 6, L - 12, 3.2, (R4 + RC) / 2 + 0.1, i * 45 + 22.5, { tilt }));
  for (let i = 0; i < 6; i++) k.add("lensBlack", T(box(3.6, 3.4, 2.6, { bevel: 0.4 }), { p: [L - 0.8, RC - 1.3, 0], r: [i * 60, 0, 0] }));
  k.add("lensBlack", cylX(8.4, L - 5.9, L - 5.3, { seg: 28 }));
  k.add("lensBlack", cylX(5, L - 6, L - 5.2, { seg: 20 }));
  return { root: k.build("dtk4m"), muzzle: { x: L, kind: "supp", flash: 0.04, voice: { len: 192, loud: -27 } } };
}
function wolverine(ctx) {
  const k = ctx.kit(), M = "cast#4a4c3c", POCKET = "cast#23241d";
  const AF = 42, L = 186, H0 = 24, H1 = L - 22;
  k.add("steel", latheX([[0, 0], [0, 11.4], [1, 12.2], [10, 12.2], [10, 0]], { seg: 28 }));
  k.add(M, latheX([[5, 0], [5, 16.6], [6.5, 18], [H0 + 1, 18], [H0 + 1, 0]], { seg: 52 }));
  k.add(M, ringGrooves(18.2, 7, 14, 4, 0.45, { seg: 52 }));
  k.add(M, flatsX(18.3, 1.6, 15, H0 - 1));
  k.add(M, hexX(AF, H0, H1, { rc: 3, bevel: 1.4 }));
  const ap = AF / 2;
  for (let i = 0; i < 6; i++) {
    const a = 90 - i * 60;
    k.add(POCKET, slotOn(H0 + 12, H0 + 62, 9, ap, a, { depth: 0.5, lift: 0.06 }));
    k.add(POCKET, slotOn(H0 + 70, H1 - 12, 9, ap, a, { depth: 0.5, lift: 0.06 }));
  }
  k.add(M, latheX([
    [H1 - 1, 0],
    [H1 - 1, 19.6],
    [H1 + 1, 20.4],
    [L - 8, 20.4],
    [L - 2, 17.6],
    [L, 16],
    [L, 13.6],
    [L - 1.2, 12.8],
    [L - 1.2, 6.8],
    [L, 6],
    [L, 5.2],
    [L - 3, 4.7],
    [L - 3, 0]
  ], { seg: 56, crease: 30 }));
  k.add(M, ringGrooves(20.4, H1 + 4, H1 + 12, 3, 0.4, { seg: 56 }));
  faceHoles(k, L - 1.2, 9.8, 6, 1.5, { a0: 30 });
  k.add("lensBlack", cylX(5.2, L - 2.9, L + 0.05, { seg: 20 }));
  return { root: k.build("wolverine"), muzzle: { x: L, kind: "supp", flash: 0.04, voice: { len: 186, loud: -26 } } };
}
function tripleTap(ctx) {
  const k = ctx.kit();
  const R4 = 11.1, L = 57;
  k.add("steel", flatsX(R4, 1.8, 0, 12.4, { bevel: 0.6 }));
  k.add("steel", latheX([[12, 0], [12, R4 - 0.5], [12.5, R4], [L - 1.6, R4], [L, R4 - 1.4], [L, 5.4], [L - 3, 4.8], [L - 3, 0]], { seg: 40, crease: 30 }));
  k.add("steel", ringGrooves(R4, 13.5, 17.5, 2, 0.35, { seg: 40 }));
  for (let i = 0; i < 3; i++) for (const a of [-90, 90]) k.add("lensBlack", slotOn(20 + i * 10.5, 28 + i * 11, 4.4 + i * 0.4, R4, a, { depth: 2.4, lift: 0.05 }));
  for (const x of [25, 33, 41]) k.add("lensBlack", T(cylY(1.7, R4 - 1.6, R4 + 0.2, { seg: 12 }), { p: [x, 0, 0] }));
  for (let i = 0; i < 3; i++) k.add("lensBlack", T(box(9, 3.4, 3.8, { bevel: 0.6 }), { p: [L - 3.6, R4 - 1.2, 0], r: [60 + i * 120, 0, 0] }));
  k.add("lensBlack", cylX(4.8, L - 2.9, L + 0.05, { seg: 18 }));
  return { root: k.build("tripletap"), muzzle: { x: L, kind: "fh", flash: 0.35 } };
}
function dtk3(ctx) {
  const k = ctx.kit(), M = "steelPark";
  const R4 = 15, L = 88, C0 = 38, C1 = L - 9;
  k.add(M, flatsX(R4, 2.2, 0, 14, { bevel: 0.8 }));
  k.add(M, latheX([[13.5, 0], [13.5, R4 - 0.6], [14.5, R4], [C0, R4], [C0, 0]], { seg: 44 }));
  k.add(M, flutesX(R4 - 0.2, 16, 24, 18, 1.6, 0.6));
  for (const x of [28, 33.5]) k.add("lensBlack", T(cylY(2.3, R4 - 2, R4 + 0.3, { seg: 14 }), { p: [x, 0, 0] }));
  k.add("lensBlack", T(box(6, 2, 4, { bevel: 0.4 }), { p: [6, -R4 + 0.7, 0] }));
  for (let i = 0; i < 4; i++) {
    const a = 45 + i * 90;
    k.add(M, T(extrudeZ([[C0 - 1, 0], [C1 + 1, 0], [C1 + 1, 4.2, 0.8], [C0 - 1, 4.2, 0.8]], 7, { bevel: 0.7 }), { p: [0, R4 - 4.2, 0], r: [a, 0, 0] }));
  }
  for (const x of [C0 + 9, C0 + 24]) k.add("steel", latheX([[x, 0], [x, 5], [x + 5, R4 - 4.4], [x + 7, R4 - 4.4], [x + 7, 5.4], [x + 5, 5], [x + 5, 0]], { seg: 32 }));
  k.add("lensBlack", tubeX(5, 4.2, C0, C1, { seg: 16, c: 0.1 }));
  k.add(M, latheX([[C1, 6.6], [C1, R4 - 0.8], [C1 + 0.8, R4], [L - 1.2, R4], [L, R4 - 1.2], [L, 7.6], [L - 3, 6], [C1, 6], [C1, 6.6]], { seg: 44, crease: 30 }));
  k.add("lensBlack", cylX(6.05, C1 - 0.2, L + 0.05, { seg: 20, c: 0.1 }));
  return { root: k.build("dtk3"), muzzle: { x: L, kind: "comp", flash: 0.45 } };
}
var MUZZLES2 = [
  { id: "hux_flow556k", cat: "muzzle", name: "HUXWRX FLOW 556k", desc: "Проточный глушитель из инконеля (3D-печать): меньше обратного газа, решётка окон, прямая резьба", fit: { thread: ["1/2x28"] }, stats: { weight: 414, length: 169, loud: -24, flash: -70, "recoilV%": -9, ergo: -7, adsTime: 22, velocity: 4 }, build: flow556k },
  { id: "omega36m", cat: "muzzle", name: "SilencerCo Omega 36M", desc: "Титановый мультикалиберный глушитель: крепление ASR, коническая дульная крышка", fit: { thread: ["1/2x28", "5/8x24"] }, stats: { weight: 400, length: 181, loud: -30, flash: -78, "recoilV%": -12, ergo: -8, adsTime: 25, velocity: 5 }, build: omega36m },
  { id: "spiral762", cat: "muzzle", name: "Спиральный глушитель 7,62", desc: "Корпус с винтовыми канавками (как у OSS): легче и лучше охлаждается, быстросъёмная муфта", fit: { thread: ["5/8x24"] }, stats: { weight: 590, length: 198, loud: -29, flash: -76, "recoilV%": -13, ergo: -10, adsTime: 30, velocity: 6 }, build: spiral762 },
  { id: "dtk4m", cat: "muzzle", name: "Зенитко ДТК-4М", desc: "Тактический глушитель к АК: стальной корпус, рычаг-фиксатор, пламегасящий конус", fit: { thread: ["m24x1.5", "m14x1L"] }, stats: { weight: 560, length: 192, loud: -27, flash: -85, "recoilV%": -14, ergo: -9, adsTime: 28, velocity: 3 }, build: dtk4m },
  { id: "hex_wolverine", cat: "muzzle", name: "Hexagon Wolverine", desc: "Глушитель к АК с шестигранным корпусом: не катится по столу, фрезерованные карманы", fit: { thread: ["m24x1.5", "m14x1L"] }, stats: { weight: 520, length: 186, loud: -26, flash: -80, "recoilV%": -12, ergo: -8, adsTime: 24, velocity: 3 }, build: wolverine },
  { id: "kac_tripletap", cat: "muzzle", name: "KAC Triple Tap", desc: "Пламегаситель-компенсатор: три окна сверху гасят подброс, трёхзубая корона", fit: { thread: ["1/2x28"] }, stats: { weight: 94, length: 57, flash: -40, "recoilV%": -7, "recoilH%": -5, loud: 1 }, build: tripleTap },
  { id: "dtk3", cat: "muzzle", name: "Зенитко ДТК-3", desc: "Компенсатор к АК с открытой передней клеткой: гасит подброс, громче штатного", fit: { thread: ["m24x1.5", "m14x1L"] }, stats: { weight: 170, length: 88, flash: -20, "recoilV%": -18, "recoilH%": -14, loud: 3 }, build: dtk3 }
];

// ==== engine/lib/tactical.js
// Тактический фонарь SureFire Scout / Modlite / Streamlight: хвостовик с рифлёной крышкой и
// резиновой кнопкой (или вилкой выносной кнопки с кабелем и «таблеткой» на планке),
// корпус с насечкой-кольцами, голова со «скаллопами», стальной безель, отражатель + LED за стеклом.
function scout(ctx, o) {
  const k = ctx.kit();
  const r = o.r, L0 = o.tail, L1 = o.head, H = o.headR, cy = r + 4.5;
  const at = (g) => g.translate(0, cy, 0);
  k.add("alu", at(latheX([[L0 - 10, 0], [L0 - 10, r - 1.4], [L0 - 9, r + 0.3], [L0 - 1.2, r + 0.3], [L0 - 0.6, r - 0.4], [L0 + 0.4, r - 0.4], [L0 + 1, r], [L0 + 16, r], [L0 + 17, r - 0.8], [L0 + 18, r - 0.4], [L1, r - 0.4], [L1 + 5, H], [L1 + 28, H], [L1 + 30, H - 1.4], [L1 + 30, H - 3.2]], { seg: 40 })));
  k.add("alu", at(flutesX(r + 0.05, L0 - 8.2, L0 - 2, 24, 1, 0.6)));
  k.add("alu", at(ringGrooves(r + 0.2, L0 + 3, L0 + 15, 6, 0.5, { seg: 40 })));
  k.add("alu", at(flutesX(H - 1.6, L1 + 8, L1 + 25, 6, 5, 1.8)));
  k.add("steel", at(tubeX(H + 0.1, H - 3.4, L1 + 28, L1 + 31, { seg: 40 })));
  if (o.crenel) for (let i = 0; i < 6; i++) k.add("steel", at(T(box(2.4, 2, 5, { bevel: 0.5 }), { p: [L1 + 31.6, H - 1.6, 0], r: [i * 60 + 30, 0, 0] })));
  // крепление: зажим, седло под корпус, барашек справа
  k.add("alu", clampBody(-13, 13, 4.8, { w: 24 }));
  k.add("alu", extrudeX([[-7, 3], [7, 3], [7, cy - r + 3], [-7, cy - r + 3]], -12, 12, { bevel: 1 }));
  for (const s of [-1, 1]) k.add("steel", T(capScrew(1.6, 0.7), { r: [s * 90, 0, 0] }), { p: [6, 7.5, s * 7] });
  k.add("steel", T(thumbNut(6.2, 4.4, 8), { r: [0, -90, 0], p: [0, -2.5, 12.5] }));
  k.add("steel", cylZ(2.4, -14, 12.5, { seg: 12 }), { p: [0, -2.5, 0] });
  if (o.tail2) {
    // выносная кнопка: вилка в хвостовике, кабель петлёй, «таблетка» на планке за фонарём
    k.add("steel", at(latheX([[L0 - 17, 0], [L0 - 17, 3.6], [L0 - 16, 4.8], [L0 - 10.5, 4.8], [L0 - 10, 4], [L0 - 10, 0]], { seg: 20 })));
    k.add("rubber", at(latheX([[L0 - 22, 0], [L0 - 22, 2.2], [L0 - 17, 3.4], [L0 - 17, 0]], { seg: 16 })));
    const px0 = L0 - 44, px1 = L0 - 20;
    k.add("rubber", wire([[L0 - 22, cy, 0], [L0 - 25, cy - 1, 3], [L0 - 27, cy - 7, 8], [L0 - 23, 9, 9], [px1 + 3, 4.5, 4], [px1 - 1, 3.6, 0]], 1.3, { n: 60 }));
    k.add("poly", clampBody(px0 + 2, px1 - 2, 1.2, { w: 23, bevel: 0.5 }));
    k.add("rubber", extrudeX(rrect(0, 3.2, 17, 4.4, 2), px0, px1, { bevel: 1.4 }));
    for (let i = 0; i < 5; i++) k.add("rubber", T(box(1, 0.7, 13, { bevel: 0.3 }), { p: [px0 + 5 + i * 3.4, 5.5, 0] }));
  } else {
    k.add("rubber", at(latheX([[L0 - 12.6, 0], [L0 - 12.6, 3.8], [L0 - 12, 5.2], [L0 - 10.8, 5.8], [L0 - 9.6, 5.8], [L0 - 9.6, 0]], { seg: 24 })));
    k.add("steel", at(tubeX(7.2, 5.7, L0 - 11.4, L0 - 9.6, { seg: 24 })));
  }
  const root = node(o.name, [k.build()]);
  const head = lampHead(ctx, H - 3.3, L1 + 29, L1 + 12, cy, o);
  root.add(head.group);
  return { root, light: { p: [L1 + 30, cy, 0], lens: head.glow, lumens: o.lm, cd: o.cd, kelvin: o.kelvin, hot: o.hot, spill: o.spill, batt: o.batt, lensR: H - 3.3, beam: o.beam && { lensR: (H - 3.3) / 1e3, ...o.beam } } };
}
// Голова фонаря: полированный отражатель (виден через стекло), светодиод на медной подложке
// с жёлтым куполом люминофора, просветлённое стекло. glow — светящийся диск перед светодиодом:
// его яркость ведёт app (батарея).
function lampHead(ctx, r, xFront, xDeep, cy, o = {}) {
  const k = ctx.kit();
  const depth = xFront - xDeep, prof = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, x = xDeep + depth * t;
    prof.push([x, 2.2 + (r - 2.2) * Math.sqrt(t)]);
  }
  const refl = latheX([[xDeep - 0.2, 0], ...prof, [xFront, r], [xFront, r + 0.3], [xDeep - 0.6, 2.6], [xDeep - 0.6, 0]].reverse(), { seg: 40, crease: 70 });
  k.add(o.stipple ? "steelWorn" : "chrome", T(refl, { p: [0, cy, 0] }));
  k.add("copper", T(box(0.8, 6, 6, { bevel: 0.2 }), { p: [xDeep + 0.2, cy, 0] }));
  k.add("paintWhite", T(box(0.6, 3.2, 3.2, { bevel: 0.1 }), { p: [xDeep + 0.7, cy, 0] }));
  k.add("paintWhite#d9c25c", T(latheX([[0, 0], [0, 1.3], [0.5, 1.1], [0.8, 0.6], [0.9, 0]], { seg: 14 }), { p: [xDeep + 0.9, cy, 0] }));
  const group = node("lampHead", [k.build()]);
  const glass = lens(ctx, cylX(r + 0.2, xFront - 1.4, xFront - 0.6, { seg: 40 }).translate(0, cy, 0), "glass");
  const glow = new ctx.THREE.Mesh(cylX(r * 0.55, xDeep + 1, xDeep + 1.4, { seg: 24 }).translate(0, cy, 0), ctx.mats.get("lampLens").clone());
  glow.material.transparent = true;
  glow.material.opacity = 0.95;
  group.add(glass, glow);
  return { group, glow };
}
// ЛЦУ (PEQ-15 / Holosun LS): корпус с фасками, окна излучателей со стальными кольцами,
// ИК-осветитель с фокусирующим безелем, селектор режимов, барабаны выверки лазера сверху
// и слева, батарейный отсек с рифлёной крышкой сзади, кнопки активации.
function boxLaser(ctx, o) {
  const k = ctx.kit();
  const { L0, L1, H, W } = o;
  k.add("alu", clampBody(-18, 18, 5));
  for (const x of [-8, 8]) {
    k.add("steel", crossBolt(x, -2.5, 13, { nutR: 0 }));
    k.add("steel", T(thumbNut(4.6, 3.4, 6), { r: [0, -90, 0], p: [x, -2.5, 13] }));
  }
  k.add(o.mat, extrudeX([[-W / 2, 4, 2], [W / 2, 4, 2], [W / 2, H - 3, 5], [W / 2 - 3, H, 3], [-W / 2 + 3, H, 3], [-W / 2, H - 3, 5]], L0, L1, { bevel: 2.4 }));
  for (const s of [-1, 1]) k.add(o.mat, extrudeZ(rrect((L0 + L1) / 2 + 4, H * 0.45, (L1 - L0) * 0.55, H * 0.36, 3), 1, { bevel: 0.3, z: s * (W / 2 + 0.2) }));
  k.add("lensBlack", extrudeX(rrect(0, (H + 4) / 2, W - 6, H - 10, 3), L1 - 0.8, L1 + 0.6, { bevel: 0.3 }));
  const vis = [L1 + 0.6, H * 0.72, -W * 0.25];
  for (const z of [vis[2], W * 0.05]) {
    k.add("steel", T(tubeX(4.6, 3, L1 - 1, L1 + 2.4, { seg: 20 }), { p: [0, vis[1], z] }));
    k.add("lensBlack", T(cylX(3.1, L1 + 0.4, L1 + 1.2, { seg: 16 }), { p: [0, vis[1], z] }));
  }
  if (z0Illum(o)) {
    const iy = H * 0.42, iz = W * 0.18;
    k.add(o.mat, T(tubeX(o.illum + 2.4, o.illum, L1 - 3, L1 + 8, { seg: 32 }), { p: [0, iy, iz] }));
    k.add("rubber", T(flutesX(o.illum + 2.2, L1, L1 + 7, 20, 1.2, 0.8), { p: [0, iy, iz] }));
    k.add("irLens", T(cylX(o.illum - 0.2, L1 + 5, L1 + 6, { seg: 28 }), { p: [0, iy, iz] }));
    k.add("chrome", T(latheX([[L1 + 5.4, 0], [L1 + 5.4, 1.2], [L1 + 2, o.illum - 0.4], [L1 + 2, 0]], { seg: 24 }), { p: [0, iy, iz] }));
  }
  // кнопки активации сзади сверху
  for (const z of [-W * 0.22, W * 0.22]) k.add("rubber", T(latheX([[0, 0], [0, 4.6], [2.2, 4.2], [3.4, 2.8], [3.6, 0]], { seg: 18 }), { r: [0, 0, 90], p: [L0 + 16, H - 1, z] }));
  // селектор режимов с индексом и рисками
  k.add(o.mat, T(ctx.C.knob(8, 5, 18), { r: [0, 0, 90], p: [L0 + 36, H - 1, 0] }));
  k.add("paintWhite", T(box(3, 1, 1.2), { p: [L0 + 36, H + 4.3, 5] }));
  k.add("paintWhite", T(faceTicks(8.4, 10.4, 6, 0, { arc: 150, a0: -75 }), { r: [0, 0, 90], p: [L0 + 36, H - 0.4, 0] }));
  // барабаны выверки: сверху (высота) и слева (ветер), с прорезью и стрелкой
  for (const z of [-W / 4, W / 4]) {
    k.add("steel", T(cylY(3, H - 1, H + 1.2, { seg: 16 }), { p: [L1 - 16, 0, z] }));
    k.add("lensBlack", T(box(4, 0.5, 0.7, { bevel: 0.1 }), { p: [L1 - 16, H + 1.2, z] }));
    k.add("paintWhite", T(box(0.5, 0.3, 2.2), { p: [L1 - 21, H + 0.1, z] }));
  }
  for (const y of [H * 0.72, H * 0.45]) {
    k.add("steel", T(cylZ(3, -W / 2 - 1.2, -W / 2 + 1, { seg: 16 }), { p: [L1 - 16, y, 0] }));
    k.add("lensBlack", T(box(0.7, 4, 0.5, { bevel: 0.1 }), { p: [L1 - 16, y, -W / 2 - 1.2] }));
  }
  // батарейный отсек CR123 с крышкой на заднем торце
  const bz = -W * 0.22, by = H * 0.5;
  k.add(o.mat, T(cylX(7.6, L0 - 4, L0 + 2, { c: 0.8, seg: 28 }), { p: [0, by, bz] }));
  k.add(o.mat, T(ctx.C.knob(8.4, 4, 22), { r: [0, 180, 0], p: [L0 - 4, by, bz] }));
  k.add("steel", T(box(1.4, 6, 1.6, { bevel: 0.3 }), { p: [L0 - 8.6, by, bz] }));
  const root = node(o.name, [k.build()]);
  const ll = lens(ctx, cylX(2.9, vis[0] + 1.2, vis[0] + 1.8, { seg: 16 }).translate(0, vis[1], vis[2]), "laserLens");
  ll.renderOrder = 0;
  ll.material.transparent = false;
  root.add(ll);
  if (o.color) {
    ll.material = ll.material.clone();
    ll.material.emissive.setHex(o.color);
  }
  return { root, laser: { p: [vis[0] + 2, vis[1], vis[2]], lens: ll, color: o.color, batt: o.batt } };
}
function z0Illum(o) {
  return !!o.illum;
}
// Steiner DBAL-PL: корпус из полимера, голова фонаря с отражателем, окно лазера сверху,
// крышка батареи сзади, клавиша-селектор.
function dbal(ctx) {
  const k = ctx.kit();
  const L0 = -40, L1 = 36, W = 34, H = 34;
  k.add("alu", clampBody(-16, 16, 5));
  k.add("steel", crossBolt(0, -2.5, 13, { nutR: 0 }));
  k.add("steel", T(thumbNut(5, 3.6, 6), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  k.add("polyTan", extrudeX([[-W / 2, 4, 2], [W / 2, 4, 2], [W / 2, H - 3, 6], [W / 2 - 4, H, 3], [-W / 2 + 4, H, 3], [-W / 2, H - 3, 6]], L0, L1 - 8, { bevel: 2.2 }));
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) k.add("polyTan", T(box(2, H * 0.45, 1, { bevel: 0.4 }), { p: [L0 + 10 + i * 5, H * 0.46, s * (W / 2 + 0.3)] }));
  const ly = 15, lr = 11.5;
  k.add("polyTan", T(latheX([[L1 - 12, 0], [L1 - 12, lr + 2], [L1 + 4, lr + 3.4], [L1 + 6, lr + 2.6], [L1 + 6, lr], [L1 - 5, lr], [L1 - 5, 0]], { seg: 40 }), { p: [0, ly, 0] }));
  k.add("steel", T(tubeX(lr + 2.7, lr, L1 + 5, L1 + 7, { seg: 40 }), { p: [0, ly, 0] }));
  const vy = H - 6;
  k.add("polyTan", extrudeX(rrect(0, vy, 18, 10, 3), L1 - 10, L1 + 2, { bevel: 1 }));
  k.add("lensBlack", extrudeX(rrect(0, vy, 14, 6.5, 2), L1 + 1.6, L1 + 2.4, { bevel: 0.2 }));
  k.add("steel", T(tubeX(3.4, 2.3, L1 + 1.8, L1 + 3, { seg: 16 }), { p: [0, vy, 3] }));
  k.add("rubber", T(latheX([[0, 0], [0, 4.8], [2.2, 4.4], [3.4, 3], [3.6, 0]], { seg: 18 }), { r: [0, 0, 90], p: [L0 + 14, H - 1, 0] }));
  k.add("polyTan", T(ctx.C.knob(7, 5, 16), { r: [0, 0, 90], p: [L0 + 30, H - 1, 0] }));
  k.add("paintWhite", T(box(2.6, 0.8, 1), { p: [L0 + 30, H + 4.3, 4] }));
  for (const z of [-7, 7]) {
    k.add("steel", T(cylY(2.4, H - 1, H + 0.8, { seg: 12 }), { p: [L1 - 18, 0, z] }));
    k.add("lensBlack", T(box(3.2, 0.5, 0.6, { bevel: 0.1 }), { p: [L1 - 18, H + 0.8, z] }));
  }
  k.add("polyTan", T(cylX(8, L0 - 3, L0 + 1, { c: 0.8, seg: 28 }), { p: [0, ly, 0] }));
  k.add("polyTan", T(ctx.C.knob(8.6, 4, 20), { r: [0, 180, 0], p: [L0 - 3, ly, 0] }));
  const root = node("dbal", [k.build()]);
  const head = lampHead(ctx, lr - 0.2, L1 + 5.8, L1 - 4, ly);
  const le = head.glow;
  const ll = lens(ctx, cylX(2.1, L1 + 2.3, L1 + 2.8, { seg: 16 }).translate(0, vy, 3), "laserLens");
  ll.renderOrder = 0;
  ll.material.transparent = false;
  root.add(head.group, ll);
  return { root, light: { p: [L1 + 7, ly, 0], lens: le, lumens: 300, lensR: lr, beam: { candela: 4e3, hot: 0.1, spill: 0.5, spillK: 0.06, ring: 0.03, tir: true, color: 16185087, lensR: lr / 1e3 } }, laser: { p: [L1 + 3, vy, 3], lens: ll, color: 16722458 } };
}
// Вертикальная рукоять: зажим с барашком, тело с рёбрами/кольцами хвата, торцевая крышка отсека.
function vgrip(ctx, o) {
  const k = ctx.kit();
  const L = o.len, d = o.d;
  k.add("poly", clampBody(-d / 2 - 2, d / 2 + 2, 5, { w: 26 }));
  const prof = [[0, 0], [0, d / 2 - 0.5]];
  const n = 16;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const r = d / 2 - t * 2 + (o.ribs && i % 2 ? 0.8 : 0) + (!o.ribs ? 0.6 * Math.sin(t * Math.PI * 3) * (t > 0.15 && t < 0.85 ? 1 : 0) : 0);
    prof.push([4 + t * (L - 10), r]);
  }
  prof.push([L - 3, d / 2 - 2.5], [L, d / 2 - 5], [L, 0]);
  const body = latheX(prof, { seg: 32, crease: 50 });
  k.add("poly", T(body, { r: [0, 0, 90], p: [o.tilt ?? 0, 3, 0], s: [1, 1, o.flat ?? 1] }));
  k.add("polySoft", T(cylY(d / 2 - 3.2, L + 1.4, L + 4, { c: 1, seg: 28 }), { s: [1, 1, o.flat ?? 1] }));
  k.add("polySoft", T(box(d * 0.6, 1.4, 2.4, { bevel: 0.5 }), { p: [0, L + 4.4, 0] }));
  k.add("steel", T(thumbNut(5.6, 3.6, 6), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  k.add("steel", crossBolt(0, -2.5, 13, { nutR: 0 }));
  return { root: k.build(o.name) };
}
function afg(ctx) {
  const k = ctx.kit();
  const pro = shape([[-62, 0, 2], [34, 0, 2], [34, 6, 4], [14, 18, 20], [-40, 34, 12], [-66, 30, 8], [-66, 12, 6]]);
  k.add("poly", extrudeZ(pro, 30, { bevel: 6, curve: 8 }));
  k.add("polySoft", extrudeZ([[-50, 14, 4], [-10, 10, 6], [-30, 26, 8], [-58, 26, 6]], 1.2, { bevel: 0.4, z: 14.6 }));
  k.add("polySoft", extrudeZ([[-50, 14, 4], [-10, 10, 6], [-30, 26, 8], [-58, 26, 6]], 1.2, { bevel: 0.4, z: -14.6 }));
  k.add("steel", crossBolt(-20, -2.5, 15));
  k.add("steel", crossBolt(14, -2.5, 15));
  k.add("poly", clampBody(-64, 34, 3, { w: 28, jaw: -5.5 }));
  return { root: k.build("afg2") };
}
function handstop(ctx) {
  const k = ctx.kit();
  k.add("poly", clampBody(-14, 18, 3, { w: 26 }));
  k.add("poly", extrudeZ([[-14, 0, 1], [18, 0, 1], [18, 6, 3], [6, 21, 5], [-2, 21, 4], [-14, 6, 3]], 24, { bevel: 3 }));
  k.add("steel", crossBolt(0));
  return { root: k.build("handstop") };
}
// Сошки Harris S-BRM: зажим, поворотное основание, пружины отвода ног, телескопические
// ноги с проточками-фиксаторами, кнопки замка и резиновые пятки.
function harris(ctx) {
  const k = ctx.kit();
  k.add("alu", clampBody(-18, 18, 6));
  k.add("steel", T(thumbNut(7, 5, 8), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  k.add("steel", crossBolt(0, -2.5, 13, { nutR: 0 }));
  k.add("steel", extrudeZ([[-26, 5, 2], [26, 5, 2], [26, 18, 4], [-26, 18, 4]], 30, { bevel: 2 }));
  k.add("steel", cylY(8, 5, 12, { seg: 24 }));
  k.add("steel", T(ctx.C.knob(5, 5, 14), { r: [0, 0, 90], p: [-20, 18, 0] }));
  for (const s of [-1, 1]) {
    k.add("spring", T(spring(3, 0.8, -22, 8, 9), { p: [0, 20, s * 12] }));
    k.add("steel", cylZ(5.5, 0, 8, { seg: 18 }), { p: [16, 12, s > 0 ? 14 : -22] });
    k.add("steel", T(cylZ(3, -1, 1, { seg: 12 }), { p: [-22, 20, s * 12] }));
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const lk = ctx.kit();
    lk.add("steel", cylX(6.2, -4, 160, { c: 1, seg: 20 }));
    lk.add("steelWorn", ringGrooves(4.8, 160, 214, 6, 0.7, { seg: 18 }));
    lk.add("steel", cylX(7, 150, 162, { c: 1, seg: 20 }));
    lk.add("steel", T(cylY(2, 0, 3, { seg: 10 }), { p: [156, 6.6, 0] }));
    lk.add("rubber", latheX([[212, 0], [212, 7], [222, 8], [228, 5], [230, 0]], { seg: 20 }));
    lk.add("rubber", T(flutesX(7.6, 215, 224, 12, 1.4, 0.6), {}));
    const leg = node("leg", [lk.build()]);
    leg.position.set(16, 12, s * 21);
    legs.push(leg);
  }
  return { root: node("harris", [k.build(), ...legs]), bipod: { legs, angle: 90 } };
}
// ---- фонари, ЛЦУ и рукоятки из набора M416/АК/SCAR
function lampFace(ctx, o) {
  const { x, r, cy = 0, cz = 0, depth = 14, led = 2.2, tir = false } = o;
  const at = (g) => g.translate(0, cy, cz);
  const meshes = [];
  let refl;
  if (!tir) {
    const prof = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      prof.push([x - 1.2 - depth * (1 - t), led * 1.25 + (r - 0.4 - led * 1.25) * Math.sqrt(t)]);
    }
    refl = lens(ctx, at(latheX(prof.reverse(), { seg: 40, crease: 80 })), "reflector");
    refl.renderOrder = 0;
  } else {
    const prof = [[x - depth, led * 1.6], [x - depth * 0.45, r * 0.62], [x - 1.2, r - 0.3]];
    refl = lens(ctx, at(latheX(prof.reverse(), { seg: 36, crease: 80 })), "reflector");
    refl.material.color.set(10134442);
    refl.material.roughness = 0.25;
    refl.renderOrder = 0;
  }
  refl.material.transparent = false;
  meshes.push(refl);
  const x0 = tir ? x - depth : x - 1.2 - depth;
  const pad = new ctx.THREE.Mesh(at(box(0.8, led * 2.6, led * 2.6, { bevel: 0.2 }).translate(x0 + 0.2, 0, 0)), ctx.mats.get("paintWhite"));
  meshes.push(pad);
  const ledM = lens(ctx, at(latheX([[x0 + 0.5, 0], [x0 + 0.5, led], [x0 + 1.1, led * 0.9], [x0 + 1.5, led * 0.5], [x0 + 1.7, 0]], { seg: 20 })), "ledPhos");
  ledM.renderOrder = 0;
  ledM.material.transparent = false;
  meshes.push(ledM);
  const glass = lens(ctx, at(cylX(r - 0.1, x - 1.1, x - 0.3, { seg: 40, c: 0.2 })), "glass");
  meshes.push(glass);
  if (tir) {
    const cone = lens(ctx, at(latheX([[x - depth + 0.3, 0], [x - depth + 0.3, led * 1.5], [x - depth * 0.45, r * 0.6], [x - 1.3, r - 0.4], [x - 1.3, 0]], { seg: 36 })), "glass");
    cone.material.opacity = 0.22;
    meshes.push(cone);
  }
  for (const m of meshes) m.userData.noAO = true;
  return { meshes, lens: ledM, refl, p: [x + 0.2, cy, cz], lensR: r / 1e3 };
}
function tlr1(ctx) {
  const k = ctx.kit();
  const cy = 18;
  k.add("alu", clampBody(-16, 16, 5, { w: 25 }));
  k.add("steel", T(box(8, 4, 26, { bevel: 0.8 }), { p: [4, -2, 0] }));
  k.add("steel", T(ctx.C.knob(5.4, 4, 14), { r: [0, -90, 0], p: [4, -2.5, 12.8] }));
  const sec = rrect(0, cy - 1, 30, 29, 11);
  k.add("alu", extrudeX(sec, -52, 14, { bevel: 2 }));
  k.add("alu", extrudeX(rrect(0, 6.5, 22, 5, 1.5), -40, 12, { bevel: 0.8 }));
  k.add("alu", T(latheX([[12, 0], [12, 14.6], [14, 15.6], [30, 15.6], [31, 16.4], [37, 16.4], [38, 15.2], [38, 0]], { seg: 44 }), { p: [0, cy, 0] }));
  k.add("alu", T(ringGrooves(15.7, 16, 28, 5, 0.5, { seg: 44 }), { p: [0, cy, 0] }));
  k.add("steel", T(flutesX(16.3, 31, 37, 30, 1.2, 0.6), { p: [0, cy, 0] }));
  for (const s of [-1, 1]) {
    k.add("poly", T(extrudeZ([[0, -6, 2], [12, -4, 3], [14, 6, 3], [0, 7, 2]], 4, { bevel: 1.2 }), { p: [-58, cy - 2, s * 14.5] }));
    for (let i = 0; i < 4; i++) k.add("poly", T(box(1.2, 10, 1, { bevel: 0.3 }), { p: [-55 + i * 3, cy - 1, s * 16.8] }));
  }
  k.add("alu", extrudeX(rrect(0, cy - 2, 26, 22, 6), -60, -50, { bevel: 1.5 }));
  for (const x of [-44, -8]) for (const s of [-1, 1]) k.add("steel", T(cylZ(1.6, 14.8, 15.6, { seg: 10 }), { p: [x, cy + 7, s > 0 ? 0 : -30.4] }));
  const root = node("tlr1", [k.build()]);
  const f = lampFace(ctx, { x: 38, r: 13.6, cy, depth: 15, led: 2.2 });
  root.add(...f.meshes);
  return { root, light: { p: f.p, lens: f.lens, refl: f.refl, beam: { lensR: f.lensR, candela: 13e3, hot: 0.085, spill: 0.62, spillK: 0.05, ring: 0.05, color: 15856895 } } };
}
function modlite(ctx) {
  const k = ctx.kit();
  const cy = 24, r = 12.7;
  k.add("alu", clampBody(-13, 13, 5, { w: 24 }));
  k.add("steel", crossBolt(0));
  k.add("alu", extrudeX([[-8, 3, 1], [8, 3, 1], [8, cy - r + 2, 2], [-8, cy - r + 2, 2]], -12, 12, { bevel: 1 }));
  k.add("alu", T(tubeX(r + 3.2, r, -14, 14, { seg: 40 }), { p: [0, cy, 0] }));
  k.add("steel", T(cylY(2.4, cy + r - 1, cy + r + 4.4, { seg: 12 }), { p: [0, 0, 0] }));
  const at = (g) => T(g, { p: [0, cy, 0] });
  k.add("alu", at(latheX([[-86, 0], [-86, 9], [-84, 11.5], [-80, 13.2], [-66, 13.2], [-65, r], [6, r], [8, r + 1.2], [14, r + 1.2]], { seg: 40 })));
  k.add("alu", at(ringGrooves(13.3, -79, -67, 6, 0.5, { seg: 40 })));
  k.add("rubber", at(latheX([[-90, 0], [-90, 7], [-88.5, 8.8], [-86, 9.4], [-86, 0]], { seg: 28 })));
  k.add("alu", at(latheX([[14, 0], [14, 13.9], [22, 16.5], [30, 18.4], [50, 19.2], [52, 18.4], [52, 0]], { seg: 48 })));
  for (let i = 0; i < 6; i++) k.add("alu", at(tubeX(19.6, 17.5, 22 + i * 3.5, 23.6 + i * 3.5, { seg: 48 })));
  k.add("steel", at(tubeX(19.3, 16.8, 49, 53, { seg: 48 })));
  const root = node("modlite", [k.build()]);
  const f = lampFace(ctx, { x: 52.6, r: 16.8, cy, depth: 26, led: 1.8 });
  root.add(...f.meshes);
  return { root, light: { p: f.p, lens: f.lens, refl: f.refl, beam: { lensR: f.lensR, candela: 6e4, hot: 0.045, spill: 0.5, spillK: 0.018, ring: 0.07, color: 16774116 } } };
}
function rein(ctx) {
  const k = ctx.kit();
  const cy = 19, r = 12;
  k.add("alu", clampBody(-14, 14, 5, { w: 24 }));
  k.add("steel", crossBolt(-6));
  k.add("steel", crossBolt(6));
  k.add("alu", extrudeX([[-9, 3, 1], [9, 3, 1], [9, cy - 6, 3], [-9, cy - 6, 3]], -16, 16, { bevel: 1 }));
  const at = (g) => T(g, { p: [0, cy, 0] });
  k.add("alu", at(latheX([[-36, 0], [-36, 8], [-34, 11], [-30, 11.6], [-18, 11.6], [-17, r], [18, r]], { seg: 40 })));
  k.add("alu", at(ringGrooves(r + 0.2, -12, 16, 7, 0.45, { seg: 40 })));
  k.add("rubber", at(latheX([[-40, 0], [-40, 6], [-38, 7.6], [-36, 8], [-36, 0]], { seg: 24 })));
  k.add("alu", at(cylX(15.5, 18, 36, { seg: 6, c: 1.4 })));
  k.add("steel", at(tubeX(15.3, 13.2, 35, 37, { seg: 40 })));
  const root = node("rein", [k.build()]);
  const f = lampFace(ctx, { x: 37.4, r: 13, cy, depth: 12, led: 1.6, tir: true });
  root.add(...f.meshes);
  return { root, light: { p: f.p, lens: f.lens, refl: f.refl, beam: { lensR: f.lensR, candela: 16e3, hot: 0.13, spill: 0.72, spillK: 0.12, ring: 0.02, tir: true, color: 16773341 } } };
}
function klesch(ctx) {
  const k = ctx.kit();
  const cy = 17;
  k.add("alu", clampBody(-20, 20, 5, { w: 26 }));
  k.add("steel", crossBolt(-10));
  k.add("steel", crossBolt(10));
  k.add("alu", extrudeX(rrect(0, cy, 32, 28, 7), -46, 30, { bevel: 2.2 }));
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) k.add("alu", T(box(3, 16, 1.6, { bevel: 0.5 }), { p: [-34 + i * 6, cy, s * 16.4] }));
  k.add("alu", extrudeX(shape(rrect(0, cy, 32, 28, 7), [rrect(-3, cy, 24, 22, 5)]), 30, 34, { bevel: 0.8 }));
  for (const [z, y] of [[-12, cy - 10], [12, cy - 10], [-12, cy + 10], [12, cy + 10]]) k.add("steel", T(cylX(1.3, 33.5, 34.5, { seg: 10 }), { p: [0, y, z] }));
  k.add("lensBlack", extrudeX(rrect(-3, cy, 24, 22, 5), 30.2, 31, { bevel: 0.2 }));
  k.add("steel", T(tubeX(4.4, 3, 30, 34.4, { seg: 20 }), { p: [0, cy + 6, 11.5] }));
  k.add("irLens", T(cylX(3, 31.5, 32.5, { seg: 20 }), { p: [0, cy + 6, 11.5] }));
  k.add("steel", T(cylX(4.2, -52, -46, { seg: 20 }), { p: [0, cy + 4, 0] }));
  k.add("rubber", T(cylX(5.4, -50, -46, { seg: 20 }), { p: [0, cy - 7, 0] }));
  const root = node("klesch", [k.build()]);
  const f = lampFace(ctx, { x: 31, r: 10.5, cy, cz: -3, depth: 13, led: 2 });
  root.add(...f.meshes);
  return { root, light: { p: f.p, lens: f.lens, refl: f.refl, beam: { lensR: f.lensR, candela: 9e3, hot: 0.06, spill: 0.46, spillK: 0.03, ring: 0.06, color: 15660031 } } };
}
function laserBox(ctx, o) {
  const k = ctx.kit();
  const { L0, L1, H, W, mat } = o;
  k.add("alu", clampBody(-18, 18, 5));
  k.add("steel", T(ctx.C.knob(6, 5, 18), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  k.add("steel", cylZ(2.4, -14, 13, { seg: 12 }), { p: [0, -2.5, 0] });
  const sec = [[-W / 2, 4, 3], [W / 2, 4, 3], [W / 2, H - 4, 6], [W / 2 - 4, H, 5], [-W / 2 + 4, H, 5], [-W / 2, H - 4, 6]];
  k.add(mat, extrudeX(sec, L0, L1, { bevel: 3, bevelSeg: 3 }));
  for (const s of [-1, 1]) {
    k.add(mat, T(box(L1 - L0 - 24, H - 16, 1.2, { bevel: 0.6 }), { p: [(L0 + L1) / 2 - 2, H / 2 + 1, s * (W / 2 + 0.2)] }));
    for (let i = 0; i < 3; i++) k.add("lensBlack", T(box(L1 - L0 - 40, 0.8, 0.6), { p: [(L0 + L1) / 2 - 2, 10 + i * 5, s * (W / 2 + 0.9)] }));
  }
  const vis = [L1 + 0.6, H * 0.7, -W * 0.22];
  k.add("lensBlack", extrudeX(rrect(0, H * 0.7, W - 10, 12, 3), L1 - 0.8, L1 + 0.6, { bevel: 0.3 }));
  for (const z of [-W * 0.22, W * 0.12]) k.add("steel", T(tubeX(4.4, 2.8, L1 - 1, L1 + 2.2, { seg: 20 }), { p: [0, H * 0.7, z] }));
  if (o.illum) {
    const iy = H * 0.34;
    k.add(mat, T(tubeX(o.illum + 3, o.illum, L1 - 4, L1 + 9, { seg: 36 }), { p: [0, iy, 0] }));
    k.add("rubber", T(flutesX(o.illum + 2.8, L1 + 1, L1 + 8, 24, 1.2, 0.8), { p: [0, iy, 0] }));
    k.add("irLens", T(cylX(o.illum - 0.2, L1 + 6, L1 + 7, { seg: 30 }), { p: [0, iy, 0] }));
  }
  const turret = (p, r) => {
    k.add(mat, T(cylY(5, 0, 2.2, { seg: 24, c: 0.5 }), { p, r }));
    k.add("steel", T(cylY(3.4, 2.2, 3.4, { seg: 20, c: 0.3 }), { p, r }));
    k.add("lensBlack", T(box(0.8, 1.2, 5, { bevel: 0.1 }), { p: [p[0], p[1], p[2]], r }).translate(0, 0, 0));
  };
  turret([L1 - 16, H, 0], [0, 0, 0]);
  turret([L1 - 16, H / 2, W / 2], [90, 0, 0]);
  k.add(mat, T(ctx.C.knob(8.5, 5, 20), { r: [0, 0, 90], p: [L0 + 30, H - 1, 0] }));
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    k.add("paintWhite", T(box(2.4, 0.6, 1.1), { p: [L0 + 30 + Math.cos(a) * 11, H + 0.1, Math.sin(a) * 11], r: [0, -a * 57.3, 0] }));
  }
  k.add("paintWhite", T(box(4, 0.8, 1.2), { p: [L0 + 30, H + 4.2, 5] }));
  for (const z of [-W * 0.25, W * 0.25]) k.add("rubber", T(cylY(4.2, H - 1, H + 2.4, { c: 1, seg: 18 }), { p: [L0 + 12, 0, z] }));
  k.add("steel", T(cylX(4, L0 - 5, L0, { seg: 20 }), { p: [0, H * 0.5, 0] }));
  k.add(mat, T(ctx.C.knob(8, 5, 26), { r: [0, 0, 0], p: [0, 0, 0] }).rotateY(-Math.PI / 2).translate(L0 + 14, H * 0.45, W / 2 - 1));
  const root = node(o.name, [k.build()]);
  const ll = lens(ctx, cylX(2.7, vis[0] + 0.8, vis[0] + 1.4, { seg: 16 }).translate(0, vis[1], vis[2]), "laserLens");
  ll.renderOrder = 0;
  ll.material.transparent = false;
  ll.material.emissive.set(o.color);
  root.add(ll);
  const out = { root, laser: { p: [vis[0] + 2, vis[1], vis[2]], lens: ll, color: o.color } };
  if (o.light) {
    const ly = -2 + H * 0.3, lr = 9.5;
    k.add(mat, T(latheX([[L1 - 12, 0], [L1 - 12, lr + 2], [L1 + 6, lr + 3.4], [L1 + 8, lr + 2.4], [L1 + 8, 0]], { seg: 36 }), { p: [0, ly, W * 0.2] }));
    root.add(k.build());
    const f = lampFace(ctx, { x: L1 + 8.2, r: lr, cy: ly, cz: W * 0.2, depth: 8, led: 1.6, tir: true });
    root.add(...f.meshes);
    out.light = { p: f.p, lens: f.lens, refl: f.refl, beam: { lensR: f.lensR, ...o.light } };
  }
  return out;
}
function mvg(ctx) {
  const k = ctx.kit();
  k.add("poly", clampBody(-22, 22, 5, { w: 26 }));
  k.add("steel", T(ctx.C.knob(5.5, 4, 14), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  const pro = [[-26, 3, 2], [24, 3, 2], [18, 62, 8], [10, 70, 6], [-10, 70, 6], [-18, 62, 8]];
  k.add("polySoft", extrudeZ(pro, 27, { bevel: 7, curve: 8, bevelSeg: 3 }));
  for (let i = 0; i < 9; i++) {
    const y = 12 + i * 5.4, t = (y - 3) / 59;
    k.add("polySoft", T(box(2.2, 1.6, 20, { bevel: 0.6 }), { p: [24 - 6 * t + 0.6, y, 0], r: [0, 0, -6] }));
    k.add("polySoft", T(box(2.2, 1.6, 20, { bevel: 0.6 }), { p: [-26 + 8 * t - 0.6, y, 0], r: [0, 0, 7] }));
  }
  return { root: k.build("mvg") };
}
function kag(ctx) {
  const k = ctx.kit();
  const pro = [[-40, 0, 2], [34, 0, 2], [36, 6, 3], [30, 26, 7], [22, 30, 5], [16, 22, 6], [-30, 12, 12], [-42, 8, 4]];
  k.add("poly", extrudeZ(pro, 28, { bevel: 5, curve: 8, bevelSeg: 3 }));
  k.add("poly", clampBody(-34, 30, 4, { w: 26 }));
  for (const x of [-18, 12]) k.add("steel", T(cylZ(2.6, 13.2, 14.6, { seg: 12 }), { p: [x, 4, 0] }));
  for (let i = 0; i < 6; i++) k.add("poly", T(box(1.6, 3, 18, { bevel: 0.5 }), { p: [-8 + i * 4.2, 17 - i * 0.9, 0], r: [0, 0, -14] }));
  return { root: k.build("kag") };
}
var TACTICAL = [
  { id: "m600", cat: "light", name: "SureFire M600 Scout", desc: "Тактический фонарь 1000 лм", foot: [-13, 13], body: [-78, 72], stats: { weight: 175, ergo: -2 }, power: { light: 20, cells: "2 × CR123A", driver: "reg" }, build: (c) => scout(c, { name: "m600", r: 12.7, headR: 15.9, tail: -76, head: 42, lm: 1e3, beam: { candela: 2e4, hot: 0.07, spill: 0.55, spillK: 0.03, ring: 0.06, color: 15922687 } }) },
  { id: "m300", cat: "light", name: "SureFire M300 Mini Scout", desc: "Компактный фонарь 500 лм", foot: [-13, 13], body: [-60, 44], stats: { weight: 120, ergo: -1 }, power: { light: 24, cells: "1 × CR123A", driver: "reg" }, build: (c) => scout(c, { name: "m300", r: 11, headR: 12.6, tail: -58, head: 14, lm: 500, beam: { candela: 7e3, hot: 0.085, spill: 0.6, spillK: 0.045, ring: 0.05, color: 15922687 } }) },
  { id: "m640", cat: "light", name: "SureFire M640DF Scout Pro", desc: "1500 лм, 38 000 кд — двойное топливо, мощный луч с широкой засветкой", foot: [-13, 13], body: [-128, 78], stats: { weight: 190, ergo: -2 }, power: { light: 20, cells: "2 × CR123A", driver: "reg" }, build: (c) => scout(c, { crenel: true, name: "m640", r: 12.7, headR: 17.2, tail: -82, head: 46, lm: 1500, cd: 38e3, hot: 0.15, spill: 0.1, kelvin: 6300, batt: 20, tail2: true }) },
  { id: "okw", cat: "light", name: "Modlite OKW-18650", desc: "Прожектор 1250 лм / 64 000 кд: узкое пятно бьёт на 500 м", foot: [-13, 13], body: [-136, 96], stats: { weight: 210, ergo: -3 }, power: { light: 28, cells: "1 × 18650", driver: "step" }, build: (c) => scout(c, { name: "okw", r: 12.7, headR: 22.5, tail: -90, head: 50, lm: 1250, cd: 64e3, hot: 0.09, spill: 0.05, kelvin: 5200, batt: 28, tail2: true }) },
  { id: "hlx", cat: "light", name: "Streamlight ProTac HL-X", desc: "1000 лм, тёплый нейтральный свет, дешёвые CR123", foot: [-13, 13], body: [-78, 70], stats: { weight: 160, ergo: -2 }, power: { light: 24, cells: "2 × CR123A", driver: "reg" }, build: (c) => scout(c, { name: "hlx", r: 12.4, headR: 16.4, tail: -76, head: 40, lm: 1e3, cd: 2e4, hot: 0.2, spill: 0.11, kelvin: 5600, batt: 24 }) },
  { id: "tlr1", cat: "light", name: "Streamlight TLR-1 HL", desc: "Фонарь «пистолетного» типа 1000 лм, клавиши сзади с обеих сторон", foot: [-16, 16], body: [-62, 39], stats: { weight: 125, ergo: -2 }, power: { light: 22, cells: "2 × CR123A", driver: "reg" }, build: tlr1 },
  { id: "modlite", cat: "light", name: "Modlite PLHv2 18650", desc: "Дальнобойный фонарь 1500 лм / 60 000 кд, выносной кронштейн", foot: [-13, 13], body: [-91, 54], stats: { weight: 190, ergo: -3 }, power: { light: 21, cells: "1 × 18650", driver: "step" }, build: modlite },
  { id: "rein", cat: "light", name: "Cloud Defensive REIN 3.0 Micro", desc: "Компактный фонарь с широким ровным лучом (TIR), 1400 лм", foot: [-16, 16], body: [-41, 38], stats: { weight: 105, ergo: -1 }, power: { light: 25, cells: "1 × 18350", driver: "step" }, build: rein },
  { id: "klesch", cat: "light", name: "Зенитко «Клещ-2П»", desc: "Тактический фонарь с ИК-светодиодом, выносная кнопка", foot: [-20, 20], body: [-53, 35], stats: { weight: 160, ergo: -2 }, power: { light: 30, cells: "2 × CR123A", driver: "reg" }, build: klesch },
  { id: "peq15", cat: "laser", name: "L3 AN/PEQ-15", desc: "ЛЦУ: видимый + ИК лазер, ИК-осветитель", foot: [-18, 18], body: [-48, 60], stats: { weight: 215, ergo: -3, "hipSpread%": -18 }, power: { laser: 30, cells: "1 × CR123A" }, build: (c) => boxLaser(c, { name: "peq15", L0: -48, L1: 56, H: 38, W: 50, mat: "polyTan", illum: 8, color: 16722458 }) },
  { id: "ls221g", cat: "laser", name: "Holosun LS221G (зелёный)", desc: "Зелёный лазер 520 нм: днём виден лучше красного", foot: [-18, 18], body: [-34, 46], stats: { weight: 135, ergo: -2, "hipSpread%": -16 }, power: { laser: 24, cells: "1 × CR123A" }, build: (c) => boxLaser(c, { name: "ls221", L0: -34, L1: 44, H: 30, W: 34, mat: "poly", color: 3079936, batt: 24 }) },
  { id: "ls321", cat: "laser", name: "Holosun LS321", desc: "Компактный ЛЦУ с ИК-осветителем", foot: [-18, 18], body: [-34, 46], stats: { weight: 140, ergo: -2, "hipSpread%": -15 }, power: { laser: 26, cells: "1 × CR123A" }, build: (c) => boxLaser(c, { name: "ls321", L0: -34, L1: 44, H: 32, W: 36, mat: "poly", illum: 6 }) },
  { id: "dbal_a3", cat: "laser", name: "Steiner DBAL-A3", desc: "ЛЦУ: зелёный видимый + ИК лазер, ИК-осветитель с фокусировкой", foot: [-18, 18], body: [-44, 66], stats: { weight: 230, ergo: -3, "hipSpread%": -18 }, power: { laser: 30, cells: "1 × CR123A" }, build: (c) => laserBox(c, { name: "dbal_a3", L0: -44, L1: 56, H: 36, W: 42, mat: "polyFdeDark", illum: 8, color: 4063066 }) },
  { id: "perst4", cat: "laser", name: "Зенитко «Перст-4»", desc: "Компактный ЛЦУ: красный видимый + ИК лазеры", foot: [-18, 18], body: [-36, 40], stats: { weight: 135, ergo: -2, "hipSpread%": -14 }, power: { laser: 28, cells: "1 × CR123A" }, build: (c) => laserBox(c, { name: "perst4", L0: -36, L1: 38, H: 30, W: 34, mat: "alu", illum: 0, color: 16722458 }) },
  { id: "dbal", cat: "combo", name: "Steiner DBAL-PL", desc: "Комбо-блок: фонарь 300 лм + видимый лазер (" + __AB.L + " / " + __AB.Z + ")", foot: [-16, 16], body: [-42, 44], stats: { weight: 150, ergo: -2, "hipSpread%": -12 }, power: { light: 26, laser: 30, cells: "1 × CR123A", driver: "reg" }, build: dbal },
  { id: "peq16", cat: "combo", name: "Insight AN/PEQ-16A", desc: "Комбо-блок: белый фонарь 150 лм + красный и ИК лазеры (" + __AB.L + " / " + __AB.Z + ")", foot: [-18, 18], body: [-48, 66], stats: { weight: 280, ergo: -3, "hipSpread%": -14 }, power: { light: 24, laser: 30, cells: "2 × CR123A", driver: "reg" }, build: (c) => laserBox(c, { name: "peq16", L0: -48, L1: 56, H: 40, W: 46, mat: "polyTan", illum: 0, color: 16722458, light: { candela: 3e3, hot: 0.12, spill: 0.5, spillK: 0.08, ring: 0.02, tir: true, color: 16185087 } }) },
  { id: "rvg", cat: "foregrip", name: "Magpul RVG", desc: "Вертикальная рукоятка, контроль отдачи", foot: [-17, 17], body: [-17, 17], stats: { weight: 70, "recoilV%": -6, "recoilH%": -10, ergo: 3, adsTime: 6 }, build: (c) => vgrip(c, { name: "rvg", len: 98, d: 32, ribs: true }) },
  { id: "bcm_vg", cat: "foregrip", name: "BCM Gunfighter Mod 3", desc: "Короткая рукоятка-упор", foot: [-16, 16], body: [-16, 16], stats: { weight: 45, "recoilV%": -4, "recoilH%": -6, ergo: 5 }, build: (c) => vgrip(c, { name: "bcm", len: 62, d: 31, flat: 0.85 }) },
  { id: "afg2", cat: "foregrip", name: "Magpul AFG-2", desc: "Наклонная рукоятка, быстрая вскидка", foot: [-64, 34], body: [-66, 34], stats: { weight: 55, "recoilV%": -3, "recoilH%": -5, ergo: 6, adsTime: -8 }, build: afg },
  { id: "handstop", cat: "foregrip", name: "Упор для ладони", desc: "Упор под хват «C-clamp»", foot: [-14, 18], body: [-14, 18], stats: { weight: 25, ergo: 4, "recoilH%": -3 }, build: handstop },
  { id: "mvg", cat: "foregrip", name: "Magpul MVG", desc: "Широкая вертикальная рукоятка с наклоном, контроль отдачи", foot: [-22, 22], body: [-27, 25], stats: { weight: 60, "recoilV%": -5, "recoilH%": -9, ergo: 4, adsTime: 4 }, build: mvg },
  { id: "rk6", cat: "foregrip", name: "Зенитко РК-6", desc: "Прямая рукоятка с выраженным рифлением", foot: [-18, 18], body: [-18, 18], stats: { weight: 85, "recoilV%": -7, "recoilH%": -9, ergo: 2, adsTime: 7 }, build: (c) => vgrip(c, { name: "rk6", len: 108, d: 34, ribs: true, flat: 0.86, cap: true }) },
  { id: "kag", cat: "foregrip", name: "BCM KAG", desc: "Низкая наклонная рукоятка-упор, быстрая вскидка", foot: [-34, 30], body: [-42, 36], stats: { weight: 40, "recoilV%": -2, "recoilH%": -5, ergo: 6, adsTime: -8 }, build: kag },
  { id: "harris", cat: "bipod", name: "Сошки Harris S-BRM", desc: "Раскладные сошки, клавиша B", foot: [-18, 18], body: [-28, 232], stats: { weight: 420, ergo: -8, adsTime: 25, "recoilV%": -4 }, build: harris }
];

// ==== engine/lib/pistol.js
// Пистолетные модули: коллиматоры на вырез кожуха (MOS) и подствольные фонари на рамку.
function microBase(k) {
  // переходная пластина MOS: ложится в фрезеровку кожуха
  k.add("steelMatte", extrudeX(rrect(0, -0.6, 25, 2.2, 0.8), -24, 24, { bevel: 0.4 }));
  for (const x of [-15, 15]) k.add("steel", T(cylY(2.2, 0.4, 1.4, { seg: 12 }), { p: [x, 0, 0] }));
}
function rmrPistol(ctx) {
  const k = ctx.kit();
  microBase(k);
  const m = ctx.kit();
  const A = rmrBody(ctx, m);
  const glass = lens(ctx, extrudeX(shape(rrect(0, A + 0.5, 18.6, 13.4, 5)), 6, 7, { bevel: 0.2 }), "glassAmber");
  const body = node("rmr", [m.build(), glass]);
  body.position.y = 0.6;
  return { root: node("rmr_p", [k.build(), body]), sight: { node: body, y: A + 0.5, z: 0, x0: -22, x1: 15, r: 8, mag: 1, reticle: "dot", lens: glass } };
}
function hs507(ctx) {
  const k = ctx.kit();
  microBase(k);
  const A = 16;
  k.add("alu", extrudeX(rrect(0, 5, 26, 10, 2.4), -22, 22, { bevel: 1.2 }));
  // капюшон: скруглённая арка с плоскими «плечами»
  const arch = (w, h, y0) => {
    const pts = [[w, y0], [w, h - w * 0.7]];
    for (let i = 1; i < 12; i++) {
      const a = i / 12 * Math.PI;
      pts.push([Math.cos(a) * w, h - w * 0.7 + Math.sin(a) * w * 0.7]);
    }
    pts.push([-w, h - w * 0.7], [-w, y0]);
    return pts;
  };
  k.add("alu", extrudeX(shape(arch(13, 27, 8), [arch(10.2, 24.4, 9.5)]), -6, 16, { bevel: 1 }));
  k.add("alu", extrudeZ([[-22, 9], [-7, 9], [-7, 13, 2], [-12, 14, 2], [-22, 12, 2]], 24, { bevel: 1.2 }));
  // батарейный лоток справа и кнопки слева
  k.add("alu", T(extrudeX(rrect(0, 0, 4, 11, 1.5), -18, 2, { bevel: 0.8 }), { p: [0, 8, 13.6] }));
  k.add("steel", T(cylZ(1.4, 15.4, 16.4, { seg: 10 }), { p: [-15, 8, 0] }));
  for (const x of [-16, -8]) k.add("rubber", T(cylZ(2.6, -14.8, -13, { c: 0.6, seg: 14 }), { p: [x, 9, 0] }));
  k.add("steel", T(cylY(2.4, 13.5, 15, { seg: 14 }), { p: [-15, 0, 0] }));
  k.add("lensBlack", T(box(3.4, 0.5, 0.6, { bevel: 0.1 }), { p: [-15, 15, 0] }));
  k.add("lensBlack", T(box(0.6, 3.4, 0.5, { bevel: 0.1 }), { p: [-15, 8, 16.4] }));
  for (let i = 0; i < 6; i++) k.add("alu", T(box(0.8, 9, 0.6, { bevel: 0.2 }), { p: [-17 + i * 3, 8, 15.7] }));
  // окно излучателя и торцевые винты
  k.add("lensBlack", extrudeX(rrect(0, 11, 5, 2.4, 1), -6.8, -6.2, { bevel: 0.1 }));
  for (const s2 of [-1, 1]) k.add("steel", T(capScrew(1.4, 0.6), { r: [s2 * 90, 0, 0] }), { p: [14, 3.5, s2 * 13] });
  const glass = lens(ctx, extrudeX(shape(arch(10, 24.2, 9.6)), 12, 13, { bevel: 0.2 }), "glassBlue");
  return { root: node("hs507", [k.build(), glass]), sight: { y: A + 0.6, z: 0, x0: -22, x1: 16, r: 9, mag: 1, reticle: "holo", lens: glass } };
}
function acroP2(ctx) {
  const k = ctx.kit();
  microBase(k);
  const A = 18;
  k.add("alu", extrudeX(shape(rrect(0, 15, 30, 29, 5), [rrect(0, A, 22, 17, 3)]), -24, 23, { bevel: 1.4 }));
  k.add("alu", extrudeX(rrect(0, 2.5, 30, 5, 1.5), -24, 23, { bevel: 1 }));
  for (const x of [-26, 25]) k.add("alu", T(extrudeX(shape(rrect(0, 15, 31, 30, 5.5), [rrect(0, A, 21, 16, 3)]), -1.2, 1.2, { bevel: 0.6 }), { p: [x, 0, 0] }));
  k.add("alu", T(cylZ(6, 15, 19, { c: 1, seg: 24 }), { p: [-10, 14, 0] }));
  for (const x of [4, 12]) k.add("rubber", T(cylZ(2.4, -16.8, -15, { c: 0.6, seg: 14 }), { p: [x, 21, 0] }));
  k.add("alu", T(ctx.C.knob(6.4, 1.6, 20), { r: [0, -90, 0], p: [-10, 14, 19] }));
  k.add("lensBlack", T(box(5, 0.8, 0.6, { bevel: 0.1 }), { p: [-10, 14, 20.7] }));
  k.add("steel", T(cylY(2.2, 29, 30.4, { seg: 14 }), { p: [-6, 0, 0] }));
  k.add("lensBlack", T(box(3, 0.5, 0.6, { bevel: 0.1 }), { p: [-6, 30.4, 0] }));
  k.add("steel", T(cylZ(2.2, 14.8, 16.2, { seg: 14 }), { p: [6, 8, 0] }));
  for (const x of [-18, 18]) for (const s2 of [-1, 1]) k.add("steel", T(capScrew(1.3, 0.5), { r: [s2 * 90, 0, 0] }), { p: [x, 3, s2 * 15.2] });
  const glass = lens(ctx, extrudeX(rrect(0, A, 22, 17, 3), 18, 19, { bevel: 0.2 }), "glassRed");
  const rear = lens(ctx, extrudeX(rrect(0, A, 22, 17, 3), -22, -21, { bevel: 0.2 }), "glassBlue");
  return { root: node("acro", [k.build(), glass, rear]), sight: { y: A, z: 0, x0: -24, x1: 23, r: 8, mag: 1, reticle: "dot", lens: glass } };
}
// Фонарь на рамку: y растёт от планки (на нижней грани — вниз от рамки).
function pistolLight(ctx, o) {
  const k = ctx.kit();
  const { x0, x1, w, h, headR } = o;
  const cy = 6 + h / 2;
  // зацеп рельса + поперечина-упор, входящая в паз
  // губки зажима охватывают рельс рамки (рамка начинается в 4 мм над гранью рельса)
  k.add(o.mat || "alu", clampBody(-14, 12, 7, { w, jaw: -3.9, r: 1 }));
  k.add("steel", T(box(4, 3, 16), { p: [0, -0.6, 0] }));
  k.add(o.mat || "alu", extrudeX(rrect(0, cy, w, h, Math.min(w, h) * 0.3), x0, x1 - 14, { bevel: 1.6 }));
  k.add(o.mat || "alu", T(latheX([[x1 - 16, 0], [x1 - 16, h * 0.46], [x1 - 10, headR], [x1, headR], [x1, headR - 1.6], [x1 - 1, headR - 2.4]], { seg: 36 }), { p: [0, cy, 0] }));
  k.add("steel", T(tubeX(headR + 0.2, headR - 2.2, x1 - 2.4, x1 + 0.4, { seg: 36 }), { p: [0, cy, 0] }));
  // амбидекстральные клавиши сзади с рифлением
  for (const s of [-1, 1]) {
    k.add("poly", T(extrudeZ([[0, 0], [9, 0], [12, 7, 2], [0, 9, 2]], 4, { bevel: 0.8 }), { p: [x0 - 8, cy - 3, s * (w / 2 - 1)] }));
    for (let i = 0; i < 3; i++) k.add("poly", T(box(0.8, 6, 1, { bevel: 0.25 }), { p: [x0 - 6 + i * 2.6, cy + 1.2, s * (w / 2 + 1.2)] }));
  }
  // винт зажима сбоку, поясок у головы, болты корпуса
  k.add("steel", T(thumbNut(4.4, 2.6, 6), { r: [0, -90, 0], p: [-1, 3.2, w / 2] }));
  k.add(o.mat || "alu", extrudeX(rrect(0, cy, w + 0.8, h + 0.8, Math.min(w, h) * 0.3 + 0.4), x1 - 22, x1 - 18, { bevel: 0.6 }));
  for (const s of [-1, 1]) for (const x of [x0 + 6, x1 - 26]) k.add("steel", T(capScrew(1.3, 0.5), { r: [s * 90, 0, 0] }), { p: [x, cy + h * 0.2, s * w / 2] });
  if (o.crenel) for (let i = 0; i < 6; i++) k.add("steel", T(T(box(1.8, 1.8, 4, { bevel: 0.4 }), { p: [x1 + 1, headR - 1.2, 0] }), { r: [i * 60 + 30, 0, 0], p: [0, cy, 0] }));
  const root = node(o.name, [k.build()]);
  const head = lampHead(ctx, headR - 2.2, x1 - 0.6, x1 - (o.turbo ? 22 : 11), cy, o);
  root.add(head.group);
  const out = { root, light: { p: [x1 + 1, cy, 0], lens: head.glow, lumens: o.lm, cd: o.cd, hot: o.hot, spill: o.spill, kelvin: o.kelvin, batt: o.batt, lensR: headR - 2.2 } };
  if (o.laser) {
    const lk = ctx.kit();
    const lz = 0, ly = cy + h / 2 + 4;
    lk.add(o.mat || "alu", extrudeX(rrect(0, ly, 12, 9, 3), x1 - 30, x1 - 6, { bevel: 1 }));
    lk.add("steel", T(tubeX(3.2, 2, x1 - 8, x1 - 4, { seg: 16 }), { p: [0, ly, lz] }));
    root.add(lk.build());
    const ll = lens(ctx, cylX(2, x1 - 5, x1 - 4.4, { seg: 14 }).translate(0, ly, lz), "laserLens");
    ll.renderOrder = 0;
    ll.material.transparent = false;
    root.add(ll);
    out.laser = { p: [x1 - 3.5, ly, lz], lens: ll };
  }
  return out;
}
var PISTOL = [
  { id: "rmr_t2", cat: "micro", name: "Trijicon RMR Type 2", desc: "Точка 3,25 MOA, самый живучий корпус", stats: { weight: 34, ergo: -1, adsTime: 10 }, build: rmrPistol },
  { id: "hs507c", cat: "micro", name: "Holosun HS507C X2", desc: "Кольцо 32 MOA + точка 2 MOA", stats: { weight: 43, ergo: -1, adsTime: 12 }, build: hs507 },
  { id: "acro_p2", cat: "micro", name: "Aimpoint ACRO P-2", desc: "Закрытый излучатель: грязь и вода не мешают", stats: { weight: 60, ergo: -2, adsTime: 14 }, build: acroP2 },
  { id: "x300u", cat: "plight", name: "SureFire X300U-B", desc: "Фонарь 1000 лм / 12 000 кд, зацеп за паз рамки", foot: [-6, 6], body: [-20, 70], stats: { weight: 116, ergo: -3 }, power: { light: 24, cells: "2 × CR123A", driver: "reg" }, build: (c) => pistolLight(c, { crenel: true, name: "x300", x0: -12, x1: 70, w: 30, h: 26, headR: 15.5, lm: 1e3, cd: 12e3, hot: 0.2, spill: 0.12, kelvin: 6400, batt: 22 }) },
  { id: "x300t", cat: "plight", name: "SureFire X300T-B Turbo", desc: "650 лм / 50 000 кд: узкий дальнобойный луч, длинная голова", foot: [-6, 6], body: [-20, 84], stats: { weight: 136, ergo: -4 }, power: { light: 26, cells: "2 × CR123A", driver: "reg" }, build: (c) => pistolLight(c, { name: "x300t", x0: -12, x1: 84, w: 30, h: 26, headR: 19, lm: 650, cd: 5e4, hot: 0.08, spill: 0.04, kelvin: 6000, batt: 26, turbo: true }) },
  { id: "tlr7a", cat: "plight", name: "Streamlight TLR-7A", desc: "Компактный фонарь 500 лм / 5000 кд", foot: [-6, 6], body: [-18, 52], stats: { weight: 71, ergo: -1 }, power: { light: 28, cells: "1 × CR123A", driver: "reg" }, build: (c) => pistolLight(c, { name: "tlr7", x0: -10, x1: 52, w: 27, h: 22, headR: 12, lm: 500, cd: 5e3, hot: 0.24, spill: 0.14, kelvin: 6500, batt: 28, mat: "poly" }) },
  { id: "tlr1hl", cat: "plight", pistolOnly: true, name: "Streamlight TLR-1 HL", desc: "1000 лм / 13 000 кд, алюминиевый корпус", foot: [-6, 6], body: [-20, 74], stats: { weight: 122, ergo: -3 }, power: { light: 24, cells: "2 × CR123A", driver: "reg" }, build: (c) => pistolLight(c, { name: "tlr1", x0: -12, x1: 74, w: 31, h: 25, headR: 15, lm: 1e3, cd: 13e3, hot: 0.19, spill: 0.11, kelvin: 5900, batt: 24 }) },
  { id: "tlr8a", cat: "plight", name: "Streamlight TLR-8A", desc: "Фонарь 500 лм + красный ЛЦУ (" + __AB.L + " / " + __AB.Z + ")", foot: [-6, 6], body: [-18, 56], stats: { weight: 83, ergo: -2, "hipSpread%": -12 }, power: { light: 28, laser: 30, cells: "1 × CR123A", driver: "reg" }, build: (c) => pistolLight(c, { name: "tlr8", x0: -10, x1: 56, w: 28, h: 23, headR: 12.5, lm: 500, cd: 6e3, laser: true, mat: "poly", batt: 25 }) }
];

// ==== engine/lib/grips.js
function grip(ctx, o) {
  const k = ctx.kit();
  const a = (o.angle ?? 20) * Math.PI / 180;
  const H = o.h ?? 104;
  const sh = (y) => -Math.tan(a) * -y;
  const front = o.front.map(([f, y]) => [sh(y) + f, y]);
  const back = o.back.map(([f, y]) => [sh(y) + f, y]);
  k.add(o.mat || "poly", gripLoft(front, back, { w: o.w ?? 30, width: (t) => 0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.6)) }));
  if (o.texture !== false) {
    const tx = [];
    for (let i = 0; i < 9; i++) {
      const y = -24 - i * 8.5;
      for (const s of [-1, 1]) tx.push(T(box(16, 1.1, 1.2, { bevel: 0.3 }), { p: [sh(y) - 22, y, s * ((o.w ?? 30) / 2 * 0.9 - 0.2)], r: [0, 0, o.angle ?? 20] }));
    }
    k.add(o.mat || "poly", tx);
  }
  if (o.cap) k.add("polySoft", T(box(34, 5, (o.w ?? 30) - 4, { bevel: 2 }), { p: [sh(-H) - 18, -H - 1, 0], r: [0, 0, -4] }));
  return { root: k.build(o.name) };
}
var GRIPS = [
  {
    id: "hk_v2",
    cat: "pgrip",
    name: "HK V2",
    desc: "Эргономичная рукоять HK с упором под палец",
    fit: { iface: ["ar"] },
    stats: { weight: 80, ergo: 0 },
    build: (c) => grip(c, { name: "hk_v2", angle: 18, front: [[2, 0], [0, -14], [5, -26], [0, -36], [-3, -70], [-2, -102]], back: [[-34, 6], [-44, 2], [-42, -20], [-36, -48], [-38, -80], [-36, -104]], cap: true })
  },
  {
    id: "moe_grip",
    cat: "pgrip",
    name: "Magpul MOE+",
    desc: "Прорезиненная, с отсеком в торце",
    fit: { iface: ["ar"] },
    stats: { weight: 75, ergo: 2 },
    build: (c) => grip(c, { name: "moe", angle: 22, mat: "polySoft", front: [[1, 0], [0, -20], [2, -40], [-1, -70], [0, -100]], back: [[-32, 5], [-40, 0], [-38, -30], [-35, -60], [-36, -102]], cap: true })
  },
  {
    id: "bcm_mod3",
    cat: "pgrip",
    name: "BCM Gunfighter Mod 3",
    desc: "Вертикальнее, удобна при коротком прикладе",
    fit: { iface: ["ar"] },
    stats: { weight: 70, ergo: 3 },
    build: (c) => grip(c, { name: "bcm", angle: 12, front: [[1, 0], [0, -30], [1, -60], [0, -96]], back: [[-30, 4], [-38, 0], [-35, -40], [-34, -96]], texture: true })
  }
];

// ==== engine/lib/index.js
// Единая библиотека модулей для всех стволов. Совместимость решают категория, планка и fit/only:
// прицелы, фонари, ЛЦУ и рукоятки ставятся на любую подходящую планку, дульные — по резьбе.
var LIB = [...OPTICS, ...DOVETAIL, ...MUZZLES, ...MUZZLES2, ...TACTICAL, ...PISTOL, ...GRIPS];

// ==== weapons/shared.js
// Общие детали для описаний оружия: магазины, антабки, «сухари» для прикладов.

// Коробчатый магазин с изгибом радиуса R (Infinity/0 — прямой). Начало координат — передний верх корпуса,
// корпус уходит назад (−x) на глубину d0 и вниз по дуге на длину len. Губки поднимаются на lipH над нулём.
function boxMag(ctx, o) {
  const { T: T2, extrudeZ: exZ, box: bx, wire: wr, node: nd } = ctx.G;
  const k = ctx.kit(), rk = ctx.kit();
  const R4 = o.R && isFinite(o.R) ? o.R : 1e5, L = o.len, D0 = o.d0, D1 = o.d1 ?? o.d0, W = o.w;
  const lipH = o.lipH ?? 10;
  const cx = -D0 / 2 + R4, n = 18, back = [], front = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n * L, a = Math.PI + s / R4, d = D0 + (D1 - D0) * (i / n);
    const px = cx + Math.cos(a) * R4, py = Math.sin(a) * R4, nx = Math.cos(a), ny = Math.sin(a);
    back.push([px + nx * d / 2, py + ny * d / 2]);
    front.push([px - nx * d / 2, py - ny * d / 2]);
  }
  const sx = -front[0][0];
  const P = [[front[0][0], lipH], [back[0][0], lipH], ...back.slice(1), ...front.slice().reverse()].map(([x, y]) => [x + sx, y, 0]);
  k.add(o.mat, exZ(P, W, { bevel: o.bevel ?? 1 }));
  const endA = Math.PI + L / R4;
  const ex = cx + Math.cos(endA) * R4 + sx, ey = Math.sin(endA) * R4;
  const tx = -Math.sin(endA), ty = Math.cos(endA);
  if (o.ribs) {
    for (let j = 1; j < 3; j++) {
      const pts = [];
      for (let i = 1; i < n; i++) {
        const s = i / n * L, a = Math.PI + s / R4, d = D0 + (D1 - D0) * (i / n), t = j / 3 - 0.5;
        pts.push([cx + Math.cos(a) * (R4 + t * d) + sx, Math.sin(a) * (R4 + t * d)]);
      }
      for (const s of [-1, 1]) k.add(o.ribMat || o.mat, wr(pts.map((p) => [p[0], p[1], s * (W / 2 + 0.1)]), o.ribR ?? 1, { n: 40, seg: 6 }));
    }
  }
  if (o.window) for (const s of [-1, 1]) k.add("lensBlack", T2(bx(5, L * 0.55, 1, { bevel: 0.4 }), { p: [-D0 * 0.72, -L * 0.45, s * (W / 2 + 0.05)] }));
  // затыльник-крышка
  const pl = o.plateH ?? 5;
  k.add(o.plate || o.mat, T2(bx(D1 + (o.plateOver ?? 5), pl, W + (o.plateW ?? 2.5), { bevel: Math.min(1.6, pl * 0.3) }), { p: [ex + tx * pl * 0.4, ey + ty * pl * 0.4, 0], r: [0, 0, endA * 57.3] }));
  if (o.catchX != null) k.add(o.mat, T2(bx(5, 3.2, W - 4), { p: [o.catchX, o.catchY ?? -6, 0] }));
  ctx.C.feedLips(k, o.lipMat || o.mat, -D0 + (o.lipX0 ?? 4), -D0 + (o.lipX1 ?? D0 * 0.62), lipH, W / 2, { rise: o.lipRise ?? 3, curl: o.lipCurl ?? 2.4 });
  const cr = ctx.C.CAL[o.cal];
  const dx = (cr?.rim ?? 10) * 0.42;
  ctx.C.cartridge(rk, o.cal, { p: [-D0 + 2.5, lipH + 1.5, -dx * 0.5], r: [0, 0, o.roundTilt ?? 2] });
  ctx.C.cartridge(rk, o.cal, { p: [-D0 + 2.5, lipH + 1.5 - dx * 1.05, dx * 0.5], r: [0, 0, o.roundTilt ?? 2] });
  const rounds = rk.build("rounds");
  return { root: nd("mag", [k.build(), rounds]), mag: { cap: o.cap, rounds } };
}
// Барабан под коробчатой горловиной (горловина — boxMag укороченной длины).
function drumMag(ctx, o) {
  const { T: T2, cylZ: cZ, box: bx, node: nd } = ctx.G;
  const k = ctx.kit();
  const neck = boxMag(ctx, { ...o, len: o.neck, ribs: false, window: false, plateH: 1 });
  const [cx, cy, r, w] = o.drum;
  for (const s of [-1, 1]) {
    k.add(o.mat, T2(cZ(r, s < 0 ? -w / 2 : w * 0.08, s < 0 ? -w * 0.08 : w / 2, { c: 4, seg: 48 }), { p: [cx, cy, 0] }));
    for (let i = 0; i < 10; i++) k.add(o.mat, T2(bx(2.2, r * 0.62, 1.4, { bevel: 0.5 }), { p: [cx, cy, s * (w / 2 + 0.3)], r: [0, 0, i * 36] }).translate(0, 0, 0));
  }
  k.add(o.ringMat || "steel", T2(cZ(r - 2, -w * 0.1, w * 0.1, { seg: 48 }), { p: [cx, cy, 0] }));
  k.add("steel", T2(ctx.C.knob(r * 0.24, 5, 16), { r: [0, -90, 0], p: [cx, cy, w / 2 + 4] }));
  return { root: nd("drum", [neck.root, k.build()]), mag: { cap: o.cap, rounds: neck.mag.rounds } };
}
// Антабка: скоба на двух ушках.
function slingLoop(ctx, k, mat, p, o = {}) {
  const { T: T2, box: bx, wire: wr } = ctx.G;
  const w = o.w ?? 22, h = o.h ?? 12, side = o.side ?? 1;
  k.add(mat, T2(bx(8, 4, 5, { bevel: 1 }), { p: [p[0], p[1], p[2]] }));
  k.add("steelWorn", wr([[p[0] - w / 2, p[1], p[2] + side * 2], [p[0] - w / 2, p[1] + side * 0, p[2] + side * h * 0.6], [p[0], p[1], p[2] + side * h], [p[0] + w / 2, p[1], p[2] + side * h * 0.6], [p[0] + w / 2, p[1], p[2] + side * 2]], 1.4, { n: 30 }));
}

const DEFS = {}, FAMILY = {};
(() => {
// ---- weapons/ak_common.js
var AK = {
  FRONT: 24,
  REAR: -223,
  // торцы ствольной коробки
  WALL: 11,
  BOTTOM: -24,
  // верх боковин и дно коробки
  GAS_Y: 23,
  GAS_R: 9,
  // ось газовой трубки
  SIGHT_Y: 44,
  // линия прицеливания (прорезь целика / вершина мушки)
  REAR_X: 30,
  FRONT_X: 386,
  // прорезь целика / мушка
  MUZZLE: 415
};
function receiver(ctx, k, o) {
  const M = o.steel;
  const { FRONT: F, REAR: R4, WALL: W, BOTTOM: B } = AK;
  const YB = B + 2, BR = 3.4;
  const MW0 = -73, MW1 = -1;
  const dimple = slot(-54, -20, -11, 11, 8);
  const holes = o.dimples ? [dimple] : [];
  const low = [[R4 + 9, YB, 3], [MW0, YB, 1], [MW0, B - 1.4, 1], [MW1, B - 1.4, 1], [MW1, YB, 1]];
  const right = [[F, YB, 1], [F, W], [-12, W], [-12, -1, 1], [-88, -1, 1], [-88, 7], [-206, 7], [-206, W], [R4, W], [R4, -15, 2], ...low];
  const left = [[F, YB, 1], [F, W], [R4, W], [R4, -15, 2], ...low];
  k.add(M, extrudeZ(shape(right, holes), 1.4, { bevel: 0.35, z: 14.3 }));
  k.add(M, extrudeZ(shape(left, holes), 1.4, { bevel: 0.35, z: -14.3 }));
  if (o.dimples) for (const s of [-1, 1]) k.add(M, extrudeZ(shape(dimple), 1.2, { bevel: 0.45, z: s * 13.9 }));
  const cz = 15 - BR;
  for (const [x0, x1] of [[R4 + 6, MW0], [MW1, F]]) {
    const slot2 = x0 < -100 ? [rrect(-114, 0, 18, 7, 2)] : [];
    k.add(M, extrudeY(shape(rrect((x0 + x1) / 2, 0, x1 - x0, cz * 2, 0.6), slot2), B - 1.4, B, { bevel: 0.3 }));
    for (const s of [-1, 1]) {
      const bend = [];
      for (let i = 0; i <= 8; i++) {
        const a = -(i / 8) * Math.PI / 2;
        bend.push([s * (cz + Math.cos(a) * BR), YB + Math.sin(a) * BR]);
      }
      for (let i = 8; i >= 0; i--) {
        const a = -(i / 8) * Math.PI / 2;
        bend.push([s * (cz + Math.cos(a) * (BR - 1.4)), YB + Math.sin(a) * (BR - 1.4)]);
      }
      k.add(M, extrudeX(bend, Math.max(x0, R4 + 9), x1, { bevel: 0.3 }));
    }
  }
  k.add("steel", extrudeX(rrect(0, (B + W) / 2 - 2, 26.6, W - B - 4, 1), 8, F, { bevel: 0.6 }));
  k.add("steel", extrudeX(rrect(0, (B + W) / 2 - 2, 26.6, W - B - 6, 1), R4, R4 + 14, { bevel: 0.6 }));
  k.add("lensBlack", extrudeX(rrect(0, -8, 26, 8, 0), -205, 6, { bevel: 0 }));
  for (const s of [-1, 1]) k.add(M, extrudeX(rrect(s * 13.6, W - 0.6, 3, 1.4, 0.4), R4, F, { bevel: 0.2 }));
  const head = () => latheX([[0, 0], [0, 2.4], [0.35, 2.3], [0.7, 2], [1, 1.4], [1.15, 0.7], [1.2, 0]], { seg: 16, crease: 70 });
  const rivets = [[4, -5], [16, -4], [3, -17], [15, -16], [-81, -13], [-90, -13], [-77, -19.5], [-150, -18], [-214, -3], [-214, -14], [-201, -9]];
  for (const s of [-1, 1]) for (const [x, y] of rivets) k.add(M, T(head(), { r: [0, s > 0 ? -90 : 90, 0], p: [x, y, s * 15] }));
  k.add("steelWorn", T(cylZ(2.5, -15.35, -14.6, { c: 0.25, seg: 16 }), { p: [9.5, -10.5, 0] }));
  for (const s of [-1, 1]) for (const [x, y] of [[-92, -17], [-112, -18]]) {
    k.add("steelWorn", T(latheX([[0, 0], [0, 2.7], [0.3, 2.8], [0.9, 2.8], [1.2, 2.4], [1.2, 0]], { seg: 16 }), { r: [0, s > 0 ? -90 : 90, 0], p: [x, y, s * 15] }));
  }
  k.add("steelWorn", T(latheX([[0, 0], [0, 4.2], [0.4, 4.4], [1.1, 4.4], [1.5, 3.6], [1.5, 1.4], [2.2, 1.2], [2.2, 0]], { seg: 20 }), { r: [0, 90, 0], p: [-178, 2, -15] }));
  k.add("spring", wire([[-92, -17, -16.3], [-101, -20, -16.5], [-112, -18, -16.3], [-132, -17, -16.2], [-158, -11, -16.2], [-174, -2, -16.2], [-178, 3.6, -16.4]], 0.8, { n: 70, seg: 6 }));
  for (const a of [0, -6.5, -13]) {
    const r = a * Math.PI / 180, lx = 123, ly = 0;
    const x = -178 + lx * Math.cos(r) - ly * Math.sin(r), y = 2 + lx * Math.sin(r) + ly * Math.cos(r);
    k.add(M, T(tubeX(1.7, 0.9, 0, 0.35, { seg: 14, c: 0.12 }), { r: [0, -90, 0], p: [x, y, 15] }));
  }
  k.add(M, T(extrudeX(shape([[-5, 0], [5, 0], [7, 3.2], [-7, 3.2]]), -150, -38, { bevel: 0.4 }), { r: [-90, 0, 0], p: [0, -2, -15.5] }));
  k.add(M, T(extrudeX(shape([[-7.4, 0], [7.4, 0], [7.4, 0.8], [-7.4, 0.8]]), -152, -36, { bevel: 0.3 }), { r: [-90, 0, 0], p: [0, -2, -15] }));
  for (const x of [-140, -94, -48]) k.add(M, T(latheX([[0, 0], [0, 2.3], [0.4, 2.1], [0.8, 1.2], [0.9, 0]], { seg: 14 }), { r: [0, 90, 0], p: [x, -2, -18.7] }));
}
function coverStd(ctx, o = {}) {
  const k = ctx.kit();
  const M = o.steel || "steel";
  const arc = (w, y0, y1, r, n = 14) => {
    const pts = [[w, y0]];
    const cy = y1 - r;
    pts.push([w, cy]);
    for (let i = 1; i < n; i++) {
      const a = i / n * Math.PI;
      pts.push([Math.cos(a) * w, cy + Math.sin(a) * r]);
    }
    pts.push([-w, cy], [-w, y0]);
    return pts;
  };
  const outer = arc(16.4, 11.4, 27.5, 12);
  const inner = arc(15.2, 11.4, 26.3, 11).reverse();
  const sec = [...outer, ...inner.map((p) => [p[0], p[1]])];
  k.add(M, extrudeX(sec, AK.REAR + 1, AK.FRONT + 4, { bevel: 0.3 }));
  const ribs = o.ribs || [-196, -170, -144, -118, -92, -66, -40];
  const bump = [[-4, 0], [-2.6, 0.3], [-1, 0.6], [1, 0.6], [2.6, 0.3], [4, 0]];
  for (const x of ribs) k.add(M, loftX(bump.map(([dx, d]) => ({ x: x + dx, pts: arc(16.4 + d, 13.2, 27.5 + d, 12 + d, 18) })), { crease: 70, flip: true }));
  for (const s of [-1, 1]) k.add(M, extrudeX(rrect(s * 15.2, 12, 2.4, 1.2, 0.4), AK.REAR + 2, AK.FRONT + 3, { bevel: 0.3 }));
  k.add(M, extrudeX(arc(16.4, 11.4, 27.5, 12), AK.REAR - 1, AK.REAR + 2, { bevel: 0.5 }));
  k.add("steelWorn", T(cylX(4.6, AK.REAR - 6, AK.REAR - 0.5, { c: 0.8, seg: 18 }), { p: [0, 17, 0] }));
  k.add("steelWorn", T(box(3, 3, 12), { p: [AK.REAR - 4, 13.5, 0] }));
  k.add("lensBlack", extrudeY(rrect(AK.REAR + 12, 0, 11, 7, 1.5), 26.9, 27.62, { bevel: 0.1 }));
  k.add("steelWorn", extrudeY(rrect(AK.REAR + 12.5, 0, 8.4, 5, 1), 24, 28.3, { bevel: 0.5 }));
  return { root: k.build("cover") };
}
function carrier(ctx, o) {
  const k = ctx.kit();
  k.add("steelBright", extrudeX(rrect(0, 12, 22, 15, 3), -150, 6, { bevel: 1 }));
  k.add("steelBright", extrudeX(rrect(0, 3, 20, 8, 2), -150, -30, { bevel: 0.8 }));
  k.add("steelWorn", cylX(8.8, -36, 0, { c: 0.8, seg: 24 }));
  k.add("steelWorn", T(box(10, 4, 5), { p: [-4, 7.5, 0] }));
  k.add("steelWorn", T(box(10, 4, 5), { p: [-4, -7.5, 0] }));
  k.add("steel", extrudeZ([[-24, 2], [-2, 2], [-2, 6], [-24, 6]], 2.2, { bevel: 0.4, z: 8.4 }));
  const hx = -88;
  k.add("steelBright", extrudeY(shape([[hx - 14, 10], [hx + 16, 10], [hx + 6, 20, 3], [hx - 10, 22, 3]]), 4, 10.5, { bevel: 0.8 }));
  k.add("steelBright", T(cylZ(3.6, 18, 26, { seg: 16 }), { p: [hx - 2, 7.5, 0] }));
  k.add("steelBright", T(latheX([[0, 0], [0, 5.2], [2, 6.4], [7, 6.4], [9.5, 4.4], [10.5, 0]], { seg: 20 }), { r: [0, -90, 0], p: [hx - 2, 7.5, 24] }));
  return node("carrier", [k.build()]);
}
function barrelAndGas(ctx, k, o) {
  const M = o.steel;
  const { MUZZLE, FRONT_X: FX2, SIGHT_Y: SY } = AK;
  k.add(M, latheX([[AK.FRONT - 6, 0], [AK.FRONT - 6, 12.5], [96, 12.5], [97, 12], [98, 11], [220, 10.2], [286, 9.6], [287, 9.4], [296, 9.4], [300, 9], [330, 8.8], [331.5, 8.5], [362, 8.4], [404, 8.2], [405, 7.2], [405.5, 6.6], [405.5, 0]], { seg: 32 }));
  k.add(M, latheX([[405.5, 3], [405.5, 7], [MUZZLE - 0.8, 7], [MUZZLE, 6.2], [MUZZLE, 3.6], [MUZZLE - 0.6, 3], [405.5, 3]], { seg: 28 }));
  k.add(M, extrudeZ([[AK.FRONT - 2, 6], [94, 6], [94, 27, 2], [89, 31, 2], [36, 32.4, 2], [AK.FRONT - 2, 31, 2]], 26, { bevel: 1.4 }));
  k.add(M, extrudeX(shape(circle(0, 0, 15, 24).map((p) => [p[0], p[1], 0])), AK.FRONT - 2, 94, { bevel: 1 }));
  const cam = [[34, 30], [92, 30]];
  for (let i = 6; i >= 0; i--) {
    const y = 35.4 - i * 0.38;
    cam.push([44 + 8 * i, y], [36 + 8 * i, y]);
  }
  for (const s of [-1, 1]) k.add(M, extrudeZ(cam, 4.2, { bevel: 0.4, z: s * 10.9 }));
  k.add("steelWorn", T(cylZ(1.8, -13.3, 13.3, { c: 0.3, seg: 12 }), { p: [89, 33.2, 0] }));
  for (const x of [44, 80]) k.add("steelWorn", T(cylZ(1.7, -14.1, 14.1, { c: 0.3, seg: 12 }), { p: [x, -6.5, 0] }));
  const leaf = ctx.kit();
  leaf.add(M, extrudeZ([[AK.REAR_X, 36.4], [88, 33.6], [88, 36.2], [36, 39.4, 2], [AK.REAR_X, 39.8]], 17, { bevel: 0.5 }));
  const notch = [[-8.5, 35.2, 1], [8.5, 35.2, 1], [8.5, SY, 0.8], [1.5, SY, 0.2], [1.2, SY - 2.4, 0.5], [-1.2, SY - 2.4, 0.5], [-1.5, SY, 0.2], [-8.5, SY, 0.8]];
  leaf.add(M, extrudeX(notch, AK.REAR_X, AK.REAR_X + 3.4, { bevel: 0.3 }));
  leaf.add("steelWorn", extrudeZ([[58, 35.6], [70, 34.9], [70, 41.5, 1], [58, 42.2, 1]], 20, { bevel: 0.8 }));
  for (let i = 0; i < 4; i++) leaf.add("steelWorn", T(box(0.8, 5, 20.6, { bevel: 0.25 }), { p: [59.6 + i * 3, 38.8 - i * 0.18, 0] }));
  for (const s of [-1, 1]) {
    leaf.add("steelWorn", T(latheX([[0, 0], [0, 2.4], [0.8, 2.4], [1.6, 1.8], [1.8, 0]], { seg: 14 }), { r: [0, s > 0 ? -90 : 90, 0], p: [64, 38.4, s * 10] }));
  }
  for (let i = 0; i < 6; i++) leaf.add("paintWhite", T(box(0.6, 0.2, 3), { p: [40 + i * 7.5, 39.1 - i * 0.4, 5] }));
  const leafNode = leaf.build("rearLeaf");
  k.add(M, extrudeZ([[82, 16, 1], [90, 16, 1], [100, 30, 2], [95, 33, 2]], 3, { bevel: 0.6, z: 14.4 }));
  k.add(M, T(latheX([[0, 0], [0, 3.4], [2.4, 3.4], [3.4, 2.6], [3.6, 0]], { seg: 16 }), { r: [0, -90, 0], p: [86, 18, 13] }));
  k.add(M, T(cylX(AK.GAS_R, 92, 300, { c: 0.8, seg: 24 }), { p: [0, AK.GAS_Y, 0] }));
  k.add(M, T(cylX(AK.GAS_R + 0.8, 92, 100, { c: 0.6, seg: 24 }), { p: [0, AK.GAS_Y, 0] }));
  for (const x of [262, 271, 280]) for (const s of [-1, 1]) {
    k.add("lensBlack", T(cylZ(1.6, 0, 0.6, { seg: 12, c: 0.1 }), { p: [x, AK.GAS_Y, s > 0 ? AK.GAS_R - 0.35 : -AK.GAS_R - 0.25] }));
  }
  const gb = o.gas45 ? [[292, -9, 2], [322, -9, 2], [326, 2, 2], [313, 32, 4], [292, 32, 3]] : [[292, -9, 2], [328, -9, 2], [328, 10, 2], [324, 33, 4], [296, 33, 3], [292, 26]];
  k.add(M, extrudeZ(gb, 22, { bevel: 1.6 }));
  k.add(M, T(cylX(11.5, 290, 300, { c: 1, seg: 24 }), { p: [0, AK.GAS_Y, 0] }));
  k.add("steelWorn", T(cylZ(1.9, -11.2, 11.2, { c: 0.3, seg: 12 }), { p: [310, -3, 0] }));
  k.add(M, extrudeX(shape(rrect(0, -14, 10, 12, 2.4), [circle(0, -15, 3.3, 16)]), 298, 316, { bevel: 0.9 }));
  k.add(M, T(extrudeZ(rrect(310, 4, 16, 8, 2), 2, { bevel: 0.5 }), { p: [0, 0, -11.6] }));
  k.add(M, wire([[302, 4, -12], [302, 4, -18], [318, 4, -20], [318, 4, -12]], 1.8, { n: 30 }));
  k.add(M, extrudeZ([[364, -11, 2], [404, -11, 2], [404, 10, 2], [398, 18, 3], [370, 18, 3], [364, 10, 2]], 20, { bevel: 1.4 }));
  for (const s of [-1, 1]) k.add(M, extrudeZ([[372, 12], [396, 12], [394, 40, 3], [386, SY + 8, 4], [379, SY + 8, 3], [374, 38, 2]], 2.8, { bevel: 0.6, z: s * 7.4 }));
  k.add(M, extrudeZ(rrect(FX2, 19.4, 16, 3.4, 1), 11.4, { bevel: 0.6 }));
  k.add("steelWorn", T(cylY(4.3, 20.8, 26.6, { c: 0.5, seg: 20 }), { p: [FX2, 0, 0] }));
  for (let i = 0; i < 4; i++) k.add("steel", T(box(1.2, 2.2, 1.2, { bevel: 0.2 }), { p: [FX2 + 4 * Math.cos(i * Math.PI / 2 + 0.4), 25.6, 4 * Math.sin(i * Math.PI / 2 + 0.4)] }));
  k.add("steelWorn", cylY(1.9, 26, SY - 1.2, { seg: 12 }), { p: [FX2, 0, 0] });
  k.add("steelWorn", extrudeZ([[FX2 - 1.2, SY - 2], [FX2 + 1.2, SY - 2], [FX2 + 0.9, SY, 0.3], [FX2 - 0.9, SY, 0.3]], 2.2, { bevel: 0.2 }));
  for (const x of [369, 399]) k.add("steelWorn", T(cylZ(1.8, -10.2, 10.2, { c: 0.3, seg: 12 }), { p: [x, 2, 0] }));
  k.add("steelWorn", T(cylX(1.5, 403, 406.2, { c: 0.4, seg: 10 }), { p: [0, -6.5, 5.5] }));
  if (o.bayonet) {
    k.add(M, extrudeZ([[366, -10], [400, -10], [400, -16, 1.5], [396, -21, 2], [374, -21, 2], [368, -16, 3]], 11, { bevel: 1 }));
    for (const s of [-1, 1]) k.add("lensBlack", T(box(3, 5, 0.6, { bevel: 0.2 }), { p: [390, -16.5, s * 5.35] }));
  }
  k.add("steelWorn", T(cylX(3, 214, 402, { c: 0.6, seg: 12 }), { p: [0, -15, 0] }));
  k.add("steelWorn", T(latheX([[401, 0], [401, 3.6], [402, 4.2], [408.6, 4.2], [410, 2.8], [410, 0]], { seg: 16 }), { p: [0, -15, 0] }));
  k.add("lensBlack", T(cylZ(1.3, -4.3, 4.3, { seg: 10 }), { p: [405.6, -15, 0] }));
  return leafNode;
}
function triggerGroup(ctx, k, nodes, o) {
  const M = o.steel;
  const tgHole = [[-86, -26.5], [-146, -26.5], [-137, -40, 5], [-96, -42, 5], [-86, -33, 3]];
  const tg = shape([[-78, -24], [-152, -24], [-152, -30, 3], [-140, -44, 6], [-94, -46, 6], [-80, -36, 3]], [tgHole]);
  k.add(M, extrudeZ(tg, 10, { bevel: 0.8 }));
  const rib = shape([[-79.4, -25], [-150.8, -25], [-150.8, -30.4, 3], [-139.6, -44.9, 6], [-94.1, -46.9, 6], [-79.2, -36.4, 3]], [tgHole]);
  k.add(M, extrudeZ(rib, 3.6, { bevel: 0.9 }));
  k.add(M, extrudeZ([[-74.8, -25], [-81.5, -25], [-82.5, -31, 1], [-86.5, -40, 2], [-85.4, -44.6, 2.5], [-80.4, -43.8, 2], [-78.6, -38, 2], [-75.6, -31, 2]], 11, { bevel: 1 }));
  for (let i = 0; i < 4; i++) k.add(M, T(box(1.2, 0.8, 9, { bevel: 0.3 }), { p: [-86.5 + i * 0.12, -37.8 - i * 1.6, 0] }));
  k.add("steelWorn", T(cylZ(1.8, -6.4, 6.4, { c: 0.3, seg: 12 }), { p: [-78, -28.4, 0] }));
  const t = ctx.kit();
  t.add(M, extrudeZ([[-2, 3], [3, 3], [3, -6, 2], [0.4, -15, 4], [-3.4, -21.2, 2], [-5.4, -23, 1.2], [-7.2, -21.4, 1], [-5.6, -17, 3], [-3, -8, 3]], 6, { bevel: 1.1 }));
  nodes.trigger = node("trigger", [t.build()], { p: [-112, -18, 0] });
  const s = ctx.kit();
  const lever = [[-6, -3.6, 4], [40, -2.2, 10], [104, 0.4, 3], [116, 1.6, 2], [119.4, 5, 1.4], [119.4, 11.2, 1.4], [108, 12.6, 2], [60, 10.6, 20], [8, 7.2, 5], [-6, 5.6, 5]];
  s.add(M, extrudeZ(lever, 1.6, { bevel: 0.5, z: 16.1 }));
  s.add(M, extrudeZ([[10, 0.6, 1], [96, 3.2, 1], [96, 5.4, 1], [10, 3.8, 1]], 0.8, { bevel: 0.35, z: 17.1 }));
  s.add(M, extrudeY(shape([[104, 16.4, 0.5], [119.4, 16.4, 0.5], [119.4, 21.4, 2.4], [104, 21.4, 2.4]]), -0.4, 1.2, { bevel: 0.45 }));
  s.add(M, T(cylX(1.3, 104.3, 119.1, { c: 0.4, seg: 10 }), { p: [0, 0.6, 16.9] }));
  for (let i = 0; i < 4; i++) s.add(M, T(box(1, 0.7, 4, { bevel: 0.2 }), { p: [106.8 + i * 3.6, 1.3, 19.2] }));
  s.add(M, T(latheX([[15.1, 0], [15.1, 6.2], [15.6, 6.6], [17.4, 6.6], [18, 5.8], [18, 2.6], [18.6, 2.2], [18.6, 0]], { seg: 24 }), { r: [0, -90, 0] }));
  nodes.selector = node("selector", [s.build()], { p: [-178, 2, 0] });
  return [nodes.trigger, nodes.selector];
}
function akBase(ctx, o) {
  const k = ctx.kit();
  const nodes = {};
  receiver(ctx, k, o);
  const leaf = barrelAndGas(ctx, k, o);
  const trg = triggerGroup(ctx, k, nodes, o);
  const body = k.build("receiver");
  nodes.carrier = carrier(ctx, o);
  const root = node(o.id, [body, leaf, nodes.carrier, ...trg]);
  const { mount: mount2 } = ctx;
  root.add(mount2({ id: "hg", type: "hg", p: [0, 0, 0] }));
  root.add(mount2({ id: "cover", type: "cover", p: [0, 0, 0] }));
  root.add(mount2({ id: "dovetail", type: "dovetail", p: [-95, -2, -19], slots: 1, axis: "side" }));
  root.add(mount2({ id: "muzzle", type: "thread", p: [AK.MUZZLE, 0, 0] }));
  root.add(mount2({ id: "magwell", type: "magwell", p: [-4, AK.BOTTOM, 0], rock: [0, 0, 18] }));
  root.add(mount2({ id: "grip", type: "grip", p: [-150, AK.BOTTOM, 0] }));
  root.add(mount2({ id: "stock", type: "stock", p: [AK.REAR, 0, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 118, selector: { safe: 0, auto: -6.5, semi: -13 } },
    eject: { p: [-48, 6, 16], dir: [0.35, 0.45, 1] },
    muzzle: [AK.MUZZLE, 0, 0],
    irons: { rear: [AK.REAR_X + 2, AK.SIGHT_Y, 0], front: [AK.FRONT_X, AK.SIGHT_Y, 0] },
    eyeX: -262,
    focus: { center: [20, -30, 0], size: 900 }
  };
}
function uSec(hw, yb, yt, t = 3.2, n = 10) {
  const out = [], inn = [];
  const r = Math.min(hw, (yt - yb) * 0.6);
  out.push([-hw, yt]);
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + i / n * Math.PI;
    out.push([Math.cos(a) * hw, yb + r + Math.sin(a) * r]);
  }
  out.push([hw, yt]);
  const hi = hw - t, ri = r - t;
  inn.push([hi, yt]);
  for (let i = n; i >= 0; i--) {
    const a = Math.PI + i / n * Math.PI;
    inn.push([Math.cos(a) * hi, yb + t + ri + Math.sin(a) * ri]);
  }
  inn.push([-hi, yt]);
  return [...out, ...inn];
}
function upperSec(r, y0, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI;
    pts.push([Math.cos(a) * r, AK.GAS_Y + Math.sin(a) * r]);
  }
  pts.push([-r, y0], [r, y0]);
  return pts;
}
function smoothProf(key, n = 4) {
  const out = [];
  for (let i = 0; i < key.length - 1; i++) {
    const a = key[i], b = key[i + 1];
    for (let j = 0; j < n; j++) {
      const t = j / n, e = (1 - Math.cos(Math.PI * t)) / 2;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e]);
    }
  }
  out.push(key[key.length - 1]);
  return out;
}
function uPoint(hw, yb, yt, s, q) {
  const r = Math.min(hw, (yt - yb) * 0.6);
  if (q.y != null && q.y >= yb + r) return [s * hw, q.y, s, 0];
  const a = (q.a ?? 0) * Math.PI / 180;
  const nz = Math.cos(a) / hw, ny = -Math.sin(a) / r, l = Math.hypot(nz, ny);
  return [s * Math.cos(a) * hw, yb + r - Math.sin(a) * r, s * nz / l, ny / l];
}
function uRib(prof, yt, s, q, w = 1.8, h = 1.2, n = 10) {
  const xs = prof[0][0], xe = prof[prof.length - 1][0];
  const rings = prof.map(([x, hw, yb]) => {
    const [z, y, nz, ny] = uPoint(hw, yb, yt, s, q);
    const f = Math.max(0.04, Math.min(1, (x - xs) / 5, (xe - x) / 5));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / n * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      const dn = (c * h * 0.5 + h * 0.2) * f - h * 0.35 * (1 - f), dt = sn * w * 0.5 * Math.sqrt(f);
      pts.push([z + nz * dn - ny * dt, y + ny * dn + nz * dt]);
    }
    return { x, pts };
  });
  return loftX(rings, { crease: 60, flip: true });
}
function lowerStd(ctx, k, mat, o = {}) {
  const x0 = AK.FRONT + 2, x1 = 212, YT = 11;
  const key = o.paddle ? [[x0, 22, -22], [x0 + 20, 23.5, -23], [x0 + 55, 21, -22], [x0 + 80, 18.5, -21], [x1 - 10, 18.5, -20], [x1, 18, -19]] : o.ribs ? [[x0, 20.4, -22], [x0 + 40, 20.2, -22.2], [x1 - 22, 19.2, -21.4], [x1 - 9, 21, -24.4], [x1 - 4, 21, -24.4], [x1, 19.4, -21.4]] : [[x0, 20, -22], [x1 - 10, 19, -21], [x1, 18.5, -20]];
  const prof = smoothProf(key, 4);
  const rings = prof.map(([x, hw, yb]) => ({ x, pts: uSec(hw, yb, YT, 3.4, 12) }));
  k.add(mat, loftX(rings, { caps: false, flip: true }));
  k.add(mat, extrudeX(rings[0].pts, x0, x0 + 1.2, { bevel: 0.3 }));
  k.add(mat, extrudeX(rings[rings.length - 1].pts, x1 - 1.2, x1, { bevel: 0.3 }));
  k.add("steel", extrudeX(uSec(key[0][1] + 0.6, key[0][2] - 0.6, YT, 1.4, 12), x0 - 1, x0 + 5, { bevel: 0.4 }));
  if (o.ribs) {
    const rp = prof.filter(([x]) => x >= x0 + 12 && x <= x1 - 26);
    for (const s of [-1, 1]) {
      for (const y of [7.5, 3, -1.5]) k.add(mat, uRib(rp, YT, s, { y }));
      for (const a of [22, 44, 66]) k.add(mat, uRib(rp, YT, s, { a }));
    }
    for (const s of [-1, 1]) k.add(mat, uRib(prof.filter(([x]) => x >= x1 - 12 && x <= x1 - 3), YT, s, { a: 50 }, 1.2, 0.8));
  }
}
function upperStd(ctx, k, mat, o = {}) {
  k.add(mat, extrudeX(upperSec(13.2, 12), 100, 288, { bevel: 2 }));
  if (o.ribs) for (let i = 0; i < 5; i++) k.add(mat, T(T(cylX(1.3, 114, 278, { c: 1.2, seg: 10 }), { s: [1, 0.6, 1], p: [0, 13.1, 0] }), { r: [(i - 2) * 24, 0, 0] }).translate(0, AK.GAS_Y, 0));
  k.add("steel", extrudeX(upperSec(13.8, 11), 284, 292, { bevel: 0.8 }));
  k.add("steel", extrudeX(upperSec(13.6, 11.6), 99, 103, { bevel: 0.6 }));
}
function retainer(ctx, k) {
  k.add("steel", extrudeX(shape(uSec(20.2, -22.2, 12, 3, 10)), 208, 222, { bevel: 0.8 }));
  k.add("steel", T(latheX([[0, 0], [0, 3.2], [0.6, 3.2], [1.4, 2.4], [1.6, 0]], { seg: 16 }), { r: [0, -90, 0], p: [215, 4, 20] }));
  k.add("steel", extrudeZ([[212.2, 3, 2.4], [217.8, 3, 2.4], [217, 16, 2], [213.4, 16, 2]], 1.6, { bevel: 0.5, z: 21 }));
  k.add("steel", T(cylZ(3.6, -12, 12, { seg: 16 }), { p: [215, -15, 0] }));
}
function hgStd(ctx, o) {
  const k = ctx.kit();
  lowerStd(ctx, k, o.mat, o);
  upperStd(ctx, k, o.mat, o);
  retainer(ctx, k);
  return { root: k.build("hg_std") };
}
function hgB10(ctx) {
  const k = ctx.kit();
  const x0 = AK.FRONT + 2, x1 = 210;
  const sec = [[-21, 11, 1], [-22, -6, 3], [-15, -22, 5], [15, -22, 5], [22, -6, 3], [21, 11, 1], [18, 11], [18, -4], [12, -18], [-12, -18], [-18, -4], [-18, 11]];
  k.add("alu", extrudeX(sec, x0, x1, { bevel: 1 }));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) k.add("alu", T(box(20, 5, 2), { p: [x0 + 30 + i * 36, 4, s * 21.5] }));
  retainer(ctx, k);
  const mounts = [];
  const add = (id, face, rot, len, pos, base) => {
    const r = picatinny(len, { base });
    k.add("alu", r.geo, { r: rot, p: pos });
    const d = { top: [0, 1, 0], bottom: [0, -1, 0], left: [0, 0, -1], right: [0, 0, 1] }[face];
    mounts.push(ctx.railMount(id, [pos[0] + r.first, pos[1], pos[2]], face, r.slots, { axis: face }));
  };
  add("hgBottom", "bottom", [180, 0, 0], 120, [x1 - 126, -31, 0], 10);
  add("hgRight", "right", [90, 0, 0], 70, [x1 - 78, -2, 31], 9.5);
  add("hgLeft", "left", [-90, 0, 0], 70, [x1 - 78, -2, -31], 9.5);
  const top = AK.GAS_Y + 19.4;
  k.add("alu", extrudeX(shape([[-13, 12, 2], [13, 12, 2], [13, top - 9.4, 3], [-13, top - 9.4, 3]], [circle(0, AK.GAS_Y, 9.3, 24)]), 108, 250, { bevel: 1.2 }));
  const rr = picatinny(140, { base: 9.8 });
  k.add("alu", rr.geo, { p: [109, top, 0] });
  mounts.push(ctx.railMount("gasRail", [109 + rr.first, top, 0], "top", rr.slots, { axis: "top" }));
  for (const x of [130, 228]) k.add("steel", T(cylZ(2.8, 12.5, 14.5, { seg: 6 }), { p: [x, AK.GAS_Y + 4, 0] }));
  return { root: node("b10", [k.build(), ...mounts]) };
}
function hgZhukov(ctx, o) {
  const k = ctx.kit();
  const x0 = AK.FRONT + 2, x1 = 250;
  const low = [[-25, 12, 1], [-25, 0, 3], [-21, -18, 4], [-10, -25, 3], [10, -25, 3], [21, -18, 4], [25, 0, 3], [25, 12, 1], [21, 12], [21, 0], [17, -15], [8, -21], [-8, -21], [-17, -15], [-21, 0], [-21, 12]];
  const upp = [[-25, 12, 1], [25, 12, 1], [23, 32, 4], [12, 42, 3], [-12, 42, 3], [-23, 32, 4]];
  const holesSide = mlokHoles(x0 + 26, x1 - 10, 4, { h: 7, len: 32 });
  k.add(o.mat, extrudeX(low, x0, x1, { bevel: 1.6 }));
  k.add(o.mat, extrudeX(shape(upp, [circle(0, AK.GAS_Y, 10, 24)]), 98, x1, { bevel: 1.6 }));
  for (const h of holesSide) for (const s of [-1, 1]) k.add("lensBlack", extrudeZ(shape(h), 1, { bevel: 0.2, z: s * 24.6 }));
  for (const h of mlokHoles(x0 + 40, x1 - 10, 0, { h: 7 })) k.add("lensBlack", T(extrudeZ(shape(h), 1, { bevel: 0.2 }), { r: [90, 0, 0], p: [0, -24.6, 0] }));
  for (let i = 0; i < 5; i++) k.add(o.mat, T(box(22, 1.6, 20), { p: [118 + i * 26, 42, 0] }));
  const mounts = [];
  const sec = (id, face, rot, len, pos) => {
    const r = picatinny(len, { base: 4 });
    k.add("alu", r.geo, { r: rot, p: pos });
    mounts.push(ctx.railMount(id, [pos[0] + r.first, pos[1], pos[2]], face, r.slots, { axis: face }));
  };
  sec("hgBottom", "bottom", [180, 0, 0], 110, [x1 - 126, -29, 0]);
  sec("hgRight", "right", [90, 0, 0], 60, [x1 - 80, 4, 29]);
  sec("hgLeft", "left", [-90, 0, 0], 60, [x1 - 80, 4, -29]);
  return { root: node("zhukov", [k.build(), ...mounts]) };
}
function coverTWS(ctx, o) {
  const base = coverStd(ctx, { ...o, ribs: [-60, -30] });
  const k = ctx.kit();
  const top = 41;
  k.add("alu", extrudeX(shape([[-15, 20, 2], [15, 20, 2], [15, top - 9.4, 2], [-15, top - 9.4, 2]]), -206, 12, { bevel: 1 }));
  const r = picatinny(210, { base: 9.8 });
  k.add("alu", r.geo, { p: [-202, top, 0] });
  k.add("alu", extrudeX(shape([[-10, 22, 1], [10, 22, 1], [10, 32, 2], [-10, 32, 2]]), 10, 26, { bevel: 0.8 }));
  k.add("steel", T(cylZ(3, -12, 12, { seg: 16 }), { p: [20, 26, 0] }));
  k.add("steel", T(ctx.C.knob(6, 5, 16), { r: [0, 90, 0], p: [-210, 18, -16] }));
  const m = ctx.railMount("coverRail", [-202 + r.first, top, 0], "top", r.slots, { axis: "top" });
  return { root: node("tws", [base.root, k.build(), m]) };
}
function slantComp(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 10], [1, 10.6], [24, 10.6], [24, 5.2], [3, 5.2], [3, 0]], { seg: 28 }));
  k.add("steel", latheX([[23.5, 7.2], [23.5, 10.6], [33, 10.6], [34, 9.6], [34, 7.2]], { seg: 16, a0: 110, arc: 140 }));
  k.add("steel", flutesX(10.6, 2, 8, 2, 4, 0.5, { a0: 90 }));
  return { root: k.build("slant"), muzzle: { x: 30, kind: "comp", flash: 0.8 } };
}
function brake74(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 11.5], [1, 12.4], [60, 12.4], [62, 11.8], [80, 11.8], [81.5, 10.6], [81.5, 4], [78, 3.6], [78, 0]], { seg: 32 }));
  for (const s of [-1, 1]) {
    k.add("lensBlack", T(box(15, 12, 3), { p: [70, 0, s * 11] }));
    k.add("steel", extrudeZ([[62, -8, 1], [81, -8, 1], [81, 8, 1], [62, 8, 1]], 2.4, { bevel: 0.5, z: s * 12.8 }));
  }
  k.add("lensBlack", T(cylY(2.4, 9, 13, { seg: 12 }), { p: [48, 0, 0] }));
  k.add("lensBlack", T(cylY(2.4, 9, 13, { seg: 12 }), { p: [40, 0, 0] }));
  k.add("lensBlack", T(box(6, 3.4, 16), { p: [58, 11.2, 0] }));
  k.add("steel", T(cylZ(2.6, -13.4, 13.4, { seg: 12 }), { p: [16, -4, 0] }));
  return { root: k.build("brake74"), muzzle: { x: 82, kind: "brake", flash: 0.7 } };
}
function dtk1(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 13], [1.4, 14.5], [74, 14.5], [76, 13.4], [76, 5], [73, 4.6], [73, 0]], { seg: 36 }));
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.add("lensBlack", T(box(10, 13, 4, { bevel: 2 }), { p: [26 + i * 17, 0, s * 13.3] }));
  for (let i = 0; i < 3; i++) k.add("lensBlack", T(cylY(2.2, 11, 15, { seg: 12 }), { p: [24 + i * 17, 0, 0] }));
  k.add("steel", flutesX(14.5, 3, 12, 6, 3, 0.6));
  return { root: k.build("dtk1"), muzzle: { x: 76, kind: "brake", flash: 0.6 } };
}
function can(ctx, o) {
  const k = ctx.kit();
  const R4 = o.r, L = o.len;
  k.add("steel", latheX([[0, 0], [0, 10.5], [16, 10.5], [16, 0]], { seg: 24 }));
  k.add(o.mat, latheX([[8, 0], [8, R4 - 4], [12, R4], [L - 5, R4], [L, R4 - 4], [L, 5.2], [L - 3, 4.6], [L - 3, 0]], { seg: 44, crease: 30 }));
  if (o.fins) k.add(o.mat, flutesX(R4 - 0.4, 26, L - 18, o.fins, 3.2, 1.4));
  if (o.knurl) k.add(o.mat, ringGrooves(R4 + 0.3, 12, 30, 7, 0.5, { seg: 44 }));
  if (o.rings) for (const x of o.rings) k.add(o.mat, tubeX(R4 + 0.8, R4 - 0.2, x, x + 4, { seg: 44 }));
  k.add("lensBlack", cylX(5.2, L - 2.9, L + 0.05, { seg: 18 }));
  return { root: k.build(o.name), muzzle: { x: L, kind: "supp", flash: 0.04 } };
}
function threadCap(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 8.8], [14, 8.8], [16, 7.6], [16, 0]], { seg: 28 }));
  k.add("steel", flutesX(8.8, 2, 14, 14, 1.2, 0.5));
  return { root: k.build("cap"), muzzle: { x: 16, kind: "bare", flash: 1 } };
}
function akMag(ctx, o) {
  const k = ctx.kit(), rk = ctx.kit();
  const R4 = o.R, L = o.len, D0 = o.d0, D1 = o.d1, W = o.w;
  const cx = -D0 / 2 + R4, cy = 0;
  const n = 18, back = [], front = [];
  const ang0 = Math.PI;
  for (let i = 0; i <= n; i++) {
    const s = i / n * L;
    const a = ang0 + s / R4;
    const d = D0 + (D1 - D0) * (i / n);
    const px = cx + Math.cos(a) * R4, py = cy + Math.sin(a) * R4;
    const nx = Math.cos(a), ny = Math.sin(a);
    back.push([px + nx * d / 2 - D0 / 2 * 0, py + ny * d / 2]);
    front.push([px - nx * d / 2, py - ny * d / 2]);
  }
  const shiftX = -front[0][0], shiftY = 0;
  const P = [[front[0][0], 12], [back[0][0], 12], ...back.slice(1), ...front.slice().reverse()].map(([x, y]) => [x + shiftX, y + shiftY]);
  k.add(o.mat, extrudeZ(P.map((p) => [...p, 0]), W, { bevel: o.bevel ?? 1.2 }));
  const at = (i) => {
    const u = i / n, a = ang0 + u * L / R4;
    return { a, d: D0 + (D1 - D0) * u, x: cx + Math.cos(a) * R4 + shiftX, y: cy + Math.sin(a) * R4 };
  };
  const steel = o.mat.startsWith("steel");
  const lugM = steel ? o.mat : "steel";
  if (o.ribs) {
    const m = 4;
    for (let j = 1; j < m; j++) {
      const pts = [];
      for (let i = 1; i < n; i++) {
        const q = at(i), t = j / m - 0.5;
        pts.push([cx + Math.cos(q.a) * (R4 + t * q.d) + shiftX, Math.sin(q.a) * (R4 + t * q.d), 0]);
      }
      for (const s of [-1, 1]) k.add(o.ribMat || o.mat, T(wire(pts, 1.4, { n: 50, seg: 8 }), { s: [1, 1, 0.55] }).translate(0, 0, s * (W / 2 - 0.1)));
    }
    for (const s of [-1, 1]) k.add(o.mat, T(T(cylX(1.3, -(D0 - 10) / 2, (D0 - 10) / 2, { c: 1.1, seg: 10 }), { s: [1, 1, 0.5] }), { p: [-D0 / 2, -4, s * (W / 2 - 0.1)] }));
  }
  if (o.cross) for (let i = 2; i <= n - 2; i += 2) {
    const q = at(i), h = (q.d - 16) / 2;
    for (const sd of [-1, 1]) k.add(o.mat, T(T(cylX(2.6, -h, h, { c: 2.2, seg: 12 }), { s: [1, 1, 0.36] }), { r: [0, 0, q.a * 57.2958], p: [q.x, q.y, sd * (W / 2 - 0.1)] }));
  }
  if (steel) for (const edge of [back, front]) {
    const pts = edge.slice(1, n).map(([x, y], i) => {
      const q = at(i + 1), sg = edge === back ? 1 : -1;
      return [x + shiftX + sg * Math.cos(q.a) * 0.2, y + sg * Math.sin(q.a) * 0.2, 0];
    });
    k.add(o.mat, T(wire(pts, 1.6, { n: 50, seg: 8 }), { s: [1, 1, 1.4] }));
  }
  const endA = ang0 + L / R4;
  const ex = cx + Math.cos(endA) * R4 + shiftX, ey = cy + Math.sin(endA) * R4;
  const tx = -Math.sin(endA), ty = Math.cos(endA);
  const plateT = () => ({ r: [0, 0, endA * 57.2958], p: [ex + tx * 2, ey + ty * 2, 0] });
  const PM = o.plate || o.mat;
  k.add(PM, box(D1 + 7, 6, W + 3, { bevel: 1.6 }), plateT());
  for (const s of [-1, 1]) k.add(PM, T(box(D1 + 2, 5, 1.2, { bevel: 0.4 }), { p: [0, -4.4, s * (W / 2 + 0.7)] }), plateT());
  if (steel) {
    k.add(PM, T(box(D1 - 12, 1.4, 7, { bevel: 0.6 }), { p: [0, 3.2, 0] }), plateT());
    for (const x of [-(D1 / 2) + 8, D1 / 2 - 8]) k.add(PM, T(tubeX(2.8, 1.6, 0, 0.6, { seg: 16, c: 0.2 }), { r: [0, 0, 90], p: [x, 2.8, 0] }), plateT());
  } else {
    k.add("lensBlack", T(cylY(3.2, 2.9, 3.15, { seg: 16, c: 0.05 }), { p: [0, 0, 0] }), plateT());
    k.add("steel", T(cylY(2.2, 2.4, 3.1, { seg: 12, c: 0.3 }), { p: [0, 0, 0] }), plateT());
    k.add(PM, T(box(4, 7, W - 4, { bevel: 1.2 }), { p: [D1 / 2 + 3.5, 0.8, 0] }), plateT());
  }
  k.add(lugM, T(box(8, 6, W - 6, { bevel: 0.8 }), { p: [2, 8, 0] }));
  k.add(lugM, T(box(3.4, 6.4, W - 8, { bevel: 0.8 }), { p: [-D0 - 0.9, 2.4, 0] }));
  const cal = o.cal;
  ctx.C.feedLips(k, o.mat, -D0 + 6, -D0 + 42, 12, W / 2, { rise: 5.2, curl: 3.4 });
  ctx.C.cartridge(rk, cal, { p: [-D0 + 8, 13.5, -3.4], r: [0, 0, 3] });
  ctx.C.cartridge(rk, cal, { p: [-D0 + 8, 7, 3.4], r: [0, 0, 3] });
  const rounds = rk.build("rounds");
  return { root: node("mag", [k.build(), rounds]), mag: { cap: o.cap, rounds } };
}
function drum(ctx, o) {
  const k = ctx.kit(), rk = ctx.kit();
  const base = akMag(ctx, { ...o, len: 70, cross: false, ribs: false });
  k.add(o.mat, T(cylZ(66, -26, 26, { c: 5, seg: 48 }), { p: [-10, -120, 0] }));
  k.add(o.mat, T(cylZ(20, 26, 31, { c: 2, seg: 32 }), { p: [-10, -120, 0] }));
  k.add("steel", T(ctx.C.knob(10, 6, 16), { r: [0, -90, 0], p: [-10, -120, 30] }));
  for (let i = 0; i < 12; i++) for (const s of [-1, 1]) k.add(o.mat, T(box(2.4, 40, 1.6, { bevel: 0.5 }), { p: [-10, -120, s * 26.3], r: [0, 0, i * 30] }).translate(0, 0, 0));
  return { root: node("drum", [base.root, k.build()]), mag: { cap: o.cap, rounds: base.mag.rounds } };
}
function akGrip(ctx, o) {
  const k = ctx.kit();
  const a = (o.angle ?? 18) * Math.PI / 180;
  const sh = (y) => Math.tan(a) * y;
  const front = o.front.map(([f, y]) => [sh(y) + f, y]);
  const back = o.back.map(([f, y]) => [sh(y) + f, y]);
  const W = o.w ?? 30;
  const body = gripLoft(front, back, { w: W, k: 2.8, taper: 0.22, width: (t) => 0.9 + 0.1 * Math.sin(Math.PI * t) });
  k.add(o.mat, body);
  if (o.grooves) for (let i = 0; i < o.grooves; i++) for (const s of [-1, 1]) {
    k.add(o.mat, T(box(1.6, 58, 1.2, { bevel: 0.5 }), { p: [sh(-52) - 9 - i * 3.3, -52, s * (W / 2 * 0.93 - 0.3)], r: [0, 0, -o.angle] }));
  }
  if (o.texture) for (let i = 0; i < 9; i++) for (const s of [-1, 1]) k.add(o.mat, T(box(16, 1.2, 1.1, { bevel: 0.3 }), { p: [sh(-20 - i * 8.5) - 20, -20 - i * 8.5, s * (W / 2 * 0.9 - 0.2)], r: [0, 0, o.angle] }));
  if (o.cap) k.add("polySoft", T(box(34, 5, (o.w ?? 28) - 4, { bevel: 2 }), { p: [sh(-o.h) - 16, -o.h - 1, 0] }));
  k.add("steel", T(cylY(3, -o.h - 2, -o.h + 1, { seg: 12 }), { p: [sh(-o.h) - 14, 0, 0] }));
  return { root: k.build("pgrip") };
}
function stockLoft(prof, k = 3.4) {
  return loftX(prof.map(([x, cy, hh, hw]) => ({ x, pts: superEllipse(hw, hh, k, 28, cy, 0) })));
}
function grainAlong(g, dx, dy) {
  const l = Math.hypot(dx, dy), c = dx / l, s = dy / l;
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    uv.setXY(i, x * c + y * s, -x * s + y * c + z);
  }
  return g;
}
function slotScrew(k, x, y, z = 0, r = 3.2) {
  k.add("steelWorn", T(latheX([[0, 0], [0, r], [0.5, r - 0.1], [1.1, r * 0.75], [1.3, 0]], { seg: 16 }), { r: [0, 180, 0], p: [x, y, z] }));
  k.add("lensBlack", T(box(0.9, 0.8, r * 1.8, { bevel: 0.1 }), { p: [x - 1.05, y, z] }));
}
function stockAKM(ctx) {
  const k = ctx.kit();
  const prof = [[-2, -6, 18, 14.6], [-30, -12, 22, 16], [-80, -26, 34, 17.6], [-140, -42, 48, 19], [-196, -60, 60, 20.4], [-206, -63, 62, 20.6]];
  k.add("wood", grainAlong(stockLoft(prof), 204, 57));
  k.add("steel", extrudeX(shape(superEllipse(21, 63, 3.4, 28, -63, 0)), -212, -205, { bevel: 1.2 }));
  k.add("steel", extrudeX(shape(superEllipse(21.4, 63.4, 3.4, 28, -63, 0), [superEllipse(20.2, 62.2, 3.4, 28, -63, 0)]), -206, -202.5, { bevel: 0.5 }));
  const door = rrect(0, -80, 24, 44, 8);
  k.add("lensBlack", extrudeX(shape(rrect(0, -80, 25.2, 45.2, 8.4), [door]), -212.25, -211.8, { bevel: 0.05 }));
  k.add("steel", extrudeX(rrect(0, -80, 23.4, 43.4, 7.8), -212.7, -211.6, { bevel: 0.4 }));
  k.add("steelWorn", T(cylZ(1.5, -7, 7, { seg: 12, c: 0.3 }), { p: [-212.6, -57.2, 0] }));
  k.add("steel", T(tubeX(3.4, 2, 0, 0.5, { seg: 18, c: 0.15 }), { r: [0, 180, 0], p: [-212.6, -92, 0] }));
  for (const y of [-10, -116]) slotScrew(k, -212, y);
  k.add("steel", extrudeZ([[4, 6], [-30, -2, 2], [-30, -8, 2], [4, -2]], 12, { bevel: 0.6 }));
  k.add("steelWorn", T(latheX([[0, 0], [0, 3], [0.5, 2.9], [1.1, 2.2], [1.3, 0]], { seg: 16 }), { r: [0, 0, 90], p: [-22, 0.2, 0] }));
  k.add("lensBlack", T(box(5.4, 0.8, 0.9, { bevel: 0.1 }), { p: [-22, 1.3, 0], r: [0, 30, 0] }));
  k.add("steel", extrudeZ(rrect(-175, -64, 26, 9, 3), 1.6, { bevel: 0.4, z: -20.4 }));
  k.add("steel", wire([[-166, -64, -20], [-166, -64, -27], [-184, -64, -27], [-184, -64, -20]], 1.8, { n: 30 }));
  return { root: k.build("akm_wood"), cheek: { x: -60, y: 8 } };
}
function stockAK74M(ctx) {
  const k = ctx.kit();
  const prof = [[-10, -6, 18, 15], [-40, -13, 23, 16.5], [-90, -28, 36, 18], [-150, -44, 49, 19.4], [-205, -62, 60, 20.6], [-214, -64, 61, 20.6]];
  const f = ctx.kit();
  f.add("poly", stockLoft(prof, 3.8));
  const win = [[-50, -6], [-180, -31], [-180, -78], [-56, -27]];
  for (const s of [-1, 1]) {
    const t = { r: [0, s * 1.455, 0], p: [0, 0, 0] };
    f.add("polySoft", T(extrudeZ([[-50, -6, 6], [-180, -31, 10], [-180, -78, 10], [-56, -27, 6]], 1, { bevel: 0.3, z: s * 15.18 }), t));
    const loop = [];
    for (let i = 0; i < 4; i++) {
      const a = win[i], b = win[(i + 1) % 4];
      for (let j = 0; j < 6; j++) {
        const u = j / 6;
        loop.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, s * 15.33]);
      }
    }
    f.add("poly", T(wire(loop, 0.9, { closed: true, n: 120, seg: 6, tension: 0.2 }), t));
  }
  f.add("rubber", extrudeX(shape(superEllipse(21.4, 62, 3.8, 28, -64, 0)), -224, -213, { bevel: 2 }));
  for (let i = 0; i < 9; i++) f.add("rubber", T(cylZ(1.1, -18.5, 18.5, { seg: 8, c: 0.8 }), { p: [-224.4, -16 - i * 12, 0] }));
  f.add("poly", extrudeX(shape(superEllipse(21.2, 61.2, 3.8, 28, -64, 0)), -214, -211, { bevel: 0.8 }));
  f.add("steel", extrudeZ(rrect(-196, -64, 20, 8, 3), 1.6, { bevel: 0.4, z: -20.8 }));
  f.add("steel", wire([[-189, -64, -20.5], [-189, -64, -27], [-203, -64, -27], [-203, -64, -20.5]], 1.8, { n: 30 }));
  f.add("steel", extrudeX(rrect(0, -4, 30, 26, 3), -14, -1, { bevel: 1 }));
  f.add("steel", extrudeX(rrect(0, -4, 31.4, 27.4, 3.4), -16, -13, { bevel: 0.6 }));
  for (const y of [-14, 2]) f.add("steel", T(cylY(5.2, y, y + 7, { c: 0.6, seg: 18 }), { p: [0, 0, -22] }));
  const fold = node("fold", [f.build()]);
  k.add("steel", extrudeZ([[4, 10], [-4, 10], [-4, -22], [4, -22]], 12, { bevel: 1, z: -20 }));
  for (const y of [-21, -7, 9]) k.add("steel", T(cylY(5, y, y + (y === 9 ? 2 : 7), { c: 0.6, seg: 18 }), { p: [0, 0, -22] }));
  for (const [y, d] of [[11, 1], [-22, -1]]) k.add("steelWorn", T(latheX([[0, 0], [0, 3], [0.5, 2.9], [1, 2.2], [1.2, 0]], { seg: 14 }), { r: [0, 0, d * 90], p: [0, y, -22] }));
  k.add("steel", T(cylZ(5.4, -16.4, -14.9, { seg: 20, c: 0.4 }), { p: [12, 5, 0] }));
  k.add("steelWorn", T(ctx.C.knob(4.4, 3.4, 16), { r: [0, 90, 0], p: [12, 5, -16.2] }));
  fold.position.set(0, 0, -22);
  fold.children[0].position.set(0, 0, 22);
  return { root: node("ak74m_fold", [k.build(), fold]), fold: { node: fold, axis: "y", angle: -172 }, cheek: { x: -70, y: 8 } };
}
function stockUnder(ctx) {
  const k = ctx.kit();
  for (const s of [-1, 1]) {
    k.add("steel", extrudeZ([[0, 4, 2], [-10, 4], [-230, -30, 3], [-232, -40, 3], [-220, -40], [-10, -4], [0, -4]], 3, { bevel: 0.6, z: s * 11 }));
    k.add("steel", extrudeZ([[-12, -12], [-226, -90, 3], [-230, -96, 3], [-218, -96], [-12, -20]], 3, { bevel: 0.6, z: s * 11 }));
  }
  k.add("steel", extrudeZ([[-222, -28, 4], [-236, -30, 4], [-236, -104, 6], [-220, -100, 4]], 28, { bevel: 2 }));
  k.add("steel", T(cylZ(4, -13, 13, { seg: 16 }), { p: [-4, 0, 0] }));
  k.add("steel", T(cylZ(3, -13, 13, { seg: 14 }), { p: [-10, -16, 0] }));
  return { root: k.build("akms"), cheek: { x: -60, y: 6 } };
}
function stockPT(ctx, o) {
  const k = ctx.kit();
  k.add("steel", extrudeX(rrect(0, -2, 30, 34, 4), -30, 0, { bevel: 1.2 }));
  k.add("alu", T(cylX(14.6, -200, -28, { c: 1.2, seg: 32 }), { p: [0, 2, 0] }));
  k.add("steel", T(cylX(17.5, -38, -28, { c: 1, seg: 10 }), { p: [0, 2, 0] }));
  k.add("alu", extrudeX(rrect(0, -12.5, 9, 6, 1.5), -196, -40, { bevel: 0.6 }));
  const s = ctx.kit();
  const pro = shape(
    [[150, -17, 3], [150, 17, 4], [118, 20, 6], [36, 22, 8], [-8, 24, 4], [-8, -92, 5], [8, -92, 4], [100, -21, 10]],
    [[[92, -26, 3], [30, -26, 4], [8, -74, 4], [8, -30, 3]]]
  );
  s.add("poly", extrudeZ(pro, 36, { bevel: 3.5 }));
  s.add("poly", cylX(19, 60, 150, { c: 3, seg: 28 }));
  s.add("poly", extrudeZ([[96, -18, 2], [144, -18, 2], [144, -30, 3], [100, -28, 3]], 20, { bevel: 2 }));
  s.add("rubber", extrudeZ([[-8, 24, 3], [-22, 23, 4], [-22, -93, 4], [-8, -93, 3]], 38, { bevel: 3.5 }));
  for (let i = 0; i < 10; i++) s.add("rubber", T(box(1.6, 2.6, 34), { p: [-22.2, 16 - i * 11.5, 0] }));
  const st = node("ctr", [s.build()]);
  st.position.set(-235, 2, 0);
  let fold = null;
  const parts = [k.build(), st];
  if (o.folding) {
    const f = node("fold", parts.slice());
    fold = node("hinge", [f]);
    fold.position.set(0, 0, -22);
    f.position.set(0, 0, 22);
    return { root: node("pt", [fold]), fold: { node: fold, axis: "y", angle: -172 }, cheek: { x: -110, y: 22 } };
  }
  return { root: node("pt", parts), cheek: { x: -110, y: 22 } };
}
function akParts(v) {
  const is74 = v === "ak74";
  const thr = is74 ? "m24x1.5" : "m14x1L";
  const steel = "steel";
  const cal = is74 ? "545" : "762x39";
  const mag = (id, name, desc, stats, o) => ({ id, cat: "mag", name, desc, fit: { iface: [is74 ? "ak545" : "ak762"] }, stats, build: (c) => o.drum ? drum(c, o) : akMag(c, o) });
  const M762 = { R: 235, d0: 70, d1: 64, w: 27, cal: "762x39" };
  const M545 = { R: 330, d0: 66, d1: 60, w: 25.5, cal: "545" };
  const list = [
    // цевья
    is74 ? { id: "hg_74m", cat: "hg", name: "АК-74М, полимер", desc: "Штатные накладки из стеклонаполненного полиамида", stats: { weight: 240 }, build: (c) => hgStd(c, { mat: "poly", ribs: true }) } : { id: "hg_akm", cat: "hg", name: "АКМ, дерево", desc: "Клеёная берёза, «лопатки» у магазина", stats: { weight: 300 }, build: (c) => hgStd(c, { mat: "wood", paddle: true }) },
    { id: "hg_b10", cat: "hg", name: "Зенитко Б-10М + Б-33", desc: "Три планки снизу и по бокам + низкая планка на газовой трубке", stats: { weight: 390, ergo: 4 }, build: hgB10 },
    { id: "hg_zhukov", cat: "hg", name: "Magpul Zhukov-U", desc: "M-LOK, секции планок по бокам и снизу", stats: { weight: 280, ergo: 6 }, build: (c) => hgZhukov(c, { mat: is74 ? "poly" : "polyFde" }) },
    // крышки
    { id: "cover_std", cat: "cover", name: "Штатная крышка", desc: "Штампованная, с рёбрами жёсткости", stats: { weight: 180 }, build: (c) => coverStd(c, { steel }) },
    { id: "cover_tws", cat: "cover", name: "Крышка с планкой (TWS)", desc: "Жёсткая крышка на шарнире в колодке целика", stats: { weight: 290 }, build: (c) => coverTWS(c, { steel }) },
    // боковой кронштейн, ПСО-1, ПОСП и «Кобра» — общие, из engine/lib/dovetail.js
    // дульные
    is74 ? { id: "brake74", cat: "muzzle", name: "ДТК АК-74", desc: "Штатный двухкамерный дульный тормоз-компенсатор", fit: { thread: ["m24x1.5"] }, stats: { weight: 90, "recoilV%": -20, "recoilH%": -15, loud: 3, flash: 5 }, build: brake74 } : { id: "slant", cat: "muzzle", name: "Компенсатор АКМ", desc: "Штатный «косой срез»: гасит увод вверх-вправо", fit: { thread: ["m14x1L"] }, stats: { weight: 40, "recoilV%": -8, "recoilH%": -12, loud: 1, flash: 10 }, build: slantComp },
    { id: "dtk1", cat: "muzzle", name: "Зенитко ДТК-1", desc: "Трёхкамерный ДТК: сильно снижает отдачу, громче", fit: { thread: ["m14x1L", "m24x1.5"] }, stats: { weight: 190, length: 60, "recoilV%": -28, "recoilH%": -24, loud: 5, flash: 0 }, build: dtk1 },
    is74 ? { id: "pbs4", cat: "muzzle", name: "ПБС-4", desc: "Штатный глушитель к АК-74 (под патрон УС)", fit: { thread: ["m24x1.5"] }, stats: { weight: 480, length: 175, loud: -26, flash: -80, "recoilV%": -10, ergo: -8, adsTime: 25 }, build: (c) => can(c, { name: "pbs4", r: 17.5, len: 175, mat: "steel", knurl: true, rings: [60, 120] }) } : { id: "pbs1", cat: "muzzle", name: "ПБС-1", desc: "Классический глушитель к АКМ", fit: { thread: ["m14x1L"] }, stats: { weight: 520, length: 200, loud: -26, flash: -80, "recoilV%": -10, ergo: -9, adsTime: 25 }, build: (c) => can(c, { name: "pbs1", r: 17.5, len: 200, mat: "steel", knurl: true, rings: [70, 140] }) },
    { id: "rotor43", cat: "muzzle", name: "«Ротор-43»", desc: "Малогабаритный глушитель с оребрённым корпусом", fit: { thread: ["m14x1L", "m24x1.5"] }, stats: { weight: 430, length: 150, loud: -24, flash: -75, "recoilV%": -12, ergo: -6, adsTime: 20 }, build: (c) => can(c, { name: "rotor43", r: 21, len: 150, mat: "cast", fins: 16 }) },
    { id: "cap", cat: "muzzle", name: "Колпачок резьбы", desc: "Голый ствол: громко, яркая вспышка", fit: { thread: [thr] }, stats: { weight: 15, loud: 2, flash: 25, "recoilV%": 6 }, build: threadCap },
    // рукояти
    is74 ? { id: "grip_74m", cat: "pgrip", name: "АК-74М, полимер", desc: "Штатная рукоять", fit: { iface: ["ak"] }, stats: { weight: 70 }, build: (c) => akGrip(c, { mat: "poly", h: 100, front: [[2, 0], [0, -30], [1, -60], [-2, -100]], back: [[-36, 2], [-40, -8], [-39, -50], [-36, -80], [-37, -99]], angle: 17, grooves: 0, texture: true }) } : { id: "grip_akm", cat: "pgrip", name: "АКМ, бакелит", desc: "Рыжий бакелит с вертикальными рифами", fit: { iface: ["ak"] }, stats: { weight: 75 }, build: (c) => akGrip(c, { mat: "bakelite", h: 100, front: [[2, 0], [0, -40], [-1, -100]], back: [[-36, 2], [-41, -10], [-40, -50], [-37, -82], [-38, -99]], angle: 17, grooves: 7 }) },
    { id: "grip_rk3", cat: "pgrip", name: "Зенитко РК-3", desc: "Эргономичная, с упором под ладонь", fit: { iface: ["ak"] }, stats: { weight: 90, ergo: 5 }, build: (c) => akGrip(c, { mat: "poly", h: 104, front: [[2, 0], [0, -14], [5, -28], [0, -40], [-2, -104]], back: [[-34, 4], [-44, 0], [-42, -30], [-38, -70], [-38, -104]], angle: 16, texture: true, cap: true }) },
    { id: "grip_moe_ak", cat: "pgrip", name: "Magpul MOE AK", desc: "Полимерная, с отсеком в торце", fit: { iface: ["ak"] }, stats: { weight: 80, ergo: 3 }, build: (c) => akGrip(c, { mat: "polySoft", h: 102, front: [[1, 0], [0, -30], [2, -60], [0, -102]], back: [[-34, 3], [-40, -10], [-38, -60], [-37, -102]], angle: 20, texture: true, cap: true }) },
    // приклады
    is74 ? { id: "stock_74m", cat: "stock", name: "АК-74М, складной", desc: "Полимерный, складывается влево (K)", fit: { iface: ["ak"] }, stats: { weight: 360 }, build: stockAK74M } : { id: "stock_akm", cat: "stock", name: "АКМ, дерево", desc: "Клеёная берёза, стальной затыльник с пеналом", fit: { iface: ["ak"] }, stats: { weight: 480 }, build: stockAKM },
    is74 ? null : { id: "stock_akms", cat: "stock", name: "АКМС, складной вниз", desc: "Штампованный металлический приклад", fit: { iface: ["ak"] }, stats: { weight: 320, ergo: 4, "recoilV%": 8 }, build: stockUnder },
    { id: "stock_pt", cat: "stock", name: is74 ? "Зенитко ПТ-3 + Magpul CTR" : "Зенитко ПТ-1 + Magpul CTR", desc: "Переходник под трубу AR, телескопический приклад", fit: { iface: ["ak"] }, stats: { weight: 420, ergo: 6, "recoilV%": -6 }, build: (c) => stockPT(c, { folding: is74 }) }
  ].filter(Boolean);
  if (is74) {
    list.push(
      mag("mag545_plum", "Магазин 6Л23, «слива»", "Полимер, 30 патронов 5,45", { weight: 220, mag: 30 }, { ...M545, len: 150, mat: "polyPlum", cap: 30, ribs: true }),
      mag("mag545_black", "Магазин 6Л23, чёрный", "Полимер, 30 патронов", { weight: 220, mag: 30 }, { ...M545, len: 150, mat: "poly", cap: 30, ribs: true }),
      mag("mag545_45", "Магазин РПК-74, 45", "Удлинённый, 45 патронов", { weight: 320, mag: 45, ergo: -4, adsTime: 12 }, { ...M545, len: 210, mat: "polyPlum", cap: 45, ribs: true }),
      mag("mag545_drum", "Барабан 95 (РПК-74)", "Барабанный, 95 патронов", { weight: 1600, mag: 95, ergo: -12, adsTime: 35 }, { ...M545, mat: "poly", cap: 95, drum: true })
    );
  } else {
    list.push(
      mag("mag762_steel", "Магазин стальной, 30", "Штампованная сталь с рёбрами", { weight: 330, mag: 30 }, { ...M762, len: 158, mat: "steelPark", cap: 30, cross: true }),
      mag("mag762_bak", "Магазин бакелитовый, 30", "«Рыжий» АГ-4С", { weight: 250, mag: 30 }, { ...M762, len: 158, mat: "bakelite", cap: 30, ribs: true }),
      mag("mag762_pmag", "Magpul PMAG 30 AK", "Полимер, окно у затыльника", { weight: 240, mag: 30, ergo: 1 }, { ...M762, len: 158, mat: "poly", cap: 30, ribs: true, bevel: 1.8 }),
      mag("mag762_40", "Магазин РПК, 40", "Удлинённый, 40 патронов", { weight: 440, mag: 40, ergo: -4, adsTime: 12 }, { ...M762, len: 205, mat: "steelPark", cap: 40, cross: true }),
      mag("mag762_drum", "Барабан РПК, 75", "Барабанный, 75 патронов", { weight: 2100, mag: 75, ergo: -14, adsTime: 40 }, { ...M762, mat: "steelPark", cap: 75, drum: true })
    );
  }
  return list;
}
function akSlots() {
  const optRails = ["coverRail", "gasRail", "sideRail", "dovetail"];
  return [
    { id: "handguard", label: "Цевьё", group: "Цевьё и ствол", accepts: ["hg"], mount: "hg", required: true },
    { id: "muzzle", label: "Дульное устройство", group: "Цевьё и ствол", accepts: ["muzzle"], mount: "muzzle" },
    { id: "cover", label: "Крышка коробки", group: "Ствольная коробка", accepts: ["cover"], mount: "cover", required: true },
    { id: "sidemount", label: "Боковой кронштейн", group: "Оптика", accepts: ["sidemount"], rails: ["dovetail"] },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: optRails, prefer: { x: -60 } },
    { id: "magnifier", label: "Увеличитель", group: "Оптика", accepts: ["magnifier"], rails: optRails.slice(0, 3), prefer: "rear", behind: "optic" },
    { id: "offset", label: "Боковой коллиматор", group: "Оптика", accepts: ["offset"], rails: optRails.slice(0, 3), prefer: { x: 0 } },
    { id: "under", label: "Под стволом", group: "Тактика", accepts: ["foregrip", "bipod"], rails: ["hgBottom"], prefer: "front" },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgRight"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgLeft"], prefer: "front" },
    { id: "mag", label: "Магазин", group: "Ствольная коробка", accepts: ["mag"], mount: "magwell" },
    { id: "pgrip", label: "Пистолетная рукоять", group: "Ствольная коробка", accepts: ["pgrip"], mount: "grip", iface: "ak", required: true },
    { id: "stock", label: "Приклад", group: "Ствольная коробка", accepts: ["stock"], mount: "stock", iface: "ak" }
  ];
}

// ---- weapons/akm.js
var akm_default = {
  id: "akm",
  title: "Автомат Калашникова модернизированный",
  short: "АКМ",
  caliber: "7,62×39",
  cal: "762x39",
  thread: "m14x1L",
  boltHold: false,
  specs: [["Ствол", "415 мм"], ["Длина", "880 мм"], ["Темп", "600 выстр/мин"], ["Масса", "3,1 кг"]],
  base: { weight: 1950, length: 845, ergo: 44, recoilV: 118, recoilH: 112, moa: 3.2, velocity: 715, range: 350, loud: 161, flash: 75, adsTime: 300, rpm: 600, mag: 30 },
  audio: { cal: "762x39", mech: 1 },
  modes: ["safe", "auto", "semi"],
  build: (ctx) => akBase(ctx, { id: "akm", steel: "steel", dimples: true, gas45: false, bayonet: true }),
  slots: akSlots(),
  parts: akParts("akm"),
  defaults: {
    handguard: "hg_akm",
    muzzle: "slant",
    cover: "cover_std",
    sidemount: null,
    optic: null,
    magnifier: null,
    under: null,
    tacRight: null,
    tacLeft: null,
    mag: "mag762_steel",
    pgrip: "grip_akm",
    stock: "stock_akm"
  }
};

DEFS[akm_default.id] = akm_default; FAMILY[akm_default.id] = "B";
})();
(() => {
// ---- weapons/ak_common.js
var AK = {
  FRONT: 24,
  REAR: -223,
  // торцы ствольной коробки
  WALL: 11,
  BOTTOM: -24,
  // верх боковин и дно коробки
  GAS_Y: 23,
  GAS_R: 9,
  // ось газовой трубки
  SIGHT_Y: 44,
  // линия прицеливания (прорезь целика / вершина мушки)
  REAR_X: 30,
  FRONT_X: 386,
  // прорезь целика / мушка
  MUZZLE: 415
};
function receiver(ctx, k, o) {
  const M = o.steel;
  const { FRONT: F, REAR: R4, WALL: W, BOTTOM: B } = AK;
  const YB = B + 2, BR = 3.4;
  const MW0 = -73, MW1 = -1;
  const dimple = slot(-54, -20, -11, 11, 8);
  const holes = o.dimples ? [dimple] : [];
  const low = [[R4 + 9, YB, 3], [MW0, YB, 1], [MW0, B - 1.4, 1], [MW1, B - 1.4, 1], [MW1, YB, 1]];
  const right = [[F, YB, 1], [F, W], [-12, W], [-12, -1, 1], [-88, -1, 1], [-88, 7], [-206, 7], [-206, W], [R4, W], [R4, -15, 2], ...low];
  const left = [[F, YB, 1], [F, W], [R4, W], [R4, -15, 2], ...low];
  k.add(M, extrudeZ(shape(right, holes), 1.4, { bevel: 0.35, z: 14.3 }));
  k.add(M, extrudeZ(shape(left, holes), 1.4, { bevel: 0.35, z: -14.3 }));
  if (o.dimples) for (const s of [-1, 1]) k.add(M, extrudeZ(shape(dimple), 1.2, { bevel: 0.45, z: s * 13.9 }));
  const cz = 15 - BR;
  for (const [x0, x1] of [[R4 + 6, MW0], [MW1, F]]) {
    const slot2 = x0 < -100 ? [rrect(-114, 0, 18, 7, 2)] : [];
    k.add(M, extrudeY(shape(rrect((x0 + x1) / 2, 0, x1 - x0, cz * 2, 0.6), slot2), B - 1.4, B, { bevel: 0.3 }));
    for (const s of [-1, 1]) {
      const bend = [];
      for (let i = 0; i <= 8; i++) {
        const a = -(i / 8) * Math.PI / 2;
        bend.push([s * (cz + Math.cos(a) * BR), YB + Math.sin(a) * BR]);
      }
      for (let i = 8; i >= 0; i--) {
        const a = -(i / 8) * Math.PI / 2;
        bend.push([s * (cz + Math.cos(a) * (BR - 1.4)), YB + Math.sin(a) * (BR - 1.4)]);
      }
      k.add(M, extrudeX(bend, Math.max(x0, R4 + 9), x1, { bevel: 0.3 }));
    }
  }
  k.add("steel", extrudeX(rrect(0, (B + W) / 2 - 2, 26.6, W - B - 4, 1), 8, F, { bevel: 0.6 }));
  k.add("steel", extrudeX(rrect(0, (B + W) / 2 - 2, 26.6, W - B - 6, 1), R4, R4 + 14, { bevel: 0.6 }));
  k.add("lensBlack", extrudeX(rrect(0, -8, 26, 8, 0), -205, 6, { bevel: 0 }));
  for (const s of [-1, 1]) k.add(M, extrudeX(rrect(s * 13.6, W - 0.6, 3, 1.4, 0.4), R4, F, { bevel: 0.2 }));
  const head = () => latheX([[0, 0], [0, 2.4], [0.35, 2.3], [0.7, 2], [1, 1.4], [1.15, 0.7], [1.2, 0]], { seg: 16, crease: 70 });
  const rivets = [[4, -5], [16, -4], [3, -17], [15, -16], [-81, -13], [-90, -13], [-77, -19.5], [-150, -18], [-214, -3], [-214, -14], [-201, -9]];
  for (const s of [-1, 1]) for (const [x, y] of rivets) k.add(M, T(head(), { r: [0, s > 0 ? -90 : 90, 0], p: [x, y, s * 15] }));
  k.add("steelWorn", T(cylZ(2.5, -15.35, -14.6, { c: 0.25, seg: 16 }), { p: [9.5, -10.5, 0] }));
  for (const s of [-1, 1]) for (const [x, y] of [[-92, -17], [-112, -18]]) {
    k.add("steelWorn", T(latheX([[0, 0], [0, 2.7], [0.3, 2.8], [0.9, 2.8], [1.2, 2.4], [1.2, 0]], { seg: 16 }), { r: [0, s > 0 ? -90 : 90, 0], p: [x, y, s * 15] }));
  }
  k.add("steelWorn", T(latheX([[0, 0], [0, 4.2], [0.4, 4.4], [1.1, 4.4], [1.5, 3.6], [1.5, 1.4], [2.2, 1.2], [2.2, 0]], { seg: 20 }), { r: [0, 90, 0], p: [-178, 2, -15] }));
  k.add("spring", wire([[-92, -17, -16.3], [-101, -20, -16.5], [-112, -18, -16.3], [-132, -17, -16.2], [-158, -11, -16.2], [-174, -2, -16.2], [-178, 3.6, -16.4]], 0.8, { n: 70, seg: 6 }));
  for (const a of [0, -6.5, -13]) {
    const r = a * Math.PI / 180, lx = 123, ly = 0;
    const x = -178 + lx * Math.cos(r) - ly * Math.sin(r), y = 2 + lx * Math.sin(r) + ly * Math.cos(r);
    k.add(M, T(tubeX(1.7, 0.9, 0, 0.35, { seg: 14, c: 0.12 }), { r: [0, -90, 0], p: [x, y, 15] }));
  }
  k.add(M, T(extrudeX(shape([[-5, 0], [5, 0], [7, 3.2], [-7, 3.2]]), -150, -38, { bevel: 0.4 }), { r: [-90, 0, 0], p: [0, -2, -15.5] }));
  k.add(M, T(extrudeX(shape([[-7.4, 0], [7.4, 0], [7.4, 0.8], [-7.4, 0.8]]), -152, -36, { bevel: 0.3 }), { r: [-90, 0, 0], p: [0, -2, -15] }));
  for (const x of [-140, -94, -48]) k.add(M, T(latheX([[0, 0], [0, 2.3], [0.4, 2.1], [0.8, 1.2], [0.9, 0]], { seg: 14 }), { r: [0, 90, 0], p: [x, -2, -18.7] }));
}
function coverStd(ctx, o = {}) {
  const k = ctx.kit();
  const M = o.steel || "steel";
  const arc = (w, y0, y1, r, n = 14) => {
    const pts = [[w, y0]];
    const cy = y1 - r;
    pts.push([w, cy]);
    for (let i = 1; i < n; i++) {
      const a = i / n * Math.PI;
      pts.push([Math.cos(a) * w, cy + Math.sin(a) * r]);
    }
    pts.push([-w, cy], [-w, y0]);
    return pts;
  };
  const outer = arc(16.4, 11.4, 27.5, 12);
  const inner = arc(15.2, 11.4, 26.3, 11).reverse();
  const sec = [...outer, ...inner.map((p) => [p[0], p[1]])];
  k.add(M, extrudeX(sec, AK.REAR + 1, AK.FRONT + 4, { bevel: 0.3 }));
  const ribs = o.ribs || [-196, -170, -144, -118, -92, -66, -40];
  const bump = [[-4, 0], [-2.6, 0.3], [-1, 0.6], [1, 0.6], [2.6, 0.3], [4, 0]];
  for (const x of ribs) k.add(M, loftX(bump.map(([dx, d]) => ({ x: x + dx, pts: arc(16.4 + d, 13.2, 27.5 + d, 12 + d, 18) })), { crease: 70, flip: true }));
  for (const s of [-1, 1]) k.add(M, extrudeX(rrect(s * 15.2, 12, 2.4, 1.2, 0.4), AK.REAR + 2, AK.FRONT + 3, { bevel: 0.3 }));
  k.add(M, extrudeX(arc(16.4, 11.4, 27.5, 12), AK.REAR - 1, AK.REAR + 2, { bevel: 0.5 }));
  k.add("steelWorn", T(cylX(4.6, AK.REAR - 6, AK.REAR - 0.5, { c: 0.8, seg: 18 }), { p: [0, 17, 0] }));
  k.add("steelWorn", T(box(3, 3, 12), { p: [AK.REAR - 4, 13.5, 0] }));
  k.add("lensBlack", extrudeY(rrect(AK.REAR + 12, 0, 11, 7, 1.5), 26.9, 27.62, { bevel: 0.1 }));
  k.add("steelWorn", extrudeY(rrect(AK.REAR + 12.5, 0, 8.4, 5, 1), 24, 28.3, { bevel: 0.5 }));
  return { root: k.build("cover") };
}
function carrier(ctx, o) {
  const k = ctx.kit();
  k.add("steelBright", extrudeX(rrect(0, 12, 22, 15, 3), -150, 6, { bevel: 1 }));
  k.add("steelBright", extrudeX(rrect(0, 3, 20, 8, 2), -150, -30, { bevel: 0.8 }));
  k.add("steelWorn", cylX(8.8, -36, 0, { c: 0.8, seg: 24 }));
  k.add("steelWorn", T(box(10, 4, 5), { p: [-4, 7.5, 0] }));
  k.add("steelWorn", T(box(10, 4, 5), { p: [-4, -7.5, 0] }));
  k.add("steel", extrudeZ([[-24, 2], [-2, 2], [-2, 6], [-24, 6]], 2.2, { bevel: 0.4, z: 8.4 }));
  const hx = -88;
  k.add("steelBright", extrudeY(shape([[hx - 14, 10], [hx + 16, 10], [hx + 6, 20, 3], [hx - 10, 22, 3]]), 4, 10.5, { bevel: 0.8 }));
  k.add("steelBright", T(cylZ(3.6, 18, 26, { seg: 16 }), { p: [hx - 2, 7.5, 0] }));
  k.add("steelBright", T(latheX([[0, 0], [0, 5.2], [2, 6.4], [7, 6.4], [9.5, 4.4], [10.5, 0]], { seg: 20 }), { r: [0, -90, 0], p: [hx - 2, 7.5, 24] }));
  return node("carrier", [k.build()]);
}
function barrelAndGas(ctx, k, o) {
  const M = o.steel;
  const { MUZZLE, FRONT_X: FX2, SIGHT_Y: SY } = AK;
  k.add(M, latheX([[AK.FRONT - 6, 0], [AK.FRONT - 6, 12.5], [96, 12.5], [97, 12], [98, 11], [220, 10.2], [286, 9.6], [287, 9.4], [296, 9.4], [300, 9], [330, 8.8], [331.5, 8.5], [362, 8.4], [404, 8.2], [405, 7.2], [405.5, 6.6], [405.5, 0]], { seg: 32 }));
  k.add(M, latheX([[405.5, 3], [405.5, 7], [MUZZLE - 0.8, 7], [MUZZLE, 6.2], [MUZZLE, 3.6], [MUZZLE - 0.6, 3], [405.5, 3]], { seg: 28 }));
  k.add(M, extrudeZ([[AK.FRONT - 2, 6], [94, 6], [94, 27, 2], [89, 31, 2], [36, 32.4, 2], [AK.FRONT - 2, 31, 2]], 26, { bevel: 1.4 }));
  k.add(M, extrudeX(shape(circle(0, 0, 15, 24).map((p) => [p[0], p[1], 0])), AK.FRONT - 2, 94, { bevel: 1 }));
  const cam = [[34, 30], [92, 30]];
  for (let i = 6; i >= 0; i--) {
    const y = 35.4 - i * 0.38;
    cam.push([44 + 8 * i, y], [36 + 8 * i, y]);
  }
  for (const s of [-1, 1]) k.add(M, extrudeZ(cam, 4.2, { bevel: 0.4, z: s * 10.9 }));
  k.add("steelWorn", T(cylZ(1.8, -13.3, 13.3, { c: 0.3, seg: 12 }), { p: [89, 33.2, 0] }));
  for (const x of [44, 80]) k.add("steelWorn", T(cylZ(1.7, -14.1, 14.1, { c: 0.3, seg: 12 }), { p: [x, -6.5, 0] }));
  const leaf = ctx.kit();
  leaf.add(M, extrudeZ([[AK.REAR_X, 36.4], [88, 33.6], [88, 36.2], [36, 39.4, 2], [AK.REAR_X, 39.8]], 17, { bevel: 0.5 }));
  const notch = [[-8.5, 35.2, 1], [8.5, 35.2, 1], [8.5, SY, 0.8], [1.5, SY, 0.2], [1.2, SY - 2.4, 0.5], [-1.2, SY - 2.4, 0.5], [-1.5, SY, 0.2], [-8.5, SY, 0.8]];
  leaf.add(M, extrudeX(notch, AK.REAR_X, AK.REAR_X + 3.4, { bevel: 0.3 }));
  leaf.add("steelWorn", extrudeZ([[58, 35.6], [70, 34.9], [70, 41.5, 1], [58, 42.2, 1]], 20, { bevel: 0.8 }));
  for (let i = 0; i < 4; i++) leaf.add("steelWorn", T(box(0.8, 5, 20.6, { bevel: 0.25 }), { p: [59.6 + i * 3, 38.8 - i * 0.18, 0] }));
  for (const s of [-1, 1]) {
    leaf.add("steelWorn", T(latheX([[0, 0], [0, 2.4], [0.8, 2.4], [1.6, 1.8], [1.8, 0]], { seg: 14 }), { r: [0, s > 0 ? -90 : 90, 0], p: [64, 38.4, s * 10] }));
  }
  for (let i = 0; i < 6; i++) leaf.add("paintWhite", T(box(0.6, 0.2, 3), { p: [40 + i * 7.5, 39.1 - i * 0.4, 5] }));
  const leafNode = leaf.build("rearLeaf");
  k.add(M, extrudeZ([[82, 16, 1], [90, 16, 1], [100, 30, 2], [95, 33, 2]], 3, { bevel: 0.6, z: 14.4 }));
  k.add(M, T(latheX([[0, 0], [0, 3.4], [2.4, 3.4], [3.4, 2.6], [3.6, 0]], { seg: 16 }), { r: [0, -90, 0], p: [86, 18, 13] }));
  k.add(M, T(cylX(AK.GAS_R, 92, 300, { c: 0.8, seg: 24 }), { p: [0, AK.GAS_Y, 0] }));
  k.add(M, T(cylX(AK.GAS_R + 0.8, 92, 100, { c: 0.6, seg: 24 }), { p: [0, AK.GAS_Y, 0] }));
  for (const x of [262, 271, 280]) for (const s of [-1, 1]) {
    k.add("lensBlack", T(cylZ(1.6, 0, 0.6, { seg: 12, c: 0.1 }), { p: [x, AK.GAS_Y, s > 0 ? AK.GAS_R - 0.35 : -AK.GAS_R - 0.25] }));
  }
  const gb = o.gas45 ? [[292, -9, 2], [322, -9, 2], [326, 2, 2], [313, 32, 4], [292, 32, 3]] : [[292, -9, 2], [328, -9, 2], [328, 10, 2], [324, 33, 4], [296, 33, 3], [292, 26]];
  k.add(M, extrudeZ(gb, 22, { bevel: 1.6 }));
  k.add(M, T(cylX(11.5, 290, 300, { c: 1, seg: 24 }), { p: [0, AK.GAS_Y, 0] }));
  k.add("steelWorn", T(cylZ(1.9, -11.2, 11.2, { c: 0.3, seg: 12 }), { p: [310, -3, 0] }));
  k.add(M, extrudeX(shape(rrect(0, -14, 10, 12, 2.4), [circle(0, -15, 3.3, 16)]), 298, 316, { bevel: 0.9 }));
  k.add(M, T(extrudeZ(rrect(310, 4, 16, 8, 2), 2, { bevel: 0.5 }), { p: [0, 0, -11.6] }));
  k.add(M, wire([[302, 4, -12], [302, 4, -18], [318, 4, -20], [318, 4, -12]], 1.8, { n: 30 }));
  k.add(M, extrudeZ([[364, -11, 2], [404, -11, 2], [404, 10, 2], [398, 18, 3], [370, 18, 3], [364, 10, 2]], 20, { bevel: 1.4 }));
  for (const s of [-1, 1]) k.add(M, extrudeZ([[372, 12], [396, 12], [394, 40, 3], [386, SY + 8, 4], [379, SY + 8, 3], [374, 38, 2]], 2.8, { bevel: 0.6, z: s * 7.4 }));
  k.add(M, extrudeZ(rrect(FX2, 19.4, 16, 3.4, 1), 11.4, { bevel: 0.6 }));
  k.add("steelWorn", T(cylY(4.3, 20.8, 26.6, { c: 0.5, seg: 20 }), { p: [FX2, 0, 0] }));
  for (let i = 0; i < 4; i++) k.add("steel", T(box(1.2, 2.2, 1.2, { bevel: 0.2 }), { p: [FX2 + 4 * Math.cos(i * Math.PI / 2 + 0.4), 25.6, 4 * Math.sin(i * Math.PI / 2 + 0.4)] }));
  k.add("steelWorn", cylY(1.9, 26, SY - 1.2, { seg: 12 }), { p: [FX2, 0, 0] });
  k.add("steelWorn", extrudeZ([[FX2 - 1.2, SY - 2], [FX2 + 1.2, SY - 2], [FX2 + 0.9, SY, 0.3], [FX2 - 0.9, SY, 0.3]], 2.2, { bevel: 0.2 }));
  for (const x of [369, 399]) k.add("steelWorn", T(cylZ(1.8, -10.2, 10.2, { c: 0.3, seg: 12 }), { p: [x, 2, 0] }));
  k.add("steelWorn", T(cylX(1.5, 403, 406.2, { c: 0.4, seg: 10 }), { p: [0, -6.5, 5.5] }));
  if (o.bayonet) {
    k.add(M, extrudeZ([[366, -10], [400, -10], [400, -16, 1.5], [396, -21, 2], [374, -21, 2], [368, -16, 3]], 11, { bevel: 1 }));
    for (const s of [-1, 1]) k.add("lensBlack", T(box(3, 5, 0.6, { bevel: 0.2 }), { p: [390, -16.5, s * 5.35] }));
  }
  k.add("steelWorn", T(cylX(3, 214, 402, { c: 0.6, seg: 12 }), { p: [0, -15, 0] }));
  k.add("steelWorn", T(latheX([[401, 0], [401, 3.6], [402, 4.2], [408.6, 4.2], [410, 2.8], [410, 0]], { seg: 16 }), { p: [0, -15, 0] }));
  k.add("lensBlack", T(cylZ(1.3, -4.3, 4.3, { seg: 10 }), { p: [405.6, -15, 0] }));
  return leafNode;
}
function triggerGroup(ctx, k, nodes, o) {
  const M = o.steel;
  const tgHole = [[-86, -26.5], [-146, -26.5], [-137, -40, 5], [-96, -42, 5], [-86, -33, 3]];
  const tg = shape([[-78, -24], [-152, -24], [-152, -30, 3], [-140, -44, 6], [-94, -46, 6], [-80, -36, 3]], [tgHole]);
  k.add(M, extrudeZ(tg, 10, { bevel: 0.8 }));
  const rib = shape([[-79.4, -25], [-150.8, -25], [-150.8, -30.4, 3], [-139.6, -44.9, 6], [-94.1, -46.9, 6], [-79.2, -36.4, 3]], [tgHole]);
  k.add(M, extrudeZ(rib, 3.6, { bevel: 0.9 }));
  k.add(M, extrudeZ([[-74.8, -25], [-81.5, -25], [-82.5, -31, 1], [-86.5, -40, 2], [-85.4, -44.6, 2.5], [-80.4, -43.8, 2], [-78.6, -38, 2], [-75.6, -31, 2]], 11, { bevel: 1 }));
  for (let i = 0; i < 4; i++) k.add(M, T(box(1.2, 0.8, 9, { bevel: 0.3 }), { p: [-86.5 + i * 0.12, -37.8 - i * 1.6, 0] }));
  k.add("steelWorn", T(cylZ(1.8, -6.4, 6.4, { c: 0.3, seg: 12 }), { p: [-78, -28.4, 0] }));
  const t = ctx.kit();
  t.add(M, extrudeZ([[-2, 3], [3, 3], [3, -6, 2], [0.4, -15, 4], [-3.4, -21.2, 2], [-5.4, -23, 1.2], [-7.2, -21.4, 1], [-5.6, -17, 3], [-3, -8, 3]], 6, { bevel: 1.1 }));
  nodes.trigger = node("trigger", [t.build()], { p: [-112, -18, 0] });
  const s = ctx.kit();
  const lever = [[-6, -3.6, 4], [40, -2.2, 10], [104, 0.4, 3], [116, 1.6, 2], [119.4, 5, 1.4], [119.4, 11.2, 1.4], [108, 12.6, 2], [60, 10.6, 20], [8, 7.2, 5], [-6, 5.6, 5]];
  s.add(M, extrudeZ(lever, 1.6, { bevel: 0.5, z: 16.1 }));
  s.add(M, extrudeZ([[10, 0.6, 1], [96, 3.2, 1], [96, 5.4, 1], [10, 3.8, 1]], 0.8, { bevel: 0.35, z: 17.1 }));
  s.add(M, extrudeY(shape([[104, 16.4, 0.5], [119.4, 16.4, 0.5], [119.4, 21.4, 2.4], [104, 21.4, 2.4]]), -0.4, 1.2, { bevel: 0.45 }));
  s.add(M, T(cylX(1.3, 104.3, 119.1, { c: 0.4, seg: 10 }), { p: [0, 0.6, 16.9] }));
  for (let i = 0; i < 4; i++) s.add(M, T(box(1, 0.7, 4, { bevel: 0.2 }), { p: [106.8 + i * 3.6, 1.3, 19.2] }));
  s.add(M, T(latheX([[15.1, 0], [15.1, 6.2], [15.6, 6.6], [17.4, 6.6], [18, 5.8], [18, 2.6], [18.6, 2.2], [18.6, 0]], { seg: 24 }), { r: [0, -90, 0] }));
  nodes.selector = node("selector", [s.build()], { p: [-178, 2, 0] });
  return [nodes.trigger, nodes.selector];
}
function akBase(ctx, o) {
  const k = ctx.kit();
  const nodes = {};
  receiver(ctx, k, o);
  const leaf = barrelAndGas(ctx, k, o);
  const trg = triggerGroup(ctx, k, nodes, o);
  const body = k.build("receiver");
  nodes.carrier = carrier(ctx, o);
  const root = node(o.id, [body, leaf, nodes.carrier, ...trg]);
  const { mount: mount2 } = ctx;
  root.add(mount2({ id: "hg", type: "hg", p: [0, 0, 0] }));
  root.add(mount2({ id: "cover", type: "cover", p: [0, 0, 0] }));
  root.add(mount2({ id: "dovetail", type: "dovetail", p: [-95, -2, -19], slots: 1, axis: "side" }));
  root.add(mount2({ id: "muzzle", type: "thread", p: [AK.MUZZLE, 0, 0] }));
  root.add(mount2({ id: "magwell", type: "magwell", p: [-4, AK.BOTTOM, 0], rock: [0, 0, 18] }));
  root.add(mount2({ id: "grip", type: "grip", p: [-150, AK.BOTTOM, 0] }));
  root.add(mount2({ id: "stock", type: "stock", p: [AK.REAR, 0, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 118, selector: { safe: 0, auto: -6.5, semi: -13 } },
    eject: { p: [-48, 6, 16], dir: [0.35, 0.45, 1] },
    muzzle: [AK.MUZZLE, 0, 0],
    irons: { rear: [AK.REAR_X + 2, AK.SIGHT_Y, 0], front: [AK.FRONT_X, AK.SIGHT_Y, 0] },
    eyeX: -262,
    focus: { center: [20, -30, 0], size: 900 }
  };
}
function uSec(hw, yb, yt, t = 3.2, n = 10) {
  const out = [], inn = [];
  const r = Math.min(hw, (yt - yb) * 0.6);
  out.push([-hw, yt]);
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + i / n * Math.PI;
    out.push([Math.cos(a) * hw, yb + r + Math.sin(a) * r]);
  }
  out.push([hw, yt]);
  const hi = hw - t, ri = r - t;
  inn.push([hi, yt]);
  for (let i = n; i >= 0; i--) {
    const a = Math.PI + i / n * Math.PI;
    inn.push([Math.cos(a) * hi, yb + t + ri + Math.sin(a) * ri]);
  }
  inn.push([-hi, yt]);
  return [...out, ...inn];
}
function upperSec(r, y0, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI;
    pts.push([Math.cos(a) * r, AK.GAS_Y + Math.sin(a) * r]);
  }
  pts.push([-r, y0], [r, y0]);
  return pts;
}
function smoothProf(key, n = 4) {
  const out = [];
  for (let i = 0; i < key.length - 1; i++) {
    const a = key[i], b = key[i + 1];
    for (let j = 0; j < n; j++) {
      const t = j / n, e = (1 - Math.cos(Math.PI * t)) / 2;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e]);
    }
  }
  out.push(key[key.length - 1]);
  return out;
}
function uPoint(hw, yb, yt, s, q) {
  const r = Math.min(hw, (yt - yb) * 0.6);
  if (q.y != null && q.y >= yb + r) return [s * hw, q.y, s, 0];
  const a = (q.a ?? 0) * Math.PI / 180;
  const nz = Math.cos(a) / hw, ny = -Math.sin(a) / r, l = Math.hypot(nz, ny);
  return [s * Math.cos(a) * hw, yb + r - Math.sin(a) * r, s * nz / l, ny / l];
}
function uRib(prof, yt, s, q, w = 1.8, h = 1.2, n = 10) {
  const xs = prof[0][0], xe = prof[prof.length - 1][0];
  const rings = prof.map(([x, hw, yb]) => {
    const [z, y, nz, ny] = uPoint(hw, yb, yt, s, q);
    const f = Math.max(0.04, Math.min(1, (x - xs) / 5, (xe - x) / 5));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / n * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      const dn = (c * h * 0.5 + h * 0.2) * f - h * 0.35 * (1 - f), dt = sn * w * 0.5 * Math.sqrt(f);
      pts.push([z + nz * dn - ny * dt, y + ny * dn + nz * dt]);
    }
    return { x, pts };
  });
  return loftX(rings, { crease: 60, flip: true });
}
function lowerStd(ctx, k, mat, o = {}) {
  const x0 = AK.FRONT + 2, x1 = 212, YT = 11;
  const key = o.paddle ? [[x0, 22, -22], [x0 + 20, 23.5, -23], [x0 + 55, 21, -22], [x0 + 80, 18.5, -21], [x1 - 10, 18.5, -20], [x1, 18, -19]] : o.ribs ? [[x0, 20.4, -22], [x0 + 40, 20.2, -22.2], [x1 - 22, 19.2, -21.4], [x1 - 9, 21, -24.4], [x1 - 4, 21, -24.4], [x1, 19.4, -21.4]] : [[x0, 20, -22], [x1 - 10, 19, -21], [x1, 18.5, -20]];
  const prof = smoothProf(key, 4);
  const rings = prof.map(([x, hw, yb]) => ({ x, pts: uSec(hw, yb, YT, 3.4, 12) }));
  k.add(mat, loftX(rings, { caps: false, flip: true }));
  k.add(mat, extrudeX(rings[0].pts, x0, x0 + 1.2, { bevel: 0.3 }));
  k.add(mat, extrudeX(rings[rings.length - 1].pts, x1 - 1.2, x1, { bevel: 0.3 }));
  k.add("steel", extrudeX(uSec(key[0][1] + 0.6, key[0][2] - 0.6, YT, 1.4, 12), x0 - 1, x0 + 5, { bevel: 0.4 }));
  if (o.ribs) {
    const rp = prof.filter(([x]) => x >= x0 + 12 && x <= x1 - 26);
    for (const s of [-1, 1]) {
      for (const y of [7.5, 3, -1.5]) k.add(mat, uRib(rp, YT, s, { y }));
      for (const a of [22, 44, 66]) k.add(mat, uRib(rp, YT, s, { a }));
    }
    for (const s of [-1, 1]) k.add(mat, uRib(prof.filter(([x]) => x >= x1 - 12 && x <= x1 - 3), YT, s, { a: 50 }, 1.2, 0.8));
  }
}
function upperStd(ctx, k, mat, o = {}) {
  k.add(mat, extrudeX(upperSec(13.2, 12), 100, 288, { bevel: 2 }));
  if (o.ribs) for (let i = 0; i < 5; i++) k.add(mat, T(T(cylX(1.3, 114, 278, { c: 1.2, seg: 10 }), { s: [1, 0.6, 1], p: [0, 13.1, 0] }), { r: [(i - 2) * 24, 0, 0] }).translate(0, AK.GAS_Y, 0));
  k.add("steel", extrudeX(upperSec(13.8, 11), 284, 292, { bevel: 0.8 }));
  k.add("steel", extrudeX(upperSec(13.6, 11.6), 99, 103, { bevel: 0.6 }));
}
function retainer(ctx, k) {
  k.add("steel", extrudeX(shape(uSec(20.2, -22.2, 12, 3, 10)), 208, 222, { bevel: 0.8 }));
  k.add("steel", T(latheX([[0, 0], [0, 3.2], [0.6, 3.2], [1.4, 2.4], [1.6, 0]], { seg: 16 }), { r: [0, -90, 0], p: [215, 4, 20] }));
  k.add("steel", extrudeZ([[212.2, 3, 2.4], [217.8, 3, 2.4], [217, 16, 2], [213.4, 16, 2]], 1.6, { bevel: 0.5, z: 21 }));
  k.add("steel", T(cylZ(3.6, -12, 12, { seg: 16 }), { p: [215, -15, 0] }));
}
function hgStd(ctx, o) {
  const k = ctx.kit();
  lowerStd(ctx, k, o.mat, o);
  upperStd(ctx, k, o.mat, o);
  retainer(ctx, k);
  return { root: k.build("hg_std") };
}
function hgB10(ctx) {
  const k = ctx.kit();
  const x0 = AK.FRONT + 2, x1 = 210;
  const sec = [[-21, 11, 1], [-22, -6, 3], [-15, -22, 5], [15, -22, 5], [22, -6, 3], [21, 11, 1], [18, 11], [18, -4], [12, -18], [-12, -18], [-18, -4], [-18, 11]];
  k.add("alu", extrudeX(sec, x0, x1, { bevel: 1 }));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) k.add("alu", T(box(20, 5, 2), { p: [x0 + 30 + i * 36, 4, s * 21.5] }));
  retainer(ctx, k);
  const mounts = [];
  const add = (id, face, rot, len, pos, base) => {
    const r = picatinny(len, { base });
    k.add("alu", r.geo, { r: rot, p: pos });
    const d = { top: [0, 1, 0], bottom: [0, -1, 0], left: [0, 0, -1], right: [0, 0, 1] }[face];
    mounts.push(ctx.railMount(id, [pos[0] + r.first, pos[1], pos[2]], face, r.slots, { axis: face }));
  };
  add("hgBottom", "bottom", [180, 0, 0], 120, [x1 - 126, -31, 0], 10);
  add("hgRight", "right", [90, 0, 0], 70, [x1 - 78, -2, 31], 9.5);
  add("hgLeft", "left", [-90, 0, 0], 70, [x1 - 78, -2, -31], 9.5);
  const top = AK.GAS_Y + 19.4;
  k.add("alu", extrudeX(shape([[-13, 12, 2], [13, 12, 2], [13, top - 9.4, 3], [-13, top - 9.4, 3]], [circle(0, AK.GAS_Y, 9.3, 24)]), 108, 250, { bevel: 1.2 }));
  const rr = picatinny(140, { base: 9.8 });
  k.add("alu", rr.geo, { p: [109, top, 0] });
  mounts.push(ctx.railMount("gasRail", [109 + rr.first, top, 0], "top", rr.slots, { axis: "top" }));
  for (const x of [130, 228]) k.add("steel", T(cylZ(2.8, 12.5, 14.5, { seg: 6 }), { p: [x, AK.GAS_Y + 4, 0] }));
  return { root: node("b10", [k.build(), ...mounts]) };
}
function hgZhukov(ctx, o) {
  const k = ctx.kit();
  const x0 = AK.FRONT + 2, x1 = 250;
  const low = [[-25, 12, 1], [-25, 0, 3], [-21, -18, 4], [-10, -25, 3], [10, -25, 3], [21, -18, 4], [25, 0, 3], [25, 12, 1], [21, 12], [21, 0], [17, -15], [8, -21], [-8, -21], [-17, -15], [-21, 0], [-21, 12]];
  const upp = [[-25, 12, 1], [25, 12, 1], [23, 32, 4], [12, 42, 3], [-12, 42, 3], [-23, 32, 4]];
  const holesSide = mlokHoles(x0 + 26, x1 - 10, 4, { h: 7, len: 32 });
  k.add(o.mat, extrudeX(low, x0, x1, { bevel: 1.6 }));
  k.add(o.mat, extrudeX(shape(upp, [circle(0, AK.GAS_Y, 10, 24)]), 98, x1, { bevel: 1.6 }));
  for (const h of holesSide) for (const s of [-1, 1]) k.add("lensBlack", extrudeZ(shape(h), 1, { bevel: 0.2, z: s * 24.6 }));
  for (const h of mlokHoles(x0 + 40, x1 - 10, 0, { h: 7 })) k.add("lensBlack", T(extrudeZ(shape(h), 1, { bevel: 0.2 }), { r: [90, 0, 0], p: [0, -24.6, 0] }));
  for (let i = 0; i < 5; i++) k.add(o.mat, T(box(22, 1.6, 20), { p: [118 + i * 26, 42, 0] }));
  const mounts = [];
  const sec = (id, face, rot, len, pos) => {
    const r = picatinny(len, { base: 4 });
    k.add("alu", r.geo, { r: rot, p: pos });
    mounts.push(ctx.railMount(id, [pos[0] + r.first, pos[1], pos[2]], face, r.slots, { axis: face }));
  };
  sec("hgBottom", "bottom", [180, 0, 0], 110, [x1 - 126, -29, 0]);
  sec("hgRight", "right", [90, 0, 0], 60, [x1 - 80, 4, 29]);
  sec("hgLeft", "left", [-90, 0, 0], 60, [x1 - 80, 4, -29]);
  return { root: node("zhukov", [k.build(), ...mounts]) };
}
function coverTWS(ctx, o) {
  const base = coverStd(ctx, { ...o, ribs: [-60, -30] });
  const k = ctx.kit();
  const top = 41;
  k.add("alu", extrudeX(shape([[-15, 20, 2], [15, 20, 2], [15, top - 9.4, 2], [-15, top - 9.4, 2]]), -206, 12, { bevel: 1 }));
  const r = picatinny(210, { base: 9.8 });
  k.add("alu", r.geo, { p: [-202, top, 0] });
  k.add("alu", extrudeX(shape([[-10, 22, 1], [10, 22, 1], [10, 32, 2], [-10, 32, 2]]), 10, 26, { bevel: 0.8 }));
  k.add("steel", T(cylZ(3, -12, 12, { seg: 16 }), { p: [20, 26, 0] }));
  k.add("steel", T(ctx.C.knob(6, 5, 16), { r: [0, 90, 0], p: [-210, 18, -16] }));
  const m = ctx.railMount("coverRail", [-202 + r.first, top, 0], "top", r.slots, { axis: "top" });
  return { root: node("tws", [base.root, k.build(), m]) };
}
function slantComp(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 10], [1, 10.6], [24, 10.6], [24, 5.2], [3, 5.2], [3, 0]], { seg: 28 }));
  k.add("steel", latheX([[23.5, 7.2], [23.5, 10.6], [33, 10.6], [34, 9.6], [34, 7.2]], { seg: 16, a0: 110, arc: 140 }));
  k.add("steel", flutesX(10.6, 2, 8, 2, 4, 0.5, { a0: 90 }));
  return { root: k.build("slant"), muzzle: { x: 30, kind: "comp", flash: 0.8 } };
}
function brake74(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 11.5], [1, 12.4], [60, 12.4], [62, 11.8], [80, 11.8], [81.5, 10.6], [81.5, 4], [78, 3.6], [78, 0]], { seg: 32 }));
  for (const s of [-1, 1]) {
    k.add("lensBlack", T(box(15, 12, 3), { p: [70, 0, s * 11] }));
    k.add("steel", extrudeZ([[62, -8, 1], [81, -8, 1], [81, 8, 1], [62, 8, 1]], 2.4, { bevel: 0.5, z: s * 12.8 }));
  }
  k.add("lensBlack", T(cylY(2.4, 9, 13, { seg: 12 }), { p: [48, 0, 0] }));
  k.add("lensBlack", T(cylY(2.4, 9, 13, { seg: 12 }), { p: [40, 0, 0] }));
  k.add("lensBlack", T(box(6, 3.4, 16), { p: [58, 11.2, 0] }));
  k.add("steel", T(cylZ(2.6, -13.4, 13.4, { seg: 12 }), { p: [16, -4, 0] }));
  return { root: k.build("brake74"), muzzle: { x: 82, kind: "brake", flash: 0.7 } };
}
function dtk1(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 13], [1.4, 14.5], [74, 14.5], [76, 13.4], [76, 5], [73, 4.6], [73, 0]], { seg: 36 }));
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.add("lensBlack", T(box(10, 13, 4, { bevel: 2 }), { p: [26 + i * 17, 0, s * 13.3] }));
  for (let i = 0; i < 3; i++) k.add("lensBlack", T(cylY(2.2, 11, 15, { seg: 12 }), { p: [24 + i * 17, 0, 0] }));
  k.add("steel", flutesX(14.5, 3, 12, 6, 3, 0.6));
  return { root: k.build("dtk1"), muzzle: { x: 76, kind: "brake", flash: 0.6 } };
}
function can(ctx, o) {
  const k = ctx.kit();
  const R4 = o.r, L = o.len;
  k.add("steel", latheX([[0, 0], [0, 10.5], [16, 10.5], [16, 0]], { seg: 24 }));
  k.add(o.mat, latheX([[8, 0], [8, R4 - 4], [12, R4], [L - 5, R4], [L, R4 - 4], [L, 5.2], [L - 3, 4.6], [L - 3, 0]], { seg: 44, crease: 30 }));
  if (o.fins) k.add(o.mat, flutesX(R4 - 0.4, 26, L - 18, o.fins, 3.2, 1.4));
  if (o.knurl) k.add(o.mat, ringGrooves(R4 + 0.3, 12, 30, 7, 0.5, { seg: 44 }));
  if (o.rings) for (const x of o.rings) k.add(o.mat, tubeX(R4 + 0.8, R4 - 0.2, x, x + 4, { seg: 44 }));
  k.add("lensBlack", cylX(5.2, L - 2.9, L + 0.05, { seg: 18 }));
  return { root: k.build(o.name), muzzle: { x: L, kind: "supp", flash: 0.04 } };
}
function threadCap(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 8.8], [14, 8.8], [16, 7.6], [16, 0]], { seg: 28 }));
  k.add("steel", flutesX(8.8, 2, 14, 14, 1.2, 0.5));
  return { root: k.build("cap"), muzzle: { x: 16, kind: "bare", flash: 1 } };
}
function akMag(ctx, o) {
  const k = ctx.kit(), rk = ctx.kit();
  const R4 = o.R, L = o.len, D0 = o.d0, D1 = o.d1, W = o.w;
  const cx = -D0 / 2 + R4, cy = 0;
  const n = 18, back = [], front = [];
  const ang0 = Math.PI;
  for (let i = 0; i <= n; i++) {
    const s = i / n * L;
    const a = ang0 + s / R4;
    const d = D0 + (D1 - D0) * (i / n);
    const px = cx + Math.cos(a) * R4, py = cy + Math.sin(a) * R4;
    const nx = Math.cos(a), ny = Math.sin(a);
    back.push([px + nx * d / 2 - D0 / 2 * 0, py + ny * d / 2]);
    front.push([px - nx * d / 2, py - ny * d / 2]);
  }
  const shiftX = -front[0][0], shiftY = 0;
  const P = [[front[0][0], 12], [back[0][0], 12], ...back.slice(1), ...front.slice().reverse()].map(([x, y]) => [x + shiftX, y + shiftY]);
  k.add(o.mat, extrudeZ(P.map((p) => [...p, 0]), W, { bevel: o.bevel ?? 1.2 }));
  const at = (i) => {
    const u = i / n, a = ang0 + u * L / R4;
    return { a, d: D0 + (D1 - D0) * u, x: cx + Math.cos(a) * R4 + shiftX, y: cy + Math.sin(a) * R4 };
  };
  const steel = o.mat.startsWith("steel");
  const lugM = steel ? o.mat : "steel";
  if (o.ribs) {
    const m = 4;
    for (let j = 1; j < m; j++) {
      const pts = [];
      for (let i = 1; i < n; i++) {
        const q = at(i), t = j / m - 0.5;
        pts.push([cx + Math.cos(q.a) * (R4 + t * q.d) + shiftX, Math.sin(q.a) * (R4 + t * q.d), 0]);
      }
      for (const s of [-1, 1]) k.add(o.ribMat || o.mat, T(wire(pts, 1.4, { n: 50, seg: 8 }), { s: [1, 1, 0.55] }).translate(0, 0, s * (W / 2 - 0.1)));
    }
    for (const s of [-1, 1]) k.add(o.mat, T(T(cylX(1.3, -(D0 - 10) / 2, (D0 - 10) / 2, { c: 1.1, seg: 10 }), { s: [1, 1, 0.5] }), { p: [-D0 / 2, -4, s * (W / 2 - 0.1)] }));
  }
  if (o.cross) for (let i = 2; i <= n - 2; i += 2) {
    const q = at(i), h = (q.d - 16) / 2;
    for (const sd of [-1, 1]) k.add(o.mat, T(T(cylX(2.6, -h, h, { c: 2.2, seg: 12 }), { s: [1, 1, 0.36] }), { r: [0, 0, q.a * 57.2958], p: [q.x, q.y, sd * (W / 2 - 0.1)] }));
  }
  if (steel) for (const edge of [back, front]) {
    const pts = edge.slice(1, n).map(([x, y], i) => {
      const q = at(i + 1), sg = edge === back ? 1 : -1;
      return [x + shiftX + sg * Math.cos(q.a) * 0.2, y + sg * Math.sin(q.a) * 0.2, 0];
    });
    k.add(o.mat, T(wire(pts, 1.6, { n: 50, seg: 8 }), { s: [1, 1, 1.4] }));
  }
  const endA = ang0 + L / R4;
  const ex = cx + Math.cos(endA) * R4 + shiftX, ey = cy + Math.sin(endA) * R4;
  const tx = -Math.sin(endA), ty = Math.cos(endA);
  const plateT = () => ({ r: [0, 0, endA * 57.2958], p: [ex + tx * 2, ey + ty * 2, 0] });
  const PM = o.plate || o.mat;
  k.add(PM, box(D1 + 7, 6, W + 3, { bevel: 1.6 }), plateT());
  for (const s of [-1, 1]) k.add(PM, T(box(D1 + 2, 5, 1.2, { bevel: 0.4 }), { p: [0, -4.4, s * (W / 2 + 0.7)] }), plateT());
  if (steel) {
    k.add(PM, T(box(D1 - 12, 1.4, 7, { bevel: 0.6 }), { p: [0, 3.2, 0] }), plateT());
    for (const x of [-(D1 / 2) + 8, D1 / 2 - 8]) k.add(PM, T(tubeX(2.8, 1.6, 0, 0.6, { seg: 16, c: 0.2 }), { r: [0, 0, 90], p: [x, 2.8, 0] }), plateT());
  } else {
    k.add("lensBlack", T(cylY(3.2, 2.9, 3.15, { seg: 16, c: 0.05 }), { p: [0, 0, 0] }), plateT());
    k.add("steel", T(cylY(2.2, 2.4, 3.1, { seg: 12, c: 0.3 }), { p: [0, 0, 0] }), plateT());
    k.add(PM, T(box(4, 7, W - 4, { bevel: 1.2 }), { p: [D1 / 2 + 3.5, 0.8, 0] }), plateT());
  }
  k.add(lugM, T(box(8, 6, W - 6, { bevel: 0.8 }), { p: [2, 8, 0] }));
  k.add(lugM, T(box(3.4, 6.4, W - 8, { bevel: 0.8 }), { p: [-D0 - 0.9, 2.4, 0] }));
  const cal = o.cal;
  ctx.C.feedLips(k, o.mat, -D0 + 6, -D0 + 42, 12, W / 2, { rise: 5.2, curl: 3.4 });
  ctx.C.cartridge(rk, cal, { p: [-D0 + 8, 13.5, -3.4], r: [0, 0, 3] });
  ctx.C.cartridge(rk, cal, { p: [-D0 + 8, 7, 3.4], r: [0, 0, 3] });
  const rounds = rk.build("rounds");
  return { root: node("mag", [k.build(), rounds]), mag: { cap: o.cap, rounds } };
}
function drum(ctx, o) {
  const k = ctx.kit(), rk = ctx.kit();
  const base = akMag(ctx, { ...o, len: 70, cross: false, ribs: false });
  k.add(o.mat, T(cylZ(66, -26, 26, { c: 5, seg: 48 }), { p: [-10, -120, 0] }));
  k.add(o.mat, T(cylZ(20, 26, 31, { c: 2, seg: 32 }), { p: [-10, -120, 0] }));
  k.add("steel", T(ctx.C.knob(10, 6, 16), { r: [0, -90, 0], p: [-10, -120, 30] }));
  for (let i = 0; i < 12; i++) for (const s of [-1, 1]) k.add(o.mat, T(box(2.4, 40, 1.6, { bevel: 0.5 }), { p: [-10, -120, s * 26.3], r: [0, 0, i * 30] }).translate(0, 0, 0));
  return { root: node("drum", [base.root, k.build()]), mag: { cap: o.cap, rounds: base.mag.rounds } };
}
function akGrip(ctx, o) {
  const k = ctx.kit();
  const a = (o.angle ?? 18) * Math.PI / 180;
  const sh = (y) => Math.tan(a) * y;
  const front = o.front.map(([f, y]) => [sh(y) + f, y]);
  const back = o.back.map(([f, y]) => [sh(y) + f, y]);
  const W = o.w ?? 30;
  const body = gripLoft(front, back, { w: W, k: 2.8, taper: 0.22, width: (t) => 0.9 + 0.1 * Math.sin(Math.PI * t) });
  k.add(o.mat, body);
  if (o.grooves) for (let i = 0; i < o.grooves; i++) for (const s of [-1, 1]) {
    k.add(o.mat, T(box(1.6, 58, 1.2, { bevel: 0.5 }), { p: [sh(-52) - 9 - i * 3.3, -52, s * (W / 2 * 0.93 - 0.3)], r: [0, 0, -o.angle] }));
  }
  if (o.texture) for (let i = 0; i < 9; i++) for (const s of [-1, 1]) k.add(o.mat, T(box(16, 1.2, 1.1, { bevel: 0.3 }), { p: [sh(-20 - i * 8.5) - 20, -20 - i * 8.5, s * (W / 2 * 0.9 - 0.2)], r: [0, 0, o.angle] }));
  if (o.cap) k.add("polySoft", T(box(34, 5, (o.w ?? 28) - 4, { bevel: 2 }), { p: [sh(-o.h) - 16, -o.h - 1, 0] }));
  k.add("steel", T(cylY(3, -o.h - 2, -o.h + 1, { seg: 12 }), { p: [sh(-o.h) - 14, 0, 0] }));
  return { root: k.build("pgrip") };
}
function stockLoft(prof, k = 3.4) {
  return loftX(prof.map(([x, cy, hh, hw]) => ({ x, pts: superEllipse(hw, hh, k, 28, cy, 0) })));
}
function grainAlong(g, dx, dy) {
  const l = Math.hypot(dx, dy), c = dx / l, s = dy / l;
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    uv.setXY(i, x * c + y * s, -x * s + y * c + z);
  }
  return g;
}
function slotScrew(k, x, y, z = 0, r = 3.2) {
  k.add("steelWorn", T(latheX([[0, 0], [0, r], [0.5, r - 0.1], [1.1, r * 0.75], [1.3, 0]], { seg: 16 }), { r: [0, 180, 0], p: [x, y, z] }));
  k.add("lensBlack", T(box(0.9, 0.8, r * 1.8, { bevel: 0.1 }), { p: [x - 1.05, y, z] }));
}
function stockAKM(ctx) {
  const k = ctx.kit();
  const prof = [[-2, -6, 18, 14.6], [-30, -12, 22, 16], [-80, -26, 34, 17.6], [-140, -42, 48, 19], [-196, -60, 60, 20.4], [-206, -63, 62, 20.6]];
  k.add("wood", grainAlong(stockLoft(prof), 204, 57));
  k.add("steel", extrudeX(shape(superEllipse(21, 63, 3.4, 28, -63, 0)), -212, -205, { bevel: 1.2 }));
  k.add("steel", extrudeX(shape(superEllipse(21.4, 63.4, 3.4, 28, -63, 0), [superEllipse(20.2, 62.2, 3.4, 28, -63, 0)]), -206, -202.5, { bevel: 0.5 }));
  const door = rrect(0, -80, 24, 44, 8);
  k.add("lensBlack", extrudeX(shape(rrect(0, -80, 25.2, 45.2, 8.4), [door]), -212.25, -211.8, { bevel: 0.05 }));
  k.add("steel", extrudeX(rrect(0, -80, 23.4, 43.4, 7.8), -212.7, -211.6, { bevel: 0.4 }));
  k.add("steelWorn", T(cylZ(1.5, -7, 7, { seg: 12, c: 0.3 }), { p: [-212.6, -57.2, 0] }));
  k.add("steel", T(tubeX(3.4, 2, 0, 0.5, { seg: 18, c: 0.15 }), { r: [0, 180, 0], p: [-212.6, -92, 0] }));
  for (const y of [-10, -116]) slotScrew(k, -212, y);
  k.add("steel", extrudeZ([[4, 6], [-30, -2, 2], [-30, -8, 2], [4, -2]], 12, { bevel: 0.6 }));
  k.add("steelWorn", T(latheX([[0, 0], [0, 3], [0.5, 2.9], [1.1, 2.2], [1.3, 0]], { seg: 16 }), { r: [0, 0, 90], p: [-22, 0.2, 0] }));
  k.add("lensBlack", T(box(5.4, 0.8, 0.9, { bevel: 0.1 }), { p: [-22, 1.3, 0], r: [0, 30, 0] }));
  k.add("steel", extrudeZ(rrect(-175, -64, 26, 9, 3), 1.6, { bevel: 0.4, z: -20.4 }));
  k.add("steel", wire([[-166, -64, -20], [-166, -64, -27], [-184, -64, -27], [-184, -64, -20]], 1.8, { n: 30 }));
  return { root: k.build("akm_wood"), cheek: { x: -60, y: 8 } };
}
function stockAK74M(ctx) {
  const k = ctx.kit();
  const prof = [[-10, -6, 18, 15], [-40, -13, 23, 16.5], [-90, -28, 36, 18], [-150, -44, 49, 19.4], [-205, -62, 60, 20.6], [-214, -64, 61, 20.6]];
  const f = ctx.kit();
  f.add("poly", stockLoft(prof, 3.8));
  const win = [[-50, -6], [-180, -31], [-180, -78], [-56, -27]];
  for (const s of [-1, 1]) {
    const t = { r: [0, s * 1.455, 0], p: [0, 0, 0] };
    f.add("polySoft", T(extrudeZ([[-50, -6, 6], [-180, -31, 10], [-180, -78, 10], [-56, -27, 6]], 1, { bevel: 0.3, z: s * 15.18 }), t));
    const loop = [];
    for (let i = 0; i < 4; i++) {
      const a = win[i], b = win[(i + 1) % 4];
      for (let j = 0; j < 6; j++) {
        const u = j / 6;
        loop.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, s * 15.33]);
      }
    }
    f.add("poly", T(wire(loop, 0.9, { closed: true, n: 120, seg: 6, tension: 0.2 }), t));
  }
  f.add("rubber", extrudeX(shape(superEllipse(21.4, 62, 3.8, 28, -64, 0)), -224, -213, { bevel: 2 }));
  for (let i = 0; i < 9; i++) f.add("rubber", T(cylZ(1.1, -18.5, 18.5, { seg: 8, c: 0.8 }), { p: [-224.4, -16 - i * 12, 0] }));
  f.add("poly", extrudeX(shape(superEllipse(21.2, 61.2, 3.8, 28, -64, 0)), -214, -211, { bevel: 0.8 }));
  f.add("steel", extrudeZ(rrect(-196, -64, 20, 8, 3), 1.6, { bevel: 0.4, z: -20.8 }));
  f.add("steel", wire([[-189, -64, -20.5], [-189, -64, -27], [-203, -64, -27], [-203, -64, -20.5]], 1.8, { n: 30 }));
  f.add("steel", extrudeX(rrect(0, -4, 30, 26, 3), -14, -1, { bevel: 1 }));
  f.add("steel", extrudeX(rrect(0, -4, 31.4, 27.4, 3.4), -16, -13, { bevel: 0.6 }));
  for (const y of [-14, 2]) f.add("steel", T(cylY(5.2, y, y + 7, { c: 0.6, seg: 18 }), { p: [0, 0, -22] }));
  const fold = node("fold", [f.build()]);
  k.add("steel", extrudeZ([[4, 10], [-4, 10], [-4, -22], [4, -22]], 12, { bevel: 1, z: -20 }));
  for (const y of [-21, -7, 9]) k.add("steel", T(cylY(5, y, y + (y === 9 ? 2 : 7), { c: 0.6, seg: 18 }), { p: [0, 0, -22] }));
  for (const [y, d] of [[11, 1], [-22, -1]]) k.add("steelWorn", T(latheX([[0, 0], [0, 3], [0.5, 2.9], [1, 2.2], [1.2, 0]], { seg: 14 }), { r: [0, 0, d * 90], p: [0, y, -22] }));
  k.add("steel", T(cylZ(5.4, -16.4, -14.9, { seg: 20, c: 0.4 }), { p: [12, 5, 0] }));
  k.add("steelWorn", T(ctx.C.knob(4.4, 3.4, 16), { r: [0, 90, 0], p: [12, 5, -16.2] }));
  fold.position.set(0, 0, -22);
  fold.children[0].position.set(0, 0, 22);
  return { root: node("ak74m_fold", [k.build(), fold]), fold: { node: fold, axis: "y", angle: -172 }, cheek: { x: -70, y: 8 } };
}
function stockUnder(ctx) {
  const k = ctx.kit();
  for (const s of [-1, 1]) {
    k.add("steel", extrudeZ([[0, 4, 2], [-10, 4], [-230, -30, 3], [-232, -40, 3], [-220, -40], [-10, -4], [0, -4]], 3, { bevel: 0.6, z: s * 11 }));
    k.add("steel", extrudeZ([[-12, -12], [-226, -90, 3], [-230, -96, 3], [-218, -96], [-12, -20]], 3, { bevel: 0.6, z: s * 11 }));
  }
  k.add("steel", extrudeZ([[-222, -28, 4], [-236, -30, 4], [-236, -104, 6], [-220, -100, 4]], 28, { bevel: 2 }));
  k.add("steel", T(cylZ(4, -13, 13, { seg: 16 }), { p: [-4, 0, 0] }));
  k.add("steel", T(cylZ(3, -13, 13, { seg: 14 }), { p: [-10, -16, 0] }));
  return { root: k.build("akms"), cheek: { x: -60, y: 6 } };
}
function stockPT(ctx, o) {
  const k = ctx.kit();
  k.add("steel", extrudeX(rrect(0, -2, 30, 34, 4), -30, 0, { bevel: 1.2 }));
  k.add("alu", T(cylX(14.6, -200, -28, { c: 1.2, seg: 32 }), { p: [0, 2, 0] }));
  k.add("steel", T(cylX(17.5, -38, -28, { c: 1, seg: 10 }), { p: [0, 2, 0] }));
  k.add("alu", extrudeX(rrect(0, -12.5, 9, 6, 1.5), -196, -40, { bevel: 0.6 }));
  const s = ctx.kit();
  const pro = shape(
    [[150, -17, 3], [150, 17, 4], [118, 20, 6], [36, 22, 8], [-8, 24, 4], [-8, -92, 5], [8, -92, 4], [100, -21, 10]],
    [[[92, -26, 3], [30, -26, 4], [8, -74, 4], [8, -30, 3]]]
  );
  s.add("poly", extrudeZ(pro, 36, { bevel: 3.5 }));
  s.add("poly", cylX(19, 60, 150, { c: 3, seg: 28 }));
  s.add("poly", extrudeZ([[96, -18, 2], [144, -18, 2], [144, -30, 3], [100, -28, 3]], 20, { bevel: 2 }));
  s.add("rubber", extrudeZ([[-8, 24, 3], [-22, 23, 4], [-22, -93, 4], [-8, -93, 3]], 38, { bevel: 3.5 }));
  for (let i = 0; i < 10; i++) s.add("rubber", T(box(1.6, 2.6, 34), { p: [-22.2, 16 - i * 11.5, 0] }));
  const st = node("ctr", [s.build()]);
  st.position.set(-235, 2, 0);
  let fold = null;
  const parts = [k.build(), st];
  if (o.folding) {
    const f = node("fold", parts.slice());
    fold = node("hinge", [f]);
    fold.position.set(0, 0, -22);
    f.position.set(0, 0, 22);
    return { root: node("pt", [fold]), fold: { node: fold, axis: "y", angle: -172 }, cheek: { x: -110, y: 22 } };
  }
  return { root: node("pt", parts), cheek: { x: -110, y: 22 } };
}
function akParts(v) {
  const is74 = v === "ak74";
  const thr = is74 ? "m24x1.5" : "m14x1L";
  const steel = "steel";
  const cal = is74 ? "545" : "762x39";
  const mag = (id, name, desc, stats, o) => ({ id, cat: "mag", name, desc, fit: { iface: [is74 ? "ak545" : "ak762"] }, stats, build: (c) => o.drum ? drum(c, o) : akMag(c, o) });
  const M762 = { R: 235, d0: 70, d1: 64, w: 27, cal: "762x39" };
  const M545 = { R: 330, d0: 66, d1: 60, w: 25.5, cal: "545" };
  const list = [
    // цевья
    is74 ? { id: "hg_74m", cat: "hg", name: "АК-74М, полимер", desc: "Штатные накладки из стеклонаполненного полиамида", stats: { weight: 240 }, build: (c) => hgStd(c, { mat: "poly", ribs: true }) } : { id: "hg_akm", cat: "hg", name: "АКМ, дерево", desc: "Клеёная берёза, «лопатки» у магазина", stats: { weight: 300 }, build: (c) => hgStd(c, { mat: "wood", paddle: true }) },
    { id: "hg_b10", cat: "hg", name: "Зенитко Б-10М + Б-33", desc: "Три планки снизу и по бокам + низкая планка на газовой трубке", stats: { weight: 390, ergo: 4 }, build: hgB10 },
    { id: "hg_zhukov", cat: "hg", name: "Magpul Zhukov-U", desc: "M-LOK, секции планок по бокам и снизу", stats: { weight: 280, ergo: 6 }, build: (c) => hgZhukov(c, { mat: is74 ? "poly" : "polyFde" }) },
    // крышки
    { id: "cover_std", cat: "cover", name: "Штатная крышка", desc: "Штампованная, с рёбрами жёсткости", stats: { weight: 180 }, build: (c) => coverStd(c, { steel }) },
    { id: "cover_tws", cat: "cover", name: "Крышка с планкой (TWS)", desc: "Жёсткая крышка на шарнире в колодке целика", stats: { weight: 290 }, build: (c) => coverTWS(c, { steel }) },
    // боковой кронштейн, ПСО-1, ПОСП и «Кобра» — общие, из engine/lib/dovetail.js
    // дульные
    is74 ? { id: "brake74", cat: "muzzle", name: "ДТК АК-74", desc: "Штатный двухкамерный дульный тормоз-компенсатор", fit: { thread: ["m24x1.5"] }, stats: { weight: 90, "recoilV%": -20, "recoilH%": -15, loud: 3, flash: 5 }, build: brake74 } : { id: "slant", cat: "muzzle", name: "Компенсатор АКМ", desc: "Штатный «косой срез»: гасит увод вверх-вправо", fit: { thread: ["m14x1L"] }, stats: { weight: 40, "recoilV%": -8, "recoilH%": -12, loud: 1, flash: 10 }, build: slantComp },
    { id: "dtk1", cat: "muzzle", name: "Зенитко ДТК-1", desc: "Трёхкамерный ДТК: сильно снижает отдачу, громче", fit: { thread: ["m14x1L", "m24x1.5"] }, stats: { weight: 190, length: 60, "recoilV%": -28, "recoilH%": -24, loud: 5, flash: 0 }, build: dtk1 },
    is74 ? { id: "pbs4", cat: "muzzle", name: "ПБС-4", desc: "Штатный глушитель к АК-74 (под патрон УС)", fit: { thread: ["m24x1.5"] }, stats: { weight: 480, length: 175, loud: -26, flash: -80, "recoilV%": -10, ergo: -8, adsTime: 25 }, build: (c) => can(c, { name: "pbs4", r: 17.5, len: 175, mat: "steel", knurl: true, rings: [60, 120] }) } : { id: "pbs1", cat: "muzzle", name: "ПБС-1", desc: "Классический глушитель к АКМ", fit: { thread: ["m14x1L"] }, stats: { weight: 520, length: 200, loud: -26, flash: -80, "recoilV%": -10, ergo: -9, adsTime: 25 }, build: (c) => can(c, { name: "pbs1", r: 17.5, len: 200, mat: "steel", knurl: true, rings: [70, 140] }) },
    { id: "rotor43", cat: "muzzle", name: "«Ротор-43»", desc: "Малогабаритный глушитель с оребрённым корпусом", fit: { thread: ["m14x1L", "m24x1.5"] }, stats: { weight: 430, length: 150, loud: -24, flash: -75, "recoilV%": -12, ergo: -6, adsTime: 20 }, build: (c) => can(c, { name: "rotor43", r: 21, len: 150, mat: "cast", fins: 16 }) },
    { id: "cap", cat: "muzzle", name: "Колпачок резьбы", desc: "Голый ствол: громко, яркая вспышка", fit: { thread: [thr] }, stats: { weight: 15, loud: 2, flash: 25, "recoilV%": 6 }, build: threadCap },
    // рукояти
    is74 ? { id: "grip_74m", cat: "pgrip", name: "АК-74М, полимер", desc: "Штатная рукоять", fit: { iface: ["ak"] }, stats: { weight: 70 }, build: (c) => akGrip(c, { mat: "poly", h: 100, front: [[2, 0], [0, -30], [1, -60], [-2, -100]], back: [[-36, 2], [-40, -8], [-39, -50], [-36, -80], [-37, -99]], angle: 17, grooves: 0, texture: true }) } : { id: "grip_akm", cat: "pgrip", name: "АКМ, бакелит", desc: "Рыжий бакелит с вертикальными рифами", fit: { iface: ["ak"] }, stats: { weight: 75 }, build: (c) => akGrip(c, { mat: "bakelite", h: 100, front: [[2, 0], [0, -40], [-1, -100]], back: [[-36, 2], [-41, -10], [-40, -50], [-37, -82], [-38, -99]], angle: 17, grooves: 7 }) },
    { id: "grip_rk3", cat: "pgrip", name: "Зенитко РК-3", desc: "Эргономичная, с упором под ладонь", fit: { iface: ["ak"] }, stats: { weight: 90, ergo: 5 }, build: (c) => akGrip(c, { mat: "poly", h: 104, front: [[2, 0], [0, -14], [5, -28], [0, -40], [-2, -104]], back: [[-34, 4], [-44, 0], [-42, -30], [-38, -70], [-38, -104]], angle: 16, texture: true, cap: true }) },
    { id: "grip_moe_ak", cat: "pgrip", name: "Magpul MOE AK", desc: "Полимерная, с отсеком в торце", fit: { iface: ["ak"] }, stats: { weight: 80, ergo: 3 }, build: (c) => akGrip(c, { mat: "polySoft", h: 102, front: [[1, 0], [0, -30], [2, -60], [0, -102]], back: [[-34, 3], [-40, -10], [-38, -60], [-37, -102]], angle: 20, texture: true, cap: true }) },
    // приклады
    is74 ? { id: "stock_74m", cat: "stock", name: "АК-74М, складной", desc: "Полимерный, складывается влево (K)", fit: { iface: ["ak"] }, stats: { weight: 360 }, build: stockAK74M } : { id: "stock_akm", cat: "stock", name: "АКМ, дерево", desc: "Клеёная берёза, стальной затыльник с пеналом", fit: { iface: ["ak"] }, stats: { weight: 480 }, build: stockAKM },
    is74 ? null : { id: "stock_akms", cat: "stock", name: "АКМС, складной вниз", desc: "Штампованный металлический приклад", fit: { iface: ["ak"] }, stats: { weight: 320, ergo: 4, "recoilV%": 8 }, build: stockUnder },
    { id: "stock_pt", cat: "stock", name: is74 ? "Зенитко ПТ-3 + Magpul CTR" : "Зенитко ПТ-1 + Magpul CTR", desc: "Переходник под трубу AR, телескопический приклад", fit: { iface: ["ak"] }, stats: { weight: 420, ergo: 6, "recoilV%": -6 }, build: (c) => stockPT(c, { folding: is74 }) }
  ].filter(Boolean);
  if (is74) {
    list.push(
      mag("mag545_plum", "Магазин 6Л23, «слива»", "Полимер, 30 патронов 5,45", { weight: 220, mag: 30 }, { ...M545, len: 150, mat: "polyPlum", cap: 30, ribs: true }),
      mag("mag545_black", "Магазин 6Л23, чёрный", "Полимер, 30 патронов", { weight: 220, mag: 30 }, { ...M545, len: 150, mat: "poly", cap: 30, ribs: true }),
      mag("mag545_45", "Магазин РПК-74, 45", "Удлинённый, 45 патронов", { weight: 320, mag: 45, ergo: -4, adsTime: 12 }, { ...M545, len: 210, mat: "polyPlum", cap: 45, ribs: true }),
      mag("mag545_drum", "Барабан 95 (РПК-74)", "Барабанный, 95 патронов", { weight: 1600, mag: 95, ergo: -12, adsTime: 35 }, { ...M545, mat: "poly", cap: 95, drum: true })
    );
  } else {
    list.push(
      mag("mag762_steel", "Магазин стальной, 30", "Штампованная сталь с рёбрами", { weight: 330, mag: 30 }, { ...M762, len: 158, mat: "steelPark", cap: 30, cross: true }),
      mag("mag762_bak", "Магазин бакелитовый, 30", "«Рыжий» АГ-4С", { weight: 250, mag: 30 }, { ...M762, len: 158, mat: "bakelite", cap: 30, ribs: true }),
      mag("mag762_pmag", "Magpul PMAG 30 AK", "Полимер, окно у затыльника", { weight: 240, mag: 30, ergo: 1 }, { ...M762, len: 158, mat: "poly", cap: 30, ribs: true, bevel: 1.8 }),
      mag("mag762_40", "Магазин РПК, 40", "Удлинённый, 40 патронов", { weight: 440, mag: 40, ergo: -4, adsTime: 12 }, { ...M762, len: 205, mat: "steelPark", cap: 40, cross: true }),
      mag("mag762_drum", "Барабан РПК, 75", "Барабанный, 75 патронов", { weight: 2100, mag: 75, ergo: -14, adsTime: 40 }, { ...M762, mat: "steelPark", cap: 75, drum: true })
    );
  }
  return list;
}
function akSlots() {
  const optRails = ["coverRail", "gasRail", "sideRail", "dovetail"];
  return [
    { id: "handguard", label: "Цевьё", group: "Цевьё и ствол", accepts: ["hg"], mount: "hg", required: true },
    { id: "muzzle", label: "Дульное устройство", group: "Цевьё и ствол", accepts: ["muzzle"], mount: "muzzle" },
    { id: "cover", label: "Крышка коробки", group: "Ствольная коробка", accepts: ["cover"], mount: "cover", required: true },
    { id: "sidemount", label: "Боковой кронштейн", group: "Оптика", accepts: ["sidemount"], rails: ["dovetail"] },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: optRails, prefer: { x: -60 } },
    { id: "magnifier", label: "Увеличитель", group: "Оптика", accepts: ["magnifier"], rails: optRails.slice(0, 3), prefer: "rear", behind: "optic" },
    { id: "offset", label: "Боковой коллиматор", group: "Оптика", accepts: ["offset"], rails: optRails.slice(0, 3), prefer: { x: 0 } },
    { id: "under", label: "Под стволом", group: "Тактика", accepts: ["foregrip", "bipod"], rails: ["hgBottom"], prefer: "front" },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgRight"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgLeft"], prefer: "front" },
    { id: "mag", label: "Магазин", group: "Ствольная коробка", accepts: ["mag"], mount: "magwell" },
    { id: "pgrip", label: "Пистолетная рукоять", group: "Ствольная коробка", accepts: ["pgrip"], mount: "grip", iface: "ak", required: true },
    { id: "stock", label: "Приклад", group: "Ствольная коробка", accepts: ["stock"], mount: "stock", iface: "ak" }
  ];
}

// ---- weapons/ak74.js
var ak74_default = {
  id: "ak74",
  title: "АК-74М",
  short: "АК-74М",
  caliber: "5,45×39",
  cal: "545",
  thread: "m24x1.5",
  boltHold: false,
  specs: [["Ствол", "415 мм"], ["Длина", "943 / 700 мм"], ["Темп", "650 выстр/мин"], ["Масса", "3,4 кг"]],
  base: { weight: 2020, length: 860, ergo: 48, recoilV: 92, recoilH: 90, moa: 2.4, velocity: 900, range: 450, loud: 158, flash: 60, adsTime: 290, rpm: 650, mag: 30 },
  audio: { cal: "545", mech: 0.95 },
  modes: ["safe", "auto", "semi"],
  build: (ctx) => akBase(ctx, { id: "ak74", steel: "steel", dimples: true, gas45: true, bayonet: true }),
  slots: akSlots(),
  parts: akParts("ak74"),
  defaults: {
    handguard: "hg_74m",
    muzzle: "brake74",
    cover: "cover_std",
    sidemount: null,
    optic: null,
    magnifier: null,
    under: null,
    tacRight: null,
    tacLeft: null,
    mag: "mag545_plum",
    pgrip: "grip_74m",
    stock: "stock_74m"
  }
};

DEFS[ak74_default.id] = ak74_default; FAMILY[ak74_default.id] = "B";
})();
(() => {
// ---- weapons/m416_parts.js
var RAIL_TOP = 30.5;
var CW = 0.6;
var SEG = { a: [[0, 1], [CW, 1]], b: [[CW, 1], [CW, 0.5]], c: [[CW, 0.5], [CW, 0]], d: [[0, 0], [CW, 0]], e: [[0, 0], [0, 0.5]], f: [[0, 0.5], [0, 1]], g: [[0, 0.5], [CW, 0.5]] };
var SEGS = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg", A: "efabcg", E: "afged", F: "afge", H: "fbgec", S: "afgcd", C: "afed", L: "fed", P: "efabg", "-": "g" };
var STROKES = {
  K: [[[0, 0], [0, 1]], [[0, 0.45], [CW, 1]], [[0.18, 0.6], [CW, 0]]],
  M: [[[0, 0], [0, 1]], [[0, 1], [CW / 2, 0.45]], [[CW / 2, 0.45], [CW, 1]], [[CW, 1], [CW, 0]]],
  X: [[[0, 0], [CW, 1]], [[0, 1], [CW, 0]]],
  T: [[[0, 1], [CW, 1]], [[CW / 2, 1], [CW / 2, 0]]]
};
var BASIS = { right: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], left: [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], top: [[0, 0, 1], [1, 0, 0], [0, 1, 0]] };
function engrave(ctx, text, o = {}) {
  const { G, THREE: THREE9 } = ctx;
  const h = o.h ?? 3, t = o.t ?? Math.max(0.28, h * 0.13), d = o.d ?? 0.12;
  const adv = (CW + 0.4) * h, total = text.length * adv - 0.4 * h;
  const gs = [];
  [...text].forEach((ch, i) => {
    const x0 = -total / 2 + i * adv;
    const list = (STROKES[ch] || [...SEGS[ch] || ""].map((s) => SEG[s])).slice();
    if (ch === "." || ch === ",") list.push([[CW / 2, 0], [CW / 2, ch === "," ? -0.18 : 0.02]]);
    for (const [[ax, ay], [bx, by]] of list) {
      const px = x0 + ax * h, py = (ay - 0.5) * h, qx = x0 + bx * h, qy = (by - 0.5) * h;
      gs.push(G.T(G.box(Math.hypot(qx - px, qy - py) + t, t, d, { bevel: 0 }), { r: [0, 0, Math.atan2(qy - py, qx - px) * 180 / Math.PI], p: [(px + qx) / 2, (py + qy) / 2, d / 2] }));
    }
  });
  const g = G.merge(gs);
  if (!g) return null;
  const B = BASIS[o.basis || "right"], p = o.p || [0, 0, 0];
  const m = new THREE9.Matrix4().makeBasis(new THREE9.Vector3(...B[0]), new THREE9.Vector3(...B[1]), new THREE9.Vector3(...B[2]));
  m.setPosition(p[0], p[1], p[2]);
  return g.applyMatrix4(m);
}
function railMarks(ctx, r, n0 = 1, o = {}) {
  const gs = [];
  for (let i = 0; i < r.slots - 1; i++) {
    gs.push(engrave(ctx, String(n0 + i), { h: o.h ?? 2.3, d: 0.1, basis: "top", p: [r.first + (i + 0.5) * ctx.G.PICA.PITCH, -0.04, 0] }));
  }
  return ctx.G.merge(gs);
}
function arc(cz, cy, r, t0, t1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * (i / n);
    out.push([cz + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return out;
}
function quadRail(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  const x0 = 2, x1 = 252;
  const a = 26, f = 10.5, R4 = 17.5, cy = 2;
  const zAt = (y) => a - (-y - f);
  const ys = -12, yl = -12.7;
  const dzU = Math.sqrt(R4 * R4 - (ys - cy) ** 2), dzL = Math.sqrt(R4 * R4 - (yl - cy) ** 2);
  const upper = [
    [zAt(ys), ys, 0.9],
    [a, -f, 2.2],
    [a, f, 2.2],
    [f, a, 2.2],
    [-f, a, 2.2],
    [-a, f, 2.2],
    [-a, -f, 2.2],
    [-zAt(ys), ys, 0.9],
    ...arc(0, cy, R4, Math.atan2(ys - cy, -dzU), Math.atan2(ys - cy, dzU) - Math.PI * 2, 36)
  ];
  const lower = [
    [-zAt(yl), yl, 0.9],
    [-f, -a, 2.2],
    [f, -a, 2.2],
    [zAt(yl), yl, 0.9],
    ...arc(0, cy, R4, Math.atan2(yl - cy, dzL), Math.atan2(yl - cy, -dzL), 12)
  ];
  k.add("alu", G.extrudeX(upper, x0 + 6, x1 - 10, { bevel: 1 }));
  k.add("alu", G.extrudeX(lower, x0 + 10, x1 - 13, { bevel: 1 }));
  const ringP = (d, rr) => [[-f - d, a + d], [f + d, a + d], [a + d, f + d], [a + d, -f - d], [f + d, -a - d], [-f - d, -a - d], [-a - d, -f - d], [-a - d, f + d]].map((p) => [...p, rr]);
  k.add("alu", G.extrudeX(G.shape(ringP(1.5, 3), [G.circle(0, cy, R4, 32)]), x1 - 14, x1 - 2, { bevel: 1.4 }));
  k.add("alu", G.extrudeX(G.shape(ringP(0.6, 2.6), [G.circle(0, 0, 11.2, 32)]), x1 - 3.5, x1, { bevel: 1 }));
  k.add("alu", G.extrudeX(G.shape(ringP(1.5, 3), [G.circle(0, 0, 16, 32)]), x0, x0 + 11, { bevel: 1.2 }));
  const dia = (a + f) / Math.SQRT2 + 0.1;
  for (const s of [-1, 1]) for (const x of [x0 + 18, x0 + 30, x1 - 22]) {
    k.add("steel", G.T(G.screwHead(2.7, 1.3, { seg: 6 }), { r: [s > 0 ? 45 : 135, 0, 0], p: [x, -dia * Math.SQRT1_2, s * dia * Math.SQRT1_2] }));
  }
  const len = x1 - x0 - 2;
  const mounts = [];
  const faces = [["hgTop", "top", [0, 0, 0], [0, RAIL_TOP, 0], 18], ["hgRight", "right", [90, 0, 0], [0, 0, RAIL_TOP], 1], ["hgBottom", "bottom", [180, 0, 0], [0, -RAIL_TOP, 0], 1], ["hgLeft", "left", [-90, 0, 0], [0, 0, -RAIL_TOP], 1]];
  for (const [id, face, rot, off, n0] of faces) {
    const rr = G.picatinny(len, { base: RAIL_TOP - a + 0.5 });
    k.add("alu", rr.geo, { r: rot, p: [x0 + 1 + off[0], off[1], off[2]] });
    k.add("steelWorn", railMarks(ctx, rr, n0), { r: rot, p: [x0 + 1 + off[0], off[1], off[2]] });
    const p = [x0 + 1 + rr.first, off[1], off[2]];
    mounts.push(ctx.railMount(id, p, face, rr.slots, { axis: face }));
  }
  const root = G.node("hk_quad", [k.build(), ...mounts]);
  return { root };
}
function mlokRail(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  const x0 = 2, x1 = 262, R4 = 24, t = 3.2;
  const w = 2 * R4 * Math.tan(Math.PI / 8) + 0.6;
  for (let i = 0; i < 8; i++) {
    const a = i * 45;
    if (a === 0) continue;
    const holes = G.mlokHoles(x0 + 26, x1 - 14, 0, { pitch: 40 });
    const plate = G.shape(G.rrect((x0 + x1) / 2, 0, x1 - x0, w, 0.8), a % 90 === 0 ? holes : holes.filter((_, j) => j % 2 === 1));
    const g = G.extrudeZ(plate, t, { bevel: 0.6, z: R4 - t / 2 });
    k.add("alu", G.T(g, { r: [a - 90, 0, 0] }));
  }
  k.add("alu", G.extrudeX(G.rrect(0, R4 - 2, w + 1, 5, 1), x0, x1, { bevel: 0.6 }));
  k.add("alu", G.extrudeX(G.shape(G.circle(0, 0, R4 + 2.5, 8).map((p) => [p[0], p[1], 2]), [G.circle(0, 0, 16, 32)]), x0, x0 + 12, { bevel: 1 }), null);
  k.add("alu", G.extrudeX(G.shape(G.circle(0, 0, R4 + 1.5, 8).map((p) => [p[0], p[1], 2]), [G.circle(0, 0, 17, 32)]), x1 - 6, x1, { bevel: 1 }), null);
  for (const s of [-1, 1]) for (const x of [x0 + 3.5, x0 + 8.5]) {
    const ap = (R4 + 2.5) * Math.cos(Math.PI / 8);
    k.add("steel", G.T(G.screwHead(2.2, 1.1), { r: [s > 0 ? 22.5 : 157.5, 0, 0], p: [x, -ap * Math.sin(Math.PI / 8), s * ap * Math.cos(Math.PI / 8)] }));
  }
  k.add("alu", G.extrudeX(G.rrect(0, R4 + 3.5, 12, 4, 1), x0 - 5, x0 + 1, { bevel: 0.6 }));
  const mounts = [];
  const top = G.picatinny(x1 - x0 - 2, { base: RAIL_TOP - R4 + 0.5 });
  k.add("alu", top.geo, { p: [x0 + 1, RAIL_TOP, 0] });
  k.add("steelWorn", railMarks(ctx, top, 18), { p: [x0 + 1, RAIL_TOP, 0] });
  mounts.push(ctx.railMount("hgTop", [x0 + 1 + top.first, RAIL_TOP, 0], "top", top.slots, { axis: "top" }));
  const sections = [["hgBottom", "bottom", 180, 102, [0, -R4 - 0.2, 0]], ["hgRight", "right", 90, 72, [0, 0, R4 + 0.2]], ["hgLeft", "left", -90, 72, [0, 0, -R4 - 0.2]]];
  for (const [id, face, rot, len, off] of sections) {
    const xs = x1 - 18 - len;
    const rr = G.picatinny(len, { base: 9.6 });
    const sk = ctx.kit();
    sk.add("alu", rr.geo, { p: [0, 9.4, 0] });
    sk.add("steel", G.T(G.screwHead(2.6, 1.2), { r: [-90, 0, 0] }), { p: [len * 0.25, 9.6, 0] });
    sk.add("steel", G.T(G.screwHead(2.6, 1.2), { r: [-90, 0, 0] }), { p: [len * 0.75, 9.6, 0] });
    const sec = sk.build();
    const holder = G.node("sec:" + id, [sec]);
    holder.position.set(xs, off[1], off[2]);
    holder.rotation.x = rot * Math.PI / 180;
    mounts.push(holder);
    const m = ctx.railMount(id, [xs + rr.first, (off[1] ? Math.sign(off[1]) : 0) * (R4 + 9.6), (off[2] ? Math.sign(off[2]) : 0) * (R4 + 9.6)], face, rr.slots, { axis: face });
    mounts.push(m);
  }
  return { root: G.node("hk_mlok", [k.build(), ...mounts]) };
}
function hkFront(ctx) {
  const { G } = ctx;
  const k = ctx.kit(), f = ctx.kit();
  k.add("alu", ctx.C.clampBody(-11, 11, 5));
  k.add("steel", ctx.C.crossBolt(0));
  k.add("steel", G.cylZ(2.2, -14.6, -12.8, { seg: 14, c: 0.4 }), { p: [-6.5, 2.2, 0] });
  f.add("alu", G.extrudeZ([[-9, 0, 1], [7, 0, 1], [7, 11, 2], [-9, 9, 2]], 16, { bevel: 0.8 }));
  for (const s of [-1, 1]) f.add("alu", G.extrudeZ([[-7, 8], [5, 8], [4, 24.6, 2], [-4.5, 24.6, 2]], 2.6, { bevel: 0.6, z: s * 6.2 }));
  f.add("alu", G.T(G.tubeX(9.6, 7.9, -4.5, 4.5, { seg: 40, c: 0.6 }), { p: [0, 30.5, 0] }));
  f.add("steel", G.cylY(3.3, 9, 13.5, { seg: 20, c: 0.5 }));
  f.add("steel", G.T(G.flutesX(3.1, 9.5, 13, 12, 0.8, 0.5), { r: [0, 0, 90] }));
  f.add("steel", G.cylY(1.9, 13, 30.5, { seg: 12, c: 0.3 }));
  f.add("steel", G.extrudeZ([[-1, 30], [1, 30], [0.8, 35.5, 0.3], [-0.8, 35.5, 0.3]], 1.6, { bevel: 0.2 }));
  f.add("tritium", G.T(G.sphere(0.55), { p: [-0.9, 34.4, 0] }));
  const flip = G.node("flip", [f.build()]);
  flip.position.set(-9, 5, 0);
  flip.children[0].position.set(9, -5, 0);
  return { root: G.node("hk_front", [k.build(), flip]), irons: { front: [0, 35.5, 0] }, flip: { node: flip, angle: 90 } };
}
function hkDiopter(ctx) {
  const { G } = ctx;
  const k = ctx.kit(), f = ctx.kit();
  k.add("alu", ctx.C.clampBody(-15, 15, 5.5));
  k.add("steel", ctx.C.crossBolt(0));
  const ear = [[-12, 0, 1], [12, 0, 1], [12, 30, 3], [7, 46, 4], [-7, 46, 4], [-12, 30, 3]];
  f.add("alu", G.extrudeZ(ear, 3, { bevel: 0.6, z: 11 }));
  f.add("alu", G.extrudeZ(ear, 3, { bevel: 0.6, z: -11 }));
  f.add("alu", G.extrudeZ([[-12, 0, 1], [12, 0, 1], [12, 22, 2], [-12, 22, 2]], 25, { bevel: 0.8 }));
  const AP = 2.1, Y = 35.5;
  for (const s of [-1, 1]) f.add("steel", G.T(G.cylZ(9.8, s > 0 ? AP : -8.5, s > 0 ? 8.5 : -AP, { seg: 28, c: 0.6 }), { p: [0, Y, 0] }));
  const half = (sg) => {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.asin(AP / 9.8) + i / 14 * (Math.PI - 2 * Math.asin(AP / 9.8));
      pts.push([Math.cos(a) * 9.8, sg * Math.sin(a) * 9.8]);
    }
    return pts;
  };
  for (const sg of [-1, 1]) f.add("steel", G.T(G.extrudeZ(half(sg), AP * 2 + 0.2, { bevel: 0.2 }), { p: [0, Y, 0] }));
  for (let a = 0; a < 360; a += 15) {
    if (Math.min(Math.abs(a - 180), a, 360 - a) < 25 || Math.abs(a - 90) < 8 || Math.abs(a - 270) < 8) continue;
    const t = a * Math.PI / 180;
    f.add("steel", G.T(G.box(1.1, 0.9, 15.6, { bevel: 0.25 }), { r: [0, 0, a], p: [Math.cos(t) * 10, Y + Math.sin(t) * 10, 0] }));
  }
  for (const s of [-1, 1]) f.add("lensBlack", G.cylY(1.4, -0.25, 0.25, { seg: 14 }), { p: [0, Y + s * 9.6, 0] });
  for (const [txt, a] of [["2", 90], ["3", 0], ["4", 270], ["5", 180]]) {
    const t = a * Math.PI / 180;
    f.add("steelWorn", engrave(ctx, txt, { h: 2.4, basis: "right", p: [Math.cos(t) * 6, Y + Math.sin(t) * 6, 8.45] }));
  }
  f.add("steel", G.T(G.tubeX(6.2, AP, -10.6, -9.2, { seg: 32, c: 0.3 }), { p: [0, Y, 0] }));
  f.add("steel", G.T(ctx.C.knob(5, 2.9, 14), { r: [0, -90, 0], p: [0, Y, 9.5] }));
  f.add("paintWhite", G.box(0.5, 3, 0.2, { bevel: 0 }), { p: [0, Y + 2.2, 12.45] });
  const flip = G.node("flip", [f.build()]);
  flip.position.set(12, 5.5, 0);
  flip.children[0].position.set(-12, -5.5, 0);
  return { root: G.node("hk_diopter", [k.build(), flip]), irons: { rear: [0, 35.5, 0], type: "aperture" }, flip: { node: flip, angle: -90 } };
}
function hkFlashHider(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  const flat = G.circle(0, 0, 10.6, 40).map(([z, y]) => [Math.max(-8.8, Math.min(8.8, z)), y]);
  k.add("steel", G.extrudeX(flat, -11, 5, { bevel: 0.7 }));
  k.add("steel", G.latheX([[4, 0], [4, 10.6], [14, 10.6], [15.2, 10.1], [15.2, 6.8], [16.2, 3.2], [16.2, 0]], { seg: 40 }));
  k.add("lensBlack", G.cylX(3.2, 15.6, 16.4, { seg: 16 }));
  const r0 = 6.8, r1 = 10.5, sw = 1.4;
  const ho = Math.PI / 6 - sw / r1, hi = Math.PI / 6 - sw / r0;
  const tine = [];
  for (let j = 0; j <= 8; j++) {
    const t = -ho + 2 * ho * j / 8;
    tine.push([Math.sin(t) * r1, Math.cos(t) * r1]);
  }
  for (let j = 8; j >= 0; j--) {
    const t = -hi + 2 * hi * j / 8;
    tine.push([Math.sin(t) * r0, Math.cos(t) * r0]);
  }
  for (let i = 0; i < 6; i++) k.add("steel", G.T(G.extrudeX(tine, 14.8, 49.4, { bevel: 0.45 }), { r: [i * 60 + 30, 0, 0] }));
  k.add("steel", G.latheX([[49, r0], [49, r1], [52.4, r1], [53.5, 9.4], [53.5, 7.6], [52.9, r0], [49, r0]], { seg: 40 }));
  return { root: k.build("hk_fh"), muzzle: { x: 53.5, kind: "fh", flash: 0.35 } };
}
function stockHkSlim(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  k.add("poly", G.sideLoft([[-10, 25], [40, 25], [88, 24], [130, 21], [152, 16]], [[-10, -94], [4, -86], [60, -52], [116, -22], [152, -16]], { w: 38, k: 3.6, width: (t) => 0.9 + 0.1 * t, rings: 28 }));
  const slotO = G.slot(9, 35, -48, 9, 8), slotI = G.slot(10.6, 33.4, -48, 5.8, 8);
  const pan = G.shape([[4, -26, 5], [96, -22, 5], [60, -40, 6], [12, -66, 6], [4, -64, 3]], [slotO]);
  for (const s of [-1, 1]) {
    k.add("polySoft", G.extrudeZ(pan, 3.6, { bevel: 0.5, z: s * 16.4 }));
    k.add("poly", G.extrudeZ(G.shape(slotO, [slotI]), 1.2, { bevel: 0.35, z: s * 17.1 }));
    k.add("lensBlack", G.extrudeZ(slotI, 0.3, { bevel: 0.05, z: s * 17.15 }));
  }
  k.add("rubber", G.extrudeZ([[-10, 26, 3], [-26, 25, 5], [-27, -95, 5], [-10, -96, 3]], 41, { bevel: 4 }));
  for (let i = 0; i < 9; i++) k.add("rubber", G.T(G.box(2, 3, 38), { p: [-27, 16 - i * 13, 0] }));
  for (const y of [8, -72]) k.add("steel", G.T(G.screwHead(2.4, 1), { r: [0, -90, 0], p: [-26.4, y, 0] }));
  k.add("poly", G.extrudeZ([[112, -18, 2], [146, -16, 2], [146, -24, 3], [118, -26, 3]], 14, { bevel: 1.5 }));
  k.add("steel", G.cylZ(1.6, -7.4, 7.4, { seg: 12, c: 0.3 }), { p: [140, -20, 0] });
  for (let i = 0; i < 4; i++) k.add("poly", G.box(1.2, 1, 12, { bevel: 0.3 }), { p: [118 + i * 3.4, -25.6 + i * 0.28, 0] });
  for (const s of [-1, 1]) {
    k.add("steel", G.cylZ(5.5, 0, 2.6, { seg: 20, c: 0.5 }), { p: [14, -22, s > 0 ? 17 : -19.6] });
    k.add("lensBlack", G.cylZ(3.2, 0, 0.6, { seg: 14 }), { p: [14, -22, s > 0 ? 19.4 : -20] });
  }
  return { root: k.build("hk_slim"), cheek: { x: 70, y: 25 } };
}
function stockCTR(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  k.add("poly", G.sideLoft([[-8, 24], [36, 22.5], [118, 20], [150, 17]], [[-8, -24], [30, -24], [92, -22], [150, -17]], { w: 36, k: 3.4, rings: 24 }));
  k.add("poly", G.extrudeZ([[-8, 20, 3], [10, 20, 3], [10, -92, 4], [-8, -92, 4]], 34, { bevel: 4, curve: 6 }));
  k.add("poly", G.extrudeZ([[2, -92, 3], [16, -92, 3], [106, -24, 5], [88, -18, 5], [2, -76, 4]], 28, { bevel: 4, curve: 6 }));
  k.add("poly", G.T(G.cylX(19, 60, 150, { c: 3, seg: 28 }), { p: [0, 0, 0] }));
  k.add("poly", G.extrudeZ([[96, -18, 2], [144, -18, 2], [144, -30, 3], [100, -28, 3]], 20, { bevel: 2 }));
  k.add("steel", G.cylZ(3, -11, 11, { seg: 14 }), { p: [128, -26, 0] });
  k.add("rubber", G.extrudeZ([[-8, 24, 3], [-22, 23, 4], [-22, -93, 4], [-8, -93, 3]], 38, { bevel: 3.5 }));
  for (let i = 0; i < 10; i++) k.add("rubber", G.T(G.box(1.6, 2.6, 34), { p: [-22.2, 16 - i * 11.5, 0] }));
  k.add("steel", G.wire([[20, -80, 0], [14, -99, 0], [-2, -99, 0], [-4, -84, 0]], 1.8, { n: 30 }));
  return { root: k.build("ctr"), cheek: { x: 60, y: 23 } };
}
function stockSopmod(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  const pro = [[150, -17, 3], [150, 18, 4], [110, 28, 16], [-8, 30, 5], [-8, -90, 6], [110, -22, 26]];
  k.add("poly", G.extrudeZ(pro, 34, { bevel: 4 }));
  for (const s of [-1, 1]) {
    k.add("poly", G.T(G.cylX(13, -6, 118, { c: 4, seg: 24 }), { p: [0, 12, s * 18] }));
    k.add("poly", G.T(G.cylX(11.5, 118, 132, { c: 2, seg: 24 }), { p: [0, 12, s * 18] }));
    k.add("steel", G.T(G.cylX(9, 130, 134, { c: 1, seg: 20 }), { p: [0, 12, s * 18] }));
  }
  k.add("poly", G.extrudeZ([[104, -20, 2], [146, -18, 2], [146, -27, 3], [110, -28, 3]], 18, { bevel: 2 }));
  k.add("rubber", G.extrudeZ([[-8, 30, 3], [-24, 29, 4], [-24, -91, 5], [-8, -91, 3]], 60, { bevel: 4 }));
  for (let i = 0; i < 10; i++) k.add("rubber", G.T(G.box(1.8, 2.6, 56), { p: [-24.2, 22 - i * 12, 0] }));
  return { root: k.build("sopmod"), cheek: { x: 60, y: 30 } };
}
function stanagProfile(len, depth, curve, top = 48) {
  const pts = [];
  const off = (y) => y > -20 ? 0 : curve * Math.pow((-20 - y) / (len - 20), 1.6);
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const y = top - i / n * (top + len);
    pts.push([-depth / 2 + off(y), y]);
  }
  for (let i = n; i >= 0; i--) {
    const y = top - i / n * (top + len);
    pts.push([depth / 2 + off(y), y]);
  }
  return { pts, off };
}
function magRounds(ctx, k, cal, top, x = -4, body = null, mat = "steelPark") {
  if (body) ctx.C.feedLips(body, mat, -31, 2, 48, 11.5);
  ctx.C.cartridge(k, cal, { p: [x - 26, top + 3.6, -2.6], r: [0, 0, -2] });
  ctx.C.cartridge(k, cal, { p: [x - 26, top - 3.2, 2.6], r: [0, 0, -2] });
}
function stanag(ctx, o) {
  const { G } = ctx;
  const k = ctx.kit(), rk = ctx.kit();
  const len = o.len, depth = 62, W = 23;
  const { pts, off } = stanagProfile(len, depth, o.curve ?? 22);
  k.add(o.mat, G.extrudeZ(pts.map((p) => [p[0], p[1], 0]), W, { bevel: o.bevel ?? 1.2 }));
  const edge = (sx, ins) => {
    const out = [];
    for (let y = -6; y >= -len + 6; y -= 8) out.push([sx * (depth / 2 - ins) + off(y), y, 0]);
    return out;
  };
  for (const sx of [-1, 1]) k.add(o.mat, G.wire(edge(sx, 1.4), 1.9, { n: 60, seg: 10 }));
  if (o.ribs) {
    const inner = stanagProfile(len - 18, depth - 18, (o.curve ?? 22) * 0.9, 30).pts;
    for (const s of [-1, 1]) {
      k.add(o.mat, G.extrudeZ(inner.map((p) => [p[0], p[1] - 8, 0]), 1, { bevel: 0.4, z: s * (W / 2 + 0.2) }));
      k.add(o.mat, G.T(G.box(depth - 8, 2.2, 1.2, { bevel: 0.45 }), { p: [0, -8, s * (W / 2 + 0.3)] }));
    }
  }
  if (o.texture) {
    const rw = o.window ? depth - 26 : depth - 14, rx = o.window ? 7 : 1;
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
      const y = -24 - i * 5;
      k.add(o.mat, G.T(G.box(rw, 1.5, 1, { bevel: 0.35 }), { p: [off(y) + rx, y, s * (W / 2 + 0.2)] }));
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) for (const s of [-1, 1]) {
      const y = -len + 30 + r * 3.4, x = off(y) - 16 + c * 3.4;
      k.add(o.mat, G.box(1.9, 1.9, 1, { bevel: 0.35 }), { p: [x, y, s * (W / 2 + 0.15)] });
    }
  }
  k.add(o.follower || "polyTan", G.box(depth - 8, 3, W - 5), { p: [-2, o.top ?? 44, 0] });
  const fy = -len, rot = [0, 0, -Math.atan(off(fy) / len) * 20];
  const fp = o.texture ? [[-depth / 2 - 4, -4.5, 2], [depth / 2 + 6, -4.5, 2], [depth / 2 + 7, 1, 2], [depth / 2 + 1, 3.5, 1], [-depth / 2 - 1, 3.5, 1], [-depth / 2 - 5, 1, 2]] : [[-depth / 2 - 3, -3.5, 1.5], [depth / 2 + 4, -3.5, 1.5], [depth / 2 + 4, 3.5, 1], [-depth / 2 - 3, 3.5, 1]];
  k.add(o.plate || o.mat, G.T(G.extrudeZ(fp, W + 4, { bevel: o.texture ? 2 : 1.4 }), { p: [off(fy) + 2, fy - 1.5, 0], r: rot }));
  if (o.texture) for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.add(o.plate || o.mat, G.T(G.box(depth - 6, 0.9, 0.8, { bevel: 0.25 }), { p: [off(fy) + 2, fy - 3.4 + i * 1.9, s * (W / 2 + 2)], r: rot }));
  else k.add(o.plate || o.mat, G.T(G.cylY(3, -0.6, 0.6, { seg: 14 }), { p: [off(fy) + 14, fy - 5.2, 0] }));
  if (o.window) {
    k.add("glassDark", G.box(7, 60, 1, { bevel: 0.3 }), { p: [-depth / 2 + 10, -20, W / 2 + 0.1] });
    k.add(o.mat, G.extrudeZ(G.shape(G.rrect(-depth / 2 + 10, -20, 11, 64, 3), [G.rrect(-depth / 2 + 10, -20, 7.4, 60.4, 2)]), 1.2, { bevel: 0.35, z: W / 2 + 0.2 }));
  }
  magRounds(ctx, rk, o.cal || "556", 44, -4, k, o.lips || o.mat);
  const rounds = rk.build("rounds");
  return { root: G.node("mag", [k.build(), rounds]), mag: { cap: o.cap, rounds } };
}
function surefire60(ctx) {
  const { G } = ctx;
  const k = ctx.kit(), rk = ctx.kit();
  const { pts, off } = stanagProfile(150, 62, 10);
  k.add("alu", G.extrudeZ(pts.map((p) => [p[0], p[1] > -20 ? p[1] : p[1], 0]).map((p) => p), 23, { bevel: 1.2 }));
  const low = stanagProfile(150, 64, 10).pts.filter((p) => p[1] < -24).map((p) => [p[0], p[1], 0]);
  k.add("alu", G.extrudeZ(low, 38, { bevel: 3 }));
  k.add("alu", G.T(G.box(68, 8, 40, { bevel: 2 }), { p: [off(-150) + 2, -152, 0] }));
  magRounds(ctx, rk, "556", 44, -4, k, "alu");
  const rounds = rk.build("rounds");
  return { root: G.node("mag", [k.build(), rounds]), mag: { cap: 60, rounds } };
}
function drum60(ctx) {
  const { G } = ctx;
  const k = ctx.kit(), rk = ctx.kit();
  const { pts } = stanagProfile(70, 62, 0);
  k.add("poly", G.extrudeZ(pts.map((p) => [p[0], p[1], 0]), 23, { bevel: 1.2 }));
  for (const s of [-1, 1]) {
    k.add("poly", G.T(G.cylZ(58, 0, 34, { c: 4, seg: 40 }), { p: [8, -110, s > 0 ? 6 : -40] }));
    k.add("polySoft", G.T(G.cylZ(20, 0, 3, { c: 1, seg: 28 }), { p: [8, -110, s > 0 ? 39 : -43] }));
    k.add("glassDark", G.T(G.cylZ(9, 0, 1, { seg: 20 }), { p: [8, -110, s > 0 ? 42 : -44] }));
  }
  k.add("poly", G.T(G.box(20, 30, 12), { p: [8, -170, 0] }));
  magRounds(ctx, rk, "556", 44, -4, k, "poly");
  const rounds = rk.build("rounds");
  return { root: G.node("mag", [k.build(), rounds]), mag: { cap: 60, rounds } };
}
function charger(ctx, kind) {
  const { G } = ctx;
  const k = ctx.kit();
  k.add("alu", G.extrudeX(G.rrect(0, 0, 11, 6, 1.5), -6, 40, { bevel: 0.6 }));
  const wing = (z0, z1, ext) => G.extrudeY(G.shape([[-3, z0, 2], [-14 - ext, z0 + (z1 > z0 ? 0 : 0), 3], [-14 - ext, z1, 3], [-3, z1, 2]]), -4, 3, { bevel: 1 });
  if (kind === "std") {
    k.add("alu", G.extrudeY(G.shape([[0, -17, 2], [-13, -17, 4], [-13, 17, 4], [0, 17, 2]].map(([x, z, r]) => [x, z, r])), -4, 3, { bevel: 1 }));
    k.add("alu", G.extrudeY(G.shape([[-4, -17], [-12, -17, 2], [-12, -24, 3], [-4, -22, 2]]), -4, 2.5, { bevel: 0.8 }));
  } else if (kind === "raptor") {
    k.add("alu", G.extrudeY(G.shape([[0, -14, 2], [-12, -14, 3], [-12, 14, 3], [0, 14, 2]]), -4, 3, { bevel: 1 }));
    for (const s of [-1, 1]) k.add("poly", G.extrudeY(G.shape([[-2, s * 12], [-18, s * 13, 4], [-18, s * 32, 6], [-6, s * 30, 5]]), -5, 4, { bevel: 1.4 }));
  } else {
    k.add("alu", G.extrudeY(G.shape([[0, -17, 2], [-13, -17, 4], [-13, 17, 4], [0, 17, 2]]), -4, 3, { bevel: 1 }));
    k.add("alu", G.extrudeY(G.shape([[-3, -16], [-16, -17, 3], [-17, -34, 6], [-6, -30, 5]]), -5, 3, { bevel: 1.2 }));
  }
  return { root: k.build("charger"), charger: { travel: 64 } };
}
var M416_PARTS = [
  { id: "hk_quad", cat: "hg", name: "HK416 Quad Rail", desc: "Штатное цевьё с четырьмя планками Пикатинни", fit: { iface: ["hk416"] }, stats: { weight: 330, ergo: 0 }, build: quadRail },
  { id: "hk_mlok", cat: "hg", name: 'Цевьё M-LOK 10,5"', desc: "Облегчённое, верхняя планка + секции M-LOK", fit: { iface: ["hk416"] }, stats: { weight: 210, ergo: 6, length: 10 }, build: mlokRail },
  { id: "hk_fh", cat: "muzzle", name: "HK пламегаситель", desc: "Штатный щелевой пламегаситель", fit: { thread: ["1/2x28"] }, stats: { weight: 60, length: 44, flash: -45, loud: 0 }, build: hkFlashHider },
  { id: "hk_diopter", cat: "rearsight", name: "HK диоптр (складной)", desc: "Барабан с четырьмя диоптрами 200–500 м", foot: [-15, 15], body: [-15, 15], stats: { weight: 80 }, build: hkDiopter },
  { id: "hk_front", cat: "frontsight", name: "HK мушка (складная)", desc: "Мушка в кольцевом намушнике, тритий", foot: [-11, 11], body: [-11, 11], stats: { weight: 60 }, build: hkFront },
  { id: "hk_slim", cat: "stock", name: "HK A5 Slimline", desc: "Штатный 6-позиционный приклад", mountTypes: ["stock"], fit: { iface: ["ar"] }, body: [-40, 150], stats: { weight: 260, ergo: 0, "recoilV%": 0 }, build: stockHkSlim },
  { id: "ctr", cat: "stock", name: "Magpul CTR", desc: "Лёгкий, фрикционный фиксатор без люфта", mountTypes: ["stock"], fit: { iface: ["ar"] }, body: [-30, 150], stats: { weight: 230, ergo: 4, "recoilV%": 2 }, build: stockCTR },
  { id: "sopmod", cat: "stock", name: "B5 SOPMOD", desc: "Широкая щека, отсеки под батареи", mountTypes: ["stock"], fit: { iface: ["ar"] }, body: [-30, 150], stats: { weight: 330, ergo: -2, "recoilV%": -6 }, build: stockSopmod },
  { id: "hk_steel30", cat: "mag", name: "HK Steel 30", desc: "Стальной магазин HK на 30 патронов", fit: { iface: ["stanag"] }, stats: { weight: 470, mag: 30 }, build: (c) => stanag(c, { len: 128, mat: "steelPark", ribs: true, cap: 30, follower: "polyTan" }) },
  { id: "pmag30", cat: "mag", name: "Magpul PMAG 30 Gen M3", desc: "Полимер, 30 патронов", fit: { iface: ["stanag"] }, stats: { weight: 420, mag: 30, ergo: 1 }, build: (c) => stanag(c, { len: 128, mat: "poly", texture: true, cap: 30, follower: "polyGrey", bevel: 1.6 }) },
  { id: "pmag30w", cat: "mag", name: "PMAG 30 с окном", desc: "Окно контроля остатка", fit: { iface: ["stanag"] }, stats: { weight: 425, mag: 30 }, build: (c) => stanag(c, { len: 128, mat: "polyFde", texture: true, cap: 30, window: true, follower: "polyGrey", bevel: 1.6 }) },
  { id: "pmag40", cat: "mag", name: "Magpul PMAG 40", desc: "Удлинённый, 40 патронов", fit: { iface: ["stanag"] }, stats: { weight: 560, mag: 40, ergo: -3, adsTime: 10 }, build: (c) => stanag(c, { len: 168, curve: 22, mat: "poly", texture: true, cap: 40, follower: "polyGrey", bevel: 1.6 }) },
  { id: "sf60", cat: "mag", name: "SureFire MAG5-60", desc: "Четырёхрядный, 60 патронов", fit: { iface: ["stanag"] }, stats: { weight: 800, mag: 60, ergo: -6, adsTime: 20 }, build: surefire60 },
  { id: "d60", cat: "mag", name: "Magpul D-60", desc: "Барабан на 60 патронов", fit: { iface: ["stanag"] }, stats: { weight: 1100, mag: 60, ergo: -9, adsTime: 30 }, build: drum60 },
  { id: "ch_std", cat: "charger", name: "Штатная рукоять", desc: "Mil-spec, защёлка слева", fit: { iface: ["ar"] }, stats: { weight: 30 }, build: (c) => charger(c, "std") },
  { id: "ch_bcm", cat: "charger", name: "BCM Gunfighter Mod 4", desc: "Увеличенная защёлка", fit: { iface: ["ar"] }, stats: { weight: 36, ergo: 2 }, build: (c) => charger(c, "bcm") },
  { id: "ch_raptor", cat: "charger", name: "Radian Raptor", desc: "Двусторонняя, удобна с оптикой", fit: { iface: ["ar"] }, stats: { weight: 40, ergo: 3 }, build: (c) => charger(c, "raptor") }
];

// ---- weapons/m416.js
var RAIL_TOP2 = 30.5;
function upperReceiver(ctx, k) {
  const { G } = ctx;
  const sec = [[14.5, -13, 1], [14.5, 7, 1], [13.4, 10.2, 1], [11, 15, 2], [-11, 15, 2], [-13.4, 10.2, 1], [-14.5, 7, 1], [-14.5, -13, 1]];
  const rB = 12.4, yT = 5, yB = -8;
  const port = [[14.5, yT], [14.5, 7], [13.4, 10.2], [11, 15], [-11, 15], [-13.4, 10.2], [-14.5, 7], [-14.5, -13], [14.5, -13], [14.5, yB]];
  const a0 = Math.atan2(yB, Math.sqrt(rB * rB - yB * yB)), a1 = Math.atan2(yT, Math.sqrt(rB * rB - yT * yT)) - Math.PI * 2;
  for (let i = 0; i <= 28; i++) {
    const a = a0 + (a1 - a0) * (i / 28);
    port.push([Math.cos(a) * rB, Math.sin(a) * rB]);
  }
  k.add("alu", G.extrudeX(sec, -142, -58.8, { bevel: 0.8 }));
  k.add("alu", G.extrudeX(port, -60, 8, { bevel: 0.25 }));
  k.add("alu", G.extrudeX(sec, 6.8, 38, { bevel: 0.8 }));
  const r = G.picatinny(178, { base: RAIL_TOP2 - 14.5 });
  k.add("alu", r.geo, { p: [-141, RAIL_TOP2, 0] });
  k.add("steelWorn", railMarks(ctx, r, 1), { p: [-141, RAIL_TOP2, 0] });
  k.add("alu", G.extrudeX([[-9, -13, 1], [9, -13, 1], [9, -4, 2], [-9, -4, 2]], -150, -140, { bevel: 0.6 }));
  k.add("alu", G.extrudeY([[-80, 14.2], [-60, 14.2], [-60.5, 17.6, 1.5], [-65, 21, 3], [-74, 20, 6]], -3.5, 12.5, { bevel: 1.6 }));
  const rings = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    rings.push({ x: -129 + 52 * t, pts: G.superEllipse(11.5 * Math.pow(1 - t, 1.25) + 0.8, 6.9 - 3.4 * t, 2.6, 28, 5 + t, 14.2) });
  }
  k.add("alu", G.loftX(rings, { flip: true, crease: 50 }));
  const fa = { r: [0, 12, 0], p: [-130, 5, 19.5] };
  k.add("alu", G.T(G.latheX([[0, 0], [0, 6.4], [0.8, 7.2], [14, 7.2], [18, 6], [18, 0]], { seg: 28 }), fa));
  const btn = [G.cylX(5.4, -8.6, 0.5, { c: 0.7, seg: 24 }), G.ringGrooves(5.5, -6.5, -1.5, 3, 0.35, { seg: 24 })];
  for (let i = -2; i <= 2; i++) {
    const y = i * 2.05, c = Math.sqrt(4.9 * 4.9 - y * y);
    btn.push(G.T(G.box(0.9, 1, c * 2, { bevel: 0.2 }), { p: [-8.8, y, 0] }));
  }
  for (const g of btn) k.add("steel", G.T(g, fa));
  k.add("steel", G.pin(2.2, 30), { p: [-122, -8, 0] });
  for (const [a, b] of [[-64, -60.4], [8.4, 12]]) k.add("alu", G.cylX(2.4, a, b, { c: 0.4, seg: 16 }), { p: [0, -9.5, 15.5] });
  for (const x of [22, 32]) k.pair("steel", G.screwHead(2.6, 1.2), { p: [x, -7.5, 14.4] });
  return { railFirst: -141 + r.first, railSlots: r.slots };
}
function bullet(G, x, y, s = 1) {
  return G.T(G.extrudeZ([[-0.7, -1.8], [0.7, -1.8], [0.7, 0.5], [0, 1.8], [-0.7, 0.5]].map(([u, v]) => [u * s, v * s]), 0.16, { bevel: 0.04 }), { p: [x, y, 0] });
}
function lowerReceiver(ctx, k, nodes) {
  const { G } = ctx;
  const body = [[-150, -13], [30, -13], [30, -24], [-40, -24], [-42, -40, 2], [-118, -40], [-124, -44, 2], [-150, -44, 3], [-156, -30, 6], [-156, -13]];
  k.add("alu", G.extrudeZ(body, 24, { bevel: 1.6 }));
  const well = G.shape(G.rrect(-6, 0, 74, 31, 3), [G.rrect(-6, 0, 67, 25, 2)]);
  k.add("alu", G.extrudeY(well, -60, -14, { bevel: 0.8 }));
  const flare = G.shape(G.rrect(-5, 0, 80, 35, 5), [G.rrect(-6, 0, 67, 25, 2)]);
  k.add("alu", G.extrudeY(flare, -65, -58, { bevel: 1.4 }));
  for (let i = 0; i < 12; i++) k.add("alu", G.box(1.4, 1.3, 24, { bevel: 0.4 }), { p: [31.1, -21 - i * 3, 0] });
  k.add("steelWorn", engrave(ctx, "HK416 A5", { h: 4.2, basis: "left", p: [-6, -29, -15.47] }));
  k.add("steelWorn", engrave(ctx, "5,56MM X45", { h: 2.6, basis: "left", p: [-6, -38, -15.47] }));
  k.add("steelWorn", engrave(ctx, "HK 21-09734", { h: 2.2, basis: "right", p: [-6, -44, 15.47] }));
  k.add("alu", G.extrudeZ([[26, -13], [44, -13], [44, -20, 4], [38, -26, 4], [26, -26]], 22, { bevel: 1.2 }));
  const tg = G.shape(
    [[-42, -38], [-44, -54, 4], [-53, -62, 6], [-110, -58, 8], [-122, -46, 4], [-122, -38]],
    [[[-50, -40], [-50, -51, 3], [-58, -56, 5], [-106, -52, 6], [-114, -44, 3], [-114, -40]]]
  );
  k.add("alu", G.extrudeZ(tg, 13, { bevel: 2 }));
  k.add("alu", G.extrudeZ([[-50, -16], [-38, -16], [-38, -34, 3], [-50, -34, 3]], 3, { bevel: 0.8, z: 13 }));
  k.add("steel", G.cylZ(5.2, 12, 15.2, { c: 0.6, seg: 24 }), { p: [-44, -25, 0] });
  for (const y of [-27, -25, -23]) k.add("steel", G.box(7, 0.8, 0.8, { bevel: 0.2 }), { p: [-44, y, 15.4] });
  k.add("steel", G.extrudeZ([[-38, -33.5, 1], [-38, -36, 1], [-51, -37, 1.5], [-54.5, -43.5, 1.5], [-58.5, -43, 1.5], [-57, -34, 2]], 1.8, { bevel: 0.5, z: 12.9 }));
  for (const y of [-39.5, -41.5]) k.add("steel", G.box(4, 0.6, 0.6, { bevel: 0.15 }), { p: [-56.2, y, 14] });
  k.add("alu", G.extrudeZ([[-61, -14], [-43, -14], [-43, -22, 2], [-50, -25, 3], [-61, -21, 2]], 2.4, { bevel: 0.7, z: -12.6 }));
  k.add("steel", G.extrudeZ([[-60, -15, 1], [-46, -15, 1], [-44.5, -18, 1], [-47.5, -33, 2.5], [-57, -33.5, 2.5], [-59, -26, 1.5]], 2.2, { bevel: 0.6, z: -14.5 }));
  for (const y of [-26, -28.2, -30.4]) k.add("steel", G.box(9, 0.7, 0.7, { bevel: 0.2 }), { p: [-52.4, y, -15.7] });
  k.add("steel", G.cylZ(1.6, -15.9, -13, { seg: 12, c: 0.2 }), { p: [-53, -17.5, 0] });
  k.add("steel", G.extrudeZ([[-52, -35], [-41, -35], [-40, -38, 1], [-51, -39.5, 1.5]], 1.8, { bevel: 0.5, z: -12.9 }));
  const pinHead = G.latheX([[0, 0], [0, 4.6], [0.4, 5], [1.2, 5], [1.5, 4.3], [2, 4.3], [2.3, 3.7], [2.3, 0]], { seg: 24 });
  for (const [x, y] of [[36, -18], [-138, -18]]) {
    k.add("steel", G.cylZ(3.2, -12.25, 12.1, { c: 0.35, seg: 20 }), { p: [x, y, 0] });
    k.add("steel", G.T(pinHead.clone(), { r: [0, -90, 0], p: [x, y, 11.8] }));
  }
  for (const [x, y] of [[-74, -34], [-86, -21]]) k.add("steel", G.cylZ(2.4, -12.2, 12.2, { c: 0.3, seg: 16 }), { p: [x, y, 0] });
  const SX = -106, SY = -28;
  for (const side of [1, -1]) {
    const add = (mat, g) => k.add(mat, side > 0 ? G.T(g, { p: [0, 0, 12.02] }) : G.T(G.mirrorZ(g), { p: [0, 0, -12.02] }));
    add("paintWhite", bullet(G, SX + 12, SY));
    add("paintWhite", G.T(G.box(5.4, 0.45, 0.16, { bevel: 0 }), { r: [0, 0, 55], p: [SX + 12, SY, 0] }));
    add("paintRed", bullet(G, SX, SY + 10.6, 0.9));
    for (const dx of [-1.9, 0, 1.9]) add("paintRed", bullet(G, SX - 12.5 + dx, SY, 0.75));
  }
  k.add("alu", G.T(G.cylX(17, -158, -142, { c: 1.5, seg: 32 }), { p: [0, 1, 0] }));
  k.add("steel", G.T(G.cylX(17.4, -168, -159, { c: 0.8, seg: 32 }), { p: [0, 1, 0] }));
  k.add("steel", G.T(G.flutesX(17, -166.5, -160.5, 8, 5, 2.4), { p: [0, 1, 0] }));
  k.add("steel", G.T(G.latheX([[-172, 0], [-172, 17], [-168, 19], [-168, 0]], { seg: 32 }), { p: [0, 1, 0] }));
  for (const s of [-1, 1]) {
    k.add("steel", G.cylZ(6, 0, 7, { c: 0.8, seg: 20 }), { p: [-166, 1, s > 0 ? 17 : -24] });
    k.add("lensBlack", G.cylZ(3.6, 0, 1, { seg: 16 }), { p: [-166, 1, s > 0 ? 23.6 : -24.6] });
  }
  k.add("alu", G.T(G.cylX(14.6, -338, -160, { c: 1.2, seg: 32 }), { p: [0, 1, 0] }));
  k.add("alu", G.extrudeX(G.rrect(0, -14.5, 9, 6, 1.5), -330, -168, { bevel: 0.6 }), { p: [0, 1, 0] });
  for (let i = 0; i < 6; i++) k.add("lensBlack", G.cylY(2, -1, 1, { seg: 12 }), { p: [-228 - i * 16, -16.5, 0] });
  const tk = ctx.kit();
  tk.add("steel", G.extrudeZ([[-3, 4], [3, 4], [3, -6, 2], [0, -16, 4], [-6, -22, 2], [-7.5, -20], [-3, -9, 3]], 6, { bevel: 1 }));
  tk.add("steel", G.cylZ(2.9, -3.4, 3.4, { seg: 16, c: 0.3 }));
  nodes.trigger = G.node("trigger", [tk.build()], { p: [-74, -34, 0] });
  const sk = ctx.kit();
  sk.add("steel", G.extrudeZ([[0, -4.2, 2], [13.5, -3, 2.5], [15.5, 0, 1.2], [13.5, 3, 2.5], [0, 4.2, 2]], 2.6, { bevel: 0.8, z: -13.7 }));
  sk.add("steel", G.extrudeZ([[0, -3.5, 2], [9.5, -2.6, 2], [10.5, 0, 1], [9.5, 2.6, 2], [0, 3.5, 2]], 2.4, { bevel: 0.6, z: 13.6 }));
  for (const x of [9, 11, 13]) sk.add("steel", G.box(0.7, 5.2 - (x - 9) * 0.5, 0.6, { bevel: 0.2 }), { p: [x, 0, -15.1] });
  for (const x of [6.5, 8.3]) sk.add("steel", G.box(0.7, 4.4, 0.6, { bevel: 0.2 }), { p: [x, 0, 14.9] });
  sk.add("steel", G.cylZ(5.4, -15.2, 15, { c: 0.6, seg: 24 }));
  nodes.selector = G.node("selector", [sk.build()], { p: [SX, SY, 0] });
  return [nodes.trigger, nodes.selector];
}
function barrel(ctx, k) {
  const { G } = ctx;
  k.add("steel", G.latheX([[38, 0], [38, 12], [60, 12], [61, 10.4], [250, 10.4], [252, 9.6], [354.5, 9.6], [355.5, 8.6], [357, 8.2], [357, 0]], { seg: 32 }));
  k.add("steel", G.ringGrooves(6.3, 357, 366.8, 11, 0.35, { seg: 24 }));
  k.add("steel", G.latheX([[366.6, 0], [366.6, 6.1], [368, 5.3], [368, 3.2], [367.2, 2.8], [362, 2.8], [362, 0]], { seg: 24 }));
  k.add("steel", G.extrudeX([[-13, -10.5, 5], [13, -10.5, 5], [13, 10, 3], [8, 19, 4], [-8, 19, 4], [-13, 10, 3]], 258, 286, { bevel: 1.2 }));
  k.add("steel", G.T(G.cylX(7, 238, 262, { seg: 20 }), { p: [0, 14, 0] }));
  for (const x of [264, 280]) k.add("steel", G.pin(2, 27.2), { p: [x, -5, 0] });
  k.add("steel", G.T(ctx.C.knob(5.5, 4, 16), { r: [0, 90, 0], p: [272, 12, -12.6] }));
}
function carrierGroup(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  k.add("steelPark", G.latheX([[-190, 0], [-190, 11.2], [-186, 12], [-60, 12], [-58, 11], [-44, 11], [-42, 12], [-6, 12], [-5, 10], [-5, 0]], { seg: 32 }));
  k.add("steelPark", G.extrudeX(G.rrect(0, 12.5, 9, 6, 1.5), -150, -20, { bevel: 0.6 }));
  for (const x of [-35, -26]) k.add("lensBlack", G.T(G.cylZ(1.5, 0, 1, { seg: 14 }), { s: [1.9, 1, 1], p: [x, 3.5, 11.3] }));
  k.add("steelWorn", G.box(7, 3, 6, { bevel: 0.6 }), { p: [-32, 12.4, 0] });
  k.add("steelWorn", G.latheX([[-6, 0], [-6, 8.2], [4, 8.2], [4.6, 7.4], [4.6, 0]], { seg: 20 }));
  for (let i = 0; i < 7; i++) k.add("steelWorn", G.T(G.box(4, 3, 3.6, { bevel: 0.4 }), { p: [2.8, 9, 0], r: [i * 51.4, 0, 0] }));
  k.add("steel", G.extrudeZ([[-18, 6], [2, 6], [3, 8.2, 0.6], [2, 9.5], [-18, 9.5]], 3, { bevel: 0.5, z: 7.2 }));
  k.add("steel", G.cylZ(0.9, 6.5, 9.6, { seg: 10 }), { p: [-12, 7.8, 0] });
  return G.node("carrier", [k.build()]);
}
function dustCover(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  k.add("steelPark", G.extrudeZ([[-60, 1.2, 1], [8, 1.2, 1], [8, 15, 1.5], [-60, 15, 1.5]], 1.4, { bevel: 0.4, z: -0.2 }));
  k.add("steelPark", G.extrudeZ([[-54, 4.6, 3], [-3.5, 4.6, 3], [-3.5, 11.6, 3], [-54, 11.6, 3]], 1.2, { bevel: 0.45, z: 0.6 }));
  for (const [a, b] of [[-59.8, -33], [-23, 7.8]]) k.add("steelPark", G.tubeX(2.1, 1.45, a, b, { seg: 16, c: 0.4 }));
  k.add("steel", G.cylX(1.4, -64.5, 12.6, { seg: 12, c: 0.3 }));
  k.add("steel", G.tubeX(2, 1.3, 12.6, 13.4, { seg: 14, c: 0.2 }));
  k.add("steel", G.T(G.latheX([[0, 0], [0, 2.2], [0.5, 2.2], [0.9, 1.4], [0.9, 0]], { seg: 16 }), { r: [0, -90, 0], p: [-57, 12.4, 0.45] }));
  return G.node("dustCover", [k.build()], { p: [0, -9.5, 15.5] });
}
function build(ctx) {
  const { G, THREE: THREE9 } = ctx;
  const k = ctx.kit();
  const nodes = {};
  const up = upperReceiver(ctx, k);
  const lowerNodes = lowerReceiver(ctx, k, nodes);
  barrel(ctx, k);
  const body = k.build("receiver");
  nodes.carrier = carrierGroup(ctx);
  nodes.dustCover = dustCover(ctx);
  const root = G.node("m416", [body, nodes.carrier, nodes.dustCover, ...lowerNodes]);
  root.add(ctx.railMount("upperRail", [up.railFirst, RAIL_TOP2, 0], "top", up.railSlots, { axis: "top" }));
  root.add(ctx.mount({ id: "hg", type: "hg", p: [38, 0, 0] }));
  root.add(ctx.mount({ id: "muzzle", type: "thread", p: [368, 0, 0] }));
  root.add(ctx.mount({ id: "magwell", type: "magwell", p: [-6, -62, 0] }));
  root.add(ctx.mount({ id: "grip", type: "grip", p: [-121, -40, 0] }));
  root.add(ctx.mount({ id: "stock", type: "stock", p: [-338, 1, 0], slots: 6, pitch: -16, axis: "stock" }));
  root.add(ctx.mount({ id: "charger", type: "charger", p: [-142, 18, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 92, portCover: nodes.dustCover, selector: { safe: 0, semi: 90, auto: 180 } },
    eject: { p: [-26, 2, 16], dir: [0.25, 0.35, 1] },
    muzzle: [368, 0, 0],
    chamber: [0, 0, 0],
    eyeX: -238,
    cheekY: RAIL_TOP2 + 22,
    focus: { center: [20, -20, 0], size: 920 }
  };
}
var m416_default = {
  id: "m416",
  title: "HK416 A5",
  short: "M416",
  caliber: "5,56×45 NATO",
  cal: "556",
  thread: "1/2x28",
  specs: [["Ствол", '368 мм (14,5")'], ["Автоматика", "газовый поршень"], ["Темп", "850 выстр/мин"], ["Масса", "3,49 кг"]],
  base: { weight: 2420, length: 800, ergo: 52, recoilV: 100, recoilH: 100, moa: 1.4, velocity: 880, range: 450, loud: 160, flash: 70, adsTime: 280, rpm: 850, mag: 30 },
  audio: { cal: "556", body: 0.55, crack: 1, mech: 0.8 },
  modes: ["safe", "semi", "auto"],
  build,
  slots: [
    { id: "handguard", label: "Цевьё", group: "Цевьё и ствол", accepts: ["hg"], mount: "hg", iface: "hk416" },
    { id: "muzzle", label: "Дульное устройство", group: "Цевьё и ствол", accepts: ["muzzle"], mount: "muzzle" },
    { id: "rearsight", label: "Целик", group: "Оптика", accepts: ["rearsight"], rails: ["upperRail"], prefer: "rear" },
    { id: "frontsight", label: "Мушка", group: "Оптика", accepts: ["frontsight"], rails: ["hgTop"], prefer: "front" },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: ["upperRail", "hgTop"], prefer: { x: -40 } },
    { id: "magnifier", label: "Увеличитель", group: "Оптика", accepts: ["magnifier"], rails: ["upperRail", "hgTop"], prefer: { x: -90 }, behind: "optic" },
    { id: "offset", label: "Боковой коллиматор", group: "Оптика", accepts: ["offset"], rails: ["upperRail", "hgTop"], prefer: { x: 20 } },
    { id: "under", label: "Под стволом", group: "Тактика", accepts: ["foregrip", "bipod"], rails: ["hgBottom"], prefer: { x: 190 } },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgRight"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgLeft"], prefer: "front" },
    { id: "tacTop", label: "Верх цевья", group: "Тактика", accepts: ["laser"], rails: ["hgTop"], prefer: "front" },
    { id: "mag", label: "Магазин", group: "Ствольная коробка", accepts: ["mag"], mount: "magwell", iface: "stanag" },
    { id: "pgrip", label: "Пистолетная рукоять", group: "Ствольная коробка", accepts: ["pgrip"], mount: "grip", iface: "ar" },
    { id: "stock", label: "Приклад", group: "Ствольная коробка", accepts: ["stock"], mount: "stock", rails: ["stock"], iface: "ar", prefer: { x: -386 } },
    { id: "charger", label: "Рукоять заряжания", group: "Ствольная коробка", accepts: ["charger"], mount: "charger", iface: "ar" }
  ],
  parts: M416_PARTS,
  defaults: {
    handguard: "hk_quad",
    muzzle: "hk_fh",
    optic: null,
    rearsight: "hk_diopter",
    frontsight: "hk_front",
    magnifier: null,
    under: null,
    tacRight: null,
    tacLeft: null,
    tacTop: null,
    mag: "hk_steel30",
    pgrip: "hk_v2",
    stock: "hk_slim",
    charger: "ch_std"
  }
};

DEFS[m416_default.id] = m416_default; FAMILY[m416_default.id] = "B";
})();
(() => {
// ---- weapons/scar.js
var RAIL_TOP = 30.5;
var UP_REAR = -192;
var UP_FRONT = 266;
var BARREL = 406;
var YB = -16;
var HB = -44;
var W = 19;
var W2 = 18.3;
var HW = 21;
var PY0 = -12;
var PY1 = 1.5;
var SLY0 = 3.5;
var SLY1 = 9.5;
var SL0 = -66;
var SL1 = 104;
var RB = 13.2;
function hexScrew(k, x, y, z, s, r = 2.6, mat = "steelPark") {
  const head = cylZ(r, 0, 1.2, { c: 0.45, seg: 20 });
  const sock = cylZ(r * 0.46, 0.95, 1.28, { c: 0, seg: 6 });
  const t = { p: [x, y, z], s: [1, 1, s] };
  k.add(mat, T(head, t));
  k.add("lensBlack", T(sock, t));
}
function pinHead(k, x, y, z, s, r = 3, h = 1, mat = "steel") {
  k.add(mat, T(cylZ(r, 0, h, { c: 0.4, seg: 18 }), { p: [x, y, z], s: [1, 1, s] }));
}
function qdSocket(k, x, y, z, s) {
  k.add("steel", T(cylZ(5.4, 0, 1.8, { c: 0.5, seg: 24, ri: 3.2 }), { p: [x, y, z], s: [1, 1, s] }));
  k.add("lensBlack", T(cylZ(3.3, 0, 0.6, { c: 0, seg: 16 }), { p: [x, y, z + s * 0.3] }));
}
function recSec(o = {}) {
  const side = (slot2) => {
    const s = [];
    if (slot2) s.push([W2, SLY0 - 0.2, 0.3], [W2 - 2.6, SLY0 + 0.3], [W2 - 2.6, SLY1 - 0.3], [W2, SLY1 + 0.2, 0.3]);
    s.push([W2, 12.5, 1.6], [15.2, 20.6, 1]);
    return s;
  };
  const low = [[W, YB, 1], [W, 2, 0.3], [W2, 2.8, 0.3]];
  const R4 = o.port ? [[W2, PY1, 0.4], ...side(o.slotR)] : [...low, ...side(o.slotR)];
  const L = [...low, ...side(o.slotL)].reverse().map(([z, y, r]) => [-z, y, r || 0]);
  const pts = [...R4, ...L];
  if (o.port) {
    pts.push([W, YB, 1], [W, PY0, 0.4]);
    const a0 = Math.asin(PY0 / RB), a1 = Math.asin(PY1 / RB) - Math.PI * 2;
    for (let i = 0; i <= 28; i++) {
      const a = a0 + (a1 - a0) * (i / 28);
      pts.push([Math.cos(a) * RB, Math.sin(a) * RB]);
    }
  }
  return pts;
}
function hgSec(slot2, bot = HB) {
  const R4 = [[12, bot, 2.5], [HW, bot + 9, 1.5]];
  if (slot2) R4.push([HW, SLY0 - 0.2, 0.3], [HW - 4.4, SLY0 + 0.3], [HW - 4.4, SLY1 - 0.3], [HW, SLY1 + 0.2, 0.3]);
  R4.push([HW, 12.5, 1.6], [16.6, 20.6, 1]);
  const L = R4.slice().reverse().map(([z, y, r]) => [-z, y, r || 0]);
  return shape([...R4, ...L], [circle(0, 0, 15.6, 32)]);
}
function upper(ctx, k) {
  const M = "aluFde";
  k.add(M, extrudeX(recSec(), UP_REAR + 1, -74, { bevel: 0.6 }));
  k.add(M, extrudeX(recSec({ port: true }), -74, SL0, { bevel: 0.3 }));
  k.add(M, extrudeX(recSec({ port: true, slotL: true, slotR: true }), SL0, 6, { bevel: 0.3 }));
  k.add(M, extrudeX(recSec({ slotL: true, slotR: true }), 6, 48, { bevel: 0.3 }));
  k.add(M, extrudeX(hgSec(true), 48, SL1, { bevel: 0.8 }));
  k.add(M, extrudeX(hgSec(false), SL1, UP_FRONT - 30, { bevel: 0.3 }));
  k.add(M, extrudeX(hgSec(false, HB + 10), UP_FRONT - 30, UP_FRONT, { bevel: 1.4 }));
  for (const s of [-1, 1]) {
    k.add("lensBlack", extrudeZ(rrect((SL0 + 48) / 2, (SLY0 + SLY1) / 2, 48 - SL0 - 1, SLY1 - SLY0 - 0.8, 0.5), 0.2, { bevel: 0, z: s * (W2 - 2.5) }));
    k.add("lensBlack", extrudeZ(rrect((48 + SL1) / 2, (SLY0 + SLY1) / 2, SL1 - 48 - 1, SLY1 - SLY0 - 0.8, 0.5), 0.2, { bevel: 0, z: s * (HW - 4.3) }));
  }
  const liner = [];
  for (let i = 0; i <= 24; i++) {
    const a = (35 + i / 24 * 290) * Math.PI / 180;
    liner.push([Math.cos(a) * 13.1, Math.sin(a) * 13.1]);
  }
  for (let i = 24; i >= 0; i--) {
    const a = (35 + i / 24 * 290) * Math.PI / 180;
    liner.push([Math.cos(a) * 12.7, Math.sin(a) * 12.7]);
  }
  k.add("lensBlack", extrudeX(liner, -74, 6, { bevel: 0 }));
  k.add("lensBlack", cylX(15.5, UP_FRONT - 6, UP_FRONT - 5, { c: 0, seg: 32 }));
  k.add(M, extrudeZ([[14, YB + 1], [52, YB + 1], [52, HB + 2], [47, HB, 3], [38, HB + 2, 10], [24, YB - 12, 10], [16, YB - 5, 3]], 32, { bevel: 4, bevelSeg: 3 }));
  for (const s of [-1, 1]) {
    k.add(M, extrudeZ([[54, -4, 1], [117, -4, 1], [117, -34, 2], [72, -34, 3], [56, -22, 3]], 1.6, { bevel: 0.5, z: s * (HW + 0.2) }));
    k.add(M, extrudeZ(rrect(191, 4, 146, 24, 2), 1.6, { bevel: 0.5, z: s * (HW + 0.2) }));
    for (let i = 0; i < 4; i++) k.add("lensBlack", extrudeZ(slot(76 + i * 10, 82 + i * 10, -27, 3.6), 0.3, { bevel: 0, z: s * (HW + 0.95) }));
    k.add("lensBlack", extrudeZ([[UP_REAR + 6, 14.4], [47, 14.4], [47, 14.9], [UP_REAR + 6, 14.9]], 0.2, { bevel: 0, z: s * W2 }));
    k.add("lensBlack", extrudeZ([[49, 14.4], [UP_FRONT - 2, 14.4], [UP_FRONT - 2, 14.9], [49, 14.9]], 0.2, { bevel: 0, z: s * HW }));
    for (const x of [62, 110]) hexScrew(k, x, -10, s * (HW + 1), s, 2.4);
    for (const x of [134, 184, 234]) hexScrew(k, x, -18, s * (HW + 1), s, 2.4);
    for (const y of [-7, 11]) hexScrew(k, UP_REAR + 10, y, s * (y > 2 ? W2 : W), s, 2.3);
  }
  for (const x of [20, 36]) {
    hexScrew(k, x, -7, W, 1, 3.8, "steel");
    k.add("steelPark", T(cylZ(4.4, -1.4, 0, { c: 0.4, seg: 6 }), { p: [x, -7, -W] }));
  }
  qdSocket(k, UP_FRONT - 15, -18, -HW, -1);
  const r = picatinny(UP_FRONT - UP_REAR - 4, { base: RAIL_TOP - 21 + 0.6 });
  k.add(M, r.geo, { p: [UP_REAR + 2, RAIL_TOP, 0] });
  for (let i = 0; i < r.slots - 1; i += 2) {
    const x = UP_REAR + 2 + r.first + (i + 0.5) * PICA.PITCH;
    const n = i >= 20 ? 3 : i >= 10 ? 2 : 1;
    for (let j = 0; j < n; j++) k.add("paintWhite", T(box(0.5, 0.14, 1.8, { bevel: 0.05 }), { p: [x + (j - (n - 1) / 2) * 1.1, RAIL_TOP + 0.02, 5.4] }));
  }
  const defl = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, e = Math.sin(t * Math.PI / 2);
    defl.push({ x: -110 + 36 * t, pts: superEllipse(0.4 + 7.8 * e, 6 + 6.6 * e, 2.8, 28, -1 + 0.3 * e, W - 1.5) });
  }
  k.add(M, loftX(defl, { crease: 50, flip: true }));
  k.add(M, extrudeX(rrect(0, 2.3, 36.6, 36.2, 3.5), UP_REAR - 6, UP_REAR + 2, { bevel: 1.6, bevelSeg: 3 }));
  const mounts = [];
  const side = (id, face, rot, pos, len = 142) => {
    const rr = picatinny(len, { base: 6.5 });
    k.add(M, rr.geo, { r: rot, p: pos });
    mounts.push(ctx.railMount(id, [pos[0] + rr.first, pos[1], pos[2]], face, rr.slots, { axis: face }));
    return rr;
  };
  side("rightRail", "right", [90, 0, 0], [UP_FRONT - 146, 4, HW + 6.1]);
  side("leftRail", "left", [-90, 0, 0], [UP_FRONT - 146, 4, -HW - 6.1]);
  side("bottomRail", "bottom", [180, 0, 0], [UP_FRONT - 150, HB - 6.1, 0], 120);
  for (const s of [-1, 1]) for (const x of [UP_FRONT - 143, UP_FRONT - 7]) hexScrew(k, x, 4, s * (HW + 6.3), s, 2.2);
  mounts.push(ctx.railMount("topRail", [UP_REAR + 2 + r.first, RAIL_TOP, 0], "top", r.slots, { axis: "top" }));
  return mounts;
}
function lower(ctx, k, nodes) {
  const M = "polyFde";
  k.add(M, extrudeZ([[-188, YB], [20, YB], [22, -22, 2], [-66, -24, 2], [-70, -40, 3], [-122, -42, 2], [-128, -46, 3], [-160, -46, 5], [-180, -36, 10], [-192, -22, 4]], 35, { bevel: 2.4, bevelSeg: 3 }));
  k.add(M, extrudeZ([[-186, YB - 3.5], [18, YB - 3.5], [18, YB + 0.5], [-186, YB + 0.5]], 36.6, { bevel: 0.8 }));
  const well = shape(rrect(-30, 0, 90, 36, 5), [rrect(-30, 0, 81, 27, 2)]);
  k.add(M, extrudeY(well, -60, YB, { bevel: 1.4 }));
  k.add(M, extrudeY(shape(rrect(-28, 0, 97, 41, 8), [rrect(-30, 0, 81, 27, 2)]), -70, -58, { bevel: 2, bevelSeg: 3 }));
  k.add(M, extrudeZ([[13, YB], [24, YB], [24, -26, 3], [21, -60, 4], [14, -70, 3], [12, -58]], 32, { bevel: 2.4, bevelSeg: 3 }));
  for (const s of [-1, 1]) {
    k.add(M, extrudeZ(shape(rrect(-30, -40, 64, 26, 5), [rrect(-30, -40, 57, 19, 3)]), 1.6, { bevel: 0.5, z: s * 18.3 }));
    k.add("polyFdeDark", extrudeZ(rrect(-30, -40, 58, 20, 3), 0.6, { bevel: 0.2, z: s * 18.1 }));
    for (let i = 0; i < 5; i++) k.add("polyFdeDark", T(box(53, 1.4, 1.2, { bevel: 0.4 }), { p: [-30, -47.6 + i * 3.8, s * 18.5] }));
    k.add(M, extrudeZ([[-186, -19, 2], [-146, -19, 2], [-150, -40, 3], [-162, -43, 4], [-176, -36, 6], [-186, -26, 3]], 1.4, { bevel: 0.5, z: s * 17.6 }));
    qdSocket(k, -174, -28, s * 18.2, s);
    k.add(M, extrudeZ(shape(circle(-80, -27, 7.6, 24), [circle(-80, -27, 5.8, 20)]), 1.8, { bevel: 0.5, z: s * 18.2 }));
    k.add("poly", cylZ(5.2, 0, 2.2, { c: 0.8, seg: 20 }), { p: [-80, -27, s > 0 ? 17.4 : -19.6] });
    k.add("polyFdeDark", T(cylZ(3.4, 0, 0.3, { seg: 16, c: 0 }), { p: [-80, -27, s * 19.6], s: [1, 1, s] }));
    k.add("polyFdeDark", T(cylZ(8.6, 0, 0.8, { c: 0.3, seg: 28 }), { p: [-122, -24, s * 17.3], s: [1, 1, s] }));
    for (const [a, n] of [[0, 1], [90, 2], [180, 3]]) {
      const ar = a * Math.PI / 180;
      for (let j = 0; j < n; j++) k.add("paintWhite", T(box(0.7, 2.6, 0.2, { bevel: 0.05 }), { p: [-122 + Math.cos(ar) * 11 + (j - (n - 1) / 2) * 1.3 * Math.sin(ar), -24 + Math.sin(ar) * 11, s * 17.6], r: [0, 0, a - 90] }));
    }
  }
  const tg = shape(
    [[-68, -38], [-71, -52, 4], [-82, -59, 7], [-116, -57, 8], [-127, -44, 4], [-127, -38]],
    [[[-78, -40], [-78, -49, 3], [-85, -52, 4], [-112, -51, 5], [-119, -43, 3], [-119, -40]]]
  );
  k.add(M, extrudeZ(tg, 12, { bevel: 2, bevelSeg: 3 }));
  k.add("poly", extrudeZ([[-72, -18, 1], [-52, -18, 2], [-49, -23, 2], [-56, -30, 3], [-64, -28, 2], [-72, -23, 1]], 2.4, { bevel: 0.7, z: -18.8 }));
  for (let i = 0; i < 3; i++) k.add("poly", T(box(0.8, 7, 1), { p: [-60 + i * 2.6, -23.5, -20.2] }));
  pinHead(k, -68, -21, -17.8, -1, 2.6, 1.6, "steelPark");
  for (const [x, y, r] of [[-95, -30, 2.4], [-112, -30, 2.4], [-172, -21, 3.4], [8, -21, 3.4]]) {
    k.add("steel", pin(r * 0.75, 36.4), { p: [x, y, 0] });
    pinHead(k, x, y, -18.2, -1, r, 1.1);
  }
  const tk = ctx.kit();
  tk.add("steel", extrudeZ([[-3, 4], [3, 4], [3, -5, 2], [1.6, -12, 6], [-2.2, -19, 4], [-6.5, -22.5, 1.5], [-7.6, -21], [-4.8, -16, 5], [-3.2, -8, 3]], 6, { bevel: 1.1, bevelSeg: 3 }));
  nodes.trigger = node("trigger", [tk.build()], { p: [-90, -34, 0] });
  const sk = ctx.kit();
  sk.add("steelPark", extrudeZ([[0, -4.5, 2], [17, -3.2, 2], [23, -4.2, 2], [24, 3.6, 2.5], [16, 3, 2], [0, 4.5, 2]], 3, { bevel: 0.9, z: -19.4 }));
  sk.add("steelPark", extrudeZ([[0, -4.5, 2], [18, -3, 3], [19, 3, 3], [0, 4.5, 2]], 3, { bevel: 0.9, z: 19.4 }));
  for (const s of [-1, 1]) {
    sk.add("steelPark", T(cylZ(5.4, 0, 1.2, { c: 0.5, seg: 22 }), { p: [0, 0, s * 20.3], s: [1, 1, s] }));
    sk.add("lensBlack", T(cylZ(1.8, 0, 0.3, { c: 0, seg: 12 }), { p: [0, 0, s * 21.4], s: [1, 1, s] }));
  }
  sk.add("steel", cylZ(5, -18.5, 18.5, { c: 0.6, seg: 20 }));
  for (let i = 0; i < 3; i++) sk.add("steelPark", T(box(0.9, 6, 1), { p: [18 + i * 2.2, 0, -21.3] }));
  nodes.selector = node("selector", [sk.build()], { p: [-122, -24, 0] });
  return [nodes.trigger, nodes.selector];
}
function barrel(ctx, k) {
  const GB = UP_FRONT + 2;
  k.add("steelPark", latheX([[UP_FRONT - 40, 0], [UP_FRONT - 40, 13.6], [UP_FRONT + 1, 13.6], [UP_FRONT + 1.6, 11.4], [GB + 31, 11.4], [GB + 32, 10.6], [BARREL - 70, 10.2], [BARREL - 15, 9.5], [BARREL - 14, 9.5], [BARREL - 13.4, 7.6], [BARREL, 7.6], [BARREL, 3.9], [BARREL - 8, 3.9], [BARREL - 8, 0]], { seg: 36 }));
  k.add("steelPark", ringGrooves(7.95, BARREL - 13, BARREL - 0.3, 16, 0.4, { seg: 24 }));
  k.add("lensBlack", cylX(3.95, BARREL - 7.9, BARREL - 7.7, { c: 0, seg: 16 }));
  const gb = [];
  for (let i = 0; i <= 12; i++) {
    const a = (-160 + i * (140 / 12)) * Math.PI / 180;
    gb.push([Math.cos(a) * 14.2, Math.sin(a) * 14.2]);
  }
  gb.push([13.4, 3, 1.5], [11.4, 19, 3], [8.4, 26, 4], [-8.4, 26, 4], [-11.4, 19, 3], [-13.4, 3, 1.5]);
  k.add("steel", extrudeX(shape(gb, [circle(0, 0, 11.4, 28)]), GB, GB + 30, { bevel: 1.6, bevelSeg: 3 }));
  for (const x of [GB + 8, GB + 22]) {
    k.add("steelPark", pin(2.2, 27.6), { p: [x, -7, 0] });
    for (const s of [-1, 1]) k.add("lensBlack", T(cylZ(0.9, 0, 0.2, { c: 0, seg: 10 }), { p: [x, -7, s * 13.8], s: [1, 1, s] }));
  }
  k.add("steelPark", T(cylX(3, 0, 1.4, { c: 0.4, seg: 6 }), { r: [0, 0, 90], p: [GB + 15, 26, 0] }));
  k.add("steel", T(cylX(8.6, GB + 30, GB + 40, { c: 1, seg: 28 }), { p: [0, 17, 0] }));
  k.add("steel", T(flutesX(8.2, GB + 31.5, GB + 38.5, 18, 1.2, 0.6), { p: [0, 17, 0] }));
  k.add("steelPark", T(cylX(5.2, GB + 40, GB + 43, { c: 0.8, seg: 20 }), { p: [0, 17, 0] }));
  k.add("lensBlack", T(box(0.2, 1.4, 7), { p: [GB + 43.05, 17, 0] }));
  k.add("steel", extrudeZ([[GB + 32, 13, 1], [GB + 39, 13, 1], [GB + 40, 22, 2], [GB + 33, 23, 2]], 2.2, { bevel: 0.6, z: -9.6 }));
  k.add("paintWhite", T(box(0.5, 2.4, 0.2), { p: [GB + 26, 20, -11.8] }));
}
function carrier(ctx) {
  const k = ctx.kit();
  k.add("steelPark", latheX([[-150, 0], [-150, 12.4], [-6, 12.4], [-5, 9], [-5, 0]], { seg: 28 }));
  for (const a of [70, 110]) k.add("lensBlack", T(box(120, 1, 0.8), { p: [-80, Math.cos(a * Math.PI / 180) * 12.45, Math.sin(a * Math.PI / 180) * 12.45], r: [-(a - 90), 0, 0] }));
  k.add("steelWorn", latheX([[-8, 0], [-8, 9.2], [4, 9.2], [4.6, 8.4], [4.6, 0]], { seg: 20 }));
  for (let i = 0; i < 7; i++) k.add("steelWorn", T(box(4, 3, 4), { p: [3, 10, 0], r: [i * 51.4, 0, 0] }));
  k.add("steel", extrudeZ([[-20, 7], [2, 7], [2, 10.5], [-20, 10.5]], 3, { bevel: 0.5, z: 8.4 }));
  k.add("steelWorn", T(cylZ(2.2, 0, 1.4, { seg: 12 }), { p: [-30, 2, 11.8] }));
  k.add("steelPark", extrudeZ([[-4, 3.8], [96, 3.8], [96, 9.2], [-4, 9.2]], 36, { bevel: 0.8 }));
  const node2 = node("carrier", [k.build()]);
  node2.add(ctx.mount({ id: "charger", type: "charger", p: [74, 6, 0] }));
  return node2;
}
function build(ctx) {
  const k = ctx.kit();
  const nodes = {};
  const rails = upper(ctx, k);
  const lowerNodes = lower(ctx, k, nodes);
  barrel(ctx, k);
  nodes.carrier = carrier(ctx);
  const root = node("scar", [k.build("receiver"), nodes.carrier, ...lowerNodes, ...rails]);
  root.add(ctx.mount({ id: "muzzle", type: "thread", p: [BARREL, 0, 0] }));
  root.add(ctx.mount({ id: "magwell", type: "magwell", p: [-30, -66, 0] }));
  root.add(ctx.mount({ id: "grip", type: "grip", p: [-126, -42, 0] }));
  root.add(ctx.mount({ id: "stock", type: "stock", p: [UP_REAR - 6, 4, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 128, selector: { safe: 0, semi: 90, auto: 180 } },
    eject: { p: [-36, -5, 18], dir: [0.3, 0.35, 1] },
    muzzle: [BARREL, 0, 0],
    eyeX: -300,
    focus: { center: [30, -20, 0], size: 1e3 }
  };
}
function scarFront(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  k.add("aluFde", ctx.C.clampBody(-12, 12, 6));
  k.add("steel", ctx.C.crossBolt(0));
  const ear = [[-10, 0, 1], [8, 0, 1], [8, 24, 3], [3, 42, 3], [-3, 42, 3], [-10, 20, 2]];
  f.add("aluFde", extrudeZ(ear, 3, { bevel: 0.6, z: 7 }));
  f.add("aluFde", extrudeZ(ear, 3, { bevel: 0.6, z: -7 }));
  f.add("aluFde", extrudeZ([[-10, 0, 1], [8, 0, 1], [8, 12, 2], [-10, 10, 2]], 17, { bevel: 0.8 }));
  f.add("steel", cylY(2, 10, 30.5, { seg: 12, c: 0.3 }));
  f.add("steel", extrudeZ([[-1, 30], [1, 30], [0.8, 35.5, 0.3], [-0.8, 35.5, 0.3]], 1.8, { bevel: 0.2 }));
  f.add("tritium", T(sphere(0.6), { p: [-1, 34.3, 0] }));
  const flip = node("flip", [f.build()]);
  flip.position.set(-10, 6, 0);
  flip.children[0].position.set(10, -6, 0);
  return { root: node("scar_front", [k.build(), flip]), irons: { front: [0, 35.5, 0] }, flip: { node: flip, angle: 90 } };
}
function scarRear(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  k.add("aluFde", ctx.C.clampBody(-16, 16, 6));
  k.add("steel", ctx.C.crossBolt(0));
  const ear = [[-12, 0, 1], [12, 0, 1], [12, 28, 3], [6, 46, 4], [-6, 46, 4], [-12, 28, 3]];
  f.add("aluFde", extrudeZ(ear, 3, { bevel: 0.6, z: 10.5 }));
  f.add("aluFde", extrudeZ(ear, 3, { bevel: 0.6, z: -10.5 }));
  f.add("aluFde", extrudeZ([[-12, 0, 1], [12, 0, 1], [12, 22, 2], [-12, 22, 2]], 24, { bevel: 0.8 }));
  f.add("steel", T(tubeX(8.5, 2.2, -2.5, 2.5, { seg: 32 }), { p: [0, 35.5, 0] }));
  f.add("steel", T(ctx.C.knob(6, 4, 18), { r: [0, -90, 0], p: [0, 16, 12] }));
  for (let i = 0; i < 4; i++) f.add("paintWhite", T(box(0.5, 0.2, 1.8), { p: [-6 + i * 4, 22.1, 9] }));
  const flip = node("flip", [f.build()]);
  flip.position.set(12, 6, 0);
  flip.children[0].position.set(-12, -6, 0);
  return { root: node("scar_rear", [k.build(), flip]), irons: { rear: [0, 35.5, 0], type: "aperture" }, flip: { node: flip, angle: -90 } };
}
function scarFH(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[-13.4, 0], [-13.4, 10.4], [-12.4, 11.4], [22, 11.6], [23, 11], [23, 5.6], [0, 5.6], [0, 0]], { seg: 32 }));
  k.add("lensBlack", cylX(5.5, 0.2, 0.4, { c: 0, seg: 16 }));
  for (let i = 0; i < 3; i++) k.add("steel", T(latheX([[21, 7.4], [21, 11.4], [52, 11.4], [53.5, 10.2], [53.5, 7.4]], { seg: 10, arc: 78, a0: -39 }), { r: [i * 120, 0, 0] }));
  k.add("steel", flutesX(11.6, -9, 6, 2, 7, 0.5, { a0: 90 }));
  return { root: k.build("scar_fh"), muzzle: { x: 53.5, kind: "fh", flash: 0.3 } };
}
function cap(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[-13.4, 0], [-13.4, 9.2], [-12.4, 10], [14, 10], [16, 8.6], [16, 0]], { seg: 28 }));
  k.add("steel", flutesX(10, -10, 14, 14, 1.2, 0.5));
  return { root: k.build("cap"), muzzle: { x: 16, kind: "bare", flash: 1 } };
}
function scarStock(ctx, o = {}) {
  const k = ctx.kit(), f = ctx.kit();
  k.add("polyFde", extrudeX(rrect(0, -1.5, 38, 37, 5), -18, 0, { bevel: 2 }));
  k.add("steel", T(cylY(4, -20, 17, { seg: 16 }), { p: [-10, 0, 19.5] }));
  k.add("poly", T(box(10, 14, 3, { bevel: 1 }), { p: [-8, -6, -19.5] }));
  const L = o.long ? 310 : 280;
  f.add("polyFde", extrudeX(rrect(0, -1.5, 34, 35, 4), -128, -18, { bevel: 2 }));
  f.add("polyFdeDark", extrudeX(rrect(0, -1.5, 35, 20, 3), -118, -30, { bevel: 1 }));
  for (let i = 0; i < 6; i++) f.add("lensBlack", T(cylZ(2.2, -18.2, 18.2, { seg: 12 }), { p: [-40 - i * 14, -12, 0] }));
  const body = shape(
    [[-110, -30, 6], [-110, 22, 6], [-L + 18, 24, 4], [-L + 18, -112, 8], [-L + 60, -108, 12]],
    [[[-126, -22, 5], [-L + 34, 12, 4], [-L + 34, -84, 8]].map(([x, y, r]) => [x, y, r])]
  );
  f.add("polyFde", extrudeZ(body, 30, { bevel: 4, curve: 8 }));
  f.add("polyFde", extrudeZ([[-120, 22, 3], [-L + 24, 22, 3], [-L + 26, 36, 6], [-140, 38, 10]], 34, { bevel: 4 }));
  f.add("poly", T(cylZ(5, -18, 18, { seg: 16 }), { p: [-150, 26, 0] }));
  f.add("rubber", extrudeZ([[-L + 18, 26, 3], [-L, 25, 5], [-L - 1, -114, 6], [-L + 18, -114, 3]], 40, { bevel: 4 }));
  for (let i = 0; i < 11; i++) f.add("rubber", T(box(2, 3, 36), { p: [-L - 1, 16 - i * 12, 0] }));
  for (const s of [-1, 1]) qdSocket(f, -L + 44, -90, s * 15, s);
  f.add("poly", extrudeZ([[-112, -22, 1], [-86, -21, 2], [-84, -24, 2], [-108, -27, 2]], 14, { bevel: 1 }));
  k.add("steel", T(cylZ(3.2, 0, 1.4, { c: 0.4, seg: 16 }), { p: [-8, 8, -19.2], s: [1, 1, -1] }));
  if (o.prs) {
    f.add("alu", T(ctx.C.knob(10, 8, 24), { r: [0, -90, 0], p: [-L + 60, 30, 16] }));
    f.add("alu", T(ctx.C.knob(10, 8, 24), { r: [0, 0, 90], p: [-L + 8, -40, 0] }).translate(0, 0, 0));
    f.add("alu", T(cylY(7, -150, -108, { seg: 18 }), { p: [-L + 40, 0, 0] }));
    f.add("rubber", T(cylY(10, -158, -150, { seg: 20 }), { p: [-L + 40, 0, 0] }));
  }
  const fold = node("fold", [f.build()]);
  const hinge = node("hinge", [fold]);
  hinge.position.set(-10, 0, 19);
  fold.position.set(10, 0, -19);
  return { root: node("scar_stock", [k.build(), hinge]), fold: { node: hinge, axis: "y", angle: 172 }, cheek: { x: -160, y: 36 } };
}
function scarGrip(ctx) {
  const k = ctx.kit();
  const a = 20 * Math.PI / 180, sh = (y) => Math.tan(a) * y;
  const front = [[2, 0], [0, -16], [5, -24], [0, -34], [-2, -60], [-1, -100]].map(([x, y]) => [x + sh(y), y]);
  const back = [[-34, 6], [-44, 0], [-40, -30], [-38, -70], [-38, -102]].map(([x, y]) => [x + sh(y), y]);
  k.add("polyFde", gripLoft(front, back, { w: 30, width: (t) => 0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.6)) }));
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) k.add("polyFdeDark", T(box(16, 1.1, 1.2, { bevel: 0.3 }), { p: [sh(-24 - i * 8.5) - 22, -24 - i * 8.5, s * 13.3], r: [0, 0, 20] }));
  return { root: k.build("scar_grip") };
}
function sr25(ctx, o) {
  const k = ctx.kit(), rk = ctx.kit();
  const len = o.len, D = 80, W3 = 26, curve = o.curve ?? 8;
  const off = (y) => y > -30 ? 0 : curve * Math.pow((-30 - y) / (len - 30), 1.5);
  const pts = [];
  const n = 12, top = 52;
  for (let i = 0; i <= n; i++) {
    const y = top - i / n * (top + len);
    pts.push([-D / 2 + off(y), y, 0]);
  }
  for (let i = n; i >= 0; i--) {
    const y = top - i / n * (top + len);
    pts.push([D / 2 + off(y), y, 0]);
  }
  k.add(o.mat, extrudeZ(pts, W3, { bevel: o.bevel ?? 1.2 }));
  if (o.ribs) {
    for (const s of [-1, 1]) {
      k.add(o.mat, T(extrudeZ(rrect(0, 0, D - 20, len - 34, 7), 1.4, { bevel: 0.6 }), { p: [off(-len / 2), -len / 2 - 2, s * (W3 / 2 + 0.2)] }));
      for (let i = 0; i < 3; i++) {
        const y = -len + 26 + i * 7;
        k.add(o.mat, T(box(D - 36, 1.8, 1.2, { bevel: 0.5 }), { p: [off(y), y, s * (W3 / 2 + 0.9)] }));
      }
      for (let i = 0; i < 4; i++) {
        const y = 26 - i * 22;
        k.add("lensBlack", T(cylZ(1.6, 0, 0.3, { c: 0, seg: 12 }), { p: [D / 2 - 10 + off(y), y, s * (W3 / 2 + 0.05)], s: [1, 1, s] }));
      }
    }
  }
  if (o.texture) for (let i = 0; i < 6; i++) for (const s of [-1, 1]) k.add(o.mat, T(box(D - 14, 1.6, 1), { p: [off(-30 - i * 6), -30 - i * 6, s * (W3 / 2 + 0.2)] }));
  k.add(o.plate || o.mat, T(box(D + 8, 7, W3 + 4, { bevel: 2 }), { p: [off(-len) + 3, -len - 2, 0] }));
  k.add("polyGrey", box(D - 10, 3, W3 - 5), { p: [-2, top - 4, 0] });
  ctx.C.feedLips(k, o.mat, -37, -4, top, W3 / 2, { rise: 5.5, curl: 3.2 });
  ctx.C.cartridge(rk, "762x51", { p: [-36, top - 0.5, -3.2] });
  ctx.C.cartridge(rk, "762x51", { p: [-36, top - 8, 3.2] });
  const rounds = rk.build("rounds");
  return { root: node("mag", [k.build(), rounds]), mag: { cap: o.cap, rounds } };
}
function drum50(ctx) {
  const base = sr25(ctx, { len: 60, mat: "poly", cap: 50, curve: 0 });
  const k = ctx.kit();
  k.add("poly", T(cylZ(62, -28, 28, { c: 5, seg: 48 }), { p: [6, -110, 0] }));
  k.add("steel", T(ctx.C.knob(12, 7, 18), { r: [0, -90, 0], p: [6, -110, 28] }));
  k.add("glassDark", T(cylZ(14, -29.2, -28, { seg: 24 }), { p: [6, -110, 0] }));
  return { root: node("drum", [base.root, k.build()]), mag: { cap: 50, rounds: base.mag.rounds } };
}
function charger(ctx, side, big) {
  const k = ctx.kit();
  const s = side;
  k.add("steel", extrudeZ([[-10, -3], [10, -3], [10, 3], [-10, 3]], 4, { bevel: 0.8, z: s * 20 }));
  const arm = big ? [[-6, -4, 2], [8, -4, 2], [18, -2, 3], [22, 4, 4], [10, 6, 3], [-6, 4, 2]] : [[-6, -3.5, 2], [6, -3.5, 2], [12, -1, 2], [12, 4, 3], [-6, 3.5, 2]];
  const g = extrudeY(shape(arm.map(([x, y, r]) => [x, y, r])), -3, 3, { bevel: 0.8 });
  k.add("poly", T(extrudeZ([[-5, -3.5, 2], [5, -3.5, 2], [7, 3.5, 2], [-5, 3.5, 2]], big ? 34 : 24, { bevel: 1.2 }), { p: [0, 0, s * (22 + (big ? 17 : 12))] }));
  k.add("poly", T(latheX([[0, 0], [0, 6], [2, 7.5], [9, 7.5], [11, 5], [11, 0]], { seg: 18 }), { r: [0, s > 0 ? -90 : 90, 0], p: [0, 0, s * (big ? 52 : 44)] }));
  return { root: k.build("charger") };
}
var PARTS = [
  { id: "scar_fh", cat: "muzzle", name: "Пламегаситель SCAR-H", desc: "Штатный трёхщелевой, под быстросъёмный глушитель", fit: { thread: ["5/8x24"] }, stats: { weight: 80, length: 40, flash: -45 }, build: scarFH },
  { id: "scar_cap", cat: "muzzle", name: "Колпачок резьбы", desc: "Голый ствол: громко, яркая вспышка", fit: { thread: ["5/8x24"] }, stats: { weight: 15, loud: 2, flash: 25, "recoilV%": 6 }, build: cap },
  { id: "scar_rear", cat: "rearsight", name: "Целик SCAR (складной)", desc: "Диоптр с барабаном 200–600 м", foot: [-16, 16], body: [-16, 16], stats: { weight: 70 }, build: scarRear },
  { id: "scar_front", cat: "frontsight", name: "Мушка SCAR (складная)", desc: "Мушка с тритиевой вставкой", foot: [-12, 12], body: [-12, 12], stats: { weight: 50 }, build: scarFront },
  { id: "scar_stock", cat: "stock", name: "SCAR, складной телескоп", desc: "Складывается вправо (K), щека регулируется", fit: { iface: ["scar"] }, stats: { weight: 520 }, build: (c) => scarStock(c) },
  { id: "scar_prs", cat: "stock", name: "FN SSR (Mk 20)", desc: "Снайперский: регулировка щеки и затыльника, моноопора", fit: { iface: ["scar"] }, stats: { weight: 760, ergo: -3, "recoilV%": -8, moa: -0.2, adsTime: 15 }, build: (c) => scarStock(c, { prs: true, long: true }) },
  { id: "scar_grip", cat: "pgrip", name: "FN SCAR A2", desc: "Штатная рукоять, текстура по бокам", fit: { iface: ["ar"] }, stats: { weight: 75 }, build: scarGrip },
  { id: "fn20", cat: "mag", name: "FN SCAR-H 20, сталь", desc: "Штатный стальной магазин, 20 патронов", fit: { iface: ["sr25"] }, stats: { weight: 290, mag: 20 }, build: (c) => sr25(c, { len: 118, mat: "steelPark", cap: 20, ribs: true }) },
  { id: "fn20fde", cat: "mag", name: "FN SCAR-H 20, FDE", desc: "Стальной магазин в цвет оружия", fit: { iface: ["sr25"] }, stats: { weight: 290, mag: 20 }, build: (c) => sr25(c, { len: 118, mat: "aluFde", cap: 20, ribs: true }) },
  { id: "pmag20", cat: "mag", name: "Magpul PMAG 20 LR/SR", desc: "Полимер, 20 патронов", fit: { iface: ["sr25"] }, stats: { weight: 200, mag: 20, ergo: 1 }, build: (c) => sr25(c, { len: 118, mat: "poly", cap: 20, texture: true, bevel: 1.8 }) },
  { id: "pmag25", cat: "mag", name: "Magpul PMAG 25 LR/SR", desc: "Удлинённый, 25 патронов", fit: { iface: ["sr25"] }, stats: { weight: 250, mag: 25, ergo: -2, adsTime: 8 }, build: (c) => sr25(c, { len: 150, curve: 14, mat: "poly", cap: 25, texture: true, bevel: 1.8 }) },
  { id: "drum50", cat: "mag", name: "Барабан X-Products 50", desc: "Барабанный, 50 патронов", fit: { iface: ["sr25"] }, stats: { weight: 1900, mag: 50, ergo: -14, adsTime: 40 }, build: drum50 },
  { id: "ch_left", cat: "charger", name: "Рукоять заряжания слева", desc: "Штатная, ходит вместе с рамой", stats: { weight: 25 }, build: (c) => charger(c, -1, false) },
  { id: "ch_right", cat: "charger", name: "Рукоять заряжания справа", desc: "Переставлена на правый борт", stats: { weight: 25 }, build: (c) => charger(c, 1, false) },
  { id: "ch_big", cat: "charger", name: "Увеличенная рукоять (слева)", desc: "Удобна в перчатках", stats: { weight: 35, ergo: 2 }, build: (c) => charger(c, -1, true) }
];
var scar_default = {
  id: "scar",
  title: "FN SCAR-H Mk 17",
  short: "SCAR-H",
  caliber: "7,62×51 NATO",
  cal: "762x51",
  thread: "5/8x24",
  specs: [["Ствол", '406 мм (16")'], ["Длина", "997 / 750 мм"], ["Темп", "600 выстр/мин"], ["Масса", "3,58 кг"]],
  base: { weight: 2380, length: 960, ergo: 46, recoilV: 120, recoilH: 105, moa: 1.1, velocity: 790, range: 600, loud: 164, flash: 80, adsTime: 320, rpm: 600, mag: 20 },
  audio: { cal: "762x51", mech: 0.85 },
  modes: ["safe", "semi", "auto"],
  build,
  slots: [
    { id: "muzzle", label: "Дульное устройство", group: "Ствол", accepts: ["muzzle"], mount: "muzzle" },
    { id: "rearsight", label: "Целик", group: "Оптика", accepts: ["rearsight"], rails: ["topRail"], prefer: "rear" },
    { id: "frontsight", label: "Мушка", group: "Оптика", accepts: ["frontsight"], rails: ["topRail"], prefer: "front" },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: ["topRail"], prefer: { x: -70 } },
    { id: "magnifier", label: "Увеличитель", group: "Оптика", accepts: ["magnifier"], rails: ["topRail"], prefer: { x: -130 }, behind: "optic" },
    { id: "offset", label: "Боковой коллиматор", group: "Оптика", accepts: ["offset"], rails: ["topRail"], prefer: { x: 0 } },
    { id: "under", label: "Под стволом", group: "Тактика", accepts: ["foregrip", "bipod"], rails: ["bottomRail"], prefer: "front" },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["rightRail"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["leftRail"], prefer: "front" },
    { id: "tacTop", label: "Верх цевья", group: "Тактика", accepts: ["laser"], rails: ["topRail"], prefer: { x: 200 } },
    { id: "mag", label: "Магазин", group: "Ствольная коробка", accepts: ["mag"], mount: "magwell", iface: "sr25" },
    { id: "pgrip", label: "Пистолетная рукоять", group: "Ствольная коробка", accepts: ["pgrip"], mount: "grip", iface: "ar", required: true },
    { id: "stock", label: "Приклад", group: "Ствольная коробка", accepts: ["stock"], mount: "stock", iface: "scar" },
    { id: "charger", label: "Рукоять заряжания", group: "Ствольная коробка", accepts: ["charger"], mount: "charger", required: true }
  ],
  parts: PARTS,
  defaults: {
    muzzle: "scar_fh",
    rearsight: "scar_rear",
    frontsight: "scar_front",
    optic: null,
    magnifier: null,
    under: null,
    tacRight: null,
    tacLeft: null,
    tacTop: null,
    mag: "fn20",
    pgrip: "scar_grip",
    stock: "scar_stock",
    charger: "ch_left"
  }
};

DEFS[scar_default.id] = scar_default; FAMILY[scar_default.id] = "B";
})();
(() => {
// ---- weapons/svd.js
// СВД: газоотводная автоматика с коротким ходом поршня, фрезерованная коробка, «ласточкин хвост» слева.
// Единицы — мм, ось канала ствола y = 0, x = 0 — передний срез коробки, +z — правый борт.
var SV = {
  FRONT: 26,
  REAR: -236,
  WALL: 12,
  BOTTOM: -26,
  GAS_Y: 25,
  GAS_R: 8,
  SIGHT_Y: 46,
  REAR_X: 64,
  FRONT_X: 596,
  MUZZLE: 612,
  MAG_X: 2
};
function svdReceiver(ctx, k) {
  const { extrudeX: exX, extrudeZ: exZ, extrudeY: exY, T: T2, box: bx, cylZ: cZ, latheX: lX, shape: sh, rrect: rr } = ctx.G;
  const { FRONT: F, REAR: R4, WALL: W, BOTTOM: B } = SV;
  const M = "steel";
  // фрезерованные борта: окно выброса справа и выборка под рукоять затворной рамы
  const right = [[F, B, 1], [F, W], [-8, W], [-8, 0, 1], [-96, 0, 1], [-96, 8], [-214, 8], [-214, W], [R4, W], [R4, -14, 2], [R4 + 10, B, 3]];
  const left = [[F, B, 1], [F, W], [R4, W], [R4, -14, 2], [R4 + 10, B, 3]];
  k.add(M, exZ(right, 2.2, { bevel: 0.5, z: 14.4 }));
  k.add(M, exZ(left, 2.2, { bevel: 0.5, z: -14.4 }));
  k.add(M, exY(sh(rr((F + R4) / 2, 0, F - R4, 30, 1), [rr(-40, 0, 80, 24, 2)]), B - 1.6, B, { bevel: 0.3 }));
  k.add(M, exX(rr(0, (B + W) / 2 - 2, 27, W - B - 4, 1), 6, F, { bevel: 0.6 }));
  k.add(M, exX(rr(0, (B + W) / 2 - 2, 27, W - B - 6, 1), R4, R4 + 16, { bevel: 0.6 }));
  k.add("lensBlack", exX(rr(0, -8, 26, 8, 0), -213, 4, { bevel: 0 }));
  // продольные рёбра фрезеровки и выборки облегчения
  for (const s of [-1, 1]) {
    k.add(M, T2(exZ([[-200, -10], [-110, -10], [-108, -6, 1], [-202, -6, 1]], 1, { bevel: 0.3 }), { p: [0, 0, s * 15.6] }));
    k.add(M, exX(rr(s * 14.8, W - 0.6, 3.4, 1.6, 0.4), R4, F, { bevel: 0.2 }));
  }
  // «ласточкин хвост» на левом борту
  k.add("steel", exX(sh([[-15.5, -12, 1], [-15.5, 6, 1], [-19, 8], [-24, 5, 1], [-24, -9, 1], [-19, -12]]), -176, -60, { bevel: 0.6 }));
  for (const x of [-150, -84]) k.add("steelWorn", T2(cZ(3, -25, -23.6, { seg: 14 }), { p: [x, -2, 0] }));
  // штифты и защёлка магазина
  // оси УСМ (спуск, курок, автоспуск) и штифты ствольной вставки — головки на обоих бортах
  for (const s of [-1, 1]) for (const [x, y, r] of [[-118, -20, 2.4], [-150, -13, 2.4], [-178, -16, 2], [-10, -18, 2], [14, -18, 2]]) k.add("steelWorn", T2(cZ(r, 0, 0.9, { seg: 14, c: 0.3 }), { p: [x, y, s > 0 ? 15.4 : -16.3] }));
  // клеймо Ижмаша (треугольник со стрелой) и номер — тонкая гравировка на левом борту
  k.add("lensBlack", exZ(sh([[-44, -16], [-30, -16], [-37, -4]], [[[-41.6, -14.6], [-37, -6.6], [-32.4, -14.6]]]), 0.3, { bevel: 0, z: -15.6 }));
  k.add("lensBlack", T2(bx(0.8, 7, 0.3, { bevel: 0 }), { p: [-37, -11, -15.62] }));
  for (let i = 0; i < 7; i++) k.add("lensBlack", T2(bx(2.6, 4, 0.3, { bevel: 0 }), { p: [-86 + i * 4.2, -18, -15.62] }));
  // защёлка магазина АК-типа: сразу за горловиной, перед скобой, на оси между двумя ушками
  k.add(M, exZ([[-87, B + 1], [-96, B + 1], [-97, -36, 2], [-100, -43, 2], [-94, -45, 2], [-88, -35, 1]], 11, { bevel: 0.8 }));
  for (const s of [-1, 1]) k.add(M, T2(bx(9, 7, 2.2, { bevel: 0.5 }), { p: [-92, B - 2.6, s * 6.8] }));
  k.add("steelWorn", T2(cZ(1.6, -8.2, 8.2, { seg: 12 }), { p: [-92, B - 3, 0] }));
  // спусковая скоба (штампованная, с отбортовкой) на двух заклёпках
  const tg = sh([[-98, B], [-166, B], [-166, -32, 3], [-154, -48, 6], [-110, -50, 6], [-98, -38, 3]], [[[-104, B - 2.5], [-160, B - 2.5], [-152, -43, 5], [-112, -45, 5], [-104, -35, 3]]]);
  k.add(M, exZ(tg, 10, { bevel: 0.8 }));
  k.add(M, exZ(sh([[-98, B], [-166, B], [-166, -30, 3], [-98, -30, 3]], [[[-103, B - 1], [-161, B - 1], [-161, -31], [-103, -31]]]), 12, { bevel: 0.6 }));
  for (const x of [-101, -163]) k.add("steelWorn", T2(cZ(2, -6.4, 6.4, { seg: 12 }), { p: [x, B - 2.2, 0] }));
  k.add("lensBlack", T2(bx(18, 0.4, 7, { bevel: 0 }), { p: [-120, B - 1.2, 0] }));
}
function svdCover(ctx, k) {
  const { extrudeX: exX, T: T2, box: bx, cylX: cX } = ctx.G;
  const arc = (w, y0, y1, r, n = 14) => {
    const pts = [[w, y0]];
    const cy = y1 - r;
    pts.push([w, cy]);
    for (let i = 1; i < n; i++) {
      const a = i / n * Math.PI;
      pts.push([Math.cos(a) * w, cy + Math.sin(a) * r]);
    }
    pts.push([-w, cy], [-w, y0]);
    return pts;
  };
  const outer = arc(16.6, 12.4, 29, 12.5), inner = arc(15.2, 12.4, 27.6, 11.2).reverse();
  k.add("steel", exX([...outer, ...inner.map((p) => [p[0], p[1]])], SV.REAR + 1, SV.FRONT - 2, { bevel: 0.3 }));
  // у СВД крышка гладкая: только выштампованный пояс жёсткости у заднего упора и отбортовка по нижней кромке
  k.add("steel", exX([...arc(17.1, 13.4, 29.5, 13), ...arc(16.5, 13.4, 28.9, 12.4).reverse()], SV.REAR + 14, SV.REAR + 24, { bevel: 0.6 }));
  for (const s of [-1, 1]) k.add("steel", exX([[s * 16.4, 12.4], [s * 17.2, 12.4], [s * 17.2, 14.6], [s * 16.4, 14.6]], SV.REAR + 1, SV.FRONT - 2, { bevel: 0.2 }));
  // упор крышки и кнопка
  k.add("steelWorn", T2(cX(4.6, SV.REAR - 7, SV.REAR - 0.5, { c: 0.8, seg: 18 }), { p: [0, 18, 0] }));
  k.add("steelBright", T2(cX(2.6, SV.REAR - 9.5, SV.REAR - 6, { c: 0.6, seg: 14 }), { p: [0, 18, 0] }));
  k.add("steel", exX(arc(16.6, 12.4, 29, 12.5), SV.REAR - 1, SV.REAR + 2, { bevel: 0.5 }));
}
// Антабка на вертлюге: бобышка с осью и подвижная скоба. side: ±1 — на борту (ось по Z), 0 — снизу (ось по Y).
function svdSwivel(ctx, k, p, side, o = {}) {
  const { T: T2, cylZ: cZ, cylY: cY, wire: wr } = ctx.G;
  const [x, y, z] = p, w = o.w ?? 14, h = o.h ?? 15;
  let y0 = y, zr = z;
  if (side) {
    k.add(o.mat || "steelWorn", T2(cZ(3.2, 0, 4, { seg: 14, c: 0.6 }), { p: [x, y, z], r: [0, side < 0 ? 180 : 0, 0] }));
    zr = z + side * 4.6;
  } else {
    k.add(o.mat || "steelWorn", T2(cY(3.4, -5, 0, { seg: 14, c: 0.6 }), { p: [x, y, z] }));
    k.add("steelWorn", T2(cZ(1.4, -4, 4, { seg: 10 }), { p: [x, y - 3, z] }));
    y0 = y - 3;
  }
  const loop = [[x - w / 2, y0], [x - w / 2, y0 - h * 0.6], [x - w * 0.28, y0 - h], [x + w * 0.28, y0 - h], [x + w / 2, y0 - h * 0.6], [x + w / 2, y0]];
  k.add("steelWorn", wr(loop.map(([a, b]) => [a, b, zr]), 1.3, { closed: true, n: 48, seg: 7 }));
}
function svdBarrel(ctx, k, o) {
  const { latheX: lX, extrudeX: exX, extrudeZ: exZ, T: T2, box: bx, cylX: cX, cylY: cY, cylZ: cZ, shape: sh } = ctx.G;
  const { FRONT: F, MUZZLE: MZ, GAS_Y: GY, GAS_R: GR, SIGHT_Y: SY, REAR_X: RX, FRONT_X: FX } = SV;
  const M = "steel";
  k.add(M, lX([[F - 6, 0], [F - 6, 13.4], [106, 13.4], [110, 12], [250, 11], [400, 10], [446, 9.4], [580, 9], [596, 9], [598, 7.4], [MZ, 7.4], [MZ, 3.4], [MZ - 5, 3.4], [MZ - 5, 0]], { seg: 36 }));
  // колодка прицела (как у АК, но выше) и секторный целик
  k.add(M, exZ([[F - 2, 6], [104, 6], [104, 30, 2], [96, 38, 3], [40, 40, 3], [F - 2, 35, 2]], 26, { bevel: 1.4 }));
  // ушки шарнира планки, пружина планки и штифт колодки
  for (const s of [-1, 1]) k.add(M, exZ([[RX - 36, 36], [RX - 22, 36], [RX - 24, 43, 2], [RX - 34, 43, 2]], 2.2, { bevel: 0.4, z: s * 9.8 }));
  k.add("steelWorn", T2(cZ(1.8, -11.2, 11.2, { seg: 12 }), { p: [RX - 29, 40.4, 0] }));
  k.add("spring", exZ([[RX - 20, 39.8], [RX + 20, 38.4], [RX + 20, 39.2], [RX - 20, 40.6]], 8, { bevel: 0.2 }));
  for (const s of [-1, 1]) k.add("steelWorn", T2(cZ(2, 0, 0.8, { seg: 12 }), { p: [F + 18, 20, s > 0 ? 12.8 : -13.6] }));
  const leaf = ctx.kit();
  leaf.add(M, exZ([[RX - 30, 39.4], [RX + 28, 37], [RX + 28, 39.4], [RX - 24, 42.4, 2], [RX - 30, 42.8]], 17, { bevel: 0.5 }));
  const notch = [[-8.5, 38.4, 1], [8.5, 38.4, 1], [8.5, SY, 0.8], [1.5, SY, 0.2], [1.2, SY - 2.4, 0.5], [-1.2, SY - 2.4, 0.5], [-1.5, SY, 0.2], [-8.5, SY, 0.8]];
  leaf.add(M, exX(notch, RX - 2, RX + 1.4, { bevel: 0.3 }));
  leaf.add("steelWorn", exZ([[RX + 2, 38.6], [RX + 14, 38], [RX + 14, 44.5, 1], [RX + 2, 45.2, 1]], 20, { bevel: 0.8 }));
  // кнопки защёлки хомутика по бокам и его рифление сверху
  for (const s of [-1, 1]) leaf.add("steelWorn", T2(bx(6, 4.4, 2.6, { bevel: 0.8 }), { p: [RX + 8, 41.6, s * 11] }));
  for (let i = 0; i < 4; i++) leaf.add("steel", T2(bx(0.8, 0.6, 18, { bevel: 0.2 }), { p: [RX + 4 + i * 2.6, 45.1 - i * 0.12, 0] }));
  for (let i = 0; i < 10; i++) leaf.add("paintWhite", T2(bx(0.6, 0.2, 3), { p: [RX - 22 + i * 5, 42.1 - i * 0.28, 5] }));
  const leafNode = leaf.build("rearLeaf");
  // газовая трубка, газовая камора с двухпозиционным регулятором, толкатель
  k.add(M, T2(cX(GR, 100, 410, { c: 0.8, seg: 24 }), { p: [0, GY, 0] }));
  k.add(M, exZ([[404, -13, 4], [438, -13, 4], [438, 12, 2], [432, 36, 4], [408, 36, 3], [404, 26]], 24, { bevel: 1.6 }));
  k.add(M, T2(cX(11.5, 398, 440, { c: 1.2, seg: 28 }), { p: [0, GY, 0] }));
  k.add("steelWorn", T2(lX([[440, 0], [440, 10.2], [449, 10.2], [451, 8.6], [451, 0]], { seg: 24 }), { p: [0, GY, 0] }));
  k.add("lensBlack", T2(bx(0.8, 14, 2.4, { bevel: 0 }), { p: [451.1, GY, 0] }));
  for (const a of [-40, 40]) k.add("steelWorn", T2(bx(3, 1.4, 1.6, { bevel: 0.3 }), { p: [445, GY + 10.4, 0], r: [a, 0, 0] }));
  k.add("steelWorn", T2(cZ(4, 12, 15.5, { seg: 6 }), { p: [428, GY, 0] }));
  k.add("steelWorn", T2(exZ([[0, 0], [12, 0], [12, 3], [0, 3]], 2, { bevel: 0.3 }), { p: [424, GY + 2, 15.4] }));
  for (const x of [412, 430]) k.add("steelWorn", T2(cZ(2.2, -12.5, 12.5, { seg: 12, c: 0.3 }), { p: [x, -3, 0] }));
  // передняя антабка — слева на газовой каморе
  svdSwivel(ctx, k, [421, -6, -12], -1, { w: 16 });
  // основание мушки (напрессовано, два конических штифта), закрытый намушник с отверстием для ключа, упор штыка
  k.add(M, exZ([[FX - 34, -13, 3], [FX + 12, -13, 3], [FX + 12, 12, 2], [FX + 4, 19, 3], [FX - 26, 19, 3], [FX - 34, 10, 2]], 26, { bevel: 1.4 }));
  for (const x of [FX - 24, FX + 2]) k.add("steelWorn", T2(cZ(2, -13.3, 13.3, { seg: 12, c: 0.3 }), { p: [x, -5, 0] }));
  const HC = SY - 2, hood = (r, y0) => {
    const pts = [[r, y0]];
    for (let i = 0; i <= 18; i++) {
      const a = i / 18 * Math.PI;
      pts.push([Math.cos(a) * r, HC + Math.sin(a) * r]);
    }
    pts.push([-r, y0]);
    return pts;
  };
  k.add(M, exX(sh(hood(11, 16), [hood(8.6, 20.5).reverse()]), FX - 8, FX + 6, { bevel: 0.8 }));
  k.add("lensBlack", T2(cY(1.9, HC + 10.4, HC + 11.2, { seg: 14 }), { p: [FX - 1, 0, 0] }));
  k.add("steelWorn", T2(bx(10, 0.6, 1.2, { bevel: 0 }), { p: [FX - 1, 19.2, 13.2] }));
  k.add(M, exZ([[FX - 1.2, 16], [FX + 1.2, 16], [FX + 1.2, SY - 2], [FX + 0.9, SY, 0.3], [FX - 0.9, SY, 0.3], [FX - 1.2, SY - 2]], 2.4, { bevel: 0.2 }));
  if (o.bayonet) {
    k.add(M, exZ([[FX - 30, -12], [FX + 6, -12], [FX + 6, -25, 3], [FX - 22, -25, 3]], 12, { bevel: 1 }));
    for (const s of [-1, 1]) k.add("lensBlack", T2(bx(26, 2.2, 0.3, { bevel: 0 }), { p: [FX - 8, -19, s * 6.05] }));
  }
  k.add("steelWorn", T2(cX(3, 300, FX - 32, { c: 0.6, seg: 12 }), { p: [0, -15, 0] }));
  return leafNode;
}
function svdTrigger(ctx, nodes) {
  const { extrudeZ: exZ, node: nd, cylZ: cZ, T: T2, box: bx } = ctx.G;
  const t = ctx.kit();
  t.add("steel", exZ([[-2, 3], [3, 3], [3, -6, 2], [0, -17, 4], [-5, -23, 2], [-7, -21], [-3, -8, 3]], 6, { bevel: 0.9 }));
  nodes.trigger = nd("trigger", [t.build()], { p: [-118, -20, 0] });
  // флажок-предохранитель АК-типа на правом борту, ось у заднего торца
  const s = ctx.kit();
  // длина как у АК: в положении «огонь» перо не заходит на магазин
  s.add("steel", exZ([[-4, -4, 2], [120, 1, 2], [126, 4, 2], [126, 12, 2], [116, 13, 2], [4, 6, 3], [-4, 4, 2]], 1.8, { bevel: 0.4, z: 16.9 }));
  s.add("steel", exZ([[116, 4], [126, 4], [128, -4, 2], [118, -4, 2]], 3, { bevel: 0.8, z: 17.6 }));
  for (let i = 0; i < 3; i++) s.add("steel", T2(bx(0.8, 7, 0.8, { bevel: 0.2 }), { p: [119 + i * 2.6, 0, 19.2] }));
  s.add("steel", cZ(5.5, 15.5, 18, { seg: 20 }));
  s.add("steelWorn", T2(cZ(2.4, 17.6, 18.6, { seg: 12 }), {}));
  nodes.selector = nd("selector", [s.build()], { p: [-214, 2, 0] });
  return [nodes.trigger, nodes.selector];
}
function svdCarrier(ctx) {
  const { extrudeX: exX, extrudeY: exY, extrudeZ: exZ, T: T2, box: bx, cylX: cX, cylZ: cZ, latheX: lX, shape: sh, node: nd, rrect: rr } = ctx.G;
  const k = ctx.kit();
  k.add("steelBright", exX(rr(0, 12, 22, 15, 3), -170, 6, { bevel: 1 }));
  k.add("steelWorn", cX(9, -40, 0, { c: 0.8, seg: 24 }));
  // в окне выброса: боевой упор затвора, выбрасыватель, фигурный паз рамы и головка ударника
  k.add("steelBright", T2(bx(9, 6, 4, { bevel: 0.9 }), { p: [-6, 1.5, 7.6] }));
  k.add("steelWorn", exZ([[-34, 1.6], [-4, 1.6], [-1.4, 4.8, 1], [-34, 5.2]], 2, { bevel: 0.4, z: 9.4 }));
  k.add("steelWorn", T2(cZ(1.1, 9.6, 10.8, { seg: 10 }), { p: [-26, 3.4, 0] }));
  k.add("lensBlack", T2(bx(26, 1.4, 0.5, { bevel: 0 }), { p: [-28, 10.4, 11.05], r: [0, 0, 18] }));
  k.add("steel", T2(bx(80, 2, 0.6, { bevel: 0.2 }), { p: [-120, 17.6, 11.1] }));
  // рукоять рамы — массивная, справа
  const hx = -96;
  k.add("steelBright", exY(sh([[hx - 16, 10], [hx + 18, 10], [hx + 8, 22, 3], [hx - 12, 24, 3]]), 4, 11, { bevel: 0.8 }));
  k.add("steelBright", T2(cZ(4, 18, 28, { seg: 16 }), { p: [hx - 2, 7.5, 0] }));
  k.add("steelBright", T2(lX([[0, 0], [0, 6.2], [2.4, 7.6], [9, 7.6], [12, 5.2], [13, 0]], { seg: 22 }), { r: [0, -90, 0], p: [hx - 2, 7.5, 27] }));
  return nd("carrier", [k.build()]);
}
function svdBase(ctx) {
  const { node: nd } = ctx.G;
  const k = ctx.kit();
  const nodes = {};
  svdReceiver(ctx, k);
  svdCover(ctx, k);
  const leaf = svdBarrel(ctx, k, { bayonet: true });
  const trg = svdTrigger(ctx, nodes);
  const body = k.build("receiver");
  nodes.carrier = svdCarrier(ctx);
  const root = nd("svd", [body, leaf, nodes.carrier, ...trg]);
  const { mount: mount2 } = ctx;
  root.add(mount2({ id: "hg", type: "hg", p: [0, 0, 0] }));
  root.add(mount2({ id: "dovetail", type: "dovetail", p: [-118, -2, -19], slots: 1, axis: "side" }));
  root.add(mount2({ id: "muzzle", type: "thread", p: [SV.MUZZLE - 16, 0, 0] }));
  root.add(mount2({ id: "magwell", type: "magwell", p: [SV.MAG_X, SV.BOTTOM, 0], rock: [0, 0, 16] }));
  root.add(mount2({ id: "stock", type: "stock", p: [SV.REAR, 0, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 128, selector: { safe: 0, semi: -16 } },
    eject: { p: [-52, 6, 17], dir: [0.3, 0.5, 1], speed: 3.6 },
    muzzle: [SV.MUZZLE, 0, 0],
    irons: { rear: [SV.REAR_X, SV.SIGHT_Y, 0], front: [SV.FRONT_X, SV.SIGHT_Y, 0], type: "notch" },
    eyeX: -300,
    focus: { center: [30, -50, 0], size: 1420 }
  };
}
/* --------------------------------------------------------------- цевьё */
// Накладки: две половины с продолговатыми отверстиями охлаждения, передняя пружинная обойма.
function svdHg(ctx, o) {
  const { extrudeX: exX, T: T2, box: bx, node: nd, shape: sh, slot: sl, extrudeZ: exZ, cylZ: cZ } = ctx.G;
  const k = ctx.kit();
  const x0 = 110, x1 = 388, M = o.mat;
  const half = (s) => [[0, 36, 3], [s * 21, 30, 6], [s * 23, 6, 8], [s * 17, -18, 8], [0, -21, 3], [0, -17], [s * 13, -14], [s * 19, 6], [s * 17, 28], [0, 32]];
  for (const s of [-1, 1]) k.add(M, exX(half(s).map(([z, y, r]) => [z, y, r || 0]), x0, x1, { bevel: 1.4 }));
  // отверстия охлаждения по бортам
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) k.add("lensBlack", T2(exZ(sh(sl(-16, 16, 0, 8)), 1, { bevel: 0.2 }), { p: [x0 + 30 + i * 40, 12, s * 22.4] }));
  // обойма
  k.add("steel", exX([[-24, 34, 4], [24, 34, 4], [24, -22, 8], [-24, -22, 8]].map(([z, y, r]) => [z, y, r]), x1, x1 + 12, { bevel: 1 }));
  k.add("steel", exX([[-24, 34, 4], [24, 34, 4], [24, -22, 8], [-24, -22, 8]], x0 - 10, x0, { bevel: 1 }));
  k.add("steelWorn", T2(cZ(2.4, 23, 25.5, { seg: 12 }), { p: [x1 + 6, 6, 0] }));
  return { root: nd("hg", [k.build()]) };
}
function svdHgRail(ctx) {
  const { extrudeX: exX, T: T2, box: bx, node: nd, picatinny: pic, mlokHoles: ml, extrudeZ: exZ, shape: sh, circle: ci } = ctx.G;
  const k = ctx.kit();
  const x0 = 106, x1 = 392;
  const sec = [[-24, 14, 2], [-26, -4, 4], [-20, -24, 6], [20, -24, 6], [26, -4, 4], [24, 14, 2], [20, 14], [21, -2], [16, -19], [-16, -19], [-21, -2], [-20, 14]];
  k.add("alu", exX(sec, x0, x1, { bevel: 1.2 }));
  k.add("alu", exX(sh([[-15, 12, 2], [15, 12, 2], [15, SV.GAS_Y + 11, 3], [-15, SV.GAS_Y + 11, 3]], [ci(0, SV.GAS_Y, 8.6, 24)]), x0 + 4, x1 - 4, { bevel: 1.2 }));
  for (const h of ml(x0 + 20, x1 - 70, -8, { h: 7, len: 32 })) for (const s of [-1, 1]) k.add("lensBlack", exZ(sh(h), 1, { bevel: 0.2, z: s * 25.8 }));
  const mounts = [];
  const add = (id, face, rot, len, pos, base) => {
    const r = pic(len, { base });
    k.add("alu", r.geo, { r: rot, p: pos });
    mounts.push(ctx.railMount(id, [pos[0] + r.first, pos[1], pos[2]], face, r.slots, { axis: face }));
  };
  add("hgBottom", "bottom", [180, 0, 0], 200, [x1 - 206, -33, 0], 9);
  add("hgRight", "right", [90, 0, 0], 70, [x1 - 80, -4, 34], 8.5);
  add("hgLeft", "left", [-90, 0, 0], 70, [x1 - 80, -4, -34], 8.5);
  add("gasRail", "top", [0, 0, 0], 170, [x0 + 8, SV.GAS_Y + 20.4, 0], 9.4);
  return { root: nd("svd_rail", [k.build(), ...mounts]) };
}
/* --------------------------------------------------------------- дульные */
function svdFh(ctx) {
  const { latheX: lX, T: T2, box: bx, node: nd } = ctx.G;
  const k = ctx.kit();
  // штатный: длинный цилиндр с пятью продольными прорезями, срез со «щелью»
  k.add("steel", lX([[0, 0], [0, 11.6], [2, 12.4], [70, 12.4], [72, 11.2], [72, 7.6], [4, 7.6], [4, 0]], { seg: 36 }));
  for (let i = 0; i < 5; i++) k.add("lensBlack", T2(bx(38, 2.4, 3.6, { bevel: 0.6 }), { p: [48, 11.6, 0], r: [i * 72, 0, 0] }));
  return { root: nd("svdfh", [k.build()]), muzzle: { x: 72, kind: "fh", flash: 0.35 } };
}
function svdBrake(ctx) {
  const { latheX: lX, T: T2, box: bx, cylY: cY, node: nd, flutesX: fl } = ctx.G;
  const k = ctx.kit();
  k.add("steel", lX([[0, 0], [0, 13.4], [1.4, 15], [72, 15], [74, 13.6], [74, 5.4], [70, 5], [70, 0]], { seg: 36 }));
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.add("lensBlack", T2(bx(11, 14, 4, { bevel: 2 }), { p: [28 + i * 16, 0, s * 13.8] }));
  for (let i = 0; i < 2; i++) k.add("lensBlack", T2(cY(2.4, 12, 16, { seg: 12 }), { p: [26 + i * 16, 0, 0] }));
  k.add("steel", fl(15, 3, 14, 6, 3, 0.6));
  return { root: nd("svdbrake", [k.build()]), muzzle: { x: 74, kind: "brake", flash: 0.6 } };
}
function svdCan(ctx) {
  const { latheX: lX, flutesX: fl, tubeX: tb, cylX: cX, node: nd, ringGrooves: rg } = ctx.G;
  const k = ctx.kit();
  const R4 = 22, L = 230;
  k.add("steel", lX([[0, 0], [0, 12.4], [20, 12.4], [20, 0]], { seg: 28 }));
  k.add("cast", lX([[8, 0], [8, R4 - 5], [14, R4], [L - 6, R4], [L, R4 - 5], [L, 6.4], [L - 3, 5.8], [L - 3, 0]], { seg: 48, crease: 30 }));
  k.add("cast", rg(R4 + 0.3, 16, 40, 8, 0.6, { seg: 48 }));
  for (const x of [80, 150]) k.add("cast", tb(R4 + 0.9, R4 - 0.2, x, x + 5, { seg: 48 }));
  k.add("lensBlack", cX(6.4, L - 3, L + 0.05, { seg: 20 }));
  return { root: nd("rotor43", [k.build()]), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
/* --------------------------------------------------------------- магазины */
function svdMag(ctx, o) {
  const { T: T2, box: bx } = ctx.G;
  const m = boxMag(ctx, { d0: 88, d1: 84, w: 25, lipH: 12, lipX0: 6, lipX1: 60, lipRise: 4.4, lipCurl: 3.2, cal: "762x54R", plateH: 6, plateOver: 6, roundTilt: 4, ...o });
  // «вафельные» выштамповки стального магазина
  if (o.waffle) {
    const k = ctx.kit();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (const s of [-1, 1]) k.add(o.mat, T2(bx(28, 18, 1.2, { bevel: 0.6 }), { p: [-22 - j * 36, -16 - i * 26, s * 12.9] }));
    m.root.add(k.build());
  }
  return m;
}
/* --------------------------------------------------------------- приклады */
// Пистолетная рукоять СВДС/СВДМ: отдельная деталь под задней частью коробки, за спусковой скобой.
// Координаты — от заднего среза коробки (узел приклада). Верх оси спрятан в коробке, фланец прилегает к дну.
function svdPistolGrip(ctx, k, mat = "poly") {
  const { loftPath: lp, extrudeY: exY, T: T2, shape: sh, rrect: rr, cylZ: cZ } = ctx.G;
  const B = SV.BOTTOM, rake = 18 * Math.PI / 180, L = 118;
  const x0 = 40, y0 = B + 8, dx = -Math.sin(rake), dy = -Math.cos(rake);
  const secs = (d, db, t0 = 0, t1 = 1, n = 16) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * i / n, u = (t - 0.26) / 0.64;
      // три выемки под пальцы спереди, «брюшко» под ладонь сзади, лёгкий упор внизу
      const groove = u > 0 && u < 1 ? 1.7 * Math.sin(Math.PI * 3 * u) ** 2 : 0;
      const flare = t > 0.9 ? (t - 0.9) * 22 : 0;
      out.push({ c: [x0 + dx * L * t, y0 + dy * L * t], a: 14.6 - groove + flare - d, a2: 15.2 + 2.6 * Math.sin(Math.PI * Math.min(1, t * 1.2)) + flare - d, b: 13 + 1.3 * Math.sin(Math.PI * t) + db, k: 2.7 });
    }
    return out;
  };
  k.add(mat, lp(secs(0, 0), { seg: 36 }));
  // боковые панели с мелкой насечкой лежат на поверхности рукояти (чуть шире по Z, уже спереди/сзади)
  k.add("polyGrip", lp(secs(2.8, 0.45, 0.2, 0.86, 12), { seg: 36 }));
  // фланец по дну коробки и винт крепления
  k.add(mat, exY(sh(rr(40, 0, 48, 29, 5)), B - 3.4, B + 0.2, { bevel: 1 }));
  k.add("steelWorn", T2(cZ(2.6, -15, 15, { seg: 14, c: 0.4 }), { p: [50, B - 1.6, 0] }));
  const bx0 = x0 + dx * L, by0 = y0 + dy * L;
  k.add("steelWorn", T2(cZ(3, -1, 1, { seg: 16 }), { p: [bx0 - 2, by0 + 12, 13.8] }));
}
// Резиновый затыльник с горизонтальными рёбрами (рёбра — прямо в контуре, по всей ширине).
function svdButtPad(ctx, xf, yTop, yBot, depth, width, o = {}) {
  const { extrudeZ: exZ } = ctx.G;
  const n = o.n ?? 26, mid = (yTop + yBot) / 2, hh = (yTop - yBot) / 2, pts = [[xf, yTop + 1, 3]];
  for (let i = 0; i <= n; i++) {
    const y = yTop - 2 - (yTop - yBot - 4) * i / n, q = (y - mid) / hh;
    pts.push([xf - depth - (o.bulge ?? 2.5) * (1 - q * q) - (i % 2 ? 1.3 : 0), y]);
  }
  pts.push([xf - (o.slant ?? 0), yBot - 1, 3]);
  return exZ(pts, width, { bevel: 2.2 });
}
// «Скелет» с пистолетным вырезом и съёмной щекой.
function svdStock(ctx, o) {
  const { extrudeZ: exZ, T: T2, box: bx, shape: sh, node: nd, cylZ: cZ, screwHead: sw } = ctx.G;
  const k = ctx.kit();
  const M = o.mat;
  const outline = [[16, 14, 2], [-6, 14, 3], [-60, 4, 16], [-210, -6, 20], [-360, -10, 8], [-372, -12, 4], [-372, -150, 6], [-352, -152, 10], [-240, -96, 30], [-120, -72, 16], [-70, -112, 14], [-40, -114, 10], [-26, -60, 10], [-2, -26, 4], [16, -26, 2]];
  const hole = [[-44, -30, 8], [-96, -44, 14], [-230, -58, 24], [-334, -60, 20], [-344, -40, 12], [-300, -22, 10], [-110, -18, 10], [-56, -12, 6]];
  k.add(M, exZ(sh(outline, [hole]), 34, { bevel: 6, curve: 8 }));
  // затыльник (сталь со «сдвоенным» упором)
  k.add("steel", T2(exZ([[-372, -8, 3], [-380, -8, 4], [-380, -154, 6], [-372, -152, 4]], 38, { bevel: 1.6 }), {}));
  for (const y of [-30, -128]) k.add("steelWorn", T2(sw(3.2, 1.3), { r: [0, -90, 0], p: [-380, y, 0] }));
  if (o.cheek) {
    // съёмная щека на защёлке
    k.add(o.cheekMat || "polySoft", T2(exZ([[-70, 17, 8], [-250, 11, 10], [-250, -8, 4], [-70, 1, 4]], 38, { bevel: 5 }), {}));
    k.add("steelWorn", T2(cZ(3, -20, 20, { seg: 12 }), { p: [-110, 16, 0] }));
  }
  k.add("steel", exZ([[18, 16], [0, 16], [0, -24], [18, -24]], 30, { bevel: 1.2 }));
  // задняя антабка — снизу приклада, на вертлюге
  svdSwivel(ctx, k, [-330, -142, 0], 0, { w: 18 });
  return { root: nd("svdstock", [k.build()]), cheek: { x: -140, y: 18 } };
}
// СВДС: отдельная пистолетная рукоять под коробкой + трубчатый приклад на шарнире справа.
// Верхняя труба — от узла шарнира в затыльник, нижняя — наклонная тяга; щека обжимает верхнюю трубу.
function svdsStock(ctx) {
  const { extrudeZ: exZ, extrudeX: exX, T: T2, cylX: cX, cylY: cY, cylZ: cZ, node: nd, box: bx, shape: sh, circle: ci, screwHead: sw } = ctx.G;
  const k = ctx.kit(), f = ctx.kit();
  svdPistolGrip(ctx, k);
  // колодка шарнира на заднем срезе коробки: снизу опускается под нижнюю тягу
  const PX = -26, PZ = 22, TY = -4, TR = 10;
  k.add("steel", exZ([[0, 13, 1], [-22, 13, 3], [PX, 7, 2], [PX, -36, 3], [-20, -44, 4], [0, -44, 2]], 34, { bevel: 1.4 }));
  k.add("steel", exZ([[0, 12], [6, 12], [6, -24], [0, -24]], 27, { bevel: 0.6 }));
  for (const y of [4, -30]) k.add("steelWorn", T2(sw(2.8, 1.2), { p: [-10, y, 17] }));
  // ушки шарнира (верхнее и нижнее) справа, ось вертикальная
  for (const [y0, y1] of [[5, 13], [-44, -35]]) {
    k.add("steel", T2(cY(6.5, y0, y1, { seg: 20, c: 0.8 }), { p: [PX, 0, PZ] }));
    k.add("steel", T2(bx(14, y1 - y0, 8, { bevel: 0.8 }), { p: [PX + 6, (y0 + y1) / 2, 18.5] }));
  }
  k.add("steelBright", T2(cY(2.6, -46, 15, { seg: 14 }), { p: [PX, 0, PZ] }));
  for (const y of [-46.6, 14.4]) k.add("steelWorn", T2(cY(3.8, y, y + 1.2, { seg: 16, c: 0.4 }), { p: [PX, 0, PZ] }));
  // кнопка фиксатора слева, в защитном кольце
  k.add("steel", T2(cZ(7.2, -18.6, -16.6, { seg: 24, c: 0.5 }), { p: [-12, -14, 0] }));
  k.add("steelBright", T2(cZ(4.6, -21.4, -17, { seg: 20, c: 0.8 }), { p: [-12, -14, 0] }));
  // --- складывающаяся часть (в координатах приклада; узел fold ставится на ось шарнира)
  f.add("steel", exZ([[-26.6, 13, 2], [-40, 13, 3], [-40, -44, 3], [-26.6, -44, 2]], 34, { bevel: 1.4 }));
  f.add("steel", T2(cY(6.5, -34, 4, { seg: 20, c: 0.8 }), { p: [PX, 0, PZ] }));
  f.add("steel", T2(bx(12, 38, 8, { bevel: 0.8 }), { p: [PX - 7, -15, 18.5] }));
  f.add("steelWorn", T2(bx(6, 4, 3, { bevel: 0.6 }), { p: [-30, -14, -17.4] }));
  // верхняя труба с обжимными муфтами на обоих концах
  f.add("steel", T2(cX(TR, -334, -38, { c: 0.6, seg: 28 }), { p: [0, TY, 0] }));
  f.add("steel", T2(cX(TR + 2.6, -54, -39, { c: 1, seg: 28 }), { p: [0, TY, 0] }));
  f.add("steel", T2(cX(TR + 2.6, -328, -312, { c: 1, seg: 28 }), { p: [0, TY, 0] }));
  // нижняя тяга: из колодки вниз-назад в нижнюю часть затыльника
  const S0 = [-38, -34], S1 = [-324, -112], sL = Math.hypot(S1[0] - S0[0], S1[1] - S0[1]);
  const sA = Math.atan2(S1[1] - S0[1], S1[0] - S0[0]) * 180 / Math.PI, strut = { r: [0, 0, sA], p: [S0[0], S0[1], 0] };
  f.add("steel", T2(cX(8, 0, sL, { c: 0.6, seg: 24 }), strut));
  f.add("steel", T2(cX(10.4, 0, 14, { c: 1, seg: 24 }), { ...strut }));
  f.add("steel", T2(cX(10.4, sL - 20, sL - 4, { c: 1, seg: 24 }), { ...strut }));
  // стальная рамка затыльника и резиновый затыльник
  f.add("steel", exZ([[-316, 17, 3], [-336, 18, 3], [-338, -152, 4], [-318, -152, 3], [-322, -118, 12], [-316, -40, 20]], 38, { bevel: 1.8 }));
  f.add("rubber", svdButtPad(ctx, -337, 18, -153, 13, 42, { slant: 1.5 }));
  for (const y of [8, -140]) f.add("steelWorn", T2(sw(2.6, 1), { p: [-327, y, 19] }));
  // щека: полимерная колодка с отверстием точно по трубе, стянута двумя винтами снизу
  const cheekOut = [[-12.6, TY - 13.5, 6], [12.6, TY - 13.5, 6], [15, TY + 11, 6], [13, 23, 7], [-13, 23, 7], [-15, TY + 11, 6]];
  f.add("poly", exX(sh(cheekOut, [ci(0, TY, TR + 0.05, 32)]), -236, -84, { bevel: 4, curve: 8 }));
  f.add("polySoft", exX(sh([[-11, 22], [11, 22], [11, 24.2, 1], [-11, 24.2, 1]]), -226, -94, { bevel: 0.8 }));
  f.add("lensBlack", T2(bx(136, 0.6, 2.4, { bevel: 0 }), { p: [-160, TY - 13.6, 0] }));
  for (const x of [-122, -198]) {
    f.add("steelWorn", T2(sw(3, 1.3), { p: [x, TY - 9, 13.2] }));
    f.add("steelWorn", T2(cZ(3.4, -14.8, -13, { seg: 6 }), { p: [x, TY - 9, 0] }));
  }
  svdSwivel(ctx, f, [-329, -128, -19], -1, { w: 16 });
  const fold = nd("fold", [f.build()], { p: [PX, 0, PZ] });
  fold.children[0].position.set(-PX, 0, -PZ);
  return { root: nd("svds", [k.build(), fold]), fold: { node: fold, axis: "y", angle: 172 }, cheek: { x: -140, y: 18 } };
}
// СВДМ: пистолетная рукоять, труба-направляющая, ползун с регулируемой щекой. Ползун ездит на +60 мм.
function svdmStock(ctx) {
  const { extrudeZ: exZ, T: T2, cylX: cX, cylY: cY, cylZ: cZ, node: nd, box: bx, shape: sh, ringGrooves: rg } = ctx.G;
  const k = ctx.kit(), sl = ctx.kit();
  svdPistolGrip(ctx, k);
  // переходник на коробку и труба-направляющая с гребёнкой фиксатора снизу
  k.add("steel", exZ([[16, 16], [-30, 16, 2], [-34, 9, 2], [-34, -20, 3], [-26, -26, 2], [16, -26]], 34, { bevel: 1.4 }));
  for (const y of [8, -18]) k.add("steelWorn", T2(cZ(2.6, 16.6, 17.6, { seg: 14 }), { p: [-14, y, 0] }));
  k.add("alu", T2(cX(14.6, -250, -30, { c: 1, seg: 32 }), { p: [0, -2, 0] }));
  k.add("alu", T2(rg(15.1, -48, -36, 3, 0.5, { seg: 32 }), { p: [0, -2, 0] }));
  k.add("alu", T2(bx(214, 4, 7, { bevel: 0.6 }), { p: [-142, -17.4, 0] }));
  for (let i = 0; i < 6; i++) k.add("lensBlack", T2(bx(4, 0.4, 4, { bevel: 0 }), { p: [-66 - i * 14, -19.5, 0] }));
  const body = sh([[-186, 18, 4], [-332, 18, 4], [-342, 10, 4], [-342, -140, 8], [-300, -142, 10], [-262, -64, 22], [-200, -24, 8], [-186, -22, 4]], [[[-290, -44, 6], [-328, -44, 6], [-328, -124, 8], [-312, -124, 8]]]);
  sl.add("poly", exZ(body, 40, { bevel: 4 }));
  sl.add("rubber", svdButtPad(ctx, -341, 12, -143, 11, 42, { n: 22 }));
  // рычаг фиксатора длины под трубой и гнёзда QD-антабок
  sl.add("steelWorn", exZ([[-190, -22], [-214, -22, 2], [-218, -30, 2], [-196, -31, 2]], 10, { bevel: 0.8 }));
  for (const s of [-1, 1]) {
    sl.add("steel", T2(cZ(6, 0, 1.4, { seg: 20, c: 0.3 }), { p: [-318, -24, s > 0 ? 19.6 : -21] }));
    sl.add("lensBlack", T2(cZ(3.2, 0, 1.6, { seg: 14 }), { p: [-318, -24, s > 0 ? 19.8 : -21.4] }));
  }
  // щека на двух стойках, фиксатор высоты слева
  sl.add("poly", exZ([[-196, 40, 6], [-322, 40, 6], [-322, 28, 3], [-196, 28, 3]], 32, { bevel: 4 }));
  for (const x of [-220, -292]) {
    sl.add("alu", T2(cY(5, 16, 30, { seg: 18, c: 0.4 }), { p: [x, 0, 0] }));
    sl.add("steelWorn", T2(cY(7, 17, 19.5, { seg: 18, c: 0.6 }), { p: [x, 0, 0] }));
  }
  sl.add("steelWorn", T2(cZ(5.5, -25, -19.5, { seg: 20, c: 0.8 }), { p: [-256, 8, 0] }));
  const slide = nd("slide", [sl.build()]);
  return { root: nd("svdm", [k.build(), slide]), fold: { node: slide, slide: 60 }, cheek: { x: -250, y: 40 } };
}
var svd_default = {
  id: "svd",
  family: "svd",
  title: "СВД — снайперская винтовка Драгунова",
  short: "СВД",
  caliber: "7,62×54R",
  cal: "762x54R",
  thread: "svd",
  boltHold: true,
  holdByFollower: true,
  chargeLabel: "затвор",
  specs: [["Ствол", "620 мм"], ["Длина", "1225 мм"], ["Магазин", "10"], ["Масса", "4,3 кг"]],
  base: { weight: 3700, length: 1225, ergo: 38, recoilV: 100, recoilH: 80, moa: 1.2, velocity: 830, range: 800, loud: 166, flash: 50, adsTime: 420, rpm: 600, mag: 10 },
  audio: { cal: "762x54R", mech: 1 },
  modes: ["safe", "semi"],
  build: svdBase,
  keepOut: [{ axis: "top", x0: 60, x1: 110, label: "колодка целика" }],
  slots: [
    { id: "handguard", label: "Цевьё", group: "Ствол и цевьё", accepts: ["svdhg"], mount: "hg", required: true },
    { id: "muzzle", label: "Дульное устройство", group: "Ствол и цевьё", accepts: ["muzzle"], mount: "muzzle" },
    { id: "sidemount", label: "Боковой кронштейн", group: "Оптика", accepts: ["sidemount"], rails: ["dovetail"] },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: ["sideRail", "dovetail", "gasRail"], prefer: { x: -110 } },
    { id: "under", label: "Под стволом", group: "Тактика", accepts: ["foregrip", "bipod"], rails: ["hgBottom"], prefer: "front" },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgRight"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgLeft"], prefer: "front" },
    { id: "mag", label: "Магазин", group: "Коробка", accepts: ["mag"], mount: "magwell" },
    { id: "stock", label: "Приклад", group: "Коробка", accepts: ["stock"], mount: "stock", required: true }
  ],
  parts: [
    { id: "hg_wood", cat: "svdhg", name: "Накладки, клеёная берёза", desc: "Штатные, с отверстиями охлаждения", stats: { weight: 260 }, build: (c) => svdHg(c, { mat: "wood" }) },
    { id: "hg_poly", cat: "svdhg", name: "Накладки, полимер", desc: "Чёрный стеклонаполненный полиамид", stats: { weight: 210, ergo: 1 }, build: (c) => svdHg(c, { mat: "poly" }) },
    { id: "hg_rail", cat: "svdhg", name: "Цевьё с планками", desc: "Пикатинни снизу, по бортам и на газовой трубке", stats: { weight: 480, ergo: 3 }, build: svdHgRail },
    { id: "svd_fh", cat: "muzzle", name: "Пламегаситель СВД", desc: "Штатный, пять прорезей", fit: { thread: ["svd"] }, stats: { weight: 110, length: 72, flash: -35 }, build: svdFh },
    { id: "svd_dtk", cat: "muzzle", name: "ДТК для СВД", desc: "Трёхкамерный: заметно меньше отдача, громче", fit: { thread: ["svd"] }, stats: { weight: 190, length: 74, flash: 20, "recoilV%": -26, "recoilH%": -20, loud: 4 }, build: svdBrake },
    { id: "rotor43", cat: "muzzle", name: "Глушитель Rotor 43 (7,62×54R)", desc: "Снижает звук и вспышку, пуля остаётся сверхзвуковой", fit: { thread: ["svd"] }, stats: { weight: 680, length: 230, loud: -25, flash: -60, "recoilV%": -14, ergo: -9, adsTime: 30, velocity: 8 }, build: svdCan },
    { id: "mag10", cat: "mag", name: "Магазин 10, сталь", desc: "Штатный, «вафельные» выштамповки", stats: { weight: 240, mag: 10 }, build: (c) => svdMag(c, { R: 900, len: 106, mat: "steelPark", cap: 10, waffle: true }) },
    { id: "mag10p", cat: "mag", name: "Магазин 10, полимер", desc: "Легче стального", stats: { weight: 150, mag: 10, ergo: 1 }, build: (c) => svdMag(c, { R: 900, len: 106, mat: "poly", cap: 10, ribs: true }) },
    { id: "mag20", cat: "mag", name: "Магазин 20", desc: "Удлинённый, мешает стрельбе лёжа", stats: { weight: 380, mag: 20, ergo: -5, adsTime: 14 }, build: (c) => svdMag(c, { R: 700, len: 176, mat: "steelPark", cap: 20, waffle: true }) },
    { id: "st_wood", cat: "stock", name: "Приклад-«скелет», берёза", desc: "Штатный, со съёмной щекой", stats: { weight: 620 }, build: (c) => svdStock(c, { mat: "wood", cheek: true, cheekMat: "wood" }) },
    { id: "st_poly", cat: "stock", name: "Приклад-«скелет», полимер", desc: "Чёрный, 1990-х годов", stats: { weight: 540, ergo: 1 }, build: (c) => svdStock(c, { mat: "poly", cheek: true, cheekMat: "poly" }) },
    { id: "st_svds", cat: "stock", name: "СВДС, складной", desc: "Трубчатый, складывается вправо (K)", stats: { weight: 700, ergo: 2, "recoilV%": 4 }, build: svdsStock },
    { id: "st_svdm", cat: "stock", name: "СВДМ, телескопический", desc: "Регулируемые длина и щека (K)", stats: { weight: 820, ergo: 5, "recoilV%": -8, "recoilH%": -6 }, build: svdmStock }
  ],
  defaults: {
    handguard: "hg_wood",
    muzzle: "svd_fh",
    sidemount: null,
    optic: "pso1",
    under: null,
    tacRight: null,
    tacLeft: null,
    mag: "mag10",
    stock: "st_wood"
  }
};

DEFS[svd_default.id] = svd_default; FAMILY[svd_default.id] = "A";
})();
(() => {
// ---- weapons/m870.js
// Remington 870: помповое ружьё 12/76, фрезерованная стальная коробка, подствольный трубчатый магазин.
// Единицы — мм, ось канала ствола y = 0, x = 0 — зеркало затвора, +z — правый борт (окно выброса).
var R8 = {
  REAR: -168,
  FRONT: 32,
  TOP: 17,
  BOT: -41,
  HW: 13.6,
  TUBE_Y: -27,
  TUBE_R: 11.4,
  TUBE_X1: 342,
  SIGHT_Y: 21
};
function m870Receiver(ctx, k) {
  const { extrudeX: exX, extrudeY: exY, extrudeZ: exZ, T: T2, box: bx, cylZ: cZ, shape: sh, rrect: rr, screwHead: sw } = ctx.G;
  const { REAR: R4, FRONT: F, TOP, BOT, HW: W } = R8;
  const M = "steelPark";
  // сечение: плоские борта, скруглённый верх, снизу — окно заряжания (закрыто лотком, см. ниже)
  // окно выброса справа — сквозной вырез до середины коробки: в нём виден затвор.
  // Корпус — одна экструзия с пазом по всей длине (без швов на левом борту), паз заполнен вставками до и после окна.
  const sec = [[-W, BOT, 2], [W, BOT, 2], [W, -12], [-2, -12], [-2, 11], [W, 11], [W, TOP - 4, 5], [W - 5, TOP, 6], [-W + 5, TOP, 6], [-W, TOP - 4, 5]];
  k.add(M, exX(sec, R4, F, { bevel: 1 }));
  const fill = [[-2, -12], [W, -12], [W, 11], [-2, 11]];
  k.add(M, exX(fill, R4 + 0.6, -78, { bevel: 0 }));
  k.add(M, exX(fill, 16, F - 0.6, { bevel: 0 }));
  // тёмная глубина окна выброса — за затвором, чтобы затвор был виден в окне
  k.add("lensBlack", T2(bx(94, 23, 0.6, { bevel: 0 }), { p: [-31, -0.5, -1.6] }));
  k.add("lensBlack", T2(bx(94, 1, 10), { p: [-31, -11.4, 6] }));
  // задний скос к прикладу и шейка
  k.add(M, exZ([[R4, TOP - 2, 3], [R4 - 10, TOP - 8, 4], [R4 - 10, BOT + 12, 4], [R4, BOT, 2]], W * 2 - 1, { bevel: 1.4 }));
  // линии фрезеровки: переход плоского борта в скругление верха и передний торец под ствол
  for (const s of [-1, 1]) {
    k.add("lensBlack", T2(bx(F - R4 - 8, 0.35, 0.2, { bevel: 0 }), { p: [(F + R4) / 2, TOP - 4.6, s * (W + 0.02)] }));
    k.add("lensBlack", T2(bx(0.35, TOP - BOT - 8, 0.2, { bevel: 0 }), { p: [F - 6, (TOP + BOT) / 2, s * (W + 0.02)] }));
    // пазы под штанги затвора в переднем торце
    k.add("lensBlack", T2(bx(0.4, 5, 2.6, { bevel: 0 }), { p: [F + 0.05, R8.TUBE_Y + 8, s * 11.5] }));
  }
  // окно заряжания снизу (между трубкой магазина и коробкой УСМ): проём, подаватель-«ложка», отсечки
  k.add("lensBlack", T2(bx(56, 0.6, 21, { bevel: 0 }), { p: [2, BOT - 0.2, 0] }));
  k.add("steelWorn", exY(sh(rr(-2, 0, 46, 15, 4), [rr(6, 0, 22, 5, 2.4)]), BOT - 1.4, BOT - 0.5, { bevel: 0.3 }));
  for (const s of [-1, 1]) k.add("steelBright", T2(bx(42, 0.8, 1.6, { bevel: 0.2 }), { p: [6, BOT - 0.7, s * 9.4] }));
  k.add("steelWorn", T2(bx(8, 1.4, 4, { bevel: 0.4 }), { p: [26, BOT - 0.9, -6] }));
  // штифты УСМ (передний и задний) — головки с фаской на обоих бортах
  for (const x of [-126, -44]) for (const s of [-1, 1]) {
    k.add("steelWorn", T2(cZ(3.4, 0, 0.7, { seg: 18, c: 0.3 }), { p: [x, -32, s > 0 ? W - 0.1 : -W - 0.6] }));
    k.add("lensBlack", T2(cZ(1.2, 0, 0.3, { seg: 10 }), { p: [x, -32, s > 0 ? W + 0.5 : -W - 0.8] }));
  }
  // заглушки резьбовых отверстий под кронштейн сверху
  for (const x of [-150, -128, -14, 8]) k.add("steelWorn", T2(sw(2.3, 0.5, { seg: 12 }), { r: [-90, 0, 0], p: [x, TOP - 0.3, 0] }));
  // клеймо на левом борту: REMINGTON / 870 POLICE MAGNUM — штрихи-«буквы» тонкой гравировкой
  const glyphs = (x0, y0, n, h, pitch) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * pitch, v = i * 7 % 5;
      k.add("lensBlack", T2(bx(0.5, h, 0.2, { bevel: 0 }), { p: [x, y0, -W - 0.02] }));
      k.add("lensBlack", T2(bx(pitch * 0.55, 0.5, 0.2, { bevel: 0 }), { p: [x + pitch * 0.25, y0 + (v - 2) * h * 0.22, -W - 0.02] }));
      if (v % 2) k.add("lensBlack", T2(bx(0.5, h, 0.2, { bevel: 0 }), { p: [x + pitch * 0.55, y0, -W - 0.02] }));
    }
  };
  glyphs(-128, -6, 9, 5, 6.4);
  glyphs(-122, -15, 14, 3, 3.8);
}
function m870Base(ctx) {
  const { node: nd, T: T2, box: bx, cylX: cX, cylZ: cZ, latheX: lX, extrudeZ: exZ, ringGrooves: rg, shape: sh } = ctx.G;
  const k = ctx.kit();
  const nodes = {};
  m870Receiver(ctx, k);
  // трубка магазина до кольца ствола, затыльная гайка ствольной коробки
  k.add("steelPark", T2(cX(R8.TUBE_R, R8.FRONT - 4, 300, { c: 0.6, seg: 32 }), { p: [0, R8.TUBE_Y, 0] }));
  k.add("steelPark", T2(lX([[300, 0], [300, R8.TUBE_R + 0.6], [340, R8.TUBE_R + 0.6], [342, R8.TUBE_R - 1], [342, 0]], { seg: 32 }), { p: [0, R8.TUBE_Y, 0] }));
  k.add("steelPark", T2(rg(R8.TUBE_R + 1, 312, 338, 12, 0.6, { seg: 32 }), { p: [0, R8.TUBE_Y, 0] }));
  const body = k.build("receiver");
  // затвор в окне выброса: цилиндр затвора с выбрасывателем, боевая личинка, ползун штанг под ним
  const c = ctx.kit();
  c.add("steelBright", cX(9.6, -76, -12, { c: 1, seg: 28 }));
  c.add("steelBright", cX(10.2, -12, -2, { c: 0.8, seg: 28 }));
  c.add("steelWorn", exZ([[-34, 2.6], [-4, 2.6], [-1, 5.4, 1], [-34, 6]], 2, { bevel: 0.4, z: 9.6 }));
  c.add("steelWorn", T2(cZ(1.1, 9.2, 10.4, { seg: 10 }), { p: [-28, 4.2, 0] }));
  c.add("lensBlack", T2(bx(40, 0.6, 0.4, { bevel: 0 }), { p: [-46, -3, 9.5] }));
  c.add("steelWorn", T2(bx(84, 6, 18, { bevel: 0.8 }), { p: [-44, -12.5, 0] }));
  nodes.carrier = nd("bolt", [c.build()]);
  // УСМ: алюминиевая коробка курка, скоба, поперечный предохранитель (красный поясок слева = «огонь»),
  // рычаг затворной задержки слева перед скобой, заклёпки скобы
  const t = ctx.kit();
  t.add("aluGrey", exZ([[-28, R8.BOT, 2], [-162, R8.BOT, 2], [-164, R8.BOT - 8, 3], [-150, R8.BOT - 12, 4], [-30, R8.BOT - 12, 3]], 22, { bevel: 1.2 }));
  t.add("aluGrey", exZ(sh([[-60, R8.BOT - 8], [-128, R8.BOT - 8], [-124, R8.BOT - 42, 8], [-78, R8.BOT - 46, 10], [-60, R8.BOT - 30, 6]], [[[-66, R8.BOT - 12], [-120, R8.BOT - 12], [-118, R8.BOT - 36, 6], [-82, R8.BOT - 40, 8], [-68, R8.BOT - 28, 4]]]), 12, { bevel: 1.2 }));
  t.add("steelWorn", T2(cZ(3.4, -11.2, 11.2, { seg: 18, c: 0.3 }), { p: [-126, R8.BOT - 16, 0] }));
  t.add("steelWorn", T2(cZ(3.4, -13.4, -11.2, { seg: 18, c: 0.6 }), { p: [-126, R8.BOT - 16, 0] }));
  t.add("paintRed", T2(cZ(3.5, -11.9, -11.2, { seg: 18 }), { p: [-126, R8.BOT - 16, 0] }));
  t.add("steelWorn", exZ([[-40, R8.BOT - 3], [-54, R8.BOT - 3, 1], [-58, R8.BOT - 12, 2], [-54, R8.BOT - 17, 2], [-50, R8.BOT - 16, 1], [-50, R8.BOT - 8]], 2.2, { bevel: 0.5, z: -12.1 }));
  for (let i = 0; i < 3; i++) t.add("steelWorn", T2(bx(0.7, 3, 1, { bevel: 0.2 }), { p: [-56.6 + i * 2, R8.BOT - 13 + i * 0.6, -13.2] }));
  for (const [x, y] of [[-72, R8.BOT - 10], [-122, R8.BOT - 10], [-150, R8.BOT - 6]]) t.add("steelWorn", T2(cZ(1.8, -11.4, 11.4, { seg: 12, c: 0.3 }), { p: [x, y, 0] }));
  const body2 = t.build("tg");
  const tr = ctx.kit();
  tr.add("steelWorn", exZ([[-2, 4], [3, 4], [3, -6, 2], [1, -18, 4], [-4, -24, 2], [-6, -22], [-3, -8, 3]], 6, { bevel: 0.8 }));
  nodes.trigger = nd("trigger", [tr.build()], { p: [-94, R8.BOT - 10, 0] });
  // патрон для анимации заряжания трубки (прячется в окне)
  const ls = ctx.kit();
  ctx.C.cartridge(ls, "12ga", { p: [-32, 0, 0] });
  nodes.loadShell = nd("loadShell", [ls.build()]);
  nodes.loadShell.visible = false;
  const loadHolder = nd("loadHolder", [nodes.loadShell], { p: [-20, R8.TUBE_Y, 0] });
  const root = nd("m870", [body, body2, nodes.carrier, nodes.trigger, loadHolder]);
  const { mount: mount2 } = ctx;
  // цевьё ездит по трубке: всё, что на нём, — в узле forend
  nodes.forend = nd("forend", [mount2({ id: "forend", type: "forend", p: [0, 0, 0] })]);
  root.add(nodes.forend);
  root.add(mount2({ id: "barrel", type: "barrel", p: [R8.FRONT, 0, 0] }));
  root.add(mount2({ id: "tubeEnd", type: "tube", p: [342, R8.TUBE_Y, 0] }));
  root.add(mount2({ id: "rcvTop", type: "rcvTop", p: [-70, R8.TOP, 0] }));
  root.add(mount2({ id: "saddle", type: "saddle", p: [-60, -8, -R8.HW] }));
  root.add(mount2({ id: "stock", type: "stock", p: [R8.REAR - 10, 0, 0] }));
  root.add(mount2({ id: "ammo", type: "ammo", p: [0, 0, 0] }));
  return {
    root,
    nodes,
    anim: { pumpTravel: 92, carrierTravel: 92, triggerAngle: 0.22 },
    eject: { p: [-26, 2, 16], dir: [0.15, 0.55, 1], speed: 2.4 },
    muzzle: [500, 0, 0],
    irons: { rear: [R8.REAR + 20, R8.SIGHT_Y, 0], type: "notch" },
    eyeX: -390,
    focus: { center: [-20, -50, 0], size: 1150 }
  };
}
/* --------------------------------------------------------------- стволы */
function m870Barrel(ctx, o) {
  const { node: nd, T: T2, box: bx, latheX: lX, extrudeZ: exZ, cylX: cX, sphere: sp, cylY: cY } = ctx.G;
  const k = ctx.kit();
  const L = o.len;
  // хвостовик в коробке, конус патронника, тонкая дульная часть, резьба под чоки
  // хвостовик уже коробки (виден в окне выброса перед затвором), заметный заплечик на выходе из коробки
  k.add("steelPark", lX([[-2, 0], [-2, 11.4], [-1, 12], [29, 12], [29, 13.4], [40, 13.2], [46, 12.8], [120, 12.4], [L - 30, 11.6], [L - 1, 11.6], [L, 10.8], [L, 9.6], [L - 20, 9.6], [L - 20, 0]], { seg: 40 }));
  k.add("lensBlack", T2(bx(12, 0.8, 0.4, { bevel: 0 }), { p: [8, 0, 11.9] }));
  // кольцо-ушко под гайку магазина
  k.add("steelPark", exZ([[296, -8], [306, -8], [308, R8.TUBE_Y + 12.8, 3], [294, R8.TUBE_Y + 12.8, 3]], 14, { bevel: 1.4 }));
  k.add("steelPark", T2(cX(R8.TUBE_R + 2.2, 294, 308, { c: 1, seg: 32 }), { p: [0, R8.TUBE_Y, 0] }));
  // клеймо калибра на левом борту ствола у коробки и линия пайки ушка
  for (let i = 0; i < 10; i++) k.add("lensBlack", T2(bx(i % 3 ? 2.2 : 0.5, i % 3 ? 0.5 : 3.4, 0.2, { bevel: 0 }), { p: [52 + i * 3.1, 3 + (i % 3 === 1 ? 1.4 : i % 3 === 2 ? -1.4 : 0), -12.75] }));
  for (const s of [-1, 1]) k.add("lensBlack", T2(bx(12, 0.3, 0.2, { bevel: 0 }), { p: [301, -9.6, s * 7.05] }));
  if (o.rib) {
    // вентилируемая планка: стойки, полотно с продольными насечками против бликов
    for (let x = 36; x < L - 16; x += 26) k.add("steelPark", T2(bx(5, 4.6, 5, { bevel: 0.6 }), { p: [x, 13.4, 0] }));
    k.add("steelPark", T2(bx(L - 40, 1.8, 8, { bevel: 0.6 }), { p: [(L - 40) / 2 + 20, 16.2, 0] }));
    for (const z of [-2, 0, 2]) k.add("lensBlack", T2(bx(L - 48, 0.2, 0.4, { bevel: 0 }), { p: [(L - 40) / 2 + 20, 17.12, z] }));
  }
  const out = { root: null, irons: {} };
  if (o.rifle) {
    // «полицейские» винтовочные: целик-щель на стволе и мушка-лопатка на основании
    k.add("steelPark", exZ([[34, 11], [70, 11], [68, 17, 2], [36, 17, 2]], 12, { bevel: 1 }));
    k.add("steelPark", exZ([[48, 16], [62, 16], [60, 27, 1], [50, 27, 1]], 14, { bevel: 0.6 }));
    k.add("lensBlack", exZ([[53.8, 22], [56.2, 22], [56.2, 27.2], [53.8, 27.2]], 14.4, { bevel: 0 }));
    k.add("steelPark", exZ([[L - 60, 10], [L - 22, 10], [L - 24, 16, 2], [L - 56, 16, 2]], 12, { bevel: 1 }));
    k.add("steelPark", exZ([[L - 44, 15], [L - 36, 15], [L - 37, 25.2, 0.6], [L - 43, 25.2, 0.6]], 2.4, { bevel: 0.3 }));
    k.add("tritium", T2(cX(0.8, L - 40, L - 38, { seg: 10 }), { p: [0, 23.8, 0] }));
    out.irons = { rear: [55, 25, 0], front: [L - 40, 25, 0], type: "notch" };
  } else {
    // латунная мушка-бусина
    k.add("brass", T2(sp(2.4, { seg: 14, seg2: 10 }), { p: [L - 14, 14.2 + (o.rib ? 4 : 0), 0] }));
    k.add("steelPark", T2(cY(1.4, 11, 13 + (o.rib ? 4 : 0), { seg: 10 }), { p: [L - 14, 0, 0] }));
    if (o.rib) k.add("brass", T2(sp(1.3, { seg: 10, seg2: 8 }), { p: [L / 2, 17.4, 0] }));
    out.irons = { front: [L - 14, 14.4 + (o.rib ? 4 : 0), 0] };
  }
  const muzzle = ctx.mount({ id: "muzzle", type: "thread", p: [L, 0, 0] });
  out.root = nd("barrel_" + o.id, [k.build(), muzzle]);
  return out;
}
/* --------------------------------------------------------------- цевья */
function forendBars(ctx, k, x0) {
  const { extrudeX: exX, T: T2, latheX: lX } = ctx.G;
  // две штанги затвора вдоль трубки, задняя муфта цевья и передняя гайка трубки цевья
  for (const s of [-1, 1]) k.add("steelWorn", exX([[s * 10.6, R8.TUBE_Y + 6], [s * 12.4, R8.TUBE_Y + 6], [s * 12.4, R8.TUBE_Y + 10], [s * 10.6, R8.TUBE_Y + 10]], R8.FRONT - 88, x0 + 6, { bevel: 0.2 }));
  k.add("steelWorn", T2(lX([[x0 - 6, R8.TUBE_R + 0.2], [x0 - 6, R8.TUBE_R + 2.6], [x0 + 2, R8.TUBE_R + 2.6], [x0 + 2, R8.TUBE_R + 0.2]], { seg: 32 }), { p: [0, R8.TUBE_Y, 0] }));
}
function m870ForendNut(ctx, k, x) {
  const { T: T2, latheX: lX, box: bx } = ctx.G;
  k.add("steelWorn", T2(lX([[x - 1, R8.TUBE_R + 0.1], [x - 1, R8.TUBE_R + 2.4], [x + 5, R8.TUBE_R + 2.4], [x + 6, R8.TUBE_R + 1.2], [x + 6, R8.TUBE_R + 0.1]], { seg: 32 }), { p: [0, R8.TUBE_Y, 0] }));
  // пазы под ключ гайки по бокам
  for (const s of [-1, 1]) k.add("lensBlack", T2(bx(4.4, 1.6, 0.6, { bevel: 0 }), { p: [x + 3, R8.TUBE_Y, s * (R8.TUBE_R + 2.2)] }));
}
function forendClassic(ctx, o) {
  const { node: nd, T: T2, box: bx, loftX: lf, superEllipse: se } = ctx.G;
  const k = ctx.kit();
  const x0 = 62, x1 = 250, cy = R8.TUBE_Y - 2;
  forendBars(ctx, k, x0);
  m870ForendNut(ctx, k, x1);
  if (o.beaver) {
    const prof = [[x0, cy, 18, 17], [x0 + 20, cy - 1, 21, 20], [x1 - 20, cy - 1, 21, 20], [x1, cy, 18, 17.5]];
    k.add(o.mat, lf(prof.map(([x, c, hh, hw]) => ({ x, pts: se(hw, hh, 2.8, 32, c, 0) }))));
  } else {
    // кольцевые канавки хвата вырезаны прямо в профиле (Express — 12 глубоких, Wingmaster — 18 мелких)
    const fine = o.mat !== "poly", n = fine ? 18 : 12, pitch = fine ? 8 : 12.2, gw = fine ? 3.2 : 5.6, gd = fine ? 1 : 1.6;
    const g0 = (x0 + x1) / 2 - (n - 1) * pitch / 2, xs = [];
    const env = (x) => {
      const e = Math.min(1, (x - x0) / 14, (x1 - x) / 14);
      return [16 + 3 * Math.sin(e * Math.PI / 2), 15.5 + 2.5 * Math.sin(e * Math.PI / 2), -Math.sin(e * Math.PI / 2)];
    };
    for (const x of [x0, x0 + 4, x0 + 9, x0 + 14]) xs.push([x, 0]);
    for (let i = 0; i < n; i++) {
      const g = g0 + i * pitch;
      xs.push([g - gw / 2 - 1.2, 0], [g - gw / 2, gd], [g + gw / 2, gd], [g + gw / 2 + 1.2, 0]);
    }
    for (const x of [x1 - 14, x1 - 9, x1 - 4, x1]) xs.push([x, 0]);
    xs.sort((a, b) => a[0] - b[0]);
    k.add(o.mat, lf(xs.map(([x, d]) => {
      const [hh, hw, dy] = env(x);
      return { x, pts: se(hw - d, hh - d * 0.8, 2.8, 32, cy + dy, 0) };
    })));
  }
  if (o.beaver) for (let i = 0; i < 2; i++) for (const s of [-1, 1]) k.add(o.mat, T2(bx(120, 1.4, 1, { bevel: 0.4 }), { p: [(x0 + x1) / 2, cy + 6 - i * 10, s * 20.2] }));
  return { root: nd("forend", [k.build()]) };
}
function forendMoe(ctx) {
  const { node: nd, T: T2, extrudeX: exX, extrudeZ: exZ, shape: sh, mlokHoles: ml, picatinny: pic } = ctx.G;
  const k = ctx.kit();
  const x0 = 62, x1 = 250, cy = R8.TUBE_Y;
  forendBars(ctx, k, x0);
  const sec = [[-19, cy + 16, 4], [-21, cy - 2, 6], [-15, cy - 22, 8], [15, cy - 22, 8], [21, cy - 2, 6], [19, cy + 16, 4], [15, cy + 16], [15, cy - 14], [-15, cy - 14], [-15, cy + 16]];
  k.add("poly", exX(sec, x0, x1, { bevel: 1.6 }));
  // упор под ладонь спереди
  k.add("poly", exX([[-21, cy + 10, 4], [21, cy + 10, 4], [18, cy - 28, 8], [-18, cy - 28, 8]], x1 - 14, x1, { bevel: 2 }));
  const holes = ml(x0 + 20, x1 - 20, cy, { h: 7, len: 32 });
  for (const h of holes) for (const s of [-1, 1]) k.add("lensBlack", exZ(sh(h), 1, { bevel: 0.2, z: s * 20.7 }));
  const r = pic(60, { base: 4 });
  k.add("alu", r.geo, { r: [90, 0, 0], p: [x1 - 90, cy, 25] });
  const m1 = ctx.railMount("feRight", [x1 - 90 + r.first, cy, 25], "right", r.slots, { axis: "right" });
  const r2 = pic(60, { base: 4 });
  k.add("alu", r2.geo, { r: [-90, 0, 0], p: [x1 - 90, cy, -25] });
  const m2 = ctx.railMount("feLeft", [x1 - 90 + r2.first, cy, -25], "left", r2.slots, { axis: "left" });
  const r3 = pic(70, { base: 4 });
  k.add("alu", r3.geo, { r: [180, 0, 0], p: [x0 + 40, cy - 26, 0] });
  const m3 = ctx.railMount("feBottom", [x0 + 40 + r3.first, cy - 26, 0], "bottom", r3.slots, { axis: "bottom" });
  return { root: nd("moe", [k.build(), m1, m2, m3]) };
}
function forendDSF(ctx) {
  const { node: nd, T: T2, box: bx, loftX: lf, superEllipse: se, latheX: lX, cylX: cX } = ctx.G;
  const k = ctx.kit();
  const x0 = 62, x1 = 262, cy = R8.TUBE_Y - 2;
  forendBars(ctx, k, x0);
  const prof = [[x0, cy, 18, 16], [x0 + 16, cy - 2, 22, 19], [x1 - 40, cy - 2, 22, 19], [x1 - 22, cy + 2, 18, 22], [x1, cy + 2, 17, 22]];
  k.add("poly", lf(prof.map(([x, c, hh, hw]) => ({ x, pts: se(hw, hh, 3, 32, c, 0) }))));
  for (const s of [-1, 1]) k.add("rubber", T2(bx(90, 14, 1.6, { bevel: 0.8 }), { p: [x0 + 80, cy - 4, s * 19.5] }));
  // две фары по бокам ствола
  const lensGeo = [];
  for (const s of [-1, 1]) {
    k.add("alu", T2(lX([[x1 - 24, 0], [x1 - 24, 9], [x1 - 2, 10.5], [x1 + 2, 10.5], [x1 + 2, 9.4], [x1 + 1, 0]], { seg: 28 }), { p: [0, cy + 8, s * 16] }));
    lensGeo.push(cX(8.6, x1 + 0.8, x1 + 1.6, { seg: 24 }).translate(0, cy + 8, s * 16));
  }
  const root = nd("dsf", [k.build()]);
  const le = new ctx.THREE.Mesh(ctx.G.merge(lensGeo), ctx.mats.get("lampLens").clone());
  root.add(le);
  return { root, light: { p: [x1 + 3, cy + 8, 16], lens: le, lumens: 800 } };
}
/* --------------------------------------------------------------- удлинители магазина */
// Антабка на торце крышки магазина (Police): шпилька с поворотным кольцом, висящим вниз.
function m870CapSwivel(ctx, k, x) {
  const { T: T2, cylX: cX, wire: wr, cylZ: cZ } = ctx.G;
  // координаты узла магазина: ось трубки — y = 0
  k.add("steelWorn", cX(4.2, x, x + 5, { c: 0.8, seg: 18 }));
  k.add("steelWorn", T2(cZ(1.4, -4.4, 4.4, { seg: 10 }), { p: [x + 3, 0, 0] }));
  const y0 = 0, loop = [[x + 3, y0 - 1], [x + 9, y0 - 3], [x + 12, y0 - 10], [x + 9, y0 - 17], [x + 4, y0 - 18], [x + 1.6, y0 - 10]];
  k.add("steelWorn", wr(loop.map(([a, b]) => [a, b, 0]), 1.3, { closed: true, n: 40, seg: 7 }));
}
function tubeExt(ctx, o) {
  const { node: nd, T: T2, latheX: lX, cylX: cX, ringGrooves: rg, extrudeZ: exZ, box: bx } = ctx.G;
  const k = ctx.kit();
  const L = o.len;
  // крышка: накатка по окружности (продольные рифли) и торец с фаской; фиксатор-защёлка сверху
  const cap = (x0) => {
    k.add("steelPark", lX([[x0, 0], [x0, R8.TUBE_R + 1.2], [x0 + 16, R8.TUBE_R + 1.2], [x0 + 18, R8.TUBE_R - 1], [x0 + 18, 0]], { seg: 32 }));
    k.add("steelPark", ctx.G.flutesX(R8.TUBE_R + 0.9, x0 + 2.5, x0 + 14.5, 28, 1, 0.9));
    k.add("steelWorn", T2(bx(3, 1.2, 3, { bevel: 0.4 }), { p: [x0 - 1.5, R8.TUBE_R + 0.6, 0] }));
    m870CapSwivel(ctx, k, x0 + 18);
  };
  if (!L) {
    cap(0);
    return { root: nd("cap", [k.build()]), mag: { cap: 4 } };
  }
  k.add("steelPark", cX(R8.TUBE_R, 0, L, { seg: 32 }));
  k.add("steelPark", rg(R8.TUBE_R + 0.5, 0, 10, 4, 0.4, { seg: 32 }));
  cap(L - 2);
  // хомут на ствол
  const cx = L - 30;
  k.add("alu", exZ([[cx - 9, -R8.TUBE_Y - 13, 3], [cx + 9, -R8.TUBE_Y - 13, 3], [cx + 9, -R8.TUBE_Y + 13, 5], [cx - 9, -R8.TUBE_Y + 13, 5]], 30, { bevel: 2 }));
  k.add("steel", T2(ctx.G.cylZ(3, -16, 16, { seg: 12 }), { p: [cx, -R8.TUBE_Y * 0.5, 0] }));
  return { root: nd("ext" + o.cap, [k.build()]), mag: { cap: o.cap } };
}
/* --------------------------------------------------------------- планка / патронташ */
function rcvRail(ctx, o) {
  const { node: nd, extrudeX: exX, picatinny: pic, T: T2, cylZ: cZ } = ctx.G;
  const k = ctx.kit();
  const L = o.len, x0 = -L / 2;
  // седло по форме верха коробки, стяжка на штифты УСМ
  k.add("alu", exX([[-R8.HW - 1.6, -10, 1], [R8.HW + 1.6, -10, 1], [R8.HW + 1.6, 3, 3], [8, 5], [-8, 5], [-R8.HW - 1.6, 3, 3]], x0, x0 + L, { bevel: 1 }));
  for (const x of [-56, 26]) for (const s of [-1, 1]) k.add("steel", T2(cZ(3.6, 0, 1.4, { seg: 16 }), { p: [x, -5, s > 0 ? R8.HW + 1.6 : -R8.HW - 3] }));
  const r = pic(L - 10, { base: 6 });
  k.add("alu", r.geo, { p: [x0 + 5, o.h, 0] });
  k.add("alu", exX([[-8, 4], [8, 4], [8, o.h - 6], [-8, o.h - 6]], x0 + 5, x0 + L - 5, { bevel: 0.8 }));
  return { root: nd("rcvRail", [k.build(), ctx.railMount("rcvRail", [x0 + 5 + r.first, o.h, 0], "top", r.slots, { axis: "top" })]) };
}
function sideSaddle(ctx, o) {
  const { node: nd, extrudeX: exX, extrudeZ: exZ, T: T2, box: bx } = ctx.G;
  const k = ctx.kit(), sk = ctx.kit();
  const n = o.n, pitch = 23, w = n * pitch + 8;
  // пластина на штифтах слева; патроны донцем вверх
  k.add(o.mat, T2(bx(w, 64, 3, { bevel: 1 }), { p: [0, -6, -1.5] }));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 8 + i * pitch;
    k.add(o.mat, T2(bx(20, 10, 12, { bevel: 2 }), { p: [x + 7, 8, -10] }));
    ctx.C.cartridge(sk, "12ga", { p: [x + 7, 26, -13], r: [0, 0, -90] });
  }
  return { root: nd("saddle", [k.build(), sk.build()]) };
}
/* --------------------------------------------------------------- приклады */
// Затыльник R3/Express: резина с горизонтальными рёбрами прямо в контуре и чёрная проставка.
function m870Pad(ctx, k, xf, yTop, yBot, o = {}) {
  const { extrudeZ: exZ } = ctx.G;
  const n = o.n ?? 30, mid = (yTop + yBot) / 2, hh = (yTop - yBot) / 2, d = o.depth ?? 17, pts = [[xf, yTop, 6]];
  for (let i = 0; i <= n; i++) {
    const y = yTop - 3 - (yTop - yBot - 6) * i / n, q = (y - mid) / hh;
    pts.push([xf - d - 2.4 * (1 - q * q) - (i % 2 ? 1.3 : 0), y]);
  }
  pts.push([xf, yBot, 6]);
  k.add(o.mat || "rubber", exZ(pts, o.w ?? 46, { bevel: 3 }));
  k.add("poly", exZ([[xf + 2.2, yTop - 0.5, 4], [xf - 0.4, yTop - 0.5, 4], [xf - 0.4, yBot + 0.5, 4], [xf + 2.2, yBot + 0.5, 4]], (o.w ?? 46) - 1, { bevel: 0.8 }));
}
// Шпилька под антабку снизу приклада.
function m870Stud(ctx, k, x, y) {
  const { T: T2, cylY: cY, cylZ: cZ } = ctx.G;
  k.add("steelWorn", T2(cY(4.6, y - 1.2, y + 2, { seg: 18, c: 0.4 }), { p: [x, 0, 0] }));
  k.add("steelWorn", T2(cY(3, y - 7, y, { seg: 16, c: 0.8 }), { p: [x, 0, 0] }));
  k.add("lensBlack", T2(cZ(1.4, -3.1, 3.1, { seg: 10 }), { p: [x, y - 4.2, 0] }));
}
function stock870(ctx, o) {
  const { node: nd, T: T2, box: bx, extrudeZ: exZ, loftX: lf, superEllipse: se, cylZ: cZ } = ctx.G;
  const k = ctx.kit();
  const prof = [[0, -12, 27, 13.6], [-30, -18, 30, 15], [-80, -32, 38, 17], [-160, -52, 50, 19.5], [-250, -72, 60, 21], [-344, -90, 68, 22]];
  k.add(o.mat, lf(prof.map(([x, cy, hh, hw]) => ({ x, pts: se(hw, hh, o.k ?? 2.6, 32, cy, 0) }))));
  // пистолетный выступ шейки
  if (o.pg) k.add(o.mat, exZ([[-14, -34, 4], [-60, -56, 8], [-56, -104, 12], [-34, -106, 10], [-22, -60, 10]], 30, { bevel: 7, curve: 8 }));
  if (o.pg) k.add("steelWorn", T2(cZ(9, -1, 1, { seg: 24 }), { r: [90, 0, 0], p: [-47, -107.4, 0] }));
  m870Pad(ctx, k, -343, -20, -160, { mat: o.pad });
  m870Stud(ctx, k, -300, -145);
  return { root: nd("stock", [k.build()]) };
}
function stockSGA(ctx) {
  const { node: nd, T: T2, box: bx, extrudeZ: exZ, loftX: lf, superEllipse: se } = ctx.G;
  const k = ctx.kit();
  // Magpul SGA: вертикальная рукоять за шейкой, прямой гребень, проставки длины
  const prof = [[0, -6, 28, 13.6], [-60, -12, 32, 17], [-160, -24, 46, 20], [-300, -36, 58, 21]];
  k.add("poly", lf(prof.map(([x, cy, hh, hw]) => ({ x, pts: se(hw, hh, 3.4, 32, cy, 0) }))));
  k.add("poly", exZ([[-14, -34, 4], [-44, -44, 8], [-40, -108, 12], [-16, -110, 10], [-10, -60, 10]], 30, { bevel: 7, curve: 8 }));
  k.add("poly", exZ([[-54, -40, 6], [-120, -52, 10], [-110, -72, 10], [-60, -60, 8]], 26, { bevel: 5 }));
  k.add("polySoft", T2(exZ([[-4, 26, 8], [16, 26, 10], [16, -98, 10], [-4, -98, 8]], 44, { bevel: 3 }), { p: [-318, 0, 0] }));
  for (let i = 0; i < 2; i++) k.add("poly", T2(bx(6, 118, 42, { bevel: 2 }), { p: [-304 + i * 7, -36, 0] }));
  k.add("poly", exZ([[-40, 12, 4], [-200, 12, 4], [-200, 2], [-40, 2]], 22, { bevel: 3 }));
  m870Stud(ctx, k, -240, -82);
  return { root: nd("sga", [k.build()]) };
}
function stockFold(ctx) {
  const { node: nd, T: T2, box: bx, extrudeZ: exZ, cylZ: cZ, cylY: cY } = ctx.G;
  const k = ctx.kit(), f = ctx.kit();
  // пистолетная рукоять + складной сверху металлический приклад
  k.add("poly", exZ([[0, 10, 3], [0, -34, 3], [-10, -40, 4], [-58, -104, 10], [-34, -110, 10], [-6, -60, 8], [-14, -34, 4], [-14, 10, 3]], 30, { bevel: 6, curve: 8 }));
  k.add("steel", exZ([[0, 20, 3], [-24, 20, 3], [-24, 8], [0, 8]], 28, { bevel: 1.4 }));
  k.add("steelWorn", T2(cZ(4.4, -16, 16, { seg: 16 }), { p: [-18, 14, 0] }));
  for (const s of [-1, 1]) f.add("steel", T2(exZ([[0, 3], [-300, -26, 3], [-300, -32, 3], [0, -3]], 3, { bevel: 0.6 }), { p: [0, 0, s * 12] }));
  f.add("steel", T2(exZ([[-292, -18, 4], [-306, -18, 4], [-306, -118, 6], [-292, -114, 4]], 30, { bevel: 2 }), {}));
  f.add("rubber", T2(exZ([[-306, -16, 4], [-312, -16, 4], [-312, -120, 6], [-306, -118, 4]], 36, { bevel: 2 }), {}));
  f.add("steelWorn", T2(cZ(4, -14, 14, { seg: 16 }), { p: [-290, -60, 0] }));
  const fold = nd("fold", [f.build()], { p: [-18, 14, 0] });
  fold.children[0].position.set(18, -14, 0);
  return { root: nd("fold870", [k.build(), fold]), fold: { node: fold, axis: "z", angle: -180 } };
}
/* --------------------------------------------------------------- дульные насадки (чоки) */
function choke(ctx, o) {
  const { node: nd, latheX: lX, ringGrooves: rg, T: T2, box: bx, cylY: cY } = ctx.G;
  const k = ctx.kit();
  const L = o.ext;
  k.add("steelBright", lX([[-2, 0], [-2, 12.4], [L - 2, 12.4], [L, 11.4], [L, 9.2], [-2, 9.2]].map(([x, r], i) => i === 0 ? [x, 0] : [x, r]), { seg: 36 }));
  k.add("steelBright", rg(12.6, 2, Math.min(L - 3, 14), 6, 0.5, { seg: 36 }));
  if (o.ports) for (let i = 0; i < 4; i++) for (const s of [-1, 1]) k.add("lensBlack", T2(bx(5, 2, 3, { bevel: 0.6 }), { p: [L - 18 + i * 0, 11.2, 0], r: [s * 40 + i * 90, 0, 0] }));
  if (o.teeth) for (let i = 0; i < 6; i++) k.add("steelBright", T2(bx(8, 4, 5, { bevel: 0.8 }), { p: [L + 3, 10.8, 0], r: [i * 60, 0, 0] }));
  for (let i = 0; i < o.notches; i++) k.add("lensBlack", T2(bx(1.2, 1, 2.4), { p: [L - 1.4, 12.2, 0], r: [i * 26 - 20, 0, 0] }));
  return { root: nd("choke", [k.build()]), muzzle: { x: L + (o.teeth ? 7 : 0), kind: "choke", flash: 1, pattern: o.pattern } };
}
function salvo(ctx) {
  const { node: nd, latheX: lX, tubeX: tb, cylX: cX, extrudeX: exX, T: T2, box: bx } = ctx.G;
  const k = ctx.kit();
  const L = 250;
  // SilencerCo Salvo 12: секционный корпус со сплюснутым сечением
  k.add("steelMatte", lX([[-2, 0], [-2, 14], [18, 14], [22, 18], [22, 0]], { seg: 36 }));
  k.add("aluGrey", exX([[-20, -18, 8], [20, -18, 8], [20, 26, 8], [-20, 26, 8]], 22, L, { bevel: 2 }));
  for (let i = 0; i < 5; i++) k.add("steelMatte", T2(exX([[-21, -19, 8], [21, -19, 8], [21, 27, 8], [-21, 27, 8]], 0, 4, { bevel: 0.8 }), { p: [40 + i * 44, 0, 0] }));
  k.add("lensBlack", cX(12, L - 0.4, L + 0.4, { seg: 24 }));
  return { root: nd("salvo", [k.build()]), muzzle: { x: L, kind: "supp", flash: 0.03, pattern: 1 } };
}
var AMMO12 = (id, name, desc, ammo, stats) => ({ id, cat: "shell12", name, desc, stats, build: (c) => ({ root: c.G.node("ammo_" + id, []), ammo }) });
var m870_default = {
  id: "m870",
  family: "m870",
  title: "Remington 870 Police Magnum",
  short: "Remington 870",
  caliber: "12/76",
  cal: "12ga",
  thread: "remchoke",
  action: "pump",
  feed: "tube",
  chargeLabel: "цевьё (передёрнуть)",
  bareKind: "choke",
  hipMoa: 70,
  specs: [["Ствол", "470 мм"], ["Длина", "1003 мм"], ["Магазин", "4+1"], ["Масса", "3,6 кг"]],
  base: { weight: 3200, length: 1003, ergo: 44, recoilV: 100, recoilH: 70, moa: 4, velocity: 400, range: 50, loud: 162, flash: 75, adsTime: 360, rpm: 60, mag: 4 },
  audio: { cal: "12ga", mech: 0.9 },
  modes: ["safe", "pump"],
  build: m870Base,
  slots: [
    { id: "barrel", label: "Ствол", group: "Ствол и цевьё", accepts: ["b870"], mount: "barrel", required: true },
    { id: "muzzle", label: "Чок / насадка", group: "Ствол и цевьё", accepts: ["choke12"], mount: "muzzle" },
    { id: "forend", label: "Цевьё", group: "Ствол и цевьё", accepts: ["fe870"], mount: "forend", required: true },
    { id: "mag", label: "Магазин", group: "Ствол и цевьё", accepts: ["tube870"], mount: "tubeEnd", required: true },
    { id: "rail", label: "Планка на коробку", group: "Оптика", accepts: ["rail870"], mount: "rcvTop" },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: ["rcvRail"], prefer: { x: -60 } },
    { id: "saddle", label: "Патронташ", group: "Коробка", accepts: ["saddle870"], mount: "saddle" },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["feRight"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["feLeft"], prefer: "front" },
    { id: "under", label: "Под цевьём", group: "Тактика", accepts: ["foregrip"], rails: ["feBottom"], prefer: "front" },
    { id: "stock", label: "Приклад", group: "Коробка", accepts: ["stock870"], mount: "stock", required: true },
    { id: "ammo", label: "Патроны", group: "Боеприпас", accepts: ["shell12"], mount: "ammo", required: true }
  ],
  parts: [
    { id: "b18", cat: "b870", name: "Ствол 470 мм (18,5\"), мушка-бусина", desc: "Штатный Police Magnum, цилиндр", stats: { weight: 820 }, build: (c) => m870Barrel(c, { id: "b18", len: 470 }) },
    { id: "b20r", cat: "b870", name: "Ствол 508 мм (20\"), винтовочные прицелы", desc: "Целик-щель и мушка с тритием — для пули", stats: { weight: 900, length: 38, moa: -1.2, velocity: 12, adsTime: 10 }, build: (c) => m870Barrel(c, { id: "b20r", len: 508, rifle: true }) },
    { id: "b26v", cat: "b870", name: "Ствол 660 мм (26\"), вентилируемая планка", desc: "Охотничий: длинный прицельный радиус", stats: { weight: 1080, length: 190, moa: -0.6, velocity: 20, ergo: -8, adsTime: 40 }, build: (c) => m870Barrel(c, { id: "b26v", len: 660, rib: true }) },
    { id: "b14", cat: "b870", name: "Ствол 356 мм (14\"), штурмовой", desc: "Короткий для прорыва: быстрее вскидка, шире осыпь", stats: { weight: 640, length: -114, velocity: -18, ergo: 6, adsTime: -30, "recoilV%": 6 }, build: (c) => m870Barrel(c, { id: "b14", len: 356 }) },
    { id: "ch_cyl", cat: "choke12", name: "Чок «цилиндр»", desc: "Без сужения: самая широкая осыпь", fit: { thread: ["remchoke"] }, stats: { weight: 30, length: 16 }, build: (c) => choke(c, { ext: 16, notches: 0, pattern: 1 }) },
    { id: "ch_ic", cat: "choke12", name: "Чок «получок» (IC)", desc: "Лёгкое сужение 0,25 мм", fit: { thread: ["remchoke"] }, stats: { weight: 32, length: 18 }, build: (c) => choke(c, { ext: 18, notches: 1, pattern: 0.82 }) },
    { id: "ch_mod", cat: "choke12", name: "Чок «модифицированный»", desc: "Сужение 0,5 мм: осыпь уже на треть", fit: { thread: ["remchoke"] }, stats: { weight: 34, length: 20 }, build: (c) => choke(c, { ext: 20, notches: 2, pattern: 0.66 }) },
    { id: "ch_full", cat: "choke12", name: "Чок «полный» (Full)", desc: "Сужение 0,9 мм, для пули не годится", fit: { thread: ["remchoke"] }, stats: { weight: 36, length: 22 }, build: (c) => choke(c, { ext: 22, notches: 3, pattern: 0.52 }) },
    { id: "breacher", cat: "choke12", name: "Пробойный стенд-офф", desc: "Зубья упираются в дверь; газ отводится в стороны", fit: { thread: ["remchoke"] }, stats: { weight: 120, length: 46, loud: 2, flash: 20, "recoilV%": -6 }, build: (c) => choke(c, { ext: 38, notches: 0, ports: true, teeth: true, pattern: 1.15 }) },
    { id: "salvo12", cat: "choke12", name: "SilencerCo Salvo 12", desc: "Глушитель под чок-резьбу: минус ~25 дБ", fit: { thread: ["remchoke"] }, stats: { weight: 960, length: 250, loud: -24, flash: -70, "recoilV%": -14, ergo: -12, adsTime: 40 }, build: salvo },
    { id: "fe_corn", cat: "fe870", name: "Цевьё Express, полимер", desc: "Рифлёное, штатное", stats: { weight: 180 }, build: (c) => forendClassic(c, { mat: "poly" }) },
    { id: "fe_walnut", cat: "fe870", name: "Цевьё Wingmaster, орех", desc: "Классическое деревянное", stats: { weight: 230, ergo: 1 }, build: (c) => forendClassic(c, { mat: "woodDark" }) },
    { id: "fe_beaver", cat: "fe870", name: "Цевьё «бобровый хвост», дерево", desc: "Широкое полицейское", stats: { weight: 260, ergo: 3 }, build: (c) => forendClassic(c, { mat: "wood", beaver: true }) },
    { id: "fe_mlok", cat: "fe870", name: "Magpul MOE M-LOK", desc: "Упор под ладонь, короткие планки по бокам и снизу", stats: { weight: 220, ergo: 4 }, build: forendMoe },
    { id: "fe_dsf", cat: "fe870", name: "SureFire DSF-870", desc: "Цевьё-фонарь 800 лм, клавиши под пальцы (" + __AB.L + ")", stats: { weight: 380, ergo: 2 }, build: forendDSF },
    { id: "tube4", cat: "tube870", name: "Штатный магазин, 4", desc: "Трубка до кольца ствола", stats: { weight: 40, mag: 4 }, build: (c) => tubeExt(c, { len: 0 }) },
    { id: "tube6", cat: "tube870", name: "Удлинитель +2 (6)", desc: "С хомутом на ствол", needs: (cfg) => cfg.barrel?.id !== "b14", stats: { weight: 180, mag: 6, ergo: -3, adsTime: 10 }, build: (c) => tubeExt(c, { len: 128, cap: 6 }) },
    { id: "tube7", cat: "tube870", name: "Удлинитель +3 (7)", desc: "Нужен ствол от 20\"", needs: (cfg) => ["b20r", "b26v"].includes(cfg.barrel?.id), stats: { weight: 240, mag: 7, ergo: -5, adsTime: 14 }, build: (c) => tubeExt(c, { len: 190, cap: 7 }) },
    { id: "rail_mesa", cat: "rail870", name: "Планка Mesa Tactical", desc: "Седло на штифтах УСМ, Пикатинни 130 мм", stats: { weight: 110 }, build: (c) => rcvRail(c, { len: 150, h: 12 }) },
    { id: "saddle6", cat: "saddle870", name: "Mesa SureShell, 6 патронов", desc: "Алюминиевый патронташ слева", stats: { weight: 290, ergo: -2 }, build: (c) => sideSaddle(c, { n: 6, mat: "alu" }) },
    { id: "saddle4", cat: "saddle870", name: "Патронташ-карта, 4 патрона", desc: "Лёгкая полимерная пластина", stats: { weight: 90 }, build: (c) => sideSaddle(c, { n: 4, mat: "poly" }) },
    { id: "st_express", cat: "stock870", name: "Приклад Express, полимер", desc: "Штатный с резиновым затыльником", stats: { weight: 560 }, build: (c) => stock870(c, { mat: "poly" }) },
    { id: "st_walnut", cat: "stock870", name: "Приклад Wingmaster, орех", desc: "С пистолетным выступом шейки", stats: { weight: 680, ergo: 2 }, build: (c) => stock870(c, { mat: "woodDark", pg: true }) },
    { id: "st_sga", cat: "stock870", name: "Magpul SGA", desc: "Вертикальный хват, прямой гребень", stats: { weight: 620, ergo: 5, "recoilV%": -10, "recoilH%": -10 }, build: stockSGA },
    { id: "st_fold", cat: "stock870", name: "Складной сверху + рукоять", desc: "K — сложить: короче на 30 см", stats: { weight: 720, ergo: 1, "recoilV%": 6 }, build: stockFold },
    AMMO12("buck00", "Картечь 00 (9 × 8,4 мм)", "Классика для ближнего боя", { pellets: 9, pattern: 90, energy: 1 }, { velocity: 0 }),
    AMMO12("shot4", "Дробь №4 (27 × 6 мм)", "Много мелких дробин, быстро теряет энергию", { pellets: 27, pattern: 105, energy: 0.6, recoil: 0.85 }, { velocity: 20, "recoilV%": -12 }),
    AMMO12("slug", "Пуля Бреннеке 31,5 г", "Одна пуля: точно до 75 м", { pellets: 1, energy: 1.6, recoil: 1.1 }, { velocity: 30, moa: 0, "recoilV%": 10 })
  ],
  defaults: {
    barrel: "b18",
    muzzle: null,
    forend: "fe_corn",
    mag: "tube4",
    rail: null,
    optic: null,
    saddle: null,
    tacRight: null,
    tacLeft: null,
    under: null,
    stock: "st_express",
    ammo: "buck00"
  }
};

DEFS[m870_default.id] = m870_default; FAMILY[m870_default.id] = "A";
})();
(() => {
// ---- weapons/mp5.js
// HK MP5A3: свободный затвор с роликовым замедлением, штампованная коробка, трубка взведения над стволом.
// Единицы — мм, ось канала ствола y = 0, x = 0 — казённый срез, +z — правый борт (окно выброса).
var H5 = {
  REAR: -222,
  // передний срез коробки; дальше вперёд — только трубка взведения над стволом и цевьё
  FRONT: 24,
  TOP: 30,
  BOT: -12,
  HW: 17,
  TUBE_Y: 21,
  TUBE_R: 9.6,
  TUBE_X1: 197,
  MUZZLE: 225,
  SIGHT_Y: 41,
  REAR_X: -197,
  FRONT_X: 191,
  // приёмник магазина под окном выброса, задняя стенка упирается в спусковую коробку (как у HK)
  MAG_X: 10,
  HG_X0: 26,
  HG_X1: 176,
  // продольная выштамповка по бортам (направляющие затвора) — в ней ходят штанги приклада A3
  GROOVE: [12.8, 19.4]
};
// UV по мировым координатам (проекция по доминирующей оси нормали): коробка из нескольких экструзий
// получает непрерывную текстуру без швов на стыках.
function mp5UV(ctx, g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = az >= ax && az >= ay ? [p.getX(i), p.getY(i)] : ay >= ax ? [p.getX(i), p.getZ(i)] : [p.getZ(i), p.getY(i)];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute("uv", new ctx.THREE.BufferAttribute(uv, 2));
  return g;
}
function mp5Section(port) {
  const { HW: W, TOP, BOT } = H5;
  const [g0, g1] = H5.GROOVE, d = 1.4;
  // окно выброса — выемка правого борта, через неё виден затвор
  const low = port ? [[W, BOT, 1], [W, -4], [W - 3.6, -4], [W - 3.6, 10.6], [W, 10.6]] : [[W, BOT, 1]];
  return [
    ...low, [W, g0 - 1.2, 0.6], [W - d, g0, 0.5], [W - d, g1, 0.5], [W, g1 + 1.2, 0.6], [W, TOP, 7],
    [-W, TOP, 7], [-W, g1 + 1.2, 0.6], [-W + d, g1, 0.5], [-W + d, g0, 0.5], [-W, g0 - 1.2, 0.6], [-W, BOT, 1]
  ];
}
function mp5Receiver(ctx, k) {
  const { extrudeX: exX, extrudeZ: exZ, T: T2, box: bx, cylZ: cZ, cylX: cX, latheX: lX, shape: sh, wire: wr } = ctx.G;
  const { REAR: R4, FRONT: F, TOP, BOT, HW: W, MAG_X: MX, TUBE_Y: TY, TUBE_R: TR } = H5;
  const M = "steelMatte";
  // три участка без фасок на стыках: борта и выштамповки идут непрерывно
  k.add(M, mp5UV(ctx, exX(mp5Section(false), R4, -48, { bevel: 0 })));
  k.add(M, mp5UV(ctx, exX(mp5Section(true), -48, 6, { bevel: 0 })));
  k.add(M, mp5UV(ctx, exX(mp5Section(false), 6, F - 3, { bevel: 0 })));
  k.add(M, exX(mp5Section(false), F - 6, F, { bevel: 1.2 }));
  k.add("lensBlack", T2(bx(52, 16, 1), { p: [-21, 4.5, W - 3.9] }));
  // нижние отбортовки под спусковую коробку и выштамповка-усилитель над рукоятью
  for (const s of [-1, 1]) {
    k.add(M, exX([[s * W, BOT + 0.5], [s * (W + 0.7), BOT + 1.2], [s * (W + 0.7), BOT + 4.4], [s * W, BOT + 5]], R4 + 4, -40, { bevel: 0.2 }));
    k.add(M, T2(exZ([[-176, -3], [-122, -3], [-120, -0.6, 1], [-178, -0.6, 1]], 1, { bevel: 0.3 }), { p: [0, 0, s * (W + 0.1)] }));
  }
  // точечная сварка: цапфа ствола спереди, затыльная пластина сзади
  for (const s of [-1, 1]) for (const [x, y] of [[F - 7, 3], [F - 17, 3], [F - 7, 23], [F - 17, 23], [R4 + 5, -4], [R4 + 5, 23], [-60, -7], [-100, -7], [-140, -7]])
    k.add("steel", T2(cZ(1.9, -0.25, 0.25, { seg: 12, c: 0.2 }), { p: [x, y, s * W] }));
  // гнёзда «когтей» кронштейна сверху
  for (const x of [-150, -40]) for (const s of [-1, 1]) k.add("lensBlack", T2(bx(12, 2, 4.5, { bevel: 0.6 }), { p: [x, TOP - 3.2, s * 12.2], r: [s * 35, 0, 0] }));
  // задний торец под затыльник и штифты
  k.add(M, exX(sh(mp5Section(false).map(([z, y, r]) => [z * 1.04, y, r])), R4 - 4, R4, { bevel: 0.6 }));
  // штифты: сплошной стержень, шляпки с обеих сторон и пружинная скоба-фиксатор справа
  for (const [x, y] of [[-205, -4], [-54, -6]]) {
    k.add("steelWorn", T2(cZ(3, -W - 1.2, W + 1.2, { seg: 16 }), { p: [x, y, 0] }));
    for (const s of [-1, 1]) k.add("steelWorn", T2(cZ(4.4, 0, 1, { seg: 18 }), { p: [x, y, s > 0 ? W + 0.2 : -W - 1.2] }));
    k.add("spring", wr([[x, y + 2.6, W + 1.4], [x - 9, y + 3.2, W + 0.9], [x - 15, y, W + 0.8], [x - 9, y - 3.2, W + 0.9], [x, y - 2.6, W + 1.4]], 0.6, { n: 24, seg: 5 }));
  }
  // передний срез: трубка взведения вварена в коробку, сварной воротник
  k.add(M, T2(lX([[F - 1, 0], [F - 1, TR + 1.6], [F + 1, TR + 1.6], [F + 5, TR + 0.4], [F + 5, 0]], { seg: 32 }), { p: [0, TY, 0] }));
  // приёмник магазина: штамповка с отбортованной горловиной, ребро, кнопка защёлки справа
  const mw = [[MX + 7, BOT + 1], [MX - 50, BOT + 1], [MX - 50, -38, 2], [MX - 42, -42, 3], [MX + 5, -42, 3], [MX + 9, -36, 2]];
  k.add(M, exZ(mw, 29, { bevel: 0.8 }));
  k.add(M, exZ([[MX + 9, -39], [MX - 52, -39], [MX - 52, -45.5, 1.4], [MX + 11, -45.5, 1.4]], 30.4, { bevel: 1 }));
  k.add("lensBlack", exZ([[MX - 1, -45.7], [MX - 38, -45.7], [MX - 38, -44], [MX - 1, -44]], 25, { bevel: 0.2 }));
  for (const s of [-1, 1]) {
    k.add(M, T2(bx(40, 1.4, 1, { bevel: 0.35 }), { p: [MX - 20, -24, s * 14.6] }));
    k.add(M, T2(bx(1.4, 18, 1, { bevel: 0.35 }), { p: [MX - 46, -26, s * 14.6] }));
  }
  k.add(M, T2(lX([[0, 0], [0, 6], [1.2, 6], [1.6, 5.2], [1.6, 0]], { seg: 22 }), { r: [0, -90, 0], p: [MX - 44, -32, 14.4] }));
  k.add("steelMatte", T2(lX([[0, 0], [0, 3.8], [1, 3.8], [1.8, 3], [1.8, 0]], { seg: 20 }), { r: [0, -90, 0], p: [MX - 44, -32, 15.4] }));
}
function mp5Barrel(ctx, k) {
  const { latheX: lX, extrudeX: exX, extrudeZ: exZ, T: T2, box: bx, cylX: cX, cylZ: cZ, ringGrooves: rg, shape: sh, circle: ci } = ctx.G;
  const { FRONT: F, MUZZLE: MZ, TUBE_Y: TY, TUBE_R: TR, TUBE_X1: TX, SIGHT_Y: SY, FRONT_X: FX } = H5;
  k.add("steelMatte", lX([[F, 0], [F, 10.5], [F + 10, 10.5], [F + 12, 9.2], [182, 8.4], [182, 10.4], [200, 10.4], [201, 8.2], [212, 8.2], [212.5, 7.2], [MZ, 7.2], [MZ, 3], [MZ - 5, 3], [MZ - 5, 0]], { seg: 32 }));
  // три зацепа под глушитель/пламегаситель
  for (let i = 0; i < 3; i++) k.add("steelMatte", T2(bx(10, 3.4, 7, { bevel: 0.7 }), { p: [206, 9.4, 0], r: [90 + i * 120, 0, 0] }));
  k.add("steelWorn", rg(7.3, 213, MZ - 0.5, 9, 0.35, { seg: 28 }));
  // трубка взведения: паз рукояти слева (ход 150 → 58 мм) и поперечный вырез-фиксатор сзади
  k.add("steelMatte", T2(cX(TR, F - 4, TX, { c: 1, seg: 32 }), { p: [0, TY, 0] }));
  k.add("lensBlack", T2(lX([[55, TR - 0.4], [55, TR + 0.06], [154, TR + 0.06], [154, TR - 0.4]], { seg: 3, a0: 263, arc: 14 }), { p: [0, TY, 0] }));
  k.add("lensBlack", T2(lX([[54.6, TR - 0.4], [54.6, TR + 0.06], [61.4, TR + 0.06], [61.4, TR - 0.4]], { seg: 6, a0: 266, arc: 40 }), { p: [0, TY, 0] }));
  k.add("steelMatte", T2(lX([[TX - 2, 0], [TX - 2, TR + 0.8], [TX + 2, TR + 0.8], [TX + 3, TR - 1], [TX + 3, 0]], { seg: 32 }), { p: [0, TY, 0] }));
  // кольцо мушки на стойке
  k.add("steelMatte", exZ([[181, 4], [199, 4], [199, SY - 6, 2], [193, SY - 3], [183, SY - 3], [181, SY - 7, 2]], 14, { bevel: 1 }));
  k.add("steelMatte", exX(sh(ci(0, SY, 12.5, 32), [ci(0, SY, 10, 28).reverse()]), FX - 4, FX + 4, { bevel: 0.6 }));
  k.add("steelWorn", exZ([[FX - 1.2, SY - 10], [FX + 1.2, SY - 10], [FX + 1, SY], [FX - 1, SY]], 2, { bevel: 0.2 }));
  k.add("steelWorn", T2(cX(1.1, FX - 1.3, FX + 1.3, { seg: 10 }), { p: [0, SY - 0.2, 0] }));
  // стойка между трубкой и стволом
  k.add("steelMatte", exZ([[168, 6], [181, 6], [181, TY - 4], [168, TY - 4]], 10, { bevel: 0.6 }));
  // хомут основания мушки на стволе и антабка слева
  k.add("steelMatte", T2(lX([[166, 0], [166, 10.6], [168, 11.4], [200, 11.4], [201, 10.4], [201, 0]], { seg: 32 }), {}));
  for (const x of [172, 194]) k.add("steelWorn", T2(cZ(1.6, -12, 12, { seg: 10 }), { p: [x, -4, 0] }));
  slingLoop(ctx, k, "steelMatte", [188, 12, -7.4], { side: -1, w: 14, h: 9 });
}
function mp5RearSight(ctx, k) {
  const { extrudeZ: exZ, extrudeX: exX, cylY: cY, cylZ: cZ, latheX: lX, flutesX: fl, T: T2, box: bx, shape: sh, circle: ci, rrect: rr } = ctx.G;
  const { TOP, SIGHT_Y: SY, REAR_X: RX } = H5;
  const M = "steelMatte";
  // основание и поворотный барабан (ось вертикальная). Барабан полый: диоптр — настоящее
  // сквозное отверстие, через него видно кольцо мушки (раньше это был чёрный кружок).
  k.add(M, exZ([[RX - 16, TOP - 1], [RX + 22, TOP - 1], [RX + 18, TOP + 4, 2], [RX - 14, TOP + 5, 2]], 24, { bevel: 1 }));
  for (const s of [-1, 1]) k.add(M, exZ([[RX - 10, TOP + 3], [RX + 8, TOP + 3], [RX + 6, SY + 7, 2], [RX - 8, SY + 7, 2]], 2.4, { bevel: 0.4, z: s * 12.4 }));
  const R = 10.2, Ri = 8.6, hb = 4.2, gap = Math.asin(hb / R) * 180 / Math.PI;
  const drumY = (y0, y1, o = {}) => T2(lX([[y0, o.capLo ? 0 : Ri], [y0, R - 0.6], [y0 + 0.6, R], [y1 - 0.6, R], [y1, R - 0.6], [y1, o.capHi ? 0 : Ri], ...(o.capHi || o.capLo ? [] : [[y0, Ri]])], { seg: 40, a0: o.a0, arc: o.arc }), { r: [0, 0, 90], p: [RX, 0, 0] });
  k.add(M, drumY(TOP + 3, SY - hb, { capLo: true }));
  k.add(M, drumY(SY + hb, SY + 6, { capHi: true }));
  for (const a of [gap, 180 + gap]) k.add(M, drumY(SY - hb, SY + hb, { a0: a, arc: 180 - 2 * gap }));
  // рифление по окружности барабана — только вне окон диоптров
  const fls = [];
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * 360;
    if (Math.abs(((a + 90) % 180) - 90) < gap + 8) continue;
    fls.push(T2(T2(bx(SY + 6 - TOP - 7, 0.7, 1.2, { bevel: 0.25 }), { p: [(SY + 6 + TOP + 3) / 2, R + 0.15, 0] }), { r: [a, 0, 0] }));
  }
  k.add(M, T2(ctx.G.merge(fls), { r: [0, 0, 90], p: [RX, 0, 0] }));
  // рабочий диоптр со стороны глаза (Ø3,6) и широкое окно спереди — не ограничивает поле
  const plate = (x0, x1, rh) => exX(sh(rr(0, SY, 2 * hb + 0.6, 2 * hb + 0.6, 0.8), [ci(0, SY, rh, 28).reverse()]), x0, x1, { bevel: 0.25 });
  k.add(M, plate(RX - R + 0.2, RX - Ri + 0.4, 1.8));
  k.add(M, plate(RX + Ri - 0.4, RX + R - 0.2, 3.4));
  k.add("steelWorn", T2(lX([[0, 1.8], [0, 2.5], [0.5, 2.5], [0.5, 1.8]], { seg: 28 }), { p: [RX - R, SY, 0] }));
  k.add("lensBlack", T2(cY(Ri - 0.3, SY - hb - 0.05, SY - hb + 0.1, { seg: 32 }), { p: [RX, 0, 0] }));
  k.add("paintWhite", T2(bx(0.6, 3, 0.6), { p: [RX, SY + hb + 1.4, R + 0.1] }));
  // остальные три диоптра барабана (Ø2,4 / Ø3 / V-прорезь) — видны по бокам и сверху не мешают
  for (const [s, rr0, rh] of [[1, 3.2, 1.2], [-1, 3.6, 1.5]]) {
    k.add(M, T2(cZ(rr0, 0, 0.9, { seg: 24, c: 0.3 }), { p: [RX, SY, s > 0 ? R - 0.5 : -R - 0.4] }));
    k.add("lensBlack", T2(cZ(rh, 0, 1, { seg: 16, c: 0 }), { p: [RX, SY, s > 0 ? R - 0.2 : -R - 0.6] }));
  }
  // винт поправок по высоте с прорезью и стопорная защёлка барабана
  k.add("steelWorn", T2(cY(2.4, TOP + 3, TOP + 5, { seg: 16 }), { p: [RX + 14, 0, 7] }));
  k.add("lensBlack", T2(bx(4, 0.6, 0.8), { p: [RX + 14, TOP + 5, 7] }));
  k.add("steelWorn", T2(bx(5, 2.4, 3, { bevel: 0.5 }), { p: [RX - 13, TOP + 4.5, 0] }));
}
function mp5Base(ctx) {
  const { node: nd, T: T2, box: bx, cylZ: cZ, cylY: cY, latheX: lX, extrudeZ: exZ } = ctx.G;
  const k = ctx.kit();
  const nodes = {};
  mp5Receiver(ctx, k);
  mp5Barrel(ctx, k);
  const rs = ctx.kit();
  mp5RearSight(ctx, rs);
  nodes.rearSight = nd("rearSight", [rs.build()]);
  const body = k.build("receiver");
  // затвор в окне выброса
  const c = ctx.kit();
  c.add("steelWorn", T2(bx(60, 14, 3, { bevel: 0.6 }), { p: [-22, 4.5, 12.4] }));
  c.add("steelWorn", T2(cZ(3.4, 12.6, 14.4, { seg: 16 }), { p: [-2, 4.5, 0] }));
  c.add("steelWorn", T2(bx(6, 3, 1.2), { p: [-40, 9, 13.8] }));
  // выбрасыватель на головке затвора
  c.add("steelWorn", T2(bx(16, 3.2, 1, { bevel: 0.4 }), { p: [-2, 8.6, 13.9] }));
  nodes.carrier = nd("carrier", [c.build()]);
  // рукоять взведения: поворачивается вверх в вырез трубки
  const h = ctx.kit();
  h.add("steelWorn", T2(exZ([[-4, -3], [4, -3], [3, 3], [-3, 3]], 20, { bevel: 0.8 }), { p: [0, 0, -H5.TUBE_R - 8] }));
  h.add("steelWorn", T2(lX([[0, 0], [0, 4.6], [1.5, 5.4], [8, 5.4], [9, 4.2], [9, 0]], { seg: 18 }), { r: [0, 90, 0], p: [0, 0, -H5.TUBE_R - 16] }));
  h.add("polySoft", T2(cY(5.8, -3.4, 3.4, { c: 1, seg: 18 }), { p: [-2, 0, -H5.TUBE_R - 22] }));
  nodes.handle = nd("handle", [h.build()], { p: [150, H5.TUBE_Y, 0] });
  const root = nd("mp5a3", [body, nodes.rearSight, nodes.carrier, nodes.handle]);
  const { mount: mount2 } = ctx;
  root.add(mount2({ id: "hg", type: "hg", p: [0, 0, 0] }));
  root.add(mount2({ id: "claw", type: "claw", p: [-96, H5.TOP, 0] }));
  root.add(mount2({ id: "muzzle", type: "thread", p: [H5.MUZZLE - 25, 0, 0] }));
  root.add(mount2({ id: "magwell", type: "magwell", p: [H5.MAG_X, H5.BOT - 2, 0] }));
  root.add(mount2({ id: "trigger", type: "trigger", p: [-44, H5.BOT, 0] }));
  root.add(mount2({ id: "stock", type: "stock", p: [H5.REAR - 4, 0, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 62, handleTravel: 92, handleLock: 32, triggerAngle: 0.2 },
    eject: { p: [-20, 6, 18], dir: [0.45, 0.35, 1], speed: 4.2 },
    muzzle: [H5.MUZZLE, 0, 0],
    irons: { rear: [H5.REAR_X - 10, H5.SIGHT_Y, 0], front: [H5.FRONT_X, H5.SIGHT_Y, 0], type: "aperture", eye: 34, hole: 1.8 },
    eyeX: -300,
    focus: { center: [-90, -30, 0], size: 760 }
  };
}
/* --------------------------------------------------------------- цевья */
function hgSlim(ctx, o) {
  const { extrudeX: exX, extrudeZ: exZ, T: T2, box: bx, node: nd, cylZ: cZ } = ctx.G;
  const k = ctx.kit();
  const x0 = H5.HG_X0, x1 = H5.HG_X1;
  // верхние кромки цевья ниже рукояти взведения (y 18…24) — она ходит над цевьём
  const hw = o.wide ? 22 : 17.5, top = H5.TUBE_Y - 5, bot = o.wide ? -19 : -16;
  const sec = (h, b) => [[-h, top, 3], [-h - 1, 2, 6], [-h + 3, b, 8], [h - 3, b, 8], [h + 1, 2, 6], [h, top, 3], [h - 3, top], [h - 3, 2], [h - 6, -12], [-h + 6, -12], [-h + 3, 2], [-h + 3, top]];
  // задний торец со ступенькой под коробку, основная часть, передний «упор» против соскальзывания ладони
  k.add("poly", exX(sec(hw - 0.8, bot + 2), x0, x0 + 8, { bevel: 1 }));
  k.add("poly", exX(sec(hw, bot), x0 + 8, x1 - 14, { bevel: 0.6 }));
  k.add("poly", exX(sec(hw + 1.2, bot - 5), x1 - 14, x1, { bevel: 1.8 }));
  if (o.wide) {
    // тропическое: рёбра под пальцы и окна охлаждения
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) k.add("poly", T2(bx(3.2, 14, 1.6, { bevel: 0.6 }), { p: [x0 + 24 + i * 16, -5, s * (hw + 0.9)] }));
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) k.add("lensBlack", T2(bx(12, 4.4, 1, { bevel: 0.6 }), { p: [x0 + 30 + i * 24, 10, s * (hw + 0.2)] }));
  } else {
    // штатное узкое: две продольные канавки-упоры по бортам
    for (const s of [-1, 1]) for (const y of [-2, -8]) k.add("poly", T2(bx(x1 - x0 - 40, 1.4, 1.2, { bevel: 0.5 }), { p: [(x0 + x1) / 2 - 4, y, s * (hw + 0.8)] }));
  }
  // штифт цевья с шайбами
  k.add("steelWorn", T2(cZ(2.4, -hw - 1.2, hw + 1.2, { seg: 14 }), { p: [x0 + 5, 8, 0] }));
  for (const s of [-1, 1]) k.add("steelWorn", T2(cZ(3.6, 0, 0.8, { seg: 16 }), { p: [x0 + 5, 8, s > 0 ? hw + 0.9 : -hw - 1.7] }));
  return { root: nd("hg", [k.build()]) };
}
function hgRail(ctx) {
  const { extrudeX: exX, T: T2, box: bx, node: nd, picatinny: pic, cylZ: cZ, screwHead: sh } = ctx.G;
  const k = ctx.kit();
  const x0 = H5.HG_X0, x1 = 178;
  const sec = [[-20, 16, 2], [-24, 6, 4], [-20, -22, 5], [20, -22, 5], [24, 6, 4], [20, 16, 2], [16, 16], [18, 6], [15, -17], [-15, -17], [-18, 6], [-16, 16]];
  k.add("alu", exX(sec, x0, x1, { bevel: 1 }));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) k.add("lensBlack", T2(bx(20, 5, 1, { bevel: 0.5 }), { p: [x0 + 16 + i * 26, -13, s * 21.6], r: [s * -8, 0, 0] }));
  for (const x of [x0 + 8, x1 - 8]) for (const s of [-1, 1]) k.add("steel", T2(sh(2.6, 1.2), { p: [x, -8, s > 0 ? 21.8 : -21.8], r: [0, s > 0 ? 0 : 180, 0] }));
  const mounts = [];
  const add = (id, face, rot, len, pos, base) => {
    const r = pic(len, { base });
    k.add("alu", r.geo, { r: rot, p: pos });
    mounts.push(ctx.railMount(id, [pos[0] + r.first, pos[1], pos[2]], face, r.slots, { axis: face }));
  };
  // нижняя планка на всю длину цевья (под длинные рукоятки вроде AFG), боковые — у переднего края
  add("hgBottom", "bottom", [180, 0, 0], 126, [x1 - 130, -31, 0], 10);
  add("hgRight", "right", [90, 0, 0], 70, [x1 - 74, 4, 32], 9);
  add("hgLeft", "left", [-90, 0, 0], 70, [x1 - 74, 4, -32], 9);
  return { root: nd("bt_rail", [k.build(), ...mounts]) };
}
// Цевьё-фонарь SureFire 628: встроенный фонарь, кнопки под пальцы.
function hgLight(ctx) {
  const { extrudeX: exX, latheX: lX, T: T2, box: bx, node: nd, cylX: cX } = ctx.G;
  const k = ctx.kit();
  const x0 = H5.HG_X0, x1 = 178, top = H5.TUBE_Y - 5;
  const sec = [[-19, top, 3], [-21, 0, 8], [-17, -30, 10], [17, -30, 10], [21, 0, 8], [19, top, 3], [16, top], [17, 2], [14, -12], [-14, -12], [-17, 2], [-16, top]];
  k.add("poly", exX(sec, x0, x1 - 6, { bevel: 1.6 }));
  k.add("alu", T2(lX([[x1 - 12, 0], [x1 - 12, 13], [x1 - 6, 15.5], [x1 + 4, 15.5], [x1 + 4, 13.5], [x1 + 3, 0]], { seg: 32 }), { p: [0, -17, 0] }));
  for (const s of [-1, 1]) k.add("rubber", T2(bx(60, 12, 1.6, { bevel: 0.8 }), { p: [x0 + 50, -6, s * 20.6] }));
  const root = nd("sf628", [k.build()]);
  const le = new ctx.THREE.Mesh(cX(13, x1 + 2.8, x1 + 3.6, { seg: 32 }).translate(0, -17, 0), ctx.mats.get("lampLens").clone());
  le.userData.lens = true;
  root.add(le);
  return { root, light: { p: [x1 + 5, -17, 0], lens: le, lumens: 500 } };
}
/* --------------------------------------------------------------- кронштейн */
function clawMount(ctx, o) {
  const { extrudeX: exX, T: T2, box: bx, node: nd, picatinny: pic, cylZ: cZ } = ctx.G;
  const k = ctx.kit();
  const L = o.len, x0 = -L / 2, h = o.h;
  // основание с четырьмя «когтями» по гнёздам коробки и двумя стяжными гайками
  k.add("alu", exX([[-19, 2, 2], [19, 2, 2], [19, h - 9.4, 2], [-19, h - 9.4, 2]], x0, x0 + L, { bevel: 1.2 }));
  for (const x of [-54, 56]) {
    if (Math.abs(x) > L / 2 + 4) continue;
    for (const s of [-1, 1]) k.add("steel", T2(bx(12, 10, 3, { bevel: 0.8 }), { p: [x, -2, s * 17.5], r: [s * 12, 0, 0] }));
  }
  for (const x of [-30, 30]) {
    k.add("steel", T2(cZ(4.2, 19, 23, { seg: 6 }), { p: [x, 5, 0] }));
    k.add("steel", T2(cZ(3.4, -23, -19, { seg: 18 }), { p: [x, 5, 0] }));
  }
  const r = pic(L - 4, { base: 9.4 });
  k.add("alu", r.geo, { p: [x0 + 2, h, 0] });
  const m = ctx.railMount("clawRail", [x0 + 2 + r.first, h, 0], "top", r.slots, { axis: "top" });
  return { root: nd("claw", [k.build(), m]) };
}
/* --------------------------------------------------------------- спусковая коробка */
// Полимерная рамка с рукоятью. Флажок переводчика — узел, его углы берёт движок (info.selector).
function mp5Trigger(ctx, o) {
  const { extrudeZ: exZ, T: T2, box: bx, cylZ: cZ, node: nd, shape: sh } = ctx.G;
  const k = ctx.kit();
  const M = o.mat || "poly";
  // корпус под коробкой: от штифта (x=0) назад
  k.add(M, exZ([[4, 0], [-176, 0], [-176, -10, 3], [-160, -14, 4], [4, -14, 3]], 32, { bevel: 1.4 }));
  // передний прилив под штифт и выступ в коробку сзади
  k.add(M, exZ([[4, 2], [-18, 2], [-18, -2], [4, -2]], 28, { bevel: 0.8 }));
  k.add(M, exZ([[-150, 4], [-176, 4], [-176, -2], [-150, -2]], 30, { bevel: 1 }));
  // рукоять под углом, со спинкой и выемками под пальцы
  // рукоять SEF: наклон ≈12°, три выемки под пальцы спереди, «горб» под ладонь сзади, расширение у пятки
  const gy = [-8, -22, -34, -44, -52, -60, -68, -76, -84, -93, -101, -106, -109];
  const ga = [22, 21.5, 19, 21.5, 19.2, 21.8, 19.2, 21.5, 19.6, 21, 21.5, 20, 16];
  const g2 = [23, 23, 23.5, 24.5, 25, 25, 24.6, 24, 23.4, 23, 23.4, 22.5, 18];
  const gb = [15, 15, 14.8, 15, 15.2, 15.4, 15.4, 15.2, 15, 15, 15.4, 15, 12];
  const secs = gy.map((y, i) => ({ c: [-140 + (y + 8) * 0.21, y], a: ga[i], a2: g2[i], b: gb[i], k: 2.6, kb: 3.2 }));
  // путь идёт сверху вниз — без flip грани лофта смотрят внутрь и ближняя стенка отсекается
  k.add(o.gripMat || "polyGrip", ctx.G.loftPath(secs, { seg: 40, flip: true }));
  // пятка рукояти — крышка с антабкой-проушиной
  k.add(M, T2(exZ([[-8, 0, 2], [44, 0, 2], [42, -4, 2], [-6, -4, 2]], 26, { bevel: 1.4 }), { p: [-181, -107, 0], r: [0, 0, -12] }));
  // спусковая скоба: широкая (под перчатку), передняя стенка почти вплотную к лапке защёлки
  k.add(M, exZ(sh([[-30, -12], [-114, -12], [-110, -46, 8], [-56, -50, 10], [-30, -36, 7]], [[[-39, -16], [-106, -16], [-104, -40, 6], [-60, -44, 8], [-41, -33, 5]]]), 14, { bevel: 1.2 }));
  k.add("steelWorn", T2(cZ(3, -17, 17, { seg: 14 }), { p: [-8, -6, 0] }));
  for (const x of [-60, -98]) k.add("steelWorn", T2(cZ(2, -16.6, 16.6, { seg: 12 }), { p: [x, -7, 0] }));
  // лапка защёлки магазина (paddle) за приёмником: нажимается указательным пальцем вперёд
  const pd = ctx.kit();
  pd.add("steelMatte", exZ([[3, 1], [-5, 1], [-6, -14, 2], [-3, -26, 3], [3, -27, 2], [1, -14, 2]], 12, { bevel: 0.9 }));
  for (let i = 0; i < 3; i++) pd.add("steelMatte", T2(bx(1, 1.2, 12.4, { bevel: 0.3 }), { p: [3.4 - i * 0.4, -18 - i * 3, 0] }));
  const paddle = nd("magRelease", [pd.build()], { p: [-8, -12, 0] });
  const t = ctx.kit();
  t.add("steelMatte", exZ([[-2, 4], [3, 4], [3, -6, 2], [1, -18, 4], [-4, -24, 2], [-6, -22], [-3, -8, 3]], 6, { bevel: 0.8 }));
  const trigger = nd("trigger", [t.build()], { p: [-76, -14, 0] });
  // флажок переводчика слева (и справа у амбидекстральной)
  const s = ctx.kit();
  for (const sd of o.ambi ? [-1, 1] : [-1]) {
    s.add("steelMatte", T2(cZ(6.4, 0, 2.4, { seg: 24 }), { p: [0, 0, sd > 0 ? 16.4 : -18.8] }));
    s.add("steelMatte", T2(exZ([[-3.4, 0, 1.5], [3.4, 0, 1.5], [2.2, 20, 2], [-2.2, 20, 2]], 2, { bevel: 0.5 }), { p: [0, 0, sd * 18.4] }));
  }
  const sel = nd("selector", [s.build()], { p: [-150, -7, 0] });
  // пиктограммы режимов по дуге вокруг оси флажка: белая — предохранитель, красные — огонь
  for (const [m, a] of Object.entries(o.angles)) {
    const r = a * Math.PI / 180;
    k.add(m === "safe" ? "paintWhite" : "paintRed", T2(bx(3, 3, 0.5, { bevel: 0.6 }), { p: [-150 - Math.sin(r) * 25, -7 + Math.cos(r) * 25, -17.2] }));
  }
  const body = k.build("tg");
  return { root: nd("trigger_" + o.id, [body, paddle, trigger, sel]), modes: o.modes, selector: { node: sel, angles: o.angles, axis: "z" } };
}
/* --------------------------------------------------------------- приклады */
function stockA3(ctx) {
  const { extrudeZ: exZ, extrudeX: exX, T: T2, box: bx, node: nd, cylZ: cZ, rrect: rr } = ctx.G;
  const k = ctx.kit(), sl = ctx.kit();
  const [g0, g1] = H5.GROOVE, RY = (g0 + g1) / 2, RZ = H5.HW + 1.1;
  // длина по реальному A3: 700 мм выдвинут / 550 мм сложен (ход 150). Штанги лежат в продольных
  // выштамповках коробки; в сложенном положении их передние концы стоят сразу за окном выброса (x ≈ −54)
  for (const s of [-1, 1]) sl.add("steel", exX(rr(s * RZ, RY, 5, g1 - g0 - 0.6, 2), -254, 22, { bevel: 0.8 }));
  // затыльник: литая «вилка» под штанги, резиновый амортизатор, прорезь под ремень
  sl.add("steel", exZ([[-246, RY + 7, 3], [-262, 32, 4], [-262, -90, 6], [-256, -94, 4], [-250, -80, 3], [-250, RY - 8, 6]], 38, { bevel: 1.6 }));
  for (const s of [-1, 1]) sl.add("steel", T2(bx(12, 9, 6, { bevel: 1.2 }), { p: [-250, RY, s * (RZ + 0.2)] }));
  sl.add("rubber", exZ([[-261, 33, 5], [-271, 34, 6], [-271, -96, 8], [-261, -94, 6]], 44, { bevel: 2.4 }));
  for (let i = 0; i < 8; i++) sl.add("rubber", T2(bx(1.4, 2, 38), { p: [-271.3, 22 - i * 15.5, 0] }));
  sl.add("lensBlack", T2(bx(16, 5, 38.4, { bevel: 0.8 }), { p: [-256, -66, 0] }));
  const slide = nd("a3slide", [sl.build()]);
  // корпус приклада на торце коробки: втулки штанг, ось-штифт, рычаг защёлки сверху
  k.add("steel", exZ([[0, 29, 2], [-12, 29, 4], [-15, 20, 2], [-15, -14, 3], [-6, -18, 2], [0, -18]], 36, { bevel: 1.2 }));
  for (const s of [-1, 1]) k.add("steel", exX(rr(s * (RZ + 0.2), RY, 7.4, 9, 2.4), -16, 0, { bevel: 0.8 }));
  k.add("steelWorn", T2(cZ(4.4, -20, 20, { seg: 18 }), { p: [-8, -8, 0] }));
  k.add("steelWorn", exZ([[-1, 29], [-14, 29], [-19, 33, 1.5], [-17, 35.4, 1.5], [-4, 32.4, 1]], 11, { bevel: 0.6 }));
  for (let i = 0; i < 3; i++) k.add("steelWorn", T2(bx(1, 1, 11.4, { bevel: 0.3 }), { p: [-16.4 + i * 3.2, 34.6 - i * 0.7, 0] }));
  slingLoop(ctx, k, "steel", [-8, -12, -18], { side: -1, w: 12, h: 8 });
  return { root: nd("a3", [k.build(), slide]), fold: { node: slide, slide: 150 } };
}
function stockA2(ctx) {
  const { extrudeZ: exZ, T: T2, box: bx, cylZ: cZ, node: nd, loftX: lf, superEllipse: se } = ctx.G;
  const k = ctx.kit();
  const prof = [[0, 4, 26, 18], [-40, -2, 30, 18.5], [-110, -18, 42, 19.5], [-180, -32, 54, 20.5], [-228, -38, 60, 21]];
  k.add("poly", lf(prof.map(([x, cy, hh, hw]) => ({ x, pts: se(hw, hh, 3.6, 28, cy, 0) }))));
  k.add("rubber", T2(exZ([[-3, 22, 6], [5, 22, 6], [5, -98, 8], [-3, -98, 8]], 44, { bevel: 2.5 }), { p: [-232, 0, 0] }));
  for (let i = 0; i < 8; i++) k.add("rubber", T2(bx(1.6, 2.2, 36), { p: [-236, 12 - i * 13, 0] }));
  k.add("steel", exZ([[0, 22], [-10, 22], [-10, -16, 3], [0, -16]], 38, { bevel: 1.2 }));
  k.add("steelWorn", T2(cZ(4.4, -22, 22, { seg: 18 }), { p: [-6, -8, 0] }));
  slingLoop(ctx, k, "steel", [-196, 20, 0], { side: 1, w: 18, h: 10 });
  return { root: nd("a2", [k.build()]) };
}
function endCap(ctx) {
  const { extrudeZ: exZ, T: T2, cylZ: cZ, node: nd, box: bx } = ctx.G;
  const k = ctx.kit();
  k.add("steel", exZ([[0, 26, 4], [-14, 26, 6], [-18, 0, 8], [-14, -16, 4], [0, -16]], 36, { bevel: 2 }));
  k.add("steelWorn", T2(cZ(4.4, -20, 20, { seg: 18 }), { p: [-6, -8, 0] }));
  k.add("steelWorn", T2(bx(6, 14, 30, { bevel: 2 }), { p: [-16, 6, 0] }));
  slingLoop(ctx, k, "steel", [-6, -10, -18], { side: -1, w: 12, h: 8 });
  return { root: nd("cap", [k.build()]) };
}
/* --------------------------------------------------------------- дульные */
function hk3Cap(ctx) {
  const { latheX: lX, flutesX: fl, node: nd } = ctx.G;
  const k = ctx.kit();
  k.add("steelMatte", lX([[12, 0], [12, 9], [26, 9], [27, 8], [27, 0]], { seg: 28 }));
  k.add("steelMatte", fl(9, 14, 25, 16, 1.2, 0.5));
  return { root: nd("cap", [k.build()]), muzzle: { x: 27, kind: "bare", flash: 1 } };
}
function hk3Fh(ctx) {
  const { latheX: lX, T: T2, box: bx, node: nd } = ctx.G;
  const k = ctx.kit();
  k.add("steelMatte", lX([[-6, 0], [-6, 12.6], [-4, 13.2], [8, 13.2], [10, 11], [48, 11], [49, 9.8], [49, 5.6], [10, 5.6], [10, 0]], { seg: 36 }));
  for (let i = 0; i < 4; i++) k.add("lensBlack", T2(bx(26, 2.4, 3.4, { bevel: 0.5 }), { p: [33, 10.3, 0], r: [45 + i * 90, 0, 0] }));
  return { root: nd("fh3", [k.build()]), muzzle: { x: 49, kind: "fh", flash: 0.4 } };
}
function hk3Comp(ctx) {
  const { latheX: lX, T: T2, box: bx, cylY: cY, node: nd } = ctx.G;
  const k = ctx.kit();
  k.add("steelMatte", lX([[-6, 0], [-6, 13.4], [42, 13.4], [43, 12], [43, 5], [40, 5], [40, 0]], { seg: 36 }));
  for (let i = 0; i < 3; i++) k.add("lensBlack", T2(cY(2.4, 0, 3, { seg: 12 }), { p: [16 + i * 9, 11.4, 0] }));
  for (const s of [-1, 1]) k.add("lensBlack", T2(bx(8, 6, 3, { bevel: 1 }), { p: [30, 3, s * 11.8] }));
  return { root: nd("comp3", [k.build()]), muzzle: { x: 43, kind: "comp", flash: 0.8 } };
}
function hk3Can(ctx, o) {
  const { latheX: lX, flutesX: fl, ringGrooves: rg, tubeX: tb, cylX: cX, node: nd } = ctx.G;
  const k = ctx.kit();
  const R4 = o.r, L = o.len;
  // замок на три зацепа: рычаг-защёлка и рифлёная муфта
  k.add("steelMatte", lX([[-8, 0], [-8, R4 - 5], [-6, R4 - 3], [22, R4 - 3], [24, R4], [L - 6, R4], [L - 2, R4 - 2.6], [L, R4 - 5], [L, 5.4], [L - 2.5, 4.8], [L - 2.5, 0]], { seg: 48, crease: 30 }));
  k.add("steelMatte", rg(R4 - 2.6, -6, 20, 8, 0.6, { seg: 44 }));
  if (o.fins) k.add("steelMatte", fl(R4 - 0.3, 34, L - 16, o.fins, 3, 0.9));
  if (o.rings) for (const x of o.rings) k.add("steelMatte", tb(R4 + 0.8, R4 - 0.2, x, x + 3, { seg: 48 }));
  k.add("lensBlack", cX(5.3, L - 2.7, L + 0.05, { seg: 18 }));
  return { root: nd(o.name, [k.build()]), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
/* --------------------------------------------------------------- магазины */
function mp5Mag(ctx, o) {
  const m = boxMag(ctx, { d0: 35.5, d1: 34, w: 22, lipH: 9, lipX0: 4, lipX1: 26, lipRise: 2.6, lipCurl: 2.2, cal: "9x19", plateOver: 5, catchX: -34, catchY: -2, ...o });
  // контрольные окна у задней стенки (каждые 10 патронов) — повторяют дугу корпуса
  const { T: T2, cylZ: cZ } = ctx.G;
  const k = ctx.kit();
  const R = o.R && isFinite(o.R) ? o.R : 1e5, D0 = 35.5, D1 = 34, cx = -D0 / 2 + R, n = Math.max(2, Math.round(o.cap / 10));
  for (let i = 0; i < n; i++) {
    const t = 0.18 + 0.64 * i / (n - 1), a = Math.PI + t * o.len / R, rr = R + (D0 + (D1 - D0) * t) / 2 - 5;
    for (const s of [-1, 1]) k.add("lensBlack", T2(cZ(1.4, -0.35, 0.35, { seg: 12, c: 0 }), { p: [cx + Math.cos(a) * rr, Math.sin(a) * rr, s * 11] }));
  }
  m.root.add(k.build());
  return m;
}
var mp5a3_default = {
  id: "mp5a3",
  family: "mp5",
  title: "HK MP5A3",
  short: "MP5A3",
  caliber: "9×19 Парабеллум",
  cal: "9x19",
  thread: "hk3lug",
  boltHold: false,
  reload: "hk",
  chargeLabel: "рукоять взведения",
  burstN: 3,
  specs: [["Ствол", "225 мм"], ["Длина", "700 / 550 мм"], ["Темп", "800 выстр/мин"], ["Масса", "2,88 кг"]],
  base: { weight: 2540, length: 700, ergo: 62, recoilV: 70, recoilH: 55, moa: 3.2, velocity: 400, range: 200, loud: 157, flash: 35, adsTime: 230, rpm: 800, mag: 30 },
  audio: { cal: "9x19", mech: 1.05 },
  modes: ["safe", "semi", "auto"],
  build: mp5Base,
  slots: [
    { id: "handguard", label: "Цевьё", group: "Ствол и цевьё", accepts: ["mp5hg"], mount: "hg", required: true },
    { id: "muzzle", label: "Дульное устройство", group: "Ствол и цевьё", accepts: ["muzzle"], mount: "muzzle" },
    { id: "claw", label: "Кронштейн", group: "Оптика", accepts: ["claw"], mount: "claw" },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: ["clawRail"], prefer: { x: -110 } },
    { id: "magnifier", label: "Увеличитель", group: "Оптика", accepts: ["magnifier"], rails: ["clawRail"], prefer: "rear", behind: "optic" },
    { id: "under", label: "Под стволом", group: "Тактика", accepts: ["foregrip"], rails: ["hgBottom"], prefer: "front" },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgRight"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgLeft"], prefer: "front" },
    { id: "mag", label: "Магазин", group: "Коробка", accepts: ["mag"], mount: "magwell" },
    { id: "trigger", label: "Спусковая коробка", group: "Коробка", accepts: ["mp5tg"], mount: "trigger", required: true },
    { id: "stock", label: "Приклад", group: "Коробка", accepts: ["stock"], mount: "stock", required: true }
  ],
  parts: [
    { id: "hg_slim", cat: "mp5hg", name: "Узкое цевьё A3", desc: "Штатное полимерное, с рёбрами", stats: { weight: 110 }, build: (c) => hgSlim(c, {}) },
    { id: "hg_tropical", cat: "mp5hg", name: "Тропическое цевьё", desc: "Широкое, упор под ладонь, не греется", stats: { weight: 150, ergo: 3, "recoilV%": -2 }, build: (c) => hgSlim(c, { wide: true }) },
    { id: "hg_bt", cat: "mp5hg", name: "B&T цевьё с планками", desc: "Три планки Пикатинни: снизу и по бортам", stats: { weight: 230, ergo: 1 }, build: hgRail },
    { id: "hg_sf628", cat: "mp5hg", name: "SureFire 628 (цевьё-фонарь)", desc: "Встроенный фонарь 500 лм, кнопки под пальцы (" + __AB.L + ")", stats: { weight: 340, ergo: 2 }, build: hgLight },
    { id: "hk_cap", cat: "muzzle", name: "Колпачок резьбы", desc: "Защищает трёхзацепный выступ", fit: { thread: ["hk3lug"] }, stats: { weight: 12 }, build: hk3Cap },
    { id: "hk_fh", cat: "muzzle", name: "Пламегаситель HK (3 зацепа)", desc: "Щелевой, быстросъёмный", fit: { thread: ["hk3lug"] }, stats: { weight: 70, length: 55, flash: -30, "recoilV%": -2 }, build: hk3Fh },
    { id: "bt_comp", cat: "muzzle", name: "Компенсатор B&T", desc: "Газы вверх и в стороны: меньше подброс, громче", fit: { thread: ["hk3lug"] }, stats: { weight: 85, length: 49, flash: 12, "recoilV%": -14, "recoilH%": -8, loud: 2 }, build: hk3Comp },
    { id: "bt_supp", cat: "muzzle", name: "Глушитель B&T MP5 (3 зацепа)", desc: "Быстросъёмный: с дозвуковым 9 мм слышны почти только затвор и ролики", fit: { thread: ["hk3lug"] }, stats: { weight: 420, length: 190, loud: -30, flash: -34, "recoilV%": -12, ergo: -7, adsTime: 22, velocity: 5 }, build: (c) => hk3Can(c, { name: "bt", r: 20, len: 190, rings: [60, 120] }) },
    { id: "gem_raptor", cat: "muzzle", name: "Gemtech Raptor-II", desc: "Короткий лёгкий глушитель на три зацепа", fit: { thread: ["hk3lug"] }, stats: { weight: 290, length: 150, loud: -26, flash: -34, "recoilV%": -9, ergo: -5, adsTime: 16, velocity: 3 }, build: (c) => hk3Can(c, { name: "raptor", r: 19, len: 150, fins: 10 }) },
    { id: "claw_hk", cat: "claw", name: "Кронштейн HK STANAG", desc: "На «когтях» по гнёздам коробки, планка 120 мм", stats: { weight: 190 }, build: (c) => clawMount(c, { len: 128, h: 22 }) },
    { id: "claw_bt", cat: "claw", name: "B&T низкий кронштейн", desc: "Ниже на 7 мм: коллиматор ближе к оси", stats: { weight: 120, ergo: 1 }, build: (c) => clawMount(c, { len: 104, h: 15 }) },
    { id: "mag30", cat: "mag", name: "Магазин HK 30", desc: "Сталь, изогнутый, 30 патронов", stats: { weight: 150, mag: 30 }, build: (c) => mp5Mag(c, { R: 520, len: 190, mat: "steelMatte", cap: 30, ribs: true, ribMat: "steelMatte" }) },
    { id: "mag15", cat: "mag", name: "Магазин HK 15", desc: "Короткий прямой: ниже профиль", stats: { weight: 100, mag: 15, ergo: 2, adsTime: -6 }, build: (c) => mp5Mag(c, { R: 0, len: 108, mat: "steelMatte", cap: 15, ribs: true, ribMat: "steelMatte" }) },
    { id: "mag40", cat: "mag", name: "Магазин 40 (удлинённый)", desc: "Стальной, 40 патронов", stats: { weight: 210, mag: 40, ergo: -3, adsTime: 8 }, build: (c) => mp5Mag(c, { R: 520, len: 246, mat: "steelMatte", cap: 40, ribs: true, ribMat: "steelMatte" }) },
    { id: "drum50", cat: "mag", name: "Барабан KCI 50", desc: "Полимерный барабан на 50 патронов", stats: { weight: 620, mag: 50, ergo: -10, adsTime: 26 }, build: (c) => drumMag(c, { d0: 35.5, d1: 34, w: 22, lipH: 9, lipX0: 4, lipX1: 26, cal: "9x19", catchX: -34, catchY: -2, R: 520, len: 190, neck: 50, mat: "poly", cap: 50, drum: [-26, -84, 52, 50] }) },
    { id: "tg_sef", cat: "mp5tg", name: "SEF (0–1–F)", desc: "Штатная: предохранитель, одиночный, автомат", stats: { weight: 380 }, build: (c) => mp5Trigger(c, { id: "sef", modes: ["safe", "semi", "auto"], angles: { safe: 0, semi: -48, auto: -96 }}) },
    { id: "tg_navy", cat: "mp5tg", name: "Navy, 4 позиции (0–1–3–F)", desc: "Амбидекстральный флажок + очередь по 3", stats: { weight: 410, ergo: 2 }, build: (c) => mp5Trigger(c, { id: "navy", ambi: true, modes: ["safe", "semi", "burst", "auto"], angles: { safe: 0, semi: -45, burst: -90, auto: -135 }}) },
    { id: "tg_se", cat: "mp5tg", name: "Полуавтомат (0–1)", desc: "Только одиночный огонь — спортивная версия", stats: { weight: 360, moa: -0.3 }, build: (c) => mp5Trigger(c, { id: "se", mat: "polyGrey", modes: ["safe", "semi"], angles: { safe: 0, semi: -60 }}) },
    { id: "stock_a3", cat: "stock", name: "A3 выдвижной", desc: "Стальные направляющие, K — задвинуть/выдвинуть", stats: { weight: 500 }, build: stockA3 },
    { id: "stock_a2", cat: "stock", name: "A2 постоянный", desc: "Полимерный, лучшая опора щеки", stats: { weight: 420, ergo: 3, "recoilV%": -8, "recoilH%": -6 }, build: stockA2 },
    { id: "endcap", cat: "stock", name: "Затыльник без приклада", desc: "Короче и легче, стрелять сложнее", stats: { weight: 90, length: -150, ergo: 6, "recoilV%": 35, "recoilH%": 40, adsTime: -40 }, build: endCap }
  ],
  defaults: {
    handguard: "hg_slim",
    muzzle: "hk_cap",
    claw: null,
    optic: null,
    magnifier: null,
    under: null,
    tacRight: null,
    tacLeft: null,
    mag: "mag30",
    trigger: "tg_sef",
    stock: "stock_a3"
  }
};

DEFS[mp5a3_default.id] = mp5a3_default; FAMILY[mp5a3_default.id] = "A";
})();
(() => {
// ---- weapons/glock18c.js
// Glock 18C: автоматический пистолет со сцепленным затвором (схема Браунинга), компенсированный ствол,
// переводчик огня слева на кожухе-затворе. Единицы — мм, ось канала y = 0, x = 0 — казённый срез.
// Пропорции по G17/G18C: кожух 186 × 25,5 × 28,5 мм, ось канала ~10 мм ниже крыши кожуха,
// угол рукояти 22°, прицельная линия 165–170 мм, высота с магазином ~138 мм.
var GL = {
  S_REAR: -74,
  S_FRONT: 112,
  S_TOP: 10.5,
  S_BOT: -18,
  S_HW: 12.7,
  SIGHT_Y: 16,
  REAR_X: -66,
  FRONT_X: 104,
  F_TOP: -18,
  GRIP_A: 22,
  // окно выброса и окно компенсатора 18C (над портами ствола)
  PORT: [-1, 40],
  COMP: [74, 100],
  // передний верх магазина; ось рукояти наклонена на GRIP_A
  MAG: [-29, -25]
};
// Точка в системе рукояти/магазина (lx — вперёд по нормали к оси, ly — вверх по оси) → мировые x, y.
function glGripPt(lx, ly) {
  const a = GL.GRIP_A * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [GL.MAG[0] + lx * c + ly * s, GL.MAG[1] - lx * s + ly * c];
}
// UV по мировым координатам (проекция по доминирующей оси нормали): у кожуха из нескольких экструзий
// текстура идёт непрерывно, без швов на стыках участков.
function glUV(ctx, g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = az >= ax && az >= ay ? [p.getX(i), p.getY(i)] : ay >= ax ? [p.getX(i), p.getZ(i)] : [p.getZ(i), p.getY(i)];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute("uv", new ctx.THREE.BufferAttribute(uv, 2));
  return g;
}
// Сечения кожуха (z, y): плоские борта и крыша с фасками 45°.
// port — окно выброса: правый борт срезан до y = −3, крыша открыта до левой кромки худа ствола;
// comp — продольное окно компенсатора; serr — зона насечек (борта утоплены на 0,7 мм, рёбра добавляются отдельно).
function glSlideSec(kind) {
  const { S_TOP: T0, S_BOT: B, S_HW: W } = GL;
  const L = [[-W + 3, T0, 1], [-W, T0 - 4, 1]];
  if (kind === "port") return [[-W, B, 1], [W, B, 1], [W, -3, 0.4], [W - 2.2, -3], [W - 2.2, -8], [-W + 2.2, -8], [-W + 2.2, T0 - 2.4], [-8.3, T0 - 2.4], [-8.3, T0, 0.3], ...L];
  if (kind === "comp") return [[-W, B, 1], [W, B, 1], [W, T0 - 4, 1], [W - 3, T0, 1], [3.8, T0, 0.4], [3.8, 2], [-3.8, 2], [-3.8, T0, 0.4], ...L];
  if (kind === "serr") return [[-W + 0.7, B, 0.6], [W - 0.7, B, 0.6], [W - 0.7, T0 - 4.4], [W, T0 - 4, 1], [W - 3, T0, 1], ...L, [-W + 0.7, T0 - 4.4]];
  return [[-W, B, 1], [W, B, 1], [W, T0 - 4, 1], [W - 3, T0, 1], ...L];
}
function glSlide(ctx, o) {
  const { extrudeX: exX, extrudeZ: exZ, T: T2, box: bx, cylX: cX, cylZ: cZ, node: nd, rrect: rr, latheX: lX } = ctx.G;
  const k = ctx.kit();
  const { S_REAR: R4, S_FRONT: F, S_TOP: T0, S_BOT: B, S_HW: W, SIGHT_Y: SY, REAR_X: RX, FRONT_X: FX, PORT: P, COMP: C } = GL;
  const M = "steelMatte";
  const seg = (kind, x0, x1, bevel) => k.add(M, glUV(ctx, exX(glSlideSec(kind), x0, x1, { bevel })));
  // насечки — настоящие канавки: утопленный участок + рёбра заподлицо с бортом
  // стыки участков без фасок: борта и крыша идут непрерывно, шов не виден
  const serr = (x0, n) => {
    const x1 = x0 + n * 3.1 + 1.5;
    seg("serr", x0, x1, 0);
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) k.add(M, T2(bx(1.6, T0 - 4.6 - B, 0.9, { bevel: 0.25 }), { p: [x0 + 2.3 + i * 3.1, (T0 - 4 + B) / 2 - 0.2, s * (W - 0.45)] }));
    return x1;
  };
  seg("solid", R4, R4 + 4, 0.9);
  const sEnd = serr(R4 + 3, 11);
  seg("solid", sEnd, P[0], 0);
  seg("port", P[0], P[1], 0);
  if (o.comp) {
    seg("solid", P[1], C[0], 0);
    seg("comp", C[0], C[1], 0);
    seg("solid", C[1], F - 3, 0);
  } else if (o.frontSerr) {
    seg("solid", P[1], F - 36, 0);
    seg("solid", serr(F - 36, 8), F - 3, 0);
  } else seg("solid", P[1], F - 3, 0);
  // нос кожуха со скосом; задняя фаска спрятана внутри соседнего участка
  seg("solid", F - 8, F, 1.8);
  // отверстие под направляющий стержень возвратной пружины под стволом
  k.add("lensBlack", T2(cX(4.4, F - 0.4, F + 0.05, { seg: 20, c: 0 }), { p: [0, -11.5, 0] }));
  k.add("steelWorn", T2(cX(2.3, F - 1.2, F + 0.15, { seg: 14, c: 0.3 }), { p: [0, -11.5, 0] }));
  // полость окна выброса (тёмная задняя стенка за худом) и выбрасыватель справа — он же указатель патрона
  k.add("lensBlack", T2(bx(0.6, T0 - 4 + 8, 2 * W - 5), { p: [P[0] + 0.3, (T0 - 2.4 - 8) / 2, 0] }));
  k.add("steel", exZ([[P[0], -2.6, 0.5], [-30, -2.6, 1], [-32, 0.6, 1.5], [-30, 3.8, 1], [P[0], 3.8, 0.5]], 0.9, { bevel: 0.3, z: W + 0.2 }));
  k.add("steel", T2(bx(4, 2.6, 0.6, { bevel: 0.25 }), { p: [-4, 0.6, W + 0.75] }));
  // фрезеровка MOS: посадочное место под коллиматор с крышкой и винтами
  if (o.mos) {
    k.add("lensBlack", T2(bx(50, 0.6, 21), { p: [-44, T0 + 0.05, 0] }));
    k.add("poly", T2(bx(46, 0.9, 18, { bevel: 0.4 }), { p: [-44, T0 + 0.2, 0] }));
    for (const x of [-60, -28]) k.add("steelWorn", T2(cZ(1.6, -0.5, 0.5, { seg: 12 }), { p: [x, T0 + 0.6, 0], r: [90, 0, 0] }));
  }
  // переводчик огня 18: ось на левом борту сзади, флажок с рифлёным концом
  const s = ctx.kit();
  s.add("steelWorn", cZ(4, -W - 1.2, -W + 0.4, { seg: 20 }));
  s.add("steelWorn", T2(exZ([[-2.4, 0, 1], [2.4, 0, 1], [1.9, -11, 1.4], [-1.9, -11, 1.4]], 1.4, { bevel: 0.4 }), { p: [0, 0, -W - 1.6] }));
  for (let i = 0; i < 3; i++) s.add("steelWorn", T2(bx(3.6, 0.6, 0.5, { bevel: 0.2 }), { p: [0, -7.5 - i * 1.3, -W - 2.4] }));
  const sel = nd("selector", [s.build()], { p: [R4 + 14, 0, 0] });
  // метки: одна точка — одиночный, две — автомат
  for (const [ang, n] of [[0, 1], [-38, 2]]) {
    const r = (ang + 180) * Math.PI / 180, cx0 = R4 + 14 - Math.sin(r) * 14, cy0 = Math.cos(r) * 14;
    for (let i = 0; i < n; i++) k.add("paintWhite", T2(cZ(0.8, -0.3, 0.1, { seg: 10 }), { p: [cx0 + (i - (n - 1) / 2) * 2.4, cy0, -W - 0.1] }));
  }
  // затыльная крышка кожуха с выходом ударника
  k.add("poly", exX(rr(0, -3, 15, 18, 2), R4 - 0.8, R4 + 0.6, { bevel: 0.3 }));
  k.add("lensBlack", T2(cX(1.3, R4 - 1, R4 - 0.6, { seg: 12, c: 0 }), { p: [0, 0, 0] }));
  // прицельные Glock: целик с белым «П» (U-прорезь), мушка с белой точкой; у MOS — высокие под коллиматор
  const tall = o.mos ? 4 : 0, top = SY + tall, nb = top - 3.4;
  const rear = [[-8.4, T0 - 0.2], [8.4, T0 - 0.2], [8.4, top - 1.4, 1], [7.4, top, 0.6], [1.8, top], [1.8, nb, 1.6], [-1.8, nb, 1.6], [-1.8, top], [-7.4, top, 0.6], [-8.4, top - 1.4, 1]];
  k.add("poly", exX(rear, RX - 6, RX + 4, { bevel: 0.5 }));
  k.add("poly", exZ([[RX - 6, T0 - 0.4], [RX + 6, T0 - 0.4], [RX + 4, T0 + 1.6], [RX - 6, T0 + 1.6]], 13, { bevel: 0.3 }));
  if (o.night) {
    for (const z of [-4.4, 4.4]) k.add("tritium", T2(cX(1, RX - 6.4, RX - 5.9, { seg: 12 }), { p: [0, top - 2, z] }));
  } else {
    for (const z of [-2.7, 2.7]) k.add("paintWhite", T2(bx(0.3, 3.6, 0.9), { p: [RX - 6.1, top - 1.8, z] }));
    k.add("paintWhite", T2(bx(0.3, 0.9, 6.3), { p: [RX - 6.1, nb - 0.9, 0] }));
  }
  k.add("poly", exZ([[FX - 3.2, T0 - 0.4], [FX + 3.2, T0 - 0.4], [FX + 2.6, top, 0.8], [FX - 2.8, top, 0.8]], 3.4, { bevel: 0.4 }));
  k.add(o.night ? "tritium" : "paintWhite", T2(cX(1.1, FX - 3.1, FX - 2.6, { seg: 14 }), { p: [0, top - 2, 0] }));
  const root = nd("slide_" + o.id, [k.build(), sel]);
  if (o.mos) root.add(ctx.mount({ id: "mos", type: "mos", p: [-44, T0 - 1.6, 0] }));
  return {
    root,
    irons: { rear: [RX - 2, top - 0.6, 0], front: [FX, top - 0.6, 0], type: "notch" },
    selector: { node: sel, angles: { semi: 0, auto: -38 }, axis: "z" }
  };
}
function glFrame(ctx, k, nodes) {
  const { extrudeX: exX, extrudeZ: exZ, T: T2, box: bx, cylZ: cZ, node: nd, shape: sh, picatinny: pic } = ctx.G;
  const P = "poly", FT = GL.F_TOP, FB = GL.F_TOP - 13;
  // пылезащитная часть рамки под кожухом, направляющие кожуха видны щелью по бортам
  k.add(P, glUV(ctx, exX([[-12.4, FT, 1], [12.4, FT, 1], [12, FB, 3], [-12, FB, 3]], -66, 98, { bevel: 1.4 })));
  for (const s of [-1, 1]) k.add(P, exX([[s * 11.6, FT + 0.4], [s * 12.5, FT + 0.4], [s * 12.5, FT - 2.6], [s * 11.6, FT - 2.6]], -66, 96, { bevel: 0.2 }));
  // спусковая скоба с «крюком» спереди; задняя часть переходит в перемычку к рукояти
  k.add(P, exZ(sh([[37, FB, 1], [-26, FB], [-36, FB - 25, 4], [30, FB - 26, 2], [38, FB - 20, 2], [37.4, FB - 8, 3]], [[[28, FB - 3], [-12, FB - 3], [-17, FB - 20, 4], [26, FB - 21, 2], [29.4, FB - 14, 2]]]), 11, { bevel: 1.4 }));
  k.add(P, exZ([[-12, FB + 1], [-28, FB + 1], [-37, FB - 23, 3], [-17, FB - 19, 5]], 22, { bevel: 3 }));
  for (let i = 0; i < 4; i++) k.add(P, T2(bx(0.8, 1.2, 9, { bevel: 0.3 }), { p: [38.1 - i * 0.12, FB - 10 - i * 2.4, 0] }));
  // рукоять лофтом по оси 22°: почти прямоугольное сечение, три выемки под пальцы (Gen4),
  // «горб» спинки и расширение горловины снизу. Внутри целиком помещается магазин.
  const g = (ly, c, w) => Math.exp(-(((ly - c) / w) ** 2));
  const lys = [-10.4, -16, -22, -28, -32, -35, -38, -41, -44, -48, -52, -55, -58, -61, -64, -68, -72, -75, -78, -81, -85, -90, -95, -99, -101.5, -103];
  const secs = lys.map((ly) => {
    const flare = ly < -92 ? (-92 - ly) / 11 : 0;
    const a = 23.1 - 1.5 * (g(ly, -38, 5.5) + g(ly, -58, 5.5) + g(ly, -78, 5.5)) + 0.3 * (g(ly, -48, 3.5) + g(ly, -68, 3.5)) + 0.7 * flare;
    const a2 = 23.1 + 1.3 * g(ly, -30, 12) + 0.5 * flare;
    const c = glGripPt(-19.9, ly);
    return { c, a, a2, b: 14.7 + 0.8 * flare, k: 3.6, kb: 3 };
  });
  // путь идёт сверху вниз — без flip грани лофта смотрят внутрь и ближняя стенка отсекается
  k.add("polyGrip", ctx.G.loftPath(secs, { seg: 44, flip: true }));
  // хвостовик над перемычкой ладони
  k.add(P, exZ([[-60, FT - 0.2, 1], [-76, FT - 0.6, 2], [-82, FT - 5, 3], [-79, FT - 12, 3], [-66, FT - 12]], 24, { bevel: 2.4 }));
  // кнопка защёлки магазина (слева), рычаг затворной задержки, рычаг разборки, три штифта
  k.add("poly", exZ([[-19, FB - 1.5, 0.6], [-28, FB - 1.5, 0.6], [-27, FB - 7.5, 1], [-20.5, FB - 7.5, 1]], 2.4, { bevel: 0.5, z: -12.2 }));
  k.add("steelMatte", exZ([[-40, FT - 0.6], [-18, FT - 0.6], [-15, FT - 3.6, 1], [-24, FT - 4, 1], [-40, FT - 3]], 1.4, { bevel: 0.3, z: -13.2 }));
  for (const s of [-1, 1]) {
    k.add("steelMatte", exZ([[1, FT - 1.2], [12, FT - 1.2], [12, FT - 4, 0.6], [1, FT - 4, 0.6]], 1, { bevel: 0.2, z: s * 12.9 }));
    for (let i = 0; i < 4; i++) k.add("steelMatte", T2(bx(0.5, 2.4, 0.4), { p: [3 + i * 2.4, FT - 2.6, s * 13.5] }));
  }
  for (const [x, y] of [[13, FT - 6], [-8, FT - 8], [-58, FT - 6]]) for (const s of [-1, 1]) k.add("steelWorn", T2(cZ(1.6, 0, 0.5, { seg: 10 }), { p: [x, y, s > 0 ? 12.2 : -12.7] }));
  // пластина с номером под пылезащитной частью
  k.add("steelWorn", T2(bx(12, 0.5, 7, { bevel: 0.2 }), { p: [44, FB - 0.1, 0] }));
  // рельс рамки: один паз (Universal Glock Rail)
  const r = pic(26, { base: 4 });
  k.add(P, r.geo, { r: [180, 0, 0], p: [58, FB, 0] });
  const rail = ctx.railMount("frameRail", [58 + r.first, FB, 0], "bottom", r.slots, { axis: "bottom" });
  // спусковой крючок с предохранительной клавишей посередине
  const t = ctx.kit();
  t.add(P, exZ([[-2, 2], [3, 2], [3, -6, 2], [1, -15, 4], [-3, -18, 2], [-5, -16], [-2, -7, 3]], 6, { bevel: 0.9 }));
  t.add(P, exZ([[-0.4, -3], [1.8, -3], [0.8, -14, 1], [-1.2, -14, 1]], 2.2, { bevel: 0.3 }));
  t.add("steelWorn", T2(bx(4, 1.2, 1.4), { p: [0, 2.4, 0] }));
  nodes.trigger = nd("trigger", [t.build()], { p: [4, FB, 0] });
  return [nodes.trigger, rail];
}
function glBase(ctx) {
  const { node: nd } = ctx.G;
  const k = ctx.kit();
  const nodes = {};
  const extra = glFrame(ctx, k, nodes);
  const body = k.build("frame");
  const { mount: mount2 } = ctx;
  // кожух-затвор — «рама»: движется при выстреле и остаётся на задержке
  nodes.carrier = nd("slide", [mount2({ id: "slide", type: "slide", p: [0, 0, 0] })]);
  const root = nd("glock18c", [body, ...extra, nodes.carrier]);
  root.add(mount2({ id: "barrel", type: "barrel", p: [0, 0, 0] }));
  const mw = mount2({ id: "magwell", type: "magwell", p: [GL.MAG[0], GL.MAG[1], 0] });
  mw.rotation.z = -GL.GRIP_A * Math.PI / 180;
  root.add(mw);
  // накладка и упор строятся сразу в координатах пистолета (по линии спинки рукояти)
  root.add(mount2({ id: "backstrap", type: "backstrap", p: [0, 0, 0] }));
  root.add(mount2({ id: "stock", type: "stock", p: [0, 0, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 56, triggerAngle: 0.28 },
    eject: { p: [12, 4, 14], dir: [0.1, 0.8, 1], speed: 3 },
    muzzle: [GL.S_FRONT, 0, 0],
    eyeX: -560,
    pivotX: -80,
    focus: { center: [10, -48, 0], size: 330 }
  };
}
/* --------------------------------------------------------------- стволы */
function glBarrel(ctx, o) {
  const { latheX: lX, extrudeX: exX, T: T2, box: bx, node: nd, ringGrooves: rg, rrect: rr } = ctx.G;
  const k = ctx.kit();
  const L = o.threaded ? 128 : 114, th = o.threaded ? 16 : 0, B = "steelPark";
  // худ (прямоугольный прилив патронника) заполняет окно выброса, верх чуть ниже крыши кожуха
  k.add(B, exX(rr(0, 1, 15.4, 16.4, 1.6), GL.PORT[0], 34, { bevel: 0.6 }));
  k.add(B, lX([[33, 0], [33, 8.2], [38, 7.4], [L - th, 7.1], [L - th, 0]], { seg: 28 }));
  if (o.threaded) k.add(B, rg(6.6, L - th, L, 10, 0.35, { seg: 24 }));
  // срез ствола и канал
  k.add(B, T2(lX([[0, 3.6], [0, 6.4], [0.6, 7], [0.6, 3.6]], { seg: 24 }), { p: [L - 0.6, 0, 0] }));
  k.add("lensBlack", T2(lX([[0, 0], [0, 4.6], [0.4, 4.6], [0.4, 0]], { seg: 20 }), { p: [L - 0.7, 0, 0] }));
  // порты компенсатора (видны в окне кожуха)
  if (o.comp) for (const x of [GL.COMP[0] + 7, GL.COMP[0] + 19]) k.add("lensBlack", T2(bx(6.5, 0.8, 4.4, { bevel: 0.3 }), { p: [x, 6.9, 0] }));
  const out = { root: nd("barrel", [k.build()]) };
  // газ уходит вверх через порты ствола и окно кожуха — картина выстрела как у компенсатора
  if (o.comp) out.muzzleKind = "comp";
  if (o.threaded) out.root.add(ctx.mount({ id: "muzzle", type: "thread", p: [L - th, 0, 0] }));
  return out;
}
/* --------------------------------------------------------------- дульные */
function osprey(ctx) {
  const { extrudeX: exX, latheX: lX, T: T2, box: bx, node: nd, cylX: cX, rrect: rr } = ctx.G;
  const k = ctx.kit();
  const L = 170;
  // SilencerCo Osprey 9: эксцентричный корпус (ось ниже канала), видны штатные прицельные
  k.add("steelMatte", lX([[0, 0], [0, 8.4], [18, 8.4], [18, 0]], { seg: 28 }));
  k.add("alu", exX(rr(0, -7, 34, 38, 12), 12, L, { bevel: 2 }));
  for (const x of [40, 110]) k.add("alu", exX(rr(0, -7, 35, 39, 12.5), x, x + 3, { bevel: 0.6 }));
  k.add("lensBlack", cX(5, L - 0.3, L + 0.3, { seg: 18 }));
  return { root: nd("osprey", [k.build()]), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
function obsidian(ctx) {
  const { latheX: lX, node: nd, cylX: cX, ringGrooves: rg, tubeX: tb } = ctx.G;
  const k = ctx.kit();
  const L = 190, R4 = 17.5;
  k.add("steelMatte", lX([[0, 0], [0, 8.4], [30, 8.4], [30, 0]], { seg: 28 }));
  k.add("steelMatte", lX([[4, 0], [4, R4 - 3], [8, R4], [L - 5, R4], [L, R4 - 4], [L, 5.6], [L - 2, 5], [L - 2, 0]], { seg: 44, crease: 30 }));
  k.add("steelMatte", rg(R4 + 0.3, 8, 28, 7, 0.5, { seg: 44 }));
  k.add("steelMatte", tb(R4 + 0.6, R4 - 0.2, L - 40, L - 36, { seg: 44 }));
  k.add("lensBlack", cX(5.2, L - 2.3, L + 0.05, { seg: 18 }));
  return { root: nd("obsidian", [k.build()]), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
function glComp(ctx) {
  const { extrudeX: exX, T: T2, box: bx, node: nd, rrect: rr, cylY: cY } = ctx.G;
  const k = ctx.kit();
  // навинчиваемый компенсатор в профиль кожуха (не закрывает мушку)
  k.add("steelMatte", exX(rr(0, -3.8, 25, 28.5, 5), 0, 34, { bevel: 1.4 }));
  for (let i = 0; i < 3; i++) k.add("lensBlack", T2(cY(3, 9, 10.7, { seg: 14 }), { p: [8 + i * 9, 0, 0] }));
  for (const s of [-1, 1]) k.add("lensBlack", T2(bx(10, 7, 1, { bevel: 0.6 }), { p: [18, 1, s * 12.6] }));
  k.add("lensBlack", ctx.G.cylX(5, 33.8, 34.2, { seg: 16 }));
  return { root: nd("comp", [k.build()]), muzzle: { x: 34, kind: "comp", flash: 0.8 } };
}
function glCap(ctx) {
  const { latheX: lX, flutesX: fl, node: nd } = ctx.G;
  const k = ctx.kit();
  k.add("steelMatte", lX([[0, 0], [0, 8.6], [14, 8.6], [16, 7.4], [16, 0]], { seg: 28 }));
  k.add("steelMatte", fl(8.6, 2, 14, 14, 1.2, 0.5));
  return { root: nd("cap", [k.build()]), muzzle: { x: 16, kind: "bare", flash: 1 } };
}
/* --------------------------------------------------------------- магазины */
function glMag(ctx, o) {
  const { T: T2, box: bx, cylX: cX } = ctx.G;
  const m = boxMag(ctx, { R: 0, d0: 34, w: 22, lipH: 10, lipX0: 4, lipX1: 26, lipRise: 2.4, lipCurl: 2, cal: "9x19", mat: "poly", plate: "poly", plateH: 7, plateOver: 7, plateW: 5, catchX: -22, catchY: -30, ...o });
  const k = ctx.kit();
  // пронумерованные контрольные отверстия на задней стенке и выступ-«язычок» пятки спереди
  for (let i = 0; i < Math.min(9, Math.floor(o.len / 20)); i++) k.add("lensBlack", T2(cX(1.2, -34.4, -33.7, { seg: 10, c: 0 }), { p: [0, -16 - i * 11, 0] }));
  for (let i = 0; i < Math.min(9, Math.floor(o.len / 20)); i++) k.add("paintWhite", T2(bx(0.3, 1.6, 1), { p: [-34.1, -16 - i * 11, 4] }));
  k.add("poly", T2(bx(4, 3.4, 20, { bevel: 1 }), { p: [4.4, -o.len - 3.6, 0] }));
  m.root.add(k.build());
  return m;
}
/* --------------------------------------------------------------- накладки и упор */
// Накладка спинки: профиль по линии спинки рукояти (lx = −43), t — толщина.
function backstrap(ctx, o) {
  const { extrudeZ: exZ, node: nd } = ctx.G;
  const k = ctx.kit(), t = o.t, Q = (lx, ly, r) => [...glGripPt(lx, ly), r];
  const prof = [Q(-41, -11, 1), Q(-43 - t * 0.5, -11.5, 2), Q(-43 - t, -22, 5), Q(-43 - t, -84, 6), Q(-43 - t * 0.6, -97, 3), Q(-41, -98, 1)];
  k.add(o.mat || "poly", exZ(prof, 27, { bevel: Math.min(3, t * 0.45), curve: 6 }));
  return { root: nd("bs", [k.build()]) };
}
function g18Stock(ctx) {
  const { extrudeZ: exZ, T: T2, wire: wr, node: nd, cylZ: cZ } = ctx.G;
  const k = ctx.kit(), Q = (lx, ly) => glGripPt(lx, ly);
  // плечевой упор Glock 18: переходник входит в паз пятки рукояти, стальная рама, пластиковый затыльник
  k.add("steelMatte", exZ([Q(-41, -72), Q(-56, -72), Q(-56, -101), Q(-41, -101)], 20, { bevel: 1.4 }));
  k.add("steelWorn", T2(cZ(2.4, -11, 11, { seg: 12 }), { p: [...Q(-50, -86), 0] }));
  const [ax, ay] = Q(-54, -75), [bx0, by0] = Q(-52, -99);
  for (const s of [-1, 1]) k.add("steelMatte", wr([[ax, ay, s * 8], [-180, -34, s * 11], [-284, 6, s * 12]], 3, { n: 40 }));
  k.add("steelMatte", wr([[bx0, by0, 0], [-190, -100, 0], [-284, -98, 0]], 3, { n: 40 }));
  k.add("poly", exZ([[-278, 16, 6], [-296, 16, 6], [-296, -112, 8], [-278, -106, 6]], 38, { bevel: 3 }));
  k.add("rubber", exZ([[-296, 16, 6], [-302, 16, 6], [-302, -114, 8], [-296, -112, 6]], 40, { bevel: 2 }));
  return { root: nd("g18stock", [k.build()]) };
}
var glock18c_default = {
  id: "glock18c",
  family: "glock",
  title: "Glock 18C",
  short: "Glock 18C",
  caliber: "9×19 Парабеллум",
  cal: "9x19",
  thread: "m13.5x1L",
  boltHold: true,
  chargeLabel: "передёрнуть кожух",
  kick: 1.05,
  hipMoa: 45,
  flashSize: 0.62,
  specs: [["Ствол", "114 мм"], ["Длина", "186 мм"], ["Темп", "1200 выстр/мин"], ["Масса", "0,62 кг"]],
  base: { weight: 620, length: 186, ergo: 72, recoilV: 100, recoilH: 85, moa: 4.5, velocity: 360, range: 50, loud: 160, flash: 55, adsTime: 170, rpm: 1200, mag: 17 },
  audio: { cal: "9x19", mech: 0.85, shot: { blastF: 8200, blastT: 0.045, bodyF: 190, body: 0.4, harsh: 0.22, level: 0.9 } },
  modes: ["semi", "auto"],
  build: glBase,
  slots: [
    { id: "slide", label: "Кожух-затвор", group: "Верх", accepts: ["g18slide"], mount: "slide", required: true },
    { id: "barrel", label: "Ствол", group: "Верх", accepts: ["g18barrel"], mount: "barrel", required: true },
    // резьба есть только у отдельного ствола: слот виден всегда, выбор глушителя сам ставит этот ствол
    { id: "muzzle", label: "Дульное устройство", group: "Верх", accepts: ["muzzle"], mount: "muzzle", via: { slot: "barrel", part: "br_thread" } },
    { id: "optic", label: "Коллиматор", group: "Верх", accepts: ["micro"], mount: "mos" },
    { id: "light", label: "Фонарь / ЛЦУ", group: "Рамка", accepts: ["plight"], rails: ["frameRail"], prefer: "front" },
    { id: "mag", label: "Магазин", group: "Рамка", accepts: ["mag"], mount: "magwell" },
    { id: "backstrap", label: "Накладка рукояти", group: "Рамка", accepts: ["g18bs"], mount: "backstrap" },
    { id: "stock", label: "Плечевой упор", group: "Рамка", accepts: ["g18stock"], mount: "stock" }
  ],
  parts: [
    { id: "sl_18c", cat: "g18slide", name: "Кожух 18C", desc: "Два компенсаторных окна над портами ствола", stats: { weight: 290 }, build: (c) => glSlide(c, { id: "18c", comp: true }) },
    { id: "sl_mos", cat: "g18slide", name: "Кожух 18C MOS", desc: "Фрезеровка под коллиматор, высокие прицельные", stats: { weight: 285 }, build: (c) => glSlide(c, { id: "mos", comp: true, mos: true }) },
    { id: "sl_night", cat: "g18slide", name: "Кожух 18, тритиевые прицельные", desc: "Без окон; Meprolight 3 точки, насечки спереди", stats: { weight: 300, flash: -10 }, build: (c) => glSlide(c, { id: "night", night: true, frontSerr: true }) },
    { id: "br_comp", cat: "g18barrel", name: "Ствол 18C с портами", desc: "Газ вверх через окна: меньше подброс", needs: (cfg) => cfg.slide?.id !== "sl_night", stats: { weight: 110, "recoilV%": -16, flash: 15, loud: 1 }, build: (c) => glBarrel(c, { comp: true }) },
    { id: "br_plain", cat: "g18barrel", name: "Ствол без портов", desc: "Штатный Glock 17: чуть выше скорость пули", stats: { weight: 115, velocity: 8 }, build: (c) => glBarrel(c, {}) },
    { id: "br_thread", cat: "g18barrel", name: "Ствол с резьбой M13,5×1 лев.", desc: "Выступает на 14 мм — под глушитель и компенсатор", stats: { weight: 130, length: 14, velocity: 10 }, build: (c) => glBarrel(c, { threaded: true }) },
    { id: "g_cap", cat: "muzzle", name: "Колпачок резьбы", desc: "Защищает резьбу", fit: { thread: ["m13.5x1L"] }, stats: { weight: 10, length: 2 }, build: glCap },
    { id: "g_comp", cat: "muzzle", name: "Навинчиваемый компенсатор", desc: "Три порта вверх: очередь заметно ровнее", fit: { thread: ["m13.5x1L"] }, stats: { weight: 55, length: 34, "recoilV%": -24, "recoilH%": -10, flash: 20, loud: 3 }, build: glComp },
    { id: "osprey9", cat: "muzzle", name: "SilencerCo Osprey 9", desc: "Эксцентричный: штатные прицельные не перекрыты", fit: { thread: ["m13.5x1L"] }, stats: { weight: 300, length: 170, loud: -26, flash: -50, "recoilV%": -10, ergo: -8, adsTime: 20 }, build: osprey },
    { id: "obsidian9", cat: "muzzle", name: "Rugged Obsidian 9", desc: "Разборный, с «толкателем» Ноилсона", fit: { thread: ["m13.5x1L"] }, stats: { weight: 320, length: 190, loud: -28, flash: -50, "recoilV%": -9, ergo: -9, adsTime: 22 }, build: obsidian },
    { id: "gm17", cat: "mag", name: "Магазин 17", desc: "Штатный, полимер со стальным вкладышем", stats: { weight: 80, mag: 17 }, build: (c) => glMag(c, { len: 104, cap: 17 }) },
    { id: "gm19", cat: "mag", name: "Магазин 19 (пятка +2)", desc: "Штатный 17 с удлинённой пяткой", stats: { weight: 90, mag: 19, ergo: 0 }, build: (c) => glMag(c, { len: 116, cap: 19 }) },
    { id: "gm33", cat: "mag", name: "Магазин 33", desc: "Длинный штатный Glock: для автоматического огня", stats: { weight: 150, mag: 33, ergo: -4, adsTime: 10 }, build: (c) => glMag(c, { len: 196, cap: 33 }) },
    { id: "gdrum50", cat: "mag", name: "Барабан KCI 50", desc: "Тяжёлый: пистолет тянет вниз", stats: { weight: 520, mag: 50, ergo: -14, adsTime: 34, "recoilV%": -10 }, build: (c) => drumMag(c, { R: 0, len: 104, neck: 58, d0: 34, w: 22, lipH: 10, lipX0: 4, lipX1: 26, cal: "9x19", mat: "poly", cap: 50, drum: [-18, -86, 46, 46] }) },
    { id: "bs_m", cat: "g18bs", name: "Накладка M", desc: "Спинка рукояти +2 мм", stats: { weight: 6, ergo: 2 }, build: (c) => backstrap(c, { t: 2.4 }) },
    { id: "bs_l", cat: "g18bs", name: "Накладка L с «хвостом»", desc: "+4 мм, для большой ладони", stats: { weight: 10, ergo: 1, "recoilH%": -3 }, build: (c) => backstrap(c, { t: 4.6 }) },
    { id: "st_g18", cat: "g18stock", name: "Упор Glock 18 (рамочный)", desc: "Три точки опоры — очередь можно удержать", stats: { weight: 380, ergo: -6, "recoilV%": -38, "recoilH%": -40, adsTime: 60, moa: -1 }, build: g18Stock }
  ],
  defaults: {
    slide: "sl_18c",
    barrel: "br_comp",
    muzzle: null,
    optic: null,
    light: null,
    mag: "gm17",
    backstrap: null,
    stock: null
  }
};

DEFS[glock18c_default.id] = glock18c_default; FAMILY[glock18c_default.id] = "A";
})();
/* ==== AEGIS API ==== */
/* Поколения запуска оружейной: таймеры, кадры и слушатели старого образца после смены
   оружия молча отключаются (их колбэки не вызываются, слушатели снимаются). */
const ARM_SHARED = { S: null, mats: null, app: null };
const ARM_GEN = { n: 0, cur: 0, live: 0, recs: [], intervals: [], raw: null };
function armPatch() {
  if (ARM_GEN.raw) return;
  const W = window, ET = EventTarget.prototype;
  const raw = ARM_GEN.raw = {
    raf: W.requestAnimationFrame, setTimeout: W.setTimeout, setInterval: W.setInterval, clearInterval: W.clearInterval,
    ric: W.requestIdleCallback, add: ET.addEventListener, remove: ET.removeEventListener
  };
  const wrap = (fn) => {
    const g = ARM_GEN.cur;
    if (!g || typeof fn !== "function") return fn;
    return function () { if (ARM_GEN.live !== g) return; return fn.apply(this, arguments); };
  };
  W.requestAnimationFrame = function (fn) { return raw.raf.call(W, wrap(fn)); };
  W.setTimeout = function (fn, ...a) { return raw.setTimeout.call(W, wrap(fn), ...a); };
  W.setInterval = function (fn, ...a) {
    const id = raw.setInterval.call(W, wrap(fn), ...a);
    if (ARM_GEN.cur) ARM_GEN.intervals.push(id);
    return id;
  };
  if (raw.ric) W.requestIdleCallback = function (fn, o) { return raw.ric.call(W, wrap(fn), o); };
  ET.addEventListener = function (type, fn, o) {
    if (ARM_GEN.cur && fn && !(this && this.__armKeep)) ARM_GEN.recs.push([this, type, fn, o]);
    return raw.add.call(this, type, fn, o);
  };
}
const WEAPON_ORDER = ['ak74', 'akm', 'm416', 'scar', 'svd', 'm870', 'mp5a3', 'glock18c'];
window.AEGIS_WK = {
  DEFS, FAMILY, LIB, WEAPON_ORDER,
  Assembler, makeCtx, createMaterials, toRoot,
  AUDIO_FAMILY,
  /* для полигона: сетки прицелов (SVG поверх кадра) и внешняя баллистика */
  RETICLES, reticleSet, reticleSVG, colorHex, RET_DEFAULT_COLOR,
  /* v9: текстура марки для коллиматора в самой линзе (полигон) */
  reticleTexture,
  /* v9: эффекты выстрела оружейной для полигона */
  ShotFX, FLASH,
  BULLETS, SHELLS, bulletSpec, dragK, AIR, zeroSolution, holdovers, trajectory2D,
  /* оружейная: запуск движка для одного образца */
  bootArmory(id) {
    const def = DEFS[id];
    if (!def) throw new Error('Нет оружия ' + id);
    armPatch();
    if (!ARM_SHARED.S) {
      ARM_GEN.cur = 0;
      ARM_SHARED.S = createScene(document.getElementById("app"));
    }
    window.__WK_CUR = id;
    GunAudio = AUDIO_FAMILY[FAMILY[id]].GunAudio;
    const g = ++ARM_GEN.n;
    ARM_GEN.cur = ARM_GEN.live = g;
    return boot(def, LIB).then((app) => { ARM_SHARED.app = app; return app; });
  },
  /* смена образца без перезагрузки страницы */
  async switchArmory(id) {
    const def = DEFS[id];
    if (!def) throw new Error('Нет оружия ' + id);
    const old = ARM_SHARED.app;
    ARM_SHARED.app = null;
    ARM_GEN.live = -1;
    for (const iv of ARM_GEN.intervals) ARM_GEN.raw.clearInterval.call(window, iv);
    ARM_GEN.intervals = [];
    for (const [t, type, fn, o] of ARM_GEN.recs.splice(0)) { try { ARM_GEN.raw.remove.call(t, type, fn, o); } catch (e) { /* */ } }
    let later = null;
    if (old && old.dispose) later = old.dispose();
    const app = await this.bootArmory(id);
    if (later) ARM_GEN.raw.setTimeout.call(window, later, 1500);
    return app;
  },
  get armoryApp() { return ARM_SHARED.app; }
};

})();