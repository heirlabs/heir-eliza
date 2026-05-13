# @elizaos/plugin-mongodb

MongoDB plugin for ElizaOS, providing a full MongoDB database adapter that implements the `IDatabaseAdapter` interface. This allows ElizaOS to use MongoDB instead of PostgreSQL/PGLite, making it compatible with serverless environments like Next.js.

## Installation

The plugin is already included in the monorepo. To use it in your project:

```bash
bun add @elizaos/plugin-mongodb
```

## Configuration

Set the following environment variables:

- `MONGODB_URI` (required): MongoDB connection string
  - Example: `mongodb://admin:password@localhost:27017/eliza?authSource=admin`
- `MONGODB_DB_NAME` (optional): Database name (if not specified in URI)

## Usage

### Basic Connection

```typescript
import { connectDB, disconnectDB, isConnected } from '@elizaos/plugin-mongodb';

// Connect to MongoDB
await connectDB();

// Check connection status
if (isConnected()) {
  console.log('MongoDB connected');
}

// Disconnect when done
await disconnectDB();
```

### Using the MongoDB Adapter

The plugin provides a full `IDatabaseAdapter` implementation that can be used as a drop-in replacement for the SQL adapter:

```typescript
import { createMongoDBAdapter } from '@elizaos/plugin-mongodb';

// Create an adapter instance for your agent
const adapter = createMongoDBAdapter(agentId);

// Initialize the adapter
await adapter.initialize();

// Use it with ElizaOS
const agent = new Agent({
  // ... other config
  databaseAdapter: adapter,
});
```

### Direct Model Access

You can also access the Mongoose models directly:

```typescript
import { ElizaAgent, ElizaMemory } from '@elizaos/plugin-mongodb';
import { connectDB } from '@elizaos/plugin-mongodb';

await connectDB();

// Use the models
const agents = await ElizaAgent.find().lean();
const memories = await ElizaMemory.find({ roomId }).lean();
```

## Connection Caching

The plugin uses connection caching to prevent multiple connections in development. The connection is cached globally and reused across module imports.

## Docker

MongoDB is included in the docker-compose.yaml file. To start MongoDB:

```bash
docker-compose up mongodb
```

Or start all services:

```bash
docker-compose up
```

## Features

- **Full IDatabaseAdapter Implementation**: Complete implementation of all ElizaOS database operations
- **Connection Pooling**: Configurable pool sizes (min: 2, max: 10)
- **Connection Caching**: Prevents multiple connections in development
- **All ElizaOS Models**: Agent, Entity, Component, Memory, World, Room, Participant, Relationship, Task, Log, Cache, AgentRun
- **Vector Search**: Cosine similarity search for memory embeddings
- **TypeScript Support**: Full type safety with ElizaOS core types
- **Serverless Compatible**: Works in Next.js and other serverless environments

## Models

The plugin includes Mongoose models for all ElizaOS entities:

- `ElizaAgent` - Agent configurations
- `ElizaEntity` - Entity data
- `ElizaComponent` - Component data
- `ElizaMemory` - Memory storage with embeddings
- `ElizaWorld` - World configurations
- `ElizaRoom` - Room/Channel data
- `ElizaParticipant` - Room participants
- `ElizaRelationship` - Entity relationships
- `ElizaTask` - Task management
- `ElizaLog` - Logging
- `ElizaCache` - Caching with TTL
- `ElizaAgentRun` - Agent run tracking

All models are indexed for optimal query performance.

