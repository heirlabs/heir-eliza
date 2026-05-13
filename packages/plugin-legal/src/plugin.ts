/**
 * ElizaOS Legal Education Plugin
 * 
 * Provides legal knowledge, bar exam preparation, and estate law guidance.
 */

import type { 
  Plugin, 
  Action, 
  Provider,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State
} from '@elizaos/core';

import type { 
  BarExamSubject, 
  BarExamQuestion, 
  LegalConcept,
  UCCSection,
  CaseBrief
} from './types.js';

// ============================================================================
// Legal Knowledge Base
// ============================================================================

const BAR_EXAM_SUBJECTS: Record<BarExamSubject, { name: string; weight: string; topics: string[] }> = {
  civil_procedure: {
    name: 'Civil Procedure',
    weight: '~100 questions total, varies by subject',
    topics: [
      'Federal Subject-Matter Jurisdiction (4%)',
      'Personal Jurisdiction (4%)',
      'Removal and Remand (4%)',
      'Venue (4%)',
      'Erie Doctrine (9%)',
      'Pretrial Procedures (22%)',
      'Trial (9%)',
      'Judgments (9%)',
      'Appeal (9%)'
    ]
  },
  constitutional_law: {
    name: 'Constitutional Law',
    weight: 'Major MBE subject',
    topics: [
      'Separation of Powers (17%)',
      'Judicial Review (17%)',
      'Federalism (16%)',
      'Individual Rights (50%)'
    ]
  },
  contracts: {
    name: 'Contracts',
    weight: 'Major MBE subject',
    topics: [
      'Applicable Law - UCC vs Common Law (5%)',
      'Formation (25%)',
      'Defenses (13%)',
      'Interpretation and Parol Evidence (6%)',
      'Performance, Breach, Excuse (25%)',
      'Remedies (13%)',
      'Third Parties (13%)'
    ]
  },
  criminal_law: {
    name: 'Criminal Law',
    weight: 'Combined with Criminal Procedure',
    topics: [
      'General Principles (6%)',
      'Crimes Against Persons (12%)',
      'Property Crimes (12%)',
      'Inchoate Offenses (6%)',
      'Parties (7%)',
      'Defenses (7%)'
    ]
  },
  criminal_procedure: {
    name: 'Criminal Procedure',
    weight: 'Combined with Criminal Law',
    topics: [
      'Fourth Amendment (9%)',
      'Fifth Amendment (9%)',
      'Sixth Amendment (16%)',
      'Exclusionary Rule (8%)',
      'Post-Trial (8%)'
    ]
  },
  evidence: {
    name: 'Evidence',
    weight: 'Major MBE subject',
    topics: [
      'Presentation of Evidence (25%)',
      'Relevance (32%)',
      'Privileges (9%)',
      'Hearsay (25%)',
      'Best Evidence Rule (9%)'
    ]
  },
  real_property: {
    name: 'Real Property',
    weight: 'Major MBE subject',
    topics: [
      'Ownership and Estates (20%)',
      'Non-Possessory Interests (20%)',
      'Contracts (20%)',
      'Conveyancing (20%)',
      'Mortgages (20%)'
    ]
  },
  torts: {
    name: 'Torts',
    weight: 'Major MBE subject',
    topics: [
      'Intentional Torts (18%)',
      'Negligence (50%)',
      'Products Liability (8%)',
      'Strict Liability (8%)',
      'Other Torts (8%)',
      'Defenses (8%)'
    ]
  }
};

