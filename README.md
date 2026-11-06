# QA assets: Team schedule (PR #173, optional, from PM interview)

Playwright run on the local browser harness (`frontend/tests/navigation-browser`, mocked API). Re-run from `frontend/`: `node team-schedule-qa.cjs <out-dir>`. The same flows run in CI as `tests/team-schedule-browser.test.cjs` (6 tests).

| File | Step |
|---|---|
| 01-google-tab.png | Google Calendar stays the default tab |
| 02-team-schedule.png | Week view; Team Two (not managed) items are not draggable |
| 03-dragged.png | PM drags Market sizing research Wed to Fri; saved at 5 PM; Overview card updates |
| 04-keyboard.png | Alt+ArrowRight moves Client draft deck; focus kept |
| 05-rejected-reverted.png | Server returns 403; red error; item reverted |
| 06-month-view.png | Month view |
| 06-back-to-google.png | Back to Google tab; iframe still mounted |
| team-schedule-qa.mp4 | Full recording |
