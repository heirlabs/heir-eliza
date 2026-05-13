# HEIR — Copilot / Codex instructions

1. Run `git remote -v` before editing. Repos: `heirlabs/web` (workspace), `heirlabs/heir-front`, `heirlabs/heir-back`, `heirlabs/heir-mcp`, `heirlabs/heir-integrations`, `heirlabs/heir-verifier`, `heirlabs/heir-eliza`.
2. Do not `git push` or `git commit` on `main`, `preprod`, or `develop`. Use `feat/*` / `fix/*` / `chore/*` and open PRs.
3. Do not run `railway up`, `vercel --prod`, or `gh workflow run deploy-*.yml` to deploy.
4. No cross-repo file imports; APIs talk over HTTP with env-based URLs (`ENVIRONMENTS.md`).
5. No AI signatures or `Co-Authored-By` in commits.
