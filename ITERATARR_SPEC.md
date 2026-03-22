# ITERATARR — FULL TECHNICAL SPECIFICATION
**Version:** 1.0  
**Project location:** C:\Projects\iteratarr\  
**Built by:** Edmund  
**For:** Kebbin's Shop AI video production pipeline  
**Stack:** React + Node.js + Tailwind CSS  
**Design philosophy:** Utilitarian but handsome. Functional first. No bloat.

---

## OVERVIEW

Iteratarr is a local production intelligence tool for AI video generation. It sits alongside Wan2GP and VLC. Every render gets evaluated, scored, documented, and linked to its source JSON. Every iteration decision is traceable. Every improvement is measurable. Nothing lives in someone's head.

It replaces "pretty good" with a structured diagnostic framework built around the Five Rope methodology for AI video prompt engineering.

---

## THE CORE LOOP

```
Load JSON → Watch render in VLC → Score in Iteratarr → 
Attribute to rope → Generate next iteration JSON → 
Load in Wan2GP → Repeat until locked → 
One click to production queue
```

---

## PROJECT STRUCTURE

```
C:\Projects\iteratarr\
  \frontend\          React app
  \backend\           Node.js Express server
  \data\              Local JSON database
    \projects\        Project records
    \evaluations\     Evaluation records
    \characters\      Character registry
    \templates\       Prompt templates
  README.md
  package.json
```

---

## BACKEND — NODE.JS EXPRESS

Simple REST API. Local only. No auth. No cloud.

### Endpoints

```
GET    /api/projects                    List all projects
POST   /api/projects                    Create project
GET    /api/projects/:id                Get project with all scenes and clips

GET    /api/clips                       List clips (filter by project/scene/status)
POST   /api/clips                       Create clip record
PATCH  /api/clips/:id                   Update clip (status, notes)
GET    /api/clips/:id/iterations        Get all iterations for a clip

POST   /api/iterations                  Create iteration from JSON file
GET    /api/iterations/:id              Get iteration with evaluation
POST   /api/iterations/:id/evaluate     Submit evaluation scores
POST   /api/iterations/:id/lock         Lock as production standard
POST   /api/iterations/:id/next         Generate next iteration JSON

GET    /api/characters                  List character registry
POST   /api/characters                  Create character
PATCH  /api/characters/:id              Update character
GET    /api/characters/:id              Get character with full history

GET    /api/templates                   List prompt templates
POST   /api/templates                   Create template
```

### File watching

Watch the Wan2GP JSON output directory and the saves directory. When a new JSON appears, auto-ingest it into the relevant clip's iteration list. No manual import needed.

Configure watched directories in `backend/config.json`:
```json
{
  "wan2gp_json_dir": "C:/pinokio/api/wan2gp.git/app/outputs",
  "iteration_save_dir": "C:/Projects/kebbin-shop",
  "iteratarr_data_dir": "C:/Projects/iteratarr/data"
}
```

---

## DATA MODELS

### Project
```json
{
  "id": "uuid",
  "name": "Kebbin's Shop",
  "created_at": "ISO date",
  "scenes": ["scene_id_array"]
}
```

