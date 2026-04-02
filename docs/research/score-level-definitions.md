# Score Level Definitions — Vision Scorer v2

## Overview

These anchors are written to reduce middle-score collapse and improve agreement between repeated Vision scoring passes.

Scoring intent:
- Use the full scale. `3` is true middle, not default.
- For identity fields, always score **relative to reference photos**.
- Prefer observable evidence over vague quality words.
- Motion fields are inferred from stills; score with explicit caution.

Research-informed guardrails used in this rubric:
- **VBench-style dimension separation** (identity/consistency/motion are distinct failure axes): [VBench paper](https://arxiv.org/abs/2311.17982), [VBench project](https://vchitect.github.io/VBench-project/).
- **Face verification threshold thinking** (decision thresholds trade false match vs false non-match; high-stakes flows use stricter thresholds): [AWS Rekognition thresholds](https://docs.aws.amazon.com/rekognition/latest/dg/thresholds-collections.html), [CompareFaces API notes](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_CompareFaces.html).
- **Reason-then-score pattern** for judge reliability: [G-Eval](https://arxiv.org/abs/2303.16634), [MT-Bench / judge bias context](https://arxiv.org/abs/2306.05685).

## Identity Fields (8 fields, max 40)

### face_match — Overall Face Match

**What to look for:** Compare each scored frame against reference photos for overall “same person” impression (shape + features + age signal + complexion), not just one feature.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Different person vs reference. | Multiple core traits wrong at once (age band, face proportions, feature layout). |
| 2 | Same broad type, clearly wrong identity. | Some overlap, but strong departures in several defining facial traits. |
| 3 | Recognizable but notable differences. | Identity reads “close-ish” with obvious mismatches at normal viewing distance. |
| 4 | Strong match with minor deviations. | Same person impression holds; only small differences on close inspection. |
| 5 | Excellent match, near-indistinguishable. | At normal viewing distance, identity reads as the reference person. |

**Common failure modes:** Generic “AI face,” age drift younger, swapped facial geometry, over-smoothed skin masking identity.
**Scoring confidence from stills:** high

### head_shape — Head Shape Accuracy

**What to look for:** Compare cranial silhouette and face-outline proportions to reference photos (width/height ratio, temple-to-jaw taper, forehead shape).

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Head geometry fundamentally wrong. | Silhouette class differs (too round/too long/too narrow) from reference. |
| 2 | Major proportion mismatch. | Width-height balance visibly off; contour mismatch obvious. |
| 3 | Partial match with clear shape drift. | General form is similar but proportion errors remain noticeable. |
| 4 | Good structural match. | Outline and proportions mostly align; only slight contour differences. |
| 5 | Excellent structural alignment. | Silhouette/proportions consistently mirror reference head shape. |

**Common failure modes:** Narrowed skull, inflated forehead, generic oval template replacing character-specific shape.
**Scoring confidence from stills:** high

### jaw — Jawline Accuracy

**What to look for:** Compare jaw width, mandibular angle, chin-to-jaw continuity, and jaw definition against references.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Wrong jaw identity signal. | Jaw width/angle/chin structure clearly incompatible with reference. |
| 2 | Significant jaw mismatch. | Jawline direction or definition strongly diverges from references. |
| 3 | Mixed accuracy. | Some jaw traits align, but visible shape or angle differences persist. |
| 4 | Strong jaw match. | Width, angle, and chin transition mostly match with minor drift. |
| 5 | Near-reference jawline fidelity. | Jaw structure reads as the same person across scored frames. |

**Common failure modes:** “Model jaw” substitution, softened jaw, widened mandible, mismatched chin projection.
**Scoring confidence from stills:** high

### cheekbones — Cheekbone Definition and Placement

**What to look for:** Compare cheekbone prominence, vertical placement, and lateral spread relative to nose/eye position in references.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Cheek structure incompatible. | Prominence and placement contradict reference facial architecture. |
| 2 | Clearly incorrect cheek profile. | Height/spread noticeably wrong, changing face identity impression. |
| 3 | Approximate but inconsistent. | Similar region emphasis, yet noticeable placement/prominence errors. |
| 4 | Good cheekbone fidelity. | Placement and definition mostly align; small intensity differences. |
| 5 | Highly accurate cheek structure. | Prominence/placement consistently match reference morphology. |

**Common failure modes:** Flattened cheeks, exaggerated contouring, cheek height drift frame-to-frame.
**Scoring confidence from stills:** medium

### eyes_brow — Eye and Brow Accuracy

**What to look for:** Compare eye aperture/shape, inter-eye spacing, brow thickness/arch/set, and eye-brow relationship to references.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Eye-brow complex wrong identity. | Shape/spacing/brow style forms a different person signal. |
| 2 | Strong mismatch in key traits. | One or more major cues (spacing, arch, thickness) clearly wrong. |
| 3 | Partly correct, notable differences. | General placement works, but shape/style mismatches remain visible. |
| 4 | Strong feature match. | Eye and brow geometry mostly aligns with only minor deviations. |
| 5 | Excellent eye-brow fidelity. | Eye/brow set reads as reference-consistent across scored frames. |

**Common failure modes:** Stylized/anime eyes, incorrect brow arch, widened spacing, brow density drift.
**Scoring confidence from stills:** high

### skin_texture — Skin Texture, Age, Complexion

**What to look for:** Compare age-appropriate texture, line depth, pore realism, and complexion/undertone against references.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Age/complexion fundamentally wrong. | Wrong age band or skin tone; texture incompatible with reference. |
| 2 | Major skin realism mismatch. | Strong over-smoothing or incorrect tone/aging cues dominate. |
| 3 | Mixed realism. | Some correct cues, but visible smoothing/tone/age mismatches remain. |
| 4 | Good age-complexion match. | Mostly accurate texture and tone; minor softness or tone drift. |
| 5 | Excellent skin fidelity. | Age, texture, and complexion read convincingly like reference. |

**Common failure modes:** De-aging smoothing, waxy skin, tone shifts, inconsistent wrinkles across frames.
**Scoring confidence from stills:** medium

### hair — Hair Accuracy

**What to look for:** Compare color, length, texture pattern (curly/wavy/straight), hairline silhouette, and styling to references.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Hair identity signal incorrect. | Wrong color + length/texture class; reads as another person. |
| 2 | Clearly incorrect hair rendering. | Major mismatch in at least two key hair attributes. |
| 3 | Partially correct hair. | One major trait matches, but other visible mismatches persist. |
| 4 | Strong hair match. | Color/length/texture mostly aligned with minor styling differences. |
| 5 | Excellent hair fidelity. | Hair attributes consistently match reference across scored frames. |

**Common failure modes:** Generic hairstyle substitution, color drift, curl loss, unstable hairline frame-to-frame.
**Scoring confidence from stills:** high

### frame_consistency — Identity Consistency Across Frames

**What to look for:** Compare scored frames to each other (not to reference) for stability of core facial structure and identity cues over time.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Severe identity drift between frames. | Different-looking faces across frames; structure changes obvious. |
| 2 | Frequent notable drift. | Recurring changes in jaw/eyes/age cues across frame sequence. |
| 3 | Moderate inconsistency. | Same person mostly present, but periodic visible identity shifts. |
| 4 | Mostly stable identity. | Minor frame-to-frame variation; character remains clearly consistent. |
| 5 | Highly stable identity. | Core facial geometry/features remain consistent across all frames. |

**Common failure modes:** Frame 1 vs frame 4 looking like different people, alternating age signals, feature flicker.
**Scoring confidence from stills:** high

## Location Fields (4 fields, max 20)

### location_correct — Location/Setting Match

**What to look for:** Compare visible environment to prompt intent (scene type, setting cues, major spatial context).

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Wrong location class. | Prompted setting absent; scene reads as different environment entirely. |
| 2 | Weak location match. | Some relevant cues present, but dominant scene is incorrect. |
| 3 | Partial location fulfillment. | Core setting appears, but important requested context missing. |
| 4 | Strong location match. | Requested setting is clear with only minor missing details. |
| 5 | Excellent location fidelity. | Setting strongly and consistently reflects prompt intent. |

**Common failure modes:** Indoor/outdoor swap, generic background, missing landmark cues, context drift.
**Scoring confidence from stills:** high

### lighting_correct — Lighting Quality and Appropriateness

**What to look for:** Assess whether lighting direction, intensity, color temperature, and shadows make sense for scene and subject.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Lighting physically implausible. | Contradictory shadow directions or extreme unnatural face illumination. |
| 2 | Clearly problematic lighting. | Flat/harsh or mismatched scene-subject lighting is obvious. |
| 3 | Serviceable but flawed lighting. | Generally plausible, with noticeable inconsistency or flatness. |
| 4 | Good, coherent lighting. | Mostly natural direction and exposure; minor imperfections only. |
| 5 | Excellent scene-consistent lighting. | Natural, coherent light/shadow behavior throughout scored frames. |

**Common failure modes:** Studio-lit subject in outdoor scene, blown highlights, dead flat lighting, shadow mismatch.
**Scoring confidence from stills:** high

### wardrobe_correct — Wardrobe/Clothing Match

**What to look for:** Compare clothing presence, type, coverage, style, and color cues against prompt requirements.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Wardrobe requirement failed. | Missing required clothing or clearly inappropriate/incorrect attire. |
| 2 | Major wardrobe mismatch. | Clothing present but wrong category/style/coverage for prompt. |
| 3 | Partial wardrobe compliance. | Main clothing concept present; visible inaccuracies remain significant. |
| 4 | Strong wardrobe match. | Clothing largely matches with minor style/color/detail deviations. |
| 5 | Excellent wardrobe fidelity. | Clothing matches prompt intent consistently across scored frames. |

**Common failure modes:** Bare shoulders/nudity despite wardrobe prompt, wrong era/style, unstable clothing continuity.
**Scoring confidence from stills:** high

### geometry_correct — Anatomy and Spatial Geometry

**What to look for:** Evaluate body proportions, limb/hand integrity, perspective coherence, and object-person spatial realism.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Severe geometric breakage. | Obvious anatomy errors or impossible perspective/placement. |
| 2 | Clear geometry defects. | Repeated proportion or hand/limb distortions are visible. |
| 3 | Mixed geometric quality. | Mostly plausible with noticeable localized distortions. |
| 4 | Good geometric realism. | Proportions/perspective mostly coherent; minor defects only. |
| 5 | Excellent geometric coherence. | Anatomy and spatial relationships remain natural across frames. |

**Common failure modes:** Extra/missing fingers, warped limbs, body scale errors, impossible perspective joins.
**Scoring confidence from stills:** high

## Motion Fields (3 fields, max 15)

### action_executed — Requested Action Execution

**What to look for:** Infer whether the requested action is visibly being performed by comparing pose/gesture progression across frames.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Requested action absent. | Poses do not indicate the prompted action at all. |
| 2 | Weak/ambiguous action signal. | Minimal or unclear pose evidence of requested action. |
| 3 | Action partly evident. | Action appears in some frames but incomplete/unclear overall. |
| 4 | Action clearly executed. | Pose sequence supports requested action with minor ambiguity. |
| 5 | Action strongly and consistently executed. | Frame sequence clearly shows intended action progression. |

**Common failure modes:** Static posing when motion requested, wrong gesture class, unrelated movement.
**Scoring confidence from stills:** medium

### smoothness — Apparent Motion Smoothness (Stills-Inferred)

**What to look for:** Infer temporal smoothness from frame-to-frame continuity of pose, limbs, facial features, and fine details.

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Strong temporal instability. | Large discontinuities/flicker artifacts between adjacent frames. |
| 2 | Frequent visible jitter signs. | Repeated abrupt shifts in details/pose suggest rough motion. |
| 3 | Mixed smoothness. | Some transitions appear natural; others show visible inconsistency. |
| 4 | Mostly smooth apparent continuity. | Small discontinuities only; transitions mostly coherent. |
| 5 | Very smooth inferred continuity. | No obvious frame-to-frame instability in sampled sequence. |

**Common failure modes:** Hand jitter, facial flicker, cloth/hair popping, micro-shape jumps.
**Scoring confidence from stills:** low

### camera_movement — Apparent Camera Movement Quality (Stills-Inferred)

**What to look for:** Infer camera behavior from framing/background change pattern; judge against prompt intent (static is acceptable if requested).

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | Camera behavior clearly wrong/erratic. | Framing/background shifts appear unintended or physically implausible. |
| 2 | Problematic camera signal. | Movement intent unclear or unstable relative to prompt. |
| 3 | Acceptable but uncertain camera behavior. | Limited evidence; camera intent only partially supported by frames. |
| 4 | Good apparent camera control. | Framing progression mostly coherent with prompt intent. |
| 5 | Strong camera intent fidelity. | Apparent camera behavior clearly supports requested cinematic intent. |

**Common failure modes:** Random zoom drift, jumpy reframing, accidental static lock when motion requested.
**Scoring confidence from stills:** low

## Scorer Prompt Integration Notes

Use these definitions in two layers:

1. **Full rubric source (this document):** canonical human-readable reference.
2. **Prompt injection pack (compressed):** per-field anchors in compact one-line format to stay under token budget.

Recommended injection structure:

```text
For each field, score 1-5 using anchors exactly:
field_name:
1=...
2=...
3=...
4=...
5=...
Indicators: ...
```

Prompt-side anti-conservatism instruction (include verbatim):
- “Do not default to 3–4. Use 2 when mismatches are clearly visible. Use 5 when match is strong at normal viewing distance.”
- “Score each field independently; do not normalize toward prior totals.”
- “For motion fields from stills, report lower confidence when evidence is ambiguous.”

Token budget guidance:
- Keep the compressed injection block to ~1500–1800 tokens.
- Keep per-anchor text short (6–14 words) and avoid duplicated phrasing.
- Keep full instructions + schema + anchors below ~2000 tokens for cache-friendly reuse.

## Field Confidence Ratings

| Field | Confidence from 6 stills |
|------|---------------------------|
| face_match | high |
| head_shape | high |
| jaw | high |
| cheekbones | medium |
| eyes_brow | high |
| skin_texture | medium |
| hair | high |
| frame_consistency | high |
| location_correct | high |
| lighting_correct | high |
| wardrobe_correct | high |
| geometry_correct | high |
| action_executed | medium |
| smoothness | low |
| camera_movement | low |
