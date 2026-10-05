import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavSubTab } from './components/Sidebar';
import { PublicLanding } from './components/PublicLanding';
import { LoginPage } from './components/LoginPage';
import { OrgRegistrationPage } from './components/OrgRegistrationPage';
import { PersonnelRegistrationPage } from './components/PersonnelRegistrationPage';
import { OrgOwnerWorkspace } from './components/workspaces/OrgOwnerWorkspace';
import { ExamManagerWorkspace } from './components/workspaces/ExamManagerWorkspace';
import { TranslatorWorkspace } from './components/workspaces/TranslatorWorkspace';
import { CentreOperatorWorkspace } from './components/workspaces/CentreOperatorWorkspace';
import { AuditorWorkspace } from './components/workspaces/AuditorWorkspace';
import { UserProfileSettings } from './components/workspaces/UserProfileSettings';
import { DeviceApprovalModal } from './components/DeviceApprovalModal';
import { CandidateExamPortal } from './components/proctor/CandidateExamPortal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { User } from './types';
import { api, getStoredUser, clearStoredAuth, setStoredAuth, DEVICE_APPROVAL_EVENT } from './api';

type PublicView = 'landing' | 'login' | 'register' | 'personnel_register' | 'candidate_exam';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(getStoredUser());
  const [publicView, setPublicView] = useState<PublicView>('landing');
  const [personnelRole, setPersonnelRole] = useState<'TRANSLATOR' | 'CENTRE_OPERATOR' | undefined>(undefined);
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
    question_workflow: 'competitive-examination',
    question_pools: 'question-pools',
    blueprint_pattern: 'competitive-examination',
    paper_generation: 'paper-generation',
    multi_paper_generator: 'multi-paper-generator',
    paper_versions: 'paper-versions',
    examination_centres: 'examination-centres',
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
    if (hash === 'question-workflow' || hash === 'blueprint-pattern') {
      setActiveSubTab('question_workflow');
      return;
    }
    const matchedTab = (Object.entries(tabToHashMap) as [NavSubTab, string][]).find(([, value]) => value === hash)?.[0];
    const requestedTab = matchedTab === 'proctor_dashboard' && (currentUser?.role === 'ORG_OWNER' || currentUser?.role === 'EXAM_MANAGER')
      ? 'dashboard'
      : matchedTab;
    if (requestedTab) {
      setActiveSubTab(requestedTab);
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
  }, [currentUser]);

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
    const initialTab: NavSubTab = 'dashboard';
    setActiveSubTab(initialTab);
    window.history.pushState({}, '', `${window.location.pathname}${window.location.search}#${tabToHashMap[initialTab]}`);
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
    <div
      className="min-h-screen text-[#102A38] flex flex-col font-['Figtree',sans-serif] selection:bg-[#00A878] selection:text-white relative overflow-x-hidden bg-[#F5F8FA] transition-colors duration-300"
    >
      {/* Subtle Enterprise Ambient Tint & Neutral Technical Grid */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Subtle Blue/Emerald Radial Highlight */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[480px] opacity-60 blur-[150px]"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(0, 168, 120, 0.04) 0%, rgba(38, 114, 184, 0.03) 50%, transparent 80%)',
          }}
        />
        {/* Barely visible technical dot grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(#78909C 1.2px, transparent 1.2px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

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
        onNavigateTab={(tab) => routeToTab(tab)}
      />

      {/* Main Two-Column Layout */}
      <div className="flex-1 flex flex-col lg:flex-row w-full relative z-10">
        {/* Role-Specific Light Academic Sidebar */}
        <Sidebar
          activeSubTab={activeSubTab}
          onSelectSubTab={(tab) => routeToTab(tab)}
          userRole={currentUser.role}
          onLogout={handleLogout}
        />

        {/* Dynamic Operational Content View (Scale Increased: 1400px max-width, 28-36px padding) */}
        <main className="flex-1 p-7 sm:p-8 lg:p-9 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto space-y-6">
            <ErrorBoundary fallbackTitle="Workspace Interface Interrupted">
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
                  onSelectSubTab={(tab) => routeToTab(tab)}
                  onLaunchCandidateSimulator={(examId) => {
                    setCandidateSimulatorExamId(examId);
                    setActiveCandidateSimulator(true);
                  }}
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
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Light Enterprise Security Footer */}
      <footer className="h-10 bg-white/90 backdrop-blur-md border-t border-[#E5ECE9] flex items-center justify-between px-6 lg:px-8 text-[11px] text-[#5F7074] font-medium relative z-10">
        <div className="flex items-center gap-4">
          <span className="font-bold text-[#172A35] uppercase tracking-wider">
            Security: FIPS 140-2 AES-256-GCM / RSA-2048
          </span>
          <span className="text-[#CBD8D5]">|</span>
          <span className="font-mono text-[#5F7074]">
            Immutable Audit Ledger Hash: SHA-256
          </span>
        </div>
        <p className="text-[#5F7074]">ZeroLeak © 2026 Educational Integrity Assurance System</p>
      </footer>
    </div>
  );
}

export default App;
