# Flag-off staging clip (11 Nov 2026)

Signed-out staging, before the Week 1 integration is deployed.

- https://otcr-dashboard-staging.onrender.com/sign-in/ shows Sign in with NetID. OTCR Bot is not on the page.
- https://otcr-dashboard-staging-api.onrender.com/agentic-cms/status returned HTTP 404.
- The sign-in page loaded again after that.

Playwright recorded the browser. ffmpeg encoded this mp4. A screen-device capture did not start: ffmpeg found no Capture screen device, and `screencapture -v` did not write a file.

The flag-on walkthrough needs Isaiah to set `LUMEN_API_KEY`, `AGENTIC_CMS_ENABLED=true`, and `AGENTIC_CMS_ALLOWED_EMAILS` on `otcr-dashboard-staging-api` only. No client project is in this clip.

## Recheck after staging promotion

Recorded again once staging was on `e41f59a83a1b8fa58529148fce0617e14e51ddff`.

- `flag-off-recheck.mp4` is the same signed-out path, with the script asserting HTTP 404 and zero "OTCR Bot" text.
- `chrome-sign-in.png`, `chrome-agent-404.png`, and `chrome-build.json.png` are Chrome DevTools captures of the sign-in page, the 404 body, and `__build.json`.
