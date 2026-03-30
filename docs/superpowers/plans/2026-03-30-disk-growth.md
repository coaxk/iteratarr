# Disk Growth Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce unbounded disk growth from PNG frames and contact sheets by converting to WebP, switching to lazy frame extraction, purging frames on branch lifecycle events, and adding a Storage management page.

**Architecture:** Six independent subsystems implemented in order — SQLite schema, WebP pipeline, lazy extraction, lifecycle cleanup, storage API, storage UI. Each subsystem is testable before the next begins. No migrations needed (store uses JSON data blobs).

**Tech Stack:** Node.js/Express, better-sqlite3, fluent-ffmpeg, Sharp (WebP output), React 18, TanStack Query v5, Tailwind CSS.

---

## Orchestrator Notes

You are the builder. I am the orchestrator and will review your work between tasks. **After completing each task, stop and wait for my review before proceeding to the next.** I will confirm each subsystem is correct before we move on. If I ask you to revise, make the changes and re-run the affected tests before checking back.

Read each task in full before starting it. The exact code blocks below are what I want — not approximations. If you encounter a conflict with existing code, pause and describe it rather than improvising.

All tests run from `iteratarr/backend/` with: `npx vitest run`

---

## File Map

**Modified:**
- `backend/store/index.js` — add `auto_vacuum` pragma
- `backend/routes/frames.js` — WebP output, lazy extraction support, pass `store`
- `backend/routes/contactsheet.js` — WebP output + input filter
- `backend/routes/analytics.js` — update two regex filters
- `backend/vision-scorer.js` — add `.webp` media type case
- `backend/routes/branches.js` — delete frames on lock/abandon status transitions
- `backend/routes/queue.js` — change initial extract to 6 frames, set `frames_extracted: false`
- `backend/server.js` — import + register storage route
- `backend/tests/helpers.js` — add frames + storage routes to test app
- `frontend/src/App.jsx` — add `storage` to VIEWS, import + render StoragePage, add StorageBadge
- `frontend/src/api.js` — add storage API methods

**Created:**
- `backend/routes/storage.js` — `GET /api/storage` aggregation + `DELETE /api/storage/branch/:id/frames`
- `backend/tests/routes/frames.test.js` — WebP + lazy extraction tests
- `backend/tests/routes/storage.test.js` — storage endpoint tests
- `frontend/src/components/storage/StoragePage.jsx` — storage management UI

---

## Task 1: SQLite Pragma + Schema Fields

**Files:**
- Modify: `backend/store/index.js:17`

This is a one-line addition. The `PRAGMA auto_vacuum = INCREMENTAL` prevents SQLite file bloat after bulk frame metadata deletes. The schema fields (`last_viewed_at`, `keep_frames_forever`, `frames_extracted`, `frames_extracted_at`) do NOT require explicit migration — the store uses JSON data blobs and these fields appear on first use.

- [ ] **Step 1: Add the pragma to store/index.js**

Open `backend/store/index.js`. Line 17 currently reads:
```js
db.pragma('journal_mode = WAL');
```

Change it to:
```js
db.pragma('journal_mode = WAL');
db.pragma('auto_vacuum = INCREMENTAL');
```

- [ ] **Step 2: Run all existing tests to confirm no regression**

```bash
cd backend && npx vitest run
```

Expected: all existing tests pass (currently 113). If any fail, do not proceed — diagnose first.

- [ ] **Step 3: Commit**

```bash
git add backend/store/index.js
git commit -m "feat(store): add auto_vacuum INCREMENTAL pragma for post-delete file size reclamation"
```

---

## Task 2: WebP Conversion

**Files:**
- Modify: `backend/routes/frames.js`
- Modify: `backend/routes/contactsheet.js`
- Modify: `backend/routes/analytics.js`
- Modify: `backend/vision-scorer.js`
- Create: `backend/tests/routes/frames.test.js`

**Orchestrator review required after this task.**

Convert all frame/contact-sheet output from PNG to WebP. ~70% size reduction. The Claude Vision API accepts WebP natively. Existing PNG frames on disk (pre-feature) are NOT converted — they will be cleaned up via lifecycle rules. New extractions from this point forward produce WebP.

### 2a — frames.js

Four changes:
1. `validateFilename` regex: `\.png$` → `\.webp$`
2. `GET /:iteration_id` listing filter: `\.png$` → `\.webp$`
3. Frame extraction output filename: `frame_NNN.png` → `frame_NNN.webp`
4. FFmpeg output: needs explicit WebP codec flag

- [ ] **Step 1: Update frames.js**

In `backend/routes/frames.js`:

**Line 62** — `validateFilename` regex:
```js
// Before:
if (!/^frame_\d{3}\.png$/.test(filename)) {
  throw new Error('Invalid frame filename format');
}
// After:
if (!/^frame_\d{3}\.webp$/.test(filename)) {
  throw new Error('Invalid frame filename format');
}
```

**Line 131** — extraction output filename:
```js
// Before:
const filename = `frame_${String(i + 1).padStart(3, '0')}.png`;
// After:
const filename = `frame_${String(i + 1).padStart(3, '0')}.webp`;
```

**Line 161** — listing filter:
```js
// Before:
const frames = files
  .filter(f => /^frame_\d{3}\.png$/.test(f))
  .sort();
// After:
const frames = files
  .filter(f => /^frame_\d{3}\.webp$/.test(f))
  .sort();
```

**Line 84–91** — `extractFrame` function — add WebP output format:
```js
// Before:
function extractFrame(videoPath, timestamp, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`Frame extraction failed: ${err.message}`)))
      .run();
  });
}
// After:
function extractFrame(videoPath, timestamp, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .output(outputPath)
      .outputOptions(['-vcodec', 'libwebp', '-quality', '85'])
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`Frame extraction failed: ${err.message}`)))
      .run();
  });
}
```

**Line 194–210** — `GET /:iteration_id/:filename` serve route — update `validateFilename` used here is already updated above. Also update the `res.sendFile` route's MIME type if Express doesn't auto-detect WebP. Add explicit Content-Type:

In the serve route, after `const filePath = join(framesRoot, iterationId, filename);`:
```js
// Add after the resolved path check, before res.sendFile:
res.setHeader('Content-Type', 'image/webp');
res.sendFile(resolved);
```

Replace the existing `res.sendFile(resolved);` with those two lines.

### 2b — contactsheet.js

Three changes: Sharp pipeline output, output filename extension, input file filter.

- [ ] **Step 2: Update contactsheet.js**

In `backend/routes/contactsheet.js`:

