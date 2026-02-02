import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

let cachedConfig = null;

export async function loadConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (!await fs.pathExists(CONFIG_PATH)) {
    throw new Error(
      `Config file not found: ${CONFIG_PATH}\n` +
      `Create a config.json file with projectsDir and domainSuffix settings.`
    );
  }

  try {
    cachedConfig = await fs.readJson(CONFIG_PATH);
    return cachedConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in config file: ${CONFIG_PATH}\n` +
        `Error: ${error.message}`
      );
    }
    throw error;
  }
}

export function loadConfigSync() {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (!fs.pathExistsSync(CONFIG_PATH)) {
    throw new Error(
      `Config file not found: ${CONFIG_PATH}\n` +
      `Create a config.json file with projectsDir and domainSuffix settings.`
    );
  }

  try {
    cachedConfig = fs.readJsonSync(CONFIG_PATH);
    return cachedConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in config file: ${CONFIG_PATH}\n` +
        `Error: ${error.message}`
      );
    }
    throw error;
  }
}

export function clearConfigCache() {
  cachedConfig = null;
}

export function getProjectsDir() {
  const config = loadConfigSync();
  return config.projectsDir;
}

export function getRegistryDir() {
  return path.join(getProjectsDir(), '.registry');
}

export function getDatabasesDir() {
  return path.join(getProjectsDir(), '_databases');
}

export function getDomainSuffix() {
  const config = loadConfigSync();
  const domain = config.domain || config.domainSuffix;

  if (!domain) {
    throw new Error(
      `Domain suffix not configured.\n` +
      `Run 'deploy config set-domain <your-domain>' to set it.`
    );
  }

  return domain;
}

export function getMaxReleases() {
  const config = loadConfigSync();
  return config.maxReleases || 5;
}

export function getNpmUrl() {
  const config = loadConfigSync();
  return config.npm?.url || 'http://localhost:81';
}
