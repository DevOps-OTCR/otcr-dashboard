# Example — Client Call Summary

> **Synthetic example. Not a real client, not real data.**
> Harbor Lane Outfitters is invented, and so is every speaker, quote and date below. The transcript is a constructed illustration, not a recording.
> **Purpose:** show the output shape, ask classification, direction handling and what the `../SKILL.md` skill is intended to leave out.
> **Note:** the transcript is kept short on purpose so the classification of each line can be checked by eye against §5 of the skill.

---

**Synthetic transcript (call date Mon 10 Nov 2025, 10:00, 34 minutes)**

```
[10:00] Priya Raman (OTCR, PM): Thanks for making time. Usual shape — where the FY26 planning cycle stands and what you need from us.
[10:01] Marcus Feld (Client, CFO): Fine. Biggest thing is the board pack on 24 November. I need something that shows the store-refit spend against the plan, not just a finance view.
[10:02] Priya Raman: Understood. So a spend view by refit wave, not by cost centre.
[10:03] Marcus Feld: By wave. And it has to reconcile to the numbers in the capital plan, or the board will shred it.
[10:04] Lena Okafor (Client, Head of Retail Ops): The cost-centre view is useless to us because the refits are funded across three centres.
[10:05] Priya Raman: We can produce that. I'll need the capital plan version that went to the board in June, not the working file.
[10:06] Marcus Feld: We'll get you that. Probably by Wednesday.
[10:07] Priya Raman: Wednesday works if it's the signed version.
[10:08] Lena Okafor: Also — while we're here — could you take a look at the store-level P&L template? It was built for twelve stores and we now have nineteen.
[10:09] Priya Raman: That's a bigger piece. What do you need — a fix or a rebuild?
[10:10] Lena Okafor: A fix that doesn't fall over when we add the next four. Arjun's been hacking it and it's in a state.
[10:11] Owen Mercer (OTCR, Analyst): I can review the template and come back with what a rebuild would cost you in effort.
[10:12] Lena Okafor: That would help. No rush before the board pack though.
[10:13] Marcus Feld: One more thing. I'll send you the Q3 stock-loss figures — we pulled them for the auditors and they're cleaner than the management numbers.
[10:14] Priya Raman: That's useful, we'll use them for the margin bridge.
[10:15] Marcus Feld: They're on the shared drive, I'll point you at the right folder.
[10:16] Owen Mercer: Do you have the store-count history in the same place? We're trying to pin down when the nineteen took effect.
[10:17] Marcus Feld: I'll dig it out. Might take a few days, the opening dates are in a spreadsheet someone else owns.
[10:18] Lena Okafor: It would be lovely someday to have all this in one dashboard, but that's a different conversation.
[10:19] Priya Raman: Noted, and I'd agree — but not this quarter.
[10:20] Marcus Feld: On the board pack, can you also give me a one-page summary up front? Last time the pack went straight into the detail and the board disengaged.
[10:21] Priya Raman: A one-pager up front, yes.
[10:22] Lena Okafor: And we should probably think about whether the refit waves should be re-phased. Not now — after the board.
[10:23] Priya Raman: Happy to pick that up in December.
[10:24] Marcus Feld: The board pack is the priority. Everything else can wait until the 24th.
[10:25] Priya Raman: Understood. So: spend view by wave, reconciled to the capital plan, one-page summary up front.
[10:26] Marcus Feld: Yes. And bring it to me for a read on Friday before it goes anywhere.
[10:27] Priya Raman: Friday for a read-through — we'll send the draft to you Thursday night.
[10:28] Marcus Feld: Good.
[10:29] Owen Mercer: On the P&L template, I'll send over the review within the week, and you can tell me whether to proceed.
[10:30] Lena Okafor: Fine. Send it to me and I'll copy Marcus.
[10:31] Priya Raman: Last thing — who signs off the final pack?
[10:32] Marcus Feld: Me and the chair. The chair sees it on the 22nd.
[10:33] Priya Raman: Then we work to the 22nd, not the 24th. Thanks both.
[10:34] Marcus Feld: Agreed. Bye.
```

