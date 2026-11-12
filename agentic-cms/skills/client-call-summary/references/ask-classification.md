# Ask Classification

Decision procedure for turning a candidate utterance into a row, an open question, or nothing at all. **If this file and `SKILL.md` differ, `SKILL.md` wins** — this file only expands §4–§5 of `SKILL.md` with worked examples; it adds no operative rule.

---

## 1. The decision procedure

Run every candidate utterance through the tests in order. Stop at the first test it fails.

| # | Test | Question | Fail → |
|---|---|---|---|
| 1 | **Completed?** | Is the action already done in the transcript ("I sent it yesterday")? | Not an ask → What happened |
| 2 | **Directed?** | Is it addressed to the other side (request, commitment, or accepted commitment)? | Off-hand remark → not an ask; may go in Who said what |
| 3 | **Firm?** | Is it stated as a definite request or commitment, not hedged? | Tentative → Open questions, flagged |
| 4 | **Owes?** | Can you tell which side owes the action? | `[UNCLEAR: direction]` → Open questions |
| 5 | **Evidenced?** | Can you point to a quote or timestamp? | It is not an ask — move it out or delete it |

Only an utterance that passes all five becomes a table row.

---

## 2. Direction by who owes the action

Direction is set by **who must deliver**, never by who is speaking. Worked both ways (the Owner column reflects SKILL.md §5.4 — a plural like "we'll" fills no owner):

| Speaker | Utterance (synthetic) | Owes | Table | Owner (if this row) |
|---|---|---|---|---|
| Client | "Could you rebuild the model on the new price list?" | OTCR | Client asks of us | `[not stated]` |
| OTCR | "We'll turn the deck around by Tuesday." | OTCR | Client asks of us | `[not stated]` — "we'll" names no owner |
| OTCR | "Can you send the raw export?" | Client | Our asks of the client | `[not stated]` |
| Client | "I'll get you the churn numbers by Friday." | Client | Our asks of the client | the client speaker ("I'll") |
| Client | "Please add a one-page summary up front." | OTCR | Client asks of us | `[not stated]` |
| OTCR | "We'll need your sign-off on the schema." | Client | Our asks of the client | `[not stated]` — "we'll" names no owner |

A request and a volunteered commitment point the same way when the same side owes the action. A "we'll …" / "we" / "our team" line never fills an owner, whoever says it; only "I"/"I'll"/"me" or an explicit named assignment does (SKILL.md §5.4). Requests like "Could you…", "Can you send…" or "Please add…" name no owner unless someone later says "I'll" or is named, so `[not stated]` is right for them as standalone lines.

---

## 3. Signal phrases

| Firm | Tentative / conditional | Musing / hypothetical |
|---|---|---|
| "Please send…" | "Maybe send…" | "It would be nice someday…" |
| "Can you share…" | "If budget allows, we could…" | "Imagine if we had…" |
| "I'll send X by Friday." | "Let me check whether we can…" | "Back in 2019 we used to…" |
| "Yes, we'll do that." | "We could consider…" | "Anyway, small talk…" |
| "We'll need X from you." | "Potentially…" / "possibly" | — |

Firm phrases carry a definite actor and a definite deliverable. Anything modal, hedged, or conditional is tentative until confirmed later in the call. The presence of a condition, check or follow-up decides musing vs tentative: a hedge about real project work that carries one is tentative → Open questions; a wish with no condition, check or follow-up is a musing → omitted (SKILL.md §5.1).

---

## 4. Tentative-then-confirmed and confirmed-then-withdrawn

| Pattern | Handling | Evidence cell |
|---|---|---|
| Tentative at 00:04, confirmed at 00:31 | Later firm statement wins → goes in the table | Confirming line, quote or timestamp |
| Tentative and never confirmed | Stays in Open questions, flagged as tentative | Tentative line |
| Confirmed at 00:10, withdrawn at 00:22 ("actually, hold off") | Applying §5.3 of SKILL.md (the later firm statement wins): the later firm withdrawal ends the ask → not an ask; listed in Open questions only if it is unclear whether it was withdrawn | Withdrawal line |
| Confirmed, then re-scoped to a different deliverable | Record the final scope only | Line where scope settled |

The **latest state in the call** is the truth. Do not list both the original and the final form as two asks.

---

## 5. Owner and due extraction

SKILL.md §5.4's test is **literal**: Owner and Client owner are filled only by (a) the first-person singular — "I", "I'll", "me" — or (b) an explicit named assignment ("X will own", or "X, can you own that?" followed by a yes). "We", "we'll", "we are", "our team" fill no owner → `[not stated]`, whoever says it (including the PM or another senior person). "You'll" said to one person in a group, or "the team" without a named owner → `[not stated]`.

| Field | Fill when | Otherwise |
|---|---|---|
| `Owner` (our side) | "I"/"I'll"/"me" speech, or an explicit named assignment of the action | `[not stated]` — never infer from role; "we'll"/"we"/"our team" does not fill it |
| `Client owner` | "I"/"I'll"/"me" speech, or an explicit named assignment | `[not stated]` — never infer from role |
| `Due` | A date or relative date is stated for that action | `[not stated]` |

Relative dates stay **verbatim**. Convert only with a supplied call date, showing both — e.g. `"by Friday (call date Fri 7 Nov → 14 Nov)"`. No call date → verbatim, and note it in the reviewer note.

---

## 6. Speaker attribution edge cases

| Case | Handling |
|---|---|
| Unlabelled speaker | `Unidentified speaker` — do not guess from context |
| Two speakers with the same first name | Keep whichever label distinguishes them ("Sam (client)", "Sam (OTCR)"); if labels are identical, `[UNCLEAR: two speakers share label "Sam"]` |
| Auto-transcription error in a name | Use the label as written; if it is obviously garbled, `[UNCLEAR: garbled label — "Jhon"]`, and do not normalise to a guessed real name |
| Garbled in the ask itself | `[UNCLEAR: garbled — "we'll send the deck by…" timestamp 12:34]` in the Evidence cell |
| Speaker label missing for half the call | Split rows by what is attributable; `Unidentified speaker` for the rest — never merge two speakers into one row |

All examples above are synthetic. Real names, companies, and figures do not appear in this reference and must not be introduced from it.
