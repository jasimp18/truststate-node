/**
 * Policy Library — Pre-built Molecule Templates
 *
 * 16 policy packs / 36 templates organized by compliance domain.
 * Each template is a pre-configured set of V3 atoms that can be
 * cloned and customized for specific use cases.
 *
 * Architecture: templates are pure data (no runtime deps).
 * The PolicyService converts them into BaaS-stored PolicyDefinitions.
 */

import type { AtomConfig } from '../types';

/**
 * A policy template — pre-configured molecule.
 */
export interface PolicyTemplate {
  /** Unique template ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Policy pack this belongs to */
  pack: string;
  /** Target entity types (empty = any) */
  entityTypes: string[];
  /** Default enforcement mode */
  enforcement: 'strict' | 'warn' | 'log';
  /** Pre-configured atoms */
  atoms: AtomConfig[];
  /** Tags for search/filtering */
  tags: string[];
}

/**
 * A policy pack — group of related templates.
 */
export interface PolicyPack {
  /** Pack ID */
  id: string;
  /** Pack name */
  name: string;
  /** Pack description */
  description: string;
  /** Template IDs in this pack */
  templateIds: string[];
}

// =============================================================================
// Pack 1: AI Governance
// =============================================================================

const aiGovernanceTemplates: PolicyTemplate[] = [
  {
    id: 'ai-response-quality',
    name: 'AI Response Quality Gate',
    description: 'Enforce minimum confidence scores and required fields on AI agent responses',
    pack: 'ai-governance',
    entityTypes: ['AgentResponse', 'AIOutput'],
    enforcement: 'strict',
    atoms: [
      { type: 'limits', config: { field: 'score', min: 0.5, max: 1.0 }, required: true },
      { type: 'field-values', config: { constraints: [{ field: 'model', allowedValues: ['gpt-4', 'gpt-4o', 'claude-3', 'claude-4', 'gemini-2'], caseInsensitive: true }] }, required: true },
      { type: 'schema-validation', config: {}, required: true },
    ],
    tags: ['ai', 'quality', 'confidence'],
  },
  {
    id: 'ai-content-safety',
    name: 'AI Content Safety Filter',
    description: 'Block responses flagged as unsafe by content classifiers',
    pack: 'ai-governance',
    entityTypes: ['AgentResponse'],
    enforcement: 'strict',
    atoms: [
      { type: 'field-values', config: { constraints: [{ field: 'safetyFlag', allowedValues: ['unsafe', 'harmful', 'toxic'], denyMode: true }] }, required: true },
      { type: 'limits', config: { field: 'toxicityScore', min: 0, max: 0.3 }, required: true },
    ],
    tags: ['ai', 'safety', 'content-filter'],
  },
  {
    id: 'ai-rate-limit',
    name: 'AI Agent Rate Limiter',
    description: 'Limit AI agent request throughput per actor',
    pack: 'ai-governance',
    entityTypes: ['AgentResponse', 'AIOutput'],
    enforcement: 'strict',
    atoms: [
      { type: 'rate-limiter', config: { maxOps: 100, windowSec: 3600 }, required: true },
      { type: 'cooldown', config: { cooldownSec: 1 }, required: false },
    ],
    tags: ['ai', 'rate-limit', 'throttle'],
  },
];

// =============================================================================
// Pack 2: Financial Compliance
// =============================================================================

