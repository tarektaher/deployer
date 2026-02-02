import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import chalk from 'chalk';
import ora from 'ora';

const NETWORK_NAME = 'nginx-proxy-manager_default';

export class DatabaseService {
  constructor(databasesDir) {
    this.databasesDir = databasesDir;
    this.registryPath = path.join(databasesDir, 'registry.json');
  }

  async loadRegistry() {
    if (await fs.pathExists(this.registryPath)) {
      return await fs.readJson(this.registryPath);
    }
    return { mysql: {}, postgres: {} };
  }

  async saveRegistry(registry) {
    await fs.writeJson(this.registryPath, registry, { spaces: 2 });
  }

  generatePassword() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateDbName(projectName) {
    return projectName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  }

  /**
   * Check if a MySQL user exists
   */
  async checkMySqlUserExists(username, rootPassword) {
    try {
      const result = execSync(
        `docker exec shared-mysql mysql -u root -p${rootPassword.trim()} -N -e "SELECT COUNT(*) FROM mysql.user WHERE user='${username}'"`,
        { stdio: 'pipe' }
      ).toString().trim();
      return parseInt(result) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Validate MySQL connection with given credentials
   */
  async validateMySqlConnection(database, username, password) {
    try {
      execSync(
        `docker exec shared-mysql mysql -u ${username} -p${password} -e "SELECT 1" ${database}`,
        { stdio: 'pipe', timeout: 5000 }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset MySQL user password
   */
  async resetMySqlUserPassword(username, newPassword, rootPassword) {
    execSync(
      `docker exec shared-mysql mysql -u root -p${rootPassword.trim()} -e "ALTER USER '${username}'@'%' IDENTIFIED BY '${newPassword}'; FLUSH PRIVILEGES;"`,
      { stdio: 'pipe' }
    );
  }

  /**
   * Create a new MySQL user
   */
  async createMySqlUser(username, password, rootPassword) {
    execSync(
      `docker exec shared-mysql mysql -u root -p${rootPassword.trim()} -e "CREATE USER '${username}'@'%' IDENTIFIED BY '${password}';"`,
      { stdio: 'pipe' }
    );
  }

  /**
   * Ensure MySQL database exists and user has proper grants
   */
  async ensureMySqlDatabase(database, username, rootPassword) {
    execSync(
      `docker exec shared-mysql mysql -u root -p${rootPassword.trim()} -e "CREATE DATABASE IF NOT EXISTS ${database}; GRANT ALL PRIVILEGES ON ${database}.* TO '${username}'@'%'; FLUSH PRIVILEGES;"`,
      { stdio: 'pipe' }
    );
  }

  /**
   * Provision MySQL database with idempotent logic:
   * - Reuses existing registry password when available
   * - Validates connection and fixes password mismatches
   * - Ensures database and grants exist
   */
  async provisionMySql(projectName, server) {
    const dbName = this.generateDbName(projectName);
    const username = `user_${dbName}`;
    const rootPassword = await fs.readFile(
      path.join(this.databasesDir, 'mysql', '.root-password'),
      'utf8'
    );

    // 1. Check registry for existing credentials
    const registry = await this.loadRegistry();
    const existingEntry = registry.mysql?.[projectName];
    const existingPassword = existingEntry?.password;

    // 2. Check if MySQL user exists
    const userExists = await this.checkMySqlUserExists(username, rootPassword);

    let password;

    if (userExists && existingPassword) {
      // User exists AND we have registry password - validate it
      const isValid = await this.validateMySqlConnection(dbName, username, existingPassword);
      if (isValid) {
        password = existingPassword; // Reuse working password
      } else {
        // Password mismatch - reset MySQL to match registry
        password = existingPassword;
        await this.resetMySqlUserPassword(username, password, rootPassword);
      }
    } else if (userExists && !existingPassword) {
      // User exists but no registry - generate new and reset
      password = this.generatePassword();
      await this.resetMySqlUserPassword(username, password, rootPassword);
    } else {
      // User doesn't exist - create new
      password = existingPassword || this.generatePassword();
      await this.createMySqlUser(username, password, rootPassword);
    }

    // 3. Ensure database exists and grants are correct
    await this.ensureMySqlDatabase(dbName, username, rootPassword);

    // 4. Save to registry (idempotent)
    registry.mysql = registry.mysql || {};
    registry.mysql[projectName] = {
      database: dbName,
      username,
      password,
      host: server.host,
      port: server.port,
      createdAt: existingEntry?.createdAt || new Date().toISOString()
    };
    await this.saveRegistry(registry);

    // 5. Final validation
    const finalCheck = await this.validateMySqlConnection(dbName, username, password);
    if (!finalCheck) {
      throw new Error(`MySQL connection validation failed for ${username}@${dbName}`);
    }

    const url = `mysql://${username}:${password}@${server.host}:${server.port}/${dbName}`;

    return {
      type: 'mysql',
      database: dbName,
      username,
      password,
      host: server.host,
      port: server.port,
      url
    };
  }

  async ensureMySQLServer() {
    const containerName = 'shared-mysql';

    try {
      const running = execSync(`docker ps -q -f name=${containerName}`, { stdio: 'pipe' })
        .toString().trim();

      if (running) {
        return { host: containerName, port: 3306 };
      }
    } catch {}

    // Start MySQL server
    const rootPassword = this.generatePassword();
    const composeContent = `
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    container_name: ${containerName}
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${rootPassword}
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - npm_network
    deploy:
      resources:
        limits:
          memory: 512M

volumes:
  mysql_data:

networks:
  npm_network:
    external: true
    name: ${NETWORK_NAME}
`;

    const composeDir = path.join(this.databasesDir, 'mysql');
    await fs.ensureDir(composeDir);
    await fs.writeFile(path.join(composeDir, 'docker-compose.yml'), composeContent);
    await fs.writeFile(path.join(composeDir, '.root-password'), rootPassword);

    execSync('docker compose up -d', { cwd: composeDir, stdio: 'pipe' });

    // Wait for MySQL to be ready (60s for first-time initialization)
    await this.waitForDatabase(containerName, 'mysql', 60);

    return { host: containerName, port: 3306, rootPassword };
  }

  async ensurePostgresServer() {
    const containerName = 'shared-postgres';

    try {
      const running = execSync(`docker ps -q -f name=${containerName}`, { stdio: 'pipe' })
        .toString().trim();

      if (running) {
        return { host: containerName, port: 5432 };
      }
    } catch {}

    // Start PostgreSQL server
    const rootPassword = this.generatePassword();
    const composeContent = `
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    container_name: ${containerName}
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${rootPassword}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - npm_network
    deploy:
      resources:
        limits:
          memory: 256M

volumes:
  postgres_data:

networks:
  npm_network:
    external: true
    name: ${NETWORK_NAME}
`;

    const composeDir = path.join(this.databasesDir, 'postgres');
    await fs.ensureDir(composeDir);
    await fs.writeFile(path.join(composeDir, 'docker-compose.yml'), composeContent);
    await fs.writeFile(path.join(composeDir, '.root-password'), rootPassword);

    execSync('docker compose up -d', { cwd: composeDir, stdio: 'pipe' });

    // Wait for PostgreSQL to be ready (60s for first-time initialization)
    await this.waitForDatabase(containerName, 'postgres', 60);

    return { host: containerName, port: 5432, rootPassword };
  }

  async waitForDatabase(containerName, type, timeoutSeconds) {
    const start = Date.now();
    const timeout = timeoutSeconds * 1000;

    while (Date.now() - start < timeout) {
      try {
        if (type === 'mysql') {
          execSync(`docker exec ${containerName} mysqladmin ping -h localhost --silent`, {
            stdio: 'pipe'
          });
        } else {
          execSync(`docker exec ${containerName} pg_isready`, {
            stdio: 'pipe'
          });
        }
        return true;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error(`Database ${containerName} failed to start within ${timeoutSeconds}s`);
  }

  async provision(projectName, dbType) {
    const spinner = ora(`Provisioning ${dbType} database...`).start();

    try {
      let result;

      if (dbType === 'mysql') {
        const server = await this.ensureMySQLServer();
        result = await this.provisionMySql(projectName, server);
      } else if (dbType === 'postgres') {
        result = await this.provisionPostgres(projectName);
      } else {
        throw new Error(`Unsupported database type: ${dbType}`);
      }

      spinner.succeed(`Database ${result.database} provisioned`);
      return result;
    } catch (error) {
      spinner.fail('Database provisioning failed');
      throw error;
    }
  }

  /**
   * Provision PostgreSQL database (existing logic, kept for compatibility)
   */
  async provisionPostgres(projectName) {
    const dbName = this.generateDbName(projectName);
    const username = `user_${dbName}`;

    const server = await this.ensurePostgresServer();
    const rootPassword = await fs.readFile(
      path.join(this.databasesDir, 'postgres', '.root-password'),
      'utf8'
    );

    // Check registry for existing credentials
    const registry = await this.loadRegistry();
    const existingEntry = registry.postgres?.[projectName];
    const password = existingEntry?.password || this.generatePassword();

    // Create database and user (idempotent commands)
    execSync(`docker exec shared-postgres psql -U postgres -c "CREATE USER ${username} WITH PASSWORD '${password}';" 2>/dev/null || true`, {
      stdio: 'pipe'
    });
    execSync(`docker exec shared-postgres psql -U postgres -c "CREATE DATABASE ${dbName} OWNER ${username};" 2>/dev/null || true`, {
      stdio: 'pipe'
    });
    execSync(`docker exec shared-postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${username};"`, {
      stdio: 'pipe'
    });

    // If user existed with different password, update it
    if (existingEntry?.password) {
      execSync(`docker exec shared-postgres psql -U postgres -c "ALTER USER ${username} WITH PASSWORD '${password}';"`, {
        stdio: 'pipe'
      });
    }

    const url = `postgresql://${username}:${password}@${server.host}:${server.port}/${dbName}`;

    // Save to registry
    registry.postgres = registry.postgres || {};
    registry.postgres[projectName] = {
      database: dbName,
      username,
      password,
      host: server.host,
      port: server.port,
      createdAt: existingEntry?.createdAt || new Date().toISOString()
    };
    await this.saveRegistry(registry);

    return {
      type: 'postgres',
      database: dbName,
      username,
      password,
      host: server.host,
      port: server.port,
      url
    };
  }

  async backup(projectName, outputFile) {
    const spinner = ora(`Backing up database for ${projectName}...`).start();

    try {
      const registry = await this.loadRegistry();

      // Find database for project
      let dbInfo = null;
      let dbType = null;

      if (registry.mysql[projectName]) {
        dbInfo = registry.mysql[projectName];
        dbType = 'mysql';
      } else if (registry.postgres[projectName]) {
        dbInfo = registry.postgres[projectName];
        dbType = 'postgres';
      }

      if (!dbInfo) {
        spinner.fail(`No database found for project ${projectName}`);
        return;
      }

      const backupDir = path.join(this.databasesDir, 'backups');
      await fs.ensureDir(backupDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = outputFile || path.join(backupDir, `${projectName}_${timestamp}.sql`);

      if (dbType === 'mysql') {
        execSync(`docker exec shared-mysql mysqldump -u ${dbInfo.username} -p${dbInfo.password} ${dbInfo.database} > ${backupFile}`, {
          stdio: 'pipe',
          shell: '/bin/bash'
        });
      } else {
        execSync(`docker exec shared-postgres pg_dump -U ${dbInfo.username} ${dbInfo.database} > ${backupFile}`, {
          stdio: 'pipe',
          shell: '/bin/bash',
          env: { ...process.env, PGPASSWORD: dbInfo.password }
        });
      }

      spinner.succeed(`Backup saved to ${backupFile}`);
    } catch (error) {
      spinner.fail('Backup failed');
      throw error;
    }
  }

  async restore(projectName, inputFile) {
    const spinner = ora(`Restoring database for ${projectName}...`).start();

    try {
      if (!await fs.pathExists(inputFile)) {
        spinner.fail(`Backup file not found: ${inputFile}`);
        return;
      }

      const registry = await this.loadRegistry();

      let dbInfo = null;
      let dbType = null;

      if (registry.mysql[projectName]) {
        dbInfo = registry.mysql[projectName];
        dbType = 'mysql';
      } else if (registry.postgres[projectName]) {
        dbInfo = registry.postgres[projectName];
        dbType = 'postgres';
      }

      if (!dbInfo) {
        spinner.fail(`No database found for project ${projectName}`);
        return;
      }

      if (dbType === 'mysql') {
        execSync(`docker exec -i shared-mysql mysql -u ${dbInfo.username} -p${dbInfo.password} ${dbInfo.database} < ${inputFile}`, {
          stdio: 'pipe',
          shell: '/bin/bash'
        });
      } else {
        execSync(`docker exec -i shared-postgres psql -U ${dbInfo.username} ${dbInfo.database} < ${inputFile}`, {
          stdio: 'pipe',
          shell: '/bin/bash',
          env: { ...process.env, PGPASSWORD: dbInfo.password }
        });
      }

      spinner.succeed('Database restored');
    } catch (error) {
      spinner.fail('Restore failed');
      throw error;
    }
  }

  async remove(projectName) {
    const registry = await this.loadRegistry();

    if (registry.mysql[projectName]) {
      const dbInfo = registry.mysql[projectName];
      const rootPassword = await fs.readFile(
        path.join(this.databasesDir, 'mysql', '.root-password'),
        'utf8'
      );

      try {
        execSync(`docker exec shared-mysql mysql -u root -p${rootPassword.trim()} -e "DROP DATABASE IF EXISTS ${dbInfo.database}; DROP USER IF EXISTS '${dbInfo.username}'@'%';"`, {
          stdio: 'pipe'
        });
      } catch {}

      delete registry.mysql[projectName];
    }

    if (registry.postgres[projectName]) {
      const dbInfo = registry.postgres[projectName];

      try {
        execSync(`docker exec shared-postgres psql -U postgres -c "DROP DATABASE IF EXISTS ${dbInfo.database};"`, {
          stdio: 'pipe'
        });
        execSync(`docker exec shared-postgres psql -U postgres -c "DROP USER IF EXISTS ${dbInfo.username};"`, {
          stdio: 'pipe'
        });
      } catch {}

      delete registry.postgres[projectName];
    }

    await this.saveRegistry(registry);
  }

  async list() {
    const registry = await this.loadRegistry();

    console.log(chalk.cyan('\nProvisioned Databases:\n'));

    const allDbs = [
      ...Object.entries(registry.mysql).map(([name, info]) => ({ name, type: 'mysql', ...info })),
      ...Object.entries(registry.postgres).map(([name, info]) => ({ name, type: 'postgres', ...info }))
    ];

    if (allDbs.length === 0) {
      console.log(chalk.yellow('  No databases provisioned'));
      return;
    }

    console.log('  ' + chalk.gray('PROJECT'.padEnd(20) + 'TYPE'.padEnd(12) + 'DATABASE'.padEnd(25) + 'HOST'));
    console.log('  ' + chalk.gray('-'.repeat(70)));

    for (const db of allDbs) {
      console.log(
        '  ' +
        db.name.padEnd(20) +
        db.type.padEnd(12) +
        db.database.padEnd(25) +
        `${db.host}:${db.port}`
      );
    }

    console.log();
  }
}
