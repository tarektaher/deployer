import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { SecretsManager } from './secrets.js';

/**
 * SecretsConfig - Unified interface for secure credential retrieval
 *
 * Priority order:
 * 1. Environment variables (for CI/CD)
 * 2. Encrypted secrets storage (default for interactive use)
 * 3. Legacy plaintext config (backward compatibility with deprecation warning)
 */
export class SecretsConfig {
  constructor(registryDir) {
    this.registryDir = registryDir;
    this.secrets = new SecretsManager(registryDir);
    this.configFile = path.join(registryDir, 'config.json');
    this._legacyWarningShown = false;
  }

  /**
   * Load legacy plaintext config
   */
  async loadLegacyConfig() {
    if (await fs.pathExists(this.configFile)) {
      return await fs.readJson(this.configFile);
    }
    return null;
  }

  /**
   * Get NPM credentials with priority: env > encrypted > plaintext (deprecated)
   * @returns {Promise<{email: string, password: string} | null>}
   */
  async getNpmCredentials() {
    // 1. Check environment variables first (for CI/CD)
    if (process.env.NPM_EMAIL && process.env.NPM_PASSWORD) {
      return {
        email: process.env.NPM_EMAIL,
        password: process.env.NPM_PASSWORD
      };
    }

    // 2. Try encrypted storage
    try {
      const encrypted = await this.secrets.retrieve('npm_credentials');
      if (encrypted?.email && encrypted?.password) {
        return encrypted;
      }
    } catch (error) {
      // Encrypted storage not available or corrupted
    }

    // 3. Fallback to legacy plaintext with warning
    const config = await this.loadLegacyConfig();
    if (config?.npmEmail && config?.npmPassword) {
      if (!this._legacyWarningShown) {
        console.warn(chalk.yellow(
          '\nWARNING: Using plaintext credentials from config.json is deprecated.'
        ));
        console.warn(chalk.yellow(
          'Run "deploy config migrate" to migrate to encrypted storage.\n'
        ));
        this._legacyWarningShown = true;
      }
      return {
        email: config.npmEmail,
        password: config.npmPassword
      };
    }

    return null;
  }

  /**
   * Store NPM credentials in encrypted format
   * @param {string} email
   * @param {string} password
   */
  async setNpmCredentials(email, password) {
    await this.secrets.store('npm_credentials', { email, password });
  }

  /**
   * Check if credentials are configured (any source)
   * @returns {Promise<boolean>}
   */
  async hasCredentials() {
    const creds = await this.getNpmCredentials();
    return !!(creds?.email && creds?.password);
  }

  /**
   * Check credential source
   * @returns {Promise<'env' | 'encrypted' | 'legacy' | 'none'>}
   */
  async getCredentialSource() {
    if (process.env.NPM_EMAIL && process.env.NPM_PASSWORD) {
      return 'env';
    }

    try {
      const encrypted = await this.secrets.retrieve('npm_credentials');
      if (encrypted?.email && encrypted?.password) {
        return 'encrypted';
      }
    } catch {}

    const config = await this.loadLegacyConfig();
    if (config?.npmEmail && config?.npmPassword) {
      return 'legacy';
    }

    return 'none';
  }

  /**
   * Migrate legacy plaintext credentials to encrypted storage
   * @returns {Promise<boolean>} true if migration was performed
   */
  async migrateLegacyCredentials() {
    const config = await this.loadLegacyConfig();

    if (!config?.npmEmail || !config?.npmPassword) {
      return false;
    }

    // Store encrypted
    await this.setNpmCredentials(config.npmEmail, config.npmPassword);

    // Remove from plaintext config
    delete config.npmEmail;
    delete config.npmPassword;
    await fs.writeJson(this.configFile, config, { spaces: 2 });

    return true;
  }

  /**
   * Check if legacy credentials exist
   * @returns {Promise<boolean>}
   */
  async hasLegacyCredentials() {
    const config = await this.loadLegacyConfig();
    return !!(config?.npmEmail && config?.npmPassword);
  }

  /**
   * Get the email for Let's Encrypt certificates
   * @returns {Promise<string | null>}
   */
  async getLetsEncryptEmail() {
    const creds = await this.getNpmCredentials();
    return creds?.email || null;
  }
}
