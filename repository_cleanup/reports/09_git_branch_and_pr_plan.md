# Git Branch and PR Plan

Prepared branch: `chore/cmras-restructure-cleanup`  
Suggested base: `development`  
No commit, push, merge, or pull request was created.

Suggested PR title: `chore: organize CMRAS datasets and reproducibility evidence`

Before creating the PR, review `git diff --check`, review the migration manifest, and then use the team-approved workflow, for example:

```sh
git add .
git commit -m "chore: organize datasets and research evidence"
git push -u origin chore/cmras-restructure-cleanup
gh pr create --base development --head chore/cmras-restructure-cleanup
```

PR description must state that research datasets are unverified/simulation-only where documented, that no model was retrained, and that WHO production assets stayed in place.
