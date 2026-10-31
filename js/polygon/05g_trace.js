/* Cached static broadphase; exact mesh/proxy narrowphase. No scenery changes.
   v21: быстрый обход (как broadphase в физических движках):
   • клетки 16 м перебираются вдоль луча (2D DDA, Amanatides–Woo), а не всем
     прямоугольником вокруг него; обход обрывается, как только найдено твёрдое
     попадание ближе входа в следующую клетку;
   • у InstancedMesh (кусты, мешки, деревья — тысячи копий) своя сетка копий 8 м:
     точная проверка — только у копий, чья сфера задевает луч (раньше луч
     перебирал ВСЕ копии каждого такого меша — 70 % времени выстрела);
   • заведомо «мягкое» для пули (листва на альфа-карточках, аддитивные блики)
     и скрытое не трассируется вовсе, а не отбрасывается после raycast;
   • числовые ключи клеток, метки вместо Set, без выделения памяти на луч.
   Результат тот же: ближайшее твёрдое попадание (проверка — GTrace.mode='legacy'). */
(function (root) {
  "use strict";
  root.GTrace = {
    mode: 'fast',
    /* копия i скрыта (матрица обнулена + needsUpdate): правим сетку копий на месте,
       без полной перестройки (поваленное дерево, деревья вне сектора) */
    patchHidden(o, i) {
      const G = o && o.__ig;
      if (!G || !o.instanceMatrix || i < 0 || i >= G.n) return false;
      if (G.v !== o.instanceMatrix.version - 1) return false;
      G.S[i * 4 + 3] = -1;
      G.v = o.instanceMatrix.version;
      return true;
    },
    create(THREE, objects, targets) {
      const grid = new Map(),
        boxes = new Map(),
        custom = [],
        dynamic = [],
        CELL = 16,
        IC = 8,
        seen = new Set(),
        buf = [],
        tmp = [];
      let tests = 0,
        rays = 0,
        itests = 0,
        rebuilds = 0,
        stamp = 0;
      let topY = -Infinity;
      const ext = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      const key = (x, z) => (x + 32768) * 65536 + (z + 32768);
      const put = (o, b) => {
        boxes.set(o, b);
        o.__trB = b;
        if (b.max.y > topY) topY = b.max.y;
        ext.x0 = Math.min(ext.x0, b.min.x); ext.x1 = Math.max(ext.x1, b.max.x);
        ext.z0 = Math.min(ext.z0, b.min.z); ext.z1 = Math.max(ext.z1, b.max.z);
        for (let x = Math.floor(b.min.x / CELL); x <= Math.floor(b.max.x / CELL); x++)
          for (let z = Math.floor(b.min.z / CELL); z <= Math.floor(b.max.z / CELL); z++) {
            const k = key(x, z);
            let l = grid.get(k);
            if (!l) grid.set(k, (l = []));
            l.push(o);
          }
      };
      for (const obj of objects) {
        obj.updateMatrixWorld(true);
        const walk = (o) => {
          if (o.isSprite) return; // light/label billboards are visual, not ballistic surfaces
          /* v21: копия только для глаз (у деревьев — свой неподвижный «трассировочный» набор) */
          if (o.userData && o.userData.noTrace) return;
          if (
            o.raycast &&
            o.raycast !== THREE.Object3D.prototype.raycast &&
            !o.isMesh &&
            o.raycast !== THREE.Group.prototype.raycast
          ) {
            custom.push(o);
            /* верх индекса (пуля выше него никого не заденет) — с учётом своих raycast */
            { const cb = new THREE.Box3().setFromObject(o); topY = cb.isEmpty() ? Infinity : Math.max(topY, cb.max.y + 0.15); }
            return;
          }
          if (o.isMesh) {
            let moving = targets.includes(o);
            for (let p = o.parent; p; p = p.parent)
              if (targets.some((t) => t.parent === p)) moving = true;
            if (moving) {
              dynamic.push(o);
              topY = Infinity; // движущиеся мишени: верх не ограничен
              return;
            }
            root.GGeometry?.prepare(o);
            o.geometry.computeBoundingBox();
            const b = o.geometry.boundingBox
              .clone()
              .applyMatrix4(o.matrixWorld);
            if (o.isInstancedMesh) {
              b.makeEmpty();
              const m = new THREE.Matrix4(), gb = new THREE.Box3();
              for (let i = 0; i < o.count; i++) {
                o.getMatrixAt(i, m);
                m.premultiply(o.matrixWorld);
                b.union(gb.copy(o.geometry.boundingBox).applyMatrix4(m));
              }
              o.__ig = null;
            }
            put(o, b.expandByScalar(0.15));
          }
          for (const ch of o.children) walk(ch);
        };
        walk(obj);
      }
      /* «Невидимые стены»: индекс строится один раз, а Mesh.raycast не смотрит
         на visible. Разрушенные/скрытые куски, световые конусы и блики
         (аддитивные, полупрозрачные без записи глубины) пулю не держат.
         soft=true (пули) — листва на альфа-карточках тоже не преграда; для
         видимости ботов (soft не задан) кусты по-прежнему скрывают. */
      function solid(o, soft) {
        for (let p = o; p; p = p.parent) if (p.visible === false) return false;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m) return true;
        if (m.blending === THREE.AdditiveBlending) return false;
        const glass = /glass|стекл|window/i.test((o.name || '') + ' ' + (m.name || '')) || (o.userData && o.userData.mat === 'glass');
        if (m.transparent && !glass && (m.opacity < 0.6 || m.depthWrite === false)) return false;
        if (soft && m.alphaTest > 0 && !glass) return false;
        return true;
      }
      /* то же по материалу, заранее: 0 — может держать, 1 — мягкое для пули, 2 — никогда */
      function matClass(o) {
        const mt = o.material;
        if (o.__trMat === mt && o.__trC !== undefined) return o.__trC;
        o.__trMat = mt;
        const m = Array.isArray(mt) ? mt[0] : mt;
        let c = 0;
        if (m) {
          const glass = /glass|стекл|window/i.test((o.name || '') + ' ' + (m.name || '')) || (o.userData && o.userData.mat === 'glass');
          if (m.blending === THREE.AdditiveBlending) c = 2;
          else if (m.transparent && !glass && (m.opacity < 0.6 || m.depthWrite === false)) c = 2;
          else if (m.alphaTest > 0 && !glass) c = 1;
        }
        return (o.__trC = c);
      }
      function shown(o) {
        for (let p = o; p; p = p.parent) if (p.visible === false) return false;
        return true;
      }
      /* ---- сетка копий InstancedMesh ---- */
      const _m4 = new THREE.Matrix4(), _w4 = new THREE.Matrix4(), _c3 = new THREE.Vector3(), _probe = new THREE.Mesh();
      function igBuild(o) {
        const n = o.count, g = o.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const bs = g.boundingSphere, S = new Float32Array(n * 4), cells = new Map();
        const prev = o.__ig;
        for (let i = 0; i < n; i++) {
          o.getMatrixAt(i, _m4);
          _w4.multiplyMatrices(o.matrixWorld, _m4);
          const sc = _w4.getMaxScaleOnAxis();
          if (!(sc > 1e-6)) { S[i * 4 + 3] = -1; continue; }
          _c3.copy(bs.center).applyMatrix4(_w4);
          const r = bs.radius * sc + 0.05;
          S[i * 4] = _c3.x; S[i * 4 + 1] = _c3.y; S[i * 4 + 2] = _c3.z; S[i * 4 + 3] = r;
          for (let x = Math.floor((_c3.x - r) / IC); x <= Math.floor((_c3.x + r) / IC); x++)
            for (let z = Math.floor((_c3.z - r) / IC); z <= Math.floor((_c3.z + r) / IC); z++) {
              const k = key(x, z);
              let l = cells.get(k);
              if (!l) cells.set(k, (l = []));
              l.push(i);
            }
        }
        rebuilds++;
        const now = performance.now();
        /* меш, который переписывают каждый кадр, сеткой не ускоряем */
        const hot = prev ? (now - prev.t < 1500 ? prev.hot + 1 : 0) : 0;
        return (o.__ig = { v: o.instanceMatrix.version, n, S, cells, st: new Uint32Array(n), q: 0, t: now, hot, mw: o.matrixWorld.elements.slice() });
      }
      function sameMW(a, b) { for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false; return true; }
      /* копии вдоль луча [0, far]: DDA по клеткам 8 м, затем сфера, затем точный raycast копии */
      function rayInstances(o, ray, out, far) {
        let G = o.__ig;
        if (!G || G.v !== o.instanceMatrix.version || G.n !== o.count || !sameMW(G.mw, o.matrixWorld.elements)) {
          if (G && G.hot > 3) { o.__igOff = true; o.raycast(ray, out); return; }
          G = igBuild(o);
        }
        const R = ray.ray, ox = R.origin.x, oy = R.origin.y, oz = R.origin.z, dx = R.direction.x, dy = R.direction.y, dz = R.direction.z;
        const q = (G.q = (G.q + 1) >>> 0) || (G.q = 1, G.st.fill(0), 1);
        const S = G.S, near = ray.near;
        _probe.geometry = o.geometry; _probe.material = o.material;
        const test = (list) => {
          for (let j = 0; j < list.length; j++) {
            const i = list[j];
            if (G.st[i] === q) continue;
            G.st[i] = q;
            const r = S[i * 4 + 3];
            if (r < 0) continue;
            const cx = S[i * 4] - ox, cy = S[i * 4 + 1] - oy, cz = S[i * 4 + 2] - oz;
            let t = cx * dx + cy * dy + cz * dz;
            if (t < near - r || t > far + r) continue;
            t = t < 0 ? 0 : t > far ? far : t;
            const ex = cx - dx * t, ey = cy - dy * t, ez = cz - dz * t;
            if (ex * ex + ey * ey + ez * ez > r * r) continue;
            itests++;
            o.getMatrixAt(i, _m4);
            _probe.matrixWorld.multiplyMatrices(o.matrixWorld, _m4);
            tmp.length = 0;
            _probe.raycast(ray, tmp);
            for (let k = 0; k < tmp.length; k++) { const h = tmp[k]; h.instanceId = i; h.object = o; out.push(h); }
          }
        };
        ddaCells(ox, oz, dx, dz, far, IC, (cx, cz) => { const l = G.cells.get(key(cx, cz)); if (l) test(l); return false; });
      }
      /* 2D DDA по клеткам size вдоль луча до far; visit(cx, cz, tEnter) → true = стоп */
      function ddaCells(ox, oz, dx, dz, far, size, visit) {
        let cx = Math.floor(ox / size), cz = Math.floor(oz / size);
        const sx = dx > 1e-12 ? 1 : dx < -1e-12 ? -1 : 0, sz = dz > 1e-12 ? 1 : dz < -1e-12 ? -1 : 0;
        const tdx = sx ? size / Math.abs(dx) : Infinity, tdz = sz ? size / Math.abs(dz) : Infinity;
        let tmx = sx > 0 ? ((cx + 1) * size - ox) / dx : sx < 0 ? (cx * size - ox) / dx : Infinity;
        let tmz = sz > 0 ? ((cz + 1) * size - oz) / dz : sz < 0 ? (cz * size - oz) / dz : Infinity;
        let t0 = 0;
        for (let guard = 0; guard < 4096; guard++) {
          if (visit(cx, cz, t0)) return;
          if (tmx < tmz) { t0 = tmx; if (t0 > far) return; cx += sx; tmx += tdx; }
          else { t0 = tmz; if (t0 > far) return; cz += sz; tmz += tdz; }
        }
      }
      const _end = new THREE.Vector3();
      function nearestLegacy(ray, ignore, soft) {
        buf.length = 0;
        seen.clear();
        const a = ray.ray.origin,
          b = ray.ray.at(ray.far, _end);
        const x0 = Math.floor(Math.min(a.x, b.x) / CELL),
          x1 = Math.floor(Math.max(a.x, b.x) / CELL),
          z0 = Math.floor(Math.min(a.z, b.z) / CELL),
          z1 = Math.floor(Math.max(a.z, b.z) / CELL);
        for (let x = x0; x <= x1; x++)
          for (let z = z0; z <= z1; z++)
            for (const o of grid.get(key(x, z)) || []) {
              if (seen.has(o) || o === ignore) continue;
              seen.add(o);
              if (!ray.ray.intersectsBox(boxes.get(o))) continue;
              tests++;
              o.raycast(ray, buf);
            }
        for (const o of custom) {
          tests++;
          o.raycast(ray, buf);
        }
        for (const o of dynamic) {
          tests++;
          o.raycast(ray, buf);
        }
        buf.sort((a, b) => a.distance - b.distance);
        for (const h of buf) if (h.object !== ignore && solid(h.object, soft)) return h;
        return null;
      }
      return {
        nearest(ray, ignore, soft) {
          rays++;
          if (root.GTrace.mode === 'legacy') return nearestLegacy(ray, ignore, soft);
          const R = ray.ray, far = ray.far;
          const fho = ray.firstHitOnly;
          /* у каждого меша нужен только ближайший вход: «твёрдость» одна на весь меш */
          ray.firstHitOnly = true;
          let best = null, bestD = far;
          const st = (stamp = (stamp + 1) >>> 0) || (stamp = 1);
          const consider = () => {
            for (let k = 0; k < buf.length; k++) {
              const h = buf[k];
              if (h.distance <= bestD && h.object !== ignore && solid(h.object, soft)) {
                if (!best || h.distance < bestD) { best = h; bestD = h.distance; }
              }
            }
            buf.length = 0;
          };
          try {
            ddaCells(R.origin.x, R.origin.z, R.direction.x, R.direction.z, far, CELL, (cx, cz, t0) => {
              if (t0 > bestD) return true;
              const list = grid.get(key(cx, cz));
              if (!list) return false;
              for (let i = 0; i < list.length; i++) {
                const o = list[i];
                if (o.__trS === st) continue;
                o.__trS = st;
                if (o === ignore) continue;
                const mc = matClass(o);
                if (mc === 2 || (soft && mc === 1)) continue;
                if (!shown(o)) continue;
                if (!R.intersectsBox(o.__trB)) continue;
                tests++;
                buf.length = 0;
                if (o.isInstancedMesh && o.count > 24 && !o.__igOff) rayInstances(o, ray, buf, bestD);
                else o.raycast(ray, buf);
                consider();
              }
              return false;
            });
            for (const o of custom) { tests++; buf.length = 0; o.raycast(ray, buf); consider(); }
            for (const o of dynamic) { tests++; buf.length = 0; o.raycast(ray, buf); consider(); }
          } finally {
            ray.firstHitOnly = fho;
            buf.length = 0;
          }
          return best;
        },
        stats: () => ({
          rays,
          tests,
          itests,
          rebuilds,
          meshes: boxes.size,
          custom: custom.length,
          dynamic: dynamic.length,
          topY: +topY.toFixed(2),
          bvh: root.GGeometry?.stats(),
        }),
        topY: () => topY,
        extent: () => ext,
        invalidate() {
          grid.clear();
        },
      };
    },
  };
})(window);
