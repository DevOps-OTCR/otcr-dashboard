# Example — Slide Storyboard

> **Synthetic example. Not a real client, not real data.**
> Continues the Meridian Freight Systems scenario, reusing ledger IDs S1–S7.
> **Purpose:** show the storyboard contract, action-title discipline, and exhibit specification. No `.pptx` is produced — Release 1 stops at content.

---

## 1. Header

```
Deck:      Funding the compliance module — board decision
Audience:  CEO + board (7 people). Already accept that compliance is a topic; sceptical of new SKUs.
Ask:       Approve Phase 1 funding and two audit-firm partnership conversations
Time:      15 minutes, 10 minutes of discussion
Structure: Answer-first (pyramid) — the board is time-poor and the decision is binary
Governing thought:
           Fund a narrow audit-readiness module through audit-firm referrals — compliance filing
           will be bundled within two years, audit acceptance will not.
Budget:    10 body slides + 3 appendix
Deliverable kind: FINAL_SLIDES
```

---

## 2. Title sequence test

*Internal working (not part of the delivered output).*

Read only these. If they do not form a complete argument, the deck is broken. The delivered output follows the §7 contract and does not print this block.

```
#1   Meridian should fund an audit-readiness module, not a compliance product
#2   Regulation defines the buying population, so demand is countable rather than assumed
#3   The real incumbent is a manual audit scramble, not another vendor
#4   Comparable modules price at €18–30k — above the segment's software budget
#5   Pricing above budget is survivable only if the cost attaches to audit, not IT
#6   Suites will bundle filing within two years, which closes the filing-led route
#7   Audit acceptance is the asset suites cannot bundle
#8   Two audit-firm referrals reach the buyer we cannot reach directly
#9   Phase 1 costs one squad for two quarters and tests the only assumption that matters
#10  Stop if referral conversion is below 15% or auditors reject the export format
```

Grammar is parallel (declarative claims). No title is a topic. The recommendation lands on slide 1 and is *proven* by slides 2–9, then bounded by slide 10.

---

## 3. Storyboard

*Internal working (not part of the delivered output).* The slide-map table below is a working aid for the storyboard; the delivered output follows the §7 contract and prints slides only.

| Slide | Section | Takeaway title | Key message | Supporting content | Evidence | Visual | Layout | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Recommendation | Meridian should fund an audit-readiness module, not a compliance product | Decision, reason, condition — in 30 seconds | 3 reasons: countable demand, manual incumbent, bundling threat. Ask: approve Phase 1 | S1, S3, S5, S6 | Text, 3 blocks | Title + 3-column | Do not read the slide; say the ask, then the condition |
| 2 | Demand | Regulation defines the buying population, so demand is countable rather than assumed | Demand is structural, not a forecast | Applicability by size/sector; phased commencement; firm count from client base | S1, S2 | Nested boxes (scope → applicable → reachable) | Title + exhibit full-width | Annotate the reachable set, not the total |
| 3 | Current practice | The real incumbent is a manual audit scramble, not another vendor | We are replacing a process, not a product | 4 of 5 operators manual/periodic; auditor drives timing; evidence assembled late | S3 | Quote + implication | Title + quote + 3 bullets | Flag n=5 verbally — do not hide the sample size |
| 4 | Pricing | Comparable modules price at €18–30k — above the segment's software budget | The price point is the hinge of the decision | 6 published ACVs, licence only; budget band unattributed | S4, S7 | Horizontal bar, sorted, budget band annotated | Title + exhibit full-width | `[DATA NEEDED]` marker visible if budget band unresolved |
| 5 | Pricing | Pricing above budget is survivable only if the cost attaches to audit, not IT | Reframe the buyer from IT to audit owner | Audit cost per cycle vs module ACV; authorisation thresholds | S4, S7 | 2×2: budget line × authorisation level | Title + 2×2 matrix | Axes must be labelled on the slide |
| 6 | Threat | Suites will bundle filing within two years, which closes the filing-led route | A filing product has a two-year window | Reporting already in standard editions; marginal price near zero | S5, S6 | Timeline with a closing window | Title + timeline | This is the slide that kills the obvious strategy |
| 7 | Differentiation | Audit acceptance is the asset suites cannot bundle | Why our position survives | Auditor workflow; export format acceptance; relationship, not feature | S3, S6 | Comparison table, 3 rows | Title + table | Do not overclaim: mark acceptance as unvalidated |
| 8 | Route to market | Two audit-firm referrals reach the buyer we cannot reach directly | Channel is a necessity, not a preference | 6-person sales team; long tail; referral economics; margin cost | S2, S4 | Flow diagram, 4 boxes | Title + flow | Name the risk: firms may see us as a threat |
| 9 | Investment | Phase 1 costs one squad for two quarters and tests the only assumption that matters | Small, reversible, evidence-generating | Scope of Phase 1; what is deliberately deferred; what it proves | S4, S7 | Roadmap, 3 phases with gates | Title + roadmap | Owners and dependencies, not just phases |
| 10 | Conditions | Stop if referral conversion is below 15% or auditors reject the export format | We are pre-committing to a kill criterion | Two thresholds, measurement method, review date | S2, S4 | Two-column criteria + trigger | Title + 2-column | Credibility slide. Do not soften it |
| A1 | Appendix | Applicability by member state | Backs slide 2 if challenged | Transposition status table | S1, S2 | Table | — | Referenced from slide 2 |
| A2 | Appendix | Pricing evidence | Backs slide 4 | Six vendors, list price, date, module scope | S4 | Table | — | Referenced from slide 4 |
| A3 | Appendix | Interview sample and method | Backs slide 3 | n=5, selection method, questions asked, limitations | S3 | Text | — | Referenced from slide 3; protects against "anecdote" challenge |

