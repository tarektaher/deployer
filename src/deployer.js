import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { NpmApi } from './services/npm-api.js';
import { DatabaseService } from './services/database.js';
import { SecretsManager } from './services/secrets.js';
import { SecretsConfig } from './services/secrets-config.js';
import { HealthChecker } from './services/health.js';
import { detectProjectType } from './detectors/index.js';
import {
  getProjectsDir,
  getRegistryDir,
  getDatabasesDir,
  getDomainSuffix,
  getMaxReleases
} from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECTS_DIR = getProjectsDir();
const REGISTRY_DIR = getRegistryDir();
const DATABASES_DIR = getDatabasesDir();
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const CONFIG_FILE = path.join(REGISTRY_DIR, 'config.json');
const DOMAIN_SUFFIX = getDomainSuffix();
const MAX_RELEASES = getMaxReleases();

export class Deployer {
  constructor() {
    this.npmApi = new NpmApi();
    this.dbService = new DatabaseService(DATABASES_DIR);
    this.secrets = new SecretsManager(REGISTRY_DIR);
    this.secretsConfig = new SecretsConfig(REGISTRY_DIR);
    this.health = new HealthChecker();
  }

  async init() {
    const spinner = ora('Initializing deployer...').start();

    try {
      // Ensure directories exist
      await fs.ensureDir(PROJECTS_DIR);
      await fs.ensureDir(REGISTRY_DIR);
      await fs.ensureDir(DATABASES_DIR);

      spinner.text = 'Checking Docker...';

      // Check Docker
      try {
        execSync('docker info', { stdio: 'pipe' });
      } catch {
        spinner.fail('Docker is not running or not accessible');
        console.log(chalk.yellow('\nTip: If you just added yourself to the docker group, log out and back in.'));
        console.log(chalk.yellow('Or use: newgrp docker'));
        return;
      }

      spinner.text = 'Checking Nginx Proxy Manager...';

      // Check NPM
      const npmRunning = await this.npmApi.checkConnection();
      if (!npmRunning) {
        spinner.warn('Nginx Proxy Manager not detected');
        console.log(chalk.yellow('\nMake sure NPM is running on port 81'));
      }

      // Load or create config
      let config = {};
      if (await fs.pathExists(CONFIG_FILE)) {
        config = await fs.readJson(CONFIG_FILE);
        spinner.succeed('Deployer initialized (existing config loaded)');
      } else {
        // Create default config (without plaintext credentials)
        config = {
          npmUrl: 'http://localhost:81',
          domain: DOMAIN_SUFFIX,
          initialized: false
        };
        await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
        spinner.succeed('Deployer initialized');
      }

      console.log('\n' + chalk.cyan('Configuration:'));
      console.log(`  Projects directory: ${PROJECTS_DIR}`);
      console.log(`  Domain suffix: ${DOMAIN_SUFFIX}`);
      console.log(`  NPM URL: ${config.npmUrl}`);

      // Check credentials status
      const hasCredentials = await this.secretsConfig.hasCredentials();
      const credSource = await this.secretsConfig.getCredentialSource();

      if (hasCredentials) {
        const sourceLabel = credSource === 'env' ? 'environment variables' :
                           credSource === 'encrypted' ? 'encrypted storage' : 'legacy config';
        console.log(`  NPM credentials: ${chalk.green('configured')} (${sourceLabel})`);
      } else {
        console.log(`  NPM credentials: ${chalk.yellow('not configured')}`);
      }

      if (!config.initialized || !hasCredentials) {
        console.log('\n' + chalk.yellow('Next steps:'));
        if (!hasCredentials) {
          console.log('  1. Run: deploy config set-credentials');
          console.log('  2. Run: deploy create <name> --repo <url>');
        } else {
          console.log('  1. Run: deploy create <name> --repo <url>');
        }
      }

      // Check for legacy credentials and warn
      if (await this.secretsConfig.hasLegacyCredentials()) {
        console.log('\n' + chalk.yellow('Security notice:'));
        console.log('  Plaintext credentials found in config.json');
        console.log('  Run: deploy config migrate');
      }

    } catch (error) {
      spinner.fail('Initialization failed');
      throw error;
    }
  }

