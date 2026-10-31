
/* ==========================================================================
   МОДУЛЬ: game/bodycam.js
   ========================================================================== */
/* ============================================================================
   Шлемная камера (бодикам) и руки от первого лица — по bodycam_angar.html.

   Камера закреплена на шлеме и стоит на уровне глаз бойца — на одной высоте
   с глазами остальных. Наведение — как в bodycam_angar.html: мышь ведёт
   оружие руками, а голова с камерой догоняет его пружиной (по наклону —
   лишь долю, ствол опережает объектив максимум на ~31°). Руки при этом
   тянутся к рукоятке и цевью и сгибаются в локтях. В прицеле голова
   догоняет быстрее и берёт весь наклон: целик и мушка приходят в центр.

   Подвеска камеры: качание и толчки строго на касаниях стоп — по той же
   фазе шага, по которой звучат шаги и двигаются ноги (player.stepPhase:
   0 и 0,5 — касания правой и левой). На бегу — наклон корпуса вперёд,
   скрутка плеч, крен в повороте, отставание головы при разгоне и рывок при
   остановке. Объектив не зумит: у бодикама нет зума.

   Руки — риг из того же файла (viewmodel/vm.js): перчатки GLB, рукава,
   позы наготове / в прицеле / на бегу, отдача и перезарядка. Рукав берёт
   камуфляж формы бойца. AEGIS: риг ведёт любое оружие из GGuns (спека и
   дорожки перезарядки — от сборки) и гранаты GGrenades (хват, чека,
   бросок сверху и снизу); смена предмета — опустить / поднять.

   Вид от третьего лица (T) использует тот же риг: камера рига ставится так,
   что её плечи совпадают с плечами бойца, а руки тела тянутся к кистям рига.
   ========================================================================== */
