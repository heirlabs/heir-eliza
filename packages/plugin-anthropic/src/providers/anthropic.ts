import { createAnthropic } from '@ai-sdk/anthropic';
import type { IAgentRuntime } from '@elizaos/core';
import { getApiKey, getBaseURL, isBrowser } from '../utils/config';

/**
 * Create an Anthropic client with proper configuration
 *
 * @param runtime The runtime context
 * @returns Configured Anthropic client
 */
export function createAnthropicClient(runtime: IAgentRuntime) {
  return createAnthropic({
    apiKey: isBrowser() ? undefined : getApiKey(runtime),
    baseURL: getBaseURL(runtime),
  });
}

/**
 * Create an Anthropic client with topP support.
 * Handles the conflict where temperature and top_p cannot both be specified.
 * When temperature is 0 and topP is present, temperature is removed from the request.
 *
 * @param runtime The runtime context
 * @returns Configured Anthropic client with topP support
 */
export function createAnthropicClientWithTopPSupport(runtime: IAgentRuntime) {
  return createAnthropic({
    apiKey: isBrowser() ? undefined : getApiKey(runtime),
    baseURL: getBaseURL(runtime),
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body);
        // strip out temperature when it's 0 and we have topP
        // this allows us to actually use topP
        const hasTopP = Object.prototype.hasOwnProperty.call(body, 'top_p') && body.top_p != null;
        if (hasTopP && Object.prototype.hasOwnProperty.call(body, 'temperature') && body.temperature === 0) {
          delete body.temperature;
          init.body = JSON.stringify(body);
        }
      }
      return fetch(input, init);
    },
  });
}
