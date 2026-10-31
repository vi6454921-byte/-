/** Geometry-local BVH: exact triangle intersections, unchanged indices/material groups.
 * Only immutable static single-material geometry is accelerated.
 * Material arrays retain the original raycast: upstream indirect mode collapses group roots. Cloth/skinned/morph geometry uses Three's original path. */
namespace AegisGeometry {
  const root: any = globalThis,
    T: any = root.THREE,
    B: any = root.MeshBVHLib;
  const original = T.Mesh.prototype.raycast,
    built = new WeakSet<any>();
  export const config = { enabled: true };
  const counters = { geometries: 0, triangles: 0, buildMs: 0, failures: 0 };
  if (B)
    T.Mesh.prototype.raycast = function (ray: any, hits: any[]) {
      if (
        config.enabled &&
        !Array.isArray(this.material) &&
        this.geometry?.boundsTree
      )
        B.acceleratedRaycast.call(this, ray, hits);
      else original.call(this, ray, hits);
    };
  export function prepare(mesh: any) {
    const g = mesh.geometry;
    if (
      !config.enabled ||
      !B ||
      !g ||
      Array.isArray(mesh.material) ||
      built.has(g) ||
      mesh.isSkinnedMesh ||
      g.attributes.skinIndex ||
      g.morphAttributes.position?.length ||
      mesh.userData?.noBVH ||
      /flag|cloth|sail/i.test(mesh.name || "")
    )
      return;
    const triangles = (g.index?.count || g.attributes.position?.count || 0) / 3;
    if (triangles < 64) return;
    const before = performance.now();
    try {
      // Indirect mode preserves triangle/face IDs used by decals, materials and hit logic.
      g.boundsTree = new B.MeshBVH(g, {
        indirect: true,
        strategy: B.CENTER,
        maxLeafTris: 8,
        verbose: false,
      });
      built.add(g);
      counters.geometries++;
      counters.triangles += triangles;
    } catch (e) {
      counters.failures++;
      built.add(g);
      console.warn("Static BVH fallback", mesh.name, e);
    }
    counters.buildMs += performance.now() - before;
  }
  export const stats = () => ({
    ...counters,
    backend: B ? "three-mesh-bvh 0.9.2" : "Three fallback",
    enabled: config.enabled,
  });
}
(globalThis as any).GGeometry = AegisGeometry;
