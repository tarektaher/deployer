import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { getRegistryDir, getNpmUrl } from '../config.js';

const REGISTRY_DIR = getRegistryDir();
const CONFIG_FILE = path.join(REGISTRY_DIR, 'config.json');

export class NpmApi {
  constructor() {
    this.baseUrl = `${getNpmUrl()}/api`;
    this.token = null;
  }

  async loadConfig() {
    if (await fs.pathExists(CONFIG_FILE)) {
      return await fs.readJson(CONFIG_FILE);
    }
    return null;
  }

  async authenticate() {
    if (this.token) return true;

    const config = await this.loadConfig();
    if (!config?.npmEmail || !config?.npmPassword) {
      return false;
    }

    try {
      const response = await axios.post(`${this.baseUrl}/tokens`, {
        identity: config.npmEmail,
        secret: config.npmPassword
      });

      this.token = response.data.token;
      return true;
    } catch (error) {
      console.error('NPM authentication failed:', error.message);
      return false;
    }
  }

  async checkConnection() {
    try {
      await axios.get(getNpmUrl(), { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  async createProxyHost(domain, containerName, port) {
    try {
      if (!await this.authenticate()) {
        console.log('NPM authentication not configured. Configure proxy host manually.');
        return false;
      }

      // Check if host already exists
      const existingHosts = await this.getProxyHosts();
      const existing = existingHosts.find(h =>
        h.domain_names?.includes(domain)
      );

      if (existing) {
        // Update existing host
        await axios.put(
          `${this.baseUrl}/nginx/proxy-hosts/${existing.id}`,
          this.buildProxyHostPayload(domain, containerName, port),
          { headers: this.getHeaders() }
        );
        return true;
      }

      // Create new host
      await axios.post(
        `${this.baseUrl}/nginx/proxy-hosts`,
        this.buildProxyHostPayload(domain, containerName, port),
        { headers: this.getHeaders() }
      );

      return true;
    } catch (error) {
      console.error('Failed to create proxy host:', error.response?.data || error.message);
      return false;
    }
  }

  buildProxyHostPayload(domain, containerName, port) {
    return {
      domain_names: [domain],
      forward_scheme: 'http',
      forward_host: containerName,
      forward_port: parseInt(port),
      certificate_id: 0,  // Will use letsencrypt
      ssl_forced: true,
      http2_support: true,
      block_exploits: true,
      allow_websocket_upgrade: true,
      access_list_id: 0,
      meta: {
        letsencrypt_agree: true,
        dns_challenge: false
      },
      locations: [],
      advanced_config: ''
    };
  }

  async getProxyHosts() {
    try {
      if (!await this.authenticate()) {
        return [];
      }

      const response = await axios.get(
        `${this.baseUrl}/nginx/proxy-hosts`,
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      return [];
    }
  }

  async deleteProxyHost(domain) {
    try {
      if (!await this.authenticate()) {
        return false;
      }

      const hosts = await this.getProxyHosts();
      const host = hosts.find(h => h.domain_names?.includes(domain));

      if (host) {
        await axios.delete(
          `${this.baseUrl}/nginx/proxy-hosts/${host.id}`,
          { headers: this.getHeaders() }
        );
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async requestCertificate(domain) {
    try {
      if (!await this.authenticate()) {
        return false;
      }

      // Create certificate request
      const response = await axios.post(
        `${this.baseUrl}/nginx/certificates`,
        {
          domain_names: [domain],
          meta: {
            letsencrypt_agree: true,
            dns_challenge: false,
            letsencrypt_email: (await this.loadConfig())?.npmEmail
          }
        },
        { headers: this.getHeaders() }
      );

      return response.data?.id || false;
    } catch (error) {
      console.error('Failed to request certificate:', error.message);
      return false;
    }
  }

  async updateProxyHostCertificate(domain, certificateId) {
    try {
      if (!await this.authenticate()) {
        return false;
      }

      const hosts = await this.getProxyHosts();
      const host = hosts.find(h => h.domain_names?.includes(domain));

      if (host) {
        await axios.put(
          `${this.baseUrl}/nginx/proxy-hosts/${host.id}`,
          {
            ...host,
            certificate_id: certificateId,
            ssl_forced: true
          },
          { headers: this.getHeaders() }
        );
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }
}
