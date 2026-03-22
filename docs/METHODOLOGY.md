# The Five Rope Methodology

A structured framework for AI video prompt engineering. Every parameter decision is made through the lens of controllable levers — called ropes. Change one rope at a time. Same seed. Score. Compare. Repeat until locked.

## The Ropes

### Rope 1 — Prompt Position
Earlier in the prompt = more attention weight. Identity block must appear before location. Every additional word dilutes attention on all other words.

**JSON field:** `prompt` (word order)

**When to pull:** Face match low but other identity elements strong — the model isn't paying enough attention to the character trigger.

### Rope 2 — Attention Weighting
Boost important tokens: `(mckdhn:1.3)` increases attention by 30%. Reduce competing elements: `(Monaco harbour:0.9)` decreases by 10%.

**JSON field:** `prompt` (parenthesis syntax)
**Range:** 0.5 – 1.5

**When to pull:** Specific elements are being ignored or overpowered. Hair not matching? Boost the hair descriptor. Location overwhelming identity? Reduce location weight.

### Rope 3 — LoRA Multipliers
Phase-aware weighting for Wan2.2's dual-DiT architecture. Two LoRAs (high noise + low noise) with independent weights per phase.

**JSON field:** `loras_multipliers`
**Syntax:** `"high_phase;low_phase high_phase;low_phase"` — first entry = high noise LoRA, second = low noise LoRA.
**Example:** `"1.0;0.3 0.3;1.2"` = high LoRA dominates high noise phase, low LoRA dominates low noise phase.

**When to pull:** Frame consistency low (identity drifting), or fine facial detail (skin texture, wrinkles) not rendering. The low noise LoRA handles detail refinement.

### Rope 4a — CFG High Noise (guidance_scale)
Controls prompt adherence in the composition pass. Higher = more adherent to prompt, but can look artificial. Lower = more natural, but may drift from prompt.

**JSON field:** `guidance_scale`
**Sweet spot:** 5.9 – 6.2 for character work.

**When to pull:** Location or action not matching prompt description. Spatial geometry wrong. Camera movement not following direction.

### Rope 4b — CFG Low Noise (guidance2_scale)
Controls prompt adherence in the identity refinement pass.

**JSON field:** `guidance2_scale`
**Default:** 3 — largely unexplored territory above 4.

**When to pull:** Identity details correct in early frames but drift in later frames. Low noise phase not holding the refinement.

### Rope 5 — Steps Skipping
Activates Taylor2 cache for faster renders. Slight quality reduction.

**JSON field:** `skip_steps_cache_type`
**Value:** `"Taylor2"` to enable, `""` to disable.

**When to pull:** Iteration mode only. Use for faster feedback cycles. Always disable for production renders.

### Rope 6 — Alt Prompt
Secondary prompt that drives the low noise phase exclusively. Main prompt handles location and action. Alt prompt handles pure identity.

**JSON field:** `alt_prompt`

**When to pull:** Location and identity competing for attention in a single prompt. Complex scenes where the model can't serve both masters. This is the most powerful rope for separating character identity from scene description.

**Critical finding:** Identity cannot be fully delegated to alt_prompt alone. The main prompt needs a condensed identity anchor. Alt_prompt reinforces; it doesn't replace.

### Bonus Levers

- **flow_shift** — Temporal coherence. Higher = more stable motion, less dynamic. Default 12, range 1-20.
- **NAG_scale** — Normalised Attention Guidance. Enhances prompt adherence via a different mechanism to CFG. Default 1, range 1-3.
- **sample_solver** — Solver algorithm. `unipc` is default. Try others when other ropes plateau.

## The Protocol

1. Write prompt with all ropes consciously considered
2. Generate at 32 frames (iteration mode — half render time)
3. Score in Iteratarr using the structured scorecard (75 max)
4. Attribute the lowest score to a specific rope
5. Change ONE variable only
6. Generate at 32 frames again — SAME SEED
7. Compare directly — did the fix work?
8. Repeat until score exceeds 65/75
9. Lock — auto-generates 81-frame production JSON
10. Add to production render queue

Same seed across all iterations = controlled experiment. Only the changed variable is different. Clean comparison every time.

## Key Principles

**One variable at a time.** If you change two things, you don't know which one helped. Discipline beats speed.

**The seed is sacred.** Lock it after the first render. Every iteration must be directly comparable.

**Score honestly.** The numbers are for you, not for anyone else. Generous scoring hides problems that compound.

**History is history.** Once an evaluation is saved, it's locked. Made a mistake? Score the next iteration differently. Don't rewrite the past.

**The sliders are a history chart.** Ghost markers show where previous iterations scored. Green = improving. Red = regressing. Grey = same. The trend tells you whether your methodology is working.
