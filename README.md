# QA: PR #168 — real Lumen runs, with vs without the skill

DeepSeek V4.1 Flash on Illinois Lumen, run 2026-11-06. Same prompt with and without this PR's skill files (prompts in runs/prompts.json; raw outputs in runs/). Automatic checks below; open qa-168.html or watch skills-168-qa.mp4 for the full side-by-side.

| Task | Check | Without skill | With skill (this PR) |
|---|---|---|---|
| Research brief | Evidence ledger with claim IDs (S#/I#) | FAIL — no claim IDs | PASS — I1, I2, I1 |
| Research brief | Marks missing data instead of inventing it | FAIL — none | PASS — not established |
| Research brief | States confidence or assumptions | PASS — confidence/assumption language present | PASS — confidence/assumption language present |
| Whitepaper executive summary | ≤ 350 words | PASS — 322 words | FAIL — 427 words |
| Whitepaper executive summary | Recommendation in the first 60 words | FAIL — no recommendation in first 60 words | PASS — should pursue |
| Slide storyboard | Titles are full-sentence takeaways | FAIL — 0 of 6 titles are sentences | PASS — 6 of 6 titles are sentences |