const KEY_LEGAL_CONCEPTS: LegalConcept[] = [
  {
    term: 'Res Judicata',
    definition: 'Claim preclusion. A final judgment on the merits bars relitigation of the same claim between the same parties.',
    subject: 'civil_procedure',
    relatedConcepts: ['Collateral Estoppel', 'Final Judgment', 'Same Transaction or Occurrence'],
    caseReferences: ['Cromwell v. County of Sac']
  },
  {
    term: 'Proximate Cause',
    definition: 'Legal causation requiring that the harm be a foreseeable result of the defendant\'s negligent conduct.',
    subject: 'torts',
    relatedConcepts: ['Actual Cause', 'But-For Test', 'Foreseeability', 'Superseding Cause'],
    caseReferences: ['Palsgraf v. Long Island Railroad']
  },
  {
    term: 'Hearsay',
    definition: 'An out-of-court statement offered to prove the truth of the matter asserted. Generally inadmissible unless an exception or exemption applies.',
    subject: 'evidence',
    relatedConcepts: ['Present Sense Impression', 'Excited Utterance', 'Business Records', 'Party Admission'],
    statuteReferences: ['FRE 801', 'FRE 802', 'FRE 803', 'FRE 804']
  },
  {
    term: 'Consideration',
    definition: 'A bargained-for exchange of legal value. Each party must give something of value or forbear from exercising a legal right.',
    subject: 'contracts',
    relatedConcepts: ['Pre-existing Duty Rule', 'Promissory Estoppel', 'Illusory Promise'],
    caseReferences: ['Hamer v. Sidway']
  },
  {
    term: 'Fee Simple Absolute',
    definition: 'The most complete form of property ownership. Potentially infinite duration, freely alienable, and descendible without restriction.',
    subject: 'real_property',
    relatedConcepts: ['Life Estate', 'Fee Simple Defeasible', 'Future Interests']
  },
  {
    term: 'Due Process',
    definition: 'Constitutional guarantee that no person shall be deprived of life, liberty, or property without due process of law. Includes procedural and substantive components.',
    subject: 'constitutional_law',
    relatedConcepts: ['Equal Protection', 'Fundamental Rights', 'Levels of Scrutiny'],
    statuteReferences: ['5th Amendment', '14th Amendment']
  },
  {
    term: 'Mens Rea',
    definition: 'Guilty mind. The mental state required for criminal liability. Levels: purposely, knowingly, recklessly, negligently.',
    subject: 'criminal_law',
    relatedConcepts: ['Specific Intent', 'General Intent', 'Strict Liability Crimes']
  },
  {
    term: 'Miranda Rights',
    definition: 'Rights that must be read to suspects in custodial interrogation: right to remain silent, anything said can be used against you, right to attorney, attorney will be provided if cannot afford one.',
    subject: 'criminal_procedure',
    relatedConcepts: ['Custodial Interrogation', 'Waiver', 'Fruit of the Poisonous Tree'],
    caseReferences: ['Miranda v. Arizona']
  }
];

const UCC_KEY_SECTIONS: UCCSection[] = [
  {
    article: '2',
    section: '2-201',
    title: 'Statute of Frauds',
    content: 'Contracts for sale of goods $500 or more require a writing signed by party to be charged.',
    keyRules: [
      'Writing must indicate contract and specify quantity',
      'Exceptions: Specially manufactured goods, admission in court, part performance',
      'Merchant confirmatory memo: 10 days to object'
    ]
  },
  {
    article: '2',
    section: '2-207',
    title: 'Battle of the Forms',
    content: 'Acceptance with additional or different terms can still form a contract.',
    keyRules: [
      'Definite expression of acceptance forms contract even with different terms',
      'Between merchants: additional terms become part unless material alteration',
      'Different terms: knockout rule applies in most jurisdictions'
    ]
  },
  {
    article: '2',
    section: '2-601',
    title: 'Perfect Tender Rule',
    content: 'Buyer can reject goods that fail to conform to contract in any respect.',
    keyRules: [
      'Buyer may: reject whole, accept whole, or accept part/reject part',
      'Exceptions: cure, installment contracts, commercial impracticability',
      'Must reject within reasonable time and notify seller'
    ]
  },
  {
    article: '2',
    section: '2-615',
    title: 'Commercial Impracticability',
    content: 'Excuse from performance when a contingency makes performance impracticable.',
    keyRules: [
      'Event must be unforeseeable',
      'Non-occurrence must have been a basic assumption',
      'Seller must have acted in good faith'
    ]
  }
];

