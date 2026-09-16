/**
 * Task 4 — Role Hierarchy & Delegated Authority
 *
 * Centralized, dependency-free authorization policy for delegated authority.
 * Kept as pure functions (mirroring server/deviceBinding.ts) so the rules can be
 * unit-tested without a database or HTTP server, and reused by server.ts as the
 * single source of truth for who may grant / manage / hold which authority.
 *
 * Conceptual hierarchy (from the project specification):
 *
 *   ORG_OWNER
 *     ├─> EXAM_MANAGER
 *     │     ├─> TRANSLATOR
 *     │     └─> CENTRE_OPERATOR
 *     └─> AUDITOR
 *
 * Delegation is strict: a role may only grant the specific roles listed for it,
 * and never a role of equal-or-higher authority than itself (privilege escalation).
 */

export type AuthorityRole =
  | 'ORG_OWNER'
  | 'EXAM_MANAGER'
  | 'TRANSLATOR'
  | 'CENTRE_OPERATOR'
  | 'AUDITOR';

export const ALL_ROLES: AuthorityRole[] = [
  'ORG_OWNER',
  'EXAM_MANAGER',
  'AUDITOR',
  'TRANSLATOR',
  'CENTRE_OPERATOR',
];

/**
 * Relative authority rank. Higher = more authority. Used only to distinguish a
 * privilege-escalation attempt (granting an equal-or-higher role) from a plain
 * hierarchy violation (granting a lower role you are simply not allowed to grant
 * directly, e.g. ORG_OWNER trying to skip EXAM_MANAGER to create an operator).
 */
export const ROLE_RANK: Record<AuthorityRole, number> = {
  ORG_OWNER: 100,
  EXAM_MANAGER: 70,
  AUDITOR: 70,
  TRANSLATOR: 40,
  CENTRE_OPERATOR: 40,
};

/**
 * The explicit delegation graph: which roles each role is permitted to GRANT.
 * Anything not listed here is denied. Lower-level roles grant nothing, so they
 * can never escalate themselves or others.
 */
export const ROLE_DELEGATIONS: Record<AuthorityRole, AuthorityRole[]> = {
  ORG_OWNER: ['EXAM_MANAGER', 'AUDITOR', 'TRANSLATOR', 'CENTRE_OPERATOR'],
  EXAM_MANAGER: ['TRANSLATOR', 'CENTRE_OPERATOR'],
  AUDITOR: [],
  TRANSLATOR: [],
  CENTRE_OPERATOR: [],
};

/**
 * Least-privilege permission sets. Each role receives only the permissions
 * required for its work — no role (not even ORG_OWNER) receives an unrestricted
 * "admin: *" wildcard. Strings are resource:action; they are advisory metadata
 * that the delegation/management policy is built on and that the API surfaces.
 */
export const ROLE_PERMISSIONS: Record<AuthorityRole, string[]> = {
  ORG_OWNER: [
    'organization:manage',
    'organization:verify',
    'authority:delegate',
    'authority:revoke',
    'authority:restore',
    'authority:view',
    'devices:manage',
    'members:view',
    'audit:view',
    'security:view',
  ],
  EXAM_MANAGER: [
    'examination:manage',
    'examination:configure',
    'paper:generate',
    'paper:manage',
    'questions:manage',
    'questions:assign',
    'questions:author',
    'questions:verify',
    'centre:manage',
    'authority:delegate',
    'authority:revoke',
    'authority:restore',
    'authority:view',
    'members:view',
  ],
  TRANSLATOR: ['translations:manage', 'translations:submit', 'assignments:view'],
  CENTRE_OPERATOR: ['delivery:view', 'delivery:print', 'centre:operate'],
  AUDITOR: ['audit:view', 'security:view', 'devices:view', 'authority:view', 'members:view'],
};

/** Authority lifecycle states (reuses the existing authorization_status column). */
export const AUTHORITY_STATUS = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  REVOKED: 'REVOKED',
} as const;
export type AuthorityStatus = (typeof AUTHORITY_STATUS)[keyof typeof AUTHORITY_STATUS];

