/**
 * @contribspec/integrations — forge providers and evidence normalization.
 *
 * GitHub is implemented first; the ForgeProvider contract in @contribspec/core
 * is the seam where GitLab and Forgejo/Gitea adapters plug in later.
 */

export {
  GitHubClient,
  ForgeApiError,
  GITHUB_API_VERSION,
  MAX_RESPONSE_BYTES,
  type GitHubClientOptions,
} from './github/client.js';
export {
  GitHubProvider,
  splitRepository,
  MAX_COMMITS,
  MAX_CHECK_RUNS,
  MAX_STATUSES,
  MAX_POLICY_TEXT_BYTES,
  type GitHubProviderOptions,
} from './github/provider.js';
export {
  normalizeCheckConclusion,
  normalizeStatusState,
  checkRunToEvidence,
  commitStatusToEvidence,
  commitsToDcoEvidence,
  testResultsToEvidence,
  attestationToEvidence,
  securityScanToEvidence,
  claCheckToEvidence,
  parseSignoffs,
  type RawCheckRun,
  type RawCommitStatus,
  type RawTestResults,
  type RawAttestation,
  type RawSecurityScan,
  type RawClaCheck,
} from './evidence/normalize.js';