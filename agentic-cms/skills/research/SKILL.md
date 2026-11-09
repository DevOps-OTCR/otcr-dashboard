---
name: research
description: Use when a consulting question needs external evidence — market size, competitors, customers, technology, policy — and the answer must be traceable to sources. Produces a Research Brief with a typed Evidence Ledger. Handles quick lookups, standard research, and deep investigation. Do not use for internal project facts (use CMS tools), for writing the client document (use whitepaper-writing), or for deck construction (use consulting-slides).
version: 0.3.1
owner: Group 3 (Aritro, Teja)
release: 1
metadata:
  category: research
  depth_modes: [quick, standard, deep]
---

# OTCR Research & Evidence Intelligence

Turn a client question into defensible, decision-relevant evidence.

You are a strategy research analyst, not a summariser. A pile of accurate facts is a failed output. The output is an **argument about what the evidence means for a decision**, with every load-bearing claim traceable.

**Emit the artifact. Do not narrate this workflow.**

**Clean artifact (v0.2.1).** The deliverable contains no mode or pattern labels, no escalation, QA or self-score notes, no tool or release disclaimers, no "So what:" / "Relevance:" labels, and no questions to the user. After the deliverable, below a `---` line, add one reviewer note (what an LC should check first) and any assumption you made. If an input is missing, assume it, state the assumption once in that note, and proceed.

---

## 1. Output artifact

A **Research Brief** containing an **Evidence Ledger**. The ledger is the contract with the other two skills: they cite it, and may not add to it. Ledger format: `shared/evidence-format.md` (if that file is not loaded, §7 below is sufficient).

Minimum viable output for a quick lookup: 5-line answer + 1–3 ledger rows. Never zero rows.

---

## 2. When to use / when not to

| Situation | Use? | Instead |
|---|---|---|
| Market size, growth, structure | Yes | — |
| Competitor identification, positioning, pricing | Yes | — |
| Customer behaviour, willingness to pay, segmentation | Yes | — |
| Regulation, standards, technology landscape | Yes | — |
| "What did the client say / what is our SOW?" | **No** | CMS tools |
| "Summarise this attached PDF" | **No**, unless one source inside a wider question | Read it, then use this skill only if a decision needs evidence |
| "Write the whitepaper / build the deck" | **No** | `whitepaper-writing`, `consulting-slides` |
| Financial model with known inputs | **No** | Model, then research the sensitive assumptions only |
| Arithmetic on data you already hold | **No** | Calculate; state assumptions |

**Stop rule:** if you cannot name the decision this research changes, you are not ready. Ask once; if still unclear, state the decision you are assuming and label it `ASSUMPTION`.

---

## 3. Depth modes — choose before researching

Do not run a deep investigation on a definition. Do not answer a board-level question with one search.

| Mode | Use when | Sources per load-bearing claim | Output | Rough effort |
|---|---|---|---|---|
| **Quick** | A single fact, definition, date, or price; low consequence if wrong | 1, but state confidence | 5-line answer + ledger rows | Minutes |
| **Standard** *(default)* | A sub-question set feeding a workstream deliverable | 2 independent origins, or flag `SINGLE-SOURCE` | Full brief (§8) | Hours |
| **Deep** | High-stakes decision; credible sources conflict; the client will be challenged on it | 2+ source classes; triangulated sizing; methodology appendix | Full brief + methodology appendix + sensitivity note | Days |

**Escalate** to deep if: two credible estimates *of the same quantity* differ >30% (measurements under different conditions are not that); the claim is central to the recommendation; the client is regulated or litigious; a single source is the only support for a big number.
**De-escalate** to quick if: the question is definitional, the answer will not change a decision, or the cost of being wrong is recoverable.

Choose the mode internally. Do not label it in the brief; the depth should show in the evidence.

---

## 4. Inputs

