import { createOpenAI } from "@ai-sdk/openai";
import type {
  ObjectGenerationParams,
  Plugin,
  TextEmbeddingParams,
  IAgentRuntime,
} from "@elizaos/core";
import { type GenerateTextParams, ModelType, logger } from "@elizaos/core";
import {
  generateText,
  generateObject,
  JSONParseError,
  type JSONValue,
} from "ai";

/**
 * Retrieves a configuration setting from the runtime, environment variables, or a default value.
 *
 * Checks the runtime for the specified {@link key}, then environment variables, and finally returns {@link defaultValue} if neither is set.
 *
 * @param runtime - The runtime context providing configuration access.
 * @param key - The name of the setting to retrieve.
 * @param defaultValue - The value to return if the setting is not found.
 * @returns The setting value, or {@link defaultValue} if not found.
 */
function getSetting(
  runtime: IAgentRuntime,
  key: string,
  defaultValue?: string
): string | undefined {
  return runtime.getSetting(key) ?? process.env[key] ?? defaultValue;
}

/**
 * Returns the Venice API base URL from runtime settings, environment variables, or a default value.
 *
 * @param runtime - The runtime context containing configuration settings.
 * @returns The resolved Venice API base URL.
 */
function getBaseURL(runtime: IAgentRuntime): string {
  const baseURL = getSetting(
    runtime,
    "VENICE_BASE_URL",
    "https://api.venice.ai/api/v1"
  ) as string;
  logger.debug(`[Venice] Using base URL: ${baseURL}`);
  return baseURL;
}

/**
 * Retrieves the Venice API key from runtime settings or environment variables.
 *
 * @returns The Venice API key if available; otherwise, undefined.
 */
function getVeniceApiKey(runtime: IAgentRuntime): string | undefined {
  return getSetting(runtime, "VENICE_API_KEY");
}

function getSmallModel(runtime: IAgentRuntime): string {
  return getSetting(runtime, "VENICE_SMALL_MODEL") ?? "llama-3.3-70b";
}

function getLargeModel(runtime: IAgentRuntime): string {
  return getSetting(runtime, "VENICE_LARGE_MODEL") ?? "llama-3.1-405b";
}

function getEmbeddingModel(runtime: IAgentRuntime): string {
  return (
    getSetting(runtime, "VENICE_EMBEDDING_MODEL") ?? "text-embedding-bge-m3"
  );
}

function getEmbeddingDimensions(runtime: IAgentRuntime): number {
  return parseInt(
    getSetting(runtime, "VENICE_EMBEDDING_DIMENSIONS") ?? "1024",
    10
  );
}

/**
 * Creates an OpenAI-compatible client configured for the Venice API using the provided runtime context.
 *
 * @returns An OpenAI client instance set up with the Venice API key and base URL.
 */
function createVeniceClient(runtime: IAgentRuntime) {
  return createOpenAI({
    apiKey: getVeniceApiKey(runtime),
    baseURL: getBaseURL(runtime),
  });
}

/**
 * Returns a function to repair JSON text
 */
