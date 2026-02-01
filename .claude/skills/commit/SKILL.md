---
name: commit
description: Create a standardized commit for deployer changes
disable-model-invocation: true
---

# Standardized Commit

1. Check changes: `git status && git diff --stat`
2. Analyze what changed
3. Create commit with format:
   - feat: New feature
   - fix: Bug fix
   - docs: Documentation
   - refactor: Code refactoring

4. Add co-author: `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`
5. Push to remote
