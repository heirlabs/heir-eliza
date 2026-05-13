/**
 * MongoDB Plugin for ElizaOS
 * 
 * This plugin provides MongoDB as the database adapter for ElizaOS.
 * 
 * IMPORTANT: This plugin fully replaces the SQL database adapter.
 * All data (agents, memories, rooms, worlds, etc.) is stored in MongoDB.
 * 
 * Set MONGODB_URI environment variable to use this plugin.
 */

import { MongoDBDatabaseAdapter, createMongoDBAdapter } from './adapter';
import { connectDB, isConnected, disconnectDB } from './db';

/**
 * Factory function to create the MongoDB database adapter
 * This matches the interface expected by ElizaOS server
 * 
 * @param config - Configuration object (ignored for MongoDB, uses MONGODB_URI env var)
 * @param agentId - The agent ID to use for the adapter
 * @returns The MongoDB database adapter (NOT initialized - call init() separately)
 */
export function createDatabaseAdapter(
  config: { dataDir?: string; postgresUrl?: string; mysqlUrl?: string; mongodbUri?: string },
  agentId: string
): MongoDBDatabaseAdapter {
  // MongoDB config comes from environment variables
  // config.mongodbUri is optional override
  return createMongoDBAdapter(agentId || 'eliza-agent');
}

/**
 * No-op migration service for MongoDB
 * MongoDB is schemaless (uses Mongoose schemas), so we don't need SQL-style migrations
 */
export class MongoDBNoOpMigrationService {
  private db: unknown;
  private plugins: unknown[] = [];

  async initializeWithDatabase(db: unknown): Promise<void> {
    this.db = db;
    console.log('[MongoDB Migration] Database reference set (no-op for MongoDB)');
  }

  discoverAndRegisterPluginSchemas(plugins: unknown[]): void {
    this.plugins = plugins;
    console.log(`[MongoDB Migration] Registered ${plugins.length} plugin(s) (no-op for MongoDB)`);
  }

  async runAllPluginMigrations(): Promise<void> {
    console.log('[MongoDB Migration] Migrations skipped - MongoDB uses Mongoose schemas');
  }

  async runMigrations(): Promise<void> {
    console.log('[MongoDB Migration] No migrations needed - MongoDB is schemaless');
  }
  
  async runPluginMigrations(): Promise<void> {
    console.log('[MongoDB Migration] Plugin migrations skipped - MongoDB is schemaless');
  }
}

export const DatabaseMigrationService = MongoDBNoOpMigrationService;

/**
 * MongoDB Plugin Definition
 */
export const mongodbPlugin = {
  name: '@elizaos/plugin-mongodb',
  description: 'MongoDB database adapter for ElizaOS',
  
  // High priority to load before SQL plugin
  priority: 200,
  
  // The adapter class
  adapter: MongoDBDatabaseAdapter,
  
  // Empty arrays for standard plugin components
  actions: [],
  evaluators: [],
  providers: [],
  services: [],
  clients: [],
  
  /**
   * Plugin initialization
   * 
   * This plugin replaces the database adapter with MongoDB for agent data.
   * Note: The SQL plugin may still handle server-level messaging infrastructure.
   * 
   * The "Cannot map room/world to central IDs" warning is expected and
   * does not affect single-agent operation.
   */
  async init(config: Record<string, string>, runtime: unknown) {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;
    
    console.log('[MongoDB Plugin] Initializing...');
    console.log(`[MongoDB Plugin] URI: ${mongoUri ? '***configured***' : 'NOT SET'}`);
    
    if (!mongoUri) {
      console.warn('[MongoDB Plugin] MONGODB_URI not set, skipping MongoDB adapter');
      return;
    }
    
    try {
      // Connect to MongoDB
      await connectDB();
      console.log('[MongoDB Plugin] MongoDB connection established');
      
      const rt = runtime as any;
      
      // Get agent ID from runtime
      const agentId = rt?.agentId || 
                      rt?.character?.id ||
                      rt?.character?.name || 
                      'eliza-mongodb-agent';
      
      // Create and initialize MongoDB adapter
      const mongoAdapter = createMongoDBAdapter(agentId);
      await mongoAdapter.initialize();
      
      // IMPORTANT: Don't close or interfere with the SQL adapter
      // The server messaging infrastructure needs SQL for coordination
      // We just replace the runtime adapter for agent-specific operations
      
      // Set MongoDB as the agent's database adapter
      rt.adapter = mongoAdapter;
      if ('databaseAdapter' in rt) {
        rt.databaseAdapter = mongoAdapter;
      }
      
      console.log(`[MongoDB Plugin] Agent ID: ${agentId}`);
      console.log('[MongoDB Plugin] MongoDB adapter installed for agent data');
      console.log('[MongoDB Plugin] Note: Server messaging uses SQL internally');
      console.log('[MongoDB Plugin] Initialized successfully');
      
    } catch (error) {
      console.error('[MongoDB Plugin] Initialization failed:', error);
      throw error;
    }
  },
  
  /**
   * Plugin cleanup
   */
  async cleanup() {
    console.log('[MongoDB Plugin] Cleaning up...');
    await disconnectDB();
    console.log('[MongoDB Plugin] Cleanup complete');
  },
};

// Export the factory function for CLI usage
export { createDatabaseAdapter as createMongoDBDatabaseAdapter };

export default mongodbPlugin;
