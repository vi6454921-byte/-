/** Reactive BT, bounded incremental A*, immutable expiring squad reports. */
namespace AegisCombat {
  type P = { x: number; y: number; z: number };
  type S = any;
  export enum Status {
    Failure,
    Success,
    Running,
  }
  interface Ctx {
    s: S;
    b: any;
    t: number;
    active: S;
  }
  interface Node {
    tick(c: Ctx): Status;
  }
  export class Action implements Node {
    constructor(private fn: (c: Ctx) => Status) {}
    tick(c: Ctx) {
      return this.fn(c);
    }
  }
  export class Sequence implements Node {
    constructor(private nodes: Node[]) {}
    tick(c: Ctx) {
      for (const n of this.nodes) {
        const x = n.tick(c);
        if (x !== Status.Success) return x;
      }
      return Status.Success;
    }
  }
  export class Selector implements Node {
    constructor(private nodes: Node[]) {}
    tick(c: Ctx) {
      for (const n of this.nodes) {
        const x = n.tick(c);
        if (x !== Status.Failure) return x;
      }
      return Status.Failure;
    }
  }
  const cond = (fn: (c: Ctx) => boolean) =>
      new Action((c) => (fn(c) ? Status.Success : Status.Failure)),
    act = (fn: (c: Ctx) => void) =>
      new Action((c) => {
        fn(c);
        return Status.Success;
      });
  const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z),
    copy = (p: P): P => ({ x: p.x, y: p.y, z: p.z });
  const team = (s: S) => s.char.preset.faction,
    alive = (s: S) => !s.dead && !s.finished && !s.dmg?.ph?.dead;
  class Heap<T extends { f: number }> {
    a: T[] = [];
    push(n: T) {
      const a = this.a;
      a.push(n);
      let i = a.length - 1;
      while (i) {
        const p = (i - 1) >> 1;
        if (a[p].f <= n.f) break;
        a[i] = a[p];
        i = p;
      }
      a[i] = n;
    }
    pop(): T | undefined {
      const a = this.a,
        top = a[0],
        last = a.pop();
      if (a.length && last) {
        let i = 0;
        while (i * 2 + 1 < a.length) {
          let k = i * 2 + 1;
          if (k + 1 < a.length && a[k + 1].f < a[k].f) k++;
          if (a[k].f >= last.f) break;
          a[i] = a[k];
          i = k;
        }
        a[i] = last;
      }
      return top;
    }
  }
  export class Navigation {
    cell = 1.1;
    bounds: any;
    nx: number;
    nz: number;
    cache = new Map<number, any>();
    edgeCache = new Map<string, any>();
    jobs: any[] = [];
    expanded = 0;
    completed = 0;
    constructor(private world: any) {
      this.bounds = world.bounds || { x0: -30, x1: 30, z0: -35, z1: 35 };
      this.nx = Math.ceil((this.bounds.x1 - this.bounds.x0) / this.cell) + 1;
      this.nz = Math.ceil((this.bounds.z1 - this.bounds.z0) / this.cell) + 1;
    }
    grid(p: P) {
      return {
        x: Math.max(
          0,
          Math.min(this.nx - 1, Math.round((p.x - this.bounds.x0) / this.cell)),
        ),
        z: Math.max(
          0,
          Math.min(this.nz - 1, Math.round((p.z - this.bounds.z0) / this.cell)),
        ),
      };
    }
    point(x: number, z: number): P {
      const px = this.bounds.x0 + x * this.cell,
        pz = this.bounds.z0 + z * this.cell;
      return { x: px, z: pz, y: this.world.heightAt(px, pz) };
    }
    id(x: number, z: number) {
      return z * this.nx + x;
    }
    walk(x: number, z: number, t: number) {
      if (x < 0 || z < 0 || x >= this.nx || z >= this.nz) return false;
      const i = this.id(x, z),
        old = this.cache.get(i);
      if (old && t - old.t < 2) return old.ok;
      const p = this.point(x, z),
        ok =
          !(
            this.world.waterY !== undefined && p.y < this.world.waterY - 0.35
          ) && !this.world.blocked?.(p.x, p.z, p.y, 0.34);
      if (this.cache.size > 45000) this.cache.clear();
      this.cache.set(i, { ok, t });
      return ok;
    }
    clearLine(a: P, b: P, t: number) {
      const surface = (globalThis as any).GNavigation?.get(this.world);
      if (surface?.query) return surface.clear(a, b);
      const d = dist(a, b),
        n = Math.ceil(d / 0.45);
      let prev = a.y;
      for (let i = 0; i <= n; i++) {
        const u = n ? i / n : 0,
          x = a.x + (b.x - a.x) * u,
          z = a.z + (b.z - a.z) * u,
          y = this.world.heightAt(x, z);
        if (Math.abs(y - prev) > 0.35 || this.world.blocked?.(x, z, y, 0.34))
          return false;
        prev = y;
      }
      return true;
    }
    edge(ax: number, az: number, bx: number, bz: number, t: number) {
      const ia = this.id(ax, az),
        ib = this.id(bx, bz),
        key = ia < ib ? ia + ":" + ib : ib + ":" + ia,
        old = this.edgeCache.get(key);
      if (old && t - old.t < 2) return old.ok;
      const ok = this.clearLine(this.point(ax, az), this.point(bx, bz), t);
      if (this.edgeCache.size > 90000) this.edgeCache.clear();
      this.edgeCache.set(key, { ok, t });
      return ok;
    }
    request(s: S, goal: P, t: number) {
      this.jobs = this.jobs.filter((j) => j.s !== s);
      const surface = (globalThis as any).GNavigation?.get(this.world);
      if (surface?.query) {
        s.battle.pending = true;
        this.jobs.push({ recast: true, s, goal: copy(goal), battle: s.battle });
        return;
      }
      if (this.clearLine(s.ctrl.pos, goal, t)) {
        s.battle.path = [copy(goal)];
        s.battle.pending = false;
        s.battle.pathState = "complete";
        s.battle.pathGoal = copy(goal);
        this.completed++;
        return;
      }
      const resolve = (at: P) => {
        const base = this.grid(at),
          candidates: any[] = [];
        for (let dz = -3; dz <= 3; dz++)
          for (let dx = -3; dx <= 3; dx++) {
            const x = base.x + dx,
              z = base.z + dz;
            if (x < 0 || z < 0 || x >= this.nx || z >= this.nz) continue;
            candidates.push({ x, z, d: dist(this.point(x, z), at) });
          }
        candidates.sort((a, b) => a.d - b.d);
        return candidates.find(
          (q) =>
            this.walk(q.x, q.z, t) &&
            this.clearLine(at, this.point(q.x, q.z), t),
        );
      };
      const from = resolve(s.ctrl.pos),
        to = resolve(goal);
      if (!from || !to) {
        s.battle.path = [];
        s.battle.pending = false;
        s.battle.pathState = "unreachable";
        return;
      }
      const start = this.id(from.x, from.z),
        open = new Heap<any>();
      open.push({ ...from, g: 0, f: 0 });
      this.jobs.push({
        s,
        to,
        goal: copy(goal),
        fromPoint: this.point(from.x, from.z),
        start,
        open,
        cost: new Map([[start, 0]]),
        prev: new Map(),
        closed: new Set(),
        best: from,
        bestH: Infinity,
        total: 0,
      });
      s.battle.pending = true;
    }
    process(t: number, budget = 320) {
      const surface = (globalThis as any).GNavigation?.get(this.world);
      surface?.tick(t);
      let queries = 0;
      while (budget > 0 && this.jobs.length) {
        if (this.jobs[0].recast) {
          if (queries++ >= 4) break;
          const j = this.jobs.shift();
          budget -= 40;
          if (!alive(j.s) || j.battle !== j.s.battle) continue;
          let result = surface.plan(j.s.ctrl.pos, j.goal);
          // v22: боец стоит вне навсетки (сдвинут взрывом/толпой) — сначала
          // шаг на ближайшую точку сетки, затем обычный путь
          if (result.state === "unreachable" && !surface.nearest(j.s.ctrl.pos, 1.2, 0.5)) {
            const back = surface.nearest(j.s.ctrl.pos, 3.5, 1.2);
            if (back)
              result = { path: [back.point], state: "partial", endpoint: back.point, generation: result.generation, reason: "recover" };
          }
          Object.assign(j.s.battle, {
            path: result.path,
            pathState: result.state,
            pathGoal: j.goal,
            pathEndpoint: result.endpoint,
            pathGeneration: result.generation,
            pathReason: result.reason,
            pending: false,
          });
          this.completed++;
          continue;
        }
        const j = this.jobs[0];
        if (!alive(j.s)) {
          j.s.battle.pending = false;
          this.jobs.shift();
          continue;
        }
        let done = false;
        const batch = Math.min(40, budget);
        for (let k = 0; k < batch; k++) {
          const n = j.open.pop();
          budget--;
          if (!n) {
            done = true;
            break;
          }
          const ni = this.id(n.x, n.z);
          if (j.closed.has(ni)) continue;
          j.closed.add(ni);
          this.expanded++;
          j.total++;
          const dx = Math.abs(n.x - j.to.x),
            dz = Math.abs(n.z - j.to.z),
            h = Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
          if (h < j.bestH) {
            j.best = n;
            j.bestH = h;
          }
          if (h < 1 || j.total >= 2200) {
            done = true;
            break;
          }
          const p = this.point(n.x, n.z);
          for (const [ox, oz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]) {
            const x = n.x + ox,
              z = n.z + oz;
            if (!this.walk(x, z, t)) continue;
            if (
              ox &&
              oz &&
              (!this.walk(n.x + ox, n.z, t) || !this.walk(n.x, n.z + oz, t))
            )
              continue;
            if (!this.edge(n.x, n.z, x, z, t)) continue;
            const q = this.point(x, z),
              dy = q.y - p.y;
            if (Math.abs(dy) > 0.55) continue;
            const key = this.id(x, z),
              g = n.g + (ox && oz ? 1.414 : 1) + Math.abs(dy) * 1.7;
            if (g >= (j.cost.get(key) ?? Infinity)) continue;
            j.cost.set(key, g);
            j.prev.set(key, ni);
            const hx = Math.abs(x - j.to.x),
              hz = Math.abs(z - j.to.z);
            j.open.push({
              x,
              z,
              g,
              f: g + Math.max(hx, hz) + 0.414 * Math.min(hx, hz),
            });
          }
        }
        if (done) {
          const path: P[] = [];
          let k = this.id(j.best.x, j.best.z);
          while (k !== j.start && j.prev.has(k) && path.length < 600) {
            path.push(this.point(k % this.nx, Math.floor(k / this.nx)));
            k = j.prev.get(k);
          }
          path.reverse();
          if (dist(j.s.ctrl.pos, j.fromPoint) > 0.15) path.unshift(j.fromPoint);
          const endpoint =
            path[path.length - 1] || this.point(j.best.x, j.best.z);
          const reached =
            dist(endpoint, j.goal) < this.cell * 1.6 &&
            this.clearLine(endpoint, j.goal, t);
          if (reached && this.clearLine(j.s.ctrl.pos, path[0] || j.goal, t)) {
            if (dist(endpoint, j.goal) > 0.08 || !path.length)
              path.push(copy(j.goal));
          }
          j.s.battle.pathState = reached
            ? "complete"
            : path.length
              ? "partial"
              : "unreachable";
          j.s.battle.pathGoal = copy(j.goal);
          j.s.battle.path = path;
          j.s.battle.pending = false;
          this.completed++;
          this.jobs.shift();
        } else this.jobs.push(this.jobs.shift());
      }
    }
  }
  export function create({ THREE: T, world, squad, visible }: any) {
    const nav = new Navigation(world),
      boards = new Map<string, any>(),
      stats = {
        checks: 0,
        shots: 0,
        decisions: 0,
        friendlyBlocks: 0,
        hearing: 0,
        coverTests: 0,
        flanks: 0,
        scoots: 0,
      };
    let tokens = 0,
      clock = -1,
      active: S = null;
    const origin = new T.Vector3(),
      target = new T.Vector3();
    // Cached roster per team and a coarse bucket grid for local queries (separation, neighbours).
    const lists: Record<string, S[]> = {},
      grid = new Map<number, S[]>(),
      GC = 8,
      tmp: S[] = [];
    let gridAt = -1;
    const ix = (s: S) =>
        s._ix === undefined ? (s._ix = squad.indexOf(s)) : s._ix,
      teamOf = (k: string) =>
        lists[k] || (lists[k] = squad.filter((a: S) => team(a) === k)),
      foe = (k: string) => (k === "delta" ? "alpha" : "delta"),
      over = () => !!(globalThis as any).GTeams?.isOver?.();
    function rebuild(t: number) {
      if (t - gridAt < 0.2) return;
      gridAt = t;
      for (const v of grid.values()) v.length = 0;
      for (const a of squad) {
        if (!alive(a)) continue;
        const p = a.ctrl.pos,
          key = Math.floor(p.x / GC) * 4096 + Math.floor(p.z / GC);
        let v = grid.get(key);
        if (!v) grid.set(key, (v = []));
        v.push(a);
      }
    }
    function nearby(p: P, r: number) {
      tmp.length = 0;
      const x1 = Math.floor((p.x + r) / GC),
        z1 = Math.floor((p.z + r) / GC);
      for (let x = Math.floor((p.x - r) / GC); x <= x1; x++)
        for (let z = Math.floor((p.z - r) / GC); z <= z1; z++) {
          const v = grid.get(x * 4096 + z);
          if (v) for (const a of v) tmp.push(a);
        }
      return tmp;
    }
    const board = (s: S) => {
      const k = team(s);
      if (!boards.has(k))
        boards.set(k, { contacts: new Map(), claims: new Map() });
      return boards.get(k);
    };
    function state(s: S, t: number) {
      return (
        s.battle ||
        (s.battle = {
          next: t + (ix(s) % 6) * 0.045,
          path: [],
          pathAt: 0,
          shotAt: 0,
          target: null,
          los: false,
          seenAt: -100,
          memory: null,
          pending: false,
          mode: "idle",
          goal: null,
          cover: null,
          coverAt: 0,
          suppression: 0,
          burst: 0,
          role:
            Math.max(0, teamOf(team(s)).indexOf(s)) % 3,
          prevPos: copy(s.ctrl.pos),
          stuck: 0,
          stuckN: 0,
          acquired: 0,
          searchAt: t,
          wish: new T.Vector2(),
        })
      );
    }
    const eyeHeight = (s: S) =>
      Math.max(
        0.3,
        (s.char.metrics?.eyeY || 1.62) -
          0.5 * (s.ctrl.crouch || 0) -
          1.15 * (s.ctrl.prone || 0),
      );
    const torsoHeight = (s: S) =>
      Math.max(
        0.22,
        1.25 - 0.5 * (s.ctrl.crouch || 0) - 0.95 * (s.ctrl.prone || 0),
      );
    function los(a: P, b: P, ah = 1.45, bh = 1.25) {
      if (tokens <= 0) return null;
      tokens--;
      stats.checks++;
      origin.set(a.x, a.y + ah, a.z);
      target.set(b.x, b.y + bh, b.z);
      return visible(origin, target);
    }
    function perception(s: S, b: any, t: number) {
      const p = s.ctrl.pos,
        candidates: { q: S; score: number }[] = [];
      for (const q of teamOf(foe(team(s)))) {
        if (q === s || !alive(q)) continue;
        const d = dist(p, q.ctrl.pos);
        if (d > 120) continue;
        const dx = q.ctrl.pos.x - p.x,
          dz = q.ctrl.pos.z - p.z,
          facing =
            (-Math.sin(s.ctrl.yaw) * dx - Math.cos(s.ctrl.yaw) * dz) /
            Math.max(0.1, d);
        if (d > 9 && facing < 0.26) continue;
        candidates.push({ q, score: 130 - d + (q === b.target ? 20 : 0) });
      }
      candidates.sort((a, b) => b.score - a.score);
      b.los = false;
      for (const { q } of candidates.slice(0, 3)) {
        const seen = los(p, q.ctrl.pos, eyeHeight(s), torsoHeight(q));
        if (seen) {
          if (b.target !== q) b.acquired = t;
          b.target = q;
          b.los = true;
          b.seenAt = t;
          b.memory = copy(q.ctrl.pos);
          b.seenPos = copy(q.ctrl.pos);
          b.seenSelf = t; // v26: сам видел (для огня на подавление)
          b.aimHeight = torsoHeight(q);
          board(s).contacts.set(q, {
            p: copy(q.ctrl.pos),
            height: b.aimHeight,
            at: t,
            source: s,
          });
          break;
        }
        if (seen === null) break;
      }
      if (b.target && !alive(b.target)) {
        b.target = null;
        b.los = false;
      }
      if (!b.los) {
        let report: any = null;
        for (const [q, c] of board(s).contacts) {
          if (t - c.at > 9 || !alive(q)) {
            board(s).contacts.delete(q);
            continue;
          }
          if (c.source !== s && (!report || c.at > report.at)) report = c;
        }
        if (report && report.at > b.seenAt) {
          b.memory = copy(report.p);
          b.aimHeight = report.height || 1.25;
          b.seenAt = report.at;
        }
      }
      if (t - b.seenAt > 10) {
        b.memory = null;
        b.target = null;
        b.cover = null;
      }
      b.suppression = Math.max(0, b.suppression - 0.12);
      if (s.tac && t < s.tac.until)
        b.suppression = Math.min(1, b.suppression + 0.35);
    }
    function cover(s: S, b: any, t: number) {
      if (t < b.coverAt) return b.cover;
      b.coverAt = t + 2.4;
      const enemy = b.memory;
      if (!enemy) return null;
      let best: any = null,
        score = -Infinity;
      const p = s.ctrl.pos,
        bb = board(s);
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI) / 8 + (b.role - 1) * 0.4,
          r = k % 3 === 0 ? 10.5 : k % 2 ? 4 : 7 /* v26: третье кольцо — укрытие подальше лучше, чем никакого */,
          x = p.x + Math.cos(a) * r,
          z = p.z + Math.sin(a) * r,
          y = world.heightAt(x, z),
          candidate = { x, y, z },
          g = nav.grid(candidate);
        const surface = (globalThis as any).GNavigation?.get(world);
        if (surface?.query) {
          const q = surface.nearest({ x, y: p.y, z }, 0.25, 0.5);
          if (!q) continue;
          candidate.y = q.point.y;
        } else if (!nav.walk(g.x, g.z, t)) continue;
        const key = g.x + "," + g.z + "," + Math.round(candidate.y * 2),
          claim = bb.claims.get(key);
        if (claim && claim.s !== s && claim.until > t) continue;
        const dx = enemy.x - x,
          dz = enemy.z - z,
          L = Math.hypot(dx, dz) || 1;
        let shield = false;
        for (const d of [0.65, 1.05, 1.6]) {
          stats.coverTests++;
          if (
            world.blocked?.(
              x + (dx / L) * d,
              z + (dz / L) * d,
              candidate.y + 0.35,
              0.12,
            )
          ) {
            shield = true;
            break;
          }
        }
        if (!shield) continue;
        const val =
          15 -
          dist(p, candidate) -
          Math.abs(dist(candidate, enemy) - 30) * 0.06;
        if (val > score) {
          best = { ...candidate, key };
          score = val;
        }
      }
      if (best) {
        bb.claims.set(best.key, { s, until: t + 4 });
        b.cover = best;
      }
      return best;
    }
    // Guards and followers do not chase contacts beyond their leash (set by GTeams orders).
    const leashed = (s: S, m: P) => {
      const L = s.order?.leash;
      return !!L && Math.hypot(m.x - L.x, m.z - L.z) > L.r;
    };
    /* v22 · тактика отделения.
       Обход по флангу: флангер (роль 1), пока товарищи держат цель огнём, уходит
       сначала вбок с линии огня, затем выходит на 60–85° сбоку от противника и бьёт
       во фланг. На одну цель — не больше двух флангеров; на перебежке огонь не ведёт
       (кроме ближнего боя), бежит. Отвлекающий огонь: те, кто видит цель, на время
       обхода стреляют чаще и, потеряв её из виду, ещё несколько секунд бьют по
       последней точке (огонь на подавление), а не идут к ней. «Огонь и смена
       позиции»: отстрелявшись 6–11 с с одной точки, боец перебегает в соседнее
       укрытие — противник целится туда, где его уже нет. */
    const snapGoal = (g: any, s: S): P | null => {
      const GS = (globalThis as any).GSectors;
      if (GS?.clampGoal) g = GS.clampGoal(world, g, 3) || g;
      const nb = nav.bounds;
      if (!Number.isFinite(g.x) || !Number.isFinite(g.z) || g.x < nb.x0 + 1 || g.x > nb.x1 - 1 || g.z < nb.z0 + 1 || g.z > nb.z1 - 1)
        return null;
      const q = { x: g.x, y: world.heightAt(g.x, g.z), z: g.z };
      if (world.waterY !== undefined && q.y < world.waterY - 0.2) return null;
      const surface = (globalThis as any).GNavigation?.get(world);
      if (surface?.query) {
        const n = surface.nearest(q, 1.6, 1.2);
        return n ? { x: n.point.x, y: n.point.y, z: n.point.z } : null;
      }
      const gg = nav.grid(q);
      return nav.walk(gg.x, gg.z, clock) ? q : null;
    };
    const flankers = (s: S, q: S, t: number) => {
      let n = 0;
      for (const a of teamOf(team(s)))
        if (a !== s && alive(a) && a.battle?.flank && a.battle.flank.until > t && a.battle.flank.target === q) n++;
      return n;
    };
    const say = (s: S, kind: string, data?: any) => {
      try {
        (globalThis as any).GVoice?.say?.(s, kind, data);
      } catch (err) {
        /* голоса не обязательны */
      }
    };
    function startFlank(s: S, b: any, t: number, e: P, d: number) {
      const p = s.ctrl.pos,
        ux = (e.x - p.x) / d,
        uz = (e.z - p.z) / d,
        rx = -uz,
        rz = ux;
      const pref = (ix(s) + Math.floor(t / 40)) % 2 ? 1 : -1;
      for (const side of [pref, -pref]) {
        const R = Math.max(14, Math.min(24, d * 0.5)),
          th = ((62 + (ix(s) % 3) * 10) * Math.PI) / 180;
        const gx = e.x + (-ux * Math.cos(th) + rx * side * Math.sin(th)) * R,
          gz = e.z + (-uz * Math.cos(th) + rz * side * Math.sin(th)) * R;
        const goal = snapGoal({ x: gx, z: gz, y: e.y }, s);
        if (!goal) continue;
        const off = Math.min(14, d * 0.4),
          wp = snapGoal({ x: p.x + rx * side * off + ux * off * 0.3, z: p.z + rz * side * off + uz * off * 0.3, y: p.y }, s);
        b.flank = { target: b.target, side, goal, wp, stage: wp ? 0 : 1, until: t + 30, since: t };
        b.flankCd = t + 38 + (ix(s) % 5) * 3;
        stats.flanks = (stats.flanks || 0) + 1;
        // отвлекающий огонь: товарищи, видящие цель, прижимают её на время обхода
        for (const a of teamOf(team(s)))
          if (a !== s && alive(a) && a.battle && a.battle.memory && (a.battle.target === b.target || dist(a.battle.memory, e) < 6))
            a.battle.suppressFor = t + 9;
        say(s, "flank", { side });
        return true;
      }
      b.flankCd = t + 12;
      return false;
    }
    /* true — обход продолжается (цель и режим выставлены) */
    function flankStep(s: S, b: any, t: number, e: P, d: number) {
      const f = b.flank;
      if (!f) return false;
      if (t > f.until || !f.target || !alive(f.target) || d < 11 || (b.los && b.target !== f.target && d < 30)) {
        b.flank = null;
        return false;
      }
      const p = s.ctrl.pos;
      let g = f.stage === 0 ? f.wp : f.goal;
      // нет продвижения 4 с (упёрся, путь частичный) — следующий этап / конец обхода
      const dg = dist(p, g);
      if (t - (f.lastT ?? t) > 1) f.best = undefined; // пережидал огонь в укрытии — отсчёт заново
      f.lastT = t;
      if (f.best === undefined || dg < f.best - 0.6) {
        f.best = dg;
        f.bestT = t;
      }
      const stuck =
        (b.pathState === "unreachable" && !b.pending && b.pathGoal && dist(b.pathGoal, g) < 0.5) || t - f.bestT > 4;
      if (dg < 2.2 || stuck) {
        f.best = undefined;
        if (f.stage === 0) {
          f.stage = 1;
          g = f.goal;
        } else {
          b.flank = null;
          b.owSpot = copy(p);
          b.owSince = t;
          // на позиции — развернуться к противнику (бежал боком к нему)
          s.idleYaw = Math.atan2(-(e.x - p.x), -(e.z - p.z));
          if (!stuck) say(s, "onflank");
          return false;
        }
      }
      b.mode = "flank";
      b.goal = g;
      b.sprint = b.suppression < 0.3;
      b.holdFire = d > 22;
      return true;
    }
    /* «огонь и смена позиции»; true — боец перебегает */
    function scoot(s: S, b: any, t: number, e: P, d: number) {
      const p = s.ctrl.pos;
      if (b.scoot) {
        if (t < b.scoot.until && dist(p, b.scoot.goal) > 0.9) {
          b.mode = "reposition";
          b.goal = b.scoot.goal;
          b.holdFire = true;
          return true;
        }
        b.scoot = null;
        b.owSpot = copy(p);
        b.owSince = t;
        return false;
      }
      if (!b.owSpot || dist(p, b.owSpot) > 1.6) {
        b.owSpot = copy(p);
        b.owSince = t;
        return false;
      }
      const hold = 6.5 + (ix(s) % 4) * 1.4 - Math.min(3, b.suppression * 5);
      if (t - b.owSince < hold || d < 15 || t - (b.lastShotT ?? -99) > 3) return false;
      b.coverAt = 0;
      let g: P | null = cover(s, b, t);
      if (!g || dist(g, p) < 2.5) {
        const ux = (e.x - p.x) / d,
          uz = (e.z - p.z) / d,
          side = (Math.floor(t / 7) + ix(s)) % 2 ? 1 : -1;
        g = snapGoal({ x: p.x - uz * side * 5, z: p.z + ux * side * 5, y: p.y }, s);
      }
      if (!g) {
        b.owSince = t;
        return false;
      }
      b.scoot = { goal: g, until: t + 4.5 };
      stats.scoots = (stats.scoots || 0) + 1;
      b.mode = "reposition";
      b.goal = g;
      b.holdFire = true;
      return true;
    }
    /* v26 · бой из укрытия, огонь на подавление, перекаты, зачистка помещений. */
    // Огонь из укрытия: боец не сидит вслепую — раз в 1,5–3 с выглядывает (встаёт
    // над низким укрытием или делает шаг из-за края) на 1–1,7 с, даёт очередь и снова
    // прячется. Укрытия рядом нет — присел/залёг и отвечает огнём с места.
    function peekCover(s: S, b: any, t: number) {
        const c = s.ctrl, g = b.goal;
        b.peek = false;
        b.coverFire = !g;
        if (!g || !b.memory || dist(c.pos, g) > 1.5 || b.suppression > 0.85 || c.reload >= 0 || c.ammo <= 0)
            return;
        if (t >= (b.peekNext || 0)) {
            b.peekAt = t;
            b.peekUntil = t + 1.0 + Math.random() * 0.7;
            b.peekNext = b.peekUntil + 1.3 + Math.random() * 1.3 + b.suppression * 1.5;
            b.peekSide = (ix(s) + Math.floor(t / 9)) % 2 ? 1 : -1;
            b.peekGoal = null;
        }
        if (t >= (b.peekUntil || 0))
            return;
        b.peek = b.coverFire = true;
        c.aiCrouch = false;
        c.aiProne = false;
        if (!b.peekGoal && !b.los && t - b.peekAt > 0.4) {
            const dx = b.memory.x - g.x, dz = b.memory.z - g.z, L = Math.hypot(dx, dz) || 1, k = 0.9 * b.peekSide;
            const q = snapGoal({ x: g.x - (dz / L) * k + (dx / L) * 0.2, z: g.z + (dx / L) * k + (dz / L) * 0.2, y: g.y }, s);
            b.peekGoal = q && dist(q, g) < 1.3 && Math.abs(q.y - g.y) < 0.4 ? q : g;
        }
        if (b.peekGoal) {
            b.goal = b.peekGoal;
            b.speed = 0.65;
        }
    }
    // Потеряв цель из виду, стрелок и пулемётчик (не флангер) ещё до 3 с бьют по
    // точке, где сами её видели: противник за укрытием прижат и не высовывается.
    const suppressNow = (c: any) => (c.b.suppressFor || 0) > c.t ||
        (c.b.role !== 1 &&
            c.t - (c.b.seenSelf ?? -99) > 0.45 &&
            c.t - (c.b.seenSelf ?? -99) < 3 &&
            c.s.ctrl.ammo > 8 &&
            dist(c.s.ctrl.pos, c.b.memory) < 140);
    const matesNear = (s: S, r: number) => {
        let n = 0;
        for (const q of nearby(s.ctrl.pos, r))
            if (q !== s && alive(q) && team(q) === team(s) && dist(q.ctrl.pos, s.ctrl.pos) < r)
                n++;
        return n;
    };
    // Перекаты: контакт свежий, противник дальше 16 м, рядом товарищи — половина
    // группы держит сектор с колена, другая перебегает; каждые 4,5 с меняются.
    function boundHold(c: any) {
        const b = c.b, p = c.s.ctrl.pos, m = b.memory;
        if (c.t - b.seenAt > 8 || dist(p, m) < 16 || (ix(c.s) + Math.floor(c.t / 4.5)) % 2 || (b.cq && b.cq.phase !== "done") || matesNear(c.s, 12) < 1)
            return false;
        b.mode = "bound-hold";
        b.goal = null;
        c.s.ctrl.aiCrouch = true;
        c.s.idleYaw = Math.atan2(-(m.x - p.x), -(m.z - p.z));
        return true;
    }
    // Зачистка помещения: цель под крышей, а боец снаружи — встать у входа сбоку от
    // проёма, пригнуться, подождать напарника (до 2,5 с) и входить по одному (заявка
    // на вход 1,5 с — второй идёт следом), оружие у плеча, сектор ±30°.
    const roofCache = new Map<string, boolean>();
    const up = new T.Vector3();
    function roofed(p: any): boolean {
        const k = Math.round(p.x * 2) + "," + Math.round(p.z * 2) + "," + Math.round(p.y);
        let v = roofCache.get(k);
        if (v === undefined) {
            origin.set(p.x, p.y + 1.5, p.z);
            up.set(p.x, p.y + 12, p.z);
            v = visible(origin, up, true) === false;
            if (roofCache.size > 6000)
                roofCache.clear();
            roofCache.set(k, v);
        }
        return v;
    }
    function cqb(s: S, b: any, t: number): boolean {
        const m = b.memory, p = s.ctrl.pos;
        let q: any = b.cq;
        if (q && dist(q.m, m) > 4)
            b.cq = q = null;
        if (q && q.phase !== "done" && t - q.t0 > 14)
            q.phase = "done";
        if (q && q.phase === "done")
            return false;
        if (!q) {
            if (dist(p, m) > 30 || !b.path.length || (b.pathGoal && dist(b.pathGoal, m) > 3) || !roofed(m) || roofed(p))
                return false;
            let e: any = null, prev: any = p;
            for (let i = 0; i < Math.min(90, b.path.length); i++) {
                const w = b.path[i];
                if (roofed(w)) {
                    e = w;
                    break;
                }
                prev = w;
            }
            if (!e)
                return false;
            const dx = e.x - prev.x, dz = e.z - prev.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, side = ix(s) % 2 ? 1 : -1;
            if (dist(p, e) < 2.2) {
                b.cq = q = { m: copy(m), e: copy(e), st: null, phase: "entry", t0: t, at: t };
                say(s, "entry");
            }
            else {
                const raw = { x: e.x - ux * 1.7 - uz * 0.7 * side, z: e.z - uz * 1.7 + ux * 0.7 * side, y: e.y };
                let st = snapGoal(raw, s);
                if (!st || dist(st, raw) > 0.8 || roofed(st))
                    st = snapGoal({ x: e.x - ux * 1.7, z: e.z - uz * 1.7, y: e.y }, s);
                if (!st)
                    return false;
                b.cq = q = { m: copy(m), e: copy(e), st, phase: "stack", t0: t, at: 0 };
            }
            stats.cqb = (stats.cqb || 0) + 1;
        }
        const bb = board(s), key = "cq:" + Math.round(q.e.x) + "," + Math.round(q.e.z);
        if (q.phase === "stack") {
            b.mode = "cqb-stack";
            b.goal = q.st;
            s.idleYaw = Math.atan2(-(q.e.x - p.x), -(q.e.z - p.z));
            if (dist(p, q.st) > 0.9)
                return true;
            s.ctrl.aiCrouch = true;
            if (!q.at) {
                q.at = t;
                say(s, "stack");
            }
            const claim = bb.claims.get(key);
            if (t - q.at < 1 || (t - q.at < 2.5 && matesNear(s, 5) < 1) || (claim && claim.s !== s && claim.until > t))
                return true;
            bb.claims.set(key, { s, until: t + 1.5 });
            q.phase = "entry";
            q.at = t;
            stats.entries = (stats.entries || 0) + 1;
            say(s, "entry");
        }
        b.mode = "cqb-entry";
        b.goal = copy(m);
        b.speed = 0.6;
        if ((roofed(p) && dist(p, q.e) > 1.6) || dist(p, m) < 2 || t - q.at > 8) {
            q.phase = "done";
            if (roofed(p) && !b.los)
                say(s, "room");
        }
        return true;
    }
    const tree = new Selector([
      new Sequence([
        cond(
          (c) =>
            !!(
              c.s.ctrl.treating ||
              c.s.ctrl.dragging ||
              c.s.thr?.mode ||
              (c.s.tac && !["idle", "advance"].includes(c.s.tac.mode))
            ),
        ),
        act((c) => {
          c.b.mode = "medical-or-threat";
          c.s.combatAim = null;
        }),
      ]),
      new Sequence([
        cond((c) => !!c.s.ctrl.jam),
        act((c) => {
          c.b.mode = "clear-jam";
          c.b.goal = c.b.memory ? cover(c.s, c.b, c.t) : null;
          if (c.s.ctrl.reload < 0) c.s.ctrl.startClear?.();
          c.s.combatAim = null;
        }),
      ]),
      new Sequence([
        cond((c) => c.s.ctrl.ammo <= 0),
        act((c) => {
          const ctrl = c.s.ctrl;
          c.b.mode = ctrl.reserve > 0 ? "reload" : "no-ammo";
          if (ctrl.reserve > 0 && ctrl.reload < 0) ctrl.startReload();
          c.b.goal = c.b.memory ? cover(c.s, c.b, c.t) : null;
          ctrl.aiCrouch = true;
          c.s.combatAim = null;
        }),
      ]),
      new Sequence([
        cond(
          (c) =>
            !!c.b.memory &&
            (c.b.suppression > 0.35 || (c.s.ctrl.shockK || 0) > 0.45 ||
              (c.b.mode === "take-cover" && c.b.suppression > 0.12 && c.t < (c.b.coverHold || 0))),
        ),
        act((c) => {
          if (c.b.mode !== "take-cover")
              c.b.coverHold = c.t + 3 + Math.random() * 2.5; // v26: в укрытии посидеть, а не выскочить сразу
          c.b.mode = "take-cover";
          c.b.goal = cover(c.s, c.b, c.t);
          c.s.ctrl.aiCrouch = !c.b.goal || dist(c.s.ctrl.pos, c.b.goal) < 1.2;
          c.s.ctrl.aiProne = c.b.suppression > 0.8 && !c.b.goal;
          peekCover(c.s, c.b, c.t); // v26: выглянуть и дать очередь
        }),
      ]),
      // v22: начатый обход продолжается и без прямой видимости цели
      new Sequence([
        cond(
          (c) =>
            !!c.b.flank &&
            !!c.b.memory &&
            flankStep(c.s, c.b, c.t, c.b.memory, dist(c.s.ctrl.pos, c.b.memory)),
        ),
      ]),
      new Sequence([
        cond((c) => c.b.los),
        act((c) => {
          const b = c.b,
            p = c.s.ctrl.pos,
            e = b.memory,
            d = dist(p, e),
            overwatch = teamOf(team(c.s)).some(
              (a: S) =>
                a !== c.s &&
                alive(a) &&
                a.battle?.los &&
                (a.battle.role === 0 || a.battle.mode === "overwatch"),
            );
          if (d < 11) {
            // Close quarters: no retreat with a lowered rifle. Keep firing while
            // side-stepping (alternating side every ~1.6 s) or slipping into
            // cover right next to the bot.
            const nx = (p.x - e.x) / Math.max(1, d),
              nz = (p.z - e.z) / Math.max(1, d),
              side = Math.floor(c.t / 1.6 + (b.role || 0)) % 2 ? 1 : -1;
            const near = b.role === 2 ? cover(c.s, b, c.t) : null;
            b.mode = "close";
            b.goal =
              near && dist(p, near) < 4
                ? near
                : { x: p.x - nz * 2.6 * side + nx * 0.6, z: p.z + nx * 2.6 * side + nz * 0.6, y: p.y };
            // v22: вблизи — огонь с колена/пригнувшись, смещение короткое
            c.s.ctrl.aiCrouch = true;
          } else if (
            b.role === 1 && overwatch && d >= 18 && d <= 90 && c.t > (b.flankCd || 0) &&
            flankers(c.s, b.target, c.t) < 2 && startFlank(c.s, b, c.t, e, d) && flankStep(c.s, b, c.t, e, d)
          ) {
            // v22: обход по флангу начат
          } else if (b.role === 0 || !overwatch || d < 28) {
            if (!scoot(c.s, b, c.t, e, d)) {
              b.mode = "overwatch";
              b.goal = null;
            }
            c.s.ctrl.aiCrouch = true;
          } else {
            b.mode = b.role === 1 ? "flank" : "bound";
            const dx = p.x - e.x,
              dz = p.z - e.z,
              L = Math.hypot(dx, dz) || 1,
              sign = b.role === 1 ? 1 : -1;
            b.goal = {
              x: e.x + (dx / L) * 24 - (dz / L) * 12 * sign,
              z: e.z + (dz / L) * 24 + (dx / L) * 12 * sign,
              y: e.y,
            };
            if (Math.floor(c.t / 4) % 2 !== b.role % 2) {
              b.mode = "overwatch";
              b.goal = null;
            }
          }
        }),
      ]),
      // v22: огонь на подавление — цель скрылась, но товарищ обходит: держать точку огнём
      new Sequence([
        cond(
          (c) =>
            !!c.b.memory && suppressNow(c) && // v26: и сам, потеряв цель, держит точку огнём
            !!c.b.memory &&
            c.t - c.b.seenAt < 4 &&
            dist(c.s.ctrl.pos, c.b.memory) > 12,
        ),
        act((c) => {
          c.b.mode = "suppress";
          c.b.goal = null;
          c.s.ctrl.aiCrouch = true;
        }),
      ]),
      new Sequence([
        cond((c) => !!c.b.memory && !leashed(c.s, c.b.memory)),
        act((c) => {
          c.b.mode = "investigate";
          if (boundHold(c) || cqb(c.s, c.b, c.t))
              return; // v26: перекаты / зачистка помещения
          c.b.goal = copy(c.b.memory);
          if (
            dist(c.s.ctrl.pos, c.b.memory) < 2 &&
            Math.abs(c.s.ctrl.pos.y - c.b.memory.y) < 0.6
          ) {
            c.b.goal = null;
            c.b.mode = "search";
            c.s.idleYaw += (c.t - c.b.searchAt) * 0.3;
            c.b.searchAt = c.t;
            if (c.t - c.b.seenAt > 7) c.b.memory = null;
          }
        }),
      ]),
      act((c) => {
        c.b.mode = "regroup";
        const o = c.s.order;
        if (o && c.t < o.until) {
          const b = c.b;
          b.mode = o.mode;
          b.goal = o.goal;
          b.speed = o.speed || 1;
          b.sprint = !!o.sprint;
          if (o.face !== undefined && (!o.goal || dist(c.s.ctrl.pos, o.goal) < 1.2))
            c.s.idleYaw = o.face;
          // v22: на месте — занять позицию: с колена, лицом в свой сектор
          if (o.hold || !o.goal)
            c.s.ctrl.aiCrouch = c.t - (b.seenAt ?? -99) < 90 || (ix(c.s) % 3) !== 0;
          // v22: до цели не дойти — сразу новый приказ (другая точка), а не стоять
          if (o.goal && b.pathState === "unreachable" && !b.pending && b.pathGoal &&
            dist(b.pathGoal, o.goal) < 0.3) {
            o.until = 0;
            if (c.s.tm) {
              c.s.tm.next = 0;
              c.s.tm.pauseUntil = 0;
            }
          }
          return;
        }
        const leader =
          c.active && alive(c.active) && team(c.active) === team(c.s)
            ? c.active
            : squad.find((a: S) => alive(a) && team(a) === team(c.s));
        c.b.goal = null;
        if (leader && leader !== c.s) {
          const i = squad.filter((a: S) => team(a) === team(c.s)).indexOf(c.s),
            side = i % 2 ? 1 : -1,
            back = 3 + Math.floor(i / 2) * 1.7,
            p = leader.ctrl.pos,
            yaw = leader.ctrl.yaw,
            p2 = {
              x: p.x + Math.cos(yaw) * side * 2.2 + Math.sin(yaw) * back,
              z: p.z - Math.sin(yaw) * side * 2.2 + Math.cos(yaw) * back,
              y: p.y,
            };
          if (
            dist(c.s.ctrl.pos, p2) > 2 ||
            Math.abs(c.s.ctrl.pos.y - p2.y) > 0.5
          )
            c.b.goal = p2;
        } else if (world.mapId) {
          const enemyBase =
            world.bases?.[team(c.s) === "delta" ? "alpha" : "delta"];
          const bounds = nav.bounds;
          const objective = enemyBase
            ? {
                x: enemyBase.x,
                z: enemyBase.z,
                y: world.heightAt(enemyBase.x, enemyBase.z),
              }
            : {
                x: (bounds.x0 + bounds.x1) / 2,
                z: (bounds.z0 + bounds.z1) / 2,
                y: 0,
              };
          c.b.mode = "advance-objective";
          c.b.goal = objective;
          if (dist(c.s.ctrl.pos, objective) < 5) {
            const phase = Math.floor(c.t / 9) % 4,
              angle = (phase * Math.PI) / 2;
            c.b.mode = "patrol";
            c.b.goal = {
              x: objective.x + Math.cos(angle) * 7,
              z: objective.z + Math.sin(angle) * 7,
              y: objective.y,
            };
          }
        } else {
          c.b.mode = "scan";
          c.s.idleYaw = Math.sin(c.t * 0.13) * 1.1 + (c.s.formYaw || 0);
        }
      }),
    ]);
    function update(t: number, a: S) {
      if (clock === t) return;
      clock = t;
      active = a;
      tokens = 8 + Math.ceil(squad.length / 10);
      rebuild(t);
      nav.process(t, 320);
      for (const bb of boards.values())
        for (const [key, claim] of bb.claims)
          if (claim.until < t || !alive(claim.s)) bb.claims.delete(key);
    }
    function steer(s: S, b: any, dt: number, t: number) {
      const c = s.ctrl;
      if (!b.goal) {
        c.aiWish = null;
        b.path = [];
        return;
      }
      const surface = (globalThis as any).GNavigation?.get(world);
      const near = (p: P, r = 0.4) =>
        dist(c.pos, p) < r && Math.abs(c.pos.y - p.y) < 0.3;
      const sameGoal =
        b.pathGoal &&
        dist(b.pathGoal, b.goal) < 0.25 &&
        Math.abs(b.pathGoal.y - b.goal.y) < 0.25;
      const projectedEnd =
        surface &&
        sameGoal &&
        b.pathEndpoint &&
        b.pathGeneration === surface.generation &&
        ["projected", "partial"].includes(b.pathState) &&
        near(b.pathEndpoint);
      if (
        (dist(c.pos, b.goal) < 0.65 && Math.abs(c.pos.y - b.goal.y) < 0.35) ||
        projectedEnd
      ) {
        c.aiWish = null;
        b.path = [];
        // v22: дошёл до конца частичного пути, а цель далеко — новый приказ
        if (projectedEnd && b.pathState === "partial" && dist(c.pos, b.goal) > 2.5 && s.order) {
          s.order.until = 0;
          if (s.tm) {
            s.tm.next = 0;
            s.tm.pauseUntil = 0;
          }
        }
        return;
      }
      if (t >= b.pathAt && !b.pending) {
        b.pathAt = t + 1.5 + (ix(s) % 4) * 0.13;
        nav.request(s, b.goal, t);
      }
      while (b.path.length && near(b.path[0], surface?.query ? 0.22 : 0.65))
        b.path.shift();
      let p = b.path[0];
      if (!p) {
        if (!nav.clearLine(c.pos, b.goal, t)) {
          c.aiWish = null;
          return;
        }
        p = b.goal;
      }
      if (
        b.path.length > 1 &&
        dist(c.pos, b.path[1]) < 2.4 &&
        nav.clearLine(c.pos, b.path[1], t)
      )
        p = b.path[1];
      let mx = p.x - c.pos.x,
        mz = p.z - c.pos.z;
      const L = Math.hypot(mx, mz) || 1;
      mx /= L;
      mz /= L;
      for (const q of nearby(c.pos, 1.2)) {
        if (q === s || !alive(q)) continue;
        const dx = c.pos.x - q.ctrl.pos.x,
          dz = c.pos.z - q.ctrl.pos.z,
          d = Math.hypot(dx, dz);
        if (d < 1.2 && d > 0.01 && Math.abs(c.pos.y - q.ctrl.pos.y) < 0.9) {
          const w = (1.2 - d) * 0.9;
          mx += (dx / d) * w;
          mz += (dz / d) * w;
          // Deterministic passing side breaks symmetric head-on deadlocks.
          if (d < 0.95 && team(q) === team(s)) {
            const side = ix(s) < ix(q) ? 1 : -1;
            mx += (-dz / d) * w * 0.65 * side;
            mz += (dx / d) * w * 0.65 * side;
          }
        }
      }
      // v26: не толпиться колонной — товарищ впереди ближе 3,2 м: сбавить шаг и
      // уйти уступом в сторону (сторона у каждого своя)
      let slow = 1;
      if (b.mode !== "close" && b.mode !== "cqb-stack" && b.mode !== "cqb-entry") {
          const ox = mx, oz = mz, side = ix(s) % 2 ? 1 : -1;
          for (const q of nearby(c.pos, 3.2)) {
              if (q === s || !alive(q) || team(q) !== team(s))
                  continue;
              const dx = q.ctrl.pos.x - c.pos.x, dz = q.ctrl.pos.z - c.pos.z, d = Math.hypot(dx, dz);
              if (d < 0.6 || d > 3.2 || Math.abs(c.pos.y - q.ctrl.pos.y) > 0.9)
                  continue;
              const ahead = (dx * ox + dz * oz) / d;
              if (ahead < 0.55)
                  continue;
              const w = Math.min(1, (3.2 - d) / 2);
              // сбавлять шаг только за медленным/стоящим товарищем: за идущим
              // с той же скоростью — лишь уступом в сторону (не отставать от генерала)
              const qv = q.ctrl.vel, along = q.ctrl.aiWish ? (qv ? qv.x * ox + qv.z * oz : 1.5) : 0;
              if (along < 1.1)
                  slow = Math.min(slow, 1 - 0.5 * w * ahead);
              mx += -oz * 0.35 * w * side;
              mz += ox * 0.35 * w * side;
          }
      }
      const len = Math.max(1, Math.hypot(mx, mz));
      mx /= len;
      mz /= len;
      // v22: под огнём и после контакта — перебежки пригнувшись, а не
      // бег в полный рост; бег — только вне контакта и на длинных отрезках
      const contact = !!b.memory && t - (b.seenAt ?? -99) < 20;
      c.aiSprint =
        ((b.mode === "regroup" || b.sprint) && dist(c.pos, b.goal) > 13 && !contact) ||
        // v22: перебежка при обходе — бегом, пока не прижали огнём
        (b.mode === "flank" && b.sprint && dist(c.pos, b.goal) > 5);
      // v22: тормозить только перед настоящим поворотом — точки пути на прямой
      // идут через 0,3–1 м, и торможение «до точки» срезало скорость бега и
      // перебежек пригнувшись вдвое
      let Ls = L;
      if (surface) {
        const ux = (p.x - c.pos.x) / L,
          uz = (p.z - c.pos.z) / L;
        for (let i = Math.max(0, b.path.indexOf(p)); i + 1 < b.path.length && Ls < 1.2; i++) {
          const a = b.path[i],
            n = b.path[i + 1],
            sx = n.x - a.x,
            sz = n.z - a.z,
            sl = Math.hypot(sx, sz);
          if (sl < 1e-3) continue;
          if ((sx * ux + sz * uz) / sl < 0.82) break;
          Ls += sl;
        }
      }
      // Brake before tight corners rather than overshooting a portal at full speed.
      const speed =
        (surface ? Math.max(0.22, Math.min(1, Ls / 1.0)) : 1) * (b.speed || 1) * slow;
      b.wish.set(
        (mx * Math.cos(c.yaw) - mz * Math.sin(c.yaw)) * speed,
        (mx * Math.sin(c.yaw) + mz * Math.cos(c.yaw)) * speed,
      );
      c.aiWish = b.wish;
      if (b.mode !== "take-cover" && b.mode !== "cqb-entry")
        c.aiCrouch = contact && !c.aiSprint &&
          (b.suppression > 0.15 || b.los || dist(c.pos, b.goal) < 18 || b.mode === "flank" || b.mode === "bound" || b.mode === "investigate" || b.mode === "close" || b.mode === "reposition");
      // v22: перебежка при обходе — лицом по ходу движения (бег возможен только вперёд)
      if (!b.los || (b.mode === "flank" && b.holdFire)) s.idleYaw = Math.atan2(-mx, -mz);
      // v26: при входе в помещение — осматривать сектор ±30°
      if (!b.los && b.mode === "cqb-entry") s.idleYaw += Math.sin(t * 2.3 + ix(s)) * 0.55;
      if (dist(c.pos, b.prevPos) < 0.025) b.stuck += dt;
      else b.stuck = 0;
      Object.assign(b.prevPos, c.pos);
      if (b.stuck > 1.3) {
        b.pathAt = 0;
        b.path = [];
        b.stuck = 0;
        nav.cache.clear();
        nav.edgeCache.clear();
        // v22: третий раз упёрся за 12 с — другая точка приказа
        if (t - (b.stuckAt ?? -99) > 12) b.stuckN = 0;
        b.stuckAt = t;
        if (++b.stuckN >= 3 && s.order) {
          b.stuckN = 0;
          s.order.until = 0;
          if (s.tm) {
            s.tm.next = 0;
            s.tm.pauseUntil = 0;
          }
        }
      }
    }
    function drive(s: S, dt: number, t: number, a: S) {
      update(t, a);
      if (s === a || !alive(s)) {
        if (s === a) s.combatAim = null;
        return;
      }
      const c = s.ctrl,
        b = state(s, t);
      if (over()) {
        c.aiWish = null;
        c.aiADS = false;
        s.combatAim = null;
        return;
      }
      if (t >= b.next && tokens > 0) {
        // Off-screen or distant bots think at a lower rate.
        b.next =
          t + (s._lodI > 0.2 ? 0.55 : 0.23) + (ix(s) % 3) * 0.017;
        b.speed = 1;
        b.sprint = false;
        b.holdFire = false;
        perception(s, b, t);
        c.aiWish = null;
        c.aiSprint = false;
        c.aiProne = false;
        c.aiCrouch = false;
        tree.tick({ s, b, t, active: a });
        stats.decisions++;
      }
      c.aiADS = !!(
        (b.los || b.mode === "suppress" || b.mode === "cqb-entry") &&
        !b.holdFire &&
        !c.aiSprint &&
        b.memory &&
        !c.jam &&
        c.reload < 0 &&
        b.mode !== "medical-or-threat" &&
        (b.mode !== "take-cover" || !!b.coverFire)
      );
      if (b.mode === "medical-or-threat" || s.tmBusy > t) {
        c.aiADS = false;
        if (s.tmBusy > t) c.aiWish = null;
        return;
      }
      if (
        s.thr?.mode ||
        c.treating ||
        c.dragging ||
        (s.tac && t < s.tac.until && t >= (s.tac.delay || 0) && t < (s.tac.flinch ?? s.tac.until))
      ) {
        s.combatAim = null;
        return;
      }
      c.aiReady = b.memory ? 1 : 0.6;
      steer(s, b, dt, t);
      // v23: a target that moved off the spot where it was last seen is re-checked
      // (line of sight) before tracking, so a target that ducked behind cover is
      // not followed through the wall until the next perception tick.
      if (b.memory && b.target && b.los && alive(b.target) && t - b.seenAt < 0.45 && b.seenPos) {
        const q = b.target, qp = q.ctrl.pos, sp = b.seenPos;
        if (Math.abs(qp.x - sp.x) + Math.abs(qp.z - sp.z) > 0.5 || Math.abs(qp.y - sp.y) > 0.4) {
          const seen = los(c.pos, qp, eyeHeight(s), torsoHeight(q));
          if (seen) {
            sp.x = qp.x;
            sp.y = qp.y;
            sp.z = qp.z;
            b.seenAt = t;
          } else if (seen === false) b.los = false;
          else b.trackSkip = t;
        }
      }
      if (b.memory && b.target && b.los && alive(b.target) && t - b.seenAt < 0.45 && b.trackSkip !== t) {
        // Visible target: track it every frame (lead for flight time and a
        // short reaction lag) instead of a point seen up to 0.25 s ago, plus a
        // human aiming error that shrinks while the bot settles on the target
        // and grows with range, suppression and own movement.
        const q = b.target,
          qp = q.ctrl.pos,
          qv = q.ctrl.vel || { x: 0, z: 0 },
          d0 = dist(c.pos, qp),
          lead = d0 / 820 + 0.09;
        if (!b.aimErr || t >= b.aimErrAt) {
          const spread =
            0.1 + d0 * 0.0045 + b.suppression * 0.55 + Math.min(0.35, (c.speed || 0) * 0.08) + (c.shockK || 0) * 0.4;
          const ang = Math.random() * Math.PI * 2, rad = spread * Math.sqrt(Math.random());
          b.aimErr = { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.8 };
          b.aimErrAt = t + 0.7 + Math.random() * 0.8;
        }
        const settle = 1.9 - Math.min(1, Math.max(0, (t - (b.acquired || 0)) / 0.9));
        const px = -(qp.z - c.pos.z) / Math.max(0.1, d0),
          pz = (qp.x - c.pos.x) / Math.max(0.1, d0);
        b.memory = {
          x: qp.x + (qv.x || 0) * lead + px * b.aimErr.x * settle,
          y: qp.y + b.aimErr.y * settle,
          z: qp.z + (qv.z || 0) * lead + pz * b.aimErr.x * settle,
        };
      }
      if (b.mode === "flank" && b.holdFire)
        s.combatAim = null; // v22: бежит в обход, оружие не на цели
      else if (b.memory && b.target && b.los) {
        const d = dist(c.pos, b.memory),
          dx = b.memory.x - c.pos.x,
          dz = b.memory.z - c.pos.z;
        s.idleYaw = Math.atan2(-dx, -dz);
        s.combatAim = {
          pitch: Math.atan2(
            b.memory.y + (b.aimHeight || 1.25) - c.pos.y - eyeHeight(s),
            Math.max(0.1, d),
          ),
          target: b.target,
          // Keep the observed point immutable; do not track hidden target motion.
          point: {
            x: b.memory.x,
            y: b.memory.y + (b.aimHeight || 1.25),
            z: b.memory.z,
          },
        };
      } else if (b.mode === "suppress" && b.memory) {
        // v22: по последней точке, где видели противника
        const d = dist(c.pos, b.memory),
          dx = b.memory.x - c.pos.x,
          dz = b.memory.z - c.pos.z;
        s.idleYaw = Math.atan2(-dx, -dz);
        s.combatAim = {
          pitch: Math.atan2(b.memory.y + (b.aimHeight || 1.0) - c.pos.y - eyeHeight(s), Math.max(0.1, d)),
          target: null,
          suppress: true,
          point: { x: b.memory.x, y: b.memory.y + (b.aimHeight || 1.0), z: b.memory.z },
        } as any;
      } else s.combatAim = null;
    }
    let fireStart = 0;
    function fire(t: number) {
      if (over()) return;
      let shots = 0;
      const n = squad.length;
      fireStart = (fireStart + 1) % n;
      for (let k = 0; k < n; k++) {
        const s = squad[(k + fireStart) % n];
        if (shots >= 6) break; // cap simultaneous bot shots (FX/audio load) per frame
        const b = s.battle,
          c = s.ctrl;
        // v22: огонь на подавление по последней точке — без видимости цели
        const supp = !!(b && !b.los && b.mode === "suppress" && (s.combatAim as any)?.suppress && t - b.seenAt < 4);
        if (
          s === active ||
          !alive(s) ||
          (!b?.los && !supp) ||
          !s.combatAim ||
          b.holdFire ||
          (!supp && t - b.seenAt > 0.35) ||
          t < b.shotAt ||
          t - b.acquired < 0.3 + b.suppression * 0.5 ||
          !s.gun ||
          c.treating ||
          c.reload >= 0 ||
          s.tmBusy > t ||
          s.thr?.mode
        )
          continue;
        const q = b.target;
        if (!supp && (!q || !alive(q))) continue;
        const dx = b.memory.x - c.pos.x,
          dz = b.memory.z - c.pos.z,
          L2 = dx * dx + dz * dz;
        if (L2 < 0.1) continue;
        const yaw = Math.atan2(-dx, -dz),
          error = Math.atan2(Math.sin(yaw - c.yaw), Math.cos(yaw - c.yaw));
        // Fire only once the muzzle is on the target's silhouette (≈0.4 m), not within 3°.
        if (Math.abs(error) > (supp ? 0.06 : Math.max(0.006, Math.min(0.05, 0.4 / Math.sqrt(L2))) + b.suppression * 0.012)) continue;
        let blocked = false;
        for (const a of teamOf(team(s))) {
          if (a === s || !alive(a)) continue;
          const ax = a.ctrl.pos.x - c.pos.x,
            az = a.ctrl.pos.z - c.pos.z,
            u = (ax * dx + az * dz) / L2;
          const lineY =
            c.pos.y +
            eyeHeight(s) +
            u * (b.memory.y + (b.aimHeight || 1.25) - c.pos.y - eyeHeight(s));
          if (
            u > 0 &&
            u < 1 &&
            Math.hypot(ax - u * dx, az - u * dz) < 0.85 &&
            lineY > a.ctrl.pos.y - 0.1 &&
            lineY < a.ctrl.pos.y + eyeHeight(a) + 0.2
          ) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          stats.friendlyBlocks++;
          continue;
        }
        const seen = supp ? true : los(c.pos, q.ctrl.pos, eyeHeight(s), torsoHeight(q));
        if (seen !== true) {
          if (seen === false) b.los = false;
          continue;
        }
        if (s.gun.gun && typeof c.ads === "number") {
          const range = Math.sqrt(L2);
          // Close hip fire is allowed, but never fire a lowered retreating gun.
          if ((range > 6 && (!c.aiADS || c.ads < 0.8)) || (c.ready ?? 0) < 0.85)
            continue;
        }
        if (c.canFire()) {
          c.fire(t);
          stats.shots++;
          shots++;
          b.burst++;
          b.lastShotT = t;
          // v22: прикрывая обход — очереди чаще; на подавление — реже, экономно
          const cover_ = (b.suppressFor || 0) > t,
            pause = supp ? 1.0 + Math.random() * 0.6 : cover_ ? 0.32 + b.suppression * 0.4 : 0.65 + b.suppression * 0.7;
          b.shotAt =
            t +
            (b.burst >= 3
              ? pause
              : 0.14 + (ix(s) % 3) * 0.025);
          if (b.burst >= 3) b.burst = 0;
          hear(c.pos, s, t, 65);
        } else if (c.ammo <= 0 && c.reserve > 0) c.startReload();
      }
    }
    function hear(p: P, source: S, t: number, radius = 55) {
      for (const s of teamOf(foe(team(source)))) {
        if (s === source || !alive(s) || dist(s.ctrl.pos, p) > radius) continue;
        const b = state(s, t);
        if (t - b.seenAt < 1) continue;
        const seed = ix(s) * 2.399;
        b.memory = {
          x: p.x + Math.cos(seed) * 3,
          y: p.y,
          z: p.z + Math.sin(seed) * 3,
        };
        b.seenAt = t - 2;
        s.idleYaw = Math.atan2(-(p.x - s.ctrl.pos.x), -(p.z - s.ctrl.pos.z));
        stats.hearing++;
      }
    }
    return {
      drive,
      fire,
      update,
      hear,
      stats: () => ({
        ...stats,
        paths: nav.completed,
        expanded: nav.expanded,
        queued: nav.jobs.length,
        cachedNav: nav.cache.size,
        navigation: (globalThis as any).GNavigation?.get(world)?.stats() || {
          backend: "grid-fallback",
        },
        modes: squad.map((s: S) => ({
          key: s.key,
          mode: s.battle?.mode,
          role: s.battle?.role,
        })),
      }),
      debug: { nav, tree },
    };
  }
  export const test = { Heap, Status, Sequence, Selector, Action, Navigation };
}
(globalThis as any).GCombat = AegisCombat;