const SAMPLE_BAR_QUESTIONS: BarExamQuestion[] = [
  {
    id: 'civ-pro-001',
    subject: 'civil_procedure',
    topic: 'Subject Matter Jurisdiction',
    question: 'A citizen of State A sues a citizen of State B in federal court, seeking $50,000 in damages for breach of contract. Does the federal court have subject matter jurisdiction?',
    choices: [
      'A. Yes, because the parties are diverse.',
      'B. Yes, because contract claims are federal questions.',
      'C. No, because the amount in controversy does not exceed $75,000.',
      'D. No, because contract claims must be filed in state court.'
    ],
    correctAnswer: 'C',
    explanation: 'For diversity jurisdiction under 28 U.S.C. § 1332, two requirements must be met: (1) complete diversity of citizenship between parties, and (2) amount in controversy exceeding $75,000. Here, while the parties are diverse (State A citizen vs. State B citizen), the $50,000 claim does not exceed the $75,000 threshold. Choice A is wrong because diversity alone is insufficient. Choice B is wrong because breach of contract is a state law claim, not a federal question. Choice D is wrong because contract claims can be in federal court if diversity requirements are met.',
    difficulty: 'easy'
  },
  {
    id: 'contracts-001',
    subject: 'contracts',
    topic: 'UCC Statute of Frauds',
    question: 'A buyer orally agreed to purchase 500 widgets from a seller for $2,000. Both parties are merchants. The seller sent a written confirmation memo to the buyer, who received it but never responded. Is the contract enforceable against the buyer?',
    choices: [
      'A. No, because the buyer never signed a writing.',
      'B. No, because oral contracts for goods are unenforceable.',
      'C. Yes, because the merchant\'s confirmatory memo satisfies the statute of frauds.',
      'D. Yes, because part performance removes the statute of frauds.'
    ],
    correctAnswer: 'C',
    explanation: 'Under UCC § 2-201(2), between merchants, a written confirmation sent within a reasonable time that the receiving party has reason to know of its contents satisfies the statute of frauds against the sender. It also satisfies the statute against the recipient unless written objection is given within 10 days of receipt. Here, both parties are merchants, the seller sent a confirmation, and the buyer did not object within 10 days. Choice A is wrong because the merchant exception applies. Choice B is wrong because oral contracts are enforceable if an exception applies. Choice D is wrong because there\'s no indication of part performance.',
    difficulty: 'medium'
  },
  {
    id: 'evidence-001',
    subject: 'evidence',
    topic: 'Hearsay',
    question: 'At trial, the plaintiff seeks to introduce testimony from a witness who will testify: "The defendant told me, \'I was driving too fast when I hit the plaintiff.\'" The defendant objects. How should the court rule?',
    choices: [
      'A. Sustain the objection, as the statement is inadmissible hearsay.',
      'B. Sustain the objection, as the statement is not relevant.',
      'C. Overrule the objection, as the statement is a party opponent admission.',
      'D. Overrule the objection, as the statement is a present sense impression.'
    ],
    correctAnswer: 'C',
    explanation: 'Under FRE 801(d)(2)(A), a statement is not hearsay if it is offered against an opposing party and was made by the party in an individual capacity. Here, the defendant\'s own statement about driving too fast is being offered against him. This is a party opponent admission (sometimes called admission by party-opponent) and is specifically exempted from the hearsay rule. Choice A is wrong because party admissions are not hearsay. Choice B is wrong because the statement is clearly relevant to negligence. Choice D is wrong because present sense impression (FRE 803(1)) requires a statement describing an event while perceiving it, which doesn\'t apply here.',
    difficulty: 'easy'
  },
  {
    id: 'torts-001',
    subject: 'torts',
    topic: 'Negligence - Duty',
    question: 'A bystander sees a child drowning in a shallow pool. The bystander, an excellent swimmer, does nothing and the child drowns. In a jurisdiction following the traditional common law rule, is the bystander liable for the child\'s death?',
    choices: [
      'A. Yes, because the bystander had the ability to save the child.',
      'B. Yes, because a reasonable person would have helped.',
      'C. No, because there is generally no duty to rescue.',
      'D. No, because the bystander did not create the peril.'
    ],
    correctAnswer: 'C',
    explanation: 'Under traditional common law, there is no general duty to rescue or aid another person in peril, even if rescue would be easy and riskless. This is known as the "no duty to rescue" rule. Exceptions exist when: (1) there is a special relationship (e.g., parent-child, employer-employee), (2) the defendant created the peril, (3) the defendant undertook to rescue and then stopped, or (4) the defendant prevented others from rescuing. None of these exceptions apply here. Choice A is wrong because ability alone does not create a legal duty. Choice B is wrong because moral obligation differs from legal duty. Choice D, while true, is not the complete answer - the absence of a general duty is the core reason.',
    difficulty: 'medium'
  }
];