export const DELEGATION_REASON = {
  ALLOWED: 'ALLOWED',
  INVALID_ROLE: 'INVALID_ROLE',
  ORG_ISOLATION_VIOLATION: 'ORG_ISOLATION_VIOLATION',
  PRIVILEGE_ESCALATION: 'PRIVILEGE_ESCALATION',
  ROLE_HIERARCHY_VIOLATION: 'ROLE_HIERARCHY_VIOLATION',
} as const;
export type DelegationReason = (typeof DELEGATION_REASON)[keyof typeof DELEGATION_REASON];

export interface DelegationDecision {
  allowed: boolean;
  reason: DelegationReason;
  /** True when the denial is specifically an attempt to grab equal-or-higher authority. */
  isEscalation: boolean;
}

export function isAuthorityRole(role: string | null | undefined): role is AuthorityRole {
  return !!role && (ALL_ROLES as string[]).includes(role);
}

/** Roles the given actor role is permitted to grant. Unknown roles grant nothing. */
export function getDelegatableRoles(actorRole: string): AuthorityRole[] {
  return isAuthorityRole(actorRole) ? [...ROLE_DELEGATIONS[actorRole]] : [];
}

/** Whether `actorRole` may directly grant `targetRole` per the strict hierarchy. */
export function canDelegateRole(actorRole: string, targetRole: string): boolean {
  return getDelegatableRoles(actorRole).includes(targetRole as AuthorityRole);
}

function rankOf(role: string): number {
  return isAuthorityRole(role) ? ROLE_RANK[role] : 0;
}

/**
 * Full delegation (role-grant) evaluation, including organization isolation and
 * privilege-escalation detection. This is the authoritative check for "assign role".
 *
 * Organization isolation: authority is never granted across organizations. When a
 * targetOrgId is supplied it must equal the actor's org. Callers must derive the
 * actor org from the authenticated session, never from client-supplied input.
 */
export function evaluateDelegation(params: {
  actorRole: string;
  actorOrgId: string;
  targetRole: string;
  targetOrgId?: string;
}): DelegationDecision {
  const { actorRole, actorOrgId, targetRole, targetOrgId } = params;

  if (!isAuthorityRole(targetRole)) {
    return { allowed: false, reason: DELEGATION_REASON.INVALID_ROLE, isEscalation: false };
  }

  // Organization isolation — cross-organization delegation is always denied.
  if (targetOrgId !== undefined && targetOrgId !== actorOrgId) {
    return { allowed: false, reason: DELEGATION_REASON.ORG_ISOLATION_VIOLATION, isEscalation: false };
  }

  if (canDelegateRole(actorRole, targetRole)) {
    return { allowed: true, reason: DELEGATION_REASON.ALLOWED, isEscalation: false };
  }

  const isEscalation = rankOf(targetRole) >= rankOf(actorRole);
  return {
    allowed: false,
    reason: isEscalation ? DELEGATION_REASON.PRIVILEGE_ESCALATION : DELEGATION_REASON.ROLE_HIERARCHY_VIOLATION,
    isEscalation,
  };
}

/**
 * Whether `actorRole` may manage (revoke / restore / approve) authority for a user
 * holding `targetRole`. ORG_OWNER may manage every subordinate in its own org;
 * EXAM_MANAGER may manage only the roles it delegates. Nobody may manage an
 * ORG_OWNER through delegated authority.
 */
export function canManageAuthority(actorRole: string, targetRole: string): boolean {
  if (!isAuthorityRole(actorRole) || !isAuthorityRole(targetRole)) return false;
  if (targetRole === 'ORG_OWNER') return false;
  if (actorRole === 'ORG_OWNER') return true;
  if (actorRole === 'EXAM_MANAGER') return ROLE_DELEGATIONS.EXAM_MANAGER.includes(targetRole);
  return false;
}

/**
 * Full authority-management evaluation (revoke / restore / approve), including
 * organization isolation and escalation detection.
 */
