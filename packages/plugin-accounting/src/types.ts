/**
 * Types for the accounting plugin
 */

export interface AccountingConfig {
  /** API endpoint for the accounting model (if using external service) */
  modelEndpoint?: string;
  /** Hugging Face model ID */
  hfModelId?: string;
  /** Whether to use local calculations */
  useLocalCalculations?: boolean;
  /** Default jurisdiction for tax calculations */
  defaultJurisdiction?: string;
  /** Current tax year */
  currentTaxYear?: number;
}

export interface AccountingCalculation {
  type: CalculationType;
  inputs: Record<string, number | string>;
  result: number | Record<string, number>;
  explanation: string;
  formula: string;
}

export type CalculationType = 
  | 'depreciation_straight_line'
  | 'depreciation_macrs'
  | 'depreciation_double_declining'
  | 'present_value'
  | 'future_value'
  | 'npv'
  | 'irr'
  | 'wacc'
  | 'bond_price'
  | 'duration'
  | 'convexity'
  | 'option_black_scholes'
  | 'tax_liability'
  | 'deferred_tax'
  | 'ratio_analysis';

export interface TaxCalculationInput {
  income: number;
  filingStatus: 'single' | 'married_joint' | 'married_separate' | 'head_of_household';
  deductions?: number;
  credits?: number;
  year?: number;
}

export interface DepreciationInput {
  cost: number;
  salvageValue?: number;
  usefulLife: number;
  method: 'straight_line' | 'double_declining' | 'macrs';
  macrsClass?: '3' | '5' | '7' | '10' | '15' | '20' | '27.5' | '39';
  year?: number;
}

export interface BondPricingInput {
  faceValue: number;
  couponRate: number;
  ytm: number;
  yearsToMaturity: number;
  frequency?: 1 | 2 | 4; // Annual, semi-annual, quarterly
}

export interface NPVInput {
  initialInvestment: number;
  cashFlows: number[];
  discountRate: number;
}

export interface WACCInput {
  equityValue: number;
  debtValue: number;
  costOfEquity: number;
  costOfDebt: number;
  taxRate: number;
}

export interface RatioAnalysisInput {
  currentAssets?: number;
  currentLiabilities?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  shareholdersEquity?: number;
  netIncome?: number;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  inventory?: number;
  receivables?: number;
  cogs?: number;
}

export interface AccountingQuestion {
  topic: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  examType: 'CPA' | 'CFA';
  section?: string; // AUD, FAR, REG, etc. for CPA
}

export interface PracticeQuestionResult {
  question: string;
  choices?: string[];
  correctAnswer: string;
  explanation: string;
  topic: string;
  difficulty: string;
}
