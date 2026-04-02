# Codex Task: Vision-Based Scoring Research — What Works in the Wild

## Mission

Deep research into how others have solved the problem of using Vision Language Models (VLMs) to evaluate and score generated images/video. We're building an automated scoring system that rates AI-generated video frames against character reference photos across 15 dimensions. We need to know what patterns work, what doesn't, and what the state of the art looks like.

**Output:** A comprehensive research document saved to:
`C:\Projects\iteratarr\docs\research\vision-scoring-research.md`

This is RESEARCH ONLY — do not modify any code.

## Our Context

We have a working Vision scorer that sends rendered video frames (extracted as WebP stills) to Claude's Vision API along with character reference photos and a scoring rubric. It returns scores for 15 fields across 3 categories:

- **Identity (8 fields):** face_match, head_shape, jaw, cheekbones, eyes_brow, skin_texture, hair, frame_consistency
- **Location (4 fields):** location_correct, lighting_correct, wardrobe_correct, geometry_correct  
- **Motion (3 fields):** action_executed, smoothness, camera_movement

Each field is scored 1-5. Grand total is /75. Target is 65/75 to "lock" a result.

### Our current problems (from real trial data):
1. **Plateau at 61/75 (Mick character)** — scorer keeps returning 61 regardless of changes. Can't break through.
2. **Plateau at 53-55/75 (Belinda character)** — wardrobe_correct stuck at 2 for 10+ iterations despite multiple rope/parameter changes.
3. **Motion scoring from stills is unreliable** — camera_movement and smoothness can't be meaningfully assessed from 6 static frames.
4. **Scoring conservatism** — the model seems to default to 3-4 for most fields, rarely giving 5s or 1s. Compressed dynamic range.
5. **No score level definitions** — the rubric says "score 1-5" but doesn't define what each level means per field.
6. **Stateless scoring** — each iteration scored in isolation, no awareness of previous scores or what changed.

## Research Areas

### 1. VLM-as-Judge / LLM-as-Judge Patterns
Search for academic papers, blog posts, and open source projects that use Vision Language Models as evaluators/judges:

- **LLM-as-Judge** research (Zheng et al 2023, MT-Bench, etc.) — what works for getting models to score things reliably?
- **VLM evaluation benchmarks** — how do researchers evaluate VLM accuracy on perceptual tasks?
- **Rubric design for VLM scoring** — how do others structure scoring rubrics to get consistent results?
- **Score calibration techniques** — how to avoid the "everything is a 3" problem?
- **Reference-based scoring** — comparing generated output against a reference image (our exact use case)
- Any papers or projects on **face identity verification** using VLMs (not CLIP, not dedicated face models — specifically prompting general VLMs to compare faces)

### 2. AI Image/Video Quality Assessment
Search for tools and research on automated quality assessment of AI-generated imagery:

- **AIGC quality assessment** — papers on evaluating AI-generated content quality
- **Perceptual similarity metrics** — how others measure "does this look like the reference?"
- **Multi-dimensional scoring** — systems that score across multiple quality dimensions (not just a single score)
- **Temporal consistency scoring** — assessing frame-to-frame consistency in generated video
- Any **open source tools** that do automated scoring of generated images (HPS, ImageReward, PickScore, etc.)
- How do **Runway, Pika, Luma, Kling** evaluate their own generation quality internally? Any public research?

### 3. Chain-of-Thought for Evaluation
Research on getting better evaluation results from LLMs/VLMs:

- **CoT before scoring** — does reasoning before scoring improve accuracy? Any ablation studies?
- **Structured vs unstructured evaluation** — JSON output vs natural language vs tool use
- **Pairwise comparison vs absolute scoring** — is "which is better, A or B?" more reliable than "score this 1-5"?
- **Multi-pass evaluation** — score once, reflect, rescore. Does it help?
- **Confidence reporting** — getting models to report certainty per dimension

### 4. Few-Shot Calibration
Research on using examples to calibrate VLM evaluators:

- **Few-shot calibration anchors** — providing example scored images so the model knows what a "4" looks like
- **In-context learning for scoring** — how many examples are needed? Diminishing returns?
- **Anchor bias** — do few-shot examples cause anchoring effects? How to mitigate?
- **Dynamic few-shot selection** — choosing the most relevant examples based on the current input

### 5. Face/Character Identity Scoring
Research specific to our core use case — assessing character likeness:

- **Face verification approaches** — how do face ID systems work and can VLMs approximate this?
- **LoRA character consistency** — how does the LoRA training community evaluate character consistency? What metrics do they use?
- **Wan2.1/Wan2.2 community practices** — how do users of Wan (our video model) evaluate their results?
- **ComfyUI/A1111 quality workflows** — any automated quality checking in the Stable Diffusion ecosystem?
- **Character consistency in AI video** — any papers on maintaining identity across frames?

