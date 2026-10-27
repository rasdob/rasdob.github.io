# Astribot S1 model

Copyright 2025 Astribot. Distributed under Apache License 2.0; see LICENSE.txt.
Upstream: https://github.com/Astribot-Dev/astribot_descriptions

This viewer uses the same geometry and textures used to author the paper's Blender scene: 2026_dobvs_paper/data/visual_model/robot_meshes.npz, scene.json, textures/*.png. Material settings follow 2026_dobvs_paper/scripts/render_visual_model.py: neutral white shell, graphite mechanisms, original textured exterior panels. These local inputs derive from the licensed Astribot model.

Changes: binary conversion with original face-corner UV seams preserved; V flipped once exactly as in the paper's Blender script; 35-degree sharp-edge normals; moderate decimation of non-textured wheels and torso supports only. Textured meshes and the four PNG files remain at their original geometry/image resolution. PNG files are copied byte-for-byte. The root yaw and home pose are for interactive presentation. Link origins, joint axes, limits and wrist-camera mounting transform retain source MJCF kinematics.

This is a realtime WebGL rendering of the paper's authoring assets, not a live Blender/Cycles renderer. Lighting, reflections and color management differ from the publication render. The camera enclosure and target marker are illustrative additions. Position IK drives the visual wrist from the planar teaching simulator; it adds no full-body dynamics or hardware commands.
