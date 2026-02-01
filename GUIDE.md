# Deployer CLI - User Guide

A bulletproof deployment agent for Laravel, React, Vue, and Node.js projects with zero-downtime deployments, automatic SSL, database provisioning, and rollback capabilities.

## Table of Contents

- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
- [Project Types](#project-types)
- [Database Support](#database-support)
- [Configuration](#configuration)
- [Directory Structure](#directory-structure)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Initialize the Deployer

```bash
deploy init
```

This creates the required directories and configuration file.

### 2. Configure NPM Credentials

Edit `/home/tarek_bentaher/projects/.registry/config.json`:

```json
{
  "npmUrl": "http://localhost:81",
  "npmEmail": "your-email@example.com",
  "npmPassword": "your-npm-password",
  "domain": "tarek-taher.duckdns.org",
  "initialized": true
}
```

### 3. Deploy Your First Project

```bash
# Node.js API
deploy create my-api --repo https://github.com/user/api --type node

# React SPA
deploy create my-spa --repo https://github.com/user/spa --type react

# Vue SPA
deploy create my-vue --repo https://github.com/user/vue --type vue

# Laravel with PostgreSQL
deploy create my-app --repo https://github.com/user/app --type laravel --db postgres
```

---

## Commands Reference

### `deploy init`

Initialize the deployer and create required directories.

```bash
deploy init
```

### `deploy create <name>`

Deploy a new project from a GitHub repository.

```bash
deploy create <name> [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --repo <url>` | GitHub repository URL (required) | - |
| `-t, --type <type>` | Project type: `laravel`, `react`, `vue`, `node`, `auto` | `auto` |
| `-d, --db <type>` | Database: `postgres`, `mysql`, `none` | `none` |
| `--domain <subdomain>` | Custom subdomain | project name |
| `-b, --branch <branch>` | Git branch to deploy | `main` |
| `-p, --port <port>` | Internal container port | varies by type |

**Examples:**

```bash
# Auto-detect project type
deploy create my-app --repo https://github.com/user/repo

# Laravel with PostgreSQL database
deploy create blog --repo https://github.com/user/blog --type laravel --db postgres

# React app on custom subdomain
deploy create dashboard --repo https://github.com/user/dashboard --type react --domain admin

# Node.js API on specific branch
deploy create api --repo https://github.com/user/api --type node --branch develop
```

### `deploy update <name>`

Update an existing project with zero-downtime deployment.

```bash
deploy update <name> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-b, --branch <branch>` | Git branch to deploy |

**What happens:**
1. Clones fresh copy to new release directory
2. Builds new container
3. Starts new container alongside old one
4. Waits for health check
5. Switches traffic to new container
6. Removes old container
7. Cleans up old releases (keeps last 5)

### `deploy rollback <name>`

Rollback to a previous version.

```bash
deploy rollback <name> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-v, --version <version>` | Specific version to rollback to |

**Example:**

```bash
# Rollback to previous version
deploy rollback my-app

# Rollback to specific version
deploy rollback my-app --version v20250201.143000
```

### `deploy list`

List all deployed projects.

```bash
deploy list
# or
deploy ls
```

**Output:**

```
Deployed Projects:

  NAME                TYPE        VERSION        STATUS    DOMAIN
  --------------------------------------------------------------------------------
  my-app              laravel     v20250201.011500 running  my-app.tarek-taher.duckdns.org
  my-api              node        v20250201.120000 running  my-api.tarek-taher.duckdns.org
```

### `deploy status <name>`

Show detailed status of a project.

```bash
deploy status my-app
```

**Output:**

```
Project: my-app

  Type:            laravel
  Version:         v20250201.011500
  Status:          running
  Domain:          https://my-app.tarek-taher.duckdns.org
  Repository:      https://github.com/user/my-app
  Branch:          main
  Database:        postgres
  Created:         2026-02-01T01:50:00.000Z
  Updated:         2026-02-01T01:50:00.000Z

  Releases (2):
    - v20250201.143000 (current)
    - v20250201.011500
```

### `deploy health <name>`

Run health checks on a project.

```bash
deploy health my-app
```

### `deploy logs <name>`

View container logs.

```bash
deploy logs <name> [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --follow` | Follow log output | false |
| `-n, --lines <number>` | Number of lines to show | 100 |

**Examples:**

```bash
# View last 100 lines
deploy logs my-app

# Follow logs in real-time
deploy logs my-app -f

# View last 500 lines
deploy logs my-app -n 500
```

### `deploy restart <name>`

Restart project containers.

```bash
deploy restart my-app
```

### `deploy stop <name>`

Stop project containers.

```bash
deploy stop my-app
```

### `deploy start <name>`

Start stopped project containers.

```bash
deploy start my-app
```

### `deploy remove <name>`

Remove a project and clean up.

```bash
deploy remove <name> [options]
# or
deploy rm <name> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--keep-data` | Keep database and volumes |
| `-f, --force` | Force removal without confirmation |

**Example:**

```bash
# Remove with confirmation prompt
deploy remove my-app

# Force remove
deploy remove my-app --force

# Remove but keep database
deploy remove my-app --force --keep-data
```

### `deploy db <action>`

Database operations.

```bash
deploy db <action> [options]
```

**Actions:**

| Action | Description |
|--------|-------------|
| `list` | List all provisioned databases |
| `backup` | Backup a project's database |
| `restore` | Restore a database from backup |

**Options:**

| Option | Description |
|--------|-------------|
| `-p, --project <name>` | Project name |
| `-f, --file <path>` | Backup file path |

**Examples:**

```bash
# List all databases
deploy db list

# Backup database
deploy db backup --project my-app

# Backup to specific file
deploy db backup --project my-app --file /path/to/backup.sql

# Restore from backup
deploy db restore --project my-app --file /path/to/backup.sql
```

---

## Project Types

### Laravel

- **Runtime:** PHP 8.3-FPM + Nginx + Supervisor
- **Default Port:** 80
- **Memory Limit:** 256MB
- **Features:**
  - Automatic `artisan key:generate`
  - Automatic `artisan migrate`
  - Automatic `artisan config:cache`
  - Storage permissions auto-configured
  - Queue worker support (optional)
  - Scheduler support (optional)

### React

- **Runtime:** Multi-stage build (Node.js builder + Nginx)
- **Default Port:** 80
- **Memory Limit:** 64MB
- **Features:**
  - SPA routing configured
  - Gzip compression
  - Static asset caching
  - Supports both Vite (`dist/`) and CRA (`build/`)

### Vue

- **Runtime:** Multi-stage build (Node.js builder + Nginx)
- **Default Port:** 80
- **Memory Limit:** 64MB
- **Features:**
  - SPA routing configured
  - Gzip compression
  - Static asset caching

### Node.js

- **Runtime:** Node.js 20 Alpine with Tini
- **Default Port:** 3000
- **Memory Limit:** 128MB
- **Features:**
  - Non-root user
  - Proper signal handling (Tini)
  - Health endpoint check (`/health` or `/`)

---

## Database Support

### PostgreSQL

```bash
deploy create my-app --repo <url> --db postgres
```

- Uses shared PostgreSQL 16 container
- Auto-creates database and user
- Credentials stored encrypted

### MySQL

```bash
deploy create my-app --repo <url> --db mysql
```

- Uses shared MySQL 8 container
- Auto-creates database and user
- Credentials stored encrypted

### Environment Variables

For Laravel projects:
```env
DB_CONNECTION=pgsql  # or mysql
DB_HOST=shared-postgres  # or shared-mysql
DB_PORT=5432  # or 3306
DB_DATABASE=<project_name>
DB_USERNAME=user_<project_name>
DB_PASSWORD=<generated>
```

For Node.js projects:
```env
DATABASE_URL=postgresql://user:pass@host:port/db
```

---

## Configuration

### Global Config

Location: `/home/tarek_bentaher/projects/.registry/config.json`

```json
{
  "npmUrl": "http://localhost:81",
  "npmEmail": "your-email@example.com",
  "npmPassword": "your-password",
  "domain": "tarek-taher.duckdns.org",
  "initialized": true
}
```

### Project Config

Each project has metadata at: `/home/tarek_bentaher/projects/<name>/.deploy/metadata.json`

### Environment Variables

Project-specific `.env` files are stored in: `/home/tarek_bentaher/projects/<name>/shared/.env`

---

## Directory Structure

```
/home/tarek_bentaher/
├── deployer/                    # Deployer CLI tool
│   ├── bin/deploy               # CLI entry point
│   ├── src/                     # Source code
│   └── templates/               # Docker templates
│
└── projects/                    # All deployed projects
    ├── .registry/               # Global registry + config
    │   ├── config.json          # NPM credentials
    │   ├── projects.json        # Project registry
    │   └── secrets/             # Encrypted secrets
    ├── _databases/              # Shared database containers
    │   ├── mysql/
    │   └── postgres/
    └── <project-name>/
        ├── current -> releases/vX  # Symlink to current release
        ├── releases/               # Versioned releases (max 5)
        │   └── v20250201.143000/
        ├── shared/                 # Persistent files
        │   ├── .env
        │   └── storage/           # (Laravel only)
        ├── docker-compose.yml
        ├── .deploy/
        │   └── metadata.json
        └── logs/
```

---

## Troubleshooting

### Docker Permission Denied

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Apply without logout
newgrp docker
```

### Build Timeout

Large projects may take longer to build. The build runs asynchronously, so check progress with:

```bash
deploy logs <name>
```

### Container Not Starting

Check logs:
```bash
deploy logs <name> -n 200
```

Check container status:
```bash
docker ps -a | grep <name>
```

### Health Check Failing

1. Verify the app has a `/health` endpoint (or `/` for Node.js)
2. Check container logs for errors
3. Ensure the app is listening on the correct port

### Database Connection Issues

1. Verify database container is running:
   ```bash
   docker ps | grep shared-postgres
   # or
   docker ps | grep shared-mysql
   ```

2. Check credentials in `.env`:
   ```bash
   cat /home/tarek_bentaher/projects/<name>/shared/.env
   ```

3. Verify database exists:
   ```bash
   deploy db list
   ```

### SSL Certificate Issues

1. Ensure domain DNS points to your server
2. Check NPM logs:
   ```bash
   docker logs nginx-proxy-manager-app-1
   ```

3. Manually request certificate via NPM UI at port 81

### Rollback Not Working

1. Check available releases:
   ```bash
   deploy status <name>
   ```

2. Ensure the target version exists in releases directory

---

## Resource Limits

Default memory limits (configurable in docker-compose.yml):

| Type | Memory Limit |
|------|--------------|
| Laravel | 256MB |
| Node.js | 128MB |
| React/Vue | 64MB |

To modify, edit the project's `docker-compose.yml` after deployment.

---

## Support

For issues or feature requests, check the deployer logs or container logs for debugging information.
