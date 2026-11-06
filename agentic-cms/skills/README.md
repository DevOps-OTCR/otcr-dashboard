# Agentic CMS skills

Group 3: add research, whitepaper-writing, slide-design and review skills here.
Each skill should describe its inputs, workflow, output expectations and quality
criteria, with reusable templates or examples when useful. Use synthetic test
materials. Follow [the feature-flag integration guide](../../docs/agentic-cms.md).

These are instructions/resources for the CMS agent. Loading or executing a skill
must happen inside the gated backend feature, using the requesting user's
project permissions. A skill does not grant access or bypass the release flag.

---

# OTCR Agent Skills — Loader Contract

Three skills. This is the agreement between Group 3 (author) and Group 1 (loader).

**Versions: research 0.2.1 · whitepaper-writing 0.2.1 · consulting-slides 0.3.1. Changed after two test rounds, two adversarial reviews and one interview. Not yet LC-reviewed. See §8.**

---

## 1. Files

| Skill | Entry point | Supporting (optional) | Use when |
|---|---|---|---|
| Research & Evidence Intelligence | `research/SKILL.md` | `research/references/`, `research/examples/` | External evidence is required and must be traceable |
| Whitepaper & Strategic Writing | `whitepaper-writing/SKILL.md` | `whitepaper-writing/references/`, `whitepaper-writing/examples/` | Evidence must become a client-facing argument |
| Consulting Presentations | `consulting-slides/SKILL.md` | `consulting-slides/references/`, `consulting-slides/examples/` | An argument must become a storyline and storyboard, or an existing deck must be reviewed |

Shared contracts live in `shared/`: `base-prompt.md` (the FORMAT_SYS base prompt; use it as the system prompt and append one skill), `evidence-format.md`, `otcr-quality-standards.md`, `workflows.md`.

---

## 2. Graceful degradation — the important design rule

**`SKILL.md` is fully functional on its own.** Every decision rule, threshold, output contract, and quality gate is inside it. `references/` contains depth, not dependencies.

| Loader capability | Behaviour | Quality |
|---|---|---|
| Reads `SKILL.md` only | Works completely | Baseline |
| Also attaches the files in `references/` | More detail on appraisal, sizing, structure, charts, layouts, review | Better |
| Attaches `examples/` too | Strongest style anchoring | Best |

**Why this matters:** the repo currently contains **no skill loader and no agent-skill convention** (verified: no `AGENTS.md`, `CLAUDE.md`, skill directory, prompt registry, or agent module on `main` at `80fd1be`). Group 1 has not merged one. A design that requires a reference-router would silently fail on the simplest possible loader; a design that forbids references would waste the runtime if Group 1 supports them.

Do not move a **decision rule** into `references/`. Move **elaboration** only. That rule is what keeps the two modes equivalent in capability.

---

## 3. Format contract

| Property | Requirement |
|---|---|
| File type | Markdown |
| Frontmatter | YAML: `name`, `description`, `version`, `owner`, `release`, `metadata` |
| Entry point | `SKILL.md` (Agent Skills convention) |
| Self-contained | Yes — see §2 |
| Dependencies | None. No scripts, no packages, no network calls, no images |
| Length | `SKILL.md` 250–300 lines; references 80–120 each |
| Tables | ≤10 per `SKILL.md` (coherence ceiling) |
| Permissions | None. Skills grant no access and contain no write logic |

Frontmatter is the only structured part. The body is plain text for the model — do not parse or transform it.

---

## 4. How to load

1. **Read `SKILL.md` as text.** Frontmatter optional at read time.
2. **Select by task, not by keyword.** Match against `description`. At most **one** skill per turn.
3. **Inject the whole file.** Summarising removes the thresholds that make it work.
4. **Prompt order:** system instructions → project context (MCP) → skill text → conversation. Skill above the user turn.
5. **Label the active skill** in one line: `Loaded skill: otcr-research (v0.1.0)`. Makes routing debuggable.
6. **References, if supported:** append after `SKILL.md`, clearly delimited (`## Reference: chart-selection`). Never replace `SKILL.md`.
7. **No skill for CMS lookups.** "What is our SOW?" is a tool call.

**Routing rule:**

```
needs external evidence we do not yet have   → research
produces a written deliverable               → whitepaper-writing
produces a deck / storyline / deck review    → consulting-slides
otherwise                                    → no skill
```

Ambiguous: "build a slide about X where we don't know X." Correct behaviour is **two turns** — research, then slides. Not both at once.

