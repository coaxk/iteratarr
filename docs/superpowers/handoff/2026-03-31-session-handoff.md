# Session Handoff — 2026-03-31

## What Was Done This Session

### Tasks Completed
- **#30** ClipDetail useCallback optimization — `guardNavigation`, `handleLaunchBranch`, `handleSeedSelected` all stabilized with `useCallback`
- **#31** Removed dead `drillBranchId → selectedBranchId` useEffect from `useBranchNav` (was never needed; `drillIntoBranch()` sets both atomically)
- **#32** Fixed stale `useClipMeta` state when clip prop changes identity — added `useEffect([clip.id])` to re-sync goal/name drafts
- **#9** JSON override editor in EvaluationPanel — collapsible textarea pre-populated with vision-proposed next JSON, validates live, applies via `json_contents_override` on generate

### Bug Fixes
- Vision API 502 Bad Gateway not handled → added to overloaded error group with clear message
- Model ID `claude-sonnet-4-20250514` → `claude-sonnet-4-6` everywhere, centralized via `config.vision_model`
- 75 frame directories with old `.png` files invisible to app → updated all filters/validators to accept both `.png` and `.webp`
- `FrameStrip` lazy extraction guard `frames_extracted !== false` → `frames_extracted === true` (was skipping `null` on new iterations)
- `--env-file=.env` missing from `npm start` / `npm run dev` → API key was lost on backend restart
- Vision scoring "could not process image" → `dedupeFrames` helper in `vision.js` prefers WebP over PNG per frame number, filters files <1KB (catches corrupted empty ffmpeg writes like `frame_032.webp` at 8 bytes)

### Key Commits (newest first)
- `31e8f7b` feat(eval): JSON override editor + fix --env-file in npm scripts
- `657f7b4` fix(vision): dedupe PNG/WebP frames and skip corrupted files before scoring
- `9387a47` fix(frames): accept legacy PNG frames + fix lazy extraction guard
- `4cf443f` refactor(vision): centralize model via config.vision_model
- `93b4ac9` fix(vision): handle 502 Bad Gateway explicitly, upgrade model to sonnet-4-6
- `c9fe9cd` refactor(clips): stabilize callbacks, remove dead effect, fix stale clip state

## State of the Codebase
- All fixes committed. Branch `main`, 19 commits ahead of origin.
- Backend: `npm run dev` now auto-loads `.env` — no more manual env injection.
- PNG frames on disk: left in place. `dedupeFrames` silently prefers WebP. No re-extraction needed.
- `frame_032.webp` (8 bytes, iteration `bbdac8ad`): still on disk but skipped by size filter.

## Next Steps
1. **#18 Prompt Intelligence brainstorm** — this is the main track. Resume brainstorming session.
2. **#10** Regenerate Jack Doohan iter_10 replacement (manual production task)
3. **GUI testing pass** — Judd doing a manual pass before #18; flag any regressions.
4. **#13** Security audit + testing protocol
5. **#14** Elder Council pre-release review

## Architecture Notes
- `dedupeFrames(dir, files)` is in `backend/routes/vision.js` — used by both single-score and batch routes.
- `config.vision_model` default in `config.js` = `'claude-sonnet-4-6'`. Override via `config.json`.
- PNG/WebP dual-format support is a legacy read path only. New extractions always write WebP.
- JSON override: `POST /api/iterations/:id/generate` accepts `{ json_contents_override: {...} }` — applied after whitelist strip, appended to `change_from_parent`.
