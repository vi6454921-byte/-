/* ==========================================================================
   МОДУЛЬ: GGloomWorld — детали и жизнь «мрачного леса» (v7)
   ==========================================================================
   Всё, что делает лес «местом, где что-то случилось»:
   • клочья тумана между стволами и в низинах (мягкие billboard-ы с
     процедурным шумом, высота — по карте GGloom, дрейф по ветру);
   • сухостой с обломанными верхушками, обломки вершин во мху;
   • бородатый лишайник (уснея) на стволах, паутина между стволами;
   • старая траншея (рельеф — в 17_world), гнилые колья обшивки,
     блиндаж с бревенчатым накатом, ржавая колючая проволока, каски;
   • вороны: сидят на сухостое, взлетают от выстрелов/взрывов, кружат
     над лесом и возвращаются;
   • ночные осветительные ракеты на парашюте (прожектор с тенью от
     стволов, качание, подсветка дымки, дымный след);
   • гроза: молния (вспышка экспозиции) и гром с задержкой d/343 c;
   • далёкая артиллерия, низкий гул ветра, «crack-thump» пролёта пуль
     и подавление (виньетка/обесцвечивание, рост разброса).
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.GUtil;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------------------------------------------------- геометрия -- */
  /* простое слияние: геометрии → один BufferGeometry (позиция, нормаль, uv, цвет) */
  function Merge() { this.p = []; this.n = []; this.u = []; this.c = []; }
  Merge.prototype.add = function (geo, m, col) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    if (m) g.applyMatrix4(m);
    const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      this.p.push(x, y, z);
      this.n.push(N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0);
      this.u.push(UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0);
      const c = typeof col === 'function' ? col(x, y, z) : (col || [1, 1, 1]);
      this.c.push(c[0], c[1], c[2]);
    }
    return this;
  };
  Merge.prototype.build = function (THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  };

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  /* v26: детали старой траншеи — остатки обшивки стенок (доски на кольях,
     завалившиеся к склону), плетень из жердей, настил-трап на дне, упавшие
     доски, оплывшие мешки с песком на бруствере стрелковых ячеек, ящики из-
     под патронов у блиндажа. Всё пишется в переданный Merge (в игре — буфер
     'trench_log': тот же вызов отрисовки), у деталей свой генератор
     случайных чисел — остальной мир не сдвигается. ~2,5 тыс. треугольников.
     Проверяется отдельно на стенде tools/v26-stands/trench.html. */
  function trenchDetail(THREE, F, H, out, woodOut) {
    const T = F.TRENCH, P = T.pts;
    /* доски и ящики — в отдельный буфер с текстурой старого дерева (если дан):
       UV в метрах, волокна вдоль длинной стороны, у каждой доски свой сдвиг */
    const wood = woodOut || out;
    const r = U.rng(26026), R = (a, b) => a + (b - a) * r();
    const lin = (c) => Math.pow(Math.max(0, c), 2.2);
    const tone = (base, v) => () => { const k = 1 + (r() - 0.5) * v; return [lin(base[0] * k), lin(base[1] * k), lin(base[2] * k)]; };
    const E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
    const mtx = (x, y, z, rx, ry, rz, sx, sy, sz) => {
      E.set(rx || 0, ry || 0, rz || 0, 'YXZ'); Q.setFromEuler(E);
      return new THREE.Matrix4().compose(V.set(x, y, z), Q, S.set(sx || 1, sy || sx || 1, sz || sx || 1));
    };
    /* серое гнилое дерево, мешковина в земле, выцветшая зелёная краска ящиков */
    const plank = tone([0.26, 0.235, 0.2], 0.4), rod = tone([0.24, 0.21, 0.17], 0.3), bag = tone([0.29, 0.265, 0.21], 0.25),
      crate = tone([0.25, 0.26, 0.2], 0.18);
    const st = { boards: 0, rods: 0, stakes: 0, slats: 0, bags: 0, crates: 0 };
    const TILE = 0.7;
    const BOARD = (l, h, t) => {
      const g = new THREE.BoxGeometry(l, h, t), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      const ou = r(), ov = r() * 4;
      for (let i = 0; i < p.count; i++) {
        const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        /* волокна (v текстуры) — вдоль x доски; торцы — поперёк */
        if (ax > 0.5) uv.setXY(i, z / TILE + ou, y / TILE + ov);
        else if (ay > 0.5) uv.setXY(i, z / TILE + ou, x / TILE + ov);
        else uv.setXY(i, y / TILE + ou, x / TILE + ov);
      }
      return g;
    };
    /* множители к текстуре (цвет вершин): сырое серое дерево и выцветшая зелёная краска */
    const wTone = (k, v) => () => { const q = k * (1 + (r() - 0.5) * v); return [q, q * 0.97, q * 0.92]; };
    const wplank = woodOut ? wTone(0.78, 0.35) : plank, wcrate = woodOut ? () => { const q = 0.9 + r() * 0.15; return [0.36 * q, 0.44 * q, 0.3 * q]; } : crate;
    const stakeAt = (x, z, hh, rx, ry, rz, r0) => {
      out.add(new THREE.CylinderGeometry(r0 * 0.8, r0, hh, 5).translate(0, hh / 2, 0), mtx(x, H(x, z) - R(0.12, 0.2), z, rx, ry, rz), rod);
      st.stakes++;
    };
    const segs = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez);
      segs.push({ i, a, b, L, dx: ex / L, dz: ez / L, yaw: Math.atan2(-ez / L, ex / L),
        filled: F.trackD((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) < 3 });
    }
    /* 1) обшивка стенок: доски / плетень / обвал (пусто) */
    for (const g of segs) {
      if (g.filled) continue;
      const { a, dx, dz, L, yaw } = g;
      for (const side of [-1, 1]) {
        const ox = -dz * side, oz = dx * side;
        let s = R(0.2, 0.6);
        while (s < L - 0.7) {
          const len = Math.min(L - 0.3 - s, R(1.2, 2.0));
          if (len < 0.7) break;
          const kind = r(), sc = s + len / 2;
          const fx = a[0] + dx * sc + ox * 0.56, fz = a[1] + dz * sc + oz * 0.56;
          const lean = R(0.4, 0.62), sl = Math.sin(lean), cl = Math.cos(lean), y0 = H(fx, fz) - 0.07;
          if (kind < 0.42) {
            const nb = r() < 0.55 ? 3 : 2;
            for (let k = 0; k < nb; k++) {
              if (k > 0 && r() < 0.2) continue;                       // сгнила, выпала
              const hk = 0.09 + k * 0.17, bl = len * R(0.82, 1.0), sh = R(-0.1, 0.1);
              wood.add(BOARD(bl, R(0.14, 0.17), 0.026),
                mtx(fx + ox * sl * hk + dx * sh, y0 + cl * hk, fz + oz * sl * hk + dz * sh, side * lean + R(-0.07, 0.07), yaw, R(-0.06, 0.06)), wplank);
              st.boards++;
            }
            for (const e of [-0.46, 0.46]) {
              const px = fx + dx * e * len - ox * 0.05, pz = fz + dz * e * len - oz * 0.05;
              stakeAt(px, pz, R(0.55, 0.85), side * lean * 0.85 + R(-0.08, 0.08), yaw, R(-0.08, 0.08), 0.034);
            }
          } else if (kind < 0.7) {
            /* плетень: колья через ~0,45 м и жерди «через одну» */
            const ns = Math.max(2, Math.round(len / 0.45));
            for (let k = 0; k <= ns; k++) {
              if (r() < 0.15) continue;
              const e = -len / 2 + len * k / ns, px = fx + dx * e - ox * 0.03, pz = fz + dz * e - oz * 0.03;
              stakeAt(px, pz, R(0.5, 0.75), side * lean + R(-0.06, 0.06), yaw, R(-0.06, 0.06), 0.022);
            }
            const nr = 4 + Math.floor(r() * 4);
            for (let k = 0; k < nr; k++) {
              if (r() < 0.12) continue;
              const hk = 0.05 + k * 0.07, rl = len * (r() < 0.2 ? R(0.4, 0.7) : R(0.9, 1.04)), sh = R(-0.12, 0.12);
              const w = (k % 2 ? 1 : -1) * 0.012;
              out.add(new THREE.CylinderGeometry(0.011, 0.013, rl, 4),
                mtx(fx + ox * (sl * hk + w) + dx * sh, y0 + 0.02 + cl * hk, fz + oz * (sl * hk + w) + dz * sh, side * lean, yaw, Math.PI / 2 + R(-0.04, 0.04)), rod);
              st.rods++;
            }
          }
          s += len + R(0.15, 0.7);
        }
      }
      /* упавшая доска на дне */
      if (r() < 0.5) {
        const sc = R(0.8, L - 0.8), x = a[0] + dx * sc + R(-0.15, 0.15), z = a[1] + dz * sc + R(-0.15, 0.15);
        wood.add(BOARD(R(0.9, 1.6), 0.026, 0.15), mtx(x, H(x, z) + 0.006, z, R(-0.12, 0.12), yaw + R(-0.5, 0.5), R(-0.1, 0.1)), wplank);
        st.boards++;
      }
    }
    /* 2) настил-трап по дну: два лежня и поперечные планки, часть выбита */
    for (const gi of [1, 2, 5]) {
      const g = segs[gi];
      if (!g || g.filled) continue;
      const { a, dx, dz, L, yaw } = g;
      const s0 = R(0.4, 0.9), s1 = Math.min(L - 0.4, s0 + R(1.6, 2.6)), len = s1 - s0;
      const px = (u) => [a[0] + dx * (s0 + len * u), a[1] + dz * (s0 + len * u)];
      const [x0, z0] = px(0), [x1, z1] = px(1), y0 = H(x0, z0), y1 = H(x1, z1);
      const pitch = Math.atan2(y1 - y0, len);
      for (const e of [-0.17, 0.17]) {
        const cx = (x0 + x1) / 2 - dz * e, cz = (z0 + z1) / 2 + dx * e;
        wood.add(BOARD(len, 0.05, 0.06), mtx(cx, (y0 + y1) / 2 + 0.02, cz, 0, yaw, pitch), wplank);
        st.boards++;
      }
      for (let u = 0.04; u < 0.98; u += R(0.16, 0.2) / len) {
        if (r() < 0.14) continue;
        const [x, z] = px(u), broken = r() < 0.12;
        wood.add(BOARD(broken ? R(0.18, 0.3) : 0.46, 0.022, 0.085),
          mtx(x + (broken ? -dz * 0.12 : 0), H(x, z) + 0.055 + (broken ? -0.03 : 0), z + (broken ? dx * 0.12 : 0),
            pitch * 0 + R(-0.03, 0.03), yaw + Math.PI / 2 + R(-0.06, 0.06) + (broken ? R(-0.5, 0.5) : 0), (broken ? R(-0.3, 0.3) : R(-0.03, 0.03))), wplank);
        st.slats++;
      }
    }
    /* 3) мешки с песком на переднем бруствере двух стрелковых ячеек:
       ткань сгнила, мешки осели и местами лопнули */
    const sand = new THREE.SphereGeometry(0.5, 7, 4);
    for (const gi of [1, 5]) {
      const g = segs[gi];
      if (!g || g.filled) continue;
      const { a, dx, dz, L, yaw } = g, ox = -dz, oz = dx;    // вперёд (к проволоке) = +1
      const n = 5 + Math.floor(r() * 3), sc0 = L * 0.5 - n * 0.24;
      for (let k = 0; k < n; k++) {
        const sc = sc0 + k * 0.43 + R(-0.04, 0.04), d = R(1.2, 1.36);
        const x = a[0] + dx * sc + ox * d, z = a[1] + dz * sc + oz * d;
        const fl = R(0.75, 1.0);
        out.add(sand, mtx(x, H(x, z) + 0.025 * fl, z, R(-0.12, 0.12), yaw + R(-0.15, 0.15), R(-0.1, 0.1), 0.45, 0.13 * fl, 0.27), bag);
        st.bags++;
        if (k > 0 && k < n - 1 && r() < 0.55) {
          const x2 = x + dx * 0.23 + ox * R(0.02, 0.08), z2 = z + dz * 0.23 + oz * R(0.02, 0.08);
          out.add(sand, mtx(x2, H(x2, z2) + 0.1, z2, R(-0.2, 0.2), yaw + R(-0.2, 0.2), R(-0.15, 0.15), 0.43, 0.11, 0.25), bag);
          st.bags++;
        }
      }
    }
    /* 4) ящики из-под патронов: у входа в блиндаж и разбитый — на дне */
    {
      const [dx0, dz0] = T.dug, x = dx0 + T.nx * 2.1 - T.nz * 1.0, z = dz0 + T.nz * 2.1 + T.nx * 1.0, ry = R(0, Math.PI);
      const y = H(x, z) - 0.07;
      wood.add(BOARD(0.62, 0.26, 0.33), mtx(x, y + 0.13, z, R(-0.05, 0.05), ry, R(-0.12, -0.05)), wcrate);
      wood.add(BOARD(0.66, 0.03, 0.36), mtx(x + 0.02, y + 0.275, z, 0.05, ry, -0.12), wcrate);
      wood.add(BOARD(0.6, 0.025, 0.3), mtx(x + Math.cos(ry) * 0.5, H(x, z) + 0.02, z - Math.sin(ry) * 0.5, 0.6, ry + 0.4, 0.1), wcrate);
      st.crates++;
      const g = segs[2];
      if (g && !g.filled) {
        const sc = g.L * 0.62, bx = g.a[0] + g.dx * sc, bz = g.a[1] + g.dz * sc, by = H(bx, bz);
        for (let k = 0; k < 3; k++) {
          wood.add(BOARD(0.62, 0.022, 0.12), mtx(bx + R(-0.25, 0.25), by + 0.012 + k * 0.012, bz + R(-0.25, 0.25), R(-0.1, 0.1), R(0, Math.PI), R(-0.08, 0.08)), wcrate);
        }
        wood.add(BOARD(0.33, 0.24, 0.022), mtx(bx, by + 0.08, bz, 0.9, g.yaw + 0.3, 0.1), wcrate);
        st.crates++;
      }
    }
    return st;
  }


  /* бородатый лишайник: пучок свисающих нитей с разветвлениями */
  function lichenCanvas() {
    const cv = canvas(64, 128), g = cv.getContext('2d'), r = U.rng(4411);
    g.clearRect(0, 0, 64, 128);
    g.lineCap = 'round';
    for (let k = 0; k < 30; k++) {
      let x = 10 + r() * 44, y = r() * 10;
      const len = 40 + r() * 85, w = 0.6 + r() * 0.9;
      g.strokeStyle = '#fff';
      g.lineWidth = w;
      g.beginPath(); g.moveTo(x, y);
      let vx = (r() - 0.5) * 0.4;
      for (let s = 0; s < len; s += 3) {
        vx += (r() - 0.5) * 0.35; vx *= 0.8;
        x += vx; y += 3;
        g.lineTo(x, y);
        if (r() < 0.06) { /* веточка */
          g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 8, y + 4 + r() * 6); g.moveTo(x, y);
        }
      }
      g.stroke();
    }
    return cv;
  }
  /* паутина: радиальные нити, спираль, обрывы, капли росы */
  function webCanvas() {
    const S = 256, cv = canvas(S, S), g = cv.getContext('2d'), r = U.rng(9137);
    g.clearRect(0, 0, S, S);
    const cx = S * 0.5, cy = S * 0.5, n = 15, ang = [];
    for (let i = 0; i < n; i++) ang.push(i / n * TAU + (r() - 0.5) * 0.25);
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.1;
    for (const a of ang) {
      g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * S * 0.5, cy + Math.sin(a) * S * 0.5); g.stroke();
    }
    g.lineWidth = 0.8; g.strokeStyle = 'rgba(255,255,255,0.7)';
    for (let rr = 8; rr < S * 0.46; rr += 5 + rr * 0.04) {
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = ang[i % n], rad = rr * (0.92 + 0.08 * Math.sin(i * 1.7));
        const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad + (rr / S) * 6;
        if (i === 0 || r() < 0.06) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 70; i++) {
      const a = ang[(r() * n) | 0], rad = r() * S * 0.45;
      g.beginPath(); g.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 0.8 + r() * 1.2, 0, TAU); g.fill();
    }
    return cv;
  }
  function glowCanvas() {
    const S = 128, cv = canvas(S, S), g = cv.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,250,235,0.9)');
    gr.addColorStop(0.35, 'rgba(255,220,170,0.25)'); gr.addColorStop(1, 'rgba(255,200,150,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return cv;
  }
  function puffCanvas() {
    const S = 64, cv = canvas(S, S), g = cv.getContext('2d'), r = U.rng(31);
    for (let i = 0; i < 14; i++) {
      const x = S / 2 + (r() - 0.5) * 22, y = S / 2 + (r() - 0.5) * 22, rad = 10 + r() * 14;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
    return cv;
  }

  /* ------------------------------------------------------ туман ---- */
  const WISP_VS = `
    attribute vec4 aP; attribute vec3 aS;
    uniform sampler2D uCanopy; uniform float uT; uniform vec2 uWind; uniform vec3 uCam; uniform float uBox;
    varying vec2 vUv; varying float vA; varying vec3 vW; varying float vSeed;
    void main() {
      vec3 c = aP.xyz;
      c.xz += uWind * uT * ( 0.55 + 0.45 * aS.z );
      c.xz = mod( c.xz + uBox, 2.0 * uBox ) - uBox;
      vec4 cn = texture2D( uCanopy, c.xz / 256.0 + 0.5 );
      c.y += cn.g * 40.0 - 10.0;
      vec3 toC = uCam - c; toC.y = 0.0;
      vec3 f = normalize( toC + vec3( 1e-4, 0.0, 0.0 ) );
      vec3 rt = vec3( f.z, 0.0, -f.x );
      vec3 p = c + rt * position.x * aS.x + vec3( 0.0, 1.0, 0.0 ) * position.y * aS.y;
      vW = p; vUv = uv; vSeed = aS.z;
      float d = length( uCam - c );
      vA = smoothstep( 2.0, 9.0, d ) * ( 1.0 - smoothstep( 40.0, 70.0, d ) ) * ( 0.35 + 0.75 * cn.b + 0.25 * cn.r );
      gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
    }`;
  const WISP_FS = `
    uniform float uT, uAmt; uniform vec3 uCol, uFlC, uMfC; uniform vec4 uFl, uMf;
    varying vec2 vUv; varying float vA; varying vec3 vW; varying float vSeed;
    float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
    float n2( vec2 x ) { vec2 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
      return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + vec2( 1, 1 ) ), f.x ), f.y ); }
    float fbm( vec2 p ) { float a = 0.0, w = 0.5; for ( int i = 0; i < 4; i++ ) { a += n2( p ) * w; p = p * 2.03 + 1.7; w *= 0.5; } return a; }
    void main() {
      vec2 q = vUv;
      float e = smoothstep( 0.0, 0.32, q.y ) * ( 1.0 - smoothstep( 0.4, 1.0, q.y ) ) * smoothstep( 0.0, 0.32, q.x ) * smoothstep( 1.0, 0.68, q.x );
      vec2 p = vec2( q.x * 2.6, q.y * 1.3 ) + vSeed * 31.0;
      float f = fbm( p + vec2( uT * 0.035, uT * 0.008 ) );
      f = smoothstep( 0.32, 0.82, f + 0.28 * fbm( p * 2.6 - vec2( uT * 0.06, 0.0 ) ) );
      float a = e * f * vA * uAmt;
      if ( a < 0.003 ) discard;
      vec3 col = uCol;
      if ( uFl.w > 0.0 ) { vec3 L = uFl.xyz - vW; col += uFlC * uFl.w / ( 60.0 + dot( L, L ) ); }
      if ( uMf.w > 0.0 ) { vec3 L = uMf.xyz - vW; col += uMfC * uMf.w / ( 1.0 + dot( L, L ) ); }
      gl_FragColor = vec4( col, a );
    }`;

  function create(THREE, o) {
    const scene = o.scene, world = o.world, camera = o.camera;
    const F = world.layout, H = world.heightAt || (() => 0), trees = world.trees || [];
    const GG = root.GGloom;
    const rnd = U.rng(77013), R = (a, b) => a + (b - a) * rnd();
    const grp = new THREE.Group(); grp.name = 'gloom_world'; scene.add(grp);
    const gw = { group: grp, sup: 0, flash: 0, wisp: 0.5, flaresAuto: false, storm: false, audio: o.audio || null,
      ctrl: null, quality: 'medium', t: 0 };
    const disposables = [];

    /* ----- проверки места ----- */
    const tgrid = new Map(), gk = (i, j) => i * 4096 + j;
    for (const t of trees) {
      const k = gk(Math.floor(t.x / 4), Math.floor(t.z / 4));
      if (!tgrid.has(k)) tgrid.set(k, []);
      tgrid.get(k).push(t);
    }
    const nearTree = (x, z, r) => {
      const i = Math.floor(x / 4), j = Math.floor(z / 4);
      let best = null, bd = r;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const l = tgrid.get(gk(i + a, j + b)); if (!l) continue;
        for (const t of l) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } }
      }
      return best;
    };
    const inZ = (zones, x, z) => (zones || []).some((q) => q.fn ? q.fn(x, z) : (q.r !== undefined ? Math.hypot(x - q.x, z - q.z) < q.r : x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1));
    /* v10: коллизии — по всей зоне, куда может дойти игрок (до края минного поля) */
    const MFp = world && world.minefield, PLX = MFp ? MFp.XF + MFp.depth + 1.5 : 36.1, PLZ = MFp ? MFp.ZF + MFp.depth + 1.5 : 41.1;
    const inPlay = (x, z) => Math.abs(x) < PLX && Math.abs(z) < PLZ;
    const freeAt = (x, z, rt, play) => {
      if (play && !inPlay(x, z)) return false;
      if (!F) return true;
      if (F.clearE(x, z) < 1.18 || F.laneD(x, z) < 2.2 || F.squadD(x, z) < 3) return false;
      if (F.craterD(x, z) < 1.15 || F.trackD(x, z) < 1.8) return false;
      if (F.trenchD && F.trenchD(x, z) < 2.4) return false;
      if (inZ(F.noTree, x, z)) return false;
      if (Math.hypot(x + 13.5, z + 16) < 6 || Math.hypot(x + 13, z + 5.5) < 7.5 || Math.hypot(x - 27, z - 32) < 13) return false;
      if (Math.abs(Math.abs(x) - 29) < 1.2 || Math.abs(Math.abs(z) - 34) < 1.2) return false;   // забор
      return !nearTree(x, z, rt || 1.2);
    };
    const colliders = world.colliders || [];
    const addCol = (c) => { if (inPlay(c.x, c.z)) colliders.push(c); };

    /* материалы: кора — от сосен мира (с мхом), если найдётся */
    let barkMat = null;
    scene.traverse((m) => { if (!barkMat && m.isMesh && /_trunk$/.test(m.name || '') && m.material) barkMat = m.material; });
    const deadBark = barkMat && barkMat.map
      ? new THREE.MeshStandardMaterial({ map: barkMat.map, normalMap: barkMat.normalMap || null, color: 0x8b8378, roughness: 0.95, metalness: 0 })
      : new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.95 });
    const greyWood = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.93, metalness: 0 });
    const rotWood = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 });
    const soilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.82, metalness: 0.35 });
    const helmMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0.3, side: THREE.DoubleSide });
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x030303 });
    voidMat.userData.noGloom = true;
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S3 = new THREE.Vector3();
    const mtx = (x, y, z, rx, ry, rz, sx, sy, sz) => {
      E.set(rx || 0, ry || 0, rz || 0, 'YXZ'); Q.setFromEuler(E);
      return new THREE.Matrix4().compose(V.set(x, y, z), Q, S3.set(sx || 1, sy || sx || 1, sz || sx || 1));
    };
    /* цвета вершин задаются «на глаз» в sRGB и переводятся в линейные */
    const lin = (c) => Math.pow(Math.max(0, c), 2.2);
    const woodCol = (base, v) => () => { const k = 1 + (rnd() - 0.5) * v; return [lin(base[0] * k), lin(base[1] * k), lin(base[2] * k)]; };
    const mesh = (geo, mat, name, cast) => {
      const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = cast !== false; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix(); grp.add(m); disposables.push(geo); return m;
    };

    /* ================================================ сухостой ======= */
    const perches = [];
    const helmsV8 = [];
    const _hq = new THREE.Quaternion(), _he = new THREE.Euler();
    /* v8: физика сбитых касок — прыжок, кувырок, перекат, покой */
    function helmStep(dt) {
      for (const h of helmsV8) {
        if (h.rest) continue;
        const m = h.mesh, p = m.position;
        h.vel.y -= 9.81 * dt;
        p.addScaledVector(h.vel, dt);
        _he.set(h.av.x * dt, h.av.y * dt, h.av.z * dt); _hq.setFromEuler(_he); m.quaternion.premultiply(_hq);
        const gy = H(p.x, p.z) - 0.02;
        if (p.y < gy) {
          p.y = gy;
          if (h.vel.y < -1.2 && gw.audio && gw.audio.metalPing) try { gw.audio.metalPing(gw.spatialFrom ? gw.spatialFrom(p) : { gain: 0.6, pan: 0, lp: 12000, delay: 0 }, false); } catch (e) { /* */ }
          h.vel.y = -h.vel.y * 0.28; h.vel.x *= 0.62; h.vel.z *= 0.62; h.av.multiplyScalar(0.55);
          if (h.vel.lengthSq() < 0.05 && h.av.lengthSq() < 0.5) { h.rest = true; h.vel.set(0, 0, 0); }
        }
        if (h.px && world.v8props) world.v8props.move(h.px, p.x, p.y + 0.07, p.z);
      }
    }
    gw.helms = helmsV8;
    (function snags() {
      const trunkM = new Merge(), woodM = new Merge(), logM = new Merge();
      let placed = 0;
      for (let tries = 0; tries < 900 && placed < 26; tries++) {
        const play = placed < 12;
        const x = play ? R(-29, 29) : R(-62, 62), z = play ? R(-34, 34) : R(-62, 62);
        if (!play && inPlay(x, z)) continue;
        if (!freeAt(x, z, 1.7, play)) continue;
        placed++;
        const y0 = H(x, z) - 0.15, r = R(0.17, 0.3), h = R(4.5, 10.5);
        const seg = 10, rows = Math.max(5, Math.round(h / 0.9));
        const g = new THREE.CylinderGeometry(r * 0.7, r * 1.05, h, seg, rows, true);
        g.translate(0, h / 2, 0);
        const P = g.attributes.position, UV = g.attributes.uv;
        const lean = [R(-0.04, 0.04), R(-0.04, 0.04)];
        const jag = []; for (let i = 0; i <= seg; i++) jag.push(rnd() < 0.5 ? R(0.0, 0.25) : R(0.35, 1.4) * (rnd() < 0.3 ? 1.6 : 1));
        jag[seg] = jag[0];
        for (let i = 0; i < P.count; i++) {
          let px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
          const a = Math.atan2(pz, px), k = 1 + 0.07 * Math.sin(a * 3 + py * 1.3) + (py < 0.5 ? 0.25 * (0.5 - py) : 0);
          px *= k; pz *= k;
          if (py > h - 0.01) { const si = Math.round(((a + TAU) % TAU) / TAU * seg) % (seg + 1); py -= jag[si]; px *= 0.85; pz *= 0.85; }
          px += lean[0] * py; pz += lean[1] * py;
          P.setXYZ(i, px, py, pz);
          UV.setXY(i, UV.getX(i) * 1.5, py / 1.25);
        }
        g.computeVertexNormals();
        const ry = R(0, TAU);
        trunkM.add(g, mtx(x, y0, z, 0, ry, 0));
        const topY = h - 0.6;
        /* щепа на изломе: светлая посеревшая древесина */
        const ns = 3 + (rnd() * 4 | 0);
        for (let i = 0; i < ns; i++) {
          const a = R(0, TAU), L = R(0.35, 1.3);
          const c = new THREE.ConeGeometry(R(0.025, 0.06), L, 4); c.translate(0, L / 2, 0);
          const ax = x + Math.cos(a + ry) * r * 0.6 + lean[0] * topY, az = z + Math.sin(a + ry) * r * 0.6 + lean[1] * topY;
          woodM.add(c, mtx(ax, y0 + topY - 0.2, az, R(-0.25, 0.25), a, R(-0.25, 0.25)), woodCol([0.42, 0.39, 0.34], 0.3));
        }
        /* сучья-обрубки */
        for (let i = 0, nb = 3 + (rnd() * 6 | 0); i < nb; i++) {
          const yy = R(1.6, h - 1.2), a = R(0, TAU), L = R(0.25, 0.9);
          const c = new THREE.CylinderGeometry(0.012, 0.035, L, 5); c.translate(0, L / 2, 0);
          const bx = x + lean[0] * yy, bz = z + lean[1] * yy;
          const m = mtx(bx, y0 + yy, bz, 0, a, 0).multiply(mtx(0, 0, 0, 0, 0, -Math.PI / 2 - R(0.1, 0.5)));
          woodM.add(c, m, woodCol([0.33, 0.30, 0.27], 0.3));
        }
        /* обломок вершины во мху */
        if (rnd() < 0.8) {
          const L = R(2.5, 6), lr = r * 0.6, a = R(0, TAU), d0 = R(1.5, 3.5);
          const lx = x + Math.cos(a) * (d0 + L / 2), lz = z + Math.sin(a) * (d0 + L / 2);
          if (!F || (F.laneD(lx, lz) > 1.5 && F.clearE(lx, lz) > 1.08)) {
            const c = new THREE.CylinderGeometry(lr * 0.55, lr, L, 8, 3);
            const yl = (H(lx - Math.cos(a) * L / 2, lz - Math.sin(a) * L / 2) + H(lx + Math.cos(a) * L / 2, lz + Math.sin(a) * L / 2)) / 2;
            logM.add(c, mtx(lx, yl + lr * 0.5, lz, 0, -a, Math.PI / 2), (px, py) => (py > yl + lr * 0.75 ? [lin(0.2), lin(0.24), lin(0.1)] : [lin(0.3), lin(0.26), lin(0.21)]));
            addCol({ type: 'cyl', x: lx, z: lz, r: Math.min(1.2, L * 0.25), h: 0.5 });
          }
        }
        addCol({ type: 'cyl', x, z, r: r + 0.06, h: 3 });
        if (world.v8props) world.v8props.cyl(x, y0, z, r * 0.95, h - 0.4, { mat: 'wood', name: 'snag', tree: { x, z, y: y0, hs: h / 21, rs: r / 0.24, snag: true } });
        perches.push({ x: x + lean[0] * topY, y: y0 + h - Math.min(...jag) + 0.06, z: z + lean[1] * topY, snag: true, play });
      }
      mesh(trunkM.build(THREE), deadBark, 'snag_trunk');
      mesh(woodM.build(THREE), greyWood, 'snag_wood');
      mesh(logM.build(THREE), rotWood, 'deadwood_log');
    })();

    /* ========================================= лишайник и паутина ==== */
    const lichenUni = { value: 0 };
    let lichen = null, webs = null;
    (function lichenWebs() {
      const tex = new THREE.CanvasTexture(lichenCanvas()); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, color: 0x7c866c, roughness: 1, metalness: 0 });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uLT = lichenUni;
        sh.vertexShader = 'uniform float uLT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
  { vec3 ip = instanceMatrix[3].xyz; float sw = sin( uLT * 1.6 + ip.x * 1.3 + ip.z * 0.7 ) + 0.5 * sin( uLT * 3.1 + ip.z );
    transformed.x += sw * 0.07 * ( -position.y ); transformed.z += cos( uLT * 1.2 + ip.x ) * 0.04 * ( -position.y ); }
  #endif`);
      };
      mat.customProgramCacheKey = () => 'gw-lichen';
      if (GG) GG.setK(mat, 0.8, 0.5);
      const p1 = new THREE.PlaneGeometry(1, 1); p1.translate(0, -0.5, 0);
      const p2 = p1.clone(); p2.rotateY(Math.PI / 2);
      const geo = new Merge().add(p1).add(p2).build(THREE);
      const list = [];
      for (const t of trees) {
        if (Math.abs(t.x) > 48 || Math.abs(t.z) > 48) continue;
        if (rnd() > (t.dead ? 0.6 : 0.3)) continue;
        const tr = 0.24 * (t.rs || 1);
        for (let i = 0, n = 2 + (rnd() * 4 | 0); i < n; i++) {
          const a = R(0, TAU), d = tr + R(0.15, 0.6), y = t.y + R(1.7, 5.5);
          list.push(mtx(t.x + Math.cos(a) * d, y, t.z + Math.sin(a) * d, R(-0.1, 0.1), R(0, TAU), 0, R(0.12, 0.26), R(0.22, 0.55), 1));
        }
      }
      for (const p of perches) for (let i = 0; i < 4; i++) {
        const a = R(0, TAU);
        list.push(mtx(p.x + Math.cos(a) * 0.45, p.y - R(1, 4), p.z + Math.sin(a) * 0.45, 0, R(0, TAU), 0, R(0.14, 0.28), R(0.25, 0.6), 1));
      }
      lichen = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      list.forEach((m, i) => lichen.setMatrixAt(i, m));
      lichen.count = list.length; lichen.name = 'beard_lichen';
      lichen.castShadow = false; lichen.receiveShadow = true;
      lichen.computeBoundingSphere();
      grp.add(lichen); disposables.push(geo);

      /* паутина: на высоте колен-груди между стволами и сучьями */
      const wt = new THREE.CanvasTexture(webCanvas()); wt.colorSpace = THREE.SRGBColorSpace;
      const wm = new THREE.MeshBasicMaterial({ map: wt, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xd8dde0, opacity: 0.35 });
      wm.userData.noGloom = true;
      const wl = [];
      for (let tries = 0; tries < 2000 && wl.length < 70; tries++) {
        const t = trees[(rnd() * trees.length) | 0];
        if (!t || !inPlay(t.x, t.z) || (F && (F.clearE(t.x, t.z) < 1.05 || F.laneD(t.x, t.z) < 1))) continue;
        const s = R(0.35, 0.95), a = R(0, TAU), d = 0.24 * (t.rs || 1) + s * 0.45;
        wl.push(mtx(t.x + Math.cos(a) * d, t.y + R(0.45, 2.1), t.z + Math.sin(a) * d, R(-0.3, 0.3), -a + Math.PI / 2 + R(-0.4, 0.4), R(0, TAU), s, s, 1));
      }
      const pw = new THREE.PlaneGeometry(1, 1);
      webs = new THREE.InstancedMesh(pw, wm, Math.max(1, wl.length + 8));
      wl.forEach((m, i) => webs.setMatrixAt(i, m));
      webs.count = wl.length; webs.name = 'cobwebs'; webs.renderOrder = 2;
      webs.frustumCulled = false;
      grp.add(webs); disposables.push(pw);
    })();

    /* ================================ траншея, блиндаж, проволока ===== */
    (function battlefield() {
      if (!F || !F.TRENCH) return;
      const T = F.TRENCH, P = T.pts, nx = T.nx, nz = T.nz;
      const stake = new Merge(), soil = new Merge(), helm = new Merge(), rust = new Merge(), voidM = new Merge(), HL = [];
      const rotCol = woodCol([0.25, 0.21, 0.17], 0.35);
      /* обшивка: гнилые колья и доски вдоль стенок (местами) */
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez), dx = ex / L, dz = ez / L;
        if (F.trackD((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) < 3) continue;
        for (const side of [-1, 1]) {
          if (rnd() < 0.35) continue;
          for (let s = 0.4; s < L - 0.3; s += R(0.6, 1.0)) {
            if (rnd() < 0.3) continue;
            const x = a[0] + dx * s - dz * side * 0.62, z = a[1] + dz * s + dx * side * 0.62;
            const hh = R(0.7, 1.1), y = H(x, z) - hh + R(0.12, 0.45);
            const c = new THREE.CylinderGeometry(0.035, 0.045, hh, 5); c.translate(0, hh / 2, 0);
            stake.add(c, mtx(x, y, z, R(-0.2, 0.2) + side * 0.12 * dx, 0, R(-0.2, 0.2)), rotCol);
          }
          if (rnd() < 0.5) {
            const s = R(0.3, L - 1.8), x = a[0] + dx * (s + 0.8) - dz * side * 0.5, z = a[1] + dz * (s + 0.8) + dx * side * 0.5;
            const bx = new THREE.BoxGeometry(0.035, 0.16, R(1.2, 1.9));
            stake.add(bx, mtx(x, H(x, z) + R(0.05, 0.25), z, R(-0.3, 0.3), Math.atan2(dx, dz), side * 0.5), rotCol);
          }
        }
      }
      const woodM = new Merge();
      gw.trenchStats = trenchDetail(THREE, F, H, stake, woodM);
      /* блиндаж: земляной холм с бревенчатым накатом, вход — к траншее */
      const [dx0, dz0] = T.dug, rotY = Math.atan2(nx, nz);
      const y0 = H(dx0, dz0);
      const D = new THREE.Matrix4().compose(V.set(dx0, y0 - 0.05, dz0), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), S3.set(1, 1, 1));
      const at = (x, y, z, rx, ry, rz, sx, sy, sz) => D.clone().multiply(mtx(x, y, z, rx, ry, rz, sx, sy, sz));
      /* v13: земляная обсыпка блиндажа. Раньше — половина эллипсоида
         (гладкий «камень» с градиентом цвета вершин). Теперь — насыпь:
         профиль купола с плоской вершиной (под ней бревенчатый накат),
         неровности грунта, а край — на рельефе и уходит под него, без
         ступеньки. Материал — тот же лесной грунт с хвоей, что и под
         ногами (трипланарная проекция по миру), чуть темнее: свежая
         насыпь из-под дёрна. */
      {
        const NR = 22, NA = 44, RX = 2.95, RZ = 2.55, HM = 1.42, CZ = -1.15;
        const pos = [], idx = [];
        const ln = (x, z) => Math.sin(x * 2.3 + z * 1.7) * 0.5 + Math.sin(x * 5.1 - z * 3.7) * 0.25 + Math.sin(z * 8.3 + x * 6.1) * 0.12;
        const Wv = new THREE.Vector3();
        for (let i = 0; i <= NR; i++) {
          const rr = i / NR;
          for (let j = 0; j < (i === 0 ? 1 : NA); j++) {
            const an = j / NA * TAU + (i % 2) * 0.5 / NA * TAU;
            const lx = Math.cos(an) * rr * RX, lz = CZ + Math.sin(an) * rr * RZ;
            /* купол: плоский верх до 0,35 радиуса, склон ~30°, у подошвы — полого */
            const t = Math.min(1, Math.max(0, (rr - 0.32) / 0.68));
            let hh = HM * (1 - t * t * (3 - 2 * t));
            hh += (0.07 * ln(lx, lz) + 0.035 * ln(lz * 2.1, lx * 1.9)) * (1 - rr * 0.6) * (rr > 0.97 ? 0 : 1);
            Wv.set(lx, 0, lz).applyMatrix4(D);
            const gy = H(Wv.x, Wv.z) - (y0 - 0.05);
            const ly = gy + (rr >= 0.999 ? -0.06 : hh);
            Wv.set(lx, ly, lz).applyMatrix4(D);
            pos.push(Wv.x, Wv.y, Wv.z);
          }
        }
        const ring = (i) => (i === 0 ? 0 : 1 + (i - 1) * NA);
        for (let j = 0; j < NA; j++) idx.push(0, ring(1) + (j + 1) % NA, ring(1) + j);
        for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) {
          const a0 = ring(i) + j, a1 = ring(i) + (j + 1) % NA, b0 = ring(i + 1) + j, b1 = ring(i + 1) + (j + 1) % NA;
          idx.push(a0, a1, b1, a0, b1, b0);
        }
        const mg = new THREE.BufferGeometry();
        mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        mg.setIndex(idx);
        mg.computeVertexNormals();
        mg.computeBoundingSphere();
        const GW = root.GWorld;
        const mMat = GW && GW.triplanarMat ? GW.triplanarMat(THREE, 'floorA', 1.6, [0.76, 0.7, 0.62]) : soilMat;
        mesh(mg, mMat, 'dugout_mound');
      }
      const logCol = woodCol([0.27, 0.23, 0.18], 0.3);
      /* передняя стенка из брёвен с проёмом */
      for (let row = 0; row < 6; row++) {
        const yy = 0.1 + row * 0.17;
        for (const side of [-1, 1]) {
          if (row < 5) {
            const L = 0.95;
            const c = new THREE.CylinderGeometry(0.085, 0.09, L, 7);
            stake.add(c, at(side * (0.45 + L / 2), yy, 1.02, 0, 0, Math.PI / 2 + R(-0.03, 0.03)), logCol);
          }
        }
        if (row === 5) {
          const c = new THREE.CylinderGeometry(0.09, 0.1, 2.9, 7);
          stake.add(c, at(0, yy, 1.05, 0, 0, Math.PI / 2 + 0.02), logCol);
        }
      }
      /* торцы брёвен наката над входом */
      for (let i = 0; i < 9; i++) {
        const c = new THREE.CylinderGeometry(0.08, 0.085, 0.9, 7);
        stake.add(c, at(-1.2 + i * 0.3, 1.04 + R(-0.02, 0.03), 0.85, Math.PI / 2 + R(-0.05, 0.05), 0, 0), logCol);
      }
      /* стойки входа и ступени */
      for (const side of [-1, 1]) stake.add(new THREE.CylinderGeometry(0.075, 0.085, 1.05, 7), at(side * 0.43, 0.5, 1.07, R(-0.04, 0.04), 0, side * 0.03), logCol);
      for (let i = 0; i < 2; i++) stake.add(new THREE.BoxGeometry(0.85, 0.05, 0.25), at(0, 0.02 - i * 0.12, 1.35 + i * 0.3, 0.1, 0, R(-0.06, 0.06)), logCol);
      voidM.add(new THREE.BoxGeometry(0.78, 0.98, 1.2), at(0, 0.48, 0.4));
      addCol({ type: 'cyl', x: dx0 - nx * 0.6, z: dz0 - nz * 0.6, r: 2.0, h: 1.2 });
      perches.push({ x: dx0 - nx * 0.6, y: y0 + 1.25, z: dz0 - nz * 0.6, ground: false, play: true });

      /* колючая проволока перед траншеей: покосившиеся колья, провисшие нити,
         спираль на земле. Ржавчина. */
      const wire = (pts, r) => {
        const curve = new THREE.CatmullRomCurve3(pts);
        const g = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), r || 0.005, 3, false);
        rust.add(g);
      };
      const off = 4.2, posts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, a = P[0], b = P[P.length - 1];
        const x = a[0] + (b[0] - a[0]) * t + nx * (off + R(-0.5, 0.5)), z = a[1] + (b[1] - a[1]) * t + nz * (off + R(-0.5, 0.5));
        if (F.trackD(x, z) < 2.5) { posts.push(null); continue; }
        const fallen = rnd() < 0.18, hh = fallen ? 0.35 : R(0.9, 1.25), lean = fallen ? 1.2 : R(-0.25, 0.25);
        const y = H(x, z);
        stake.add(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 5).translate(0, 0.75, 0), mtx(x, y - (1.5 - hh), z, lean, R(0, TAU), R(-0.15, 0.15)), rotCol);
        posts.push({ x, z, y, h: fallen ? 0.25 : hh * Math.cos(lean) });
      }
      for (let i = 0; i < posts.length - 1; i++) {
        const a = posts[i], b = posts[i + 1];
        if (!a || !b) continue;
        for (const hk of [0.45, 0.85]) {
          if (rnd() < 0.2) continue;
          const pts = [];
          const sag = R(0.1, 0.4) + (rnd() < 0.25 ? 0.6 : 0);
          for (let s = 0; s <= 6; s++) {
            const u = s / 6, x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
            const yb = (a.y + Math.min(a.h, hk)) * (1 - u) + (b.y + Math.min(b.h, hk)) * u - sag * Math.sin(u * Math.PI);
            pts.push(new THREE.Vector3(x, Math.max(yb, H(x, z) + 0.03), z));
          }
          wire(pts);
        }
      }
      /* спираль Бруно, примятая, на земле */
      {
        const a = P[1], b = P[3];
        const pts = [], L = 9, ax = (b[0] - a[0]), az = (b[1] - a[1]), al = Math.hypot(ax, az);
        for (let s = 0; s <= 260; s++) {
          const u = s / 260, ang = u * TAU * 22, rr = 0.42 * (0.85 + 0.15 * Math.sin(u * 37));
          const cx = a[0] + nx * 2.6 + ax / al * u * L, cz = a[1] + nz * 2.6 + az / al * u * L;
          const x = cx + nx * Math.cos(ang) * rr, z = cz + nz * Math.cos(ang) * rr;
          const yg = H(cx, cz);
          pts.push(new THREE.Vector3(x, Math.max(yg + 0.02, yg + 0.3 + Math.sin(ang) * rr * 0.7), z));
        }
        wire(pts, 0.006);
      }
      /* каски: оплывшие, ржавые, во мху — на дне траншеи, у блиндажа,
         одна — на колу (так отмечали место гибели) */
      const prof = [];
      for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 0.5; prof.push(new THREE.Vector2(Math.sin(a) * 0.135, Math.cos(a) * 0.15 + 0.02)); }
      prof.push(new THREE.Vector2(0.142, 0.012), new THREE.Vector2(0.15, 0.0));
      const hgeo = new THREE.LatheGeometry(prof, 16);
      const helmCol = (x, y, z) => { const m = Math.sin(x * 61 + z * 47) * Math.sin(y * 83 + x * 13); return m > 0.35 ? [lin(0.36), lin(0.22), lin(0.13)] : [lin(0.24), lin(0.25), lin(0.19)]; };
      const spots = [];
      for (let i = 0; i < 3; i++) { const p = P[1 + i * 2]; spots.push([p[0] + R(-0.3, 0.3), p[1] + R(-0.3, 0.3), R(0.3, 1.2)]); }
      spots.push([dx0 + nx * 1.9 + 0.6, dz0 + nz * 1.9 - 0.4, R(0.2, 0.8)]);
      for (const [x, z, tilt] of spots) HL.push({ m: mtx(x, H(x, z) - 0.06, z, tilt, R(0, TAU), R(-0.4, 0.4), 1.0, 0.92, 1.12) });
      { /* каска на колу */
        const x = P[5][0] - nx * 2.3, z = P[5][1] - nz * 2.3, y = H(x, z);
        stake.add(new THREE.CylinderGeometry(0.03, 0.04, 1.2, 5).translate(0, 0.6, 0), mtx(x, y - 0.3, z, 0.06, 0, -0.05), rotCol);
        HL.push({ m: mtx(x + 0.03, y + 0.78, z, 0.12, R(0, TAU), -0.08, 1.0, 0.92, 1.12), pole: true });
      }
      /* v8: каски — отдельные предметы: от попадания звенят, подскакивают и катятся */
      for (const h of HL) {
        const ox = R(-9, 9), oz = R(-9, 9);
        const g = new Merge().add(hgeo, null, (x, y, z) => helmCol(x + ox, y, z + oz)).build(THREE);
        const m = new THREE.Mesh(g, helmMat); m.name = 'helmet_v8'; m.castShadow = true; m.receiveShadow = true;
        h.m.decompose(m.position, m.quaternion, m.scale);
        grp.add(m); disposables.push(g);
        h.mesh = m; h.vel = new THREE.Vector3(); h.av = new THREE.Vector3(); h.rest = true;
        if (world.v8props) {
          h.px = world.v8props.sph(m.position.x, m.position.y + 0.07, m.position.z, 0.15, { mat: 'metal', name: 'helmet',
            onHit: (hit, dir) => {
              h.vel.addScaledVector(dir, R(2.2, 3.4)); h.vel.y += R(1.6, 2.8);
              h.av.set(R(-14, 14), R(-10, 10), R(-14, 14)); h.rest = false; h.pole = false;
              gw.helmStats = (gw.helmStats || 0) + 1;
            } });
        }
        helmsV8.push(h);
      }
      mesh(stake.build(THREE), rotWood, 'trench_log');
      /* v26: доски обшивки, настил и ящики — текстура старого дерева стрельбища
         (те же карты, что у щитов и стоек: без новой памяти), цвет вершин — множитель */
      {
        const RM = world.rangeMats, wm = RM && RM.wood && RM.wood.map ? RM.wood.clone() : null;
        if (wm) { wm.vertexColors = true; wm.color.multiplyScalar(0.92); }
        mesh(woodM.build(THREE), wm || rotWood, 'trench_planks');
        if (wm) disposables.push(wm);
      }
      mesh(soil.build(THREE), soilMat, 'dugout_earth');
      /* бруски блиндажа и холм — для пуль */
      if (world.v8props) {
        world.v8props.box(dx0 + nx * 1.0, y0 + 0.5, dz0 + nz * 1.0, 1.45, 0.55, 0.12, rotY, { mat: 'wood', name: 'dugout_log' });
        world.v8props.sph(dx0 - nx * 1.1, y0 - 0.6, dz0 - nz * 1.1, 2.2, { mat: 'ground', ground: true, name: 'dugout_earth' });
      }
      mesh(rust.build(THREE), rustMat, 'barbed_wire', false);
      mesh(voidM.build(THREE), voidMat, 'dugout_void', false);
      /* паутина в проёме блиндажа */
      if (webs && webs.count < webs.instanceMatrix.count) {
        webs.setMatrixAt(webs.count++, at(0.05, 0.75, 1.0, 0, 0, 0.3, 0.75, 0.75, 1));
        webs.instanceMatrix.needsUpdate = true;
      }
    })();
    if (GG) { GG.markTree(grp, 1, 1); if (lichen) GG.setK(lichen.material, 0.8, 0.5); }

    /* ======================================================= туман ==== */
    const WMAX = 150;
    const wisp = (function () {
      const base = new THREE.PlaneGeometry(1, 1); base.translate(0, 0.5, 0);
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
      const aP = new Float32Array(WMAX * 4), aS = new Float32Array(WMAX * 3);
      let n = 0;
      for (let tries = 0; tries < 6000 && n < WMAX; tries++) {
        const x = R(-55, 55), z = R(-55, 55);
        const low = GG ? GG.lowAt(x, z) : 0.5, cn = GG ? GG.canopyAt(x, z) : 0.5;
        if (rnd() > 0.25 + 0.6 * low + 0.25 * cn) continue;
        if (F && F.clearE(x, z) < 0.6) continue;
        aP.set([x, R(-0.25, 0.35), z, R(0, TAU)], n * 4);
        aS.set([R(4, 10), R(1.3, 3.2), rnd()], n * 3);
        n++;
      }
      g.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
      g.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 3));
      g.instanceCount = n;
      const U2 = {
        uCanopy: { value: GG ? GG.tex : null }, uT: { value: 0 }, uWind: { value: new THREE.Vector2(0.25, 0.12) },
        uCam: { value: new THREE.Vector3() }, uBox: { value: 55 }, uAmt: { value: 0.5 },
        uCol: { value: new THREE.Color(0.1, 0.11, 0.12) }, uFl: { value: new THREE.Vector4(0, -999, 0, 0) }, uFlC: { value: new THREE.Color(1, 0.86, 0.66) },
        uMf: { value: new THREE.Vector4(0, -999, 0, 0) }, uMfC: { value: new THREE.Color(1, 0.7, 0.4) }
      };
      const mat = new THREE.ShaderMaterial({ uniforms: U2, vertexShader: WISP_VS, fragmentShader: WISP_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false; m.name = 'fog_wisps'; m.renderOrder = 3;
      grp.add(m);
      return { mesh: m, U: U2, n };
    })();

    /* ========================================================= вороны == */
    const crowMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0f, roughness: 0.5, metalness: 0.05 });
    if (GG) GG.setK(crowMat, 0.5, 0);
    const crowGeo = (() => {
      const m = new Merge();
      m.add(new THREE.SphereGeometry(1, 10, 7), mtx(0, 0, 0, 0, 0, 0, 0.085, 0.08, 0.19));
      m.add(new THREE.SphereGeometry(0.058, 9, 6), mtx(0, 0.045, 0.17));
      m.add(new THREE.ConeGeometry(0.02, 0.075, 5), mtx(0, 0.04, 0.255, Math.PI / 2, 0, 0));
      m.add(new THREE.BoxGeometry(0.11, 0.012, 0.17), mtx(0, 0.0, -0.24, -0.12, 0, 0));
      return m.build(THREE);
    })();
    const wingGeo = (() => {
      const s = new THREE.Shape();
      s.moveTo(0, 0.06); s.lineTo(0.2, 0.07); s.lineTo(0.42, 0.02); s.lineTo(0.47, -0.05); s.lineTo(0.3, -0.1); s.lineTo(0, -0.08);
      const g = new THREE.ShapeGeometry(s); g.rotateX(Math.PI / 2);
      return g;
    })();
    disposables.push(crowGeo, wingGeo);
    const crows = [];
    function makeCrow() {
      const g = new THREE.Group(); g.name = 'crow';
      const body = new THREE.Mesh(crowGeo, crowMat); body.castShadow = true; g.add(body);
      const wl = new THREE.Group(), wr = new THREE.Group();
      const ml = new THREE.Mesh(wingGeo, crowMat), mr = new THREE.Mesh(wingGeo, crowMat);
      ml.material = crowMat; mr.scale.x = -1; ml.castShadow = mr.castShadow = true;
      crowMat.side = THREE.DoubleSide;
      wl.add(ml); wr.add(mr); wl.position.set(0.05, 0.03, 0.04); wr.position.set(-0.05, 0.03, 0.04);
      g.add(wl, wr);
      grp.add(g);
      return { g, wl, wr, body, st: 'perch', v: new THREE.Vector3(), t: 0, ph: R(0, TAU), home: null, tgt: new THREE.Vector3(), circ: null, nextCaw: R(5, 30), scareAt: -1 };
    }
    /* v21: ворон нет (по запросу) — стая не создаётся */
    const NO_BIRDS = true;
    const nearP = NO_BIRDS ? [] : perches.filter((p) => p.play).slice(0, 4);
    for (const p of nearP) { const c = makeCrow(); c.home = p; c.g.position.set(p.x, p.y, p.z); c.g.rotation.y = R(0, TAU); crows.push(c); }
    /* две вороны на земле у кромки поляны/траншеи */
    for (let k = 0, tries = 0; !NO_BIRDS && k < 2 && tries < 400; tries++) {
      const a = R(0, TAU), x = Math.cos(a) * 16, z = 3.2 + Math.sin(a) * 13;
      if (!freeAt(x, z, 1.0, true)) continue;
      const c = makeCrow(); c.home = { x, y: H(x, z) + 0.08, z, ground: true }; c.g.position.set(x, c.home.y, z); crows.push(c); k++;
    }
    /* три кружат высоко */
    for (let k = 0; !NO_BIRDS && k < 3; k++) {
      const c = makeCrow(); c.st = 'circle'; c.home = null;
      c.circ = { cx: R(-30, 30), cz: R(-10, 40), r: R(22, 38), h: R(30, 42), w: (rnd() < 0.5 ? 1 : -1) * R(0.18, 0.3), a: R(0, TAU) };
      c.g.position.set(c.circ.cx + Math.cos(c.circ.a) * c.circ.r, c.circ.h, c.circ.cz + Math.sin(c.circ.a) * c.circ.r);
      c.v.set(-Math.sin(c.circ.a), 0, Math.cos(c.circ.a)).multiplyScalar(c.circ.w * c.circ.r);
      crows.push(c);
    }
    gw.crows = crows;

    const _cR = new THREE.Vector3(), _cD = new THREE.Vector3();
    function sp(pos, base) {
      const d = camera.position.distanceTo(pos);
      _cD.copy(pos).sub(camera.position); _cR.set(1, 0, 0).applyQuaternion(camera.quaternion);
      return { pan: d > 0.05 ? clamp(_cD.dot(_cR) / d, -1, 1) * 0.75 : 0, gain: (base || 1) * clamp(6 / Math.max(6, d), 0.04, 1),
        lp: clamp(16000 / (1 + d * 0.04), 1200, 16000), delay: d / 343, dist: d };
    }
    const A = () => gw.audio;
    function takeOff(c, from, delay) {
      if (c.st !== 'perch') return;
      c.st = 'wait'; c.t = -delay;
      c.from = from ? from.clone() : camera.position.clone();
    }
    gw.scare = function (pos, k) {
      if (!pos) return;
      for (const c of crows) {
        if (c.st !== 'perch') { if (c.st === 'circle') c.calm = 0; continue; }
        const d = c.g.position.distanceTo(pos);
        if (d < 18 + 32 * (k || 1)) takeOff(c, pos, d / 343 + R(0.05, 0.4));
      }
    };
    function updateCrow(c, dt) {
      const p = c.g.position;
      c.t += dt;
      if (c.st === 'perch') {
        /* покой: повороты головы-корпуса, клевки на земле */
        c.ph += dt;
        if (c.ph > 2.5 + Math.sin(c.t * 0.7) * 1.5) { c.ph = 0; c.g.rotation.y += R(-0.9, 0.9); }
        c.body.rotation.x = c.home && c.home.ground ? Math.max(0, Math.sin(c.t * 2.3) * 0.6 - 0.2) : -0.35;
        c.wl.rotation.set(0, 0, 0); c.wr.rotation.set(0, 0, 0);
        c.wl.scale.x = c.wr.scale.x = 0.45;
        c.wl.rotation.y = 1.25; c.wr.rotation.y = -1.25;
        const dc = camera.position.distanceTo(p);
        if (dc < (c.home && c.home.ground ? 7 : 4)) takeOff(c, camera.position, R(0.05, 0.3));
        return;
      }
      if (c.st === 'wait') {
        if (c.t < 0) return;
        c.st = 'fly'; c.t = 0;
        _cD.copy(p).sub(c.from); _cD.y = 0; if (_cD.lengthSq() < 0.01) _cD.set(1, 0, 0); _cD.normalize();
        c.v.set(_cD.x * 3, 4.5, _cD.z * 3);
        c.tgt.set(p.x + _cD.x * R(35, 55), R(28, 40), p.z + _cD.z * R(35, 55));
        c.circ = { cx: c.tgt.x, cz: c.tgt.z, r: R(18, 30), h: c.tgt.y, w: (rnd() < 0.5 ? 1 : -1) * R(0.2, 0.32), a: 0 };
        c.calm = 0;
        if (A()) { const s = sp(p, 0.7); A().wings && A().wings(s, 9); A().crow && A().crow(s, 2 + (rnd() * 3 | 0)); }
        c.wl.scale.x = c.wr.scale.x = 1; c.wl.rotation.y = c.wr.rotation.y = 0;
      }
      let flap = 0;
      if (c.st === 'fly') {
        _cD.copy(c.tgt).sub(p);
        const d = _cD.length();
        _cD.normalize().multiplyScalar(10);
        c.v.lerp(_cD, 1 - Math.exp(-dt * 1.2));
        flap = 1;
        if (d < 6) { c.st = 'circle'; c.circ.a = Math.atan2(p.z - c.circ.cz, p.x - c.circ.cx); c.t = 0; }
      } else if (c.st === 'circle') {
        const C = c.circ;
        C.a += C.w * dt;
        c.tgt.set(C.cx + Math.cos(C.a) * C.r, C.h + Math.sin(C.a * 2.3) * 2, C.cz + Math.sin(C.a) * C.r);
        _cD.copy(c.tgt).sub(p).multiplyScalar(0.8);
        _cD.clampLength(0, 11);
        c.v.lerp(_cD, 1 - Math.exp(-dt * 1.0));
        flap = (Math.sin(c.t * 0.9 + c.ph) > 0.35 || c.v.y > 0.6) ? 1 : 0;
        c.calm = (c.calm || 0) + dt;
        /* вернуться на насест, если там тихо и игрок далеко */
        if (c.home && c.calm > 22 && camera.position.distanceTo(V.set(c.home.x, c.home.y, c.home.z)) > 14) { c.st = 'land'; c.t = 0; }
      } else if (c.st === 'land') {
        const h = c.home;
        _cD.set(h.x - p.x, h.y - p.y, h.z - p.z);
        const d = _cD.length();
        const sp0 = clamp(d * 0.6, 1.2, 9);
        _cD.normalize().multiplyScalar(sp0);
        c.v.lerp(_cD, 1 - Math.exp(-dt * 2.0));
        flap = d < 4 ? 1 : 0;
        if (d < 0.25) { c.st = 'perch'; p.set(h.x, h.y, h.z); c.v.set(0, 0, 0); c.g.rotation.set(0, R(0, TAU), 0); return; }
      }
      p.addScaledVector(c.v, dt);
      /* ориентация по скорости, крен в повороте */
      const sp1 = Math.hypot(c.v.x, c.v.z);
      if (sp1 > 0.2) {
        const yaw = Math.atan2(c.v.x, c.v.z), dy = U.wrapPI(yaw - c.g.rotation.y);
        c.g.rotation.order = 'YXZ';
        c.g.rotation.y += dy * Math.min(1, dt * 6);
        c.g.rotation.x = -Math.atan2(c.v.y, sp1) * 0.6;
        c.g.rotation.z = clamp(-dy * 1.5, -0.7, 0.7);
      }
      c.body.rotation.x = 0;
      const fa = flap ? Math.sin(c.t * 22 + c.ph) * 0.95 : 0.08 + Math.sin(c.t * 2) * 0.04;
      c.wl.rotation.z = fa; c.wr.rotation.z = -fa;
      c.nextCaw -= dt;
      if (c.nextCaw < 0) { c.nextCaw = R(9, 30); if (A() && A().crow) A().crow(sp(p, 0.55), 1 + (rnd() * 3 | 0)); }
    }

    /* ======================================= осветительные ракеты ===== */
    const FL = { auto: false, list: [], timer: R(5, 10), light: null, puffs: [], pi: 0 };
    gw.flares = FL;
    const glowTex = new THREE.CanvasTexture(glowCanvas()), puffTex = new THREE.CanvasTexture(puffCanvas());
    glowTex.colorSpace = puffTex.colorSpace = THREE.SRGBColorSpace;
    function ensureLight() {
      if (FL.light) return FL.light;
      const L = new THREE.SpotLight(0xffd2a0, 0, 0, 0.95, 0.55, 2);
      L.castShadow = gw.quality !== 'low';
      L.shadow.mapSize.set(1024, 1024);
      L.shadow.camera.near = 8; L.shadow.camera.far = 240;
      L.shadow.bias = -0.0006; L.shadow.normalBias = 0.05;
      L.shadow.autoUpdate = false;
      L.position.set(0, -500, 0);
      scene.add(L); scene.add(L.target);
      FL.light = L;
      return L;
    }
    for (let i = 0; i < 48; i++) {
      const m = new THREE.SpriteMaterial({ map: puffTex, color: 0x8a8a88, transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(m); s.visible = false; grp.add(s);
      FL.puffs.push({ s, t: 0, life: 1, v: new THREE.Vector3() });
    }
    const puff = (pos, size, life, vy) => {
      const P = FL.puffs[FL.pi++ % FL.puffs.length];
      P.s.position.copy(pos); P.s.visible = true; P.t = 0; P.life = life; P.size = size; P.v.set(R(-0.2, 0.2), vy || 0.3, R(-0.2, 0.2));
    };
    /* o: {x,z} — точка над землёй (иначе — случайно впереди игрока), at: 'burn' — сразу горит (для съёмки) */
    gw.launchFlare = function (o) {
      o = o || {};
      ensureLight();
      let x = o.x, z = o.z;
      if (x === undefined) {
        camera.getWorldDirection(_cD); _cD.y = 0; _cD.normalize();
        const a = Math.atan2(_cD.x, _cD.z) + R(-0.9, 0.9), d = R(30, 65);
        x = camera.position.x + Math.sin(a) * d; z = camera.position.z + Math.cos(a) * d;
      }
      const g0 = H(x, z), apex = g0 + (o.h || R(55, 75));
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff4e0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.25 }));
      core.material.userData.noGloom = halo.material.userData.noGloom = true;
      grp.add(core, halo);
      const f = { x, z, g0, apex, pos: new THREE.Vector3(x + R(-15, 15), g0 + 1, z + R(-15, 15)), t: 0, st: o.at === 'burn' ? 'burn' : 'rise',
        core, halo, burn: o.burn || R(24, 30), sw: R(0, TAU), k: 0, puffT: 0 };
      f.start = f.pos.clone();
      if (f.st === 'burn') { f.pos.set(x, apex - 6, z); f.t = o.t0 || 4; }
      FL.list.push(f);
      if (A() && A().nz && A().ctx && f.st === 'rise') {
        const s = sp(f.start, 0.6);
        try { A().nz(A().now(s.delay), 0.5, { type: 'bandpass', freq: 1400, freq2: 3000, q: 1.2, gain: 0.05 * s.gain * 6, atk: 0.05, out: A().spatial(s) }); } catch (e) { /* звук необязателен */ }
      }
      return f;
    };
    function updateFlares(dt) {
      const L = FL.light;
      let best = null;
      for (let i = FL.list.length - 1; i >= 0; i--) {
        const f = FL.list[i];
        f.t += dt;
        if (f.st === 'rise') {
          const u = Math.min(1, f.t / 2.4), e = 1 - (1 - u) * (1 - u);
          f.pos.lerpVectors(f.start, V.set(f.x, f.apex, f.z), e);
          f.k = 0.06;
          f.puffT -= dt; if (f.puffT < 0) { f.puffT = 0.05; puff(f.pos, 1.2, 5, 0.2); }
          if (u >= 1) {
            f.st = 'burn'; f.t = 0;
            if (A() && A().nz && A().ctx) { const s = sp(f.pos, 0.8); try { A().nz(A().now(s.delay), 0.08, { type: 'lowpass', freq: 900, q: 0.7, gain: 0.3 * s.gain * 6, atk: 0.003, out: A().spatial(s) }); } catch (e) { /* */ } }
          }
        } else if (f.st === 'burn') {
          /* спуск ~2,3 м/с, снос ветром, маятник под куполом */
          f.pos.y -= 2.3 * dt;
          f.pos.x += 0.6 * dt; f.pos.z += 0.3 * dt;
          const ramp = Math.min(1, f.t / 0.5), end = clamp((f.burn - f.t) / 2.5, 0, 1);
          const fl = 0.9 + 0.06 * Math.sin(f.t * 53) + 0.05 * Math.sin(f.t * 31 + 1) + (end < 1 ? (Math.random() - 0.5) * 0.4 * (1 - end) : 0);
          f.k = ramp * end * fl;
          f.puffT -= dt; if (f.puffT < 0) { f.puffT = 0.22; puff(f.pos, 2.2, 7, 0.6); }
          if (f.t > f.burn || f.pos.y < f.g0 + 4) { f.st = 'dead'; f.t = 0; f.k = 0; }
        } else {
          f.k = 0;
          if (f.t > 1) { grp.remove(f.core, f.halo); f.core.material.dispose(); f.halo.material.dispose(); FL.list.splice(i, 1); continue; }
        }
        const sw = Math.sin(f.t * 1.25 + f.sw) * 1.4, sw2 = Math.cos(f.t * 0.9 + f.sw) * 0.9;
        f.lp = f.lp || new THREE.Vector3();
        f.lp.set(f.pos.x + sw, f.pos.y - 1.5, f.pos.z + sw2);
        f.core.position.copy(f.lp); f.halo.position.copy(f.lp);
        const ks = Math.max(0.05, f.k);
        f.core.scale.setScalar(2.4 * (0.6 + 0.4 * ks)); f.core.material.opacity = Math.min(1, ks * 1.2);
        f.halo.scale.setScalar(26 * ks); f.halo.material.opacity = 0.22 * ks;
        if (!best || f.k > best.k) best = f;
      }
      if (L) {
        if (best && best.k > 0.01) {
          L.position.copy(best.lp);
          L.target.position.set(best.lp.x + (best.lp.x - best.pos.x) * 6, best.lp.y - 100, best.lp.z + (best.lp.z - best.pos.z) * 6);
          L.target.updateMatrixWorld();
          L.intensity = 12000 * best.k;
          L.shadow.autoUpdate = L.castShadow;
          if (GG) { GG.L1.x = best.lp.x; GG.L1.y = best.lp.y; GG.L1.z = best.lp.z; GG.L1.w = 3.0 * best.k; GG.C1.x = 1; GG.C1.y = 0.86; GG.C1.z = 0.66; }
          wisp.U.uFl.value.set(best.lp.x, best.lp.y, best.lp.z, 900 * best.k);
        } else {
          L.intensity = 0; L.shadow.autoUpdate = false;
          if (GG) GG.L1.w = 0;
          wisp.U.uFl.value.w = 0;
        }
      }
      /* дым */
      for (const P of FL.puffs) {
        if (!P.s.visible) continue;
        P.t += dt;
        const u = P.t / P.life;
        if (u >= 1) { P.s.visible = false; continue; }
        P.s.position.addScaledVector(P.v, dt);
        P.s.scale.setScalar(P.size * (1 + u * 2.5));
        P.s.material.opacity = 0.5 * (1 - u) * Math.min(1, P.t * 4);
        const lk = best ? Math.min(1, best.k * 3000 / (200 + P.s.position.distanceToSquared(best.lp))) : 0;
        P.s.material.color.setRGB(0.05 + 0.9 * lk, 0.05 + 0.75 * lk, 0.055 + 0.55 * lk);
      }
      if (FL.auto) {
        FL.timer -= dt;
        if (FL.timer < 0) { FL.timer = R(22, 40); gw.launchFlare(); }
      }
    }

    /* ======================================= гроза, артиллерия ======== */
    const pending = [];        // отложенные звуки {t, fn}
    const later = (sec, fn) => pending.push({ t: gw.t + sec, fn });
    let stormT = R(8, 18), artT = R(12, 35), strokes = [];
    function strike(d) {
      d = d || R(0.7, 6);
      const amp = Math.min(1.3, 1.6 / (0.6 + d));
      strokes.push({ t: gw.t, a: amp }, { t: gw.t + R(0.06, 0.12), a: amp * R(0.3, 0.7) });
      if (rnd() < 0.6) strokes.push({ t: gw.t + R(0.18, 0.35), a: amp * R(0.5, 0.9) });
      const pan = R(-0.9, 0.9);
      later(d * 1000 / 343, () => { if (A() && A().thunder) A().thunder(d, pan); });
    }
    gw.strike = strike;

    /* ===================================== пролёт пуль, подавление ==== */
    const _sA = new THREE.Vector3(), _sB = new THREE.Vector3(), _sP = new THREE.Vector3();
    gw.onShot = function (from, to, o) {
      o = o || {};
      gw.scare(from, o.supp ? 0.3 : 1);
      if (o.active || !from || !to) return;
      _sA.copy(from); _sB.copy(to).sub(from);
      const L2 = _sB.lengthSq(); if (L2 < 1) return;
      const t = clamp(_sP.copy(camera.position).sub(_sA).dot(_sB) / L2, 0, 1);
      _sP.copy(_sA).addScaledVector(_sB, t);
      const d = _sP.distanceTo(camera.position), along = Math.sqrt(L2) * t;
      if (d > 4.5 || along < 4 || t >= 0.999) return;
      const k = 1 - d / 4.5;
      gw.sup = Math.min(1, gw.sup + 0.22 + 0.5 * k);
      if (A() && A().bulletPass) { const s = sp(_sP, 1); s.gain = 0.4 + 0.6 * k; s.delay = along / (o.v0 || 800); A().bulletPass(s, (o.v0 || 800) > 360); }
    };

    /* ====================================================== погода ==== */
    const WEATHER = {
      overcast: { wisp: 0.42, web: 0.3, drone: 0.55, art: 1 },
      day: { wisp: 0.3, web: 0.4, drone: 0.25, art: 0.5 },
      morning: { wisp: 0.75, web: 0.5, drone: 0.3, art: 0.6 },
      rain: { wisp: 0.4, web: 0.18, drone: 0.85, art: 0.5 },
      fog: { wisp: 1.0, web: 0.55, drone: 0.45, art: 0.8 },
      dusk: { wisp: 0.65, web: 0.3, drone: 0.7, art: 1.2 },
      night: { wisp: 0.55, web: 0.12, drone: 0.9, art: 1.4 }
    };
    gw.setWeather = function (key, P) {
      const w = WEATHER[key] || WEATHER.day, g = (P && P.gl) || {};
      gw.wisp = g.wisp ?? w.wisp; gw.art = w.art;
      if (webs) webs.material.opacity = w.web;
      FL.auto = !!(P && P.flares);
      if (FL.auto) ensureLight();
      gw.storm = !!(P && P.storm);
      if (A() && A().setDrone) A().setDrone(w.drone);
    };
    gw.setQuality = function (tier) {
      gw.quality = tier;
      wisp.mesh.geometry.instanceCount = Math.min(wisp.n, tier === 'low' ? 40 : tier === 'high' || tier === 'ultra' ? 150 : 95);
      if (FL.light) {
        const cs = tier !== 'low';
        if (FL.light.castShadow !== cs) { FL.light.castShadow = cs; }
        FL.light.shadow.mapSize.set(tier === 'high' || tier === 'ultra' ? 2048 : 1024, tier === 'high' || tier === 'ultra' ? 2048 : 1024);
        if (FL.light.shadow.map) { FL.light.shadow.map.dispose(); FL.light.shadow.map = null; }
      }
    };
    /* сглаживание листвы: alpha-to-coverage при MSAA (край хвои и травы
       получает градиент покрытия вместо «лесенки» alphaTest) */
    gw.foliageAA = function (on) {
      scene.traverse((m) => {
        if (!m.material) return;
        for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
          if (mt.alphaTest > 0 && !mt.transparent && (mt.isMeshStandardMaterial || mt.isMeshLambertMaterial || mt.isMeshPhongMaterial || mt.isMeshBasicMaterial)) {
            if (mt.alphaToCoverage !== !!on) { mt.alphaToCoverage = !!on; mt.needsUpdate = true; }
          }
        }
      });
    };

    /* ====================================================== кадр ====== */
    let spaceT = 0;
    gw.update = function (dt, time, fog) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.1);
      helmStep(dt);
      gw.t += dt;
      lichenUni.value = time;
      /* туман */
      const WU = wisp.U;
      WU.uT.value = time; WU.uCam.value.copy(camera.position);
      if (scene.fog && scene.fog.color) WU.uCol.value.copy(scene.fog.color).multiplyScalar(1.15);
      WU.uAmt.value = gw.wisp * 0.42;
      if (GG) {
        WU.uWind.value.set(GG.W.x * 0.4, GG.W.y * 0.4);
        WU.uMf.value.set(GG.L0.x, GG.L0.y, GG.L0.z, GG.L0.w * 120);
      }
      for (const c of crows) updateCrow(c, dt);
      updateFlares(dt);
      /* гроза */
      if (gw.storm) {
        stormT -= dt;
        if (stormT < 0) { stormT = R(14, 40); strike(); }
      }
      let fl = 0;
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i], a = gw.t - s.t;
        if (a < 0) continue;
        if (a > 0.6) { strokes.splice(i, 1); continue; }
        fl += s.a * Math.exp(-a / 0.07);
      }
      gw.flash = fl;
      /* далёкая артиллерия */
      /* v21: фоновой «далёкой артиллерии» нет — лишний звук */
      artT -= dt;
      if (false && artT < 0) {
        artT = R(18, 60) / Math.max(0.3, gw.art || 1);
        if (A() && A().artillery) A().artillery({ n: 1 + (rnd() * 4 | 0), pan: R(-0.8, 0.8), gain: R(0.5, 1) });
      }
      for (let i = pending.length - 1; i >= 0; i--) if (gw.t >= pending[i].t) { const p = pending.splice(i, 1)[0]; try { p.fn(); } catch (e) { /* */ } }
      /* подавление спадает за ~2 с */
      gw.sup *= Math.exp(-dt / 2.2);
      if (gw.sup < 0.002) gw.sup = 0;
      if (gw.ctrl) gw.ctrl.sup = gw.sup;
      /* пространство звука: под пологом больше реверберации */
      spaceT -= dt;
      if (spaceT < 0 && GG && A() && A().setSpace) { spaceT = 0.5; A().setSpace(GG.canopyAt(camera.position.x, camera.position.z)); }
    };
    gw.dispose = function () { scene.remove(grp); for (const g of disposables) g.dispose(); };
    return gw;
  }

  root.GGloomWorld = { create, _trenchDetail: trenchDetail, _Merge: Merge };
})(typeof self !== 'undefined' ? self : this);