**Line 43** — input frame filter (add `.webp`):
```js
// Before:
const files = readdirSync(framesDir)
  .filter(f => (f.endsWith('.png') || f.endsWith('.jpg')) && !f.startsWith('contact_sheet'))
// After:
const files = readdirSync(framesDir)
  .filter(f => (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')) && !f.startsWith('contact_sheet'))
```

**Lines 139–141** — Sharp output pipeline:
```js
// Before:
.composite(composites)
.png()
.toBuffer();
// After:
.composite(composites)
.webp({ quality: 90 })
.toBuffer();
```

**Line 152** — output filename:
```js
// Before:
const outFilename = filename || `contact_sheet_${metadata?.seed || frame_id || 'manual'}.png`;
// After:
const outFilename = filename || `contact_sheet_${metadata?.seed || frame_id || 'manual'}.webp`;
```

### 2c — analytics.js

Two regex filters that enumerate frame files.

- [ ] **Step 3: Update analytics.js**

In `backend/routes/analytics.js`:

**Line 72** — `resolveFramePreview` function:
```js
// Before:
const frame = files.filter(filename => /^frame_\d{3}\.png$/.test(filename)).sort()[0];
// After:
const frame = files.filter(filename => /^frame_\d{3}\.webp$/.test(filename)).sort()[0];
```

**Line 122** — `buildSeedPersonalityProfile` function:
```js
// Before:
const frameFiles = files.filter(filename => /^frame_\d{3}\.png$/.test(filename)).sort();
// After:
const frameFiles = files.filter(filename => /^frame_\d{3}\.webp$/.test(filename)).sort();
```

### 2d — vision-scorer.js

One line — add `.webp` case to media type detection.

- [ ] **Step 4: Update vision-scorer.js**

In `backend/vision-scorer.js`, **line 115**:
```js
// Before:
const ext = fp.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
// After:
const ext = fp.toLowerCase().endsWith('.png') ? 'image/png'
  : fp.toLowerCase().endsWith('.webp') ? 'image/webp'
  : 'image/jpeg';
```

The same pattern also appears at line ~130 for reference images. Apply the same fix there too:
```js
// Before (reference image loop):
const ext = refPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
// After:
const ext = refPath.toLowerCase().endsWith('.png') ? 'image/png'
  : refPath.toLowerCase().endsWith('.webp') ? 'image/webp'
  : 'image/jpeg';
```

### 2e — Write frames tests

- [ ] **Step 5: Create backend/tests/routes/frames.test.js**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import { createFrameRoutes } from '../../routes/frames.js';
import { createStore } from '../../store/index.js';

function createFrameTestApp(dataDir, store) {
  const app = express();
  app.use(express.json());
  app.use('/api/frames', createFrameRoutes(dataDir, store));
  return app;
}

describe('Frames API — WebP output', () => {
  let tmpDir, request, store;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-frames-test-'));
    store = createStore(tmpDir);
    request = supertest(createFrameTestApp(tmpDir, store));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /:iteration_id returns empty frames array when no files exist', async () => {
    const res = await request.get('/api/frames/test-iter-001');
    expect(res.status).toBe(200);
    expect(res.body.frames).toEqual([]);
  });

  it('GET /:iteration_id lists only .webp frames (not .png)', async () => {
    const iterDir = join(tmpDir, 'frames', 'test-iter-001');
    mkdirSync(iterDir, { recursive: true });
    // Create both .webp and .png files — only .webp should be listed
    writeFileSync(join(iterDir, 'frame_001.webp'), 'fake-webp-data');
    writeFileSync(join(iterDir, 'frame_002.webp'), 'fake-webp-data');
    writeFileSync(join(iterDir, 'frame_003.png'), 'old-png-data'); // legacy file — should NOT appear

    const res = await request.get('/api/frames/test-iter-001');
    expect(res.status).toBe(200);
    expect(res.body.frames).toEqual(['frame_001.webp', 'frame_002.webp']);
    expect(res.body.frames).not.toContain('frame_003.png');
  });

  it('GET /:iteration_id/:filename rejects .png filenames', async () => {
    const iterDir = join(tmpDir, 'frames', 'test-iter-001');
    mkdirSync(iterDir, { recursive: true });
    writeFileSync(join(iterDir, 'frame_001.png'), 'png-data');

    const res = await request.get('/api/frames/test-iter-001/frame_001.png');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid frame filename/i);
  });

  it('GET /:iteration_id/:filename accepts .webp filenames', async () => {
    const iterDir = join(tmpDir, 'frames', 'test-iter-001');
    mkdirSync(iterDir, { recursive: true });
    // Write a minimal valid WebP (44 bytes — the smallest valid WebP header)
    const minimalWebP = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4C,
      0x17, 0x00, 0x00, 0x00, 0x2F, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]);
    writeFileSync(join(iterDir, 'frame_001.webp'), minimalWebP);

    const res = await request.get('/api/frames/test-iter-001/frame_001.webp');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/webp');
  });

  it('DELETE /:iteration_id removes the frame directory', async () => {
    const iterDir = join(tmpDir, 'frames', 'test-iter-del');
    mkdirSync(iterDir, { recursive: true });
    writeFileSync(join(iterDir, 'frame_001.webp'), 'data');

    const res = await request.delete('/api/frames/test-iter-del');
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(existsSync(iterDir)).toBe(false);
  });
});
```

- [ ] **Step 6: Run the new tests — expect them to fail initially (frames.js needs store param)**

```bash
cd backend && npx vitest run tests/routes/frames.test.js
```

The test for `frames_extracted` fields won't run yet — that's Task 3. The WebP listing/serving tests should pass after Step 1–4. If they fail, diagnose before continuing.

Note: `createFrameRoutes` currently only takes `dataDir`. We will pass `store` as second param in Task 3. For now, the test helper passes it but the route ignores it — that's fine.

- [ ] **Step 7: Run all tests to confirm no regressions**

```bash
cd backend && npx vitest run
```

Expected: all prior tests pass + new frames tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/routes/frames.js backend/routes/contactsheet.js backend/routes/analytics.js backend/vision-scorer.js backend/tests/routes/frames.test.js
git commit -m "feat(webp): convert frame extraction and contact sheets from PNG to WebP (~70% size reduction)"
```

**Stop here. Notify the orchestrator for review before Task 3.**

---

## Task 3: Lazy Frame Extraction

**Files:**
- Modify: `backend/routes/frames.js` — accept `store` param, add `frames_extracted` tracking
- Modify: `backend/routes/queue.js` — extract 6 key frames, set `frames_extracted: false`
- Modify: `frontend/src/api.js` — add frames extraction API method
- Modify: `frontend/src/components/[FrameStrip component]` — lazy trigger + spinner + prefetch

**Orchestrator review required after this task.**

### 3a — frames.js store integration

