# Iteratarr Phase 1-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working local production intelligence tool for AI video iteration — from project scaffold through a complete evaluation loop (load JSON, score, attribute to rope, generate next iteration).

**Architecture:** Express REST API with file-based JSON storage (no database server). React SPA with Tailwind CSS for a dark, utilitarian three-panel layout. File watcher auto-ingests Wan2GP output JSONs. All data stored as flat JSON files in `data/` subdirectories with UUID-based filenames.

**Tech Stack:** Node.js 20+, Express, chokidar (file watching), uuid, React 18 (Vite), Tailwind CSS 3, Recharts (graphs), react-beautiful-dnd (kanban), Vitest + React Testing Library (tests)

**Spec:** `C:\Projects\iteratarr\ITERATARR_SPEC.md` — this is the source of truth for all data models, endpoints, and views.

---

## File Structure

```
C:\Projects\iteratarr\
  docs/                           # Plans, specs (already exists)
  backend/
    package.json                  # Express server deps
    server.js                     # Express app entry point, middleware, routes mount
    config.js                     # Load config.json, defaults, path resolution
    config.json                   # User-editable paths (wan2gp dir, save dirs, port)
    watcher.js                    # Chokidar file watcher for Wan2GP JSON auto-ingest
    routes/
      projects.js                 # GET/POST /api/projects, GET /api/projects/:id
      clips.js                    # GET/POST/PATCH /api/clips, GET /api/clips/:id/iterations
      iterations.js               # POST/GET /api/iterations, evaluate, lock, next
      characters.js               # GET/POST/PATCH /api/characters
      templates.js                # GET/POST /api/templates
    store/
      index.js                    # Central store: load/save/query JSON files from data/
      validators.js               # Schema validation for all data models
    data/                         # JSON file database (gitignored)
      projects/                   # One JSON file per project
      scenes/                     # One JSON file per scene
      clips/                      # One JSON file per clip
      iterations/                 # One JSON file per iteration
      evaluations/                # One JSON file per evaluation
      characters/                 # One JSON file per character
      templates/                  # One JSON file per template
    tests/
      store.test.js               # Store CRUD tests
      validators.test.js          # Schema validation tests
      routes/
        projects.test.js
        clips.test.js
        iterations.test.js
        characters.test.js
      watcher.test.js             # File watcher tests
  frontend/
    package.json                  # React + Vite + Tailwind deps
    vite.config.js                # Vite config with API proxy to backend
    tailwind.config.js            # Dark theme, custom colours (amber accent)
    index.html                    # SPA entry
    src/
      main.jsx                    # React entry
      App.jsx                     # Three-panel layout shell, routing
      api.js                      # Fetch wrapper for all backend calls
      constants.js                # Ropes definition, score categories, status colours
      components/
        layout/
          LeftPanel.jsx           # Navigation & library panel
          CentrePanel.jsx         # Main content area (route-dependent)
          RightPanel.jsx          # Production queue (always visible)
        kanban/
          EpisodeTracker.jsx      # Kanban board with status columns
          ClipCard.jsx            # Draggable clip card
        clips/
          ClipDetail.jsx          # Clip info + iteration lineage + eval panel
          IterationLineage.jsx    # Visual tree of iterations
        evaluation/
          EvaluationPanel.jsx     # Master evaluation component
          ScoreSlider.jsx         # Single slider (1-5, colour shifting)
          ScoreGroup.jsx          # Group of sliders with subtotal
          AttributionPanel.jsx    # Rope attribution dropdowns + next change
          ScoreRing.jsx           # Circular progress indicator for grand total
        characters/
          CharacterRegistry.jsx   # Character card list
          CharacterCard.jsx       # Expandable character card
        trends/
          ScoreTrendChart.jsx     # Line graph per clip (Recharts)
        queue/
          ProductionQueue.jsx     # Right panel queue list
      hooks/
        useApi.js                 # Data fetching hook with loading/error states
      tests/
        components/
          ScoreSlider.test.jsx
          EvaluationPanel.test.jsx
          ClipCard.test.jsx
          EpisodeTracker.test.jsx
```

---

## Task 1: Project Scaffold — Backend

**Files:**
- Create: `backend/package.json`
- Create: `backend/server.js`
- Create: `backend/config.js`
- Create: `backend/config.json`
- Create: `backend/.gitignore`
- Create: `iteratarr/.gitignore` (root)

- [ ] **Step 1: Initialize backend package**

```bash
cd /c/Projects/iteratarr
mkdir -p backend
cd backend
npm init -y
npm install express cors uuid chokidar
npm install -D vitest supertest
```

- [ ] **Step 2: Create config.json with default paths**

```json
{
  "wan2gp_json_dir": "C:/pinokio/api/wan2gp.git/app",
  "iteration_save_dir": "C:/Projects/kebbin-shop",
  "production_lock_dir": "C:/Projects/kebbin-shop/finals",
  "production_queue_dir": "C:/Projects/kebbin-shop/queue",
  "iteratarr_data_dir": "./data",
  "score_lock_threshold": 65,
  "iteration_frame_count": 32,
  "production_frame_count": 81,
  "port": 3847
}
```

- [ ] **Step 3: Create config.js loader**

```js
// backend/config.js
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const defaults = {
  wan2gp_json_dir: 'C:/pinokio/api/wan2gp.git/app',
  iteration_save_dir: 'C:/Projects/kebbin-shop',
  production_lock_dir: 'C:/Projects/kebbin-shop/finals',
  production_queue_dir: 'C:/Projects/kebbin-shop/queue',
  iteratarr_data_dir: resolve(__dirname, 'data'),
  score_lock_threshold: 65,
  iteration_frame_count: 32,
  production_frame_count: 81,
  port: 3847
};

let userConfig = {};
try {
  const raw = readFileSync(resolve(__dirname, 'config.json'), 'utf-8');
  userConfig = JSON.parse(raw);
} catch {
  // config.json missing or invalid — use defaults
}

const config = { ...defaults, ...userConfig };

// Resolve relative data dir to absolute
if (!config.iteratarr_data_dir.startsWith('/') && !config.iteratarr_data_dir.match(/^[A-Z]:/i)) {
  config.iteratarr_data_dir = resolve(__dirname, config.iteratarr_data_dir);
}

export default config;
```

- [ ] **Step 4: Create server.js with health endpoint**

```js
// backend/server.js
import express from 'express';
import cors from 'cors';
import config from './config.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

export { app };

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  app.listen(config.port, () => {
    console.log(`Iteratarr backend running on port ${config.port}`);
  });
}
```

- [ ] **Step 5: Add package.json scripts and type module**

In `backend/package.json`, ensure:
```json
{
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Create .gitignore files**

Root `.gitignore`:
```
node_modules/
dist/
backend/data/
.env
```

- [ ] **Step 7: Write health endpoint test**

```js
// backend/tests/health.test.js
import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { app } from '../server.js';

