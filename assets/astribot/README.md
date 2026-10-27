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

`model.json` has `format: 2` and `vertexStride: 11`. `model.bin.gz` is a losslessly gzip-compressed buffer of 11 little-endian floats per vertex: position (3), normal (3), material colour (3), UV (2). Every part has at most 65,535 vertices and local Uint16 triangle indices; a source mesh may be split into several parts. Each `geom` references one part and keeps the source body/geometry transform.

The mesh entries include a relative `texture` path or null, and material `metallic`/`roughness`. Textured vertices have a white colour multiplier. UV seams and 35-degree hard normal edges are preserved. The UV V coordinate is flipped once, matching the paper's Blender script. The browser uploads PNGs with `UNPACK_FLIP_Y_WEBGL=true` to match image orientation; it must not flip the UV a second time.

The four texture files are copied byte-for-byte. Dense surfaces are retriangulated with topology-preserving vertex deletion inside UV and normal seams. Retained vertices keep source positions, UVs and smooth normals. Small head/wrist/gripper meshes remain intact; the head receives a larger detail budget. Original Blender/paper inputs remain unchanged.

The result contains 279,660 unique-mesh triangles, down from 1,054,813. The decoded geometry is 14.82 MB, delivered as a 7.69 MB gzip file. Including original textures and metadata, model resources total about 9.1 MB instead of 50.7 MB. The browser uses native `DecompressionStream` before GPU upload and validates both download and decoded sizes. Browsers without the decoder use the existing photo fallback; the numerical simulation remains available. All files load locally; no CDN is required.

`byteLength` and `sha256` describe the decoded buffer; `downloadBytes` describes the compressed file. The binary URL includes a content hash to avoid combining stale geometry with new metadata.

Recreate from the repository root:

```bash
.venv/bin/python sites/ra-sdob-explained/scripts/export_astribot_model.py
```

The exporter uses existing MuJoCo, NumPy, SciPy and VTK installations. It does not require or launch Blender. The exporter checks every retained textured position/UV pair against the source. Tests check original texture hashes, packed LOD geometry, gzip loading and corruption handling, finite normals, joint kinematics and screen framing. `scripts/check_astribot_lod.py` provides a separate CPU-rendered before/after review from four views using Open3D. This is an offline asset comparison, not a browser screenshot.

## Rendering and motion

This is realtime WebGL rendering of the paper's authoring assets. It does not run Blender/Cycles. Publication lighting, reflections and AgX color management are therefore not reproduced exactly.

The planar teaching simulator drives position-only inverse kinematics of the right arm. This visual linkage does not replace the simulator with seven-joint dynamics, impose wrist orientation, test self-collision, or produce hardware commands. The target plane is 0.58 m ahead of the initial wrist camera. Positive vertical offsets follow the simulator's image-down convention.

Drag to orbit. Focus the canvas and use the scroll wheel or `+`/`-` to zoom. Arrow keys orbit; `0`, double-click or the reset button restores the view.
