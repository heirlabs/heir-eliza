/**
 * Accounting Plugin for ElizaOS
 * 
 * Provides CPA/CFA expertise to the HEIR platform, integrating with
 * the legal/wealth swarm for comprehensive estate planning guidance.
 */

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
import type {
  AccountingConfig,
  AccountingCalculation,
  CalculationType,
  DepreciationInput,
  NPVInput,
  WACCInput,
  BondPricingInput,
  RatioAnalysisInput,
  PracticeQuestionResult,
} from './types.js';

// Configuration schema
const configSchema = z.object({
  ACCOUNTING_MODEL_ENDPOINT: z.string().optional(),
  ACCOUNTING_HF_MODEL_ID: z.string().default('heir-es/accounting-mistral-22b'),
  ACCOUNTING_USE_LOCAL: z.string().default('true'),
  ACCOUNTING_DEFAULT_JURISDICTION: z.string().default('US'),
  ACCOUNTING_TAX_YEAR: z.string().default('2026'),
});

// Build configuration from runtime
const buildConfig = (runtime: IAgentRuntime): AccountingConfig => {
  return {
    modelEndpoint: runtime.getSetting('ACCOUNTING_MODEL_ENDPOINT') || process.env.ACCOUNTING_MODEL_ENDPOINT,
    hfModelId: runtime.getSetting('ACCOUNTING_HF_MODEL_ID') || process.env.ACCOUNTING_HF_MODEL_ID || 'heir-es/accounting-mistral-22b',
    useLocalCalculations: (runtime.getSetting('ACCOUNTING_USE_LOCAL') || process.env.ACCOUNTING_USE_LOCAL || 'true') === 'true',
    defaultJurisdiction: runtime.getSetting('ACCOUNTING_DEFAULT_JURISDICTION') || process.env.ACCOUNTING_DEFAULT_JURISDICTION || 'US',
    currentTaxYear: parseInt(runtime.getSetting('ACCOUNTING_TAX_YEAR') || process.env.ACCOUNTING_TAX_YEAR || '2026'),
  };
};

// Calculation utilities
class AccountingCalculator {
  /**
   * Calculate straight-line depreciation
   */
  static straightLineDepreciation(cost: number, salvage: number, life: number): number[] {
    const annualDepreciation = (cost - salvage) / life;
    return Array(life).fill(annualDepreciation);
  }

  /**
   * Calculate double-declining balance depreciation
   */
  static doubleDecliningDepreciation(cost: number, salvage: number, life: number): number[] {
    const rate = 2 / life;
    const depreciation: number[] = [];
    let bookValue = cost;
    
    for (let year = 0; year < life; year++) {
      const depr = Math.max(0, Math.min(bookValue * rate, bookValue - salvage));
      depreciation.push(depr);
      bookValue -= depr;
    }
    
    return depreciation;
  }

  /**
   * Calculate NPV
   */
  static npv(initialInvestment: number, cashFlows: number[], discountRate: number): number {
    const pvCashFlows = cashFlows.reduce((sum, cf, t) => {
      return sum + cf / Math.pow(1 + discountRate, t + 1);
    }, 0);
    return pvCashFlows - initialInvestment;
  }

  /**
   * Calculate IRR using Newton-Raphson method
   */
  static irr(initialInvestment: number, cashFlows: number[], guess: number = 0.1): number {
    const allCashFlows = [-initialInvestment, ...cashFlows];
    let rate = guess;
    
    for (let i = 0; i < 100; i++) {
      let npv = 0;
      let dnpv = 0;
      
      for (let t = 0; t < allCashFlows.length; t++) {
        npv += allCashFlows[t] / Math.pow(1 + rate, t);
        dnpv -= t * allCashFlows[t] / Math.pow(1 + rate, t + 1);
      }
      
      const newRate = rate - npv / dnpv;
      if (Math.abs(newRate - rate) < 0.0001) {
        return newRate;
      }
      rate = newRate;
    }
    
    return rate;
  }

  /**
   * Calculate WACC
   */
  static wacc(input: WACCInput): number {
    const totalValue = input.equityValue + input.debtValue;
    const equityWeight = input.equityValue / totalValue;
    const debtWeight = input.debtValue / totalValue;
    
    return (equityWeight * input.costOfEquity) + 
           (debtWeight * input.costOfDebt * (1 - input.taxRate));
  }