**Deck review is not a fourth skill.** It is `consulting-slides` in review mode (see that file §8).

---

## 5. Composition and handoff

The skills compose through a **typed Evidence Ledger**. It is the only shared state.

```
research/SKILL.md            whitepaper-writing/SKILL.md        consulting-slides/SKILL.md
     │                                  │                                  │
     ├─ Research Brief ─────────────────┤                                  │
     ├─ Ledger S1..Sn ──────────────────┼──────────────────────────────────┤
     └─ Limitations ────────────────────┴─ storyboard + title seq ─────────┘
```

**Orchestrator rules**
- Pass the **ledger**, not the research conversation.
- IDs are immutable. `S4` on a slide is `S4` in the brief.
- Downstream skills may not add evidence. They emit `[DATA NEEDED: …]`.
- Direction: research → whitepaper → slides. Slides may be built directly from research.
- A claim may be **downgraded** at a handoff, never upgraded. `ASSUMPTION` → `FACT` is a failed handoff.

Four worked workflows (research→whitepaper, research→deck, document→deck, deck review): `shared/workflows.md`.

---

## 6. Inputs the skills expect

None are mandatory; each has a documented fallback.

| Input | Used by | Fallback |
|---|---|---|
| Project + workstream (name, sprint, deliverable kind) | all | Skill emits a Context gaps line |
| `DeliverableTemplateKind` (`INITIAL_SLIDES` / `FINAL_SLIDES` / `INITIAL_WHITEPAPER` / `FINAL_WHITEPAPER`) | whitepaper, slides | Ask; default to FINAL conventions |
| Project brief / SOW scope | all | `[DATA NEEDED: project scope — …]` |
| Client call notes | research, whitepaper | `[DATA NEEDED: client priorities — …]` |
| Prior deliverable feedback | whitepaper | Not required |
| Slide template / brand rules | slides | `[TEMPLATE: confirm OTCR Slide Design 101]` |
| Deck text export (review / audit modes) | slides | Ask for it; without it, review is not possible |

`DeliverableTemplateKind` exists in the schema today. Project brief / SOW / call notes are Group 2's fields.

### 6.1 Deck text export shape (review and audit modes)

Review and audit modes accept a plain-text export, one record per slide:

| Field | Required | Notes |
|---|---|---|
| `number` | yes | Slide number, as shown to the author |
| `hidden` | yes | `true` / `false`. Set from the PowerPoint hide-slide state |
| `title` | yes | Slide title text. Required only for slides that are not skipped |
| `body` | yes | Body text, flattened. Required only for slides that are not skipped |
| `notes` | no | Speaker notes |
| `confidentiality` | no | Free-text tag, e.g. `CONFIDENTIAL`, `PROPRIETARY` |

Shape:

```
---
number: 4
hidden: false
title: Referral conversion drives the case
body: <flattened body text>
notes: <speaker notes>
confidentiality: <tag or empty>
```

**Filtered input.** Hidden and confidential slides are dropped upstream, before the model call. For a slide that is hidden or confidential the loader sends only:

```
---
number: 12
hidden: true
skipped: true
```

No `title`, `body` or `notes` are sent for a skipped slide, and none are expected. Review and audit modes assume this upstream filtering; they do not perform it. The filter is open question 7 in §9.

Markers inside the text (`[HIDDEN]`, `[CONFIDENTIAL]`, `[PROPRIETARY]`) carry the same meaning as the fields. See `shared/otcr-quality-standards.md` §6.2 for the handling rule and its limits.

Markers are the fallback, not the primary control. They apply when upstream filtering failed or when the input is not a slide (for example a document or notes paste). With filtering working, marked content is dropped upstream and the model never sees it.

The text export carries no layout. Rendered layout, fonts, overflow and colour contrast stay out of scope (see `consulting-slides/references/deck-review.md` §7).

---

## 7. Design decisions worth not "fixing"

| Decision | Reason | Do not |
|---|---|---|
| Long, specific descriptions with negative triggers | Routing accuracy; a skill that never loads is worthless | Shorten to "Research helper" |
| "When not to use" tables | Prevents mis-routing between the three | Delete as obvious |
| Depth modes in research | A deep workflow on a definitional question is a failure | Remove as "extra" |
| Three jobs separated in slides | Blending argument and design is the main cause of bad decks | Merge into "make a deck" |
| Numeric thresholds (30% divergence, 15-word titles, ≤5 sentences) | Gives the model something checkable | Soften to "generally" |
| Fixed output contracts | Prevents coherence regression; reviewable | Make sections optional |
| `[DATA NEEDED: …]` notation | Anti-fabrication mechanism, visible to the reviewer | Let it be silently dropped |
| No framework catalogues | The model already knows SWOT, Porter, 3Cs | Add "frameworks to consider" |
| No scripts | Nothing to install, nothing to sandbox | Add a script without an owner |

