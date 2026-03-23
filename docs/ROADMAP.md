# Iteratarr Roadmap

## Phase 1: Foundation Cleanup (Next Session)
*Strip fat, fix bugs, solidify the base before adding branches.*

### 1.1 Clip-First Simplification
- [ ] Remove project/scene from main navigation
- [ ] Clips become top-level entities on Episode Tracker
- [ ] Add optional tags on clips for grouping (replaces project hierarchy)
- [ ] Add character filter on clip list
- [ ] Keep project/scene data in DB but hidden from core UX

### 1.2 UX Critical Fixes (from audit)
- [ ] Evaluation panel — read-only banner with explicit "Go to next" navigation
- [ ] Video comparison — guidance text when renders not loaded
- [ ] Validation feedback on Save & Generate (why is it greyed out?)
- [ ] Copy button consistency — extract reusable CopyButton component
- [ ] Goal save confirmation feedback

### 1.3 User Guidance Layer
- [ ] Empty state messages on every view ("No clips yet. Create one to start.")
- [ ] Tooltips on non-obvious elements (score ring, ghost markers, ropes)
- [ ] One-line "what is this?" descriptions at top of each view
- [ ] Contextual hints in the evaluation workflow

### 1.4 Quick Fixes
- [ ] Seed screening: remove duplicate reference images bar
- [ ] Frame strip polling timeout + user feedback
- [ ] LoRA name formatting in production queue
- [ ] Tag backspace confirmation

## Phase 2: Branch Architecture
*The per-seed branching system. Build on clean clip-first foundation.*

### 2.1 Plan A: Data Model + API + Migration
- [ ] Branch collection (clip_id, seed, name, status, base_settings)
- [ ] branch_id on iterations (optional, backward compatible)
- [ ] Branch CRUD API routes
- [ ] Wire iterations to branches (create, propagate, filter)
- [ ] Lock cascade (lock one branch, supersede others)
- [ ] Seed screening → branch creation
- [ ] Migration for existing data
- [ ] Per-branch iteration numbering
- [ ] Branch-aware file paths (clip/seed-544/iterations/)

### 2.2 Plan B: Branch UI + Navigation
- [ ] Branch selector pill bar in clip detail
- [ ] Filter iterations by selected branch
- [ ] Branch status badges
- [ ] Branch management (rename, mark stalled/abandoned)
- [ ] Multiple branch creation from seed screening

### 2.3 Plan C: Cross-Branch Features
- [ ] Cross-branch comparison view
- [ ] Multi-branch score trends (overlay lines)
- [ ] Cross-branch rope effectiveness
- [ ] Settings carry-forward (inherit from any branch)
- [ ] Fork from any iteration in any branch

## Phase 3: Wan2GP Integration
*Full automation of the render pipeline.*

### 3.1 Render Bridge Hardening
- [ ] GPU status panel (temp, utilization, VRAM, power via nvidia-smi)
- [ ] Real-time render progress (parse Wan2GP stdout for step count)
- [ ] Queue management UI (current job, queue depth, ETA)
- [ ] Cancel render support
- [ ] Auto-submit on "Save & Generate Next"
- [ ] Batch render for seed screening (one-click)

### 3.2 Wan2GP Python API Integration
- [ ] Replace headless CLI with in-process API (shared/api.py)
- [ ] Persistent model loading (no reload per render)
- [ ] Real-time progress events (step count, preview images)
- [ ] Render time drops from 20min to 15min (no model reload overhead)

## Phase 4: Iteratarr PRO — Vision API
*The scaling breakthrough. Near-autonomous iteration loop.*

### 4.1 Architect
- [ ] Claude Vision API integration design
- [ ] Frame selection strategy (which frames to send)
- [ ] Structured scoring prompt template
- [ ] Calibration loop design (feed historical deltas back)

### 4.2 Build
- [ ] Extract frames → send to Claude Vision API
- [ ] Structured 15-field scoring response
- [ ] Pre-fill sliders with AI scores
- [ ] AI vs human score deltas (already in data model)
- [ ] Calibration feedback in Vision prompt
- [ ] PRO tier gating

## Phase 5: Analytics + Intelligence
*The data becomes the product.*

### 5.1 Cross-Clip Analytics Dashboard
- [ ] All clips overview (status, scores, progress)
- [ ] Per-character performance across clips
- [ ] Cross-clip rope effectiveness
- [ ] Score distribution histograms
- [ ] Stalling detection ("Consider forking from your best iteration")

### 5.2 Seed Intelligence
- [ ] Seed screening mode (DONE)
- [ ] Seed variance research tooling
- [ ] Seed personality profiling (automated frame analysis)
- [ ] Seed library (searchable, scored, profiled)

### 5.3 Prompt Intelligence
- [ ] Prompt versioning — word-level diff across iterations
- [ ] Prompt effectiveness tracking (which prompt changes improved scores)
- [ ] Prompt template recommendations from telemetry

## Phase 6: Production + Release
*Ship it.*

### 6.1 Cloud Render Integration
- [ ] fal.ai API integration (Wan2.2 + LoRA, $0.04-0.08/sec)
- [ ] RunPod serverless API
- [ ] Provider-agnostic render interface
- [ ] "Render in Cloud" button

### 6.2 Polish
- [ ] Security audit + testing protocol
- [ ] Onboarding wizard (first-launch setup)
- [ ] Backup/restore for project data
- [ ] DB export as portable format
- [ ] Guided walkthrough overlay
- [ ] Simple mode vs power mode toggle

### 6.3 Community Release
- [ ] Telemetry opt-in collection service
- [ ] Recommendation engine (from aggregated data)
- [ ] Pinokio 1-click installer
- [ ] Public documentation
- [ ] Seed library SaaS product
