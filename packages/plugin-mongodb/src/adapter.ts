/**
 * MongoDB Database Adapter for ElizaOS
 *
 * Implements the IDatabaseAdapter interface from @elizaos/core
 * using MongoDB/Mongoose for persistence.
 */

import { v4 as uuidv4 } from 'uuid';
import { connectDB } from './db';
import {
  ElizaAgent,
  ElizaEntity,
  ElizaComponent,
  ElizaMemory,
  ElizaWorld,
  ElizaRoom,
  ElizaParticipant,
  ElizaRelationship,
  ElizaTask,
  ElizaLog,
  ElizaCache,
  // Messaging models
  MessageServer,
  MessageChannel,
  CentralMessage,
} from './models';

// Type definitions matching @elizaos/core
type UUID = `${string}-${string}-${string}-${string}-${string}`;

interface Agent {
  id: UUID;
  name: string;
  username?: string;
  system?: string;
  bio?: string | string[];
  enabled?: boolean;
  status?: string;
  settings?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  character?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Entity {
  id: UUID;
  agentId?: UUID;
  names?: string[];
  metadata?: Record<string, unknown>;
  components?: Component[];
}

interface Component {
  id?: UUID;
  entityId?: UUID;
  agentId?: UUID;
  roomId?: UUID;
  worldId?: UUID;
  sourceEntityId?: UUID;
  type: string;
  data?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Memory {
  id?: UUID;
  entityId?: UUID;
  agentId?: UUID;
  roomId?: UUID;
  worldId?: UUID;
  content: {
    text?: string;
    [key: string]: unknown;
  };
  embedding?: number[];
  unique?: boolean;
  metadata?: Record<string, unknown>;
  createdAt?: Date | number;
}

interface MemoryMetadata {
  [key: string]: unknown;
}

interface World {
  id: UUID;
  agentId?: UUID;
  name: string;
  serverId?: string;
  metadata?: Record<string, unknown>;
}

interface Room {
  id: UUID;
  agentId?: UUID;
  worldId?: UUID;
  name?: string;
  source?: string;
  type?: string;
  channelId?: string;
  serverId?: string;
  metadata?: Record<string, unknown>;
}

interface Participant {
  id: UUID;
  entityId: UUID;
  roomId: UUID;
  userState?: 'FOLLOWED' | 'MUTED' | null;
  lastActiveAt?: Date;
}

interface Relationship {
  id?: UUID;
  sourceEntityId: UUID;
  targetEntityId: UUID;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

interface Task {
  id?: UUID;
  name: string;
  description?: string;
  roomId?: UUID;
  worldId?: UUID;
  entityId?: UUID;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Log {
  id?: UUID;
  entityId: UUID;
  roomId: UUID;
  type: string;
  body: Record<string, unknown>;
  createdAt?: Date;
}

/**
 * MongoDB Database Adapter for ElizaOS
 */
export class MongoDBDatabaseAdapter {
  db: unknown = null;
  private agentId: string;
  private initialized = false;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async initialize(_config?: Record<string, string | number | boolean | null>): Promise<void> {
    if (this.initialized) return;
    try {
      console.log('[MongoDB Adapter] Connecting to MongoDB...');
      this.db = await connectDB();
      this.initialized = true;
      console.log('[MongoDB Adapter] Connected successfully');
      
      // Auto-create default world if it doesn't exist
      // This is required for ElizaOS server to function
      await this.ensureDefaultWorld();
    } catch (error) {
      console.error('[MongoDB Adapter] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Ensures the default world exists in MongoDB
   * The ElizaOS server requires a default world with ID 00000000-0000-0000-0000-000000000000
   */
  private async ensureDefaultWorld(): Promise<void> {
    const DEFAULT_WORLD_ID = '00000000-0000-0000-0000-000000000000' as UUID;
    const DEFAULT_AGENT_ID = '00000000-0000-0000-0000-000000000001' as UUID;
    
    try {
      const existingWorld = await ElizaWorld.findOne({ worldId: DEFAULT_WORLD_ID }).lean();
      
      if (!existingWorld) {
        console.log('[MongoDB Adapter] Creating default world...');
        await ElizaWorld.create({
          worldId: DEFAULT_WORLD_ID,
          agentId: DEFAULT_AGENT_ID,
          name: 'Default Server',
          serverId: DEFAULT_WORLD_ID,
          metadata: {},
        });
        console.log('[MongoDB Adapter] Default world created successfully');
      } else {
        console.log('[MongoDB Adapter] Default world already exists');
      }
    } catch (error) {
      // Ignore duplicate key errors - world already exists
      if ((error as any)?.code === 11000) {
        console.log('[MongoDB Adapter] Default world already exists (duplicate key)');
      } else {
        console.warn('[MongoDB Adapter] Could not create default world:', error);
        // Don't throw - this shouldn't prevent startup
      }
    }
  }

  async init(): Promise<void> {
    await this.initialize();
  }

  async runPluginMigrations(
    _plugins: Array<{ name: string; schema?: Record<string, unknown> }>,
    _options?: { verbose?: boolean; force?: boolean; dryRun?: boolean }
  ): Promise<void> {
    // MongoDB doesn't need migrations - schema is flexible
    console.log('[MongoDB Adapter] Plugin migrations not required for MongoDB');
  }

  async isReady(): Promise<boolean> {
    return this.initialized && this.db !== null;
  }

  async close(): Promise<void> {
    // Connection is managed by the db module
    this.initialized = false;
  }

  async getConnection(): Promise<unknown> {
    return this.db;
  }

  // ===== Agent Methods =====

  async getAgent(agentId: UUID): Promise<Agent | null> {
    const doc = await ElizaAgent.findOne({ agentId }).lean();
    if (!doc) return null;
    return {
      id: doc.agentId as UUID,
      name: doc.name,
      username: doc.username,
      system: doc.system,
      bio: doc.bio,
      enabled: doc.enabled,
      status: doc.status,
      settings: doc.settings as Record<string, unknown>,
      secrets: doc.secrets as Record<string, unknown>,
      character: doc.character as Record<string, unknown> | undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async getAgents(): Promise<Partial<Agent>[]> {
    const docs = await ElizaAgent.find().lean();
    return docs.map((doc) => ({
      id: doc.agentId as UUID,
      name: doc.name,
      username: doc.username,
      status: doc.status,
    }));
  }

  /**
   * Get all enabled agents with their full character data for restoration on startup
   */
  async getAgentsWithCharacter(): Promise<Array<{ id: UUID; name: string; character: Record<string, unknown> | null }>> {
    const docs = await ElizaAgent.find({ enabled: true }).lean();
    return docs.map((doc) => ({
      id: doc.agentId as UUID,
      name: doc.name,
      character: (doc.character as Record<string, unknown>) || null,
    }));
  }

  async createAgent(agent: Partial<Agent>): Promise<boolean> {
    try {
      const agentId = agent.id || (uuidv4() as UUID);
      await ElizaAgent.create({
        agentId,
        name: agent.name || 'Agent',
        username: agent.username,
        system: agent.system,
        bio: Array.isArray(agent.bio) ? agent.bio : agent.bio ? [agent.bio] : [],
        enabled: agent.enabled ?? true,
        status: agent.status || 'active',
        settings: agent.settings || {},
        secrets: agent.secrets || {},
        character: agent.character || undefined,
      });
      return true;
    } catch (error) {
      console.error('[MongoDB Adapter] Error creating agent:', error);
      return false;
    }
  }

  async updateAgent(agentId: UUID, agent: Partial<Agent>): Promise<boolean> {
    const result = await ElizaAgent.updateOne(
      { agentId },
      { $set: agent }
    );
    return result.modifiedCount > 0;
  }

  async deleteAgent(agentId: UUID): Promise<boolean> {
    const result = await ElizaAgent.deleteOne({ agentId });
    return result.deletedCount > 0;
  }

  // ===== Entity Methods =====

  async getEntitiesByIds(entityIds: UUID[]): Promise<Entity[] | null> {
    const docs = await ElizaEntity.find({ entityId: { $in: entityIds } }).lean();
    if (!docs.length) return null;
    return docs.map((doc) => ({
      id: doc.entityId as UUID,
      agentId: doc.agentId as UUID,
      names: doc.names || [],
      metadata: (doc.metadata as Record<string, unknown>) || {},
    }));
  }

  async getEntitiesForRoom(roomId: UUID, includeComponents?: boolean): Promise<Entity[]> {
    const participants = await ElizaParticipant.find({ roomId }).lean();
    const entityIds = participants.map((p) => p.entityId);
    
    const docs = await ElizaEntity.find({ entityId: { $in: entityIds } }).lean();
    
    const entities: Entity[] = docs.map((doc) => ({
      id: doc.entityId as UUID,
      agentId: doc.agentId as UUID,
      names: doc.names || [],
      metadata: (doc.metadata as Record<string, unknown>) || {},
    }));

    if (includeComponents) {
      for (const entity of entities) {
        const components = await this.getComponents(entity.id);
        entity.components = components;
      }
    }

    return entities;
  }

  async createEntities(entities: Entity[]): Promise<boolean> {
    try {
      const docs = entities.map((entity) => ({
        entityId: entity.id || uuidv4(),
        agentId: entity.agentId || this.agentId,
        names: entity.names || [],
        metadata: entity.metadata || {},
      }));
      await ElizaEntity.insertMany(docs);
      return true;
    } catch (error) {
      console.error('[MongoDB Adapter] Error creating entities:', error);
      return false;
    }
  }

  async updateEntity(entity: Entity): Promise<void> {
    await ElizaEntity.updateOne(
      { entityId: entity.id },
      { $set: { names: entity.names, metadata: entity.metadata } }
    );
  }

  // ===== Component Methods =====

  async getComponent(
    entityId: UUID,
    type: string,
    worldId?: UUID,
    sourceEntityId?: UUID
  ): Promise<Component | null> {
    const query: Record<string, unknown> = { entityId, type };
    if (worldId) query.worldId = worldId;
    if (sourceEntityId) query.sourceEntityId = sourceEntityId;

    const doc = await ElizaComponent.findOne(query).lean();
    if (!doc) return null;

    return {
      id: doc.componentId as UUID,
      entityId: doc.entityId as UUID,
      agentId: doc.agentId as UUID,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      sourceEntityId: doc.sourceEntityId as UUID,
      type: doc.type,
      data: doc.data as Record<string, unknown>,
      createdAt: doc.createdAt,
    };
  }

  async getComponents(
    entityId: UUID,
    worldId?: UUID,
    sourceEntityId?: UUID
  ): Promise<Component[]> {
    const query: Record<string, unknown> = { entityId };
    if (worldId) query.worldId = worldId;
    if (sourceEntityId) query.sourceEntityId = sourceEntityId;

    const docs = await ElizaComponent.find(query).lean();
    return docs.map((doc) => ({
      id: doc.componentId as UUID,
      entityId: doc.entityId as UUID,
      agentId: doc.agentId as UUID,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      sourceEntityId: doc.sourceEntityId as UUID,
      type: doc.type,
      data: doc.data as Record<string, unknown>,
      createdAt: doc.createdAt,
    }));
  }

  async createComponent(component: Component): Promise<boolean> {
    try {
      await ElizaComponent.create({
        componentId: component.id || uuidv4(),
        entityId: component.entityId,
        agentId: component.agentId || this.agentId,
        roomId: component.roomId,
        worldId: component.worldId,
        sourceEntityId: component.sourceEntityId,
        type: component.type,
        data: component.data || {},
      });
      return true;
    } catch (error) {
      console.error('[MongoDB Adapter] Error creating component:', error);
      return false;
    }
  }

  async updateComponent(component: Component): Promise<void> {
    await ElizaComponent.updateOne(
      { componentId: component.id },
      { $set: { data: component.data, type: component.type } }
    );
  }

  async deleteComponent(componentId: UUID): Promise<void> {
    await ElizaComponent.deleteOne({ componentId });
  }

  // ===== Memory Methods =====

  async getMemories(params: {
    entityId?: UUID;
    agentId?: UUID;
    count?: number;
    offset?: number;
    unique?: boolean;
    tableName: string;
    start?: number;
    end?: number;
    roomId?: UUID;
    worldId?: UUID;
  }): Promise<Memory[]> {
    const query: Record<string, unknown> = { tableName: params.tableName };
    
    if (params.entityId) query.entityId = params.entityId;
    if (params.agentId) query.agentId = params.agentId;
    if (params.roomId) query.roomId = params.roomId;
    if (params.worldId) query.worldId = params.worldId;
    if (params.unique) query.unique = true;

    let dbQuery = ElizaMemory.find(query).sort({ createdAt: -1 });
    
    if (params.offset) dbQuery = dbQuery.skip(params.offset);
    if (params.count) dbQuery = dbQuery.limit(params.count);

    const docs = await dbQuery.lean();
    return docs.map((doc) => ({
      id: doc.memoryId as UUID,
      entityId: doc.entityId as UUID,
      agentId: doc.agentId as UUID,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      content: doc.content as Memory['content'],
      embedding: doc.embedding,
      unique: doc.unique,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
    }));
  }

  async getMemoriesByRoomIds(params: {
    roomIds: UUID[];
    tableName: string;
    limit?: number;
  }): Promise<Memory[]> {
    let dbQuery = ElizaMemory.find({
      roomId: { $in: params.roomIds },
      tableName: params.tableName,
    }).sort({ createdAt: -1 });

    if (params.limit) dbQuery = dbQuery.limit(params.limit);

    const docs = await dbQuery.lean();
    return docs.map((doc) => ({
      id: doc.memoryId as UUID,
      entityId: doc.entityId as UUID,
      agentId: doc.agentId as UUID,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      content: doc.content as Memory['content'],
      embedding: doc.embedding,
      unique: doc.unique,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
    }));
  }

  async getMemoryById(id: UUID): Promise<Memory | null> {
    const doc = await ElizaMemory.findOne({ memoryId: id }).lean();
    if (!doc) return null;
    return {
      id: doc.memoryId as UUID,
      entityId: doc.entityId as UUID,
      agentId: doc.agentId as UUID,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      content: doc.content as Memory['content'],
      embedding: doc.embedding,
      unique: doc.unique,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
    };
  }

  async getMemoriesByIds(memoryIds: UUID[], _tableName?: string): Promise<Memory[]> {
    const docs = await ElizaMemory.find({ memoryId: { $in: memoryIds } }).lean();
    return docs.map((doc) => ({
      id: doc.memoryId as UUID,
      entityId: doc.entityId as UUID,
      agentId: doc.agentId as UUID,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      content: doc.content as Memory['content'],
      embedding: doc.embedding,
      unique: doc.unique,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
    }));
  }

  async getCachedEmbeddings(_params: {
    query_table_name: string;
    query_threshold: number;
    query_input: string;
    query_field_name: string;
    query_field_sub_name: string;
    query_match_count: number;
  }): Promise<{ embedding: number[]; levenshtein_score: number }[]> {
    // MongoDB doesn't have native Levenshtein - return empty for now
    return [];
  }

  async searchMemories(params: {
    tableName: string;
    embedding: number[];
    match_threshold?: number;
    count?: number;
    unique?: boolean;
    query?: string;
    roomId?: UUID;
    worldId?: UUID;
    entityId?: UUID;
  }): Promise<Memory[]> {
    // For now, do a simple query without vector search
    // Real implementation would use MongoDB Atlas Vector Search
    const query: Record<string, unknown> = { tableName: params.tableName };
    
    if (params.roomId) query.roomId = params.roomId;
    if (params.worldId) query.worldId = params.worldId;
    if (params.entityId) query.entityId = params.entityId;
    if (params.unique) query.unique = true;

    let dbQuery = ElizaMemory.find(query).sort({ createdAt: -1 });
    if (params.count) dbQuery = dbQuery.limit(params.count);

    const docs = await dbQuery.lean();
    return docs.map((doc) => ({
      id: doc.memoryId as UUID,
      entityId: doc.entityId as UUID,
      agentId: doc.agentId as UUID,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      content: doc.content as Memory['content'],
      embedding: doc.embedding,
      unique: doc.unique,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
    }));
  }

  async createMemory(memory: Memory, tableName: string, unique?: boolean): Promise<UUID> {
    const memoryId = (memory.id || uuidv4()) as UUID;
    await ElizaMemory.create({
      memoryId,
      entityId: memory.entityId,
      agentId: memory.agentId || this.agentId,
      roomId: memory.roomId,
      worldId: memory.worldId,
      tableName,
      content: memory.content,
      embedding: memory.embedding,
      unique: unique ?? memory.unique ?? false,
      metadata: memory.metadata || {},
    });
    return memoryId;
  }

  async updateMemory(memory: Partial<Memory> & { id: UUID; metadata?: MemoryMetadata }): Promise<boolean> {
    const result = await ElizaMemory.updateOne(
      { memoryId: memory.id },
      { $set: { content: memory.content, metadata: memory.metadata, embedding: memory.embedding } }
    );
    return result.modifiedCount > 0;
  }

  async deleteMemory(memoryId: UUID): Promise<void> {
    await ElizaMemory.deleteOne({ memoryId });
  }

  async deleteManyMemories(memoryIds: UUID[]): Promise<void> {
    await ElizaMemory.deleteMany({ memoryId: { $in: memoryIds } });
  }

  async deleteAllMemories(roomId: UUID, tableName: string): Promise<void> {
    await ElizaMemory.deleteMany({ roomId, tableName });
  }

  async countMemories(roomId: UUID, unique?: boolean, tableName?: string): Promise<number> {
    const query: Record<string, unknown> = { roomId };
    if (unique) query.unique = true;
    if (tableName) query.tableName = tableName;
    return ElizaMemory.countDocuments(query);
  }

  async getMemoriesByWorldId(params: {
    worldId: UUID;
    count?: number;
    tableName?: string;
  }): Promise<Memory[]> {
    const query: Record<string, unknown> = { worldId: params.worldId };
    if (params.tableName) query.tableName = params.tableName;

    let dbQuery = ElizaMemory.find(query).sort({ createdAt: -1 });
    if (params.count) dbQuery = dbQuery.limit(params.count);

    const docs = await dbQuery.lean();
    return docs.map((doc) => ({
      id: doc.memoryId as UUID,
      entityId: doc.entityId as UUID,
      agentId: doc.agentId as UUID,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      content: doc.content as Memory['content'],
      embedding: doc.embedding,
      unique: doc.unique,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
    }));
  }

  // ===== World Methods =====

  async getWorld(id: UUID): Promise<World | null> {
    const doc = await ElizaWorld.findOne({ worldId: id }).lean();
    if (!doc) return null;
    return {
      id: doc.worldId as UUID,
      agentId: doc.agentId as UUID,
      name: doc.name,
      serverId: doc.serverId,
      metadata: (doc.metadata as Record<string, unknown>) || {},
    };
  }

  async getAllWorlds(): Promise<World[]> {
    const docs = await ElizaWorld.find().lean();
    return docs.map((doc) => ({
      id: doc.worldId as UUID,
      agentId: doc.agentId as UUID,
      name: doc.name,
      serverId: doc.serverId,
      metadata: (doc.metadata as Record<string, unknown>) || {},
    }));
  }

  async createWorld(world: World): Promise<UUID> {
    const worldId = world.id || (uuidv4() as UUID);
    await ElizaWorld.create({
      worldId,
      agentId: world.agentId || this.agentId,
      name: world.name,
      serverId: world.serverId,
      metadata: world.metadata || {},
    });
    return worldId;
  }

  async updateWorld(world: World): Promise<void> {
    await ElizaWorld.updateOne(
      { worldId: world.id },
      { $set: { name: world.name, serverId: world.serverId, metadata: world.metadata } }
    );
  }

  async removeWorld(id: UUID): Promise<void> {
    await ElizaWorld.deleteOne({ worldId: id });
  }

  // ===== Room Methods =====

  async getRoom(roomId: UUID): Promise<Room | null> {
    const doc = await ElizaRoom.findOne({ roomId }).lean();
    if (!doc) return null;
    return {
      id: doc.roomId as UUID,
      agentId: doc.agentId as UUID,
      worldId: doc.worldId as UUID,
      name: doc.name,
      source: doc.source,
      type: doc.type,
      channelId: doc.channelId,
      serverId: doc.serverId,
      metadata: (doc.metadata as Record<string, unknown>) || {},
    };
  }

  async getRoomsByIds(roomIds: UUID[]): Promise<Room[] | null> {
    const docs = await ElizaRoom.find({ roomId: { $in: roomIds } }).lean();
    if (!docs.length) return null;
    return docs.map((doc) => ({
      id: doc.roomId as UUID,
      agentId: doc.agentId as UUID,
      worldId: doc.worldId as UUID,
      name: doc.name,
      source: doc.source,
      type: doc.type,
      channelId: doc.channelId,
      serverId: doc.serverId,
      metadata: (doc.metadata as Record<string, unknown>) || {},
    }));
  }

  async getRoomsByWorld(worldId: UUID): Promise<Room[]> {
    const docs = await ElizaRoom.find({ worldId }).lean();
    return docs.map((doc) => ({
      id: doc.roomId as UUID,
      agentId: doc.agentId as UUID,
      worldId: doc.worldId as UUID,
      name: doc.name,
      source: doc.source,
      type: doc.type,
      channelId: doc.channelId,
      serverId: doc.serverId,
      metadata: (doc.metadata as Record<string, unknown>) || {},
    }));
  }

  async createRooms(rooms: Room[]): Promise<UUID[]> {
    const docs = rooms.map((room) => ({
      roomId: room.id || uuidv4(),
      agentId: room.agentId || this.agentId,
      worldId: room.worldId,
      name: room.name,
      source: room.source,
      type: room.type,
      channelId: room.channelId,
      serverId: room.serverId,
      metadata: room.metadata || {},
    }));
    const result = await ElizaRoom.insertMany(docs);
    return result.map((doc) => doc.roomId as UUID);
  }

  async updateRoom(room: Room): Promise<void> {
    await ElizaRoom.updateOne(
      { roomId: room.id },
      { $set: { 
        name: room.name, 
        metadata: room.metadata, 
        worldId: room.worldId,
        channelId: room.channelId,
        serverId: room.serverId,
      } }
    );
  }

  async deleteRoom(roomId: UUID): Promise<void> {
    await ElizaRoom.deleteOne({ roomId });
    await ElizaParticipant.deleteMany({ roomId });
  }

  async deleteRoomsByWorldId(worldId: UUID): Promise<void> {
    const rooms = await ElizaRoom.find({ worldId }).lean();
    const roomIds = rooms.map((r) => r.roomId);
    await ElizaRoom.deleteMany({ worldId });
    await ElizaParticipant.deleteMany({ roomId: { $in: roomIds } });
  }

  // ===== Participant Methods =====

  async getRoomsForParticipant(entityId: UUID): Promise<UUID[]> {
    const participants = await ElizaParticipant.find({ entityId }).lean();
    return participants.map((p) => p.roomId as UUID);
  }

  async getRoomsForParticipants(userIds: UUID[]): Promise<UUID[]> {
    const participants = await ElizaParticipant.find({ entityId: { $in: userIds } }).lean();
    const roomIds = [...new Set(participants.map((p) => p.roomId))];
    return roomIds as UUID[];
  }

  async addParticipantsRoom(entityIds: UUID[], roomId: UUID): Promise<boolean> {
    try {
      const docs = entityIds.map((entityId) => ({
        participantId: uuidv4(),
        entityId,
        roomId,
        userState: null,
      }));
      await ElizaParticipant.insertMany(docs, { ordered: false }).catch(() => {
        // Ignore duplicate key errors
      });
      return true;
    } catch {
      return false;
    }
  }

  async removeParticipant(entityId: UUID, roomId: UUID): Promise<boolean> {
    const result = await ElizaParticipant.deleteOne({ entityId, roomId });
    return result.deletedCount > 0;
  }

  async getParticipantsForEntity(entityId: UUID): Promise<Participant[]> {
    const docs = await ElizaParticipant.find({ entityId }).lean();
    return docs.map((doc) => ({
      id: doc.participantId as UUID,
      entityId: doc.entityId as UUID,
      roomId: doc.roomId as UUID,
      userState: doc.userState as 'FOLLOWED' | 'MUTED' | null,
      lastActiveAt: doc.lastActiveAt,
    }));
  }

  async getParticipantsForRoom(roomId: UUID): Promise<UUID[]> {
    const docs = await ElizaParticipant.find({ roomId }).lean();
    return docs.map((doc) => doc.entityId as UUID);
  }

  async isRoomParticipant(roomId: UUID, entityId: UUID): Promise<boolean> {
    const count = await ElizaParticipant.countDocuments({ roomId, entityId });
    return count > 0;
  }

  async getParticipantUserState(roomId: UUID, entityId: UUID): Promise<'FOLLOWED' | 'MUTED' | null> {
    const doc = await ElizaParticipant.findOne({ roomId, entityId }).lean();
    return (doc?.userState as 'FOLLOWED' | 'MUTED' | null) ?? null;
  }

  async setParticipantUserState(roomId: UUID, entityId: UUID, state: 'FOLLOWED' | 'MUTED' | null): Promise<void> {
    await ElizaParticipant.updateOne(
      { roomId, entityId },
      { $set: { userState: state } }
    );
  }

  // ===== Relationship Methods =====

  async createRelationship(params: {
    sourceEntityId: UUID;
    targetEntityId: UUID;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    try {
      await ElizaRelationship.create({
        relationshipId: uuidv4(),
        sourceEntityId: params.sourceEntityId,
        targetEntityId: params.targetEntityId,
        agentId: this.agentId,
        tags: params.tags || [],
        metadata: params.metadata || {},
      });
      return true;
    } catch {
      return false;
    }
  }

  async getRelationship(params: {
    sourceEntityId: UUID;
    targetEntityId: UUID;
  }): Promise<Relationship | null> {
    const doc = await ElizaRelationship.findOne({
      sourceEntityId: params.sourceEntityId,
      targetEntityId: params.targetEntityId,
    }).lean();
    
    if (!doc) return null;
    return {
      id: doc.relationshipId as UUID,
      sourceEntityId: doc.sourceEntityId as UUID,
      targetEntityId: doc.targetEntityId as UUID,
      tags: doc.tags || [],
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
    };
  }

  async getRelationships(params: {
    entityId: UUID;
    tags?: string[];
  }): Promise<Relationship[]> {
    const query: Record<string, unknown> = {
      $or: [
        { sourceEntityId: params.entityId },
        { targetEntityId: params.entityId },
      ],
    };
    if (params.tags?.length) {
      query.tags = { $in: params.tags };
    }

    const docs = await ElizaRelationship.find(query).lean();
    return docs.map((doc) => ({
      id: doc.relationshipId as UUID,
      sourceEntityId: doc.sourceEntityId as UUID,
      targetEntityId: doc.targetEntityId as UUID,
      tags: doc.tags || [],
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
    }));
  }

  async updateRelationship(params: {
    sourceEntityId: UUID;
    targetEntityId: UUID;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const update: Record<string, unknown> = {};
    if (params.tags) update.tags = params.tags;
    if (params.metadata) update.metadata = params.metadata;

    await ElizaRelationship.updateOne(
      {
        sourceEntityId: params.sourceEntityId,
        targetEntityId: params.targetEntityId,
      },
      { $set: update }
    );
  }

  // ===== Cache Methods =====

  async getCache<T>(key: string): Promise<T | undefined> {
    const doc = await ElizaCache.findOne({ agentId: this.agentId, key }).lean();
    if (!doc) return undefined;
    try {
      return JSON.parse(doc.value as string) as T;
    } catch {
      return doc.value as T;
    }
  }

  async setCache<T>(key: string, value: T): Promise<boolean> {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await ElizaCache.updateOne(
        { agentId: this.agentId, key },
        { $set: { value: stringValue } },
        { upsert: true }
      );
      return true;
    } catch {
      return false;
    }
  }

  async deleteCache(key: string): Promise<boolean> {
    const result = await ElizaCache.deleteOne({ agentId: this.agentId, key });
    return result.deletedCount > 0;
  }

  // ===== Task Methods =====

  async createTask(task: Task): Promise<UUID> {
    const taskId = (task.id || uuidv4()) as UUID;
    await ElizaTask.create({
      taskId,
      name: task.name,
      description: task.description,
      roomId: task.roomId,
      worldId: task.worldId,
      entityId: task.entityId,
      tags: task.tags || [],
      metadata: task.metadata || {},
    });
    return taskId;
  }

  async getTasks(params: {
    roomId?: UUID;
    tags?: string[];
    entityId?: UUID;
  }): Promise<Task[]> {
    const query: Record<string, unknown> = {};
    if (params.roomId) query.roomId = params.roomId;
    if (params.entityId) query.entityId = params.entityId;
    if (params.tags?.length) query.tags = { $in: params.tags };

    const docs = await ElizaTask.find(query).lean();
    return docs.map((doc) => ({
      id: doc.taskId as UUID,
      name: doc.name,
      description: doc.description,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      entityId: doc.entityId as UUID,
      tags: doc.tags || [],
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }

  async getTask(id: UUID): Promise<Task | null> {
    const doc = await ElizaTask.findOne({ taskId: id }).lean();
    if (!doc) return null;
    return {
      id: doc.taskId as UUID,
      name: doc.name,
      description: doc.description,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      entityId: doc.entityId as UUID,
      tags: doc.tags || [],
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async getTasksByName(name: string): Promise<Task[]> {
    const docs = await ElizaTask.find({ name }).lean();
    return docs.map((doc) => ({
      id: doc.taskId as UUID,
      name: doc.name,
      description: doc.description,
      roomId: doc.roomId as UUID,
      worldId: doc.worldId as UUID,
      entityId: doc.entityId as UUID,
      tags: doc.tags || [],
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }

  async updateTask(id: UUID, task: Partial<Task>): Promise<void> {
    await ElizaTask.updateOne({ taskId: id }, { $set: task });
  }

  async deleteTask(id: UUID): Promise<void> {
    await ElizaTask.deleteOne({ taskId: id });
  }

  // ===== Log Methods =====

  async log(params: {
    body: Record<string, unknown>;
    entityId: UUID;
    roomId: UUID;
    type: string;
  }): Promise<void> {
    await ElizaLog.create({
      logId: uuidv4(),
      entityId: params.entityId,
      roomId: params.roomId,
      agentId: this.agentId,
      type: params.type,
      body: params.body,
    });
  }

  async getLogs(params: {
    entityId?: UUID;
    roomId?: UUID;
    type?: string;
    count?: number;
    offset?: number;
  }): Promise<Log[]> {
    const query: Record<string, unknown> = {};
    if (params.entityId) query.entityId = params.entityId;
    if (params.roomId) query.roomId = params.roomId;
    if (params.type) query.type = params.type;

    let dbQuery = ElizaLog.find(query).sort({ createdAt: -1 });
    if (params.offset) dbQuery = dbQuery.skip(params.offset);
    if (params.count) dbQuery = dbQuery.limit(params.count);

    const docs = await dbQuery.lean();
    return docs.map((doc) => ({
      id: doc.logId as UUID,
      entityId: doc.entityId as UUID,
      roomId: doc.roomId as UUID,
      type: doc.type,
      body: doc.body as Record<string, unknown>,
      createdAt: doc.createdAt,
    }));
  }

  async deleteLog(logId: UUID): Promise<void> {
    await ElizaLog.deleteOne({ logId });
  }

  // ===== Embedding Methods =====

  async ensureEmbeddingDimension(_dimension: number): Promise<void> {
    // MongoDB handles this dynamically
  }

  // ===== Messaging Methods (for server infrastructure) =====

  async createMessageServer(data: {
    id?: UUID;
    name: string;
    sourceType: string;
    sourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<MessageServerType> {
    const serverId = data.id || (uuidv4() as UUID);
    const doc = await MessageServer.create({
      serverId,
      name: data.name,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      metadata: data.metadata || {},
      agentIds: [],
    });
    return {
      id: doc.serverId as UUID,
      name: doc.name,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      metadata: doc.metadata as Record<string, unknown>,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async getMessageServers(): Promise<MessageServerType[]> {
    const docs = await MessageServer.find().lean();
    return docs.map((doc) => ({
      id: doc.serverId as UUID,
      name: doc.name,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }

  async getMessageServerById(serverId: UUID): Promise<MessageServerType | null> {
    const doc = await MessageServer.findOne({ serverId }).lean();
    if (!doc) return null;
    return {
      id: doc.serverId as UUID,
      name: doc.name,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async getMessageServerByRlsServerId(rlsServerId: UUID): Promise<MessageServerType | null> {
    const doc = await MessageServer.findOne({ rlsServerId }).lean();
    if (!doc) return null;
    return {
      id: doc.serverId as UUID,
      name: doc.name,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async addAgentToServer(serverId: UUID, agentId: UUID): Promise<void> {
    await MessageServer.updateOne(
      { serverId },
      { $addToSet: { agentIds: agentId } }
    );
  }

  async removeAgentFromServer(serverId: UUID, agentId: UUID): Promise<void> {
    await MessageServer.updateOne(
      { serverId },
      { $pull: { agentIds: agentId } }
    );
  }

  async getServerAgents(serverId: UUID): Promise<UUID[]> {
    const doc = await MessageServer.findOne({ serverId }).lean();
    return (doc?.agentIds as UUID[]) || [];
  }

  // Alias for getServerAgents - used by MessagesRouter
  async getAgentsForServer(serverId: UUID): Promise<UUID[]> {
    return this.getServerAgents(serverId);
  }

  async getChannelsForServer(serverId: UUID): Promise<MessageChannelType[]> {
    const docs = await MessageChannel.find({ messageServerId: serverId }).lean();
    return docs.map(doc => ({
      id: doc.channelId as UUID,
      messageServerId: doc.messageServerId as UUID,
      name: doc.name,
      type: doc.type,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      topic: doc.topic,
      participantIds: (doc.participantIds || []) as UUID[],
      metadata: (doc.metadata || {}) as Record<string, unknown>,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }

  async createChannel(
    data: {
      id?: UUID;
      messageServerId: UUID;
      name: string;
      type: string;
      sourceType?: string;
      sourceId?: string;
      topic?: string;
      metadata?: Record<string, unknown>;
    },
    participantIds?: UUID[]
  ): Promise<MessageChannelType> {
    const channelId = data.id || (uuidv4() as UUID);
    const doc = await MessageChannel.create({
      channelId,
      messageServerId: data.messageServerId,
      name: data.name,
      type: data.type,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      topic: data.topic,
      metadata: data.metadata || {},
      participantIds: participantIds || [],
    });
    return {
      id: doc.channelId as UUID,
      messageServerId: doc.messageServerId as UUID,
      name: doc.name,
      type: doc.type,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      topic: doc.topic,
      participantIds: doc.participantIds as UUID[],
      metadata: doc.metadata as Record<string, unknown>,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async addChannelParticipants(channelId: UUID, userIds: UUID[]): Promise<void> {
    await MessageChannel.updateOne(
      { channelId },
      { $addToSet: { participantIds: { $each: userIds } } }
    );
  }

  async getChannelsForMessageServer(messageServerId: UUID): Promise<MessageChannelType[]> {
    const docs = await MessageChannel.find({ messageServerId }).lean();
    return docs.map((doc) => ({
      id: doc.channelId as UUID,
      messageServerId: doc.messageServerId as UUID,
      name: doc.name,
      type: doc.type,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      topic: doc.topic,
      participantIds: doc.participantIds as UUID[],
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }

  async getChannelDetails(channelId: UUID): Promise<MessageChannelType | null> {
    const doc = await MessageChannel.findOne({ channelId }).lean();
    if (!doc) return null;
    return {
      id: doc.channelId as UUID,
      messageServerId: doc.messageServerId as UUID,
      name: doc.name,
      type: doc.type,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      topic: doc.topic,
      participantIds: doc.participantIds as UUID[],
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async getChannelParticipants(channelId: UUID): Promise<UUID[]> {
    const doc = await MessageChannel.findOne({ channelId }).lean();
    return (doc?.participantIds || []) as UUID[];
  }

  async isChannelParticipant(channelId: UUID, entityId: UUID): Promise<boolean> {
    const doc = await MessageChannel.findOne({
      channelId,
      participantIds: entityId,
    }).lean();
    return !!doc;
  }

  async deleteMessage(messageId: UUID): Promise<void> {
    await CentralMessage.deleteOne({ messageId });
  }

  async updateChannel(
    channelId: UUID,
    updates: {
      name?: string;
      participantCentralUserIds?: UUID[];
      metadata?: Record<string, unknown>;
    }
  ): Promise<MessageChannelType> {
    const updateObj: Record<string, unknown> = {};
    if (updates.name) updateObj.name = updates.name;
    if (updates.participantCentralUserIds) updateObj.participantIds = updates.participantCentralUserIds;
    if (updates.metadata) updateObj.metadata = updates.metadata;

    await MessageChannel.updateOne({ channelId }, { $set: updateObj });
    const doc = await MessageChannel.findOne({ channelId }).lean();
    if (!doc) throw new Error(`Channel ${channelId} not found`);
    
    return {
      id: doc.channelId as UUID,
      messageServerId: doc.messageServerId as UUID,
      name: doc.name,
      type: doc.type,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      topic: doc.topic,
      participantIds: doc.participantIds as UUID[],
      metadata: (doc.metadata as Record<string, unknown>) || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async deleteChannel(channelId: UUID): Promise<void> {
    await MessageChannel.deleteOne({ channelId });
    await CentralMessage.deleteMany({ channelId });
  }

  async getMessagesForChannel(
    channelId: UUID,
    limit?: number,
    beforeTimestamp?: Date
  ): Promise<CentralMessageType[]> {
    const query: Record<string, unknown> = { channelId };
    if (beforeTimestamp) {
      query.createdAt = { $lt: beforeTimestamp };
    }

    const docs = await CentralMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit || 50)
      .lean();

    return docs.map((doc) => ({
      id: doc.messageId as UUID,
      channelId: doc.channelId as UUID,
      authorId: doc.authorId as UUID,
      content: doc.content,
      rawMessage: doc.rawMessage as Record<string, unknown>,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      inReplyToRootMessageId: doc.inReplyToRootMessageId as UUID | undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }

  async findOrCreateDmChannel(
    user1Id: UUID,
    user2Id: UUID,
    messageServerId: UUID
  ): Promise<MessageChannelType> {
    // Check for existing DM channel between these two users
    const existingChannel = await MessageChannel.findOne({
      messageServerId,
      type: 'dm',
      participantIds: { $all: [user1Id, user2Id], $size: 2 },
    }).lean();

    if (existingChannel) {
      return {
        id: existingChannel.channelId as UUID,
        messageServerId: existingChannel.messageServerId as UUID,
        name: existingChannel.name,
        type: existingChannel.type,
        sourceType: existingChannel.sourceType,
        sourceId: existingChannel.sourceId,
        topic: existingChannel.topic,
        participantIds: existingChannel.participantIds as UUID[],
        metadata: (existingChannel.metadata as Record<string, unknown>) || {},
        createdAt: existingChannel.createdAt,
        updatedAt: existingChannel.updatedAt,
      };
    }

    // Create new DM channel
    return this.createChannel(
      {
        messageServerId,
        name: `DM-${user1Id.slice(0, 8)}-${user2Id.slice(0, 8)}`,
        type: 'dm',
      },
      [user1Id, user2Id]
    );
  }

  async createMessage(data: {
    messageId?: UUID;
    channelId: UUID;
    authorId: UUID;
    content: string;
    rawMessage?: Record<string, unknown>;
    sourceType?: string;
    sourceId?: string;
    metadata?: Record<string, unknown>;
    inReplyToRootMessageId?: UUID;
  }): Promise<CentralMessageType> {
    const messageId = data.messageId || (uuidv4() as UUID);
    const doc = await CentralMessage.create({
      messageId,
      channelId: data.channelId,
      authorId: data.authorId,
      content: data.content,
      rawMessage: data.rawMessage,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      metadata: data.metadata || {},
      inReplyToRootMessageId: data.inReplyToRootMessageId,
    });
    return {
      id: doc.messageId as UUID,
      channelId: doc.channelId as UUID,
      authorId: doc.authorId as UUID,
      content: doc.content,
      rawMessage: doc.rawMessage as Record<string, unknown>,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      metadata: doc.metadata as Record<string, unknown>,
      inReplyToRootMessageId: doc.inReplyToRootMessageId as UUID | undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async updateMessage(
    messageId: UUID,
    patch: {
      content?: string;
      rawMessage?: Record<string, unknown>;
      sourceType?: string;
      sourceId?: string;
      metadata?: Record<string, unknown>;
      inReplyToRootMessageId?: UUID;
    }
  ): Promise<CentralMessageType | null> {
    await CentralMessage.updateOne({ messageId }, { $set: patch });
    const doc = await CentralMessage.findOne({ messageId }).lean();
    if (!doc) return null;
    return {
      id: doc.messageId as UUID,
      channelId: doc.channelId as UUID,
      authorId: doc.authorId as UUID,
      content: doc.content,
      rawMessage: doc.rawMessage as Record<string, unknown>,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      metadata: (doc.metadata as Record<string, unknown>) || {},
      inReplyToRootMessageId: doc.inReplyToRootMessageId as UUID | undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async addAgentToMessageServer(messageServerId: UUID, agentId: UUID): Promise<void> {
    await MessageServer.updateOne(
      { serverId: messageServerId },
      { $addToSet: { agentIds: agentId } }
    );
  }

  async removeAgentFromMessageServer(messageServerId: UUID, agentId: UUID): Promise<void> {
    await MessageServer.updateOne(
      { serverId: messageServerId },
      { $pull: { agentIds: agentId } }
    );
  }

  async getAgentsForMessageServer(messageServerId: UUID): Promise<UUID[]> {
    const doc = await MessageServer.findOne({ serverId: messageServerId }).lean();
    return (doc?.agentIds || []) as UUID[];
  }

  // Drizzle compatibility method (no-op for MongoDB)
  getDatabase(): unknown {
    return this.db;
  }

  // SQL compatibility - provides an execute method for drizzle-style queries
  get drizzleDb(): { execute: (query: unknown) => Promise<unknown> } {
    return {
      execute: async () => {
        console.warn('[MongoDB] drizzleDb.execute called - this is a SQL compatibility stub');
        return [];
      },
    };
  }
}

// Type definitions for messaging
interface MessageServerType {
  id: UUID;
  name: string;
  sourceType: string;
  sourceId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageChannelType {
  id: UUID;
  messageServerId: UUID;
  name: string;
  type: string;
  sourceType?: string;
  sourceId?: string;
  topic?: string;
  participantIds: UUID[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface CentralMessageType {
  id: UUID;
  channelId: UUID;
  authorId: UUID;
  content: string;
  rawMessage?: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
  metadata: Record<string, unknown>;
  inReplyToRootMessageId?: UUID;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Factory function to create a MongoDB adapter
 */
export function createMongoDBAdapter(agentId: string): MongoDBDatabaseAdapter {
  return new MongoDBDatabaseAdapter(agentId);
}
