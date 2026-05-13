import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

type HeirConfig = {
  apiKey?: string;
  apiBaseUrl: string;
  appBaseUrl: string;
  rulesPath?: string;
  defaultJurisdiction?: string;
  skipCreditCheck?: boolean;
};

/**
 * Swarm operation types that consume credits
 */
type SwarmOperation =
  | 'swarm_message'
  | 'swarm_delegation'
  | 'contract_generate'
  | 'legal_document'
  | 'distribution_calculate'
  | 'jurisdiction_lookup'
  | 'advisor_match'
  | 'swarm_session';

const configSchema = z.object({
  HEIR_API_KEY: z.string().optional(),
  HEIR_API_BASE_URL: z.string().default('https://api.heir.es'),
  HEIR_APP_BASE_URL: z.string().default('https://api.heir.es'),
  HEIR_RULES_PATH: z.string().optional(),
  HEIR_DEFAULT_JURISDICTION: z.string().optional(),
  HEIR_SKIP_CREDIT_CHECK: z.string().optional(), // 'true' to skip credit checks (dev mode)
});

class HeirApiClient {
  constructor(private config: HeirConfig) {}

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.config.apiBaseUrl}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `HTTP ${response.status}`);
    }
    return data;
  }

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.config.apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `HTTP ${response.status}`);
    }
    return data;
  }

  /**
   * Check if user has sufficient credits for an operation
   */
  async checkCredits(operation: SwarmOperation, params?: Record<string, unknown>): Promise<{
    allowed: boolean;
    requiredCredits: number;
    currentBalance: number;
    unlimited: boolean;
    shortfall: number;
  }> {
    if (this.config.skipCreditCheck) {
      return { allowed: true, requiredCredits: 0, currentBalance: -1, unlimited: true, shortfall: 0 };
    }
    
    const response = await this.post<any>('/api/swarm/credits/check', { operation, params });
    return response?.data || response;
  }

  /**
   * Deduct credits for an operation
   */
  async deductCredits(operation: SwarmOperation, params?: Record<string, unknown>): Promise<{
    success: boolean;
    creditsUsed: number;
    newBalance: number;
  }> {
    if (this.config.skipCreditCheck) {
      return { success: true, creditsUsed: 0, newBalance: -1 };
    }
    
    const response = await this.post<any>('/api/swarm/credits/deduct', { operation, params });
    return response?.data || response;
  }
}

const buildConfig = (runtime: IAgentRuntime): HeirConfig => {
  const skipCreditCheck = 
    runtime.getSetting('HEIR_SKIP_CREDIT_CHECK') === 'true' ||
    process.env.HEIR_SKIP_CREDIT_CHECK === 'true' ||
    process.env.NODE_ENV === 'development';

  return {
    apiKey: runtime.getSetting('HEIR_API_KEY') || process.env.HEIR_API_KEY,
    apiBaseUrl:
      runtime.getSetting('HEIR_API_BASE_URL') ||
      process.env.HEIR_API_BASE_URL ||
      'https://api.heir.es',
    appBaseUrl:
      runtime.getSetting('HEIR_APP_BASE_URL') ||
      process.env.HEIR_APP_BASE_URL ||
      'https://api.heir.es',
    rulesPath: runtime.getSetting('HEIR_RULES_PATH') || process.env.HEIR_RULES_PATH,
    defaultJurisdiction:
      runtime.getSetting('HEIR_DEFAULT_JURISDICTION') ||
      process.env.HEIR_DEFAULT_JURISDICTION,
    skipCreditCheck,
  };
};

const extractActionInput = (message: Memory, state?: State, options?: Record<string, unknown>) => {
  const dataInput = message.content?.data?.input;
  if (dataInput && typeof dataInput === 'object') {
    return dataInput;
  }
  const stateInput = state?.values?.actionInput;
  if (stateInput && typeof stateInput === 'object') {
    return stateInput;
  }
  if (options && typeof options.input === 'object') {
    return options.input;
  }
  const text = message.content?.text?.trim();
  if (text && (text.startsWith('{') || text.startsWith('['))) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON input: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {};
};

