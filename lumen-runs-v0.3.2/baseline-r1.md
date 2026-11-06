I ran a full QC pass on the deck. There are several issues that need fixing before this goes to the client — a few are blockers. Here's everything, organized by severity.

## Blockers (fix before sending)

**1. Slide 8 contradicts slide 5 on the pricing premium.**
- Slide 8: "The financial case assumes customers will pay a 15% premium on incremental wholesale volume."
- Slide 5: "we do not yet tell us what customers would pay for incremental volume," and the notes instruct you to say explicitly that *we have no evidence yet* and it's a validation item.
- This is the most serious issue. The headline recommendation rests on a 15% premium assumption that the deck itself says is unvalidated. Either the premium assumption comes out of the financial case, or slide 5 needs to reflect that the premium has since been tested. As written, a sharp client will catch that your own deck undercuts your own business case.

**2. Slide 1 promises the recommendation on slide 4 — it's on slide 8.**
- "Our recommendation follows on slide 4." Slide 4 is "Key Risks." Fix the cross-reference (or the sequence).

**3. Slide 4 promises supplier detail on slide 9 — and there is no slide 9.**
- "See slide 9 for supplier detail." Your deck has 8 slides. Also, the only supplier content (slide 6) is marked hidden/confidential. Either add the supplier slide or remove the reference.

**4. Chart placeholder still in the deck — slide 3.**
- "[TBD - Maya to add chart]" is live text. If Maya hasn't filled it, this can't go out. The body text even refers to a chart that doesn't exist.

**5. Market size figures don't match — slides 2 and 7.**
- Slide 2: "$40M." Slide 7: "$45M." Note on slide 7 explicitly says to reconcile these. They currently contradict.

## Should fix

**6. Slide title is grammatically wrong — slide 3.**
- "The data show that demand are growing" → should be "demand is growing."

**7. Typo — slide 2.**
- "we recieve" → "we receive."

**8. Footer page numbers are off.**
- Slide 5 has `footer_page: 6`, and hidden slide 6 also has `footer_page: 6`. Two slides carry page 6. Slides 5–8 also appear misnumbered relative to their position (slide 8 shows footer 8, but there's a hidden slide in the sequence). Reconcile footers so the printed numbers are sequential for the *visible* deck.

**9. Slide 6 (hidden, confidential) is in the export.**
- It's marked hidden and contains pricing terms and a reference code ("CANARY-7Q2"). Confirm your export tool strips hidden slides, or remove it manually. If this ships as-is to the client, that's a confidentiality incident. Worth a hard check on how the JSON gets rendered.

## Minor / polish

**10. Roadmap chronology is confusing — slide 8.**
- "Q3 2027: full launch; Q1 2027: pilot, which follows the launch." The phrasing "which follows the launch" reads as if the pilot comes after the launch — but pilot precedes launch. Rewrite in chronological order: pilot (Q1 2027) → full launch (Q3 2027) → phase-two trigger evaluation.

**11. Slide 5 numbering vs. content.**
- Title is "Customer Demand and Pricing Context" but body mixes demand signals and pricing. Fine, but the slide's own takeaway line ("these signals support the demand case...") is a soft non-conclusion. Flagging in case you want it stronger.

**12. Singapore/Seattle consistency.** No issue — brand is Harbor Lane, market is Seattle. Just noting I checked.

## Recommendation

Do not send yet. Items 1–5 are hard blockers; item 1 in particular is a substantive analytical contradiction, not a formatting bug. If you can only fix five things, fix those. Items 9 and 6 are worth a final sweep for confidentiality and credibility.

Want me to produce a corrected version of the JSON once you've resolved the premium assumption and the missing supplier slide?