import { execSync } from 'child_process';
import axios from 'axios';

export class HealthChecker {
  async check(projectName, metadata) {
    const checks = [];

    // Container status check
    checks.push(await this.checkContainerStatus(projectName));

    // Container resource usage
    checks.push(await this.checkResourceUsage(projectName));

    // HTTP health endpoint check (if applicable)
    if (metadata.domain) {
      checks.push(await this.checkHttpEndpoint(metadata.domain));
    }

    // Disk space check
    checks.push(await this.checkDiskSpace());

    const healthy = checks.every(c => c.passed);

    return {
      healthy,
      checks,
      timestamp: new Date().toISOString()
    };
  }

  async checkContainerStatus(projectName) {
    try {
      const output = execSync(
        `docker ps --filter "name=${projectName}" --format "{{.Status}}"`,
        { stdio: 'pipe' }
      ).toString().trim();

      if (output.includes('Up')) {
        // Check if healthy (for containers with HEALTHCHECK)
        const healthOutput = execSync(
          `docker inspect --format='{{.State.Health.Status}}' $(docker ps -q --filter "name=${projectName}") 2>/dev/null || echo "none"`,
          { stdio: 'pipe' }
        ).toString().trim();

        if (healthOutput === 'healthy' || healthOutput === 'none') {
          return {
            name: 'Container Status',
            passed: true,
            message: `Running (${output})`
          };
        } else if (healthOutput === 'starting') {
          return {
            name: 'Container Status',
            passed: true,
            message: 'Starting up'
          };
        } else {
          return {
            name: 'Container Status',
            passed: false,
            message: `Unhealthy: ${healthOutput}`
          };
        }
      }

      return {
        name: 'Container Status',
        passed: false,
        message: output || 'Container not running'
      };
    } catch (error) {
      return {
        name: 'Container Status',
        passed: false,
        message: error.message
      };
    }
  }

  async checkResourceUsage(projectName) {
    try {
      const output = execSync(
        `docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}}" $(docker ps -q --filter "name=${projectName}") 2>/dev/null || echo "N/A"`,
        { stdio: 'pipe' }
      ).toString().trim();

      if (output === 'N/A' || !output) {
        return {
          name: 'Resource Usage',
          passed: true,
          message: 'Unable to check (container may not be running)'
        };
      }

      const [cpu, memory] = output.split(',');
      const cpuPercent = parseFloat(cpu);
      const memoryMatch = memory.match(/([\d.]+)([GMK]iB)\s*\/\s*([\d.]+)([GMK]iB)/);

      let passed = true;
      let warnings = [];

      if (cpuPercent > 90) {
        passed = false;
        warnings.push('High CPU usage');
      }

      if (memoryMatch) {
        const usedMem = this.parseMemory(memoryMatch[1], memoryMatch[2]);
        const totalMem = this.parseMemory(memoryMatch[3], memoryMatch[4]);
        const memPercent = (usedMem / totalMem) * 100;

        if (memPercent > 90) {
          passed = false;
          warnings.push('High memory usage');
        }
      }

      return {
        name: 'Resource Usage',
        passed,
        message: warnings.length ? warnings.join(', ') : `CPU: ${cpu}, Memory: ${memory}`
      };
    } catch (error) {
      return {
        name: 'Resource Usage',
        passed: true,
        message: 'Unable to check resources'
      };
    }
  }

  parseMemory(value, unit) {
    const num = parseFloat(value);
    switch (unit) {
      case 'GiB': return num * 1024 * 1024 * 1024;
      case 'MiB': return num * 1024 * 1024;
      case 'KiB': return num * 1024;
      default: return num;
    }
  }

  async checkHttpEndpoint(domain) {
    try {
      const response = await axios.get(`https://${domain}`, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      return {
        name: 'HTTP Endpoint',
        passed: true,
        message: `Responding (${response.status})`
      };
    } catch (error) {
      // Try http if https fails
      try {
        const response = await axios.get(`http://${domain}`, {
          timeout: 10000,
          validateStatus: (status) => status < 500
        });

        return {
          name: 'HTTP Endpoint',
          passed: true,
          message: `Responding via HTTP (${response.status})`
        };
      } catch {
        return {
          name: 'HTTP Endpoint',
          passed: false,
          message: error.code || error.message
        };
      }
    }
  }

  async checkDiskSpace() {
    try {
      const output = execSync(
        `df -h /home/tarek_bentaher/projects | tail -1 | awk '{print $5}'`,
        { stdio: 'pipe' }
      ).toString().trim();

      const usedPercent = parseInt(output);

      if (usedPercent > 90) {
        return {
          name: 'Disk Space',
          passed: false,
          message: `Critical: ${output} used`
        };
      } else if (usedPercent > 80) {
        return {
          name: 'Disk Space',
          passed: true,
          message: `Warning: ${output} used`
        };
      }

      return {
        name: 'Disk Space',
        passed: true,
        message: `${output} used`
      };
    } catch (error) {
      return {
        name: 'Disk Space',
        passed: true,
        message: 'Unable to check disk space'
      };
    }
  }

  async checkDatabaseConnection(projectName, dbType, dbHost) {
    try {
      if (dbType === 'mysql') {
        execSync(`docker exec ${dbHost} mysqladmin ping -h localhost --silent`, {
          stdio: 'pipe'
        });
      } else if (dbType === 'postgres') {
        execSync(`docker exec ${dbHost} pg_isready`, {
          stdio: 'pipe'
        });
      }

      return {
        name: 'Database Connection',
        passed: true,
        message: `${dbType} is responding`
      };
    } catch (error) {
      return {
        name: 'Database Connection',
        passed: false,
        message: `${dbType} connection failed`
      };
    }
  }

  async getContainerLogs(projectName, lines = 50) {
    try {
      const output = execSync(
        `docker logs --tail ${lines} $(docker ps -q --filter "name=${projectName}") 2>&1`,
        { stdio: 'pipe' }
      ).toString();

      return output;
    } catch (error) {
      return null;
    }
  }

  async getContainerMetrics(projectName) {
    try {
      const output = execSync(
        `docker stats --no-stream --format "{{json .}}" $(docker ps -q --filter "name=${projectName}")`,
        { stdio: 'pipe' }
      ).toString().trim();

      if (!output) return null;

      return JSON.parse(output);
    } catch {
      return null;
    }
  }
}
