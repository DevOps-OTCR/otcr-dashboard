# QA assets: Team schedule (optional PR, from PM interview)

Playwright run on the local browser harness with a mocked API (`frontend/tests/navigation-browser`).
Re-run from `frontend/`: `node team-schedule-qa.cjs <out-dir>`.

| File | Step |
|---|---|
| 01-google-tab.png | Google Calendar stays the default tab |
| 02-team-schedule.png | Team schedule week view; Team Two (not managed) items are not draggable |
| 03-dragged.png | PM drags Market sizing research Wed to Fri; PATCH sent, status shown |
| 04-keyboard.png | Alt+ArrowRight moves Client draft deck; focus kept |
| 05-rejected-reverted.png | Server returns 403; red error, item reverted |
| 06-back-to-google.png | Back to Google tab; iframe still mounted |
| team-schedule-qa.mp4 | Full recording |
