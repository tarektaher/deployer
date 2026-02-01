---
name: deploy-backup
description: Create a complete backup of a deployed project
disable-model-invocation: true
allowed-tools: Bash, Read
---

# Complete Project Backup

Backup project: $ARGUMENTS

1. **Database backup**
   ```bash
   deploy db backup $ARGUMENTS
   ```

2. **Configuration backup**
   - .env file
   - docker-compose.yml
   - metadata.json

3. **Persistent data**
   - shared/ directory
   - uploads (if any)

4. **Create archive**
   ```bash
   tar -czf backup-$ARGUMENTS-$(date +%Y%m%d).tar.gz <files>
   ```

Report backup location and size.
