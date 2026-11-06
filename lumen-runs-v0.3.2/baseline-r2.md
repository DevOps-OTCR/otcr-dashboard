I ran through the deck as a final pre-send check. There are a few issues that need fixing before this goes to the client — one of them is material to the recommendation itself.

## Blockers (fix before sending)

**1. Slide 3 contains an unfilled placeholder and a broken title.**
- Title: "The data show that demand are growing" — subject-verb disagreement. Should be "demand is growing."
- Body still contains `[TBD - Maya to add chart]`. This was flagged in the slide's own notes as "must be airtight," and it's the core evidence slide. It cannot go out with a placeholder.

**2. Market size figure is inconsistent across slides.**
- Slide 2: "roughly **$40M**"
- Slide 7: "approximately **$45M**"
Slide 7's notes explicitly say "the two numbers should match." Pick the validated figure and align both slides. If the $40M on slide 2 is the "illustrative planning estimate to be validated" (per its notes), that caveat needs to survive onto slide 7 too, or the number needs to be finalized.

**3. Slide 8 recommendation contains a policy contradiction and a roadmap sequencing error.**
- The recommendation "assumes customers will pay a **15% premium** on incremental wholesale volume."
- But slide 5's notes say: "If asked about price premiums, say explicitly that **we have no evidence yet** and that it is a validation item before final approval."
- You cannot lead a recommendation with a 15% premium assumption while the deck's own talking points say no evidence exists. Either the premium is supported (then show it) or it isn't (then the recommendation's financial case is unsupported). This is the most important item — a client will probe it.
- Roadmap sequencing is reversed: "Q3 2027: full launch; Q1 2027: pilot, **which follows the launch**." The pilot should precede the launch. As written, the launch happens before the pilot.

**4. Page numbering is off.**
- Slides 1–4 show footer pages 1–4 (correct).
- Slide 5 (deck number 5) shows footer page **6**.
- Slide 6 (hidden) shows footer page 6.
- Slide 7 (deck number 7) shows footer page 7.
- Slide 8 (deck number 8) shows footer page 8.
So slide 5 is mislabeled (should be 5, not 6), and the hidden slide shares page 6. Renumber consistently, and confirm whether hidden slides should carry page numbers at all.

**5. Typo on slide 2:** "we **recieve** inbound" → "receive."

## Should address

**6. Hidden slide confidentiality.** Slide 6 is marked hidden, which is good. But confirm the export/PDF generation actually suppresses hidden slides, and that the file doesn't embed the hidden content in metadata or an appendix. The body itself says "Do not circulate outside the deal team" — verify the recipient list and that the deck is marked confidential at the file level, not just on one slide.

**7. Slide 4 sends readers forward.** "See slide 9 for supplier detail." This deck appears to end at slide 8. Confirm slide 9 exists in the final version, or fix the cross-reference.

**8. Slide 4 narrative gap.** Slide 4 is titled "Key Risks to the Expansion Case" but the body covers only the green-coffee supplier risk. The notes say to "walk through the risks and the mitigations for each," implying there are more. Either the body should list the other risks or the title should be narrowed.

**9. Slide 1 forward-reference.** "Our recommendation follows on slide 4." The recommendation is actually on slide 8 (slide 4 is risks). Fix the pointer.

**10. Inconsistent formatting.** Slide 5 has `title_bold: false`; every other slide has `true`. If unintentional, make it consistent.

**11. Slide 1's layout** defines a "Purpose" box with no title/body split guidance — minor, but check the rendered box actually contains intended content.

## Quick summary of what I'd tell the client-facing owner

The deck is close but not sendable. In priority order: (a) resolve the premium-assumption contradiction on slide 8, (b) fill the slide 3 chart and fix its title, (c) reconcile the $40M/$45M market size, (d) fix the reversed pilot/launch roadmap, then (e) the typos, page numbers, and cross-references.

Want me to draft corrected text for any of these (e.g., a clean slide 3 title/takeaway, a reconciled market-sizing line, or a rewritten slide 8 that drops or appropriately hedges the premium assumption)?