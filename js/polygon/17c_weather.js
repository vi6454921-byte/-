/* AEGIS v6 — дождь: струи вокруг камеры (целиком на GPU), всплески на
   земле и капли с крон, намокание материалов, рост луж.
   Струи — инстансы узких квадов в кубе 36 × 18 × 36 м, «привязанном» к
   камере по модулю (как в Assassin's Creed / The Last of Us: дождь — это
   короб частиц вокруг игрока, а не по всей карте). Позиция считается в
   шейдере от времени, CPU каждый кадр трогает только одну uniform. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  function create(THREE, o) {
    const scene = o.scene, camera = o.camera, world = o.world;
    const W = { k: 0, target: 0, wet: 0, count: 0 };
    const MAXN = 9000;
    const box = new THREE.Vector3(36, 18, 36);
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
    const seed = new Float32Array(MAXN * 4);
    for (let i = 0; i < MAXN; i++) { seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random(); }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = 0;
    const uni = {
      uT: { value: 0 }, uBox: { value: box }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(0.8, 0.5) },
      uK: { value: 0 }, uCol: { value: new THREE.Color(0.55, 0.58, 0.6) }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: uni, transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec4 aSeed;
        uniform float uT; uniform vec3 uBox, uCam; uniform vec2 uWind;
        varying vec2 vUv; varying float vA;
        void main() {
          float sp = 7.0 + aSeed.w * 2.5;                       // м/с — крупная капля
          vec3 p = aSeed.xyz * uBox;
          p.y -= uT * sp;
          p.xz += uWind * uT * 0.9;
          vec3 base = uCam - uBox * 0.5;
          p = base + mod(p - base, uBox);                         // короб «едет» с камерой
          vec3 vel = normalize(vec3(uWind.x * 0.9, -sp, uWind.y * 0.9));
          /* узкий квад вдоль скорости, развёрнутый к камере */
          vec3 toC = normalize(cameraPosition - p);
          vec3 side = normalize(cross(vel, toC));
          float len = 0.42 + aSeed.w * 0.25, wid = 0.0045 + 0.0035 * aSeed.z;
          vec3 wp = p + side * position.x * wid + vel * position.y * len;
          vUv = uv;
          float d = length(cameraPosition - p);
          vA = smoothstep(0.4, 1.5, d) * (1.0 - smoothstep(10.0, 18.0, d));
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        uniform float uK; uniform vec3 uCol;
        varying vec2 vUv; varying float vA;
        void main() {
          float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          a *= vA * 0.33 * uK;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uCol, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'rain'; mesh.userData.noAO = true;
    mesh.visible = false;
    scene.add(mesh);
    let quality = 'high';
    W.setQuality = (q) => { quality = q; };

    /* намокание: шероховатость ниже, цвет темнее (кора, хвоя, ткань) */
    let mats = null;
    function collect() {
      mats = [];
      const seen = new Set();
      scene.traverse((m) => {
        const L = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
        for (const x of L) {
          if (!x || seen.has(x) || !x.isMeshStandardMaterial || x.transparent || m === world.ground) continue;
          seen.add(x);
          x.userData._r0 = x.roughness; x.userData._c0 = x.color.clone();
          mats.push(x);
        }
      });
    }
    let wetT = 0, lastWet = -1;
    function applyWet(w) {
      if (!mats) collect();
      for (const x of mats) {
        x.roughness = x.userData._r0 * (1 - 0.42 * w);
        x.color.copy(x.userData._c0).multiplyScalar(1 - 0.2 * w);
      }
    }
    const trees = (world.trees || []);
    /* Ангар целиком под крышей: струи, лужи и капли с крон там не рисуем
       (дождь остаётся звуком по жести и цветокоррекцией пресета) */
    const indoor = !!(world && (world.indoor || world.mapId === 'angar_map'));
    W.indoor = indoor;
    W.set = (k) => { W.target = indoor ? 0 : Math.max(0, Math.min(1, k)); };
    W.update = (dt, t, scars) => {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.1);
      W.k += (W.target - W.k) * Math.min(1, dt * 0.5);
      /* земля мокнет медленнее, чем начинается дождь, и сохнет ещё медленнее */
      W.wet += ((W.target > 0.05 ? 1 : 0) - W.wet) * dt * (W.target > W.wet ? 0.018 : 0.006);
      const n = Math.round(W.k * MAXN * (quality === 'low' || quality === 'ultra' ? (quality === 'ultra' ? 0.18 : 0.3) : quality === 'medium' ? 0.55 : 1));
      g.instanceCount = n; W.count = n;
      mesh.visible = n > 0;
      uni.uK.value = W.k; uni.uT.value = t % 600; uni.uCam.value.copy(camera.position);
      if (world.groundUniforms) world.groundUniforms.uRain.value = Math.min(1, W.wet * 1.1);
      if (world.waterUniforms) world.waterUniforms.uRainW.value = W.k;
      wetT -= dt;
      if (wetT <= 0) { wetT = 0.5; if (Math.abs(W.wet - lastWet) > 0.01) { lastWet = W.wet; applyWet(W.wet); } }
      if (scars) {
        scars.rain = W.wet;
        /* всплески на земле в 6 м и капли с веток ближайших деревьев */
        const cx = camera.position.x, cz = camera.position.z;
        let ns = W.k * 60 * dt; while (ns > 0) { if (Math.random() < ns) {
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 6;
          scars.raindrop(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
        } ns -= 1; }
        let nd = W.wet * 10 * dt;
        while (nd > 0) { if (Math.random() < nd && trees.length) {
          const tq = trees[(Math.random() * trees.length) | 0];
          if (Math.hypot(tq.x - cx, tq.z - cz) < 14) scars.drip(tq);
        } nd -= 1; }
      }
    };
    return W;
  }
  /* Случайная погода боя. Как в Battlefield / Squad / DayZ: пресет выбирается
     при входе на карту взвешенным жребием, а не хранится в настройках
     игрока (сохранённый выбор действует только на полигоне). Для тестов:
     ?weather=rain или window.__FORCE_WEATHER. */
  /* только ясная погода в разное время суток; старые ключи ведут в ясный день */
  const NAMES = { morning: 'Ясное утро', day: 'Солнечный день' };   /* v21: ночи нет */
  const ALIAS = { clear: 'day', sunny: 'day', overcast: 'day', rain: 'day', storm: 'day', fog: 'day', gloom: 'day', dusk: 'morning', night: 'day' };
  const W_OPEN = { morning: 40, day: 60 };
  const W_HANGAR = { morning: 40, day: 60 };
  function forcedWeather() {
    let k = null;
    try { k = (typeof window !== 'undefined' && window.__FORCE_WEATHER) || new URLSearchParams(location.search).get('weather'); } catch (e) { /* */ }
    k = k && (ALIAS[k] || k);
    return k && NAMES[k] ? k : null;
  }
  function pickBattle(mapId, rnd) {
    const f = forcedWeather();
    if (f) return f;
    const tab = mapId === 'angar_map' ? W_HANGAR : W_OPEN;
    let r = (rnd || Math.random)() * Object.values(tab).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(tab)) { r -= tab[k]; if (r < 0) return k; }
    return 'day';
  }
  root.GWeather = { create, pickBattle, forcedWeather, NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
