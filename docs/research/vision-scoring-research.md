# Vision-Based Scoring Research — State of the Art

## Executive Summary

1. Pairwise judging is consistently more stable than absolute scoring for perceptual tasks, especially when models show “middle-score collapse” (your 61/75 and 53–55/75 plateaus). Use pairwise deltas for iteration-to-iteration decisions, and keep absolute /75 for reporting.
2. Rubric specificity is the biggest near-term unlock: field-level 1–5 anchors (what counts as 1/3/5) plus short pre-score reasoning increases judge consistency and dynamic range.
3. Motion from still frames is a known structural limitation. Research benchmarks treat temporal quality as a separate signal; your motion dimensions should be confidence-weighted or downweighted unless true video features are available.
4. Cost optimization is mature: prompt caching + structured output + two-tier scoring (fast triage, expensive confirmation) are standard and immediately applicable.
5. Production pipelines converge on the same pattern: strict schemas, retries with validation, confidence-aware scoring, and consensus/second-pass only when uncertainty is high.

## #42 Improvement Map (Reference)

- `I1`: Individual frames over contact sheets
- `I2`: Chain-of-thought before scoring
- `I3`: Score level definitions
- `I4`: Few-shot calibration anchors
- `I5`: Confidence per field
- `I6`: Crop tool / zoom-in pattern
- `I7`: Leniency calibration
- `I8`: Prompt caching
- `I9`: Motion weighting from still-frame limits
- `I10`: 720p final scoring pass

## 1. VLM-as-Judge Patterns

### What works

- **Insight:** Strong model-as-judge setups can approximate human preference well when prompts are explicit and evaluation is controlled.
  - **Source:** MT-Bench / Chatbot Arena (`https://arxiv.org/abs/2306.05685`)
  - **Relevance:** High
  - **Informs:** `I2`, `I3`, `I7`

- **Insight:** Structured rubric + explicit reasoning steps before scoring improves alignment with human judgments.
  - **Source:** G-Eval (`https://arxiv.org/abs/2303.16634`)
  - **Relevance:** High
  - **Informs:** `I2`, `I3`, `I7`

- **Insight:** Judge finetuning/scaffolding can increase consistency and lower inference cost versus always using top-tier judge models.
  - **Source:** JudgeLM (`https://arxiv.org/abs/2310.17631`)
  - **Relevance:** Medium
  - **Informs:** `I7`, `I8`

- **Insight:** Pairwise preference judgments tend to be more robust than single absolute scores in subjective tasks.
  - **Source:** PandaLM (`https://arxiv.org/abs/2306.05087`, repo `https://github.com/WeOpenML/PandaLM`)
  - **Relevance:** High
  - **Informs:** `I7` (calibration strategy)

### What doesn't

- **Insight:** LLM judges show position, verbosity, and self-enhancement biases if prompt design is weak.
  - **Source:** MT-Bench (`https://arxiv.org/abs/2306.05685`)
  - **Relevance:** High
  - **Informs:** `I3`, `I7`

- **Insight:** “One-shot absolute rubric score only” often compresses to middle values (3/5-like behavior) without calibration anchors.
  - **Source:** G-Eval + LLM-as-judge literature (`https://arxiv.org/abs/2303.16634`, `https://arxiv.org/abs/2306.05685`)
  - **Relevance:** High
  - **Informs:** `I3`, `I4`, `I7`

### Key papers/sources

- `https://arxiv.org/abs/2306.05685`
- `https://arxiv.org/abs/2303.16634`
- `https://arxiv.org/abs/2310.17631`
- `https://arxiv.org/abs/2306.05087`
- `https://github.com/WeOpenML/PandaLM`

## 2. AI Image/Video Quality Assessment

### What works

- **Insight:** Human-preference-trained reward models are currently the strongest automated signal for text-image perceptual quality.
  - **Source:** ImageReward paper + repo (`https://arxiv.org/abs/2304.05977`, `https://github.com/THUDM/ImageReward`)
  - **Relevance:** High
  - **Informs:** `I7` (external calibration baseline)

- **Insight:** Preference datasets/scorers (PickScore, HPSv2) provide practical calibration references for “human-like” scoring behavior.
  - **Source:** PickScore repo (`https://github.com/yuvalkirstain/PickScore`), HPSv2 paper+repo (`https://arxiv.org/abs/2306.09341`, `https://github.com/tgxs002/HPSv2`)
  - **Relevance:** High
  - **Informs:** `I4`, `I7`

