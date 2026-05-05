#!/usr/bin/env node

/**
 * model-health.mjs — Local model configuration report
 *
 * This script validates model provider configuration shape and local
 * availability. It does not call remote model APIs and never reads API keys
 * from files.
 */

import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import yaml from 'js-yaml';

const CONFIG_PATH = existsSync('config/models.yml')
  ? 'config/models.yml'
  : 'config/models.example.yml';

function commandExists(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${JSON.stringify(command)}`], {
    encoding: 'utf-8',
  });
  return result.status === 0;
}

function statusMark(status) {
  if (status === 'ready') return '✓';
  if (status === 'configured') return '·';
  return '!';
}

function checkProvider(name, provider) {
  if (!provider || typeof provider !== 'object') {
    return { name, status: 'invalid', detail: 'Provider config must be an object' };
  }

  if (provider.type === 'openai_compatible') {
    const missing = [];
    if (!provider.base_url) missing.push('base_url');
    if (!provider.model) missing.push('model');
    if (!provider.api_key_env) missing.push('api_key_env');
    if (missing.length > 0) {
      return { name, status: 'invalid', detail: `Missing ${missing.join(', ')}` };
    }
    const hasKey = Boolean(process.env[provider.api_key_env]);
    return {
      name,
      status: hasKey ? 'ready' : 'configured',
      detail: `${provider.model} @ ${provider.base_url}; credential environment ${hasKey ? 'set' : 'not set'}`,
    };
  }

  if (provider.type === 'gemini') {
    if (!provider.model || !provider.api_key_env) {
      return { name, status: 'invalid', detail: 'Gemini provider requires model and api_key_env' };
    }
    const hasKey = Boolean(process.env[provider.api_key_env]);
    return {
      name,
      status: hasKey ? 'ready' : 'configured',
      detail: `${provider.model}; credential environment ${hasKey ? 'set' : 'not set'}`,
    };
  }

  if (provider.type === 'cli') {
    if (!provider.command) {
      return { name, status: 'invalid', detail: 'CLI provider requires command' };
    }
    const available = commandExists(provider.command);
    return {
      name,
      status: available ? 'ready' : 'configured',
      detail: `${provider.command} ${available ? 'found' : 'not found in PATH'}`,
    };
  }

  return { name, status: 'invalid', detail: `Unsupported provider type: ${provider.type || 'missing'}` };
}

function main() {
  if (!existsSync(CONFIG_PATH)) {
    console.error('Error: no config/models.yml or config/models.example.yml found.');
    process.exit(1);
  }

  const config = yaml.load(readFileSync(CONFIG_PATH, 'utf-8')) || {};
  const providers = config.providers || {};

  console.log('\nyoCareer model health');
  console.log('=====================\n');
  console.log(`Config: ${CONFIG_PATH}`);
  console.log(`Default: ${config.default || 'not set'}\n`);

  let invalid = 0;
  for (const [name, provider] of Object.entries(providers)) {
    const result = checkProvider(name, provider);
    if (result.status === 'invalid') invalid++;
    console.log(`${statusMark(result.status)} ${name.padEnd(16)} ${result.status.padEnd(11)} ${result.detail}`);
  }

  if (Object.keys(providers).length === 0) {
    console.log('! no providers configured');
    invalid++;
  }

  if (config.default && !providers[config.default]) {
    console.log(`! default provider not found: ${config.default}`);
    invalid++;
  }

  console.log('\nKeys stay in environment variables. This check does not call remote APIs.');
  process.exit(invalid > 0 ? 1 : 0);
}

main();
