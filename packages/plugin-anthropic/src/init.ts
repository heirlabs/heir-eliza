import { logger, type IAgentRuntime } from '@elizaos/core';
import { getApiKey, isBrowser } from './utils/config';

/**
 * Initialize and validate Anthropic configuration
 */
export function initializeAnthropic(_config: any, runtime: IAgentRuntime) {
  // do check in the background
  new Promise<void>(async (resolve) => {
    resolve();
    try {
      const apiKey = getApiKey(runtime);
      // If API key is not set, we'll show a warning but continue
      if (!apiKey && !isBrowser()) {
        logger.warn(
          'ANTHROPIC_API_KEY is not set in environment - Anthropic functionality will be limited'
        );
        return;
      }
      // Note: Anthropic doesn't have a simple /models endpoint like OpenAI,
      // so we just validate that the key is present
      if (apiKey) {
        logger.log('Anthropic API key configured successfully');
      }
    } catch (error: unknown) {
      const message =
        (error as { errors?: Array<{ message: string }> })?.errors
          ?.map((e) => e.message)
          .join(', ') || (error instanceof Error ? error.message : String(error));
      logger.warn(
        `Anthropic plugin configuration issue: ${message} - You need to configure the ANTHROPIC_API_KEY in your environment variables`
      );
    }
  });
}
