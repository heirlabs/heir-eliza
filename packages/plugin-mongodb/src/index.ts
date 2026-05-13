/**
 * @elizaos/plugin-mongodb
 * 
 * MongoDB plugin for ElizaOS - provides MongoDB as the database adapter.
 * 
 * Usage:
 *   Set MONGODB_URI environment variable and add to your character plugins.
 *   
 *  */

// Database connection utilities
export { connectDB, disconnectDB, isConnected, default as mongooseConnection } from './db';

// MongoDB adapter for ElizaOS
export { MongoDBDatabaseAdapter, createMongoDBAdapter } from './adapter';

// Plugin exports (following plugin-mysql pattern from PR #6143)
export { 
  mongodbPlugin as plugin,
  mongodbPlugin,
  createDatabaseAdapter,
  createMongoDBDatabaseAdapter,
  DatabaseMigrationService,
  MongoDBNoOpMigrationService,
} from './plugin';

// Default export is the plugin
export { default } from './plugin';

// MongoDB agent initialization (optional, for direct usage)
export {
  initializeMongoDBAgent,
  getMongoDBAgent,
  getAgentInitError,
  isAgentInitialized,
  getAgentUptime,
  shutdownMongoDBAgent,
  getAgentStatus,
  type MongoDBAgentConfig,
} from './agent';

// Initialization helpers
export { getMongoDBAdapter, initMongoDB } from './init-mongodb';

// Mongoose models (for direct database access if needed)
export * from './models';

// Re-export mongoose types for convenience
export type { Connection, Model, Schema, Document } from 'mongoose';
export { Types } from 'mongoose';