const financialTemplates: PolicyTemplate[] = [
  {
    id: 'fin-transaction-limits',
    name: 'Transaction Amount Limits',
    description: 'Enforce min/max transaction amounts with approval for large transfers',
    pack: 'financial-compliance',
    entityTypes: ['Transaction', 'Transfer'],
    enforcement: 'strict',
    atoms: [
      { type: 'limits', config: { limits: [{ field: 'amount', min: 0.01, max: 1000000 }] }, required: true },
      { type: 'field-values', config: { constraints: [{ field: 'currency', allowedValues: ['USD', 'EUR', 'GBP', 'HBAR', 'XRP'] }] }, required: true },
    ],
    tags: ['finance', 'limits', 'transaction'],
  },
  {
    id: 'fin-aml-jurisdiction',
    name: 'AML Jurisdiction Filter',
    description: 'Block transactions from sanctioned jurisdictions',
    pack: 'financial-compliance',
    entityTypes: ['Transaction', 'Account'],
    enforcement: 'strict',
    atoms: [
      { type: 'field-values', config: { constraints: [{ field: 'jurisdiction', allowedValues: ['KP', 'IR', 'SY', 'CU', 'RU'], denyMode: true, caseInsensitive: true }] }, required: true },
    ],
    tags: ['finance', 'aml', 'sanctions'],
  },
  {
    id: 'fin-dual-approval',
    name: 'Dual Approval for High-Value',
    description: 'Require two approvals for transactions above threshold',
    pack: 'financial-compliance',
    entityTypes: ['Transaction'],
    enforcement: 'strict',
    atoms: [
      { type: 'count-approval', config: { requiredCount: 2, authorizedApprovers: [], allowDuplicates: false, allowSelfApproval: false, maxApprovalAgeSec: 86400 }, required: true },
    ],
    tags: ['finance', 'approval', 'high-value'],
  },
];

// =============================================================================
// Pack 3: Document Lifecycle
// =============================================================================

const documentTemplates: PolicyTemplate[] = [
  {
    id: 'doc-lifecycle-standard',
    name: 'Standard Document Lifecycle',
    description: 'Draft → Submitted → Approved/Rejected → Active → Archived',
    pack: 'document-lifecycle',
    entityTypes: ['Document', 'Report', 'Policy'],
    enforcement: 'strict',
    atoms: [
      { type: 'workflow-state', config: { transitions: { draft: ['submitted'], submitted: ['approved', 'rejected'], rejected: ['draft'], approved: ['active'], active: ['archived'] }, initialStates: ['draft'], terminalStates: ['archived'], allowSelfTransition: false }, required: true },
    ],
    tags: ['document', 'lifecycle', 'workflow'],
  },
  {
    id: 'doc-audit-trail',
    name: 'Document Audit Trail',
    description: 'Require actor identification and evidence for document changes',
    pack: 'document-lifecycle',
    entityTypes: ['Document'],
    enforcement: 'strict',
    atoms: [
      { type: 'permission-list', config: { allowed: [] }, required: true },
      { type: 'external-evidence', config: { requiredSignatures: 1, maxEvidenceAgeSec: 86400 }, required: false },
    ],
    tags: ['document', 'audit', 'evidence'],
  },
];

// =============================================================================
// Pack 4: KYC/Identity
// =============================================================================

const kycTemplates: PolicyTemplate[] = [
  {
    id: 'kyc-verification-flow',
    name: 'KYC Verification Workflow',
    description: 'Pending → Verified / Rejected lifecycle with evidence requirements',
    pack: 'kyc-identity',
    entityTypes: ['Identity', 'KYCRecord'],
    enforcement: 'strict',
    atoms: [
      { type: 'workflow-state', config: { transitions: { pending: ['under_review'], under_review: ['verified', 'rejected'], rejected: ['pending'], verified: ['expired'] }, initialStates: ['pending'], terminalStates: ['expired'] }, required: true },
      { type: 'external-evidence', config: { requiredSignatures: 1, maxEvidenceAgeSec: 2592000, requiredEvidenceType: 'identity_verification' }, required: true },
    ],
    tags: ['kyc', 'identity', 'verification'],
  },
  {
    id: 'kyc-data-completeness',
    name: 'KYC Data Completeness',
    description: 'Ensure all required identity fields are present and valid',
    pack: 'kyc-identity',
    entityTypes: ['Identity', 'KYCRecord'],
    enforcement: 'strict',
    atoms: [
      { type: 'schema-validation', config: {}, required: true },
      { type: 'field-values', config: { constraints: [{ field: 'documentType', allowedValues: ['passport', 'national_id', 'drivers_license'] }] }, required: true },
    ],
    tags: ['kyc', 'data-quality', 'completeness'],
  },
];

// =============================================================================
// Pack 5: DAO Governance
// =============================================================================

