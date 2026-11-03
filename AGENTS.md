# CMS development

- Read README.md and use the checks in `.github/workflows/pr-validation.yml`.
- All Agentic CMS work must follow [docs/agentic-cms.md](docs/agentic-cms.md).
  Keep new AI endpoints, integrations and jobs in `backend/src/agentic-cms/`,
  UI in `frontend/features/agentic-cms/`, and skills in `agentic-cms/skills/`.
- Keep `AGENTIC_CMS_ENABLED=false` as the default. The backend controls access;
  do not add a browser flag, local-storage bypass, or separate provider switch.
- A disabled feature must leave existing consulting workflows usable and must
  not call a model, read client files for AI, post comments, or run AI jobs.
  Route guards do not cover constructors, scheduled jobs, or separate servers;
  check `FeatureFlagsService.assertAgenticCmsEnabledFor(user.email)` before
  starting those operations and recheck before an external write.
- Preserve CMS user/project permissions after the feature check. A pilot
  allowlist is not permission to view another project's records.
- Use your own Lumen key locally; the shared backend uses Isaiah's hosted key.
  Keep credentials and client materials out of Git, browser bundles and logs.
- Include flag-off and flag-on evidence in Agentic CMS PRs. Boundary changes
  need Isaiah's review; do not remove a failing check to make the PR pass.
- Do not deploy or modify live service configuration unless explicitly asked.