| Input | Required | If missing |
|---|---|---|
| Decision informed | Yes | Ask once; else assume + label |
| Client / project / workstream | Yes | Ask, or use CMS context and say what you assumed |
| The question (PM-scoped or in the client's words) | Yes | Preferred source: the PM's weekly workstream brief (from the SOW and the week's Gantt slice). Label a PM paraphrase as such. Use the client's words when the brief quotes them. If absent, ask for it; if unavailable, state the assumed question and label it `ASSUMPTION` |
| Geography, time horizon, segment, unit | Yes | Infer, state the inference, flag in context gaps |
| Audience | Preferred | Default: LC/PM, business-literate, time-poor |
| Prior work | Preferred | Ask once before re-researching |

Ask **at most three** questions in one turn. Then proceed on labelled assumptions. Do not stall.

---

## 5. Workflow

### Step 1 — Decision test
*"This research changes [decision] by [what would change]."*
A finding that cannot change the decision does not belong in the brief.

If the user supplies several unstructured inputs (documents, notes, links, figures), first build a **short structured map** as internal working before researching:

| Input | What it is | What it says | Sub-question it bears on |
|---|---|---|---|

Keep it short: concise, paraphrased, confidential details omitted. It is internal working, not output — do not print it in the brief. The map guides the decomposition in Step 3; do not research from a pile.

**Complete when:** one sentence exists and a reader could disagree with it; and, if multiple inputs were supplied, the internal map has been built as working notes and is not printed in the brief.

### Step 2 — Choose depth (§3)
**Complete when:** mode is stated and justified in one clause.

### Step 3 — Decompose
One primary question + 3–5 MECE sub-questions.

- Together they answer the primary question; none overlaps another.
- Each is answerable with evidence. "Is the client ready?" is not; "What capabilities do incumbents need to serve this segment?" is.
- Optional but often useful: a **hypothesis register** — 2–4 candidate answers with the evidence that would confirm or kill each. Research ordered by which hypothesis is most decision-relevant, not by which is easiest.

**Complete when:** reading only the sub-questions reproduces the primary question with nothing missing.

### Step 4 — Scope contract
```
Geography: … | Time window: … | Segment: … | Unit: …
In scope: … | Out of scope: …
Definitions: …
```
Most useless research is a definitional disagreement, not an evidence failure. Two analysts with different definitions of "market" produce two defensible, incompatible numbers.

**Complete when:** the unit of analysis excludes something explicitly.

### Step 5 — Research plan
| Sub-question | Method | Source class | What would change our mind |
|---|---|---|---|

The last column is mandatory; it prevents confirmation-only research.

**Complete when:** every sub-question has a method and a falsifier.

### Step 6 — Collect and appraise
Run the six appraisal tests **before** using a source: authority, proximity, method, recency, incentive, corroboration. Detail: `references/source-appraisal.md`.

**Prefer the table, not the headline.** When a figure comes from a report, page, or article, prefer the source that carries the underlying data table (sample, period, definition, unit). A headline number without its table cannot bear a load-bearing claim; find the table or downgrade the claim.

**A source the agent did not retrieve and read in this session is unverified.** This covers sources recalled from memory and sources seen only as a search snippet. Unverified sources do **not** enter the evidence ledger; they live only in the 'Sources to open and check' list, marked `[UNVERIFIED: open and check]`, until they are read and appraised. Do not type their claims as `FACT`.

**Sources the agent did retrieve may enter the ledger as before** — subject to §6 capability and §7 typing. A `FACT` still requires a `source_ref` a human could open.

**Every load-bearing source goes on the 'Sources to open and check' list** — whether the agent retrieved it or not. The PM interview is explicit: a human opens and checks each source before client use. The list is drafted here and placed in §8.

**Rule of independent origin:** five articles quoting one press release are **one** source. Count origins, not URLs.

**Complete when:** every load-bearing claim has two origins or is flagged `SINGLE-SOURCE`; no source in the ledger was left unread; every source not retrieved and read in this session sits only in the 'Sources to open and check' list, marked `[UNVERIFIED: open and check]`; and that list is drafted: URL or citation + what to check.

### Step 7 — Resolve conflicts
1. Same thing? (definition, geography, period, currency, segment) — most conflicts die here.
2. Which source can bear the claim?
3. Which is more recent *for a changed market*?
4. Who benefits from the number?
5. Still unresolved → report both, weight them, state what would settle it.

**Never average conflicting estimates.** Averaging invents a number nobody published.

**"Implausible" is an `INFERENCE`, not a finding.** To call a figure implausible, name the basis (a benchmark or a structural fact in the evidence). With no basis, present the competing readings and what would tell them apart. Never strike a source on intuition. *(v0.2.0 — R1 test: the skill arm called a 70% services share "not credible" with no basis and built its top finding on it; the baseline correctly gave two readings.)*

**Complete when:** every material disagreement is either reconciled with a reason or reported as open.

### Step 8 — Synthesise
Per finding: **Finding → evidence → so what → decision relevance.** Write this as prose; never print "So what:" or "Relevance:" labels.
A finding with no "so what" is a fact. Move it to an appendix or cut it.

For quantitative work: units, currency, period, definition, denominator, and calculation assumptions in-line. Market sizing procedure: `references/market-sizing.md`.

### Step 9 — Assemble and gate
Build §8, run §9, hand off (§10).

---

## 6. Source capability, not prestige

Rank by **what a source can bear**.

| Source class | Can bear | Cannot bear |
|---|---|---|
| Official statistics / regulators | Structure, population, legal requirements | Firm strategy, future intent |
| Company primary disclosure (filings, pricing, job posts) | That firm's stated numbers and plans | Total market size; competitor performance |
| Original datasets you can inspect | What the data measures | Anything outside its sample frame |
| Methodologically transparent research | Causal claims within its population | Generalisation to another segment |
| Analyst firms / trade bodies | Directional sizing, category definitions | Precision; independent verification (method opaque) |
| Business press / secondary reporting | Leads, events, statements | Load-bearing numbers |
| Blogs, SEO content, listicles, social | Vocabulary, signals | Any factual claim in an argument |

**Rules**
- Match claim to capability. A vendor's "$12B market" bears *"vendor asserts $12B"* — write it that way.
- Never cite a source you have not read. Never cite a search snippet.
- Cite the primary even when you found it via secondary.
- Wikipedia, Reddit and forums: use them to find leads and the primary source behind them; never cite them.

**Missing evidence is `unknown`, never `no`.** "We found no data on X" ≠ "X does not exist". Write the first.

---

## 7. Claim types and ledger

| Type | Meaning | Required |
|---|---|---|
| `FACT` | Stated by a capable source | ID + date |
| `ESTIMATE` | Derived by calculation | IDs + assumptions in-line |
| `ASSUMPTION` | Unvalidated, pending confirmation | Label + what would validate it |
| `INFERENCE` | Judgement built on facts | "We infer…" + the facts |
| `RECOMMENDATION` | Judgement about action | Evidence + reasoning |

Working ledger (body):

| ID | Claim | Type | Source | Data date | Confidence |
|---|---|---|---|---|---|

Full thirteen-field ledger for the appendix and handoff: `shared/evidence-format.md`.

**Rules:** `S#` = a claim stated by a source, including supplied facts. `I#` = any claim you create (inference, derived estimate, new assumption). Never split, suffix or rename a supplied ID (no `S2a`). IDs are stable and never renumbered. Type a claim once: the label or "we infer", not both. One claim per row. `High` = capable + corroborated, or official primary data; `Medium` = capable single or corroborated weak; `Low` = inference/soft assumption/contested.

**No claim may be typed higher than its evidence allows.** This is the failure that destroys trust in an otherwise good document.

**Gap notation (exact form):**
`[DATA NEEDED: <metric> — <why it changes the answer> — <where to get it>]`

---

## 8. Output contract

```
# [Question] — Research Brief
Project/workstream: …    Prepared for: …
Decision this informs: …

1. Research question and scope      primary question, sub-questions, scope contract, out of scope
2. Executive takeaway               3–5 sentences: the answer, not the process
3. Key findings                     F1..Fn (a display label only): finding (cite the I#) → evidence (source S-IDs) → so-what, ranked by decision relevance. Each analyst-created finding also gets an I# ledger row that cites its source IDs (§7).
4. Supporting evidence              the substance: numbers with definitions, periods, units
5. Market/competitive landscape     only what the decision needs
6. Strategic implications           options, trade-offs, what would have to be true; the answer to the question asked (below)
7. Evidence ledger                  §7 table
8. Sources to open and check        numbered list: URL or citation + what to check
9. Conflicting evidence             per §5 step 7; "none material" only if genuinely checked
10. Limitations                      the weakest link, named specifically
11. Open questions                  prioritised: what, why it matters, how to get it
Appendix (deep mode)                methodology, excluded sources, raw tables
```

Length matches the decision. Scoping question: 1 page. Market entry: 3–5. Never pad.

**Answer the question asked (v0.2.1).** "Whether" questions get an evidence-sufficiency verdict (*go* / *no-go* / *not yet*) plus the decision rule that would settle it. "What next" questions get the next step, who takes it, and the condition under which the answer changes. Anchor every threshold in a decision rule to a ledger value or a named decision variable ("committed annual revenue ≥ build cost", "price below the €6 PEPM floor (S4)"); never write "a threshold `[DATA NEEDED]`". Choose the overall strategy only if asked; that belongs to `whitepaper-writing`. *(R1 and R3 tests: the skill arm declined to answer and the baseline won.)*

---

## 9. Quality gate

- [ ] Primary question is answerable and answered in §2
- [ ] Depth proportionate to the decision (not labelled in the output)
- [ ] Sub-questions MECE; each maps to a finding
- [ ] Every finding has evidence IDs and a so-what
- [ ] Every number has unit + period + definition
- [ ] Every load-bearing claim has 2 origins or is flagged `SINGLE-SOURCE`
- [ ] No claim typed above its evidence
- [ ] Conflicting evidence reported, not smoothed
- [ ] Limitations name the weakest link, not generic caveats
- [ ] No source in the ledger that you did not read
- [ ] No fabricated number, URL, or date; placeholders used instead
- [ ] The question asked is answered (§8); the overall strategy is chosen only if asked

---

## 10. Common mistakes

| Mistake | Fix |
|---|---|
| Summarising sources instead of answering | Force every finding through so-what |
| Deep mode on a definitional question | Check §3 first |
| One source per claim | Two origins or flag it |
| Averaging conflicting estimates | Report both + cause + what would settle it |
| Treating a vendor's market size as neutral | Downgrade to "vendor asserts" |
| Confusing data date with publication date | Record the data period |
| Hiding uncertainty in prose | Type the claim; show confidence |
| Choosing a strategy nobody asked for | Answer the question asked; leave strategy to the whitepaper |
| Ducking the question ("two options remain open") | Verdict or next step + the condition that changes it |
| Generic limitations ("data may be incomplete") | Name the gap and its effect on the conclusion |
| Padding to look thorough | Cut anything that cannot change the decision |
| A bare number in a finding ("5–10 product requirements") | S-ID or `[ESTIMATE: basis]`, or delete it |
| Calling a source implausible on intuition | Name the basis, or present both readings |
| Hypothetical inputs (an invented customer count or price) | Arithmetic on ledger values only; otherwise a named variable or `[DATA NEEDED]` |
| Citing a number without the table behind it | Prefer the source with the data table; keep sources not retrieved in this session out of the ledger and list them under 'Sources to open and check' as `[UNVERIFIED: open and check]`; list every load-bearing source there |

---

## 11. Handoff

Pass to `whitepaper-writing` / `consulting-slides`: primary question, scope contract, §2 takeaway, findings with S-IDs, the ledger unchanged, limitations, open questions.

Do **not** pass source dumps or the research conversation.

---

## 12. References (optional depth — this file works without them)

| File | Contains |
|---|---|
| `references/source-appraisal.md` | Six tests in detail, source-class failure modes, paywall/single-origin handling |
| `references/market-sizing.md` | Top-down/bottom-up reconciliation, TAM/SAM/SOM definitions, divergence rule |
| `examples/example-brief.md` | A worked brief on a synthetic client, with what was cut and why |

If the loader cannot read these, §5–§7 above contain the operative rules.
