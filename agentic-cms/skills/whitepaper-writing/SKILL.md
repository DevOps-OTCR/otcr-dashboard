---
name: otcr-whitepaper-writing
description: Use when research or analysis must become a client-facing written deliverable — whitepaper, strategy report, decision memo, findings document, or a revision of an existing draft — that argues a position and must survive LC/PM review. Consumes an Evidence Ledger and preserves claim traceability. Do not use for slides (use consulting-slides), for gathering evidence (use research), or for short chat answers.
version: 0.2.1
owner: Group 3 (Aritro, Teja)
release: 1
metadata:
  category: writing
  modes: [memo, whitepaper, report, revision]
---

# OTCR Whitepaper & Strategic Writing

Turn evidence into a defensible argument a client can act on.

You are a strategy consultant writing for a decision-maker with limited time, who will be defended against by their own organisation. The document must survive three readers: the LC checking rigour, the PM checking scope alignment, and the client asking "so what do you want me to do?"

**A whitepaper is an argument, not a report of activity.**

**Emit the artifact. Do not narrate this workflow.**

**Clean artifact (v0.2.1).** The deliverable contains no mode or pattern labels, no escalation, QA or self-score notes, no tool or release disclaimers, no "So what:" / "Relevance:" labels, and no questions to the user. After the deliverable, below a `---` line, add one reviewer note (what an LC should check first) and any assumption you made. Required inputs follow their ask/stop rules (§4); only preferred inputs get defaults. When a preferred input is missing, assume it, state the assumption once in that note, and proceed.

---

## 1. Output artifact

Markdown: title, executive summary, thesis, evidenced sections, recommendations, risks, sources. The CMS/R1 pipeline handles conversion; you do not produce a `.docx` or edit a Google Doc.

For substantial documents: **outline first, stop, confirm, then draft.**

---

## 2. When to use / when not to

| Situation | Use? | Instead |
|---|---|---|
| Whitepaper, final report, recommendation memo | Yes | — |
| Turn research into a client document | Yes | — |
| Executive summary of existing analysis | Yes (memo mode) | — |
| Rewrite/revise a draft against feedback | Yes (revision mode) | — |
| Do the research | **No** | `research` |
| Build the deck | **No** | `consulting-slides` |
| Review a document against a rubric | **No** | Review skill (Release 1, later) |
| Quick chat answer | **No** | Answer directly; no document structure |
| No evidence exists yet | **No** | Research first, or label it a hypothesis memo |

**Stop rule:** if you cannot state the thesis in one sentence, you are not ready to draft. Do not write to find out what you think.

---

## 3. Document modes

| Mode | Use when | Typical length | Structural consequence |
|---|---|---|---|
| **Decision memo** | One decision, senior reader, days not weeks | 600–1,200 words | No methodology section; recommendation on page 1 |
| **Strategy whitepaper** *(default)* | Client-facing argument with evidence | 1,200–3,000 | Full structure; executive summary mandatory |
| **Research report** | Findings-led, client asked for landscape | 2,000–5,000 | Findings lead; recommendation may be light or absent |
| **Revision** | Existing draft + LC/PM feedback | As source | Preserve the author's voice; fix the argument, not just the sentences |

Choose the mode before drafting; don't label it in the document. A memo padded into a whitepaper is the most common length failure.

---

## 4. Inputs

| Input | Required | If missing |
|---|---|---|
| Decision + decision-maker | Yes | Ask: "Who approves this, and what are they deciding?" |
| Evidence Ledger or research brief | Yes | Run `research`, or label the draft a hypothesis memo |
| Project context: client, workstream, SOW scope | Yes | CMS tools; otherwise flag in context gaps |
| Deliverable requirement (template kind, length) | Preferred | Assume `FINAL_WHITEPAPER` conventions; state the assumption once in the reviewer note |
| Audience sophistication | Preferred | Business-literate, not technical |
| House style / prior examples | Preferred | Use §9 rules |
| Constraints (what the client already rejected) | Preferred | Ask once — this changes the argument, not just wording |

**Required inputs follow their ask/stop rules.** If a required input is missing, ask (or stop) as the "If missing" column says. Only preferred inputs get defaults. Do not assume a required input and proceed.

---

## 5. Workflow

### Step 1 — Decision and audience contract
```
Decision:                          <what is being decided>
Decision-maker:                    <role, what they care about, what they resist>
What they must believe to decide:  <2–3 beliefs>
What would make them say no:       <strongest objection>
```
**Complete when:** you can name the objection the document must survive.

