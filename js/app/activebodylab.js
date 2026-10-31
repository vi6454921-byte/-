/* Experimental living dynamic body. Deliberately NOT enabled in normal play.
   The lab uses the real skinned character but its own flat Rapier session. */
(function () {
  "use strict";
  if (!new URLSearchParams(location.search).has("activebodylab")) return;
  const hide = document.createElement("style");
  hide.textContent =
    "#intro,#menu,#hud,#battle,#settings,#armory,#loading,#wasd,#itut,#tutorial{display:none!important}";
  document.head.append(hide);
  function wait() {
    if (!window.__GAME || !window.AEGIS_GAME) return setTimeout(wait, 150);
    const G = __GAME,
      A = AEGIS_GAME,
      T = THREE;
    G.pause(true);
    A.setInput(false);
    A.setRender(false);
    window.AEGIS_INTRO?.close();
    const world = {
        bounds: { x0: -50, x1: 50, z0: -50, z1: 50 },
        heightAt: () => 0,
        colliders: [],
      },
      p = GPhysics.get(world);
    const panel = document.createElement("section");
    panel.id = "activebodylab";
    panel.style.cssText =
      "position:fixed;left:12px;top:12px;width:min(290px,38vw);max-height:94vh;overflow:auto;padding:16px;background:#142128ed;color:#eef4ee;z-index:10000;font:13px/1.45 system-ui;border:1px solid #526b77;border-radius:8px";
    panel.innerHTML =
      '<b>Живое тело · 18.4.3 · эксперимент</b><p>19 динамических частей Rapier. Таз не закреплён. Нет KCC и переноса тела анимацией. Отдельная плоскость, без боевого ИИ.</p><p style="color:#ffd082">Равновесие, ходьба и вставание пока ненадёжны на игровых моделях — это не законченный перенос в игру.</p><label>Персонаж <select id="abSoldier"></select></label><p id="abButtons"></p><label>Частота кадра <select id="abHz"><option value="60">60 Гц</option><option value="30">30 Гц</option><option value="20">20 Гц</option></select></label><p><label><input type="checkbox" id="abBones"> Показать коллайдеры</label></p><pre id="abStats" style="white-space:pre-wrap;font:12px/1.4 monospace"></pre><p>Мышь — вращение; колесо — масштаб. «Сброс» пересоздаёт тело, это не физическое вставание.</p>';
    document.body.append(panel);
    const $ = (id) => panel.querySelector("#" + id);
    for (const [i, s] of G.squad.entries())
      $("abSoldier").add(new Option(s.gen?.short || s.key, i));
    const state = {
      i: 0,
      paused: true,
      render: window.__ACTIVEBODY_RENDER !== false,
      yaw: 0.65,
      pitch: 0.16,
      dist: 3.5,
      acc: 0,
      elapsed: 0,
      walk: false,
      offset: 0,
    };
    const grid = new T.GridHelper(100, 100, 0x768f98, 0x485962);
    G.scene.add(grid);
    const floor = new T.Mesh(
      new T.PlaneGeometry(100, 100),
      new T.MeshStandardMaterial({ color: 0x394b54, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.005;
    G.scene.add(floor);
    const lines = new T.LineSegments(
      new T.BufferGeometry(),
      new T.LineBasicMaterial({ color: 0x43ffbd, depthTest: false }),
    );
    lines.frustumCulled = false;
    lines.renderOrder = 100;
    G.scene.add(lines);
    G.scene.fog = null;
    G.scene.background = new T.Color(0x566b78);
    G.scene.children
      .filter((o) => o.isLight)
      .forEach((o) => {
        o.intensity = Math.max(0.9, o.intensity);
      });
    let current = null,
      oldWorld = null;
    function reset() {
      if (current) {
        GActiveBody.detach(p, current);
        current.ctrl._physicsWorld = oldWorld;
      }
      state.walk = false;
      state.acc = 0;
      state.elapsed = 0;
      current = G.squad[state.i];
      oldWorld = current.ctrl._physicsWorld;
      current.dead = false;
      current.finished = false;
      G.poseStand(state.i, { ready: 0 });
      for (const bone of current.char.bones) {
        const at = current.char.rest[bone.name],
          pa = current.char.rest[bone.parent?.name];
        if (at)
          bone.position.set(
            at[0] - (pa?.[0] || 0),
            at[1] - (pa?.[1] || 0),
            at[2] - (pa?.[2] || 0),
          );
        bone.quaternion.identity();
      }
      // A neutral reference is calibrated once, before attaching dynamics.
      for (const side of ["R", "L"])
        current.char.bone("shoulder" + side).rotation.z =
          (side === "R" ? -1 : 1) * 1.2;
      const c = current.ctrl;
      c._physicsWorld = world;
      c.pos.set(0, state.offset + 0.025, 0);
      c.vel.set(0, 0, 0);
      c.yaw = 0;
      current.char.root.position.copy(c.pos);
      current.char.root.quaternion.identity();
      current.char.root.updateMatrixWorld(true);
      const r = GActiveBody.attach(p, current);
      for (const o of G.scene.children)
        o.visible =
          o.isLight ||
          o === grid ||
          o === floor ||
          o === lines ||
          o === current.char.root;
      current.char.root.visible = true;
      if (current.gun) current.gun.root.visible = false;
      return r;
    }
    function step(dt) {
      const r = GActiveBody.get(current);
      if (!r) return;
      r.wish.set(0, 0, state.walk ? -0.35 : 0);
      p.begin(dt);
      GActiveBody.captureAndApply(current, false);
      state.elapsed += dt;
    }
    const buttons = [
      [
        "Сброс",
        () => {
          state.offset = 0;
          reset();
        },
      ],
      [
        "Толчок 6 Н·с",
        () => GActiveBody.impulse(current, { x: 6, y: 0, z: 0 }),
      ],
      [
        "Сильный 60 Н·с",
        () => GActiveBody.impulse(current, { x: 60, y: 0, z: 0 }),
      ],
      [
        "Вперёд 60 Н·с",
        () => GActiveBody.impulse(current, { x: 0, y: 0, z: -60 }),
      ],
      ["Расслабить", () => GActiveBody.release(current)],
      ["Попытка встать", () => GActiveBody.recover(current)],
      [
        "Ходьба: эксперимент",
        () => {
          state.walk = !state.walk;
          GActiveBody.setLocomotion(current, state.walk);
        },
      ],
      [
        "Падение с 2 м",
        () => {
          state.offset = 2;
          reset();
        },
      ],
      ["Начать / пауза", () => (state.paused = !state.paused)],
      [
        "Один кадр",
        () => {
          state.paused = true;
          step(1 / +$("abHz").value);
        },
      ],
    ];
    for (const [title, fn] of buttons) {
      const b = document.createElement("button");
      b.textContent = title;
      b.style.cssText =
        "margin:3px;padding:6px;background:#293e49;color:#f1f6f8;border:1px solid #65808d;border-radius:4px;font:12px system-ui";
      b.onclick = fn;
      $("abButtons").append(b);
    }
    $("abSoldier").onchange = () => {
      state.i = +$("abSoldier").value;
      state.offset = 0;
      reset();
    };
    let drag = false,
      px = 0,
      py = 0;
    G.renderer.domElement.addEventListener("pointerdown", (e) => {
      drag = true;
      px = e.clientX;
      py = e.clientY;
    });
    window.addEventListener("pointerup", () => (drag = false));
    window.addEventListener("pointermove", (e) => {
      if (!drag) return;
      state.yaw += (e.clientX - px) * 0.006;
      state.pitch = Math.max(
        -0.6,
        Math.min(0.9, state.pitch + (e.clientY - py) * 0.004),
      );
      px = e.clientX;
      py = e.clientY;
    });
    G.renderer.domElement.addEventListener(
      "wheel",
      (e) => {
        state.dist = Math.max(
          1.5,
          Math.min(12, state.dist * Math.exp(e.deltaY * 0.001)),
        );
        e.preventDefault();
      },
      { passive: false },
    );
    reset();
    let previous = performance.now(),
      readAt = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      A.setRender(false);
      const dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      if (!state.paused) {
        const h = 1 / +$("abHz").value;
        state.acc += dt;
        let n = 0;
        while (state.acc >= h && n++ < 6) {
          step(h);
          state.acc -= h;
        }
      }
      const r = GActiveBody.get(current),
        hip = r.byName.hips.body.translation(),
        center = new T.Vector3(hip.x, Math.max(0.5, hip.y), hip.z);
      G.camera.position
        .copy(center)
        .add(
          new T.Vector3(
            Math.sin(state.yaw) * state.dist * Math.cos(state.pitch),
            Math.sin(state.pitch) * state.dist,
            -Math.cos(state.yaw) * state.dist * Math.cos(state.pitch),
          ),
        );
      G.camera.lookAt(center);
      G.camera.fov = 48;
      G.camera.updateProjectionMatrix();
      lines.visible = $("abBones").checked;
      if (lines.visible) {
        const d = p.sim.debugRender();
        lines.geometry.setAttribute(
          "position",
          new T.BufferAttribute(d.vertices, 3),
        );
      }
      if (state.render) G.renderer.render(G.scene, G.camera);
      if (now > readAt) {
        readAt = now + 200;
        const q = GActiveBody.stats(p)[0];
        $("abStats").textContent =
          "Режим: " +
          q.state +
          "\nОпора стоп: " +
          q.support +
          "/2\nНаклон таза: " +
          ((q.tilt * 180) / Math.PI).toFixed(1) +
          "°\nВысота таза: " +
          hip.y.toFixed(3) +
          " м\nМасса: " +
          q.mass.toFixed(1) +
          " кг\nДинамических частей: " +
          q.parts +
          "\nРешатель: " +
          q.rigMode +
          "\nСамоколлизии: включены" +
          "\nОпора ладоней / голеней: " +
          (q.contacts?.hands || 0) +
          " / " +
          (q.contacts?.knees || 0) +
          "\nНагрузка стоп П/Л: " +
          (r.byName.ankleR.filteredLoad || 0).toFixed(0) +
          " / " +
          (r.byName.ankleL.filteredLoad || 0).toFixed(0) +
          " Н" +
          "\nШаги начаты/завершены/пропущены: " +
          q.steps +
          " / " +
          q.completedSteps +
          " / " +
          q.missedSteps +
          (q.recoveryPhase ? "\nФаза подъёма: " + q.recoveryPhase : "") +
          (q.recoveryFailure ? "\nПодъём не подтверждён" : "") +
          "\nВремя симуляции: " +
          state.elapsed.toFixed(1) +
          " с";
      }
    }
    requestAnimationFrame(frame);
    window.__ACTIVEBODYLAB = {
      state,
      physics: p,
      reset,
      step,
      get soldier() {
        return current;
      },
      report: () => GActiveBody.stats(p),
    };
  }
  wait();
})();
