# Multi-Project AI Video Production Workspace

Monorepo with 5 active projects for AI-generated video production, Docker tooling, and subtitle management.

## Projects

| Project | Stack | Port | Entry |
|---------|-------|------|-------|
| `iteratarr/` | Express + React/Vite + SQLite | 3847 | `iteratarr/backend/server.js` |
| `composearr/` | Python 3.11+ / Typer+Rich CLI | CLI | `composearr/src/composearr/cli.py` |
| `subbrainarr/` | FastAPI + uvicorn | 9001 (9918/5918 ext) | `subbrainarr/backend/main.py` |
| `maparr/` | FastAPI + Go/Charm TUI | 9900 | `maparr/backend/main.py` · `maparr/maparr_charm/cmd/maparr/main.go` |
| `lora-trainer/` | Bash/Python + musubi-tuner | N/A | `lora-trainer/run_all.sh` · `lora-trainer/cloud_train.sh` |

**Output directory**: `kebbin-shop/` — episode scenes `scene-00`–`scene-11`

## Build & Run

```bash
# iteratarr
cd iteratarr/backend && npm install && npm run dev
cd iteratarr/frontend && npm install && npx vite

# composearr
cd composearr && pip install -e ".[dev,network]" && python -m composearr

# subbrainarr
cd subbrainarr/backend && pip install -r requirements.txt && uvicorn main:app --port 9001

# maparr Go TUI
cd maparr/maparr_charm && go run ./cmd/maparr --api http://localhost:9900
```

## Test Commands

```bash
# iteratarr
cd iteratarr/backend && npx vitest run

# composearr
cd composearr && python -m pytest tests/ -v -p no:capture

# maparr
cd maparr && python -m pytest tests/ -v
cd maparr/maparr_charm && go test ./...
```

## iteratarr Architecture

**Backend** (`iteratarr/backend/`): Express + `better-sqlite3` via `store/index.js` (WAL mode). Entry: `server.js`. Config: `config.js` + `config.json` (port 3847, paths to `kebbin-shop/`, `wan2gp_json_dir`, `wan2gp_lora_dir`).

**Routes** (`routes/`) — all factory `createXxxRoutes(store, config?, telemetry?)` → Express `Router`:
- `clips.js`, `iterations.js`, `characters.js`, `branches.js`, `projects.js`
- `render.js`, `queue.js`, `gpu.js`, `vision.js`, `analytics.js`
- `frames.js`, `browser.js`, `export.js`, `contactsheet.js`, `seedscreen.js`, `templates.js`, `telemetry.js`, `storage.js`
- `autopilot.js` (vision validation trial engine)

**Supporting modules**: `paths.js` (`getClipPaths`), `watcher.js` (chokidar, detects new JSON in `wan2gp_json_dir`), `wan2gp-bridge.js` + `wan2gp-api.js` (Wan2GP at `C:/pinokio/api/wan2gp.git/app/wgp.py`), `vision-scorer.js` (Anthropic `claude-sonnet-4-6`, reads `ANTHROPIC_API_KEY`), `gpu-monitor.js` (nvidia-smi polling), `seed-templates.js`, `prompt-diff.js` (phrase-level prompt diffing), `iteration-history.js` (chain-aware iteration history for Vision scoring).

**Telemetry** (`telemetry/`): `index.js` (createTelemetry), `anonymizer.js`, `environment.js`. Events: `EVALUATION_SAVED`, `ITERATION_GENERATED`, `ITERATION_LOCKED`, `CHARACTER_CREATED`, `ROPE_ATTRIBUTED`, `RENDER_COMPLETED`.

**Tests** (`backend/tests/`): `helpers.js` (`createTestApp`), `health.test.js`, `store.test.js`, `validators.test.js`, `watcher.test.js`, `routes/frames.test.js`, `prompt-diff.test.js`.

**Frontend** (`iteratarr/frontend/`): React 18 + Vite + TanStack Query. Entry: `src/App.jsx` → `QueryClientProvider` with `React.lazy()` + `Suspense` code splitting for secondary views. API: `src/api.js` (all endpoints). Theme: `src/index.css` (`@theme` tokens: `--color-accent`, `--color-surface`, `--color-score-*`, `--color-status-*`).

**Constants** (`src/constants.js`): `ROPES`, `MODEL_TYPES`, `MODEL_ROPE_CONFIG`, `IDENTITY_FIELDS`, `LOCATION_FIELDS`, `MOTION_FIELDS`, `CLIP_STATUSES`, `BRANCH_STATUSES`, `SCORE_LOCK_THRESHOLD=65`, `GRAND_MAX=75`, `SETTINGS_TIERS`, `ROPE_CATEGORY_MAP`, `ROPE_GUIDANCE`.