---

```markdown
# Client call summary — Harbor Lane Outfitters, Mon 10 Nov 2025
Attendees: Priya Raman (OTCR, PM); Owen Mercer (OTCR, Analyst); Marcus Feld (Client, CFO); Lena Okafor (Client, Head of Retail Ops)

## 1) What happened
- Purpose: review where the FY26 planning cycle stands and what the client needs from OTCR before the November board (open, 10:00–10:01).
- Decided: the board pack will show store-refit spend **by refit wave**, reconciled to the capital plan, with a one-page summary up front (10:03, 10:25–10:26).
- Decided: the working deadline is the chair's review on "the 22nd", not the board date of the 24th (10:32–10:33). Marcus Feld and the chair sign off the final pack (10:32).
- Agreed next steps: OTCR sends a draft to Marcus on Thursday night for a Friday read-through; Owen reviews the store-level P&L template and sends a review within the week (10:26–10:29).
- We infer: the P&L template work is scoped as an assessment, not a rebuild — Lena accepts "a fix", Owen offers a review with a rebuild-cost view, and neither confirms a rebuild.

## 2) Who said what
- Marcus Feld: the board pack is the priority and everything else waits until the 24th. Asked for a spend view by refit wave that reconciles to the capital plan, and for a one-page summary up front because "last time the pack went straight into the detail and the board disengaged".
- Lena Okafor: the cost-centre view is unusable because refits are funded across three centres. Asked OTCR to look at the store-level P&L template, which was "built for twelve stores and we now have nineteen". Added that any re-phasing of refit waves is a conversation for after the board.
- Priya Raman: accepted the by-wave view and the one-pager; asked for the signed June capital plan, not the working file; set the working deadline to the 22nd once told the chair reviews on that date.
- Owen Mercer: offered to review the P&L template and come back with the effort cost of a rebuild; asked for the store-count history.
- Unidentified speaker: none — all lines carry a speaker label.

## 3) Client asks of us
| # | Ask | Requested by | Owner on our side | Due | Evidence |
|---|---|---|---|---|---|
| 1 | Produce a board-pack spend view of store-refit spend by refit wave, reconciled to the capital plan | Marcus Feld | [not stated] | Chair review on "the 22nd" (call date Mon 10 Nov → 22 Nov); board 24 November | "By wave. And it has to reconcile to the numbers in the capital plan" / 10:03; "The chair sees it on the 22nd" / 10:32; "Then we work to the 22nd, not the 24th" / 10:33 |
| 2 | Add a one-page summary up front of the board pack | Marcus Feld | [not stated] | [not stated] | "can you also give me a one-page summary up front?" / 10:20 |
| 3 | Send a draft of the pack to Marcus on Thursday night for a Friday read-through | Marcus Feld | [not stated] | Thursday night (call date Mon 10 Nov → 13 Nov) | "bring it to me for a read on Friday" / 10:26; "we'll send the draft to you Thursday night" / 10:27 |
| 4 | Review the store-level P&L template and report the effort cost of a rebuild | Lena Okafor | Owen Mercer | Within the week | "could you take a look at the store-level P&L template?" / 10:08; "I can review the template and come back with what a rebuild would cost you in effort" / 10:11; "That would help" / 10:12; "I'll send over the review within the week" / 10:29 |

## 4) Our asks of the client
| # | Ask | Asked by | Client owner | Due | Evidence |
|---|---|---|---|---|---|
| 1 | Send the signed June capital plan (not the working file) | Priya Raman | [not stated] | Wednesday (call date Mon 10 Nov → 12 Nov) | "I'll need the capital plan version that went to the board in June, not the working file" / 10:05; "We'll get you that. Probably by Wednesday" / 10:06 |
| 2 | Send the Q3 stock-loss figures and point OTCR at the right shared-drive folder (volunteered) | Marcus Feld (volunteered) | Marcus Feld | [not stated] | "I'll send you the Q3 stock-loss figures" / 10:13; "I'll point you at the right folder" / 10:15 |
| 3 | Provide the store-count history, including when the nineteenth store opened | Owen Mercer | Marcus Feld | A few days, exact date [not stated] | "Do you have the store-count history…" / 10:16; "I'll dig it out. Might take a few days" / 10:17 |

## 5) Open questions / unclear items
- Tentative: "we should probably think about whether the refit waves should be re-phased. Not now — after the board" by Lena Okafor (10:22), with Priya offering to "pick that up in December" (10:23) — not a confirmed ask.
- [UNCLEAR: soft date — "Probably by Wednesday"] — Marcus Feld's commitment on the capital plan (10:06). Priya only confirmed that Wednesday works "if it's the signed version" (10:07).
- [UNCLEAR: scope not stated] — whether the P&L template work is a fix or a rebuild. Owen's review (ask 4, §3) is to inform that decision; no rebuild is agreed.
```

