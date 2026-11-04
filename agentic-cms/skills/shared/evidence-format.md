# Shared Evidence Format

The only state that passes between the three skills. If evidence is not in this format, it does not exist downstream.

**Owner:** Group 3 · **Version:** 0.1.0 · **Consumers:** `research`, `whitepaper-writing`, `consulting-slides`

---

## 1. Why one format

The most common failure in AI-assisted consulting work is **claim laundering**: a hypothesis enters as an assumption, gets summarised into a finding, then appears in the client document as fact. Nothing in a normal chat transcript prevents this. A typed ledger does.

The rule is simple: **a claim can be downgraded at any handoff, never upgraded.**

```
ASSUMPTION ──✗──> FACT                      (forbidden — this is laundering)
FACT ──✓──> ESTIMATE / INFERENCE / ASSUMPTION (allowed — new context may weaken it)
```

---

## 2. Claim types

| Type | Definition | Test |
|---|---|---|
| `FACT` | Directly stated by a source capable of bearing it | Would the publisher stand behind this in writing? |
| `ESTIMATE` | Derived by calculation from facts | Are the inputs and assumptions visible? |
| `ASSUMPTION` | Stated without validation, pending confirmation | Is there a named way to validate it? |
| `INFERENCE` | Analyst judgement built on facts | Can you name the facts it rests on? |
| `RECOMMENDATION` | Judgement about action | Is the reasoning and evidence attached? |

Every substantive claim gets exactly one type. Mixed claims are split into two rows.

---

## 3. Ledger — full form (appendix / handoff)

Thirteen fields. This is the record of truth; it is normally an appendix.

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | `S#` = a claim stated by a source, including supplied facts. `I#` = any claim the analyst creates (inference, derived estimate, new assumption). Stable for the life of the engagement; never reused, renumbered, split or suffixed. |
| `claim` | Yes | One sentence. If it needs "and", split it. |
| `type` | Yes | One of §2. |
| `source_title` | Yes | Enough for a human to find it without the URL. |
| `source_ref` | Yes | URL, filing number, dataset name, or `INTERNAL: <record>`. Never invented. |
| `source_type` | Yes | See the capability classes in `skills/research/references/source-appraisal.md`. |
| `published` | Yes | Publication date, or `undated`. |
| `accessed` | Yes | Date you actually read it. Proves recency of the check, not of the data. |
| `evidence` | Yes | The specific passage, figure, or table. Paraphrase allowed; must be faithful. |
| `method` | If quantitative | Sample, definition, period, currency, calculation. |
| `confidence` | Yes | `High` / `Medium` / `Low` — see §5. |
| `caveats` | Yes | `none` is acceptable; blank is not. |
| `downstream` | Yes | `brief` / `whitepaper` / `slides` / `background-only`. |

### Minimal example

| id | claim | type | source_title | source_ref | source_type | published | accessed | evidence | method | confidence | caveats | downstream |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | Applicability is defined by employee count and sector | FACT | [ILLUSTRATIVE] Regulation summary | example.org/reg | Official/regulator | 2024-12 | 2026-11 | Art. 2 scope | — | High | National transposition varies | all |
| S4 | Comparable payroll add-ons list at €6–€9 per employee per month (PEPM) | ESTIMATE | 5 vendor price pages | example.org/a…e | Company primary | 2026 | 2026-11 | List prices only | 20–200-employee firms, DE | Medium | List ≠ realised | whitepaper, slides |
| S7 | Buyers will pay a premium for same-day payroll corrections | ASSUMPTION | PM hypothesis | INTERNAL: week-3 note | Internal | — | 2026-11 | Stated in kickoff | — | Low | Would need 3 buyer calls | whitepaper |

---

## 4. Ledger — working form (document body)

Thirteen columns do not survive contact with a reviewer. In the body, use six:

| ID | Claim | Type | Source | Data date | Confidence |
|---|---|---|---|---|---|

The full thirteen-field row lives in the appendix and is produced only for load-bearing claims (typically the 8–15 rows that a reviewer might challenge). Do not produce a 40-row working table; it will not be read.

---

## 5. Confidence definitions

| Level | Means | Typical basis |
|---|---|---|
| `High` | Would survive a sceptical LC | Capable source + independent corroboration, or official primary data |
| `Medium` | Defensible, but attackable | Capable single source, or corroborated weaker sources, or a transparent estimate |
| `Low` | Directional only | Inference, soft assumption, contested evidence, or n<10 |

Confidence is about **the claim**, not the source's prestige. A single excellent source can still yield `Medium` because it is single.

---

## 6. Inline citation rules

| Context | Form |
|---|---|
| Prose in a brief or whitepaper | `(S4)` or `(S4, S7)` |
| A derived number | `€6–9 PEPM [ESTIMATE: S4; assumes list prices, 20–200-employee firms]` |
| A gap | `[DATA NEEDED: metric — why it matters — suggested source]` |
| An assumption in prose | "We assume X; this is unvalidated." |
| A slide exhibit | `Source: <publisher>, <data period> (S4)` |

**No naked numbers.** Any figure without an S-ID or an `[ESTIMATE]` basis is a defect, not a style choice.

---

## 7. Gap notation

```
[DATA NEEDED: <the specific metric> — <why it changes the answer> — <where to get it>]
```

Weak: `[DATA NEEDED: more market data]`
Strong: `[DATA NEEDED: HR software budget per employee — decides whether €8 PEPM is routine or needs CFO sign-off — vendor filings + 3 buyer interviews]`

The middle clause is mandatory. A gap with no consequence is decoration.

---

## 8. Handoff rules

1. **Pass the ledger, not the transcript.** Downstream skills never see the research conversation.
2. **IDs are immutable.** `S4` means the same thing in the slide appendix as in the brief.
3. **Downstream skills may not add evidence.** If they need more, they emit `[DATA NEEDED]`.
4. **Every recommendation names its supporting IDs.** A recommendation with no IDs is an opinion.
5. **`background-only` rows never appear in client artifacts.** They inform judgement but are not cited.
6. **Retire, do not delete.** If a claim is superseded, mark `retired` and add the replacement ID. A reviewer may remember the old number.

---

## 9. Validation checklist

- [ ] Every row has a unique, stable `id`
- [ ] Every row has exactly one `type`
- [ ] Every `FACT` has a `source_ref` a human could open
- [ ] Every `ESTIMATE` has `method` populated
- [ ] Every `ASSUMPTION` names what would validate it (in `caveats`)
- [ ] `confidence` is not `High` for a single unverified source
- [ ] `accessed` is today's date or later than `published`
- [ ] No `source_ref` was constructed from memory
- [ ] Every `[DATA NEEDED]` has all three clauses
- [ ] Downstream artifact contains no ID absent from the ledger