- **Insight:** Video quality should be decomposed into independent dimensions with dedicated measurement methods rather than a single scalar.
  - **Source:** VBench (`https://arxiv.org/abs/2311.17982`, `https://github.com/Vchitect/VBench`, `https://vchitect.github.io/VBench-project/`)
  - **Relevance:** High
  - **Informs:** `I5`, `I9`

- **Insight:** Temporal metrics (FVD lineage) are treated as separate from per-frame image metrics, reinforcing your motion-vs-still separation need.
  - **Source:** FVD (`https://arxiv.org/abs/1812.01717`)
  - **Relevance:** High
  - **Informs:** `I9`

### What doesn't

- **Insight:** Single metric optimization can overfit to scorer quirks (reward hacking) and diverge from perceived quality.
  - **Source:** ImageReward + reward-model literature (`https://arxiv.org/abs/2304.05977`)
  - **Relevance:** Medium
  - **Informs:** `I7`

- **Insight:** Treating temporal quality as “inferable from sparse stills” leads to unstable or noisy motion judgments.
  - **Source:** VBench/FVD framing (`https://arxiv.org/abs/2311.17982`, `https://arxiv.org/abs/1812.01717`)
  - **Relevance:** High
  - **Informs:** `I9`

### Key papers/sources

- `https://arxiv.org/abs/2304.05977`
- `https://github.com/THUDM/ImageReward`
- `https://github.com/yuvalkirstain/PickScore`
- `https://arxiv.org/abs/2306.09341`
- `https://github.com/tgxs002/HPSv2`
- `https://arxiv.org/abs/2311.17982`
- `https://github.com/Vchitect/VBench`
- `https://arxiv.org/abs/1812.01717`

## 3. Chain-of-Thought for Evaluation

### What works

- **Insight:** Chain-of-thought prompting improves complex reasoning quality, including structured evaluations.
  - **Source:** Chain-of-Thought Prompting (`https://arxiv.org/abs/2201.11903`)
  - **Relevance:** High
  - **Informs:** `I2`

- **Insight:** Self-consistency / multiple reasoning paths improves robustness over a single deterministic rationale.
  - **Source:** Self-Consistency (`https://arxiv.org/abs/2203.11171`)
  - **Relevance:** Medium
  - **Informs:** `I2`, `I7`

- **Insight:** G-Eval shows practical gains from “reason then score” form-filling style evaluation.
  - **Source:** G-Eval (`https://arxiv.org/abs/2303.16634`)
  - **Relevance:** High
  - **Informs:** `I2`, `I3`

### What doesn't

- **Insight:** Long unconstrained reasoning can increase latency/cost and still fail if rubric boundaries are underspecified.
  - **Source:** G-Eval + judge-bias findings (`https://arxiv.org/abs/2303.16634`, `https://arxiv.org/abs/2306.05685`)
  - **Relevance:** High
  - **Informs:** `I2`, `I3`

- **Insight:** CoT alone does not solve calibration drift; you still need anchor examples and score definitions.
  - **Source:** Combined reading of CoT + evaluator papers
  - **Relevance:** High
  - **Informs:** `I3`, `I4`, `I7`

### Key papers/sources

- `https://arxiv.org/abs/2201.11903`
- `https://arxiv.org/abs/2203.11171`
- `https://arxiv.org/abs/2303.16634`
- `https://arxiv.org/abs/2306.05685`

## 4. Few-Shot Calibration

### What works

- **Insight:** In-context examples improve calibration when examples are close to target task distribution.
  - **Source:** In-context/few-shot calibration literature (`https://arxiv.org/abs/2102.09690`)
  - **Relevance:** Medium
  - **Informs:** `I4`

- **Insight:** Preference-scored image datasets (ImageReward/HPSv2/PickScore ecosystems) are useful anchor banks for defining what “good” looks like.
  - **Source:** `https://arxiv.org/abs/2304.05977`, `https://arxiv.org/abs/2306.09341`, `https://github.com/yuvalkirstain/PickScore`
  - **Relevance:** High
  - **Informs:** `I4`, `I7`

- **Insight:** Dynamic anchor selection by task similarity is better than static universal anchors when style/content vary.
  - **Source:** Broad in-context learning findings + benchmark practice
  - **Relevance:** Medium
  - **Informs:** `I4`

### What doesn't

- **Insight:** Poorly chosen anchors can cause anchoring bias (score collapse toward anchor style).
  - **Source:** LLM judge bias observations (`https://arxiv.org/abs/2306.05685`)
  - **Relevance:** High
  - **Informs:** `I4`, `I7`

- **Insight:** Too many examples can increase noise/cost and reduce prompt clarity.
  - **Source:** Practical eval pipeline reports (cookbooks + judge literature)
  - **Relevance:** Medium
  - **Informs:** `I4`, `I8`

