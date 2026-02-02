# Deployer CLI - User Guide

A bulletproof deployment agent for Laravel, React, Vue, and Node.js projects with zero-downtime deployments, automatic SSL, database provisioning, and rollback capabilities.

## Table of Contents

- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
- [Project Types](#project-types)
- [Database Support](#database-support)
- [Configuration](#configuration)
- [Security & Secrets Management](#security--secrets-management)
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
| `-m, --memory <limit>` | Container memory limit | `512M` |

**Examples:**

```bash
# Auto-detect project type
deploy create my-app --repo https://github.com/user/repo

# Laravel with PostgreSQL database and 1GB memory
deploy create blog --repo https://github.com/user/blog --type laravel --db postgres --memory 1G

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
| `-m, --memory <limit>` | New container memory limit |

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

### `deploy config <action>`

Configuration and secrets management.

```bash
deploy config <action> [options]
```

**Actions:**

| Action | Description |
|--------|-------------|
| `set-credentials` | Set NPM credentials (stored encrypted) |
| `migrate` | Migrate plaintext credentials to encrypted storage |
| `rotate-key` | Rotate the master encryption key |
| `status` | Show configuration and secrets status |

**Examples:**

```bash
# Set encrypted NPM credentials
deploy config set-credentials

# Migrate legacy plaintext credentials
deploy config migrate

# Rotate encryption key
deploy config rotate-key --force

# Check configuration status
deploy config status
```

See [Security & Secrets Management](#security--secrets-management) for detailed information.

---

## Project Types

### Laravel

- **Runtime:** PHP 8.3-FPM + Nginx + Supervisor
- **Build System:** Multi-stage Docker build (Node.js/Vite assets + PHP)
- **Default Port:** 80
- **Memory Limit:** 512M (Configurable via `--memory`)
- **Features:**
  - Automatic `artisan key:generate`
  - Automatic `artisan migrate`
  - Automatic `artisan config:cache`
  - Automatic `artisan storage:link` (via Entrypoint)
  - Storage permissions auto-configured (via Entrypoint)
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

## Security & Secrets Management

The deployer includes enterprise-grade secrets management with AES-256-GCM encryption for secure credential storage.

### Overview

**Security Features:**
- AES-256-GCM authenticated encryption
- PBKDF2 key derivation with 100,000 iterations
- 12-byte IV (96-bit) following NIST standards
- Master key stored with `0o600` permissions
- Encrypted secrets in `/projects/.registry/secrets/*.enc`
- Support for environment variable overrides (CI/CD)

### Credential Priority

The deployer retrieves NPM credentials in the following priority order:

1. **Environment Variables** (highest priority - for CI/CD)
   - `NPM_EMAIL`
   - `NPM_PASSWORD`

2. **Encrypted Storage** (recommended for local/server deployments)
   - Stored in `/projects/.registry/secrets/npm_credentials.enc`
   - Protected with AES-256-GCM encryption

3. **Legacy Plaintext Config** (deprecated)
   - `config.json` with plaintext credentials
   - Shows deprecation warning
   - Should be migrated to encrypted storage

### Commands

#### `deploy config set-credentials`

Interactively set NPM credentials with encrypted storage.

```bash
deploy config set-credentials
```

**What happens:**
1. Prompts for NPM email and password
2. Encrypts credentials using AES-256-GCM
3. Stores in `/projects/.registry/secrets/npm_credentials.enc`
4. Sets file permissions to `0o600` (owner read/write only)

**Example:**
```bash
$ deploy config set-credentials
Enter NPM email: admin@example.com
Enter NPM password: ********
✓ Credentials stored securely
```

#### `deploy config migrate`

Migrate existing plaintext credentials to encrypted storage.

```bash
deploy config migrate
```

**What happens:**
1. Reads credentials from `config.json`
2. Encrypts and stores in secure storage
3. Removes plaintext credentials from `config.json`
4. Preserves other config settings (domain, npmUrl, etc.)

**Example:**
```bash
$ deploy config migrate
✓ Migrated credentials to encrypted storage
✓ Removed plaintext credentials from config.json
```

**Before migration:**
```json
{
  "npmUrl": "http://localhost:81",
  "npmEmail": "admin@example.com",
  "npmPassword": "secret123",
  "domain": "example.com"
}
```

**After migration:**
```json
{
  "npmUrl": "http://localhost:81",
  "domain": "example.com",
  "initialized": true
}
```

#### `deploy config rotate-key`

Rotate the master encryption key and re-encrypt all secrets.

```bash
deploy config rotate-key [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompt |

**What happens:**
1. Decrypts all existing secrets with current key
2. Generates new master key
3. Re-encrypts all secrets with new key
4. Updates master key file

**Example:**
```bash
$ deploy config rotate-key
⚠ This will rotate the master encryption key and re-encrypt all secrets.
Continue? (y/n): y
✓ Master key rotated successfully
✓ Re-encrypted 3 secrets
```

**Use cases:**
- Regular security maintenance
- After potential key exposure
- Compliance requirements

#### `deploy config status`

Show configuration and credential status.

```bash
deploy config status
```

**Example output:**
```bash
Configuration Status:

  Credentials Source:  encrypted
  NPM URL:             http://localhost:81
  Domain:              tarek-taher.duckdns.org
  Encrypted Secrets:   2
  Master Key:          ✓ Present

Security:
  ✓ Using encrypted credential storage
  ✓ Master key permissions: 0o600
```

**Credential sources:**
- `env` - Using environment variables
- `encrypted` - Using encrypted storage (recommended)
- `legacy` - Using plaintext config (deprecated)
- `none` - No credentials configured

### Environment Variables for CI/CD

For automated deployments in CI/CD pipelines, use environment variables to override encrypted storage:

```bash
# GitHub Actions example
export NPM_EMAIL="ci@example.com"
export NPM_PASSWORD="${{ secrets.NPM_PASSWORD }}"
export DEPLOYER_MASTER_KEY="${{ secrets.DEPLOYER_MASTER_KEY }}"

deploy create my-app --repo https://github.com/user/app --type node
```

**Environment Variables:**

| Variable | Description | Priority |
|----------|-------------|----------|
| `NPM_EMAIL` | NPM authentication email | Highest |
| `NPM_PASSWORD` | NPM authentication password | Highest |
| `DEPLOYER_MASTER_KEY` | Override master encryption key | Optional |

**Benefits:**
- No credential files needed in CI/CD
- Secrets managed by CI/CD platform
- Same CLI commands work everywhere
- Optional master key override for distributed deployments

### Encryption Details

**Algorithm:** AES-256-GCM (Galois/Counter Mode)
- Industry-standard authenticated encryption
- Provides both confidentiality and integrity
- Prevents tampering with encrypted data

**Key Derivation:** PBKDF2 with SHA-256
- 100,000 iterations (NIST recommended minimum)
- 64-byte random salt per secret
- Derives 32-byte encryption key from master key

**Initialization Vector (IV):**
- 12-byte (96-bit) random IV per encryption
- Follows NIST SP 800-38D recommendations
- Never reused for the same key

**Authentication Tag:**
- 16-byte (128-bit) authentication tag
- Verifies data integrity on decryption
- Prevents unauthorized modifications

**File Structure:**
```
[64-byte salt][12-byte IV][16-byte auth-tag][encrypted data]
```

### File Permissions

Security-critical files have restricted permissions:

| File | Permissions | Description |
|------|-------------|-------------|
| `.master-key` | `0o600` (rw-------) | Master encryption key |
| `*.enc` | `0o600` (rw-------) | Encrypted secret files |
| `.env` | `0o600` (rw-------) | Project environment files |

### Best Practices

1. **Initial Setup:**
   ```bash
   # Initialize deployer
   deploy init

   # Set encrypted credentials
   deploy config set-credentials
   ```

2. **Migration from Plaintext:**
   ```bash
   # Migrate existing credentials
   deploy config migrate

   # Verify migration
   deploy config status
   ```

3. **Regular Maintenance:**
   ```bash
   # Rotate encryption key quarterly
   deploy config rotate-key
   ```

4. **CI/CD Setup:**
   ```yaml
   # .github/workflows/deploy.yml
   env:
     NPM_EMAIL: ${{ secrets.NPM_EMAIL }}
     NPM_PASSWORD: ${{ secrets.NPM_PASSWORD }}

   steps:
     - name: Deploy
       run: deploy create app --repo ${{ github.repository }}
   ```

5. **Backup Master Key:**
   ```bash
   # Backup master key to secure location
   cp /projects/.registry/.master-key ~/backups/master-key.backup
   chmod 600 ~/backups/master-key.backup
   ```

### Security Considerations

**DO:**
- Use `deploy config set-credentials` for interactive setup
- Migrate legacy plaintext credentials with `deploy config migrate`
- Use environment variables for CI/CD deployments
- Rotate master key periodically
- Backup master key to secure offline location
- Verify file permissions after deployment

**DON'T:**
- Commit `.master-key` to version control
- Share master key in plaintext
- Use plaintext credentials in production
- Store credentials in CI/CD logs
- Disable encryption for convenience

**In Case of Key Compromise:**
```bash
# 1. Rotate master key immediately
deploy config rotate-key --force

# 2. Update CI/CD secrets if using DEPLOYER_MASTER_KEY
# (via your CI/CD platform's secret management)

# 3. Verify all projects still work
deploy list
```

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
    │   ├── config.json          # Configuration (no plaintext secrets)
    │   ├── projects.json        # Project registry
    │   ├── .master-key          # Master encryption key (0o600)
    │   └── secrets/             # Encrypted secrets
    │       └── npm_credentials.enc  # Encrypted NPM credentials
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

### Credentials Not Working

1. Check credential source:
   ```bash
   deploy config status
   ```

2. If using legacy credentials:
   ```bash
   deploy config migrate
   ```

3. If credentials missing:
   ```bash
   deploy config set-credentials
   ```

4. For CI/CD, verify environment variables:
   ```bash
   echo $NPM_EMAIL
   echo $NPM_PASSWORD
   ```

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
