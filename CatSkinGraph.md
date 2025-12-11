CatSkinGraph Shader (Rebuilt)
=============================

What changed
------------
- `assets/3D/shaders/CatSkinGraph.effect` is now a clean, self-contained implementation: custom vertex (`catSkinGraphVS`) emits UV0, local position, and a world-space normal; fragment (`catSkinGraphFS`) reproduces the ShaderGraph’s procedural noise, symmetry mirroring, and two-step lighting ramp.
- Uniforms are declared exactly like the pass properties (no manual packing), so Creator 3.8.7 can serialize the effect without logging “Read effect json file in library failed”.

Material Inputs
---------------
- `SkinColor`, `NoiseColor`: primary palette; noise mode interpolates between them with a `step(0.4, noise)`.
- `NoiseScaleX/Y`, `NoiseOffsetX/Y`: frequency and offset for the gradient noise, operating on the mesh’s local X/Y (mirrored when `SymetryToggle > 0.5`).
- `NoiseToggle`: toggle procedural tinting (>0.5 enables, <=0.5 reverts to solid `SkinColor`).
- `TextureToggle`: multiplies `Texture2D` (RGB + alpha) into the result when enabled.
- `SymetryToggle`: mirrors noise sampling around the X axis to reuse half-face textures.
- `Texture2D`: optional mask or painted details (defaults to `white`).

Validation Steps
----------------
1. Duplicate an existing Cat material and assign the `CatSkinGraph` effect.
2. Copy your ShaderGraph property values into the new material.
3. Preview in Creator’s simulator (`Ctrl+P`) or in a Web build; verify that:
   - Procedural dots appear symmetrically when `SymetryToggle = 1`.
   - Switching `NoiseToggle`/`TextureToggle` off collapses to the base tint.
   - Rotating the mesh under a directional light only produces two brightness bands (0.81 vs 0.53 multiplier).
4. Rebuild (`CocosCreator --project . --build "platform=html5;debug=false"`) before submitting so the effect is included in playable bundles.