  /**
   * Calculate bond price
   */
  static bondPrice(input: BondPricingInput): number {
    const { faceValue, couponRate, ytm, yearsToMaturity, frequency = 2 } = input;
    const periodicCoupon = (couponRate * faceValue) / frequency;
    const periodicYTM = ytm / frequency;
    const periods = yearsToMaturity * frequency;
    
    // PV of coupons (annuity)
    const pvCoupons = periodicCoupon * (1 - Math.pow(1 + periodicYTM, -periods)) / periodicYTM;
    
    // PV of face value
    const pvFace = faceValue / Math.pow(1 + periodicYTM, periods);
    
    return pvCoupons + pvFace;
  }

  /**
   * Calculate Macaulay Duration
   */
  static macaulayDuration(input: BondPricingInput): number {
    const { faceValue, couponRate, ytm, yearsToMaturity, frequency = 2 } = input;
    const periodicCoupon = (couponRate * faceValue) / frequency;
    const periodicYTM = ytm / frequency;
    const periods = yearsToMaturity * frequency;
    
    let weightedTime = 0;
    let price = 0;
    
    for (let t = 1; t <= periods; t++) {
      const cf = t === periods ? periodicCoupon + faceValue : periodicCoupon;
      const pv = cf / Math.pow(1 + periodicYTM, t);
      weightedTime += (t / frequency) * pv;
      price += pv;
    }
    
    return weightedTime / price;
  }

  /**
   * Calculate Modified Duration
   */
  static modifiedDuration(input: BondPricingInput): number {
    const macDuration = this.macaulayDuration(input);
    const frequency = input.frequency || 2;
    return macDuration / (1 + input.ytm / frequency);
  }

  /**
   * Calculate financial ratios
   */
  static calculateRatios(input: RatioAnalysisInput): Record<string, number | null> {
    const ratios: Record<string, number | null> = {};
    
    // Liquidity Ratios
    if (input.currentAssets && input.currentLiabilities) {
      ratios.currentRatio = input.currentAssets / input.currentLiabilities;
      if (input.inventory) {
        ratios.quickRatio = (input.currentAssets - input.inventory) / input.currentLiabilities;
      }
    }
    
    // Solvency Ratios
    if (input.totalAssets && input.totalLiabilities) {
      ratios.debtToAssets = input.totalLiabilities / input.totalAssets;
    }
    if (input.totalLiabilities && input.shareholdersEquity) {
      ratios.debtToEquity = input.totalLiabilities / input.shareholdersEquity;
    }
    
    // Profitability Ratios
    if (input.netIncome && input.revenue) {
      ratios.netProfitMargin = input.netIncome / input.revenue;
    }
    if (input.grossProfit && input.revenue) {
      ratios.grossProfitMargin = input.grossProfit / input.revenue;
    }
    if (input.operatingIncome && input.revenue) {
      ratios.operatingMargin = input.operatingIncome / input.revenue;
    }
    if (input.netIncome && input.totalAssets) {
      ratios.roa = input.netIncome / input.totalAssets;
    }
    if (input.netIncome && input.shareholdersEquity) {
      ratios.roe = input.netIncome / input.shareholdersEquity;
    }
    
    // Efficiency Ratios
    if (input.cogs && input.inventory) {
      ratios.inventoryTurnover = input.cogs / input.inventory;
    }
    if (input.revenue && input.receivables) {
      ratios.receivablesTurnover = input.revenue / input.receivables;
    }
    if (input.revenue && input.totalAssets) {
      ratios.assetTurnover = input.revenue / input.totalAssets;
    }
    
    return ratios;
  }
}

