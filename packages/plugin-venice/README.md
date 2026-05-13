# @elizaos-plugins/plugin-venice

Venice AI plugin for ElizaOS. This plugin provides comprehensive integration with the Venice AI API for text generation, image generation, embeddings, text-to-speech, and object generation capabilities.

## Configuration

The plugin requires the following environment variables to be set:

### Venice AI Configuration
- `VENICE_API_KEY`: Your Venice AI API key (required)
- `VENICE_SMALL_MODEL`: The model to use for small text generation (defaults to 'llama-3.3-70b')
- `VENICE_LARGE_MODEL`: The model to use for large text generation (defaults to 'llama-3.1-405b')
- `VENICE_IMAGE_MODEL`: The model to use for image generation (defaults to 'fluently-xl')
- `VENICE_EMBEDDING_MODEL`: The model to use for embeddings (defaults to 'text-embedding-bge-m3')
- `VENICE_EMBEDDING_DIMENSIONS`: The dimensions for embeddings (defaults to 1024)
- `VENICE_TTS_MODEL`: The model to use for text-to-speech (defaults to 'tts-kokoro')
- `VENICE_TTS_VOICE`: The voice to use for TTS (defaults to 'af_sky')
- `VENICE_TTS_SPEED`: The speed of generated audio, 0.25 to 4.0 (defaults to 1.0)
- `VENICE_TTS_FORMAT`: The audio format - mp3, opus, aac, flac, wav, pcm (defaults to 'mp3')
- `VENICE_TTS_STREAMING`: Whether to stream audio sentence by sentence (defaults to false)
- `VENICE_BASE_URL`: Custom Venice API base URL (defaults to 'https://api.venice.ai/api/v1')

## Features

- **Text Generation**: Both small and large model support with Venice AI
- **Image Generation**: Advanced image generation with Venice's Fluently XL model
- **Text Embeddings**: Native Venice embeddings with multiple model options
- **Text-to-Speech**: High-quality TTS with multiple voices and languages
- **Object Generation**: JSON object generation with automatic repair functionality
- **Type Safety**: Full TypeScript support with proper type annotations
- **Error Handling**: Comprehensive error handling and logging
- **JSON Repair**: Automatic repair of malformed JSON responses

## Usage

To use the Venice plugin, add it to your ElizaOS configuration:

```typescript
import { venicePlugin } from '@elizaos-plugins/plugin-venice';

// Add to your plugins array
const plugins = [
  venicePlugin,
  // ... other plugins
];
```

### Image Generation Example

The Venice plugin supports advanced image generation with Venice-specific parameters:

```typescript
// Basic usage (compatible with OpenAI interface)
const images = await runtime.useModel(ModelType.IMAGE, {
  prompt: "A beautiful sunset over a mountain range",
  size: "1024x1024"
});

// Advanced usage with Venice-specific parameters
const images = await runtime.useModel(ModelType.IMAGE, {
  prompt: "A beautiful sunset over a mountain range",
  negative_prompt: "Clouds, Rain, Snow",
  style_preset: "3D Model",
  size: "1024x1024",
  steps: 30,
  cfg_scale: 7.5,
  seed: 123456789,
  lora_strength: 50,
  safe_mode: false,
  hide_watermark: false
});
```

### Venice-Specific Image Parameters

- `negative_prompt`: Text describing what you don't want in the image
- `style_preset`: Artistic style to apply (e.g., "3D Model", "Anime", "Photographic")
- `steps`: Number of diffusion steps (default: 30)
- `cfg_scale`: Classifier-free guidance scale (default: 7.5)
- `seed`: Seed for reproducible generation
- `lora_strength`: Strength of LoRA model if applicable (0-100)
- `safe_mode`: Enable safety filtering (default: false)
- `hide_watermark`: Hide Venice watermark (default: false)

### Text Embeddings Example

Venice provides native embedding support with high-quality models:

```typescript
// Generate embeddings
const embedding = await runtime.useModel(ModelType.TEXT_EMBEDDING, {
  text: "This is the text to embed"
});

// The plugin automatically handles:
// - Model selection (defaults to text-embedding-bge-m3)
// - Dimension configuration
// - Error handling with fallback vectors
```

### Available Venice Embedding Models

- `text-embedding-bge-m3`: BGE M3 model (default, 1024 dimensions)
- Other models available through Venice API

Configure the embedding model and dimensions:
```bash
VENICE_EMBEDDING_MODEL=text-embedding-bge-m3
VENICE_EMBEDDING_DIMENSIONS=1024
```

### Text-to-Speech Example

Venice provides high-quality text-to-speech with multiple voices and languages:

```typescript
// Generate speech from text
const audioStream = await runtime.useModel(ModelType.TEXT_TO_SPEECH, 
  "Hello, this is a test of Venice text-to-speech capabilities."
);

// The audio stream can be saved or streamed directly
```

### Available Venice TTS Voices

Venice offers a wide variety of voices across different languages and styles:

**Female Voices (af_*):**
- `af_sky` (default), `af_alloy`, `af_bella`, `af_nova`, `af_sarah`, etc.

**Male Voices (am_*):**
- `am_adam`, `am_echo`, `am_michael`, `am_onyx`, etc.

**Other Language Voices:**
- Chinese: `zf_xiaobei`, `zm_yunxi`
- Japanese: `jf_gongitsune`, `jm_kumo`
- Various European languages

Configure TTS settings:
```bash
VENICE_TTS_MODEL=tts-kokoro
VENICE_TTS_VOICE=af_sky
VENICE_TTS_SPEED=1.0
VENICE_TTS_FORMAT=mp3
VENICE_TTS_STREAMING=false
```

## Development

To build the plugin:

```bash
bun run build
```

To watch for changes during development:

```bash
bun run dev
```

## License

MIT
