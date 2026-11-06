# QA: PR #171 — real Lumen runs, with vs without the skill

DeepSeek V4.1 Flash on Illinois Lumen, run 2026-11-06. Same prompt with and without this PR's skill files (prompts in runs/prompts.json; raw outputs in runs/). Automatic checks below; open qa-171.html or watch skills-171-qa.mp4 for the full side-by-side.

| Task | Check | Without skill | With skill (this PR) |
|---|---|---|---|
| PM-scoped research plan | Lists "Sources to open and check" | FAIL — section missing | PASS — section present |
| PM-scoped research plan | Restates the PM scope (lb/week, 2-year) | PASS — scope restated | PASS — scope restated |
| PM-scoped research plan | Names data tables to find | PASS — data table references present | PASS — data table references present |
| PM-scoped research plan | Does not claim sources were verified | PASS — no verification claim | PASS — no verification claim |