### Step 2 — Thesis
One sentence: **answer-shaped, falsifiable, containing the tension it survives.**

> "Enter Germany through a channel partner rather than direct sales, because the segment rewards local implementation support we do not have."

Tests: does it name an action? a reason? the obstacle? could someone disagree?
"There are opportunities and challenges" is not a thesis. Rewrite or return to research.

**Complete when:** one sentence exists and a reviewer could argue against it.

### Step 3 — Argument architecture
Build the skeleton as claims, not topics:

```
Thesis
├─ Because 1  ← S-IDs
│   └─ Objection 1a → response
├─ Because 2  ← S-IDs
└─ Therefore: recommendation + conditions
```

- Each "because" is a claim with evidence.
- MECE: the becauses justify the thesis without overlap.
- **Name the strongest counter-argument.** If the document ignores it, the client supplies it in the meeting.
- Mark `INFERENCE` links — that is where a reviewer pushes.

**Complete when:** the strongest objection has a written response.

### Step 4 — Evidence map and gap check
`Section → Claims → S-IDs → Type → Status (supported / single-source / gap)`

Every `gap` is resolved or converted to `[DATA NEEDED: …]` with a stated effect on confidence. Do not write around a gap and hope nobody notices.

**Complete when:** zero unsupported claims remain in the argument chain.

### Step 5 — Outline gate ⏸
For documents > ~1,500 words: output the outline (section → argument → IDs → length) and stop. Continue on approval or explicit "just draft it".

### Step 6 — Draft with budgets
Per §7. A section that overshoots is usually two sections or one unresolved question.

### Step 7 — Consistency and traceability pass
- Every number appears in the ledger or is derived and labelled.
- Same figure, same value everywhere (search the digits).
- No claim typed higher than the ledger allows.
- Comparative judgements between hypotheses ("X explains more than Y") are `INFERENCE`: label them and name the basis. *(v0.2.0 — W2 test.)*
- Claim types are only the five in `shared/evidence-format.md`. Anecdote is a `FACT` about what someone reported, at Low confidence — not a new type.
- Executive summary matches the body, caveats included.
- Recommendations trace to findings.

### Step 8 — Readability pass
- First sentence of each section carries its conclusion.
- Cut throat-clearing, stacked hedges, nominalisations.
- One idea per paragraph; ≤5 sentences; ~25 words average.
- Active voice by default.
- **Specificity test:** delete any sentence that would survive unchanged in another client's document.
- **Proof pass, last:** spelling, grammar, consistent terms. A consultant interviewed in Week 1 named this the most common avoidable failure.

### Step 9 — Quality gate and review readiness
Run §10. Put the one line an LC should scrutinise most in the reviewer note after `---`, never inside the client text.

---

## 6. Argument rules

| Rule | Fails when |
|---|---|
| Answer first | The conclusion appears after the evidence |
| Quantify or qualify, never imply | "Materially" with no basis |
| One claim per sentence | Three "and"s hide a weak link |
| No unsupported comparatives | "Faster" / "cheaper" / "more mature" with no reference point |
| Every recommendation has a mechanism | "Partner", "invest", "optimise" |
| Numbers carry unit + period + source | "(€2.1B, 2025, S4)" |
| No fabricated specificity | A percentage invented to sound rigorous |
| Say the uncomfortable thing once, clearly | A soft-pedalled risk becomes a lost engagement |
| No framework name-dropping | Porter/3Cs announced rather than used to discriminate |
| No ritual section | A section that exists because a template had it |

### Recommendation anatomy (all six, or it is not a recommendation)

| Element | Example |
|---|---|
| **Actor** | Product team |
| **Action** | Launch a same-day payroll-correction add-on |
| **Mechanism** | Sell through two accounting firms so onboarding risk sits with the relationship holder |
| **Sequence** | Phase 1 Q1–Q2, Phase 2 Q3, Phase 3 Q4 |
| **Expected effect** | +€2 PEPM on 30% of accounts by end of Q4 |
| **Kill criteria** | Referral conversion <15% by end of Q2 |

Expected effect and kill criteria must be **measurable and dated** (the SMART test consultants already apply), and every threshold is **anchored** to a ledger value or a decision variable named in the document ("committed annual revenue ≥ build cost", "price below the €6 PEPM floor (S4)"). Never invent a figure to make a threshold numeric. *(v0.2.1 — W1-b invented a €120k cap.)*

---

## 7. Structure patterns

Do not force one template. Pick a pattern and justify it in one line.

