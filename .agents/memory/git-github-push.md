---
name: Git / GitHub push workflow
description: How the workspace repo is linked to the user's GitHub repo and how to push safely.
---

The workspace `.git` tracks `origin/main` of the user's repo (`aman161upadhyay/daily_tracker`). Plain
`git fetch` / `git push` work: Replit rewrites `https://github.com/` to its authenticated GitHub proxy
(`github.replit.internal`), so no token handling and no Git Data API shuffling is needed.

**Why:** the user asked for the whole project to be pushed after every milestone/session; first attempt
assumed a private repo would need connector credentials, but the proxy already covers it.

**How to apply:** `git add -A && git commit -m "<step>" && git push` (never force-push `main`); tag
milestones `v0.<n>` and push the tag. `.gitignore` excludes `.conversation/`, `attached_assets/` and
`.agents/*` except `.agents/memory/`. Git identity is already configured in the workspace.