(function (root, factory) {
  const B = factory(root.THREE, root.GUtil, root.GVM, root.GGuns, root.GGrenades);
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.GBodycam = B;
})(typeof self !== 'undefined' ? self : this, function (THREE, U, VM, GN, GR) {
  'use strict';

  /* параметры камеры и линзы (как в исходнике) */
  const P = {
    fov: 88, adsFov: 50, adsFovPistol: 60, distortion: 0.42, zoom: 0.74, chroma: 0.024, vignette: 0.42, /* v24: 1.0→0.42 — углы не чернеют, цель у края видна */
    sharpen: 0.55, grain: 0.05, rollingShutter: 0.45, motionBlur: 0.3, /* v10: 0.8→0.55, v24: →0.3 и сдвиг ≤0,12 — цель при развороте не размазывается */
    /* v9: «рябь» и мыло. Раньше линза увеличивала центр кадра в 1/0,74 ≈ 1,35
       раза (растягивала пиксели), поверх — перешарп 0,55 по зерну грейда,
       хроматизм 2,4 % и второе зерно. Теперь: поле зрения камеры
       компенсирует увеличение (кадр тот же, но центр 1:1), в прицеле линза
       почти прямая, резкость — адаптивная (AMD CAS), зерно одно и слабое. */
    /* v24: при 0,86 × (1 + 0,30 + …) угол кадра брал выборку за краем рендера
       (×1,16) — по бокам и в углах были чёрные полосы, а «рыбий глаз» сжимал
       цель у края. Теперь край ровно внутри кадра (0,865 × 1,15 ≈ 0,995), центр
       тот же (zoomRef), бочка вдвое слабее; в прицеле — тоже без чёрных углов.
       Виньетка линзы гасила углы до чёрного (uVig 1) — теперь мягкая. */
    zoomRef: 0.74, lensZoomHip: 0.865, lensZoomAds: 0.96, distHip: 0.14, distAds: 0.04,
    chromaHip: 0.0035, chromaAds: 0.0012, /* v24: меньше цветной каймы по краям */ sharpenV9: 0.32, grainV9: 0.012,
    bob: 1.0, shake: 1.0,
    /* наведение руками (как в исходнике): частота пружины головы по курсу,
       доля наклона, предел опережения ствола; в прицеле и на бегу голова
       догоняет быстрее */
    bodyFollow: 2.4, pitchFollow: 0.62, maxOff: 0.55, adsFollow: 10, sprintFollow: 4.2,
    /* бег: наклон корпуса (рад), крен в повороте, отставание при разгоне */
    runLean: 0.07, turnTiltGain: 0.016, maxTurnTilt: 0.09, accelGain: 0.0045, maxAccel: 0.035,
    /* В прицеле приклад лежит под щекой вровень с линией прицеливания и
       закрывал пол-кадра серой плитой: ближняя плоскость отсекает его. */
    near: 0.02, adsNear: 0.11
  };
  /* Плечи рига относительно глаз: ~0,24 м ниже и чуть позади. Позы оружия
     заданы в той же системе (viewmodel/ak.js). */
  const SHOULDER_R = [0.18, -0.24, 0.13], SHOULDER_L = [-0.18, -0.24, 0.10];
  /* плечи рига в прежней, нагрудной системе — для вида от третьего лица */
  const SHOULDER_CHEST = [0.19, -0.12, 0.12];

  /* ---------------------------------------------------- линза бодикама -- */
  /* Проход после цветокоррекции: скос строк (rolling shutter), «рыбий
     глаз», хроматизм по краю, смаз при повороте, перешарп, виньетка, шум.
     uAmt — доля эффекта (0 в свободной камере и от третьего лица). */
  const HASH = 'float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }';
  const LENS_SHADER = {
    uniforms: {
      tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uShift: { value: new THREE.Vector2() },
      uAspect: { value: 1 }, uDist: { value: P.distHip }, uZoom: { value: P.lensZoomHip }, uCA: { value: P.chromaHip },
      uRS: { value: P.rollingShutter }, uMB: { value: P.motionBlur }, uVig: { value: P.vignette },
      uSharp: { value: P.sharpenV9 }, uGrain: { value: P.grainV9 }, uTime: { value: 0 }, uAmt: { value: 0 }, uRainL: { value: 0 },
      /* v10: размер холста (выход) — линза же апскейлит внутреннее разрешение */
      uOut: { value: new THREE.Vector2(1, 1) }, uUpSharp: { value: 0.35 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes, uShift, uOut;
      uniform float uAspect, uDist, uZoom, uCA, uRS, uMB, uVig, uSharp, uGrain, uTime, uAmt, uRainL, uUpSharp;
      ${HASH}
      /* v10: бикубик Catmull-Rom за 5 билинейных выборок (Jimenez, «Filmic
         SMAA»; MJP) — резкая передискретизация при апскейле и в увеличенном
         линзой центре кадра; результат зажат в диапазон 2x2 соседей (без ореолов) */
      vec3 sampleCR(vec2 uv){
        vec2 sp = uv*uRes, t1 = floor(sp-.5)+.5, f = sp-t1;
        vec2 w0 = f*(-.5+f*(1.-.5*f)), w1 = 1.+f*f*(-2.5+1.5*f), w2 = f*(.5+f*(2.-1.5*f)), w3 = f*f*(-.5+.5*f);
        vec2 w12 = w1+w2, t12 = (t1+w2/w12)/uRes, t0 = (t1-1.)/uRes, t3 = (t1+2.)/uRes;
        vec3 c = texture2D(tDiffuse, vec2(t12.x,t0.y)).rgb*(w12.x*w0.y)
          + texture2D(tDiffuse, vec2(t0.x,t12.y)).rgb*(w0.x*w12.y)
          + texture2D(tDiffuse, t12).rgb*(w12.x*w12.y)
          + texture2D(tDiffuse, vec2(t3.x,t12.y)).rgb*(w3.x*w12.y)
          + texture2D(tDiffuse, vec2(t12.x,t3.y)).rgb*(w12.x*w3.y);
        c /= w12.x*w0.y + w0.x*w12.y + w12.x*w12.y + w3.x*w12.y + w12.x*w3.y;
        return max(c, 0.);
      }
      /* резкость по типу AMD FidelityFX RCAS: крест 1 тексель источника,
         сила падает на уже контрастных деталях, итог — в min/max креста */
      vec3 rcas(vec3 col, vec2 d, float k){
        vec2 px = 1./uRes;
        vec3 sN = texture2D(tDiffuse,d+vec2(0.,px.y)).rgb, sS = texture2D(tDiffuse,d-vec2(0.,px.y)).rgb;
        vec3 sE = texture2D(tDiffuse,d+vec2(px.x,0.)).rgb, sW = texture2D(tDiffuse,d-vec2(px.x,0.)).rgb;
        vec3 b = (sN+sS+sE+sW)*.25;
        vec3 mn = min(min(min(sN,sS),min(sE,sW)),col), mx = max(max(max(sN,sS),max(sE,sW)),col);
        vec3 amp = sqrt(clamp(min(mn, 1.-mx)/max(mx, 1e-4), 0., 1.));
        return clamp(col + (col-b)*amp*k, mn, mx);
      }
      /* v7: капли дождя на стекле бодикама. Ячейки сетки: капля появляется,
         растёт, крупные медленно сползают и высыхают; внутри — перевёрнутое
         преломлённое изображение (линза-капля), по краю — тёмный ободок. */
      vec3 dropL(vec2 uv, float sc, float t){
        vec2 g = uv*vec2(uAspect,1.)*sc; vec2 id = floor(g); vec2 f = fract(g)-.5;
        float h = hash12(id*1.37+sc);
        if (h > uRainL*.85) return vec3(0.);
        float life = fract(t*(.05+.07*hash12(id+5.3)) + h*7.1);
        vec2 p = (vec2(hash12(id+3.1), hash12(id+7.7))-.5)*.6;
        float r = (.12+.2*hash12(id+11.))*smoothstep(0.,.25,life);
        p.y -= smoothstep(.55,1.,life)*.35*step(.22,r);
        vec2 q = f-p; q.y *= 1.+.25*smoothstep(.55,1.,life);
        float d = length(q);
        float m = smoothstep(r, r*.78, d)*(1.-smoothstep(.85,1.,life));
        return vec3(q/max(r,1e-3), m);
      }
      varying vec2 vUv;
      vec2 lens(vec2 uv){
        vec2 c=(uv-.5)*2.; c.x*=uAspect;
        float r2=dot(c,c)/(1.+uAspect*uAspect);
        c*=uZoom*(1.+uDist*r2+.5*uDist*uDist*r2*r2);
        c.x/=uAspect; return c*.5+.5;
      }
      float inside(vec2 uv){ vec2 s=step(vec2(0.),uv)*step(uv,vec2(1.)); return s.x*s.y; }
      vec3 fetchCA(vec2 d){
        vec2 c=d-.5; vec2 ca=c*vec2(uAspect,1.); float r2=dot(ca,ca);
        vec2 uR=.5+c*(1.+uCA*r2), uB=.5+c*(1.-uCA*r2);
        return vec3(texture2D(tDiffuse,uR).r*inside(uR), texture2D(tDiffuse,d).g*inside(d), texture2D(tDiffuse,uB).b*inside(uB));
      }
      void main(){
        /* апскейл, если внутреннее разрешение меньше холста */
        bool up = uOut.y > uRes.y + .5;
        vec3 base = up ? sampleCR(vUv) : texture2D(tDiffuse, vUv).rgb;
        if (uAmt < 0.001) {
          if (up) base = rcas(base, vUv, uUpSharp);
          gl_FragColor = vec4(base, 1.); return;
        }
        vec2 uv = vUv;
        uv.x += uShift.x*uRS*(uv.y-.5)*2.;
        uv.y += uShift.y*uRS*.35*(uv.y-.5);
        vec2 d = mix(vUv, lens(uv), uAmt);
        float dropM = 0., dropRim = 0.;
        if (uRainL > 0.01) {
          vec3 a = dropL(vUv, 7., uTime), b2 = dropL(vUv + .37, 13., uTime*1.3);
          vec3 dr = a.z > b2.z ? a : b2;
          dropM = dr.z; dropRim = dropM*smoothstep(.55,1.,length(dr.xy));
          d -= dr.xy*dropM*vec2(1./uAspect,1.)*.045;
        }
        vec3 col = vec3(0.); vec2 bv = uShift*uMB;
        /* смаз при повороте: 6 выборок только когда камера реально движется,
           в покое — одна (экономия ~15 выборок на пиксель на слабых видеокартах) */
        int mbN = dot(bv*uRes, bv*uRes) > 0.36 ? 6 : 1;
        if (mbN == 1) {
          /* v10: в покое — бикубик (центр кадра линза увеличивает ~1,16×,
             билинейная выборка его размывала), хроматизм — разностью каналов */
          float inD = inside(d);
          col = sampleCR(d)*inD;
          if (uCA > 1e-4) { vec3 ca = fetchCA(d); vec3 c0 = texture2D(tDiffuse, d).rgb*inD; col.rb = max(col.rb + ca.rb - c0.rb, 0.); }
        } else {
          for (int i=0;i<6;i++){ if (i>=mbN) break; float t=float(i)/5.-.5; col+=fetchCA(d-bv*t); }
          col /= float(mbN);
        }
        /* v9: адаптивная резкость по типу AMD FidelityFX CAS (см. rcas) */
        col = rcas(col, d, (uSharp + (up ? uUpSharp*.5 : 0.))*(1.-dropM));
        if (dropM > 0.) { vec2 px = 1./uRes; vec3 b = (texture2D(tDiffuse,d+vec2(0.,px.y)).rgb+texture2D(tDiffuse,d-vec2(0.,px.y)).rgb)*.5;
          col = mix(col, b*1.04, dropM*.45); col *= 1.-dropRim*.35; }
        vec2 v=(vUv-.5)*vec2(uAspect,1.); float r=length(v)/length(vec2(uAspect,1.)*.5);
        col *= clamp(1.-pow(smoothstep(.4,1.,r),1.35)*uVig,0.,1.);
        float l = dot(col, vec3(.299,.587,.114));
        /* одно зерно на весь кадр (грейд своё при линзе не кладёт), сильнее в
           полутонах, почти нет в светах и в глубокой тени — как у сенсора */
        float n = hash12(vUv*uOut+fract(uTime*7.13)*1000.)-.5;
        col += n*uGrain*(0.35+0.65*(1.-abs(l*2.-1.)));
        gl_FragColor = vec4(mix(base, clamp(col,0.,1.), uAmt), 1.);
      }`
  };

  class Spring {
    constructor(f, z) { this.x = 0; this.v = 0; this.f = f; this.z = z; }
    step(t, dt) { const w = 2 * Math.PI * this.f; this.v += (w * w * (t - this.x) - 2 * this.z * w * this.v) * dt; this.x += this.v * dt; return this.x; }
  }
  const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  /* Материал рукава: камуфляж формы по развёртке рукава (u — 7 единиц по
     окружности ~0,33 м, v — единица на 0,05 м), фактура ткани рига. */
  const sleeveCache = new Map();
  /* v26: полосы тельняшки на рукаве — кольца вдоль руки (v развёртки), 20 на тайл */
  function stripeCanvas(Q, tile) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 512;
    const g = c.getContext('2d');
    const n = Math.max(4, Math.round(tile / (Q.period || 0.021)));
    g.fillStyle = 'rgb(' + Q.a.join(',') + ')'; g.fillRect(0, 0, 16, 512);
    g.fillStyle = 'rgb(' + Q.b.join(',') + ')';
    for (let i = 0; i < n; i++) g.fillRect(0, (i * 512) / n, 16, ((Q.duty || 0.43) * 512) / n);
    return c;
  }
  function sleeveMaterial(char) {
    const camo = char.materials && char.materials._camo;
    const P = char.preset || {};
    const top = P.camoTop || P.camo;
    const CL = root().GCloth;
    const Q = CL && CL.PAL && CL.PAL[top] && CL.PAL[top].stripes;
    /* v26: футболка, майка, без верха — от локтя до перчатки голая рука (тон кожи бойца) */
    const cut = CL && CL.cutOf ? CL.cutOf(top, 'top') : null;
    const bare = !!(cut && (cut.torso || cut.arm < 0.45));
    const sk = (char.materials && char.materials._skinLin) || [0.42, 0.25, 0.17];
    /* v26: вид меняется в редакторе — ключ по текстуре камуфляжа, прежний материал освобождаем */
    const key = char.key + '|' + (bare ? 'sk:' + sk.map((v) => v.toFixed(3)).join(',') : Q ? 'st:' + top : camo ? camo.uuid : '-');
    const prev = sleeveCache.get(char.key);
    if (prev && prev.key === key) return prev.mat;
    const base = VM.createJacketMaterial();
    const tile = P.camoTile || 0.42;
    if (bare) {
      base.map = null; base.normalMap = null; base.roughnessMap = null;
      base.color.setRGB(sk[0] * 1.02, sk[1] * 1.0, sk[2] * 0.98);
      base.roughness = 0.55;
      base.sheen = 0.3; base.sheenRoughness = 0.6;
      base.sheenColor.setRGB(0.5, 0.36, 0.3);
      base.needsUpdate = true;
    } else if (Q || camo) {
      const t = Q ? new THREE.CanvasTexture(stripeCanvas(Q, tile)) : camo.clone();
      if (Q && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(0.047 / tile, 0.05 / tile);
      t.needsUpdate = true;
      base.map = t;
      base.color.setRGB(1, 1, 1);
      base.sheenColor.setRGB(0.35, 0.35, 0.33);
    }
    if (prev) setTimeout(() => { try { if (prev.mat.map) prev.mat.map.dispose(); prev.mat.dispose(); } catch (e) { /* */ } }, 0);
    sleeveCache.set(char.key, { key, mat: base });
    return base;
  }
  /* v26: перчатки рук от первого лица — оттенок из образа бойца */
  function gloveTint(rig, char) {
    const t = (char && char.preset && char.preset.gloveTint) || [1, 1, 1];
    for (const h of [rig.right, rig.left]) {
      const u = h && h.material && h.material.userData && h.material.userData.uGloveTint;
      if (u) u.value.set(t[0], t[1], t[2]);
    }
  }

  /* осмотр оружия: поворот к себе левым боком, затем правым */
  const INSPECT = new Map();
  function inspectTrack(spec) {
    if (INSPECT.has(spec)) return INSPECT.get(spec);
    const pistol = spec.fam === 'pistol';
    const k = pistol ? 0.8 : 1;
    const tr = {
      duration: 2.3,
      gunPos: [[0, [0, 0, 0]], [0.45, [-0.06 * k, 0.05, -0.02]], [1.2, [-0.07 * k, 0.055, -0.02]], [1.55, [-0.02, 0.07, 0.0]], [1.95, [-0.02, 0.06, 0]], [2.3, [0, 0, 0]]],
      gunRot: [[0, [0, 0, 0]], [0.45, [8, 26, 36]], [1.2, [10, 30, 40]], [1.55, [16, -10, -28]], [1.95, [14, -12, -26]], [2.3, [0, 0, 0]]],
      left: [{ t: 0, at: 'grip', pose: 'support' }, { t: 2.3, at: 'grip', pose: 'support' }],
      events: [], magRelease: [-1, -1]
    };
    INSPECT.set(spec, tr);
    return tr;
  }

  function create(env) {
    const { scene, camera } = env;
    const assets = root().GAssets && root().GAssets.data.vm_hands;
    if (!VM || !GN || !GR || !assets) return null;
    VM.CONFIG.body.shoulderR = SHOULDER_R.slice();
    VM.CONFIG.body.shoulderL = SHOULDER_L.slice();

    const spec0 = GR.spec('m67');
    const rig = new VM.WeaponRig({ right: assets.clone(assets.right), left: assets.clone(assets.left) }, [spec0]);
    /* фонарь рига не нужен: у игры свой фонарь оружия */
    rig.flashlight.castShadow = false;
    if (rig.flashlight.parent) rig.flashlight.parent.remove(rig.flashlight);
    if (rig.flashlight.target.parent) rig.flashlight.target.parent.remove(rig.flashlight.target);
    rig.activate = function (i) {
      this.specs.forEach((s, k) => { s.model.root.visible = k === i; });
      this.index = i;
    };
    rig.events = {};
    const frame = new THREE.Group();                 // «камера рига» = глаза
    frame.name = 'bodycamRig';
    frame.add(rig.root);
    scene.add(frame);

    /* предмет в руках: { kind: 'gun', w, spec } | { kind: 'grenade', grenade, spec } | null */
    let cur = null, rigMode = null;
    const sw = { phase: 'none', t: 0, next: undefined, cb: null, fast: false };
    const thr = { on: false, style: 'over', released: false, pinOut: false, held: null, pinObj: null };
    const api = {};

    function register(sp) {
      let i = rig.specs.indexOf(sp);
      if (i >= 0) return i;
      rig.specs.push(sp);
      rig.states.push({ mag: sp.tuning.magSize, chambered: true, locked: false });
      sp.model.root.matrixAutoUpdate = false;
      sp.model.root.visible = false;
      rig.root.add(sp.model.root);
      return rig.specs.length - 1;
    }
    /* события дорожек рига -> игре (звуки) и гранате */
    const baseEvent = rig.onReloadEvent.bind(rig);
    rig.onReloadEvent = function (e, st, id, ev) {
      if (rigMode === 'throw') { throwEvent(e); return; }
      if (api.onTrackEvent) api.onTrackEvent(e, cur);
      baseEvent(e, st, id, ev);
    };
    const baseLeft = rig.leftFrame.bind(rig);
    rig.leftFrame = function (k, out) { return k.at === 'cam' ? out.copy(k.m) : baseLeft(k, out); };

    const _rlX = new THREE.Vector3(1, 0, 0);
    function restoreSprings() { rig.relPosF.set(4.2, 0.55, 0.15); rig.relRotF.set(3.6, 0.5, 0.1); }
    function stopTrack() { rig.reloading = false; rigMode = null; restoreSprings(); }

    function setItemNow(item) {
      if (rigMode === 'throw') abortThrow();
      stopTrack();
      cur = item || null;
      if (!cur) return;
      const i = register(cur.spec);
      rig.activate(i);
      rig.switchPhase = 'none';
      rig.magState = 'gun';
      rig.slideTimer = 10;
      rig.cooldown = 0;
      if (cur.kind === 'grenade') {
        const h = GR.held(cur.grenade);
        h.inst.reset();
        cur.held = h;
      }
    }
    /* Смена предмета: опустить (0,28 с) — сменить — поднять (0,42 с).
       fast — быстрее (бросок гранаты по G и возврат). */
    function equip(item, opt) {
      opt = opt || {};
      if (opt.instant) {
        setItemNow(item);
        sw.phase = 'none'; sw.next = undefined; rig.lowerW = 0;
        if (opt.onSwap) opt.onSwap(item);
        return;
      }
      sw.next = item || null; sw.cb = opt.onSwap || null; sw.fast = !!opt.fast;
      if (!cur || opt.fromLowered) {                // из пустых рук (или руки уже внизу) — сразу поднимаем
        const nx = sw.next, cb = sw.cb;
        sw.next = undefined; sw.cb = null;
        setItemNow(nx);
        if (cb) cb(nx);
        sw.phase = cur ? 'raise' : 'none'; sw.t = 0; rig.lowerW = 1;
        return;
      }
      if (sw.phase === 'none' || sw.phase === 'raise') {
        if (rigMode === 'reload' || rigMode === 'inspect') stopTrack();
        const wasRaise = sw.phase === 'raise';
        sw.phase = 'lower';
        sw.t = wasRaise ? Math.cbrt(U.clamp(rig.lowerW, 0, 1)) : 0;
      }
    }
    function updateSwitch(dt) {
      if (sw.phase === 'lower') {
        sw.t += dt / (sw.fast ? 0.17 : 0.28);
        rig.lowerW = Math.min(1, sw.t * sw.t * sw.t);
        if (sw.t >= 1) {
          const nx = sw.next === undefined ? cur : sw.next, cb = sw.cb;
          sw.next = undefined; sw.cb = null;
          setItemNow(nx);
          if (cb) cb(nx);
          if (cur) { sw.phase = 'raise'; sw.t = 0; rig.lowerW = 1; } else { sw.phase = 'none'; rig.lowerW = 1; }
        }
      } else if (sw.phase === 'raise') {
        sw.t += dt / (sw.fast ? 0.24 : 0.42);
        const e = 1 - Math.pow(1 - Math.min(1, sw.t), 3);
        rig.lowerW = 1 - e;
        if (sw.t >= 1) { sw.phase = 'none'; rig.lowerW = 0; }
      } else if (cur) rig.lowerW = 0;
    }

    /* ------------------------------------------------ бросок гранаты -- */
    function throwGrenade(style) {
      if (!cur || cur.kind !== 'grenade' || sw.phase !== 'none' || rigMode) return false;
      const sp = cur.spec;
      const tr = sp.tracks[style === 'under' ? 'under' : 'over'];
      thr.on = true; thr.style = tr.style; thr.released = false; thr.pinOut = false; thr.held = cur.held || GR.held(cur.grenade); thr.pinObj = null; thr.frozen = false; thr.tPin = 0;
      thr.held.inst.reset();
      rig.reloading = true; rig.track = tr; rig.reloadT = 0; rig.reloadSpeed = 1; rig.fumbled = false;
      rig.relPosF.set(8.5, 0.62, 0.12); rig.relRotF.set(8, 0.6, 0.1);
      rigMode = 'throw';
      return true;
    }
    function throwEvent(e) {
      const h = thr.held; if (!h) return;
      const P2 = h.inst.parts;
      if (e === 'clip') { if (P2.clip) P2.clip.visible = false; }
      else if (e === 'pinOut') {
        thr.pinOut = true; thr.tPin = rig.reloadT;
        if (P2.pin) { rig.root.updateMatrixWorld(true); rig.left.anchor.attach(P2.pin); thr.pinObj = P2.pin; }
      } else if (e === 'throw') {
        thr.released = true;
        if (api.onRelease) api.onRelease(cur, thr.style, h);
      } else if (e === 'pinDrop') {
        if (thr.pinObj) {
          const o = thr.pinObj;
          o.updateMatrixWorld(true);
          if (api.onPinDrop) api.onPinDrop(o);
          o.visible = false;
        }
      }
      if (api.onThrowEvent) api.onThrowEvent(e, cur);
    }
    /* прерывание (смерть, выход из тела): что с гранатой */
    function abortThrow() {
      const res = { live: thr.on && thr.pinOut && !thr.released, kind: cur && cur.grenade, held: thr.held };
      thr.on = false;
      if (rigMode === 'throw') stopTrack();
      return res;
    }
    function updateThrow() {
      if (!thr.on) return;
      const h = thr.held;
      const t = rig.reloadT;
      if (!thr.pinOut) {
        const k = U.smoothstep(U.clamp((t - 0.17) / 0.13, 0, 1));
        h.inst.setPin(k * (cur && cur.grenade && cur.grenade !== 'm67' ? 0.03 : 0.024));
      }
      /* «готовка»: пока кнопка броска зажата, рука с выдернутой чекой замирает
         в замахе; отпустил — бросок продолжается */
      if (thr.pinOut && !thr.released) {
        const hold = !!(api.cookHeld && api.cookHeld(thr.style));
        if (hold && t >= thr.tPin + 0.06) { rig.reloadSpeed = 0; thr.frozen = true; }
        else if (thr.frozen && !hold) { rig.reloadSpeed = 1; thr.frozen = false; }
      }
      if (!rig.reloading) {
        thr.on = false; rigMode = null; restoreSprings();
        const it = cur;
        if (api.onThrowEnd) api.onThrowEnd(it);
      }
    }

    const st = {
      active: null,
      yawS: new Spring(P.bodyFollow, 0.95), pitchS: new Spring(2.8, 0.95),
      accP: new Spring(2.6, 0.42), accR: new Spring(2.6, 0.42), prevVel: new THREE.Vector3(), leanS: 0,
      shY: new Spring(7, 0.3), shP: new Spring(8, 0.55), shR: new Spring(6, 0.6), shYaw: new Spring(7, 0.6),
      moveK: 0, runK: 0, lastStep: 0, lastShot: -1,
      yawRate: 0, pitchRate: 0, prevY: 0, prevX: 0, t: 0,
      prevFwd: new THREE.Vector3(0, 0, -1), shift: new THREE.Vector2()
    };
    const camObj = new THREE.Object3D();             // камера для рига (позиция/поворот)
    const vmCam = { camera: camObj, yawRate: 0, pitchRate: 0, breath: 0, bobPos: new THREE.Vector3(), bobRot: new THREE.Vector3(), leanRoll: 0 };
    /* v16: лучи для увода оружия от препятствий — мир (коллайдеры, грунт) и люди (game.js: fpRay) */
    const level = { raycast: (o, d, l) => (env.raycast ? env.raycast(o, d, l) : null) };
    const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
    const _mB1 = new THREE.Matrix4(), _mB2 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _pB = new THREE.Vector3(), _sB = new THREE.Vector3();
    const _m4 = new THREE.Matrix4(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
    const sight = { kind: null, k: 0, x: 0, y: 0, fov: P.fov, sight: null, scope: false, lensZ: P.lensZoomHip, lensD: P.distHip, lensCA: P.chromaHip, ads: 0 };
    api.sight = sight;

    function activate(s) {
      st.active = s;
      const c = s.ctrl;
      for (const k of ['shY', 'shP', 'shR', 'shYaw', 'accP', 'accR']) { st[k].x = 0; st[k].v = 0; }
      st.yawS.x = c.yaw; st.yawS.v = 0;
      st.pitchS.x = c.pitch * P.pitchFollow; st.pitchS.v = 0;
      st.prevVel.set(c.vel ? c.vel.x : 0, 0, c.vel ? c.vel.z : 0); st.leanS = 0;
      st.lastStep = Math.floor((c.stepPhase || 0) * 2);
      st.lastShot = c.lastShot;
      st.prevY = c.yaw; st.prevX = c.pitch;
      const sm = sleeveMaterial(s.char);
      for (const a of [rig.armR, rig.armL]) { a.sleeve.mesh.material = sm; a.sleeveTab.material = sm; }
      gloveTint(rig, s.char);
    }
    /* v26: сменился внешний вид бойца, в котором игрок (редактор «Внешний вид») */
    api.restyle = (s) => {
      if (!s || st.active !== s) return;
      const sm = sleeveMaterial(s.char);
      for (const a of [rig.armR, rig.armL]) { a.sleeve.mesh.material = sm; a.sleeveTab.material = sm; }
      gloveTint(rig, s.char);
    };

    /* помпа: ход цевья 0…1 по времени после выстрела (player.js: pumpT) */
    function pumpK(c) {
      if (!(c.pump >= 0)) return 0;
      const T = (c.WPN && c.WPN.pumpT) || [0.16, 0.30, 0.46];
      const t = c.pump;
      if (t < T[0] - 0.1) return 0;
      if (t < T[0]) return U.smoothstep((t - (T[0] - 0.1)) / 0.1);
      if (t < T[1] - 0.1) return 1;
      if (t < T[1]) return 1 - U.smoothstep((t - (T[1] - 0.1)) / 0.1);
      return 0;
    }

    /* синхронизация рига с игрой: выстрелы, перезарядка, осмотр */
    function syncGun(c, dt) {
      const w = cur.w, sp = cur.spec, S0 = rig.states[rig.index];
      const plan = c.reloadPlan;
      if (c.reload >= 0 && plan && plan.track) {
        if (rigMode !== 'reload' || rig.track !== plan.track) {
          rigMode = 'reload'; rig.reloading = true; rig.track = plan.track; rig.fumbled = false; rig.magState = 'gun';
          restoreSprings();
        }
        rig.reloadSpeed = plan.speed || 1;
        rig.reloadT = Math.max(0, c.reload * rig.reloadSpeed - dt * rig.reloadSpeed);
        if (rig.reloadT >= rig.track.duration - 1e-4) rig.reloadT = rig.track.duration - 1e-4;
      } else if (c.inspect >= 0) {
        const tr = inspectTrack(sp);
        if (rigMode !== 'inspect') { rigMode = 'inspect'; rig.reloading = true; rig.track = tr; rig.magState = 'gun'; restoreSprings(); }
        rig.reloadSpeed = 1;
        rig.reloadT = Math.max(0, Math.min(tr.duration - 1e-4, c.inspect - dt));
      } else if (rigMode === 'reload' || rigMode === 'inspect') {
        stopTrack(); rig.magState = 'gun';
      }
      /* состояние затвора / магазина для рига */
      S0.mag = c.mag; S0.chambered = c.chamber > 0; S0.locked = !!c.boltOpen;
      /* цевьё помпы и левая кисть на нём */
      let pk = pumpK(c);
      const tr = rig.reloading && rig.track;
      if (tr && tr.pump) {
        const [a, b, cc] = tr.pump, t = rig.reloadT;
        if (t > a && t < cc) pk = t < b ? (t - a) / (b - a) : 1 - (t - b) / (cc - b);
      }
      if (sp.leftGrip0) {
        sp.leftGrip.copy(sp.leftGrip0);
        if (pk > 0 && w.fam === 'pump') {
          const tv = ((w.anim && w.anim.pumpTravel) || 92) * 0.001 * pk;
          sp.leftGrip.premultiply(_m4.makeTranslation(0, 0, tv));
        }
      }
      return pk;
    }

    /* Кадр управляемого бойца. mode: 'fp' — камера на шлеме, руки рига;
       'tp' — вид со стороны, риг лишь задаёт кисти телу. */
    /* v20: самовосстановление вьюмодели. Пружины (SecondOrder) хранят
       состояние: одно нечисловое значение (NaN/Infinity) на входе навсегда
       «отравляло» их — руки и оружие пропадали до перезапуска. Теперь такое
       состояние обнаруживается сразу после rig.update и сбрасывается. */
    function rigFinite() {
      const okV = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
      if (!okV(rig.root.position) || !Number.isFinite(rig.root.quaternion.w)) return false;
      const g = rig.gunMatrix && rig.gunMatrix.elements;
      if (g) for (let i = 0; i < 16; i++) if (!Number.isFinite(g[i])) return false;
      for (const o of [rig.basePos, rig.baseRot, rig.relPosF, rig.relRotF]) if (o && o.value && !okV(o.value)) return false;
      return Number.isFinite(rig.tuck) && Number.isFinite(rig.lowerW);
    }
    function healRig() {
      if (!st.healWarned) { st.healWarned = true; console.warn('bodycam: non-finite view-model state, rig reset'); }
      st.heals = (st.heals || 0) + 1;
      for (const k of Object.keys(rig)) {
        const o = rig[k];
        if (typeof o === 'number') { if (!Number.isFinite(o)) rig[k] = 0; continue; }
        if (!o || typeof o !== 'object') continue;
        if (typeof o.yd === 'number' && typeof o.xp === 'number') {
          if (![o.y, o.yd, o.xp].every(Number.isFinite)) o.reset(0);
        } else if (o.x && o.y && o.z && typeof o.x.yd === 'number') {
          if (![o.x.y, o.y.y, o.z.y, o.x.yd, o.y.yd, o.z.yd, o.x.xp, o.y.xp, o.z.xp].every(Number.isFinite)) o.reset(new THREE.Vector3());
        } else if (typeof o.stiffness === 'number' && typeof o.velocity === 'number') {
          if (!Number.isFinite(o.value) || !Number.isFinite(o.velocity)) o.reset();
        } else if (o.isVector3) {
          if (!(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z))) o.set(0, 0, 0);
        } else if (o.isQuaternion) {
          if (!(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z) && Number.isFinite(o.w))) o.identity();
        }
      }
      const r = rig.root;
      if (!(Number.isFinite(r.position.x) && Number.isFinite(r.position.y) && Number.isFinite(r.position.z))) r.position.set(0, 0, 0);
      if (!Number.isFinite(r.quaternion.w)) r.quaternion.identity();
      if (rig.gunMatrix && !rig.gunMatrix.elements.every(Number.isFinite)) rig.gunMatrix.identity();
    }
    function update(dt, s, mode) {
      if (st.active !== s) activate(s);
      const c = s.ctrl;
      st.t += dt;
      const aimYaw = c.yaw, aimPitch = c.pitch - (c.healW ? c.healW * (c.healLook || 0.4) : 0);

      const hs = c.speed || 0, moving = c.grounded === false ? 0 : hs;
      const PH = c.PHYS || { walk: 2.55, sprint: 4.55 };
      const kk6 = 1 - Math.exp(-dt * 6);
      st.moveK += (U.clamp(moving / PH.walk, 0, 1.25) - st.moveK) * kk6;
      st.runK += ((root().GAnimator ? root().GAnimator.runK(c) : U.smoothstep(U.clamp((moving - PH.walk) / (PH.sprint - PH.walk), 0, 1))) - st.runK) * kk6;
      const stepPh = c.stepPhase || 0, ph = stepPh * Math.PI * 2;
      const step = Math.floor(stepPh * 2);
      if (step !== st.lastStep) {
        st.lastStep = step;
        if (moving > 0.35) {
          const side = step % 2 ? -1 : 1;
          const k = P.shake * U.lerp(0.55, 1.5, st.runK) * U.clamp(moving / PH.walk, 0.4, 1) * (1 - (c.ads || 0) * 0.5);
          st.shY.v -= 0.30 * k; st.shP.v -= 0.30 * k; st.shR.v += side * 0.22 * k; st.shYaw.v += side * 0.10 * k;
        }
      }
      const B = P.bob * st.moveK * (1 - (c.ads || 0) * 0.65);
      const runK = st.runK;
      const dip = 0.5 + 0.5 * Math.cos(2 * ph - U.lerp(0.35, 0.9, runK));
      const bobY = -dip * U.lerp(0.016, 0.046, runK) * B - (c.balance?.strength || 0) * 0.035;
      const bobX = Math.sin(ph) * U.lerp(0.010, 0.024, runK) * B;
      const bobRoll = Math.sin(ph) * U.lerp(0.008, 0.028, runK) * B + (c.balance?.leanZ || 0) * 0.35;
      const bobPitch = -dip * U.lerp(0.004, 0.016, runK) * B + (c.balance?.leanX || 0) * 0.30;
      const bobYaw = -Math.sin(ph + 0.4) * U.lerp(0.004, 0.018, runK) * B;
      const t = st.t;
      const nz = (a, b, cc) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * cc + 2.1) * 0.2;
      const br = 0.0025 * P.shake * (1 + st.moveK * 0.8 + runK);

      updateSwitch(dt);
      /* перевязка: оружие опущено */
      if (c.healW > 0) rig.lowerW = Math.max(rig.lowerW, Math.min(1, c.healW * 1.15));
      const gun = cur && cur.kind === 'gun' ? cur : null;
      /* выстрел: вздрагивание камеры и отдача рига */
      if (c.lastShot !== st.lastShot) {
        st.lastShot = c.lastShot;
        if (gun) {
          const pistol = gun.w.fam === 'pistol', pump = gun.w.fam === 'pump';
          const rp = gun.w.rprof || {};
          const k = P.shake * (rp.shake || (pistol ? 1.45 : pump ? 1.25 : 0.8)) * (c.trait && c.trait.recoil || 1);
          rig.recoilMul = (c.trait && c.trait.recoil) || 1;
          /* v6: детерминированный «вздрог» по номеру выстрела в очереди; в ADS ослаблен, чтобы прицел не плясал */
          const bi = (c.burstIdx || 0), sd = (gun.w.patSeed || 0.37);
          const pz = (o) => Math.sin(bi * 1.7 + sd * 6.283 + o) * 0.6 + Math.sin(bi * 0.63 + sd * 3.1 + o * 2.3) * 0.4;
          const adsS = 1 - 0.55 * U.smoothstep(c.ads || 0);
          st.shP.v += 1.9 * k * adsS; st.shR.v += pz(0.0) * 0.9 * k * adsS; st.shYaw.v += ((rp.yawBias || 0) * 0.6 + pz(2.0) * 0.45) * k * adsS; st.shY.v -= 0.15 * k * adsS;
          if (rigMode !== 'reload' && rigMode !== 'inspect') {
            const S0 = rig.states[rig.index];
            S0.mag = Math.max(1, c.mag + 1); S0.chambered = true; S0.locked = false;
            rig.cooldown = 0;
            rig.pullTrigger(true);
          }
        }
      }
      let pk = 0;
      if (gun) pk = syncGun(c, dt);
      else if (rigMode === 'reload' || rigMode === 'inspect') stopTrack();

      const adsK = U.smoothstep(c.ads || 0);
      const sprK = U.smoothstep(c.sprint || 0) * (1 - adsK);
      if (dt > 1e-4 && c.vel) {
        const ax = (c.vel.x - st.prevVel.x) / dt, az = (c.vel.z - st.prevVel.z) / dt;
        st.prevVel.set(c.vel.x, 0, c.vel.z);
        const sy = Math.sin(st.yawS.x), cy = Math.cos(st.yawS.x);
        const aFwd = -ax * sy - az * cy, aSide = ax * cy - az * sy;
        st.accTP = U.clamp(-aFwd * P.accelGain, -P.maxAccel, P.maxAccel);
        st.accTR = U.clamp(-aSide * P.accelGain, -P.maxAccel, P.maxAccel);
      }
      st.leanS += (sprK - st.leanS) * (1 - Math.exp(-dt * 4));

      const follow = U.lerp(U.lerp(P.bodyFollow, P.sprintFollow, sprK), P.adsFollow, adsK);
      st.yawS.f = follow; st.pitchS.f = U.lerp(2.8, P.adsFollow, adsK);
      const pitchK = U.lerp(P.pitchFollow, 1, adsK);
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (let i = 0; i < n; i++) {
        st.yawS.step(st.yawS.x + wrapAng(aimYaw - st.yawS.x), h);
        st.pitchS.step(aimPitch * pitchK, h);
        st.shY.step(0, h); st.shP.step(0, h); st.shR.step(0, h); st.shYaw.step(0, h);
        st.accP.step(st.accTP || 0, h); st.accR.step(st.accTR || 0, h);
      }
      /* без оружия или с гранатой голова следует за взглядом плотнее */
      const maxOff = gun ? P.maxOff : P.maxOff * 0.5;
      const dYaw = wrapAng(aimYaw - st.yawS.x);
      if (dYaw > maxOff) st.yawS.x = aimYaw - maxOff;
      if (dYaw < -maxOff) st.yawS.x = aimYaw + maxOff;

      const lean = c.lean || 0;
      const still = 1 - adsK * 0.6;
      const turnTilt = U.clamp(-st.yawS.v * P.turnTiltGain * st.moveK * (0.4 + 0.6 * runK), -P.maxTurnTilt, P.maxTurnTilt);
      /* v7: старые пружины «вздрога» (shP/shYaw/shR/shY) остаются только
         баллистической тенью (по ним летит пуля — баланс прежний); видимая
         камера получает короткий толчок GRecoil ≤ 40 мс и импульс FOV */
      const VRc = (c.vr && gun) ? c.vr.cam : null;
      const vP = VRc ? VRc.pitch : st.shP.x, vYw = VRc ? 0 : st.shYaw.x, vR = VRc ? VRc.roll : st.shR.x, vY = VRc ? 0 : st.shY.x;
      /* v11: перезарядка — голова наклоняется к горловине магазина (стрелок
         смотрит, куда вставляет: «рабочая зона» у подбородка), к концу —
         обратно к цели. Как камера-кость в анимациях перезарядки (Tarkov, MW). */
      {
        let tgt = 0;
        if (gun && rig.reloading && rig.track) {
          const tr = rig.reloadT, D = rig.track.duration || 2;
          tgt = U.smoothstep(U.clamp((tr - 0.04) / 0.32, 0, 1)) * (1 - U.smoothstep(U.clamp((tr - (D - 0.6)) / 0.5, 0, 1)));
        }
        st.rlk = U.damp(st.rlk || 0, tgt, tgt > (st.rlk || 0) ? 5 : 4, dt);
      }
      /* v12: голова опускается к горловине сильнее (≈5,5° вместо 2,4°), а
         оружие при этом остаётся на месте в мире — риг поворачивается
         относительно глаз навстречу кивку. Раньше автомат «приклеен» к
         камере и кивал вместе с головой; теперь мир уходит вверх, а руки с
         автоматом поднимаются в кадре, как при взгляде вниз на свои руки. */
      const rlP = -0.095 * st.rlk, rlY = 0.018 * st.rlk;
      rig.root.quaternion.setFromAxisAngle(_rlX, 0.053 * st.rlk);
      const camYawB = st.yawS.x + rlY + (bobYaw + st.shYaw.x + nz(0.9, 1.9, 3.7) * br) * still;
      /* v11: присед — голова «ведёт» движение (кивок вниз при приседании,
         вверх при подъёме, до ~1,5°), приземление — кивок от удара в колени
         (landDip до −0,22 м → до ~4°) */
      const cvK = U.clamp(c.crouchV || 0, -6, 6);
      const camPitchB = st.pitchS.x + rlP - 0.0055 * cvK + (c.landDip || 0) * 0.32 + (c.vaultDip || 0) - P.runLean * st.leanS
        + (bobPitch + st.shP.x + st.accP.x + nz(1.1, 2.3, 4.7) * br) * still;
      const camRollB = (bobRoll + st.shR.x + st.accR.x + turnTilt + nz(0.7, 1.7, 3.1) * br * 0.8) * still - lean * 0.22;
      /* v10: view punch отдачи (05e) — без ослабления в прицеле: щека на
         прикладе, голова и оружие получают удар вместе (см. GRecoil.pun) */
      const puP = VRc ? VRc.punchP || 0 : 0, puY = VRc ? VRc.punchY || 0 : 0;
      const camYaw = camYawB + (vYw - st.shYaw.x) * still + puY;
      const camPitch = camPitchB + (vP - st.shP.x) * still + puP;
      const camRoll = camRollB + (vR - st.shR.x) * still + (VRc ? VRc.punchR || 0 : 0);
      const camQBal = st._qBal || (st._qBal = new THREE.Quaternion());
      camQBal.setFromEuler(_e.set(camPitchB, camYawB, camRollB + (s.ctrl.vaultRoll || 0), 'YXZ'));
      _e.set(camPitch, camYaw, camRoll + (s.ctrl.vaultRoll || 0), 'YXZ');
      const camQ = _q.setFromEuler(_e);
      const headQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.yawS.x);

      if (mode === 'fp') {
        const M = s.char.metrics;
        const LOC = (typeof self !== 'undefined' ? self : globalThis).GLoco;
        const CP = LOC && LOC.crouchProfile ? LOC.crouchProfile(c, M) : null;
        let eyeY = CP ? U.lerp(M.eyeY, CP.eyeY, CP.k) : U.lerp(M.eyeY, M.eyeY - (M.hipY - 0.50), c.crouch || 0);
        /* v23: на перелазе камера держится ближе к корпусу (голова стабилизирована) —
           иначе ладони на кромке оказываются прямо под глазами и не видны */
        let cFwd = CP ? CP.eyeFwd * CP.k * (c.vault ? 0.5 : 1) + (c.vault ? CP.vFwd || 0 : 0) : 0;
        if (CP && CP.pk > 0) {
          eyeY = U.lerp(eyeY, CP.pEyeY, CP.pk);
          cFwd = U.lerp(cFwd, CP.pEyeFwd - (M.headRZ + 0.012), CP.pk);
        }
        eyeY += c.vault ? 0 : (c.landDip || 0);
        frame.position.set(c.pos.x, c.pos.y + eyeY - Math.abs(lean) * 0.055 - 0.045 * st.leanS, c.pos.z)
          .add(_v.set(bobX + lean * 0.30, bobY + vY * still,
            -(M.headRZ + 0.012) - cFwd - 0.07 * st.leanS - st.accP.x * 0.4 + (VRc ? VRc.back || 0 : 0)).applyQuaternion(headQ));
      } else {
        const sR = s.char.bone('shoulderR').getWorldPosition(new THREE.Vector3());
        const sL = s.char.bone('shoulderL').getWorldPosition(new THREE.Vector3());
        const oy = -0.11 + (SHOULDER_R[1] - SHOULDER_CHEST[1]), oz = 0.07 + (SHOULDER_R[2] - SHOULDER_CHEST[2]);
        frame.position.copy(sR.add(sL).multiplyScalar(0.5)).sub(_v.set(0, oy, oz).applyQuaternion(camQ));
      }
      frame.quaternion.copy(camQ);
      frame.updateMatrixWorld(true);
      camObj.position.copy(frame.position); camObj.quaternion.copy(frame.quaternion); camObj.updateMatrixWorld(true);

      if (dt > 1e-4) {
        const kk = 1 - Math.exp(-dt * 25);
        st.yawRate += (wrapAng(camYaw - st.prevY) / dt - st.yawRate) * kk;
        st.pitchRate += ((camPitch - st.prevX) / dt - st.pitchRate) * kk;
      }
      st.prevY = camYaw; st.prevX = camPitch;
      vmCam.yawRate = st.yawRate; vmCam.pitchRate = st.pitchRate;
      vmCam.breath = Math.sin(t * 1.15);
      /* v11: инерция оружия в руках при приседе/подъёме и приземлении:
         корпус уходит вниз — оружие на мгновение «отстаёт» (выше в кадре) */
      vmCam.bobPos.set(bobX, bobY + vY + 0.0042 * cvK - (c.landV || 0) * 0.004, 0);
      vmCam.bobRot.set(bobPitch + vP, bobYaw + vYw, bobRoll + vR);
      vmCam.leanRoll = -lean * 0.25;
      const ads = gun ? U.smoothstep(c.ads || 0) : 0;
      const spr = Math.max(U.smoothstep(c.sprint || 0) * (1 - ads), Math.min(1, (c.vaultTuck || 0) * 1.8));
      /* v20: входы пружин вьюмодели — только конечные числа (см. healRig) */
      const fin = (v) => (Number.isFinite(v) ? v : 0);
      const player = {
        get aimYaw() { return fin(aimYaw); }, set aimYaw(v) {},
        get aimPitch() { return fin(aimPitch); }, set aimPitch(v) {},
        ads: fin(ads), sprint: fin(rigMode === 'throw' ? spr * 0.3 : spr),
        fatigue: U.clamp(fin(1 - (c.stamina / (c.PHYS ? c.PHYS.staminaMax : 7.2))), 0, 1),
        grounded: c.grounded !== false, moveBlend: fin(1 + runK), speed: fin(hs), stepPhase: fin(ph),
        offsetYaw: fin(wrapAng(aimYaw - (camYaw - puY)) * (1 - spr * 0.7)), offsetPitch: fin(wrapAng(aimPitch - (camPitch - puP)) * (1 - spr * 0.9))
      };
      const visible = !!cur || !!c.vault;
      if (visible) {
        rig.recoilMul = (c.trait && c.trait.recoil) || 1; rig.swayMul = (c.trait && c.trait.sway) || 1;
        rig.ext = (gun && c.vr) ? c.vr : null;
        rig.update(Math.min(dt, 0.05), player, vmCam, level, { lmb: !!c.triggerHeld && c.ammo > 0 });
        if (!rigFinite()) healRig();
        if (rigMode === 'throw') updateThrow();
      }
      /* v23: доля упора руками на перелазе; без упора руки от первого лица не рисуются */
      const vOff = !!(c.vault && c.vault.handsOff);
      const vHW = c.vault && root().GTraversal?.handWindow ? root().GTraversal.handWindow(c.vault, true) : [0.04, 0.14, 0.48, 0.2];
      const vPlant = c.vault && !vOff ? U.smoothstep(U.clamp((c.vault.t / c.vault.dur - vHW[0]) / vHW[1], 0, 1)) * (1 - U.smoothstep(U.clamp((c.vault.t / c.vault.dur - vHW[2]) / vHW[3], 0, 1))) : 0;
      if(c.vault && mode==='fp' && vPlant>0.02){
        // The first-person gloves use the SAME world contacts as the visible body.
        // Transform them into view-rig space; do not keep holding an invisible rifle.
        rig.root.updateMatrixWorld(true);
        // v23: рабочие матрицы/векторы — одни на камеру (без выделений памяти в кадре)
        const W0=st._vW||(st._vW={inv:new THREE.Matrix4(),loc:new THREE.Matrix4(),down:new THREE.Vector3(),scl:new THREE.Vector3(),sh:new THREE.Vector3(),el:new THREE.Vector3()});
        const inverse=W0.inv.copy(rig.root.matrixWorld).invert();
        const down=W0.down.set(0,-1,0).transformDirection(inverse);
        /* v23: в упоре ладони от первого лица чуть дальше по верху преграды (до 14 см, в
           пределах её толщины) — иначе они под самой камерой и в кадр не попадают */
        const V=c.vault,plant=vPlant;
        const room=V.kind==='over'?(V.exit||0)-0.13-((V.toi||0)+0.07)-0.05:0.3;
        const vsh=Math.max(0,Math.min(0.14,room))*plant;
        const shiftM=(st._vShift||(st._vShift=new THREE.Matrix4())).makeTranslation((V.dx||0)*vsh,0,(V.dz||0)*vsh);
        for(let si=0;si<2;si++){
          const side=si?'L':'R';
          const glove=side==='R'?rig.right:rig.left,arm=side==='R'?rig.armR:rig.armL;
          const source=s.char.hands&&s.char.hands[side];
          if(!source)continue;
          source.anchor.updateMatrixWorld(true);
          const local=W0.loc.multiplyMatrices(inverse,_mB1.multiplyMatrices(shiftM,source.anchor.matrixWorld));
          local.decompose(glove.anchor.position,glove.anchor.quaternion,W0.scl);
          const open=root().GGrenades?.HANDS?.OPEN;if(open)glove.setPose(open);
          const shoulder=s.char.bone('shoulder'+side).getWorldPosition(W0.sh);
          const elbow=s.char.bone('elbow'+side).getWorldPosition(W0.el);
          const pole=elbow.sub(shoulder).transformDirection(inverse);
          /* v23: плечо — привычная точка рук от первого лица (снизу-сзади камеры): руки
             тянутся к кромке из-под кадра, как при обычном хвате */
          shoulder.fromArray(side==='R'?SHOULDER_R:SHOULDER_L);
          // ладонь в пределах длины руки рига: без растяжения предплечья и сдвига плеча в кадр
          const toG=(st._vToG||(st._vToG=new THREE.Vector3())).subVectors(glove.anchor.position,shoulder);
          const reach=(arm.upperLen||0.3)+(arm.foreLen||0.265)-0.012;
          if(toG.length()>reach)glove.anchor.position.copy(shoulder).addScaledVector(toG.normalize(),reach);
          arm.update(shoulder,glove.anchor.position,pole,glove.anchor,down,glove.ulnarSign);
        }
      }
      /* оптика: в прицеле с увеличением — картинка прицела вместо рук */
      let scopeOn = false;
      sight._k = sight.k; sight._dt = dt;
      sight.kind = null; sight.k = 0; sight.sight = null; sight.scope = false;
      if (gun && mode === 'fp') {
        const sg = gun.w.sight;
        if (sg && !sg.irons) {
          sight.sight = sg; sight.k = ads;
          if ((sg.mag || 1) > 1.01 || sg.nv) { sight.kind = 'scope'; scopeOn = ads > 0.92; }   /* v26: ПНВ за коллиматором — тоже «окуляр» */
          else sight.kind = 'dot';
        }
      }
      sight.scope = scopeOn;
      rig.root.visible = mode === 'fp' && visible && !scopeOn && !(c.vault && (vOff ? !cur : vPlant <= 0.02));
      frame.updateMatrixWorld(true);
      if (gun) {
        GN.applyToGun(rig, gun.w, rig.root.matrixWorld, { pump: pk });
        /* баллистическая тень от первого лица: рамка со старым «вздрогом» ×
           матрица оружия по старым пружинам рига */
        if (mode === 'fp') {
          const W = gun.w;
          W.root.updateMatrixWorld(true);
          const L = _mB1.copy(W.root.matrixWorld).invert().multiply(W.gun.matrixWorld);
          const fr = _mB2.compose(frame.position, camQBal, _one);
          const Mb = fr.multiply(rig.root.matrix).multiply(rig.gunMatrixBal).multiply(L);
          const B = W._fpBal || (W._fpBal = { origin: new THREE.Vector3(), q: new THREE.Quaternion() });
          B.origin.copy(W.muzzleLocal).applyMatrix4(Mb);
          Mb.decompose(_pB, B.q, _sB);
        } else gun.w._fpBal = null;
        if (c.vault && !vOff && mode !== 'fp' && !scopeOn) {
          /* v23: со стороны на перелазе оружие не пропадает, а висит на ремне на груди — как у ботов
             (руки при этом на преграде) */
          const ch = s.char && s.char.bone('chest');
          if (ch) {
            const R = gun.w.root, W1 = st._sl || (st._sl = { q: new THREE.Quaternion(), p: new THREE.Vector3(), o: new THREE.Vector3(), e: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, 2.9)) });
            ch.getWorldQuaternion(W1.q); ch.getWorldPosition(W1.p);
            R.position.copy(W1.p).add(W1.o.set(0.12, -0.12, 0.2).applyQuaternion(W1.q));
            R.quaternion.copy(W1.q).multiply(W1.e);
            R.updateMatrixWorld(true);
          }
          gun.w.root.visible = !!ch;
        } else gun.w.root.visible = !scopeOn && (!c.vault || vOff);
      }

      if (mode === 'fp') {
        camera.position.copy(frame.position);
        camera.quaternion.copy(frame.quaternion);
        /* приближение колесом: поле зрения прицеливания делится на кратность (через тангенс) */
        const zfov = (f, z) => (z && z !== 1 ? 2 * Math.atan(Math.tan(f * Math.PI / 360) / z) * 180 / Math.PI : f);
        let fov = U.lerp(P.fov, zfov(gun && gun.w.fam === 'pistol' ? P.adsFovPistol : P.adsFov, gun && gun.w.zoomMul), ads);
        let nearAds = gun && gun.w.adsNear ? gun.w.adsNear : P.adsNear;
        let near = U.lerp(P.near, nearAds, U.smoothstep(U.clamp((ads - 0.55) / 0.4, 0, 1)));
        /* v9: при наклоне (Q/E) в прицеле оружие смещается/кренится относительно
           глаза, и задняя часть прицела с ствольной коробкой попадала ЗА ближнюю
           плоскость отсечения (0,11 м) — прицел «проваливался», часть корпуса
           исчезала. Ближняя плоскость теперь не дальше реального торца прицела
           (−1,5 см) и при наклоне плавно уходит к 3 см. */
        if (!scopeOn && gun && gun.w.rearG && near > P.near) {
          gun.w.gun.updateMatrixWorld(true);
          const rw = _p1.copy(gun.w.rearG).applyMatrix4(gun.w.gun.matrixWorld).sub(frame.position);
          const fwd = _p2.set(0, 0, -1).applyQuaternion(frame.quaternion);
          const dz = rw.dot(fwd) - 0.015;
          near = Math.min(near, Math.max(P.near, dz));
        }
        if (scopeOn) {
          const sg = gun.w.sight, mag = sg.zoom ? (gun.w.zoomCur || Math.max(sg.mag || 1, sg.zoom[1] || 1)) : (sg.mag || 1) * (gun.w.zoomMul || 1);
          fov = U.clamp(52 / mag, 4, 40);
          near = 0.1;
          /* взгляд — по линии прицела */
          gun.w.root.updateMatrixWorld(true);
          const eyeW = _p1.copy(gun.w.eyeG).applyMatrix4(gun.w.gun.matrixWorld);
          const dirW = _p2.copy(gun.w.dirG).transformDirection(gun.w.gun.matrixWorld);
          camera.position.copy(eyeW);
          /* «верх» — по сетке прицела: при наклоне (Q/E) картинка в оптике кренится вместе с оружием */
          if (gun.w.upG) camera.up.copy(gun.w.upG).transformDirection(gun.w.gun.matrixWorld);
          camera.lookAt(_v.copy(eyeW).add(dirW));
          camera.up.set(0, 1, 0);
        }
        /* v9: импульс поля зрения при выстреле — только от бедра (в прицеле
           он «дёргал» картинку и марку) */
        if (!scopeOn && c.vr && gun) fov += c.vr.cam.fov * (1 - ads);
        /* v9: линза бодикама и компенсация её увеличения полем зрения камеры:
           в центре кадра 1 пиксель сцены = 1 пиксель экрана (раньше центр
           растягивался в 1,35 раза — мыло). Видимый кадр прежний. */
        const lz = U.lerp(P.lensZoomHip, P.lensZoomAds, ads);
        sight.lensZ = lz; sight.lensD = U.lerp(P.distHip, P.distAds, ads);
        sight.lensCA = U.lerp(P.chromaHip, P.chromaAds, ads); sight.ads = ads;
        fov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * P.zoomRef / lz) * 180 / Math.PI;
        sight.fov = fov;
        if (Math.abs(camera.fov - fov) > 0.01 || camera.near !== near) {
          camera.fov = fov; camera.near = near; camera.updateProjectionMatrix();
        }
        camera.updateMatrixWorld(true);
        if (sight.kind === 'dot' && ads > 0.5) {
          /* точка прицеливания коллиматора на бесконечности */
          const w = gun.w;
          const dirW = _p2.copy(w.dirG).transformDirection(w.gun.matrixWorld);
          const pt = _p1.copy(camera.position).addScaledVector(dirW, 200).project(camera);
          /* v6: лёгкий низкочастотный фильтр (≈30 Гц) — убирает дрожание DOM-точки от пружин, не отставая от ствола */
          const a = sight._t0 && sight._k > 0.5 ? 1 - Math.exp(-Math.min(0.05, sight._dt || 0.016) * 30) : 1;
          sight.x += (pt.x - (sight.x || 0)) * a; sight.y += (pt.y - (sight.y || 0)) * a;
          if (!isFinite(sight.x)) { sight.x = pt.x; sight.y = pt.y; }
          sight._t0 = 1;
        }
      }
      return true;
    }

    function measureShift() {
      const p = camera.position.clone().addScaledVector(st.prevFwd, 10).project(camera);
      if (p.z > 1 || !isFinite(p.x)) st.shift.set(0, 0); else st.shift.set(p.x * 0.5, p.y * 0.5);
      if (st.shift.length() > 0.12) st.shift.setLength(0.12);
      camera.getWorldDirection(st.prevFwd);
      return st.shift;
    }
    function handTargets(out) {
      rig.root.updateMatrixWorld(true);
      out.R = rig.right.anchor.matrixWorld; out.L = rig.left.anchor.matrixWorld;
      out.poseR = rig.right.pose; out.poseL = rig.left.pose;
      return out;
    }

    // Copy descriptors, not getter values: switching/item states must remain live.
    Object.defineProperties(api, Object.getOwnPropertyDescriptors({
      rig, frame, update, measureShift, handTargets, P, register, equip, setItemNow, throwGrenade, abortThrow, inspectTrack,
      get item() { return cur; },
      get pending() { return sw.next; },
      get switching() { return sw.phase !== 'none'; },
      get busy() { return sw.phase !== 'none' || rigMode === 'throw'; },
      get throwing() { return rigMode === 'throw'; },
      get mode() { return rigMode; },
      hide() { rig.root.visible = false; },
      healCount() { return st.heals || 0; },
      kick(k, side) {
        k = Math.min(1.5, k) * P.shake;
        st.shP.v += (0.8 + Math.random() * 0.6) * 5 * k;
        st.shY.v -= 1.6 * k;
        st.shR.v += ((side || 0) * 3 + (Math.random() - 0.5) * 5) * k;
        st.shYaw.v += (Math.random() - 0.5) * 3.5 * k;
      },
      resetNear() { if (camera.near !== P.near) { camera.near = P.near; camera.updateProjectionMatrix(); } },
      get lensAmount() { return st.lens || 0; },
      onTrackEvent: null, onRelease: null, onThrowEnd: null, onThrowEvent: null, onPinDrop: null, cookHeld: null
    }));
    return api;
  }

  function root() { return typeof self !== 'undefined' ? self : globalThis; }

  return { create, LENS_SHADER, P, inspectTrack };
});
