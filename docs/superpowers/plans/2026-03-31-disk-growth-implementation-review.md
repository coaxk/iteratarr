# Disk Growth Implementation Review

Date: 2026-03-31  
Primary implementation commit: `1c57dd8` (`feat(#26): implement disk growth strategy with WebP, lazy extraction, lifecycle cleanup, and storage UI`)

## Scope confirmation

This document confirms three follow-up threads requested after the disk growth implementation.

## 1) `backend/routes/vision.js` touched — related fix or drift?

Result: **Related WebP compatibility fix (in-scope), no drift.**

What changed in `1c57dd8`:
- Added `frameFilePattern = /^frame_\d{3}\.(webp|png)$/i`
- Replaced hardcoded `frame_###.png` filters in:
  - estimate route
  - single score route (`use_frames` and fallback branch)
  - batch score route

Why this is correct:
- Disk-growth conversion moved new frame extraction to WebP.
- Without this change, Vision scoring would stop discovering new frame sets.
- Legacy PNG support was intentionally preserved for backward compatibility.

## 2) `frontend/src/components/evaluation/EvaluationPanel.jsx` touched locally — conflict risk?

Result: **No conflict with disk-growth commit; JSON override work remains intact.**

Verification:
- `EvaluationPanel.jsx` is **not included** in commit `1c57dd8`.
- It remains a separate local change set containing the JSON override editor flow:
  - `useMemo` import + `proposedNextJson`
  - `showJsonPatch`, `jsonPatchText`, `jsonPatchError` state
  - `getJsonOverride()`
  - passing `json_contents_override` into `api.generateNext(...)`
  - UI block for “Customise next iteration JSON”

Conclusion:
- Disk-growth feature did not overwrite or regress the override-editor work.
- This file can be reviewed/committed independently when ready.

## 3) `frontend/src/components/screening/SeedScreening.jsx` touched — related or drift?

Result: **Related API signature alignment (in-scope), no drift.**

What changed in `1c57dd8`:
- Updated extract call from:
  - `api.extractFrames(record.render_path, record.id, 4)`
- To:
  - `api.extractFrames(record.id, record.render_path, 4)`

Why this is correct:
- `api.extractFrames` was standardized to `(iterationId, videoPath, count=32)` during lazy-extraction refactor.
- Seed screening needed this parameter order update to keep frame extraction working.
- No behavioral changes beyond argument order alignment.

## Final status

- Disk-growth feature is fully implemented and pushed in `1c57dd8`.
- Backend tests passed: `126/126`.
- Frontend build passed.
- The three files above are validated with expected intent and no accidental drift.