describe('Health endpoint', () => {
  it('GET /api/health returns ok', async () => {
    const res = await supertest(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /c/Projects/iteratarr/backend && npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git init
git add -A
git commit -m "feat: backend scaffold with Express, config, health endpoint"
```

---

## Task 2: JSON File Store

**Files:**
- Create: `backend/store/index.js`
- Create: `backend/store/validators.js`
- Create: `backend/tests/store.test.js`
- Create: `backend/tests/validators.test.js`

- [ ] **Step 1: Write store CRUD tests**

```js
// backend/tests/store.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createStore } from '../store/index.js';

describe('JSON File Store', () => {
  let tmpDir;
  let store;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-test-'));
    store = createStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates and retrieves a record', async () => {
    const record = await store.create('projects', { name: 'Test Project' });
    expect(record.id).toBeDefined();
    expect(record.name).toBe('Test Project');
    expect(record.created_at).toBeDefined();

    const fetched = await store.get('projects', record.id);
    expect(fetched.name).toBe('Test Project');
  });

  it('lists all records in a collection', async () => {
    await store.create('projects', { name: 'A' });
    await store.create('projects', { name: 'B' });
    const all = await store.list('projects');
    expect(all).toHaveLength(2);
  });

  it('updates a record', async () => {
    const record = await store.create('clips', { name: 'Clip 1', status: 'not_started' });
    const updated = await store.update('clips', record.id, { status: 'in_progress' });
    expect(updated.status).toBe('in_progress');
    expect(updated.name).toBe('Clip 1');
    expect(updated.updated_at).toBeDefined();
  });

  it('filters records by predicate', async () => {
    await store.create('clips', { scene_id: 's1', status: 'locked' });
    await store.create('clips', { scene_id: 's1', status: 'not_started' });
    await store.create('clips', { scene_id: 's2', status: 'locked' });
    const filtered = await store.list('clips', (c) => c.scene_id === 's1');
    expect(filtered).toHaveLength(2);
  });

  it('throws on get for non-existent record', async () => {
    await expect(store.get('projects', 'nonexistent')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Projects/iteratarr/backend && npm test`
Expected: FAIL — `createStore` not defined

- [ ] **Step 3: Implement the store**

```js
// backend/store/index.js
import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export function createStore(baseDir) {
  async function ensureDir(collection) {
    const dir = join(baseDir, collection);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  return {
    async create(collection, data) {
      const dir = await ensureDir(collection);
      const id = randomUUID();
      const now = new Date().toISOString();
      const record = { id, ...data, created_at: now, updated_at: now };
      await writeFile(join(dir, `${id}.json`), JSON.stringify(record, null, 2));
      return record;
    },

    async get(collection, id) {
      const dir = await ensureDir(collection);
      try {
        const raw = await readFile(join(dir, `${id}.json`), 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        if (err.code === 'ENOENT') throw new Error(`${collection}/${id} not found`);
        throw err;
      }
    },

    async update(collection, id, patch) {
      const existing = await this.get(collection, id);
      const updated = { ...existing, ...patch, id, updated_at: new Date().toISOString() };
      const dir = await ensureDir(collection);
      await writeFile(join(dir, `${id}.json`), JSON.stringify(updated, null, 2));
      return updated;
    },

    async list(collection, predicate) {
      const dir = await ensureDir(collection);
      const files = await readdir(dir);
      const records = await Promise.all(
        files.filter(f => f.endsWith('.json')).map(async f => {
          const raw = await readFile(join(dir, f), 'utf-8');
          return JSON.parse(raw);
        })
      );
      return predicate ? records.filter(predicate) : records;
    },

    async delete(collection, id) {
      const { unlink } = await import('fs/promises');
      const dir = await ensureDir(collection);
      await unlink(join(dir, `${id}.json`));
    }
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Projects/iteratarr/backend && npm test`
Expected: ALL PASS

- [ ] **Step 5: Write validator tests**

```js
// backend/tests/validators.test.js
import { describe, it, expect } from 'vitest';
import { validateProject, validateClip, validateEvaluation, validateCharacter } from '../store/validators.js';

describe('Validators', () => {
  it('validates a project', () => {
    expect(() => validateProject({ name: 'Test' })).not.toThrow();
    expect(() => validateProject({})).toThrow('name is required');
  });

  it('validates a clip', () => {
    expect(() => validateClip({ scene_id: 's1', name: 'Clip 1' })).not.toThrow();
    expect(() => validateClip({ name: 'Clip 1' })).toThrow('scene_id is required');
  });

  it('validates clip status values', () => {
    expect(() => validateClip({ scene_id: 's1', name: 'C', status: 'locked' })).not.toThrow();
    expect(() => validateClip({ scene_id: 's1', name: 'C', status: 'invalid' })).toThrow('Invalid status');
  });

  it('validates evaluation scores are 1-5', () => {
    const valid = {
      iteration_id: 'i1',
      scores: {
        identity: { face_match: 4, head_shape: 3, jaw: 4, cheekbones: 4, eyes_brow: 4, skin_texture: 3, hair: 3, frame_consistency: 2 },
        location: { location_correct: 4, lighting_correct: 4, wardrobe_correct: 5, geometry_correct: 3 },
        motion: { action_executed: 3, smoothness: 4, camera_movement: 2 }
      }
    };
    expect(() => validateEvaluation(valid)).not.toThrow();
  });

  it('rejects evaluation scores outside 1-5', () => {
    const invalid = {
      iteration_id: 'i1',
      scores: {
        identity: { face_match: 6, head_shape: 3, jaw: 4, cheekbones: 4, eyes_brow: 4, skin_texture: 3, hair: 3, frame_consistency: 2 },
        location: { location_correct: 4, lighting_correct: 4, wardrobe_correct: 5, geometry_correct: 3 },
        motion: { action_executed: 3, smoothness: 4, camera_movement: 2 }
      }
    };
    expect(() => validateEvaluation(invalid)).toThrow();
  });

  it('validates a character', () => {
    expect(() => validateCharacter({ name: 'Mick', trigger_word: 'mckdhn' })).not.toThrow();
    expect(() => validateCharacter({ name: 'Mick' })).toThrow('trigger_word is required');
  });
});
```

- [ ] **Step 6: Implement validators**

```js
// backend/store/validators.js
const CLIP_STATUSES = ['not_started', 'in_progress', 'evaluating', 'locked', 'in_queue'];
const IDENTITY_FIELDS = ['face_match', 'head_shape', 'jaw', 'cheekbones', 'eyes_brow', 'skin_texture', 'hair', 'frame_consistency'];
const LOCATION_FIELDS = ['location_correct', 'lighting_correct', 'wardrobe_correct', 'geometry_correct'];
const MOTION_FIELDS = ['action_executed', 'smoothness', 'camera_movement'];

function require(obj, field, label) {
  if (!obj[field] && obj[field] !== 0) throw new Error(`${label || field} is required`);
}

function validateScoreRange(scores, fields, group) {
  for (const field of fields) {
    const val = scores[field];
    if (val !== undefined && (val < 1 || val > 5)) {
      throw new Error(`${group}.${field} must be between 1 and 5, got ${val}`);
    }
  }
}

export function validateProject(data) {
  require(data, 'name', 'name');
}

export function validateClip(data) {
  require(data, 'scene_id', 'scene_id');
  require(data, 'name', 'name');
  if (data.status && !CLIP_STATUSES.includes(data.status)) {
    throw new Error(`Invalid status: ${data.status}. Must be one of: ${CLIP_STATUSES.join(', ')}`);
  }
}

export function validateIteration(data) {
  require(data, 'clip_id', 'clip_id');
}

export function validateEvaluation(data) {
  require(data, 'iteration_id', 'iteration_id');
  require(data, 'scores', 'scores');
  const { scores } = data;
  if (scores.identity) validateScoreRange(scores.identity, IDENTITY_FIELDS, 'identity');
  if (scores.location) validateScoreRange(scores.location, LOCATION_FIELDS, 'location');
  if (scores.motion) validateScoreRange(scores.motion, MOTION_FIELDS, 'motion');
}

export function validateCharacter(data) {
  require(data, 'name', 'name');
  require(data, 'trigger_word', 'trigger_word');
}

export { CLIP_STATUSES, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS };
```

- [ ] **Step 7: Run all tests**

Run: `cd /c/Projects/iteratarr/backend && npm test`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: JSON file store with CRUD operations and data validators"
```

---

## Task 3: Backend REST API — Projects, Scenes, Clips

**Files:**
- Create: `backend/routes/projects.js`
- Create: `backend/routes/clips.js`
- Modify: `backend/server.js` (mount routes)
- Create: `backend/tests/routes/projects.test.js`
- Create: `backend/tests/routes/clips.test.js`

- [ ] **Step 1: Write project route tests**

```js
// backend/tests/routes/projects.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Projects API', () => {
  let tmpDir, request;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-test-'));
    const { app } = createTestApp(tmpDir);
    request = supertest(app);
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('POST /api/projects creates a project', async () => {
    const res = await request.post('/api/projects').send({ name: "Kebbin's Shop" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Kebbin's Shop");
  });

  it('GET /api/projects lists all projects', async () => {
    await request.post('/api/projects').send({ name: 'P1' });
    await request.post('/api/projects').send({ name: 'P2' });
    const res = await request.get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET /api/projects/:id returns project with scenes', async () => {
    const proj = await request.post('/api/projects').send({ name: 'P1' });
    const res = await request.get(`/api/projects/${proj.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('P1');
    expect(res.body.scenes).toEqual([]);
  });

  it('POST /api/projects/:id/scenes creates a scene', async () => {
    const proj = await request.post('/api/projects').send({ name: 'P1' });
    const res = await request.post(`/api/projects/${proj.body.id}/scenes`).send({
      name: 'Scene 01 — Saudi Arabia', episode: 1
    });
    expect(res.status).toBe(201);
    expect(res.body.project_id).toBe(proj.body.id);
  });
});
```

- [ ] **Step 2: Create test helper for app with temp store**

```js
// backend/tests/helpers.js
import express from 'express';
import cors from 'cors';
import { createStore } from '../store/index.js';
import { createProjectRoutes } from '../routes/projects.js';
import { createClipRoutes } from '../routes/clips.js';
import { createIterationRoutes } from '../routes/iterations.js';
import { createCharacterRoutes } from '../routes/characters.js';

export function createTestApp(dataDir) {
  const store = createStore(dataDir);
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.use('/api/projects', createProjectRoutes(store));
  app.use('/api/clips', createClipRoutes(store));
  app.use('/api/iterations', createIterationRoutes(store));
  app.use('/api/characters', createCharacterRoutes(store));

  return { app, store };
}
```

- [ ] **Step 3: Run tests to verify they fail**

Expected: FAIL — route modules don't exist yet

- [ ] **Step 4: Implement project routes**

```js
// backend/routes/projects.js
import { Router } from 'express';
import { validateProject } from '../store/validators.js';

export function createProjectRoutes(store) {
  const router = Router();

  router.get('/', async (req, res) => {
    const projects = await store.list('projects');
    res.json(projects);
  });

  router.post('/', async (req, res) => {
    try {
      validateProject(req.body);
      const project = await store.create('projects', {
        name: req.body.name,
        scenes: []
      });
      res.status(201).json(project);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const project = await store.get('projects', req.params.id);
      const scenes = await store.list('scenes', s => s.project_id === req.params.id);
      res.json({ ...project, scenes });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.post('/:id/scenes', async (req, res) => {
    try {
      await store.get('projects', req.params.id); // verify project exists
      const scene = await store.create('scenes', {
        project_id: req.params.id,
        name: req.body.name,
        episode: req.body.episode || 1
      });
      res.status(201).json(scene);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  return router;
}
```

- [ ] **Step 5: Write clip route tests**

```js
// backend/tests/routes/clips.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Clips API', () => {
  let tmpDir, request, store;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-test-'));
    const testApp = createTestApp(tmpDir);
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('POST /api/clips creates a clip', async () => {
    const scene = await store.create('scenes', { name: 'S1', project_id: 'p1' });
    const res = await request.post('/api/clips').send({
      scene_id: scene.id, name: 'Clip 1e — Mick on Balcony',
      characters: ['mckdhn'], location: 'Monaco Balcony'
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('not_started');
  });

  it('GET /api/clips filters by status', async () => {
    const scene = await store.create('scenes', { name: 'S1', project_id: 'p1' });
    await request.post('/api/clips').send({ scene_id: scene.id, name: 'C1' });
    await store.create('clips', { scene_id: scene.id, name: 'C2', status: 'locked' });
    const res = await request.get('/api/clips?status=locked');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('C2');
  });

  it('PATCH /api/clips/:id updates clip', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const res = await request.patch(`/api/clips/${clip.id}`).send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
  });

  it('GET /api/clips/:id/iterations returns iterations for clip', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    await store.create('iterations', { clip_id: clip.id, iteration_number: 1 });
    await store.create('iterations', { clip_id: clip.id, iteration_number: 2 });
    const res = await request.get(`/api/clips/${clip.id}/iterations`);
    expect(res.body).toHaveLength(2);
  });
});
```

- [ ] **Step 6: Implement clip routes**

```js
// backend/routes/clips.js
import { Router } from 'express';
import { validateClip } from '../store/validators.js';

export function createClipRoutes(store) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { status, scene_id, project_id } = req.query;
    let clips = await store.list('clips');
    if (status) clips = clips.filter(c => c.status === status);
    if (scene_id) clips = clips.filter(c => c.scene_id === scene_id);
    if (project_id) {
      const scenes = await store.list('scenes', s => s.project_id === project_id);
      const sceneIds = new Set(scenes.map(s => s.id));
      clips = clips.filter(c => sceneIds.has(c.scene_id));
    }
    res.json(clips);
  });

  router.post('/', async (req, res) => {
    try {
      validateClip(req.body);
      const clip = await store.create('clips', {
        scene_id: req.body.scene_id,
        name: req.body.name,
        characters: req.body.characters || [],
        location: req.body.location || '',
        status: 'not_started',
        locked_iteration_id: null,
        production_json_path: null,
        notes: req.body.notes || ''
      });
      res.status(201).json(clip);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      if (req.body.status) validateClip({ scene_id: 'x', name: 'x', status: req.body.status });
      const updated = await store.update('clips', req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  router.get('/:id/iterations', async (req, res) => {
    const iterations = await store.list('iterations', i => i.clip_id === req.params.id);
    iterations.sort((a, b) => a.iteration_number - b.iteration_number);
    res.json(iterations);
  });

  return router;
}
```

- [ ] **Step 7: Create stub route files for iterations and characters (needed by test helper)**

Create minimal `backend/routes/iterations.js` and `backend/routes/characters.js` that export `createIterationRoutes(store)` and `createCharacterRoutes(store)` returning empty routers.

- [ ] **Step 8: Update server.js to mount all routes**

```js
// backend/server.js — replace route mounting section
import { createStore } from './store/index.js';
import { createProjectRoutes } from './routes/projects.js';
import { createClipRoutes } from './routes/clips.js';
import { createIterationRoutes } from './routes/iterations.js';
import { createCharacterRoutes } from './routes/characters.js';
import config from './config.js';

const store = createStore(config.iteratarr_data_dir);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '0.1.0' }));
app.use('/api/projects', createProjectRoutes(store));
app.use('/api/clips', createClipRoutes(store));
app.use('/api/iterations', createIterationRoutes(store));
app.use('/api/characters', createCharacterRoutes(store));

export { app, store };
```

- [ ] **Step 9: Run all tests**

Run: `cd /c/Projects/iteratarr/backend && npm test`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: REST API routes for projects, scenes, and clips"
```

---

## Task 4: Backend REST API — Iterations (Core Engine)

**Files:**
- Modify: `backend/routes/iterations.js`
- Create: `backend/tests/routes/iterations.test.js`

This is the most important backend task — it includes creating iterations from JSON files, submitting evaluations with score calculation, locking as production, and generating next iteration JSON.

- [ ] **Step 1: Write iteration route tests**

```js
// backend/tests/routes/iterations.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Iterations API', () => {
  let tmpDir, request, store;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-test-'));
    const testApp = createTestApp(tmpDir);
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  const sampleJson = {
    prompt: 'mckdhn, standing on balcony',
    seed: 544083690,
    guidance_scale: 6.1,
    guidance2_scale: 4,
    loras_multipliers: '1.0;0.3 0.3;1.2',
    video_length: 32,
    activated_loras: ['mckdhn-v1-cloud-high.safetensors', 'mckdhn-v1-cloud-low.safetensors']
  };

  it('POST /api/iterations creates iteration with JSON contents', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const res = await request.post('/api/iterations').send({
      clip_id: clip.id,
      json_filename: 'monaco_iter_01.json',
      json_contents: sampleJson
    });
    expect(res.status).toBe(201);
    expect(res.body.iteration_number).toBe(1);
    expect(res.body.seed_used).toBe(544083690);
    expect(res.body.json_contents.guidance_scale).toBe(6.1);
  });

  it('auto-increments iteration number', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'i1.json', json_contents: sampleJson });
    const res = await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'i2.json', json_contents: sampleJson });
    expect(res.body.iteration_number).toBe(2);
  });

  it('POST /api/iterations/:id/evaluate saves evaluation with computed totals', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const iter = await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'i1.json', json_contents: sampleJson });

    const res = await request.post(`/api/iterations/${iter.body.id}/evaluate`).send({
      scores: {
        identity: { face_match: 4, head_shape: 3, jaw: 4, cheekbones: 4, eyes_brow: 4, skin_texture: 3, hair: 3, frame_consistency: 2 },
        location: { location_correct: 4, lighting_correct: 4, wardrobe_correct: 5, geometry_correct: 3 },
        motion: { action_executed: 3, smoothness: 4, camera_movement: 2 }
      },
      attribution: {
        lowest_element: 'frame_consistency',
        rope: 'rope_3_lora_multipliers',
        confidence: 'high',
        next_change_description: 'Increase low noise LoRA weight to 1.3',
        next_change_json_field: 'loras_multipliers',
        next_change_value: '1.0;0.2 0.2;1.3'
      },
      qualitative_notes: 'Face drifts in frames 15-20'
    });

    expect(res.status).toBe(201);
    expect(res.body.scores.identity.total).toBe(27);
    expect(res.body.scores.location.total).toBe(16);
    expect(res.body.scores.motion.total).toBe(9);
    expect(res.body.scores.grand_total).toBe(52);
    expect(res.body.scores.grand_max).toBe(75);
    expect(res.body.production_ready).toBe(false);
  });

  it('marks production_ready when score >= threshold', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const iter = await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'i1.json', json_contents: sampleJson });

    const res = await request.post(`/api/iterations/${iter.body.id}/evaluate`).send({
      scores: {
        identity: { face_match: 5, head_shape: 5, jaw: 5, cheekbones: 5, eyes_brow: 5, skin_texture: 5, hair: 5, frame_consistency: 5 },
        location: { location_correct: 5, lighting_correct: 5, wardrobe_correct: 5, geometry_correct: 5 },
        motion: { action_executed: 5, smoothness: 5, camera_movement: 5 }
      },
      attribution: { lowest_element: 'none', rope: 'none' },
      qualitative_notes: 'Perfect'
    });

    expect(res.body.production_ready).toBe(true);
  });

  it('POST /api/iterations/:id/next generates next iteration JSON', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const iter = await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'monaco_iter_01.json', json_contents: sampleJson });

    // Evaluate first
    await request.post(`/api/iterations/${iter.body.id}/evaluate`).send({
      scores: {
        identity: { face_match: 4, head_shape: 3, jaw: 4, cheekbones: 4, eyes_brow: 4, skin_texture: 3, hair: 3, frame_consistency: 2 },
        location: { location_correct: 4, lighting_correct: 4, wardrobe_correct: 5, geometry_correct: 3 },
        motion: { action_executed: 3, smoothness: 4, camera_movement: 2 }
      },
      attribution: {
        lowest_element: 'frame_consistency',
        rope: 'rope_3_lora_multipliers',
        next_change_json_field: 'loras_multipliers',
        next_change_value: '1.0;0.2 0.2;1.3'
      }
    });

    const res = await request.post(`/api/iterations/${iter.body.id}/next`);
    expect(res.status).toBe(201);
    expect(res.body.iteration_number).toBe(2);
    expect(res.body.parent_iteration_id).toBe(iter.body.id);
    expect(res.body.json_contents.loras_multipliers).toBe('1.0;0.2 0.2;1.3');
    expect(res.body.json_contents.seed).toBe(544083690); // seed locked from parent
    expect(res.body.json_contents.video_length).toBe(32); // iteration mode
    expect(res.body.change_from_parent).toContain('loras_multipliers');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement iteration routes**

```js
// backend/routes/iterations.js
import { Router } from 'express';
import { validateIteration, validateEvaluation, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS } from '../store/validators.js';

function computeTotals(scores, config) {
  const identity = { ...scores.identity };
  identity.total = IDENTITY_FIELDS.reduce((sum, f) => sum + (identity[f] || 0), 0);
  identity.max = IDENTITY_FIELDS.length * 5;

  const location = { ...scores.location };
  location.total = LOCATION_FIELDS.reduce((sum, f) => sum + (location[f] || 0), 0);
  location.max = LOCATION_FIELDS.length * 5;

  const motion = { ...scores.motion };
  motion.total = MOTION_FIELDS.reduce((sum, f) => sum + (motion[f] || 0), 0);
  motion.max = MOTION_FIELDS.length * 5;

  const grand_total = identity.total + location.total + motion.total;
  const grand_max = identity.max + location.max + motion.max;

  return { identity, location, motion, grand_total, grand_max };
}

export function createIterationRoutes(store, config = { score_lock_threshold: 65, iteration_frame_count: 32, production_frame_count: 81, iteration_save_dir: './iterations' }) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      validateIteration(req.body);
      const existing = await store.list('iterations', i => i.clip_id === req.body.clip_id);
      const iteration_number = existing.length + 1;

      const iteration = await store.create('iterations', {
        clip_id: req.body.clip_id,
        iteration_number,
        json_filename: req.body.json_filename || `iter_${String(iteration_number).padStart(2, '0')}.json`,
        json_path: req.body.json_path || null,
        json_contents: req.body.json_contents || {},
        seed_used: req.body.json_contents?.seed || null,
        status: 'pending',
        evaluation_id: null,
        parent_iteration_id: req.body.parent_iteration_id || null,
        change_from_parent: req.body.change_from_parent || null
      });

      // Update clip status to in_progress if it was not_started
      try {
        const clip = await store.get('clips', req.body.clip_id);
        if (clip.status === 'not_started') {
          await store.update('clips', clip.id, { status: 'in_progress' });
        }
      } catch { /* clip might not exist in tests */ }

      res.status(201).json(iteration);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const iteration = await store.get('iterations', req.params.id);
      if (iteration.evaluation_id) {
        iteration.evaluation = await store.get('evaluations', iteration.evaluation_id);
      }
      res.json(iteration);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.post('/:id/evaluate', async (req, res) => {
    try {
      validateEvaluation({ iteration_id: req.params.id, ...req.body });
      const scores = computeTotals(req.body.scores, config);
      const production_ready = scores.grand_total >= config.score_lock_threshold;

      const evaluation = await store.create('evaluations', {
        iteration_id: req.params.id,
        scores,
        attribution: req.body.attribution || {},
        qualitative_notes: req.body.qualitative_notes || '',
        production_ready
      });

      await store.update('iterations', req.params.id, {
        status: 'evaluated',
        evaluation_id: evaluation.id
      });

      res.status(201).json(evaluation);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/:id/lock', async (req, res) => {
    try {
      const iteration = await store.get('iterations', req.params.id);
      await store.update('iterations', req.params.id, { status: 'locked' });

      // Update clip
      await store.update('clips', iteration.clip_id, {
        status: 'locked',
        locked_iteration_id: req.params.id
      });

      // Generate production JSON (production frame count, same seed)
      const prodJson = {
        ...iteration.json_contents,
        video_length: config.production_frame_count || 81
      };

      res.json({ locked: true, production_json: prodJson });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.post('/:id/next', async (req, res) => {
    try {
      const parent = await store.get('iterations', req.params.id);

      // Get evaluation for attribution
      let attribution = {};
      if (parent.evaluation_id) {
        const evaluation = await store.get('evaluations', parent.evaluation_id);
        attribution = evaluation.attribution || {};
      }

      // Apply the change from attribution
      const nextJson = { ...parent.json_contents };
      if (attribution.next_change_json_field && attribution.next_change_value !== undefined) {
        nextJson[attribution.next_change_json_field] = attribution.next_change_value;
      }
      // Ensure iteration mode
      nextJson.seed = parent.json_contents.seed || parent.seed_used;
      nextJson.video_length = config.iteration_frame_count;

      // Auto-increment filename
      const parentNum = parent.iteration_number;
      const nextNum = parentNum + 1;
      const baseName = parent.json_filename.replace(/\d+\.json$/, '');
      const nextFilename = `${baseName}${String(nextNum).padStart(2, '0')}.json`;

      const change_from_parent = attribution.next_change_json_field
        ? `${attribution.next_change_json_field}: ${JSON.stringify(parent.json_contents[attribution.next_change_json_field])} -> ${JSON.stringify(attribution.next_change_value)}`
        : req.body?.change_from_parent || 'manual change';

      // Write JSON file to disk so Wan2GP can load it
      const { writeFile, mkdir } = await import('fs/promises');
      const { join } = await import('path');
      const saveDir = config.iteration_save_dir || './iterations';
      await mkdir(saveDir, { recursive: true });
      const savePath = join(saveDir, nextFilename);
      await writeFile(savePath, JSON.stringify(nextJson, null, 2));

      // Count existing iterations for this clip to get correct number
      const existing = await store.list('iterations', i => i.clip_id === parent.clip_id);

      const nextIteration = await store.create('iterations', {
        clip_id: parent.clip_id,
        iteration_number: existing.length + 1,
        json_filename: nextFilename,
        json_path: savePath,
        json_contents: nextJson,
        seed_used: nextJson.seed,
        status: 'pending',
        evaluation_id: null,
        parent_iteration_id: parent.id,
        change_from_parent
      });

      res.status(201).json(nextIteration);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Projects/iteratarr/backend && npm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: iteration routes — create, evaluate with scoring, lock, generate next"
```

---

## Task 5: Backend REST API — Characters

**Files:**
- Modify: `backend/routes/characters.js`
- Create: `backend/tests/routes/characters.test.js`

- [ ] **Step 1: Write character route tests**

```js
// backend/tests/routes/characters.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Characters API', () => {
  let tmpDir, request;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-test-'));
    const { app } = createTestApp(tmpDir);
    request = supertest(app);
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('POST /api/characters creates a character', async () => {
    const res = await request.post('/api/characters').send({
      name: 'Mick Doohan', trigger_word: 'mckdhn',
      lora_files: ['mckdhn-v1-cloud-high.safetensors', 'mckdhn-v1-cloud-low.safetensors'],
      locked_identity_block: 'mckdhn, fit healthy mid to late fifties...',
      proven_settings: { guidance_scale: 6.1, loras_multipliers: '1.0;0.3 0.3;1.2' }
    });
    expect(res.status).toBe(201);
    expect(res.body.trigger_word).toBe('mckdhn');
  });

  it('GET /api/characters lists all characters', async () => {
    await request.post('/api/characters').send({ name: 'Mick', trigger_word: 'mckdhn' });
    await request.post('/api/characters').send({ name: 'Jack', trigger_word: 'jckdhn' });
    const res = await request.get('/api/characters');
    expect(res.body).toHaveLength(2);
  });

  it('PATCH /api/characters/:id updates character', async () => {
    const char = await request.post('/api/characters').send({ name: 'Mick', trigger_word: 'mckdhn' });
    const res = await request.patch(`/api/characters/${char.body.id}`).send({
      proven_settings: { guidance_scale: 6.2 }
    });
    expect(res.body.proven_settings.guidance_scale).toBe(6.2);
  });
});
```

- [ ] **Step 2: Implement character routes**

```js
// backend/routes/characters.js
import { Router } from 'express';
import { validateCharacter } from '../store/validators.js';

export function createCharacterRoutes(store) {
  const router = Router();

  router.get('/', async (req, res) => {
    const characters = await store.list('characters');
    res.json(characters);
  });

  router.post('/', async (req, res) => {
    try {
      validateCharacter(req.body);
      const character = await store.create('characters', {
        name: req.body.name,
        trigger_word: req.body.trigger_word,
        lora_files: req.body.lora_files || [],
        locked_identity_block: req.body.locked_identity_block || '',
        locked_negative_block: req.body.locked_negative_block || '',
        proven_settings: req.body.proven_settings || {},
        best_iteration_id: null,
        notes: req.body.notes || ''
      });
      res.status(201).json(character);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const character = await store.get('characters', req.params.id);
      res.json(character);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const updated = await store.update('characters', req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  return router;
}
```

- [ ] **Step 3: Run all tests**

Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: character registry API routes"
```

---

## Task 6: File Watcher — Auto-ingest Wan2GP JSONs

**Files:**
- Modify: `backend/watcher.js`
- Create: `backend/tests/watcher.test.js`

- [ ] **Step 1: Write watcher tests**

```js
// backend/tests/watcher.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createWatcher } from '../watcher.js';

describe('File Watcher', () => {
  let tmpDir, watchDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-watch-'));
    watchDir = join(tmpDir, 'watch');
    mkdirSync(watchDir, { recursive: true });
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('detects new JSON files and calls callback', async () => {
    const detected = [];
    const watcher = createWatcher([watchDir], (filePath, contents) => {
      detected.push({ filePath, contents });
    });

    await watcher.start();

    // Write a JSON file into watched dir
    const testJson = { prompt: 'test', seed: 42 };
    writeFileSync(join(watchDir, 'test_001.json'), JSON.stringify(testJson));

    // Wait for watcher to pick it up
    await new Promise(resolve => setTimeout(resolve, 1500));

    await watcher.stop();

    expect(detected.length).toBeGreaterThanOrEqual(1);
    expect(detected[0].contents.seed).toBe(42);
  });

  it('ignores non-JSON files', async () => {
    const detected = [];
    const watcher = createWatcher([watchDir], (filePath, contents) => {
      detected.push({ filePath, contents });
    });

    await watcher.start();
    writeFileSync(join(watchDir, 'test.txt'), 'not json');
    await new Promise(resolve => setTimeout(resolve, 1500));
    await watcher.stop();

    expect(detected).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement watcher**

```js
// backend/watcher.js
import chokidar from 'chokidar';
import { readFile } from 'fs/promises';
import { extname } from 'path';

export function createWatcher(directories, onNewJson) {
  let watcher = null;

  return {
    async start() {
      const validDirs = directories.filter(Boolean);
      if (validDirs.length === 0) return;

      watcher = chokidar.watch(validDirs, {
        ignoreInitial: true,
        depth: 1,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
      });

      watcher.on('add', async (filePath) => {
        if (extname(filePath).toLowerCase() !== '.json') return;
        try {
          const raw = await readFile(filePath, 'utf-8');
          const contents = JSON.parse(raw);
          onNewJson(filePath, contents);
        } catch (err) {
          console.error(`Watcher: failed to parse ${filePath}:`, err.message);
        }
      });
    },

    async stop() {
      if (watcher) await watcher.close();
    }
  };
}
```

- [ ] **Step 3: Run tests**

Run: `cd /c/Projects/iteratarr/backend && npm test`
Expected: ALL PASS (watcher test may need increased timeout on slow systems)

- [ ] **Step 4: Integrate watcher with server.js**

Add to `backend/server.js` after route mounting:
```js
import { createWatcher } from './watcher.js';

// Auto-ingest watcher
const watcher = createWatcher(
  [config.wan2gp_json_dir, config.iteration_save_dir].filter(Boolean),
  async (filePath, contents) => {
    console.log(`[Watcher] New JSON detected: ${filePath}`);
    // Store as unlinked iteration — user assigns to clip via UI
    try {
      await store.create('iterations', {
        clip_id: '_unassigned',
        iteration_number: 0,
        json_filename: filePath.split(/[/\\]/).pop(),
        json_path: filePath,
        json_contents: contents,
        seed_used: contents.seed || null,
        status: 'pending',
        evaluation_id: null,
        parent_iteration_id: null,
        change_from_parent: null
      });
    } catch (err) {
      console.error('[Watcher] Failed to ingest:', err.message);
    }
  }
);

// Start watcher when server starts
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  watcher.start();
  app.listen(config.port, () => {
    console.log(`Iteratarr backend running on port ${config.port}`);
    console.log(`Watching: ${config.wan2gp_json_dir}`);
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: file watcher auto-ingests Wan2GP JSON outputs"
```

---

## Task 7: Frontend Scaffold — React + Vite + Tailwind

**Files:**
- Create: `frontend/` directory via Vite scaffold
- Create: `frontend/tailwind.config.js`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/api.js`
- Create: `frontend/src/constants.js`

- [ ] **Step 1: Scaffold React app with Vite**

```bash
cd /c/Projects/iteratarr
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install recharts
```

- [ ] **Step 2: Configure Tailwind with dark theme and amber accent**

```js
// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3848,
    proxy: {
      '/api': 'http://localhost:3847'
    }
  }
});
```

```css
/* frontend/src/index.css */
@import "tailwindcss";

@theme {
  --color-accent: #d97706;
  --color-accent-dim: #92400e;
  --color-surface: #1a1a1a;
  --color-surface-raised: #262626;
  --color-surface-overlay: #333333;
  --color-score-low: #ef4444;
  --color-score-mid: #d97706;
  --color-score-high: #22c55e;
  --color-status-red: #ef4444;
  --color-status-yellow: #eab308;
  --color-status-green: #22c55e;
  --color-status-blue: #3b82f6;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
}

body {
  @apply bg-surface text-gray-200 font-sans;
}
```

- [ ] **Step 3: Create constants — ropes, score categories, statuses**

```js
// frontend/src/constants.js
export const ROPES = [
  { id: 'rope_1_prompt_position', label: 'Rope 1 — Prompt Position', field: 'prompt', description: 'Identity block must appear before location. Every additional word dilutes attention.' },
  { id: 'rope_2_attention_weighting', label: 'Rope 2 — Attention Weighting', field: 'prompt', description: 'Boost identity tokens: (mckdhn:1.3). Reduce competing: (Monaco:0.9). Range: 0.5-1.5' },
  { id: 'rope_3_lora_multipliers', label: 'Rope 3 — LoRA Multipliers', field: 'loras_multipliers', description: 'Phase-aware: "high;low high;low". First=high noise LoRA, second=low noise LoRA.' },
  { id: 'rope_4a_cfg_high', label: 'Rope 4a — CFG High Noise', field: 'guidance_scale', description: 'Prompt adherence in composition pass. Sweet spot: 5.9-6.2' },
  { id: 'rope_4b_cfg_low', label: 'Rope 4b — CFG Low Noise', field: 'guidance2_scale', description: 'Prompt adherence in identity refinement. Default 3, untested above 4.' },
  { id: 'rope_5_steps_skipping', label: 'Rope 5 — Steps Skipping', field: 'skip_steps_cache_type', description: 'Taylor2 for iteration speed. Off for production.' },
  { id: 'rope_6_alt_prompt', label: 'Rope 6 — Alt Prompt', field: 'alt_prompt', description: 'Low noise phase only. Pure identity block when location competes.' },
  { id: 'bonus_flow_shift', label: 'Bonus — flow_shift', field: 'flow_shift', description: 'Temporal coherence. Higher = more stable. Default 12, range 1-20.' },
  { id: 'bonus_nag_scale', label: 'Bonus — NAG_scale', field: 'NAG_scale', description: 'Normalised Attention Guidance. Default 1, range 1-3.' },
  { id: 'bonus_sample_solver', label: 'Bonus — sample_solver', field: 'sample_solver', description: 'Solver algorithm selection.' },
  { id: 'multiple', label: 'Multiple ropes', field: null, description: 'Multiple parameters changed.' }
];

export const IDENTITY_FIELDS = [
  { key: 'face_match', label: 'Face Match Overall' },
  { key: 'head_shape', label: 'Head Shape' },
  { key: 'jaw', label: 'Jaw Line' },
  { key: 'cheekbones', label: 'Cheekbones' },
  { key: 'eyes_brow', label: 'Eyes / Brow' },
  { key: 'skin_texture', label: 'Skin Texture / Age' },
  { key: 'hair', label: 'Hair' },
  { key: 'frame_consistency', label: 'Frame Consistency' }
];

export const LOCATION_FIELDS = [
  { key: 'location_correct', label: 'Location Correct' },
  { key: 'lighting_correct', label: 'Lighting Correct' },
  { key: 'wardrobe_correct', label: 'Wardrobe Correct' },
  { key: 'geometry_correct', label: 'Geometry Correct' }
];

export const MOTION_FIELDS = [
  { key: 'action_executed', label: 'Action Executed' },
  { key: 'smoothness', label: 'Smoothness' },
  { key: 'camera_movement', label: 'Camera Movement' }
];

export const CLIP_STATUSES = {
  not_started: { label: 'Not Started', color: 'bg-status-red' },
  in_progress: { label: 'In Progress', color: 'bg-status-yellow' },
  evaluating: { label: 'Evaluating', color: 'bg-status-yellow' },
  locked: { label: 'Locked', color: 'bg-status-green' },
  in_queue: { label: 'In Queue', color: 'bg-status-blue' }
};

export const SCORE_LOCK_THRESHOLD = 65;
export const GRAND_MAX = 75;
```

- [ ] **Step 4: Create API fetch wrapper**

```js
// frontend/src/api.js
const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  // Projects
  listProjects: () => request('/projects'),
  createProject: (data) => request('/projects', { method: 'POST', body: data }),
  getProject: (id) => request(`/projects/${id}`),
  createScene: (projectId, data) => request(`/projects/${projectId}/scenes`, { method: 'POST', body: data }),

  // Clips
  listClips: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/clips${qs ? `?${qs}` : ''}`);
  },
  createClip: (data) => request('/clips', { method: 'POST', body: data }),
  updateClip: (id, data) => request(`/clips/${id}`, { method: 'PATCH', body: data }),
  getClipIterations: (id) => request(`/clips/${id}/iterations`),

  // Iterations
  createIteration: (data) => request('/iterations', { method: 'POST', body: data }),
  getIteration: (id) => request(`/iterations/${id}`),
  evaluate: (id, data) => request(`/iterations/${id}/evaluate`, { method: 'POST', body: data }),
  lock: (id) => request(`/iterations/${id}/lock`, { method: 'POST' }),
  generateNext: (id) => request(`/iterations/${id}/next`, { method: 'POST' }),

  // Characters
  listCharacters: () => request('/characters'),
  createCharacter: (data) => request('/characters', { method: 'POST', body: data }),
  getCharacter: (id) => request(`/characters/${id}`),
  updateCharacter: (id, data) => request(`/characters/${id}`, { method: 'PATCH', body: data }),
};
```

- [ ] **Step 5: Create three-panel App shell**

```jsx
// frontend/src/App.jsx
import { useState } from 'react';

const VIEWS = {
  episodes: 'Episode Tracker',
  characters: 'Character Registry',
  trends: 'Score Trends'
};

export default function App() {
  const [view, setView] = useState('episodes');
  const [selectedClip, setSelectedClip] = useState(null);

  return (
    <div className="h-screen flex flex-col bg-surface text-gray-200">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 bg-surface-raised border-b border-gray-700">
        <h1 className="text-accent font-mono font-bold tracking-wide text-lg">ITERATARR</h1>
        <span className="text-gray-500 text-xs font-mono">v0.1.0</span>
      </header>

      {/* Three panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — Navigation */}
        <aside className="w-56 bg-surface-raised border-r border-gray-700 flex flex-col">
          <nav className="p-3 space-y-1">
            {Object.entries(VIEWS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setView(key); setSelectedClip(null); }}
                className={`w-full text-left px-3 py-2 rounded text-sm font-mono transition-colors ${
                  view === key ? 'bg-accent text-black font-bold' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-overlay'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Centre panel — Main content */}
        <main className="flex-1 overflow-auto p-4">
          <div className="text-gray-500 font-mono text-sm">
            {view === 'episodes' && !selectedClip && <p>Episode Tracker — loading...</p>}
            {view === 'episodes' && selectedClip && <p>Clip Detail — {selectedClip}</p>}
            {view === 'characters' && <p>Character Registry — loading...</p>}
            {view === 'trends' && <p>Score Trends — loading...</p>}
          </div>
        </main>

        {/* Right panel — Production Queue */}
        <aside className="w-64 bg-surface-raised border-l border-gray-700 p-3">
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">Production Queue</h2>
          <p className="text-gray-600 text-xs font-mono">No clips queued</p>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify frontend runs**

```bash
cd /c/Projects/iteratarr/frontend
npm run dev
```
Open browser to http://localhost:3848 — should see dark three-panel layout with ITERATARR header and amber accent navigation.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/iteratarr
git add -A
git commit -m "feat: frontend scaffold — React + Vite + Tailwind dark theme, three-panel layout"
```

---

## Task 8: Episode Tracker Kanban

**Files:**
- Create: `frontend/src/components/kanban/EpisodeTracker.jsx`
- Create: `frontend/src/components/kanban/ClipCard.jsx`
- Create: `frontend/src/hooks/useApi.js`
- Modify: `frontend/src/App.jsx` (wire up)

- [ ] **Step 1: Create useApi data fetching hook**

```jsx
// frontend/src/hooks/useApi.js
import { useState, useEffect, useCallback } from 'react';

export function useApi(fetchFn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}
```

- [ ] **Step 2: Create ClipCard component**

```jsx
// frontend/src/components/kanban/ClipCard.jsx
import { CLIP_STATUSES } from '../../constants';

export default function ClipCard({ clip, onClick }) {
  const status = CLIP_STATUSES[clip.status] || CLIP_STATUSES.not_started;

  return (
    <button
      onClick={() => onClick(clip)}
      className="w-full text-left p-3 bg-surface rounded border border-gray-700 hover:border-accent/50 transition-colors group"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-mono text-gray-200 group-hover:text-accent transition-colors truncate">
          {clip.name}
        </span>
      </div>
      {clip.characters?.length > 0 && (
        <div className="flex gap-1 mb-1">
          {clip.characters.map(c => (
            <span key={c} className="text-xs font-mono bg-surface-overlay px-1.5 py-0.5 rounded text-gray-400">{c}</span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{clip.location || 'No location'}</span>
        {clip.best_score && (
          <span className="font-mono font-bold text-accent">{clip.best_score}/75</span>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 3: Create EpisodeTracker kanban board**

```jsx
// frontend/src/components/kanban/EpisodeTracker.jsx
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { CLIP_STATUSES } from '../../constants';
import ClipCard from './ClipCard';

const COLUMNS = ['not_started', 'in_progress', 'evaluating', 'locked', 'in_queue'];

export default function EpisodeTracker({ onSelectClip }) {
  const { data: clips, loading, error } = useApi(() => api.listClips(), []);

  if (loading) return <p className="text-gray-500 font-mono text-sm">Loading clips...</p>;
  if (error) return <p className="text-red-400 font-mono text-sm">Error: {error}</p>;

  const grouped = {};
  for (const col of COLUMNS) grouped[col] = [];
  for (const clip of (clips || [])) {
    const status = clip.status || 'not_started';
    if (grouped[status]) grouped[status].push(clip);
  }

  return (
    <div className="flex gap-4 h-full overflow-x-auto">
      {COLUMNS.map(col => {
        const status = CLIP_STATUSES[col];
        return (
          <div key={col} className="flex-shrink-0 w-56">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${status.color}`} />
              <h3 className="text-xs font-mono text-gray-400 uppercase tracking-wider">{status.label}</h3>
              <span className="text-xs font-mono text-gray-600">{grouped[col].length}</span>
            </div>
            <div className="space-y-2">
              {grouped[col].map(clip => (
                <ClipCard key={clip.id} clip={clip} onClick={onSelectClip} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Wire into App.jsx**

Replace the episodes placeholder in App.jsx centre panel:
```jsx
import EpisodeTracker from './components/kanban/EpisodeTracker';
// ...
{view === 'episodes' && !selectedClip && (
  <EpisodeTracker onSelectClip={(clip) => setSelectedClip(clip)} />
)}
```

- [ ] **Step 5: Verify kanban renders**

Start both backend and frontend. Create a project and clip via curl or the API, then check the kanban board renders the card in the correct column.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: episode tracker kanban with clip cards and status columns"
```

---

## Task 9: Evaluation Panel — Sliders and Scoring

**Files:**
- Create: `frontend/src/components/evaluation/ScoreSlider.jsx`
- Create: `frontend/src/components/evaluation/ScoreGroup.jsx`
- Create: `frontend/src/components/evaluation/ScoreRing.jsx`
- Create: `frontend/src/components/evaluation/AttributionPanel.jsx`
- Create: `frontend/src/components/evaluation/EvaluationPanel.jsx`

- [ ] **Step 1: Create ScoreSlider component**

```jsx
// frontend/src/components/evaluation/ScoreSlider.jsx
export default function ScoreSlider({ label, value, onChange }) {
  const pct = ((value - 1) / 4) * 100;
  const color = pct < 40 ? 'text-score-low' : pct < 70 ? 'text-score-mid' : 'text-score-high';
  const track = pct < 40 ? 'accent-red-500' : pct < 70 ? 'accent-amber-600' : 'accent-green-500';

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-40 text-xs font-mono text-gray-400 text-right shrink-0">{label}</span>
      <input
        type="range" min={1} max={5} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`flex-1 h-1.5 rounded-full appearance-none bg-gray-700 cursor-pointer ${track}`}
        style={{ accentColor: pct < 40 ? '#ef4444' : pct < 70 ? '#d97706' : '#22c55e' }}
      />
      <span className={`w-6 text-right text-sm font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Create ScoreGroup component**

```jsx
// frontend/src/components/evaluation/ScoreGroup.jsx
import ScoreSlider from './ScoreSlider';

export default function ScoreGroup({ title, fields, scores, onChange }) {
  const total = fields.reduce((sum, f) => sum + (scores[f.key] || 1), 0);
  const max = fields.length * 5;
  const pct = total / max;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider">{title}</h4>
        <span className={`text-sm font-mono font-bold ${
          pct < 0.5 ? 'text-score-low' : pct < 0.75 ? 'text-score-mid' : 'text-score-high'
        }`}>
          {total}/{max}
        </span>
      </div>
      {fields.map(f => (
        <ScoreSlider
          key={f.key}
          label={f.label}
          value={scores[f.key] || 1}
          onChange={(val) => onChange(f.key, val)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create ScoreRing component**

```jsx
// frontend/src/components/evaluation/ScoreRing.jsx
export default function ScoreRing({ score, max, threshold }) {
  const pct = score / max;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (pct * circumference);
  const color = score >= threshold ? '#22c55e' : pct < 0.5 ? '#ef4444' : '#d97706';

  return (
    <div className="relative w-28 h-28">
      <svg viewBox="0 0 100 100" className="transform -rotate-90">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#333" strokeWidth="6" />
        <circle cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-300" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-mono font-bold" style={{ color }}>{score}</span>
        <span className="text-xs font-mono text-gray-500">/{max}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create AttributionPanel component**

```jsx
// frontend/src/components/evaluation/AttributionPanel.jsx
import { ROPES, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS } from '../../constants';

const ALL_SCORE_FIELDS = [...IDENTITY_FIELDS, ...LOCATION_FIELDS, ...MOTION_FIELDS];

export default function AttributionPanel({ attribution, onChange }) {
  return (
    <div className="border border-gray-700 rounded p-3 space-y-3">
      <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Attribution</h4>

      <div>
        <label className="text-xs text-gray-400 font-mono block mb-1">Lowest Scoring Element</label>
        <select
          value={attribution.lowest_element || ''}
          onChange={(e) => onChange({ ...attribution, lowest_element: e.target.value })}
          className="w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200"
        >
          <option value="">Select element...</option>
          {ALL_SCORE_FIELDS.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-400 font-mono block mb-1">Most Likely Rope</label>
        <select
          value={attribution.rope || ''}
          onChange={(e) => onChange({ ...attribution, rope: e.target.value })}
          className="w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200"
        >
          <option value="">Select rope...</option>
          {ROPES.map(r => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        {attribution.rope && (
          <p className="text-xs text-gray-500 mt-1 font-mono">
            {ROPES.find(r => r.id === attribution.rope)?.description}
          </p>
        )}
      </div>

      <div>
        <label className="text-xs text-gray-400 font-mono block mb-1">Confidence</label>
        <div className="flex gap-2">
          {['low', 'medium', 'high'].map(level => (
            <button
              key={level}
              onClick={() => onChange({ ...attribution, confidence: level })}
              className={`px-3 py-1 rounded text-xs font-mono ${
                attribution.confidence === level
                  ? 'bg-accent text-black font-bold'
                  : 'bg-surface-overlay text-gray-400 hover:text-gray-200'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 font-mono block mb-1">Next Change</label>
        <input
          type="text"
          value={attribution.next_change_description || ''}
          onChange={(e) => onChange({ ...attribution, next_change_description: e.target.value })}
          placeholder="Describe the single change to make..."
          className="w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
        />
      </div>

      {attribution.rope && ROPES.find(r => r.id === attribution.rope)?.field && (
        <div>
          <label className="text-xs text-gray-400 font-mono block mb-1">
            JSON Field: <code className="text-accent">{ROPES.find(r => r.id === attribution.rope).field}</code>
          </label>
          <input
            type="text"
            value={attribution.next_change_value || ''}
            onChange={(e) => onChange({
              ...attribution,
              next_change_json_field: ROPES.find(r => r.id === attribution.rope).field,
              next_change_value: e.target.value
            })}
            placeholder="New value..."
            className="w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create EvaluationPanel master component**

```jsx
// frontend/src/components/evaluation/EvaluationPanel.jsx
import { useState } from 'react';
import ScoreGroup from './ScoreGroup';
import ScoreRing from './ScoreRing';
import AttributionPanel from './AttributionPanel';
import { api } from '../../api';
import { IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS, SCORE_LOCK_THRESHOLD, GRAND_MAX } from '../../constants';

const defaultScores = (fields) => Object.fromEntries(fields.map(f => [f.key, 3]));

export default function EvaluationPanel({ iteration, onSaved, onNext, onLocked }) {
  const [identity, setIdentity] = useState(defaultScores(IDENTITY_FIELDS));
  const [location, setLocation] = useState(defaultScores(LOCATION_FIELDS));
  const [motion, setMotion] = useState(defaultScores(MOTION_FIELDS));
  const [attribution, setAttribution] = useState({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const grandTotal =
    IDENTITY_FIELDS.reduce((s, f) => s + (identity[f.key] || 1), 0) +
    LOCATION_FIELDS.reduce((s, f) => s + (location[f.key] || 1), 0) +
    MOTION_FIELDS.reduce((s, f) => s + (motion[f.key] || 1), 0);

  const canLock = grandTotal >= SCORE_LOCK_THRESHOLD;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.evaluate(iteration.id, {
        scores: { identity, location, motion },
        attribution,
        qualitative_notes: notes
      });
      onSaved?.();
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    setSaving(true);
    try {
      const next = await api.generateNext(iteration.id);
      onNext?.(next);
    } catch (err) {
      alert(`Generate failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLock = async () => {
    setSaving(true);
    try {
      await api.lock(iteration.id);
      onLocked?.();
    } catch (err) {
      alert(`Lock failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-mono text-gray-200">{iteration.json_filename}</h3>
          <p className="text-xs text-gray-500 font-mono">
            Iteration {iteration.iteration_number} — Seed: {iteration.seed_used || 'none'}
          </p>
          {iteration.change_from_parent && (
            <p className="text-xs text-accent font-mono mt-1">Changed: {iteration.change_from_parent}</p>
          )}
        </div>
        <ScoreRing score={grandTotal} max={GRAND_MAX} threshold={SCORE_LOCK_THRESHOLD} />
      </div>

      {/* Score sliders */}
      <ScoreGroup title="Identity" fields={IDENTITY_FIELDS} scores={identity}
        onChange={(key, val) => setIdentity(prev => ({ ...prev, [key]: val }))} />
      <ScoreGroup title="Location" fields={LOCATION_FIELDS} scores={location}
        onChange={(key, val) => setLocation(prev => ({ ...prev, [key]: val }))} />
      <ScoreGroup title="Motion" fields={MOTION_FIELDS} scores={motion}
        onChange={(key, val) => setMotion(prev => ({ ...prev, [key]: val }))} />

      {/* Grand total */}
      <div className="border-t border-gray-700 pt-3 flex items-center justify-between">
        <span className="text-sm font-mono text-gray-400 uppercase">Grand Total</span>
        <span className={`text-xl font-mono font-bold ${
          canLock ? 'text-score-high' : grandTotal / GRAND_MAX < 0.5 ? 'text-score-low' : 'text-score-mid'
        }`}>
          {grandTotal}/{GRAND_MAX}
        </span>
      </div>

      {/* Attribution */}
      <AttributionPanel attribution={attribution} onChange={setAttribution} />

      {/* Notes */}
      <div>
        <label className="text-xs font-mono text-gray-500 block mb-1">Qualitative Notes</label>
        <textarea
          value={notes} onChange={(e) => setNotes(e.target.value)}
          rows={3} placeholder="What did you notice?"
          className="w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50">
          Save Evaluation
        </button>
        <button onClick={handleNext} disabled={saving || !attribution.rope}
          className="px-4 py-2 bg-surface-overlay text-gray-200 text-sm font-mono rounded hover:bg-gray-600 disabled:opacity-50 border border-gray-600">
          Generate Next Iteration
        </button>
        {canLock && (
          <button onClick={handleLock} disabled={saving}
            className="px-4 py-2 bg-score-high text-black text-sm font-mono font-bold rounded hover:bg-green-400 disabled:opacity-50">
            Lock as Production
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify evaluation panel renders**

Wire EvaluationPanel into the clip detail view path. Create a test iteration via API, navigate to it, verify sliders work and score ring updates live.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: evaluation panel — score sliders, score ring, attribution, rope reference"
```

---

## Task 10: Clip Detail View with Iteration Lineage

**Files:**
- Create: `frontend/src/components/clips/ClipDetail.jsx`
- Create: `frontend/src/components/clips/IterationLineage.jsx`
- Modify: `frontend/src/App.jsx` (wire up clip detail)

- [ ] **Step 1: Create IterationLineage component**

```jsx
// frontend/src/components/clips/IterationLineage.jsx
export default function IterationLineage({ iterations, selectedId, onSelect }) {
  if (!iterations?.length) return <p className="text-gray-500 text-xs font-mono">No iterations yet</p>;

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2">
      {iterations.map((iter, i) => {
        const isSelected = iter.id === selectedId;
        const isLocked = iter.status === 'locked';
        const score = iter.evaluation?.scores?.grand_total;
        const pct = score ? score / 75 : 0;
        const borderColor = isLocked ? 'border-score-high' : isSelected ? 'border-accent' : 'border-gray-600';

        return (
          <div key={iter.id} className="flex items-center">
            <button
              onClick={() => onSelect(iter)}
              className={`flex flex-col items-center px-3 py-2 rounded border-2 ${borderColor} ${
                isSelected ? 'bg-surface-overlay' : 'bg-surface'
              } hover:border-accent/70 transition-colors`}
            >
              <span className="text-xs font-mono text-gray-400">#{iter.iteration_number}</span>
              {score !== undefined && (
                <span className={`text-sm font-mono font-bold ${
                  pct < 0.5 ? 'text-score-low' : pct < 0.75 ? 'text-score-mid' : 'text-score-high'
                }`}>
                  {score}/75
                </span>
              )}
              {isLocked && <span className="text-xs">LOCKED</span>}
            </button>
            {i < iterations.length - 1 && (
              <span className="text-gray-600 mx-1 font-mono">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create ClipDetail component**

```jsx
// frontend/src/components/clips/ClipDetail.jsx
import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { CLIP_STATUSES } from '../../constants';
import IterationLineage from './IterationLineage';
import EvaluationPanel from '../evaluation/EvaluationPanel';

export default function ClipDetail({ clip, onBack }) {
  const { data: iterations, loading, refetch } = useApi(() => api.getClipIterations(clip.id), [clip.id]);
  const [selectedIteration, setSelectedIteration] = useState(null);
  const status = CLIP_STATUSES[clip.status] || CLIP_STATUSES.not_started;

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button onClick={onBack} className="text-xs font-mono text-gray-500 hover:text-accent">
        ← Back to Episode Tracker
      </button>

      {/* Clip info */}
      <div className="border border-gray-700 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-mono text-gray-200">{clip.name}</h2>
          <span className={`px-2 py-0.5 rounded-full text-xs font-mono ${status.color} text-black font-bold`}>
            {status.label}
          </span>
        </div>
        <div className="flex gap-4 text-xs font-mono text-gray-400">
          {clip.location && <span>Location: {clip.location}</span>}
          {clip.characters?.length > 0 && <span>Characters: {clip.characters.join(', ')}</span>}
        </div>
      </div>

      {/* Iteration lineage */}
      <div>
        <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Iteration History</h3>
        {loading ? (
          <p className="text-gray-500 text-xs font-mono">Loading...</p>
        ) : (
          <IterationLineage
            iterations={iterations || []}
            selectedId={selectedIteration?.id}
            onSelect={setSelectedIteration}
          />
        )}
      </div>

      {/* Evaluation panel for selected iteration */}
      {selectedIteration && (
        <EvaluationPanel
          iteration={selectedIteration}
          onSaved={refetch}
          onNext={(next) => { refetch(); setSelectedIteration(next); }}
          onLocked={refetch}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire into App.jsx**

```jsx
import ClipDetail from './components/clips/ClipDetail';
// In centre panel:
{view === 'episodes' && selectedClip && (
  <ClipDetail clip={selectedClip} onBack={() => setSelectedClip(null)} />
)}
```

- [ ] **Step 4: Verify end-to-end flow**

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Create test data via curl:
```bash
# Create project
curl -X POST http://localhost:3847/api/projects -H 'Content-Type: application/json' -d '{"name":"Kebbin Shop"}'
# Create scene (use project id from above)
curl -X POST http://localhost:3847/api/projects/PROJECT_ID/scenes -H 'Content-Type: application/json' -d '{"name":"Scene 01 — Monaco","episode":1}'
# Create clip (use scene id)
curl -X POST http://localhost:3847/api/clips -H 'Content-Type: application/json' -d '{"scene_id":"SCENE_ID","name":"Clip 1e — Mick on Balcony","characters":["mckdhn"],"location":"Monaco Balcony"}'
```
4. Navigate UI: see clip in kanban → click → see clip detail → create iteration via API → see lineage → select → evaluate

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: clip detail view with iteration lineage and evaluation panel"
```

---

## Task 11: Score Trend Chart

**Files:**
- Create: `frontend/src/components/trends/ScoreTrendChart.jsx`
- Modify: `frontend/src/App.jsx` (wire trends view)

- [ ] **Step 1: Create ScoreTrendChart**

```jsx
// frontend/src/components/trends/ScoreTrendChart.jsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { SCORE_LOCK_THRESHOLD } from '../../constants';

export default function ScoreTrendChart({ iterations }) {
  if (!iterations?.length) return <p className="text-gray-500 font-mono text-sm">No evaluated iterations yet</p>;

  const data = iterations
    .filter(i => i.evaluation)
    .map(i => ({
      name: `#${i.iteration_number}`,
      identity: i.evaluation.scores.identity.total,
      location: i.evaluation.scores.location.total,
      motion: i.evaluation.scores.motion.total,
      total: i.evaluation.scores.grand_total
    }));

  if (!data.length) return <p className="text-gray-500 font-mono text-sm">No evaluations to chart</p>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis dataKey="name" stroke="#666" fontSize={12} fontFamily="monospace" />
        <YAxis stroke="#666" fontSize={12} fontFamily="monospace" domain={[0, 75]} />
        <Tooltip
          contentStyle={{ backgroundColor: '#262626', border: '1px solid #444', fontFamily: 'monospace', fontSize: 12 }}
          labelStyle={{ color: '#999' }}
        />
        <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 12 }} />
        <ReferenceLine y={SCORE_LOCK_THRESHOLD} stroke="#22c55e" strokeDasharray="5 5" label={{ value: 'Lock', fill: '#22c55e', fontSize: 10 }} />
        <Line type="monotone" dataKey="total" stroke="#d97706" strokeWidth={2} name="Total" dot={{ r: 4 }} />
        <Line type="monotone" dataKey="identity" stroke="#3b82f6" strokeWidth={1} name="Identity" />
        <Line type="monotone" dataKey="location" stroke="#8b5cf6" strokeWidth={1} name="Location" />
        <Line type="monotone" dataKey="motion" stroke="#ec4899" strokeWidth={1} name="Motion" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Wire into trends view in App.jsx**

Display a clip selector dropdown + ScoreTrendChart. Fetch iterations for selected clip, enrich with evaluations, pass to chart.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: score trend chart with Recharts — identity, location, motion lines + lock threshold"
```

---

## Telemetry Foundation (Future-proofing)

**Note for the implementing agent:** Do NOT build telemetry yet. However, in every data model that gets created (evaluations, iterations, characters), include a `meta` field in the schema:

```json
"meta": {
  "app_version": "0.1.0",
  "created_at": "ISO date"
}
```

This field is the hook point for future telemetry. When we build it, we'll add opt-in collection here. For now it's just metadata.

---

## End-to-End Verification

After all tasks are complete, verify the core loop works:

1. Start backend and frontend
2. Create project, scene, clip via API
3. Create an iteration with a real Wan2GP JSON
4. See it in the kanban → click into clip detail
5. Select the iteration → evaluation panel appears
6. Move sliders → score ring updates live
7. Fill attribution → select rope → enter next change value
8. Click Save Evaluation
9. Click Generate Next Iteration → new iteration appears in lineage
10. Verify next iteration JSON has the change applied and seed locked
11. Score above 65 → Lock as Production button appears
