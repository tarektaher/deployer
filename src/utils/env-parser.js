/**
 * .env file parser and serializer utility
 * Handles parsing .env content to object and serializing object back to .env format
 *
 * Security considerations:
 * - Prevents prototype pollution attacks
 * - Validates key format (alphanumeric + underscore)
 * - Limits input size to prevent DoS
 * - Properly escapes special characters
 */

// Security constants
const MAX_LINE_LENGTH = 10000;
const MAX_KEY_LENGTH = 256;
const KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Parse .env file content into a key-value object
 * Handles: comments, quotes, empty lines, export prefix, values with =
 *
 * @param {string} content - Raw .env file content
 * @returns {Object} Parsed key-value pairs (null prototype object)
 */
export function parseEnvFile(content) {
  // Use Object.create(null) to prevent prototype pollution
  const env = Object.create(null);

  if (!content || typeof content !== 'string') {
    return env;
  }

  // Handle BOM (Byte Order Mark) at start of file
  const cleanContent = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;

  const lines = cleanContent.split('\n');

  for (const line of lines) {
    // Trim the line
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Skip lines that are too long (DoS protection)
    if (trimmed.length > MAX_LINE_LENGTH) {
      continue;
    }

    // Remove optional 'export ' prefix
    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice(7)
      : trimmed;

    // Find the first = sign (values can contain =)
    const equalIndex = withoutExport.indexOf('=');
    if (equalIndex === -1) {
      continue; // Invalid line, skip
    }

    const key = withoutExport.slice(0, equalIndex).trim();
    let value = withoutExport.slice(equalIndex + 1);

    // Skip if key is empty or too long
    if (!key || key.length > MAX_KEY_LENGTH) {
      continue;
    }

    // Validate key format (must be valid env var name)
    if (!KEY_REGEX.test(key)) {
      continue;
    }

    // Security: Reject prototype pollution attempts
    if (DANGEROUS_KEYS.includes(key.toLowerCase())) {
      continue;
    }

    // Handle quoted values (single or double quotes)
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
      // Unescape escaped characters in quoted values
      value = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
    }

    env[key] = value;
  }

  return env;
}

/**
 * Serialize a key-value object to .env file format
 * Quotes values that contain spaces, special characters, or are empty
 *
 * @param {Object} env - Key-value pairs to serialize
 * @returns {string} .env formatted content
 */
export function serializeEnvFile(env) {
  // Validate input type (reject arrays and non-objects)
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return '';
  }

  const lines = [];

  // Use Object.keys to avoid inherited properties
  for (const key of Object.keys(env)) {
    const value = env[key];

    // Skip null/undefined values
    if (value === null || value === undefined) {
      continue;
    }

    // Security: Skip dangerous keys
    if (DANGEROUS_KEYS.includes(key.toLowerCase())) {
      continue;
    }

    // Skip invalid key formats
    if (!KEY_REGEX.test(key)) {
      continue;
    }

    const stringValue = String(value);

    // Quote values that need quoting:
    // - Empty strings
    // - Contains spaces or special characters
    // - Contains newlines, carriage returns, tabs
    const needsQuoting = stringValue === '' ||
      /[\s#$"'\\`!]/.test(stringValue) ||
      /[\n\r\t]/.test(stringValue);

    if (needsQuoting) {
      // Escape special characters in order (backslash first)
      const escaped = stringValue
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
        .replace(/"/g, '\\"');
      lines.push(`${key}="${escaped}"`);
    } else {
      lines.push(`${key}=${stringValue}`);
    }
  }

  return lines.join('\n') + '\n';
}
