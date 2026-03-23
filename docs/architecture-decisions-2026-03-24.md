# Architecture Decisions — 2026-03-24

## Decision 1: Clip-First, Kill Projects/Scenes

**Before:** Project → Scene → Clip → Iterations
**After:** Clip → Branches → Iterations

Projects and scenes are removed from the core UX. Clips are the top-level entity.

**Rationale:**
- Core value is the iteration loop, which operates on clips
- Projects/scenes add friction and confusion for new users
- Nobody used them meaningfully in testing
- Cross-clip analytics achieved via character filter + tags, not hierarchy

**Migration:** Existing clips keep their data. Project/scene references become optional metadata on the clip record (scene_name, episode fields). API routes can stay but are deprioritised in the UI.

**Cross-clip grouping:** Via character filter and optional tags on clips. "Show me all mckdhn clips" or "all clips tagged episode-1."

## Decision 2: Branches Per Seed

Each clip can have multiple branches, one per seed. Each branch has its own iteration chain. See branch-architecture.md for full design.

## Decision 3: User Guidance Layer

Every screen needs:
- One-line "what is this?" description at the top
- Contextual hints on empty states
- Tooltips on non-obvious elements
- Optional guided walkthrough for first-time users

The tool should feel like a knowledgeable colleague showing you around, not a manual you have to read.

## Decision 4: Vision API = Iteratarr PRO

Vision API auto-scoring is the scaling bottleneck. Without it, every evaluation is manual. With it, the iteration loop becomes near-autonomous. This becomes the differentiator between free and pro tiers.

## Decision 5: Simplify Before Growing

Strip unnecessary complexity before adding branches. The branch architecture is the right foundation, but it's built on a simplified clip-first base, not the current project/scene/clip hierarchy.

## Principles

- Clip-first, not project-first
- Branch per seed, not mid-chain seed changes
- Fork forward, never rewrite history
- Guide the user, don't overwhelm them
- Build for the iteration loop, everything else is enhancement
- Curation is the moat — for features AND settings AND data
