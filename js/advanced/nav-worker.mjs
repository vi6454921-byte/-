// Dedicated build-only worker. Termination also releases the Recast build heap.
import * as C from "../../vendor/recast/core.mjs";
import { generateTiledNavMesh } from "../../vendor/recast/generators.mjs";
self.onmessage = async ({ data }) => {
  try {
    await C.init();
    const at = performance.now();
    const result = generateTiledNavMesh(
      data.positions,
      data.indices,
      data.config,
    );
    if (!result.success)
      throw new Error(result.error || "Recast generation failed");
    // Upstream tiled generator can return success with failed/missing tiles.
    // Never silently publish such a mesh.
    const errors = result.intermediates.buildContext.logs.filter(
      (x) =>
        x.category === C.Recast.RC_LOG_ERROR ||
        /Failed to add tile/.test(x.msg),
    );
    if (errors.length) {
      result.navMesh.destroy();
      throw new Error(
        errors
          .slice(0, 8)
          .map((x) => x.msg)
          .join("\n"),
      );
    }
    const bytes = C.exportNavMesh(result.navMesh);
    result.navMesh.destroy();
    self.postMessage({ ok: true, bytes, buildMs: performance.now() - at }, [
      bytes.buffer,
    ]);
  } catch (e) {
    self.postMessage({ ok: false, error: String(e?.stack || e) });
  }
};
