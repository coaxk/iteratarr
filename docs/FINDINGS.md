# Empirical Findings — First Production Test

Results from the first real-world iteration cycle: Mick Doohan character, Monaco balcony scene, Wan2.2 T2V 14B, dual LoRA stack, 6 iterations.

## Rope Effectiveness (measured)

| Rope | Avg Score Delta | Uses | Verdict |
|------|----------------|------|---------|
| Rope 3 — LoRA Multipliers | +12 | Most used | **Most effective lever.** Phase-aware multipliers directly control identity quality. |
| Rope 2 — Attention Weighting | +4 | 2x | Reliable for targeted improvements. Boost what's weak, reduce what's competing. |
| Rope 1 — Prompt Position | -9 | 1x | **Critical warning.** Stripping identity from main prompt collapsed identity score entirely. |

## Key Findings

### 1. Identity cannot be fully delegated to alt_prompt
**iter_04:** Removed all identity descriptors from main prompt, relying entirely on alt_prompt for identity. Result: identity score crashed to 15/40 (from 28/40). Wrong person, dark hair, young, generic.

**Conclusion:** alt_prompt reinforces identity in the low noise phase, but the high noise composition pass needs an identity anchor in the main prompt to establish the right face shape and structure.

### 2. The balance point is 30/70
**iter_05:** Condensed identity anchor in main prompt (30% of tokens) + full location/action (70%) + full identity in alt_prompt. Result: new high score 58/75.

**Architecture:** Main prompt = `(trigger:1.3), (condensed descriptors:1.0-1.1), location, action, style`. Alt_prompt = `trigger, full identity block`.

### 3. Location quality inversely correlates with identity token density
When identity tokens dominated the main prompt, location scored 14-16/20. When identity was reduced or removed, location jumped to 19/20. The attention budget is finite — every identity token costs location fidelity.

### 4. Phase-aware LoRA multipliers are the primary identity control
The dual-DiT architecture means identity is refined in two passes. Separate LoRAs for each phase with independent multipliers gives fine-grained control. Pushing low noise LoRA weight (identity detail) while reducing high noise LoRA weight (broad structure) improved skin texture and facial detail.

### 5. guidance2_scale (Rope 4b) shows diminishing returns above 4
Pushed from 3 → 4 → 6 across iterations. Minimal visible improvement. The LoRA multipliers are a more effective lever for the same identity refinement goal.

### 6. Seed locking is essential
All findings above are only possible because the same seed was used across all 6 iterations. Without seed locking, you can't isolate which change caused which improvement.

## Session Statistics

- **Iterations:** 6 (32 frames each)
- **Total render time:** ~120 minutes
- **Best score:** 58/75 (iter_05)
- **Lock threshold:** 65/75 (not yet reached)
- **Model:** Wan2.2 T2V 14B (quantized)
- **GPU:** RTX 3060 12GB (~20 min/render at 32 frames)
- **Character LoRA:** AI Toolkit, dual-DiT, step 600 checkpoint