  async create(name, options) {
    const spinner = ora(`Creating project: ${name}`).start();
    const projectDir = path.join(PROJECTS_DIR, name);

    try {
      // Check if project exists
      if (await fs.pathExists(projectDir)) {
        spinner.fail(`Project ${name} already exists`);
        return;
      }

      // Create project structure
      spinner.text = 'Creating project structure...';
      await fs.ensureDir(projectDir);
      await fs.ensureDir(path.join(projectDir, 'releases'));
      await fs.ensureDir(path.join(projectDir, 'shared'));
      await fs.ensureDir(path.join(projectDir, 'logs'));
      await fs.ensureDir(path.join(projectDir, '.deploy'));

      // Generate version
      const version = this.generateVersion();
      const releaseDir = path.join(projectDir, 'releases', version);

      // Clone repository
      spinner.text = 'Cloning repository...';
      let branch = options.branch || 'main';
      let actualBranch = branch;
      try {
        execSync(`git clone --depth 1 --branch ${branch} ${options.repo} ${releaseDir}`, {
          stdio: 'pipe',
          timeout: 120000
        });
      } catch (error) {
        // Bidirectional fallback: main ↔ master (only for default branches, not explicit -b flag)
        if ((branch === 'main' || branch === 'master') && !options.branch) {
          const fallbackBranch = branch === 'main' ? 'master' : 'main';
          execSync(`git clone --depth 1 --branch ${fallbackBranch} ${options.repo} ${releaseDir}`, {
            stdio: 'pipe',
            timeout: 120000
          });
          actualBranch = fallbackBranch;
        } else {
          throw error;
        }
      }

      // Detect project type
      spinner.text = 'Detecting project type...';
      let projectType = options.type;
      if (projectType === 'auto') {
        projectType = await detectProjectType(releaseDir);
      }

      if (!projectType) {
        spinner.fail('Could not detect project type');
        await fs.remove(projectDir);
        return;
      }

      spinner.text = `Detected project type: ${projectType}`;

      // Provision database if needed
      let dbCredentials = null;
      if (options.db && options.db !== 'none') {
        spinner.text = `Provisioning ${options.db} database...`;
        dbCredentials = await this.dbService.provision(name, options.db);
      }

      // Generate environment file
      spinner.text = 'Generating environment...';
      await this.generateEnvFile(projectDir, projectType, dbCredentials, options);

      // Copy .env to release directory for build
      const sharedEnv = path.join(projectDir, 'shared', '.env');
      if (await fs.pathExists(sharedEnv)) {
        await fs.copy(sharedEnv, path.join(releaseDir, '.env'));
      }

      // Setup Laravel storage directories
      if (projectType === 'laravel') {
        spinner.text = 'Setting up Laravel storage...';
        const storageDirs = [
          'storage/app/public',
          'storage/framework/cache',
          'storage/framework/sessions',
          'storage/framework/views',
          'storage/logs',
          'bootstrap/cache'
        ];
        for (const dir of storageDirs) {
          await fs.ensureDir(path.join(projectDir, 'shared', dir));
        }
      }

      // Copy Docker templates
      spinner.text = 'Setting up Docker configuration...';
      await this.setupDockerConfig(projectDir, releaseDir, projectType, name, options);

      // Create current symlink
      await fs.ensureSymlink(releaseDir, path.join(projectDir, 'current'));

      // Build containers (use spawn for long-running builds)
      spinner.text = 'Building containers (this may take a while)...';
      await this.runDockerBuild(projectDir);

      spinner.text = 'Starting containers...';
      execSync(`docker compose up -d`, {
        cwd: projectDir,
        stdio: 'pipe'
      });

      // Run post-deploy commands for Laravel
      if (projectType === 'laravel') {
        spinner.text = 'Running Laravel setup...';
        await this.runLaravelSetup(name);
      }

      // Wait for container health
      spinner.text = 'Waiting for container health...';
      await this.waitForHealth(name, 60);

      // Configure NPM proxy
      spinner.text = 'Configuring proxy...';
      const subdomain = options.domain || name;
      const domain = `${subdomain}.${DOMAIN_SUFFIX}`;
      const port = options.port || this.getDefaultPort(projectType);

      const containerName = `${name}-app`;
      const proxyCreated = await this.npmApi.createProxyHost(domain, containerName, port);

      // Request SSL certificate
      if (proxyCreated) {
        spinner.text = 'Requesting SSL certificate...';
        const certId = await this.npmApi.requestCertificate(domain);
        if (certId) {
          await this.npmApi.updateProxyHostCertificate(domain, certId);
        }
      }

      // Save project metadata
      const metadata = {
        name,
        type: projectType,
        repo: options.repo,
        branch: actualBranch,
        domain,
        port,
        database: options.db || 'none',
        currentVersion: version,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await fs.writeJson(path.join(projectDir, '.deploy', 'metadata.json'), metadata, { spaces: 2 });

      // Update registry
      await this.updateRegistry(name, metadata);

      spinner.succeed(`Project ${name} deployed successfully!`);

      console.log('\n' + chalk.cyan('Deployment Details:'));
      console.log(`  Type: ${projectType}`);
      console.log(`  Version: ${version}`);
      console.log(`  URL: https://${domain}`);
      if (dbCredentials) {
        console.log(`  Database: ${options.db}`);
      }
      if (!proxyCreated) {
        console.log(chalk.yellow('\n  Note: Proxy host may need manual configuration in NPM'));
      }

    } catch (error) {
      spinner.fail('Deployment failed');
      // Cleanup on failure
      if (await fs.pathExists(projectDir)) {
        try {
          execSync(`docker compose down --remove-orphans 2>/dev/null || true`, {
            cwd: projectDir,
            stdio: 'pipe'
          });
        } catch {}
        await fs.remove(projectDir);
      }
      throw error;
    }
  }

  async update(name, options) {
    const spinner = ora(`Updating project: ${name}`).start();
    const projectDir = path.join(PROJECTS_DIR, name);

    try {
      // Check project exists
      if (!await fs.pathExists(projectDir)) {
        spinner.fail(`Project ${name} not found`);
        return;
      }

      // Load metadata
      const metadataPath = path.join(projectDir, '.deploy', 'metadata.json');
      const metadata = await fs.readJson(metadataPath);

      // Generate new version
      const newVersion = this.generateVersion();
      const newReleaseDir = path.join(projectDir, 'releases', newVersion);
      const oldReleaseDir = await fs.realpath(path.join(projectDir, 'current'));

      // Clone fresh copy
      spinner.text = 'Cloning latest code...';
      let branch = options.branch || metadata.branch;
      let actualBranch = branch;
      try {
        execSync(`git clone --depth 1 --branch ${branch} ${metadata.repo} ${newReleaseDir}`, {
          stdio: 'pipe',
          timeout: 120000
        });
      } catch (error) {
        // Bidirectional fallback: main ↔ master (only for default branches, not explicit -b flag)
        if ((branch === 'main' || branch === 'master') && !options.branch) {
          const fallbackBranch = branch === 'main' ? 'master' : 'main';
          execSync(`git clone --depth 1 --branch ${fallbackBranch} ${metadata.repo} ${newReleaseDir}`, {
            stdio: 'pipe',
            timeout: 120000
          });
          actualBranch = fallbackBranch;
        } else {
          throw error;
        }
      }

      // Copy shared files
      spinner.text = 'Linking shared files...';
      const sharedDir = path.join(projectDir, 'shared');
      if (await fs.pathExists(path.join(sharedDir, '.env'))) {
        await fs.copy(path.join(sharedDir, '.env'), path.join(newReleaseDir, '.env'));
      }

      // Build new containers with different project name suffix
      spinner.text = 'Building new containers...';
      const tempComposePath = path.join(projectDir, 'docker-compose.new.yml');
      const composePath = path.join(projectDir, 'docker-compose.yml');
      const composeContent = await fs.readFile(composePath, 'utf8');

      // Create temp compose with new build context
      const newComposeContent = composeContent.replace(
        /\.\/current/g,
        `./releases/${newVersion}`
      );
      await fs.writeFile(tempComposePath, newComposeContent);

      // Build with temp compose
      execSync(`docker compose -f docker-compose.new.yml build`, {
        cwd: projectDir,
        stdio: 'pipe',
        timeout: 600000
      });

      // Zero-downtime switch
      spinner.text = 'Performing zero-downtime switch...';

      // Start new containers alongside old
      execSync(`docker compose -f docker-compose.new.yml up -d`, {
        cwd: projectDir,
        stdio: 'pipe'
      });

      // Wait for new containers to be healthy
      await this.waitForHealth(name, 30);

      // Update symlink atomically
      const tempLink = path.join(projectDir, 'current.new');
      await fs.ensureSymlink(newReleaseDir, tempLink);
      await fs.rename(tempLink, path.join(projectDir, 'current'));

      // Update compose file
      await fs.move(tempComposePath, composePath, { overwrite: true });

      // Stop old containers
      spinner.text = 'Cleaning up old containers...';
      execSync(`docker compose down --remove-orphans`, {
        cwd: projectDir,
        stdio: 'pipe'
      });

      // Restart with updated compose
      execSync(`docker compose up -d`, {
        cwd: projectDir,
        stdio: 'pipe'
      });

      // Update metadata
      metadata.currentVersion = newVersion;
      metadata.previousVersion = path.basename(oldReleaseDir);
      metadata.updatedAt = new Date().toISOString();
      // Update branch if fallback was used (fixes incorrect metadata from earlier deploys)
      if (actualBranch !== metadata.branch) {
        metadata.branch = actualBranch;
      }
      await fs.writeJson(metadataPath, metadata, { spaces: 2 });

      // Cleanup old releases
      await this.cleanupReleases(projectDir);

      spinner.succeed(`Project ${name} updated to ${newVersion}`);
      console.log(`\n  URL: https://${metadata.domain}`);

    } catch (error) {
      spinner.fail('Update failed');
      throw error;
    }
  }

  async rollback(name, options) {
    const spinner = ora(`Rolling back project: ${name}`).start();
    const projectDir = path.join(PROJECTS_DIR, name);

    try {
      if (!await fs.pathExists(projectDir)) {
        spinner.fail(`Project ${name} not found`);
        return;
      }

      const releasesDir = path.join(projectDir, 'releases');
      const releases = await fs.readdir(releasesDir);
      const sortedReleases = releases.sort().reverse();

      if (sortedReleases.length < 2) {
        spinner.fail('No previous version to rollback to');
        return;
      }

      const targetVersion = options.version || sortedReleases[1];
      const targetDir = path.join(releasesDir, targetVersion);

      if (!await fs.pathExists(targetDir)) {
        spinner.fail(`Version ${targetVersion} not found`);
        return;
      }

      spinner.text = `Rolling back to ${targetVersion}...`;

      // Update docker-compose to use target release
      const composePath = path.join(projectDir, 'docker-compose.yml');
      let composeContent = await fs.readFile(composePath, 'utf8');
      composeContent = composeContent.replace(
        /\.\/releases\/v[\d.]+/g,
        `./releases/${targetVersion}`
      ).replace(
        /\.\/current/g,
        `./releases/${targetVersion}`
      );
      await fs.writeFile(composePath, composeContent);

      // Rebuild and restart
      execSync(`docker compose down`, { cwd: projectDir, stdio: 'pipe' });
      execSync(`docker compose build`, { cwd: projectDir, stdio: 'pipe', timeout: 600000 });
      execSync(`docker compose up -d`, { cwd: projectDir, stdio: 'pipe' });

      // Update symlink
      await fs.remove(path.join(projectDir, 'current'));
      await fs.ensureSymlink(targetDir, path.join(projectDir, 'current'));

      // Update metadata
      const metadataPath = path.join(projectDir, '.deploy', 'metadata.json');
      const metadata = await fs.readJson(metadataPath);
      metadata.currentVersion = targetVersion;
      metadata.updatedAt = new Date().toISOString();
      metadata.rolledBackAt = new Date().toISOString();
      await fs.writeJson(metadataPath, metadata, { spaces: 2 });

      await this.waitForHealth(name, 30);

      spinner.succeed(`Rolled back to ${targetVersion}`);

    } catch (error) {
      spinner.fail('Rollback failed');
      throw error;
    }
  }

  async list() {
    const spinner = ora('Loading projects...').start();

    try {
      const registryPath = path.join(REGISTRY_DIR, 'projects.json');

      if (!await fs.pathExists(registryPath)) {
        spinner.info('No projects deployed yet');
        return;
      }

      const registry = await fs.readJson(registryPath);
      const projects = Object.values(registry);

      spinner.stop();

      if (projects.length === 0) {
        console.log(chalk.yellow('No projects deployed yet'));
        return;
      }

      console.log(chalk.cyan('\nDeployed Projects:\n'));
      console.log('  ' + chalk.gray('NAME'.padEnd(20) + 'TYPE'.padEnd(12) + 'VERSION'.padEnd(15) + 'STATUS'.padEnd(10) + 'DOMAIN'));
      console.log('  ' + chalk.gray('-'.repeat(80)));

      for (const project of projects) {
        const status = await this.getContainerStatus(project.name);
        const statusColor = status === 'running' ? chalk.green : chalk.red;

        console.log(
          '  ' +
          project.name.padEnd(20) +
          project.type.padEnd(12) +
          (project.currentVersion || 'unknown').padEnd(15) +
          statusColor(status.padEnd(10)) +
          project.domain
        );
      }

      console.log();

    } catch (error) {
      spinner.fail('Failed to list projects');
      throw error;
    }
  }

  async status(name) {
    const spinner = ora(`Getting status for ${name}...`).start();
    const projectDir = path.join(PROJECTS_DIR, name);

    try {
      if (!await fs.pathExists(projectDir)) {
        spinner.fail(`Project ${name} not found`);
        return;
      }

      const metadata = await fs.readJson(path.join(projectDir, '.deploy', 'metadata.json'));
      const containerStatus = await this.getContainerStatus(name);

      spinner.stop();

      console.log(chalk.cyan(`\nProject: ${name}\n`));
      console.log(`  Type:            ${metadata.type}`);
      console.log(`  Version:         ${metadata.currentVersion}`);
      console.log(`  Status:          ${containerStatus === 'running' ? chalk.green(containerStatus) : chalk.red(containerStatus)}`);
      console.log(`  Domain:          https://${metadata.domain}`);
      console.log(`  Repository:      ${metadata.repo}`);
      console.log(`  Branch:          ${metadata.branch}`);
      console.log(`  Database:        ${metadata.database}`);
      console.log(`  Created:         ${metadata.createdAt}`);
      console.log(`  Updated:         ${metadata.updatedAt}`);

      // List releases
      const releasesDir = path.join(projectDir, 'releases');
      const releases = await fs.readdir(releasesDir);
      console.log(`\n  Releases (${releases.length}):`);
      for (const release of releases.sort().reverse()) {
        const current = release === metadata.currentVersion ? chalk.green(' (current)') : '';
        console.log(`    - ${release}${current}`);
      }

      console.log();

    } catch (error) {
      spinner.fail('Failed to get status');
      throw error;
    }
  }

  async health(name) {
    const spinner = ora(`Running health checks for ${name}...`).start();
    const projectDir = path.join(PROJECTS_DIR, name);

    try {
      if (!await fs.pathExists(projectDir)) {
        spinner.fail(`Project ${name} not found`);
        return;
      }

      const metadata = await fs.readJson(path.join(projectDir, '.deploy', 'metadata.json'));
      const healthResult = await this.health.check(name, metadata);

      spinner.stop();

      console.log(chalk.cyan(`\nHealth Check: ${name}\n`));

      for (const check of healthResult.checks) {
        const icon = check.passed ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${icon} ${check.name}: ${check.message}`);
      }

      console.log();
      console.log(`  Overall: ${healthResult.healthy ? chalk.green('HEALTHY') : chalk.red('UNHEALTHY')}`);
      console.log();

    } catch (error) {
      spinner.fail('Health check failed');
      throw error;
    }
  }

  async logs(name, options) {
    const projectDir = path.join(PROJECTS_DIR, name);

    if (!await fs.pathExists(projectDir)) {
      console.error(chalk.red(`Project ${name} not found`));
      return;
    }

    const args = ['compose', 'logs'];
    if (options.follow) args.push('-f');
    args.push('-n', options.lines);

    const child = spawn('docker', args, {
      cwd: projectDir,
      stdio: 'inherit'
    });

    child.on('error', (error) => {
      console.error(chalk.red('Failed to get logs:'), error.message);
    });
  }

  async db(action, options) {
    switch (action) {
      case 'backup':
        await this.dbService.backup(options.project, options.file);
        break;
      case 'restore':
        await this.dbService.restore(options.project, options.file);
        break;
      case 'list':
        await this.dbService.list();
        break;
      default:
        console.error(chalk.red(`Unknown database action: ${action}`));
    }
  }

  async remove(name, options) {
    const projectDir = path.join(PROJECTS_DIR, name);

    if (!await fs.pathExists(projectDir)) {
      console.error(chalk.red(`Project ${name} not found`));
      return;
    }

    if (!options.force) {
      console.log(chalk.yellow(`This will remove project ${name} and all its data.`));
      console.log(chalk.yellow('Use --force to confirm.'));
      return;
    }

    const spinner = ora(`Removing project: ${name}`).start();

    try {
      // Load metadata for proxy cleanup
      const metadataPath = path.join(projectDir, '.deploy', 'metadata.json');
      let metadata = null;
      if (await fs.pathExists(metadataPath)) {
        metadata = await fs.readJson(metadataPath);
      }

      // Stop and remove containers
      spinner.text = 'Stopping containers...';
      const composePath = path.join(projectDir, 'docker-compose.yml');
      if (await fs.pathExists(composePath)) {
        execSync(`docker compose down --remove-orphans --volumes`, {
          cwd: projectDir,
          stdio: 'pipe'
        });
      } else {
        // Compose file missing, try to stop containers by name
        try {
          execSync(`docker rm -f ${name}-app 2>/dev/null || true`, { stdio: 'pipe' });
        } catch (e) {
          // Container may not exist
        }
      }

      // Remove proxy host
      if (metadata?.domain) {
        spinner.text = 'Removing proxy host...';
        await this.npmApi.deleteProxyHost(metadata.domain);
      }

      // Remove database if not keeping data
      if (!options.keepData && metadata?.database !== 'none') {
        spinner.text = 'Removing database...';
        await this.dbService.remove(name);
      }

      // Remove project directory (use Docker to handle root-owned files)
      spinner.text = 'Removing files...';
      try {
        // First try normal removal
        await fs.remove(projectDir);
      } catch (err) {
        if (err.code === 'EACCES' || err.code === 'EPERM') {
          // Use Docker to remove contents with proper permissions
          spinner.text = 'Removing files (fixing permissions)...';
          execSync(`docker run --rm -v "${projectDir}:/cleanup" alpine sh -c "rm -rf /cleanup/*"`, {
            stdio: 'pipe'
          });
          // Remove the now-empty directory
          await fs.remove(projectDir);
        } else {
          throw err;
        }
      }

      // Update registry
      await this.removeFromRegistry(name);

      spinner.succeed(`Project ${name} removed`);

    } catch (error) {
      spinner.fail('Remove failed');
      throw error;
    }
  }

  async restart(name) {
    const projectDir = path.join(PROJECTS_DIR, name);

    if (!await fs.pathExists(projectDir)) {
      console.error(chalk.red(`Project ${name} not found`));
      return;
    }

    const spinner = ora(`Restarting ${name}...`).start();

    try {
      execSync(`docker compose restart`, { cwd: projectDir, stdio: 'pipe' });
      spinner.succeed(`Project ${name} restarted`);
    } catch (error) {
      spinner.fail('Restart failed');
      throw error;
    }
  }

  async stop(name) {
    const projectDir = path.join(PROJECTS_DIR, name);

    if (!await fs.pathExists(projectDir)) {
      console.error(chalk.red(`Project ${name} not found`));
      return;
    }

    const spinner = ora(`Stopping ${name}...`).start();

    try {
      execSync(`docker compose stop`, { cwd: projectDir, stdio: 'pipe' });
      spinner.succeed(`Project ${name} stopped`);
    } catch (error) {
      spinner.fail('Stop failed');
      throw error;
    }
  }

  async start(name) {
    const projectDir = path.join(PROJECTS_DIR, name);

    if (!await fs.pathExists(projectDir)) {
      console.error(chalk.red(`Project ${name} not found`));
      return;
    }

    const spinner = ora(`Starting ${name}...`).start();

    try {
      execSync(`docker compose start`, { cwd: projectDir, stdio: 'pipe' });
      spinner.succeed(`Project ${name} started`);
    } catch (error) {
      spinner.fail('Start failed');
      throw error;
    }
  }

  // Helper methods

  generateVersion() {
    const now = new Date();
    return `v${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }

  getDefaultPort(projectType) {
    const ports = {
      laravel: 80,
      react: 80,
      vue: 80,
      node: 3000
    };
    return ports[projectType] || 3000;
  }

  async generateEnvFile(projectDir, projectType, dbCredentials, options) {
    const sharedDir = path.join(projectDir, 'shared');
    const envPath = path.join(sharedDir, '.env');

    let envContent = `# Generated by Deployer\nNODE_ENV=production\n`;

    if (projectType === 'laravel') {
      envContent += `APP_ENV=production\nAPP_DEBUG=false\nAPP_KEY=base64:${this.generateRandomKey()}\n`;
    }

    if (dbCredentials) {
      if (projectType === 'laravel') {
        envContent += `\nDB_CONNECTION=${dbCredentials.type === 'postgres' ? 'pgsql' : 'mysql'}\n`;
        envContent += `DB_HOST=${dbCredentials.host}\n`;
        envContent += `DB_PORT=${dbCredentials.port}\n`;
        envContent += `DB_DATABASE=${dbCredentials.database}\n`;
        envContent += `DB_USERNAME=${dbCredentials.username}\n`;
        envContent += `DB_PASSWORD=${dbCredentials.password}\n`;
      } else {
        envContent += `\nDATABASE_URL=${dbCredentials.url}\n`;
      }
    }

    await fs.writeFile(envPath, envContent);

    // Store encrypted credentials
    if (dbCredentials) {
      await this.secrets.store(`${options.name || 'project'}_db`, dbCredentials);
    }
  }

  generateRandomKey() {
    return crypto.randomBytes(32).toString('base64');
  }

  async setupDockerConfig(projectDir, releaseDir, projectType, name, options) {
    const templateDir = path.join(TEMPLATES_DIR, projectType);

    // Copy Dockerfile to release
    const dockerfileSrc = path.join(templateDir, 'Dockerfile');
    if (await fs.pathExists(dockerfileSrc)) {
      await fs.copy(dockerfileSrc, path.join(releaseDir, 'Dockerfile'));
    }

    // Copy nginx config if exists
    const nginxConfSrc = path.join(templateDir, 'nginx.conf');
    if (await fs.pathExists(nginxConfSrc)) {
      await fs.copy(nginxConfSrc, path.join(releaseDir, 'nginx.conf'));
    }

    // Copy supervisord config if exists (for Laravel)
    const supervisordSrc = path.join(templateDir, 'supervisord.conf');
    if (await fs.pathExists(supervisordSrc)) {
      await fs.copy(supervisordSrc, path.join(releaseDir, 'supervisord.conf'));
    }

    // Generate docker-compose.yml
    const composeTemplate = await fs.readFile(path.join(templateDir, 'docker-compose.yml'), 'utf8');
    const compose = composeTemplate
      .replace(/\{\{PROJECT_NAME\}\}/g, name)
      .replace(/\{\{PORT\}\}/g, options.port || this.getDefaultPort(projectType));

    await fs.writeFile(path.join(projectDir, 'docker-compose.yml'), compose);
  }

  async runDockerBuild(projectDir) {
    return new Promise((resolve, reject) => {
      const build = spawn('docker', ['compose', 'build'], {
        cwd: projectDir,
        stdio: 'pipe'
      });

      let stderr = '';
      build.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      build.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Docker build failed: ${stderr.slice(-500)}`));
        }
      });

      build.on('error', (err) => {
        reject(err);
      });
    });
  }

  async runLaravelSetup(name) {
    const containerName = `${name}-app`;

    try {
      // Wait for container to be ready
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Fix storage permissions
      execSync(`docker exec ${containerName} chown -R www-data:www-data /var/www/html/storage`, {
        stdio: 'pipe'
      });
      execSync(`docker exec ${containerName} chmod -R 775 /var/www/html/storage`, {
        stdio: 'pipe'
      });
      execSync(`docker exec ${containerName} chmod -R 775 /var/www/html/bootstrap/cache`, {
        stdio: 'pipe'
      });

      // Generate app key if not set
      execSync(`docker exec ${containerName} php artisan key:generate --force`, {
        stdio: 'pipe'
      });

      // Cache config for production
      execSync(`docker exec ${containerName} php artisan config:cache`, {
        stdio: 'pipe'
      });

      // Run migrations if database is configured
      try {
        execSync(`docker exec ${containerName} php artisan migrate --force`, {
          stdio: 'pipe',
          timeout: 60000
        });
      } catch {
        // Migrations may fail if DB not ready, that's ok for initial deploy
      }
    } catch (error) {
      console.warn('Laravel setup warning:', error.message);
    }
  }

  async waitForHealth(name, timeoutSeconds) {
    const start = Date.now();
    const timeout = timeoutSeconds * 1000;

    while (Date.now() - start < timeout) {
      const status = await this.getContainerStatus(name);
      if (status === 'running') {
        // Additional wait for app startup
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Container health check timeout');
  }

  async getContainerStatus(name) {
    try {
      const output = execSync(
        `docker ps --filter "name=${name}" --format "{{.Status}}"`,
        { stdio: 'pipe' }
      ).toString().trim();

      if (output.includes('Up')) {
        return 'running';
      } else if (output) {
        return 'stopped';
      }
      return 'not found';
    } catch {
      return 'error';
    }
  }

  async updateRegistry(name, metadata) {
    const registryPath = path.join(REGISTRY_DIR, 'projects.json');
    let registry = {};

    if (await fs.pathExists(registryPath)) {
      registry = await fs.readJson(registryPath);
    }

    registry[name] = metadata;
    await fs.writeJson(registryPath, registry, { spaces: 2 });
  }

  async removeFromRegistry(name) {
    const registryPath = path.join(REGISTRY_DIR, 'projects.json');

    if (await fs.pathExists(registryPath)) {
      const registry = await fs.readJson(registryPath);
      delete registry[name];
      await fs.writeJson(registryPath, registry, { spaces: 2 });
    }
  }

  async cleanupReleases(projectDir) {
    const releasesDir = path.join(projectDir, 'releases');
    const releases = await fs.readdir(releasesDir);
    const sortedReleases = releases.sort().reverse();

    // Keep only MAX_RELEASES
    for (let i = MAX_RELEASES; i < sortedReleases.length; i++) {
      await fs.remove(path.join(releasesDir, sortedReleases[i]));
    }
  }

  // ============================================
  // Secrets Management Methods
  // ============================================

  async setCredentials() {
    console.log(chalk.cyan('\nNPM Credentials Setup\n'));
    console.log('Credentials will be stored encrypted using AES-256-GCM.\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    try {
      const email = await question('NPM Email: ');
      const password = await question('NPM Password: ');
      rl.close();

      if (!email || !password) {
        console.log(chalk.red('\nEmail and password are required.'));
        return;
      }

      const spinner = ora('Encrypting and storing credentials...').start();
      await this.secretsConfig.setNpmCredentials(email, password);
      spinner.succeed('Credentials stored securely');

      // Test authentication
      const testSpinner = ora('Testing NPM connection...').start();
      const authenticated = await this.npmApi.authenticate();
      if (authenticated) {
        testSpinner.succeed('NPM authentication successful');
      } else {
        testSpinner.warn('NPM authentication test failed - credentials stored but may be invalid');
      }

      console.log(chalk.green('\nCredentials configured successfully.'));

    } catch (error) {
      rl.close();
      throw error;
    }
  }

  async migrateCredentials() {
    const spinner = ora('Migrating credentials...').start();

    try {
      const migrated = await this.secretsConfig.migrateLegacyCredentials();

      if (migrated) {
        spinner.succeed('Credentials migrated to encrypted storage');
        console.log(chalk.green('\nPlaintext credentials removed from config.json'));
      } else {
        spinner.info('No legacy credentials found to migrate');
      }
    } catch (error) {
      spinner.fail('Migration failed');
      throw error;
    }
  }

  async rotateKey(options) {
    if (!options.force) {
      console.log(chalk.yellow('\nWARNING: This will rotate the master encryption key.'));
      console.log('All encrypted secrets will be re-encrypted with the new key.\n');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve =>
        rl.question('Continue? (yes/no): ', resolve)
      );
      rl.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('Aborted.');
        return;
      }
    }

    const spinner = ora('Rotating encryption key...').start();

    try {
      await this.secrets.rotateKey();
      spinner.succeed('Encryption key rotated successfully');
    } catch (error) {
      spinner.fail('Key rotation failed');
      throw error;
    }
  }

  async configStatus() {
    console.log(chalk.cyan('\nConfiguration Status\n'));

    // Check encrypted credentials
    const secrets = await this.secrets.list();
    const credSource = await this.secretsConfig.getCredentialSource();
    const hasCredentials = await this.secretsConfig.hasCredentials();

    const masterKeyExists = await fs.pathExists(path.join(REGISTRY_DIR, '.master-key'));

    console.log('  Secrets Storage:');
    console.log(`    Master key exists: ${masterKeyExists ? chalk.green('Yes') : chalk.red('No')}`);

    const credStatusColor = hasCredentials ? chalk.green : chalk.yellow;
    const credStatusText = credSource === 'none' ? 'Not set' :
                          credSource === 'env' ? 'Environment variables' :
                          credSource === 'encrypted' ? 'Encrypted' :
                          chalk.yellow('Legacy (plaintext)');
    console.log(`    NPM credentials: ${credStatusColor(credStatusText)}`);
    console.log(`    Stored secrets: ${secrets.length}`);

    if (secrets.length > 0) {
      console.log('    Secret names:');
      for (const name of secrets) {
        console.log(`      - ${name}`);
      }
    }

    // Check for legacy credentials
    if (await this.secretsConfig.hasLegacyCredentials()) {
      console.log(chalk.yellow('\n  WARNING: Legacy plaintext credentials found in config.json'));
      console.log(chalk.yellow('  Run "deploy config migrate" to secure them.'));
    }

    // Check environment variable overrides
    console.log('\n  Environment Overrides:');
    console.log(`    NPM_EMAIL: ${process.env.NPM_EMAIL ? chalk.green('Set') : chalk.gray('Not set')}`);
    console.log(`    NPM_PASSWORD: ${process.env.NPM_PASSWORD ? chalk.green('Set') : chalk.gray('Not set')}`);
    console.log(`    DEPLOYER_MASTER_KEY: ${process.env.DEPLOYER_MASTER_KEY ? chalk.green('Set') : chalk.gray('Not set')}`);

    console.log();
  }
}