function getJsonRepairFunction(): (params: {
  text: string;
  error: unknown;
}) => Promise<string | null> {
  return async ({ text, error }: { text: string; error: unknown }) => {
    try {
      if (error instanceof JSONParseError) {
        const cleanedText = text.replace(/```json\n|\n```|```/g, "");
        JSON.parse(cleanedText);
        return cleanedText;
      }
      return null;
    } catch (jsonError: unknown) {
      const message =
        jsonError instanceof Error ? jsonError.message : String(jsonError);
      logger.warn(`Failed to repair JSON text: ${message}`);
      return null;
    }
  };
}

/**
 * Helper function to generate objects using specified model type
 */
async function generateObjectByModelType(
  runtime: IAgentRuntime,
  params: ObjectGenerationParams,
  modelType: string,
  getModelFn: (runtime: IAgentRuntime) => string
): Promise<JSONValue> {
  const venice = createVeniceClient(runtime);
  const modelName = getModelFn(runtime);
  logger.log(`[Venice] Using ${modelType} model: ${modelName}`);
  const temperature = params.temperature ?? 0;
  const schemaPresent = !!params.schema;

  if (schemaPresent) {
    logger.info(
      `Using ${modelType} without schema validation (schema provided but output=no-schema)`
    );
  }

  try {
    const { object } = await generateObject({
      model: venice.languageModel(modelName),
      output: "no-schema",
      prompt: params.prompt,
      temperature: temperature,
      experimental_repairText: getJsonRepairFunction(),
    });

    return object;
  } catch (error: unknown) {
    if (error instanceof JSONParseError) {
      logger.error(`[generateObject] Failed to parse JSON: ${error.message}`);

      const repairFunction = getJsonRepairFunction();
      const repairedJsonString = await repairFunction({
        text: error.text,
        error,
      });

      if (repairedJsonString) {
        try {
          const repairedObject = JSON.parse(repairedJsonString);
          logger.info("[generateObject] Successfully repaired JSON.");
          return repairedObject;
        } catch (repairParseError: unknown) {
          const message =
            repairParseError instanceof Error
              ? repairParseError.message
              : String(repairParseError);
          logger.error(
            `[generateObject] Failed to parse repaired JSON: ${message}`
          );
          throw repairParseError;
        }
      } else {
        logger.error("[generateObject] JSON repair failed.");
        throw error;
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[generateObject] Unknown error: ${message}`);
      throw error;
    }
  }
}

/**
 * Helper function for text-to-speech using Venice API
 */
async function fetchTextToSpeech(runtime: IAgentRuntime, text: string) {
  const apiKey = getVeniceApiKey(runtime);
  const model = getSetting(runtime, "VENICE_TTS_MODEL", "tts-kokoro");
  const voice = getSetting(runtime, "VENICE_TTS_VOICE", "af_sky");
  const speed = parseFloat(getSetting(runtime, "VENICE_TTS_SPEED", "1") ?? "1");
  const responseFormat = getSetting(runtime, "VENICE_TTS_FORMAT", "mp3");
  const streaming =
    getSetting(runtime, "VENICE_TTS_STREAMING", "false") === "true";
  const baseURL = getBaseURL(runtime);

  try {
    const res = await fetch(`${baseURL}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model,
        voice,
        speed,
        response_format: responseFormat,
        streaming,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Venice TTS error ${res.status}: ${err}`);
    }

    return res.body;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch speech from Venice TTS: ${message}`);
  }
}

export const venicePlugin: Plugin = {
  name: "venice",
  description:
    "Venice AI plugin (Handles Text Generation, Image Generation, Embeddings, Text-to-Speech, and Object Generation)",
  config: {
    VENICE_API_KEY: process.env.VENICE_API_KEY,
    VENICE_SMALL_MODEL: process.env.VENICE_SMALL_MODEL,
    VENICE_LARGE_MODEL: process.env.VENICE_LARGE_MODEL,
    VENICE_IMAGE_MODEL: process.env.VENICE_IMAGE_MODEL,
    VENICE_EMBEDDING_MODEL: process.env.VENICE_EMBEDDING_MODEL,
    VENICE_EMBEDDING_DIMENSIONS: process.env.VENICE_EMBEDDING_DIMENSIONS,
    VENICE_TTS_MODEL: process.env.VENICE_TTS_MODEL,
    VENICE_TTS_VOICE: process.env.VENICE_TTS_VOICE,
    VENICE_TTS_SPEED: process.env.VENICE_TTS_SPEED,
    VENICE_TTS_FORMAT: process.env.VENICE_TTS_FORMAT,
    VENICE_TTS_STREAMING: process.env.VENICE_TTS_STREAMING,
  },
  async init(_config, runtime) {
    logger.info(`[plugin-venice] Initializing...`);
    if (!getVeniceApiKey(runtime)) {
      logger.warn(
        "[plugin-venice] VENICE_API_KEY is not set - Venice functionality will fail"
      );
    }
  },
  models: {
    [ModelType.TEXT_LARGE]: async (
      runtime,
      {
        prompt,
        stopSequences = [],
        maxTokens = 8192,
        temperature = 0.7,
        frequencyPenalty = 0.7,
        presencePenalty = 0.7,
      }: GenerateTextParams
    ) => {
      const venice = createVeniceClient(runtime);
      const model = getLargeModel(runtime);
      logger.log(`[Venice] Using TEXT_LARGE model: ${model}`);

      const { text: veniceResponse } = await generateText({
        model: venice.languageModel(model),
        prompt: prompt,
        system: runtime.character.system ?? undefined,
        temperature: temperature,
        maxTokens: maxTokens,
        frequencyPenalty: frequencyPenalty,
        presencePenalty: presencePenalty,
        stopSequences: stopSequences,
        // @ts-expect-error Venice.ai parameters are unique to Venice
        venice_parameters: {
          include_venice_system_prompt: false, // Use our own system prompt
          top_p: 0.9, // Venice's default top_p value
        },
      });

      return veniceResponse;
    },
    [ModelType.TEXT_SMALL]: async (
      runtime,
      {
        prompt,
        stopSequences = [],
        maxTokens = 8192,
        temperature = 0.7,
        frequencyPenalty = 0.7,
        presencePenalty = 0.7,
      }: GenerateTextParams
    ) => {
      const venice = createVeniceClient(runtime);
      const model = getSmallModel(runtime);
      logger.log(`[Venice] Using TEXT_SMALL model: ${model}`);

      const { text: veniceResponse } = await generateText({
        model: venice.languageModel(model),
        prompt: prompt,
        system: runtime.character.system ?? undefined,
        temperature: temperature,
        maxTokens: maxTokens,
        frequencyPenalty: frequencyPenalty,
        presencePenalty: presencePenalty,
        stopSequences: stopSequences,
        // @ts-expect-error Venice.ai parameters are unique to Venice
        venice_parameters: {
          include_venice_system_prompt: false, // Use our own system prompt
        },
      });

      return veniceResponse;
    },
    [ModelType.OBJECT_LARGE]: async (
      runtime,
      params: ObjectGenerationParams
    ) => {
      return generateObjectByModelType(
        runtime,
        params,
        ModelType.OBJECT_LARGE,
        getLargeModel
      );
    },
    [ModelType.OBJECT_SMALL]: async (
      runtime,
      params: ObjectGenerationParams
    ) => {
      return generateObjectByModelType(
        runtime,
        params,
        ModelType.OBJECT_SMALL,
        getSmallModel
      );
    },
    [ModelType.IMAGE]: async (
      runtime: IAgentRuntime,
      params: {
        prompt: string;
        n?: number;
        size?: string;
        // Venice-specific optional parameters
        negative_prompt?: string;
        style_preset?: string;
        steps?: number;
        cfg_scale?: number;
        seed?: number;
        lora_strength?: number;
        safe_mode?: boolean;
        return_binary?: boolean;
        hide_watermark?: boolean;
      }
    ) => {
      const n = params.n || 1;
      const size = params.size || "1024x1024";
      const prompt = params.prompt;

      // Parse size string to get dimensions
      const [width, height] = size.split("x").map((dim) => parseInt(dim, 10));

      // Venice default model for image generation
      const modelName =
        getSetting(runtime, "VENICE_IMAGE_MODEL", "fluently-xl") ??
        "fluently-xl";
      logger.log(`[Venice] Using IMAGE model: ${modelName}`);

      const baseURL = getBaseURL(runtime);
      const apiKey = getVeniceApiKey(runtime);

      if (!apiKey) {
        throw new Error("Venice API key not configured");
      }

      // Build Venice-specific request body
      const requestBody: Record<string, any> = {
        model: modelName,
        prompt: prompt,
        height: height,
        width: width,
        // Venice defaults
        steps: params.steps ?? 30,
        cfg_scale: params.cfg_scale ?? 7.5,
        safe_mode: params.safe_mode ?? false,
        return_binary: params.return_binary ?? false,
        hide_watermark: params.hide_watermark ?? false,
      };

      // Add optional Venice-specific parameters if provided
      if (params.negative_prompt) {
        requestBody.negative_prompt = params.negative_prompt;
      }
      if (params.style_preset) {
        requestBody.style_preset = params.style_preset;
      }
      if (params.seed !== undefined) {
        requestBody.seed = params.seed;
      }
      if (params.lora_strength !== undefined) {
        requestBody.lora_strength = params.lora_strength;
      }

      try {
        const response = await fetch(`${baseURL}/image/generate`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(
            `Venice API error: ${response.status} - ${response.statusText} - ${errorText}`
          );
          throw new Error(`Failed to generate image: ${response.statusText}`);
        }

        const data = (await response.json()) as any;

        // Venice returns the image data in a different format than OpenAI
        // We need to normalize it to match OpenAI's format for compatibility
        if (data.images && Array.isArray(data.images)) {
          // Map Venice response to OpenAI-like format
          return data.images.map((image: any) => ({
            url: image.url || image.image_url || image,
          }));
        } else if (data.image_url) {
          // Single image response
          return [{ url: data.image_url }];
        } else if (data.url) {
          // Direct URL response
          return [{ url: data.url }];
        } else if (typeof data === "string") {
          // Direct URL string response
          return [{ url: data }];
        } else {
          logger.error("Unexpected Venice image response format:", data);
          throw new Error("Unexpected response format from Venice API");
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error generating image with Venice: ${message}`);
        throw error;
      }
    },
    [ModelType.TEXT_EMBEDDING]: async (
      runtime,
      params: TextEmbeddingParams
    ): Promise<number[]> => {
      logger.debug("[plugin-venice] TEXT_EMBEDDING handler entered.");
      const veniceApiKey = getVeniceApiKey(runtime);
      const model = getEmbeddingModel(runtime);
      logger.log(`[Venice] Using TEXT_EMBEDDING model: ${model}`);
      const dimensions = getEmbeddingDimensions(runtime);

      if (!params?.text || params.text.trim() === "") {
        logger.debug(
          "[plugin-venice] Creating test embedding for initialization/empty text"
        );
        const testVector = new Array(dimensions).fill(0);
        testVector[0] = 0.1;
        return testVector;
      }

      if (!veniceApiKey) {
        logger.error(
          "[plugin-venice] VENICE_API_KEY is missing. Cannot generate embedding."
        );
        const errorVector = new Array(dimensions).fill(0);
        errorVector[0] = 0.3;
        return errorVector;
      }

      logger.debug("[plugin-venice] Attempting Venice embeddings API call...");
      try {
        const payload: {
          model: string;
          input: string;
          dimensions?: number;
          encoding_format?: string;
        } = {
          model: model,
          input: params.text,
          encoding_format: "float",
        };

        // Only include dimensions if explicitly set
        const explicitDimensions = getSetting(
          runtime,
          "VENICE_EMBEDDING_DIMENSIONS"
        );
        if (explicitDimensions !== undefined) {
          payload.dimensions = dimensions;
        }

        logger.debug(
          `[plugin-venice] Calling ${getBaseURL(
            runtime
          )}/embeddings with model ${model}`
        );

        const response = await fetch(`${getBaseURL(runtime)}/embeddings`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${veniceApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        logger.debug(
          `[plugin-venice] Received response status: ${response.status}`
        );
        if (!response.ok) {
          let errorBody = "Could not parse error body";
          try {
            errorBody = await response.text();
          } catch (e) {
            /* ignore */
          }
          logger.error(
            `[plugin-venice] Venice API error: ${response.status} - ${response.statusText} - ${errorBody}`
          );
          throw new Error(
            `Venice API error: ${response.status} - ${response.statusText}`
          );
        }

        const data = (await response.json()) as {
          data: Array<{ embedding: number[]; index: number; object: string }>;
          usage: { prompt_tokens: number; total_tokens: number };
          model: string;
          object: string;
        };
        logger.debug(
          "[plugin-venice] Successfully parsed Venice embeddings response."
        );

        if (!data?.data?.[0]?.embedding) {
          logger.error(
            `[plugin-venice] No embedding returned from Venice API: ${JSON.stringify(data)}`
          );
          throw new Error("No embedding returned from Venice API");
        }

        const embedding = data.data[0].embedding;
        const embeddingDimensions = embedding.length;

        logger.debug(
          `[plugin-venice] Returning embedding with dimensions ${embeddingDimensions}.`
        );
        return embedding;
      } catch (error) {
        logger.error(
          `[plugin-venice] Error during Venice embedding generation process: ${error instanceof Error ? error.message : String(error)}`
        );
        const errorVector = new Array(dimensions).fill(0);
        errorVector[0] = 0.2;
        return errorVector;
      }
    },
    [ModelType.TEXT_TO_SPEECH]: async (
      runtime: IAgentRuntime,
      text: string
    ) => {
      const ttsModelName = getSetting(
        runtime,
        "VENICE_TTS_MODEL",
        "tts-kokoro"
      );
      logger.log(`[Venice] Using TEXT_TO_SPEECH model: ${ttsModelName}`);
      try {
        const speechStream = await fetchTextToSpeech(runtime, text);
        return speechStream;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[Venice] TTS error: ${message}`);
        throw error;
      }
    },
  },
};

export default venicePlugin;
