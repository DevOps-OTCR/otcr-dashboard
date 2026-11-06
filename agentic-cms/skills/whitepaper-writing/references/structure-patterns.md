# Structure Patterns

Pick a pattern, then commit. Do not blend two patterns in one document — the reader loses the thread at the seam.

---

## 1. Choosing

| If the reader… | …and the document must… | Use |
|---|---|---|
| Decides, is time-poor, knows the problem | recommend | **Pyramid** |
| Must first accept that there is a problem | reframe | **SCQA** |
| Asked "what did you find?" | inform | **Findings-led** |
| Faces a genuine choice | compare | **Options appraisal** |
| Knows the symptom, not the cause | diagnose | **Diagnostic** |

---

## 2. Pyramid (answer-first)

| Section | Job | Typical length | Failure mode |
|---|---|---|---|
| Executive summary | Answer + three reasons + ask | ≤1 page | Becomes a table of contents |
| Recommendation | What, who, when, expected effect | ½ page | No mechanism |
| Because 1 | Claim + evidence + implication | 1–2 pages | Evidence without implication |
| Because 2 | … | 1–2 pages | Overlaps because 1 |
| Because 3 | … | 1–2 pages | Weakest link hidden |
| Objection + response | Steelman and answer | ½ page | Strawman |
| Implementation | Sequence, owners, dependencies | 1 page | Phase list with no gates |
| Risks / kill criteria | What would make this wrong | ½ page | Unranked list |
| Limitations | Weakest evidence link | ½ page | Generic caveats |

Best for: board papers, final whitepapers, LC review.

---

## 3. SCQA

| Section | Job | Failure mode |
|---|---|---|
| Situation | Shared, uncontested facts | Arguing the situation |
| Complication | What changed / what is at stake | A complication the client does not accept |
| Question | The decision this forces | A question nobody is asking |
| Answer | Thesis + supporting argument | Answer appears before the question is accepted |

The Question section is the hinge. If the client does not accept the question, no amount of evidence will move them.

Best for: new topics, contested problem framing, initial deliverables.

---

## 4. Findings-led

| Section | Job | Failure mode |
|---|---|---|
| Context and method | What was examined, how | Method longer than findings |
| Findings, ranked | 4–6 findings by decision relevance | Discovery order; 15 findings |
| What the findings imply | Interpretation | Findings restated |
| Options | What could be done | Options with no criteria |
| Recommendation (light) | Direction, if in scope | Over-claiming from a findings brief |

Best for: research reports, `INITIAL_WHITEPAPER`, client-commissioned landscape work.

---

## 5. Options appraisal

| Section | Job | Failure mode |
|---|---|---|
| Decision and criteria | What is being chosen; weighted criteria | Criteria invented after the options |
| Options | 3–4 genuinely distinct options | Two options and a strawman |
| Comparison | Criteria × options, with evidence | Scores with no basis |
| Recommendation | Winner + why + conditions | Winner announced before comparison |
| Implementation | Sequence and cost | Cost omitted |
| Risks | Per option, plus the chosen path | Only the chosen option's risks |

Best for: market entry, partnership vs build, investment cases.

---

## 6. Diagnostic

| Section | Job | Failure mode |
|---|---|---|
| Symptom | Observed, quantified | Vague ("performance issues") |
| Hypotheses | 3–5 candidate causes, MECE | One hypothesis, then evidence for it |
| Evidence | What discriminates between hypotheses | Evidence that fits all of them |
| Cause | The surviving explanation | Correlation asserted as cause |
| Fix | Intervention + mechanism | Fix that addresses a symptom |
| Test | How to confirm the diagnosis cheaply | No falsification step |

Best for: performance problems, customer experience, operational reviews.

---

## 7. Section budget (strategy whitepaper, ~2,500 words)

| Section | Words | Share |
|---|---|---|
| Executive summary | 300 | 12% |
| Problem / scope | 200 | 8% |
| Method | 150 | 6% |
| Findings | 600 | 24% |
| Analysis / implications | 600 | 24% |
| Recommendations | 350 | 14% |
| Implementation | 200 | 8% |
| Risks / limitations | 100 | 4% |

No section is mandatory. A section that exists because a template had it is a defect — name the job it does or delete it.

---

## 8. Outline template to fill before drafting

```
Mode: memo | whitepaper | report | revision
Reader: <role>          Decision: <what they must decide>
Thesis: <one sentence>
Structure: <pattern> because <reason>

S1 <claim-based heading>   | job: <what it proves> | evidence: S1,S4 | ~<words>
S2 ...
Objection: <strongest>     | answered in S<n>
Ask: <what the reader should do next>
```
