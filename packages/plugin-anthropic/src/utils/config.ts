import type { IAgentRuntime } from '@elizaos/core';
import { logger } from '@elizaos/core';

/**
 * Retrieves a configuration setting from the runtime, falling back to environment variables or a default value if not found.
 *
 * @param key - The name of the setting to retrieve.
 * @param defaultValue - The value to return if the setting is not found in the runtime or environment.
 * @returns The resolved setting value, or {@link defaultValue} if not found.
 */
export function getSetting(
  runtime: IAgentRuntime,
  key: string,
  defaultValue?: string
): string | undefined {
  return runtime.getSetting(key) ?? process.env[key] ?? defaultValue;
}

/**
 * Check if we're running in a browser environment
 */
export function isBrowser(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).document !== 'undefined';
}

/**
 * Retrieves the Anthropic API base URL from runtime settings, environment variables, or defaults.
 *
 * @returns The resolved base URL for Anthropic API requests.
 */
export function getBaseURL(runtime: IAgentRuntime): string {
  const browserURL = getSetting(runtime, 'ANTHROPIC_BROWSER_BASE_URL');
  const baseURL = (
    isBrowser() && browserURL
      ? browserURL
      : getSetting(runtime, 'ANTHROPIC_BASE_URL', 'https://api.anthropic.com/v1')
  ) as string;
  logger.debug(`[Anthropic] Base URL: ${baseURL}`);
  return baseURL;
}

/**
 * Helper function to get the API key for Anthropic
 *
 * @param runtime The runtime context
 * @returns The configured API key
 */
export function getApiKey(runtime: IAgentRuntime): string | undefined {
  return getSetting(runtime, 'ANTHROPIC_API_KEY');
}

/**
 * Helper function to get the small model name with fallbacks
 *
 * @param runtime The runtime context
 * @returns The configured small model name
 */
export function getSmallModel(runtime: IAgentRuntime): string {
  return getSetting(runtime, 'ANTHROPIC_SMALL_MODEL', 'claude-3-5-haiku-20241022') as string;
}

/**
 * Helper function to get the large model name with fallbacks
 *
 * @param runtime The runtime context
 * @returns The configured large model name
 */
export function getLargeModel(runtime: IAgentRuntime): string {
  return getSetting(runtime, 'ANTHROPIC_LARGE_MODEL', 'claude-sonnet-4-20250514') as string;
}

/**
 * Helper function to get experimental telemetry setting
 *
 * @param runtime The runtime context
 * @returns Whether experimental telemetry is enabled
 */
export function getExperimentalTelemetry(runtime: IAgentRuntime): boolean {
  const setting = getSetting(runtime, 'ANTHROPIC_EXPERIMENTAL_TELEMETRY', 'false');
  const normalizedSetting = String(setting).toLowerCase();
  const result = normalizedSetting === 'true';
  logger.debug(
    `[Anthropic] Experimental telemetry: "${setting}" (normalized: "${normalizedSetting}", result: ${result})`
  );
  return result;
}

/**
 * Gets the Chain-of-Thought budget for a specific model size.
 * Implements fallback hierarchy: model-specific → shared → 0 (disabled)
 *
 * @param runtime - The agent runtime environment to check for settings.
 * @param modelSize - The model size ('small' or 'large')
 * @returns The CoT budget in tokens, or 0 if disabled
 */
export function getCoTBudget(runtime: IAgentRuntime, modelSize: 'small' | 'large'): number {
  const specificKey = modelSize === 'small' ? 'ANTHROPIC_COT_BUDGET_SMALL' : 'ANTHROPIC_COT_BUDGET_LARGE';
  const specificValue = getSetting(runtime, specificKey);
  const sharedValue = getSetting(runtime, 'ANTHROPIC_COT_BUDGET');

  // Try model-specific setting first
  if (specificValue !== undefined && specificValue !== null && specificValue !== '') {
    const parsed = parseInt(specificValue);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }

  // Fall back to shared setting
  if (sharedValue !== undefined && sharedValue !== null && sharedValue !== '') {
    const parsed = parseInt(sharedValue);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }

  // Default to 0 (disabled)
  return 0;
}
