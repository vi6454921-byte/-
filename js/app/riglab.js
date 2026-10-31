/* Независимый стенд рук и падения: index.html?riglab.
   В этой сцене нет леса, боевого ИИ и медицины товарищей. Геометрия рук,
   оружия, IK и рэгдолл — игровые, без упрощений. Снаряжение не сохраняется. */
(function () {
  'use strict';
  if (!/[?&]riglab\b/.test(location.search)) return;
  function wait() {
    if (!window.__GAME || !window.AEGIS_GAME) return setTimeout(wait, 200);
    const G = __GAME, A = AEGIS_GAME, T = THREE, saved = AEGIS.loadLoadouts();
    G.pause(true); A.setInput(false); A.setRender(false); AEGIS_INTRO.close();
    for (const id of ['intro', 'menu', 'loading', 'hud', 'battle', 'settings', 'armory', 'tutorial']) {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    }
    const panel = document.createElement('section');
    panel.id = 'riglab'; panel.style.cssText = 'position:fixed;left:14px;top:14px;width:272px;padding:16px;z-index:10000;background:#162126ed;color:#eff4f1;border:1px solid #576960;border-radius:8px;font:14px system-ui;line-height:1.5';
    panel.innerHTML = '<strong>Стенд рук и падения</strong><p style="margin:8px 0">Лес и боевой ИИ отключены. ЛКМ: вращение, колесо: приближение.</p>' +
      '<label>Боец <select id="rlSoldier"></select></label><br><label>Оружие <select id="rlWeapon"></select></label><br>' +
      '<label>Рукоятка <select id="rlGrip"><option value="">Без рукоятки</option value="rvg">Вертикальная RVG</option value="afg2">Наклонная AFG</option><option value="handstop">Упор</option></select></label>' +
      '<p id="rlPoses" style="display:flex;gap:6px;flex-wrap:wrap"></p>' +
      '<p><button id="rlHands">Кисти + оружие</button> <button id="rlFall">Попадание в голову</button></p>' +
      '<p><button id="rlPause">Пауза</button> <button id="rlStep">Кадр</button> <button id="rlReset">Вернуть</button></p>' +
      '<label>Шаг <select id="rlDt"><option value="0.0166666667">60 Гц</option><option value="0.0333333333">30 Гц</option><option value="0.05">20 Гц</option></select></label>' +
      '<pre id="rlReadout" style="font:12px monospace;white-space:pre-wrap;margin-bottom:0"></pre>';
    document.body.appendChild(panel);
    const hideUI = document.createElement("style");
    hideUI.textContent = "#tutorial,#intro,#menu,#hud,#battle,#settings,#armory,#loading,#wasd,#itut{display:none!important}";
    document.head.append(hideUI);
    for (const el of panel.querySelectorAll('button,select')) el.style.cssText = 'font:12px system-ui;padding:5px;border:1px solid #728279;border-radius:4px;background:#263831;color:#fff;max-width:185px';
    const $ = id => panel.querySelector('#' + id);
    G.squad.forEach((s, i) => $('rlSoldier').add(new Option(s.gen ? s.gen.short : s.key, i)));
    ['akm', 'ak74', 'm416', 'scar', 'svd', 'mp5a3', 'm870', 'glock18c'].forEach(id => $('rlWeapon').add(new Option(AEGIS.WEAPONS[id].name, id)));
    const L = { render: window.__RIGLAB_RENDER !== false, i: 0, hands: false, paused: false, step: false, pose: {}, yaw: .25, pitch: .12, dist: 2.8, falling: false, acc: 0 };
    const grid = new T.GridHelper(8, 40, 0x789087, 0x525c59); grid.name = 'riglab_grid'; G.scene.add(grid);
    G.scene.fog = null; G.scene.background = new T.Color(0x858d96);
    G.scene.children.filter(o => o.isLight).forEach(o => { o.intensity = Math.max(1.2, o.intensity); });
    function visibility() {
      const s = G.squad[L.i];
      for (const o of G.scene.children) o.visible = o.isLight || o === grid || o === s.char.root || !!(s.gun && o === s.gun.root);
      s.char.root.visible = true;
      for (const o of s.char.root.children) if (o.isMesh) o.visible = !L.hands;
      const v = s.char.root.position; grid.position.set(v.x, s.ctrl.groundAt(v.x, v.z), v.z);
    }
    function reset() {
      const s = G.squad[L.i]; G.dmg.revive(s);
      const c = s.ctrl, sp = s.spawn; c.pos.set(sp.x, c.groundAt(sp.x, sp.z), sp.z);
      s.char.bone('hips').position.fromArray(s.char.rest.hips);
      c.vel.set(0, 0, 0); L.falling = false; L.acc = 0; G.poseStand(L.i, L.pose); visibility();
    }
    function arm() {
      const s = G.squad[L.i], id = $('rlWeapon').value, grip = $('rlGrip').value;
      const cfg = {}; if (grip) cfg[id] = { under: grip };
      // AK требует цевье с нижней планкой: выбранные несовместимые модули
      // не подменяем молча; ниже показывается фактически установленный хват.
      A.setLoadout(s.key, { slots: [{ t: 'gun', id }, null, { t: 'ammo', w: id === 'glock18c' ? 'pistol' : 'primary' }, null, null, null], cfg });
      G.equipStand(L.i, 0);
      AEGIS.saveLoadouts(saved); reset();
    }
    [['Покой', {}], ['Наготове', { ready: 1 }], ['Прицел', { ready: 1, ads: 1 }], ['Колено', { crouch: 1 }]].forEach(([text, pose]) => {
      const b = document.createElement('button'); b.textContent = text; b.onclick = () => { L.pose = pose; reset(); }; $('rlPoses').appendChild(b);
      b.style.cssText = 'font:12px system-ui;padding:5px;background:#263831;color:#fff;border:1px solid #728279;border-radius:4px';
    });
    $('rlSoldier').onchange = () => { L.i = +$('rlSoldier').value; arm(); };
    $('rlWeapon').onchange = $('rlGrip').onchange = arm;
    $('rlHands').onclick = () => { L.hands = !L.hands; visibility(); };
    $('rlReset').onclick = reset;
    $('rlPause').onclick = () => { L.paused = !L.paused; $('rlPause').textContent = L.paused ? 'Продолжить' : 'Пауза'; };
    $('rlStep').onclick = () => { L.paused = true; L.step = true; };
    $('rlFall').onclick = () => {
      reset(); const s = G.squad[L.i];
      G.testShot(L.i, 1.74, { bone: 'head', off: [0, .03, -.055], ammo: 'M993', ang: 0 });
      L.falling = !!s.rd;
    };
    let drag = false, px = 0, py = 0;
    G.renderer.domElement.addEventListener('pointerdown', e => { drag = true; px = e.clientX; py = e.clientY; });
    window.addEventListener('pointerup', () => { drag = false; });
    window.addEventListener('pointermove', e => { if (!drag) return; L.yaw += (e.clientX - px) * .006; L.pitch = Math.max(-.7, Math.min(.8, L.pitch + (e.clientY - py) * .004)); px = e.clientX; py = e.clientY; });
    G.renderer.domElement.addEventListener('wheel', e => { L.dist = Math.max(.55, Math.min(6, L.dist * Math.exp(e.deltaY * .001))); e.preventDefault(); }, { passive: false });
    arm(); let prev = performance.now(), textAt = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      A.setRender(false);
      const dt = Math.min(.05, (now - prev) / 1000); prev = now;
      const s = G.squad[L.i], h = +$('rlDt').value;
      if (L.falling && (!L.paused || L.step)) {
        L.acc += L.step ? h : dt; L.step = false;
        while (L.acc >= h) { G.physicsStep(h); G.dmg.update(h); G.dmg.ragdoll(s, h); L.acc -= h; }
      }
      const center = s.char.root.localToWorld(new T.Vector3(0, L.falling ? .45 : 1.08, 0));
      const eye = s.char.root.localToWorld(new T.Vector3(Math.sin(L.yaw) * L.dist * Math.cos(L.pitch), (L.falling ? .45 : 1.08) + Math.sin(L.pitch) * L.dist, -Math.cos(L.yaw) * L.dist * Math.cos(L.pitch)));
      G.camera.position.copy(eye); G.camera.lookAt(center); G.camera.fov = 42; G.camera.updateProjectionMatrix();
      if (L.render) G.renderer.render(G.scene, G.camera);
      if (now > textAt) {
        textAt = now + 250;
        const p = G.gripCheck().find(x => x.key === s.key);
        $('rlReadout').textContent = s.dead ? 'Падение: ' + (s.deathType || 'физика') + '\nСон: ' + (s.rd ? s.rd.sleep.toFixed(2) : '—') + ' с\nФизиология: ' + (s.deathKind || '—') :
          'Фактический хват: ' + (s.wspec.foregrip || 'цевьё') + '\nЗапястье → цель, мм: ' + (p ? (p.wristErrorR * 1000).toFixed(1) + ' / ' + (p.wristErrorL * 1000).toFixed(1) : '—') + '\nРукоятка → кисть, мм: ' + (p && p.fixedGripError !== undefined ? (p.fixedGripError * 1000).toFixed(1) : '—') + '\nЛокти, °: ' + (p ? p.elbowR + ' / ' + p.elbowL : '—');
      }
    }
    requestAnimationFrame(frame);
    window.__RIGLAB = { state: L, reset, arm };
  }
  wait();
})();
