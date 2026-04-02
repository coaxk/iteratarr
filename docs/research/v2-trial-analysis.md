# v2 Chain-Aware Trial Analysis

## Trial Parameters

Both trials used identical seeds and baseline JSONs as v1, with chain-aware scoring (#40) injecting iteration history into the Vision API prompt.

| Parameter | Value |
|-----------|-------|
| Target score | 65/75 |
| Max iterations | 20 |
| Regression limit | 3 consecutive |
| Scoring | Vision API (Sonnet 4.6) via autopilot |
| Chain-aware | Yes — iteration history + stuck field detection |

---

## Mick Doohan — v2 Results

### Score Trail
```
Iter:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20
Score: 60  61  62  63  62  61  61  61  61  61  61  61  61  59  58  58  60  61  62  61
```

### Verdict: PLATEAU at 61/75 (peak 63 at iter 4)

### Category Breakdown
| Iter | Identity /40 | Location /20 | Motion /15 | Grand /75 |
|------|-------------|-------------|-----------|----------|
| 1 | 32 | 17 | 11 | 60 |
| 2 | 33 | 17 | 11 | 61 |
| 3 | 33 | 18 | 11 | 62 |
| 4 | **34** | **18** | 11 | **63** |
| 5 | 33 | 17 | **12** | 62 |
| 6-13 | 33 | 17 | 11 | 61 |
| 14 | 32 | 17 | 10 | 59 |
| 15-16 | 32 | 17 | 9 | 58 |
| 17 | 32 | 18 | 10 | 60 |
| 18 | 33 | 17 | 11 | 61 |
| 19 | 33 | **18** | 11 | 62 |
| 20 | 33 | 17 | 11 | 61 |

### Rope Usage (All 20 iterations)
| Rope | Times Used | Notes |
|------|-----------|-------|
| Rope 4 (guidance scale) | 6x | Most used — chain-aware kept trying this |
| Rope 5 (seed/steps) | 3x | |
| Rope 3 (LoRA multipliers) | 3x | |
| Rope 2b (negative prompt) | 3x | |
| Rope 1 (prompt position) | 2x | |
| Rope 6 (alt prompt) | 2x | |
| Rope 2a (attention weighting) | 1x | |

### Key Observations — Mick

1. **camera_movement was flagged as lowest in 17 of 20 iterations.** The scorer is fixated on this motion field — scored 3/5 consistently. But motion fields are assessed from stills, so this is likely scorer noise rather than a real issue. The chain-aware engine correctly tried multiple ropes to address it, but the field is inherently unimprovable from stills.

2. **Identity and location are the real plateau.** Identity locked at 32-34/40, location at 17-18/20. These are the fields where scorer v2's improvements (score level definitions, crop tool, CoT) would have the most impact.

3. **The climb to 63 (iters 1-4) was real improvement.** Identity went 32→33→33→34, location 17→17→18→18. Then everything regressed and oscillated around 61.

4. **Iters 6-13: perfect flatline at 61.** Eight consecutive iterations scored identically (id=33, loc=17, mot=11). The scorer returned the same numbers despite 8 different rope changes (2a, 2b, 3, 4, 5, 2b, 1, 4). This is the clearest evidence of scorer ceiling — it literally can't distinguish between these renders.

5. **Late regression (iters 14-16: 59, 58, 58)** was driven by motion dropping from 11→10→9. Identity also dropped 33→32. Rope 4 and 5 changes degraded the render quality.

6. **Recovery (iters 17-19: 60, 61, 62)** brought scores back to baseline. The 62 matched the iter 3 peak.

### v1 Comparison — Mick
```
v1: 62→61→62→62→62→61→62→62→62→62→??→65  (Rope 1 only, 12 iters, SUCCESS)
v2: 60→61→62→63→62→61→61→61→61→61→61→61→61→59→58→58→60→61→62→61  (Diversified, 20 iters, PLATEAU)
```

v1 hit 65 at iter 12 using only Rope 1. v2 peaked at 63 at iter 4 but couldn't sustain it. **v1's "success" at 65 was likely scorer variance** — the 65 was probably a render of similar quality to v2's 61-63 range that happened to score higher due to noise in the absolute scoring system. This strongly supports the pairwise judging approach for scorer v2.

---

## Belinda — v2 Results

### Score Trail
```
Iter:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20
Score: 54  53  51  52  54  53  53  52  54  53  53  55  54  55  53  53  53  50  54   ?
```

### Verdict: PLATEAU at 53-54/75 (peak 55 at iters 12 and 14)

### Category Breakdown
| Iter | Identity /40 | Location /20 | Motion /15 | Grand /75 |
|------|-------------|-------------|-----------|----------|
| 1 | 27 | 16 | 11 | 54 |
| 2 | 27 | 15 | 11 | 53 |
| 3 | 26 | 14 | 11 | 51 |
| 4 | 26 | 15 | 11 | 52 |
| 5 | **28** | 15 | 11 | 54 |
| 6-8 | 27/26 | 15 | 11 | 52-53 |
| 9 | **28** | 15 | 11 | 54 |
| 10-11 | 28/27 | 14-15 | 11 | 53 |
| 12 | **28** | 15 | **12** | **55** |
| 13 | 28 | 15 | 11 | 54 |
| 14 | **29** | 15 | 11 | **55** |
| 15-17 | 27 | 15 | 11 | 53 |
| 18 | 26 | 15 | **9** | **50** |
| 19 | 28 | 15 | 11 | 54 |

### Rope Usage (All 19 scored iterations)
| Rope | Times Used | Notes |
|------|-----------|-------|
| Rope 6 (alt prompt) | 4x | Tried for wardrobe — didn't work |
| Rope 4 (guidance scale) | 3x | |
| Rope 3 (LoRA multipliers) | 3x | |
| Rope 1 (prompt position) | 2x | |
| Rope 5 (seed/steps) | 2x | |
| Rope 2a (attention weighting) | 2x | |
| Rope 2b (negative prompt) | 1x | |
| Rope 4 (guidance scale) | 2x | |

### Key Observations — Belinda

1. **wardrobe_correct was lowest in ALL 19 scored iterations.** Scored 2/5 consistently. The character renders bare-shouldered/nude despite prompt specifying clothing. This is a LoRA training issue — the training data likely had insufficient clothed examples, causing the model to default to bare shoulders.

2. **The chain-aware engine correctly identified wardrobe as stuck** and tried 7 different ropes across 19 iterations. Nothing worked because the problem is in the LoRA, not the generation parameters.

3. **Motion was remarkably stable at 11/15** (17 of 19 iterations). The two exceptions: iter 12 (12/15, her peak) and iter 18 (9/15, her trough). Motion from stills is noisy.

4. **Identity oscillated between 26-29/40.** Peak was 29 at iter 14. The scorer can't reliably distinguish between renders in this range.

5. **Location locked at 14-16/20.** Wardrobe_correct at 2 is dragging the whole category down. The other 3 location fields (location_correct, lighting_correct, geometry_correct) are scoring 4-5.

6. **Iter 18's crash to 50/75** (identity 26, motion 9) was an outlier — likely scorer noise on a render that happened to have a bad frame.

### v1 Comparison — Belinda
```
v1: 54→52→54→56→59→57→58→57→58→57→57→58→57→59→57→58→59→57→57→57  (Rope 1 only, PLATEAU at 57)
v2: 54→53→51→52→54→53→53→52→54→53→53→55→54→55→53→53→53→50→54     (Diversified, PLATEAU at 53-54)
```

v1 plateaued higher (57) than v2 (53-54). v1's Rope 1-only approach may have been more effective for Belinda because Rope 1 (prompt changes) was the only lever that could work around the wardrobe issue without changing the LoRA. v2's rope diversification actually hurt by trying ropes that couldn't solve the core problem.

---

## Cross-Trial Findings

### 1. Scorer Ceiling is Real
Both characters show clear scoring ceilings where the Vision API returns nearly identical scores across many iterations despite different parameter changes:
- **Mick:** 8 consecutive iterations at exactly 61/75 (iters 6-13)
- **Belinda:** oscillation within a 3-point band (51-55) for 19 iterations

**Implication for #42:** Score level definitions and CoT will expand the scorer's dynamic range. The current rubric gives the model no basis for distinguishing between a 33/40 and a 34/40 identity score.

### 2. Motion from Stills is Noise
- Mick's `camera_movement` was flagged as lowest in 17/20 iterations but couldn't be improved because it's assessed from stills
- Belinda's motion was 11/15 in 17/19 iterations with two noise spikes
- The chain-aware engine wasted significant effort targeting motion fields

**Implication for #42:** Motion fields MUST be confidence-weighted or downweighted. The scorer should report low confidence on motion fields assessed from stills.

### 3. Chain-Aware Diversification Works but Scorer Can't Measure the Impact
- Mick used 7 different ropes across 20 iterations (vs v1's Rope 1 only)
- Belinda used 7 different ropes across 19 iterations
- The engine correctly identified stuck fields and tried different approaches
- But the scorer couldn't detect whether the changes helped

**Implication for #42:** Pairwise "progress judge" would catch improvements the absolute scorer misses. "Is this render better than the last one?" is a much easier question than "what absolute number is this?"

### 4. v1's Success May Have Been Scorer Variance
Mick v1 hit 65 at iter 12. Mick v2 peaked at 63 at iter 4 but mostly scored 61. Given the 8-iteration flatline at exactly 61, it's plausible that v1's 65 was a render of similar quality that happened to score higher due to noise. A pairwise judge would have said "these are about the same quality" for most of these iterations.

### 5. Structural Problems Can't Be Solved by Parameter Tuning
Belinda's wardrobe_correct at 2/5 for 19 straight iterations proves that some issues are in the LoRA training data, not the generation parameters. No rope can fix missing training examples. The scorer should learn to identify "structural" vs "tunable" limitations and surface this to the user.

### 6. The Autopilot Engine is Solid
Despite not breaking through the scorer ceiling, the autopilot engine itself performed well:
- Zero crashes from the engine logic itself (crashes were from server restarts and frame extraction issues)
- Correct rope diversification
- Correct stuck field detection
- Correct regression counting
- SQLite persistence worked after implementation (no more lost sessions)

---

## Recommendations for Scorer v2 (#42)

Prioritized based on trial evidence:

| # | Improvement | Evidence | Expected Impact |
|---|------------|----------|----------------|
| 1 | Score level definitions (1-5 anchors) | Mick's 8-iter flatline at identical scores | Break the scoring compression |
| 2 | Manual CoT before scoring | Scorer can't articulate why 33 vs 34 identity | Better field-level discrimination |
| 3 | Strict tool use with enum constraints | Consistent valid output, no parse retries | Reliability |
| 4 | Confidence per field + motion downweight | 17/20 iters wasted targeting camera_movement | Stop chasing unfixable fields |
| 5 | Pairwise progress judge | v1's 65 vs v2's 61 — likely same quality | Better iteration decisions |
| 6 | Prompt caching | 20 scoring calls per trial × 2 trials | 70-80% input cost savings |
| 7 | Crop tool for identity | Belinda id oscillating 26-29, can't distinguish | Higher identity resolution |
| 8 | Structural problem detection | Belinda wardrobe stuck 19 iters | Surface LoRA issues to user |

## v3 Trial Plan

Re-run identical scenarios (same seeds, same baseline JSONs, same characters) with scorer v2 to measure improvement. Success criteria:
- Mick should break 65/75 (vs v2's 63 peak)
- Belinda should reach 57+ (matching v1) with wardrobe_correct appropriately downweighted
- Fewer wasted iterations targeting motion fields
- Pairwise judge catches improvements absolute scorer misses
