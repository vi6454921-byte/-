/* AEGIS v26 · окно снаряжения и обыска (в духе Tarkov).
   Справа — ваше снаряжение: шлем/броня (для вида), РАЗГРУЗКА — 6 подсумков быстрого доступа (клавиши 1–6:
   оружие, патроны, гранаты) и РЮКЗАК — 8 ячеек запаса (из рюкзака в бою ничего не достаётся: патроны оттуда
   не идут в запас, оружие не в руках — сначала переложите в разгрузку). Слева — обыск тела (его разгрузка и
   рюкзак) или предметы на земле.
   Перетаскивание: тянуть предмет мышью — он плавно следует за курсором; на ячейку — положить (занятая —
   меняются местами), на панель — в первую свободную ячейку, за пределы панелей — выбросить под ноги.
   Двойной щелчок или Ctrl+щелчок — быстро переложить (тело ↔ разгрузка, разгрузка ↔ рюкзак),
   X / Delete над предметом — выбросить. Закрыть — Tab или Y; Esc — закрыть и открыть меню.
   Логику (патроны, сборка оружия, тайники на земле) ведёт C.LOOT из 29_game.js (root.AEGIS_LOOT). */
(function (root) {
  'use strict';
  const doc = root.document;
  const api = () => root.AEGIS_LOOT || null;
  let win = null, toastEl = null, isOpen = false, mode = 'self', ref = null, refs = [], timer = 0, drag = null, noteT = 0, toastT = 0;
  let hover = null, sigCache = '', raf = 0;

  const ICON = {
    rifle: '<svg viewBox="0 0 64 24"><path d="M2 9h30l4-3h6v3h18v3H44l-2 2h-6l-3 7h-6l2-7H18l-3 4H8l2-4H2z"/></svg>',
    pistol: '<svg viewBox="0 0 64 24"><path d="M14 5h34v6H34l-2 2h-4l-3 9h-8l3-11h-6z"/></svg>',
    ammo: '<svg viewBox="0 0 64 24"><path d="M14 8l3-4 3 4v13h-6zM26 8l3-4 3 4v13h-6zM38 8l3-4 3 4v13h-6z"/></svg>',
    m67: '<svg viewBox="0 0 64 24"><circle cx="31" cy="14" r="8"/><path d="M27 3h8v4h-8zM35 4l8 3-1 2-7-2z"/></svg>',
    m84: '<svg viewBox="0 0 64 24"><path d="M26 7h12v15H26zM28 2h8v4h-8zM36 3l7 3-1 2-6-2z"/></svg>',
    smoke: '<svg viewBox="0 0 64 24"><path d="M25 8h14v14H25zM28 3h8v4h-8zM36 4l7 3-1 2-6-2z"/><path d="M25 12h14v3H25z" fill="#d9c14a"/></svg>',
    helmet: '<svg viewBox="0 0 32 32"><path d="M5 20c0-8 5-13 11-13s11 5 11 13v2H5z"/><path d="M4 22h24v3H4z" opacity=".6"/></svg>',
    boonie: '<svg viewBox="0 0 32 32"><path d="M9 18c0-6 3-9 7-9s7 3 7 9z"/><path d="M2 19h28l-3 3H5z" opacity=".7"/></svg>',
    armor: '<svg viewBox="0 0 32 32"><path d="M9 4h4l3 3 3-3h4l3 5v18H6V9z"/><path d="M10 14h12v2H10zM10 19h12v2H10z" opacity=".45"/></svg>',
    rig: '<svg viewBox="0 0 32 32"><path d="M7 6h18v20H7z" opacity=".55"/><path d="M8 13h5v8H8zM14 13h4v8h-4zM19 13h5v8h-5z"/></svg>',
    pack: '<svg viewBox="0 0 32 32"><path d="M10 6h12l3 5v17H7V11z"/><path d="M11 16h10v7H11z" opacity=".45"/><path d="M13 3h6v4h-6z" opacity=".7"/></svg>'
  };
  const HEAD = { helmet: 'Шлем', boonie: 'Панама', cap: 'Кепи', none: 'Без убора' };

  function css() {
    if (doc.getElementById('lootCss')) return;
    const st = doc.createElement('style');
    st.id = 'lootCss';
    st.textContent = `
#lootWin{position:fixed;inset:0;z-index:40;display:none;pointer-events:auto;font-family:var(--f,Arial,sans-serif);color:#e4e2d8;
  --cell:clamp(54px,5.1vw,88px);--gap:4px;--tan:#c9b98c;--line:rgba(201,185,140,.22);
  background:radial-gradient(ellipse at center,rgba(4,5,6,.18) 30%,rgba(4,5,6,.62) 100%)}
#lootWin.on{display:block;animation:lwIn .16s ease-out}
@keyframes lwIn{from{opacity:0}to{opacity:1}}
#lootWin .lw-pan{position:absolute;top:50%;transform:translateY(-50%);padding:12px 12px 10px;border-radius:6px;
  background:linear-gradient(180deg,rgba(18,20,20,.93),rgba(11,12,12,.93));border:1px solid rgba(201,185,140,.2);
  box-shadow:0 20px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04)}
#lootWin .lw-self{right:28px} #lootWin .lw-box{left:28px}
#lootWin .lw-pan.hide{display:none}
#lootWin .lw-h{font:700 10px/1.3 var(--mono,monospace);letter-spacing:.2em;text-transform:uppercase;color:var(--tan);margin:0 1px 8px;
  display:flex;align-items:flex-end;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line);padding-bottom:7px}
#lootWin .lw-h b{display:block;font:600 14px/1.25 var(--f,Arial);letter-spacing:.02em;text-transform:none;color:#f2f0e8;margin-top:3px;max-width:300px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lootWin .lw-h i{font-style:normal;color:rgba(228,226,216,.45);letter-spacing:.12em}
#lootWin .lw-gear{display:grid;grid-template-columns:repeat(4,var(--cell));gap:var(--gap);margin:0 0 10px}
#lootWin .lw-eq{height:calc(var(--cell)*.62);border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);border-radius:3px;position:relative;
  display:flex;align-items:center;justify-content:center;fill:#9fa39b}
#lootWin .lw-eq svg{width:42%;height:62%;display:block}
#lootWin .lw-eq span{position:absolute;left:4px;top:3px;font:600 8.5px/1 var(--mono,monospace);letter-spacing:.06em;color:rgba(228,226,216,.55);text-transform:uppercase}
#lootWin .lw-eq u{position:absolute;right:4px;bottom:3px;text-decoration:none;font:600 9px/1 var(--f,Arial);color:rgba(228,226,216,.75);max-width:92%;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lootWin .lw-sec{font:700 9.5px/1 var(--mono,monospace);letter-spacing:.2em;text-transform:uppercase;color:rgba(201,185,140,.85);margin:8px 1px 6px;
  display:flex;justify-content:space-between}
#lootWin .lw-sec i{font-style:normal;color:rgba(228,226,216,.4);letter-spacing:.08em}
#lootWin .lw-grid{display:grid;gap:var(--gap);padding:6px;border-radius:4px;position:relative}
#lootWin .lw-grid.rig{grid-template-columns:repeat(3,var(--cell));
  background:repeating-linear-gradient(0deg,rgba(78,82,60,.5) 0 3px,rgba(40,43,32,.55) 3px 9px),#262a1f;
  border:1px solid rgba(120,126,92,.35);box-shadow:inset 0 0 0 2px rgba(0,0,0,.25)}
#lootWin .lw-grid.pack{grid-template-columns:repeat(4,var(--cell));background:linear-gradient(180deg,#24261f,#1c1e19);
  border:1px solid rgba(255,255,255,.08);box-shadow:inset 0 2px 10px rgba(0,0,0,.45)}
#lootWin .lw-grid.ground{grid-template-columns:repeat(3,var(--cell));background:rgba(60,52,40,.35);border:1px dashed rgba(201,185,140,.25)}
#lootWin .lw-c{position:relative;width:var(--cell);height:var(--cell);border-radius:3px;background:rgba(10,11,10,.72);
  border:1px solid rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(0,0,0,.35);transition:border-color .1s,background .1s,box-shadow .1s}
#lootWin .lw-grid.rig .lw-c{background:linear-gradient(180deg,rgba(20,22,17,.9),rgba(12,13,10,.92));border-color:rgba(120,126,92,.35)}
#lootWin .lw-c .lw-k{position:absolute;left:4px;bottom:3px;font:700 9px/1 var(--mono,monospace);color:rgba(201,185,140,.8);z-index:2;pointer-events:none}
#lootWin .lw-c.over{border-color:#e8c36a;box-shadow:inset 0 0 0 1px #e8c36a,0 0 12px rgba(232,195,106,.28);background:rgba(232,195,106,.12)}
#lootWin .lw-c.empty::after{content:'';position:absolute;inset:22% 24%;border:1px dashed rgba(255,255,255,.07);border-radius:3px}
#lootWin .lw-it{position:absolute;inset:2px;border-radius:2px;cursor:grab;overflow:hidden;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.015));fill:#d3d5cc;transition:filter .1s,opacity .12s,transform .12s}
#lootWin .lw-it:hover{filter:brightness(1.22)}
#lootWin .lw-it.gun{background:linear-gradient(160deg,rgba(116,122,96,.42),rgba(52,56,42,.42))}
#lootWin .lw-it.ammo{background:linear-gradient(160deg,rgba(150,120,70,.36),rgba(70,56,34,.36))}
#lootWin .lw-it.grenade{background:linear-gradient(160deg,rgba(96,110,84,.38),rgba(40,48,36,.38))}
#lootWin .lw-it.bad{box-shadow:inset 0 0 0 1px rgba(224,120,100,.75)}
#lootWin .lw-it svg{width:84%;height:44%;display:block;margin-top:6%}
#lootWin .lw-it b{position:absolute;left:4px;top:3px;right:3px;font:600 9.5px/1.1 var(--f,Arial);letter-spacing:-.01em;color:#f1efe6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-shadow:0 1px 2px rgba(0,0,0,.8)}
#lootWin .lw-it em{position:absolute;right:4px;bottom:3px;font:700 10px/1 var(--mono,monospace);font-style:normal;color:#efe7c4;text-shadow:0 1px 2px rgba(0,0,0,.9)}
#lootWin .lw-it.bad em{color:#f09a86}
#lootWin .lw-it.lift{opacity:.18;transform:scale(.94)}
#lootWin .lw-c.land .lw-it{animation:lwLand .22s ease-out}
@keyframes lwLand{0%{transform:scale(.86);filter:brightness(1.6)}100%{transform:scale(1);filter:none}}
#lootWin .lw-info{position:absolute;left:50%;bottom:58px;transform:translateX(-50%);min-width:240px;max-width:min(520px,40vw);padding:8px 12px;border-radius:5px;
  background:rgba(12,13,13,.9);border:1px solid rgba(201,185,140,.2);font:500 11.5px/1.45 var(--f,Arial);color:rgba(228,226,216,.82);text-align:center;
  opacity:0;transition:opacity .12s;pointer-events:none}
#lootWin .lw-info.on{opacity:1} #lootWin .lw-info b{display:block;color:#f4f1e6;font-weight:600;font-size:13px}
#lootWin .lw-foot{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);font:500 11px/1.5 var(--f,Arial);letter-spacing:.03em;
  color:rgba(228,226,216,.6);text-shadow:0 1px 6px rgba(0,0,0,.9);width:max-content;max-width:94vw;text-align:center}
#lootWin .lw-note{position:absolute;left:50%;top:16%;transform:translateX(-50%);font:600 13px/1.4 var(--f,Arial);color:#f0dcae;
  text-shadow:0 1px 8px rgba(0,0,0,.95);opacity:0;transition:opacity .2s;pointer-events:none}
#lootWin .lw-note.on{opacity:1} #lootWin .lw-note.err{color:#ef8a7e}
#lootWin .lw-drop{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:700 11px/1.4 var(--mono,monospace);letter-spacing:.2em;
  color:rgba(255,255,255,0);transition:color .15s;pointer-events:none;text-transform:uppercase;padding:10px 16px;border-radius:6px}
#lootWin.dragging .lw-drop{color:rgba(255,255,255,.35)}
#lootWin.dragging.out .lw-drop{color:#e8c36a;background:rgba(232,195,106,.08);outline:1px dashed rgba(232,195,106,.5)}
#lootWin.dragging .lw-it{cursor:grabbing}
#lootWin.dragging .lw-pan.tgt{border-color:rgba(232,195,106,.55)}
#lootGhost{position:fixed;left:0;top:0;z-index:41;pointer-events:none;border-radius:3px;will-change:transform;
  box-shadow:0 10px 26px rgba(0,0,0,.55),0 0 0 1px #e8c36a;overflow:hidden;display:flex;align-items:center;justify-content:center;fill:#ece6cc;
  background:linear-gradient(160deg,rgba(70,72,58,.95),rgba(30,32,26,.95));font-family:var(--f,Arial)}
#lootGhost svg{width:84%;height:44%;display:block;margin-top:6%}
#lootGhost b{position:absolute;left:4px;top:3px;right:4px;font:600 9.5px/1.1 var(--f,Arial);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lootGhost em{position:absolute;right:4px;bottom:3px;font:700 10px/1 var(--mono,monospace);font-style:normal;color:#efe7c4}
#lootGhost.fly{transition:transform .14s cubic-bezier(.2,.8,.3,1),opacity .14s}
#lootWin .lw-tabs{display:flex;gap:5px;margin:-2px 0 8px;flex-wrap:wrap}
#lootWin .lw-tab{padding:3px 9px;border-radius:3px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.035);
  font:600 10.5px/1.3 var(--f,Arial);color:rgba(228,226,216,.7);cursor:pointer;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lootWin .lw-tab.on{border-color:#e8c36a;color:#fff;background:rgba(232,195,106,.14)}
body.loot-open #hud,body.loot-open #prompt,body.loot-open #wasd{opacity:0!important}
@media (max-height:560px){#lootWin{--cell:clamp(46px,4.6vw,70px)}#lootWin .lw-pan{padding:8px 9px 7px}#lootWin .lw-gear{display:none}#lootWin .lw-info{bottom:48px}}
#lootToast{position:fixed;left:50%;top:70%;transform:translateX(-50%);z-index:8;pointer-events:none;font:600 13px/1.4 var(--f,Arial);
  letter-spacing:.06em;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.95);opacity:0;transition:opacity .25s}
#lootToast.on{opacity:1}
`;
    doc.head.appendChild(st);
  }

  function el(tag, cls, html) { const e = doc.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function build() {
    if (win) return;
    css();
    win = el('div'); win.id = 'lootWin';
    win.innerHTML = '<div class="lw-pan lw-box" data-side="box"><div class="lw-h"></div><div class="lw-tabs"></div><div class="lw-body"></div></div>' +
      '<div class="lw-pan lw-self" data-side="self"><div class="lw-h"></div><div class="lw-gear"></div><div class="lw-body"></div></div>' +
      '<div class="lw-drop">отпустите — выбросить на землю</div><div class="lw-note"></div><div class="lw-info"></div><div class="lw-foot"></div>';
    doc.body.appendChild(win);
    win.addEventListener('pointerdown', onDown);
    win.addEventListener('click', onClick);
    win.addEventListener('dblclick', onDbl);
    win.addEventListener('pointerover', onOver);
    win.addEventListener('pointerout', (e) => { if (!e.relatedTarget || !win.contains(e.relatedTarget)) setHover(null); });
    win.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
  }

  function toast(msg) {
    if (!toastEl) { css(); toastEl = el('div'); toastEl.id = 'lootToast'; doc.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1600);
  }
  function note(msg, err) {
    if (!win || !msg) return;
    const n = win.querySelector('.lw-note');
    n.textContent = msg; n.classList.toggle('err', !!err); n.classList.add('on');
    clearTimeout(noteT); noteT = setTimeout(() => n.classList.remove('on'), 1700);
  }

  /* ------------------------------------------------------------ отрисовка --- */
  /* ячейка: side — self (разгрузка) / pack (свой рюкзак) / box (тело или земля; индекс сквозной) */
  function cellHtml(A, it, side, i, selfItems, key) {
    const v = it ? A.view(it, selfItems) : null;
    const k = key ? '<div class="lw-k">' + esc(key) + '</div>' : '';
    if (!v) return '<div class="lw-c empty" data-side="' + side + '" data-i="' + i + '">' + k + '</div>';
    const cls = it.t === 'gun' ? 'gun' : it.t === 'ammo' ? 'ammo' : 'grenade';
    return '<div class="lw-c" data-side="' + side + '" data-i="' + i + '">' + k + '<div class="lw-it ' + cls + (v.bad ? ' bad' : '') + '">' +
      (ICON[v.icon] || ICON.ammo) + '<b>' + esc(v.short || v.title) + '</b>' + (v.count ? '<em>' + esc(v.count) + '</em>' : '') + '</div></div>';
  }
  const used = (arr) => arr.filter(Boolean).length;
  function gridHtml(A, cls, side, items, from, to, selfItems, keys) {
    let h = '<div class="lw-grid ' + cls + '" data-side="' + side + '">';
    for (let i = from; i < to; i++) h += cellHtml(A, items[i] || null, side, i, selfItems, keys ? keys(i) : '');
    return h + '</div>';
  }
  function gearHtml(A) {
    const g = (A.gear && A.gear()) || {};
    const head = g.head || 'helmet';
    const eq = (icon, label, name) => '<div class="lw-eq">' + (ICON[icon] || '') + '<span>' + esc(label) + '</span><u>' + esc(name) + '</u></div>';
    return eq(head === 'boonie' ? 'boonie' : 'helmet', 'Голова', g.headName || HEAD[head] || 'Шлем') + eq('armor', 'Броня', g.armor || 'Плитник') +
      eq('rig', 'Разгрузка', g.rig || '6 подсумков') + eq('pack', 'Рюкзак', g.pack || 'Штурмовой');
  }
  function render(force) {
    const A = api(); if (!A || !win) return;
    const B = A.binds() || {};
    const self = A.items('self'), pack = A.items('pack') || [], RN = A.rigN || 6, PN = A.packN || pack.length || 8;
    const box = ref ? A.items('box', ref) : null;
    /* перерисовка только при изменении содержимого — иначе наведение и анимации не сбрасываются */
    const sig = JSON.stringify([self, pack, box, ref ? A.title(ref) : '', refs.length, refs.indexOf(ref)]);
    if (!force && sig === sigCache) return;
    sigCache = sig;
    const pSelf = win.querySelector('.lw-self'), pBox = win.querySelector('.lw-box');
    pSelf.querySelector('.lw-h').innerHTML = '<div>Снаряжение<b>' + esc(A.who()) + '</b></div><i>' + (used(self) + used(pack)) + ' предм.</i>';
    pSelf.querySelector('.lw-gear').innerHTML = gearHtml(A);
    const keyOf = (i) => A.keyName(B['slot' + (i + 1)]) || String(i + 1);
    pSelf.querySelector('.lw-body').innerHTML =
      '<div class="lw-sec">Разгрузка<i>' + used(self) + ' / ' + RN + ' · клавиши 1–6</i></div>' + gridHtml(A, 'rig', 'self', self, 0, RN, self, keyOf) +
      '<div class="lw-sec">Рюкзак<i>' + used(pack) + ' / ' + PN + ' · запас</i></div>' + gridHtml(A, 'pack', 'pack', pack, 0, PN, self);
    if (ref && box) {
      pBox.classList.remove('hide');
      const body = ref.kind === 'body';
      pBox.querySelector('.lw-h').innerHTML = '<div>' + (body ? 'Обыск' : 'Рядом') + '<b>' + esc(A.title(ref).replace(/^Обыск:\s*/, '')) + '</b></div><i>' + used(box) + ' предм.</i>';
      const tabs = pBox.querySelector('.lw-tabs');
      tabs.style.display = refs.length > 1 ? '' : 'none';
      tabs.innerHTML = refs.length > 1 ? refs.map((r, k) => '<button class="lw-tab' + (A.same(r, ref) ? ' on' : '') + '" data-k="' + k + '">' +
        esc(r.kind === 'body' ? A.title(r).replace(/^Обыск:\s*/, '').replace(/\s*·.*$/, '') : 'На земле') + '</button>').join('') : '';
      let h = '';
      if (body) {
        h += '<div class="lw-sec">Разгрузка<i>' + used(box.slice(0, RN)) + ' / ' + RN + '</i></div>' + gridHtml(A, 'rig', 'box', box, 0, RN, self);
        if (box.length > RN) h += '<div class="lw-sec">Рюкзак<i>' + used(box.slice(RN)) + ' / ' + (box.length - RN) + '</i></div>' + gridHtml(A, 'pack', 'box', box, RN, box.length, self);
      } else h += '<div class="lw-sec">На земле<i>' + used(box) + ' / ' + box.length + '</i></div>' + gridHtml(A, 'ground', 'box', box, 0, box.length, self);
      pBox.querySelector('.lw-body').innerHTML = h;
    } else pBox.classList.add('hide');
    const kY = A.keyName(B.loot) || 'Y', kT = A.keyName(B.inventory) || 'Tab';
    win.querySelector('.lw-foot').textContent = 'Тяните предмет: на ячейку — положить, за панели — выбросить · двойной щелчок / Ctrl+щелчок — переложить · X — выбросить · ' + kY + ' / ' + kT + ' — закрыть · Esc — меню';
    if (hover) setHover(cellAt(hover.side, hover.i), true);
  }
  const cellAt = (side, i) => win && win.querySelector('.lw-c[data-side="' + side + '"][data-i="' + i + '"]');
  function itemOf(side, i) {
    const A = api(); if (!A) return null;
    const arr = side === 'self' ? A.items('self') : side === 'pack' ? A.items('pack') : ref ? A.items('box', ref) : [];
    return arr[i] || null;
  }
  function setHover(c, keep) {
    if (!win) return;
    const info = win.querySelector('.lw-info');
    if (!c || c.classList.contains('empty')) { if (!keep) hover = null; info.classList.remove('on'); return; }
    hover = { side: c.dataset.side, i: +c.dataset.i };
    const A = api(), it = itemOf(hover.side, hover.i), v = it && A ? A.view(it, A.items('self')) : null;
    if (!v) { info.classList.remove('on'); return; }
    const where = hover.side === 'self' ? 'в разгрузке' : hover.side === 'pack' ? 'в рюкзаке — в бою не под рукой' : ref && ref.kind === 'body' ? 'у тела' : 'на земле';
    info.innerHTML = '<b>' + esc(v.title) + '</b>' + esc(v.sub) + (v.sub ? ' · ' : '') + where;
    info.classList.add('on');
  }
  function onOver(e) {
    if (drag && drag.on) return;
    const c = e.target.closest ? e.target.closest('.lw-c') : null;
    setHover(c);
  }

  /* --------------------------------------------------------- перетаскивание --- */
  function targetAt(x, y) {
    const e = doc.elementFromPoint(x, y);
    const c = e && e.closest ? e.closest('.lw-c') : null;
    const g = e && e.closest ? e.closest('.lw-grid') : null;
    const p = e && e.closest ? e.closest('.lw-pan') : null;
    return { cell: c, grid: g, pan: p };
  }
  function onDown(e) {
    if (e.button !== 0) return;
    const c = e.target.closest('.lw-c');
    if (!c || c.classList.contains('empty')) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { quick(c); return; }
    const r = c.getBoundingClientRect();
    drag = { side: c.dataset.side, i: +c.dataset.i, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, el: c, ghost: null, on: false };
    try { win.setPointerCapture && win.setPointerCapture(e.pointerId); } catch (er) { /* */ }
  }
  function frame() {
    raf = 0;
    if (!drag || !drag.on || !drag.ghost) return;
    drag.ghost.style.transform = 'translate3d(' + (drag.x - drag.dx) + 'px,' + (drag.y - drag.dy) + 'px,0) rotate(-1.5deg) scale(1.06)';
    const h = targetAt(drag.x, drag.y);
    const over = h.cell && h.cell !== drag.el ? h.cell : null;
    if (over !== drag.over) { if (drag.over) drag.over.classList.remove('over'); if (over) over.classList.add('over'); drag.over = over; }
    const pan = h.pan && !h.pan.classList.contains('hide') ? h.pan : null;
    if (pan !== drag.pan) { if (drag.pan) drag.pan.classList.remove('tgt'); if (pan) pan.classList.add('tgt'); drag.pan = pan; }
    win.classList.toggle('out', !h.pan);
  }
  function onMove(e) {
    if (!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.on) {
      if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 5) return;
      drag.on = true;
      const it = drag.el.querySelector('.lw-it');
      const g = el('div'); g.id = 'lootGhost';
      g.innerHTML = it ? it.innerHTML : '';
      g.style.width = drag.w + 'px'; g.style.height = drag.h + 'px';
      doc.body.appendChild(g); drag.ghost = g;
      if (it) it.classList.add('lift');
      win.classList.add('dragging');
      setHover(null);
    }
    if (!raf) raf = root.requestAnimationFrame(frame);
  }
  function clearDrag(d) {
    if (!win) return;
    win.classList.remove('dragging', 'out');
    for (const o of win.querySelectorAll('.lw-c.over')) o.classList.remove('over');
    for (const o of win.querySelectorAll('.lw-pan.tgt')) o.classList.remove('tgt');
    const it = d && d.el && d.el.querySelector('.lw-it'); if (it) it.classList.remove('lift');
  }
  /* призрак «прилетает» в ячейку (или возвращается назад, если нельзя) */
  function flyGhost(g, rect, ok) {
    if (!g) return;
    if (!rect) { g.remove(); return; }
    g.classList.add('fly');
    g.style.transform = 'translate3d(' + rect.left + 'px,' + rect.top + 'px,0) scale(1)';
    if (!ok) g.style.opacity = '0.35';
    setTimeout(() => g.remove(), 150);
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
    if (!win) { if (d.ghost) d.ghost.remove(); return; }
    clearDrag(d);
    if (!d.on) return;
    const h = targetAt(e.clientX, e.clientY);
    const fromRect = d.el.getBoundingClientRect();
    let res = null, to = null, j = -1;
    if (h.cell) { if (h.cell !== d.el) { to = h.cell.dataset.side; j = +h.cell.dataset.i; } }
    else if (h.grid) { to = h.grid.dataset.side; j = -1; }
    else if (h.pan && !h.pan.classList.contains('hide')) { to = h.pan.dataset.side; j = -1; if (to === d.side) to = null; }
    else to = 'ground';
    if (!to) { flyGhost(d.ghost, fromRect, true); return; }
    const tgtRect = h.cell ? h.cell.getBoundingClientRect() : null;
    res = act(d.side, d.i, to, j);
    if (res && res.ok) {
      if (to === 'ground') { if (d.ghost) { d.ghost.classList.add('fly'); d.ghost.style.opacity = '0'; setTimeout(() => d.ghost.remove(), 150); } }
      else flyGhost(d.ghost, tgtRect || landRect(res), true);
    } else flyGhost(d.ghost, fromRect, false);
  }
  /* куда легло (при броске на панель — ищем ячейку по итогу) */
  function landRect(res) {
    if (!res || !res.at) return null;
    const c = cellAt(res.at.side, res.at.i);
    return c ? c.getBoundingClientRect() : null;
  }
  function quick(c) {
    const side = c.dataset.side, i = +c.dataset.i;
    if (side === 'box') act('box', i, 'self', -1);
    else if (side === 'self') act('self', i, ref ? 'box' : 'pack', -1);
    else act('pack', i, 'self', -1);
  }
  function onDbl(e) {
    const c = e.target.closest('.lw-c');
    if (!c || c.classList.contains('empty')) return;
    quick(c);
  }
  function onClick(e) {
    const b = e.target.closest('.lw-tab'); if (!b) return;
    const r = refs[+b.dataset.k]; if (r) { ref = r; render(true); }
  }
  function act(from, i, to, j) {
    const A = api(); if (!A) return null;
    if (ref && !A.valid(ref)) { refresh(); return null; }
    if ((from === 'box' || to === 'box') && !ref) return null;
    let r;
    try { r = A.move(ref, from, i, to, j); } catch (er) { console.warn('loot', er); r = { ok: false, error: 'Не получилось' }; }
    if (r && r.ok) { if (r.note) note(r.note); } else if (r) note(r.error || 'Нельзя', true);
    pickRefs(A);
    render(true);
    if (r && r.ok && r.at) { const c = cellAt(r.at.side, r.at.i); if (c) { c.classList.add('land'); setTimeout(() => c.classList.remove('land'), 260); } }
    return r;
  }

  /* ------------------------------------------------------------- открытие --- */
  /* тела и тайники рядом; текущий остаётся выбранным, пока он в досягаемости */
  function pickRefs(A) {
    refs = A.nearAll ? A.nearAll() : (A.near() ? [A.near()] : []);
    const keep = ref && refs.find((r) => A.same(r, ref));
    ref = keep || refs[0] || null;
  }
  function refresh() {
    const A = api();
    if (!A || !A.embodied()) { close(); return; }
    if (drag) return;
    pickRefs(A);
    if (mode === 'body' && !ref) { close(); return; }
    render();
  }
  function openWin(m) {
    const A = api();
    if (!A || !A.embodied()) return false;
    ref = null; pickRefs(A);
    if (m === 'body' && !ref) { toast('Рядом нечего обыскивать'); return false; }
    build();
    mode = m;
    isOpen = true;
    sigCache = '';
    render(true);
    win.classList.add('on');
    doc.body.classList.add('loot-open');
    A.setInput(false);
    clearInterval(timer); timer = setInterval(refresh, 300);
    return true;
  }
  function close(noInput) {
    if (!isOpen) return;
    isOpen = false;
    clearInterval(timer); timer = 0;
    if (drag) { if (drag.ghost) drag.ghost.remove(); clearDrag(drag); drag = null; }
    if (win) { win.classList.remove('on', 'dragging', 'out'); setHover(null); }
    doc.body.classList.remove('loot-open');
    ref = null; refs = [];
    const A = api();
    if (A && !noInput) { try { A.setInput(true); } catch (e) { /* */ } }
  }
  function toggle(m) { if (isOpen) close(); else openWin(m === 'body' ? 'body' : 'self'); }

  /* свои клавиши, пока окно открыто: игра в это время ввод не принимает */
  root.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    const A = api(), B = (A && A.binds()) || {};
    if (e.code === 'Escape' || e.code === B.loot || e.code === B.inventory || e.code === 'Tab') {
      e.preventDefault(); e.stopPropagation();
      if (e.repeat) return;
      /* v23: Esc — сразу меню (В бой, Оружие…), Tab / Y — просто закрыть */
      if (e.code === 'Escape') { close(true); const U = root.AEGIS_UI; if (!(U && U.openMenu && U.openMenu()) && A) A.setInput(true); }
      else close();
      return;
    }
    /* v26: X / Delete над предметом — выбросить под ноги */
    if ((e.code === 'KeyX' || e.code === 'Delete') && hover && !drag) {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) act(hover.side, hover.i, 'ground', -1);
    }
  }, true);

  root.GLoot = { toggle, open: openWin, close, isOpen: () => isOpen, refresh };
})(window);