// ============================================================================
// Actions
// ============================================================================

const legalPracticeAction: Action = {
  name: 'LEGAL_PRACTICE_QUESTION',
  description: 'Generate a bar exam practice question on a specified subject',
  similes: ['bar exam question', 'practice question', 'test me on', 'quiz me'],
  
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('practice') ||
      text.includes('question') ||
      text.includes('quiz') ||
      text.includes('test me')
    );
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    
    // Determine subject from message
    let targetSubject: BarExamSubject | null = null;
    for (const [key, info] of Object.entries(BAR_EXAM_SUBJECTS)) {
      if (text.includes(key.replace('_', ' ')) || text.includes(info.name.toLowerCase())) {
        targetSubject = key as BarExamSubject;
        break;
      }
    }
    
    // Filter questions by subject or get random
    const availableQuestions = targetSubject 
      ? SAMPLE_BAR_QUESTIONS.filter(q => q.subject === targetSubject)
      : SAMPLE_BAR_QUESTIONS;
    
    if (availableQuestions.length === 0) {
      await callback({
        text: `I don't have practice questions for that subject yet. Available subjects: ${Object.values(BAR_EXAM_SUBJECTS).map(s => s.name).join(', ')}`
      });
      return true;
    }
    
    const question = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    const subjectInfo = BAR_EXAM_SUBJECTS[question.subject];
    
    const response = `**${subjectInfo.name} Practice Question** (${question.difficulty})
**Topic:** ${question.topic}

${question.question}

${question.choices.join('\n')}

---
*Reply with your answer (A, B, C, or D) and I'll provide the explanation.*`;

    await callback({ text: response });
    
    // Store question in state for follow-up
    if (state) {
      state.lastQuestion = question;
    }
    
    return true;
  },
  
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Give me a contracts practice question' } },
      { user: '{{agent}}', content: { text: '**Contracts Practice Question**...' } }
    ]
  ]
};

const legalExplainAction: Action = {
  name: 'LEGAL_EXPLAIN_CONCEPT',
  description: 'Explain a legal concept for bar exam preparation',
  similes: ['explain', 'what is', 'define', 'tell me about'],
  
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('explain') ||
      text.includes('what is') ||
      text.includes('define') ||
      text.includes('how does')
    );
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    
    // Search for matching concept
    let matchedConcept: LegalConcept | null = null;
    for (const concept of KEY_LEGAL_CONCEPTS) {
      if (text.includes(concept.term.toLowerCase())) {
        matchedConcept = concept;
        break;
      }
    }
    
    // Also check UCC sections
    let matchedUCC: UCCSection | null = null;
    for (const section of UCC_KEY_SECTIONS) {
      if (text.includes(section.section) || text.includes(section.title.toLowerCase())) {
        matchedUCC = section;
        break;
      }
    }
    
    if (matchedConcept) {
      const subjectInfo = BAR_EXAM_SUBJECTS[matchedConcept.subject];
      let response = `**${matchedConcept.term}** (${subjectInfo.name})

**Definition:** ${matchedConcept.definition}

**Related Concepts:** ${matchedConcept.relatedConcepts.join(', ')}`;

      if (matchedConcept.caseReferences?.length) {
        response += `\n\n**Key Cases:** ${matchedConcept.caseReferences.join(', ')}`;
      }
      if (matchedConcept.statuteReferences?.length) {
        response += `\n\n**Statutory References:** ${matchedConcept.statuteReferences.join(', ')}`;
      }
      
      await callback({ text: response });
      return true;
    }
    
    if (matchedUCC) {
      const response = `**UCC ${matchedUCC.section}: ${matchedUCC.title}**

**Article ${matchedUCC.article} - Sales**

${matchedUCC.content}

**Key Rules:**
${matchedUCC.keyRules.map(r => `• ${r}`).join('\n')}`;

      await callback({ text: response });
      return true;
    }
    
    // Generic response with available concepts
    const conceptList = KEY_LEGAL_CONCEPTS.slice(0, 5).map(c => c.term).join(', ');
    await callback({
      text: `I can explain various legal concepts. Some available topics include: ${conceptList}. What specific concept would you like me to explain?`
    });
    
    return true;
  },
  
  examples: [
    [
      { user: '{{user1}}', content: { text: 'What is hearsay?' } },
      { user: '{{agent}}', content: { text: '**Hearsay** (Evidence)...' } }
    ]
  ]
};

