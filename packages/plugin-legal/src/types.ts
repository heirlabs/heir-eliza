/**
 * Types for the Legal Education Plugin
 */

export type BarExamSubject = 
  | 'civil_procedure'
  | 'constitutional_law'
  | 'contracts'
  | 'criminal_law'
  | 'criminal_procedure'
  | 'evidence'
  | 'real_property'
  | 'torts';

export interface LegalConcept {
  term: string;
  definition: string;
  subject: BarExamSubject;
  relatedConcepts: string[];
  caseReferences?: string[];
  statuteReferences?: string[];
}

export interface BarExamQuestion {
  id: string;
  subject: BarExamSubject;
  topic: string;
  question: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  examSource?: string;
}

export interface LegalAnalysis {
  issue: string;
  rule: string;
  application: string;
  conclusion: string;
  subject: BarExamSubject;
}

export interface UCCSection {
  article: string;
  section: string;
  title: string;
  content: string;
  keyRules: string[];
}

export interface CaseBrief {
  name: string;
  citation: string;
  facts: string;
  issue: string;
  holding: string;
  reasoning: string;
  significance: string;
  subject: BarExamSubject;
}

export interface EstateIssue {
  issueType: 'will_contest' | 'trust_dispute' | 'fiduciary_breach' | 'undue_influence' | 'capacity' | 'property_transfer';
  relevantSubjects: BarExamSubject[];
  legalFramework: string;
  practicalGuidance: string;
}