---

## 8. Status

| Item | Status |
|---|---|
| Three skills written | ✅ complete |
| Structural validation (frontmatter, paths, tables) | ✅ complete — see §8.1 |
| Loader compatibility test | ⬜ **not possible** — no loader exists yet |
| Baseline vs skill evaluation | ✅ **Executed** — held-out: research PASS; whitepaper and slides lose to a format-matched control on claim labelling; all beat the plain baseline. Format conventions + skill combined ranked first 9/12 on a fresh held-out set (research and slides PASS; whitepaper over word limit). Deploy them together (Group 3 test report `testing/baseline-vs-skill-results.md` §0b, §0c; kept in the Group 3 workspace, not in this repo) |
| Activation/triggering tests | ⬜ **designed, not run** (Group 3 workspace: `testing/activation-tests.md`) |
| Human review (LC/PM) | ⬜ pending |
| Version | `0.1.0` = drafted, untested. `0.2.0` = changed after testing. `1.0.0` = passed evaluation + LC review |

Do not present `0.1.0` as validated. It has not been run.

### 8.1 Validation performed (2026-11-03)

| Check | Result |
|---|---|
| Frontmatter | 3/3 `SKILL.md` — required keys present |
| Relative links | 0 broken (every link resolved against the filesystem) |
| Table structure | 0 inconsistent column counts |
| `SKILL.md` length | 270 / 268 / 290 lines (target ≤300) |
| Tables per `SKILL.md` | 9 / 9 / 10 (ceiling 10) |
| Scripts, packages, network calls | 0 |
| Secret scan | no keys, tokens, or client-identifying data |
| Loader test | **not possible** — no loader exists |

**Method:** a local script resolved every relative Markdown link, checked frontmatter keys, and compared column counts within each table block; line and table counts were measured directly. `skills-ref validate` was not available in this environment, so this is its manual equivalent — it validates structure, not behaviour.

---

## 9. Open questions for Group 1

1. **Selection:** loader-chosen or agent-chosen? If the loader chooses, we should tune descriptions against real routing decisions.
2. **Reference support:** can the loader attach `references/` alongside `SKILL.md`, or is it one file only? This determines whether we invest in the depth layer.
3. **Persistence:** is a skill re-injected per turn or held for the conversation? Affects token cost materially.
4. **Deliverable kind:** will `DeliverableTemplateKind` be passed? It changes slide behaviour.
5. **Repo location:** `skills/<name>/SKILL.md` at repo root, or under the API module? We assume root-level `skills/`.
6. **Version surface:** does the bot report which skill version produced an output? Recommended for review traceability.
7. **Loader-side content filtering:** the loader or document tool must **drop hidden and confidential slides before any text reaches the model**. A skill instruction cannot stop a model from seeing what is sent to it; the filter has to sit upstream of the prompt. Required for review and audit modes. (PM interview P1, 2026-11-05)
8. **No content-edit permission for review tools:** no review tool has permission to edit the content of Google Docs or PowerPoint files. A separate comment-only permission is allowed, per the SOW (review comments on Google Docs/PowerPoint). The skill has no write logic; the boundary has to be enforced in the tool. (PM interview P1, 2026-11-05)

Raise these at the Sunday integration meeting rather than guessing.

---

## 10. Integration instructions (copy-paste)

```
1. Copy skills/research, skills/whitepaper-writing, skills/consulting-slides
   into the repo at: <repo root>/skills/
2. Copy shared/ to: <repo root>/skills/shared/   (or wherever Group 2 hosts context docs)
3. Loader: read skills/<name>/SKILL.md as UTF-8 text.
4. Match the user's request against the `description` field; load at most one.
5. Prepend as:
      ## Loaded skill: <name> (v<version>)
      <contents of SKILL.md>
6. Optional: append files from skills/<name>/references/ under
      ## Reference: <filename>
7. Do not modify the text. Do not summarise it.
```

No build step, no dependency, no migration. It is Markdown.
