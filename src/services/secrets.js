import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

export class SecretsManager {
  constructor(registryDir) {
    this.registryDir = registryDir;
    this.secretsDir = path.join(registryDir, 'secrets');
    this.keyFile = path.join(registryDir, '.master-key');
  }

  async ensureKey() {
    await fs.ensureDir(this.secretsDir);

    if (await fs.pathExists(this.keyFile)) {
      return await fs.readFile(this.keyFile, 'utf8');
    }

    // Generate new master key
    const key = crypto.randomBytes(KEY_LENGTH).toString('hex');
    await fs.writeFile(this.keyFile, key, { mode: 0o600 });
    return key;
  }

  deriveKey(masterKey, salt) {
    return crypto.pbkdf2Sync(
      Buffer.from(masterKey, 'hex'),
      salt,
      100000,
      KEY_LENGTH,
      'sha256'
    );
  }

  async encrypt(data) {
    const masterKey = await this.ensureKey();
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.deriveKey(masterKey, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const plaintext = JSON.stringify(data);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine: salt + iv + authTag + encrypted
    return Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'base64')
    ]).toString('base64');
  }

  async decrypt(encryptedData) {
    const masterKey = await this.ensureKey();
    const data = Buffer.from(encryptedData, 'base64');

    // Extract components
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const key = this.deriveKey(masterKey, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  async store(name, data) {
    const encrypted = await this.encrypt(data);
    const filePath = path.join(this.secretsDir, `${name}.enc`);
    await fs.writeFile(filePath, encrypted, { mode: 0o600 });
  }

  async retrieve(name) {
    const filePath = path.join(this.secretsDir, `${name}.enc`);

    if (!await fs.pathExists(filePath)) {
      return null;
    }

    const encrypted = await fs.readFile(filePath, 'utf8');
    return await this.decrypt(encrypted);
  }

  async delete(name) {
    const filePath = path.join(this.secretsDir, `${name}.enc`);
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }
  }

  async list() {
    if (!await fs.pathExists(this.secretsDir)) {
      return [];
    }

    const files = await fs.readdir(this.secretsDir);
    return files
      .filter(f => f.endsWith('.enc'))
      .map(f => f.replace('.enc', ''));
  }

  async generateEnvFile(projectDir, secrets) {
    const envPath = path.join(projectDir, 'shared', '.env');
    let envContent = '';

    for (const [key, value] of Object.entries(secrets)) {
      if (typeof value === 'object') {
        // Flatten object secrets
        for (const [subKey, subValue] of Object.entries(value)) {
          envContent += `${key.toUpperCase()}_${subKey.toUpperCase()}=${subValue}\n`;
        }
      } else {
        envContent += `${key.toUpperCase()}=${value}\n`;
      }
    }

    await fs.ensureDir(path.dirname(envPath));
    await fs.writeFile(envPath, envContent, { mode: 0o600 });
  }

  async rotateKey() {
    // Get all secrets with current key
    const secrets = {};
    const names = await this.list();

    for (const name of names) {
      secrets[name] = await this.retrieve(name);
    }

    // Generate new key
    const newKey = crypto.randomBytes(KEY_LENGTH).toString('hex');
    await fs.writeFile(this.keyFile, newKey, { mode: 0o600 });

    // Re-encrypt all secrets with new key
    for (const [name, data] of Object.entries(secrets)) {
      await this.store(name, data);
    }

    return true;
  }
}
