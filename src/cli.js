import { Command } from 'commander';
import chalk from 'chalk';
import { Deployer } from './deployer.js';

const program = new Command();
const deployer = new Deployer();

program
  .name('deploy')
  .description('Bulletproof deployment agent for Laravel, React, Vue, and Node.js projects')
  .version('1.0.0');

// Initialize deployer
program
  .command('init')
  .description('Initialize deployer and configure Nginx Proxy Manager credentials')
  .action(async () => {
    try {
      await deployer.init();
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Create new project
program
  .command('create <name>')
  .description('Clone repo, detect type, build, deploy, and configure proxy')
  .requiredOption('-r, --repo <url>', 'GitHub repository URL')
  .option('-t, --type <type>', 'Project type (laravel, react, vue, node)', 'auto')
  .option('-d, --db <type>', 'Database type (mysql, postgres, none)', 'none')
  .option('--domain <subdomain>', 'Custom subdomain (default: project name)')
  .option('-b, --branch <branch>', 'Git branch to deploy', 'main')
  .option('-p, --port <port>', 'Internal container port (auto-detected if not specified)')
  .action(async (name, options) => {
    try {
      await deployer.create(name, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Update existing project
program
  .command('update <name>')
  .description('Pull latest changes and perform zero-downtime deployment')
  .option('-b, --branch <branch>', 'Git branch to deploy')
  .action(async (name, options) => {
    try {
      await deployer.update(name, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Rollback project
program
  .command('rollback <name>')
  .description('Restore previous version')
  .option('-v, --version <version>', 'Specific version to rollback to')
  .action(async (name, options) => {
    try {
      await deployer.rollback(name, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// List all projects
program
  .command('list')
  .alias('ls')
  .description('Show all deployed projects')
  .action(async () => {
    try {
      await deployer.list();
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Project status
program
  .command('status <name>')
  .description('Show project health and version info')
  .action(async (name) => {
    try {
      await deployer.status(name);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Project health check
program
  .command('health <name>')
  .description('Run health checks on project')
  .action(async (name) => {
    try {
      await deployer.health(name);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// View logs
program
  .command('logs <name>')
  .description('View container logs')
  .option('-f, --follow', 'Follow log output')
  .option('-n, --lines <number>', 'Number of lines to show', '100')
  .action(async (name, options) => {
    try {
      await deployer.logs(name, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Database operations
program
  .command('db <action>')
  .description('Database operations (backup, restore, list)')
  .option('-p, --project <name>', 'Project name')
  .option('-f, --file <path>', 'Backup file path')
  .action(async (action, options) => {
    try {
      await deployer.db(action, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Remove project
program
  .command('remove <name>')
  .alias('rm')
  .description('Remove project and cleanup')
  .option('--keep-data', 'Keep database and volumes')
  .option('-f, --force', 'Force removal without confirmation')
  .action(async (name, options) => {
    try {
      await deployer.remove(name, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Restart project
program
  .command('restart <name>')
  .description('Restart project containers')
  .action(async (name) => {
    try {
      await deployer.restart(name);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Stop project
program
  .command('stop <name>')
  .description('Stop project containers')
  .action(async (name) => {
    try {
      await deployer.stop(name);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Start project
program
  .command('start <name>')
  .description('Start project containers')
  .action(async (name) => {
    try {
      await deployer.start(name);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Config command group for secrets management
const configCmd = program
  .command('config')
  .description('Manage deployer configuration and secrets');

// Set NPM credentials (interactive)
configCmd
  .command('set-credentials')
  .description('Set NPM credentials (stored encrypted with AES-256-GCM)')
  .action(async () => {
    try {
      await deployer.setCredentials();
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Migrate legacy credentials
configCmd
  .command('migrate')
  .description('Migrate plaintext credentials to encrypted storage')
  .action(async () => {
    try {
      await deployer.migrateCredentials();
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Rotate master encryption key
configCmd
  .command('rotate-key')
  .description('Rotate the master encryption key')
  .option('-f, --force', 'Force rotation without confirmation')
  .action(async (options) => {
    try {
      await deployer.rotateKey(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Show config status
configCmd
  .command('status')
  .description('Show configuration and secrets status')
  .action(async () => {
    try {
      await deployer.configStatus();
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program.parse();
