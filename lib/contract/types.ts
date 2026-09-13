export type ProjectStatus =
  | "DRAFT"
  | "SAFE"
  | "CHECKING"
  | "RESTRICTED"
  | "RECOVERY_PENDING"
  | "RECOVERED"
  | "RETIRED";

export type SafetyFinding =
  | "CLEAN"
  | "COMPROMISED"
  | "IMPERSONATED"
  | "STALE_RELEASE"
  | "INCIDENT_DECLARED"
  | "INCONCLUSIVE"
  | "UNAVAILABLE";

export type FrontendIdentity = "MATCH" | "MISMATCH" | "UNCLEAR";
export type ReleaseRelation = "CURRENT" | "STALE" | "UNRELATED" | "UNCLEAR";
export type IncidentState = "NONE" | "ACTIVE" | "RESOLVED" | "UNCLEAR";
export type AddressRelation = "MATCH" | "MISMATCH" | "NOT_VISIBLE" | "UNCLEAR";

export interface EvidenceItem {
  source: "frontend" | "release" | "incident";
  excerpt: string;
}

export interface StructuredFinding {
  finding: SafetyFinding;
  frontend_identity: FrontendIdentity;
  release_relation: ReleaseRelation;
  incident_state: IncidentState;
  expected_address_relation: AddressRelation;
  evidence: EvidenceItem[];
  reason: string;
}

export interface ProjectRecord {
  project_id: string;
  owner: string;
  name: string;
  status: ProjectStatus;
  frontend_url: string;
  release_url: string;
  incident_url: string;
  source_domains: string[];
  expected_address: string;
  check_cooldown_seconds: number;
  stale_release_policy: "RESTRICTED" | "RECOVERY_PENDING";
  unavailable_policy: "RESTRICTED" | "RECOVERY_PENDING";
  created_at: number;
  activated_at: number | null;
  version: number;
  last_finding: SafetyFinding | null;
  recovery_pending: boolean;
}

export interface CheckHistoryRecord {
  type: "CHECK" | "RECOVERY_SUBMITTED" | "RECOVERY_CHECK" | "PROMOTED_SAFE";
  at: number;
  [key: string]: unknown;
}
