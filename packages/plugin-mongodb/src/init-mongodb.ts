/**
 * MongoDB Initialization Hook
 */

import { connectDB } from './db';
import { createMongoDBAdapter } from './adapter';

let mongoAdapter: ReturnType<typeof createMongoDBAdapter> | null = null;

/**
 * Get or create MongoDB adapter for an agent
 */
export async function getMongoDBAdapter(agentId?: string) {
  await connectDB();
  
  if (!mongoAdapter) {
    const id = agentId || 'eliza-agent';
    mongoAdapter = createMongoDBAdapter(id);
    await mongoAdapter.initialize();
  }
  
  return mongoAdapter;
}

/**
 * Initialize MongoDB connection
 */
export async function initMongoDB() {
  try {
    await connectDB();
    console.log('[MongoDB] Connection established');
    return true;
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error);
    return false;
  }
}
