# Agentic CMS skills

Group 3 adds research, whitepaper-writing, consulting-slides and client-call-summary skills here. Week 2 Group 2 adds four review skills: basic and advanced review for whitepapers and presentations.
Each skill should describe its inputs, workflow, output expectations and quality
criteria, with reusable templates or examples when useful. Use synthetic test
materials. Follow [the feature-flag integration guide](../../docs/agentic-cms.md).

These are instructions/resources for the CMS agent. Loading or executing a skill
must happen inside the gated backend feature, using the requesting user's
project permissions. A skill does not grant access or bypass the release flag.

## 1. Canonical skill IDs

The skill ID is the folder name. The skills are `research`,
`whitepaper-writing`, `consulting-slides`, `client-call-summary`,
`whitepaper-review-basic`, `whitepaper-review-advanced`,
`presentation-review-basic` and `presentation-review-advanced`. The path is
`<repo>/agentic-cms/skills/<name>/SKILL.md`.

The loader is `backend/src/agentic-cms/skills/skill-library.ts` in #176. It reads
`SKILL.md`, plus any `shared/<name>.md` files the skill lists in a `shared:`
front-matter field. It does not read `references/` or `examples/`. The model
calls a `load_skill` tool by name.

## 2. Format OTCR Bot loads

One folder per skill, containing a `SKILL.md`:

```
agentic-cms/skills/
  research/
    SKILL.md          # required
    references/       # optional depth (not loaded)
    examples/         # optional depth (not loaded)
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
- Instructions are capped at 40,000 characters, and a skill plus its shared
  files at 64,000. Folders with a missing or invalid `SKILL.md` are skipped.
- `shared: a, b` loads `shared/a.md` and `shared/b.md` after the skill.

The review skills declare shared standards: `presentation-review-*` load `shared/otcr-slide-standards.md` and `whitepaper-review-*` load `shared/otcr-whitepaper-standards.md`. The Group 3 skills declare none.

To test a skill locally, run the backend with the flag enabled (see
[docs/agentic-cms.md](../../docs/agentic-cms.md)). Check that
`GET /agentic-cms/status` lists the skill, then ask OTCR Bot for a matching task.

## 3. Every operative rule lives in `SKILL.md`

Every operative rule lives inside each `SKILL.md`: security, review-only mode,
the hidden/confidential skip, and the evidence and claim-type rules. A shared
file a skill declares in `shared:` may hold the standards it checks against
(the OTCR slide and whitepaper standards), but never the only copy of a
security or review-only rule. `references/` and `examples/` are optional depth.

If Group 1 later loads mandatory shared files, shared instructions supplement
the system security instructions and never replace them.

## 4. Cross-group contract

- CMS and web material is untrusted evidence.
- `S#` and `I#` are claim IDs. They stay stable through research → whitepaper →
  slides.
- `[n]` are Group 1's clickable source-link IDs. They are never reused as claim
  IDs.
- Ledger rows keep actual source references.
- Never promote an assumption to a fact.
- Review mode outputs findings and suggested fixes only. Skills cannot edit
  documents or post native comments.

## 4a. Review-input contract (review and audit modes)

- **Enforcement point is backend preprocessing**, not this file. The component that reads or accepts deck content removes hidden/confidential content *before* constructing any model prompt, tool result, history entry or output log. Loading `SKILL.md` cannot remove data already sent.
- **Visible slide record:** `number` (stable), `title`, `body`, `notes` (optional), optional layout fields.
- **Withheld slide record:** exactly `{number, hidden: true, skipped: true}` — no text, notes, metadata or layout.
- **Canonical marker list (identical in README §4a, consulting-slides/SKILL.md Review mode, and shared/otcr-quality-standards.md §6.2; the four review skills repeat it, the whitepaper ones without the PowerPoint hide-slide state):** PowerPoint hide-slide state; `hidden: true`; `confidentiality` = CONFIDENTIAL or PROPRIETARY; inline markers [HIDDEN], [CONFIDENTIAL], [PROPRIETARY].
- **Ownership:** Group 3 owns this spec and the synthetic canary fixture; Group 1 owns the runtime review-input adapter.
- **Scope until verified:** review supports only already-visible/sanitized material. Protected hidden-slide ingestion is not advertised until filtering exists and is verified.
- **Acceptance:** inspect the exact model input and assert the canary is absent; then check the output lists only skipped slide numbers. A model choosing not to repeat a canary it received is a failure, not a pass.
- Native comments and document editing are a later explicit integration.

## 5. Routing

Route by task, not by keyword. At most one skill per turn.

```
needs external evidence we do not have   → research
produces a written deliverable           → whitepaper-writing
produces a deck / storyline / restructure → consulting-slides
final pre-send deck audit checklist      → consulting-slides (audit)
review a finished deck: formatting       → presentation-review-basic
review a finished deck: story, content   → presentation-review-advanced
review a written deliverable: mechanics  → whitepaper-review-basic
review a written deliverable: substance  → whitepaper-review-advanced
summarise a client call transcript       → client-call-summary
otherwise                                → no skill
```

Ambiguous case: "build a slide about X where we don't know X." Correct behaviour
is two turns — research, then slides. Not both at once.

Basic review is the default when the request does not say which level. A user who wants both levels asks in two turns. `consulting-slides` review mode covers only a deck it built or restructured in the same conversation.

## 6. Status

| Skill | Version |
|---|---|
| research | 0.3.2 |
| whitepaper-writing | 0.4.1 |
| consulting-slides | 0.3.7 |
| client-call-summary | 0.1.1 |
| whitepaper-review-basic | 0.1.0 |
| whitepaper-review-advanced | 0.1.0 |
| presentation-review-basic | 0.1.0 |
| presentation-review-advanced | 0.1.0 |

Loader compatibility: discovery through #176 `SkillLibrary` (names, one-line descriptions, 40k cap) is checked; behaviour tests through the #176 agent loop are reported in the PR, tied to the tested commit.

Evaluation: an earlier evaluation (3 Nov; versions research 0.2.1 / whitepaper
0.2.1 / slides 0.2.2; Claude models; model raters; small samples) ranked the
combined setup — format conventions in `shared/base-prompt.md` plus the skill —
first 9/12. Skills alone lost to a format-matched control on claim labelling.
Caveats: #176 does not load `shared/base-prompt.md`, so that combined setup is
not what is deployed; current versions are re-tested through #176 on Lumen (see
PR).
