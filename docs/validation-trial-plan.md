# Vision Scoring Validation Trial

## Purpose

Prove (or disprove) that the Vision API scoring methodology delivers objectively better renders through iterative improvement, and that the 65/75 lock threshold is a meaningful quality bar — not a circular metric.

## Test Characters

| Character | LoRA | Token | Notes |
|-----------|------|-------|-------|
| Mick | 1000-step | `mcknrr` | Solid LoRA, good baseline for testing |
| Belinda | v1 | `blndnarr` | Known working LoRA, multiple seeds already iterated |

## Phase 1: Consistency Check

**Question**: Does Vision API give the same render the same score?

**Protocol**:
1. Pick one character (Mick) with a baseline prompt
2. Render a single video (one seed, one prompt, one set of settings)
3. Extract frames / generate contact sheet
4. Score the SAME frames 5 times via Vision API (not 3 — more data points for stdev)
5. Record all 5 score breakdowns (15 fields each)

**Success criteria**:
- Grand total standard deviation < 3 points
- No individual field varies by more than 2 points across runs
- If stdev > 5: scoring is too noisy for 1-point iteration decisions — rubric needs tightening before proceeding

**Implementation**:
- New API endpoint: `POST /api/vision/consistency-test`
- Takes `iteration_id`, runs N scores sequentially
- Returns array of all score objects + computed stats (mean, stdev per field, grand stdev)
- UI: button on iteration page "Run Consistency Test" → shows results in a table

**Estimated cost**: 5 scores × ~$0.02 = $0.10

---

## Phase 2: Convergence Trial (The Main Event)

**Question**: Does the score → recommend → apply → render loop converge toward 65/75?

**Protocol**:
1. For each character (Mick, Belinda):
   a. Create a fresh clip with a deliberately average baseline prompt
   b. Use a single seed (pick one with decent but not great baseline)
   c. Render the baseline
   d. Enter the **Autopilot Loop**:
      - Vision scores the render
      - Vision recommends a single change (rope + literal value)
      - Change is applied to the JSON automatically
      - Render is queued
      - Wait for render to complete
      - Repeat from scoring step
   e. Loop terminates when:
      - Score reaches 65/75 (success), OR
      - 20 iterations completed without reaching 65 (plateau/failure), OR
      - Score regresses 3 consecutive iterations (divergence)

2. Record at each iteration:
   - All 15 field scores + grand total
   - Which rope was pulled
   - What specific change was made
   - Which field the change targeted
   - Whether the targeted field improved, regressed, or stayed flat
   - Whether any non-targeted fields regressed by 3+

**What we measure**:
- **Convergence curve**: Plot grand total vs iteration number
- **Iterations to 65**: How many iterations from baseline to lock threshold
- **Category balance**: Do identity, location, motion all improve, or does one cannibalise another?
- **Attribution hit rate**: % of iterations where the targeted field actually improved
- **Regression rate**: % of iterations where a non-targeted category regressed by 3+
- **Plateau detection**: Does the score stall in a range for 3+ iterations?
- **Rope distribution**: Which ropes get pulled most? Is it balanced or dominated by one?

**Implementation — Autopilot Mode**:
- New feature: "Autopilot" button on a branch
- Starts the loop: score → apply recommendation → generate next iteration JSON → queue render
- Runs unattended until termination condition
- Each iteration is recorded normally (evaluation saved, next iteration created)
- Autopilot state tracked on the branch: `{ mode: 'autopilot', started_at, target_score, max_iterations, current_iteration }`
- Progress visible in UI: "Autopilot: iteration 7/20, current score 54/75"

**Estimated cost**: ~20 iterations × 2 characters × $0.02 = $0.80 API + ~40 renders × 15min = ~10 hours GPU

---

## Phase 3: Human Correlation

**Question**: Does a 65/75 Vision score actually mean "production quality" to a human?

