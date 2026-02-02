# Deployer

**Bulletproof CLI deployment agent for Laravel, React, Vue, and Node.js projects.**

Deployer is a robust CLI tool designed to automate the lifecycle of modern web applications. It handles cloning, building, zero-downtime deployment (blue-green), and reverse proxy configuration, utilizing Docker and Nginx Proxy Manager.

## Project Overview

- **Type:** Node.js CLI Application
- **Language:** JavaScript (ES Modules)
- **Key Technologies:** Node.js, Docker, Nginx Proxy Manager (NPM), Commander.js.
- **Architecture:**
    - **CLI Interface:** Built with `commander` for command parsing (`src/cli.js`).
    - **Core Logic:** `src/deployer.js` orchestrates the deployment process.
    - **Templates:** Docker configurations for supported frameworks are stored in `templates/`.
    - **State Management:** JSON-based registry stores project metadata and configuration.
    - **Security:** AES-256-GCM encryption for credential storage.

## Key Features

- **Zero-Downtime Deployments:** Blue-green deployment strategy with atomic symlink switching.
- **Framework Agnostic:** Auto-detection for Laravel, React, Vue, and Node.js.
- **Automated Infrastructure:** Configures Nginx Proxy Manager for SSL/Subdomains and provisions databases (MySQL/Postgres).
- **Lifecycle Management:** Create, Update, Rollback, Remove, Start, Stop, Restart.
- **Observability:** Built-in log streaming (`deploy logs`) and health checks.
- **Security:** Encrypted secrets management for NPM credentials.

## Installation & Setup

1.  **Prerequisites:** Node.js >= 18.0.0, Docker (running), Git, Nginx Proxy Manager instance.
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Link Globally (Development):**
    ```bash
    npm link
    ```
4.  **Initialize:**
    ```bash
    deploy init
    ```

## Development Workflow

### Structure
- `bin/deploy`: Executable entry point.
- `src/`: Application source code.
    - `cli.js`: Command definitions and argument parsing.
    - `deployer.js`: Main class implementing deployment logic.
    - `detectors/`: Logic to identify project types.
    - `services/`: Modules for Database, Health checks, NPM API, and Secrets.
    - `utils/`: Helper utilities (e.g., env parsing).
- `templates/`: Dockerfile and docker-compose templates for each supported stack.

### Key Commands

- **Create Project:** `deploy create <name> --repo <url>`
- **Update Project:** `deploy update <name>`
- **Rollback:** `deploy rollback <name>`
- **List Projects:** `deploy list`
- **Logs:** `deploy logs <name>`
- **Config/Secrets:** `deploy config [action]`

### Configuration
Configuration is stored in `~/.registry/config.json` (path may vary based on `init`).
- **Secrets:** Stored encrypted in `~/.registry/secrets/`.
- **Project Data:** Stored in `~/projects/<name>/`.

## Contribution Guidelines
- **Code Style:** Follow standard Node.js/JavaScript ES Module conventions.
- **Templates:** Modifications to Docker templates should be tested across all supported frameworks.
- **Safety:** Ensure all file operations are safe and permissions are correctly set (especially for secrets).
