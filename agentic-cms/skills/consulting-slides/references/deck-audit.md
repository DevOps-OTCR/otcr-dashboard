# Deck audit — the PM's final pre-send check (v0.3.0)

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
| Output | Severity-ranked findings | Tick-box checklist |
| Unit | The argument | The slide |
| Question | Is this right? | Is this safe to send? |

If the deck still needs an argument critique, say so in one line and point to `deck-review.md`. Audit does not substitute for review.

## 3. Input shape

Per slide: number, hidden flag, title, body, notes. Optional: `footer_page`, `layout` (for example `title_bold`, box positions).

Accept JSON or the README §6.1 shape. If `layout` is absent, skip the visual checks and say so under Limits. Do not guess a layout.

## 4. Skip rule

Hidden or confidential slides are never read, quoted or summarised (`shared/otcr-quality-standards.md` §6.2). List them only:

```
Slide 5 skipped (hidden/confidential)
```

## 5. Pass 1 — mechanics

- [ ] Spelling and grammar
- [ ] Page numbers run in sequence; footer page numbers match
- [ ] Bolding is consistent
- [ ] Box consistency and alignment — only where layout data is present
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

Five to eight questions the client is likely to ask. Each is tied to a slide, with a readiness note.

Format: `Ready: presenter of slide N`.

## 8. Output template

```
# Deck audit — <name> — <date>

## Skipped slides
Slide N skipped (hidden/confidential)

## Mechanics
- [ ] Slide N — issue — why it matters — suggested fix (one sentence)
- [ ] ...

## Big picture
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
- Every item cites a slide.
- Quote at most 12 words of the original.
- Never invent a typo. If unsure, leave it out.
- Style preferences are not errors.
- Visual checks only from layout data actually present.

## 10. Worked example

Synthetic deck, fictional client. Six slides; slide 5 is hidden and never read. Numbers illustrative.

```
# Deck audit — Northwind Bikes board deck — 2026-11-04

## Skipped slides
Slide 5 skipped (hidden/confidential)

## Mechanics
- [ ] Slide 3 — footer shows 4 — page numbers will not match printed packs — renumber to match slide order
- [ ] Slide 6 — "see slide 9" — slide 9 does not exist — point to a slide in 1–6 or delete the reference
- [ ] Slide 2 — "€12M" vs slide 4 "€12.4M" — two values for the same market size — fix one figure and use it everywhere
- [ ] Slide 3 — "1st Jan 2027" — date format differs from the rest of the deck — use the deck's format throughout
- [ ] Slide 1 — title not bold while other slide titles are — bolding is inconsistent — bold the title to match

## Big picture
- [ ] Slide 6 — roadmap lists Q3 2026 before Q1 2026 — chronology reads backwards — reorder into date order
- [ ] Slide 2 vs slide 6 — exec summary names three priorities, body names four — mismatch will be noticed — align the two
- [ ] Slide 4 — "€2M retrofit cost" — no owner or timeline — board cannot approve without these — add owner and dates

## Likely audience questions
- [ ] Q: What happens to the pilot if the grant does not land? — not addressed — add a fallback line (Ready: presenter of slide 4)
- [ ] Q: Who signs off the €2M? — no owner named — name the accountable executive (Ready: presenter of slide 4)

## Not checkable from this input
Only title_bold was supplied as layout data, so box consistency and alignment were not checked.

## Summary
10 items: 5 mechanics, 3 big picture, 2 questions.
```

## 11. Limits

| Limit | Detail |
|---|---|
| Text export carries no rendering | Fonts, colour, overflow and truncation cannot be seen |
| The skill cannot enforce skipping | The loader must strip hidden slides before the model call (§6.2) |
| Not LC-validated | This checklist is a working draft, not OTCR policy |
