# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-02-02

### Added
- New `env-parser.js` utility for secure .env file parsing and serialization
  - Prototype pollution prevention using null-prototype objects
  - Key format validation (alphanumeric + underscore only)
  - DoS protection with line and key length limits
  - Proper escape sequence handling for quoted values
- PHP version auto-detection from `composer.json` for Laravel deployments
- `--php-version` CLI option for manual PHP version override
- Forge-style environment file merging that combines `.env.example` with deployer-generated values
- `mergeEnvForUpdate()` function to preserve credentials while adding new configuration keys

### Changed
- Environment file generation now merges `.env.example` keys with deployer values instead of creating minimal files
- Dockerfile template updated with `{{PHP_VERSION}}` placeholder for dynamic PHP version selection
- Database initialization timeout increased from 30 seconds to 60 seconds

### Fixed
- **Critical**: Laravel deployments failing due to missing configuration keys required by `composer install`
  - Root cause: Deployer created minimal .env (APP_KEY, DB credentials only) which was copied before Docker build, causing Dockerfile's conditional `.env.example` copy to be skipped
  - Solution: Environment files now merge all keys from `.env.example` with deployer-managed values
- Docker configuration files (Dockerfile, nginx.conf, supervisord.conf) not being copied during `update()` causing "Dockerfile not found" errors
- Git branch fallback now properly handles both main↔master directions during updates
- TOCTOU race conditions in file operations with improved error handling
- MySQL 8.0 first-time initialization timeout (40-50 seconds required vs previous 30 second limit)

### Security
- Enhanced environment file handling with multiple security hardening measures:
  - Prevention of prototype pollution attacks via dangerous key filtering
  - Input validation to reject malformed keys and oversized content
  - Secure handling of special characters and escape sequences
- All security measures validated with comprehensive test suite (27/27 tests passing)

## [1.1.0] - 2026-01-31

### Added
- Configurable domain suffix via `config.json` (Issue #3)
- Secure secrets management system (Issue #2)
- Claude AI agents and skills with Gemini CLI integration
- Comprehensive README.md documentation

### Changed
- Maximum releases retained reduced from 5 to 3
- Critical paths now configurable via `config.json`

### Fixed
- Proxy configuration for React/Vue deployments corrected

## [1.0.0] - 2026-01-01

### Added
- Initial release of deployer CLI
- Zero-downtime deployments with symlink strategy
- Support for Laravel, Node.js, React, and Vue applications
- Docker-based containerization
- MySQL database integration
- Automated SSL certificates via Let's Encrypt
- Release management with automatic cleanup

---

[1.2.0]: https://github.com/yourusername/deployer/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/yourusername/deployer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/yourusername/deployer/releases/tag/v1.0.0
