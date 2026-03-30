# Disk Growth Strategy — Design Spec
**Issue:** coaxk/iteratarr#26
**Date:** 2026-03-30
**Phase:** 5

---

## Problem

At 100 iterations: 613 MB frames + 230 MB contact sheets = ~843 MB.
Projected at 1000 iterations: ~9.5 GB (PNG frames ~7 MB each × 32 frames + contact sheets ~2-4 MB each).
No cleanup strategy exists today. Disk grows unbounded.

---

## Core Philosophy

Frames are a **working cache** — needed during active review, disposable once a branch's lifecycle ends or it goes stagnant.
Contact sheets are a **permanent record** — always kept, never purged.
The system enforces this automatically based on branch lifecycle, with the user in full control of exceptions.

**Projected footprint after this feature at 1000 iterations:**

| | Before | After |
|---|---|---|
| Frames (PNG, immediate) | ~7 GB | ~1.8 GB (WebP, lazy) |
| Contact sheets (PNG) | ~2.5 GB | ~0.7 GB (WebP) |
| **Total** | **~9.5 GB** | **~2.5 GB** |

---

## 1. Schema Additions

No migrations required — store uses JSON data blobs. New fields appear on first update.

**`branches` record:**
- `last_viewed_at` — ISO timestamp. Patched when user opens a branch. Primary staleness signal.
- `keep_frames_forever` — boolean, default `false`. User opt-out of all automated frame cleanup for this branch.

**`iterations` record:**
- `frames_extracted` — boolean, default `false`. Set `true` once full frame extraction completes.
- `frames_extracted_at` — ISO timestamp. Set alongside `frames_extracted`.

**`store/index.js`:**
- Add `PRAGMA auto_vacuum = INCREMENTAL` alongside existing WAL pragma. Prevents SQLite file bloat after bulk frame metadata deletes.

---

## 2. WebP Conversion

Convert all frame images (individual frames + contact sheets) from PNG to WebP at generation/extraction time. ~70% size reduction. Claude Vision API accepts WebP natively.

**Files requiring changes:**

| File | Change |
|---|---|
| `backend/routes/frames.js` | Extraction output: `frame_NNN.png` → `frame_NNN.webp`. Two regex filters `/^frame_\d{3}\.png$/` → `/^frame_\d{3}\.webp$/` (file listing + security check for serving). |
| `backend/routes/contactsheet.js` | Sharp pipeline: `.png()` → `.webp({ quality: 90 })`. Output filename: `.png` → `.webp`. Input filter: add `.webp` alongside `.png`/`.jpg`. |
| `backend/routes/analytics.js` | Two regex filters `/^frame_\d{3}\.png$/` → `/^frame_\d{3}\.webp$/` (personality profile aggregation + seed detail). |
| `backend/vision-scorer.js` | Media type detection: add `.webp` → `'image/webp'` case. Covers both frames and contact sheets submitted to Vision API. |

**Frontend:** Zero changes needed. All components consume URLs — extension is transparent to `<img>` tags. Chromium handles WebP natively.

**`startsWith('contact_sheet')` patterns** throughout analytics and frames listing are already extension-agnostic. No changes needed there.

**Existing PNG frames on disk** (pre-feature) are not retroactively converted. They will be cleaned up naturally through lifecycle and stagnant rules. New extractions from this point forward produce WebP.

---

## 3. Lazy Frame Extraction

**Current behaviour:** All 32 frames extracted immediately after render completes (~7 MB per iteration, always).

**New behaviour:**

### On render complete
Extract **6 key frames** (evenly spaced across the video: positions 1, 7, 13, 19, 25, 31 of 32) into `data/frames/{iteration_id}/` immediately.
These thumbnail-grade frames serve the quick-scan strip and comparison grid.
Set `frames_extracted: false` on the iteration record.
~1 MB per iteration instead of 7 MB.

