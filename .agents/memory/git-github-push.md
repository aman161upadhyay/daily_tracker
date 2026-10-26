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
milestones `v0.<n>` and push the tag with a plain `git push origin v0.<n>` — never `-f`, not even for
tags (v0.1 = M1 … v0.6 = M6, then one tag per council round that ships fixes: v0.7 = round 3, v0.8 = round 4, v0.9 = round 5, v0.10 = round 6, v0.11 = round 7, v0.12 = round 8, v0.13 = round 9; bump
`app.json` version/versionCode in the same commit). `.gitignore` excludes `.conversation/`,
`attached_assets/` and `.agents/*` except `.agents/memory/`.

**Author identity (user request, 2026-10-25):** commits are made "using my name, Aman" — repo-local
`git config user.name "Aman Upadhyay"` / `user.email aman161upadhyay@users.noreply.github.com` is set in
the workspace repo; plain `git commit` (no `-c user.name=` override — one round-6 commit used the short
"Aman" that way, harmless but inconsistent) picks it up; verify with `git log -1 --format=%an` before pushing,
re-set it if the workspace was recreated. The two earlier agent-authored commits stay (no history rewrite).
