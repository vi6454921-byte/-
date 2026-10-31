"use strict";
/** Recast/Detour navigation built from the SAME static geometry as Rapier.
 * Construction is off-thread; queries are bounded and all WASM arrays freed.
 * No artificial links/teleports between disconnected or stacked surfaces. */
var AegisNavigation;
(function (AegisNavigation) {
    const root = globalThis;
    let core = root.GRecastCore;
    AegisNavigation.ready = root.document
        ? import(new URL("vendor/recast/core.mjs", root.document.baseURI).href).then(async (c) => {
            core = c;
            await c.init();
        })
        : Promise.resolve();
    const states = new WeakMap();
    let latest = null;
    const cp = (p) => ({ x: p.x, y: p.y, z: p.z });
    const xz = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const config = {
        tileSize: 96,
        cs: 0.18,
        ch: 0.06,
        walkableSlopeAngle: 45,
        walkableHeight: 30,
        walkableClimb: 5,
        walkableRadius: 2,
        maxEdgeLen: 64,
        maxSimplificationError: 0.65,
        minRegionArea: 2,
        mergeRegionArea: 12,
        maxVertsPerPoly: 6,
        detailSampleDist: 4,
        detailSampleMaxError: 1,
    };
    function get(world) {
        return states.get(world) || null;
    }
    AegisNavigation.get = get;
    function stats() {
        return latest?.stats() || { ready: false };
    }
    AegisNavigation.stats = stats;
    async function prepare(world) {
        await AegisNavigation.ready;
        if (!core)
            throw new Error("Recast backend not initialized");
        let s = states.get(world);
        if (!s) {
            s = new Surface(world);
            states.set(world, s);
            latest = s;
        }
        await s.rebuild();
        return s;
    }
    AegisNavigation.prepare = prepare;
    // Test/CLI backend injection, not a fallback pretending to be Recast.
    function backend(c) {
        core = c;
    }
    AegisNavigation.backend = backend;
    class Surface {
        constructor(world) {
            this.world = world;
            this.mesh = null;
            this.query = null;
            this.building = null;
            this.revision = -1;
            this.generation = 0;
            this.lastCheck = -Infinity;
            this.retryAt = -Infinity;
            this.count = {
                queries: 0,
                complete: 0,
                projected: 0,
                partial: 0,
                unreachable: 0,
                builds: 0,
                buildMs: 0,
                triangles: 0,
                bytes: 0,
                errors: 0,
                tiles: 0,
                polygons: 0,
            };
            this.lastError = "";
            this.disposed = false;
        }
        stats() {
            return {
                ready: !!this.query,
                maxNodes: 32768,
                building: !!this.building,
                generation: this.generation,
                revision: this.revision,
                ...this.count,
                lastError: this.lastError,
            };
        }
        async rebuild() {
            if (this.building)
                return this.building;
            this.building = (async () => {
                const physics = root.GPhysics.get(this.world), revision = physics.navRevision || 0;
                const g = physics.navigationGeometry();
                let minY = Infinity, maxY = -Infinity;
                for (let i = 1; i < g.positions.length; i += 3) {
                    minY = Math.min(minY, g.positions[i]);
                    maxY = Math.max(maxY, g.positions[i]);
                }
                const b = this.world.navBounds || this.world.bounds || { x0: -60, x1: 60, z0: -65, z1: 65 };
                const buildConfig = {
                    ...config,
                    bounds: [
                        [b.x0, minY - 0.12, b.z0],
                        [b.x1, maxY + 2, b.z1],
                    ],
                };
                let result;
                if (root.Worker && root.document) {
                    const worker = new Worker(new URL("js/advanced/nav-worker.mjs", root.document.baseURI), { type: "module" });
                    result = await new Promise((resolve, reject) => {
                        const timer = setTimeout(() => {
                            worker.terminate();
                            reject(new Error("Recast build timeout"));
                        }, 90000);
                        worker.onmessage = ({ data }) => {
                            clearTimeout(timer);
                            worker.terminate();
                            data.ok ? resolve(data) : reject(new Error(data.error));
                        };
                        worker.onerror = (e) => {
                            clearTimeout(timer);
                            worker.terminate();
                            reject(new Error(e.message));
                        };
                        worker.postMessage({
                            positions: g.positions,
                            indices: g.indices,
                            config: buildConfig,
                        }, [g.positions.buffer, g.indices.buffer]);
                    });
                }
                else {
                    // CLI tests supply a generator; the game always uses its local worker.
                    if (!root.GRecastGenerate)
                        throw new Error("No Recast build worker");
                    const at = performance.now(), r = root.GRecastGenerate(g.positions, g.indices, buildConfig);
                    if (!r.success)
                        throw new Error(r.error);
                    result = {
                        bytes: core.exportNavMesh(r.navMesh),
                        buildMs: performance.now() - at,
                    };
                    r.navMesh.destroy();
                }
                if (this.disposed)
                    return;
                const next = core.importNavMesh(result.bytes).navMesh;
                const query = new core.NavMeshQuery(next, { maxNodes: 32768 });
                const old = this.query, oldMesh = this.mesh;
                let tiles = 0, polygons = 0;
                for (let i = 0; i < next.getMaxTiles(); i++) {
                    const header = next.getTile(i).header();
                    if (header) {
                        tiles++;
                        polygons += header.polyCount();
                    }
                }
                this.count.tiles = tiles;
                this.count.polygons = polygons;
                this.mesh = next;
                this.query = query;
                this.generation++;
                this.revision = revision;
                if (old) {
                    old.destroy();
                    core.Raw.destroy(old.defaultFilter.raw);
                }
                oldMesh?.destroy();
                this.count.builds++;
                this.count.buildMs = result.buildMs;
                this.count.bytes = result.bytes.length;
                this.count.triangles = g.triangles;
                this.lastError = "";
            })();
            try {
                await this.building;
            }
            catch (e) {
                this.count.errors++;
                this.lastError = String(e);
                throw e;
            }
            finally {
                this.building = null;
            }
        }
        tick(t) {
            if (this.disposed || t < this.lastCheck + 0.5)
                return;
            this.lastCheck = t;
            const physics = root.GPhysics.get(this.world);
            if ((physics.navRevision || 0) !== this.revision &&
                !this.building &&
                t >= this.retryAt) {
                this.retryAt = t + 3;
                this.rebuild().catch((e) => console.warn("navmesh rebuild:", e));
            }
        }
        nearest(p, radius = 1.2, vertical = 0.5) {
            if (!this.query || ![p.x, p.y, p.z].every(Number.isFinite))
                return null;
            const n = this.query.findNearestPoly(p, {
                halfExtents: { x: radius, y: vertical, z: radius },
            });
            if (!n.success ||
                !n.nearestRef ||
                xz(p, n.nearestPoint) > radius ||
                Math.abs(p.y - n.nearestPoint.y) > vertical)
                return null;
            return { ref: n.nearestRef, point: cp(n.nearestPoint) };
        }
        clear(a, b) {
            if (!this.query)
                return false;
            const start = this.nearest(a, 0.18, 0.22), end = this.nearest(b, 0.18, 0.22);
            if (!start || !end)
                return false;
            const hit = this.query.raycast(start.ref, start.point, end.point);
            if (!hit.success || hit.t < 0.9999)
                return false;
            // Detour raycast intentionally ignores end.y; never shortcut another floor.
            const poly = hit.path[hit.path.length - 1] || start.ref;
            const last = this.query.closestPointOnPoly(poly, end.point);
            return (!!last.success &&
                xz(last.closestPoint, end.point) < 0.12 &&
                Math.abs(last.closestPoint.y - end.point.y) < 0.18);
        }
        plan(a, b) {
            this.count.queries++;
            const fail = () => {
                this.count.unreachable++;
                return {
                    path: [],
                    state: "unreachable",
                    generation: this.generation,
                };
            };
            const start = this.nearest(a, 1.2, 0.5), end = this.nearest(b, 1.5, 0.5);
            if (!start || !end)
                return fail();
            // A start connector cannot pull an actor through a wall or onto a balcony.
            if (xz(a, start.point) > 0.12 && !this.connector(a, start.point))
                return fail();
            let corridor = null, straight = null;
            try {
                corridor = this.query.findPath(start.ref, end.ref, start.point, end.point, { maxPathPolys: 1024 });
                if (!corridor.success || !corridor.polys.size)
                    return fail();
                const last = corridor.polys.get(corridor.polys.size - 1), reached = last === end.ref;
                const finish = reached
                    ? end.point
                    : this.query.closestPointOnPoly(last, end.point).closestPoint;
                if (!finish)
                    return fail();
                straight = this.query.findStraightPath(start.point, finish, corridor.polys, { maxStraightPathPoints: 1024, straightPathOptions: 2 });
                if (!straight.success || !straight.straightPathCount)
                    return fail();
                const path = [];
                for (let i = 0; i < straight.straightPathCount; i++) {
                    const p = {
                        x: straight.straightPath.get(3 * i),
                        y: straight.straightPath.get(3 * i + 1),
                        z: straight.straightPath.get(3 * i + 2),
                    };
                    if (![p.x, p.y, p.z].every(Number.isFinite))
                        return fail();
                    if (path.length || xz(a, p) > 0.12 || Math.abs(a.y - p.y) > 0.2)
                        path.push(p);
                }
                const exact = reached &&
                    xz(b, end.point) < 0.18 &&
                    Math.abs(b.y - end.point.y) < 0.2;
                if (!path.length)
                    path.push(cp(finish));
                const delivered = path[path.length - 1];
                const atEnd = xz(delivered, finish) < 0.08 &&
                    Math.abs(delivered.y - finish.y) < 0.15;
                const state = reached && atEnd ? (exact ? "complete" : "projected") : "partial";
                const reason = core.statusDetail(corridor.status, core.Detour.DT_OUT_OF_NODES)
                    ? "node-budget"
                    : !atEnd ||
                        core.statusDetail(corridor.status, core.Detour.DT_BUFFER_TOO_SMALL)
                        ? "path-capacity"
                        : reached
                            ? "connected"
                            : "disconnected";
                if (!reached && xz(a, finish) < 0.3 && Math.abs(a.y - finish.y) < 0.3)
                    return fail();
                this.count[state]++;
                return {
                    path,
                    state,
                    generation: this.generation,
                    endpoint: cp(delivered),
                    reason,
                    status: corridor.status,
                };
            }
            finally {
                corridor?.polys?.destroy();
                if (straight) {
                    straight.straightPath.destroy();
                    straight.straightPathFlags.destroy();
                    straight.straightPathRefs.destroy();
                }
            }
        }
        connector(a, b) {
            const ph = root.GPhysics.get(this.world), n = Math.max(1, Math.ceil(xz(a, b) / 0.15));
            for (let i = 0; i <= n; i++) {
                const u = i / n, p = {
                    x: a.x + (b.x - a.x) * u,
                    y: a.y + (b.y - a.y) * u + 0.025,
                    z: a.z + (b.z - a.z) * u,
                };
                if (!ph.fits(null, p, 1.72, 0.315))
                    return false;
            }
            return true;
        }
        dispose() {
            this.disposed = true;
            if (this.query) {
                this.query.destroy();
                core.Raw.destroy(this.query.defaultFilter.raw);
                this.query = null;
            }
            this.mesh?.destroy();
            this.mesh = null;
            states.delete(this.world);
        }
    }
    AegisNavigation.Surface = Surface;
})(AegisNavigation || (AegisNavigation = {}));
globalThis.GNavigation = AegisNavigation;
