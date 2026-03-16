# Anthropic Skill Creation Guide (Advanced)

This guide is based on the official Anthropic skill-creator and emphasizes a rigorous, iterative "Test -> Evaluate -> Iterate" loop. Use these principles when building complex skills that require high precision.

## Core Methodology

1.  **Capture Intent**: Understand the tools, sequence of steps, and corrections needed.
2.  **Iterative Loop**:
    *   Draft the skill.
    *   Create 2-3 realistic test prompts.
    *   Run evaluations (with vs. without the skill).
    *   Grade the results against objective assertions.
3.  **Refinement**: Improve the skill based on failure patterns, keeping the prompt lean and explaining the "why" behind instructions.

## Authoring Standards

### Progressive Disclosure
Keep the main `SKILL.md` focused on the core workflow and metadata. Move detailed schemas, domain-specific documentation, and complex examples into `references/`.

### Principle of Lack of Surprise
Skills should be predictable, secure, and never facilitate malicious activities.

### Writing Patterns
*   Use imperative/infinitive form.
*   Explain the reasoning behind constraints instead of using heavy-handed "MUST/NEVER".
*   Generalize from feedback to avoid "overfitting" to specific test cases.

## Optimization: Description Tuning
The skill's `description` is the primary triggering mechanism. If a skill "undertriggers", make the description more proactive ("Use this whenever X is mentioned...").

---
*Note: This reference is adapted from the official Anthropic Skill Creator for use within the Gemini CLI environment.*