const daoTemplates: PolicyTemplate[] = [
  {
    id: 'dao-proposal-lifecycle',
    name: 'DAO Proposal Lifecycle',
    description: 'Draft → Voting → Passed/Failed → Executed governance flow',
    pack: 'dao-governance',
    entityTypes: ['Proposal', 'Vote'],
    enforcement: 'strict',
    atoms: [
      { type: 'workflow-state', config: { transitions: { draft: ['voting'], voting: ['passed', 'failed'], passed: ['executed'], failed: ['draft'] }, initialStates: ['draft'], terminalStates: ['executed'] }, required: true },
    ],
    tags: ['dao', 'governance', 'proposal'],
  },
  {
    id: 'dao-quorum',
    name: 'DAO Quorum Threshold',
    description: 'Require minimum voter participation before proposal passes',
    pack: 'dao-governance',
    entityTypes: ['Proposal'],
    enforcement: 'strict',
    atoms: [
      { type: 'approval-threshold', config: { threshold: 0.51, totalVoters: 100 }, required: true },
      { type: 'time-range', config: { startHour: 0, endHour: 23 }, required: false },
    ],
    tags: ['dao', 'quorum', 'voting'],
  },
];

// =============================================================================
// Pack 6: Supply Chain
// =============================================================================

const supplyChainTemplates: PolicyTemplate[] = [
  {
    id: 'supply-chain-tracking',
    name: 'Supply Chain Tracking',
    description: 'Track goods through manufacturing → shipping → delivered lifecycle',
    pack: 'supply-chain',
    entityTypes: ['Shipment', 'Product'],
    enforcement: 'strict',
    atoms: [
      { type: 'workflow-state', config: { transitions: { manufactured: ['quality_check'], quality_check: ['approved', 'rejected'], approved: ['shipped'], rejected: ['manufactured'], shipped: ['in_transit'], in_transit: ['delivered'] }, initialStates: ['manufactured'], terminalStates: ['delivered'] }, required: true },
      { type: 'registry-reference', config: { references: [{ name: 'manufacturer', fieldPath: 'manufacturerId', registryType: 'registry', required: true, requiredStatus: 'active' }] }, required: true },
    ],
    tags: ['supply-chain', 'tracking', 'logistics'],
  },
  {
    id: 'supply-chain-provenance',
    name: 'Provenance Attestation',
    description: 'Require oracle-signed provenance proof at each stage',
    pack: 'supply-chain',
    entityTypes: ['Shipment'],
    enforcement: 'strict',
    atoms: [
      { type: 'external-evidence', config: { requiredSignatures: 1, maxEvidenceAgeSec: 604800 }, required: true },
    ],
    tags: ['supply-chain', 'provenance', 'attestation'],
  },
];

// =============================================================================
// Pack 7: Healthcare
// =============================================================================

const healthcareTemplates: PolicyTemplate[] = [
  {
    id: 'health-record-access',
    name: 'Health Record Access Control',
    description: 'Restrict access to medical records by role',
    pack: 'healthcare',
    entityTypes: ['MedicalRecord', 'PatientData'],
    enforcement: 'strict',
    atoms: [
      { type: 'permission-list', config: { allowed: ['doctor', 'nurse', 'admin', 'patient'] }, required: true },
      { type: 'time-range', config: { startHour: 6, endHour: 22, daysOfWeek: [1, 2, 3, 4, 5] }, required: false },
    ],
    tags: ['healthcare', 'hipaa', 'access-control'],
  },
  {
    id: 'health-consent-tracking',
    name: 'Patient Consent Tracking',
    description: 'Track consent lifecycle with evidence requirements',
    pack: 'healthcare',
    entityTypes: ['Consent'],
    enforcement: 'strict',
    atoms: [
      { type: 'workflow-state', config: { transitions: { pending: ['granted', 'denied'], granted: ['revoked'], denied: ['pending'] }, initialStates: ['pending'], terminalStates: ['revoked'] }, required: true },
      { type: 'external-evidence', config: { requiredSignatures: 1, maxEvidenceAgeSec: 0 }, required: true },
    ],
    tags: ['healthcare', 'consent', 'privacy'],
  },
];