### Scene
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "name": "Scene 01 — Saudi Arabia",
  "episode": 1,
  "clips": ["clip_id_array"]
}
```

### Clip
```json
{
  "id": "uuid",
  "scene_id": "uuid",
  "name": "Clip 1e — Mick on Balcony",
  "characters": ["mckdhn"],
  "location": "Monaco Balcony",
  "status": "not_started | in_progress | evaluating | locked | in_queue",
  "locked_iteration_id": "uuid | null",
  "production_json_path": "path | null",
  "notes": "free text"
}
```

### Iteration
```json
{
  "id": "uuid",
  "clip_id": "uuid",
  "iteration_number": 1,
  "json_filename": "monaco_iter_01.json",
  "json_path": "full path",
  "json_contents": { full JSON object },
  "seed_used": 544083690,
  "created_at": "ISO date",
  "status": "pending | evaluated | locked",
  "evaluation_id": "uuid | null",
  "parent_iteration_id": "uuid | null",
  "change_from_parent": "description of single change made"
}
```

### Evaluation
```json
{
  "id": "uuid",
  "iteration_id": "uuid",
  "date": "ISO date",
  "scores": {
    "identity": {
      "face_match": 4,
      "head_shape": 3,
      "jaw": 4,
      "cheekbones": 4,
      "eyes_brow": 4,
      "skin_texture": 3,
      "hair": 3,
      "frame_consistency": 2,
      "total": 27,
      "max": 40
    },
    "location": {
      "location_correct": 4,
      "lighting_correct": 4,
      "wardrobe_correct": 5,
      "geometry_correct": 3,
      "total": 16,
      "max": 20
    },
    "motion": {
      "action_executed": 3,
      "smoothness": 4,
      "camera_movement": 2,
      "total": 9,
      "max": 15
    },
    "grand_total": 52,
    "grand_max": 75
  },
  "attribution": {
    "lowest_element": "frame_consistency",
    "rope": "rope_3_lora_multipliers",
    "confidence": "high",
    "next_change_description": "Increase low noise LoRA weight to 1.3",
    "next_change_json_field": "loras_multipliers",
    "next_change_value": "1.0;0.2 0.2;1.3"
  },
  "qualitative_notes": "Face drifts slightly in frames 15-20. Monaco location rendering well. Hair texture improved from iter_01.",
  "production_ready": false
}
```

### Character
```json
{
  "id": "mckdhn",
  "name": "Mick Doohan",
  "trigger_word": "mckdhn",
  "lora_files": [
    "mckdhn-v1-cloud-high.safetensors",
    "mckdhn-v1-cloud-low.safetensors"
  ],
  "locked_identity_block": "mckdhn, fit healthy mid to late fifties, anglo-australian complexion natural sun tan, deep set dark eyes slightly hooded brow, short silver grey hair slightly longer on top with natural growth pattern not freshly cut, weathered tanned skin, age lines around eyes and mouth, lean angular face, prominent cheekbones, sharp jaw",
  "locked_negative_block": "smooth skin, perfect skin, shirtless, dramatic lighting, video game, CGI, over-rendered, young, mediterranean, middle eastern, dark complexion, freshly cut hair, uniform hair, elderly, too old, gaunt, seventy",
  "proven_settings": {
    "guidance_scale": 6.1,
    "guidance2_scale": 4,
    "loras_multipliers": "1.0;0.3 0.3;1.2",
    "film_grain_intensity": 0.01,
    "film_grain_saturation": 0.5
  },
  "best_iteration_id": "uuid",
  "notes": "Dual LoRA stack required. Low noise anchors identity, high noise brings cinematic quality. Phase-aware multipliers critical."
}
```

---

## FRONTEND — REACT + TAILWIND

Single page app. Three panel layout.

```
┌─────────────┬──────────────────────┬─────────────────┐
│  LEFT PANEL │   CENTRE PANEL       │   RIGHT PANEL   │
│  Navigation │   Main content       │   Quick actions │
│  & Library  │   & Evaluation       │   & Queue       │
└─────────────┴──────────────────────┴─────────────────┘
```

---

## VIEWS

### 1. EPISODE TRACKER (Default home view)

Kanban board. One column per status:

```
NOT STARTED | IN PROGRESS | EVALUATING | LOCKED | IN QUEUE
```

Each clip is a card showing:
- Clip name
- Characters involved
- Current iteration number
- Best score so far
- Status indicator (colour coded)

Drag cards between columns. Click card to open clip detail.

Colour system:
- 🔴 Red = not started
- 🟡 Yellow = in progress / evaluating  
- 🟢 Green = locked
- 🔵 Blue = in production queue

---

### 2. CLIP DETAIL VIEW

Opens when you click a clip card.

**Top section — Clip info:**
- Clip name, scene, episode
- Characters list (click to open character card)
- Location
- Notes field (editable)
- Status badge

**Middle section — Iteration lineage:**
Visual tree showing iteration history. Each node is an iteration bubble:

```
iter_01 (52/75) → iter_02 (61/75) → iter_03 (68/75) 🔒 LOCKED
                ↘ iter_02b (55/75) [dead end]
