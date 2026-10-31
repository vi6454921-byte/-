/* AEGIS v22 · эффекты и звук стационарного M2HB — перенесены из оригинальной карты
   forest_map_camp.html (mgShot / mgSmoke / mgAfterSmoke / ejectCase / mgShotBuffer / mgSound):
     • дым выстрела: быстрый конус газа вперёд, кольцо поперёк ствола, вспышка светящегося газа
       на кадр и медленный остаток, который висит перед стволом, поднимается и уходит по ветру;
     • дульная волна поднимает пыль с земли перед стволом; из окна выброса тянет дымком;
     • гильзы 12,7×99 летят вбок-вниз, дважды подпрыгивают со звоном и остаются лежать;
     • горячий ствол после очереди курится из дула и вдоль кожуха, пока не остынет;
     • звук — синтез, как в оригинале: N-волна (щелчок), низкий «бум» дульной волны с падающей
       частотой, тело и «лай» средних частот, отражения от кромки леса, хвост, лязг затвора и
       звено ленты (резонаторы). 4 варианта, на выстрел — один BufferSource; вдали теряются
       верха и щелчок (ФНЧ от расстояния), задержка — по скорости звука.
   Вызывается из js/polygon/31_mg.js (fire / update). */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const sr = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const S = { T: null, scene: null, alpha: null, add: null, cas: null, snd: null, wind: null, light: 1 };

  /* -------------------------------------------------- частицы (Points) --- */
  function smokeTex(T) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    /* клочья: дым не идеальный круг */
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 22; i++) { g.fillStyle = 'rgba(0,0,0,' + sr(0.05, 0.22) + ')'; g.beginPath(); g.arc(sr(6, 58), sr(6, 58), sr(3, 9), 0, TAU); g.fill(); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace || t.colorSpace; return t;
  }
  function pool(T, scene, n, additive, tex) {
    const g = new T.BufferGeometry();
    const P = new Float32Array(n * 3), Z = new Float32Array(n), A = new Float32Array(n), Cc = new Float32Array(n * 3);
    g.setAttribute('position', new T.BufferAttribute(P, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aSize', new T.BufferAttribute(Z, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aAlpha', new T.BufferAttribute(A, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aCol', new T.BufferAttribute(Cc, 3).setUsage(T.DynamicDrawUsage));
    const U = { uTex: { value: tex }, uScale: { value: 600 }, uLight: { value: 1 } };
    const m = new T.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aCol; uniform float uScale; varying float vA; varying vec3 vC;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aAlpha > 0.0 ? clamp(aSize * uScale / max(0.05, -mv.z), 0.0, 512.0) : 0.0; vA = aAlpha; vC = aCol; }`,
      fragmentShader: `uniform sampler2D uTex; uniform float uLight; varying float vA; varying vec3 vC;
        void main() { vec4 t = texture2D(uTex, gl_PointCoord); float a = t.a * vA; if (a < 0.002) discard;
          gl_FragColor = vec4(vC * ${additive ? '1.0' : 'uLight'}, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const pts = new T.Points(g, m); pts.frustumCulled = false; pts.renderOrder = additive ? 9 : 7; pts.userData.noAO = true;
    scene.add(pts);
    const list = []; for (let i = 0; i < n; i++) list.push({ on: false, t: 0 });
    return { pts, g, P, Z, A, Cc, U, list, i: 0, n };
  }
  function spawn(pl, o) {
    const q = pl.list[pl.i = (pl.i + 1) % pl.n];
    q.on = true; q.t = 0; q.x = o.x; q.y = o.y; q.z = o.z; q.vx = o.vx || 0; q.vy = o.vy || 0; q.vz = o.vz || 0;
    q.s0 = o.size; q.grow = o.grow || 0; q.life = o.life; q.c = o.col; q.c2 = o.col2 || o.col; q.a = o.a; q.drag = o.drag || 0;
    q.wk = o.windK || 0; q.fi = o.fadeIn || 0; q.g = o.g || 0;
  }
  function stepPool(pl, dt, wind) {
    const { P, Z, A, Cc } = pl;
    for (let i = 0; i < pl.n; i++) {
      const q = pl.list[i];
      if (!q.on) { if (A[i] !== 0) A[i] = 0; continue; }
      q.t += dt;
      if (q.t >= q.life) { q.on = false; A[i] = 0; continue; }
      const k = Math.exp(-q.drag * dt);
      q.vx = q.vx * k + wind.x * q.wk * (1 - k) * 0.5; q.vz = q.vz * k + wind.z * q.wk * (1 - k) * 0.5; q.vy = q.vy * k + q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const u = q.t / q.life;
      P[i * 3] = q.x; P[i * 3 + 1] = q.y; P[i * 3 + 2] = q.z;
      Z[i] = q.s0 * (1 + q.grow * q.t * 2.2);
      A[i] = q.a * (q.fi > 0 ? Math.min(1, q.t / q.fi) : 1) * (1 - u) * (1 - u * 0.4);
      Cc[i * 3] = q.c[0] + (q.c2[0] - q.c[0]) * u; Cc[i * 3 + 1] = q.c[1] + (q.c2[1] - q.c[1]) * u; Cc[i * 3 + 2] = q.c[2] + (q.c2[2] - q.c[2]) * u;
    }
    pl.g.attributes.position.needsUpdate = pl.g.attributes.aSize.needsUpdate = pl.g.attributes.aAlpha.needsUpdate = pl.g.attributes.aCol.needsUpdate = true;
  }

  /* ---------------------------------------------- гильзы 12,7×99 --- */
  function casings(T, scene) {
    const geo = new T.CylinderGeometry(0.0102, 0.0108, 0.099, 8).rotateZ(Math.PI / 2);
    const mat = new T.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.85, roughness: 0.32 });
    const max = 140, im = new T.InstancedMesh(geo, mat, max);
    im.count = 0; im.frustumCulled = false; im.castShadow = false; im.name = 'mg_casings';
    scene.add(im);
    return { im, max, list: [], n: 0, m: new T.Matrix4(), q: new T.Quaternion(), e: new T.Euler(), one: new T.Vector3(1, 1, 1), p: new T.Vector3() };
  }

  function init(ctx) {
    const T = ctx.THREE, scene = ctx.C && ctx.C.scene;
    if (S.T === T || !T || !scene) return !!S.alpha;
    S.T = T; S.scene = scene;
    const tex = smokeTex(T);
    S.alpha = pool(T, scene, 700, false, tex);
    S.add = pool(T, scene, 80, true, tex);
    S.cas = casings(T, scene);
    S.v1 = new T.Vector3(); S.v2 = new T.Vector3(); S.v3 = new T.Vector3(); S.q = new T.Quaternion();
    return true;
  }

  /* ------------------------------------------------------------ звук --- */
  function synth(ac, dur, fn) {
    const sr2 = ac.sampleRate, n2 = Math.round(sr2 * dur), buf = ac.createBuffer(2, n2, sr2);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    fn(L, R, sr2, n2);
    let pk = 1e-6;
    for (let i = 0; i < n2; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const k = 0.95 / pk;
    for (let i = 0; i < n2; i++) { L[i] *= k; R[i] *= k; }
    return buf;
  }
  function reso(out, sr2, t0, f, decay, amp, n2) {
    const w = TAU * f / sr2, r = Math.exp(-1 / (decay * sr2)), c1 = 2 * r * Math.cos(w), c2 = -r * r;
    let y1 = 0, y2 = 0;
    const i0 = Math.round(t0 * sr2), i1 = Math.min(n2, i0 + Math.round(decay * 7 * sr2));
    for (let i = i0; i < i1; i++) {
      const x = i - i0 < 24 ? (Math.random() * 2 - 1) * amp : 0;
      const y = c1 * y1 + c2 * y2 + x;
      y2 = y1; y1 = y;
      out[i] += y * (1 - r) * 2;
    }
  }
  function shotBuffer(ac, seed) {
    return synth(ac, 1.9, (L, R, sr2, n2) => {
      let lp1 = 0, lp2 = 0, lp3 = 0, hp = 0, prev = 0, bp1 = 0, bp2 = 0, tl = 0, tl2 = 0;
      const f0 = 88 + seed * 14, echo1 = 0.13 + seed * 0.05, echo2 = 0.29 + seed * 0.07;
      for (let i = 0; i < n2; i++) {
        const t = i / sr2, w = Math.random() * 2 - 1;
        hp = 0.96 * (hp + w - prev); prev = w;
        const crack = hp * Math.exp(-t / 9e-4) * 1.4;
        const f = f0 * (0.55 + 0.45 * Math.exp(-t / 0.03));
        const thump = Math.sin(TAU * f * t + Math.sin(t * 40) * 0.2) * Math.exp(-t / 0.075) * (1 - Math.exp(-t / 6e-4)) * 1.5;
        lp1 += (w - lp1) * 0.06; lp2 += (lp1 - lp2) * 0.06;
        const body = lp2 * 9 * Math.exp(-t / 0.055) * (1 - Math.exp(-t / 5e-4));
        bp1 += (w - bp1) * 0.18; bp2 += (bp1 - bp2) * 0.18;
        const bark = (bp1 - bp2) * 3.2 * Math.exp(-t / 0.022);
        lp3 += (w - lp3) * 0.03;
        const e1 = t > echo1 ? lp3 * 5 * Math.exp(-(t - echo1) / 0.09) * 0.55 : 0;
        const e2 = t > echo2 ? lp3 * 5 * Math.exp(-(t - echo2) / 0.14) * 0.3 : 0;
        tl += (w - tl) * 0.012; tl2 += (tl - tl2) * 0.02;
        const tail = tl2 * 40 * Math.exp(-t / 0.55) * Math.min(1, t / 0.03) * 0.3;
        const s = crack + thump + body + bark + tail;
        L[i] = Math.tanh((s + e1 * 0.9 + e2 * 1.1) * 1.2);
        R[i] = Math.tanh((s + e1 * 1.1 + e2 * 0.9) * 1.2);
      }
      for (const ch of [L, R]) {
        reso(ch, sr2, 0.032 + seed * 0.004, 2350 + seed * 200, 0.012, 0.35, n2);
        reso(ch, sr2, 0.058, 1280 + seed * 90, 0.02, 0.22, n2);
        reso(ch, sr2, 0.07, 4100, 0.008, 0.12, n2);
      }
    });
  }
  function tinkBuffer(ac) {
    return synth(ac, 0.25, (L, R, sr2, n2) => { reso(L, sr2, 0, 4200 + Math.random() * 800, 0.03, 0.6, n2); reso(L, sr2, 0.001, 6900, 0.02, 0.4, n2); R.set(L); });
  }
  function soundInit(audio) {
    if (S.snd) return S.snd;
    const ac = audio && audio.ctx;
    if (!ac) return null;
    try {
      S.snd = { ac, bufs: [0, 0.33, 0.66, 1].map((s) => shotBuffer(ac, s)), tink: tinkBuffer(ac) };
    } catch (e) { console.warn('mg sound', e && e.message); S.snd = null; }
    return S.snd;
  }
  function playBuf(audio, buf, dist, vol, o) {
    const ac = audio.ctx, out = (o && o.own ? audio.gunBus : audio.dry) || audio.master;
    if (!ac || !out || !buf || audio.on === false) return;
    const t = ac.currentTime + (o && o.own ? 0 : dist / 343);
    const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = (o && o.rate) || 1;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = (o && o.lp) || 2e4;
    const g = ac.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g);
    if (ac.createStereoPanner && o && o.x) { const p = ac.createStereoPanner(); p.pan.value = clamp(o.x, -1, 1); g.connect(p); p.connect(out); }
    else g.connect(out);
    /* немного в ревербератор карты: выстрел крупного калибра «раскатывается» по лесу */
    if (audio.conv && o && o.wet) { const w = ac.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(audio.conv); }
    src.start(t);
  }
  function shotSound(ctx, from, own) {
    const audio = ctx.C && ctx.C.audio;
    if (!audio || !soundInit(audio)) return;
    const cam = ctx.camera, dist = cam ? cam.position.distanceTo(from) : 0;
    const buf = S.snd.bufs[Math.random() * 4 | 0];
    const lp = own ? 18e3 : clamp(16e3 / (1 + dist / 40), 700, 16e3);
    const deaf = audio.deafK || 0;
    playBuf(audio, buf, own ? 0 : dist, (own ? 0.95 : clamp(3 / (1 + dist / 12), 0.03, 0.9)) * (1 - deaf), { own, rate: sr(0.96, 1.04), lp, x: own ? sr(-0.05, 0.05) : 0, wet: own ? 0.18 : 0.3 });
  }
  function tink(ctx, p) {
    const audio = ctx.C && ctx.C.audio;
    if (!audio || !S.snd || !ctx.camera) return;
    const d = ctx.camera.position.distanceTo(p);
    if (d > 25) return;
    playBuf(audio, S.snd.tink, d, clamp(0.25 / (1 + d / 3), 0.01, 0.2), { rate: sr(0.85, 1.2) });
  }

  /* ------------------------------------------------------- выстрел --- */
  /* N — гнездо (gunG: x — вперёд по стволу), p — дульный срез, d — направление пули */
  function shot(N, ctx, p, d, own) {
    if (!init(ctx)) return;
    const T = S.T, A = S.alpha, G = S.add;
    N.lastFire = performance.now() / 1000;
    N.shots = (N.shots || 0) + 1;
    /* дым выстрела: конус газа вперёд */
    for (let i = 0; i < 3; i++) {
      const sp = sr(3, 9);
      spawn(A, { x: p.x, y: p.y, z: p.z, vx: d.x * sp + sr(-0.4, 0.4), vy: d.y * sp + sr(-0.2, 0.4), vz: d.z * sp + sr(-0.4, 0.4), size: sr(0.1, 0.2), grow: sr(1.6, 2.4), life: sr(0.4, 0.9), col: [0.8, 0.77, 0.72], col2: [0.7, 0.7, 0.7], a: 0.3, drag: 5.5, windK: 0.6, fadeIn: 0.03 });
    }
    /* кольцо поперёк ствола */
    const v1 = S.v1.set(0, 1, 0).cross(d);
    if (v1.lengthSq() < 1e-4) v1.set(1, 0, 0);
    v1.normalize();
    const v2 = S.v2.crossVectors(d, v1);
    const a0 = Math.random() * TAU;
    for (let i = 0; i < 4; i++) {
      const a = a0 + i / 4 * TAU, c = Math.cos(a), s = Math.sin(a), sp = sr(1.2, 2.4);
      spawn(A, { x: p.x + d.x * 0.06, y: p.y + d.y * 0.06, z: p.z + d.z * 0.06, vx: (v1.x * c + v2.x * s) * sp + d.x * 0.8, vy: (v1.y * c + v2.y * s) * sp + d.y * 0.8, vz: (v1.z * c + v2.z * s) * sp + d.z * 0.8, size: sr(0.07, 0.12), grow: 1.4, life: sr(0.35, 0.7), col: [0.72, 0.7, 0.67], a: 0.2, drag: 6, windK: 0.5, fadeIn: 0.03 });
    }
    /* светящийся газ на кадр */
    spawn(G, { x: p.x + d.x * 0.12, y: p.y + d.y * 0.12, z: p.z + d.z * 0.12, vx: d.x * 3, vy: d.y * 3, vz: d.z * 3, size: sr(0.16, 0.26), grow: 1.6, life: 0.07, col: [2.4, 1.4, 0.55], a: 0.8, drag: 4 });
    /* медленный остаток перед стволом */
    const k = sr(0.3, 1.1);
    spawn(A, { x: p.x + d.x * k, y: p.y + d.y * k, z: p.z + d.z * k, vx: d.x * 0.4 + sr(-0.1, 0.1), vy: sr(0.12, 0.35), vz: d.z * 0.4 + sr(-0.1, 0.1), size: sr(0.22, 0.4), grow: 0.9, life: sr(2.2, 4), col: [0.68, 0.67, 0.66], a: 0.15, drag: 1.2, windK: 1.3, fadeIn: 0.15 });
    /* дульная волна поднимает пыль с земли перед стволом */
    const W = ctx.world, gy = W && W.heightAt ? W.heightAt(p.x + d.x, p.z + d.z) : -99;
    if (p.y - gy < 1.3 && Math.random() < 0.6) for (let i = 0; i < 2; i++) spawn(A, { x: p.x + d.x * 1.2, y: gy + 0.1, z: p.z + d.z * 1.2, vx: d.x * 2 + sr(-1, 1), vy: sr(0.2, 0.6), vz: d.z * 2 + sr(-1, 1), size: sr(0.3, 0.6), grow: 1.2, life: sr(1, 2), col: [0.5, 0.45, 0.37], a: 0.25, drag: 2, windK: 0.8 });
    /* гильза и дымок из окна выброса */
    if (N.gunG) {
      const e = N.gunG.localToWorld(S.v3.set(-0.11, 0.05, 0));
      eject(e, N);
      spawn(A, { x: e.x, y: e.y + 0.05, z: e.z, vx: sr(-0.15, 0.15), vy: sr(0.25, 0.5), vz: sr(-0.15, 0.15), size: 0.05, grow: 0.45, life: sr(0.8, 1.4), col: [0.62, 0.62, 0.62], a: 0.13, drag: 2, windK: 0.8, fadeIn: 0.05 });
    }
    /* вспышка: звезда поперёк ствола со случайным поворотом и размером */
    if (N.flash) { N.flash.visible = true; N.flash.rotation.x = Math.random() * TAU; N.flash.scale.setScalar(sr(0.75, 1.25)); N.flashT = 0.035; }
    /* свет вспышки — общий источник эффектов (новый свет пересобрал бы шейдеры) */
    const fx = ctx.C && ctx.C.fx;
    if (fx && fx.flashRig && fx.muzzleFlash) { fx.flashRig.position.copy(p); fx.flashRig.updateMatrixWorld(); fx.muzzleFlash(1.4, 'bare', true); }
    shotSound(ctx, p, own);
  }
  function eject(p, N) {
    const C = S.cas, T = S.T;
    const side = new T.Vector3(0, 0, 1).applyQuaternion(N.gunG.getWorldQuaternion(S.q));
    const c = { p: p.clone(), v: side.multiplyScalar(-sr(0.3, 0.8)).add(new T.Vector3(sr(-0.4, 0.4), -sr(0.5, 1.2), sr(-0.4, 0.4))), r: new T.Euler(Math.random() * 3, Math.random() * 3, 0), w: sr(8, 20), rest: false, i: C.n % C.max, bounce: 0 };
    C.n++;
    const old = C.list.findIndex((q) => q.i === c.i);
    if (old >= 0) C.list.splice(old, 1);
    C.list.push(c);
    C.im.count = Math.min(C.max, C.n);
  }
  function stepCasings(dt, ctx) {
    const C = S.cas;
    if (!C || !C.list.length) return;
    const ph = root.GPhysics && ctx.world ? root.GPhysics.get(ctx.world) : null;
    let any = false;
    for (const c of C.list) {
      if (c.rest) continue;
      any = true;
      c.v.y -= 9.8 * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.w * dt; c.r.y += c.w * 0.4 * dt;
      let fl = ctx.world && ctx.world.heightAt ? ctx.world.heightAt(c.p.x, c.p.z) : 0;
      if (ph && ph.support) { try { const h = ph.support(c.p.x, c.p.z, c.p.y + 0.1, 0.4); if (h && h.y > fl) fl = h.y; } catch (e) { /* */ } }
      fl += 0.008;
      if (c.p.y < fl) {
        c.p.y = fl;
        if (c.bounce < 2 && Math.abs(c.v.y) > 0.6) {
          c.v.y = -c.v.y * 0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.bounce++;
          if (c.bounce === 1) tink(ctx, c.p);
        } else { c.rest = true; c.r.x = Math.PI / 2 * (Math.random() < 0.5 ? 0 : 2); c.r.z = 0; }
      }
      C.q.setFromEuler(c.r);
      C.m.compose(c.p, C.q, C.one);
      C.im.setMatrixAt(c.i, C.m);
    }
    if (any) C.im.instanceMatrix.needsUpdate = true;
  }
  /* горячий ствол после очереди: струйка из дула и дымок вдоль кожуха, пока не остынет */
  function afterSmoke(N, dt, d2) {
    if (!N.gunG || (N.heat || 0) < 0.12 || d2 > 80 * 80) return;
    const idle = performance.now() / 1000 - (N.lastFire ?? -9);
    if (idle > 0.25 && Math.random() < dt * 10 * Math.min(1, N.heat * 2)) {
      const v = N.gunG.localToWorld(S.v3.set(1.32, 0.155, 0));
      spawn(S.alpha, { x: v.x, y: v.y, z: v.z, vx: sr(-0.03, 0.03), vy: sr(0.25, 0.5), vz: sr(-0.03, 0.03), size: 0.035, grow: 0.28, life: sr(1.6, 2.6), col: [0.62, 0.62, 0.63], a: 0.22 * Math.min(1, N.heat * 1.6), windK: 1.1, drag: 0.8, fadeIn: 0.1 });
    }
    if (Math.random() < dt * N.heat * 9) {
      const v = N.gunG.localToWorld(S.v3.set(sr(0.25, 1.05), 0.17, sr(-0.02, 0.02)));
      spawn(S.alpha, { x: v.x, y: v.y, z: v.z, vx: 0, vy: sr(0.2, 0.45), vz: 0, size: 0.06, grow: 0.35, life: 1.6, col: [0.55, 0.55, 0.56], a: 0.16 * N.heat, windK: 1, drag: 0.6, fadeIn: 0.1 });
    }
  }
  function update(dt, ctx, nests) {
    if (!S.alpha) return;
    const cam = ctx.camera, R = ctx.C && ctx.C.renderer;
    const h = R ? R.domElement.height : 800, fov = cam ? cam.fov : 70;
    const sc = h / (2 * Math.tan(fov * Math.PI / 360));
    S.alpha.U.uScale.value = S.add.U.uScale.value = sc;
    const sun = ctx.C && ctx.C.sun ? ctx.C.sun.intensity : 2;
    S.alpha.U.uLight.value = clamp(0.25 + sun / 2.6, 0.25, 1.25);
    const W = root.AEGIS_WIND && cam ? root.AEGIS_WIND(cam.position.x, cam.position.y, cam.position.z) : { x: 0.6, y: 0, z: 0.4 };
    const wind = { x: W.x * 0.35, z: W.z * 0.35 };
    if (nests && cam) for (const N of nests) {
      if (N.dead) continue;
      N.heat = Math.max(0, (N.heat || 0) - dt * 0.03);   /* остывает за ~30 с */
      const d2 = (N.gx - cam.position.x) ** 2 + (N.gz - cam.position.z) ** 2;
      afterSmoke(N, dt, d2);
    }
    stepPool(S.alpha, dt, wind);
    stepPool(S.add, dt, wind);
    stepCasings(dt, ctx);
  }
  root.GMGFX = { shot, update, init, soundInit: (audio) => !!soundInit(audio), state: () => ({ casings: S.cas ? S.cas.n : 0, smoke: S.alpha ? S.alpha.list.filter((q) => q.on).length : 0, sound: !!S.snd }) };
})(typeof self !== 'undefined' ? self : this);
