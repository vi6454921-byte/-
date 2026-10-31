
/* ==========================================================================
   МОДУЛЬ: viewmodel/vm.js
   ========================================================================== */
/* ============================================================================
   Руки от первого лица и хват оружия — перенесено из bodycam_angar.html
   (порт проекта models343): перчатки GLB с костями пальцев, процедурные
   рукава с folds у локтя и манжеты, риг оружия с позами (наготове, прицел,
   бег, упор в стену), покачиванием, отдачей и анимацией перезарядки.

   Оружие рига (M4, пистолет), его звук и ангар сюда не входят: риг ведёт
   АК-74 игры через адаптер (viewmodel/ak.js).

   Система «камеры рига»: -Z вперёд, +Y вверх, метры. Кисть: начало — запястье,
   -Z к пальцам, +Y — тыл кисти.
   ========================================================================== */
(function (root, factory) {
  const V = factory(root.THREE);
  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  else root.GVM = V;
})(typeof self !== 'undefined' ? self : this, function (T3) {
'use strict';
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);
const THREE = T3;
const THREE2 = T3;
const THREE3 = T3;
const THREE4 = T3;
const THREE5 = T3;
const THREE6 = T3;

// weapon/WeaponRig.ts

// config.ts
var CONFIG = {
  quality: {
    renderScale: 1,
    maxPixelRatio: 1.25,
    msaa: 4,
    shadows: true,
    shadowMapSize: 1024
  },
  camera: {
    /** Vertical FOV of the rectilinear render that the lens shader remaps. */
    renderFovV: 84,
    near: 0.02,
    far: 160,
    /** Chest mount (sternum) height and forward offset from the body centre. */
    chestHeight: 1.37,
    crouchChestHeight: 0.93,
    chestForward: 0.13,
    /** Free-aim cone ("bodycam look"): the gun moves inside it, the torso follows. ref */
    freezeYawDeg: 13.2,
    freezePitchDeg: 6,
    followSpeedIdle: 4.4,
    followSpeedWalk: 7,
    followSpeedRun: 12,
    mouseSensitivity: 21e-4,
    adsSensitivityScale: 0.65,
    invertY: false,
    /** Global scale of the body motion layers (bob, foot strikes, micro-motion). */
    motionScale: 1,
    /** Scale of the chest-camera recoil jolt. */
    recoilScale: 1,
    pitchLimitDeg: 82,
    /** Step-synchronised chest bob. Amplitudes in metres / radians. */
    bob: {
      walk: { vert: 0.012, lat: 0.011, roll: 0.018, yaw: 0.012, pitch: 7e-3 },
      run: { vert: 0.036, lat: 0.028, roll: 0.034, yaw: 0.032, pitch: 0.022 },
      crouch: { vert: 8e-3, lat: 8e-3, roll: 0.014, yaw: 8e-3, pitch: 5e-3 },
      /** Step length (m). Cadence = speed / stride: walk ~2.3 steps/s, run ~3 steps/s. */
      strideWalk: 0.86,
      strideRun: 1.6,
      strideCrouch: 0.56,
      /** Forward lean of the torso while running (rad). */
      runLean: 0.07
    },
    breathing: { rate: 0.23, vert: 4e-3, pitch: 35e-4 },
    /** Low-frequency body micro-motion. ref (NaturalMotion) */
    natural: { pos: 35e-4, rot: 32e-4, speed: 0.9 },
    turnTiltGain: 0.016,
    maxTurnTilt: 0.09,
    /** Vest mount wobble (second order), driven by body acceleration. */
    mount: { f: 2.6, z: 0.42, accelGain: 45e-4, maxOffset: 0.03 },
    /** Q / E body lean around the hips (peeking round walls and pillars). */
    lean: {
      maxAngleDeg: 17,
      /** Lateral weight shift on top of the roll (m). */
      slide: 0.17,
      pivotHeight: 0.95,
      crouchPivotHeight: 0.62,
      /** The chest camera rolls with the torso. */
      cameraRoll: 0.85,
      f: 2.3,
      z: 0.9,
      speedScale: 0.6,
      /** Minimum distance kept between the leaning camera and a wall. */
      clearance: 0.3,
      /** Оружие кренится вместе с корпусом полностью: иначе при наклоне ось прицела уходит от глаза. */
      gunCounterRoll: 0
    },
    /** Rolling-shutter readout time (s) used to skew the image on fast pans. */
    rollingShutterReadout: 0.022
  },
  movement: {
    walkSpeed: 2,
    runSpeed: 4.9,
    crouchSpeed: 1.2,
    adsSpeedScale: 0.55,
    accel: 9,
    decel: 11,
    airAccel: 1.5,
    jumpSpeed: 3.2,
    gravity: 9.81,
    radius: 0.28,
    height: 1.8,
    crouchHeight: 1.25
  },
  lens: {
    /** 0 = rectilinear, 1 = equidistant fisheye (model r = tan(s*theta)/s, s = 1 - distortion). */
    distortion: 0.62,
    zoom: 1,
    chromaticAberration: 6e-3,
    caFalloff: 2,
    edgeBlur: 0.85,
    edgeBlurStart: 0.42,
    vignetteRadius: 0.93,
    vignetteSoftness: 0.52,
    vignetteStrength: 1,
    opticalVignette: 0.55,
    vignetteSway: 0.45,
    bloomStrength: 0.028,
    bloomRadius: 0.62,
    dirtIntensity: 0.55,
    autoExposure: true,
    exposureKey: 0.085,
    exposureMin: 0.25,
    exposureMax: 2.4,
    exposureBias: 0,
    adaptSpeedUp: 1.7,
    adaptSpeedDown: 1.25,
    contrast: 1.1,
    saturation: 0.74,
    lift: [0.012, 0.016, 0.02],
    gamma: [1, 1, 1],
    gain: [1.02, 1, 0.97],
    noise: 0.02,
    chromaNoise: 0.35,
    isoNoiseGain: 0.6,
    sharpen: 0.6,
    wdr: 0.28,
    motionBlur: 1,
    shutter: 1 / 55,
    rollingShutter: 1,
    glitch: 0.23,
    /** Screen-space muzzle punch + sensor flash. ref (RecoilPunch) */
    punch: { strength: 0.05, radius: 1.07, decay: 4, flashSize: 0.09, flashOpacity: 0.37, flashDecay: 7 },
    /** Heat haze at the muzzle after a shot. ref (HeatHaze) */
    haze: { strength: 0.019, radius: 0.32, frequency: 20.9, speed: 1.35, duration: 0.28 }
  },
  /**
   * Upper body relative to the chest camera. Matched to Reissad's Bodycam footage: the lens sits
   * above the shoulder joints (top of the plate carrier), so the arms always enter the frame from
   * the bottom corners and never cover the upper half of the image or the sights.
   */
  body: {
    shoulderR: [0.19, -0.12, 0.12],
    shoulderL: [-0.19, -0.12, 0.12],
    upperArm: 0.3,
    forearm: 0.265,
    adsTransitionHz: 3.2
  },
  rifle: {
    /** Gun origin (bore axis at the rear of the upper receiver) in chest-camera space. */
    poses: {
      /** Low ready as in Bodycam: rifle runs from the bottom edge towards the frame centre. */
      hip: { pos: [0.05, -0.14, -0.12], rot: [3, 3, -4] },
      /** Rear aperture + front post on the lens axis (sight line sits 0.66° above the bore). */
      ads: { pos: [0, -0.055, -0.17], rot: [-0.66, 0, 0] },
      sprint: { pos: [0.02, -0.22, -0.02], rot: [-32, 28, -22] },
      wallTuck: { pos: [0.05, -0.22, -0.02], rot: [-32, 8, -4] }
    },
    elbowPole: { hipR: [1, -0.6, 0.3], hipL: [-0.3, -1, 0.3], adsR: [1, -0.5, 0.2], adsL: [-0.3, -1, 0.25] },
    aimPivot: [0.08, -0.08, 0.12],
    /** The rifle pivots about the shoulder pocket (butt stock), not the wrists. */
    wristPivot: [0, -0.03, 0.3],
    sway: { maxYawDeg: 9, maxPitchDeg: 7, tiltMaxDeg: 5, tiltGain: 0.55, yawGain: 0.045, pitchGain: 0.045, f: 2.6, z: 0.6 },
    bob: { walk: { x: 0.011, y: 9e-3, roll: 1.8, pitch: 1 }, run: { x: 0.024, y: 0.02, roll: 4.5, pitch: 2.8 }, adsScale: 0.4 },
    /** 5.56 through a stocked carbine: mostly straight back into the shoulder, little rise per shot. */
    recoil: {
      kickBack: 0.022,
      kickUp: 3e-3,
      pitchDeg: 2.4,
      yawDeg: 0.9,
      rollDeg: 0.8,
      fBack: 14,
      zBack: 0.7,
      f: 7,
      z: 0.55,
      climbDeg: 0.42,
      climbYawDeg: 0.22,
      recoverDelay: 0.14,
      recoverRate: 5,
      recoverFraction: 0.75,
      adsScale: 0.85,
      cameraKick: 0.016,
      cameraPitchDeg: 0.9,
      cameraRollDeg: 0.45
    },
    auto: true,
    fireInterval: 0.075,
    magSize: 30,
    slideCycleTime: 0.06,
    tuckDistance: 1.15,
    smoke: 1.7,
    flash: 1.6
  },
  fx: {
    smokeDensity: 1,
    /** Lingering room haze left by every shot. */
    hazeAmount: 1,
    sparkCount: 1,
    flashScale: 1,
    maxDecals: 140,
    maxShells: 60
  },
  overlay: {
    enabled: true,
    model: "BODYCAM X4",
    serial: "X81A0242B",
    utcOffset: "Z"
  }
};

// core/math.ts
var math_exports = {};
__export(math_exports, {
  DEG: () => DEG,
  ImpulseSpring: () => ImpulseSpring,
  SecondOrder: () => SecondOrder,
  SecondOrderVec3: () => SecondOrderVec3,
  clamp: () => clamp,
  damp: () => damp,
  dampFactor: () => dampFactor,
  easeIn: () => easeIn,
  easeInOut: () => easeInOut,
  easeOut: () => easeOut,
  fbm1: () => fbm1,
  lerp: () => lerp,
  noise1: () => noise1,
  rand: () => rand,
  randSign: () => randSign,
  saturate: () => saturate,
  smoothstep: () => smoothstep,
  wrapAngle: () => wrapAngle
});

var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var saturate = (v) => clamp(v, 0, 1);
var lerp = (a, b, t) => a + (b - a) * t;
var smoothstep = (a, b, v) => {
  const t = saturate((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
var DEG = Math.PI / 180;
var dampFactor = (lambda, dt) => 1 - Math.exp(-lambda * dt);
var damp = (a, b, lambda, dt) => lerp(a, b, dampFactor(lambda, dt));
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
var easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
var easeOut = (t) => 1 - Math.pow(1 - t, 3);
var easeIn = (t) => t * t * t;
var SecondOrder = class {
  constructor(f, z, r, x0 = 0) {
    __publicField(this, "xp");
    __publicField(this, "y");
    __publicField(this, "yd", 0);
    __publicField(this, "k1", 0);
    __publicField(this, "k2", 0);
    __publicField(this, "k3", 0);
    this.xp = x0;
    this.y = x0;
    this.set(f, z, r);
  }
  set(f, z, r) {
    this.k1 = z / (Math.PI * f);
    this.k2 = 1 / (2 * Math.PI * f * (2 * Math.PI * f));
    this.k3 = r * z / (2 * Math.PI * f);
  }
  reset(x) {
    this.xp = x;
    this.y = x;
    this.yd = 0;
  }
  update(dt, x) {
    if (dt <= 0) return this.y;
    const xd = (x - this.xp) / dt;
    this.xp = x;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    const k2 = Math.max(this.k2, h * h / 2 + h * this.k1 / 2, h * this.k1);
    for (let i = 0; i < steps; i++) {
      this.y += h * this.yd;
      this.yd += h * (x + this.k3 * xd - this.y - this.k1 * this.yd) / k2;
    }
    return this.y;
  }
};
var SecondOrderVec3 = class {
  constructor(f, z, r, v0 = new THREE.Vector3()) {
    __publicField(this, "x");
    __publicField(this, "y");
    __publicField(this, "z");
    __publicField(this, "value", new THREE.Vector3());
    this.x = new SecondOrder(f, z, r, v0.x);
    this.y = new SecondOrder(f, z, r, v0.y);
    this.z = new SecondOrder(f, z, r, v0.z);
    this.value.copy(v0);
  }
  set(f, z, r) {
    this.x.set(f, z, r);
    this.y.set(f, z, r);
    this.z.set(f, z, r);
  }
  reset(v) {
    this.x.reset(v.x);
    this.y.reset(v.y);
    this.z.reset(v.z);
    this.value.copy(v);
  }
  update(dt, target) {
    this.value.set(this.x.update(dt, target.x), this.y.update(dt, target.y), this.z.update(dt, target.z));
    return this.value;
  }
};
var ImpulseSpring = class {
  constructor(stiffness, damping) {
    this.stiffness = stiffness;
    this.damping = damping;
    __publicField(this, "value", 0);
    __publicField(this, "velocity", 0);
  }
  kick(v) {
    this.velocity += v;
  }
  update(dt, target = 0) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 480)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.stiffness * (this.value - target) - this.damping * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  reset() {
    this.value = 0;
    this.velocity = 0;
  }
};
function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}
function fbm1(x, octaves = 3) {
  let a = 0.5;
  let s = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    s += a * noise1(x);
    norm += a;
    x = x * 2.03 + 17.13;
    a *= 0.5;
  }
  return s / norm;
}
var rand = (a, b) => a + Math.random() * (b - a);
var randSign = () => Math.random() < 0.5 ? -1 : 1;

// weapon/layers.ts
var LAYER_VIEW = 0;

// weapon/Arms.ts

// weapon/proceduralTextures.ts

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })];
}
function heightToNormal(height, w, h, strength) {
  const data = new Uint8Array(w * h * 4);
  const at = (x, y) => height[(y + h) % h * w + (x + w) % w];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      data[i] = (-dx / len * 0.5 + 0.5) * 255;
      data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE2.DataTexture(data, w, h, THREE2.RGBAFormat);
  t.wrapS = t.wrapT = THREE2.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE2.LinearMipmapLinearFilter;
  t.magFilter = THREE2.LinearFilter;
  t.needsUpdate = true;
  return t;
}
function valueNoise(w, h, cell, seed) {
  const gw = Math.ceil(w / cell) + 1;
  const gh = Math.ceil(h / cell) + 1;
  const g = new Float32Array(gw * gh);
  let s = seed;
  for (let i = 0; i < g.length; i++) {
    s = s * 16807 % 2147483647;
    g[i] = s / 2147483647;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / cell;
      const fy = y / cell;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const gx0 = ix % (gw - 1);
      const gy0 = iy % (gh - 1);
      const a = g[gy0 * gw + gx0];
      const b = g[gy0 * gw + gx0 + 1];
      const c = g[(gy0 + 1) * gw + gx0];
      const d = g[(gy0 + 1) * gw + gx0 + 1];
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}
function createStippleNormal() {
  const w = 256;
  const h = 256;
  const hgt = new Float32Array(w * h);
  let s = 99;
  const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    const cx = r() * w;
    const cy = r() * h;
    const rad = 1.5 + r() * 2.2;
    for (let y = -4; y <= 4; y++)
      for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y) / rad;
        if (d < 1) {
          const px = (Math.floor(cx + x) + w) % w;
          const py = (Math.floor(cy + y) + h) % h;
          hgt[py * w + px] = Math.max(hgt[py * w + px], Math.cos(d * Math.PI * 0.5));
        }
      }
  }
  return heightToNormal(hgt, w, h, 2.2);
}
function createFinishNormal() {
  const w = 256;
  const h = 256;
  const a = valueNoise(w, h, 3, 5);
  const b = valueNoise(w, h, 17, 11);
  const hgt = new Float32Array(w * h);
  for (let i = 0; i < hgt.length; i++) hgt[i] = a[i] * 0.35 + b[i] * 0.65;
  return heightToNormal(hgt, w, h, 0.9);
}
function createGloveTextures() {
  const w = 512;
  const h = 512;
  const grain = valueNoise(w, h, 2, 21);
  const blotch = valueNoise(w, h, 24, 31);
  const hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const weave = Math.sin(x * 0.9) * Math.sin(y * 0.9 + Math.floor(x / 3.5) % 2 * 1.6);
      const i = y * w + x;
      hgt[i] = weave * 0.35 + grain[i] * 0.5 + blotch[i] * 0.4;
    }
  }
  const normal = heightToNormal(hgt, w, h, 1.6);
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const rough = 0.62 + 0.25 * grain[i] - 0.18 * blotch[i];
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, rough * 255));
    img.data[i * 4 + 2] = 0;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const roughness = new THREE2.CanvasTexture(c);
  roughness.wrapS = roughness.wrapT = THREE2.RepeatWrapping;
  roughness.colorSpace = THREE2.NoColorSpace;
  return { normal, roughness };
}
function createFabricTextures(base = [74, 78, 62], size = 512) {
  const w = size;
  const h = size;
  const grain = valueNoise(w, h, 2, 61);
  const slub = valueNoise(w, h, 9, 67);
  const blotch = valueNoise(w, h, 90, 71);
  const blotch2 = valueNoise(w, h, 37, 73);
  const cell = size / 10;
  const hgt = new Float32Array(w * h);
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const [rc, rg] = canvas(w, h);
  const rimg = rg.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const tx = x / 2.6;
      const ty = y / 2.6;
      const over = (Math.floor(tx) + Math.floor(ty)) % 2 === 0;
      const threadX = Math.sin(tx % 1 * Math.PI);
      const threadY = Math.sin(ty % 1 * Math.PI);
      let hh = (over ? threadX : threadY) * 0.35 + grain[i] * 0.15 + slub[i] * 0.2;
      const gx = Math.min(x % cell, cell - x % cell);
      const gy = Math.min(y % cell, cell - y % cell);
      const rip = Math.max(Math.exp(-(gx * gx) / 2.2), Math.exp(-(gy * gy) / 2.2));
      hh += rip * 0.55;
      hgt[i] = hh;
      const fade = 1 + (blotch[i] - 0.5) * 0.16 + (blotch2[i] - 0.5) * 0.08;
      const tint = 1 + (slub[i] - 0.5) * 0.08 + rip * 0.05 + (over ? 0.02 : -0.02);
      const k = fade * tint;
      img.data[i * 4] = Math.min(255, base[0] * k);
      img.data[i * 4 + 1] = Math.min(255, base[1] * k);
      img.data[i * 4 + 2] = Math.min(255, base[2] * k * (1 - (blotch[i] - 0.5) * 0.04));
      img.data[i * 4 + 3] = 255;
      const rough = 0.82 + (blotch[i] - 0.5) * 0.1 - rip * 0.05;
      rimg.data[i * 4] = 255;
      rimg.data[i * 4 + 1] = Math.max(0, Math.min(255, rough * 255));
      rimg.data[i * 4 + 2] = 0;
      rimg.data[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  rg.putImageData(rimg, 0, 0);
  const map = new THREE2.CanvasTexture(c);
  map.colorSpace = THREE2.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE2.RepeatWrapping;
  map.anisotropy = 8;
  const roughnessMap = new THREE2.CanvasTexture(rc);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE2.RepeatWrapping;
  const normalMap = heightToNormal(hgt, w, h, 2.4);
  normalMap.anisotropy = 8;
  return { map, normalMap, roughnessMap };
}
function createKnitNormal(size = 256) {
  const w = size;
  const h = size;
  const n = valueNoise(w, h, 3, 83);
  const hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const rib = Math.abs(Math.sin(y / h * Math.PI * 64));
      const knit2 = Math.abs(Math.sin(x / w * Math.PI * 96 + Math.sin(y / h * Math.PI * 128) * 0.6));
      hgt[y * w + x] = rib * 0.5 + knit2 * 0.25 + n[y * w + x] * 0.25;
    }
  const t = heightToNormal(hgt, w, h, 1.6);
  t.anisotropy = 8;
  return t;
}