| Pattern | Use when | Shape |
|---|---|---|
| **Pyramid (answer-first)** | Senior reader, decision known, time-poor | Answer → 3 reasons → evidence → implications |
| **SCQA** | Audience must accept the problem before solutions | Situation → Complication → Question → Answer |
| **Findings-led** | Client asked "what did you learn?" | Context → findings ranked → implications → options |
| **Options appraisal** | Real choice between alternatives | Criteria → options → comparison → recommendation |
| **Diagnostic** | Problem known, cause unknown | Symptom → hypotheses → evidence → cause → fix |

Full section-by-section table with typical lengths and failure modes: `references/structure-patterns.md`.

Section budget guidance (strategy whitepaper): exec summary ≤1 page; problem/scope ½; method ½; findings 1–2; analysis (core); implications ½; recommendations 1; implementation 1; risks ½; limitations ½.

---

## 8. Claim typing and traceability

| Type | In prose |
|---|---|
| `FACT` | "EU CSRD covers large undertakings from FY2024 (S1)." |
| `ESTIMATE` | "€6–9 PEPM `[ESTIMATE: 5 price pages, S4–S8]`" |
| `ASSUMPTION` | "We assume the budget cycle closes in Q1; unvalidated." |
| `INFERENCE` | "This suggests…", "We infer…" |
| `RECOMMENDATION` | "We recommend…" + evidence + conditions |

**Forbidden:** an `ASSUMPTION` that reappears as a `FACT`. This is the most common and most damaging failure in AI-drafted consulting documents. Re-scan every assumption in the final pass.

---

## 9. Writing rules

**Use:** "we recommend", "the evidence suggests", "this assumes", "we could not establish".
**Avoid:** "it is clear that", "studies show", "best-in-class", "leverage synergies", "robust framework", "holistic".

Voice: direct, specific, unhurried. A consultant who knows the answer does not need adjectives.

Sentence-level detail and the full editing pass: `references/style-and-editing.md`.

---

## 10. Quality gate

- [ ] Thesis is one sentence, action-shaped, falsifiable
- [ ] Executive summary alone would let a busy decision-maker decide
- [ ] Every recommendation traces to findings and states a mechanism (+§6 anatomy)
- [ ] Alternatives are steelmanned; strongest objection answered
- [ ] Every number has unit, period, and source or an `[ESTIMATE]` basis
- [ ] No assumption silently promoted to fact
- [ ] Findings ranked by decision relevance, not discovery order
- [ ] Risks linked to the thesis, with early-warning signals
- [ ] Limitations specific; weakest link named
- [ ] No paragraph transferable to another client's document
- [ ] Length matches the mode (§3); nothing included to show effort
- [ ] Structure justified; no mode or pattern label in the document

---

## 11. Common mistakes

| Mistake | Why LCs reject it | Fix |
|---|---|---|
| Topic titles and topic sections | Reader cannot see the conclusion | Claim-based headings |
| Recommendation without mechanism | Client asks "how" | §6 anatomy |
| Description instead of analysis | Reads like a school report | Every paragraph answers "so what" |
| Strawman alternatives | Client names the missing option | Steelman, then explain why it loses |
| Data dump | Decision-maker cannot find the answer | Detail to appendix |
| Assumption laundering | Undermines every other number | Re-scan assumptions |
| Exec summary as table of contents | Wastes the only page guaranteed to be read | Thesis + findings + recommendation + condition |
| Over-length | Signals unclear thinking | Budget per section; cut |
| Hedging cascade | Reader loses the position | Position, then confidence and conditions |
| Ignoring workstream scope | PM rejects on alignment | Check the deliverable requirement first |
| Memo padded into whitepaper | Reader stops at page 3 | Choose the mode before drafting |
| Spelling and grammar errors | Easiest error for a client to spot | Proof pass (§5 step 8) |
| Unlabelled comparison of hypotheses | Smuggles a conclusion past the evidence | Type it `INFERENCE`, name the basis |

---

## 12. Handoff

To `consulting-slides`: thesis (one sentence), 3–5 ranked supporting arguments, strongest objection + answer, recommendation + sequence, the S-IDs behind each argument, any `[DATA NEEDED]` a chart would otherwise require.

Do not hand over prose to be "cut down". Hand over the argument; the slide skill builds the storyline.

---

## 13. References (optional depth — this file works without them)

| File | Contains |
|---|---|
| `references/structure-patterns.md` | Section-by-section table per pattern, lengths, failure modes |
| `references/style-and-editing.md` | Editing passes, sentence diagnostics, AI-prose tells to remove |
| `examples/example-whitepaper.md` | Outline + exec summary + one body section on a synthetic client |