const legalAnalysisAction: Action = {
  name: 'LEGAL_IRAC_ANALYSIS',
  description: 'Provide IRAC (Issue, Rule, Application, Conclusion) analysis for a legal scenario',
  similes: ['analyze', 'IRAC', 'apply the law'],
  
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('analyze') ||
      text.includes('irac') ||
      text.includes('apply') ||
      (text.length > 100 && (text.includes('sue') || text.includes('liable') || text.includes('claim')))
    );
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<boolean> => {
    const response = `**IRAC Analysis Framework**

I'll analyze this using the IRAC method:

**I - Issue:** The legal question that needs to be resolved. Frame as: "Whether [legal standard] is met when [key facts]?"

**R - Rule:** State the applicable legal rule, including:
- Elements or factors
- Exceptions
- Burden of proof

**A - Application:** Apply each element/factor to the specific facts:
- Address each element systematically
- Consider both sides where facts are ambiguous
- Distinguish or analogize to relevant cases

**C - Conclusion:** State your conclusion on each issue.

Please provide the specific facts you'd like me to analyze, and I'll apply this framework to identify the issues, state the rules, apply them to your facts, and reach conclusions.`;

    await callback({ text: response });
    return true;
  },
  
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Can you analyze this scenario using IRAC?' } },
      { user: '{{agent}}', content: { text: '**IRAC Analysis Framework**...' } }
    ]
  ]
};

// ============================================================================
// Providers
// ============================================================================

const legalKnowledgeProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
    return `LEGAL KNOWLEDGE BASE AVAILABLE:

Bar Exam Subjects:
${Object.entries(BAR_EXAM_SUBJECTS).map(([key, info]) => 
  `- ${info.name}: ${info.topics.length} topics`
).join('\n')}

Key Concepts Available: ${KEY_LEGAL_CONCEPTS.length} definitions
UCC Sections: ${UCC_KEY_SECTIONS.length} key provisions
Practice Questions: ${SAMPLE_BAR_QUESTIONS.length} questions

Use LEGAL_PRACTICE_QUESTION for quiz questions.
Use LEGAL_EXPLAIN_CONCEPT for definitions.
Use LEGAL_IRAC_ANALYSIS for scenario analysis.`;
  }
};

const barExamBlueprintProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
    const text = message.content.text?.toLowerCase() || '';
    
    // Check if user is asking about a specific subject
    for (const [key, info] of Object.entries(BAR_EXAM_SUBJECTS)) {
      if (text.includes(key.replace('_', ' ')) || text.includes(info.name.toLowerCase())) {
        return `BAR EXAM CONTENT MAP - ${info.name.toUpperCase()}

Topics and Weights:
${info.topics.map(t => `• ${t}`).join('\n')}

Study Tips:
- Focus on the most heavily tested areas
- Practice with timed questions
- Review key cases and rules
- Use IRAC format for essay responses`;
      }
    }
    
    return '';
  }
};

const uccProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
    const text = message.content.text?.toLowerCase() || '';
    
    if (text.includes('ucc') || text.includes('uniform commercial code') || text.includes('article 2')) {
      return `UCC ARTICLE 2 - SALES (Key for Contracts)

Key Sections:
${UCC_KEY_SECTIONS.map(s => `§${s.section} - ${s.title}: ${s.keyRules[0]}`).join('\n')}

Remember: UCC applies to goods (movable, tangible personal property).
Common law applies to services, real property, and IP.
For mixed contracts, use the "predominant purpose" test.`;
    }
    
    return '';
  }
};

// ============================================================================
// Plugin Export
// ============================================================================

export const legalPlugin: Plugin = {
  name: 'plugin-legal',
  description: 'Legal education, bar exam preparation, and estate law guidance',
  
  actions: [
    legalPracticeAction,
    legalExplainAction,
    legalAnalysisAction
  ],
  
  providers: [
    legalKnowledgeProvider,
    barExamBlueprintProvider,
    uccProvider
  ]
};
