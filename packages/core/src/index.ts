/**
 * @contribspec/core — the vendor-neutral ContribSpec evaluation engine.
 *
 * Public surface: policy loading/validation, the evidence model, requirement
 * evaluation, report rendering, `explain`, and the conformance runner.
 * This package contains no forge-specific code (ADR-0001).
 */

export * from './types.js';
export {
  sanitizeText,
  sanitizeInline,
  escapeMarkdown,
  codeFence,
  sanitizeDataValue,
  MAX_TEXT_LENGTH,
  MAX_SUMMARY_LENGTH,
} from './sanitize.js';
export { resolveWithin, resolveExplicitPath, isFile, PathTraversalError } from './paths.js';
export { parseYamlSafely, YamlParseError, MAX_POLICY_BYTES, MAX_ALIAS_COUNT } from './yaml.js';
export {
  validatePolicyValue,
  validatePolicyText,
  editDistance,
  type ValidationResult,
} from './validate.js';
export {
  loadPolicyFile,
  loadPolicyText,
  resolvePolicy,
  findPolicyPath,
  PolicyNotFoundError,
  type LoadResult,
  type ResolveOptions,
} from './load.js';
export {
  evaluateContribution,
  type EvaluationInput,
  type EvaluationOptions,
} from './evaluate.js';
export {
  renderJson,
  renderText,
  renderMarkdown,
  reportToJsonString,
  summarize,
  gateDecision,
  safeCodeBlock,
  type GateDecision,
} from './report.js';
export { explainPolicy, type ExplainFormat } from './explain.js';
export {
  loadConformanceCases,
  runConformanceCase,
  runConformanceSuite,
  isConformanceDir,
  ConformanceFormatError,
  type ConformanceCase,
  type ConformanceCaseResult,
  type ConformanceExpectation,
} from './conformance.js';
export {
  collectDisclosures,
  classifyStatement,
  parseSignoffs,
  hasIssueReference,
  hasResponsibilityClaim,
  hasUnderstandingClaim,
} from './disclosures.js';
export type { ForgeProvider, CheckRunPublisher } from './forge.js';