# Flag-off staging clip (11 Nov 2026)

Signed-out staging, before the Week 1 integration is deployed.

- https://otcr-dashboard-staging.onrender.com/sign-in/ shows Sign in with NetID. OTCR Bot is not on the page.
- https://otcr-dashboard-staging-api.onrender.com/agentic-cms/status returned HTTP 404.
- The sign-in page loaded again after that.

Playwright recorded the browser. ffmpeg encoded this mp4. A screen-device capture did not start: ffmpeg found no Capture screen device, and `screencapture -v` did not write a file.

The flag-on walkthrough needs #183 on staging and Isaiah to set `LUMEN_API_KEY` on `otcr-dashboard-staging-api`. No client project is in this clip.
