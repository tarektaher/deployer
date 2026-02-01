import fs from 'fs-extra';
import path from 'path';

export async function detectProjectType(projectDir) {
  const packageJsonPath = path.join(projectDir, 'package.json');
  const composerJsonPath = path.join(projectDir, 'composer.json');

  // Check for Laravel (PHP)
  if (await fs.pathExists(composerJsonPath)) {
    const composer = await fs.readJson(composerJsonPath);

    if (composer.require?.['laravel/framework'] || composer.name?.includes('laravel')) {
      return 'laravel';
    }
  }

  // Check for Node.js projects
  if (await fs.pathExists(packageJsonPath)) {
    const packageJson = await fs.readJson(packageJsonPath);
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    // Check for React
    if (deps['react'] || deps['react-dom']) {
      // Check if it's Next.js
      if (deps['next']) {
        return 'node'; // Next.js runs as Node server
      }
      return 'react';
    }

    // Check for Vue
    if (deps['vue']) {
      // Check if it's Nuxt
      if (deps['nuxt']) {
        return 'node'; // Nuxt runs as Node server
      }
      return 'vue';
    }

    // Check for pure Node.js server frameworks
    if (
      deps['express'] ||
      deps['fastify'] ||
      deps['koa'] ||
      deps['hapi'] ||
      deps['@hapi/hapi'] ||
      deps['nestjs'] ||
      deps['@nestjs/core']
    ) {
      return 'node';
    }

    // Check for build scripts to determine if it's SPA
    const scripts = packageJson.scripts || {};
    if (scripts.build && (scripts.start || scripts.serve)) {
      // Has both build and serve/start - likely a framework app
      if (scripts.start?.includes('node') || scripts.start?.includes('ts-node')) {
        return 'node';
      }
    }

    // Default to node for any package.json project
    return 'node';
  }

  // Check for static site generators
  const indexHtmlPath = path.join(projectDir, 'index.html');
  if (await fs.pathExists(indexHtmlPath)) {
    // Check for Vite config
    if (await fs.pathExists(path.join(projectDir, 'vite.config.js')) ||
        await fs.pathExists(path.join(projectDir, 'vite.config.ts'))) {
      const viteConfig = await fs.readFile(
        await fs.pathExists(path.join(projectDir, 'vite.config.js'))
          ? path.join(projectDir, 'vite.config.js')
          : path.join(projectDir, 'vite.config.ts'),
        'utf8'
      );

      if (viteConfig.includes('@vitejs/plugin-vue')) {
        return 'vue';
      }
      if (viteConfig.includes('@vitejs/plugin-react')) {
        return 'react';
      }
    }
  }

  return null;
}

export function getProjectInfo(projectType) {
  const info = {
    laravel: {
      name: 'Laravel',
      runtime: 'PHP 8.3',
      buildCommand: null,
      startCommand: null,
      defaultPort: 80,
      features: ['Queue Workers', 'Scheduler', 'PHP-FPM', 'Nginx']
    },
    react: {
      name: 'React SPA',
      runtime: 'Node.js (build) + Nginx (serve)',
      buildCommand: 'npm run build',
      startCommand: null,
      defaultPort: 80,
      features: ['Static Files', 'SPA Routing']
    },
    vue: {
      name: 'Vue SPA',
      runtime: 'Node.js (build) + Nginx (serve)',
      buildCommand: 'npm run build',
      startCommand: null,
      defaultPort: 80,
      features: ['Static Files', 'SPA Routing']
    },
    node: {
      name: 'Node.js',
      runtime: 'Node.js 20',
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      defaultPort: 3000,
      features: ['Server-side', 'Health Checks']
    }
  };

  return info[projectType] || null;
}