const createHeirAction = ({
  name,
  description,
  method,
  endpoint,
  requiresApiKey = false,
  responseMapper,
  creditOperation,
}: {
  name: string;
  description: string;
  method: 'GET' | 'POST';
  endpoint: (input: Record<string, unknown>) => string;
  requiresApiKey?: boolean;
  responseMapper?: (response: any) => any;
  /** Swarm operation type for credit charging. If omitted, no credits charged. */
  creditOperation?: SwarmOperation;
}): Action => {
  return {
    name,
    description,
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State | undefined,
      options: Record<string, unknown> | undefined,
      callback?: HandlerCallback
    ): Promise<ActionResult> => {
      try {
        const config = buildConfig(runtime);
        if (requiresApiKey && !config.apiKey) {
          throw new Error('HEIR_API_KEY is required for this action.');
        }

        const input = extractActionInput(message, state, options);
        const client = new HeirApiClient(config);

        // Check and deduct credits if operation requires them
        if (creditOperation) {
          const creditCheck = await client.checkCredits(creditOperation, {
            agentName: state?.values?.agentName || name,
            sessionId: message.roomId,
          });
          
          if (!creditCheck.allowed) {
            const errorMsg = `Insufficient swarm credits. Need ${creditCheck.requiredCredits} credits, have ${creditCheck.currentBalance}. Purchase more at https://heir.es/swarm?modal=purchase`;
            
            if (callback) {
              await callback({
                text: errorMsg,
                actions: [name],
                source: message.content?.source,
              });
            }
            
            return {
              success: false,
              error: new Error(errorMsg),
              data: {
                code: 'INSUFFICIENT_CREDITS',
                requiredCredits: creditCheck.requiredCredits,
                currentBalance: creditCheck.currentBalance,
                shortfall: creditCheck.shortfall,
                purchaseUrl: 'https://heir.es/swarm?modal=purchase',
              },
            };
          }

          // Deduct credits for the operation
          await client.deductCredits(creditOperation, {
            agentName: state?.values?.agentName || name,
            sessionId: message.roomId,
            details: { actionName: name },
          });
        }

        const url = endpoint(input);
        const response =
          method === 'GET' ? await client.get(url) : await client.post(url, input);
        const mapped = responseMapper ? responseMapper(response) : response;

        if (callback) {
          await callback({
            text: JSON.stringify(mapped, null, 2),
            actions: [name],
            source: message.content?.source,
          });
        }

        return {
          success: true,
          text: 'HEIR action completed.',
          data: {
            actionName: name,
            response: mapped,
            creditOperation,
          },
        };
      } catch (error) {
        logger.error({ error }, `HEIR action failed: ${name}`);
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
  };
};

const resolveRulesPath = (config: HeirConfig) => {
  if (config.rulesPath) {
    return config.rulesPath;
  }
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, 'heirtypes', 'rules.md'),
    path.resolve(cwd, '..', 'heirtypes', 'rules.md'),
    path.resolve(cwd, '..', '..', 'heirtypes', 'rules.md'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
};

const jurisdictionProvider: Provider = {
  name: 'HEIR_JURISDICTION',
  description: 'Current jurisdiction context for inheritance planning',
  get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
    const config = buildConfig(runtime);
    const jurisdiction =
      message.content?.data?.jurisdiction ||
      state?.values?.jurisdiction ||
      config.defaultJurisdiction ||
      'unspecified';
    const text = `Jurisdiction context: ${jurisdiction}`;
    return {
      text,
      values: { jurisdiction },
      data: { jurisdiction },
    };
  },
};

