# TENZING SESSION HANDOFF — FOR EDMUND
**Date:** March 24, 2026  
**Clip:** 1e — Mick Balcony  
**Status:** 17 iterations complete, iter_18 next (seed change test)

---

## WHERE WE ARE

Best score: **61/75** (iter_16). Current: **57/75** (iter_17). Lock threshold: **65/75**.

Identity has improved significantly since the session started (23/40 → 33/40 peak) but three persistent issues on seed 767053159 resist prompt-level correction: body thickness, age regression, eyebrow arch instability.

Iter_18 will test seed 544083690 (from the baseline render that achieved near-perfect identity) with all current settings and prompt refinements applied.

---

## KEY FINDINGS THIS SESSION

### 1. LOW NOISE PHASE OVER-REFINEMENT (Edmund's call — confirmed)
**The breakthrough.** `guidance2_scale` at 6 + `loras_multipliers` low-noise weight at 1.8 = double pressure in the low noise phase, amplifying the LoRA's trained eyebrow bias. Rolling both back to baseline values (guidance2_scale 3, empty multipliers) immediately improved identity by +5 points in one iteration.

**Universal principle:** When running character LoRAs against complex scene prompts, keep low-noise phase pressure LOW. Over-refinement pushes toward trained biases rather than prompt intent.

### 2. ATTENTION WEIGHTING ON FACIAL FEATURES BACKFIRES
Iter_11 tested `(heavy low straight flat eyebrows:1.4)` — made the arch WORSE. The model latches onto "eyebrows" as a concept and amplifies its default interpretation regardless of adjectives. Rope 2 is ruled out for correcting LoRA-embedded facial feature biases.

### 3. PROMPT DESCRIPTORS STEER GEOMETRY BUT CAN OVERCORRECT
- "lean angular face, sharp jaw" → too narrow (iter_06)
- "broad face with width through cheeks" → too blocky (iter_08)
- "naturally wide face" → better (iter_09)
- "strong jaw lean face" → best geometry (iter_15)
- "full cheeks" → too puffy, "flat cheek planes" → fixed it

### 4. DROPPED DESCRIPTORS CAUSE SILENT REGRESSIONS
"fit healthy" was accidentally dropped during prompt restructuring. Body immediately got heavier. Regression detection (#30) would have caught this.

### 5. SEED HAS ITS OWN BIASES
Seed 767053159 has persistent attractors: younger age, heavier body, arched brows, accessory instability. These resist prompt correction. Seed 544083690 (baseline) doesn't have these issues. Testing seed change next.

---

## CURRENT LOCKED SETTINGS

```
guidance_scale: 6.1
guidance2_scale: 3
loras_multipliers: "" (empty — critical)
seed: 767053159 (changing to 544083690 for iter_18)
num_inference_steps: 30
video_length: 32 (iteration) / 81 (production)
film_grain_intensity: 0.01
film_grain_saturation: 0.5
activated_loras: mckdhn-v1-cloud-high.safetensors + mckdhn-v1-cloud-low.safetensors
```

## CURRENT PROMPTS (iter_17)

**prompt:**
```
(mckdhn:1.3), (fit healthy mid to late fifties:1.2), (silver grey hair deep weathered tanned skin strong jaw lean weathered face:1.1), lean build, wearing white linen shirt sleeves rolled, standing on high rise apartment balcony leaning on glass railing, (Monaco harbour:0.9) below superyachts Mediterranean blue water, golden hour warm light, man gazes out over harbour then slowly turns toward camera with knowing half smile, cinematic documentary, film grain
```

**alt_prompt:**
```
mckdhn, fit healthy lean build mid to late fifties, anglo-australian complexion natural sun tan, straight low brow line deep set dark eyes, weathered sun-worn skin crow's feet forehead creases lean lower face, strong jawline high tight cheekbones lean cheeks lean neck prominent nose
```

**negative_prompt:**
```
blurry, distorted, deformed, low quality, smooth skin, perfect skin, shirtless, dramatic lighting, video game, CGI, over-rendered, young, mediterranean, middle eastern, dark complexion, freshly cut hair, uniform hair, elderly, too old, gaunt, seventy, jittery motion, watermark, narrow face, thin face, chiseled, arched eyebrows, high eyebrows, lifted brow, stocky, heavyset, overweight
```

---

## ITERATION HISTORY (SCORES)

| Iter | Score | Rope | Key Change |
|------|-------|------|------------|
| 01 | — | — | Baseline, no score recorded |
| 02 | 51 | Rope 3 | First LoRA multipliers applied |
| 03 | 55 | Rope 2 | Attention weighting |
| 04 | 46 | Rope 1 | Identity stripped from main prompt (deliberate sacrifice) |
| 05 | 58 | Rope 1 | Balance point — condensed identity + alt_prompt |
| 06 | 53 | Rope 3 | Multipliers pushed to 1.0;0.1 0.1;1.8 |
| 07 | 53 | — | DEAD END — tooling gap, identical to iter_06 |
| 08 | 54 | Rope 1 | Face geometry correction (broad face) |
| 09 | 53 | Rope 1 | Softened broadening (naturally wide face) |
| 10 | 53 | Rope 4b | guidance2_scale 6→3 (alone didn't fix brow) |
| 11 | 52 | Rope 2 | Attention weight 1.4 on brow — MADE IT WORSE |
| 12 | 58 | Multiple | **BREAKTHROUGH** — Edmund's combined rollback (empty multipliers + g2s 3) |
| 13 | 59 | Rope 6 | Gentle brow reinforcement in alt_prompt |
| 14 | 60 | Rope 1 | Cheekbone tightening |
| 15 | 60 | Rope 1 | Age regression — lean face coded younger |
| 16 | 61 | Rope 1 | Age pushed back, body got heavy |
| 17 | 57 | Rope 1 | Lean build added, partial fix, seed biases persistent |
| 18 | — | Seed | Testing seed 544083690 (pending) |

---

## TOOLING FIXES THIS SESSION

- **next_changes merge** — eval JSON now uses structured `next_changes` object instead of flat `next_change_value`. "Save & Generate Next" auto-applies field changes. Confirmed working.
- **Rope ID format** — eval JSON must use constant IDs (e.g. `rope_1_prompt_position`) not display labels.
- **Junk key carry-forward** — `"prompt, alt_prompt, negative_prompt": "See iter_07 JSON"` still present in generation chain. #28 (strip junk keys) should fix.

## ROPE EFFECTIVENESS (from Iteratarr chart)

| Rope | Uses | Avg Delta |
|------|------|-----------|
| Rope 3 — LoRA Multipliers | 1x | +12 |
| Rope 2 — Attention Weighting | 2x | +2 |
| Rope 4b — CFG Low Noise | 1x | -1 |
| Multiple | 1x | -1 |
| Rope 1 — Prompt Position | 5x | -1.4 |

---

## NEXT STEPS

1. Evaluate iter_18 (seed 544083690) — if identity jumps, seed selection becomes an early pipeline step
2. If iter_18 scores well, continue refining on new seed toward 65 lock
3. If iter_18 fails, return to seed 767053159 and push harder on age/body/brow
4. Once locked: 81-frame production render, update Character Registry baseline, begin Belinda LoRA evaluation
