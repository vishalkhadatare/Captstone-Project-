import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canDelegateRole,
  canManageAuthority,
  evaluateDelegation,
  evaluateAuthorityManagement,
  getDelegatableRoles,
  getPermissionsForRole,
  hasPermission,
  isAuthorizationActive,
  planAuthorityAudit,
  DELEGATION_REASON,
  ROLE_PERMISSIONS,
} from './authority.ts';

// ---------------------------------------------------------------------------
// Allowed delegations
// ---------------------------------------------------------------------------

test('1. ORG_OWNER -> EXAM_MANAGER delegation succeeds', () => {
  assert.equal(canDelegateRole('ORG_OWNER', 'EXAM_MANAGER'), true);
  const decision = evaluateDelegation({ actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-a' });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, DELEGATION_REASON.ALLOWED);
});

test('2. ORG_OWNER -> AUDITOR delegation succeeds', () => {
  assert.equal(canDelegateRole('ORG_OWNER', 'AUDITOR'), true);
  assert.equal(evaluateDelegation({ actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetRole: 'AUDITOR', targetOrgId: 'org-a' }).allowed, true);
});

test('3. EXAM_MANAGER -> TRANSLATOR delegation succeeds', () => {
  assert.equal(canDelegateRole('EXAM_MANAGER', 'TRANSLATOR'), true);
  assert.equal(evaluateDelegation({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'TRANSLATOR', targetOrgId: 'org-a' }).allowed, true);
});

test('4. EXAM_MANAGER -> CENTRE_OPERATOR delegation succeeds', () => {
  assert.equal(canDelegateRole('EXAM_MANAGER', 'CENTRE_OPERATOR'), true);
  assert.equal(evaluateDelegation({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'CENTRE_OPERATOR', targetOrgId: 'org-a' }).allowed, true);
});

// ---------------------------------------------------------------------------
// Denied delegations
// ---------------------------------------------------------------------------

test('5. TRANSLATOR -> AUDITOR delegation fails (privilege escalation)', () => {
  assert.equal(canDelegateRole('TRANSLATOR', 'AUDITOR'), false);
  const decision = evaluateDelegation({ actorRole: 'TRANSLATOR', actorOrgId: 'org-a', targetRole: 'AUDITOR', targetOrgId: 'org-a' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, DELEGATION_REASON.PRIVILEGE_ESCALATION);
});

test('6. CENTRE_OPERATOR -> EXAM_MANAGER delegation fails (privilege escalation)', () => {
  assert.equal(canDelegateRole('CENTRE_OPERATOR', 'EXAM_MANAGER'), false);
  const decision = evaluateDelegation({ actorRole: 'CENTRE_OPERATOR', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-a' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, DELEGATION_REASON.PRIVILEGE_ESCALATION);
});

test('7. AUDITOR -> EXAM_MANAGER and AUDITOR -> ORG_OWNER both fail', () => {
  assert.equal(canDelegateRole('AUDITOR', 'EXAM_MANAGER'), false);
  assert.equal(canDelegateRole('AUDITOR', 'ORG_OWNER'), false);
  assert.equal(evaluateDelegation({ actorRole: 'AUDITOR', actorOrgId: 'org-a', targetRole: 'ORG_OWNER', targetOrgId: 'org-a' }).allowed, false);
});

// ---------------------------------------------------------------------------
// Cross-organization isolation
// ---------------------------------------------------------------------------

test('8. cross-organization delegation fails even when the role pairing is otherwise valid', () => {
  const decision = evaluateDelegation({ actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-b' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, DELEGATION_REASON.ORG_ISOLATION_VIOLATION);

  // Management across organizations is likewise denied.
  const mgmt = evaluateAuthorityManagement({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'TRANSLATOR', targetOrgId: 'org-b' });
  assert.equal(mgmt.allowed, false);
  assert.equal(mgmt.reason, DELEGATION_REASON.ORG_ISOLATION_VIOLATION);
});

// ---------------------------------------------------------------------------
// Self privilege escalation
// ---------------------------------------------------------------------------

test('9. self privilege escalation fails (no role may grant its own or a higher role)', () => {
  for (const role of ['ORG_OWNER', 'EXAM_MANAGER', 'TRANSLATOR', 'CENTRE_OPERATOR', 'AUDITOR'] as const) {
    const decision = evaluateDelegation({ actorRole: role, actorOrgId: 'org-a', targetRole: role, targetOrgId: 'org-a' });
    assert.equal(decision.allowed, false, `${role} must not grant its own role`);
    assert.equal(decision.reason, DELEGATION_REASON.PRIVILEGE_ESCALATION, `${role} self-grant is an escalation`);
  }
  assert.equal(evaluateDelegation({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'ORG_OWNER', targetOrgId: 'org-a' }).reason, DELEGATION_REASON.PRIVILEGE_ESCALATION);
});

// ---------------------------------------------------------------------------
// Revocation is enforced by backend authorization
// ---------------------------------------------------------------------------

test('10. revoked / suspended / pending authority cannot perform restricted operations', () => {
  assert.equal(isAuthorizationActive({ status: 'ACTIVE', authorization_status: 'AUTHORIZED' }), true);
  assert.equal(isAuthorizationActive({ status: 'SUSPENDED', authorization_status: 'REVOKED' }), false);
  assert.equal(isAuthorizationActive({ status: 'ACTIVE', authorization_status: 'REVOKED' }), false);
  assert.equal(isAuthorizationActive({ status: 'SUSPENDED', authorization_status: 'AUTHORIZED' }), false);
  assert.equal(isAuthorizationActive({ status: 'ACTIVE', authorization_status: 'PENDING' }), false);

  const mgmt = evaluateAuthorityManagement({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'TRANSLATOR', targetOrgId: 'org-a' });
  assert.equal(mgmt.allowed, true);
  assert.equal(isAuthorizationActive({ status: 'SUSPENDED', authorization_status: 'REVOKED' }), false);
});

// ---------------------------------------------------------------------------
// Audit events for important authority changes
// ---------------------------------------------------------------------------

test('11. audit events are planned for important authority changes', () => {
  const granted = evaluateDelegation({ actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-a' });
  const grantPlan = planAuthorityAudit(granted, 'GRANT');
  assert.deepEqual(grantPlan.audit, ['AUTHORITY_GRANTED', 'ROLE_ASSIGNED']);
  assert.equal(grantPlan.security.length, 0);

  const revokePlan = planAuthorityAudit({ allowed: true, reason: DELEGATION_REASON.ALLOWED, isEscalation: false }, 'REVOKE');
  assert.deepEqual(revokePlan.audit, ['AUTHORITY_REVOKED']);

  const restorePlan = planAuthorityAudit({ allowed: true, reason: DELEGATION_REASON.ALLOWED, isEscalation: false }, 'RESTORE');
  assert.deepEqual(restorePlan.audit, ['AUTHORITY_RESTORED']);

  const denied = evaluateDelegation({ actorRole: 'TRANSLATOR', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-a' });
  const deniedPlan = planAuthorityAudit(denied, 'GRANT');
  assert.deepEqual(deniedPlan.audit, ['UNAUTHORIZED_ROLE_ASSIGNMENT']);
  assert.equal(deniedPlan.security[0].event_type, 'PRIVILEGE_ESCALATION_ATTEMPT');
  assert.equal(deniedPlan.security[0].severity, 'HIGH');
});

// ---------------------------------------------------------------------------
// Supporting policy guarantees
// ---------------------------------------------------------------------------

test('12. delegatable role sets exactly match the specified hierarchy', () => {
  assert.deepEqual(getDelegatableRoles('ORG_OWNER'), ['EXAM_MANAGER', 'AUDITOR', 'TRANSLATOR', 'CENTRE_OPERATOR']);
  assert.deepEqual(getDelegatableRoles('EXAM_MANAGER'), ['TRANSLATOR', 'CENTRE_OPERATOR']);
  assert.deepEqual(getDelegatableRoles('TRANSLATOR'), []);
  assert.deepEqual(getDelegatableRoles('CENTRE_OPERATOR'), []);
  assert.deepEqual(getDelegatableRoles('AUDITOR'), []);
});

test('13. authority management follows the hierarchy and never reaches ORG_OWNER', () => {
  assert.equal(canManageAuthority('ORG_OWNER', 'EXAM_MANAGER'), true);
  assert.equal(canManageAuthority('ORG_OWNER', 'TRANSLATOR'), true);
  assert.equal(canManageAuthority('ORG_OWNER', 'ORG_OWNER'), false);
  assert.equal(canManageAuthority('EXAM_MANAGER', 'TRANSLATOR'), true);
  assert.equal(canManageAuthority('EXAM_MANAGER', 'EXAM_MANAGER'), false);
  assert.equal(canManageAuthority('EXAM_MANAGER', 'AUDITOR'), false);
  assert.equal(canManageAuthority('TRANSLATOR', 'CENTRE_OPERATOR'), false);
  assert.equal(canManageAuthority('AUDITOR', 'TRANSLATOR'), false);
});

test('14. least privilege: no role holds an unrestricted admin/wildcard permission', () => {
  for (const role of Object.keys(ROLE_PERMISSIONS)) {
    const perms = getPermissionsForRole(role);
    assert.ok(perms.length > 0, `${role} must have explicit permissions`);
    assert.ok(!perms.includes('*'), `${role} must not have wildcard permission`);
    assert.ok(!perms.some(p => p.endsWith(':*') || p === 'admin'), `${role} must not have admin/wildcard`);
  }
  assert.equal(hasPermission('EXAM_MANAGER', 'questions:verify'), true);
  assert.equal(hasPermission('TRANSLATOR', 'translations:submit'), true);
  assert.equal(hasPermission('CENTRE_OPERATOR', 'delivery:print'), true);
  assert.equal(hasPermission('CENTRE_OPERATOR', 'authority:delegate'), false);
  assert.equal(hasPermission('AUDITOR', 'audit:view'), true);
  assert.equal(hasPermission('AUDITOR', 'authority:delegate'), false);
});
