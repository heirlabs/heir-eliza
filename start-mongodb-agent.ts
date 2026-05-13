#!/usr/bin/env bun
/**
 * MongoDB Agent Startup Script
 * 
 * This script starts ElizaOS with MongoDB as the ONLY database.
 * It bypasses the global elizaos CLI to use our local configurable server.
 * 
 * Usage:
 *   bun run start-mongodb-agent.ts
 *   pm2 start start-mongodb-agent.ts --interpreter bun
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

// Configuration from environment
const PORT = parseInt(process.env.PORT || '3000', 10);
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || '';
const AGENT_ID = process.env.AGENT_ID || 'alice-mongodb-agent';
const CHARACTER_PATH = process.env.CHARACTER_PATH || './characters/alice-agent.json';

console.log('='.repeat(60));
console.log('ElizaOS MongoDB Agent Startup');
console.log('='.repeat(60));
console.log(`Agent ID: ${AGENT_ID}`);
console.log(`Port: ${PORT}`);
console.log(`Character: ${CHARACTER_PATH}`);
console.log(`MongoDB URI: ${MONGODB_URI ? '***configured***' : 'NOT SET'}`);
console.log('='.repeat(60));

// Set environment variables for the child process
process.env.DATABASE_ADAPTER = 'mongodb';
process.env.MONGODB_URI = MONGODB_URI;
process.env.MONGO_URL = MONGODB_URI;

/**
 * For now, we still use the elizaos CLI but with environment variables
 * that tell our MongoDB plugin to take over completely.
 * 
 * In the future, we can create a fully custom server that imports
 * from our local @elizaos/server-configurable package.
 */

// Find elizaos CLI
const elizaosPaths = [
  '/root/.bun/bin/elizaos',
  '/app/node_modules/.bin/elizaos',
  './node_modules/.bin/elizaos',
  '/home/ubuntu/.bun/bin/elizaos',
];

let elizaosPath = '';
for (const p of elizaosPaths) {
  if (existsSync(p)) {
    elizaosPath = p;
    break;
  }
}

if (!elizaosPath) {
  console.error('[startup] ERROR: ElizaOS CLI not found');
  console.error('[startup] Searched paths:', elizaosPaths);
  process.exit(1);
}

console.log(`[startup] Found ElizaOS CLI: ${elizaosPath}`);
console.log(`[startup] Starting ElizaOS on port ${PORT}...`);
console.log('[startup] Environment:');
console.log(`  DATABASE_ADAPTER=${process.env.DATABASE_ADAPTER}`);
console.log(`  MONGODB_URI=${MONGODB_URI ? '***set***' : 'NOT SET'}`);
console.log('[startup] ElizaOS has built-in /health and /healthz endpoints');

// Start ElizaOS directly on PORT
const elizaosProcess = spawn(
  elizaosPath,
  ['start', '--port', String(PORT), '--character', CHARACTER_PATH],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_ADAPTER: 'mongodb',
      MONGODB_URI,
      MONGO_URL: MONGODB_URI,
      PORT: String(PORT),
    },
    stdio: 'inherit',
  }
);

elizaosProcess.on('spawn', () => {
  console.log(`[startup] ✅ ElizaOS spawned on port ${PORT}`);
});

elizaosProcess.on('error', (err) => {
  console.error('[startup] Failed to start ElizaOS:', err);
  process.exit(1);
});

elizaosProcess.on('exit', (code) => {
  console.log(`[startup] ElizaOS exited with code: ${code}`);
  process.exit(code || 0);
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n[startup] Received SIGINT, shutting down...');
  elizaosProcess.kill('SIGTERM');
});

process.on('SIGTERM', () => {
  console.log('\n[startup] Received SIGTERM, shutting down...');
  elizaosProcess.kill('SIGTERM');
});