### 6. Cost-Effective Scoring at Scale
Research on making VLM evaluation affordable:

- **Batch evaluation patterns** — score multiple items efficiently
- **Cascading evaluation** — cheap first pass, expensive second pass only when needed
- **Smaller model for triage, larger for scoring** — using Haiku for quick reject, Sonnet for scoring
- **Image preprocessing for VLMs** — crop, resize, enhance before sending to reduce tokens
- **Caching strategies** — what can be cached to reduce per-evaluation cost?

### 7. What Doesn't Work (Anti-Patterns)
Equally important — what have others tried that failed?

- **Common failure modes** in LLM-as-Judge setups
- **Position bias** — models preferring first/last examples
- **Verbosity bias** — longer outputs getting higher scores
- **Self-enhancement bias** — models rating their own output higher
- **Scoring instability** — same input getting different scores on re-evaluation
- **Rubric gaming** — models finding loopholes in scoring criteria

### 8. Real-World Vision API Scoring Implementations
This is critical — find actual implementations, not just theory:

- **Anthropic Vision API** — real projects using Claude Vision for image evaluation, scoring, grading, comparison. GitHub repos, blog posts, tutorials showing actual prompt structures and scoring pipelines.
- **GPT-4V/GPT-4o evaluation pipelines** — same use case with OpenAI's Vision API. Prompt engineering patterns, JSON output strategies, multi-image comparison techniques. Many patterns transfer directly.
- **Gemini Pro Vision evaluation** — Google's equivalent. Any scoring/grading implementations.
- **Multi-image comparison prompts** — actual prompt templates people use when sending reference image + generated image and asking for structured comparison. What prompt structures get the most reliable scores?
- **Production scoring pipelines** — anyone running VLM scoring at scale (100s-1000s of evaluations). How do they handle consistency, cost, accuracy? Retry strategies? Consensus scoring (multiple calls, average)?
- **Anthropic Cookbook examples** — any evaluation/scoring patterns in the official cookbook (github.com/anthropics/anthropic-cookbook). Tool use for structured output. Vision + tools combined.
- **OpenAI Cookbook examples** — same for OpenAI's cookbook. Vision evaluation patterns often transfer to Anthropic.
- **Image-to-image comparison prompts** — actual prompt engineering that works for "how similar is image A to image B across these dimensions?" Our exact use case.
- **Structured JSON extraction from Vision** — what works better: asking for JSON directly, using tool_use/function_calling, or asking for analysis then extracting? Real benchmarks or experience reports.
- **Face comparison via VLM** — anyone using general VLMs (not dedicated face models) for face similarity assessment. What prompting strategies produce reliable identity matching results?

For each implementation found, capture:
- The actual prompt structure/template if available
- How they handle multi-image input (reference vs target)
- How they get structured output (JSON, tool use, etc.)
- Any reported accuracy metrics or lessons learned
- Cost per evaluation if mentioned

## Search Strategy

Cast a wide net:
- **Academic:** arXiv papers on LLM-as-Judge, VLM evaluation, AIGC quality
- **GitHub:** Open source scoring/evaluation tools, especially for image generation
- **Blog posts:** AI engineer blogs, Anthropic blog, OpenAI research
- **Communities:** Reddit (r/StableDiffusion, r/LocalLLaMA), HuggingFace discussions, CivitAI forums
- **Industry:** How Runway/Pika/Luma/Kling approach quality evaluation
- **Benchmarks:** MT-Bench, Arena-Hard, WildBench — evaluation methodology patterns

## Output Format

Structure the research doc with:

```markdown
# Vision-Based Scoring Research — State of the Art

## Executive Summary
(Top 5 actionable findings for our scorer v2)

## 1. VLM-as-Judge Patterns
### What works
### What doesn't
### Key papers/sources

## 2. AI Image Quality Assessment
(same structure)

## 3. Chain-of-Thought for Evaluation
(same structure)

## 4. Few-Shot Calibration
(same structure)

## 5. Face/Character Identity
(same structure)

## 6. Cost Optimization
(same structure)

## 7. Anti-Patterns to Avoid
(same structure)

## Recommendations for Our Scorer v2
(Prioritized list mapping research findings to our specific improvements)

## Sources
(Full list of papers, repos, blog posts referenced)
```

For each finding, include:
- The specific insight
- Source (URL, paper name, repo)
- Relevance to our use case (high/medium/low)
- Which of our 10 planned improvements (#42 issue) it informs

## Quality Bar

- Minimum 15 distinct sources
- At least 3 academic papers
- At least 2 open source tools/repos
- Practical recommendations, not just theory
- Honest about limitations — "this doesn't work because..." is as valuable as "this works"