```

Colour coded by score. Click any node to see full details.

**Bottom section — Current iteration panel:**
Shows the selected iteration's full details. See evaluation section below.

---

### 3. EVALUATION PANEL

The core of the app. Appears when you select an iteration.

**Header:**
- Iteration number and filename
- Seed used
- Date generated
- Parent iteration (what changed from previous)
- Status badge

**Score section — Three groups of sliders:**

Each slider: label left, 1-5 slider, number right. Colour shifts red→yellow→green as value increases.

```
IDENTITY SCORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Face Match Overall    [━━━━━━━━━━━] 4
Head Shape            [━━━━━━━━░░░] 3
Jaw Line              [━━━━━━━━━━━] 4  
Cheekbones            [━━━━━━━━━━━] 4
Eyes / Brow           [━━━━━━━━━━━] 4
Skin Texture / Age    [━━━━━━░░░░░] 3
Hair                  [━━━━━━░░░░░] 3
Frame Consistency     [━━░░░░░░░░░] 2
                                ━━━━━
                         TOTAL  27/40

LOCATION SCORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Location Correct      [━━━━━━━━━━━] 4
Lighting Correct      [━━━━━━━━━━━] 4
Wardrobe Correct      [━━━━━━━━━━━] 5
Geometry Correct      [━━━━━━━━░░░] 3
                                ━━━━━
                         TOTAL  16/20

MOTION SCORES  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Action Executed       [━━━━━━░░░░░] 3
Smoothness            [━━━━━━━━━░░] 4
Camera Movement       [━━━░░░░░░░░] 2
                                ━━━━━
                         TOTAL   9/15

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GRAND TOTAL                    52/75
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Score ring or progress bar at top updates live as sliders move.

**Attribution section:**

```
LOWEST SCORING ELEMENT
[dropdown: Frame Consistency ▼]

MOST LIKELY ROPE
[dropdown: Rope 3 — LoRA Multipliers ▼]

CONFIDENCE
[Low] [Medium ●] [High]

NEXT CHANGE
[text input: Increase low noise LoRA weight from 1.2 to 1.3]
```

Rope dropdown options:
- Rope 1 — Prompt Position
- Rope 2 — Attention Weighting
- Rope 3 — LoRA Multipliers
- Rope 4a — CFG / guidance_scale
- Rope 4b — Low Noise CFG / guidance2_scale
- Rope 5 — Steps Skipping
- Rope 6 — Alt Prompt
- Bonus — flow_shift
- Bonus — NAG_scale
- Bonus — sample_solver
- Multiple ropes

**Quick JSON diff panel:**
Shows current iteration JSON on left. Editable next iteration JSON on right. Only changed fields highlighted in yellow. No need to see the whole JSON — just what's different.

**Qualitative notes:**
```
[                                        ]
[  Free text. What did you notice?       ]
[  Mick's brother syndrome. Hair better. ]
[                                        ]
```

**Action buttons:**
```
[💾 Save Evaluation] [⚡ Generate Next Iteration JSON] [🔒 Lock as Production]
```

**Save Evaluation** — writes the evaluation record, marks iteration as evaluated.

**Generate Next Iteration JSON** — reads current JSON, applies the change specified in attribution, outputs next iteration JSON file, auto-increments filename, adds to clip's iteration list.

**Lock as Production** — appears when score exceeds threshold (default 65/75, configurable). Marks iteration locked, copies JSON to LOCKED folder, auto-generates 81-frame production version, adds to render queue.

---

### 4. CHARACTER REGISTRY

Card per character. Click to expand.

Each card shows:
- Character name and trigger word
- LoRA files loaded
- Locked identity block (read only, copyable)
- Locked negative block (read only, copyable)
- Proven settings (all fields)
- Best score achieved
- Total iterations run
- Notes

**New scene button** — generates a starter JSON for any location using this character's locked settings. Fill in location and action, everything else pre-populated.

---

### 5. PROMPT TEMPLATE LIBRARY

Templates with placeholders. Example:

```
NAME: mckdhn — outdoor location
IDENTITY: [auto from character registry]
LOCATION: {{location_description}}
ACTION: {{action_description}}
STYLE: cinematic documentary, film grain
```

Fill in the two placeholders, click generate, get a complete starter JSON.

