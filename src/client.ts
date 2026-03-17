/**
 * Azure DevOps API Client
 */

import * as azdev from 'azure-devops-node-api';
import { getConfig } from './config.js';

let clientInstance: azdev.WebApi | null = null;

/**
 * Get or create Azure DevOps client
 */
export function getClient(): azdev.WebApi {
  if (!clientInstance) {
    const config = getConfig();
    const authHandler = azdev.getPersonalAccessTokenHandler(config.pat);
    clientInstance = new azdev.WebApi(config.orgUrl, authHandler);
  }
  return clientInstance;
}

/**
 * Reset client (for config changes)
 */
export function resetClient(): void {
  clientInstance = null;
}

/**
 * Get Git API
 */
export async function getGitApi() {
  const client = getClient();
  return await client.getGitApi();
}

/**
 * Get Work Item Tracking API
 */
export async function getWorkItemApi() {
  const client = getClient();
  return await client.getWorkItemTrackingApi();
}

/**
 * Get Build API
 */
export async function getBuildApi() {
  const client = getClient();
  return await client.getBuildApi();
}

/**
 * Get Core API
 */
export async function getCoreApi() {
  const client = getClient();
  return await client.getCoreApi();
}

/**
 * Get Work API (boards, iterations, team settings)
 */
export async function getWorkApi() {
  const client = getClient();
  return await client.getWorkApi();
}

/**
 * Get Policy API (branch policies)
 */
export async function getPolicyApi() {
  const client = getClient();
  return await client.getPolicyApi();
}

/**
 * Get Release API
 */
export async function getReleaseApi() {
  const client = getClient();
  return await client.getReleaseApi();
}

/**
 * Get Wiki API
 */
export async function getWikiApi() {
  const client = getClient();
  return await client.getWikiApi();
}