const inheritanceRulesProvider: Provider = {
  name: 'HEIR_INHERITANCE_RULES',
  description: 'Inheritance rules reference from heirtypes',
  get: async (runtime: IAgentRuntime): Promise<ProviderResult> => {
    try {
      const config = buildConfig(runtime);
      const rulesPath = resolveRulesPath(config);
      if (!rulesPath) {
        return {
          text: 'Inheritance rules not found. Set HEIR_RULES_PATH to load local rules.',
          values: { inheritanceRulesAvailable: false },
          data: { rulesPath: null },
        };
      }
      const raw = fs.readFileSync(rulesPath, 'utf-8');
      const headings = raw
        .split('\n')
        .filter((line) => line.startsWith('## '))
        .map((line) => line.replace('## ', '').trim())
        .slice(0, 15);
      const text = `Inheritance frameworks available: ${headings.join(', ')}.`;
      return {
        text,
        values: { inheritanceRulesAvailable: true, inheritanceFrameworks: headings },
        data: { rulesPath, headings },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to load inheritance rules');
      return {
        text: 'Inheritance rules could not be loaded.',
        values: { inheritanceRulesAvailable: false },
        data: {},
      };
    }
  },
};

const userAssetsProvider: Provider = {
  name: 'HEIR_USER_ASSETS',
  description: 'Summarized vault and asset data from HEIR',
  get: async (runtime: IAgentRuntime): Promise<ProviderResult> => {
    try {
      const config = buildConfig(runtime);
      if (!config.apiKey) {
        return {
          text: 'HEIR_API_KEY not set. Vault data unavailable.',
          values: { hasVaultAccess: false },
          data: {},
        };
      }
      const client = new HeirApiClient(config);
      const response = await client.get('/api/v1/user/vaults?limit=5');
      const vaults = response?.data?.vaults || response?.vaults || [];
      const text = `Vault summary: ${vaults.length} vault(s) available.`;
      return {
        text,
        values: { hasVaultAccess: true, vaultCount: vaults.length },
        data: { vaults },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to load vaults');
      return {
        text: 'Vault data unavailable due to an error.',
        values: { hasVaultAccess: false },
        data: {},
      };
    }
  },
};

const advisorDirectoryProvider: Provider = {
  name: 'HEIR_ADVISOR_DIRECTORY',
  description: 'Professional types and legal systems for advisor matching',
  get: async (runtime: IAgentRuntime): Promise<ProviderResult> => {
    try {
      const config = buildConfig(runtime);
      const [typesResponse, legalResponse] = await Promise.all([
        fetch(`${config.appBaseUrl}/api/advisors/professional-types`).then((res) => res.json()),
        fetch(`${config.appBaseUrl}/api/advisors/legal-systems`).then((res) => res.json()),
      ]);
      const professionalTypes = typesResponse?.professionalTypes || [];
      const legalSystems = legalResponse?.legalSystems || {};
      return {
        text: `Advisor directory loaded: ${professionalTypes.length} professional types.`,
        values: { professionalTypes, legalSystems },
        data: { professionalTypes, legalSystems },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to load advisor directory data');
      return {
        text: 'Advisor directory data unavailable.',
        values: {},
        data: {},
      };
    }
  },
};

/**
 * Provider that exposes user's current swarm credit balance
 * so agents can be cost-aware in their recommendations
 */
const swarmCreditsProvider: Provider = {
  name: 'HEIR_SWARM_CREDITS',
  description: 'Current swarm credit balance and pricing info',
  get: async (runtime: IAgentRuntime): Promise<ProviderResult> => {
    const config = buildConfig(runtime);
    
    // If no API key, can't check credits
    if (!config.apiKey) {
      return {
        text: 'Swarm credit status unavailable (no API key).',
        values: { 
          creditBalance: 0,
          unlimited: false,
          hasCredits: false,
        },
        data: {},
      };
    }

    try {
      const client = new HeirApiClient(config);
      const walletResponse = await client.get<any>('/api/swarm/credits/wallet');
      const wallet = walletResponse?.data || walletResponse;
      
      const balance = wallet?.balance ?? 0;
      const unlimited = balance === -1;
      const sessionsRemaining = unlimited ? 'unlimited' : Math.floor(balance / 10);
      
      const text = unlimited 
        ? 'Swarm credits: Unlimited subscription active.'
        : `Swarm credits: ${balance} credits (~${sessionsRemaining} sessions remaining).`;
      
      return {
        text,
        values: {
          creditBalance: balance,
          unlimited,
          hasCredits: unlimited || balance > 0,
          estimatedSessions: sessionsRemaining,
        },
        data: wallet,
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch swarm credit status');
      return {
        text: 'Swarm credit status unavailable.',
        values: { 
          creditBalance: 0,
          unlimited: false,
          hasCredits: false,
        },
        data: {},
      };
    }
  },
};

/**
 * Swarm agent registry for the Law Firm visualization
 */
const SWARM_AGENTS = [
  // Row A - Leadership & Legal
  { id: 'lead_wealth_advisor', name: 'Lead Wealth Advisor', role: 'orchestrator', office: 'A1' },
  { id: 'estate_attorney', name: 'Estate Planning Attorney', role: 'specialist', office: 'A2' },
  { id: 'tax_specialist', name: 'Tax Specialist', role: 'specialist', office: 'A3' },
  { id: 'trust_officer', name: 'Trust Officer', role: 'specialist', office: 'A4' },
  // Row B - Wealth & Business
  { id: 'wealth_manager', name: 'Wealth Manager', role: 'specialist', office: 'B1' },
  { id: 'portfolio_manager', name: 'Portfolio Manager', role: 'specialist', office: 'B2' },
  { id: 'family_wealth_strategist', name: 'Family Wealth Strategist', role: 'specialist', office: 'B3' },
  { id: 'business_succession_planner', name: 'Business Succession Planner', role: 'specialist', office: 'B4' },
  // Row C - Specialized Services
  { id: 'philanthropy_advisor', name: 'Philanthropy Advisor', role: 'specialist', office: 'C1' },
  { id: 'private_banker', name: 'Private Banker', role: 'specialist', office: 'C2' },
  { id: 'digital_assets_specialist', name: 'Digital Assets Specialist', role: 'specialist', office: 'C3' },
  { id: 'cross_border_specialist', name: 'Cross-Border Specialist', role: 'specialist', office: 'C4' },
  // Row D - Asset Specialists & Secular
  { id: 'insurance_specialist', name: 'Insurance Specialist', role: 'specialist', office: 'D1' },
  { id: 'real_estate_specialist', name: 'Real Estate Specialist', role: 'specialist', office: 'D2' },
  { id: 'secular_advisor', name: 'Secular Law Advisor', role: 'faith_specialist', office: 'D3' },
  { id: 'christian_advisor', name: 'Christian Stewardship Advisor', role: 'faith_specialist', office: 'D4' },
  // Row E - Faith/Cultural Specialists (Abrahamic & Eastern)
  { id: 'islamic_scholar', name: 'Islamic Finance Scholar', role: 'faith_specialist', office: 'E1' },
  { id: 'jewish_scholar', name: 'Jewish Law Scholar', role: 'faith_specialist', office: 'E2' },
  { id: 'hindu_advisor', name: 'Hindu Law Advisor', role: 'faith_specialist', office: 'E3' },
  { id: 'chinese_advisor', name: 'Chinese Tradition Advisor', role: 'faith_specialist', office: 'E4' },
  // Row F - Faith/Cultural Specialists (Regional)
  { id: 'japanese_advisor', name: 'Japanese Law Advisor', role: 'faith_specialist', office: 'F1' },
  { id: 'african_customary_advisor', name: 'African Customary Advisor', role: 'faith_specialist', office: 'F2' },
  { id: 'indigenous_advisor', name: 'Indigenous Law Advisor', role: 'faith_specialist', office: 'F3' },
];

/**
 * Accounting Swarm agent registry - CPA/CFA specialists
 */
const ACCOUNTING_SWARM_AGENTS = [
  // Leadership
  { id: 'lead_accounting_advisor', name: 'Lead Accounting Advisor', role: 'accounting_orchestrator', office: 'ACC-A1' },
  // CPA Specialists
  { id: 'audit_specialist', name: 'Audit Specialist', role: 'cpa_specialist', office: 'ACC-B1' },
  { id: 'financial_reporting_specialist', name: 'Financial Reporting Specialist', role: 'cpa_specialist', office: 'ACC-B2' },
  { id: 'regulatory_specialist', name: 'Regulatory Specialist', role: 'cpa_specialist', office: 'ACC-B3' },
  { id: 'business_analysis_specialist', name: 'Business Analysis Specialist', role: 'cpa_specialist', office: 'ACC-B4' },
  { id: 'information_systems_specialist', name: 'Information Systems Specialist', role: 'cpa_specialist', office: 'ACC-C1' },
  { id: 'tax_compliance_specialist', name: 'Tax Compliance Specialist', role: 'cpa_specialist', office: 'ACC-C2' },
  // CFA Specialists
  { id: 'ethics_specialist', name: 'Ethics Specialist', role: 'cfa_specialist', office: 'ACC-D1' },
  { id: 'quant_methods_specialist', name: 'Quantitative Methods Specialist', role: 'cfa_specialist', office: 'ACC-D2' },
  { id: 'economics_specialist', name: 'Economics Specialist', role: 'cfa_specialist', office: 'ACC-D3' },
  { id: 'financial_analysis_specialist', name: 'Financial Analysis Specialist', role: 'cfa_specialist', office: 'ACC-D4' },
  { id: 'corporate_finance_specialist', name: 'Corporate Finance Specialist', role: 'cfa_specialist', office: 'ACC-E1' },
  { id: 'equity_specialist', name: 'Equity Specialist', role: 'cfa_specialist', office: 'ACC-E2' },
  { id: 'fixed_income_specialist', name: 'Fixed Income Specialist', role: 'cfa_specialist', office: 'ACC-E3' },
  { id: 'derivatives_specialist', name: 'Derivatives Specialist', role: 'cfa_specialist', office: 'ACC-E4' },
  { id: 'alternatives_specialist', name: 'Alternatives Specialist', role: 'cfa_specialist', office: 'ACC-F1' },
  { id: 'portfolio_management_specialist', name: 'Portfolio Management Specialist', role: 'cfa_specialist', office: 'ACC-F2' },
];

/**
 * Legal Swarm agent registry - Bar Exam specialists
 */
const LEGAL_SWARM_AGENTS = [
  // Bar Exam Subject Specialists
  { id: 'contracts_specialist', name: 'Contracts Specialist', role: 'bar_specialist', office: 'LAW-A1' },
  { id: 'evidence_specialist', name: 'Evidence Specialist', role: 'bar_specialist', office: 'LAW-A2' },
  { id: 'constitutional_law_specialist', name: 'Constitutional Law Specialist', role: 'bar_specialist', office: 'LAW-A3' },
  { id: 'torts_specialist', name: 'Torts Specialist', role: 'bar_specialist', office: 'LAW-B1' },
  { id: 'real_property_specialist', name: 'Real Property Specialist', role: 'bar_specialist', office: 'LAW-B2' },
  { id: 'civil_procedure_specialist', name: 'Civil Procedure Specialist', role: 'bar_specialist', office: 'LAW-B3' },
  { id: 'criminal_law_specialist', name: 'Criminal Law Specialist', role: 'bar_specialist', office: 'LAW-C1' },
];

/**
 * Combined agents for all swarms
 */
const ALL_SWARM_AGENTS = [...SWARM_AGENTS, ...ACCOUNTING_SWARM_AGENTS, ...LEGAL_SWARM_AGENTS];

/**
 * Action: Start a multi-agent swarm session
 */
const startSessionAction: Action = {
  name: 'HEIR_START_SESSION',
  description: 'Start a tracked multi-agent swarm session. Returns a session ID for tracking delegations and costs.',
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const config = buildConfig(runtime);
      const client = new HeirApiClient(config);
      
      const input = extractActionInput(message, state, options);
      const response = await client.post<any>('/api/swarm/session/start', {
        userId: input.userId,
        topic: input.topic || 'General wealth planning consultation',
        initialAgent: input.initialAgent || 'lead_wealth_advisor',
      });
      
      const session = response?.data || response;
      
      if (callback) {
        await callback({
          text: `Swarm session started. Session ID: ${session.sessionId}. The Lead Wealth Advisor is ready to assist you.`,
          actions: ['HEIR_START_SESSION'],
          source: message.content?.source,
        });
      }
      
      return {
        success: true,
        text: 'Swarm session started.',
        data: session,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to start swarm session');
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

/**
 * Action: Delegate to a specialist agent
 */
const delegateAction: Action = {
  name: 'HEIR_DELEGATE_TO_AGENT',
  description: 'Delegate a question or task to a specialist agent. Requires targetAgent (agent ID) and context (what to discuss).',
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const config = buildConfig(runtime);
      const client = new HeirApiClient(config);
      const input = extractActionInput(message, state, options);
      
      const targetAgent = input.targetAgent as string;
      const context = input.context as string;
      const sessionId = input.sessionId || message.roomId;
      
      if (!targetAgent) {
        throw new Error('targetAgent is required. Available agents: ' + ALL_SWARM_AGENTS.map(a => a.id).join(', '));
      }
      
      // Search in both wealth/legal and accounting swarms
      const agent = ALL_SWARM_AGENTS.find(a => a.id === targetAgent);
      if (!agent) {
        throw new Error(`Unknown agent: ${targetAgent}. Available: ${ALL_SWARM_AGENTS.map(a => a.id).join(', ')}`);
      }
      
      // Determine swarm type for tracking
      const isAccountingAgent = ACCOUNTING_SWARM_AGENTS.some(a => a.id === targetAgent);
      
      // Check and deduct credits for delegation
      const creditCheck = await client.checkCredits('swarm_delegation', {
        fromAgent: state?.values?.agentName || 'lead_wealth_advisor',
        toAgent: targetAgent,
        sessionId,
      });
      
      if (!creditCheck.allowed) {
        return {
          success: false,
          error: new Error(`Insufficient credits for delegation. Need ${creditCheck.requiredCredits}, have ${creditCheck.currentBalance}.`),
          data: { code: 'INSUFFICIENT_CREDITS', ...creditCheck },
        };
      }
      
      await client.deductCredits('swarm_delegation', {
        fromAgent: state?.values?.agentName || 'lead_wealth_advisor',
        toAgent: targetAgent,
        sessionId,
      });
      
      // Record the delegation
      const response = await client.post<any>('/api/swarm/session/delegate', {
        sessionId,
        fromAgent: state?.values?.agentName || 'lead_wealth_advisor',
        toAgent: targetAgent,
        context,
        timestamp: new Date().toISOString(),
      });
      
      if (callback) {
        await callback({
          text: `Delegating to ${agent.name}. Context: ${context}`,
          actions: ['HEIR_DELEGATE_TO_AGENT'],
          source: message.content?.source,
        });
      }
      
      return {
        success: true,
        text: `Delegated to ${agent.name}.`,
        data: {
          delegationId: response?.data?.delegationId || response?.delegationId,
          targetAgent: agent,
          context,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to delegate to agent');
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

/**
 * Action: Get status of all swarm agents
 */
const getAgentStatusAction: Action = {
  name: 'HEIR_GET_AGENT_STATUS',
  description: 'Get the current status of all swarm agents (active, idle, busy).',
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const config = buildConfig(runtime);
      const client = new HeirApiClient(config);
      
      const response = await client.get<any>('/api/swarm/agents/status');
      const agents = response?.data || response?.agents || SWARM_AGENTS.map(a => ({
        ...a,
        status: 'available',
        currentSession: null,
      }));
      
      const summary = agents.map((a: any) => `${a.name}: ${a.status}`).join('\n');
      
      if (callback) {
        await callback({
          text: `Swarm Agent Status:\n${summary}`,
          actions: ['HEIR_GET_AGENT_STATUS'],
          source: message.content?.source,
        });
      }
      
      return {
        success: true,
        text: 'Agent status retrieved.',
        data: { agents },
      };
    } catch (error) {
      // Fallback to static list if API not available
      const agents = SWARM_AGENTS.map(a => ({
        ...a,
        status: 'available',
        currentSession: null,
      }));
      
      return {
        success: true,
        text: 'Agent status (static fallback).',
        data: { agents, fallback: true },
      };
    }
  },
};

/**
 * Action: End a swarm session
 */
const endSessionAction: Action = {
  name: 'HEIR_END_SESSION',
  description: 'End a multi-agent swarm session and get a summary of the consultation.',
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const config = buildConfig(runtime);
      const client = new HeirApiClient(config);
      const input = extractActionInput(message, state, options);
      
      const sessionId = input.sessionId || message.roomId;
      
      const response = await client.post<any>('/api/swarm/session/end', { sessionId });
      const summary = response?.data || response;
      
      if (callback) {
        await callback({
          text: `Session ended. Total credits used: ${summary.totalCredits || 0}. Agents consulted: ${summary.agentsConsulted?.join(', ') || 'none'}.`,
          actions: ['HEIR_END_SESSION'],
          source: message.content?.source,
        });
      }
      
      return {
        success: true,
        text: 'Session ended.',
        data: summary,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to end swarm session');
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

/**
 * Provider: Swarm agent directory for visualization
 */
const swarmAgentDirectoryProvider: Provider = {
  name: 'HEIR_SWARM_AGENTS',
  description: 'List of all swarm agents with their roles and office positions',
  get: async (): Promise<ProviderResult> => {
    return {
      text: `Swarm has ${ALL_SWARM_AGENTS.length} agents available (${SWARM_AGENTS.length} wealth + ${ACCOUNTING_SWARM_AGENTS.length} accounting + ${LEGAL_SWARM_AGENTS.length} legal/bar): ${ALL_SWARM_AGENTS.map(a => a.name).join(', ')}.`,
      values: {
        agentCount: ALL_SWARM_AGENTS.length,
        wealthAgentCount: SWARM_AGENTS.length,
        accountingAgentCount: ACCOUNTING_SWARM_AGENTS.length,
        legalAgentCount: LEGAL_SWARM_AGENTS.length,
        agents: ALL_SWARM_AGENTS,
        wealthAgents: SWARM_AGENTS,
        accountingAgents: ACCOUNTING_SWARM_AGENTS,
        legalAgents: LEGAL_SWARM_AGENTS,
      },
      data: { 
        agents: ALL_SWARM_AGENTS,
        wealthAgents: SWARM_AGENTS,
        accountingAgents: ACCOUNTING_SWARM_AGENTS,
        legalAgents: LEGAL_SWARM_AGENTS,
      },
    };
  },
};

/**
 * Action: Consult accounting swarm from legal/wealth agents
 */
const consultAccountingAction: Action = {
  name: 'HEIR_CONSULT_ACCOUNTING',
  description: 'Consult the accounting swarm for CPA/CFA expertise on financial matters. Used by legal/wealth advisors to get accounting guidance.',
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const config = buildConfig(runtime);
      const client = new HeirApiClient(config);
      const input = extractActionInput(message, state, options);
      
      const {
        topic,
        context,
        targetSpecialist,
        sessionId = message.roomId,
      } = input as {
        topic: string;
        context: string;
        targetSpecialist?: string;
        sessionId?: string;
      };
      
      if (!topic) {
        throw new Error('topic is required. Specify the accounting/finance topic you need guidance on.');
      }
      
      // Determine best accounting specialist based on topic
      let recommendedSpecialist = 'lead_accounting_advisor';
      const topicLower = (topic || '').toLowerCase();
      
      if (topicLower.includes('audit') || topicLower.includes('internal control')) {
        recommendedSpecialist = 'audit_specialist';
      } else if (topicLower.includes('gaap') || topicLower.includes('financial statement') || topicLower.includes('revenue recognition') || topicLower.includes('lease')) {
        recommendedSpecialist = 'financial_reporting_specialist';
      } else if (topicLower.includes('tax') && !topicLower.includes('compliance')) {
        recommendedSpecialist = 'regulatory_specialist';
      } else if (topicLower.includes('tax compliance') || topicLower.includes('tax planning') || topicLower.includes('estate tax')) {
        recommendedSpecialist = 'tax_compliance_specialist';
      } else if (topicLower.includes('valuation') || topicLower.includes('ratio') || topicLower.includes('financial analysis')) {
        recommendedSpecialist = 'financial_analysis_specialist';
      } else if (topicLower.includes('wacc') || topicLower.includes('capital budget') || topicLower.includes('corporate finance')) {
        recommendedSpecialist = 'corporate_finance_specialist';
      } else if (topicLower.includes('bond') || topicLower.includes('duration') || topicLower.includes('fixed income')) {
        recommendedSpecialist = 'fixed_income_specialist';
      } else if (topicLower.includes('option') || topicLower.includes('derivative') || topicLower.includes('hedge')) {
        recommendedSpecialist = 'derivatives_specialist';
      } else if (topicLower.includes('portfolio') || topicLower.includes('asset allocation') || topicLower.includes('capm')) {
        recommendedSpecialist = 'portfolio_management_specialist';
      }
      
      const specialist = targetSpecialist || recommendedSpecialist;
      const agent = ACCOUNTING_SWARM_AGENTS.find(a => a.id === specialist);
      
      if (!agent) {
        throw new Error(`Unknown accounting specialist: ${specialist}. Available: ${ACCOUNTING_SWARM_AGENTS.map(a => a.id).join(', ')}`);
      }
      
      // Check and deduct credits for consultation
      const creditCheck = await client.checkCredits('swarm_delegation', {
        fromAgent: state?.values?.agentName || 'wealth_advisor',
        toAgent: specialist,
        sessionId,
        swarmType: 'accounting',
      });
      
      if (!creditCheck.allowed) {
        return {
          success: false,
          error: new Error(`Insufficient credits for accounting consultation. Need ${creditCheck.requiredCredits}, have ${creditCheck.currentBalance}.`),
          data: { code: 'INSUFFICIENT_CREDITS', ...creditCheck },
        };
      }
      
      await client.deductCredits('swarm_delegation', {
        fromAgent: state?.values?.agentName || 'wealth_advisor',
        toAgent: specialist,
        sessionId,
        swarmType: 'accounting',
      });
      
      // Record the consultation
      const response = await client.post<any>('/api/swarm/session/consult-accounting', {
        sessionId,
        fromAgent: state?.values?.agentName || 'wealth_advisor',
        toAgent: specialist,
        topic,
        context,
        timestamp: new Date().toISOString(),
      });
      
      if (callback) {
        await callback({
          text: `Consulting ${agent.name} for guidance on: ${topic}`,
          actions: ['HEIR_CONSULT_ACCOUNTING'],
          source: message.content?.source,
        });
      }
      
      return {
        success: true,
        text: `Consultation with ${agent.name} initiated.`,
        data: {
          consultationId: response?.data?.consultationId || response?.consultationId,
          targetAgent: agent,
          topic,
          context,
          recommendedSpecialist,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to consult accounting swarm');
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

/**
 * Action: Consult legal swarm for bar exam subjects
 */
const consultLegalAction: Action = {
  name: 'HEIR_CONSULT_LEGAL',
  description: 'Consult the legal swarm for bar exam subject expertise. Used by wealth advisors to get legal guidance on contracts, property, evidence, etc.',
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const config = buildConfig(runtime);
      const client = new HeirApiClient(config);
      const input = extractActionInput(message, state, options);
      
      const {
        topic,
        context,
        targetSpecialist,
        sessionId = message.roomId,
      } = input as {
        topic: string;
        context: string;
        targetSpecialist?: string;
        sessionId?: string;
      };
      
      if (!topic) {
        throw new Error('topic is required. Specify the legal topic you need guidance on.');
      }
      
      // Determine best legal specialist based on topic
      let recommendedSpecialist = 'contracts_specialist';
      const topicLower = (topic || '').toLowerCase();
      
      if (topicLower.includes('contract') || topicLower.includes('ucc') || topicLower.includes('offer') || topicLower.includes('acceptance') || topicLower.includes('breach')) {
        recommendedSpecialist = 'contracts_specialist';
      } else if (topicLower.includes('hearsay') || topicLower.includes('evidence') || topicLower.includes('witness') || topicLower.includes('privilege') || topicLower.includes('authentication')) {
        recommendedSpecialist = 'evidence_specialist';
      } else if (topicLower.includes('constitutional') || topicLower.includes('due process') || topicLower.includes('equal protection') || topicLower.includes('first amendment') || topicLower.includes('commerce clause')) {
        recommendedSpecialist = 'constitutional_law_specialist';
      } else if (topicLower.includes('tort') || topicLower.includes('negligence') || topicLower.includes('duty') || topicLower.includes('causation') || topicLower.includes('damages') || topicLower.includes('defamation')) {
        recommendedSpecialist = 'torts_specialist';
      } else if (topicLower.includes('property') || topicLower.includes('easement') || topicLower.includes('deed') || topicLower.includes('mortgage') || topicLower.includes('landlord') || topicLower.includes('tenant')) {
        recommendedSpecialist = 'real_property_specialist';
      } else if (topicLower.includes('jurisdiction') || topicLower.includes('venue') || topicLower.includes('erie') || topicLower.includes('pleading') || topicLower.includes('discovery') || topicLower.includes('summary judgment')) {
        recommendedSpecialist = 'civil_procedure_specialist';
      } else if (topicLower.includes('criminal') || topicLower.includes('murder') || topicLower.includes('miranda') || topicLower.includes('search') || topicLower.includes('seizure') || topicLower.includes('fourth amendment')) {
        recommendedSpecialist = 'criminal_law_specialist';
      }
      
      const specialist = targetSpecialist || recommendedSpecialist;
      const agent = LEGAL_SWARM_AGENTS.find(a => a.id === specialist);
      
      if (!agent) {
        throw new Error(`Unknown legal specialist: ${specialist}. Available: ${LEGAL_SWARM_AGENTS.map(a => a.id).join(', ')}`);
      }
      
      // Check and deduct credits for consultation
      const creditCheck = await client.checkCredits('swarm_delegation', {
        fromAgent: state?.values?.agentName || 'wealth_advisor',
        toAgent: specialist,
        sessionId,
        swarmType: 'legal',
      });
      
      if (!creditCheck.allowed) {
        return {
          success: false,
          error: new Error(`Insufficient credits for legal consultation. Need ${creditCheck.requiredCredits}, have ${creditCheck.currentBalance}.`),
          data: { code: 'INSUFFICIENT_CREDITS', ...creditCheck },
        };
      }
      
      await client.deductCredits('swarm_delegation', {
        fromAgent: state?.values?.agentName || 'wealth_advisor',
        toAgent: specialist,
        sessionId,
        swarmType: 'legal',
      });
      
      // Record the consultation
      const response = await client.post<any>('/api/swarm/session/consult-legal', {
        sessionId,
        fromAgent: state?.values?.agentName || 'wealth_advisor',
        toAgent: specialist,
        topic,
        context,
        timestamp: new Date().toISOString(),
      });
      
      if (callback) {
        await callback({
          text: `Consulting ${agent.name} for guidance on: ${topic}`,
          actions: ['HEIR_CONSULT_LEGAL'],
          source: message.content?.source,
        });
      }
      
      return {
        success: true,
        text: `Consultation with ${agent.name} initiated.`,
        data: {
          consultationId: response?.data?.consultationId || response?.consultationId,
          targetAgent: agent,
          topic,
          context,
          recommendedSpecialist,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to consult legal swarm');
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

const actions: Action[] = [
  startSessionAction,
  delegateAction,
  getAgentStatusAction,
  endSessionAction,
  consultAccountingAction,
  consultLegalAction,
  createHeirAction({
    name: 'HEIR_GENERATE_CONTRACT',
    description:
      'Generate an inheritance smart contract. Requires blockchain, ownerAddress, beneficiaries, and optional inheritanceTemplate.',
    method: 'POST',
    endpoint: () => '/api/v1/contracts/generate',
    requiresApiKey: true,
    creditOperation: 'contract_generate', // 5 credits
  }),
  createHeirAction({
    name: 'HEIR_ESTIMATE_GAS',
    description: 'Estimate gas costs for contract deployment.',
    method: 'POST',
    endpoint: () => '/api/v1/contracts/estimate-gas',
    // No credit charge - lightweight operation
  }),
  createHeirAction({
    name: 'HEIR_CREATE_VAULT',
    description: 'Create a new inheritance vault for a user.',
    method: 'POST',
    endpoint: () => '/api/v1/user/vaults',
    requiresApiKey: true,
    creditOperation: 'swarm_message', // 1 credit
  }),
  createHeirAction({
    name: 'HEIR_LIST_VAULTS',
    description: 'List user vaults (requires API key).',
    method: 'GET',
    endpoint: (input) => {
      const limit = input.limit ? `?limit=${input.limit}` : '';
      return `/api/v1/user/vaults${limit}`;
    },
    requiresApiKey: true,
    // No credit charge - read operation
  }),
  createHeirAction({
    name: 'HEIR_UPDATE_VAULT',
    description: 'Update an existing vault configuration.',
    method: 'POST',
    endpoint: (input) => `/api/v1/user/vaults/${input.vaultId}`,
    requiresApiKey: true,
    creditOperation: 'swarm_message', // 1 credit
  }),
  createHeirAction({
    name: 'HEIR_GENERATE_WILL',
    description: 'Generate a will document for a jurisdiction.',
    method: 'POST',
    endpoint: () => '/api/v1/legal/will',
    requiresApiKey: true,
    creditOperation: 'legal_document', // 5 credits
  }),
  createHeirAction({
    name: 'HEIR_GENERATE_TRUST',
    description: 'Generate a trust document for a jurisdiction.',
    method: 'POST',
    endpoint: () => '/api/v1/legal/trust',
    requiresApiKey: true,
    creditOperation: 'legal_document', // 5 credits
  }),
  createHeirAction({
    name: 'HEIR_GENERATE_POA',
    description: 'Generate a power of attorney document for a jurisdiction.',
    method: 'POST',
    endpoint: () => '/api/v1/legal/poa',
    requiresApiKey: true,
    creditOperation: 'legal_document', // 5 credits
  }),
  createHeirAction({
    name: 'HEIR_QUERY_JURISDICTION',
    description: 'Get inheritance law details for a country code.',
    method: 'GET',
    endpoint: (input) => `/api/v1/jurisdictions/${input.code}`,
    creditOperation: 'jurisdiction_lookup', // 0.1 credits
  }),
  createHeirAction({
    name: 'HEIR_CALCULATE_DISTRIBUTION',
    description:
      'Calculate a distribution preview by generating a contract and returning its distribution map.',
    method: 'POST',
    endpoint: () => '/api/v1/contracts/generate',
    responseMapper: (response) => ({
      distribution: response?.contractInfo?.distribution || null,
      contractInfo: response?.contractInfo || null,
      warnings: response?.analysis?.warnings || [],
    }),
    creditOperation: 'distribution_calculate', // 2 credits
  }),
  // Advisor matching action
  createHeirAction({
    name: 'HEIR_MATCH_ADVISOR',
    description: 'Find human advisors matching specific expertise needs.',
    method: 'POST',
    endpoint: () => '/api/advisors/match',
    creditOperation: 'advisor_match', // 0.5 credits
  }),
];

export const heirPlugin: Plugin = {
  name: 'plugin-heir',
  description: 'HEIR platform tools and providers with swarm credit metering',
  config: {
    HEIR_API_KEY: process.env.HEIR_API_KEY,
    HEIR_API_BASE_URL: process.env.HEIR_API_BASE_URL,
    HEIR_APP_BASE_URL: process.env.HEIR_APP_BASE_URL,
    HEIR_RULES_PATH: process.env.HEIR_RULES_PATH,
    HEIR_DEFAULT_JURISDICTION: process.env.HEIR_DEFAULT_JURISDICTION,
    HEIR_SKIP_CREDIT_CHECK: process.env.HEIR_SKIP_CREDIT_CHECK,
  },
  async init(config: Record<string, string>) {
    try {
      const validatedConfig = await configSchema.parseAsync(config);
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages =
          error.issues?.map((issue) => issue.message).join(', ') || 'Unknown validation error';
        throw new Error(`Invalid plugin configuration: ${errorMessages}`);
      }
      throw error;
    }
  },
  actions,
  providers: [
    jurisdictionProvider, 
    inheritanceRulesProvider, 
    userAssetsProvider, 
    advisorDirectoryProvider,
    swarmCreditsProvider,
    swarmAgentDirectoryProvider,
  ],
};

export default heirPlugin;
