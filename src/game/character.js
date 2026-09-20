/* ============================================================================
   Сборка бойца в three.js: скелет -> SkinnedMesh -> материалы.

   Четыре бойца с референса:
     delta_1 — «Дельта», зелёный лесной камуфляж, каска FAST;
     delta_2 — «Дельта», серо-зелёный, панама вместо каски (снайпер);
     alpha_1 — «Альфа», полностью чёрный;
     alpha_2 — «Альфа», чёрно-зелёный цифровой камуфляж.

   Все различия описаны данными (PRESETS), геометрия общая — это гарантирует,
   что анимация и хват оружия одинаковы у всех.
   ========================================================================== */
(function (root, factory) {
  const C = factory(root.GUtil, root.GBuf, root.GSkel, root.GSoldier, root.GTex);
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.GChar = C;
})(typeof self !== 'undefined' ? self : this, function (U, B, SK, S, T) {
  'use strict';

  /* ---------------------------------------------------------- пресеты --- */
  const PRESETS = {
    delta_1: {
      name: 'ДЕЛЬТА-1', faction: 'delta', callsign: 'Кедр',
      camo: 'delta_green',
      head: 'helmet',
      mask: true,
      gearCol: [58, 62, 42], hardCol: [40, 41, 38],
      bootCol: [46, 40, 33],
      skinTone: [201, 158, 130],
      height: 1.81, build: 1.04,
      face: { nose: 1.0, jaw: 1.08, brow: 1.1 },
      seed: 1201
    },
    delta_2: {
      name: 'ДЕЛЬТА-2', faction: 'delta', callsign: 'Сойка',
      camo: 'delta_grey',
      head: 'boonie',
      mask: true,
      gearCol: [84, 86, 72], hardCol: [48, 50, 46],
      bootCol: [58, 52, 44],
      skinTone: [196, 152, 124],
      height: 1.78, build: 0.97,
      face: { nose: 1.05, jaw: 0.94, brow: 0.95 },
      seed: 2402
    },
    alpha_1: {
      name: 'АЛЬФА-1', faction: 'alpha', callsign: 'Ворон',
      camo: 'alpha_black',
      head: 'helmet',
      mask: true,
      gearCol: [22, 23, 26], hardCol: [26, 27, 30],
      bootCol: [20, 20, 22],
      skinTone: [186, 144, 118],
      height: 1.84, build: 1.07,
      face: { nose: 0.96, jaw: 1.12, brow: 1.15 },
      seed: 3603
    },
    alpha_2: {
      name: 'АЛЬФА-2', faction: 'alpha', callsign: 'Тис',
      camo: 'alpha_cadpat',
      head: 'helmet',
      mask: true,
      gearCol: [30, 36, 28], hardCol: [28, 30, 28],
      bootCol: [24, 24, 24],
      skinTone: [192, 150, 122],
      height: 1.79, build: 1.0,
      face: { nose: 1.02, jaw: 1.0, brow: 1.0 },
      seed: 4804
    }
  };
  const ORDER = ['delta_1', 'delta_2', 'alpha_1', 'alpha_2'];

  /* --------------------------------------------------------- материалы -- */
  /* Кэш текстур: четыре бойца используют разные камуфляжи, но общие карты
     нормалей и шероховатости — генерировать их заново не нужно. */
  const texCache = new Map();
  function cached(key, make) {
    if (!texCache.has(key)) texCache.set(key, make());
    return texCache.get(key);
  }

  function mkTex(THREE, canvas, repeat, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (repeat) t.repeat.set(repeat, repeat);
    if (srgb && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /* Цвет из «человеческих» 0..255 sRGB.
     THREE.Color принимает линейные значения, поэтому прямое деление на 255
     осветляло материал вдвое: чёрные берцы получались светло-серыми. */
  function srgb(THREE, rgb) {
    const c = new THREE.Color();
    if (c.setRGB.length >= 4) c.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    else c.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).convertSRGBToLinear();
    return c;
  }

  function buildMaterials(THREE, cfg) {
    const seed = cfg.seed;
    const camoCv = cached('camo_' + cfg.camo + '_' + seed, () => T.camoAlbedo(cfg.camo, seed, 512));
    const fabN = cached('fabN', () => T.fabricNormal(77, 256, 52, 1));
    const fabR = cached('fabR', () => T.roughnessMap(91, 256, 0.70, 0.99));
    const nylN = cached('nylN', () => T.fabricNormal(31, 256, 96, 0.45));

    const uniform = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, camoCv, 1, true),
      normalMap: mkTex(THREE, fabN, 3),
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: mkTex(THREE, fabR, 2),
      roughness: 1, metalness: 0.0
    });

    const skinCv = cached('skin_' + seed, () => T.skinAlbedo(seed + 5, cfg.skinTone, 256));
    const skin = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, skinCv, 1, true),
      roughness: 0.66, metalness: 0.0
    });
    /* лёгкое подповерхностное рассеивание: кожа не должна быть «пластиком» */
    skin.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         float sss = pow(clamp(1.0 - dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
         reflectedLight.indirectDiffuse += sss * vec3(0.10, 0.028, 0.018) * diffuseColor.rgb;`
      );
    };

    const gloveCv = cached('glove_' + cfg.gearCol.join('_'), () =>
      T.nylonAlbedo([cfg.hardCol[0] * 0.8, cfg.hardCol[1] * 0.8, cfg.hardCol[2] * 0.8], seed + 9, 256));
    const glove = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, gloveCv, 2, true),
      normalMap: mkTex(THREE, nylN, 4),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.82, metalness: 0.0
    });

    const gearCv = cached('gear_' + cfg.camo + '_' + cfg.gearCol.join('_'), () =>
      T.nylonAlbedo(cfg.gearCol, seed + 13, 256));
    const gear = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, gearCv, 2, true),
      normalMap: mkTex(THREE, nylN, 5),
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.88, metalness: 0.0
    });

    const helmCv = cached('helm_' + cfg.camo + '_' + seed, () => T.helmetAlbedo(cfg.camo, seed, 256));
    const helmet = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, helmCv, 1, true),
      normalMap: mkTex(THREE, fabN, 2),
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.72, metalness: 0.06
    });

    const boot = new THREE.MeshStandardMaterial({
      color: srgb(THREE, cfg.bootCol),
      normalMap: mkTex(THREE, nylN, 3),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.74, metalness: 0.0
    });

    const hard = new THREE.MeshStandardMaterial({
      color: srgb(THREE, cfg.hardCol),
      roughness: 0.48, metalness: 0.42
    });

    const eye = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.22, metalness: 0 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.85, metalness: 0 });

    /* Балаклава — та же ткань снаряжения, но отдельным материалом, чтобы
       её меш можно было скрыть вместе с головой в виде от первого лица. */
    const mask = gear.clone();
    return { uniform, skin, glove, gear, mask, helmet, boot, hard, eye, hair };
  }

  /* ------------------------------------------------------------ сборка -- */
  function build(THREE, key) {
    const P = PRESETS[key];
    if (!P) throw new Error('нет пресета бойца: ' + key);

    const M = SK.metrics(P.height, P.build);
    const bones = SK.build(M);
    const BI = SK.indexOf(bones);
    const rest = SK.restWorld(bones);
    const W = S.makeW(BI);
    const cfg = {
      rnd: U.rng(P.seed), rest, build: P.build, face: P.face,
      /* Размер тайла камуфляжа в метрах: 512-пиксельная текстура ложится
         на 0,42 м ткани, поэтому самое крупное пятно выходит ~11 см — как
         на реальной форме. Больший тайл давал «клоунские» кляксы. */
      camoTile: 0.42, seed: P.seed
    };

    const G = S.newGroups();
    S.buildTorso(G, M, W, cfg);
    S.buildNeck(G, M, W);
    const head = S.buildHead(G, M, W, cfg);
    if (P.mask) S.buildBalaclava(G, M, W, cfg);
    if (P.head === 'helmet') S.buildHelmet(G, M, W, cfg);
    else S.buildBoonie(G, M, W, cfg);
    const armor = S.buildArmor(G, M, W, cfg);
    S.buildBelt(G, M, W, cfg);
    for (const s of [1, -1]) { S.buildArm(G, M, W, cfg, s); S.buildLeg(G, M, W, cfg, s); }

    /* --- three-скелет --- */
    const tb = bones.map((b) => {
      const o = new THREE.Bone();
      o.name = b.name;
      o.position.set(b.pos[0], b.pos[1], b.pos[2]);
      return o;
    });
    for (let i = 0; i < bones.length; i++)
      if (bones[i].parent) tb[BI[bones[i].parent]].add(tb[i]);
    /* Матрицы костей обязаны быть актуальны ДО создания Skeleton: три.js
       считает обратные bind-матрицы из текущих matrixWorld. Без этого вызова
       они получаются единичными, и смещение позы покоя применяется дважды —
       меш «взрывается» и улетает вверх. */
    tb[0].updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(tb);

    const mats = buildMaterials(THREE, P);
    const root = new THREE.Group();
    root.name = 'soldier_' + key;
    root.add(tb[0]);

    const meshes = {};
    for (const g of S.GROUPS) {
      const buf = G[g];
      if (!buf.index.length) continue;
      buf.weld(2e-4);
      buf.recomputeNormals();
      buf.normalizeWeights();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(buf.skinIndex, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(buf.skinWeight, 4));
      geo.setIndex(buf.index);
      geo.computeBoundingSphere();
      const mesh = new THREE.SkinnedMesh(geo, mats[g]);
      mesh.name = key + '_' + g;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.bind(skeleton);
      root.add(mesh);
      meshes[g] = mesh;
    }

    return {
      key, preset: P, root, skeleton, bones: tb, boneIndex: BI, metrics: M,
      rest, meshes, materials: mats,
      bone: (n) => tb[BI[n]]
    };
  }

  return { PRESETS, ORDER, build, buildMaterials };
});