// =============================================================================
// Pack 8: Data Privacy (GDPR/CCPA)
// =============================================================================

const privacyTemplates: PolicyTemplate[] = [
  {
    id: 'privacy-data-processing',
    name: 'Data Processing Lawful Basis',
    description: 'Enforce lawful basis for data processing (GDPR Art. 6)',
    pack: 'data-privacy',
    entityTypes: ['DataProcessing', 'PersonalData'],
    enforcement: 'strict',
    atoms: [
      { type: 'field-values', config: { constraints: [{ field: 'lawfulBasis', allowedValues: ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests'] }] }, required: true },
    ],
    tags: ['privacy', 'gdpr', 'lawful-basis'],
  },
  {
    id: 'privacy-retention',
    name: 'Data Retention Policy',
    description: 'Enforce maximum data retention periods',
    pack: 'data-privacy',
    entityTypes: ['PersonalData'],
    enforcement: 'warn',
    atoms: [
      { type: 'limits', config: { field: 'retentionDays', min: 1, max: 365 }, required: true },
    ],
    tags: ['privacy', 'retention', 'gdpr'],
  },
];

// =============================================================================
// Pack 9: IoT Device
// =============================================================================

const iotTemplates: PolicyTemplate[] = [
  {
    id: 'iot-telemetry-validation',
    name: 'IoT Telemetry Validation',
    description: 'Validate sensor readings are within expected ranges',
    pack: 'iot-device',
    entityTypes: ['Telemetry', 'SensorReading'],
    enforcement: 'warn',
    atoms: [
      { type: 'limits', config: { limits: [{ field: 'temperature', min: -50, max: 150 }, { field: 'humidity', min: 0, max: 100 }] }, required: true },
      { type: 'rate-limiter', config: { maxOps: 1000, windowSec: 60 }, required: true },
    ],
    tags: ['iot', 'telemetry', 'sensor'],
  },
];

// =============================================================================
// Pack 10: Content Moderation
// =============================================================================

const contentTemplates: PolicyTemplate[] = [
  {
    id: 'content-publish-flow',
    name: 'Content Publication Flow',
    description: 'Draft → Review → Published with approval gate',
    pack: 'content-moderation',
    entityTypes: ['Content', 'Article', 'Post'],
    enforcement: 'strict',
    atoms: [
      { type: 'workflow-state', config: { transitions: { draft: ['review'], review: ['published', 'rejected'], rejected: ['draft'], published: ['archived'] }, initialStates: ['draft'], terminalStates: ['archived'] }, required: true },
      { type: 'count-approval', config: { requiredCount: 1, authorizedApprovers: [], allowSelfApproval: false }, required: true },
    ],
    tags: ['content', 'moderation', 'publishing'],
  },
];

// =============================================================================
// Pack 11: Energy & Carbon
// =============================================================================

const energyTemplates: PolicyTemplate[] = [
  {
    id: 'carbon-offset-validation',
    name: 'Carbon Offset Validation',
    description: 'Validate carbon offset claims with third-party attestation',
    pack: 'energy-carbon',
    entityTypes: ['CarbonOffset', 'EnergyCredit'],
    enforcement: 'strict',
    atoms: [
      { type: 'external-evidence', config: { requiredSignatures: 2, maxEvidenceAgeSec: 2592000, requiredEvidenceType: 'carbon_attestation' }, required: true },
      { type: 'registry-reference', config: { references: [{ name: 'issuer', fieldPath: 'issuerId', registryType: 'registry', required: true, requiredStatus: 'active' }] }, required: true },
    ],
    tags: ['energy', 'carbon', 'esg'],
  },
];

// =============================================================================
// Pack 12: Education & Credentials
// =============================================================================

const educationTemplates: PolicyTemplate[] = [
  {
    id: 'credential-issuance',
    name: 'Credential Issuance Flow',
    description: 'Enrollment → Completed → Issued → Verified credential lifecycle',
    pack: 'education',
    entityTypes: ['Credential', 'Certificate'],
    enforcement: 'strict',
    atoms: [
      { type: 'workflow-state', config: { transitions: { enrolled: ['completed'], completed: ['issued'], issued: ['verified', 'revoked'] }, initialStates: ['enrolled'], terminalStates: ['verified', 'revoked'] }, required: true },
    ],
    tags: ['education', 'credentials', 'verification'],
  },
];

// =============================================================================
// Pack 13: Insurance
// =============================================================================

const insuranceTemplates: PolicyTemplate[] = [
  {
    id: 'claims-processing',
    name: 'Insurance Claims Processing',
    description: 'Filed → Under Review → Approved/Denied → Paid workflow',
    pack: 'insurance',
    entityTypes: ['Claim'],
    enforcement: 'strict',
    atoms: [
      { type: 'workflow-state', config: { transitions: { filed: ['under_review'], under_review: ['approved', 'denied'], denied: ['appealed'], appealed: ['under_review'], approved: ['paid'] }, initialStates: ['filed'], terminalStates: ['paid'] }, required: true },
      { type: 'external-evidence', config: { requiredSignatures: 1, maxEvidenceAgeSec: 0 }, required: false },
    ],
    tags: ['insurance', 'claims', 'processing'],
  },
];

// =============================================================================
// Pack 14: Real Estate
// =============================================================================

const realEstateTemplates: PolicyTemplate[] = [
  {
    id: 'property-transfer',
    name: 'Property Transfer Workflow',
    description: 'Listed → Offer → Escrow → Transferred with dual approval',
    pack: 'real-estate',
    entityTypes: ['Property', 'Deed'],
    enforcement: 'strict',
    atoms: [
      { type: 'workflow-state', config: { transitions: { listed: ['offer_accepted'], offer_accepted: ['escrow'], escrow: ['transferred', 'cancelled'], cancelled: ['listed'] }, initialStates: ['listed'], terminalStates: ['transferred'] }, required: true },
      { type: 'count-approval', config: { requiredCount: 2, authorizedApprovers: [], allowSelfApproval: false }, required: true },
    ],
    tags: ['real-estate', 'property', 'transfer'],
  },
];

// =============================================================================
// Pack 15: Legal
// =============================================================================

const legalTemplates: PolicyTemplate[] = [
  {
    id: 'contract-lifecycle',
    name: 'Contract Lifecycle Management',
    description: 'Draft → Negotiation → Signed → Active → Expired',
    pack: 'legal',
    entityTypes: ['Contract', 'Agreement'],
    enforcement: 'strict',
    atoms: [
      { type: 'workflow-state', config: { transitions: { draft: ['negotiation'], negotiation: ['signed', 'cancelled'], signed: ['active'], active: ['amended', 'expired'], amended: ['active'] }, initialStates: ['draft'], terminalStates: ['expired', 'cancelled'] }, required: true },
    ],
    tags: ['legal', 'contract', 'lifecycle'],
  },
];

// =============================================================================
// Pack 16: Generic / Custom
// =============================================================================

const genericTemplates: PolicyTemplate[] = [
  {
    id: 'generic-business-hours',
    name: 'Business Hours Only',
    description: 'Restrict operations to business hours (Mon-Fri 09:00-17:00 UTC)',
    pack: 'generic',
    entityTypes: [],
    enforcement: 'strict',
    atoms: [
      { type: 'time-range', config: { startHour: 9, endHour: 17, daysOfWeek: [1, 2, 3, 4, 5] }, required: true },
    ],
    tags: ['generic', 'business-hours', 'time'],
  },
  {
    id: 'generic-rate-limit',
    name: 'Global Rate Limiter',
    description: 'Basic rate limiting for any entity type',
    pack: 'generic',
    entityTypes: [],
    enforcement: 'strict',
    atoms: [
      { type: 'rate-limiter', config: { maxOps: 1000, windowSec: 3600 }, required: true },
    ],
    tags: ['generic', 'rate-limit'],
  },
  {
    id: 'generic-cooldown',
    name: 'Operation Cooldown',
    description: 'Enforce minimum time between operations on same entity',
    pack: 'generic',
    entityTypes: [],
    enforcement: 'strict',
    atoms: [
      { type: 'cooldown', config: { cooldownSec: 60 }, required: true },
    ],
    tags: ['generic', 'cooldown'],
  },
];

// =============================================================================
// Exports
// =============================================================================

/** All 36 templates */
export const ALL_TEMPLATES: PolicyTemplate[] = [
  ...aiGovernanceTemplates,
  ...financialTemplates,
  ...documentTemplates,
  ...kycTemplates,
  ...daoTemplates,
  ...supplyChainTemplates,
  ...healthcareTemplates,
  ...privacyTemplates,
  ...iotTemplates,
  ...contentTemplates,
  ...energyTemplates,
  ...educationTemplates,
  ...insuranceTemplates,
  ...realEstateTemplates,
  ...legalTemplates,
  ...genericTemplates,
];

/** All 16 packs */
export const ALL_PACKS: PolicyPack[] = [
  { id: 'ai-governance', name: 'AI Governance', description: 'Quality gates, safety filters, and rate limits for AI agents', templateIds: aiGovernanceTemplates.map(t => t.id) },
  { id: 'financial-compliance', name: 'Financial Compliance', description: 'Transaction limits, AML screening, approval workflows', templateIds: financialTemplates.map(t => t.id) },
  { id: 'document-lifecycle', name: 'Document Lifecycle', description: 'Standard document workflows with audit trails', templateIds: documentTemplates.map(t => t.id) },
  { id: 'kyc-identity', name: 'KYC & Identity', description: 'Identity verification workflows with evidence requirements', templateIds: kycTemplates.map(t => t.id) },
  { id: 'dao-governance', name: 'DAO Governance', description: 'Proposal lifecycles, quorum thresholds, voting rules', templateIds: daoTemplates.map(t => t.id) },
  { id: 'supply-chain', name: 'Supply Chain', description: 'Product tracking, provenance attestation, quality gates', templateIds: supplyChainTemplates.map(t => t.id) },
  { id: 'healthcare', name: 'Healthcare', description: 'HIPAA-oriented record access, consent tracking', templateIds: healthcareTemplates.map(t => t.id) },
  { id: 'data-privacy', name: 'Data Privacy', description: 'GDPR/CCPA lawful basis, retention enforcement', templateIds: privacyTemplates.map(t => t.id) },
  { id: 'iot-device', name: 'IoT & Device', description: 'Telemetry validation, device rate limiting', templateIds: iotTemplates.map(t => t.id) },
  { id: 'content-moderation', name: 'Content Moderation', description: 'Publication workflows with approval gates', templateIds: contentTemplates.map(t => t.id) },
  { id: 'energy-carbon', name: 'Energy & Carbon', description: 'Carbon offset validation with multi-oracle attestation', templateIds: energyTemplates.map(t => t.id) },
  { id: 'education', name: 'Education & Credentials', description: 'Credential issuance and verification flows', templateIds: educationTemplates.map(t => t.id) },
  { id: 'insurance', name: 'Insurance', description: 'Claims processing workflows', templateIds: insuranceTemplates.map(t => t.id) },
  { id: 'real-estate', name: 'Real Estate', description: 'Property transfer with dual approval', templateIds: realEstateTemplates.map(t => t.id) },
  { id: 'legal', name: 'Legal', description: 'Contract lifecycle management', templateIds: legalTemplates.map(t => t.id) },
  { id: 'generic', name: 'Generic', description: 'Universal building blocks — business hours, rate limits, cooldowns', templateIds: genericTemplates.map(t => t.id) },
];

/** Lookup helpers */
export function getTemplateById(id: string): PolicyTemplate | undefined {
  return ALL_TEMPLATES.find(t => t.id === id);
}

export function getPackById(id: string): PolicyPack | undefined {
  return ALL_PACKS.find(p => p.id === id);
}

export function getTemplatesByPack(packId: string): PolicyTemplate[] {
  return ALL_TEMPLATES.filter(t => t.pack === packId);
}

export function searchTemplates(query: string): PolicyTemplate[] {
  const q = query.toLowerCase();
  return ALL_TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.tags.some(tag => tag.includes(q)) ||
    t.pack.includes(q)
  );
}
