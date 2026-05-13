/**
 * Compatibility Types for ElizaOS Client
 * These types provide backward compatibility with the client package
 */

// UUID type definition (avoid importing from @elizaos/core)
type UUID = `${string}-${string}-${string}-${string}-${string}`;

// Run-related types
export interface RunDetail {
  id: string;
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface RunSummary {
  id: string;
  agentId: string;
  status: string;
  startedAt?: Date;
}

export interface ListRunsParams {
  agentId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

// Metadata types
export interface ServerMetadata {
  [key: string]: unknown;
}

export interface ChannelMetadata {
  [key: string]: unknown;
}

export interface MessageMetadata {
  senderName?: string;
  agentName?: string;
  [key: string]: unknown;
}

// Entity types
export interface AgentLog {
  id: string;
  agentId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface MessageChannel {
  id: UUID;
  messageServerId: UUID;
  name: string;
  type: string;
  sourceType?: string;
  sourceId?: string;
  topic?: string;
  metadata?: ChannelMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageServer {
  id: UUID;
  name: string;
  sourceType: string;
  sourceId?: string;
  metadata?: ServerMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface Memory {
  id: UUID;
  agentId: UUID;
  entityId?: UUID;
  roomId?: UUID;
  content: {
    text?: string;
    [key: string]: unknown;
  };
  embedding?: number[];
  createdAt: Date;
  unique?: boolean;
  metadata?: Record<string, unknown>;
}

// Extended Agent type with updatedAt
export interface AgentWithTimestamps {
  id: string;
  name: string;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: Record<string, unknown>;
}

// Extended Message type with additional fields
export interface MessageWithMetadata {
  id: string;
  content: string;
  channelId?: string;
  authorId?: string;
  sourceType?: string;
  rawMessage?: unknown;
  metadata?: MessageMetadata;
  createdAt: Date;
}
