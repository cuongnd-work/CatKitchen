CatSkin Shader
==============

Engine Compatibility
--------------------
- `package.json` shows the project targets Cocos Creator `3.8.7`; the shader relies on the legacy pipeline helpers bundled with this version (`legacy/main-functions/general-vs` and `legacy/output`).
- Open the project using Creator 3.8.7 (`CocosCreator --project .`) so the editor can correctly re-import the shader and supply the expected uniform bindings.

Effect Breakdown
----------------
- Vertex stage: delegated to `legacy/main-functions/general-vs:vert`, which injects transforms, skinning, instancing, and passes `v_uv`.
- Fragment stage (`cat-skin-fs`):
  - Retrieves per-material data from the `Material` uniform block (`set = 2, binding = 0`), matching Creator 3.8’s descriptor layout.
  - Applies optional UV symmetry, procedural noise tinting, and texture modulation based on toggle properties.
  - Outputs color through `CCFragOutput`, preserving the render pipeline setup (alpha blending on, depth write defaults from pass).

Material Properties
-------------------
- `SkinColor`: Base tint for the fur/skin (color picker).
- `NoiseColor`: Alternate color used when `NoiseToggle` > 0.5.
- `NoiseScaleX / NoiseScaleY`: Frequency for the pseudo-random noise sampling.
- `NoiseOffsetX / NoiseOffsetY`: Scroll offsets for the noise pattern.
- `NoiseToggle`: Enable (>0.5) procedural noise mixing.
- `TextureToggle`: Enable (>0.5) modulation by `Texture2D`.
- `SymetryToggle`: When >0.5, mirror the UV horizontally to reuse half-face textures.
- `Texture2D`: Optional texture mask (defaults to `white`).

Validation Steps
----------------
1. Assign the `CatSkin` effect to a material, tweak the properties, and preview in the simulator (`Ctrl+P`).
2. Ensure toggles are 0 or 1; intermediate values smoothly interpolate (e.g., `TextureToggle = 0.5` blends half of the sampled texture).
3. Verify alpha blending by enabling/disable the texture/noise and checking the render order in-scene.
4. Rebuild for Web (`CocosCreator --project . --build "platform=html5;debug=false"`) once satisfied so the updated shader ships with the playable bundle.
