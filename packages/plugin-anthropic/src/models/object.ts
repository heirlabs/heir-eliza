import type { IAgentRuntime, ObjectGenerationParams, ModelTypeName } from '@elizaos/core';
import { logger, ModelType } from '@elizaos/core';
import { generateText, type JSONValue } from 'ai';
import { createAnthropicClient } from '../providers';
import { getSmallModel, getLargeModel } from '../utils/config';
import { emitModelUsageEvent } from '../utils/events';
import { extractAndParseJSON, ensureReflectionProperties } from '../utils/json';

/**
 * Helper function to generate objects using specified model type
 */
async function generateObjectByModelType(
  runtime: IAgentRuntime,
  params: ObjectGenerationParams,
  modelType: string,
  getModelFn: (runtime: IAgentRuntime) => string
): Promise<JSONValue> {
  const anthropic = createAnthropicClient(runtime);
  const modelName = getModelFn(runtime);
  logger.log(`[Anthropic] Using ${modelType} model: ${modelName}`);

  try {
    // Check if this is a reflection schema request (has specific format)
    const isReflection = !!(params.schema?.facts && params.schema.relationships);

    // Build a prompt that asks for JSON output
    let jsonPrompt = params.prompt;

    // Don't modify the prompt if it already contains explicit JSON formatting instructions
    if (!jsonPrompt.includes('```json') && !jsonPrompt.includes('respond with valid JSON')) {
      jsonPrompt +=
        '\nPlease respond with valid JSON only, without any explanations, markdown formatting, or additional text.';
    }

    let systemPrompt = runtime.character.system
      ? `${runtime.character.system}\nYou must respond with valid JSON only.`
      : 'You must respond with valid JSON only.';

    // For reflection schemas, we need a more specific instruction
    if (isReflection) {
      systemPrompt +=
        " Ensure your response includes 'thought', 'facts', and 'relationships' properties exactly as specified in the prompt.";
    } else {
      systemPrompt += ' No markdown, no code blocks, no explanation text.';
    }

    // Generate text response that should contain JSON
    const { text, usage } = await generateText({
      model: anthropic(modelName),
      prompt: jsonPrompt,
      system: systemPrompt,
      temperature: params.temperature || 0.2, // Lower temperature for more predictable structured output
    });

    if (usage) {
      emitModelUsageEvent(runtime, modelType as ModelTypeName, params.prompt, usage);
    }

    // Extract and parse JSON from the response
    try {
      logger.debug('Attempting to parse response from Anthropic model');
      const jsonObject = extractAndParseJSON(text);

      // Ensure reflection schema has all required properties
      const processedObject = ensureReflectionProperties(jsonObject, isReflection);

      return processedObject as JSONValue;
    } catch (parseError) {
      logger.error(`Failed to parse JSON from Anthropic response: ${parseError}`);
      logger.error(`Raw response: ${text}`);
      throw new Error('Invalid JSON returned from Anthropic model');
    }
  } catch (error) {
    logger.error(`Error generating object: ${error}`);
    throw error;
  }
}

/**
 * OBJECT_SMALL model handler
 */
export async function handleObjectSmall(
  runtime: IAgentRuntime,
  params: ObjectGenerationParams
): Promise<JSONValue> {
  return generateObjectByModelType(runtime, params, ModelType.OBJECT_SMALL, getSmallModel);
}

/**
 * OBJECT_LARGE model handler
 */
export async function handleObjectLarge(
  runtime: IAgentRuntime,
  params: ObjectGenerationParams
): Promise<JSONValue> {
  return generateObjectByModelType(runtime, params, ModelType.OBJECT_LARGE, getLargeModel);
}
