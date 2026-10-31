# Environment extraction

The TypeScript AST dependency-closure extractor takes the original JS modules extracted from the three supplied standalone HTML files. It outputs only environment builders and records selected/skipped declarations. No source page is embedded at runtime. Build is a development step, not a runtime dependency.

```
node build.cjs /path/to/extracted-js
```

Requires Node and TypeScript. Source filenames: forest_map_camp.js, stroyka_zarechye_v2.js, angar_map.js. The original standalone games are not shipped in the runtime folder. A declaration named artillery is static prop geometry, not an artillery-strike system.