// Sample practice questions database
const PRACTICE_QUESTIONS: Record<string, PracticeQuestionResult[]> = {
  'CPA_FAR': [
    {
      question: 'Under ASC 842, which of the following is NOT a criterion for classifying a lease as a finance lease?',
      choices: [
        'A. Transfer of ownership to lessee at end of lease term',
        'B. Bargain purchase option',
        'C. Lease term is 50% or more of the asset\'s economic life',
        'D. Present value of lease payments equals or exceeds 90% of fair value'
      ],
      correctAnswer: 'C',
      explanation: 'The correct threshold for lease term is 75% or more of the asset\'s economic life, not 50%. The other options (A, B, D) are actual criteria for finance lease classification under ASC 842.',
      topic: 'Lease Accounting',
      difficulty: 'intermediate'
    },
    {
      question: 'A deferred tax asset should have a valuation allowance when:',
      choices: [
        'A. It is certain that the benefit will be realized',
        'B. It is more likely than not that some portion will not be realized',
        'C. The company has tax loss carryforwards',
        'D. The tax rate is expected to change'
      ],
      correctAnswer: 'B',
      explanation: 'Under ASC 740, a valuation allowance is required when it is "more likely than not" (greater than 50% probability) that some portion or all of the deferred tax asset will not be realized.',
      topic: 'Deferred Taxes',
      difficulty: 'intermediate'
    }
  ],
  'CPA_REG': [
    {
      question: 'Which business entity allows pass-through taxation while also providing protection from self-employment tax on distributions?',
      choices: [
        'A. Sole Proprietorship',
        'B. General Partnership',
        'C. S Corporation',
        'D. Limited Partnership (for general partners)'
      ],
      correctAnswer: 'C',
      explanation: 'S Corporations provide pass-through taxation, but distributions (beyond reasonable salary) are not subject to self-employment tax. Partnerships subject active partners to SE tax on their distributive share.',
      topic: 'Business Entity Taxation',
      difficulty: 'intermediate'
    }
  ],
  'CFA_fixed_income': [
    {
      question: 'A bond has a Macaulay duration of 6 years and a yield to maturity of 5%. What is its modified duration?',
      choices: [
        'A. 5.71 years',
        'B. 6.00 years',
        'C. 6.30 years',
        'D. 5.00 years'
      ],
      correctAnswer: 'A',
      explanation: 'Modified Duration = Macaulay Duration / (1 + YTM). Assuming annual compounding: 6 / (1 + 0.05) = 6 / 1.05 = 5.71 years.',
      topic: 'Duration',
      difficulty: 'basic'
    }
  ],
  'CFA_corporate': [
    {
      question: 'A company has $60 million in equity and $40 million in debt. Cost of equity is 12%, cost of debt is 6%, and tax rate is 25%. What is the WACC?',
      choices: [
        'A. 9.0%',
        'B. 9.6%',
        'C. 8.4%',
        'D. 10.2%'
      ],
      correctAnswer: 'A',
      explanation: 'WACC = (E/V × Re) + (D/V × Rd × (1-T)) = (60/100 × 12%) + (40/100 × 6% × 0.75) = 7.2% + 1.8% = 9.0%',
      topic: 'Cost of Capital',
      difficulty: 'basic'
    }
  ]
};

// Extract action input helper
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
      return {};
    }
  }
  return {};
};

// Actions

/**
 * Action: Perform accounting calculations
 */