**Protocol**:
1. From each convergence trial, collect renders at key score points:
   - Baseline (iteration 1, score ~40-45)
   - Midpoint (score ~52-55)
   - Near-lock (score ~62-65)
   - Best achieved (highest score)

2. Present to 2-3 humans (Judd, Tenzing, one other if available) as a **blind ranking task**:
   - Show 8-12 renders in random order (no scores visible)
   - Ask: "Rank these from worst to best"
   - Ask: "Draw a line — above this line is production-ready, below is not"

3. Compare:
   - Human ranking vs Vision score ranking → Spearman correlation
   - Human "production-ready" threshold vs Vision 65/75 threshold → do they agree?

**Success criteria**:
- Spearman rank correlation > 0.80 (strong agreement on ordering)
- Human production threshold falls within ±5 points of Vision's 65/75
- If humans consistently say "done" at 58 but Vision says 65: our threshold is too high
- If humans say "not done" at 65: our threshold is too low or the rubric is scoring the wrong things

**Implementation**:
- Export contact sheets for selected iterations
- Simple blind-test page: shows contact sheets in random order, drag to rank
- Could be a standalone HTML page or a new Iteratarr view
- Records human rankings for comparison with Vision scores

**Estimated cost**: Free (human time only)

---

## Phase 4: Analysis & Report

After all phases complete, compile:

### The Scorecard

| Metric | Target | Result | Verdict |
|--------|--------|--------|---------|
| Scoring consistency (stdev) | < 3 | ? | ? |
| Convergence rate (Mick) | Reach 65 in ≤20 iters | ? | ? |
| Convergence rate (Belinda) | Reach 65 in ≤20 iters | ? | ? |
| Attribution hit rate | > 60% | ? | ? |
| Regression rate | < 30% | ? | ? |
| Human rank correlation | > 0.80 | ? | ? |
| Human threshold alignment | ±5 of 65 | ? | ? |

### The Verdict

One of:
- **Validated**: Methodology works. Scores converge, humans agree, attributions land. Ship it.
- **Partially validated**: Convergence works but [specific issue]. Fix [specific thing] and re-test.
- **Not validated**: [Specific failure]. Fundamental rubric/approach change needed before trusting automated scoring.

---

## Execution Order

### Sprint 1: Build the harness
1. Consistency test endpoint + UI
2. Autopilot mode (score → recommend → apply → queue → wait → repeat)
3. Autopilot progress UI on branch card

### Sprint 2: Run the trials
4. Run consistency check on Mick baseline (30 min: 1 render + 5 scores)
5. Review consistency results → proceed or fix rubric
6. Start Mick autopilot convergence trial (unattended, ~5 hours)
7. Start Belinda autopilot convergence trial (unattended, ~5 hours)

### Sprint 3: Human correlation
8. Export key renders from both trials
9. Build blind-test page
10. Run human ranking sessions
11. Compile correlation analysis

### Sprint 4: Report
12. Generate convergence plots (score vs iteration)
13. Calculate all metrics
14. Write the verdict
15. Decide: adjust threshold, adjust rubric, or ship as-is

---

## Key Design Decisions

**Why 5 consistency runs not 3?**
With 3 data points, one outlier destroys the stdev calculation. 5 gives a reliable spread.

**Why 20 iteration cap?**
At ~15 min per render, 20 iterations = 5 hours. Beyond that, diminishing returns suggest a methodology problem, not a patience problem.

**Why single-change per iteration (not multi-change)?**
Attribution accuracy requires isolating variables. Multi-change makes it impossible to know what helped.

**Why start from "deliberately average" not "terrible"?**
A terrible baseline (wrong character, garbled prompt) would improve quickly but prove nothing about fine-tuning. Starting from "recognisable but rough" tests the hard part: incremental refinement.

**Why is the 65 threshold question important?**
If Vision scores itself to 65 and declares success, that's circular. The human correlation phase breaks the circle: either humans independently validate 65 as the quality bar, or they don't — and we adjust.