The extract endpoint needs to update `frames_extracted` / `frames_extracted_at` on the iteration record when a full extraction (count ≥ 32) is completed. Pass `store` as an optional second argument to `createFrameRoutes`.

- [ ] **Step 1: Update createFrameRoutes signature and extract endpoint**

In `backend/routes/frames.js`, change the function signature:
```js
// Before:
export function createFrameRoutes(dataDir) {
// After:
export function createFrameRoutes(dataDir, store = null) {
```

In the `POST /extract` handler, after the frames are extracted and `res.json(...)` is called, add iteration record update. Replace the final `res.json(...)` call:

```js
// Before:
res.json({ frames, iteration_id: iterationId, frames_dir: outDir });

// After:
const response = { frames, iteration_id: iterationId, frames_dir: outDir };

// If store is available and a full extraction was done (count >= 32), mark frames_extracted
if (store && count >= 32) {
  try {
    await store.update('iterations', iterationId, {
      frames_extracted: true,
      frames_extracted_at: new Date().toISOString()
    });
    response.frames_extracted = true;
  } catch {
    // Iteration may not exist (e.g. seed screen frames) — not an error
  }
}

res.json(response);
```

### 3b — server.js + helpers.js

Update `createFrameRoutes` call sites to pass `store`.

- [ ] **Step 2: Update server.js**

In `backend/server.js`, line 55:
```js
// Before:
app.use('/api/frames', createFrameRoutes(config.iteratarr_data_dir));
// After:
app.use('/api/frames', createFrameRoutes(config.iteratarr_data_dir, store));
```

In `backend/tests/helpers.js`, add frames route to test helper. Add import at top:
```js
import { createFrameRoutes } from '../routes/frames.js';
```

Add to the app setup (after the existing routes):
```js
app.use('/api/frames', createFrameRoutes(dataDir, store));
```

### 3c — queue.js — 6-frame immediate extraction

After render completes, extract 6 key frames (count=6) and set `frames_extracted: false` on the iteration. This replaces the existing count=4 call.

- [ ] **Step 3: Update queue.js extraction block**

In `backend/routes/queue.js`, find the frame extraction section inside the success block (around line 403–415). Replace the entire `// Auto-extract frames if render exists` block:

```js
// Before:
// Auto-extract frames if render exists
if (iter.render_path && existsSync(iter.render_path)) {
  try {
    await fetch(`http://localhost:${config.port || 3847}/api/frames/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_path: iter.render_path, iteration_id: item.iteration_id, count: 4 })
    });
    console.log(`[Queue] Frames extracted for ${item.clip_name}`);
  } catch {
    // Try direct extraction via the extract endpoint using internal fetch
    console.log(`[Queue] Frame extraction skipped — will extract on view`);
  }
}

// After:
// Extract 6 key frames immediately for thumbnail preview.
// Full 32-frame extraction happens lazily on first iteration open.
if (iter.render_path && existsSync(iter.render_path)) {
  try {
    await fetch(`http://localhost:${config.port || 3847}/api/frames/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_path: iter.render_path, iteration_id: item.iteration_id, count: 6 })
    });
    // Mark frames as not-yet-fully-extracted so frontend triggers lazy full extraction
    await store.update('iterations', item.iteration_id, { frames_extracted: false });
    console.log(`[Queue] 6 key frames extracted for ${item.clip_name} (lazy full extraction pending)`);
  } catch (frameErr) {
    console.log(`[Queue] Frame extraction skipped — will extract on view: ${frameErr.message}`);
  }
}
```

### 3d — api.js — storage/frames methods

- [ ] **Step 4: Add extractFrames method to api.js**

Find `frontend/src/api.js`. Add the following to the exported `api` object (alongside other methods):

```js
extractFrames: (iterationId, videoPath, count = 32) =>
  request('/frames/extract', {
    method: 'POST',
    body: { video_path: videoPath, iteration_id: iterationId, count }
  }),
```

### 3e — Frontend lazy trigger in FrameStrip

First, read the FrameStrip component to understand its current structure. It lives somewhere in `frontend/src/components/`. Search for it:

```bash
grep -r "FrameStrip\|frame_strip\|frames_extracted" frontend/src --include="*.jsx" -l
```

Once you find it, the lazy trigger logic needs to be added. The pattern is:

1. The component receives the current `iteration` object as a prop (which has `json_contents`, `render_path`, `frames_extracted`, etc.)
2. On mount/iteration change: if `iteration.render_path` exists AND `iteration.frames_extracted === false`, trigger `api.extractFrames(iteration.id, iteration.render_path, 32)`
3. Show a loading spinner while extraction is in progress
4. After success: invalidate the frames query so the strip refreshes
5. Prefetch N-1 and N+1 (adjacent iterations) silently — fire and forget

Here is the exact implementation pattern to add. Read the FrameStrip component first, then insert this logic:

**In the component that fetches/displays frames** (wherever `useQuery` for frames is called, likely keyed `['frames', iterationId]`):

```jsx
// Add these imports at top of the file (if not already present):
import { useQueryClient, useMutation } from '@tanstack/react-query';

// Inside the component, after the frames query:
const queryClient = useQueryClient();
const [isExtractingFull, setIsExtractingFull] = useState(false);

const extractMutation = useMutation({
  mutationFn: () => api.extractFrames(iteration.id, iteration.render_path, 32),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['frames', iteration.id] });
  }
});

// Lazy trigger: on mount or iteration change, if frames_extracted === false, trigger full extraction
useEffect(() => {
  if (!iteration?.render_path) return;
  if (iteration.frames_extracted !== false) return; // undefined = old record, don't trigger
  if (extractMutation.isPending) return;

  setIsExtractingFull(true);
  extractMutation.mutate(undefined, {
    onSettled: () => setIsExtractingFull(false)
  });
}, [iteration?.id, iteration?.frames_extracted]);

// Predictive prefetch: silently extract N-1 and N+1 adjacent iterations
useEffect(() => {
  if (!adjacentIterations) return; // prop or query that provides siblings
  for (const adj of adjacentIterations) {
    if (adj.frames_extracted === false && adj.render_path) {
      // Fire and forget — no UI feedback
      api.extractFrames(adj.id, adj.render_path, 32).catch(() => {});
    }
  }
}, [iteration?.id]);
```

**Spinner display:** Where the FrameStrip currently shows "no frames" or the frame thumbnails, add:

```jsx
{isExtractingFull && (
  <div className="flex items-center gap-2 text-xs font-mono text-gray-400 py-2">
    <svg className="animate-spin h-3 w-3 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
    </svg>
    Extracting frames...
  </div>
)}
```

**Important:** `adjacentIterations` — this is an array of adjacent iteration objects (N-1, N+1). If the FrameStrip component doesn't have access to them, look at what iteration list is available in the parent component and pass the adjacent ones down. The prefetch is fire-and-forget; do NOT block rendering on it.

### 3f — Tests for lazy extraction

- [ ] **Step 5: Add lazy extraction tests to frames.test.js**

Add these test cases to `backend/tests/routes/frames.test.js`:

```js
describe('Frames API — lazy extraction tracking', () => {
  let tmpDir, request, store;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-lazy-test-'));
    store = createStore(tmpDir);
    request = supertest(createFrameTestApp(tmpDir, store));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /extract with count < 32 does NOT set frames_extracted on iteration', async () => {
    const iter = await store.create('iterations', {
      clip_id: 'clip-1',
      branch_id: 'br-1',
      iteration_number: 1,
      status: 'rendered',
      frames_extracted: false
    });

    // We can't actually run FFmpeg in tests (no real video), so test the store-update path
    // by creating fake webp files directly and calling the list endpoint
    const iterDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(iterDir, { recursive: true });
    for (let i = 1; i <= 6; i++) {
      writeFileSync(join(iterDir, `frame_00${i}.webp`), 'fake');
    }

    const listRes = await request.get(`/api/frames/${iter.id}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.frames).toHaveLength(6);

    // frames_extracted should still be false (no extract POST was called)
    const updated = await store.get('iterations', iter.id);
    expect(updated.frames_extracted).toBe(false);
  });
});
```

- [ ] **Step 6: Run all tests**

```bash
cd backend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/frames.js backend/routes/queue.js backend/server.js backend/tests/helpers.js backend/tests/routes/frames.test.js frontend/src/api.js frontend/src/components/
git commit -m "feat(lazy-frames): extract 6 key frames on render, trigger full 32 lazily on first open"
```

**Stop here. Notify the orchestrator for review before Task 4.**

---

## Task 4: Lifecycle Cleanup — Frames Deleted on Lock/Abandon

**Files:**
- Modify: `backend/routes/branches.js`

**Orchestrator review required after this task.**

When a branch status transitions to `locked` or `abandoned`, delete all frame directories for all iterations on that branch. Contact sheets are NEVER deleted. Return a toast-friendly summary in the PATCH response.

- [ ] **Step 1: Add frame deletion to branches.js PATCH route**

In `backend/routes/branches.js`, find the `PATCH /:clipId/branches/:id` route (around line 103). The current handler patches the branch and returns. Add frame deletion AFTER the status patch, BEFORE `res.json(updated)`:

```js
// Add these imports at the top of branches.js (if not already present):
import { rm } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';

