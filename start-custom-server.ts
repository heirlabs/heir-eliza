#!/usr/bin/env bun
/**
 * ElizaOS Startup Script with MongoDB Support
 * 
 * Runs ElizaOS server directly using inline imports.
 * This bypasses the CLI which has spawn issues in containerized environments.
 * 
 * Database selection priority:
 * 1. MONGODB_URI / MONGO_URL -> MongoDB
 * 2. Default -> SQL (PGLite)
 */

import * as path from 'node:path';

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const CHARACTER_PATH = process.env.CHARACTER_PATH || './characters/eliza.json';

// Detect database type
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;
const DB_TYPE = MONGODB_URI ? 'MongoDB' : 'SQL (PGLite)';

console.log('='.repeat(60));
console.log('ElizaOS Server Startup - HEIR Estate Planning Assistant');
console.log('='.repeat(60));
console.log(`Port: ${PORT}`);
console.log(`Character: ${CHARACTER_PATH}`);
console.log(`Database: ${DB_TYPE}`);
if (MONGODB_URI) console.log(`MongoDB URI: ***configured***`);
console.log('='.repeat(60));

// Start server directly using inline imports
async function startServer() {
  console.log('[startup] Starting server with inline imports...');
  
  try {
    // Try to import from built dist first, then from src
    let serverModule;
    let mongoPlugin;
    
    // Try multiple import paths for server
    const serverPaths = [
      './packages/server/dist/index.js',
      './packages/server/src/index.ts',
      './packages/server/src/index',
    ];
    
    for (const serverPath of serverPaths) {
      try {
        console.log(`[startup] Trying to import server from: ${serverPath}`);
        serverModule = await import(serverPath);
        console.log(`[startup] Successfully imported server from: ${serverPath}`);
        break;
      } catch (e) {
        console.log(`[startup] Failed to import from ${serverPath}: ${(e as Error).message}`);
      }
    }
    
    if (!serverModule) {
      throw new Error('Could not import server module from any path');
    }
    
    // Only import MongoDB plugin if we have a MongoDB URI
    if (MONGODB_URI) {
      const mongoPaths = [
        './packages/plugin-mongodb/dist/index.js',
        './packages/plugin-mongodb/src/index.ts',
        './packages/plugin-mongodb/src/index',
      ];
      
      for (const mongoPath of mongoPaths) {
        try {
          console.log(`[startup] Trying to import MongoDB plugin from: ${mongoPath}`);
          mongoPlugin = await import(mongoPath);
          console.log(`[startup] Successfully imported MongoDB plugin from: ${mongoPath}`);
          break;
        } catch (e) {
          console.log(`[startup] Failed to import from ${mongoPath}: ${(e as Error).message}`);
        }
      }
    }
    
    const { AgentServer, loadCharacterTryPath } = serverModule;
    
    if (!AgentServer) {
      throw new Error('AgentServer not found in server module');
    }
    
    if (!loadCharacterTryPath) {
      throw new Error('loadCharacterTryPath not found in server module');
    }
    
    // Load character
    const characterFullPath = path.resolve(CHARACTER_PATH);
    console.log(`[startup] Loading character from: ${characterFullPath}`);
    
    const character = await loadCharacterTryPath(characterFullPath);
    if (!character) {
      throw new Error(`Character not found: ${CHARACTER_PATH}`);
    }
    console.log(`[startup] Loaded character: ${character.name}`);
    
    // Create server
    console.log('[startup] Creating AgentServer...');
    const server = new AgentServer();
    
    // Start server with appropriate database plugin
    const serverConfig: any = {
      port: PORT,
      agents: [{ character }],
    };
    
    if (mongoPlugin && MONGODB_URI) {
      console.log('[startup] Configuring MongoDB database adapter...');
      if (mongoPlugin.mongodbPlugin) {
        serverConfig.databasePlugin = mongoPlugin.mongodbPlugin;
      }
      if (mongoPlugin.createDatabaseAdapter) {
        serverConfig.createDatabaseAdapter = mongoPlugin.createDatabaseAdapter;
      }
      if (mongoPlugin.DatabaseMigrationService) {
        serverConfig.DatabaseMigrationService = mongoPlugin.DatabaseMigrationService;
      }
    }
    
    console.log('[startup] Starting server...');
    await server.start(serverConfig);
    
    console.log('='.repeat(60));
    console.log(`[startup] ✅ Server started successfully!`);
    console.log(`[startup] Port: ${PORT}`);
    console.log(`[startup] Database: ${DB_TYPE}`);
    console.log(`[startup] Health check: http://localhost:${PORT}/api/health`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('[startup] Failed to start server:', error);
    throw error;
  }
}

// Graceful shutdown
function shutdown() {
  console.log('\n[startup] Shutting down...');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server
startServer().catch((error) => {
  console.error('[startup] Fatal error:', error);
  process.exit(1);
});
