/* Two-person isolation stand: rendering only soldier/medic, no forest. */
(function () {
  if (!/[?&]aidlab\b/.test(location.search)) return;
  function wait() {
    if (!window.__GAME || !window.AEGIS_GAME) return setTimeout(wait, 200);
    const G = __GAME,
      A = AEGIS_GAME,
      T = THREE,
      C = G._C,
      saved = AEGIS.loadLoadouts(),
      actor = G.squad[2],
      patient = G.squad[3];
    G.pause(true);
    A.setInput(false);
    A.setRender(false);
    AEGIS_INTRO.close();
    for (const id of [
      "intro",
      "menu",
      "hud",
      "battle",
      "settings",
      "armory",
      "loading",
      "tutorial",
    ]) {
      const e = document.getElementById(id);
      if (e) e.style.display = "none";
    }
    const grid = new T.GridHelper(10, 40, 0x74807b, 0x636d6a);
    G.scene.add(grid);
    G.scene.fog = null;
    G.scene.background = new T.Color(0x858d96);
    for (const o of G.scene.children)
      if (o.isLight) o.intensity = Math.max(o.intensity, 1.2);
    let pause = true,
      yaw = 0.5,
      pitch = 0.3,
      dist = 3.6,
      mode = "treat";
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;left:16px;top:16px;background:#172328ed;color:white;padding:16px;width:250px;font:14px system-ui;z-index:99999";
    panel.innerHTML =
      '<b>Медицинский стенд</b><p>Игровые скелеты, IK и PBD. Лес скрыт. Тестовая рана не меняет сохранения.</p><button id="alTreat">Перевязка</button> <button id="alDrag">Волочение</button><p><button id="alRun">Продолжить</button> <button id="alStep">Кадр</button></p><label>Шаг <select id="alDt"><option value=".0166666667">60 Гц</option><option value=".0333333333">30 Гц</option><option value=".05">20 Гц</option></select></label><pre id="alRead"></pre>';
    document.body.append(panel);
    const hideUI = document.createElement("style");
    hideUI.textContent =
      "#tutorial,#intro,#menu,#hud,#battle,#settings,#armory,#loading,#wasd,#itut{display:none!important}";
    document.head.append(hideUI);
    for (const el of panel.querySelectorAll("button,select"))
      el.style.cssText =
        "font:12px system-ui;padding:5px;border:1px solid #728279;border-radius:4px;background:#263831;color:#fff";
    const $ = (id) => panel.querySelector("#" + id);
    function visibility() {
      for (const o of G.scene.children)
        o.visible =
          o.isLight ||
          o === grid ||
          o === actor.char.root ||
          o === patient.char.root ||
          o === actor.gun?.root ||
          o === patient.gun?.root;
      actor.char.root.visible = patient.char.root.visible = true;
      C.captionHUD && (C.captionHUD.style.display = "none");
      C.zeroHUD && (C.zeroHUD.style.display = "none");
    }
    function reset(which) {
      mode = which;
      G.squad.forEach((s) => {
        G.dmg.revive(s);
        C.tactics && C.tactics.reset(s);
      });
      for (const [i, id] of [
        [2, "ak74"],
        [3, "akm"],
      ]) {
        A.setLoadout(G.squad[i].key, {
          slots: [
            { t: "gun", id },
            null,
            { t: "ammo", w: "primary" },
            null,
            null,
            null,
          ],
        });
        G.equipStand(i, 0);
      }
      AEGIS.saveLoadouts(saved);
      patient.ctrl.pos.set(0, C.world.heightAt(0, 0), 0);
      actor.ctrl.pos.set(0, C.world.heightAt(0, 0.8), 0.8);
      actor.ctrl.yaw = 0;
      actor.idleYaw = 0;
      patient.ctrl.yaw = 0;
      G.poseStand(3);
      G.poseStand(2, { crouch: 1 });
      G.dmg._standCollapse(patient);
      for (let i = 0; i < 300; i++) {G.physicsStep(1/60);G.dmg.ragdoll(patient, 1 / 60);}
      patient.dmg.ph.dead = false;
      patient.finished = false;
      patient.dmg.ph.src = [
        {
          key: "lab-arm",
          zone: "uarm",
          side: "L",
          comp: "limb",
          art: true,
          rate: 8,
          dressed: 0,
        },
      ];
      G.step(1);
      const st = C.tactics.state(actor);
      st.target = patient;
      st.mode = which;
      st.timeout = C.S.time + 120;
      st.until = 0;
      st.goal = { x: 0, z: 2.5 };
      st.path = [st.goal];
      st.pathI = 0;
      actor.ctrl.crouch = 1;
      grid.position.set(0, C.world.heightAt(0, 0), 0);
      pause = true;
      visibility();
    }
    $("alTreat").onclick = () => reset("treat");
    $("alDrag").onclick = () => reset("drag");
    $("alRun").onclick = () => (pause = !pause);
    $("alStep").onclick = () => advance(+$("alDt").value);
    function advance(dt) {
      G.step(1, dt);
      visibility();
    }
    let dragging = false,
      px = 0,
      py = 0;
    G.renderer.domElement.onpointerdown = (e) => {
      dragging = true;
      px = e.clientX;
      py = e.clientY;
    };
    window.addEventListener("pointerup", () => (dragging = false));
    window.addEventListener("pointermove", (e) => {
      if (dragging) {
        yaw += (e.clientX - px) * 0.005;
        pitch = Math.max(-0.4, Math.min(1, pitch + (e.clientY - py) * 0.005));
        px = e.clientX;
        py = e.clientY;
      }
    });
    G.renderer.domElement.addEventListener(
      "wheel",
      (e) => {
        dist = Math.max(1.2, Math.min(6, dist * Math.exp(e.deltaY * 0.001)));
        e.preventDefault();
      },
      { passive: false },
    );
    reset("treat");
    let last = performance.now(),
      acc = 0;
    function cameraFrame() {
      const p = C.tactics.pos(patient),
        center = new T.Vector3(p.x, p.y + 0.3, p.z),
        eye = center
          .clone()
          .add(
            new T.Vector3(
              Math.sin(yaw) * dist,
              0.4 + Math.sin(pitch) * dist,
              Math.cos(yaw) * dist,
            ),
          );
      G.camera.position.copy(eye);
      G.camera.lookAt(center);
      G.camera.fov = 42;
      G.camera.updateProjectionMatrix();
    }
    function frame(now) {
      requestAnimationFrame(frame);
      A.setRender(false);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pause) {
        acc += dt;
        const h = +$("alDt").value;
        while (acc >= h) {
          advance(h);
          acc -= h;
        }
      }
      cameraFrame();
      if (window.__RIGLAB_RENDER !== false)
        G.renderer.render(G.scene, G.camera);
      $("alRead").textContent =
        "Режим: " +
        actor.tac?.mode +
        "\nРана: " +
        (patient.dmg.ph.src[0]?.tq ? "жгут наложен" : "кровотечение") +
        "\nЗапас: " +
        (actor.med?.tq ?? "—") +
        " жгутов";
    }
    requestAnimationFrame(frame);
    window.__AIDLAB = {
      reset,
      advance,
      actor,
      patient,
      render: () => {
        visibility();
        cameraFrame();
        G.renderer.setRenderTarget(null);
        G.renderer.render(G.scene, G.camera);
      },
      pause: (v) => (pause = v),
    };
  }
  wait();
})();
