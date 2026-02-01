---
name: release
description: Create a new release with changelog
disable-model-invocation: true
allowed-tools: Bash, Read, Write
---

# Create Release

Version: $ARGUMENTS (ou auto-increment)

1. Update version in package.json
2. Generate CHANGELOG from commits since last tag
3. Commit version bump
4. Create git tag
5. Push tag to trigger release

Format CHANGELOG:
- Features
- Bug fixes
- Breaking changes
