# Deck Review Protocol

Reviewing a deck is a different job from building one. You are diagnosing, not rewriting.

**Output: severity-ranked findings. Never a rebuilt deck unless the user asks for one.**

---

## 1. Three passes

### Pass 1 — titles only
Read the slide titles in order, ignoring everything else.

| Finding | Severity |
|---|---|
| Titles read as a coherent argument | Pass |
| Titles are topics ("Market overview") | BLOCKING — the argument does not exist |
| The argument has a gap between two titles | MATERIAL — missing link |
| The recommendation appears only at the end | MATERIAL — placement problem |
| Titles repeat the same claim | MATERIAL — redundant slides |

This pass catches most serious problems in under two minutes. Do it first, and do not be distracted by design.

### Pass 2 — ghost deck
Remove the exhibits mentally. Does the argument still stand?

- If yes: exhibits support a real argument.
- If no: the deck is a data tour, and the storyline must be rebuilt.

### Pass 3 — full review
Now examine each slide: message, exhibit, evidence, layout specification.

---

## 2. Severity calibration

| Severity | Test | Examples |
|---|---|---|
| **BLOCKING** | Would cause the client to reject the deck or lose confidence | No recommendation; fabricated or unsourced central number; central claim contradicted by the appendix; titles all topics |
| **MATERIAL** | Weakens the argument or invites a challenge | Two messages on one slide; wrong chart type; no kill criteria; claim in body absent from appendix; recommendation with no mechanism |
| **MINOR** | Polish; fix if time allows | Inconsistent terminology; redundant slide; stale date in a footnote; two accent colours |

**Calibration rule:** if you have more than ~5 BLOCKING findings, the deck needs restructuring, not a review list. Say that in one line, and give the top 5.

---

## 3. What to check

### Argument
- [ ] Governing thought is a claim, stated once
- [ ] Titles alone form a coherent argument
- [ ] Sections are MECE
- [ ] Recommendation appears where the audience needs it
- [ ] Strongest objection is addressed
- [ ] Ask is explicit

### Evidence
- [ ] Every exhibit has a source line and an S-ID
- [ ] No number appears that the appendix cannot support
- [ ] Single-source claims are flagged
- [ ] Estimates show a range and a basis
- [ ] No claim typed above its evidence

### Slides
- [ ] One message per slide
- [ ] Action title, not a label
- [ ] Chart matches the message
- [ ] Axes labelled, units stated
- [ ] Density within limits
- [ ] No fabricated data filling a gap

### Coherence
- [ ] Same number everywhere
- [ ] Same term for the same concept
- [ ] Executive summary matches the body
- [ ] Appendix maps to specific slides
- [ ] Length fits the time slot

---

## 4. Output template

```
# Deck review — <name> — <date>

Verdict: SHIP | FIX FIRST | RESTRUCTURE
One-line diagnosis: <the single biggest problem>

## BLOCKING (n)
1. Slide 4 — <issue>
   Significance: <why it matters to the decision>
   Fix: <specific action>

## MATERIAL (n)
...

## MINOR (n)
...

## What is working
<2–3 things, specifically — this is not politeness, it prevents the reviewer
from "fixing" the strongest part of the deck>

## Not assessed
Rendered layout, fonts, overflow, colour contrast — not inspectable from the
file supplied / outside Release 1 scope.
```

---

## 5. Worked findings

**Finding 1 — BLOCKING**
> Slide 2 asserts "the market is €2.4B" with no source and no definition.
> Significance: it is the denominator for every sizing slide that follows; if a reviewer challenges it, the whole deck falls.
> Fix: cite the publisher and period, define the segment, or replace with the bottom-up range (S4–S9).

**Finding 2 — MATERIAL**
> Slides 6–9 each contain two distinct messages (market structure and competitor response).
> Significance: the audience will remember neither; the section reads as a data tour.
> Fix: split into two sections with one message each, or move competitor response to a single comparison slide.

**Finding 3 — MINOR**
> "Mid-market" is defined three different ways across slides 3, 7, and 11.
> Significance: a careful reader will notice, and it undermines the sizing.
> Fix: fix one definition (50–500 employees, EU-27) and apply it everywhere.

---

## 6. Review discipline

| Do | Don't |
|---|---|
| Rank by consequence | Produce a 40-item list |
| Separate critical from optional | Treat every issue as equally important |
| Say what is working | Rewrite the deck unasked |
| Give a specific fix | Say "strengthen this" |
| State what you could not assess | Imply visual QA was performed |
| Judge against the audience's decision | Judge against personal taste |

**Taste is not a finding.** "I would use fewer colours" is not a review comment unless it affects comprehension or credibility.

Review-only contract: findings only, fixes of at most one sentence, no edited artifact (`shared/otcr-quality-standards.md` §6.1). Hidden and confidential slides are skipped, never read or quoted (§6.2).

---

## 7. Limits in Release 1

| Not possible | Why | What to say |
|---|---|---|
| Rendered-output inspection | No file rendering | "Layout not assessed" |
| Overflow / truncation detection | No renderer | Ask the author to check |
| Font and colour compliance | No template file | `[TEMPLATE: confirm OTCR Slide Design 101]` |
| Edit the deck | No write access in R1 | Deliver findings for the consultant to apply |
| Verify a figure against its source | No tool access to the source | Mark `UNVERIFIED` and name the claim |

Being explicit about these limits is part of the review, not a disclaimer to bury.