### Key papers/sources

- `https://arxiv.org/abs/2102.09690`
- `https://arxiv.org/abs/2304.05977`
- `https://arxiv.org/abs/2306.09341`
- `https://github.com/yuvalkirstain/PickScore`
- `https://arxiv.org/abs/2306.05685`

## 5. Face/Character Identity

### What works

- **Insight:** Subject-driven generation work consistently treats identity as a dedicated objective, not a side effect of global quality scoring.
  - **Source:** DreamBooth (`https://arxiv.org/abs/2208.12242`)
  - **Relevance:** High
  - **Informs:** `I1`, `I3`, `I6`, `I10`

- **Insight:** Subject-consistent video literature increasingly uses explicit identity constraints across frames, validating your frame-consistency identity dimension.
  - **Source:** Recent subject-consistent T2V papers (`https://arxiv.org/abs/2502.11079`, `https://arxiv.org/abs/2512.07328`)
  - **Relevance:** Medium
  - **Informs:** `I1`, `I5`, `I9`

- **Insight:** Multi-dimensional video benchmarks include identity inconsistency as a first-class failure mode, not just aesthetics.
  - **Source:** VBench (`https://arxiv.org/abs/2311.17982`)
  - **Relevance:** High
  - **Informs:** `I1`, `I5`, `I9`

### What doesn't

- **Insight:** Generic image quality signals alone under-detect subtle face-shape drift and age-regression artifacts.
  - **Source:** Preference-metric limitations + subject-consistency literature
  - **Relevance:** High
  - **Informs:** `I3`, `I6`, `I10`

- **Insight:** No widely accepted public “VLM-only face verification” standard currently matches dedicated biometric systems; treat VLM face scoring as decision support, not absolute truth.
  - **Source:** Surveyed literature gap (no dominant benchmark proving robust VLM-only verification)
  - **Relevance:** High
  - **Informs:** `I5`, `I7`

### Key papers/sources

- `https://arxiv.org/abs/2208.12242`
- `https://arxiv.org/abs/2502.11079`
- `https://arxiv.org/abs/2512.07328`
- `https://arxiv.org/abs/2311.17982`

## 6. Cost Optimization

### What works

- **Insight:** Prompt caching is the highest immediate ROI when the rubric/reference prefix repeats across many scores.
  - **Source:** Anthropic Prompt Caching docs (`https://platform.claude.com/docs/en/build-with-claude/prompt-caching`)
  - **Relevance:** High
  - **Informs:** `I8`

- **Insight:** Track cache effectiveness using token usage fields and optimize around read/write hit behavior.
  - **Source:** Anthropic prompt caching usage fields (`cache_read_input_tokens`, etc.) (`https://platform.claude.com/docs/en/build-with-claude/prompt-caching`)
  - **Relevance:** High
  - **Informs:** `I8`

- **Insight:** Two-stage scoring (cheap triage model, expensive confirmatory judge for near-threshold cases) is a strong scale pattern.
  - **Source:** Judge-model scaling findings + production eval patterns
  - **Relevance:** High
  - **Informs:** `I7`, `I8`, `I10`

- **Insight:** Resolution staging (fast low-res iteration, high-res final verification) aligns with best-practice cost-quality tradeoffs for vision APIs.
  - **Source:** Vision API guidance + practical pipeline designs (`https://platform.claude.com/docs/en/docs/build-with-claude/vision`)
  - **Relevance:** High
  - **Informs:** `I10`

### What doesn't

- **Insight:** Pure async batch processing can hurt interactive iteration loops even if token cost is lower.
  - **Source:** API docs + production tradeoff analysis
  - **Relevance:** Medium
  - **Informs:** `I8`

- **Insight:** Sending oversized/low-value image payloads (or contact sheets with tiny face regions) wastes tokens and degrades identity assessment.
  - **Source:** Vision API input guidance + your observed plateaus
  - **Relevance:** High
  - **Informs:** `I1`, `I6`, `I10`

### Key papers/sources

- `https://platform.claude.com/docs/en/build-with-claude/prompt-caching`
- `https://platform.claude.com/docs/en/docs/build-with-claude/vision`
- `https://platform.claude.com/docs/en/build-with-claude/structured-outputs`

## 7. Anti-Patterns to Avoid

### What works (as safeguards)

- **Insight:** Randomized ordering in pairwise comparisons reduces position bias.
  - **Source:** MT-Bench bias analysis (`https://arxiv.org/abs/2306.05685`)
  - **Relevance:** High
  - **Informs:** `I7`

