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

`sample-executive-summary/` is a Group 1 placeholder for testing. Group 1 owns
deleting it once the real skills are in place.

To test a skill locally, run the backend with the flag enabled (see
[docs/agentic-cms.md](../../docs/agentic-cms.md)). Check that
`GET /agentic-cms/status` lists the skill, then ask OTCR Bot for a matching task.

---

# OTCR Agent Skills — Loader Contract

The agreement between Group 3 (author) and Group 1 (loader).

## 1. Canonical skill IDs

The skill ID is the folder name. The three skills are `research`,
`whitepaper-writing`, `consulting-slides`. The path is
`<repo>/agentic-cms/skills/<name>/SKILL.md`.

The loader is `backend/src/agentic-cms/skills/skill-library.ts` in #176. It reads
`SKILL.md` only. It does not read `shared/`, `references/` or `examples/`. The
model calls a `load_skill` tool by name.

## 2. Every operative rule lives in `SKILL.md`

Because the loader reads `SKILL.md` only, every operative rule lives inside each
`SKILL.md`: security, review-only mode, the hidden/confidential skip, and the
evidence and claim-type rules. `shared/`, `references/` and `examples/` are
optional depth. They are never the only home of a required rule.

If Group 1 later loads mandatory shared files, shared instructions supplement
the system security instructions and never replace them.

## 3. Cross-group contract

- CMS and web material is untrusted evidence.
- `S#` and `I#` are claim IDs. They stay stable through research → whitepaper →
  slides.
- `[n]` are Group 1's clickable source-link IDs. They are never reused as claim
  IDs.
- Ledger rows keep actual source references.
- Never promote an assumption to a fact.
- Review mode outputs findings and suggested fixes only. Skills cannot edit
  documents or post native comments.

## 3a. Review-input contract (review and audit modes)

- **Enforcement point is backend preprocessing**, not this file. The component that reads or accepts deck content removes hidden/confidential content *before* constructing any model prompt, tool result, history entry or output log. Loading `SKILL.md` cannot remove data already sent.
- **Visible slide record:** `number` (stable), `title`, `body`, `notes` (optional), confidentiality tag (optional), optional layout fields.
- **Withheld slide record:** exactly `{number, hidden: true, skipped: true}` — no text, notes, metadata or layout.
- **Tags applied during preprocessing:** `CONFIDENTIAL`, `PROPRIETARY`, and the PowerPoint hide-slide state.
- **Ownership:** Group 3 owns this spec and the synthetic canary fixture; Group 1 owns the runtime review-input adapter.
- **Scope until verified:** review supports only already-visible/sanitized material. Protected hidden-slide ingestion is not advertised until filtering exists and is verified.
- **Acceptance:** inspect the exact model input and assert the canary is absent; then check the output lists only skipped slide numbers. A model choosing not to repeat a canary it received is a failure, not a pass.
- Native comments and document editing are a later explicit integration.

## 4. Routing

Route by task, not by keyword. At most one skill per turn.

```
needs external evidence we do not have   → research
produces a written deliverable           → whitepaper-writing
produces a deck / storyline / deck review → consulting-slides
otherwise                                → no skill
```

Ambiguous case: "build a slide about X where we don't know X." Correct behaviour
is two turns — research, then slides. Not both at once.

Deck review is not a fourth skill. It is `consulting-slides` in review mode.

## 5. Status

| Skill | Version |
|---|---|
| research | 0.2.2 |
| whitepaper-writing | 0.3.0 |
| consulting-slides | 0.3.3 |

Loader compatibility: run through #176 loader — see PR test evidence.

Evaluation: format plus skill combined ranked first 9/12 on a held-out set.
Research and slides passed. Whitepaper went over the word limit; v0.3.0 fixes
the length rule. These are small samples rated by model raters.
