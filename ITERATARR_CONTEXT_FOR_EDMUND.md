# ITERATARR — CONTEXT SUMMARY FOR EDMUND
**Date:** 2026-03-22  
**Written by:** Tenzing  
**For:** Edmund — before reading the Iteratarr spec

---

## WHAT THIS IS AND WHY IT EXISTS

Iteratarr was conceived and specified during a single production session building Kebbin's Shop — a documentary/docu-series using AI-generated video. It emerged from a specific problem discovered in real production work, not from theory.

Read this before the spec. It will make everything in the spec make sense.

---

## THE PROJECT — KEBBIN'S SHOP

A documentary series. Voiceover (Judd's voice) over AI-generated visuals. Real stories. Real people. Episode 1 covers the Mick Doohan Monaco crypto heist — a true story involving a 5x MotoGP world champion, Russian thieves, a Ledger hardware wallet, and Judd executing an emergency blockchain protocol from Warrimoo at 3am while Belinda did the dishes.

The production pipeline:
- **Wan2GP** — local AI video generation (RTX 3060 12GB, Wan2.2 T2V 14B)
- **Character LoRAs** — trained on H200 via RunPod, deployed in Wan2GP
- **DaVinci Resolve** — assembly, colour, audio
- **Veo** — final production quality renders after local approval

Every scene is generated as modular clips — typically 5 seconds / 81 frames each. DaVinci assembles them.

---

## THE CHARACTER LORA SYSTEM

Each character in the show has a trained LoRA — a fine-tuned model that teaches Wan2GP what that person looks like. When the trigger word appears in a prompt, the LoRA fires and renders that specific face consistently across all frames.

**Current character LoRA queue:**
- mckdhn (Mick Doohan) — TRAINED, dual LoRA stack, production locked
- jddnrtr (Judd) — trained, pending evaluation
- blndnarr (Belinda) — trained, pending evaluation
- jckdhn (Jack Doohan) — trained, pending evaluation
- tbyprc (Toby Price) — trained, pending evaluation
- mttymgr (Matty) — trained, pending evaluation

**The dual LoRA discovery:**
Wan2.2 uses two internal diffusion models — High Noise (broad structure) and Low Noise (fine detail/identity). We trained separate LoRAs for each phase. Stacking both in Wan2GP with phase-aware multipliers produces significantly better identity lock than either alone. This was discovered empirically during the mckdhn evaluation session.

**Proven mckdhn settings:**
```json
"activated_loras": [
    "mckdhn-v1-cloud-high.safetensors",
    "mckdhn-v1-cloud-low.safetensors"
],
"loras_multipliers": "1.0;0.3 0.3;1.2",
"guidance_scale": 6.1,
"guidance2_scale": 4,
"film_grain_intensity": 0.01,
"film_grain_saturation": 0.5
```

---

## THE PROBLEM ITERATARR SOLVES

During the mckdhn evaluation session we ran 8+ test renders iterating toward a locked production standard. The process revealed a fundamental problem:

**Without a structured framework, evaluation is subjective and iteration is guesswork.**

"Pretty good" is not useful. "The face drifted in frames 15-20 because the LoRA multipliers gave insufficient weight to the low noise phase identity refinement pass" is useful.

We needed:
1. A structured scoring system to convert subjective impressions into actionable data
2. A way to attribute specific problems to specific causes
3. A system to generate the next iteration JSON automatically based on the diagnosis
4. A record of every decision so nothing lives only in someone's head

Iteratarr is the answer to all four.

---

## THE FIVE ROPE METHODOLOGY

This is the conceptual core of Iteratarr. Every prompt/generation parameter decision is made through the lens of five controllable levers — called ropes.

```
ROPE 1 — Prompt Position
Earlier in prompt = more attention weight.
Identity block always first, never compressed.

ROPE 2 — Attention Weighting
(mckdhn:1.3) boosts a token's attention by 30%
(Monaco harbour:0.9) reduces location competition
Works natively in Wan2GP prompt parser.

ROPE 3 — LoRA Multipliers
Phase-aware weights for dual-DiT Wan2.2.
"1.0;0.3 0.3;1.2" = high LoRA dominates high noise phase,
low LoRA dominates low noise phase.
JSON field: loras_multipliers

ROPE 4a — CFG / guidance_scale
Prompt adherence in high noise (composition) pass.
Sweet spot: 5.9 – 6.2 for character work.

ROPE 4b — Low Noise CFG / guidance2_scale  
Prompt adherence in low noise (identity refinement) pass.
Default 3 — largely unexplored, being tested.

ROPE 5 — Steps Skipping
Activate skip_steps_cache_type = "Taylor2" for faster iteration renders.
Off for production renders.

ROPE 6 — Alt Prompt (recently discovered)
Secondary prompt driving low noise phase only.
Main prompt = location and action.
Alt prompt = pure identity block.
Potentially the most powerful rope for character vs location balance.
```

---

## THE ITERATION PROTOCOL

Every clip goes through this loop before production:

```
1. Write prompt with all ropes consciously considered
2. Generate at 32 frames (half render time — iteration mode)
3. Score in Iteratarr using structured scorecard
4. Attribute lowest score to specific rope
5. Change ONE variable only
6. Generate at 32 frames again — SAME SEED
7. Compare directly — did the fix work?
8. Repeat until score exceeds threshold (65/75)
9. Lock — auto-generate 81-frame production JSON
10. Add to production render queue
```

Same seed across all iterations = controlled experiment. Only the changed variable is different. Clean comparison every time.

---

## THE EVALUATION FRAMEWORK

Three score categories. Sliders 1-5 per element.

**Identity (max 40):**
Face match, head shape, jaw, cheekbones, eyes/brow, skin texture, hair, frame consistency.

**Location (max 20):**
Location correct, lighting, wardrobe, geometry.

**Motion (max 15):**
Action executed, smoothness, camera movement.

**Grand total: 75**
Lock threshold: 65/75

Below threshold → iterate.
Above threshold → lock and go to production.

---

## THE JSON SYSTEM

Wan2GP saves all generation settings as JSON files. We've been saving every iteration. The JSON contains everything — prompt, negative prompt, seed, CFG, LoRA files, multipliers, frame count, all settings.

Iteratarr ingests these JSONs, links them to clip records, stores evaluation results against them, and generates the next iteration JSON automatically based on the rope attribution.

**JSON field to rope mapping — the key reference:**
```
prompt          → Rope 1 (word order) + Rope 2 (attention weighting)
alt_prompt      → Rope 6
loras_multipliers → Rope 3
guidance_scale  → Rope 4a
guidance2_scale → Rope 4b
skip_steps_cache_type → Rope 5
flow_shift      → Bonus lever
NAG_scale       → Bonus lever
video_length    → 32 (iteration) or 81 (production)
seed            → locked after first iteration, -1 for first run
```

---

## WHAT WE STOLE FROM EXISTING TOOLS

Iteratarr doesn't reinvent the wheel — it assembles the best parts:

- **MLflow/W&B** — run comparison view, metric trend graphs, tag system
- **ComfyUI** — auto parameter capture, version lineage tree
- **Civitai** — character registry format, trigger word library
- **Notion/Airtable** — kanban episode tracker, linked records
- **DaVinci Resolve** — colour flag system, metadata sidecar for edit suite
- **PromptHero** — prompt template structure

Nothing that combines all of these for AI video production with LoRA character management exists. We checked. Iteratarr fills a genuine gap.

---

## THE PRODUCTION CONTEXT

Episode 1 has 14 clips plus a 4-clip pre-title sequence. 18 clips total. Each needs to go through the iteration loop, get locked, and enter the production queue.

Characters appear across multiple clips and multiple locations. The locked identity block for each character must survive location changes — this is the core technical challenge Iteratarr is built to solve.

**Current production status:**
- mckdhn: LoRA trained and locked. First Monaco balcony iteration running now.
- All other characters: LoRAs trained, evaluation pending.
- Iteratarr: Being built. Will be used immediately on completion of Phase 2.

---

## THE DESIGN PHILOSOPHY

**Utilitarian but handsome. Terminal meets broadcast suite.**

Not a consumer app. Not a game UI. A professional production tool that looks like it belongs in a colour grading suite. Dark theme, single accent colour, monospace for data, large prominent score numbers.

The tool should feel as serious as the work it supports.

---

## THE NAME

**Iteratarr.**

Fits the arr suite naming convention (Sonarr, Radarr, Bazarr, SubBrainArr, MapArr). Describes exactly what it does. Judd named it.

---

## FIRST REAL WORLD TEST

As soon as Phase 1 and 2 are complete (core UI + evaluation panel):

1. Load monaco_iter_01.json
2. Score the render that's currently running
3. Attribute the lowest element to a rope
4. Click Generate Next Iteration JSON
5. Load monaco_iter_02.json into Wan2GP
6. Run it

If that loop works end to end — the core is proven. Everything else is enhancement.

---

## SUMMARY

Iteratarr exists because:
1. Real production work revealed a real problem
2. "Pretty good" is not evaluation
3. Guesswork iteration wastes render time
4. The five rope methodology needed a tool built around it
5. No existing tool filled the gap

It was conceived, specified, and is being built in the same session that discovered the problem it solves.

That's the whole picture. Now read the spec.

---

*Ground floor. The wheel didn't exist. We built it.*