- **Insight:** Short, strict schemas reduce parser failures and enforce consistent evaluator outputs.
  - **Source:** Anthropic structured outputs (`https://platform.claude.com/docs/en/build-with-claude/structured-outputs`)
  - **Relevance:** High
  - **Informs:** `I5`

- **Insight:** Confidence-weighted aggregation guards against brittle hard decisions from uncertain fields.
  - **Source:** Evaluator reliability patterns + benchmark practice
  - **Relevance:** High
  - **Informs:** `I5`, `I9`

### What doesn't

- **Insight:** Absolute single-pass scoring with no confidence and no retry policy leads to instability.
  - **Source:** LLM-as-judge instability literature + production eval experience
  - **Relevance:** High
  - **Informs:** `I5`, `I7`

- **Insight:** Letting model verbosity influence scoring rationale creates hidden bias (longer explanation ≠ better sample).
  - **Source:** MT-Bench bias findings (`https://arxiv.org/abs/2306.05685`)
  - **Relevance:** High
  - **Informs:** `I3`, `I7`

- **Insight:** Over-optimizing prompts to one judge model risks rubric gaming and reduced cross-model validity.
  - **Source:** JudgeLM/PandaLM ecosystem and evaluator transfer limitations
  - **Relevance:** Medium
  - **Informs:** `I7`

### Key papers/sources

- `https://arxiv.org/abs/2306.05685`
- `https://arxiv.org/abs/2310.17631`
- `https://arxiv.org/abs/2306.05087`
- `https://platform.claude.com/docs/en/build-with-claude/structured-outputs`

## 8. Real-World Vision API Scoring Implementations

### Implementations found

- **Anthropic Vision API docs (official)**
  - **Source:** `https://platform.claude.com/docs/en/docs/build-with-claude/vision`
  - **Pattern observed:** Multi-image input in one request; image + text blocks; explicit prompt framing for comparison tasks.
  - **Structured output strategy:** Pair with JSON schema / strict tool use for reliable parseability.
  - **Relevance:** High
  - **Informs:** `I1`, `I5`, `I6`, `I10`

- **Anthropic structured outputs + strict tool use**
  - **Source:** `https://platform.claude.com/docs/en/build-with-claude/structured-outputs`
  - **Pattern observed:** Constrained output format, schema validation, complexity limits, explicit failure behavior.
  - **Structured output strategy:** Prefer schema-constrained output for production scoring contracts.
  - **Relevance:** High
  - **Informs:** `I5`

- **Anthropic prompt caching docs**
  - **Source:** `https://platform.claude.com/docs/en/build-with-claude/prompt-caching`
  - **Pattern observed:** Cache reusable prompt prefix (rubric + references), inspect read/write tokens, optional 1h TTL.
  - **Cost lesson:** Caching is first-line optimization for repeated eval sessions.
  - **Relevance:** High
  - **Informs:** `I8`

- **OpenAI image eval cookbook (official)**
  - **Source:** `https://developers.openai.com/cookbook/examples/multimodal/image_evals`
  - **Pattern observed:** Rubric-based image grading and model-as-judge workflow for generative image tasks.
  - **Prompt structure:** Criteria-first grading prompt with structured extraction path.
  - **Relevance:** High
  - **Informs:** `I2`, `I3`, `I5`, `I7`

- **OpenAI vision cookbook examples**
  - **Source:** `https://developers.openai.com/cookbook/examples/tag_caption_images_with_gpt4v`
  - **Pattern observed:** Practical multimodal request construction and batch-like workflow orchestration.
  - **Relevance:** Medium
  - **Informs:** `I1`, `I8`

- **Google Gemini image understanding docs**
  - **Source:** `https://ai.google.dev/gemini-api/docs/image-understanding`
  - **Pattern observed:** Multi-image understanding and API-level support for comparative visual tasks.
  - **Relevance:** Medium
  - **Informs:** `I1`, `I6`, `I10`

### Common prompt/pipeline structures that transfer well

1. **Reference-first framing**
   - Prompt sequence: “Reference identity constraints” -> “Target frames” -> “Per-field scoring contract”.
2. **Two-part output contract**
   - Part A: concise reasoning evidence per field.
   - Part B: strict JSON fields for score/confidence.
3. **Validation + retry**
   - Reject invalid schema output and retry once with shorter instruction.
4. **Uncertainty handling**
   - If confidence low on field, either reduce weight or flag for human review.
5. **Consensus for edge cases**
   - Re-score only near lock threshold (for example 62–66) or when confidence conflicts.

## Recommendations for Our Scorer v2 (Prioritized)

1. **Implement rubric level definitions (`I3`) and brief reason-before-score (`I2`) first.**
   - Why first: fastest path to reducing plateau/compression.
   - Expected impact: better score spread and more actionable deltas.

