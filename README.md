# Iteratarr

AI video iteration and evaluation tool built around the Five Rope methodology. Structured scoring replaces "pretty good" with measurable, traceable, improvable.

## What It Does

Every AI video render gets evaluated, scored, attributed to a specific control lever, and linked to its generation settings. Every iteration decision is traceable. Every improvement is measurable. Nothing lives in someone's head.

**The core loop:**
```
Generate JSON → Render in Wan2GP → Score in Iteratarr →
Attribute to rope → Generate next iteration JSON → Repeat until locked
```

## The Five Rope Methodology

Six controllable levers (called ropes) drive every prompt engineering decision:

| Rope | What it controls | JSON field |
|------|-----------------|------------|
| **1 — Prompt Position** | Word order. Identity block first, never compressed. | `prompt` |
| **2 — Attention Weighting** | Token emphasis. `(mckdhn:1.3)` boosts, `(Monaco:0.9)` reduces. | `prompt` |
| **3 — LoRA Multipliers** | Phase-aware weights for dual-DiT. `"1.0;0.3 0.3;1.2"` | `loras_multipliers` |
| **4a — CFG High Noise** | Prompt adherence in composition pass. Sweet spot: 5.9-6.2 | `guidance_scale` |
| **4b — CFG Low Noise** | Prompt adherence in identity refinement pass. | `guidance2_scale` |
| **5 — Steps Skipping** | Faster iteration renders. Taylor2 cache. Off for production. | `skip_steps_cache_type` |
| **6 — Alt Prompt** | Secondary prompt driving low noise phase only. Pure identity. | `alt_prompt` |

**Bonus levers:** flow_shift, NAG_scale, sample_solver

## Iteration Protocol

- **32 frames** for iteration (half render time)
- **81 frames** for production (after lock at 65/75)
- **Same seed** across all iterations — controlled experiment
- **One variable change** per iteration — clean comparison
- **Score threshold: 65/75** to lock as production ready

## Evaluation Scoring

75 points maximum across three categories:

**Identity (40 max):** Face match, head shape, jaw, cheekbones, eyes/brow, skin texture, hair, frame consistency

**Location (20 max):** Location correct, lighting, wardrobe, geometry

**Motion (15 max):** Action executed, smoothness, camera movement

## Features

- **Three-panel dark UI** — terminal meets broadcast suite aesthetic
- **Episode Tracker kanban** — not started → in progress → evaluating → locked → in queue
- **15-slider evaluation** with live score ring and ghost markers (previous iteration scores)
- **Smart rope guidance** — contextual suggestions based on lowest-scoring element
- **Import Evaluation** — paste structured JSON from AI assistant, pre-fills everything
- **AI vs human score tracking** — ai_scores, human_scores, score_deltas on every evaluation
- **Side-by-side video comparison** — previous vs current render with auto-polling
- **FFmpeg frame extraction** — auto-extract thumbnails, copy path for external review
- **JSON diff panel** — see exactly which generation settings changed
- **Ghost markers** — previous iteration scores as trend-coloured dots on sliders
- **Character Registry** — LoRA files, locked identity blocks, proven settings
- **Production lock** — 7-step workflow: LOCKED folder, 81-frame JSON, DaVinci sidecar, queue
- **Structured file layout** — episode/scene/clip hierarchy with auto-naming
- **Wan2GP integration** — output_filename auto-set, render path auto-detected
- **Telemetry foundation** — opt-in, anonymized, off by default

## Stack

- **Backend:** Node.js, Express, SQLite (better-sqlite3), FFmpeg
- **Frontend:** React 18 (Vite), Tailwind CSS v4
- **Ports:** 3847 (backend), 3848 (frontend dev)

## Quick Start

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3848

## Configuration

Edit `backend/config.json`:

```json
{
  "wan2gp_json_dir": "path/to/wan2gp/app",
  "wan2gp_output_dir": "path/to/wan2gp/app/outputs",
  "wan2gp_lora_dir": "path/to/wan2gp/app/loras/wan",
  "project_base_dir": "path/to/your/project",
  "score_lock_threshold": 65,
  "iteration_frame_count": 32,
  "production_frame_count": 81,
  "telemetry_enabled": false,
  "port": 3847
}
```

## Settings Philosophy

Three tiers. Curation is the moat. Not completeness.

**Tier 1 — Core Ropes:** Always visible. Directly and predictably affect output quality.

**Tier 2 — Advanced Levers:** Collapsed by default. Power users reach for these when Tier 1 isn't solving the problem.

**Tier 3 — Passthrough:** In the JSON for Wan2GP. Never shown. Preserved silently on generation.

## Telemetry

Off by default. Opt-in only. When enabled, records evaluation scores, rope attributions, and generation settings locally. Export is fully anonymized — no file paths, no prompt text, no character names.

The methodology is universal. The data is model-specific. Keep them cleanly separated.

## License

Private. Not yet released.