---

**Reviewer note:** Check asks 1–3 in §3 first — they are the board-pack commitments and none carries a named OTCR owner in the transcript, so the PM/LC should confirm who holds each before the Thursday-night draft. Second check: §4 ask 1 has Client owner `[not stated]`, because Marcus says "We'll get you that" (10:06) — first-person plural names no individual under §5.4, so the PM/LC should confirm who on the client side owns sending the signed capital plan. Third check: the capital plan due date rests on "Probably by Wednesday" (10:06), so treat Wednesday as a soft date until the file arrives. Assumptions made: relative dates converted against the stated call date of Mon 10 Nov 2025 and shown in both forms; "the 22nd" read as the next 22nd after the call date and shown in both forms (§5.5); "within the week" and "a few days" were left unconverted because neither has a single calendar date; the meeting ran 10:00–10:34 as the transcript timestamps show; combined timestamps (e.g. 10:26–10:29) span adjacent lines.

---

## What was left out and why

**The "one dashboard" remark (10:18) is not an ask.** Lena Okafor says "it would be lovely someday to have all this in one dashboard" and Priya answers "not this quarter". Under §5.1 that is a musing about a future state, declined on the call, with no deliverable, owner or date attached. It is not in §3 or §4. It would only belong in *What happened* if the call had decided something about it, which it did not.

**The refit re-phasing (10:22) stays in §5, not in a table.** Lena frames it as "we should probably think about whether" — a tentative or conditional item by §5.3. Priya's "happy to pick that up in December" is an offer, not a commitment accepted by the other side, and no date was fixed. It is therefore listed as tentative in §5 and nowhere else; promoting it to an ask would invent a commitment the call did not make.

**The stock-loss figures (10:13–10:15) *are* an ask, despite not being requested.** Marcus volunteers them unprompted. Direction is decided by who owes the action (§5.2), and the client owes it, so it sits in *Our asks of the client*, tagged as volunteered — the only item carrying that marker, because it is the only one OTCR had not asked for. It gets `[not stated]` for due date because he gives none. The store-count history (10:16) and the signed capital plan (10:05) were both OTCR requests, so neither is marked volunteered.

**The sign-off path and the missing owners are not in §5.** Who signs off — Marcus Feld and the chair, with the chair seeing the pack on the 22nd — is a clearly stated fact (10:32), so it sits in *What happened* and is not an open question. The absent OTCR owners on asks 1–3 are empty cells (`[not stated]` by §5.4), not unclear items; they stay `[not stated]` in the table and are flagged for the PM/LC in the reviewer note, not repeated as Open questions.

**Small talk and closings are not summarised.** The opening and sign-off carry no content beyond the purpose line already in *What happened*; reproducing it would fail the two-minute-read test in §2.
