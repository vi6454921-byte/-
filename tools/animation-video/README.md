# Animation overview capture

The overview uses the actual game's models, animator, weapon tracks/contact solver and Rapier modules in an isolated, flat study scene. It is not an invented animation or a rendered contact sheet.

- Simulation: 60 Hz; actual captured frames: 24 fps, no synthesized in-between frames.
- 3D renderer: 640×360; readable caption composition: 960×540. Silent MP4.
- 35 chapters; complete index: `docs/ANIMATION_VIDEO_CHAPTERS_V11.md`.
- Captions distinguish CMU-derived motion from procedural animation and physics.
- The overview shows animation families and representative weapons, not every loadout/injury/attachment permutation.

Developer reproduction (game server running on port 8774 by default):

```
node tools/animation-video/capture-v11.cjs
python3 tools/animation-video/encode-v11.py /data/animation-v11-frames
```

Requires Node with Playwright, Chromium, Python and FFmpeg in the development environment. `CHROMIUM_PATH`, `BASE_URL` and `OUTPUT` can be supplied. `INDICES=25` selects a chapter; `PREVIEW=1` renders a single diagnostic sample (not a video). For partial corrections, merge the updated chapter folder into the full 35-chapter manifest before encoding. Raw frames are temporary and excluded from the release ZIP; the final MP4, chapter manifest and encoding script are included.
