import type { GenerateTextParams, IAgentRuntime } from '@elizaos/core';
import { logger, ModelType } from '@elizaos/core';
import { generateText } from 'ai';
import { createAnthropicClientWithTopPSupport } from '../providers';
import { getSmallModel, getLargeModel, getExperimentalTelemetry, getCoTBudget } from '../utils/config';
import { emitModelUsageEvent } from '../utils/events';

/**
 * TEXT_SMALL model handler
 */
export async function handleTextSmall(
  runtime: IAgentRuntime,
  params: GenerateTextParams
): Promise<string> {
  const {
    prompt,
    stopSequences = [],
    maxTokens,
    temperature = 0.7,
    frequencyPenalty = 0.7,
    presencePenalty = 0.7,
    topP = 0.9,
    providerOptions,
  } = params;

  const anthropic = createAnthropicClientWithTopPSupport(runtime);
  const modelName = getSmallModel(runtime);
  const experimentalTelemetry = getExperimentalTelemetry(runtime);

  // Use provided maxTokens or default based on model
  const resolvedMaxTokens = maxTokens ?? (modelName.includes('-3-') ? 4096 : 8192);

  logger.log(`[Anthropic] Using TEXT_SMALL model: ${modelName}`);

  // Deep copy provider options to avoid mutation
  const resolvedProviderOptions = providerOptions
    ? JSON.parse(JSON.stringify(providerOptions))
    : {};
  const agentName = resolvedProviderOptions.agentName;

  // Add CoT budget if configured, merging with existing anthropic settings
  const cotBudget = getCoTBudget(runtime, 'small');
  if (cotBudget > 0) {
    resolvedProviderOptions.anthropic = {
      ...(resolvedProviderOptions.anthropic || {}),
      thinking: { type: 'enabled', budgetTokens: cotBudget },
    };
  }

  // Handle temperature/topP conflict - only one can be used
  const topPInParams = 'topP' in params;
  const temperatureInParams = 'temperature' in params;

  // Throw error if both are explicitly provided
  if (topPInParams && temperatureInParams) {
    const errorMsg = 'Cannot use both temperature and topP parameters simultaneously. ' +
      'Please provide only one of these parameters.';
    logger.warn(`[Anthropic] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  let finalTemperature: number | undefined;
  let finalTopP: number | undefined;

  if (topPInParams) {
    // topP explicitly provided - use it
    finalTopP = topP;
    finalTemperature = undefined;
  } else {
    // Use temperature (either provided or default)
    finalTemperature = temperature;
    finalTopP = undefined;
  }

  const generateParams: Parameters<typeof generateText>[0] = {
    model: anthropic(modelName),
    prompt,
    system: runtime.character.system ?? undefined,
    temperature: finalTemperature,
    stopSequences,
    frequencyPenalty,
    presencePenalty,
    experimental_telemetry: {
      isEnabled: experimentalTelemetry,
      functionId: agentName ? `agent:${agentName}` : undefined,
      metadata: agentName ? { agentName } : undefined,
    },
  };

  // Use type assertion for properties that don't match AI SDK types
  if (finalTopP !== undefined) {
    (generateParams as any).topP = finalTopP;
  }
  (generateParams as any).maxTokens = resolvedMaxTokens;
  (generateParams as any).providerOptions = resolvedProviderOptions;

  const { text, usage } = await generateText(generateParams);

  if (usage) {
    emitModelUsageEvent(runtime, ModelType.TEXT_SMALL, prompt, usage);
  }

  return text;
}

/**
 * TEXT_LARGE model handler
 */
export async function handleTextLarge(
  runtime: IAgentRuntime,
  params: GenerateTextParams
): Promise<string> {
  const {
    prompt,
    maxTokens = 8192,
    stopSequences = [],
    temperature = 0.7,
    frequencyPenalty = 0.7,
    presencePenalty = 0.7,
    topP = 0.9,
    providerOptions,
  } = params;

  const anthropic = createAnthropicClientWithTopPSupport(runtime);
  const modelName = getLargeModel(runtime);
  const experimentalTelemetry = getExperimentalTelemetry(runtime);

  logger.log(`[Anthropic] Using TEXT_LARGE model: ${modelName}`);

  // Deep copy provider options to avoid mutation
  const resolvedProviderOptions = providerOptions
    ? JSON.parse(JSON.stringify(providerOptions))
    : {};
  const agentName = resolvedProviderOptions.agentName;

  // Add CoT budget if configured, merging with existing anthropic settings
  const cotBudget = getCoTBudget(runtime, 'large');
  if (cotBudget > 0) {
    resolvedProviderOptions.anthropic = {
      ...(resolvedProviderOptions.anthropic || {}),
      thinking: { type: 'enabled', budgetTokens: cotBudget },
    };
  }

  // Handle temperature/topP conflict - only one can be used
  const topPInParams = 'topP' in params;
  const temperatureInParams = 'temperature' in params;

  // Throw error if both are explicitly provided
  if (topPInParams && temperatureInParams) {
    const errorMsg = 'Cannot use both temperature and topP parameters simultaneously. ' +
      'Please provide only one of these parameters.';
    logger.warn(`[Anthropic] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  let finalTemperature: number | undefined;
  let finalTopP: number | undefined;

  if (topPInParams) {
    // topP explicitly provided - use it
    finalTopP = topP;
    finalTemperature = undefined;
  } else {
    // Use temperature (either provided or default)
    finalTemperature = temperature;
    finalTopP = undefined;
  }

  const generateParams: Parameters<typeof generateText>[0] = {
    model: anthropic(modelName),
    prompt,
    system: runtime.character.system ?? undefined,
    temperature: finalTemperature,
    stopSequences,
    frequencyPenalty,
    presencePenalty,
    experimental_telemetry: {
      isEnabled: experimentalTelemetry,
      functionId: agentName ? `agent:${agentName}` : undefined,
      metadata: agentName ? { agentName } : undefined,
    },
  };

  // Use type assertion for properties that don't match AI SDK types
  if (finalTopP !== undefined) {
    (generateParams as any).topP = finalTopP;
  }
  (generateParams as any).maxTokens = maxTokens;
  (generateParams as any).providerOptions = resolvedProviderOptions;

  const { text, usage } = await generateText(generateParams);

  if (usage) {
    emitModelUsageEvent(runtime, ModelType.TEXT_LARGE, prompt, usage);
  }

  return text;
}
