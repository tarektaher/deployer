# Deployer

Bulletproof CLI deployment agent for Laravel, React, Vue, and Node.js projects.

Deployer is a powerful command-line interface (CLI) tool designed to streamline and automate the deployment of modern web applications. It handles the entire lifecycle of your projects, from cloning your Git repository to building, deploying with zero-downtime, and managing services like databases and reverse proxies.

## Features

- **Zero-Downtime Deployments**: Utilizes a blue-green strategy with atomic symlink switching to ensure your applications are always available, even during updates.
- **Multi-Framework Support**: Automatically detects and configures deployments for Laravel, React, Vue.js, and Node.js applications.
- **Automated Nginx Proxy**: Integrates with Nginx Proxy Manager to automatically configure subdomains and SSL certificates for your projects.
- **Database Management**: Can automatically provision and manage databases (MySQL, PostgreSQL) for your applications.
- **Complete Project Lifecycle Management**: A comprehensive set of commands to `init`, `create`, `update`, `rollback`, `list`, and `remove` projects.
- **Built-in Health Checks**: Monitor the health of your deployed applications.
- **Log Viewing**: Easily stream logs from your application containers.

## Prerequisites

- **Node.js**: Version 18.0.0 or higher.
- **Docker**: Docker must be installed and the Docker daemon running.
- **Git**: Must be installed and available in the system's PATH.
- **Nginx Proxy Manager**: An instance of NPM should be running and accessible.

## Installation

1.  Clone the repository:
    ```bash
    git clone git@github.com:tarektaher/deployer.git
    cd deployer
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Make the `deploy` command available globally (optional, but recommended):
    ```bash
    npm link
    ```

## Initialization

Before you can deploy any projects, you must initialize the deployer. This command will create the necessary configuration files and directories.

```bash
deploy init
```
After initialization, make sure to edit the configuration file at `/home/tarek_bentaher/projects/.registry/config.json` to add your Nginx Proxy Manager credentials.

## Usage

### Creating a New Project

This is the main command to deploy a new application. It will clone the repository, detect the project type, build it, deploy it as a Docker container, and configure the reverse proxy.

```bash
deploy create <project-name> --repo <git-url> [options]
```

**Example:**

```bash
deploy create my-awesome-app --repo git@github.com:user/my-awesome-app.git --db mysql --domain my-app --memory 1G
```

**Options:**

| Option                 | Description                                       | Default      |
| ---------------------- | ------------------------------------------------- | ------------ |
| `-r, --repo <url>`     | **Required.** The Git repository URL.             |              |
| `-t, --type <type>`    | Project type (laravel, react, vue, node).         | `auto`       |
| `-d, --db <type>`      | Database type (mysql, postgres, none).            | `none`       |
| `--domain <subdomain>` | Custom subdomain for the project.                 | project name |
| `-b, --branch <branch>`| The Git branch to deploy.                         | `main`       |
| `-p, --port <port>`    | The internal port your application exposes.       | (auto)       |
| `-m, --memory <limit>` | Container memory limit.                           | `512M`       |

### Updating a Project

To update an existing project with the latest code from its Git repository, use the `update` command. This will perform a zero-downtime deployment.

```bash
deploy update <project-name>
```

### Listing Projects

To see all the projects currently managed by the deployer:

```bash
deploy list
# or
deploy ls
```

### Viewing Logs

To view the logs of a specific application:

```bash
deploy logs <project-name>
```

**Options:**

| Option              | Description                  | Default |
| ------------------- | ---------------------------- | ------- |
| `-f, --follow`      | Follow the log output.       | `false` |
| `-n, --lines <num>` | Number of lines to show.     | `100`   |

### Rolling Back a Project

If an update fails or introduces a bug, you can quickly roll back to a previous version.

```bash
deploy rollback <project-name>
```

### Removing a Project

This command will stop and remove all containers, proxy configurations, and files associated with a project.

```bash
deploy remove <project-name> --force
```
---
*This `README.md` was generated based on an expert audit of the project's capabilities.*
