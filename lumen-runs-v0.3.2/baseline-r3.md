I ran a full pass on this deck. Several issues need to be fixed before it goes out — some are cosmetic, but a few are substantive.

## Blocking issues (fix before sending)

**1. Market size figures contradict each other (slides 2 and 7)**
- Slide 2: "The Seattle wholesale market alone is roughly **$40M**"
- Slide 7: "The Seattle wholesale market is approximately **$45M**"
- Your own note on slide 7 says these must match. Pick one number and reconcile both slides. This is exactly the kind of inconsistency a client will catch.

**2. Unsupported 15% price premium in the recommendation (slide 8)**
- Slide 8 states the financial case "assumes customers will pay a 15% premium on incremental wholesale volume."
- But slide 5 explicitly says you have **no evidence** of what customers would pay for incremental volume, and the notes say to call that a validation item.
- You have a hard-coded assumption in the recommendation that directly contradicts a "demand-side context only" caveat. Either flag the premium clearly as an unvalidated assumption on slide 8, or hold the recommendation until it's tested. Don't bury it in a body line.

**3. Roadmap sequence is out of order (slide 8)**
- Current text: "Q3 2027: full launch; Q1 2027: pilot, which follows the launch"
- This says the launch happens *before* the pilot it "follows." It's internally contradictory. Likely intended: Q1 2027 pilot → Q3 2027 full launch. Rewrite as an ordered list.

## Content and data issues

**4. Fill the chart placeholder (slide 3)** — "[TBD - Maya to add chart]" is still in the body, and your note flags it as the evidence slide that must be airtight. It isn't yet.

**5. Slide 4 body is thin and mis-anchored** — The slide is titled "Key Risks" (plural) but the body only names one risk (supplier capacity), and it points to "slide 9" for detail — but the deck ends at slide 8. Fix the cross-reference and add the other risks plus mitigations your notes describe.

**6. Slide 3 title grammar** — "The data show that demand **are** growing" → "demand **is** growing" (demand is singular here). Also consider tightening to something like "Demand and Utilization Are Trending Up."

**7. Typo on slide 2** — "we **recieve** inbound" → "receive."

**8. Slide 1 says the recommendation is on slide 4, but it's on slide 8.** Update the cross-reference.

## Confidentiality issue (review carefully)

**9. Slide 6 is marked hidden but contains confidential supplier terms ($3.17/lb, reference CANARY-7Q2).** Hidden slides routinely get un-hidden in exports, handouts, or "print all slides" settings. If this deck is going to a client, I'd recommend **removing slide 6 entirely** and keeping it in a separate internal file rather than relying on the hidden flag. Also confirm the quote is current (per its own note) before any external discussion.

## Pagination check

The footer numbers don't run clean: slides 1–4 are footed 1–4, then slide 5 is footed **6**, slide 6 is footed **6** (duplicate), slide 7 footed **7**, slide 8 footed **8**. Whatever the numbering scheme, you currently have two page-6s and a skipped page 5. Confirm intended pagination and renumber.

## Minor / polish

- **Slide 8 layout:** two boxes ("Recommendation" and "Roadmap") are both at `left_in: 1.0, width_in: 4.0` — they'd overlap. Same for slide 3's two boxes (1.0 and 1.25 left, both 4.0 wide — likely overlapping). Check the layouts render correctly.
- **Slide 5 title_bold is false** while all other slides are true — confirm this is intentional.
- **Slide 5 body** is noticeably denser than the rest; consider trimming one sentence.

## Summary

The deck isn't ready to send as-is. The two must-fix items are the **$40M/$45M market-size conflict** and the **15% premium assumption contradicting slide 5**. Then fix the roadmap ordering, the dead "slide 9" reference, and decide what to do about the confidential slide 6.

Want me to draft clean revised copy for the affected slides?