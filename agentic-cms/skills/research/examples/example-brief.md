# Example — Research Brief

> **Synthetic example. Not a real client, not real data.**
> Meridian Freight Systems is invented. Every figure is illustrative and marked as such in the ledger. Nothing here may be cited, reused, or treated as market fact.
> **Purpose:** show the output shape, claim typing, and reasoning that `../SKILL.md` is intended to produce.
> **Note:** this uses the same scenario as test prompts R1/W1/S3, so the expected shape is concrete. That is deliberate, and it is also a weakness of the evaluation (task leakage — see the Group 3 evaluation rubric §7, kept in the Group 3 workspace).

---

```markdown
# Is the mid-market compliance module fundable? — Research Brief

Project: Meridian Freight Systems — FY27 product investment
Workstream: Market assessment, week 3 of engagement
Prepared for: PM and LC          Date: (example)
Decision this informs: whether to fund a compliance module for FY27

## 1. Research question and scope

**Primary question:** Is there a fundable, reachable market for a compliance module sold to Meridian's
existing mid-market road-freight customers?

**Sub-questions:**
1. Who is legally required to comply, and on what timeline?
2. What do these operators do today instead of buying software?
3. What do they pay for comparable tools?
4. Who already serves them, and how?
5. What would make them switch vendors?

**Scope contract**
Geography: EU-27 (Meridian's installed base)   |   Time window: FY2026–FY2028
Segment: road-freight operators, 50–500 employees
Unit of analysis: annual software contract value (ACV), licence only — excludes services and hardware
In scope: compliance/audit-readiness software for mid-market freight operators
Out of scope: enterprise (>500 employees), non-EU markets, adjacent ESG reporting beyond regulatory compliance
Key definitions: "compliance module" = software producing audit-ready regulatory evidence; excludes
consulting services and internal spreadsheet work

## 2. Executive takeaway

Regulatory scope is legally defined, so demand is not speculative — but willingness to pay is not
established, and the realistic competitor is the spreadsheet plus the auditor, not another vendor.
The fundable case rests on audit-readiness, not on compliance filing, because filing will be bundled
into ERP suites. On current evidence the market is **fundable only as a narrow module with a channel
route to market**; the €25k price point and a six-person direct sales team are incompatible.
Confidence: medium-low. The decisive missing input is mid-market IT budget.

## 3. Key findings

**F1 — The addressable set is defined by regulation, not by marketing.**
Applicability thresholds create a countable population rather than a segmentation exercise (S1, S2).
*So what:* sizing does not need to start from a top-down analyst number; it can start from a firm count.

**F2 — The incumbent alternative is manual work, not a competing product.**
Operators describe compliance as a periodic, auditor-driven scramble; where tools exist they are
general-purpose reporting tools adapted to the purpose (S3, SINGLE-SOURCE).
*So what:* the product must beat a process, not a competitor — which changes the sales argument from
feature comparison to risk reduction.

**F3 — Comparable modules price above what a mid-market operator is likely to authorise.**
Published ACVs cluster at €18k–€30k [ESTIMATE: I1; six vendor price pages]; mid-market IT budgets are
not established [DATA NEEDED].
*So what:* either the price point or the target segment has to move. This is the crux of the decision.

**F4 — ERP and incumbent suites are the structural threat.**
Suites already own the reporting surface and can bundle compliance at near-zero marginal price (S5, I2).
*So what:* a standalone compliance-filing product has a two-year window at most.

## 4. Supporting evidence

| Finding | Evidence substance | Type |
|---|---|---|
| F1 | Regulatory applicability by size and sector; phased commencement (S1, S2) | FACT |
| F2 | 4 of 5 practitioner descriptions of current practice were manual/periodic (S3) | FACT (small n) |
| F3 | 6 published price points, €18k–€30k ACV, licence only (I1) | ESTIMATE |
| F4 | Two suite vendors list compliance/reporting modules in their standard editions (S5); inference that bundling commoditises point solutions (I2) | FACT (product scope) + INFERENCE |

## 5. Market and competitive analysis

Segments by buying posture, not by size:
- **Audit-led** — buys to reduce auditor friction; will pay for evidence quality.
- **Filing-led** — buys the cheapest thing that produces a submission; will be captured by suites.
- **Deferred** — waits for a customer or auditor to force the issue.

Competitor types: suite/ERP bundlers (structural), specialist compliance vendors (price-anchoring),
services firms (do it for you), and the spreadsheet (the real default).

## 6. Strategic implications

1. If the proposition is filing, the segment is unprofitable within two years — suites win on price.
2. If the proposition is audit-readiness evidence, the buyer changes from finance to quality/operations,
   and the price can attach to audit cost rather than software budget.
3. A six-person direct sales team cannot cover a long-tail segment; channel or product-led motion is
   required regardless of positioning.

*No recommendation is made here. That is the whitepaper's job.*

## 7. Evidence ledger

| ID | Claim | Type | Source | Data date | Confidence |
|---|---|---|---|---|---|
| S1 | Regulatory applicability is defined by employee count and sector | FACT | [ILLUSTRATIVE] Regulation summary, official journal | 2024 | High |
| S2 | Commencement is phased over three reporting years | FACT | [ILLUSTRATIVE] Regulator guidance | 2025 | High |
| S3 | 4 of 5 mid-market operators handle compliance manually/periodically | FACT (n=5) | [ILLUSTRATIVE] practitioner interviews | 2026 | Low |
| I1 | Comparable modules list at €18k–€30k ACV | ESTIMATE | [ILLUSTRATIVE] 6 vendor price pages | 2026 | Medium |
| S5 | Suite vendors include reporting/compliance in standard editions | FACT | [ILLUSTRATIVE] product documentation | 2026 | Medium |
| I2 | Suite bundling has historically commoditised point solutions | INFERENCE | S5 + category history | — | Medium |
| S7 | Mid-market operators will pay a premium for audit-ready exports | ASSUMPTION | PM hypothesis, untested | — | Low |

## 8. Conflicting evidence

**Market size.** Analyst A: €1.4B (2025), including services and internal tools. Analyst B: €420M
(2025), software licences only. The 3.3x gap is definitional, not a disagreement about the market.
We use neither as a sizing input: the decision turns on ACV and budget, not total market value.
Both are recorded as directional bounds only.

**Current practice.** Interviews (S3) suggest manual processes dominate; one vendor's material claims
"most mid-market operators now use dedicated software". We weight S3 above the vendor claim because the
vendor has an incentive and discloses no method. Unresolved; would be settled by a 30-firm survey.

## 9. Limitations

- n=5 practitioner interviews, self-selected. F2 is directionally useful, not representative.
- All pricing is list price. Realised discounts are unknown and typically 15–30% in this category.
- No buyer-budget evidence at all. This is the weakest link: it decides whether €25k is trivial or fatal.
- Regulatory dates move. Verify current transposition before any client-facing use.

## 10. Open questions

1. What is the mid-market freight operator's annual software budget, and who authorises €25k?
   → vendor filings, 3 buyer interviews. **Blocks the recommendation.**
2. Does audit-readiness reduce audit cost measurably? → 2 audit-firm conversations.
3. What is the suite vendors' pricing for the bundled module? → pricing teardown.
```

---

## What this example demonstrates

| Behaviour | Where to look |
|---|---|
| Scope is contracted before research | §1 — unit of analysis excludes services |
| Two credible estimates are diagnosed, not averaged | §8 — 3.3x gap attributed to definition |
| A hypothesis stays a hypothesis | S7 remains `ASSUMPTION` throughout |
| Single-source claims are flagged | F2 carries `SINGLE-SOURCE` and n=5 |
| The weakest link is named | §9 — buyer budget |
| No recommendation sneaks in | §6 stops at implications |
| Gaps are specific, not decorative | `[DATA NEEDED]` names the metric, the stakes, the source |

## What was deliberately cut

- A TAM/SAM/SOM funnel. It would have required a definition we could not defend and a number we could not source.
- A competitor feature matrix. Three of four competitors disclose nothing comparable; the matrix would have been invented.
- A "market trends" section. Nothing in it would have changed the decision.