---

### 6. SCORE TREND VIEW

Line graph per clip. X axis = iteration number. Y axis = score 0-75. Three lines — identity, location, motion — plus grand total. Instantly see if you're improving or plateauing.

Second graph — Rope effectiveness. Bar chart showing average score improvement per rope across all evaluated iterations. Over time this shows which ropes are most impactful for this character/location combination.

---

### 7. PRODUCTION QUEUE

Right panel always visible. List of locked clips queued for 81-frame production render.

Each item shows:
- Clip name
- Locked seed
- LoRAs
- Estimated render time (based on 54 min per clip on 3060)

One button: **Export Queue to Wan2GP JSON Format**

Exports all queued items as a Wan2GP queue file ready to load.

---

### 8. COMPARISON VIEW

Select two iterations from the same clip. Side by side:
- JSON diff highlighted
- Scores side by side
- Notes side by side

Answers the question: "what exactly changed between these two and did it help?"

---

## JSON GENERATION ENGINE

This is the smart core. When **Generate Next Iteration JSON** is clicked:

1. Load current iteration JSON
2. Read the attribution — which field changes, to what value
3. Apply the change
4. Auto-increment filename (monaco_iter_01 → monaco_iter_02)
5. If iteration mode: ensure video_length = 32, seed = locked from previous
6. Write new JSON to iteration save directory
7. Create iteration record in database
8. Reload iteration lineage tree in UI

**Smart field editing — rope-aware:**

The system knows which JSON fields map to which ropes. When you select "Rope 3 — LoRA Multipliers" from the attribution dropdown, the next iteration panel shows:

```
loras_multipliers
Current: "1.0;0.3 0.3;1.2"
New:     [________________] 
```

With a helper showing the syntax documentation inline. No JSON knowledge required.

Same for every rope — Rope 2 shows the attention weighting syntax helper, Rope 6 shows the alt_prompt field, etc.

---

## PRODUCTION LOCK WORKFLOW

When Lock is clicked on an iteration scoring 65+/75:

1. Mark iteration as locked in database
2. Copy JSON to `/kebbin-shop/episode-01/[scene]/[clip]/LOCKED/`
3. Generate production version:
   - Change video_length from 32 to 81
   - Keep seed locked
   - All other settings unchanged
   - Save as `[clip_name]_PRODUCTION.json`
4. Add to production queue
5. Generate DaVinci metadata sidecar:
```json
{
  "clip": "Clip 1e — Mick on Balcony",
  "scene": "Scene 01",
  "episode": 1,
  "character": "mckdhn",
  "loras": ["mckdhn-v1-cloud-high", "mckdhn-v1-cloud-low"],
  "seed": 544083690,
  "locked_date": "2026-03-22",
  "iteration": 3,
  "final_score": 68
}
```
6. Update clip status to IN_QUEUE
7. Update kanban card to blue

---

## STYLING GUIDELINES

**Utilitarian but handsome. Functional first.**

- Dark theme. Not RGB gaming. Professional dark — like a colour grading suite.
- Accent colour: Single warm colour. Amber or teal. One colour only.
- Typography: Monospace for JSON fields and scores. Sans-serif for everything else.
- Sliders: Custom styled. Colour shifts red → amber → green as value increases.
- No animations except loading states. No transitions for the sake of it.
- Score totals: Large, prominent. The number is the product.
- Status badges: Pill shaped. Colour coded as defined above.
- Icons: Minimal. Only where meaning is immediately clear without label.

Reference aesthetic: Terminal meets broadcast suite. Not consumer app. Not game UI.

---

## CONFIGURATION

`C:\Projects\iteratarr\config.json`

```json
{
  "wan2gp_json_dir": "C:/pinokio/api/wan2gp.git/app",
  "iteration_save_dir": "C:/Projects/kebbin-shop",
  "production_lock_dir": "C:/Projects/kebbin-shop/finals",
  "production_queue_dir": "C:/Projects/kebbin-shop/queue",
  "score_lock_threshold": 65,
  "iteration_frame_count": 32,
  "production_frame_count": 81,
  "port": 3847
}
```

---

## ROPE REFERENCE — BAKED INTO THE APP

