/**
 * Configuration management
 */

import { Config, ConfigSchema } from './types.js';

let globalConfig: Config | null = null;

/**
 * Set global configuration
 */
export function setConfig(config: Config): void {
  const validated = ConfigSchema.parse(config);
  globalConfig = validated;
}

/**
 * Get global configuration
 * Throws if not configured
 */
export function getConfig(): Config {
  if (!globalConfig) {
    // Try to load from environment
    const envConfig = loadFromEnv();
    if (envConfig) {
      setConfig(envConfig);
      return globalConfig!;
    }
    throw new Error(
      'Azure DevOps not configured. Call setup_workspace first or set environment variables (AZDO_ORG_URL, AZDO_PAT)'
    );
  }
  return globalConfig;
}

/**
 * Check if configured
 */
export function isConfigured(): boolean {
  return globalConfig !== null || canLoadFromEnv();
}

/**
 * Load config from environment variables
 */
function loadFromEnv(): Config | null {
  const orgUrl = process.env.AZDO_ORG_URL;
  const pat = process.env.AZDO_PAT;

  if (!orgUrl || !pat) {
    return null;
  }

  return {
    orgUrl,
    pat,
    project: process.env.AZDO_PROJECT,
    repo: process.env.AZDO_REPO,
  };
}

/**
 * Check if can load from env
 */
function canLoadFromEnv(): boolean {
  return !!(process.env.AZDO_ORG_URL && process.env.AZDO_PAT);
}

/**
 * Get project (from config or parameter)
 */
export function getProject(override?: string): string {
  const project = override || globalConfig?.project || process.env.AZDO_PROJECT;
  if (!project) {
    throw new Error('Project not specified. Provide project parameter or set AZDO_PROJECT');
  }
  return project;
}

/**
 * Get repository (from config or parameter)
 */
export function getRepo(override?: string): string {
  const repo = override || globalConfig?.repo || process.env.AZDO_REPO;
  if (!repo) {
    throw new Error('Repository not specified. Provide repository parameter or set AZDO_REPO');
  }
  return repo;
}