// weapon/Arms.ts
var TAU = Math.PI * 2;
var RADIAL = 36;
var smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
var Spine = class {
  constructor() {
    __publicField(this, "pts", []);
    __publicField(this, "acc", []);
    __publicField(this, "n", 0);
  }
  get length() {
    return this.n ? this.acc[this.n - 1] : 0;
  }
  reset() {
    this.n = 0;
  }
  push(p) {
    if (this.pts.length <= this.n) this.pts.push(new THREE3.Vector3());
    this.pts[this.n].copy(p);
    this.acc[this.n] = this.n ? this.acc[this.n - 1] + p.distanceTo(this.pts[this.n - 1]) : 0;
    this.n++;
  }
  line(a, b, steps, skipFirst = true) {
    for (let i = skipFirst ? 1 : 0; i <= steps; i++) this.push(_t.lerpVectors(a, b, i / steps));
  }
  quad(a, c, b, steps) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      _t.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(c, 2 * u * t).addScaledVector(b, t * t);
      this.push(_t);
    }
  }
  /** Arc length at the vertex closest to `p`. */
  arcNear(p) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const d = this.pts[i].distanceToSquared(p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return this.acc[best];
  }
  sample(s, outP, outT) {
    const n = this.n;
    if (s <= 0) {
      outT.subVectors(this.pts[1], this.pts[0]).normalize();
      return outP.copy(this.pts[0]).addScaledVector(outT, s);
    }
    if (s >= this.acc[n - 1]) {
      outT.subVectors(this.pts[n - 1], this.pts[n - 2]).normalize();
      return outP.copy(this.pts[n - 1]).addScaledVector(outT, s - this.acc[n - 1]);
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const m = lo + hi >> 1;
      if (this.acc[m] < s) lo = m;
      else hi = m;
    }
    const t = (s - this.acc[lo]) / Math.max(1e-9, this.acc[hi] - this.acc[lo]);
    const a = this.pts[Math.max(0, lo - 1)];
    const b = this.pts[Math.min(n - 1, hi + 1)];
    outT.subVectors(b, a).normalize();
    return outP.lerpVectors(this.pts[lo], this.pts[hi], t);
  }
};
var Sweep = class {
  constructor(rings, material, uvScale, ringS) {
    this.rings = rings;
    __publicField(this, "geometry", new THREE3.BufferGeometry());
    __publicField(this, "mesh");
    __publicField(this, "pos");
    __publicField(this, "col");
    __publicField(this, "uv");
    const per = RADIAL + 1;
    this.pos = new Float32Array(rings * per * 3);
    this.col = new Float32Array(rings * per * 3).fill(1);
    const uv = this.uv = new Float32Array(rings * per * 2);
    for (let i = 0; i < rings; i++)
      for (let j = 0; j <= RADIAL; j++) {
        uv[(i * per + j) * 2] = j / RADIAL * uvScale.u;
        uv[(i * per + j) * 2 + 1] = ringS(i) * uvScale.v;
      }
    const idx = [];
    for (let i = 0; i < rings - 1; i++)
      for (let j = 0; j < RADIAL; j++) {
        const a = i * per + j;
        const b = a + 1;
        const c = a + per;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    this.geometry.setIndex(idx);
    this.geometry.setAttribute("position", new THREE3.BufferAttribute(this.pos, 3).setUsage(THREE3.DynamicDrawUsage));
    this.geometry.setAttribute("color", new THREE3.BufferAttribute(this.col, 3).setUsage(THREE3.DynamicDrawUsage));
    this.geometry.setAttribute("uv", new THREE3.BufferAttribute(uv, 2).setUsage(THREE3.DynamicDrawUsage));
    this.mesh = new THREE3.Mesh(this.geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
  commit() {
    const g = this.geometry;
    g.getAttribute("position").needsUpdate = true;
    g.getAttribute("color").needsUpdate = true;
    g.getAttribute("uv").needsUpdate = true;
    /* Нормали сетки «кольца × радиус» — центральными разностями прямо по
       массиву позиций. Общий computeVertexNormals() шёл через
       fromBufferAttribute по каждому треугольнику и съедал до 70 %
       времени кадра от первого лица. Шов (j = 0 и j = RADIAL — одна точка)
       замыкается сам: соседи берутся по кругу. */
    let n = g.getAttribute("normal");
    if (!n) { n = new THREE3.BufferAttribute(new Float32Array(this.pos.length), 3).setUsage(THREE3.DynamicDrawUsage); g.setAttribute("normal", n); }
    const N = n.array, P = this.pos, per = RADIAL + 1, R = this.rings;
    for (let i = 0; i < R; i++) {
      const i0 = i > 0 ? i - 1 : 0, i1 = i < R - 1 ? i + 1 : R - 1;
      for (let j = 0; j <= RADIAL; j++) {
        const jm = j > 0 ? j - 1 : RADIAL - 1, jp = j < RADIAL ? j + 1 : 1;
        const a = (i * per + jm) * 3, b = (i * per + jp) * 3, c = (i0 * per + j) * 3, d = (i1 * per + j) * 3;
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
        const vx = P[d] - P[c], vy = P[d + 1] - P[c + 1], vz = P[d + 2] - P[c + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const k = (i * per + j) * 3;
        N[k] = nx / l; N[k + 1] = ny / l; N[k + 2] = nz / l;
      }
    }
    n.needsUpdate = true;
  }
};
var _t = new THREE3.Vector3();
var _c = new THREE3.Vector3();
var _tan = new THREE3.Vector3();
var _A = new THREE3.Vector3();
var _B = new THREE3.Vector3();
var _q = new THREE3.Quaternion();
var _d = new THREE3.Vector3();
var SLEEVE_LAYOUT = { upper: 12, elbow: 34, fore: 9, cuff: 18, lip: 2 };
var SLEEVE_RINGS = SLEEVE_LAYOUT.upper + SLEEVE_LAYOUT.elbow + SLEEVE_LAYOUT.fore + SLEEVE_LAYOUT.cuff + SLEEVE_LAYOUT.lip;
var CUFF_RINGS = 26;
function sleeveTables(seed) {
  const n = RADIAL + 1, F = () => new Float32Array(n);
  const T = { ct: F(), st: F(), s1: F(), c1: F(), s2: F(), c2: F(), s3: F(), c3: F(), s5: F(), c5: F(), s6: F(), c6: F(), s53: F(), c53: F(), s22: F(), c22: F() };
  for (let j = 0; j < n; j++) {
    const th = j / RADIAL * TAU;
    T.ct[j] = Math.cos(th); T.st[j] = Math.sin(th);
    const t1 = 1.3 * Math.sin(th * 1.7 + seed) + 0.6 * Math.sin(th * 3.1 - seed * 2);
    T.s1[j] = Math.sin(t1); T.c1[j] = Math.cos(t1);
    T.s2[j] = Math.sin(th * 2); T.c2[j] = Math.cos(th * 2);
    T.s3[j] = Math.sin(th * 3); T.c3[j] = Math.cos(th * 3);
    T.s5[j] = Math.sin(th * 5); T.c5[j] = Math.cos(th * 5);
    const t6 = 0.9 * Math.sin(th * 2 + seed * 3) + 0.4 * Math.sin(th * 5 + seed);
    T.s6[j] = Math.sin(t6); T.c6[j] = Math.cos(t6);
    T.s53[j] = Math.sin(th * 5.3); T.c53[j] = Math.cos(th * 5.3);
    T.s22[j] = Math.sin(th * 2.2); T.c22[j] = Math.cos(th * 2.2);
  }
  return T;
}
var Arm = class {
  constructor(side, look, upperLen, foreLen) {
    this.side = side;
    this.upperLen = upperLen;
    this.foreLen = foreLen;
    __publicField(this, "group", new THREE3.Group());
    __publicField(this, "elbow", new THREE3.Vector3());
    __publicField(this, "sleeve");
    __publicField(this, "cuff");
    __publicField(this, "spine", new Spine());
    __publicField(this, "sleeveTab");
    __publicField(this, "cuffTab");
    __publicField(this, "seed");
    /** Elbow bend (rad, 0 = straight), exposed for debugging. */
    __publicField(this, "bend", 0);
    this.seed = side === "right" ? 1.7 : 4.3;
    this.sleeve = new Sweep(SLEEVE_RINGS, look.sleeve, { u: 7, v: 1 }, () => 0);
    this.cuff = new Sweep(CUFF_RINGS, look.gloveCuff, { u: 4, v: 1 }, () => 0);
    this.sleeveTab = new THREE3.Mesh(new THREE3.BoxGeometry(0.03, 35e-4, 0.022, 3, 1, 2), look.sleeve);
    this.cuffTab = new THREE3.Mesh(new THREE3.BoxGeometry(0.022, 3e-3, 0.02, 3, 1, 2), look.glove);
    for (const m of [this.sleeveTab, this.cuffTab]) {
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
    }
    this.group.add(this.sleeve.mesh, this.cuff.mesh, this.sleeveTab, this.cuffTab);
  }
  /**
   * All inputs in camera space. `hand` is the glove anchor (-Z distal, +Y dorsal, +X = `ulnarSign`
   * towards the little finger), `down` is world down.
   */
  update(shoulder, wrist, poleHint, hand, down, ulnarSign) {
    const a = this.upperLen;
    const b = this.foreLen;
    const S = shoulder.clone();
    const toW = new THREE3.Vector3().subVectors(wrist, S);
    let d = toW.length();
    const maxReach = a + b - 2e-3;
    if (d > maxReach) {
      S.addScaledVector(toW.normalize(), Math.min(d - maxReach, 0.09));
      toW.subVectors(wrist, S);
      d = toW.length();
    }
    d = THREE3.MathUtils.clamp(d, Math.abs(a - b) + 0.01, maxReach);
    const dir = toW.clone().normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const proj = a * cosA;
    const h = Math.sqrt(Math.max(a * a - proj * proj, 0));
    const pole = poleHint.clone().addScaledVector(dir, -poleHint.dot(dir)).normalize();
    const E = this.elbow.copy(S).addScaledVector(dir, proj).addScaledVector(pole, h);
    const W = wrist;
    const dU = new THREE3.Vector3().subVectors(E, S).normalize();
    const dF = new THREE3.Vector3().subVectors(W, E).normalize();
    this.bend = Math.acos(THREE3.MathUtils.clamp(dU.dot(dF), -1, 1));
    hand.updateMatrix();
    const hX = new THREE3.Vector3().setFromMatrixColumn(hand.matrix, 0).normalize();
    const hY = new THREE3.Vector3().setFromMatrixColumn(hand.matrix, 1).normalize();
    const hZ = new THREE3.Vector3().setFromMatrixColumn(hand.matrix, 2).normalize();
    const hDist = hZ.clone().negate();
    const sp = this.spine;
    sp.reset();
    const lU = S.distanceTo(E);
    const lF = E.distanceTo(W);
    const rE = Math.min(0.065, lU * 0.35, lF * 0.35);
    const P1 = E.clone().addScaledVector(dU, -rE);
    const P2 = E.clone().addScaledVector(dF, rE);
    const rW = 0.022;
    const Wb = W.clone().addScaledVector(dF, -rW);
    const Wa = W.clone().addScaledVector(hDist, rW);
    sp.push(S);
    sp.line(S, P1, 14);
    sp.quad(P1, E, P2, 16);
    sp.line(P2, Wb, 20);
    sp.quad(Wb, W, Wa, 8);
    sp.line(Wa, W.clone().addScaledVector(hDist, 0.045), 4);
    const sE = sp.arcNear(E);
    const sW = sp.arcNear(W);
    const sHem = sW - 0.036;
    const inner = new THREE3.Vector3().subVectors(S.clone().add(W).multiplyScalar(0.5), E);
    if (inner.lengthSq() < 1e-8) inner.copy(pole).negate();
    inner.normalize();
    const bendK = smooth(0.25, 1.7, this.bend);
    const frameAt = /* @__PURE__ */ new Map();
    const ringsS = [];
    const pushRange = (s0, s1, count, inclusiveEnd = false) => {
      for (let i = 0; i < count; i++) ringsS.push(s0 + (s1 - s0) * i / (inclusiveEnd ? count - 1 : count));
    };
    const L = SLEEVE_LAYOUT;
    const e0 = Math.max(0.02, sE - 0.085);
    const e1 = Math.min(sHem - 0.1, sE + 0.085);
    const c0 = sHem - 0.075;
    pushRange(0, e0, L.upper);
    pushRange(e0, e1, L.elbow);
    pushRange(e1, c0, L.fore);
    pushRange(c0, sHem, L.cuff, true);
    const sleeveCount = ringsS.length;
    const g0 = sHem - 0.028;
    const g1 = sW + 0.03;
    for (let i = 0; i < CUFF_RINGS; i++) ringsS.push(g0 + (g1 - g0) * i / (CUFF_RINGS - 1));
    const order = ringsS.map((s, i) => [s, i]).sort((x, y) => x[0] - y[0]);
    let prevT = null;
    const N = new THREE3.Vector3();
    for (const [s] of order) {
      if (frameAt.has(s)) continue;
      const c = new THREE3.Vector3();
      const t = new THREE3.Vector3();
      sp.sample(s, c, t);
      if (!prevT) {
        N.copy(pole).addScaledVector(t, -pole.dot(t)).normalize();
      } else {
        _q.setFromUnitVectors(prevT, t);
        N.applyQuaternion(_q);
        N.addScaledVector(t, -N.dot(t)).normalize();
      }
      prevT = t.clone();
      frameAt.set(s, { n: N.clone(), t, c });
    }
    const fw = frameAt.get(order.reduce((best, cur) => Math.abs(cur[0] - sW) < Math.abs(best[0] - sW) ? cur : best)[0]);
    const wantB = hY.clone().addScaledVector(fw.t, -hY.dot(fw.t)).normalize();
    const bAtW = fw.n.clone();
    const twistW = Math.atan2(new THREE3.Vector3().crossVectors(bAtW, wantB).dot(fw.t), bAtW.dot(wantB));
    const twistAt = (s) => twistW * smooth(sE + 0.02, sW, s);
    const per = RADIAL + 1;
    const pos = this.sleeve.pos;
    const col = this.sleeve.col;
    const seed = this.seed;
    for (let i = 0; i < SLEEVE_RINGS; i++) {
      const isLip = i >= sleeveCount;
      const s = isLip ? sHem - 3e-3 * (i - sleeveCount + 1) : ringsS[i];
      const f = frameAt.get(isLip ? ringsS[sleeveCount - 1] : s) ?? frameAt.get(ringsS[sleeveCount - 1]);
      _c.copy(f.c);
      if (isLip) _c.addScaledVector(f.t, -3e-3 * (i - sleeveCount + 1));
      _tan.copy(f.t);
      _B.copy(f.n).applyAxisAngle(_tan, twistAt(s));
      _A.crossVectors(_B, _tan).normalize();
      const uU = s / Math.max(sE, 1e-3);
      const uF = (s - sE) / Math.max(sHem - sE, 1e-3);
      let ra;
      let rb;
      if (s < sE) {
        ra = THREE3.MathUtils.lerp(0.059, 0.053, uU);
        rb = THREE3.MathUtils.lerp(0.056, 0.05, uU);
      } else {
        const belly = Math.exp(-(((uF - 0.22) / 0.3) ** 2));
        /* предплечье в рукаве сужается к запястью: ≈ 9,5 → 7,5 см в поперечнике */
        ra = 0.049 - uF * 0.011 + belly * 2e-3;
        rb = 0.046 - uF * 0.013 + belly * 2e-3;
      }
      const hem = smooth(sHem - 0.012, sHem, s);
      ra *= 1 + hem * 0.04;
      rb *= 1 + hem * 0.04;
      if (isLip) {
        const k = 1 - 0.07 * (i - sleeveCount + 1);
        ra *= k;
        rb *= k;
      }
      _d.copy(inner).addScaledVector(_tan, -inner.dot(_tan));
      const thIn = Math.atan2(_d.dot(_B), _d.dot(_A));
      _d.copy(down).addScaledVector(_tan, -down.dot(_tan));
      const thDown = Math.atan2(_d.dot(_B), _d.dot(_A));
      const dE = s - sE;
      const wE = Math.exp(-((dE / 0.075) ** 2));
      const wF = smooth(sE + 0.04, sE + 0.1, s) * (1 - smooth(sHem - 0.08, sHem - 0.04, s));
      const dC = sHem - s;
      const wC = 1 - smooth(0, 0.085, dC);
      const wUp = 1 - smooth(sE - 0.12, sE - 0.06, s);
      /* Тригонометрия по кругу — из таблиц (по зерну рукава), по кольцу —
         один раз на кольцо: sin(a + b) = sin a·cos b + cos a·sin b. Раньше
         ~20 sin/cos считались на каждую из 2 849 вершин рукава каждый кадр. */
      const T = this._tab || (this._tab = sleeveTables(seed));
      const cI = Math.cos(thIn), sI = Math.sin(thIn), cD = Math.cos(thDown), sD = Math.sin(thDown);
      const a1 = dE / 0.021 * Math.PI, sa1 = Math.sin(a1), ca1 = Math.cos(a1);
      const a2 = dE * TAU / 0.12 + seed * 1.3, sa2 = Math.sin(a2), ca2 = Math.cos(a2);
      const a3 = s * TAU / 0.05 + seed, sa3 = Math.sin(a3), ca3 = Math.cos(a3);
      const a4 = s * TAU / 0.037 + seed * 2.1, sa4 = Math.sin(a4), ca4 = Math.cos(a4);
      const a5 = -s * TAU / 0.061 + seed, sa5 = Math.sin(a5), ca5 = Math.cos(a5);
      const a6 = s / 0.0155 * Math.PI, sa6 = Math.sin(a6), ca6 = Math.cos(a6);
      const a7 = s * TAU / 0.2 + seed * 0.7, sa7 = Math.sin(a7), ca7 = Math.cos(a7);
      const a8 = s * 61 + seed, sa8 = Math.sin(a8), ca8 = Math.cos(a8);
      const a9 = -s * 37, sa9 = Math.sin(a9), ca9 = Math.cos(a9);
      const kE = wE * bendK, useE = kE > 1e-5, useF = wF > 1e-5, useC = wC > 1e-5;
      const kF2b = 29e-4 * (0.35 + 0.65 * wF + 0.5 * wUp), kUp = 17e-4 * wUp, kDn = 32e-4 * (1 - wC * 0.7);
      for (let j = 0; j <= RADIAL; j++) {
        const ct = T.ct[j];
        const st = T.st[j];
        const cIn = ct * cI + st * sI;
        const inW = cIn > 0 ? cIn : 0;
        const outW = cIn < 0 ? -cIn : 0;
        let disp = 0;
        let ao = 0;
        if (!isLip) {
          if (useE) {
            const crease = Math.abs(sa1 * T.c1[j] + ca1 * T.s1[j]);
            const fold1 = (crease - 0.6) * 72e-4 * inW * Math.sqrt(inW) * kE;
            disp += fold1 + 45e-4 * inW * kE + 22e-4 * outW * kE;
            ao += Math.max(0, -fold1) / 35e-4 * 0.35 + inW * kE * 0.22;
          }
          const fold2 = useF ? 44e-4 * wF * (T.s2[j] * ca2 + T.c2[j] * sa2) * (0.7 + 0.3 * (st * ca3 + ct * sa3)) : 0;
          const cr = (T.s3[j] * ca4 + T.c3[j] * sa4) * (T.s5[j] * ca5 + T.c5[j] * sa5);
          const fold2b = kF2b * (Math.abs(cr) - 0.35);
          disp += fold2 + fold2b;
          ao += Math.max(0, -fold2) / 44e-4 * 0.3 + Math.max(0, -fold2b) / 2e-3 * 0.22;
          if (useC) {
            const fold3 = (Math.abs(sa6 * T.c6[j] + ca6 * T.s6[j]) - 0.55) * 42e-4 * wC + 18e-4 * wC;
            disp += fold3;
            ao += Math.max(0, 24e-4 * wC - fold3) / 3e-3 * 0.38;
          }
          disp += kUp * (T.s3[j] * ca7 + T.c3[j] * sa7);
          const cdn = ct * cD + st * sD;
          if (cdn > 0) disp += kDn * cdn * cdn;
          disp += 9e-4 * (T.s53[j] * ca8 + T.c53[j] * sa8) * (T.s22[j] * ca9 + T.c22[j] * sa9);
        }
        const k = (i * per + j) * 3;
        const rx = ra + disp;
        const ry = rb + disp;
        pos[k] = _c.x + _A.x * ct * rx + _B.x * st * ry;
        pos[k + 1] = _c.y + _A.y * ct * rx + _B.y * st * ry;
        pos[k + 2] = _c.z + _A.z * ct * rx + _B.z * st * ry;
        const lum = isLip ? 0.35 : 1 - Math.min(0.55, ao) - wC * 0.08;
        col[k] = col[k + 1] = col[k + 2] = lum;
        this.sleeve.uv[(i * per + j) * 2 + 1] = s / 0.05;
      }
      if (i === sleeveCount - 6) {
        const outAng = Math.atan2(ulnarSign * hX.dot(_B), ulnarSign * hX.dot(_A));
        const dirOut = _t.copy(_A).multiplyScalar(Math.cos(outAng)).addScaledVector(_B, Math.sin(outAng));
        this.sleeveTab.position.copy(_c).addScaledVector(dirOut, (ra + rb) * 0.5 + 4e-3);
        const m = new THREE3.Matrix4().makeBasis(_tan.clone().cross(dirOut).normalize(), dirOut.clone(), _tan.clone());
        this.sleeveTab.quaternion.setFromRotationMatrix(m);
      }
    }
    this.sleeve.commit();
    const cpos = this.cuff.pos;
    const ccol = this.cuff.col;
    for (let i = 0; i < CUFF_RINGS; i++) {
      const s = ringsS[sleeveCount + i];
      const f = frameAt.get(s);
      _c.copy(f.c);
      _tan.copy(f.t);
      _B.copy(f.n).applyAxisAngle(_tan, twistAt(s));
      const kH = smooth(sW - 0.01, sW + 0.015, s);
      if (kH > 0) _B.lerp(_d.copy(hY).addScaledVector(_tan, -hY.dot(_tan)).normalize(), kH).normalize();
      _A.crossVectors(_B, _tan).normalize();
      const u = (s - g0) / (sW - g0);
      let ra = THREE3.MathUtils.lerp(0.035, 0.0305, Math.min(1, u));
      let rb = THREE3.MathUtils.lerp(0.029, 0.0228, Math.min(1, u));
      if (s > sW) {
        const k2 = smooth(sW, g1, s);
        ra = THREE3.MathUtils.lerp(ra, 0.028, k2);
        rb = THREE3.MathUtils.lerp(rb, 0.019, k2);
      }
      const st0 = sW - 0.034;
      const st1 = sW - 0.012;
      const strap = smooth(st0 - 2e-3, st0 + 2e-3, s) * (1 - smooth(st1 - 2e-3, st1 + 2e-3, s));
      const edge = Math.exp(-(((s - st0) / 18e-4) ** 2)) + Math.exp(-(((s - st1) / 18e-4) ** 2));
      for (let j = 0; j <= RADIAL; j++) {
        const th = j / RADIAL * TAU;
        const ct = Math.cos(th);
        const sn = Math.sin(th);
        const disp = strap * 16e-4 + edge * 5e-4 + 6e-4 * Math.sin(th * 4 + s * 300) * (1 - strap);
        const k = (i * per + j) * 3;
        cpos[k] = _c.x + _A.x * ct * (ra + disp) + _B.x * sn * (rb + disp);
        cpos[k + 1] = _c.y + _A.y * ct * (ra + disp) + _B.y * sn * (rb + disp);
        cpos[k + 2] = _c.z + _A.z * ct * (ra + disp) + _B.z * sn * (rb + disp);
        const lum = (1 + strap * 0.35) * (1 - (1 - smooth(sHem - 4e-3, sHem + 0.01, s)) * 0.6);
        ccol[k] = ccol[k + 1] = ccol[k + 2] = lum;
        this.cuff.uv[(i * per + j) * 2 + 1] = s / 0.03;
      }
      if (i === Math.round((CUFF_RINGS - 1) * ((st0 + st1) / 2 - g0) / (g1 - g0))) {
        const dirOut = _t.copy(_B).multiplyScalar(0.85).addScaledVector(_A, 0.5 * ulnarSign * Math.sign(hX.dot(_A)) || 0.5).normalize();
        this.cuffTab.position.copy(_c).addScaledVector(dirOut, (ra + rb) * 0.5 + 25e-4);
        const m = new THREE3.Matrix4().makeBasis(_tan.clone().cross(dirOut).normalize(), dirOut.clone(), _tan.clone());
        this.cuffTab.quaternion.setFromRotationMatrix(m);
      }
    }
    this.cuff.commit();
  }
};
var sleeveTex = null;
var SLEEVE_COLORS = {
  ranger: ["Ranger Green", 3817522],
  black: ["\u0427\u0451\u0440\u043D\u044B\u0439", 2105118],
  navy: ["\u0422\u0451\u043C\u043D\u043E-\u0441\u0438\u043D\u0438\u0439 (\u043F\u043E\u043B\u0438\u0446\u0438\u044F)", 1975859],
  coyote: ["Coyote Brown", 6969667],
  grey: ["\u0421\u0435\u0440\u044B\u0439", 3948355]
};
var FABRIC_MID = 0.2158;
function setSleeveColor(m, key2) {
  const hex = (SLEEVE_COLORS[key2] ?? SLEEVE_COLORS.ranger)[1];
  m.color.set(hex).multiplyScalar(1 / FABRIC_MID);
  m.sheenColor.set(hex).multiplyScalar(0.9);
  m.userData.sleeveColor = key2 in SLEEVE_COLORS ? key2 : "ranger";
}
var knit = null;
function createJacketMaterial() {
  sleeveTex ?? (sleeveTex = createFabricTextures([128, 128, 128]));
  const m = new THREE3.MeshPhysicalMaterial({
    color: 16777215,
    map: sleeveTex.map,
    normalMap: sleeveTex.normalMap,
    normalScale: new THREE3.Vector2(0.8, 0.8),
    roughnessMap: sleeveTex.roughnessMap,
    roughness: 1,
    metalness: 0,
    sheen: 0.22,
    sheenRoughness: 0.8,
    vertexColors: true,
    side: THREE3.DoubleSide
  });
  setSleeveColor(m, "ranger");
  return m;
}
function createGloveCuffMaterial() {
  knit ?? (knit = createKnitNormal());
  knit.wrapS = knit.wrapT = THREE3.RepeatWrapping;
  /* манжета перчатки в тон коричнево-койотовой перчатки: чёрное кольцо читалось дырой */
  return new THREE3.MeshPhysicalMaterial({
    color: 0x3a3127,
    roughness: 0.72,
    metalness: 0,
    normalMap: knit,
    normalScale: new THREE3.Vector2(0.5, 0.5),
    sheen: 0.5,
    sheenRoughness: 0.5,
    sheenColor: new THREE3.Color(3948098),
    vertexColors: true
  });
}

// weapon/assets.ts

function setLayerRecursive(o, layer) {
  o.traverse((c) => c.layers.set(layer));
}

// weapon/GlovedHand.ts

var FINGER_JOINTS = {
  thumb: ["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
  index: ["index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip"],
  middle: ["middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip"],
  ring: ["ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip"],
  pinky: ["pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"]
};
var _q2 = new THREE4.Quaternion();
var _q22 = new THREE4.Quaternion();
var _v = new THREE4.Vector3();
var AX = new THREE4.Vector3(1, 0, 0);
var AY = new THREE4.Vector3(0, 1, 0);
function lerpPose(a, b, t, out) {
  for (const f of Object.keys(a)) for (let i = 0; i < 5; i++) out[f][i] = a[f][i] + (b[f][i] - a[f][i]) * t;
  return out;
}
function clonePose(p) {
  return {
    thumb: [...p.thumb],
    index: [...p.index],
    middle: [...p.middle],
    ring: [...p.ring],
    pinky: [...p.pinky]
  };
}
var gloveTex = null;
function createGloveMaterial() {
  gloveTex ?? (gloveTex = createGloveTextures());
  gloveTex.normal.repeat.set(3, 3);
  gloveTex.roughness.repeat.set(3, 3);
  const m = new THREE4.MeshPhysicalMaterial({
    color: 1842206,
    roughness: 0.8,
    metalness: 0,
    normalMap: gloveTex.normal,
    normalScale: new THREE4.Vector2(0.4, 0.4),
    roughnessMap: gloveTex.roughness,
    sheen: 0.28,
    sheenRoughness: 0.6,
    sheenColor: new THREE4.Color(2895152)
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <skinning_vertex>", "#include <skinning_vertex>\n transformed += normalize(objectNormal) * 0.0017;");
  };
  return m;
}
var GLOVE_PARS = (
  /* glsl */
  `
varying vec3 vRest;
varying vec3 vRestN;
uniform vec3 uGloveTint;
uniform vec3 uJ[24];
uniform vec3 uFD[5];
uniform vec3 uHandD;
uniform vec3 uWrist;
uniform vec3 uArm;
uniform float uCuffK;
float gHeight = 0.0;
float gRough = 0.8;
float gSmooth = 0.0;

float gSeg(vec3 p, vec3 a, vec3 b, out float t) {
  vec3 ab = b - a;
  t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
  return length(p - (a + ab * t));
}
// Bump mapping of an unparametrised surface (Mikkelsen 2010); h in metres.
vec3 gloveBump(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos);
  vec3 dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n);
  vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`
);
var GLOVE_COLOR = (
  /* glsl */
  `
{
  vec3 p = vRest;
  vec3 nr = normalize(vRestN);
  float best = 1e3; int bf = 0; int bs = 0; float bt = 0.0; float segLen = 0.01;
  for (int s = 0; s < 3; s++) {
    float t; float d = gSeg(p, uJ[s], uJ[s + 1], t);
    if (d < best) { best = d; bf = 0; bs = s == 2 ? 3 : s; bt = t; segLen = length(uJ[s + 1] - uJ[s]); }
  }
  for (int k = 0; k < 4; k++) {
    int b0 = 4 + k * 5;
    for (int s = 0; s < 4; s++) {
      float t; float d = gSeg(p, uJ[b0 + s], uJ[b0 + s + 1], t);
      if (d < best) { best = d; bf = k + 1; bs = s; bt = t; segLen = length(uJ[b0 + s + 1] - uJ[b0 + s]); }
    }
  }
  vec3 D = (bs == 0 && bf != 0) ? uHandD : uFD[bf];
  float nd = dot(nr, D);
  float ndH = dot(nr, uHandD);
  float dors = smoothstep(0.1, 0.5, nd);
  float palm = smoothstep(-0.05, -0.4, nd);
  float sideBand = (bs >= 1) ? 1.0 - smoothstep(0.05, 0.16, abs(nd - 0.02)) : 0.0;

  // Knuckle guard over the MCP joints.
  float band = 1e3;
  for (int k = 0; k < 3; k++) { float t; band = min(band, gSeg(p, uJ[5 + k * 5], uJ[10 + k * 5], t)); }
  float dome = 0.0;
  for (int k = 0; k < 4; k++) dome = max(dome, 1.0 - smoothstep(0.0118, 0.0148, length(p - uJ[5 + k * 5])));
  float guard = max(dome, (1.0 - smoothstep(0.0128, 0.0152, band)) * 0.72) * smoothstep(0.15, 0.5, ndH);
  // Pads on the proximal / middle phalanges.
  float pad = (bf > 0 && (bs == 1 || bs == 2)) ? dors * (1.0 - smoothstep(0.26, 0.4, abs(bt - 0.52))) : 0.0;
  pad *= 1.0 - guard;
  // Side seams with stitches (3.2 mm pitch).
  float along = bt * segLen;
  float stitch = sideBand * step(0.5, fract(along / 0.0032 + float(bf) * 0.37));
  // Reinforced palm heel between thumb and index (the "saddle").
  float saddle = palm * (bf <= 1 ? 1.0 : 0.0) * (bs == 0 ? 1.0 : 0.0);

  gHeight = guard * 0.0017 + pad * 0.0009 - sideBand * 0.00028 + saddle * 0.0005;
  // Coyote shooting glove (Mechanix / PIG style): tan softshell back, darker TPR guards,
  // synthetic-leather palm. A mid-tone keeps finger shading readable; pure black read as a blob.
  vec3 cFabric = vec3(0.150, 0.112, 0.072);
  vec3 cGuard = vec3(0.046, 0.040, 0.032);
  vec3 cPalm = vec3(0.200, 0.158, 0.105);
  vec3 cTip = vec3(0.120, 0.092, 0.062);
  vec3 cStitch = vec3(0.060, 0.048, 0.034);
  vec3 c = mix(cFabric, cPalm, palm);
  c = mix(c, cTip, palm * (bs == 3 ? 1.0 : 0.0));
  c = mix(c, cPalm * 0.8, saddle);
  c = mix(c, cGuard * (0.85 + 0.3 * guard), max(guard, pad));
  c = mix(c, cStitch, stitch * 0.85);
  // v25, third person (uCuffK = 1): dark elastic cuff above the wrist crease with a
  // stitched seam and a TPR closure tab over the back of the wrist; the cuff
  // tucks under the sleeve. First person keeps its own cuff sweep (uCuffK = 0).
  float cuffB = 0.0, cuffTab = 0.0, cuffSeam = 0.0;
  if (uCuffK > 0.0) {
    vec3 wq = p - uWrist;
    float cu = dot(wq, uArm);
    vec3 latV = normalize(cross(uArm, uHandD));
    float lat = dot(wq, latV);
    cuffB = uCuffK * smoothstep(-0.0035, -0.0012, cu);
    cuffSeam = uCuffK * (1.0 - smoothstep(0.0002, 0.0009, abs(cu + 0.0024))) * (1.0 - step(0.5, fract(lat / 0.003 + 0.25)) * 0.6);
    cuffTab = uCuffK * smoothstep(0.2, 0.45, ndH) * (1.0 - smoothstep(0.0105, 0.0135, abs(lat))) * (1.0 - smoothstep(0.009, 0.0115, abs(cu - 0.0045)));
  }
  vec3 cCuff = vec3(0.052, 0.046, 0.039);
  c = mix(c, cCuff, cuffB);
  c = mix(c, cGuard * 1.05, cuffTab);
  c = mix(c, cStitch * 0.8, cuffSeam * 0.9);
  gHeight += cuffTab * 0.0009 - cuffSeam * 0.0002;
  diffuseColor.rgb = c * uGloveTint;
  gRough = mix(0.8, 0.46, max(guard, pad));
  gRough = mix(gRough, 0.93, palm * (1.0 - guard));
  gRough = mix(gRough, 0.86, cuffB);
  gRough = mix(gRough, 0.5, cuffTab);
  gSmooth = max(max(guard, pad), cuffTab);
}
`
);
function createGloveDetailMaterial(base, rest) {
  const m = base.clone();
  m.color.set(16777215);
  m.userData.uCuffK = { value: 0 };
  /* v26: оттенок перчаток из редактора внешнего вида (множитель к базовому цвету) */
  m.userData.uGloveTint = { value: new THREE4.Vector3(1, 1, 1) };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uJ = { value: rest.joints };
    shader.uniforms.uFD = { value: rest.fingerDorsal };
    shader.uniforms.uHandD = { value: rest.handDorsal };
    shader.uniforms.uWrist = { value: rest.wrist || new THREE4.Vector3() };
    shader.uniforms.uArm = { value: rest.arm || new THREE4.Vector3(0, 1, 0) };
    shader.uniforms.uCuffK = m.userData.uCuffK;
    shader.uniforms.uGloveTint = m.userData.uGloveTint;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vRest;\nvarying vec3 vRestN;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = position;\nvRestN = normal;").replace("#include <skinning_vertex>", "#include <skinning_vertex>\n transformed += normalize(objectNormal) * 0.0017;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + GLOVE_PARS).replace("#include <color_fragment>", "#include <color_fragment>\n" + GLOVE_COLOR).replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = gRough * mix(1.0, roughnessFactor / max(roughness, 1e-3), 0.5);").replace(
      "#include <normal_fragment_maps>",
      "#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, gSmooth * 0.85));\nnormal = gloveBump(-vViewPosition, normal, gHeight);"
    );
  };
  m.customProgramCacheKey = () => "glove-detail-v1";
  return m;
}
var GlovedHand = class {
  constructor(gltf, side, baseMaterial) {
    this.side = side;
    __publicField(this, "anchor", new THREE4.Group());
    __publicField(this, "pose");
    __publicField(this, "joints", /* @__PURE__ */ new Map());
    __publicField(this, "wrist");
    /** +1 if the anchor's +X points to the little finger. */
    __publicField(this, "ulnarSign");
    __publicField(this, "material");
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const armature = scene.getObjectByName("Armature") ?? scene;
    this.wrist = armature.getObjectByName("wrist");
    const restWrist = new THREE4.Matrix4().compose(this.wrist.position, this.wrist.quaternion, this.wrist.scale);
    const parentOf = (name) => {
      for (const f of Object.keys(FINGER_JOINTS)) {
        const chain = FINGER_JOINTS[f];
        const i = chain.indexOf(name);
        if (i === 0) return "wrist";
        if (i > 0) return chain[i - 1];
      }
      return "";
    };
    for (const f of Object.keys(FINGER_JOINTS)) {
      for (const name of FINGER_JOINTS[f]) {
        const bone = armature.getObjectByName(name);
        const parent = armature.getObjectByName(parentOf(name));
        const invPQ = parent.quaternion.clone().invert();
        this.joints.set(name, {
          bone,
          localPos: bone.position.clone().sub(parent.position).applyQuaternion(invPQ),
          localQuat: invPQ.multiply(bone.quaternion.clone())
        });
      }
    }
    const holder = new THREE4.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(restWrist).invert();
    holder.add(armature);
    this.anchor.add(holder);
    this.anchor.scale.setScalar(1.05);
    let skinned = null;
    armature.traverse((o) => {
      if (o.isSkinnedMesh) skinned = o;
    });
    const sk = skinned.skeleton;
    const bind = (name) => {
      const i = sk.bones.findIndex((b) => b.name === name);
      return sk.boneInverses[i].clone().invert();
    };
    const order = ["thumb", "index", "middle", "ring", "pinky"];
    const rest = {
      joints: order.flatMap((f) => FINGER_JOINTS[f].map((n) => new THREE4.Vector3().setFromMatrixPosition(bind(n)))),
      fingerDorsal: order.map((f) => new THREE4.Vector3(0, 1, 0).applyQuaternion(new THREE4.Quaternion().setFromRotationMatrix(bind(FINGER_JOINTS[f][1])))),
      handDorsal: new THREE4.Vector3(0, 1, 0).applyQuaternion(new THREE4.Quaternion().setFromRotationMatrix(bind("wrist"))),
      /* v25: сустав запястья и ось к локтю (от основания среднего пальца) — для манжеты */
      wrist: new THREE4.Vector3().setFromMatrixPosition(bind("wrist")),
      arm: new THREE4.Vector3().setFromMatrixPosition(bind("wrist")).sub(new THREE4.Vector3().setFromMatrixPosition(bind("middle-finger-phalanx-proximal"))).normalize()
    };
    this.material = createGloveDetailMaterial(baseMaterial, rest);
    const pinkyLocal = new THREE4.Vector3().setFromMatrixPosition(bind("pinky-finger-metacarpal")).applyMatrix4(new THREE4.Matrix4().copy(restWrist).invert());
    this.ulnarSign = Math.sign(pinkyLocal.x) || 1;
    const material = this.material;
    armature.traverse((o) => {
      const mesh = o;
      if (mesh.isMesh) {
        mesh.material = material;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });
    this.pose = clonePose(OPEN_POSE);
    this.apply();
  }
  /** FK: rebuild every joint from the chain rest pose + flex/spread. */
  apply(pose = this.pose) {
    const wq = this.wrist.quaternion;
    const wp = this.wrist.position;
    for (const f of Object.keys(FINGER_JOINTS)) {
      const chain = FINGER_JOINTS[f];
      const p = pose[f];
      const pq = _q2.copy(wq);
      const pp = _v.copy(wp);
      for (let i = 0; i < chain.length; i++) {
        const j = this.joints.get(chain[i]);
        const pos = j.localPos.clone().applyQuaternion(pq).add(pp);
        const q = pq.clone().multiply(j.localQuat);
        if (f === "thumb") {
          if (i === 0) q.multiply(_q22.setFromAxisAngle(AY, p[4])).multiply(_q22.setFromAxisAngle(AX, -p[0]));
          else if (i === 1) q.multiply(_q22.setFromAxisAngle(AX, -p[1]));
          else if (i === 2) q.multiply(_q22.setFromAxisAngle(AX, -p[2]));
        } else {
          if (i === 0) q.multiply(_q22.setFromAxisAngle(AX, -p[0]));
          else if (i === 1) q.multiply(_q22.setFromAxisAngle(AY, p[4])).multiply(_q22.setFromAxisAngle(AX, -p[1]));
          else if (i === 2) q.multiply(_q22.setFromAxisAngle(AX, -p[2]));
          else if (i === 3) q.multiply(_q22.setFromAxisAngle(AX, -p[3]));
        }
        j.bone.position.copy(pos);
        j.bone.quaternion.copy(q);
        pq.copy(q);
        pp.copy(pos);
      }
    }
  }
  setPose(pose) {
    for (const f of Object.keys(pose)) for (let i = 0; i < 5; i++) this.pose[f][i] = pose[f][i];
    this.apply();
  }
  jointWorld(name, out) {
    const j = this.joints.get(name);
    return j ? j.bone.getWorldPosition(out) : out.set(0, 0, 0);
  }
};
var OPEN_POSE = {
  thumb: [0, 0, 0, 0, 0],
  index: [0, 0, 0, 0, 0],
  middle: [0, 0, 0, 0, 0],
  ring: [0, 0, 0, 0, 0],
  pinky: [0, 0, 0, 0, 0]
};

// weapon/specs.ts

function gripMatrix(pos, distal, dorsal) {
  const z = new THREE5.Vector3(...distal).normalize().negate();
  const y = new THREE5.Vector3(...dorsal);
  y.addScaledVector(z, -y.dot(z)).normalize();
  const x = new THREE5.Vector3().crossVectors(y, z);
  return new THREE5.Matrix4().makeBasis(x, y, z).setPosition(...pos);
}
var P = (t, i, m, r, p) => ({
  thumb: t,
  index: i,
  middle: m,
  ring: r,
  pinky: p
});
var translate = (x, y, z, m) => new THREE5.Matrix4().makeTranslation(x, y, z).multiply(m);
/* Magazine grip fallback: fingers wrap across the magazine, not up into
   the receiver. Per-weapon calibrated contact frames override this in GGuns. */
var magInHand = (height) => gripMatrix(
  [-0.055, -height, 0.069], [0, Math.sin(0.35), -Math.cos(0.35)], [-1, 0, 0]
).invert();
var pouch = (pos, rot) => new THREE5.Matrix4().compose(new THREE5.Vector3(...pos), new THREE5.Quaternion().setFromEuler(new THREE5.Euler(...rot)), new THREE5.Vector3(1, 1, 1));
var LEFT_OPEN = P([0.2, 0.1, 0.1, 0, 0], [0, 0.35, 0.35, 0.15, 0], [0, 0.4, 0.4, 0.15, 0], [0, 0.45, 0.4, 0.15, 0], [0, 0.5, 0.4, 0.15, 0]);
function withFumble(track, delay = 0.22) {
  const pre = track.left.find((k) => k.ins) || track.left.find((k) => k.at === "mag");
  if (!pre?.mag) return track;
  const t0 = pre.t;
  const shift = (k) => k.t > t0 + 1e-3 ? { ...k, t: k.t + delay } : k;
  const [dy, dz, tilt] = pre.mag;
  const bumpT = t0 + delay * 0.45;
  const left = [];
  for (const k of track.left) {
    left.push(shift(k));
    if (k === pre) {
      left.push({ t: bumpT, at: "mag", mag: [dy * 0.55, dz * 0.6 + 8e-3, tilt * 0.55 + 0.1], pose: k.pose });
      left.push({ t: t0 + delay * 0.8, at: "mag", mag: [dy * 0.85, dz * 0.9, tilt * 0.9], pose: k.pose });
    }
  }
  const time = (t) => t > t0 + 1e-3 ? t + delay : t;
  const keys = (ks) => ks.map(([t, v]) => [time(t), v]);
  return {
    ...track,
    duration: track.duration + delay,
    gunPos: keys(track.gunPos),
    gunRot: keys(track.gunRot),
    left,
    events: [...track.events.map(([t, e]) => [time(t), e]), [bumpT, "bump"]].sort((a, b) => a[0] - b[0]),
    magRelease: track.magRelease.map(time),
    // Preserve and retime mechanical tracks too, not only hand/events.
    rack: track.rack ? track.rack.map(time) : track.rack,
    pump: track.pump ? track.pump.map(time) : track.pump,
    hk: track.hk ? { ...track.hk, back: track.hk.back.map(time), lock: track.hk.lock.map(time), slap: time(track.hk.slap) } : track.hk
  };
}

// weapon/Timeline.ts
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sampleScalar(keys, time) {
  if (time <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (time >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && time > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(n - 1, i + 2)];
  const t = (time - k1[0]) / (k2[0] - k1[0]);
  return catmull(k0[1], k1[1], k2[1], k3[1], t);
}
function sampleVec(keys, time, out) {
  for (let c = 0; c < 3; c++) out[c] = sampleScalar(keys.map(([t, v]) => [t, v[c]]), time);
  return out;
}
function crossed(t0, t1, at) {
  return t0 < at && t1 >= at;
}

// weapon/WeaponRig.ts
var ONE = new THREE6.Vector3(1, 1, 1);
var _m = new THREE6.Matrix4();
var _m2 = new THREE6.Matrix4();
var _v2 = new THREE6.Vector3();
var _s = new THREE6.Vector3();
function springPeak(f, z) {
  const w = 2 * Math.PI * f;
  const zz = Math.min(z, 0.95);
  const wd = w * Math.sqrt(1 - zz * zz);
  const t = Math.atan2(wd, zz * w) / wd;
  return Math.exp(-zz * w * t) * Math.sin(wd * t) / wd;
}
function poseVec(p, out, rot) {
  out.fromArray(p.pos);
  rot.set(p.rot[0] * DEG, p.rot[1] * DEG, p.rot[2] * DEG);
}
var WeaponRig = class {
  constructor(assets, specs) {
    this.specs = specs;
    __publicField(this, "root", new THREE6.Group());
    __publicField(this, "right");
    __publicField(this, "left");
    __publicField(this, "armR");
    __publicField(this, "armL");
    __publicField(this, "flashlight");
    __publicField(this, "events", {});
    __publicField(this, "index", 0);
    __publicField(this, "reloading", false);
    __publicField(this, "lightOn", false);
    __publicField(this, "fireMode", "auto");
    __publicField(this, "stress", 0);
    /** 0..1 tuck against walls. */
    __publicField(this, "tuck", 0);
    __publicField(this, "states");
    __publicField(this, "basePos", new SecondOrderVec3(3.4, 0.78, 0));
    __publicField(this, "baseRot", new SecondOrderVec3(3.4, 0.78, 0));
    __publicField(this, "aimYaw", new SecondOrder(3.4, 0.55, 0.15));
    __publicField(this, "aimPitch", new SecondOrder(3.4, 0.55, 0.15));
    __publicField(this, "lagRoll", 0);
    __publicField(this, "rBack", new ImpulseSpring(1, 1));
    __publicField(this, "rUp", new ImpulseSpring(1, 1));
    __publicField(this, "rPitch", new ImpulseSpring(1, 1));
    __publicField(this, "rYaw", new ImpulseSpring(1, 1));
    __publicField(this, "rRoll", new ImpulseSpring(1, 1));
    __publicField(this, "landY", new ImpulseSpring(160, 13));
    /** Aim climb the shooter still has to pull back down (rad). */
    __publicField(this, "climbDebt", new THREE6.Vector2());
    __publicField(this, "player", null);
    __publicField(this, "slideTimer", 1);
    __publicField(this, "triggerT", 0);
    __publicField(this, "triggerFinger", 0);
    /** Grip squeeze (0..1): hands clamp down as the gun recoils, then relax. */
    __publicField(this, "squeeze", 0);
    __publicField(this, "supportPose");
    __publicField(this, "cooldown", 0);
    /** A press that arrived while the action was still cycling fires as soon as it can. */
    __publicField(this, "queuedPress", 0);
    __publicField(this, "sinceShot", 10);
    __publicField(this, "shellPending", -1);
    __publicField(this, "reloadT", 0);
    __publicField(this, "reloadSpeed", 1);
    __publicField(this, "track");
    __publicField(this, "fumbled", false);
    __publicField(this, "sleeveMaterial", createJacketMaterial());
    /** Reload offsets run through springs: follow-through and settle instead of robotic keys. */
    __publicField(this, "relPosF", new SecondOrderVec3(4.2, 0.55, 0.15));
    __publicField(this, "relRotF", new SecondOrderVec3(3.6, 0.5, 0.1));
    __publicField(this, "magState", "gun");
    __publicField(this, "switchPhase", "none");
    __publicField(this, "switchT", 0);
    __publicField(this, "pending", 0);
    __publicField(this, "lowerW", 0);
    __publicField(this, "adsAmount", 0);
    __publicField(this, "time", 0);
    __publicField(this, "gunMatrix", new THREE6.Matrix4());
    /* v7: «баллистическая тень» — матрица оружия по старым пружинам отдачи
       (по ней летит пуля), и внешний источник видимой отдачи (GRecoil) */
    __publicField(this, "gunMatrixBal", new THREE6.Matrix4());
    __publicField(this, "ext", null);
    __publicField(this, "extGain", { back: 1.2, up: 0.9, pitch: 1.4, yaw: 1.1, roll: 0.8 });
    __publicField(this, "prevMuzzle", new THREE6.Vector3());
    __publicField(this, "muzzleVelocity", new THREE6.Vector3());
    __publicField(this, "rightPose");
    __publicField(this, "leftPose");
    const glove = createGloveMaterial();
    this.right = new GlovedHand(assets.right, "right", glove);
    this.left = new GlovedHand(assets.left, "left", glove);
    const B = CONFIG.body;
    const look = { sleeve: this.sleeveMaterial, gloveCuff: createGloveCuffMaterial(), glove };
    this.armR = new Arm("right", look, B.upperArm, B.forearm);
    this.armL = new Arm("left", look, B.upperArm, B.forearm);
    this.rightPose = clonePose(specs[0].hands.indexed);
    this.leftPose = clonePose(specs[0].hands.support);
    this.states = specs.map((s) => ({ mag: s.tuning.magSize, chambered: true, locked: false }));
    for (const s of specs) {
      s.model.root.matrixAutoUpdate = false;
      s.model.root.visible = false;
      this.root.add(s.model.root);
    }
    this.root.add(this.right.anchor, this.left.anchor, this.armR.group, this.armL.group);
    setLayerRecursive(this.root, LAYER_VIEW);
    this.flashlight = new THREE6.SpotLight(16774373, 0, 34, 0.42, 0.55, 1.4);
    this.flashlight.castShadow = CONFIG.quality.shadows;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -3e-4;
    this.flashlight.shadow.normalBias = 0.02;
    this.flashlight.shadow.camera.near = 0.1;
    this.flashlight.shadow.camera.layers.enableAll();
    this.flashlight.layers.enableAll();
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, -0.02, -6);
    this.activate(0);
  }
  get spec() {
    return this.specs[this.index];
  }
  get gun() {
    return this.spec.model;
  }
  get ammo() {
    return this.states[this.index].mag;
  }
  get chambered() {
    return this.states[this.index].chambered;
  }
  get slideLocked() {
    return this.states[this.index].locked;
  }
  get switching() {
    return this.switchPhase !== "none";
  }
  activate(i) {
    this.specs.forEach((s, k) => s.model.root.visible = k === i);
    this.index = i;
    this.gun.lightMount.add(this.flashlight, this.flashlight.target);
    this.gun.setSelector?.(this.fireMode);
  }
  /** Instant selection (no holster animation). */
  select(i) {
    if (i < 0 || i >= this.specs.length || this.reloading) return;
    this.activate(i);
    this.switchPhase = "none";
    this.lowerW = 0;
  }
  switchTo(i) {
    if (i < 0 || i >= this.specs.length || this.reloading) return;
    if (this.switchPhase === "none" && i === this.index) return;
    this.pending = i;
    if (this.switchPhase === "none") {
      this.switchPhase = "lower";
      this.switchT = 0;
      this.events.sound?.("switch", this.spec.id);
    }
  }
  cycle(dir) {
    const n = this.specs.length;
    this.switchTo((((this.switchPhase === "none" ? this.index : this.pending) + dir) % n + n) % n);
  }
  toggleFireMode() {
    if (!this.spec.tuning.auto) return;
    this.fireMode = this.fireMode === "auto" ? "semi" : "auto";
    this.gun.setSelector?.(this.fireMode);
    this.events.sound?.("selector", this.spec.id);
  }
  toggleLight() {
    this.lightOn = !this.lightOn;
    this.events.sound?.("light", this.spec.id);
  }
  land(impact) {
    this.landY.kick(-clamp(impact / 5, 0.1, 1.2) * 0.9);
  }
  /** Called every frame while the trigger is held; `pressed` on the first frame. */
  pullTrigger(pressed = true) {
    if (this.reloading || this.switchPhase !== "none") return false;
    const st = this.states[this.index];
    const T = this.spec.tuning;
    if (!st.chambered || st.locked) {
      if (pressed && this.cooldown <= 0) {
        this.events.sound?.("dryFire", this.spec.id);
        this.cooldown = 0.25;
        this.triggerT = 1;
      }
      return false;
    }
    if (this.cooldown > 0) {
      if (pressed) this.queuedPress = 0.12;
      return false;
    }
    if (!pressed && !(T.auto && this.fireMode === "auto")) return false;
    this.queuedPress = 0;
    this.cooldown = T.fireInterval;
    this.sinceShotPrev = this.sinceShot;
    this.sinceShot = 0;
    this.triggerT = 1;
    this.triggerFinger = 1;
    this.squeeze = 1;
    if (st.mag > 0) st.mag--;
    else {
      st.chambered = false;
      st.locked = true;
    }
    this.slideTimer = 0;
    this.shellPending = 0.012;
    const R = T.recoil;
    /* серия: каждый следующий выстрел очереди бьёт чуть сильнее (у каждого образца по-своему) */
    this.burstN = this.sinceShotPrev < T.fireInterval * 2.2 ? Math.min(8, (this.burstN || 0) + 1) : 0;
    const grow = 1 + (R.burstGrow || 0) * (this.burstN / 8);
    const k = lerp(1, R.adsScale, this.adsAmount) * (1 + this.stress * 0.25) * grow * (this.recoilMul || 1);
    this.configureRecoil();
    const pb = springPeak(R.fBack, R.zBack);
    const pr = springPeak(R.f, R.z);
    const yb = R.yawBias || 0, cb = R.climbYawBias || 0;
    /* Рисунок отдачи детерминирован: номер выстрела в очереди -> одна и та же
       последовательность толчков (как фиксированный паттерн в CS/Tarkov).
       Раньше каждый толчок по курсу и крену был случайным (rand(-1, 1)),
       и в очереди прицел «ходил ходуном», а точка коллиматора жила своей
       жизнью. В прицеле (щека на прикладе, приклад в плече) боковой увод и
       завал гасятся сильнее подброса: оружие и голова — одно целое. */
    const n = this.burstN, sd = this.patSeed ?? (this.patSeed = [...String(this.spec.id || "")].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7) * 0.013);
    const pat = (o) => Math.sin(n * 0.62 + sd + o) * 0.75 + Math.sin(n * 1.37 + sd * 2.3 + o) * 0.25;
    const sideK = lerp(1, 0.38, this.adsAmount), rollK = lerp(1, 0.32, this.adsAmount);
    this.rBack.kick(R.kickBack * k / pb * (1 + 0.04 * pat(0.3)));
    this.rUp.kick(R.kickUp * k / pb * (1 + 0.08 * pat(1.1)));
    this.rPitch.kick(R.pitchDeg * DEG * k / pr * (1 + 0.06 * pat(2.1)) * lerp(1, 0.7, this.adsAmount));
    this.rYaw.kick(R.yawDeg * DEG * k / pr * clamp(yb * 0.6 + pat(0) * 0.55 * clamp((n - 1) / 3, 0.25, 1) * (1 - Math.abs(yb) * 0.5), -1.4, 1.4) * sideK);
    this.rRoll.kick(R.rollDeg * DEG * k / pr * lerp(R.rollMin ?? -0.4, R.rollMax ?? 1, 0.5 + 0.5 * pat(4.0)) * rollK);
    /* запоздалый «клевок»: тяжёлое оружие после вскида оседает ниже точки */
    if (R.settleDeg) this.settleKick = R.settleDeg * DEG * k;
    if (this.player) {
      const cp = R.climbDeg * DEG * k;
      const cy = R.climbYawDeg * DEG * k * clamp(cb + pat(0) * (1 - Math.abs(cb) * 0.5), -1.4, 1.4);
      this.player.aimPitch += cp;
      this.player.aimYaw += cy;
      this.climbDebt.x += cp * R.recoverFraction;
      this.climbDebt.y += cy * R.recoverFraction;
    }
    this.stress = clamp(this.stress + (T.auto ? 0.1 : 0.22), 0, 1);
    this.root.updateMatrixWorld(true);
    const muzzle = this.gun.muzzle.getWorldPosition(new THREE6.Vector3());
    const dir = new THREE6.Vector3(0, 0, -1).transformDirection(this.gun.root.matrixWorld);
    this.events.fire?.(muzzle, dir, this.spec);
    return true;
  }
  startReload() {
    if (this.reloading || this.switchPhase !== "none") return;
    const st = this.states[this.index];
    if (st.mag >= this.spec.tuning.magSize && !st.locked) return;
    this.reloading = true;
    this.reloadT = 0;
    this.track = st.locked ? this.spec.empty : this.spec.tactical;
    if (Math.random() < 0.12 + this.stress * 0.35) this.track = withFumble(this.track);
    this.fumbled = this.track.events.some(([, e]) => e === "bump");
    this.reloadSpeed = rand(0.93, 1.07) * (1 + this.stress * 0.12);
  }
  configureRecoil() {
    const R = this.spec.tuning.recoil;
    const set = (s, f, z) => {
      const w = 2 * Math.PI * f;
      s.stiffness = w * w;
      s.damping = 2 * z * w;
    };
    set(this.rBack, R.fBack, R.zBack);
    set(this.rUp, R.fBack * 0.8, R.zBack);
    set(this.rPitch, R.f, R.z);
    set(this.rYaw, R.f * 0.9, R.z);
    set(this.rRoll, R.f * 0.8, R.z * 0.9);
  }
  update(dt, player, rig, level, input) {
    const spec = this.spec;
    const T = spec.tuning;
    this.player = player;
    this.time += dt;
    this.cooldown -= dt;
    this.sinceShot += dt;
    if (this.queuedPress > 0) {
      this.queuedPress -= dt;
      if (this.cooldown <= 0) this.pullTrigger(true);
    }
    this.stress = Math.max(0, this.stress - dt * 0.12);
    this.updateSwitch(dt);
    this.adsAmount = this.reloading || this.switchPhase !== "none" ? damp(this.adsAmount, 0, 8, dt) : player.ads;
    const ads = this.adsAmount;
    const pos = new THREE6.Vector3();
    const rot = new THREE6.Vector3();
    const p2 = new THREE6.Vector3();
    const r2 = new THREE6.Vector3();
    poseVec(T.poses.hip, pos, rot);
    poseVec(T.poses.ads, p2, r2);
    const adsE = easeInOut(ads);
    pos.lerp(p2, adsE);
    rot.lerp(r2, adsE);
    const sprintW = player.sprint * (this.reloading ? 0.3 : 1);
    poseVec(T.poses.sprint, p2, r2);
    pos.lerp(p2, sprintW);
    rot.lerp(r2, sprintW);
    /* v16: оружие не проходит сквозь стены, предметы и людей (скрин 6).
       Как в Insurgency / Tarkov / Arma («weapon obstruction»): лучи от глаз
       и по линии ствола; чем ближе препятствие, тем сильнее оружие сначала
       подтягивается к себе (до 13 см), затем уводится стволом вниз («low
       ready») — или вверх («high port»), если внизу теснее (низкая стенка,
       ящик, грунт, присевший товарищ), и в сторону, где свободнее. Пока
       ствол уведён больше чем наполовину — огонь не открывается
       (wantTrigger). Боковые лучи пускаются, только когда что-то рядом. */
    const camPos = rig.camera.getWorldPosition(new THREE6.Vector3());
    const aimDir = new THREE6.Vector3(0, 0, -1).applyEuler(new THREE6.Euler(player.aimPitch, player.aimYaw, 0, "YXZ"));
    const TD = T.tuckDistance, LEN = TD + 0.4;
    const camQ = rig.camera.getWorldQuaternion(new THREE6.Quaternion());
    const upV = new THREE6.Vector3(0, 1, 0).applyQuaternion(camQ), rtV = new THREE6.Vector3(1, 0, 0).applyQuaternion(camQ);
    const gunO = camPos.clone().addScaledVector(upV, -0.09).addScaledVector(rtV, 0.05);
    const probe = (o, d) => { const h = level.raycast(o, d, LEN); return h ? h.distance : LEN; };
    const dC = Math.min(probe(camPos, aimDir), probe(gunO, aimDir));
    const tuckTarget = smoothstep(TD, TD * 0.45, dC);
    if (tuckTarget > 1e-3 || this.tuck > 0.01) {
      const pd = (a, b, k) => probe(gunO, aimDir.clone().addScaledVector(a, k * b).normalize());
      const dU = pd(upV, 1, 0.5), dD = pd(upV, -1, 0.5), dL = pd(rtV, -1, 0.5), dR = pd(rtV, 1, 0.5);
      this.tuckUp = damp(this.tuckUp || 0, dD < dU - 0.15 ? 1 : 0, 5, dt);
      this.tuckSide = damp(this.tuckSide || 0, clamp((dR - dL) / 0.6, -1, 1), 5, dt);
    } else { this.tuckUp = damp(this.tuckUp || 0, 0, 3, dt); this.tuckSide = damp(this.tuckSide || 0, 0, 3, dt); }
    this.tuck = damp(this.tuck, tuckTarget, tuckTarget > this.tuck ? 14 : 6, dt);
    const kBack = smoothstep(0, 0.45, this.tuck), kRot = smoothstep(0.2, 1, this.tuck);
    pos.z += 0.13 * kBack;
    poseVec(T.poses.wallTuck, p2, r2);
    const hp = T.poses.wallHigh || { pos: [0.04, 0.0, 0.02], rot: [34, -4, 8] };
    const p3 = new THREE6.Vector3(), r3 = new THREE6.Vector3();
    poseVec(hp, p3, r3);
    p2.lerp(p3, this.tuckUp); r2.lerp(r3, this.tuckUp);
    r2.y -= this.tuckSide * 14 * DEG;
    pos.lerp(p2, kRot);
    rot.lerp(r2, kRot);
    pos.add(new THREE6.Vector3(0.03, -0.3, 0.1).multiplyScalar(this.lowerW));
    rot.add(new THREE6.Vector3(-60 * DEG, 15 * DEG, 20 * DEG).multiplyScalar(this.lowerW));
    const bp = this.basePos.update(dt, pos);
    const br = this.baseRot.update(dt, rot);
    const S = T.sway;
    this.aimYaw.set(S.f, S.z, 0.15);
    this.aimPitch.set(S.f, S.z, 0.15);
    const lagYaw = clamp(-rig.yawRate * S.yawGain, -S.maxYawDeg * DEG, S.maxYawDeg * DEG) * (1 - ads * 0.6);
    const lagPitch = clamp(-rig.pitchRate * S.pitchGain, -S.maxPitchDeg * DEG, S.maxPitchDeg * DEG) * (1 - ads * 0.6);
    const offYaw = this.aimYaw.update(dt, player.offsetYaw + lagYaw);
    const offPitch = this.aimPitch.update(dt, player.offsetPitch + lagPitch);
    this.lagRoll = damp(this.lagRoll, clamp(this.aimYaw.yd * S.tiltGain * 0.1, -S.tiltMaxDeg * DEG, S.tiltMaxDeg * DEG), 10, dt);
    const B = T.bob;
    const runW = clamp(player.moveBlend - 1, 0, 1);
    const moveW = player.grounded ? clamp(player.speed / 0.6, 0, 1) : 0;
    const bobScale = moveW * lerp(1, B.adsScale, ads);
    const bx = lerp(B.walk.x, B.run.x, runW) * bobScale;
    const by = lerp(B.walk.y, B.run.y, runW) * bobScale;
    const broll = lerp(B.walk.roll, B.run.roll, runW) * DEG * bobScale;
    const bpitch = lerp(B.walk.pitch, B.run.pitch, runW) * DEG * bobScale;
    const ph = player.stepPhase;
    const stab = lerp(0.35, 0.72, ads);
    const breath = rig.breath;
    const tremorAmp = (0.12 + this.stress * 0.35 + player.fatigue * 0.3) * DEG * (this.swayMul || 1);
    const tr = this.time * 1.7;
    const bobPos = new THREE6.Vector3(Math.sin(ph) * bx, -Math.cos(2 * ph) * by + breath * 12e-4 + this.landY.update(dt) * 0.03, 0);
    bobPos.addScaledVector(rig.bobPos, -stab);
    const bobRot = new THREE6.Vector3(
      Math.cos(2 * ph) * bpitch + fbm1(tr + 3.3) * tremorAmp - rig.bobRot.x * stab * 0.8,
      fbm1(tr + 9.1) * tremorAmp - rig.bobRot.y * stab * 0.8,
      Math.sin(ph) * broll + fbm1(tr + 17.7) * tremorAmp * 0.6 - rig.bobRot.z * stab * 0.6
    );
    const R = T.recoil;
    this.configureRecoil();
    if (this.settleKick && this.sinceShot > 1 / Math.max(1, R.f) * 0.55) {
      this.rPitch.kick(-this.settleKick / springPeak(R.f, R.z) * 0.6);
      this.settleKick = 0;
    }
    const rb = this.rBack.update(dt);
    const ru = this.rUp.update(dt);
    const rp = this.rPitch.update(dt);
    const ry = this.rYaw.update(dt);
    const rr = this.rRoll.update(dt);
    if (this.sinceShot > R.recoverDelay && this.climbDebt.lengthSq() > 1e-10) {
      const r = 1 - Math.exp(-R.recoverRate * dt);
      player.aimPitch -= this.climbDebt.x * r;
      player.aimYaw -= this.climbDebt.y * r;
      this.climbDebt.multiplyScalar(1 - r);
    }
    const relPos = [0, 0, 0];
    const relRot = [0, 0, 0];
    const prevT = this.reloadT;
    if (this.reloading) {
      this.reloadT += dt * this.reloadSpeed;
      sampleVec(this.track.gunPos, this.reloadT, relPos);
      sampleVec(this.track.gunRot, this.reloadT, relRot);
      this.reloadEvents(prevT, this.reloadT);
      /* v12: вес оружия. Пока левая кисть у подсумка или несёт магазин,
         автомат (3,3–3,6 кг) держат только правая кисть и плечо: ствол
         проседает на 3–4° и слегка «гуляет» (тремор удержания одной рукой);
         когда кисть снова на цевье/магазине — опора возвращается. */
      const sup = this.leftSupport(this.reloadT);
      this.supK = damp(this.supK === undefined ? 1 : this.supK, sup, sup > (this.supK || 0) ? 9 : 5, dt);
      const fr = 1 - this.supK, tm = this.time;
      relRot[0] += -3.6 * fr + Math.sin(tm * 1.7 + 0.6) * 0.45 * fr;
      relRot[2] += Math.sin(tm * 2.3) * 0.6 * fr;
      relPos[1] += -0.014 * fr;
      if (this.reloadT >= this.track.duration) this.reloading = false;
    }
    /* v12: толчки от рук — рывок магазина, «накат» нового, досыл затвора:
       затухающая пружина поверх дорожки (как additive-слой импульсов в
       анимациях перезарядки), а не жёстко записанные ключи */
    {
      const J = this.rlJ || (this.rlJ = { r: [0, 0, 0], vr: [0, 0, 0], p: [0, 0, 0], vp: [0, 0, 0] });
      const w = 2 * Math.PI * 5.5, z = 0.42, h = Math.min(dt, 0.05);
      for (let i = 0; i < 3; i++) {
        J.vr[i] += (-w * w * J.r[i] - 2 * z * w * J.vr[i]) * h; J.r[i] += J.vr[i] * h;
        J.vp[i] += (-w * w * J.p[i] - 2 * z * w * J.vp[i]) * h; J.p[i] += J.vp[i] * h;
        relRot[i] += J.r[i]; relPos[i] += J.p[i];
      }
    }
    const pivot = _v2.fromArray(T.aimPivot);
    const qAim = new THREE6.Quaternion().setFromEuler(new THREE6.Euler(offPitch, offYaw, this.lagRoll * (1 - ads), "YXZ"));
    const gp = bp.clone().sub(pivot).applyQuaternion(qAim).add(pivot);
    const relP = this.relPosF.update(dt, new THREE6.Vector3().fromArray(relPos));
    gp.add(bobPos).add(relP);
    const relR = this.relRotF.update(dt, new THREE6.Vector3().fromArray(relRot));
    const qBase = new THREE6.Quaternion().setFromEuler(new THREE6.Euler(br.x + bobRot.x + relR.x * DEG, br.y + bobRot.y + relR.y * DEG, br.z + bobRot.z + relR.z * DEG, "YXZ"));
    const qGun = qAim.clone().multiply(qBase);
    const wristPivot = new THREE6.Vector3().fromArray(T.wristPivot);
    const qRec = new THREE6.Quaternion().setFromEuler(new THREE6.Euler(rp, ry, rr, "YXZ"));
    const recOffset = wristPivot.clone().sub(wristPivot.clone().applyQuaternion(qRec)).add(new THREE6.Vector3(0, ru, rb));
    this.gunMatrixBal.compose(gp, qGun, ONE).multiply(_m.compose(recOffset, qRec, ONE));
    const X = this.ext && this.ext.out;
    if (X) {
      /* видимая отдача — фазы GRecoil (толчок → пик → возврат с перелётом);
         удары затворной рамы в крайних точках — мелкая дрожь */
      const F = this.extGain, cs = (this.ext.mech && this.ext.mech.carrierShake) || 0;
      /* v9: в прицеле щека прижата к прикладу — оружие и голова двигаются
         одним блоком (cheek weld). Поворот ствола относительно глаза — главный
         источник «прыжков» марки — гасим до 35–45 %, мелкую дрожь рамы до
         25 %; ход назад (в плечо) оставляем: он двигает корпус прицела вокруг
         марки, а марка (коллиматор без параллакса) остаётся на цели. */
      /* v10: 0,42/0,35 → 0,58/0,52 — марка заметно «прыгает» на выстреле (Squad: recoil misalignment) */
      /* v11: стрельба «с рук» (без прицела). Приклад не прижат щекой, опорная
         рука держит цевьё слабее: оружие ходит в руках заметно сильнее —
         подброс ×1,3, ход назад ×1,25, рыскание ×1,6, крен ×1,5 (как в
         Insurgency/Squad: от бедра ствол «гуляет», в прицеле — собран). */
      const hk = 1 - ads;
      const aR = lerp(1, 0.58, ads) * (1 + 0.30 * hk), aY = lerp(1, 0.52, ads) * (1 + 0.6 * hk), aRo = lerp(1, 0.4, ads) * (1 + 0.5 * hk), aC = lerp(1, 0.25, ads);
      const vp = (X.pitch * F.pitch) * aR + cs * 0.002 * aC, vy = X.yaw * F.yaw * aY, vr = (X.roll * F.roll + X.yaw * 0.3) * aRo;
      const qV = new THREE6.Quaternion().setFromEuler(new THREE6.Euler(vp, vy, vr, "YXZ"));
      const offV = wristPivot.clone().sub(wristPivot.clone().applyQuaternion(qV)).add(new THREE6.Vector3(0, (X.up + X.hop) * F.up * lerp(1, 0.6, ads) * (1 + 0.3 * hk), X.back * F.back * (1 + 0.25 * hk) + cs * 0.001 * aC));
      this.gunMatrix.compose(gp, qGun, ONE).multiply(_m.compose(offV, qV, ONE));
    } else this.gunMatrix.copy(this.gunMatrixBal);
    this.gun.root.matrix.copy(this.gunMatrix);
    this.gun.root.matrixWorldNeedsUpdate = true;
    this.updateMechanics(dt);
    _m.multiplyMatrices(this.gunMatrix, spec.rightGrip);
    _m.decompose(this.right.anchor.position, this.right.anchor.quaternion, _s);
    const busy = this.reloading || this.switchPhase !== "none";
    const wantTrigger = !busy && (input.lmb || this.sinceShot < 1.4 || ads > 0.6) && player.sprint < 0.4 && this.tuck < 0.5;
    this.triggerFinger = damp(this.triggerFinger, wantTrigger ? 1 : 0, wantTrigger ? 18 : 5, dt);
    lerpPose(spec.hands.indexed, spec.hands.trigger, this.triggerFinger, this.rightPose);
    if (this.reloading) {
      const [r0, r1] = this.track.magRelease;
      const magRel = smoothstep(r0, r0 + 0.07, this.reloadT) * (1 - smoothstep(r1 - 0.1, r1, this.reloadT));
      if (magRel > 0) lerpPose(this.rightPose, spec.hands.magRelease, magRel, this.rightPose);
    }
    this.squeeze = Math.max(0, this.squeeze - dt * 7);
    const sq = this.squeeze * this.squeeze * (busy ? 0 : 1);
    const clamp4 = (p, k, skipIndex) => {
      for (const f of ["index", "middle", "ring", "pinky"]) {
        if (skipIndex && f === "index") continue;
        p[f][1] += 0.07 * k;
        p[f][2] += 0.05 * k;
      }
      p.thumb[1] += 0.05 * k;
    };
    if (sq > 0) clamp4(this.rightPose, sq, true);
    this.right.setPose(this.rightPose);
    if (this.reloading) {
      this.leftAt(this.reloadT, _m2);
      _m2.decompose(this.left.anchor.position, this.left.anchor.quaternion, _s);
      this.left.setPose(this.leftPose);
    } else {
      _m2.multiplyMatrices(this.gunMatrix, spec.leftGrip).decompose(this.left.anchor.position, this.left.anchor.quaternion, _s);
      this.supportPose ?? (this.supportPose = clonePose(spec.hands.support));
      lerpPose(spec.hands.support, spec.hands.support, 0, this.supportPose);
      if (sq > 0) clamp4(this.supportPose, sq * 1.2, false);
      this.left.setPose(this.supportPose);
    }
    this.updateMagazine();
    const shR = new THREE6.Vector3().fromArray(CONFIG.body.shoulderR).addScaledVector(rig.bobPos, -0.3);
    const shL = new THREE6.Vector3().fromArray(CONFIG.body.shoulderL).addScaledVector(rig.bobPos, -0.3);
    /* v11: плечи принимают отдачу — уходят назад вместе с оружием (правое —
       больше: приклад/хват), иначе весь ход оружия «съедали» локти */
    if (X) { const shk = (X.sh || 0) * (spec.fam === "pistol" ? 0.6 : 1); shR.z += shk * 1.0; shL.z += shk * 0.55; shR.y += shk * 0.15; }
    /* пистолет в прицеле: голова чуть опущена к рукам, плечи ниже линии глаз и сведены,
       руки почти прямые снизу; без этого предплечья перекрывают кисти */
    const pistA = spec.fam === "pistol" ? adsE : 0;
    /* равнобедренная стойка: плечи шире кистей, руки сходятся к пистолету буквой V */
    if (pistA > 0) { shR.y -= 0.26 * pistA; shL.y -= 0.26 * pistA; shR.x += 0.02 * pistA; shL.x -= 0.02 * pistA; shR.z -= 0.04 * pistA; shL.z -= 0.04 * pistA; }
    const E = T.elbowPole;
    const down = new THREE6.Vector3(0, -1, 0).applyQuaternion(rig.camera.getWorldQuaternion(new THREE6.Quaternion()).invert());
    this.armR.update(shR, this.right.anchor.position, new THREE6.Vector3().fromArray(E.hipR).lerp(new THREE6.Vector3().fromArray(E.adsR), adsE), this.right.anchor, down, this.right.ulnarSign);
    this.armL.update(shL, this.left.anchor.position, new THREE6.Vector3().fromArray(E.hipL).lerp(new THREE6.Vector3().fromArray(E.adsL), adsE), this.left.anchor, down, this.left.ulnarSign);
    this.flashlight.intensity = this.lightOn ? 70 : 0;
    for (const s of this.specs) s.model.setLight(this.lightOn && s === spec);
    this.root.updateMatrixWorld(true);
    this.flashlight.position.set(0, 0, 0);
    if (this.lightOn) {
      const lw = this.gun.lightMount.getWorldPosition(new THREE6.Vector3());
      const safe = this.safePoint(level, camPos, lw);
      if (safe !== lw) {
        this.flashlight.position.copy(this.gun.lightMount.worldToLocal(safe));
        this.flashlight.updateMatrixWorld(true);
      }
    }
    const mw = this.gun.muzzle.getWorldPosition(new THREE6.Vector3());
    if (dt > 0) this.muzzleVelocity.subVectors(mw, this.prevMuzzle).divideScalar(dt);
    this.prevMuzzle.copy(mw);
  }
  /**
   * The view model is drawn over the world, so the gun can visually poke through walls.
   * Anything emitted from it (light, flash, bullets) starts on the camera's side of the surface.
   */
  safePoint(level, from, p, margin = 0.04) {
    const d = new THREE6.Vector3().subVectors(p, from);
    const len = d.length();
    if (len < 1e-4) return p;
    d.divideScalar(len);
    const hit = level.raycast(from, d, len + margin);
    if (!hit) return p;
    return from.clone().addScaledVector(d, Math.max(0, hit.distance - margin));
  }
  updateSwitch(dt) {
    if (this.switchPhase === "lower") {
      this.switchT += dt / 0.3;
      this.lowerW = easeIn(Math.min(1, this.switchT));
      if (this.switchT >= 1) {
        this.activate(this.pending);
        this.switchPhase = "raise";
        this.switchT = 0;
        this.slideTimer = 10;
        this.magState = "gun";
      }
    } else if (this.switchPhase === "raise") {
      this.switchT += dt / 0.45;
      this.lowerW = 1 - easeOut(Math.min(1, this.switchT));
      if (this.switchT >= 1) {
        this.switchPhase = "none";
        this.lowerW = 0;
      }
    }
  }
  updateMechanics(dt) {
    const st = this.states[this.index];
    const cycle = this.spec.tuning.slideCycleTime;
    const back = cycle * 0.38;
    this.slideTimer += dt;
    let slide;
    if (this.slideTimer < back) slide = this.slideTimer / back;
    else if (st.locked) slide = 1;
    else slide = Math.max(0, 1 - (this.slideTimer - back) / (cycle - back));
    /* v11: ход затвора/кожуха — из GRecoil (тот же цикл, что у выброса гильзы
       и ударов рамы; в одиночном огне кожух пистолета виден 2–3 кадра) */
    const XM = this.ext && this.ext.mech;
    if (XM && this.ext.mechT0 !== undefined) slide = st.locked ? 1 : XM.slide;
    this.gun.setSlide(slide);
    this.gun.setSlideStop(st.locked);
    this.triggerT = Math.max(0, this.triggerT - dt / 0.09);
    this.gun.setTrigger(Math.min(1, this.triggerT * 1.4));
    if (this.shellPending >= 0) {
      this.shellPending -= dt;
      if (this.shellPending < 0) this.ejectShell();
    }
  }
  ejectShell() {
    this.root.updateMatrixWorld(true);
    const port = this.gun.ejectionPort.getWorldPosition(new THREE6.Vector3());
    const q = this.gun.root.getWorldQuaternion(new THREE6.Quaternion());
    const [a, b] = this.spec.shellVel;
    const vel = new THREE6.Vector3(rand(a[0], b[0]), rand(a[1], b[1]), rand(a[2], b[2])).applyQuaternion(q).add(this.muzzleVelocity.clone().multiplyScalar(0.5));
    this.events.shell?.(port, vel, q, this.spec.id);
  }
  /* опирается ли левая кисть на оружие в момент t дорожки */
  leftSupport(t) {
    const keys = this.track && this.track.left;
    if (!keys || !keys.length) return 1;
    const on = (k) => k.at === "grip" || k.at === "gun" || (k.at === "mag" && Math.abs(k.mag[0]) < 0.05 && !k.ins);
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    return on(keys[i]) && on(keys[Math.min(keys.length - 1, i + 1)]) ? 1 : 0;
  }
  /* толчок: dr — градусы/с (тангаж, рыскание, крен), dp — м/с */
  jolt(dr, dp) {
    const J = this.rlJ || (this.rlJ = { r: [0, 0, 0], vr: [0, 0, 0], p: [0, 0, 0], vp: [0, 0, 0] });
    for (let i = 0; i < 3; i++) { J.vr[i] += dr[i] || 0; J.vp[i] += dp ? dp[i] || 0 : 0; }
  }
  reloadEvents(t0, t1) {
    const ev = this.events;
    const id = this.spec.id;
    const st = this.states[this.index];
    for (const [t, e] of this.track.events) {
      if (!crossed(t0, t1, t)) continue;
      this.onReloadEvent(e, st, id, ev);
    }
  }
  onReloadEvent(e, st, id, ev) {
    switch (e) {
      case "magOut":
        ev.sound?.("magOut", id);
        /* магазин сорван с защёлки: кисть тянет вниз-вперёд, ствол клюёт */
        this.jolt([-55, 12, 25], [0, -0.25, -0.08]);
        break;
      case "drop": {
        this.root.updateMatrixWorld(true);
        const down = new THREE6.Vector3(0, -1.2, 0).add(this.muzzleVelocity.clone().multiplyScalar(0.4));
        ev.magDrop?.(this.gun.magazine.matrixWorld.clone(), down, this.gun.magazine);
        this.magState = "none";
        break;
      }
      case "pouch":
        ev.sound?.("pouch", id);
        break;
      case "grab":
        this.magState = "hand";
        break;
      /* v11: АК — левая кисть берёт магазин, ещё стоящий в горловине */
      case "grabOld":
        this.magState = "hand";
        break;
      case "bump":
        ev.sound?.("magOut", id);
        this.ext?.impulse?.(-0.0025, 0.0015, 0.002);
        this.rUp.kick(-4e-3);
        this.rPitch.kick(6e-3);
        break;
      case "magIn":
        ev.sound?.("magIn", id);
        /* передний зуб в горловине: короткий толчок вверх */
        this.jolt([18, 0, -8], [0, 0.1, 0]);
        break;
      case "seat":
        ev.sound?.("magSlap", id);
        this.magState = "gun";
        st.mag = this.spec.tuning.magSize;
        /* v11: удар ладонью по магазину отдаётся в голову (щека/плечо) */
        this.ext?.impulse?.(0.0045, -0.0015, -0.003);
        /* накат до щелчка: ствол подбрасывает, крен к стрелку */
        this.jolt([45, -6, -30], [0, 0.22, 0.05]);
        this.rUp.kick(6e-3);
        this.rPitch.kick(8e-3);
        break;
      case "slideBack":
        ev.sound?.("slideBack", id);
        break;
      case "chargeBack":
        /* рукоятка затвора на себя: оружие тянет назад и разворачивает */
        this.jolt([-20, -25, 30], [0, 0, 0.18]);
        break;
      case "release":
        ev.sound?.(id === "rifle" ? "boltRelease" : "slideRelease", id);
        st.locked = false;
        st.chambered = true;
        st.mag = Math.max(0, st.mag - 1);
        this.slideTimer = this.spec.tuning.slideCycleTime * 0.38;
        /* v11: затвор/кожух летит вперёд — короткий клевок */
        this.ext?.impulse?.(-0.003, 0.001, 0.0025);
        if (this.ext && this.ext.mech) this.ext.mechT0 = undefined;
        this.rBack.kick(8e-3);
        this.rPitch.kick(0.02);
        /* рама ударила вперёд — видимый клевок оружия */
        this.jolt([-35, 8, -18], [0, 0, -0.16]);
        break;
    }
  }
  leftFrame(k, out) {
    const spec = this.spec;
    switch (k.at) {
      case "grip":
        return out.multiplyMatrices(this.gunMatrix, spec.leftGrip);
      case "pouch":
        return out.copy(spec.pouch);
      case "gun":
        return out.multiplyMatrices(this.gunMatrix, k.gun);
      case "mag": {
        const [dy, dz, tilt] = k.mag;
        this.gun.magSeat.updateMatrix();
        const seat = new THREE6.Matrix4().multiplyMatrices(this.gunMatrix, this.gun.magSeat.matrix);
        const off = new THREE6.Matrix4().compose(new THREE6.Vector3(k.clear || 0, dy, dz), new THREE6.Quaternion().setFromEuler(new THREE6.Euler(tilt, 0, 0)), ONE);
        return out.multiplyMatrices(seat, off).multiply(new THREE6.Matrix4().copy(spec.magInHand).invert());
      }
    }
  }
  /** Interpolated left wrist (camera space) + finger pose for the reload time `t`. */
  /* v11: кисть идёт по сплайну Эрмита через ключи с НЕНУЛЕВОЙ скоростью в
     промежуточных точках (как кривые в Maya/MotionBuilder с авто-касательными):
     раньше каждый отрезок шёл ease-in-out — рука останавливалась в КАЖДОМ
     ключе («робот», поза-пауза-поза). Остановки остаются там, где они есть у
     живого человека: удержание (ключи совпадают), разворот движения (рука
     дошла до подсумка и пошла назад) и края дорожки. Касательные ограничены
     (без «перелёта» мимо ключа), дуга — принцип анимации «arcs». */
  leftAt(t, out) {
    const keys = this.track.left;
    const n = keys.length;
    let i = 0;
    while (i < n - 2 && t > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, n - 1)];
    const u = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
    const C = this._lc || (this._lc = { m: [new THREE6.Matrix4(), new THREE6.Matrix4(), new THREE6.Matrix4(), new THREE6.Matrix4()],
      p: [new THREE6.Vector3(), new THREE6.Vector3(), new THREE6.Vector3(), new THREE6.Vector3()],
      q: [new THREE6.Quaternion(), new THREE6.Quaternion(), new THREE6.Quaternion(), new THREE6.Quaternion()],
      ta: new THREE6.Vector3(), tb: new THREE6.Vector3(), d0: new THREE6.Vector3(), d1: new THREE6.Vector3() });
    const k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(n - 1, i + 2)];
    const ks = [k0, a, b, k3];
    for (let j = 0; j < 4; j++) this.leftFrame(ks[j], C.m[j]).decompose(C.p[j], C.q[j], _s);
    const [p0, pa, pb, p3] = C.p;
    const dtS = Math.max(1e-3, b.t - a.t);
    /* касательная в ключе: Катмулл—Ром по времени, ноль — в «остановках» */
    const tangent = (pPrev, pK, pNext, tPrev, tK, tNext, isEdge, outV) => {
      outV.set(0, 0, 0);
      if (isEdge) return outV;
      C.d0.subVectors(pK, pPrev); C.d1.subVectors(pNext, pK);
      const l0 = C.d0.length(), l1 = C.d1.length();
      if (l0 < 0.012 || l1 < 0.012) return outV;                     // удержание
      if (C.d0.dot(C.d1) < -0.15 * l0 * l1) return outV;              // разворот
      outV.subVectors(pNext, pPrev).divideScalar(Math.max(1e-3, tNext - tPrev)).multiplyScalar(0.9);
      /* без перелёта: скорость не больше двойной средней на соседних отрезках */
      const vmax = 2 * Math.min(l0 / Math.max(1e-3, tK - tPrev), l1 / Math.max(1e-3, tNext - tK));
      const v = outV.length(); if (v > vmax) outV.multiplyScalar(vmax / v);
      return outV;
    };
    tangent(p0, pa, pb, k0.t, a.t, b.t, i === 0, C.ta);
    tangent(pa, pb, p3, a.t, b.t, k3.t, i + 1 >= n - 1, C.tb);
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const p = new THREE6.Vector3().copy(pa).multiplyScalar(h00).addScaledVector(C.ta, h10 * dtS).addScaledVector(pb, h01).addScaledVector(C.tb, h11 * dtS);
    /* поворот и пальцы — по той же «скоростной» кривой: плавный разгон
       только там, где кисть стоит */
    const sa = C.ta.lengthSq() > 0 ? 1 : 0, sb = C.tb.lengthSq() > 0 ? 1 : 0;
    const e = clamp(h10 * sa + h01 + h11 * sb, 0, 1);
    const dist = pa.distanceTo(pb);
    // Do not bow away from the magazine/charging handle while in contact.
    const contact = a.at === b.at && (a.at === "mag" || a.at === "gun" || a.at === "grip");
    const arc = contact ? 0 : Math.sin(u * Math.PI) ** 2 * Math.min(0.035, dist * 0.12);
    p.add(new THREE6.Vector3(0, -arc, arc * 0.5));
    // Clear the receiver on magazine -> charging-handle moves, without
    // adding short orientation keys (which caused a fast backward wrist snap).
    if ((a.at === 'mag' && b.at === 'gun') || (a.at === 'gun' && b.at === 'mag')) {
      p.add(new THREE6.Vector3(-0.8, 0.6, 0).transformDirection(this.gunMatrix)
        .multiplyScalar(0.045 * Math.sin(u * Math.PI) ** 2));
    }
    // Zero angular acceleration at segment boundaries; shortest quaternion path.
    const turn = u * u * u * (u * (u * 6 - 15) + 10);
    out.compose(p, C.q[1].clone().slerp(C.q[2], turn), ONE);
    lerpPose(this.spec.hands[a.pose], this.spec.hands[b.pose], e, this.leftPose);
  }
  updateMagazine() {
    for (const s of this.specs) {
      const mag = s.model.magazine;
      if (s !== this.spec) {
        mag.visible = true;
        mag.position.set(0, 0, 0);
        mag.quaternion.identity();
        continue;
      }
      if (this.magState === "hand") {
        mag.visible = true;
        s.model.magSeat.updateMatrix();
        const seat = new THREE6.Matrix4().multiplyMatrices(this.gunMatrix, s.model.magSeat.matrix);
        const left = new THREE6.Matrix4().compose(this.left.anchor.position, this.left.anchor.quaternion, ONE);
        seat.invert().multiply(left).multiply(s.magInHand).decompose(mag.position, mag.quaternion, _s);
      } else if (this.magState === "gun") {
        mag.visible = true;
        mag.position.set(0, 0, 0);
        mag.quaternion.identity();
      } else mag.visible = false;
    }
    this.gun.roundInMag.visible = this.ammo > 0 || this.magState === "hand";
  }
};
return {
  CONFIG, MATH: math_exports, Arm, GlovedHand, WeaponRig, OPEN_POSE, LEFT_OPEN,
  clonePose, lerpPose, gripMatrix, withFumble, magInHand, pouch, translate, pose: P,
  createGloveMaterial, createGloveDetailMaterial, createJacketMaterial, createGloveCuffMaterial,
  createFabricTextures, setSleeveColor, setLayerRecursive, FINGER_JOINTS
};
});