const calculateAction: Action = {
  name: 'ACCOUNTING_CALCULATE',
  description: 'Perform accounting and finance calculations (depreciation, NPV, WACC, bond pricing, ratios, etc.)',
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const input = extractActionInput(message, state, options) as {
        calculationType: CalculationType;
        params: Record<string, unknown>;
      };
      
      const { calculationType, params } = input;
      let result: AccountingCalculation;
      
      switch (calculationType) {
        case 'npv': {
          const npvParams = params as NPVInput;
          const npvResult = AccountingCalculator.npv(
            npvParams.initialInvestment,
            npvParams.cashFlows,
            npvParams.discountRate
          );
          result = {
            type: 'npv',
            inputs: params as Record<string, number | string>,
            result: npvResult,
            explanation: `NPV = Σ(CFt / (1+r)^t) - Initial Investment = ${npvResult.toFixed(2)}`,
            formula: 'NPV = Σ[CFt / (1 + r)^t] - I₀'
          };
          break;
        }
        
        case 'wacc': {
          const waccParams = params as WACCInput;
          const waccResult = AccountingCalculator.wacc(waccParams);
          result = {
            type: 'wacc',
            inputs: params as Record<string, number | string>,
            result: waccResult,
            explanation: `WACC = (E/V × Re) + (D/V × Rd × (1-T)) = ${(waccResult * 100).toFixed(2)}%`,
            formula: 'WACC = (E/V × Re) + (D/V × Rd × (1-T))'
          };
          break;
        }
        
        case 'bond_price': {
          const bondParams = params as BondPricingInput;
          const bondPrice = AccountingCalculator.bondPrice(bondParams);
          result = {
            type: 'bond_price',
            inputs: params as Record<string, number | string>,
            result: bondPrice,
            explanation: `Bond Price = PV of Coupons + PV of Face Value = ${bondPrice.toFixed(2)}`,
            formula: 'P = C × [1 - (1+r)^-n] / r + FV / (1+r)^n'
          };
          break;
        }
        
        case 'duration': {
          const durationParams = params as BondPricingInput;
          const macDuration = AccountingCalculator.macaulayDuration(durationParams);
          const modDuration = AccountingCalculator.modifiedDuration(durationParams);
          result = {
            type: 'duration',
            inputs: params as Record<string, number | string>,
            result: { macaulay: macDuration, modified: modDuration },
            explanation: `Macaulay Duration: ${macDuration.toFixed(2)} years, Modified Duration: ${modDuration.toFixed(2)}`,
            formula: 'Modified Duration = Macaulay Duration / (1 + YTM/k)'
          };
          break;
        }
        
        case 'ratio_analysis': {
          const ratioParams = params as RatioAnalysisInput;
          const ratios = AccountingCalculator.calculateRatios(ratioParams);
          result = {
            type: 'ratio_analysis',
            inputs: params as Record<string, number | string>,
            result: ratios,
            explanation: 'Financial ratios calculated from provided data',
            formula: 'Various ratio formulas applied'
          };
          break;
        }
        
        default:
          throw new Error(`Unknown calculation type: ${calculationType}`);
      }
      
      if (callback) {
        await callback({
          text: JSON.stringify(result, null, 2),
          actions: ['ACCOUNTING_CALCULATE'],
          source: message.content?.source,
        });
      }
      
      return {
        success: true,
        text: 'Calculation completed.',
        data: result,
      };
    } catch (error) {
      logger.error({ error }, 'ACCOUNTING_CALCULATE failed');
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

/**
 * Action: Generate practice question
 */
const practiceQuestionAction: Action = {
  name: 'ACCOUNTING_PRACTICE_QUESTION',
  description: 'Generate a CPA or CFA practice question on a specified topic',
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const input = extractActionInput(message, state, options) as {
        examType?: 'CPA' | 'CFA';
        section?: string;
        topic?: string;
      };
      
      const { examType = 'CPA', section, topic } = input;
      
      // Find matching questions
      let questionPool: PracticeQuestionResult[] = [];
      
      for (const [key, questions] of Object.entries(PRACTICE_QUESTIONS)) {
        if (key.startsWith(examType)) {
          if (section && !key.includes(section)) continue;
          questionPool = questionPool.concat(questions);
        }
      }
      
      if (topic) {
        questionPool = questionPool.filter(q => 
          q.topic.toLowerCase().includes(topic.toLowerCase())
        );
      }
      
      if (questionPool.length === 0) {
        return {
          success: false,
          error: new Error('No matching questions found for the specified criteria'),
        };
      }
      
      // Select random question
      const question = questionPool[Math.floor(Math.random() * questionPool.length)];
      
      if (callback) {
        let responseText = `**${question.topic}** (${question.difficulty})\n\n`;
        responseText += `${question.question}\n\n`;
        if (question.choices) {
          responseText += question.choices.join('\n') + '\n\n';
        }
        responseText += `||Correct Answer: ${question.correctAnswer}||\n\n`;
        responseText += `**Explanation:** ${question.explanation}`;
        
        await callback({
          text: responseText,
          actions: ['ACCOUNTING_PRACTICE_QUESTION'],
          source: message.content?.source,
        });
      }
      
      return {
        success: true,
        text: 'Practice question generated.',
        data: question,
      };
    } catch (error) {
      logger.error({ error }, 'ACCOUNTING_PRACTICE_QUESTION failed');
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

/**
 * Action: Explain accounting concept
 */
const explainConceptAction: Action = {
  name: 'ACCOUNTING_EXPLAIN_CONCEPT',
  description: 'Provide detailed explanation of an accounting or finance concept from CPA/CFA curriculum',
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const input = extractActionInput(message, state, options) as {
        concept: string;
        examType?: 'CPA' | 'CFA';
        depth?: 'basic' | 'detailed';
      };
      
      const { concept, examType = 'CPA', depth = 'detailed' } = input;
      
      // This would typically call the fine-tuned model
      // For now, return a structured response indicating the action
      const response = {
        concept,
        examType,
        depth,
        message: `Explanation for "${concept}" would be provided by the accounting LLM model.`,
        suggestedTopics: [
          'Review the concept in your study materials',
          'Practice related calculations',
          'Understand real-world applications'
        ]
      };
      
      if (callback) {
        await callback({
          text: `Explaining ${concept} for ${examType} preparation...`,
          actions: ['ACCOUNTING_EXPLAIN_CONCEPT'],
          source: message.content?.source,
        });
      }
      
      return {
        success: true,
        text: 'Concept explanation provided.',
        data: response,
      };
    } catch (error) {
      logger.error({ error }, 'ACCOUNTING_EXPLAIN_CONCEPT failed');
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

/**
 * Action: Guide legal swarm on accounting principles
 */
const guideLegalSwarmAction: Action = {
  name: 'ACCOUNTING_GUIDE_LEGAL_SWARM',
  description: 'Provide accounting guidance to the legal/wealth swarm for estate planning scenarios',
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
      const input = extractActionInput(message, state, options) as {
        context: string;
        requestingAgent?: string;
        topic: string;
      };
      
      const { context, requestingAgent = 'unknown', topic } = input;
      
      // Determine which accounting principles apply
      const relevantGuidance = {
        topic,
        context,
        requestingAgent,
        jurisdiction: config.defaultJurisdiction,
        taxYear: config.currentTaxYear,
        keyPrinciples: [] as string[],
        calculations: [] as string[],
        warnings: [] as string[],
      };
      
      // Add relevant guidance based on topic
      if (topic.toLowerCase().includes('tax') || topic.toLowerCase().includes('estate')) {
        relevantGuidance.keyPrinciples.push(
          'Estate tax unified credit applies to lifetime gifts and estate',
          'Step-up in basis at death can eliminate capital gains',
          'Generation-skipping transfer tax may apply to grandchildren'
        );
        relevantGuidance.calculations.push(
          'Calculate estate tax liability using current exemption amounts',
          'Consider present value of future tax savings from gifting strategies'
        );
      }
      
      if (topic.toLowerCase().includes('valuation') || topic.toLowerCase().includes('business')) {
        relevantGuidance.keyPrinciples.push(
          'Fair market value is standard for estate/gift tax purposes',
          'Discounts for lack of marketability and control may apply',
          'IRS may challenge aggressive valuations'
        );
        relevantGuidance.calculations.push(
          'DCF analysis for operating businesses',
          'Comparable company analysis for benchmarking',
          'Asset-based approach for holding companies'
        );
      }
      
      if (topic.toLowerCase().includes('trust') || topic.toLowerCase().includes('income')) {
        relevantGuidance.keyPrinciples.push(
          'Trusts are separate taxpayers with compressed tax brackets',
          'Distributable Net Income (DNI) determines taxation of distributions',
          'Grantor trust rules may cause income to be taxed to grantor'
        );
      }
      
      relevantGuidance.warnings.push(
        'This is educational guidance only; consult a licensed CPA for specific advice',
        'Tax laws are subject to change; verify current rates and limits'
      );
      
      if (callback) {
        await callback({
          text: `Accounting guidance provided to ${requestingAgent} regarding ${topic}.`,
          actions: ['ACCOUNTING_GUIDE_LEGAL_SWARM'],
          source: message.content?.source,
        });
      }
      
      return {
        success: true,
        text: 'Guidance provided to legal swarm.',
        data: relevantGuidance,
      };
    } catch (error) {
      logger.error({ error }, 'ACCOUNTING_GUIDE_LEGAL_SWARM failed');
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

// Providers

/**
 * Provider: Accounting knowledge context
 */
const accountingKnowledgeProvider: Provider = {
  name: 'ACCOUNTING_KNOWLEDGE',
  description: 'Provides accounting knowledge context for agent responses',
  get: async (runtime: IAgentRuntime, _message: Memory, state: State): Promise<ProviderResult> => {
    const config = buildConfig(runtime);
    
    const text = `Accounting knowledge available from trained CPA/CFA model. ` +
      `Default jurisdiction: ${config.defaultJurisdiction}. ` +
      `Tax year: ${config.currentTaxYear}. ` +
      `Topics include: Financial Reporting (GAAP/IFRS), Taxation, Audit, ` +
      `Investment Analysis, Portfolio Management, Corporate Finance.`;
    
    return {
      text,
      values: {
        accountingModelAvailable: true,
        jurisdiction: config.defaultJurisdiction,
        taxYear: config.currentTaxYear,
      },
      data: {
        hfModelId: config.hfModelId,
        useLocalCalculations: config.useLocalCalculations,
      },
    };
  },
};

/**
 * Provider: Current tax law context
 */
const taxLawProvider: Provider = {
  name: 'ACCOUNTING_TAX_LAW',
  description: 'Provides current tax law context for 2026',
  get: async (runtime: IAgentRuntime): Promise<ProviderResult> => {
    const config = buildConfig(runtime);
    
    // 2026 tax parameters (estimated)
    const taxContext = {
      year: config.currentTaxYear,
      federalRates: {
        individual: {
          brackets: [10, 12, 22, 24, 32, 35, 37],
          standardDeduction: { single: 15000, mfj: 30000, hoh: 22500 }
        },
        corporate: 21,
        capitalGains: { short: 'ordinary', long: [0, 15, 20] },
      },
      estate: {
        exemption: 13000000, // per person
        rate: 40,
        portability: true,
      },
      gift: {
        annualExclusion: 18000,
        lifetimeExemption: 13000000, // unified with estate
      },
      retirement: {
        ira401kLimit: 23500,
        iraLimit: 7000,
        catchUp50: 7500,
      },
    };
    
    return {
      text: `Tax year ${config.currentTaxYear}: Estate exemption ~$13M, corporate rate 21%, top individual rate 37%.`,
      values: taxContext,
      data: taxContext,
    };
  },
};

/**
 * Provider: Exam blueprint context
 */
const examBlueprintProvider: Provider = {
  name: 'ACCOUNTING_EXAM_BLUEPRINT',
  description: 'Provides CPA/CFA exam blueprint context',
  get: async (): Promise<ProviderResult> => {
    const blueprints = {
      CPA: {
        sections: ['AUD', 'FAR', 'REG', 'BAR', 'ISC', 'TCP'],
        core: ['AUD', 'FAR', 'REG'],
        discipline: ['BAR', 'ISC', 'TCP'], // Choose one
        format: '4 hours per section, MCQ + simulations',
      },
      CFA: {
        levels: [1, 2, 3],
        level1Topics: [
          'Ethics', 'Quantitative Methods', 'Economics',
          'Financial Reporting', 'Corporate Issuers', 'Equity',
          'Fixed Income', 'Derivatives', 'Alternatives', 'Portfolio Management'
        ],
        format: 'Computer-based, multiple choice and item sets',
      },
    };
    
    return {
      text: 'CPA exam has 3 core sections (AUD, FAR, REG) plus 1 discipline. CFA has 3 levels with 10 topic areas.',
      values: { examTypes: ['CPA', 'CFA'] },
      data: blueprints,
    };
  },
};

// Plugin definition
export const accountingPlugin: Plugin = {
  name: 'plugin-accounting',
  description: 'CPA/CFA accounting expertise for HEIR platform with legal swarm integration',
  config: {
    ACCOUNTING_MODEL_ENDPOINT: process.env.ACCOUNTING_MODEL_ENDPOINT,
    ACCOUNTING_HF_MODEL_ID: process.env.ACCOUNTING_HF_MODEL_ID,
    ACCOUNTING_USE_LOCAL: process.env.ACCOUNTING_USE_LOCAL,
    ACCOUNTING_DEFAULT_JURISDICTION: process.env.ACCOUNTING_DEFAULT_JURISDICTION,
    ACCOUNTING_TAX_YEAR: process.env.ACCOUNTING_TAX_YEAR,
  },
  async init(config: Record<string, string>) {
    try {
      const validatedConfig = await configSchema.parseAsync(config);
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
      logger.info('Accounting plugin initialized');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues?.map((issue) => issue.message).join(', ') || 'Unknown validation error';
        throw new Error(`Invalid accounting plugin configuration: ${errorMessages}`);
      }
      throw error;
    }
  },
  actions: [
    calculateAction,
    practiceQuestionAction,
    explainConceptAction,
    guideLegalSwarmAction,
  ],
  providers: [
    accountingKnowledgeProvider,
    taxLawProvider,
    examBlueprintProvider,
  ],
};

export default accountingPlugin;
