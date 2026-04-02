# Codex Task: Score Level Definitions for Vision Scorer v2

## Mission

Write detailed score level definitions (anchors) for all 15 scoring fields used by our Vision API scorer. Each field needs a clear description of what scores 1, 2, 3, 4, and 5 look like. These definitions will be injected into the Vision API prompt to eliminate "middle-score collapse" (the model defaulting to 3-4 for everything).

**Output:** A single file saved to:
`C:\Projects\iteratarr\docs\research\score-level-definitions.md`

This is CONTENT WORK ONLY — do not modify any code files.

## Context

### What this project does
Iteratarr is a tool for iterating on AI-generated video renders of real people (character LoRAs). A user provides reference photos of a real person, generates a video render using Wan2.2 (a text-to-video AI model), then our Vision Scorer sends frames from that render to Claude's Vision API along with the reference photos. The scorer returns structured scores across 15 fields.

The scores guide an automated iteration loop: score → identify weakest field → adjust parameters → re-render → re-score → repeat until the score hits 65/75.

### The problem we're solving
Our current rubric says things like:
```
- face_match: Overall face resemblance to the target character
SCORING SCALE: 1 (poor) to 5 (excellent)
```

This is too vague. Research confirms VLMs exhibit "central tendency bias" — they cluster around 3-4 when anchors are underspecified. Our trial data shows:
- **Mick Doohan:** Plateaus at 61/75 across 20 iterations — scores oscillate but never break through
- **Belinda:** Plateaus at 53-55/75 across 20 iterations — similar behavior

The scorer can't distinguish between "genuinely improved" and "roughly the same" because it has no concrete definition of what separates a 3 from a 4.

### What the renders look like
These are 5-second AI-generated video clips of real people. Common characteristics:
- Resolution: 480p (iteration) or 720p (final pass)
- 6 key frames extracted as WebP stills for scoring
- Character rendered via LoRA-trained model from ~20 training photos of the real person
- Common quality issues: face drift across frames, wrong skin tone, incorrect hair, clothing missing/wrong, background inconsistencies, unnatural motion, static camera

### Characters in production
Real people with LoRA-trained character models:
- **Mick Doohan** — Australian man, ~60 years old, distinctive weathered face, short grey hair, tanned skin
- **Belinda** — Australian woman, ~40 years old, long curly dark brown hair
- **Toby Price** — Australian man, ~35 years old, athletic build
- **Jack Doohan** — Australian man, ~22 years old, racing driver
- **Judd** — Australian man, ~40 years old
- **Matty** — Australian man, ~30 years old

### How scores are used
- Scores 1-5 per field, 15 fields total, max 75
- **Lock threshold:** 65/75 (87%) — iteration loop stops, render is accepted for production
- Scores feed into an automated "rope" recommendation system that decides which parameter to adjust next
- The Vision scorer also compares against character reference photos (real photos of the person)

## The 15 Fields — Current Definitions (What You're Replacing)

### IDENTITY (8 fields, max 40 points)

These compare the rendered character against the reference photos of the real person.

1. **face_match** — "Overall face resemblance to the target character"
   - This is the holistic "is this the right person?" field
   - Scored by comparing rendered face against 1-3 reference photos
   - Most important single field in the rubric

2. **head_shape** — "Head shape accuracy (round, oval, angular, etc.)"
   - Structural shape of the skull/head outline
   - Common AI failure: heads too narrow, too round, or wrong proportions

3. **jaw** — "Jawline accuracy"
   - Jaw width, angle, definition
   - Common AI failure: generic "model jaw" instead of character-specific jawline

4. **cheekbones** — "Cheekbone definition and placement"
   - Prominence, height, width of cheekbones
   - Subtle but critical for distinguishing between similar-looking people

5. **eyes_brow** — "Eye shape, brow thickness, spacing accuracy"
   - Eye shape, brow arch, spacing between eyes, brow thickness
   - Common AI failure: generic anime-style eyes, wrong brow shape

6. **skin_texture** — "Skin texture, age representation, complexion"
   - Wrinkles, pores, age-appropriate texture, skin tone/complexion
   - Common AI failure: "AI smoothing" — over-smooth skin that looks 20 years younger

7. **hair** — "Hair style, colour, length, texture accuracy"
   - Hair colour, length, texture (straight/curly/wavy), style
   - Common AI failure: wrong colour, wrong length, generic hairstyle

8. **frame_consistency** — "Does the face stay consistent across frames?"
   - Does the character look like the SAME person across all 6 frames?
   - Not about matching reference — about internal consistency within the render
   - Common AI failure: face shifts between frames (different jaw in frame 3 vs frame 1)

### LOCATION (4 fields, max 20 points)

These assess the scene/environment of the render.

9. **location_correct** — "Does the setting match what was requested?"
   - Is the background/environment what was described in the prompt?
   - Example: "outdoor balcony with garden" — is it actually an outdoor balcony?

10. **lighting_correct** — "Is lighting natural and appropriate?"
    - Is the lighting realistic for the scene? Consistent direction? Natural shadows?
    - Common AI failure: flat lighting, conflicting shadow directions, studio-lit face in outdoor scene

11. **wardrobe_correct** — "Is clothing/wardrobe appropriate?"
    - Is the character wearing what was described?
    - Common AI failure: missing clothing entirely, wrong style, anachronistic clothing
    - Known issue: Belinda character renders frequently nude/bare-shouldered despite prompt specifying clothing