// Inside PATCH handler, replace:
const updated = await store.update('branches', req.params.id, patch);
res.json(updated);

// With:
const updated = await store.update('branches', req.params.id, patch);

// On lock or abandon: delete all frame dirs for iterations on this branch
let framesReclaimed = null;
if (patch.status === 'locked' || patch.status === 'abandoned') {
  const framesRoot = resolve(config.iteratarr_data_dir || '.', 'frames');
  const iterations = await store.list('iterations', i => i.branch_id === req.params.id);
  let bytesReclaimed = 0;

  for (const iter of iterations) {
    const frameDir = join(framesRoot, iter.id);
    if (existsSync(frameDir)) {
      // Sum size before deleting
      try {
        const { readdirSync, statSync } = await import('fs');
        for (const file of readdirSync(frameDir)) {
          if (!file.startsWith('contact_sheet')) { // never count/delete contact sheets
            try { bytesReclaimed += statSync(join(frameDir, file)).size; } catch { /* ignore */ }
          }
        }
        // Delete only frame files (not contact sheets)
        for (const file of readdirSync(frameDir)) {
          if (!file.startsWith('contact_sheet')) {
            await rm(join(frameDir, file), { force: true });
          }
        }
      } catch { /* directory may not exist */ }
    }
  }

  framesReclaimed = bytesReclaimed;
  console.log(`[Branches] ${patch.status}: purged frames for branch ${req.params.id} — ${Math.round(bytesReclaimed / 1024 / 1024)}MB reclaimed`);
}

res.json({ ...updated, frames_reclaimed_bytes: framesReclaimed });
```

Note: `config` is already passed into `createBranchRoutes(store, config)` — use it for `iteratarr_data_dir`.

- [ ] **Step 2: Add branch lifecycle tests to branches test file**

Open `backend/tests/routes/branches.test.js`. Add this describe block at the end:

```js
describe('Branch PATCH — frame cleanup on lock/abandon', () => {
  it('deletes frame dirs for all iterations when branch is locked', async () => {
    const clip = await store.create('clips', { name: 'Test', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 12345, status: 'active',
      name: 'test-branch', created_from: 'manual', base_settings: {}
    });
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered'
    });

    // Create fake frame directory
    const frameDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(frameDir, 'frame_001.webp'), 'frame-data');
    writeFileSync(join(frameDir, 'contact_sheet_test.webp'), 'sheet-data'); // should NOT be deleted

    const res = await request.patch(`/api/clips/${clip.id}/branches/${branch.id}`)
      .send({ status: 'locked' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('locked');
    expect(res.body.frames_reclaimed_bytes).toBeGreaterThan(0);

    // Frame file should be gone
    expect(existsSync(join(frameDir, 'frame_001.webp'))).toBe(false);
    // Contact sheet should still exist
    expect(existsSync(join(frameDir, 'contact_sheet_test.webp'))).toBe(true);
  });

  it('deletes frame dirs when branch is abandoned', async () => {
    const clip = await store.create('clips', { name: 'Test2', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 99999, status: 'active',
      name: 'abandon-branch', created_from: 'manual', base_settings: {}
    });
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered'
    });

    const frameDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(frameDir, 'frame_001.webp'), 'data');

    const res = await request.patch(`/api/clips/${clip.id}/branches/${branch.id}`)
      .send({ status: 'abandoned' });

    expect(res.status).toBe(200);
    expect(existsSync(join(frameDir, 'frame_001.webp'))).toBe(false);
  });

  it('does NOT delete frames when status changes to non-terminal state', async () => {
    const clip = await store.create('clips', { name: 'Test3', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 11111, status: 'active',
      name: 'keep-branch', created_from: 'manual', base_settings: {}
    });
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered'
    });

    const frameDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(frameDir, 'frame_001.webp'), 'data');

    await request.patch(`/api/clips/${clip.id}/branches/${branch.id}`)
      .send({ status: 'stalled' });

    // Frames should still exist
    expect(existsSync(join(frameDir, 'frame_001.webp'))).toBe(true);
  });
});
```

The branches test file already imports `mkdirSync`, `writeFileSync`, `existsSync` and `join` — check and add any that are missing. Also check that `tmpDir` is accessible in the describe scope (it should be via `beforeEach`).

- [ ] **Step 3: Run all tests**

```bash
cd backend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/branches.js backend/tests/routes/branches.test.js
git commit -m "feat(lifecycle): delete frame files when branch is locked or abandoned, preserve contact sheets"
```

**Stop here. Notify the orchestrator for review before Task 5.**

---

## Task 5: Storage Backend — GET /api/storage + DELETE /api/storage/branch/:id/frames

**Files:**
- Create: `backend/routes/storage.js`
- Modify: `backend/server.js`
- Modify: `backend/tests/helpers.js`
- Create: `backend/tests/routes/storage.test.js`

**Orchestrator review required after this task.**

Single-pass aggregation on load. No background jobs. Reuses the existing PLATEAU/NO_EVALS stall detection logic from analytics — adapt it for branch-level scoring.

### Stagnant branch detection rules (replicate from spec)

A branch qualifies as stagnant if ALL of:
- `keep_frames_forever !== true`
- Status is NOT `locked` or `abandoned`
- `last_viewed_at` is absent OR > 7 days ago
- At least ONE of:
  - PLATEAU: last 4 scored iterations show no score improvement (max score in last 4 ≤ max score in first half)
  - NO_EVALS: 3+ iterations exist with zero evaluations

### 5a — Create storage.js

- [ ] **Step 1: Create backend/routes/storage.js**

```js
import { Router } from 'express';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { readdir, stat, rm } from 'fs/promises';

