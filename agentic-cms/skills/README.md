# Agentic CMS skills

Group 3: add research, whitepaper-writing, slide-design and review skills here.
Each skill should describe its inputs, workflow, output expectations and quality
criteria, with reusable templates or examples when useful. Use synthetic test
materials. Follow [the feature-flag integration guide](../../docs/agentic-cms.md).

These are instructions/resources for the CMS agent. Loading or executing a skill
must happen inside the gated backend feature, using the requesting user's
project permissions. A skill does not grant access or bypass the release flag.

## Format OTCR Bot loads

One folder per skill, containing a `SKILL.md`:

```
agentic-cms/skills/
  research/
    SKILL.md          # required
    examples.md       # optional resources (not loaded automatically yet)
  whitepaper-writing/
    SKILL.md
```

`SKILL.md` starts with front matter, followed by the instructions in Markdown:

```markdown
---
name: research
description: Use when the user asks to research a market, company or question and synthesize sources.
---

# Research

## When to use
## Instructions
## Expected output
## Quality check before answering
```

Rules the loader enforces (`backend/src/agentic-cms/skills/skill-library.ts`):

- The folder name and `name` must match and use lowercase letters, digits and
  hyphens (for example `slide-design`).
- `description` is required and must fit on one line. The bot sees every skill's
  name and description, and loads the full instructions only when a request
  matches the description. Make the description say **when** to use the skill.
- Instructions are capped at 40,000 characters. Folders with a missing or
  invalid `SKILL.md` are skipped.

`sample-executive-summary/` is a Group 1 placeholder for testing. Delete it once
the real skills are in place.

To test a skill locally, run the backend with the flag enabled (see
[docs/agentic-cms.md](../../docs/agentic-cms.md)). Check that
`GET /agentic-cms/status` lists the skill, then ask OTCR Bot for a matching task.