### On first iteration open (lazy trigger)
If `frames_extracted === false`:
- Trigger `POST /api/frames/extract` for the iteration
- Show `"Extracting frames…"` spinner in FrameStrip while in progress
- On complete: set `frames_extracted: true`, `frames_extracted_at: now` on iteration record
- Invalidate frames query → FrameStrip populates

Subsequent opens: instant. Files on disk. `staleTime: Infinity` on the frames query.

### Predictive pre-fetch (session caching)
On iteration open, fire-and-forget extraction for adjacent iterations (N-1, N+1) if `frames_extracted === false`.
No UI feedback — silent background operation.
By the time user navigates to an adjacent iteration, frames are already extracted.

---

## 4. Cleanup Rules

### Immediate — lifecycle-triggered
| Event | Action |
|---|---|
| Branch status → `locked` | Delete `data/frames/{iteration_id}/` for all iterations on branch. Keep contact sheets. Toast: `"Frames purged for seed:XXXXXX — X MB reclaimed"`. |
| Branch status → `abandoned` | Same as locked. |

These fire in the branch update route when status transitions to `locked` or `abandoned`.

### Stagnant branch cleanup — user-controlled

A branch qualifies as stagnant if **all** of:
- `keep_frames_forever !== true`
- Status is not `locked` or `abandoned` (already handled above)
- `last_viewed_at` > 7 days ago (grace period — recently visited branches are excluded)
- At least one of:
  - No new iteration in > N days (N = `auto_purge_days` setting, default `never`)
  - PLATEAU signal: last 4 scored iterations show no score improvement
  - NO_EVALS: 3+ iterations exist with zero evaluations

Stagnant branches surface in the Storage page. Auto-purge only fires if user has explicitly set `auto_purge_days` to a value other than `never`.

---

## 5. Storage Page

**Navigation:** New top-level entry in main nav. Accessible any time — not buried in settings.

### Layout

**Header:**
```
Storage                              [Purge all stagnant  X MB]
4.2 GB total  ·  2.7 GB reclaimable
```

**Summary cards (3):**
- `Frames` — current reclaimable frames disk usage + purge-all action
- `Contact Sheets` — permanent, display only, no purge
- `Auto-purge` — current setting with inline edit (7 / 14 / 30 / 60 / Never)

**Scheduled for auto-purge** *(only shown if auto_purge_days is set and branches are within 7 days of threshold):*
- Lists branches with exact purge date, reclaimable size, postpone / keep-forever per branch

**Stagnant branches table:**

| Branch | Clip | Idle | Frames | Reason | Actions |
|---|---|---|---|---|---|
| seed:874959606 | Mick Balcony | 18d | 84 MB | plateau | Purge · Keep |
| seed:1365626143 | Jack Doohan | 31d | 91 MB | no evals | Purge · Keep |

- Sorted by reclaimable size descending
- `Purge` → deletes frames for all iterations on branch → inline `"91 MB reclaimed ✓"` → row fades out
- `Keep` → sets `keep_frames_forever: true` on branch → removes row permanently
- Locked/abandoned branches never appear — frames already gone at lifecycle event

**Settings (bottom of page, persisted to `config.json`):**
- `Auto-purge frames after:` — 7 / 14 / 30 / 60 / **Never** (default Never)

### Backend endpoint: `GET /api/storage`

Single-pass aggregation on load:
1. Load all branches, iterations, evaluations
2. For each branch: compute stale score using PLATEAU/NO_EVALS logic (same as analytics overview, scoped to branch level) + sum `fs.stat` sizes across `data/frames/{iteration_id}/` dirs
3. Return summary totals + ranked stagnant branch list + current settings

```json
{
  "summary": {
    "frames_bytes": 640122880,
    "contact_bytes": 241172480,
    "reclaimable_bytes": 287309824
  },
  "stagnant": [
    {
      "branch_id": "...",
      "clip_name": "Mick Balcony",
      "seed": 874959606,
      "idle_days": 18,
      "frames_bytes": 88080384,
      "stale_reason": "plateau"  // one of: "plateau" | "no_evals" | "idle"
    }
  ],
  "scheduled_purge": [],
  "settings": { "auto_purge_days": null }
}
```