Every rope documented inline. Accessible via info icon next to each attribution option.

```
ROPE 1 — Prompt Position
Identity block must appear before location. 
Every additional word dilutes attention on all others.
JSON field: prompt (word order)

ROPE 2 — Attention Weighting  
Boost identity tokens: (mckdhn:1.3)
Reduce competing elements: (Monaco harbour:0.9)
JSON field: prompt (parenthesis syntax)
Range: 0.5 – 1.5

ROPE 3 — LoRA Multipliers
Phase-aware weighting for dual-DiT Wan2.2.
Syntax: "high_phase;low_phase high_phase;low_phase"
First entry = high noise LoRA, second = low noise LoRA
JSON field: loras_multipliers
Example: "1.0;0.3 0.3;1.2"

ROPE 4a — CFG High Noise
Controls prompt adherence in composition pass.
Sweet spot for character work: 5.9 – 6.2
JSON field: guidance_scale

ROPE 4b — CFG Low Noise
Controls prompt adherence in identity refinement pass.
Default 3 — untested territory above 4.
JSON field: guidance2_scale

ROPE 5 — Steps Skipping
Activate: skip_steps_cache_type = "Taylor2"
Faster renders, slight quality reduction.
Use for iteration mode only.
JSON field: skip_steps_cache_type

ROPE 6 — Alt Prompt
Secondary prompt driving the low noise phase only.
Use for identity block when location competes.
Main prompt: location and action
Alt prompt: pure identity block
JSON field: alt_prompt

BONUS — flow_shift
Temporal coherence. Higher = more stable, less dynamic.
Default 12. Range 1-20.
JSON field: flow_shift

BONUS — NAG_scale  
Normalised Attention Guidance.
Enhances prompt adherence via different mechanism to CFG.
Default 1. Range 1-3.
JSON field: NAG_scale

BONUS — guidance2_scale
Low noise phase CFG. Largely unexplored.
Currently default 3 in all production saves.
JSON field: guidance2_scale
```

---

## BUILD ORDER FOR EDMUND

**Phase 1 — Core (Day 1):**
1. Project scaffold — React + Node + Tailwind
2. Backend REST API — all endpoints
3. File watcher — auto-ingest JSONs
4. Data models — all schemas
5. Basic frontend — three panel layout
6. Episode tracker kanban
7. Clip detail view

**Phase 2 — Evaluation Engine (Day 1-2):**
8. Evaluation panel — all sliders
9. Score calculation — live totals
10. Attribution dropdowns with rope reference
11. Save evaluation — writes record
12. Score trend graph

**Phase 3 — Generation Engine (Day 2):**
13. JSON diff view
14. Next iteration JSON generator — rope-aware field editing
15. Auto filename increment
16. Iteration lineage tree

**Phase 4 — Production Workflow (Day 2):**
17. Production lock workflow
18. DaVinci metadata sidecar
19. Production queue panel
20. Export queue to Wan2GP format

**Phase 5 — Registry and Templates (Day 3):**
21. Character registry
22. New scene from character template
23. Prompt template library
24. Rope effectiveness graph
25. Comparison view

---

## FIRST REAL WORLD TEST

As soon as Phase 1-2 is complete — load monaco_iter_01.json, run the evaluation, score it, attribute it, generate monaco_iter_02.json. If that workflow runs cleanly end to end the core is working.

Everything else is enhancement.

---

## NOTES FROM TENZING

- This tool was conceived during the Kebbin's Shop production session on 2026-03-22
- The five rope methodology was developed empirically during mckdhn LoRA evaluation
- The evaluation framework replaced subjective "pretty good" assessment
- Iteratarr fills a genuine gap — no existing tool combines JSON management, structured evaluation, rope attribution, and production lock workflow
- The closest analogues are MLflow (experiment tracking), ComfyUI workflow tracker, and Notion kanban — Iteratarr steals the best ideas from all three
- Design philosophy: utilitarian but handsome. Terminal meets broadcast suite.
- The tool should feel like it belongs in a professional production environment
- Real world test begins immediately on completion of Phase 2

---

*Iteratarr v1.0 — Built for Kebbin's Shop. Ground floor. The wheel didn't exist.*
