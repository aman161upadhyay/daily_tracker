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
milestones `v0.<n>` and push the tag (v0.1 = M1 … v0.6 = M6). `.gitignore` excludes `.conversation/`,
`attached_assets/` and `.agents/*` except `.agents/memory/`.

**Author identity (user request, 2026-10-25):** commits are made "using my name, Aman" — repo-local
`git config user.name "Aman Upadhyay"` / `user.email aman161upadhyay@users.noreply.github.com` is set in
the workspace repo; verify with `git log -1 --format=%an` before pushing, re-set it if the workspace was
recreated. The two earlier agent-authored commits stay (no history rewrite).
