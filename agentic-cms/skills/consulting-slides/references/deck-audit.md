# Deck audit — the PM's final pre-send check (v0.3.0)

Optional depth. The operative audit rules are in `consulting-slides/SKILL.md`; if they differ, SKILL.md wins.

The PM's last pass before a deck goes to the client. Assembled by consultants, checked once, sent. Audit is a tick-box job: mechanics, big picture, and the questions the client is likely to ask.

## 1. Purpose and triggers

Run this skill when the user says:

- "final check"
- "QA this deck before it goes out"
- "proofread the deck"

The deck is finished in substance. The user is not asking for an argument critique. They are asking what would embarrass them.

## 2. How audit differs from review

| | `deck-review.md` | This file |
|---|---|---|
| Job | Argument critique | Mechanics + big picture + likely questions |
| Output | Severity-ranked findings (BLOCKING / MATERIAL / MINOR) | Tick-box checklist (MUST FIX / SHOULD FIX / CHECK) |
| Unit | The argument | The slide |
| Question | Is this right? | Is this safe to send? |

If the deck still needs an argument critique, say so in one line and point to `deck-review.md`. Audit does not substitute for review.

## 3. Input shape

Per slide: number, hidden flag, title, body, notes. Optional: `footer_page`, `layout` (for example `title_bold`, box positions).

Skipped slides arrive as metadata only: `{number, hidden: true, skipped: true}`, with no title, body or notes (README §3a (Review-input contract)). List them from that metadata.

Accept JSON or the README §3a (Review-input contract) shape. If `layout` is absent, skip the visual checks and report that under 'Not checkable from this input'. Do not guess a layout. If `footer_page` is absent, the footer comparison is not checkable: put it under 'Not checkable from this input' and never infer it.

## 4. Skip rule

Hidden or confidential slides are never read, quoted or summarised (`shared/otcr-quality-standards.md` §6.2). List them only:

```
Slide 5
```

The operative copy of this rule is in consulting-slides/SKILL.md (Review mode); the backend filter is the enforcement point.

## 5. Pass 1 — mechanics

Each item carries a severity tag: 'MUST FIX' (wrong or embarrassing in front of the client), 'SHOULD FIX', or 'CHECK' (possible issue, human judgement). Order items within each section MUST FIX first.

- [ ] Spelling and grammar
- [ ] Page numbers run in sequence; footer page numbers match — only where `footer_page` is present
- [ ] Bolding is consistent
- [ ] Box alignment: when boxes carry left_in (and width_in), compare left edges across visible slides; a box whose left edge differs from the deck's usual edge is a SHOULD FIX alignment finding citing the slide and both values. Only when no box positions are supplied does alignment go under Not checkable.
- [ ] Odd wording (wrong preposition, half-finished sentence)
- [ ] Cross-references ("see slide 7") point to something real
- [ ] The same metric carries the same value on every slide
- [ ] Units and date formats are consistent
- [ ] No leftover placeholders or notes-to-self

## 6. Pass 2 — big picture

- [ ] Storyline reads in order, including chronology (roadmap dates not out of order)
- [ ] No unexplained gap between consecutive slides
- [ ] Executive summary matches the body
- [ ] Recommendation has no loopholes: a risk flagged earlier is addressed, an assumption carries evidence, owner, timeline and cost are present

## 7. Pass 3 — likely audience questions

Five to eight questions the client is likely to ask, fewer if the deck supports fewer. Every question must be grounded in a specific claim, assumption or gap on a visible slide — name it. Never invent a premise the deck does not show. Each question is tied to a slide, with a readiness note.

Format: `Ready: presenter of slide N`.

## 8. Output template

```
# Deck audit — <name> — <date>

## Skipped slides
Slide N

## Mechanics
- [ ] Slide N — MUST FIX — issue — why it matters — suggested fix (one sentence)
- [ ] ...

## Big picture
- [ ] Slide N — MUST FIX — issue — why it matters — suggested fix (one sentence)
- [ ] ...

## Likely audience questions
- [ ] Q: ... (Ready: presenter of slide N)

## Not checkable from this input
...

## Summary
n items: n mechanics, n big picture, n questions.
```

## 9. Rules

- No rewritten deck (`shared/otcr-quality-standards.md` §6.1). Findings only. One sentence per fix.
- At most 25 items.
- Every item cites a slide. A finding that spans slides cites every affected slide ('Slides 2 and 4 — …').
- Quote at most 12 words of the original.
- Never invent a typo. If unsure, leave it out.
- Style preferences are not errors.
- Visual checks only from layout data actually present.

## 10. Worked example

Synthetic deck, fictional client. Six slides; slide 5 is hidden and never read. Numbers illustrative.

```
# Deck audit — Northwind Bikes board deck — 2026-11-04

## Skipped slides
Slide 5

## Mechanics
- [ ] Slide 6 — MUST FIX — "see slide 9" — slide 9 does not exist — point to a slide in 1–6 or delete the reference
- [ ] Slides 2 and 4 — MUST FIX — "€12M" vs "€12.4M" — two values for the same market size — fix one figure and use it everywhere
- [ ] Slide 3 — SHOULD FIX — footer shows 4 — page numbers will not match printed packs — renumber to match slide order
- [ ] Slide 3 — SHOULD FIX — "1st Jan 2027" — date format differs from the rest of the deck — use the deck's format throughout
- [ ] Slide 1 — CHECK — title not bold while other slide titles are — bolding is inconsistent — bold the title to match

## Big picture
- [ ] Slide 6 — MUST FIX — roadmap lists Q3 2026 before Q1 2026 — chronology reads backwards — reorder into date order
- [ ] Slides 2 and 6 — MUST FIX — exec summary names three priorities, body names four — mismatch will be noticed — align the two
- [ ] Slide 4 — SHOULD FIX — "€2M retrofit cost" — no owner or timeline — board cannot approve without these — add owner and dates

## Likely audience questions
- [ ] Q: Who signs off the €2M on slide 4? — no owner named — name the accountable executive (Ready: presenter of slide 4)
- [ ] Q: How is the €2M retrofit cost phased? — slide 4 shows no timeline — add milestone dates (Ready: presenter of slide 4)

## Not checkable from this input
Only title_bold was supplied as layout data, so box consistency and alignment were not checked.

## Summary
10 items: 5 mechanics, 3 big picture, 2 questions.
```

## 11. Limits

| Limit | Detail |
|---|---|
| Text export carries no rendering | Fonts, colour, overflow and truncation cannot be seen |
| The skill cannot enforce skipping | The loader must strip hidden and confidential slide content before the model call (§6.2) |
| Not LC-validated | This checklist is a working draft, not OTCR policy |
