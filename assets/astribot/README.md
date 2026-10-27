# Astribot S1 — web LOD of paper Blender assets

This local viewer uses the robot geometry, original textures and material definitions used to author the paper's Blender scene:

- Geometry and face-corner UVs: `2026_dobvs_paper/data/visual_model/robot_meshes.npz`
- Appearance assignments: `2026_dobvs_paper/data/visual_model/scene.json`
- Neutral shell, graphite mechanism and textured surface materials: `2026_dobvs_paper/scripts/render_visual_model.py`
- The four original PNG textures: `2026_dobvs_paper/data/visual_model/textures/`

The robot includes the mobile base, torso, head, both seven-joint arms and grippers. Its motion chain and wrist-camera mounting remain those of the Astribot S1 MJCF. The exporter checks every source vertex and triangle against the paper geometry before attaching it to that chain.

Upstream: https://github.com/Astribot-Dev/astribot_descriptions

Copyright 2025 Astribot; Apache License 2.0. See `LICENSE.txt` and `ATTRIBUTION.md`.

## Local asset format

`model.json` has `format: 3`, `storageVertexBytes: 16` and `vertexStride: 11`. The gzip transport stores each vertex as three unsigned 16-bit position components, three signed 16-bit normal components and two unsigned 16-bit UV components. Positions and UVs use bounds stored per mesh. Constant material colors are stored once per mesh. Uint16 triangle indices are unchanged.

The browser expands these values into the existing 11-float WebGL layout: position (3), normal (3), material color (3), UV (2). Each part has at most 65,535 vertices. Geometry/body transforms, joint axes, limits and wrist-camera mounting are unchanged.

Dense surfaces were retriangulated within UV and normal seams, retaining source vertices before transport quantization. This second compression keeps all 279,660 triangles and all four original PNG textures. Maximum position error from quantization is 6.78 micrometers, normal angular error is below 0.00151 degrees, and UV error is below 0.00000764. Four offline views have silhouette IoU at least 0.999986 compared with the previous web model. Original Blender/paper inputs remain unchanged.

Geometry download size is **4.52 MB**, down from **7.69 MB**. Including textures and metadata, model resources total about **5.97 MB**, down from **9.12 MB**. Gzip expands to 6.46 MB of compact transport, then 14.82 MB of GPU vertex/index data. This reduces transfer size; it does not reduce triangle count or GPU buffer size. The browser uses native `DecompressionStream`, followed by the local `model-codec.mjs` decoder. No CDN or new dependency is required.

`byteLength` and `sha256` describe the compact transport after gzip decompression. `decodedByteLength` and `decodedSha256` describe the expanded WebGL buffer. `downloadBytes` describes the gzip file. Its URL includes the transport content hash to avoid combining stale geometry with new metadata. The decoder also supports earlier format 2 assets.

UV V is flipped once, matching the paper's Blender script. Texture upload uses `UNPACK_FLIP_Y_WEBGL=true`; the decoder must not flip UV again. PNGs are copied byte-for-byte. Browsers without WebGL or gzip decoding use the existing photo fallback; numerical simulation remains available.

Recreate from the repository root:

```bash
.venv/bin/python sites/ra-sdob-explained/scripts/export_astribot_model.py
```

The exporter uses existing MuJoCo, NumPy, SciPy and VTK installations. It does not require or launch Blender. The exporter checks every retained textured position/UV pair against the source. Tests check original texture hashes, compact-format decoding and invalid inputs, expanded geometry hashes, gzip loading and corruption handling, finite normals, joint kinematics and screen framing. `scripts/check_astribot_lod.py` provides a separate CPU-rendered before/after review from four views using Open3D. This is an offline asset comparison, not a browser screenshot.

## Rendering and motion

This is realtime WebGL rendering of the paper's authoring assets. It does not run Blender/Cycles. Publication lighting, reflections and AgX color management are therefore not reproduced exactly.

The planar teaching simulator drives position-only inverse kinematics of the right arm. This visual linkage does not replace the simulator with seven-joint dynamics, impose wrist orientation, test self-collision, or produce hardware commands. The target plane is 0.58 m ahead of the initial wrist camera. Positive vertical offsets follow the simulator's image-down convention.

Drag to orbit. Focus the canvas and use the scroll wheel or `+`/`-` to zoom. Arrow keys orbit; `0`, double-click or the reset button restores the view.