Disk usage via recursive `fs.promises.stat` — portable Node, no shell commands.

### Frontend

- `useQuery({ queryKey: ['storage'], staleTime: 5 * 60 * 1000 })` — loads once, 5 min stale
- Purge action: `useMutation` → `DELETE /api/storage/branch/:id/frames` (deletes `data/frames/{iteration_id}/` for all iterations on the branch, returns `{ bytes_reclaimed }`) → on success `invalidateQueries(['storage'])`
- Keep-forever: `useMutation` → `PATCH /api/branches/:id` with `{ keep_frames_forever: true }` → `invalidateQueries(['storage'])`

---

## 6. User Communication

**Principle: tell the user what happened, what's coming, and what they can do — never surprise them.**

### Proactive (before deletion)
- **Nav badge:** `Storage ⚠ 3` when branches are ≤7 days from auto-purge threshold
- **Scheduled purge section** on Storage page shows exact dates and sizes before anything fires
- **Auto-purge default is Never** — user must opt in explicitly. No silent background deletions until they do.

### At-action (when something happens)
- **Branch lock/abandon** → toast (bottom-right, 5s): `"Frames purged for seed:874959606 — 91 MB reclaimed"`
- **Manual purge from Storage page** → inline confirmation replaces row: `"91 MB reclaimed ✓"` → row fades. No modal needed.
- **First lazy extraction** → FrameStrip shows `"Extracting frames…"` spinner. User understands the brief wait.
- **Pre-fetch (N-1, N+1)** → fully silent. No UI feedback.

### Passive (ambient awareness)
- Storage page summary always visible even with nothing to clean up: `"4.2 GB total · 0 B reclaimable — nothing to clean up"`
- Settings line always shows current policy inline: `"Frames auto-purge: Never (change)"`

---

## 7. Onboarding Integration Note

**coaxk/iteratarr#21 (First-launch onboarding wizard)** will need to surface:
- `iteratarr_data_dir` — where frames and contact sheets are stored (currently `./data`, should be configurable)
- `auto_purge_days` — storage policy set at first launch with a clear explanation
- A storage health summary as part of the onboarding completion screen

The Storage page endpoint and settings schema designed here should be built with onboarding in mind: `config.json` is the single source of truth for `auto_purge_days`, and the Storage page's summary response can be reused in the onboarding completion step to show initial footprint.

When onboarding is built, consider allowing `iteratarr_data_dir` to be redirected to a different drive (common on Windows — OS on C:, data on D:). The frames/contact sheets path should resolve relative to `iteratarr_data_dir`, which it already does via `config.iteratarr_data_dir`.

---

## 8. Testing

- **WebP conversion:** Assert extracted frames and contact sheets have `.webp` extension and are valid images. Assert Vision API media type is `image/webp` for `.webp` files.
- **Lazy extraction:** Assert `frames_extracted: false` after render. Assert `frames_extracted: true` after first open trigger. Assert full frame count only present after trigger.
- **Predictive pre-fetch:** Assert adjacent iteration extraction triggered on open (mock the extraction endpoint).
- **Lifecycle cleanup:** Assert frames dirs deleted on branch lock/abandon. Assert contact sheets untouched.
- **Stagnant detection:** Assert PLATEAU/NO_EVALS signals correctly score branches. Assert `keep_frames_forever` branches never appear in stagnant list. Assert `last_viewed_at` within 7 days excludes branch.
- **Storage endpoint:** Assert `frames_bytes` totals match actual disk. Assert `reclaimable_bytes` excludes locked/abandoned branches (already cleaned). Assert `scheduled_purge` list only populated when `auto_purge_days` is set.
- **Existing tests:** All 113 current tests must continue to pass. Frame-related routes (`/api/frames`, `/api/contactsheet`, `/api/analytics/seeds`) need updated regex assertions for `.webp`.
