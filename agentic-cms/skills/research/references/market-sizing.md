# Market Sizing

Most consulting market sizes are wrong in a boring way: the analyst sized a different market than the one the decision needs.

The output is not a number. It is **a number, its definition, its derivation, and the assumption that moves it most**.

All figures below are `[ILLUSTRATIVE]` — they show method, not a real market.

---

## 1. Define before sizing

| Dimension | Question | Why it changes the answer |
|---|---|---|
| Product | What is actually bought? | Software licence vs software + implementation can differ 3× |
| Customer | Who signs? | Enterprise vs mid-market changes both count and price |
| Geography | Which countries? | EU-27 ≠ Europe ≠ EU+UK |
| Period | Which year? | A 2026 size is not a 2030 forecast |
| Measure | Revenue, spend, or units? | Vendor revenue understates buyer budget |
| Denominator | Firms, sites, seats, shipments? | The most common source of two incompatible numbers |

Write the definition in one sentence before any arithmetic.

---

## 2. TAM, SAM, SOM — use precisely

| Term | Means | Common misuse |
|---|---|---|
| **TAM** | Total spend if the product were adopted by every eligible buyer | Used to mean "big adjacent market" |
| **SAM** | The part reachable with your model, geography, and price point | Skipped, so TAM is quoted as the opportunity |
| **SOM** | The share realistically obtainable in the plan period | Assumed rather than derived |

A useful discipline: never present TAM without SAM and SOM in the same table. A TAM alone is a rhetorical device.

---

## 3. Bottom-up (preferred)

```
SOM = eligible buyers
    × share with the need
    × share reachable by the go-to-market
    × annual contract value
```

Worked example — mid-market freight compliance software, EU-27:

| Step | Value | Source / status |
|---|---|---|
| Freight forwarders, EU-27, 50–500 employees | 4,200 | `[ILLUSTRATIVE]` official business register |
| Share with an audit-readiness need | 35% | `[ESTIMATE]` derived from regulation applicability |
| Reachable via channel partners in 3 years | 12% | `[ASSUMPTION]` to validate |
| ACV midpoint | €22,000 | `[ESTIMATE]` from 6 price pages |
| **SOM** | **≈ €3.9M** | 4,200 × 0.35 × 0.12 × €22,000 |

Show the formula and every input. A reader must be able to change one assumption and recompute.

---

## 4. Top-down (for triangulation only)

```
SAM = total category spend
    × segment share by the relevant definition
    × addressable product share
```

Worked example:

| Step | Value | Note |
|---|---|---|
| EU-27 compliance/operations software spend | €2.4B | `[ILLUSTRATIVE]` analyst estimate, method opaque |
| Mid-market freight share | 1.1% | `[ESTIMATE]` |
| Audit-readiness subset | 15% | `[ESTIMATE]` |
| **SAM** | **≈ €4.0M** | before reachability |

Top-down is a sanity check, not a primary method. Its inputs are usually less inspectable than a buyer count.

---

## 5. Reconciliation rule

Compare the two methods.

| Divergence | Action |
|---|---|
| < 15% | Report the range; use the midpoint only if the methods are reconciled and closely aligned, and the decision needs one number |
| 15–30% | Report both; explain the driver |
| > 30% | **Stop.** Diagnose before choosing: definition, geography, period, segment, or double counting |

**Never average unresolved conflicting estimates.** A midpoint is allowed only for reconciled, closely aligned methods (divergence < 15%, same definition, geography, period and segment). Where estimates still conflict, report both and the driver. Averaging manufactures a number that no source published and no reviewer can check.

### Diagnosis in practice

Bottom-up €3.9M vs top-down €5.6M (30.4% divergence). Investigate:

1. Top-down includes large enterprises → narrow to 50–500 employees.
2. Top-down counts total compliance spend, including services → narrow to software.
3. Recompute: €4.2M.

Now the range is €3.9–4.2M. That is a defensible answer, and the audit trail explains why it changed.

---

## 6. Sensitivity

Identify the assumption that moves the answer most, and say so.

| Assumption | Low | Base | High | Effect on SOM |
|---|---|---|---|---|
| Reachable share in 3 years | 6% | 12% | 20% | €1.9M–€6.5M |
| ACV | €18k | €22k | €30k | €3.2M–€5.3M |

The reachable-share assumption dominates. That is the number to validate first — and the finding the client most needs to see.

**Rule:** one sensitivity table beats three decimal places. Never write €3,942,000.

---

## 7. Common errors

| Error | Symptom | Fix |
|---|---|---|
| Double counting | Channel and direct both counted | Count the buyer once, at the point of purchase |
| Revenue as spend | Vendor revenue used as market size | Convert: spend = revenue ÷ vendor share, or use buyer budgets |
| Users as buyers | Seats multiplied by price | Count contracting entities |
| Ignoring replacement | Every buyer treated as new | Separate new logos from replacements |
| Currency drift | Mixed EUR/USD across years | Convert at a stated rate and year |
| Survivorship | Only listed competitors counted | Include private and regional players |
| Definition drift | Segment definition changes mid-model | Fix definitions in §1 and check every input against them |
| False precision | €3.94M | Round to the precision the inputs support |
| TAM as opportunity | "€2.4B market" with no SAM | Always show the funnel |

---

## 8. Output shape

```
Definition: <one sentence>
Method: bottom-up + top-down triangulation
Universe: <count> (<source>, <period>)
Need share: <x%> (<basis>)
Reach: <y%> (<basis>, <assumption flag>)
ACV: <€ range> (<basis>)
SOM: <range> (<currency>, <year>)
Dominant assumption: <name> — validate by <method>
Excluded: <what the number deliberately does not include>
```
