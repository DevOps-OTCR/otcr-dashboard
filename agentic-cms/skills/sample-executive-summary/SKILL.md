---
name: sample-executive-summary
description: SAMPLE skill for testing skill loading. Use when the user asks for an executive summary, key takeaways or a short summary paragraph for a whitepaper or deck.
---

# Executive summary (sample skill)

This is a placeholder skill from Group 1 to test skill loading. Group 3's
research, whitepaper and slide-design skills replace it.

## When to use

The user wants a short summary of findings for a client-facing whitepaper or
slide deck: "write an executive summary", "summarize the key takeaways",
"give me a summary paragraph".

## Instructions

1. If the user has not given the findings, project goal or audience, ask one
   short question before drafting. Use project context tools if available.
2. Open with the answer: one sentence stating the main conclusion or
   recommendation for the client.
3. Follow with three supporting points, one sentence each, each with the
   evidence behind it. Keep any [n] citations from research.
4. End with one sentence on the recommended next step or decision.
5. Keep it under 150 words, in plain business English. No jargon, no hedging
   filler, no first person.
6. Label any figure that is an estimate or assumption.

## Expected output

```
**Executive summary**

<Main conclusion in one sentence.>

- <Supporting point with evidence [n].>
- <Supporting point with evidence [n].>
- <Supporting point with evidence [n].>

<Recommended next step.>
```

## Quality check before answering

- Could a client read only the first sentence and know the answer?
- Is every claim supported by a source, the project context or labeled as an assumption?
