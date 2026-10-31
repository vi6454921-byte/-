# CMU motion capture data — AEGIS locomotion v9

The data used in this project was obtained from mocap.cs.cmu.edu.
The database was created with funding from NSF EIA-0196217.

Source: http://mocap.cs.cmu.edu/

The CMU website states:
> This data is free for use in research projects. You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form.

The capture database, calibrated skeletons and original performances are CMU's work, not original AEGIS animation capture. The ASF/AMC parser, phase extraction and runtime adaptation in this release were implemented for this project. This distribution includes the source recordings as a component of the game/reproducible build, not as a separate dataset product. Preserve these credits and the source usage conditions.

## Recordings

- Walk: 35_01, 35_02, 35_03, 16_15, 16_16, 07_01, 07_02.
- Jog: 16_35, 16_36.
- Run: 35_17, 35_18, 35_19, 09_01, 09_02.

Original ASF skeletons for subjects 35, 16, 07 and 09 and AMC files are in `tools/mocap/source/`. URLs and SHA-256 checksums for every motion recording are in `tools/mocap/manifest.json`. AMC sampling is 120 Hz. ASF lengths are converted using 0.0254 / 0.45 metres per ASF unit; this conversion is not a game-world scaling guess.

## Adaptation

Forward kinematics evaluates each calibrated ASF axis/DOF in its parent space. Measured travel establishes forward/lateral directions. Complete right-contact cycles are extracted, aligned to loading, normalized by leg length, smoothed and averaged. The delivered tables contain 14 walking, 2 jogging and 3 running cycles accepted from 14 source recordings. Each of the 3 gait families has 16 channels with 96 phase samples.

Contact timing is estimated from ankle height and world velocity, with bounded stance intervals; these are kinematic estimates, not force-plate contact annotations.

The game uses derived ankle swing/clearance/roll, pelvis motion, torso pitch/twist and unarmed shoulder/elbow channels, not direct playback of the original ASF skeleton. The controller still owns root translation/yaw; world-space support locks and analytic IK adapt the curves to AEGIS proportions and terrain. Backward/sideways movement, crouch, crawl, vaults, stops and turn-in-place are procedural adaptations/constraints, not newly recorded CMU clips for those actions. Weapon grips are preserved by the existing weapon/hand IK chain.

The runtime is offline and reads `js/advanced/gait-data.js`. It never downloads motion data. To regenerate the tables from the included sources, run `python3 tools/mocap/build-gaits.py` with NumPy installed. Gameplay requires neither NumPy nor the converter.
