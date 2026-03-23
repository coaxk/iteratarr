# FEATURE SPEC: Seed Screening Mode
**Task:** New feature for Iteratarr  
**Priority:** High — blocks production workflow improvement  
**Estimated scope:** Medium (new UI component, light backend work, reuses existing infrastructure)

---

## Overview

A lightweight "Step 0" workflow for visually comparing renders across multiple seeds before committing to a seed for the iteration loop. Think contact sheet, not evaluation panel. No formal scoring — just visual comparison against reference photos to pick the best natural starting point.

---

## User Flow

1. User clicks "New Seed Screen" (from clip detail or new top-level nav item)
2. User selects a clip (or creates one) and provides:
   - Base generation JSON (settings + prompts to hold constant)
   - Number of seeds to test (default 6, max 12)
   - Optional: manually specify seeds, otherwise auto-generate random
   - Optional: reference images for the character (displayed alongside for comparison)
3. System generates N JSON files — identical except for seed and output_filename
4. User renders them in Wan2GP (batch or sequential)
5. System detects completed renders (same polling as iteration workflow)
6. Results displayed as a **contact sheet grid**:
   - Thumbnail per seed (first frame or best frame from FFmpeg extraction)
   - Seed number displayed below each thumbnail
   - Click thumbnail to expand and see all 4 extracted frames
   - Click to play the video inline
7. User clicks "Select Seed" on their preferred result
8. Selected seed becomes the locked seed for that clip's iteration loop
9. All screening renders archived but not formally scored

---

## UI Design

### Contact Sheet Grid
- 2x4 or 3x3 grid layout depending on count
- Each cell: thumbnail (16:9 aspect), seed number below, "Select" button
- Highlight border on hover
- Selected seed gets orange border (consistent with Iteratarr accent colour)
- Optional: reference images pinned at top of the grid for easy comparison

### Expanded View (click on thumbnail)
- 4 extracted frames in a horizontal strip (same as iteration frame strip)
- Video player below
- Seed number, render duration, file size displayed
- "Select This Seed" button
- "Back to Grid" button

### Integration with Clip Detail
- New state: "Screening" before "In Progress"
- Kanban column: NOT STARTED → **SCREENING** → IN PROGRESS → EVALUATING → LOCKED → IN QUEUE
- Once seed is selected, clip transitions to "In Progress" and iteration loop begins
- Screening data persists — viewable from clip detail as a collapsed "Seed Screening" section

---

## Backend

### JSON Generation
- New endpoint: `POST /api/clips/:clipId/seed-screen`
- Body: `{ seeds: [array of seeds], count: 6 }` (if seeds empty, auto-generate random)
- Generates N JSON files in the clip's `iterations/` folder with naming: `clip-name_seed-screen_01.json` etc
- Each JSON identical except `seed` and `output_filename` fields
- Returns array of generated filenames

### Render Detection
- Same polling mechanism as existing iteration workflow
- Watches Wan2GP outputs folder for `clip-name_seed-screen_*.mp4`
- Auto-extracts frames on detection (1 frame for thumbnail, 4 frames for expanded view)

### Seed Selection
- `POST /api/clips/:clipId/select-seed`
- Body: `{ seed: 283941567 }`
- Updates clip record with locked seed
- Generates iter_01 JSON with selected seed and base settings
- Transitions clip status to "in_progress"

### Storage
- Screening renders stored in `clip-path/seed-screening/` subfolder
- Frames stored in `clip-path/seed-screening/frames/`
- Screening metadata in SQLite: seed_screens table (clip_id, seed, render_path, frame_paths, selected, created_at)

---

## Data / Telemetry

Every seed screen generates useful data:
- Number of seeds tested per clip
- Which seed was selected (and its position — was it seed 1, 3, 7?)
- Variance in "natural identity quality" across seeds for the same settings
- If formal scoring is ever added to screening, seed-to-score correlations

Store screening results in telemetry even without formal scores — the selection itself is a data point.

---

## Edge Cases / Notes

- User might want to add more seeds after seeing initial results — support "Add Seeds to Screen" 
- User might want to re-screen with different settings — allow new screen on same clip
- Existing clips with iterations already running should still be able to access screening (to test a seed change mid-iteration, which is what we just did)
- Seeds should be copyable (click to copy, consistent with character registry copy buttons)
- Consider showing seed as both number and a tiny visual hash/colour indicator for quick visual distinction

---

## Relation to Existing Features

- Reuses: FFmpeg frame extraction, file browser/polling, video player, thumbnail generation
- New: contact sheet grid component, seed-screen API routes, screening status in kanban
- Does NOT replace iteration workflow — screening is Step 0, iteration is Steps 1-4
- Screening renders are separate from iteration renders in the file structure

---

## Minimal Viable Version

If time is tight, the MVP is:
1. Generate N JSONs with different seeds (endpoint or even manual)
2. Render externally in Wan2GP
3. Display results in a simple grid with frame extraction
4. Click to select → locks seed on clip

The kanban integration, telemetry hooks, and expanded view can come in v2.