**Hooks** (`src/hooks/`): `useQueries.js` (all TanStack hooks with dynamic `refetchInterval`), `useAutoRender.js`, `useApi.js`, `useBranchNav.js`, `useClipMeta.js` (useReducer-based clip metadata), `useIterationState.js`, `useViewFilter.js`, `useTimeout.js`, `useEvalScoring.js`, `useEvalRender.js`, `useEvalGenerate.js`, `useEvalVideo.js`.

**Components** (`src/components/`): `kanban/EpisodeTracker`, `clips/ClipDetail`, `clips/IterationLineage`, `characters/CharacterRegistry`, `queue/QueueManager`, `gpu/GpuStatus`, `render/RenderStatus`, `evaluation/EvaluationPanel`, `evaluation/RenderStatusPanel`, `common/PromptDiffInline`, `screening/SeedHQ`, `trends/ScoreTrendChart`, `analytics/CrossClipDashboard`, `storage/StoragePage`.

**Data model**: Projects → Scenes → Clips → Branches → Iterations → Evaluations. Evaluations score identity (8: `face_match`, `head_shape`, `jaw`, `cheekbones`, `eyes_brow`, `skin_texture`, `hair`, `frame_consistency`), location (4), motion (3). "Ropes" map params to scoring dimensions.

**Validators** (`store/validators.js`): `validateProject`, `validateClip`, `validateIteration`, `validateEvaluation`, `validateCharacter`, `validateBranch`.

## composearr Architecture

**Engine** (`src/composearr/engine.py`): 2-pass — discovery → parse → per-file rules → cross-file rules. Rules auto-register via `BaseRule.__init_subclass__` in `rules/base.py`. Rule files: `CA0xx_images.py`, `CA1xx_security.py`, `CA2xx_reliability.py`, `CA3xx_network_topology.py`, `CA4xx_consistency.py`, `CA5xx_resources.py`, `CA6xx_arrstack.py`, `CA7xx_volumes.py`, `CA8xx_security_hardening.py`, `CA9xx_advanced.py`.

**CLI** (`cli.py`): Typer commands — `audit`, `fix`, `ports`, `topology`, `freshness`, `runtime`, `history`, `watch`, `init`, `rules`, `explain`, `config`, `batch`.

**Config** (`config.py`): `_RULE_NAME_TO_ID` maps friendly names → IDs. `DEFAULT_RULES` dict. `Config.merge()` applies YAML overrides. `models.py`: `Severity`, `LintIssue`, `ComposeFile` (services is `@property` not constructor arg), `ScanResult`. Scoring (`scoring.py`): `_CATEGORY_MAP` (CA0=security, CA2=reliability, CA3=network, CA4=consistency, CA5=reliability), tier system.

**Project config** (`composearr/.composearr/`): stores per-project `.composearr.yml` overrides and audit history in `composearr/.composearr/history/` (JSON records of past scan results keyed by timestamp).

**CI/CD** (`composearr/.github/`): GitHub integration with custom reusable actions in `composearr/.github/actions/`, issue triage templates in `composearr/.github/ISSUE_TEMPLATE/`, and automated lint/test pipelines in `composearr/.github/workflows/`.

**Test cache** (`composearr/.pytest_cache/`): pytest result cache with version metadata in `composearr/.pytest_cache/v/` — safe to delete, rebuilt on next test run.

**Tests** (`tests/`): `test_rules.py`, `test_scanner.py`, `test_cli.py`, `test_config.py`, `test_entropy.py`, `test_healthcheck_helper.py`, `test_known_services.py`, `conftest.py` (`make_compose` fixture).

## subbrainarr Architecture

FastAPI app in `backend/main.py` (internal 9001, external 9918/5918). WebSocket at `/ws`. Routers in `backend/routers/`: `connection.py`, `hardware.py`, `logs.py`, `settings.py`, `scanning.py`, `docker.py`, `github.py`, `community.py`, `tuning.py`, `languages.py`. SSRF prevention via `url_validation.py` (`validate_subgen_url`). Settings persisted to `/app/config/settings.json`.

## maparr Architecture

**Python backend** (`maparr/backend/`): FastAPI with 4-pass analysis engine (`analyzer.py`), compose discovery (`discovery.py`), image registry (`image_registry.py`, 218 images). Pipeline dashboard in `pipeline.py`.

