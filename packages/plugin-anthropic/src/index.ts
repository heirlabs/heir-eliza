import type {
  GenerateTextParams,
  IAgentRuntime,
  ObjectGenerationParams,
  Plugin,
} from '@elizaos/core';
import { ModelType } from '@elizaos/core';
import { initializeAnthropic } from './init';
import { handleTextSmall, handleTextLarge, handleObjectSmall, handleObjectLarge } from './models';
import { getApiKey, getBaseURL } from './utils/config';
import { logger } from '@elizaos/core';

export * from './types';

/**
 * Plugin for Anthropic.
 *
 * @type {Plugin}
 * @property {string} name - The name of the plugin.
 * @property {string} description - The description of the plugin.
 * @property {Object} config - The configuration object with API keys and model variables.
 * @property {Function} init - Initializes the plugin with the given configuration.
 * @property {Function} models - Contains functions for generating text using small and large models.
 * @property {Function[]} tests - An array of test functions for the plugin.
 */
export const anthropicPlugin: Plugin = {
  name: 'anthropic',
  description: 'Anthropic plugin (supports text generation only)',
  config: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_SMALL_MODEL: process.env.ANTHROPIC_SMALL_MODEL,
    ANTHROPIC_LARGE_MODEL: process.env.ANTHROPIC_LARGE_MODEL,
    ANTHROPIC_EXPERIMENTAL_TELEMETRY: process.env.ANTHROPIC_EXPERIMENTAL_TELEMETRY,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    ANTHROPIC_BROWSER_BASE_URL: process.env.ANTHROPIC_BROWSER_BASE_URL,
    ANTHROPIC_COT_BUDGET: process.env.ANTHROPIC_COT_BUDGET,
    ANTHROPIC_COT_BUDGET_SMALL: process.env.ANTHROPIC_COT_BUDGET_SMALL,
    ANTHROPIC_COT_BUDGET_LARGE: process.env.ANTHROPIC_COT_BUDGET_LARGE,
  },
  async init(_config, runtime) {
    // Note: We intentionally don't await here because ElizaOS expects
    // the init method to return quickly. The initializeAnthropic function
    // performs background validation and logging.
    initializeAnthropic(_config, runtime);
  },

  models: {
    [ModelType.TEXT_SMALL]: async (runtime: IAgentRuntime, params: GenerateTextParams) => {
      return handleTextSmall(runtime, params);
    },
    [ModelType.TEXT_LARGE]: async (runtime: IAgentRuntime, params: GenerateTextParams) => {
      return handleTextLarge(runtime, params);
    },
    [ModelType.OBJECT_SMALL]: async (runtime: IAgentRuntime, params: ObjectGenerationParams) => {
      return handleObjectSmall(runtime, params);
    },
    [ModelType.OBJECT_LARGE]: async (runtime: IAgentRuntime, params: ObjectGenerationParams) => {
      return handleObjectLarge(runtime, params);
    },
  },
  tests: [
    {
      name: 'anthropic_plugin_tests',
      tests: [
        {
          name: 'anthropic_test_api_key_validation',
          fn: async (runtime: IAgentRuntime) => {
            const apiKey = getApiKey(runtime);
            if (!apiKey) {
              throw new Error('ANTHROPIC_API_KEY is not configured');
            }
            logger.log('Anthropic API key is configured');
          },
        },
        {
          name: 'anthropic_test_text_small',
          fn: async (runtime: IAgentRuntime) => {
            try {
              const text = await runtime.useModel(ModelType.TEXT_SMALL, {
                prompt: 'What is the nature of reality in 10 words?',
              });
              if (text.length === 0) {
                throw new Error('Failed to generate text');
              }
              logger.log({ text }, 'generated with test_text_small');
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              logger.error(`Error in test_text_small: ${message}`);
              throw error;
            }
          },
        },
        {
          name: 'anthropic_test_text_large',
          fn: async (runtime: IAgentRuntime) => {
            try {
              const text = await runtime.useModel(ModelType.TEXT_LARGE, {
                prompt: 'What is the nature of reality in 10 words?',
              });
              if (text.length === 0) {
                throw new Error('Failed to generate text');
              }
              logger.log({ text }, 'generated with test_text_large');
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              logger.error(`Error in test_text_large: ${message}`);
              throw error;
            }
          },
        },
        {
          name: 'anthropic_test_object_small',
          fn: async (runtime: IAgentRuntime) => {
            try {
              const result = await runtime.useModel(ModelType.OBJECT_SMALL, {
                prompt: 'Create a simple JSON object with a message field saying hello',
                schema: { type: 'object' },
              });
              logger.log({ result }, 'Generated object with test_object_small');
              if (!result || (typeof result === 'object' && 'error' in result)) {
                throw new Error('Failed to generate object');
              }
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              logger.error(`Error in test_object_small: ${message}`);
              throw error;
            }
          },
        },
        {
          name: 'anthropic_test_object_large',
          fn: async (runtime: IAgentRuntime) => {
            try {
              const result = await runtime.useModel(ModelType.OBJECT_LARGE, {
                prompt: 'Create a simple JSON object with a message field saying hello',
                schema: { type: 'object' },
              });
              logger.log({ result }, 'Generated object with test_object_large');
              if (!result || (typeof result === 'object' && 'error' in result)) {
                throw new Error('Failed to generate object');
              }
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              logger.error(`Error in test_object_large: ${message}`);
              throw error;
            }
          },
        },
        {
          name: 'anthropic_test_object_with_code_blocks',
          fn: async (runtime: IAgentRuntime) => {
            try {
              const result = await runtime.useModel(ModelType.OBJECT_SMALL, {
                prompt: 'Give me instructions to install Node.js',
                schema: { type: 'object' },
              });
              logger.log({ result }, 'Generated object with code blocks');
              if (!result || (typeof result === 'object' && 'error' in result)) {
                throw new Error('Failed to generate object with code blocks');
              }
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              logger.error(`Error in test_object_with_code_blocks: ${message}`);
              throw error;
            }
          },
        },
      ],
    },
  ],
};

export default anthropicPlugin;
