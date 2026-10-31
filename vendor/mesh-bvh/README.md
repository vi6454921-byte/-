# three-mesh-bvh 0.9.2 (MIT)

`upstream.umd.cjs` is the unmodified npm package `build/index.umd.cjs`; `LICENSE` and `package.json` are from that package. `mesh-bvh.js` is the minified browser UMD with the same global `MeshBVHLib`, external global `THREE`. No CDN is needed. `provenance.json` records SHA-256 hashes and source tarball URL.

Reproduce from this directory with esbuild installed:

```sh
esbuild upstream.umd.cjs --minify --outfile=mesh-bvh.js
```

The game integration lives in `src/advanced/geometry.ts`. Indirect indexing keeps original face IDs. Material arrays intentionally use Three's original raycast: in this upstream version indirect mode uses one root and can otherwise assign the wrong group material. Skinned/morph/cloth geometry is not built. For geometry edited in place, clear its tree / rebuild or mark `userData.noBVH` before indexing. Whole-object transforms remain supported by the geometry-local BVH; GTrace's world broadphase still requires static scene objects.