---

## 4. Exhibit specification (slide 4, in full)

```
EXHIBIT: Comparable module pricing vs mid-market budget band
Type:     Horizontal bar, sorted descending by ACV
Y-axis:   Vendor (anonymised A–F)
X-axis:   Annual contract value, € thousands, licence only
Range:    0–35k, axis starts at zero
Series:   Single series (list price). No second series.
Labels:   Value label at end of each bar
Annotation: Shaded band across 0–12k labelled "typical mid-market software budget"
            [DATA NEEDED: budget band — currently an assumption, not evidence]
Source line: [ILLUSTRATIVE] vendor price pages, 2026, list price, licence only (S4)
Insight the chart must land: every published price sits above the shaded band
Do not:   use a pie chart, truncate the axis, or add a "market average" line
```

**Why this exhibit:** the message is a comparison of magnitudes, and the decision turns on a threshold. A bar chart with a shaded threshold makes the gap visible in one glance. A table would require the board to do the comparison themselves.

---

## 5. Data requirements

| Slide | Blocked on | Effect if unresolved |
|---|---|---|
| 4 | Mid-market software budget band | The shaded band becomes an assumption drawn on the chart — must be labelled as such on the slide, not just in the appendix |
| 5 | Audit cost per compliance cycle | Slide argues from authorisation level only; the cost comparison is dropped |
| 7 | Auditor acceptance evidence | Claim downgraded to "hypothesis to validate in Phase 1" — which weakens the differentiation argument but does not break it |

---

## 6. Open storyline risks

1. **The differentiation slide rests on an unvalidated claim.** If auditors will accept any machine-readable export, the claim on slide 7 collapses and the recommendation reduces to "sell cheap" — which loses to bundling. This is the deck's weakest joint and should be said out loud in the room.
2. **Ten slides for a 15-minute slot is tight.** If discussion starts early, cut slide 5 (the 2×2) rather than compressing slide 3 or slide 10.
3. **The kill criterion is unusually specific for a board deck.** It is included deliberately: it converts a request for money into a request for a bounded experiment.

---

## What this example demonstrates

| Behaviour | Where |
|---|---|
| Structure chosen deliberately, before slides | §1 — answer-first, justified by audience |
| Titles are claims, and the sequence is the argument | §2 — including the ask on slide 1 and the condition on slide 10 |
| One message per slide, enforced | §3 — no slide carries two ideas |
| Exhibit type matched to the message | §4 — comparison of magnitudes against a threshold |
| Evidence attached to every slide | §3 — S-IDs on all ten |
| Data gaps visible on the slide, not just the appendix | §4 annotation |
| Weakest joint named rather than smoothed | §6 |

## What was deliberately rejected

- **An agenda slide.** Ten slides, fifteen minutes — the agenda would replace a finding.
- **A "market overview" opener.** The board did not come to learn about freight.
- **A TAM funnel.** The ledger has no defensible TAM, and a funnel would have required inventing one.
- **A 2×2 on slide 2.** Positioned later, because the axes only make sense after the pricing finding.
- **Speaker notes on every slide.** Only where the slide depends on verbal context — otherwise the notes become a script that gets read.