12. **geometry_correct** — "Are proportions and spatial relationships realistic?"
    - Body proportions, hands, perspective, spatial relationships
    - Common AI failure: extra fingers, tiny hands, impossible body proportions, broken perspective

### MOTION (3 fields, max 15 points)

These assess movement and temporal quality. **IMPORTANT: These are scored from 6 static frames, NOT from the actual video.** This is a known limitation — the scorer is inferring motion from stills, which is inherently unreliable. Score definitions should acknowledge this.

13. **action_executed** — "Does the character perform the requested action?"
    - Is the character doing what was asked? (talking, walking, gesturing, etc.)
    - Scored from apparent pose/gesture changes across the 6 frames
    - Easier to assess than smoothness/camera because you can see pose differences

14. **smoothness** — "Is the motion smooth without jitter or artifacts?"
    - Inferred from frame-to-frame consistency — are transitions natural?
    - Common AI failure: jittery hands, flickering details, temporal inconsistencies
    - **Hardest to assess from stills** — inherently limited, should have wide confidence range

15. **camera_movement** — "Is camera movement natural and intentional?"
    - Is there apparent camera drift, zoom, or pan across frames?
    - Static camera is not inherently bad — it depends on the prompt
    - **Often appears static from stills even when the video has subtle movement**

## Requirements for Each Field Definition

For EACH of the 15 fields, write definitions for scores 1 through 5. Each definition must be:

### Format per field:
```markdown
### field_name — Full Field Label

**What to look for:** [1-2 sentences explaining what this field measures and how to compare against reference photos where applicable]

| Score | Definition | Observable indicators |
|-------|-----------|----------------------|
| 1 | [Clear description] | [Specific visual cues that indicate a 1] |
| 2 | [Clear description] | [Specific visual cues that indicate a 2] |
| 3 | [Clear description] | [Specific visual cues that indicate a 3] |
| 4 | [Clear description] | [Specific visual cues that indicate a 4] |
| 5 | [Clear description] | [Specific visual cues that indicate a 5] |

**Common failure modes:** [What AI video generators typically get wrong on this dimension]
**Scoring confidence from stills:** high | medium | low [How reliably can this be assessed from 6 static frames?]
```

### Principles to follow:

1. **Definitions must be observable** — "the jaw matches the reference" not "the jaw is accurate." The scorer sees images, so descriptions must reference visual properties.

2. **Each level must be distinguishable from its neighbors** — a scorer reading the definitions must be able to confidently choose between 3 and 4. If you can't clearly articulate the difference, the VLM can't score it.

3. **Use the full range** — A 5 should be achievable but genuinely impressive. A 1 should be clearly broken. Don't define 1 as "missing entirely" (too rare) or 5 as "literally perfect" (impossible). Definitions should match what an AI video generator can realistically produce.

4. **Reference photos matter** — For identity fields (1-8), scoring is always RELATIVE to the character reference photos. Make this explicit: "compared to reference photos" should appear in identity field definitions.

5. **Motion caveats** — For fields 13-15, acknowledge the still-frame limitation. A 5 for smoothness from stills means "no visible inconsistencies between frames" not "the video is buttery smooth."

6. **Be concrete** — "Jaw angle within ~5 degrees of reference" is better than "jaw is close to correct." Use visual language: "visible", "noticeable", "prominent", "subtle."

7. **Anti-conservatism** — Research shows VLMs default to 3-4. Counter this explicitly:
   - Define 3 as the true middle: "recognizable but with notable differences"
   - Define 4 as genuinely good: "matches reference with only minor deviations visible on close inspection"
   - Define 5 as excellent but achievable: "indistinguishable from reference at normal viewing distance"
   - Define 2 as clearly problematic: "same general type but significant departures"
   - Define 1 as fundamentally wrong: "different person / wrong feature entirely"

8. **Frame consistency is special** — field 8 (frame_consistency) doesn't compare to reference photos. It compares frames to each other. Make this distinction clear.

## Research to Inform Your Definitions

Use web search to understand:
- How AI video quality is assessed in academic benchmarks (VBench dimensions)
- How face verification systems define similarity thresholds
- How other VLM evaluation rubrics structure their scoring anchors (G-Eval, MT-Bench patterns)
- What common artifacts look like in Wan2.1/Wan2.2 text-to-video generation
- How LoRA character consistency is typically evaluated in the SD/video generation community

## Output Format

```markdown
# Score Level Definitions — Vision Scorer v2

## Overview
[Brief explanation of the scoring system, how definitions are used, anti-conservatism guidance]

## Identity Fields (8 fields, max 40)

### face_match — Overall Face Match
[full definition per format above]

### head_shape — Head Shape Accuracy  
[full definition per format above]

[... all 8 identity fields ...]

## Location Fields (4 fields, max 20)

[... all 4 location fields ...]

## Motion Fields (3 fields, max 15)

[... all 3 motion fields, with still-frame caveats ...]

## Scorer Prompt Integration Notes
[How these definitions should be formatted when injected into the Vision API prompt. Keep total rubric under 2000 tokens to stay within prompt caching minimum thresholds while leaving room for instructions.]

## Field Confidence Ratings
[Summary table of all 15 fields with their scoring-from-stills confidence: high/medium/low]
```

## Quality Bar

- Every score level for every field must have both a definition AND observable indicators
- Definitions must be specific enough that two independent scorers would agree within 1 point
- Total rubric text (when formatted for prompt injection) should be under 2000 tokens
- Must acknowledge motion-from-stills limitation explicitly
- Must include anti-conservatism guidance for the VLM
- Research-informed — reference at least the VBench dimensions and face verification thresholds
