import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * MongoDB Models for ElizaOS
 * These models store ElizaOS data in MongoDB instead of PGLite
 */

// Agent Model
export interface IElizaAgent extends Document {
  agentId: string; // UUID
  name: string;
  username?: string;
  system?: string;
  bio: string[];
  enabled: boolean;
  status: 'active' | 'inactive';
  settings?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  character?: Record<string, unknown>; // Full character JSON for restoration
  createdAt: Date;
  updatedAt: Date;
}

const ElizaAgentSchema = new Schema<IElizaAgent>(
  {
    agentId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    username: String,
    system: String,
    bio: [String],
    enabled: { type: Boolean, default: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    settings: Schema.Types.Mixed,
    secrets: Schema.Types.Mixed,
    character: Schema.Types.Mixed, // Full character JSON for restoration
  },
  { timestamps: true }
);

// Entity Model
export interface IElizaEntity extends Document {
  entityId: string; // UUID
  agentId: string;
  names: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ElizaEntitySchema = new Schema<IElizaEntity>(
  {
    entityId: { type: String, required: true, unique: true, index: true },
    agentId: { type: String, required: true, index: true },
    names: [String],
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

// Component Model
export interface IElizaComponent extends Document {
  componentId: string; // UUID
  entityId: string;
  agentId: string;
  roomId: string;
  worldId: string;
  sourceEntityId: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

const ElizaComponentSchema = new Schema<IElizaComponent>(
  {
    componentId: { type: String, required: true, unique: true, index: true },
    entityId: { type: String, required: true, index: true },
    agentId: { type: String, index: true },
    roomId: { type: String },
    worldId: { type: String },
    sourceEntityId: { type: String },
    type: { type: String, required: true, index: true },
    data: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ElizaComponentSchema.index({ entityId: 1, type: 1 });

// Memory Model
export interface IElizaMemory extends Document {
  memoryId: string; // UUID
  entityId: string;
  agentId?: string;
  roomId: string;
  worldId?: string;
  tableName: string;
  content: {
    text?: string;
    source?: string;
    [key: string]: unknown;
  };
  embedding?: number[];
  unique: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const ElizaMemorySchema = new Schema<IElizaMemory>(
  {
    memoryId: { type: String, required: true, unique: true, index: true },
    entityId: { type: String, required: true, index: true },
    agentId: { type: String, index: true },
    roomId: { type: String, required: true, index: true },
    worldId: { type: String, index: true },
    tableName: { type: String, required: true, index: true },
    content: {
      text: String,
      source: String,
    },
    embedding: [Number],
    unique: { type: Boolean, default: false },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ElizaMemorySchema.index({ roomId: 1, tableName: 1, createdAt: -1 });
ElizaMemorySchema.index({ entityId: 1, tableName: 1, createdAt: -1 });

// World Model
export interface IElizaWorld extends Document {
  worldId: string; // UUID
  agentId: string;
  name: string;
  serverId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ElizaWorldSchema = new Schema<IElizaWorld>(
  {
    worldId: { type: String, required: true, unique: true, index: true },
    agentId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    serverId: String,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

// Room Model
export interface IElizaRoom extends Document {
  roomId: string; // UUID
  agentId?: string;
  worldId?: string;
  name?: string;
  source?: string;
  type?: string;
  channelId?: string;
  serverId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ElizaRoomSchema = new Schema<IElizaRoom>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    agentId: { type: String, index: true },
    worldId: { type: String, index: true },
    name: String,
    source: String,
    type: String,
    channelId: String,
    serverId: String,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

// Participant Model
export interface IElizaParticipant extends Document {
  participantId: string; // UUID
  entityId: string;
  roomId: string;
  userState?: 'FOLLOWED' | 'MUTED' | null;
  lastActiveAt?: Date;
  createdAt: Date;
}

const ElizaParticipantSchema = new Schema<IElizaParticipant>(
  {
    participantId: { type: String, required: true, unique: true, index: true },
    entityId: { type: String, required: true, index: true },
    roomId: { type: String, required: true, index: true },
    userState: { type: String, enum: ['FOLLOWED', 'MUTED', null], default: null },
    lastActiveAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ElizaParticipantSchema.index({ entityId: 1, roomId: 1 }, { unique: true });

// Relationship Model
export interface IElizaRelationship extends Document {
  relationshipId: string; // UUID
  sourceEntityId: string;
  targetEntityId: string;
  agentId: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ElizaRelationshipSchema = new Schema<IElizaRelationship>(
  {
    relationshipId: { type: String, required: true, unique: true, index: true },
    sourceEntityId: { type: String, required: true, index: true },
    targetEntityId: { type: String, required: true, index: true },
    agentId: { type: String, required: true, index: true },
    tags: [String],
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

ElizaRelationshipSchema.index({ sourceEntityId: 1, targetEntityId: 1 }, { unique: true });

// Task Model
export interface IElizaTask extends Document {
  taskId: string; // UUID
  name: string;
  description: string;
  roomId?: string;
  worldId?: string;
  entityId?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  updatedAt: Date;
  createdAt: Date;
}

const ElizaTaskSchema = new Schema<IElizaTask>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    description: String,
    roomId: { type: String, index: true },
    worldId: String,
    entityId: { type: String, index: true },
    tags: [String],
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

ElizaTaskSchema.index({ roomId: 1, tags: 1 });

// Log Model
export interface IElizaLog extends Document {
  logId: string; // UUID
  entityId: string;
  roomId: string;
  agentId: string;
  type: string;
  body: Record<string, unknown>;
  createdAt: Date;
}

const ElizaLogSchema = new Schema<IElizaLog>(
  {
    logId: { type: String, required: true, unique: true, index: true },
    entityId: { type: String, required: true, index: true },
    roomId: { type: String, required: true, index: true },
    agentId: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    body: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Cache Model
export interface IElizaCache extends Document {
  agentId: string;
  key: string;
  value: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ElizaCacheSchema = new Schema<IElizaCache>(
  {
    agentId: { type: String, required: true, index: true },
    key: { type: String, required: true, index: true },
    value: { type: String, required: true },
    expiresAt: Date,
  },
  { timestamps: true }
);

ElizaCacheSchema.index({ agentId: 1, key: 1 }, { unique: true });
// TTL index for cache expiration
ElizaCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// AgentRun Model - for tracking agent conversation runs
// Uses ElizaOS RunStatus type: 'started' | 'completed' | 'timeout' | 'error'
export interface IElizaAgentRun extends Document {
  runId: string; // UUID
  agentId: string;
  entityId?: string;
  roomId?: string;
  messageId?: string;
  status: 'started' | 'completed' | 'timeout' | 'error';
  startedAt: Date;
  endedAt?: Date;
  counts?: {
    actions: number;
    modelCalls: number;
    errors: number;
    evaluators: number;
  };
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ElizaAgentRunSchema = new Schema<IElizaAgentRun>(
  {
    runId: { type: String, required: true, unique: true, index: true },
    agentId: { type: String, required: true, index: true },
    entityId: { type: String, index: true },
    roomId: { type: String, index: true },
    messageId: { type: String, index: true },
    status: {
      type: String,
      enum: ['started', 'completed', 'timeout', 'error'],
      default: 'started',
      index: true,
    },
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: Date,
    counts: {
      actions: { type: Number, default: 0 },
      modelCalls: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
      evaluators: { type: Number, default: 0 },
    },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

ElizaAgentRunSchema.index({ agentId: 1, status: 1, startedAt: -1 });
ElizaAgentRunSchema.index({ roomId: 1, startedAt: -1 });
ElizaAgentRunSchema.index({ entityId: 1, startedAt: -1 });

// Export models
export const ElizaAgent: Model<IElizaAgent> =
  mongoose.models.ElizaAgent || mongoose.model<IElizaAgent>('ElizaAgent', ElizaAgentSchema);

export const ElizaEntity: Model<IElizaEntity> =
  mongoose.models.ElizaEntity || mongoose.model<IElizaEntity>('ElizaEntity', ElizaEntitySchema);

export const ElizaComponent: Model<IElizaComponent> =
  mongoose.models.ElizaComponent || mongoose.model<IElizaComponent>('ElizaComponent', ElizaComponentSchema);

export const ElizaMemory: Model<IElizaMemory> =
  mongoose.models.ElizaMemory || mongoose.model<IElizaMemory>('ElizaMemory', ElizaMemorySchema);

export const ElizaWorld: Model<IElizaWorld> =
  mongoose.models.ElizaWorld || mongoose.model<IElizaWorld>('ElizaWorld', ElizaWorldSchema);

export const ElizaRoom: Model<IElizaRoom> =
  mongoose.models.ElizaRoom || mongoose.model<IElizaRoom>('ElizaRoom', ElizaRoomSchema);

export const ElizaParticipant: Model<IElizaParticipant> =
  mongoose.models.ElizaParticipant || mongoose.model<IElizaParticipant>('ElizaParticipant', ElizaParticipantSchema);

export const ElizaRelationship: Model<IElizaRelationship> =
  mongoose.models.ElizaRelationship || mongoose.model<IElizaRelationship>('ElizaRelationship', ElizaRelationshipSchema);

export const ElizaTask: Model<IElizaTask> =
  mongoose.models.ElizaTask || mongoose.model<IElizaTask>('ElizaTask', ElizaTaskSchema);

export const ElizaLog: Model<IElizaLog> =
  mongoose.models.ElizaLog || mongoose.model<IElizaLog>('ElizaLog', ElizaLogSchema);

export const ElizaCache: Model<IElizaCache> =
  mongoose.models.ElizaCache || mongoose.model<IElizaCache>('ElizaCache', ElizaCacheSchema);

export const ElizaAgentRun: Model<IElizaAgentRun> =
  mongoose.models.ElizaAgentRun || mongoose.model<IElizaAgentRun>('ElizaAgentRun', ElizaAgentRunSchema);

// ===== Messaging Models (for server operations) =====

// Message Server Model (Discord/Telegram servers, etc.)
export interface IMessageServer extends Document {
  serverId: string; // UUID
  name: string;
  sourceType: string; // 'discord', 'telegram', 'elizaos', etc.
  sourceId?: string;
  rlsServerId?: string;
  metadata: Record<string, unknown>;
  agentIds: string[]; // UUIDs of agents in this server
  createdAt: Date;
  updatedAt: Date;
}

const MessageServerSchema = new Schema<IMessageServer>(
  {
    serverId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    sourceType: { type: String, required: true },
    sourceId: String,
    rlsServerId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    agentIds: [{ type: String, index: true }],
  },
  { timestamps: true }
);

MessageServerSchema.index({ sourceType: 1, sourceId: 1 });

// Message Channel Model
export interface IMessageChannel extends Document {
  channelId: string; // UUID
  messageServerId: string; // UUID
  name: string;
  type: string; // 'text', 'dm', 'group', etc.
  sourceType?: string;
  sourceId?: string;
  topic?: string;
  participantIds: string[]; // UUIDs
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const MessageChannelSchema = new Schema<IMessageChannel>(
  {
    channelId: { type: String, required: true, unique: true, index: true },
    messageServerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    sourceType: String,
    sourceId: String,
    topic: String,
    participantIds: [{ type: String, index: true }],
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

MessageChannelSchema.index({ messageServerId: 1, type: 1 });

// Central Message Model (for messaging infrastructure)
export interface ICentralMessage extends Document {
  messageId: string; // UUID
  channelId: string; // UUID
  authorId: string; // UUID
  content: string;
  rawMessage?: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
  metadata: Record<string, unknown>;
  inReplyToRootMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CentralMessageSchema = new Schema<ICentralMessage>(
  {
    messageId: { type: String, required: true, unique: true, index: true },
    channelId: { type: String, required: true, index: true },
    authorId: { type: String, required: true, index: true },
    content: { type: String, required: true },
    rawMessage: Schema.Types.Mixed,
    sourceType: String,
    sourceId: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
    inReplyToRootMessageId: String,
  },
  { timestamps: true }
);

CentralMessageSchema.index({ channelId: 1, createdAt: -1 });

// Export messaging models
export const MessageServer: Model<IMessageServer> =
  mongoose.models.MessageServer || mongoose.model<IMessageServer>('MessageServer', MessageServerSchema);

export const MessageChannel: Model<IMessageChannel> =
  mongoose.models.MessageChannel || mongoose.model<IMessageChannel>('MessageChannel', MessageChannelSchema);

export const CentralMessage: Model<ICentralMessage> =
  mongoose.models.CentralMessage || mongoose.model<ICentralMessage>('CentralMessage', CentralMessageSchema);

