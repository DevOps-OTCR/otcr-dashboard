# Example — Whitepaper

> **Synthetic example. Not a real client, not real data.**
> Continues the Meridian Freight Systems scenario from `research-example.md`, reusing the same S-IDs.
> Figures are illustrative. Nothing here may be cited as market fact.
> **Purpose:** show thesis construction, argument architecture, and recommendation anatomy — not a full 1,400-word document.

---

## 1. The outline that would be produced first (gate)

```markdown
Decision: fund or defer the compliance module for FY27
Decision-maker: CEO + board. Cares about payback and sales capacity. Resists new SKUs (6-person sales team).
Must believe: (1) demand is legally forced, (2) buyers pay for audit-readiness not filing,
              (3) it can be sold without new headcount.
Strongest objection: "compliance reporting will be commoditised by ERP suites."

Thesis: Fund a narrow audit-readiness module and sell it through audit-firm referral partnerships,
        because filing will be bundled within two years and a direct sales motion cannot reach the segment.

Architecture
├─ Because 1 — The buying population is legally defined and countable          [S1, S2]     FACT
├─ Because 2 — The real alternative is manual work, so the sale is risk        [S3]         FACT (n=5)
│    └─ Objection: "AI will let anyone produce the filing" → answer: filing ≠ audit acceptance
├─ Because 3 — €18–30k ACV exceeds mid-market software budgets                [S4, S7]     ESTIMATE + ASSUMPTION
│    └─ Consequence: price must attach to audit cost, not software budget
└─ Because 4 — Suites will bundle filing at near-zero price                   [S5, S6]     FACT + INFERENCE
     Therefore: audit-readiness positioning + channel route, with explicit kill criteria.

Evidence gaps carried forward: buyer budget (. Blocks the recommendation)
Section budget: 1,400 words ± 10%
Approval requested: proceed to draft?
```

**Why the outline comes first:** the thesis and the objection are settled before prose exists. Drafting into an unresolved thesis produces a document that describes a situation and recommends nothing.

---

## 2. Executive summary (as it would appear)

> Meridian should fund a narrow **audit-readiness** module for FY27 — not a compliance-filing product — and take it to market through audit-firm referral partnerships rather than direct sales.
>
> Three findings drive this. First, the buying population is defined by regulation and is therefore countable, so demand does not depend on a market-sizing assumption (S1, S2). Second, the realistic incumbent is a manual, auditor-driven process rather than a competing product, which means the sale is about reducing audit friction, not replacing software (S3). Third, comparable modules list at €18k–€30k ACV, above what a mid-market operator is likely to authorise from a software budget (S4, S7) — so the price has to attach to the cost of audit evidence instead.
>
> The structural threat is bundling: suites already own the reporting surface and can include filing at near-zero marginal price (S5, S6). A filing-led product has roughly a two-year window. An audit-readiness product does not, because the asset is auditor acceptance rather than the form.
>
> **Recommendation:** a three-phase build, starting with two audit-firm partnerships, with a stop condition if referral conversion is below 15% by the end of Q2. The recommendation assumes a €25k target ACV; that assumption is the single largest uncertainty in this document and should be tested in the first ten buyer conversations.
>
> **Unvalidated assumptions in this recommendation:** I1 — the 15% referral-conversion stop condition is an assumed threshold, not a sourced figure; validate against the first cohort of referred buyers before it gates the build. S7 — the €25k target ACV is an assumed price point; validate in the first ten buyer conversations before it sets the pricing model. Neither is evidence-backed; both are carried as ASSUMPTION with an open validation path (see §3).

*Note: the uncertainty is inside the executive summary, not hidden in §9. A board that discovers a buried assumption stops trusting the document.*

---

## 3. One body section, to show the argument mechanics

### Because 3 — Pricing sits above the segment's software budget

Published ACVs for comparable modules cluster between €18k and €30k, licence only (S4). Meridian's target segment is operators with 50–500 employees; their annual software budget is not established in this workstream.

This is the hinge of the decision. If €25k is a departmental purchase, the segment is reachable with a small sales team and a channel. If it is a board-level capital decision, a six-person team cannot run that sales cycle at volume, and the channel becomes mandatory rather than optional.