/**
 * Storage routes — disk usage overview and frame cleanup management.
 *
 * GET  /api/storage                       — aggregated disk usage + stagnant branch list
 * DELETE /api/storage/branch/:id/frames   — delete all frame files for a branch
 */
export function createStorageRoutes(store, config = {}) {
  const router = Router();
  const framesRoot = resolve(config.iteratarr_data_dir || '.', 'frames');
  const sheetsRoot = resolve(config.iteratarr_data_dir || '.', 'contactsheets');

  /** Recursively sum bytes in a directory, excluding contact_sheet* files */
  async function sumFrameBytes(dir) {
    if (!existsSync(dir)) return 0;
    let total = 0;
    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (file.startsWith('contact_sheet')) continue;
        try {
          const s = await stat(join(dir, file));
          if (s.isFile()) total += s.size;
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return total;
  }

  /** Recursively sum all bytes in a directory */
  async function sumAllBytes(dir) {
    if (!existsSync(dir)) return 0;
    let total = 0;
    try {
      const files = await readdir(dir);
      for (const file of files) {
        try {
          const s = await stat(join(dir, file));
          if (s.isFile()) total += s.size;
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return total;
  }

  /** Sum contact sheet bytes across all iteration dirs and the central sheets dir */
  async function sumContactSheetBytes() {
    let total = 0;
    // Central contactsheets directory
    total += await sumAllBytes(sheetsRoot);
    // Also count contact_sheet* files inside frame dirs
    if (!existsSync(framesRoot)) return total;
    try {
      const iterDirs = await readdir(framesRoot);
      for (const iterDir of iterDirs) {
        const full = join(framesRoot, iterDir);
        try {
          const s = await stat(full);
          if (!s.isDirectory()) continue;
          const files = await readdir(full);
          for (const file of files) {
            if (!file.startsWith('contact_sheet')) continue;
            try {
              const fs = await stat(join(full, file));
              if (fs.isFile()) total += fs.size;
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return total;
  }

  /** Detect stagnant reason for a branch given its scored iterations */
  function detectStagnantReason(scoredIters) {
    if (scoredIters.length === 0) return null;

    const unscored = scoredIters.filter(i => !i._score);
    if (unscored.length >= 3) return 'no_evals';

    const scored = scoredIters.filter(i => i._score != null);
    if (scored.length >= 4) {
      const sortedByNum = [...scored].sort((a, b) => (a.iteration_number || 0) - (b.iteration_number || 0));
      const half = Math.floor(sortedByNum.length / 2);
      const firstHalfMax = Math.max(...sortedByNum.slice(0, half).map(i => i._score));
      const lastFourMax = Math.max(...sortedByNum.slice(-4).map(i => i._score));
      if (lastFourMax <= firstHalfMax) return 'plateau';
    }

    return null;
  }

  /**
   * GET /api/storage
   * Returns disk usage summary, stagnant branches, scheduled purge list, and settings.
   */
  router.get('/', async (req, res) => {
    try {
      const [branches, iterations, evaluations] = await Promise.all([
        store.list('branches'),
        store.list('iterations'),
        store.list('evaluations')
      ]);

      // Build lookup maps
      const evalById = Object.fromEntries(evaluations.map(e => [e.id, e]));
      const itersByBranch = {};
      for (const iter of iterations) {
        if (!iter.branch_id) continue;
        if (!itersByBranch[iter.branch_id]) itersByBranch[iter.branch_id] = [];
        itersByBranch[iter.branch_id].push(iter);
      }

      // Enrich iterations with scores
      for (const iter of iterations) {
        if (iter.evaluation_id && evalById[iter.evaluation_id]) {
          iter._score = evalById[iter.evaluation_id].scores?.grand_total || null;
        } else {
          iter._score = null;
        }
      }

      // Compute totals
      let totalFrameBytes = 0;
      let totalContactBytes = 0;
      let reclaimableBytes = 0;

      // Sum all frame dirs
      if (existsSync(framesRoot)) {
        const iterDirs = await readdir(framesRoot).catch(() => []);
        for (const dir of iterDirs) {
          const full = join(framesRoot, dir);
          try {
            const s = await stat(full);
            if (s.isDirectory()) {
              totalFrameBytes += await sumFrameBytes(full);
            }
          } catch { /* ignore */ }
        }
      }
      totalContactBytes = await sumContactSheetBytes();

      // Build stagnant branch list
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const stagnant = [];

      for (const branch of branches) {
        // Skip already-cleaned lifecycle statuses
        if (branch.status === 'locked' || branch.status === 'abandoned') continue;
        // Skip keep-forever
        if (branch.keep_frames_forever === true) continue;

        // Skip recently viewed branches (within 7 days)
        if (branch.last_viewed_at) {
          const viewedMs = new Date(branch.last_viewed_at).getTime();
          if (now - viewedMs < SEVEN_DAYS_MS) continue;
        }

        const branchIters = itersByBranch[branch.id] || [];
        if (branchIters.length === 0) continue;

        const reason = detectStagnantReason(branchIters);
        if (!reason) continue;

        // Sum reclaimable bytes for this branch
        let branchFrameBytes = 0;
        for (const iter of branchIters) {
          branchFrameBytes += await sumFrameBytes(join(framesRoot, iter.id));
        }

        if (branchFrameBytes === 0) continue; // Nothing to reclaim

        // Compute idle days
        const lastActivity = branchIters
          .map(i => new Date(i.created_at || 0).getTime())
          .reduce((max, t) => Math.max(max, t), 0);
        const idleDays = Math.floor((now - lastActivity) / (24 * 60 * 60 * 1000));

        reclaimableBytes += branchFrameBytes;

        stagnant.push({
          branch_id: branch.id,
          clip_id: branch.clip_id,
          seed: branch.seed,
          idle_days: idleDays,
          frames_bytes: branchFrameBytes,
          stale_reason: reason
        });
      }

      // Sort stagnant by reclaimable size descending
      stagnant.sort((a, b) => b.frames_bytes - a.frames_bytes);

      // Load settings
      let settings = { auto_purge_days: null };
      try {
        const { readFileSync } = await import('fs');
        const configPath = resolve(config.iteratarr_data_dir || '.', '..', 'config.json');
        if (existsSync(configPath)) {
          const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
          settings.auto_purge_days = cfg.auto_purge_days || null;
        }
      } catch { /* config.json may not exist */ }

      // Scheduled purge: branches within 7 days of auto_purge threshold
      const scheduled = [];
      if (settings.auto_purge_days) {
        const thresholdMs = settings.auto_purge_days * 24 * 60 * 60 * 1000;
        for (const branch of branches) {
          if (branch.status === 'locked' || branch.status === 'abandoned') continue;
          if (branch.keep_frames_forever) continue;
          const branchIters = itersByBranch[branch.id] || [];
          const lastActivity = branchIters
            .map(i => new Date(i.created_at || 0).getTime())
            .reduce((max, t) => Math.max(max, t), 0);
          const idleMs = now - lastActivity;
          const remainingMs = thresholdMs - idleMs;
          if (remainingMs > 0 && remainingMs < SEVEN_DAYS_MS) {
            const purgeDate = new Date(lastActivity + thresholdMs).toISOString();
            let branchFrameBytes = 0;
            for (const iter of branchIters) {
              branchFrameBytes += await sumFrameBytes(join(framesRoot, iter.id));
            }
            if (branchFrameBytes > 0) {
              scheduled.push({ branch_id: branch.id, seed: branch.seed, purge_date: purgeDate, frames_bytes: branchFrameBytes });
            }
          }
        }
      }

      res.json({
        summary: {
          frames_bytes: totalFrameBytes,
          contact_bytes: totalContactBytes,
          reclaimable_bytes: reclaimableBytes
        },
        stagnant,
        scheduled_purge: scheduled,
        settings
      });
    } catch (err) {
      console.error('[Storage] GET error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/storage/branch/:id/frames
   * Deletes all frame files for all iterations on a branch. Contact sheets preserved.
   * Returns { bytes_reclaimed }.
   */
  router.delete('/branch/:id/frames', async (req, res) => {
    try {
      const branchId = req.params.id;
      // Validate branch exists
      await store.get('branches', branchId);

      const iterations = await store.list('iterations', i => i.branch_id === branchId);
      let bytesReclaimed = 0;

      for (const iter of iterations) {
        const frameDir = join(framesRoot, iter.id);
        if (!existsSync(frameDir)) continue;
        const files = await readdir(frameDir).catch(() => []);
        for (const file of files) {
          if (file.startsWith('contact_sheet')) continue; // preserve
          const fp = join(frameDir, file);
          try {
            const s = await stat(fp);
            if (s.isFile()) {
              bytesReclaimed += s.size;
              await rm(fp, { force: true });
            }
          } catch { /* ignore */ }
        }
      }

      console.log(`[Storage] Manual purge branch ${branchId} — ${Math.round(bytesReclaimed / 1024 / 1024)}MB reclaimed`);
      res.json({ bytes_reclaimed: bytesReclaimed });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  return router;
}
```

### 5b — Register in server.js + helpers.js

- [ ] **Step 2: Register storage route in server.js**

In `backend/server.js`, add import:
```js
import { createStorageRoutes } from './routes/storage.js';
```

Add route (after the analytics route, before the watcher):
```js
app.use('/api/storage', createStorageRoutes(store, config));
```

In `backend/tests/helpers.js`, add import:
```js
import { createStorageRoutes } from '../routes/storage.js';
```

Add to test app:
```js
app.use('/api/storage', createStorageRoutes(store, config));
```

### 5c — Storage tests

- [ ] **Step 3: Create backend/tests/routes/storage.test.js**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Storage API — GET /api/storage', () => {
  let tmpDir, request, store;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-storage-test-'));
    const testApp = createTestApp(tmpDir);
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns zero totals when no data exists', async () => {
    const res = await request.get('/api/storage');
    expect(res.status).toBe(200);
    expect(res.body.summary.frames_bytes).toBe(0);
    expect(res.body.summary.contact_bytes).toBe(0);
    expect(res.body.summary.reclaimable_bytes).toBe(0);
    expect(res.body.stagnant).toEqual([]);
    expect(res.body.settings.auto_purge_days).toBeNull();
  });

  it('counts frame bytes on disk accurately', async () => {
    const clip = await store.create('clips', { name: 'Clip A', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 12345, status: 'active',
      name: 'test', created_from: 'manual', base_settings: {}
    });
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered'
    });

    // Create fake frame files
    const frameDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(frameDir, 'frame_001.webp'), Buffer.alloc(1000)); // 1000 bytes
    writeFileSync(join(frameDir, 'frame_002.webp'), Buffer.alloc(2000)); // 2000 bytes
    writeFileSync(join(frameDir, 'contact_sheet_12345.webp'), Buffer.alloc(500)); // NOT counted in frames

    const res = await request.get('/api/storage');
    expect(res.status).toBe(200);
    expect(res.body.summary.frames_bytes).toBe(3000); // only frame files
  });

  it('does not include locked/abandoned branches in stagnant list', async () => {
    const clip = await store.create('clips', { name: 'Clip B', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 99999, status: 'locked',
      name: 'locked', created_from: 'manual', base_settings: {}
    });
    await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered'
    });

    const res = await request.get('/api/storage');
    expect(res.status).toBe(200);
    expect(res.body.stagnant).toHaveLength(0);
  });

  it('does not include keep_frames_forever branches in stagnant list', async () => {
    const clip = await store.create('clips', { name: 'Clip C', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 55555, status: 'active',
      keep_frames_forever: true,
      name: 'keep-it', created_from: 'manual', base_settings: {}
    });
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered',
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days old
    });

    const frameDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(frameDir, 'frame_001.webp'), Buffer.alloc(1000));

    const res = await request.get('/api/storage');
    expect(res.status).toBe(200);
    expect(res.body.stagnant).toHaveLength(0);
  });
});

describe('Storage API — DELETE /api/storage/branch/:id/frames', () => {
  let tmpDir, request, store;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-storage-del-test-'));
    const testApp = createTestApp(tmpDir);
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deletes frame files and returns bytes reclaimed', async () => {
    const clip = await store.create('clips', { name: 'Clip D', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 77777, status: 'active',
      name: 'stagnant', created_from: 'manual', base_settings: {}
    });
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered'
    });

    const frameDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(frameDir, 'frame_001.webp'), Buffer.alloc(5000));
    writeFileSync(join(frameDir, 'contact_sheet_77777.webp'), Buffer.alloc(1000)); // preserved

    const res = await request.delete(`/api/storage/branch/${branch.id}/frames`);
    expect(res.status).toBe(200);
    expect(res.body.bytes_reclaimed).toBe(5000);

    // Frame file gone, contact sheet preserved
    expect(existsSync(join(frameDir, 'frame_001.webp'))).toBe(false);
    expect(existsSync(join(frameDir, 'contact_sheet_77777.webp'))).toBe(true);
  });

  it('returns 404 for unknown branch', async () => {
    const res = await request.delete('/api/storage/branch/nonexistent-id/frames');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run all tests**

```bash
cd backend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/storage.js backend/server.js backend/tests/helpers.js backend/tests/routes/storage.test.js
git commit -m "feat(storage): add GET /api/storage aggregation and DELETE /api/storage/branch/:id/frames cleanup endpoint"
```

**Stop here. Notify the orchestrator for review before Task 6.**

---

## Task 6: Storage Page — Frontend

**Files:**
- Create: `frontend/src/components/storage/StoragePage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/api.js`

**Orchestrator review required after this task.**

### Layout spec

```
Storage                              [Purge all stagnant  X MB]
4.2 GB total  ·  2.7 GB reclaimable
```

Three summary cards: Frames (reclaimable, purge-all action) | Contact Sheets (permanent, display only) | Auto-purge (current setting, inline edit).

Stagnant branches table sorted by size descending. Each row: Branch seed | Idle | Frame size | Reason | Purge / Keep buttons.

### 6a — api.js storage methods

- [ ] **Step 1: Add storage methods to api.js**

```js
getStorage: () => request('/storage'),
purgeStorageBranch: (branchId) => request(`/storage/branch/${branchId}/frames`, { method: 'DELETE' }),
```

### 6b — StoragePage.jsx

- [ ] **Step 2: Create frontend/src/components/storage/StoragePage.jsx**

```jsx
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

function SummaryCard({ label, bytes, sublabel, action }) {
  return (
    <div className="bg-surface-overlay rounded-lg p-4 flex flex-col gap-1">
      <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-mono font-bold text-gray-100">{formatBytes(bytes)}</span>
      {sublabel && <span className="text-xs font-mono text-gray-500">{sublabel}</span>}
      {action}
    </div>
  );
}

function StagnantRow({ branch, clipName, onPurge, onKeep }) {
  const [purged, setPurged] = useState(null);
  const [keeping, setKeeping] = useState(false);

  const purgeMutation = useMutation({
    mutationFn: () => api.purgeStorageBranch(branch.branch_id),
    onSuccess: (data) => setPurged(data.bytes_reclaimed)
  });

  const keepMutation = useMutation({
    mutationFn: () => api.patchBranch(branch.branch_id, { keep_frames_forever: true }),
    onSuccess: () => { setKeeping(true); onKeep(branch.branch_id); }
  });

  if (keeping) return null;

  if (purged !== null) {
    return (
      <tr className="opacity-50 transition-opacity">
        <td colSpan={6} className="px-3 py-2 text-xs font-mono text-green-400">
          {formatBytes(purged)} reclaimed ✓
        </td>
      </tr>
    );
  }

  const reasonLabel = { plateau: 'plateau', no_evals: 'no evals', idle: 'idle' };

  return (
    <tr className="border-t border-gray-700 hover:bg-surface-overlay/50">
      <td className="px-3 py-2 text-xs font-mono text-gray-300">seed:{branch.seed}</td>
      <td className="px-3 py-2 text-xs font-mono text-gray-500">{branch.idle_days}d</td>
      <td className="px-3 py-2 text-xs font-mono text-gray-300">{formatBytes(branch.frames_bytes)}</td>
      <td className="px-3 py-2">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-yellow-500/10 text-yellow-400">
          {reasonLabel[branch.stale_reason] || branch.stale_reason}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => purgeMutation.mutate()}
            disabled={purgeMutation.isPending}
            className="text-xs font-mono text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
          >
            {purgeMutation.isPending ? 'Purging...' : 'Purge'}
          </button>
          <span className="text-gray-600">·</span>
          <button
            onClick={() => keepMutation.mutate()}
            disabled={keepMutation.isPending}
            className="text-xs font-mono text-gray-400 hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            Keep
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function StoragePage() {
  const queryClient = useQueryClient();
  const [hiddenBranches, setHiddenBranches] = useState(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['storage'],
    queryFn: () => api.getStorage(),
    staleTime: 5 * 60 * 1000
  });

  const purgeAllMutation = useMutation({
    mutationFn: async () => {
      const stagnant = data?.stagnant || [];
      let total = 0;
      for (const branch of stagnant) {
        if (hiddenBranches.has(branch.branch_id)) continue;
        try {
          const result = await api.purgeStorageBranch(branch.branch_id);
          total += result.bytes_reclaimed || 0;
        } catch { /* continue on failure */ }
      }
      return { bytes_reclaimed: total };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['storage'] })
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-xs font-mono text-gray-500">Loading storage data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-xs font-mono text-red-400">Failed to load storage data: {error.message}</div>
      </div>
    );
  }

  const { summary, stagnant = [], scheduled_purge = [], settings } = data || {};
  const visibleStagnant = stagnant.filter(b => !hiddenBranches.has(b.branch_id));
  const totalReclaimable = visibleStagnant.reduce((sum, b) => sum + b.frames_bytes, 0);

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-mono font-bold text-gray-100">Storage</h1>
          <p className="text-xs font-mono text-gray-500 mt-0.5">
            {formatBytes((summary?.frames_bytes || 0) + (summary?.contact_bytes || 0))} total
            {' · '}
            {formatBytes(summary?.reclaimable_bytes || 0)} reclaimable
          </p>
        </div>
        {visibleStagnant.length > 0 && (
          <button
            onClick={() => purgeAllMutation.mutate()}
            disabled={purgeAllMutation.isPending}
            className="px-3 py-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {purgeAllMutation.isPending
              ? 'Purging...'
              : `Purge all stagnant  ${formatBytes(totalReclaimable)}`}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Frames"
          bytes={summary?.frames_bytes}
          sublabel={`${formatBytes(summary?.reclaimable_bytes)} reclaimable`}
        />
        <SummaryCard
          label="Contact Sheets"
          bytes={summary?.contact_bytes}
          sublabel="Permanent record — never purged"
        />
        <div className="bg-surface-overlay rounded-lg p-4 flex flex-col gap-1">
          <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Auto-purge</span>
          <span className="text-sm font-mono text-gray-300">
            {settings?.auto_purge_days ? `After ${settings.auto_purge_days} days idle` : 'Never (default)'}
          </span>
          <span className="text-xs font-mono text-gray-600">Configure in settings</span>
        </div>
      </div>

      {/* Scheduled for auto-purge */}
      {scheduled_purge.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Scheduled for auto-purge</h2>
          <div className="space-y-1">
            {scheduled_purge.map(s => (
              <div key={s.branch_id} className="flex items-center justify-between px-3 py-2 rounded bg-surface-overlay text-xs font-mono">
                <span className="text-gray-300">seed:{s.seed}</span>
                <span className="text-gray-500">purges {new Date(s.purge_date).toLocaleDateString()}</span>
                <span className="text-gray-400">{formatBytes(s.frames_bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stagnant branches */}
      {visibleStagnant.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">
            Stagnant branches — {visibleStagnant.length} with reclaimable frames
          </h2>
          <div className="rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-raised">
                  <th className="px-3 py-2 text-left text-[10px] font-mono text-gray-500 uppercase">Branch</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono text-gray-500 uppercase">Idle</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono text-gray-500 uppercase">Frames</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono text-gray-500 uppercase">Reason</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleStagnant.map(branch => (
                  <StagnantRow
                    key={branch.branch_id}
                    branch={branch}
                    onPurge={(id) => queryClient.invalidateQueries({ queryKey: ['storage'] })}
                    onKeep={(id) => setHiddenBranches(prev => new Set([...prev, id]))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-xs font-mono text-gray-500 py-4">
          Nothing to clean up — all branches are recently active or protected.
        </div>
      )}
    </div>
  );
}
```

Note: `StagnantRow` calls `api.patchBranch(branch.branch_id, { keep_frames_forever: true })`. Check `api.js` for the correct method name for patching a branch. If it doesn't exist, add it:

```js
patchBranch: (branchId, patch) => request(`/branches/${branchId}`, { method: 'PATCH', body: patch }),
```

**Check what the actual branches PATCH endpoint URL is** before assuming — it may be `/clips/:clipId/branches/:id`. If clip_id is required, the `StoragePage` may need to receive the clip_id from the storage response. To avoid this complexity, add `clip_id` to the stagnant branch response in `storage.js` (it's already there: `clip_id: branch.clip_id`). Then in the Keep mutation:

```js
mutationFn: () => api.patchClipBranch(branch.clip_id, branch.branch_id, { keep_frames_forever: true }),
```

And in api.js:
```js
patchClipBranch: (clipId, branchId, patch) => request(`/clips/${clipId}/branches/${branchId}`, { method: 'PATCH', body: patch }),
```

### 6c — App.jsx — add Storage nav entry

- [ ] **Step 3: Update App.jsx**

**Import:**
```jsx
import StoragePage from './components/storage/StoragePage';
```

**VIEWS constant** (line 30–37) — add storage entry:
```js
const VIEWS = {
  episodes: 'Episode Tracker',
  analytics: 'Analytics',
  queue: 'Queue Manager',
  characters: 'Character Registry',
  templates: 'Templates',
  trends: 'Score Trends',
  storage: 'Storage'
};
```

**Nav badge for storage** — add a `StorageBadge` component (after `QueueBadge`):

```jsx
function StorageBadge({ active }) {
  const { data } = useQuery({
    queryKey: ['storage'],
    queryFn: () => api.getStorage(),
    staleTime: 5 * 60 * 1000,
    // Only load if user has visited the page or it's pre-cached
    enabled: false,
    refetchOnMount: false
  });
  // Show warning badge if stagnant branches exist
  const stagnantCount = data?.stagnant?.length || 0;
  if (stagnantCount === 0) return null;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${active ? 'bg-black/20 text-black' : 'bg-yellow-500/20 text-yellow-400'}`}>
      {stagnantCount}
    </span>
  );
}
```

**Nav button** — in the nav rendering (App.jsx line ~208), update the badge logic:
```jsx
{key === 'queue' && <QueueBadge active={view === key} />}
{key === 'storage' && <StorageBadge active={view === key} />}
```

**Main content** — add storage view render (after the trends view):
```jsx
{view === 'storage' && <StoragePage />}
```

### 6d — Final test run

- [ ] **Step 4: Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Manual smoke test checklist**

Start the dev server and verify:
- [ ] "Storage" appears in left nav
- [ ] Clicking Storage loads the page without errors
- [ ] Summary cards show 0 B if no data exists
- [ ] If stagnant branches exist (or mock some), they appear in the table
- [ ] Purge button makes a DELETE call and the row shows "X MB reclaimed ✓"
- [ ] Keep button hides the row immediately

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/storage/StoragePage.jsx frontend/src/App.jsx frontend/src/api.js
git commit -m "feat(storage-ui): add Storage page with disk usage overview, stagnant branch management, and nav entry"
```

**Stop here. Notify the orchestrator for final review.**

---

## Completion Checklist

Before marking this feature done, verify:

- [ ] All 113 original backend tests still pass
- [ ] New tests in `frames.test.js`, `storage.test.js`, and additional `branches.test.js` cases pass
- [ ] Frame files in `data/frames/` are `.webp` not `.png` after a new render
- [ ] Contact sheets are `.webp` not `.png` after generation
- [ ] Vision API media type is `image/webp` for `.webp` files (check `vision-scorer.js`)
- [ ] Branching to `locked` or `abandoned` triggers frame deletion (verify via toast or log)
- [ ] Storage page loads at `/storage` nav entry and shows correct totals
- [ ] Purge action from Storage page removes frame files and shows reclaimed bytes
- [ ] Keep-forever branches never appear in stagnant list

## Out of Scope (Do Not Implement)

- Auto-purge scheduler / cron job (auto_purge_days setting is stored but not acted on automatically — the scheduled list is informational only, the actual auto-purge job is Phase 6+)
- Retroactive PNG → WebP conversion of existing frames (old PNG files get cleaned up via lifecycle rules naturally)
- `iteratarr_data_dir` configuration UI (belongs to #21 onboarding wizard)
- `last_viewed_at` patching on branch open (prep field is defined, the patch hook goes in the branch detail view which is out of scope here)
