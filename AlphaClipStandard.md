AlphaClipStandard Shader
========================

Engine Version
--------------
- `package.json` declares `creator.version: "3.8.7"`, so the shader is authored against Cocos Creator 3.8.7.
- The effect relies on the `legacy/*` built-ins that ship with Creator 3.8, so make sure you open the project with that editor version (`CocosCreator --project .`).

Effect Overview
---------------
- Vertex stage: delegates to `legacy/main-functions/general-vs:vert`, which handles world transforms, skinning, instancing, lightmap UVs, and exports `v_uv`.
- Fragment stage (`alpha-clip-fs`): samples `albedoMap`, multiplies it by `albedoColor`, discards when `alpha < alphaThreshold`, and outputs the lit color through `CCFragOutput`.
- Material block (`set = 2, binding = 0`) stores `albedoColor` and `alphaThreshold`, keeping the data layout compatible with Creator 3.8’s descriptor sets.

Material Properties
-------------------
- `albedoMap`: Texture sampled in `alpha-clip-fs`. Defaults to the engine `white` texture.
- `albedoColor`: Tint applied to the sampled color (exposed as a color field in the inspector).
- `alphaThreshold`: Cutoff used for alpha clipping (values in `[0,1]`; default `0.5`).

Usage & Testing
---------------
1. Create a new material and set its effect to `AlphaClipStandard`.
2. Assign a texture to `albedoMap`, tune `albedoColor` / `alphaThreshold`.
3. In the simulator (`Ctrl+P`) or Web build, verify that pixels with alpha below the threshold are discarded and that depth writes still occur (no blending enabled).
4. When exporting a playable, rebuild via `CocosCreator --project . --build "platform=html5;debug=false"` to include the updated shader.
