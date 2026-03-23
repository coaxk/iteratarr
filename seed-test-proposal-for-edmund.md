# SEED VARIANCE TEST — PROPOSAL FOR EDMUND

## What Just Happened

Iter_19 ran on seed 544083690 (baseline render seed) with all proven settings and refined prompts from iterations 12-17. Results:

**Positives (immediate, no iteration needed):**
- Body lean — significantly better than seed 767053159, no "stocky" problem
- Face geometry — wider jaw, better proportions out of the gate
- Brow line — flatter, less arched, no instability between frames
- Overall structure closer to reference without prompt fighting

**Negatives (would need iteration to fix):**
- Eyes too light/open — not deep-set and hooded enough, reads friendly not intense
- Age too young — needs 7-10 more years, skin too smooth
- Colour grade shifted warm/amber — hiding skin texture
- Smile too wide/open — should be knowing half-smile not friendly grin
- Watch went full fantasy (red strap, blue face) — cosmetic but notable

**Key Insight:** The structural issues we spent 17 iterations fighting on seed 767053159 (body thickness, brow arch, face width) don't exist on this seed. But this seed has its own biases (younger, friendlier, smoother skin). Different seeds, different starting points, different iteration paths.

---

## Proposal: Seed Screening Pass (Step 0)

Before continuing iteration on any single seed, run a quick screening pass across 5-8 seeds.

**Method:**
- Same locked settings: guidance2_scale 3, empty loras_multipliers, current prompts
- Same frame count: 32 (iteration length)
- 5-8 random seeds + the two we've already tested (767053159, 544083690)
- Quick visual evaluation only — no formal Iteratarr scoring
- Evaluate each seed against reference photos for: face structure, age, skin texture, body build, brow line, overall "feel"
- Pick the seed with the best natural alignment to Mick's identity
- THEN start the iteration loop on that seed

**Time cost:** ~17 min per render × 6-8 seeds = roughly 2 hours of GPU time

**Expected value:** Eliminates seed-level biases from the iteration loop. We spent ~6 iterations (iter_08 through iter_14) fighting face geometry and brow arch that turned out to be seed biases, not prompt/settings problems. A screening pass upfront would have skipped all of that.

---

## Methodology Implications

This validates seed selection as a significant variable. Proposed evolution to the iteration protocol:

**Current protocol:**
1. Set up character LoRA and baseline settings
2. Lock seed
3. Iterate with single-variable changes
4. Score and attribute via Five Rope methodology

**Proposed protocol:**
0. **Seed screening** — run 5-8 seeds with baseline settings, visual pass, select best natural fit
1. Set up character LoRA and baseline settings on selected seed
2. Iterate with single-variable changes
3. Score and attribute via Five Rope methodology

Seed screening becomes Step 0 — before the iteration loop begins.

---

## Data Value

Even the screening pass generates useful data:
- Seed-to-identity variance range for this LoRA (how much does seed alone affect identity scores?)
- Which facial features are seed-dependent vs LoRA-dependent vs prompt-dependent
- Foundation for future seed clustering research via telemetry

---

## For Iteratarr

Could be worth adding a lightweight "seed screening" mode to Iteratarr — quick visual comparison grid, no formal scoring, just pick the best starting point. Different from the full iteration workflow. Think contact sheet rather than evaluation panel.

Thoughts?
