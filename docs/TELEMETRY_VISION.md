# Telemetry Vision

Iteratarr is a production tool. The telemetry layer makes it an intelligence platform.

## The Flywheel

```
User iterates on their character clip
  → Every evaluation = a data point
    → Scores, rope attributions, generation settings, AI vs human deltas
      → Aggregated across users, models, characters, locations
        → Recommendation engine: "Users with similar configs found Rope 3 most effective"
          → Better defaults, smarter guidance, faster iteration
            → More users, more data, better recommendations
```

## Three Data Layers

### Layer 1: Human Scores
The 15-field evaluation scored by the user. Identity, location, motion. The ground truth of what looks good.

### Layer 2: AI Scores
When using AI-assisted evaluation (Tenzing import or Vision API), the AI's raw scores before human adjustment. The machine's perception.

### Layer 3: Score Deltas
The difference between AI and human scores per field. Where the machine overrates. Where it underrates. The calibration curve.

Over time, the calibration improves. The AI's suggestions get closer to human judgment because we're tracking exactly where they diverge.

## Segmentation

Telemetry segments by **model_type** first:
- Rope findings for Wan2.2 dual-DiT don't apply to single-DiT models
- Each model builds its own playbook
- Some ropes are model-specific (phase-aware loras_multipliers = Wan2.2 only)
- Some ropes are universal (prompt position, attention weighting, seed locking)

Then by **category**:
- Identity improvements (which ropes fix face match, skin texture, frame consistency)
- Location improvements (which settings produce the best environments)
- Motion improvements (temporal coherence, action execution)

## What Gets Collected (when opted in)

- Evaluation scores (all 15 fields)
- AI scores and deltas (if AI-assisted)
- Rope attribution (which rope, confidence, lowest element)
- Generation settings (guidance scales, multipliers, video length, seed)
- Iteration progression (parent-child chain, score improvement)
- Scoring source (manual, ai_assisted, vision_api)

## What Never Gets Collected

- File paths
- Prompt text or alt_prompt text
- Negative prompt text
- Character names (anonymized to character_001, character_002)
- Qualitative notes
- LoRA filenames
- Any personally identifiable information

## The Business Case

The tool is the trojan horse. The data is the business.

Nobody else has a dataset that combines:
- Structured AI video evaluation scores
- Rope-attributed parameter changes with measured outcomes
- Human-corrected AI scoring calibration data
- Model-specific effectiveness data across thousands of iterations

From ONE clip, ONE character, ONE location, a handful of iterations — we already have empirical findings about prompt engineering that would take weeks to discover manually. Multiply across a community of users and the dataset becomes the definitive guide to AI video production.

## Implementation Status

- **Phase 1 (built):** Local recording. Opt-in toggle. Anonymized export as JSON.
- **Phase 2 (planned):** Collection endpoint. Local telemetry exports to central API.
- **Phase 3 (planned):** Recommendation engine. Queries aggregated data. "Users with similar configs found Rope 3 most effective for skin texture."