export function evaluateAuthorityManagement(params: {
  actorRole: string;
  actorOrgId: string;
  targetRole: string;
  targetOrgId: string;
}): DelegationDecision {
  const { actorRole, actorOrgId, targetRole, targetOrgId } = params;

  if (!isAuthorityRole(targetRole)) {
    return { allowed: false, reason: DELEGATION_REASON.INVALID_ROLE, isEscalation: false };
  }
  if (targetOrgId !== actorOrgId) {
    return { allowed: false, reason: DELEGATION_REASON.ORG_ISOLATION_VIOLATION, isEscalation: false };
  }
  if (canManageAuthority(actorRole, targetRole)) {
    return { allowed: true, reason: DELEGATION_REASON.ALLOWED, isEscalation: false };
  }
  const isEscalation = rankOf(targetRole) >= rankOf(actorRole);
  return {
    allowed: false,
    reason: isEscalation ? DELEGATION_REASON.PRIVILEGE_ESCALATION : DELEGATION_REASON.ROLE_HIERARCHY_VIOLATION,
    isEscalation,
  };
}

export function getPermissionsForRole(role: string): string[] {
  return isAuthorityRole(role) ? [...ROLE_PERMISSIONS[role]] : [];
}

export function hasPermission(role: string, permission: string): boolean {
  return getPermissionsForRole(role).includes(permission);
}

/**
 * Whether a stored user record currently holds active authority. A user whose
 * authority is REVOKED / SUSPENDED / still PENDING (never approved) is inactive
 * and must be rejected by backend authorization regardless of any valid session
 * token — revocation must never rely on frontend state.
 */
export function isAuthorizationActive(row: {
  status?: string | null;
  authorization_status?: string | null;
}): boolean {
  const authz = (row.authorization_status || AUTHORITY_STATUS.AUTHORIZED).toUpperCase();
  const status = (row.status || 'ACTIVE').toUpperCase();
  if (authz === 'REVOKED' || authz === 'SUSPENDED' || authz === 'PENDING') return false;
  if (status === 'SUSPENDED' || status === 'REVOKED' || status === 'INACTIVE' || status === 'DISABLED') return false;
  return true;
}

export interface AuthorityAuditPlan {
  /** audit_events event types to record (immutable audit ledger). */
  audit: string[];
  /** security_events to raise for denied/escalation attempts. */
  security: { event_type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }[];
}

export type AuthorityAction = 'GRANT' | 'REVOKE' | 'RESTORE' | 'APPROVE';

/**
 * Given an evaluated decision and the action attempted, determine which audit and
 * security events must be recorded. Centralizing this keeps the audit vocabulary
 * consistent and lets the required events be unit-tested independently of the DB.
 */
export function planAuthorityAudit(decision: DelegationDecision, action: AuthorityAction): AuthorityAuditPlan {
  if (decision.allowed) {
    switch (action) {
      case 'GRANT':
        return { audit: ['AUTHORITY_GRANTED', 'ROLE_ASSIGNED'], security: [] };
      case 'APPROVE':
        return { audit: ['AUTHORITY_GRANTED'], security: [] };
      case 'REVOKE':
        return { audit: ['AUTHORITY_REVOKED'], security: [] };
      case 'RESTORE':
        return { audit: ['AUTHORITY_RESTORED'], security: [] };
    }
  }
  const security: AuthorityAuditPlan['security'] = decision.isEscalation
    ? [{ event_type: 'PRIVILEGE_ESCALATION_ATTEMPT', severity: 'HIGH' }]
    : [];
  return { audit: ['UNAUTHORIZED_ROLE_ASSIGNMENT'], security };
}

/** Serializable description of the authority model, for the "view delegated authority" API. */
export function describeAuthorityModel() {
  return {
    hierarchy: {
      ORG_OWNER: { delegates: ROLE_DELEGATIONS.ORG_OWNER },
      EXAM_MANAGER: { delegates: ROLE_DELEGATIONS.EXAM_MANAGER },
      AUDITOR: { delegates: ROLE_DELEGATIONS.AUDITOR },
      TRANSLATOR: { delegates: ROLE_DELEGATIONS.TRANSLATOR },
      CENTRE_OPERATOR: { delegates: ROLE_DELEGATIONS.CENTRE_OPERATOR },
    },
    permissions: ROLE_PERMISSIONS,
    ranks: ROLE_RANK,
    statuses: AUTHORITY_STATUS,
  };
}