2. **Add confidence per field and confidence-weighted aggregation (`I5`), especially for motion (`I9`).**
   - Why second: addresses known unreliability in still-based motion fields.
   - Expected impact: fewer false “stalls” and better trust in totals.

3. **Add few-shot anchors (`I4`) using your own proven examples, not generic internet examples.**
   - Why third: calibrates your exact character/scene distribution.
   - Expected impact: reduced conservatism (3/4 lock-in), better 5/5 assignment when deserved.

4. **Use individual frames + zoom/crop guidance (`I1`, `I6`) and reserve 720p for final validation (`I10`).**
   - Why fourth: improves face-detail signal while containing cost.
   - Expected impact: higher sensitivity to subtle identity improvements.

5. **Harden cost architecture (`I8`) with cache KPIs and two-stage scoring.**
   - Why fifth: protects scale as evaluations grow.
   - Expected impact: lower token spend and predictable throughput.

6. **Introduce pairwise “progress judge” in parallel with absolute score (`I7`).**
   - Why: pairwise is better for tiny iteration deltas.
   - Expected impact: more reliable iteration guidance even when absolute score appears flat.

## Practical “Do This / Don’t Do This”

### Do this

- Keep /75 score for continuity, but use pairwise delta judge for iteration decisions.
- Require field-level evidence strings before each numeric score.
- Downweight or defer motion fields when confidence is low from stills.
- Cache rubric/reference blocks and track cache hit ratio every session.
- Run high-res verification only on candidates near lock threshold.

### Don’t do this

- Don’t trust single-pass absolute score as sole decision signal.
- Don’t assume motion smoothness from sparse stills is reliable.
- Don’t let unconstrained free-text outputs feed production scoring logic.
- Don’t use static anchors forever; rotate with current winning outputs.
- Don’t optimize only for one judge model’s quirks.

## Limitations and Gaps

- Public literature on **VLM-only face verification reliability** remains limited versus dedicated biometric methods.
- Limited public details exist on internal scoring systems from closed vendors (Runway/Pika/Luma/Kling); most insights are inferred from benchmarks, papers, and tooling patterns rather than direct architecture disclosures.
- Community Wan2.x practices are fragmented and mostly operational (prompt/seed heuristics) rather than formal evaluator methodology.

## Sources

1. MT-Bench / Chatbot Arena: `https://arxiv.org/abs/2306.05685`
2. G-Eval: `https://arxiv.org/abs/2303.16634`
3. JudgeLM: `https://arxiv.org/abs/2310.17631`
4. PandaLM paper: `https://arxiv.org/abs/2306.05087`
5. PandaLM repo: `https://github.com/WeOpenML/PandaLM`
6. ImageReward paper: `https://arxiv.org/abs/2304.05977`
7. ImageReward repo: `https://github.com/THUDM/ImageReward`
8. PickScore repo: `https://github.com/yuvalkirstain/PickScore`
9. HPSv2 paper: `https://arxiv.org/abs/2306.09341`
10. HPSv2 repo: `https://github.com/tgxs002/HPSv2`
11. VBench paper: `https://arxiv.org/abs/2311.17982`
12. VBench repo: `https://github.com/Vchitect/VBench`
13. VBench project page: `https://vchitect.github.io/VBench-project/`
14. FVD paper: `https://arxiv.org/abs/1812.01717`
15. Chain-of-Thought prompting: `https://arxiv.org/abs/2201.11903`
16. Self-consistency prompting: `https://arxiv.org/abs/2203.11171`
17. Calibrate Before Use (few-shot calibration): `https://arxiv.org/abs/2102.09690`
18. DreamBooth: `https://arxiv.org/abs/2208.12242`
19. Subject-consistent video (Phantom): `https://arxiv.org/abs/2502.11079`
20. ContextAnyone (character-consistent T2V): `https://arxiv.org/abs/2512.07328`
21. Anthropic Vision docs: `https://platform.claude.com/docs/en/docs/build-with-claude/vision`
22. Anthropic Prompt Caching docs: `https://platform.claude.com/docs/en/build-with-claude/prompt-caching`
23. Anthropic Structured Outputs docs: `https://platform.claude.com/docs/en/build-with-claude/structured-outputs`
24. OpenAI image eval cookbook: `https://developers.openai.com/cookbook/examples/multimodal/image_evals`
25. OpenAI vision cookbook example: `https://developers.openai.com/cookbook/examples/tag_caption_images_with_gpt4v`
26. Gemini image understanding docs: `https://ai.google.dev/gemini-api/docs/image-understanding`
