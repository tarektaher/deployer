---
name: deploy-check
description: Run pre-deployment checks for the deployer CLI
allowed-tools: Bash, Read
---

# Pre-Deployment Checklist

Run these checks before any deployment:

1. **System Resources**
   ```bash
   df -h / | tail -1
   free -h | grep Mem
   docker system df
   ```

2. **Docker Status**
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}"
   docker network ls | grep nginx
   ```

3. **NPM Proxy**
   ```bash
   curl -s http://localhost:81/api/ | head -1
   ```

4. **Database Containers**
   ```bash
   docker ps | grep -E "postgres|mysql"
   ```

Report any issues found.