We can bound the question but not answer it. The segment's total software spend is plausibly in the low hundreds of thousands of euros per firm, which would make €25k a material line item rather than a rounding error.

**I2 — Unvalidated assumption.** Total software spend per firm sits in the €0.3–0.8M range. This range is an analyst assumption, not a sourced figure; no citation is attached. Validation path: vendor filings plus three buyer interviews to establish annual software budget and authorisation threshold. Until validated, the range is carried as `[ASSUMPTION: I2 — unvalidated]` and the segment sellability at €25k remains open. If the range does not hold, the pricing model changes.

Two consequences follow, and they point in the same direction: the price must attach to audit cost rather than to a software budget line, and the buying centre must include whoever owns audit outcomes, not only IT.

`[DATA NEEDED: mid-market freight operator annual software budget and authorisation threshold — determines whether the segment is sellable at €25k or requires a €8–12k product — vendor filings plus three buyer interviews]`

---

## 4. Recommendation, with mechanism

| Element | Content |
|---|---|
| **Action** | Build a narrow audit-readiness module: evidence capture, exception flagging, auditor-ready export |
| **Actor** | Product (2 engineers, 1 designer), plus a part-time partnerships owner |
| **Mechanism** | Sell through 2 audit firms who already advise these operators, so implementation risk and buyer trust sit with the party that holds the relationship |
| **Sequence** | Phase 1 (Q1–Q2): evidence capture + 2 partnerships, 1 pilot. Phase 2 (Q3): exception flagging. Phase 3 (Q4): auditor export format, only if pilots confirm acceptance |
| **Expected effect** | €25k ACV attached to audit cost rather than software budget; no new direct sales headcount |
| **Evidence** | S2, S3, S4, S6 |
| **Kill criteria** | Referral conversion < 15% by end of Q2 (I1 — assumed threshold, unvalidated; validate against the first referral cohort before it gates the build), **or** fewer than 2 of 3 pilots obtain auditor acceptance of the export |
| **Key risk** | Audit firms treat this as a threat to their advisory revenue and decline to refer |

**What would change the recommendation:** if buyer budget evidence shows €25k is a routine departmental purchase, direct sales becomes viable and the channel dependency — and its margin cost — disappears.

---

## 5. Alternatives considered

| Option | Steelman | Why it loses (on current evidence) |
|---|---|---|
| **Build a full compliance-filing suite** | Larger TAM; suites prove the demand exists; one product serves all segments | Directly enters the bundling fight with a worse cost position (S5, S6). Two-year window. |
| **Do nothing; partner with a compliance vendor** | Fastest to revenue, no build risk, preserves focus | Captures no margin, no product asset, and no audit relationship — the thing that becomes defensible. |
| **License the technology to a suite vendor** | Monetises without go-to-market cost | Depends on a partner whose interest is to commoditise the category. Also unvalidated as a demand signal (S7). |
| **Recommended: audit-readiness module via referrals** | Attaches to audit cost; uses an existing trust channel; builds a defensible asset | Slower; dependent on two partnership conversations going well. |

---

## What this example demonstrates

| Behaviour | Where |
|---|---|
| Thesis names an action, a reason, and the obstacle it survives | §1 |
| Strongest objection stated in the outline, before drafting | §1 |
| Executive summary contains the uncertainty | §2 |
| Assumption stays labelled (`S7`) and is called the largest risk | §2, §3 |
| Analyst-created thresholds and ranges carry `I#` IDs and an explicit validation path | §2 and §4 (`I1`), §3 (`I2`) |
| No claim cites a source that does not state it | throughout |
| Every recommendation has actor + action + mechanism + sequence + kill criteria | §4 |
| Alternatives are steelmanned, not strawmanned | §5, first column |
| A hypothesis is bounded without being converted to fact | §3, `[ESTIMATE]` + `[DATA NEEDED]` |
| No new SOURCE evidence beyond the ledger | throughout — source IDs are S1–S7 only; I1–I2 are labelled analyst assumptions |

## What was deliberately cut

- A "market overview" section. The board is deciding on a product, not learning a market.
- A framework name-drop. The argument does not need a label to be MECE.
- A risks section with ten rows. One real risk, with a trigger, beats ten that dilute it.
