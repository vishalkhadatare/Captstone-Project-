import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavSubTab } from './components/Sidebar';
import { PublicLanding } from './components/PublicLanding';
import { LoginPage } from './components/LoginPage';
import { OrgRegistrationPage } from './components/OrgRegistrationPage';
import { PersonnelRegistrationPage } from './components/PersonnelRegistrationPage';
import { OrgOwnerWorkspace } from './components/workspaces/OrgOwnerWorkspace';
import { ExamManagerWorkspace } from './components/workspaces/ExamManagerWorkspace';
import { SmeWorkspace } from './components/workspaces/SmeWorkspace';
import { TranslatorWorkspace } from './components/workspaces/TranslatorWorkspace';
import { CentreOperatorWorkspace } from './components/workspaces/CentreOperatorWorkspace';
import { AuditorWorkspace } from './components/workspaces/AuditorWorkspace';
import { UserProfileSettings } from './components/workspaces/UserProfileSettings';
import { DeviceApprovalModal } from './components/DeviceApprovalModal';
import { CandidateExamPortal } from './components/proctor/CandidateExamPortal';
import { User } from './types';
import { api, getStoredUser, clearStoredAuth, setStoredAuth, DEVICE_APPROVAL_EVENT } from './api';

type PublicView = 'landing' | 'login' | 'register' | 'personnel_register' | 'candidate_exam';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(getStoredUser());
  const [publicView, setPublicView] = useState<PublicView>('landing');
  const [personnelRole, setPersonnelRole] = useState<'SME' | 'TRANSLATOR' | 'CENTRE_OPERATOR' | undefined>(undefined);
  const [activeSubTab, setActiveSubTab] = useState<NavSubTab>('dashboard');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [candidateSimulatorExamId, setCandidateSimulatorExamId] = useState<string | undefined>(undefined);
  const [activeCandidateSimulator, setActiveCandidateSimulator] = useState(false);
  const [pendingDeviceApprovalModal, setPendingDeviceApprovalModal] = useState<{
    isOpen: boolean;
    deviceId?: string;
    userName?: string;
    userEmail?: string;
  }>({ isOpen: false });

  const tabToHashMap: Record<NavSubTab, string> = {
    dashboard: 'dashboard',
    profile: 'profile',
    security_settings: 'security-settings',
    security_events: 'security-events',
    org_profile: 'org-profile',
    verification_status: 'verification-status',
    documents: 'documents',
    authorized_managers: 'authorized-managers',
    trusted_devices: 'trusted-devices',
    all_examinations: 'all-examinations',
    create_examination: 'create-examination',
    question_workflow: 'question-workflow',
    question_pools: 'question-pools',
    blueprint_pattern: 'blueprint-pattern',
    paper_generation: 'paper-generation',
    paper_versions: 'paper-versions',
    examination_centres: 'examination-centres',
    assigned_questions: 'assigned-questions',
    question_verification: 'question-verification',
    translation_tasks: 'translation-tasks',
    verification_history: 'verification-history',
    released_examinations: 'released-examinations',
    secure_viewer: 'secure-viewer',
    print_management: 'print-management',
    device_status: 'device-status',
    audit_trail: 'audit-trail',
    login_history: 'login-history',
    paper_events: 'paper-events',
    printing_events: 'printing-events',
    regeneration_events: 'regeneration-events',
    proctor_dashboard: 'proctor-dashboard',
  };

  const routeToTab = (tab: NavSubTab): void => {
    setActiveSubTab(tab);
    const targetHash = tabToHashMap[tab] ?? 'dashboard';
    const nextUrl = `${window.location.pathname}${window.location.search}#${targetHash}`;
    window.history.pushState({}, '', nextUrl);
  };

  const navigateToProfileEntry = () => {
    routeToTab('profile');
  };

  const syncTabFromLocation = () => {
    const hash = window.location.hash.replace(/^#\/?/, '').replace(/^#/, '');
    const matchedTab = (Object.entries(tabToHashMap) as [NavSubTab, string][]).find(([, value]) => value === hash)?.[0];
    if (matchedTab) {
      setActiveSubTab(matchedTab);
      return;
    }
    setActiveSubTab('dashboard');
  };

  useEffect(() => {
    bootstrapSession();
  }, []);

  useEffect(() => {
    syncTabFromLocation();
    window.addEventListener('popstate', syncTabFromLocation);
    return () => window.removeEventListener('popstate', syncTabFromLocation);
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const handlePendingApprovalEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      handlePendingDeviceApprovalError({ details: detail });
    };

    window.addEventListener(DEVICE_APPROVAL_EVENT, handlePendingApprovalEvent as EventListener);
    return () => {
      window.removeEventListener(DEVICE_APPROVAL_EVENT, handlePendingApprovalEvent as EventListener);
    };
  }, [currentUser]);

  const bootstrapSession = async () => {
    setSessionLoading(true);
    try {
      const res = await api.getMe();
      setCurrentUser(res.user);
    } catch {
      // Clear expired local token
      clearStoredAuth();
      setCurrentUser(null);
    } finally {
      setSessionLoading(false);
    }
  };

  const handleLoginSuccess = (user: User, token: string) => {
    setStoredAuth(token, user);
    setCurrentUser(user);
    setActiveSubTab('dashboard');
    window.history.pushState({}, '', `${window.location.pathname}${window.location.search}#dashboard`);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleLogout = () => {
    clearStoredAuth();
    setCurrentUser(null);
    setPublicView('landing');
    setActiveSubTab('dashboard');
    window.history.pushState({}, '', `${window.location.pathname}${window.location.search}`);
  };

  const handleRefreshData = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handlePendingDeviceApprovalError = (error: any) => {
    const details = error?.details || {};
    setPendingDeviceApprovalModal({
      isOpen: true,
      deviceId: details.device_id || 'Unknown',
      userName: currentUser?.full_name || 'User',
      userEmail: currentUser?.email || 'unknown@example.com',
    });
  };

  // If candidate simulator is active for logged-in staff
  if (activeCandidateSimulator) {
    return (
      <CandidateExamPortal
        onBackToLanding={() => {
          setActiveCandidateSimulator(false);
          setCandidateSimulatorExamId(undefined);
        }}
        preSelectedExamId={candidateSimulatorExamId}
      />
    );
  }

  // If user is not logged in, show Public views (Landing, Login, Register, or Candidate Exam Portal)
  if (!currentUser) {
    if (publicView === 'candidate_exam') {
      return (
        <CandidateExamPortal
          onBackToLanding={() => {
            setPublicView('landing');
            setCandidateSimulatorExamId(undefined);
          }}
          preSelectedExamId={candidateSimulatorExamId}
        />
      );
    }

    if (publicView === 'register') {
      return (
        <OrgRegistrationPage
          onBackToLanding={() => setPublicView('landing')}
          onLoginRedirect={() => setPublicView('login')}
          onRegistrationSuccess={handleLoginSuccess}
        />
      );
    }

    if (publicView === 'personnel_register') {
      return (
        <PersonnelRegistrationPage
          preSelectedRole={personnelRole}
          onBackToLanding={() => setPublicView('landing')}
          onLoginRedirect={() => setPublicView('login')}
          onNavigateLogin={() => setPublicView('login')}
          onRegistrationSuccess={handleLoginSuccess}
        />
      );
    }

    if (publicView === 'login') {
      return (
        <LoginPage
          onBackToLanding={() => setPublicView('landing')}
          onRegisterRedirect={() => setPublicView('register')}
          onOpenPersonnelRegister={(role) => {
            setPersonnelRole(role);
            setPublicView('personnel_register');
          }}
          onLoginSuccess={handleLoginSuccess}
        />
      );
    }

    return (
      <PublicLanding
        onOpenLogin={() => setPublicView('login')}
        onOpenRegister={() => setPublicView('register')}
        onOpenPersonnelRegister={(role) => {
          setPersonnelRole(role);
          setPublicView('personnel_register');
        }}
      />
    );
  }

  // Logged-in User Dashboard Workspace
  return (
    <div className="min-h-screen cyber-mesh-bg text-slate-900 flex flex-col font-sans selection:bg-emerald-800 selection:text-white">
      {/* Device Approval Modal */}
      <DeviceApprovalModal
        isOpen={pendingDeviceApprovalModal.isOpen}
        deviceId={pendingDeviceApprovalModal.deviceId}
        userName={pendingDeviceApprovalModal.userName}
        userEmail={pendingDeviceApprovalModal.userEmail}
        onClose={() => setPendingDeviceApprovalModal({ isOpen: false })}
      />

      {/* Official ZeroLeak Header */}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        onNavigateProfile={navigateToProfileEntry}
      />

      {/* Main Two-Column Layout */}
      <div className="flex-1 flex flex-col lg:flex-row w-full">
        {/* Role-Specific Light Academic Sidebar */}
        <Sidebar
          activeSubTab={activeSubTab}
          onSelectSubTab={(tab) => routeToTab(tab)}
          userRole={currentUser.role}
          onLogout={handleLogout}
        />

        {/* Dynamic Operational Content View */}
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* User Profile & Security Settings */}
            {(activeSubTab === 'profile' || activeSubTab === 'security_settings') ? (
              <UserProfileSettings
                key={`profile-${refreshTrigger}`}
                currentUser={currentUser}
                activeSubTab={activeSubTab}
                onLogout={handleLogout}
              />
            ) : currentUser.role === 'ORG_OWNER' ? (
              <OrgOwnerWorkspace
                key={`owner-${refreshTrigger}`}
                currentUser={currentUser}
                activeSubTab={activeSubTab}
                onRefresh={handleRefreshData}
                onSwitchUser={handleLoginSuccess}
              />
            ) : currentUser.role === 'EXAM_MANAGER' ? (
              <ExamManagerWorkspace
                key={`manager-${refreshTrigger}`}
                currentUser={currentUser}
                activeSubTab={activeSubTab}
                onRefresh={handleRefreshData}
                onLaunchCandidateSimulator={(examId) => {
                  setCandidateSimulatorExamId(examId);
                  setActiveCandidateSimulator(true);
                }}
              />
            ) : currentUser.role === 'SME' ? (
              <SmeWorkspace
                key={`sme-${refreshTrigger}`}
                currentUser={currentUser}
                activeSubTab={activeSubTab}
                onRefresh={handleRefreshData}
              />
            ) : currentUser.role === 'TRANSLATOR' ? (
              <TranslatorWorkspace
                key={`translator-${refreshTrigger}`}
                currentUser={currentUser}
                activeSubTab={activeSubTab}
                onRefresh={handleRefreshData}
              />
            ) : currentUser.role === 'CENTRE_OPERATOR' ? (
              <CentreOperatorWorkspace
                key={`operator-${refreshTrigger}`}
                currentUser={currentUser}
                activeSubTab={activeSubTab}
                onRefresh={handleRefreshData}
              />
            ) : currentUser.role === 'AUDITOR' ? (
              <AuditorWorkspace
                key={`auditor-${refreshTrigger}`}
                currentUser={currentUser}
                activeSubTab={activeSubTab}
                onRefresh={handleRefreshData}
              />
            ) : null}
          </div>
        </main>
      </div>

      {/* Geometric Balance Light Footer */}
      <footer className="h-9 bg-white border-t border-[#E2E8F0] flex items-center justify-between px-6 lg:px-8 text-[11px] text-[#64748B] font-medium">
        <div className="flex items-center gap-4">
          <span className="font-bold text-[#0F172A] uppercase tracking-wider">
            Security: FIPS 140-2 AES-256-GCM / RSA-2048
          </span>
          <span className="text-[#CBD5E1]">|</span>
          <span className="font-mono text-[#475569]">
            Immutable Audit Ledger Hash: SHA-256
          </span>
        </div>
        <p className="text-[#64748B]">ZeroLeak © 2026 Educational Integrity Assurance System</p>
      </footer>
    </div>
  );
}

export default App;
