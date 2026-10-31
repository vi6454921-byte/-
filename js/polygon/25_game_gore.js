
/* ==========================================================================
   МОДУЛЬ: game/gore.js
   ========================================================================== */
/* ============================================================================
   Расчленение и фрагменты тканей.

   Отрыв конечности: на теле кусок за линией разреза отбрасывается во
   фрагментном шейдере (координаты покоя — разрез живёт на ткани при любой
   позе и в рэгдолле; для теней — свой материал глубины с тем же разрезом),
   край разреза рваный и тёмно-красный, на культе — «мясо» и кость. Оторванная
   часть — отдельный жёсткий меш из треугольников кожи и одежды за разрезом,
   в позе момента отрыва; летит по двум частицам Верле (сустав и конец) с
   вращением вокруг оси, отскакивает и ложится на рельеф. Из культи и из
   оторванной части бьют пульсирующие струи, под культёй растёт лужа.
   Ошмётки (мышцы, кость, мозговое вещество) — один InstancedMesh.
   ========================================================================== */
(function (root, factory) {
  const G = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.GGore = G;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const R = Math.random, TAU = Math.PI * 2;
  const rr = (a, b) => a + (b - a) * R();
  /* цепочки суставов: проксимальный разрез поглощает дистальные */
  const CHAIN = { shoulder: 0, elbow: 1, wrist: 2, hip: 0, knee: 1, ankle: 2 };
  const ARM = { shoulder: 1, elbow: 1, wrist: 1 };
  function create(THREE, o) {
    const scene = o.scene, BL = o.blood, groundAt = o.groundAt || (() => 0);
    const GO = { limbs: [], stats: { cuts: 0 } };
    const V = () => new THREE.Vector3();
    const _a = V(), _b = V(), _c = V(), _d = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = V();
    const UP = new THREE.Vector3(0, 1, 0);

    /* ---------------------------------------------- материалы --- */
    const meatMat = new THREE.MeshStandardMaterial({ color: 0x3e0705, roughness: 0.3, metalness: 0 });
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb4, roughness: 0.55, metalness: 0 });
    const meatGeo = new THREE.SphereGeometry(1, 10, 8);
    { /* бугристое мясо */
      const p = meatGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + Math.sin(p.getX(i) * 9 + p.getZ(i) * 7) * 0.12 + Math.sin(p.getY(i) * 13 + p.getX(i) * 5) * 0.08;
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
      }
      meatGeo.computeVertexNormals();
    }
    const boneGeo = new THREE.CylinderGeometry(0.16, 0.2, 1, 7);
    function stumpCap(r, len) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(meatGeo, meatMat);
      m.scale.set(r, r * 0.55, r);
      const b = new THREE.Mesh(boneGeo, boneMat);
      b.scale.set(r * 1.1, len, r * 1.1);
      b.position.y = len * 0.35;
      g.add(m, b);
      g.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } });
      return g;
    }
    function depthMat(ch) {
      const U = ch.wounds.cutU;
      const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uCut = U;
        sh.vertexShader = 'varying vec3 vWndP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWndP = position;');
        sh.fragmentShader = 'uniform vec4 uCut[4];\nvarying vec3 vWndP;\nfloat wndCut = 0.0;\n' + ch.wounds.noiseGLSL + sh.fragmentShader
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + ch.wounds.cutGLSL);
      };
      m.customProgramCacheKey = () => 'goreDepth';
      return m;
    }

    /* ----------------------------------------------- ошмётки --- */
    const CN = 240;
    const chunkGeo = new THREE.IcosahedronGeometry(1, 0);
    const chunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0 });
    const chunks = new THREE.InstancedMesh(chunkGeo, chunkMat, CN);
    chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    chunks.frustumCulled = false;
    chunks.name = 'goreChunks';
    const CC = [new THREE.Color(0x4a0806), new THREE.Color(0x6a100c), new THREE.Color(0x8c5850), new THREE.Color(0xcfc2a8)];
    const cs = [];
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < CN; i++) {
      chunks.setMatrixAt(i, _m);
      chunks.setColorAt(i, CC[0]);
      cs.push({ on: false, p: V(), v: V(), q: new THREE.Quaternion(), ax: V(), w: 0, s: V(), t: 0, rest: false });
    }
    chunks.count = CN;
    scene.add(chunks);
    let cI = 0, chunksDirty = true;
    /* kind: 0 — мышца, 1 — тёмная, 2 — мозг, 3 — кость */
    function chunk(p, v, size, kind) {
      if(Math.random()>((globalThis.AEGIS_SETTINGS||{}).gore??1))return;
      const c = cs[cI = (cI + 1) % CN];
      c.on = true; c.rest = false; c.t = 0;
      c.p.copy(p); c.v.copy(v);
      c.q.setFromEuler(new THREE.Euler(R() * TAU, R() * TAU, R() * TAU));
      c.ax.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize(); c.w = rr(6, 22);
      const sq = kind === 3 ? 0.45 : 0.8;
      c.s.set(size * rr(0.7, 1.3), size * rr(0.5, 1) * sq, size * rr(0.7, 1.4));
      chunks.setColorAt(cI, CC[kind]);
      chunks.instanceColor.needsUpdate = true;
      chunksDirty = true;
    }
    GO.chunk = chunk;
    function burst(p, dir, n, sp, kinds) {
      for (let i = 0; i < n; i++) {
        _c.set(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(2 * sp).add(dir).normalize().multiplyScalar(rr(1.5, 6.5));
        _c.y += rr(0, 1.6);
        chunk(p, _c, rr(0.006, 0.02), kinds[Math.floor(R() * kinds.length)]);
      }
    }
    GO.burst = burst;

    /* ----------------------------------------------- отрыв --- */
    const base = (ch, n) => { const k = ch.scale || 1, r = ch.rest[n]; return r ? [r[0] / k, r[1] / k, r[2] / k] : null; };
    /* описание разреза: mode, side, порог (координаты покоя геометрии) */
    function cutSpec(ch, joint) {
      const kind = joint.slice(0, -1), S = joint.slice(-1), sg = S === 'R' ? 1 : -1;
      const J = base(ch, joint);
      if (!J) return null;
      if (ARM[kind]) {
        const off = kind === 'shoulder' ? 0.035 : kind === 'elbow' ? 0.0 : 0.006;
        const tip = base(ch, 'wrist' + S);
        return { mode: 1, sg, thr: J[0] * sg + off, kind, S, joint, a: [sg * (J[0] * sg + off), J[1], J[2]], b: [tip[0] + sg * 0.17, tip[1], tip[2]], r: kind === 'shoulder' ? 0.055 : kind === 'elbow' ? 0.045 : 0.036 };
      }
      const off = kind === 'hip' ? -0.12 : kind === 'knee' ? -0.015 : 0.035;
      const tipN = kind === 'ankle' ? 'toe' + S : 'ankle' + S, tip = base(ch, tipN) || J;
      return { mode: 2, sg, thr: J[1] + off, kind, S, joint, a: [J[0], J[1] + off, J[2]], b: [tip[0], tip[1], tip[2] + (kind === 'ankle' ? 0 : 0)], r: kind === 'hip' ? 0.075 : kind === 'knee' ? 0.058 : 0.045 };
    }
    const beyond = (C, x, y) => C.mode === 1 ? x * C.sg > C.thr : (x * C.sg > -0.012 && y < C.thr);
    function extract(ch, C, prev) {
      const out = [];
      for (const key in ch.meshes) {
        const mesh = ch.meshes[key];
        if (!mesh.visible || !mesh.geometry) continue;
        const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, I = g.index;
        if (!P) continue;
        const nt = I ? I.count / 3 : P.count / 3;
        const pos = [], nor = [], uv = [];
        for (let t = 0; t < nt; t++) {
          let cx = 0, cy = 0;
          const id = [];
          for (let j = 0; j < 3; j++) { const v = I ? I.getX(t * 3 + j) : t * 3 + j; id.push(v); cx += P.getX(v); cy += P.getY(v); }
          cx /= 3; cy /= 3;
          if (!beyond(C, cx, cy)) continue;
          let skip = false;
          for (const Q of prev) if (beyond(Q, cx, cy)) { skip = true; break; }
          if (skip) continue;
          for (const v of id) {
            pos.push(P.getX(v), P.getY(v), P.getZ(v));
            if (N) nor.push(N.getX(v), N.getY(v), N.getZ(v));
            if (UV) uv.push(UV.getX(v), UV.getY(v));
          }
        }
        if (!pos.length) continue;
        const ng = new THREE.BufferGeometry();
        ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        if (nor.length) ng.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        else ng.computeVertexNormals();
        if (uv.length) ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        out.push({ geo: ng, mat: mesh.material, src: mesh });
      }
      return out;
    }
    function state(s) {
      return s._gore || (s._gore = { cuts: [], caps: [], hands: [], depth: null });
    }
    function applyCuts(s) {
      const ch = s.char, G = state(s), U = ch.wounds.cutU.value;
      for (let i = 0; i < 4; i++) {
        const C = G.cuts[i];
        if (C) U[i].set(C.mode, C.sg, C.thr, 0.01); else U[i].set(0, 0, 0, 0);
      }
      if (!G.depth) {
        G.depth = depthMat(ch);
        for (const k in ch.meshes) { const m = ch.meshes[k]; if (m.castShadow) m.customDepthMaterial = G.depth; }
      }
    }

    GO.sever = function (s, joint, opt) {
      if(((globalThis.AEGIS_SETTINGS||{}).gore??1)<.5)return;
      opt = opt || {};
      const ch = s.char;
      if (!ch || !ch.wounds || !ch.wounds.cutU || !ch.rest) return false;
      const G = state(s);
      const C = cutSpec(ch, joint);
      if (!C || G.cuts.length >= 4) return false;
      /* уже отрезано проксимальнее — нечего отрывать */
      for (const Q of G.cuts) if (Q.mode === C.mode && Q.S === C.S && CHAIN[Q.kind] <= CHAIN[C.kind]) return false;
      const D = s.dmg || {};
      (D.cut || (D.cut = {}))[joint] = true;
      const bone = ch.bone(joint);
      if (!bone) return false;
      ch.root.updateMatrixWorld(true);
      /* меш оторванной части в позе момента отрыва */
      const parts = extract(ch, C, G.cuts);
      G.cuts.push(C);
      applyCuts(s);
      GO.stats.cuts++;
      const anyMesh = ch.meshes[Object.keys(ch.meshes)[0]];
      const bi = anyMesh.skeleton.bones.indexOf(bone);
      _m.multiplyMatrices(bone.matrixWorld, anyMesh.skeleton.boneInverses[bi]).multiply(anyMesh.bindMatrix);
      const grp = new THREE.Group();
      grp.name = 'severed_' + joint;
      _m.decompose(grp.position, grp.quaternion, grp.scale);
      const cutU = ch.wounds.cutU.value, saved = [];
      for (let i = 0; i < 4; i++) saved.push(new THREE.Vector4());
      const pre = () => { for (let i = 0; i < 4; i++) { saved[i].copy(cutU[i]); cutU[i].set(0, 0, 0, 0); } };
      const post = () => { for (let i = 0; i < 4; i++) cutU[i].copy(saved[i]); };
      for (const P of parts) {
        const m = new THREE.Mesh(P.geo, P.mat);
        m.castShadow = P.src.castShadow; m.receiveShadow = true;
        m.renderOrder = P.src.renderOrder;
        m.onBeforeRender = pre; m.onAfterRender = post;
        grp.add(m);
      }
      /* кисть GLB едет вместе с рукой */
      if (ARM[C.kind] && ch.hands && ch.hands[C.S]) {
        const h = ch.hands[C.S].anchor;
        G.hands.push({ h, parent: h.parent, p: h.position.clone(), q: h.quaternion.clone(), sc: h.scale.clone() });
        grp.attach(h);
      }
      const sc = grp.scale.x;
      /* культя на теле и срез на оторванной части */
      const cap = stumpCap(C.r / Math.max(1e-3, bone.getWorldScale(_s).x), 0.6 * C.r / Math.max(1e-3, bone.getWorldScale(_s).x));
      if (bone.parent) {
        /* кости в покое не повёрнуты: оси родителя — мировые оси T-позы */
        const ws = Math.max(1e-3, bone.parent.getWorldScale(_s).x), K = ch.scale || 1;
        bone.parent.add(cap);
        _a.set(C.mode === 1 ? C.sg : 0, C.mode === 1 ? 0 : -1, 0);
        const off = C.mode === 1 ? (C.a[0] * C.sg - base(ch, joint)[0] * C.sg) : (base(ch, joint)[1] - C.a[1]);
        cap.position.copy(bone.position).addScaledVector(_a, off * K / ws);
        cap.quaternion.setFromUnitVectors(UP, _a);
        G.caps.push(cap);
      }
      const capL = stumpCap(C.r / sc, 0.5 * C.r / sc);
      capL.position.set(C.a[0], C.a[1], C.a[2]);
      _a.set(C.b[0] - C.a[0], C.b[1] - C.a[1], C.b[2] - C.a[2]).normalize();
      capL.quaternion.setFromUnitVectors(UP, _a.negate());
      grp.add(capL);
      scene.add(grp);
      /* физика: две частицы — срез и дальний конец */
      const A = V().set(C.a[0], C.a[1], C.a[2]).multiplyScalar(sc).applyQuaternion(grp.quaternion).add(grp.position);
      const B = V().set(C.b[0], C.b[1], C.b[2]).multiplyScalar(sc).applyQuaternion(grp.quaternion).add(grp.position);
      const dir = (opt.dir ? _b.copy(opt.dir) : _b.set(0, 0, 0)).setY(0);
      if (dir.lengthSq() < 1e-6) dir.set(R() - 0.5, 0, R() - 0.5);
      dir.normalize();
      const f = opt.force || 1, blast = !!opt.blast;
      const H = 1 / 60;
      const vA = V().copy(dir).multiplyScalar(rr(1.2, 2.6) * f).add(_c.set(rr(-0.4, 0.4), (blast ? rr(5, 8) : rr(1.2, 2.6)) * f, rr(-0.4, 0.4)));
      const vB = V().copy(vA).add(_c.set(rr(-1.5, 1.5), rr(-0.5, 1.5) * f, rr(-1.5, 1.5)).multiplyScalar(f));
      const L = {
        s, grp, A, B, pA: A.clone().addScaledVector(vA, -H), pB: B.clone().addScaledVector(vB, -H), len: A.distanceTo(B),
        la: new THREE.Vector3(C.a[0], C.a[1], C.a[2]), sc, rad: C.r * 0.8, spin: rr(-14, 14) * f, t: 0, sleep: 0,
        prevDir: V().subVectors(B, A).normalize(), H
      };
      GO.limbs.push(L);
      while (GO.limbs.length > 12) dropLimb(GO.limbs[0]);
      /* кровь: фонтан, струи из культи и из оторванной части, ошмётки */
      const at = bone.getWorldPosition(V());
      if (BL) {
        const up = _d.copy(dir).multiplyScalar(0.6).add(UP).normalize();
        BL.gush && BL.gush(at, up, C.kind === 'hip' || C.kind === 'shoulder' ? 1.5 : 1.1);
        const pb = bone.parent;
        if (BL.spurt && pb) {
          const pW = V(), jW = V(), dW = V();
          BL.spurt(() => { pb.localToWorld(jW.copy(bone.position)); return jW; },
            () => { pb.getWorldPosition(pW); return dW.subVectors(jW, pW).normalize(); }, { dur: rr(7, 11), k: C.kind === 'wrist' || C.kind === 'ankle' ? 0.9 : 1.5 });
          const lp = V(), ld = V();
          BL.spurt(() => lp.copy(L.A), () => ld.subVectors(L.A, L.B).normalize(), { dur: 3, k: 0.55 });
        }
        if (BL.pool) L.poolAt = { t: rr(1.6, 2.4), bone, R: C.kind === 'hip' ? 1.15 : C.kind === 'ankle' || C.kind === 'wrist' ? 0.6 : 0.9 };
      }
      burst(at, _d.copy(dir).add(UP).normalize(), blast ? 26 : 12, 0.8, [0, 0, 1, 1, 3]);
      if (o.onSever) o.onSever(s, joint, at);
      return true;
    };

    /* голова: выходное отверстие, мозговое вещество и осколки кости */
    GO.headGore = function (s, world, dir, eK) {
      if(((globalThis.AEGIS_SETTINGS||{}).gore??1)<.5)return;
      const k = Math.min(1.6, Math.max(0.6, (eK || 1200) / 1300));
      const ex = V().copy(world).addScaledVector(dir, 0.16);
      burst(ex, dir, Math.round(4 * k), 0.3, [2, 2, 1, 0, 3]);
      if (BL) {
        if (BL.gush) BL.gush(ex, dir, 0.3 * k);
        if (BL.mist) BL.mist(ex, _a.copy(dir).multiplyScalar(1.6), 0.06, 0.45 * k, 0.6, 0.4, 0x5e100c);
      }
    };

    function dropLimb(L) {
      const i = GO.limbs.indexOf(L);
      if (i >= 0) GO.limbs.splice(i, 1);
      scene.remove(L.grp);
      L.grp.traverse((x) => { if (x.isMesh && x.geometry !== meatGeo && x.geometry !== boneGeo && x.parent === L.grp && !x.userData.keep) x.geometry.dispose(); });
    }
    GO.reset = function (s) {
      const G = s._gore;
      if (!G) return;
      for (const h of G.hands) { h.parent.add(h.h); h.h.position.copy(h.p); h.h.quaternion.copy(h.q); h.h.scale.copy(h.sc); }
      for (const c of G.caps) if (c.parent) c.parent.remove(c);
      for (const L of GO.limbs.slice()) if (L.s === s) dropLimb(L);
      G.cuts.length = 0; G.caps.length = 0; G.hands.length = 0;
      if (s.char.wounds && s.char.wounds.cutU) for (const v of s.char.wounds.cutU.value) v.set(0, 0, 0, 0);
      /* материал глубины оставляем: при пустых разрезах он равен обычному */
    };

    /* ------------------------------------------------- кадр --- */
    const _e = V(), _f = V();
    GO.update = function (dt) {
      dt = Math.min(dt, 1 / 30);
      const H = 1 / 120;
      for (const L of GO.limbs) {
        L.t += dt;
        if (L.poolAt && L.t > L.poolAt.t) {
          L.poolAt.bone.getWorldPosition(_e);
          BL.pool(_e.x, _e.z, L.poolAt.R, { tau: 2.4 });
          L.poolAt = null;
        }
        if (L.sleep > 1.5) continue;
        const n = Math.max(1, Math.round(dt / H)), h = dt / n;
        let ground = false;
        for (let it = 0; it < n; it++) {
          for (const [P, PP] of [[L.A, L.pA], [L.B, L.pB]]) {
            _e.subVectors(P, PP).multiplyScalar(0.999);
            PP.copy(P);
            P.add(_e); P.y -= 9.81 * h * h;
            const gy = groundAt(P.x, P.z) + L.rad;
            if (P.y < gy) {
              ground = true;
              const vy = P.y - PP.y;
              P.y = gy; PP.y = gy + vy * 0.25;
              PP.x += (P.x - PP.x) * 0.35; PP.z += (P.z - PP.z) * 0.35;
            }
          }
          /* жёсткая связь */
          _e.subVectors(L.B, L.A);
          const d = _e.length() || 1e-6, c = (d - L.len) / d * 0.5;
          L.A.addScaledVector(_e, c); L.B.addScaledVector(_e, -c);
        }
        const v = Math.max(L.A.distanceTo(L.pA), L.B.distanceTo(L.pB)) / h;
        if (ground) {
          L.spin *= Math.exp(-dt * 7);
          if (L.t > 0.4 && L.t < 1.2 && BL && R() < dt * 10) BL.dripAt && BL.dripAt(L.A);
        }
        L.sleep = ground && v < 0.12 ? L.sleep + dt : 0;
        /* ориентация: поворот оси + вращение вокруг неё */
        _f.subVectors(L.B, L.A).normalize();
        _q.setFromUnitVectors(L.prevDir, _f);
        _q2.setFromAxisAngle(_f, L.spin * dt);
        L.grp.quaternion.premultiply(_q).premultiply(_q2);
        L.prevDir.copy(_f);
        _e.copy(L.la).multiplyScalar(L.sc).applyQuaternion(L.grp.quaternion);
        L.grp.position.subVectors(L.A, _e);
      }
      /* ошмётки */
      let moving = false;
      for (let i = 0; i < CN; i++) {
        const c = cs[i];
        if (!c.on) continue;
        c.t += dt;
        if (!c.rest) {
          moving = true;
          c.v.y -= 9.81 * dt;
          c.v.multiplyScalar(1 - Math.min(0.5, 0.35 * dt));
          c.p.addScaledVector(c.v, dt);
          _q.setFromAxisAngle(c.ax, c.w * dt);
          c.q.premultiply(_q);
          const gy = groundAt(c.p.x, c.p.z) + c.s.y * 0.5;
          if (c.p.y < gy) {
            c.p.y = gy;
            if (Math.abs(c.v.y) > 1.2 && R() < 0.5) { c.v.y *= -0.25; c.v.x *= 0.4; c.v.z *= 0.4; c.w *= 0.5; }
            else {
              c.rest = true;
              if (BL && BL.splat && c.s.x > 0.01) BL.splat(c.p, c.s.x * rr(1.6, 3), Math.floor(R() * 8), c.v.x, c.v.z, 1.2, 1);
            }
          }
          if (c.t > 6) c.rest = true;
        }
        let k = 1;
        if (c.t > 150) { k = Math.max(0, 1 - (c.t - 150) / 10); if (k <= 0) { c.on = false; k = 0; } moving = true; }
        _s.copy(c.s).multiplyScalar(k);
        _m.compose(c.p, c.q, _s);
        chunks.setMatrixAt(i, _m);
      }
      if (moving || chunksDirty) { chunks.instanceMatrix.needsUpdate = true; chunksDirty = false; }
    };
    GO.clear = function () {
      for (const L of GO.limbs.slice()) dropLimb(L);
      for (const c of cs) c.on = false;
      _m.makeScale(0, 0, 0);
      for (let i = 0; i < CN; i++) chunks.setMatrixAt(i, _m);
      chunks.instanceMatrix.needsUpdate = true;
    };
    return GO;
  }
  return { create };
});
