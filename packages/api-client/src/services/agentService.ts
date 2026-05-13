/**
 * Agent Service Stub
 * Provides compatibility with CLI commands that expect AgentsService
 */

export class AgentsService {
  private baseUrl: string;
  
  constructor(config: { baseUrl?: string } = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:3000';
  }
  
  async getAgents() {
    const response = await fetch(`${this.baseUrl}/api/agents`);
    return response.json();
  }
  
  async getAgent(agentId: string) {
    const response = await fetch(`${this.baseUrl}/api/agents/${agentId}`);
    return response.json();
  }
  
  async startAgent(agentId: string) {
    const response = await fetch(`${this.baseUrl}/api/agents/${agentId}/start`, {
      method: 'POST',
    });
    return response.json();
  }
  
  async stopAgent(agentId: string) {
    const response = await fetch(`${this.baseUrl}/api/agents/${agentId}/stop`, {
      method: 'POST',
    });
    return response.json();
  }
  
  async deleteAgent(agentId: string) {
    const response = await fetch(`${this.baseUrl}/api/agents/${agentId}`, {
      method: 'DELETE',
    });
    return response.json();
  }
}

export class MemoryService {
  private baseUrl: string;
  
  constructor(config: { baseUrl?: string } = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:3000';
  }
  
  async getMemories(agentId: string, params?: { roomId?: string; count?: number }) {
    const url = new URL(`${this.baseUrl}/api/agents/${agentId}/memories`);
    if (params?.roomId) url.searchParams.set('roomId', params.roomId);
    if (params?.count) url.searchParams.set('count', String(params.count));
    const response = await fetch(url.toString());
    return response.json();
  }
  
  async deleteMemory(agentId: string, memoryId: string) {
    const response = await fetch(`${this.baseUrl}/api/agents/${agentId}/memories/${memoryId}`, {
      method: 'DELETE',
    });
    return response.json();
  }
}
