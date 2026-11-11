# Workflows

Four real usage patterns, and exactly which skill runs when. The loader must not run two skills at once — see §5.

---

## A. Research → whitepaper

**Request:** "We need a market landscape and a recommendation for the board."

```
Turn 1   research          → Research Brief + Evidence Ledger S1..Sn
Turn 2   whitepaper-writing → outline (gate)
Turn 3   whitepaper-writing → draft, citing S1..Sn only
```

| | |
|---|---|
| Skills loaded | `research`, then `whitepaper-writing` |
| Passed forward | Brief §2 takeaway, findings, **ledger**, limitations |
| Must not | The whitepaper introducing evidence not in the ledger |
| Gate | Outline approval before drafting (documents > ~1,500 words) |

---

## B. Research → presentation

**Request:** "Build a competitive positioning deck."

```
Turn 1   research           → Brief + ledger
Turn 2   consulting-slides  → storyline + title sequence (gate)
Turn 3   consulting-slides  → full storyboard
```

| | |
|---|---|
| Skills loaded | `research`, then `consulting-slides` |
| Passed forward | Thesis or governing thought, 3–5 supporting claims, ledger, contradictions |
| Must not | Slides carrying numbers absent from the ledger |
| Gate | Title-sequence check before exhibit specification |

**Note:** a deck built directly from research is normal — a whitepaper is not a prerequisite.

---

## C. Existing whitepaper → presentation

**Request:** "Turn this report into a 10-slide deck."

```
Turn 1   consulting-slides → extract argument from the supplied document
Turn 2   consulting-slides → storyline + storyboard
```

| | |
|---|---|
| Skills loaded | `consulting-slides` only |
| Must not | Re-running research. The report is the evidence base. |
| Required | Reconstruct the ledger from the document's citations; mark any claim the report asserts without support as `[UNSOURCED IN SOURCE DOC]` |
| Risk | The report's section order is not a storyline. Sections ≠ slides. Rebuild the argument; do not map sections to slides one-to-one. |

**The most common failure here** is producing a deck that mirrors the document's table of contents. A 10-section report does not become a 10-slide deck. It becomes a 3-section argument.

---

## D. Existing deck review

**Request:** "Review this deck before I send it."

```
Turn 1   consulting-slides (review mode) → findings, severity-ranked
```

| | |
|---|---|
| Skills loaded | `consulting-slides` (review mode — `references/deck-review.md`) |
| Output | Blocking / material / minor findings, each with issue + significance + fix |
| Must not | Rebuilding the deck. Review reports; it does not rewrite. |
| Required | Separate "critical problem" from "optional improvement" — a 40-item list is not a review |

**Note:** rendered-output inspection (fonts, overflow, alignment) is **not** a Release 1 capability. Review content, structure, and titles only; say so explicitly.

---

## 5. Composition rules for the loader

| Rule | Why |
|---|---|
| One skill per turn | Two skills produce blended, hedged output; coherence degrades as instructions accumulate |
| Research before writing/decking, never after | Otherwise the argument is written first and evidence is retrofitted |
| Pass the ledger, not the chat history | Context cost, and chat history contains abandoned reasoning |
| Re-inject on each turn if the runtime does not persist skills | Assume stateless until Group 1 confirms otherwise |
| Route by artifact, not by verb | "Write" could be a document or a deck; ask which deliverable |

### Routing decision

```
Is the task asking for internal CMS facts?        → no skill (tool call)
Does it need evidence we do not yet have?         → research
Is the deliverable a document/report/memo?        → whitepaper-writing
Is the deliverable a deck or storyline?
   ├─ reviewing an existing deck?                 → consulting-slides (review mode)
   └─ producing a new one?                        → consulting-slides
Otherwise                                         → no skill
```

---

## 6. Token and latency notes

| Workflow | Typical skill tokens | Turns | Watch |
|---|---|---|---|
| A | 2 skills, ~9–11k input | 3 | Re-sending research at draft time is the main cost |
| B | 2 skills, ~8–10k | 3 | Exhibit specs are verbose; keep them tabular |
| C | 1 skill, ~4k | 2 | Extracting the ledger from the source doc is the slow step |
| D | 1 skill, ~4k | 1 | Review output must be severity-ranked, not exhaustive |

Skills are ~250–330 lines each. Two loaded at once is a real cost; one is the design point.
