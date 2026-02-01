---
name: deploy-logs
description: AI-powered log analysis using Gemini CLI
context: fork
allowed-tools: Bash, Read
---

# AI Log Analysis

Analyze logs for: $ARGUMENTS

## Quick Analysis (Gemini Flash)
```bash
docker logs $ARGUMENTS-app --tail 200 2>&1 | gemini -m flash -p "Analyze these application logs. Report:
1. ERROR count and types
2. WARNING patterns
3. Performance issues (slow queries, timeouts)
4. Health status assessment
Be concise, use bullet points."
```

## Deep Analysis (Gemini Pro)
```bash
docker logs $ARGUMENTS-app --tail 500 2>&1 | gemini -m pro -p "Deep analysis of these logs:
1. Root cause of any errors
2. Timeline of issues
3. Correlation between events
4. Recommended fixes with specific commands
5. Preventive measures"
```

## Compare with Previous
```bash
# Get logs from last hour and analyze trend
docker logs $ARGUMENTS-app --since 1h 2>&1 | gemini -m flash -p "Analyze error trend in these logs. Is the situation improving or degrading?"
```

Provide actionable insights with specific commands to fix issues.
