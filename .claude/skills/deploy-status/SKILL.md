---
name: deploy-status
description: Show comprehensive status of all deployed projects
context: fork
agent: Explore
---

# Deployment Status Dashboard

Generate a comprehensive status report:

1. List all projects from registry
2. For each project show:
   - Container status (healthy/unhealthy)
   - Current version
   - Domain and SSL status
   - Resource usage (CPU/Memory)
   - Last deployment date

3. Show shared resources:
   - Database containers
   - Disk usage per project
   - NPM proxy hosts

Format as a clear, readable table.
