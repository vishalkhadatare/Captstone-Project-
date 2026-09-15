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
import { ErrorBoundary } from './components/ErrorBoundary';
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
    multi_paper_generator: 'multi-paper-generator',
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
    const requestedTab = matchedTab === 'proctor_dashboard' && (currentUser?.role === 'ORG_OWNER' || currentUser?.role === 'EXAM_MANAGER')
      ? 'dashboard'
      : matchedTab === 'dashboard' && currentUser?.role === 'SME'
      ? 'assigned_questions'
      : matchedTab;
    if (requestedTab) {
      setActiveSubTab(requestedTab);
      return;
    }
    setActiveSubTab(currentUser?.role === 'SME' ? 'assigned_questions' : 'dashboard');
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
    const initialTab: NavSubTab = user.role === 'SME' ? 'assigned_questions' : 'dashboard';
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
    <div className="min-h-screen bg-[#FAFCFA] dark:bg-[#080B11] text-slate-900 dark:text-slate-100 flex flex-col font-['Figtree',sans-serif] selection:bg-[#00cc5f] selection:text-black relative overflow-x-hidden transition-colors duration-300">
      {/* Background Ambient Glowing Wave Curves & Aurora */}
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden z-0"
        style={{
          top: '56px',
          filter: 'blur(10px) drop-shadow(0 0 25px rgba(0,255,119,0.3))',
          opacity: 0.32,
        }}
      >
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            backgroundImage: 'url(/curve-secondary.svg)',
            backgroundRepeat: 'repeat',
            backgroundPosition: '0 0',
          }}
        />
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            backgroundImage: 'url(/curve-primary.svg)',
            backgroundRepeat: 'repeat',
            backgroundPosition: '0 0',
          }}
        />
      </div>

      {/* Radiant Mint Ambient Halos (strandsagents.com style) */}
      <div
        className="fixed top-0 left-1/4 -translate-x-1/2 w-[900px] h-[500px] pointer-events-none z-0 opacity-40 dark:opacity-20 blur-[130px]"
        style={{
          background: 'radial-gradient(circle, rgba(0, 204, 95, 0.28) 0%, rgba(0, 220, 130, 0.12) 50%, transparent 75%)',
        }}
      />
      <div
        className="fixed bottom-0 right-10 w-[700px] h-[450px] pointer-events-none z-0 opacity-30 dark:opacity-15 blur-[120px]"
        style={{
          background: 'radial-gradient(circle, rgba(0, 204, 95, 0.22) 0%, transparent 70%)',
        }}
      />

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

        {/* Dynamic Operational Content View */}
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto space-y-6">
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
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Geometric Balance Frosted Glass Footer */}
      <footer className="h-10 bg-white/50 dark:bg-[#080B11]/50 backdrop-blur-2xl border-t border-slate-200/80 dark:border-white/10 flex items-center justify-between px-6 lg:px-8 text-[11px] text-[#64748B] dark:text-slate-400 font-medium relative z-10">
        <div className="flex items-center gap-4">
          <span className="font-bold text-[#0F172A] dark:text-white uppercase tracking-wider">
            Security: FIPS 140-2 AES-256-GCM / RSA-2048
          </span>
          <span className="text-slate-300 dark:text-white/20">|</span>
          <span className="font-mono text-[#475569] dark:text-slate-300">
            Immutable Audit Ledger Hash: SHA-256
          </span>
        </div>
        <p className="text-[#64748B] dark:text-slate-400">ZeroLeak © 2026 Educational Integrity Assurance System</p>
      </footer>
    </div>
  );
}

export default App;