**Go TUI** (`maparr/maparr_charm/`): Module `github.com/coaxk/maparr-tui`. Charm Bubbletea v2 + Lipgloss v2. Entry: `cmd/maparr/main.go`. Screens in `internal/screens/`, compose parsing in `internal/compose/`, API client in `internal/api/`.

## lora-trainer

Training configs: `train_{name}_cloud.yaml` for 6 characters — `belinda`, `matty`, `judd`, `toby`, `jack`, `mick`. Training data: `training-data/{name}/` with `{name}_dataset.toml` + `.txt` caption files + images. Output: `output/{token}-v1/` with `_high_noise.safetensors` + `_low_noise.safetensors`. References: `characters/{name}/reference-images/`. Eval: `eval/{name}/`.

**Deployed LoRAs**: `blndnarr-v1` (belinda), `jddnrtr-v1` (judd), `mckdhn-v1` (mick), `tbyprc-v1` (toby), `jckdhn-v1` (jack), `mttymgr-v1` (matty).

**musubi-tuner** (`musubi-tuner/`): Wan configs in `src/musubi_tuner/wan/configs/` — `wan_t2v_14B.py`, `wan_t2v_A14B.py`, `wan_i2v_14B.py`, `wan_i2v_A14B.py`. Key params: `sample_shift`, `boundary` (0.875/0.900 for Wan2.2), `sample_guide_scale`.

## Conventions

- **iteratarr routes**: Factory `createXxxRoutes(store, config?, telemetry?)` → Express `Router`. Errors: `{ error: "message" }`. Codes: 201 created, 404 not found, 400 validation, 409 conflict.
- **iteratarr store**: `store.create(col, data)`, `store.get(col, id)` (throws if missing), `store.update(col, id, patch)`, `store.list(col, predicate)`, `store.delete(col, id)`
- **iteratarr TanStack**: Dynamic `refetchInterval` — active state gets short interval (10–15s), idle gets long (30–60s) or `false`. Use `staleTime` to prevent redundant fetches. `useInvalidateQueue()` / `useInvalidateIterations()` for cross-query invalidation.
- **composearr rules**: Subclass `BaseRule`, set `id`/`name`/`severity`/`scope`, implement `check_service()` or `check_project()`. Always `encoding="utf-8"`. Update 4 files: rule file, `__init__.py`, `explain.py`, `test_rules.py`.
- **subbrainarr/maparr routers**: `APIRouter()` with Pydantic models, prefix in `app.include_router()`. All routes `async def`.
- **LoRA naming**: `{abbreviated_name}-v{N}` (consonants only, 5–8 chars). Dual-DiT: separate `_high_noise` + `_low_noise` safetensors.

## Ecosystem

4-tool ecosystem: **MapArr** (path intelligence), **ComposeArr** (compose linting), **SubBrainArr** (subtitle tuning), **Iteratarr** (video iteration). Shared code extraction planned for Phase 15+ (`shared/`). Cross-project communication via `CLAUDE.md` files.

## MCP Servers

- **context7**: Use for React, FastAPI, Express, TanStack Query, Charm/Bubbletea, Go stdlib lookups — even for well-known APIs
- **github**: PR/issue management — repos `coaxk/iteratarr`, `coaxk/composearr`, `coaxk/subbrainarr`, `coaxk/maparr`

<!-- caliber:managed:pre-commit -->
## Before Committing

Run `npx --yes @rely-ai/caliber refresh` before creating git commits to keep docs in sync with code changes.
After it completes, stage any modified doc files before committing:

```bash
npx --yes @rely-ai/caliber refresh && git add CLAUDE.md .claude/ .cursor/ AGENTS.md CALIBER_LEARNINGS.md 2>/dev/null
```
<!-- /caliber:managed:pre-commit -->

<!-- caliber:managed:learnings -->
## Session Learnings

Read `CALIBER_LEARNINGS.md` for patterns and anti-patterns learned from previous sessions.
These are auto-extracted from real tool usage — treat them as project-specific rules.
<!-- /caliber:managed:learnings -->

<!-- caliber:managed:sync -->
## Context Sync

This project uses [Caliber](https://github.com/caliber-ai-org/ai-setup) to keep AI agent configs in sync across Claude Code, Cursor, Copilot, and Codex.
Configs update automatically before each commit via `caliber refresh`.
If the pre-commit hook is not set up, run `/setup-caliber` to configure everything automatically.
<!-- /caliber:managed:sync -->