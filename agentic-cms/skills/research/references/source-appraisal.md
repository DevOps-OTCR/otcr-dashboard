# Source Appraisal

Six tests to run **before** a source enters the ledger. Applies to documents, datasets, dashboards, and interviews.

If a source fails two or more tests, it can still be a lead — but it cannot carry a load-bearing claim.

---

## 1. The six tests

| # | Test | Ask | Fail signal |
|---|---|---|---|
| 1 | **Authority** | Is this publisher capable of knowing this? | A consultancy asserting a regulator's enforcement practice |
| 2 | **Proximity** | How close is this to the origin? | Trade press summarising a press release summarising a filing |
| 3 | **Method** | Is the method visible and adequate for the claim? | "Survey of 200 executives" with no sampling frame |
| 4 | **Recency** | When was the *data* collected, not just published? | A 2026 article citing 2019 data in a fast-moving category |
| 5 | **Incentive** | Who benefits if this number is believed? | A vendor sizing the market for its own product |
| 6 | **Corroboration** | Is there a second, independent origin? | Five articles, one press release |

---

## 2. Proximity ladder

| Level | Example | Can carry |
|---|---|---|
| **Primary** | Filing, statute, dataset, price page, interview transcript | Facts about that specific subject |
| **Secondary** | Analyst report, trade body study, reputable journalism | Directional claims, category definitions |
| **Tertiary** | Listicle, blog, SEO comparison, AI summary | Vocabulary and leads only |

Move up the ladder whenever possible. If you found a fact in a secondary source, cite the primary it points to — after reading it.

**Never cite a search snippet.** If the page would not open, the claim does not exist.

---

## 3. Class-specific failure modes

| Class | Characteristic failure | Mitigation |
|---|---|---|
| Official statistics | Aggregation hides the segment you care about | Check the classification level; request/disaggregate |
| Regulator | States requirements, not practice | Separate "the rule says" from "firms do" |
| Company filings | Segment definitions change year to year | Use one year's definition consistently; note the change |
| Company pricing pages | List price ≠ realised price | Label `ESTIMATE`; note discounting |
| Vendor research | Market sized to include the vendor's adjacency | Ask what is excluded; compare with a second sizing |
| Analyst firms | Method opaque; paywalled | Cite as directional, never precise |
| Trade bodies | Membership bias toward incumbents | Check membership composition |
| Academic | Population and time frame narrow | Do not generalise beyond the sample |
| News | Correct at publication, stale later | Re-check the underlying event |
| Interviews | n=1, recall bias, interested party | Label `PRIMARY-INTERVIEW`, name the role, not the person |

---

## 4. Independent origin

Two sources are independent when they do not derive from a common upstream.

```
Press release (origin)
   ├── Article A   ┐
   ├── Article B   ├── ONE source
   └── Article C   ┘

Filing + independent survey + your own price audit = THREE origins
```

Test: remove the suspected common source. Does the second claim survive? If not, it was never corroboration.

---

## 5. Paywalls, abstracts, and unreadable sources

| Situation | Rule |
|---|---|
| Abstract only | You may cite the abstract's claim, labelled `ABSTRACT ONLY`. Never cite its numbers as verified. |
| Paywalled but summarised elsewhere | Cite the summary, name the original, state you did not read it. |
| Page will not load | Drop the claim, or replace with `[DATA NEEDED]`. |
| Figure behind a login | Do not use. Find a proxy or flag the gap. |
| Machine translation | Acceptable; note it if terminology is contested. |

---

## 6. Number hygiene

Every number in the ledger needs five attributes. Missing one is a defect.

| Attribute | Bad | Good |
|---|---|---|
| Definition | "market size" | "software licence revenue, excluding services" |
| Period | "€2.1B" | "FY2025" |
| Geography | "Europe" | "EU-27" |
| Currency/basis | "€30k" | "€30k ACV, list price, EUR nominal" |
| Denominator | "35% adoption" | "35% of firms with 50–500 employees" |

Additional traps:

- **Stock vs flow** — installed base vs annual spend.
- **Revenue vs spend** — a vendor's revenue is not the buyer's budget.
- **Users vs buyers** — seats are not accounts.
- **Nominal vs real** — inflation matters over multi-year comparisons.
- **Calendar vs fiscal year** — state which.

---

## 7. Interview evidence

| Do | Don't |
|---|---|
| Record role, date, and context | Name the individual without consent |
| Separate what they said from what you concluded | Present one person's view as segment consensus |
| Note where they have an interest | Treat a vendor's account of buyer behaviour as buyer behaviour |
| Ask "how do you know?" | Accept "everyone knows" |
| Label `PRIMARY-INTERVIEW`, confidence `Low` unless corroborated | Raise confidence because the person was senior |

Three interviews agreeing is a pattern, not a sample. Say "three of three interviewees", never "the market believes".

---

## 8. Red flags that warrant a second source

- A round number with no method.
- A market size that exactly matches the vendor's addressable segment.
- A growth rate above 25% with no adoption mechanism.
- A statistic attributed to "research" with no named publisher.
- A date that is suspiciously recent for a structural claim.
- A comparison between two differently-defined segments.
- A percentage whose base is unstated.

---

## 9. What to record

Every appraisal outcome lands in the ledger: `source_type`, `published`, `accessed`, `method`, `confidence`, `caveats`.

A caveat of `none` is acceptable. A blank caveat is not — it usually means the appraisal was skipped.
