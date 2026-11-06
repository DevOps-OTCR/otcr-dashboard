# OTCR Quality Standards

The bar every artifact in this project is measured against. Shared by all three skills.

**Status:** proposed. Not yet reconciled with the official Project Excellence rubric or Slide Design 101 (see the Group 3 research note `otcr-internal-context.md` §6, kept in the Group 3 workspace). Treat as a working standard, not OTCR policy.

---

## 1. The ten tests

A deliverable is review-ready only when all ten hold.

| # | Test | Fails when |
|---|---|---|
| 1 | **Addresses the actual client problem** | It answers a tidier version of the question |
| 2 | **Aligned with SOW and workstream scope** | It drifts into adjacent questions nobody asked |
| 3 | **Traceable evidence** | A load-bearing claim cannot be followed to a source |
| 4 | **Analytical reasoning, not summary** | Findings are listed, not weighed |
| 5 | **Actionable insight** | The reader agrees and does nothing differently |
| 6 | **Coherent narrative** | Sections could be reordered without loss |
| 7 | **Business-audience clarity** | Requires specialist knowledge the client lacks |
| 8 | **Missing/conflicting context surfaced** | Silence implies completeness |
| 9 | **No fabrication** | A number, source, or quote exists that should not |
| 10 | **Ready for human LC/PM review** | A reviewer must first reconstruct the argument |

---

## 2. The hardest test

> A technically correct answer can still be a poor consulting deliverable.

Correctness is necessary, not sufficient. The question is always: **does this change what the client does?**

If the deliverable would survive being filed and never read, it has failed test 5 regardless of its accuracy.

---

## 3. Review-comment format (SOW requirement)

Every review comment must contain three things:

| Element | Question it answers | Bad | Good |
|---|---|---|---|
| **Issue** | What is wrong? | "This section is weak" | "The recommendation assumes 15% referral conversion with no evidence" |
| **Significance** | Why does it matter? | "It's important" | "The kill criterion is the only thing making this a bounded experiment; without it the board is approving an open-ended build" |
| **Improvement** | What would fix it? | "Strengthen this" | "Cite the conversion rate from the two pilot referral agreements, or restate the threshold as a hypothesis to be set after Phase 1" |

Severity, so a consultant can triage:

| Severity | Meaning | Action |
|---|---|---|
| **Blocking** | Fabrication, wrong conclusion, out-of-scope work | Must fix before submission |
| **Material** | Weak evidence, missing mechanism, broken narrative | Should fix before client delivery |
| **Minor** | Clarity, formatting, redundancy | Fix if time allows |

---

## 4. Artifact-specific gates

| Artifact | Non-negotiable | Reference |
|---|---|---|
| Research brief | Scope contracted; contradictory evidence diagnosed; gaps specific | `skills/research/SKILL.md` §9 |
| Whitepaper | Falsifiable thesis; every recommendation has a mechanism; no claim laundering | `skills/whitepaper-writing/SKILL.md` §8 |
| Storyboard | Title-only read works; one message per slide; source on every exhibit | `skills/consulting-slides/SKILL.md` §9 |

---

## 5. Language standards

**Use:** "we recommend", "the evidence suggests", "this assumes", "we could not establish".
**Avoid:** "it is clear that", "studies show" (which studies?), "best-in-class", "leverage synergies", "robust framework", "holistic approach".

Three tests for any sentence:

1. **Specificity** — would it survive unchanged in another client's document? If yes, cut or sharpen it.
2. **Falsifiability** — could someone disagree? A sentence nobody can disagree with carries no information.
3. **Necessity** — if deleted, does the reader lose anything? If not, delete it.

---

## 6. Authority boundaries

| The assistant may | The assistant may **not** |
|---|---|
| Draft, structure, critique, cite, compute | Approve a deliverable |
| Flag missing context | Invent context |
| Recommend with stated confidence | Present a recommendation as a decision |
| Produce review comments, posted with a comment-only permission | Edit the content of client documents (Release 1) |
| Propose a storyline | Choose the client-facing message without LC/PM review |

**Skills grant no permissions.** They contain no access logic, no role checks, and no write capability. Authorisation lives in the CMS, not in a Markdown file.

### 6.1 Review-only contract

In review and audit modes the skill **never returns an edited or rewritten artifact**. It returns findings only.

| The skill does | The skill does not |
|---|---|
| Return a checklist of likely problems, severity-ranked | Return a fixed deck, document or draft |
| Suggest a fix of **at most one sentence** per finding | Write replacement paragraphs or slides |
| Hand the decision to the PM or consultant | Apply its own suggestion |

The human applies every fix. There is no auto-apply path, in any mode.

Source: PM interview P1, 2026-11-05.

### 6.2 Confidential and hidden content

Content marked hidden or confidential **must not be read for findings, quoted, summarised, or used as evidence**. This covers:

| Marker | Where it appears |
|---|---|
| `hidden: true` on a slide | Deck text export |
| `[HIDDEN]` in the exported slide text | Deck text export |
| `[CONFIDENTIAL]` | Any input |
| `[PROPRIETARY]` | Any input |

The output lists only: `Slide N skipped (hidden/confidential)`. No title, no body, no notes. For non-slide inputs (documents, notes) output: `Section/item <id> skipped (confidential)`.

**Honest limit.** An instruction in a skill file cannot stop a model from seeing text that is sent to it. Skill text is a second line of defence, not the protection. The real protection is that **the loader or document tooling strips hidden and confidential slides before the model call**. If the stripped text never enters the prompt, no instruction is needed. If it does enter the prompt, this rule reduces the chance it appears in the output — it cannot undo the exposure.

Source: PM interview P1, 2026-11-05.

---

## 7. What "good" looks like, in one line each

- **Research:** "Here is what the evidence supports, what it does not, and what that means for your decision."
- **Whitepaper:** "Here is what we recommend, why, what it costs, and what would make us wrong."
- **Slides:** "Here is the argument, in order, with one claim per page and the evidence underneath."

If an artifact cannot be summarised that way by its own author, it is not finished.
