import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavSubTab } from './components/Sidebar';
import { PublicLanding } from './components/PublicLanding';
import { LoginPage } from './components/LoginPage';
import { OrgRegistrationPage } from './components/OrgRegistrationPage';
import { OrgOwnerWorkspace } from './components/workspaces/OrgOwnerWorkspace';
import { ExamManagerWorkspace } from './components/workspaces/ExamManagerWorkspace';
import { SmeWorkspace } from './components/workspaces/SmeWorkspace';
import { TranslatorWorkspace } from './components/workspaces/TranslatorWorkspace';
import { CentreOperatorWorkspace } from './components/workspaces/CentreOperatorWorkspace';
import { AuditorWorkspace } from './components/workspaces/AuditorWorkspace';
import { UserProfileSettings } from './components/workspaces/UserProfileSettings';
import { User } from './types';
import { api, getStoredUser, clearStoredAuth, setStoredAuth } from './api';

type PublicView = 'landing' | 'login' | 'register';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(getStoredUser());
  const [publicView, setPublicView] = useState<PublicView>('landing');
  const [activeSubTab, setActiveSubTab] = useState<NavSubTab>('dashboard');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    bootstrapSession();
  }, []);

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
    setRefreshTrigger(prev => prev + 1);
  };

  const handleLogout = () => {
    clearStoredAuth();
    setCurrentUser(null);
    setPublicView('landing');
    setActiveSubTab('dashboard');
  };

  const handleRefreshData = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // If user is not logged in, show Public views (Landing, Login, or Register)
  if (!currentUser) {
    if (publicView === 'register') {
      return (
        <OrgRegistrationPage
          onBackToLanding={() => setPublicView('landing')}
          onLoginRedirect={() => setPublicView('login')}
          onRegistrationSuccess={handleLoginSuccess}
        />
      );
    }

    if (publicView === 'login') {
      return (
        <LoginPage
          onBackToLanding={() => setPublicView('landing')}
          onRegisterRedirect={() => setPublicView('register')}
          onLoginSuccess={handleLoginSuccess}
        />
      );
    }

    return (
      <PublicLanding
        onOpenLogin={() => setPublicView('login')}
        onOpenRegister={() => setPublicView('register')}
      />
    );
  }

  // Logged-in User Dashboard Workspace
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-emerald-900 selection:text-white">
      {/* Official ZeroLeak Header */}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenSettings={() => setActiveSubTab('profile')}
        onRefreshData={handleRefreshData}
      />

      {/* Main Two-Column Layout */}
      <div className="flex-1 flex flex-col lg:flex-row w-full">
        {/* Role-Specific Light Academic Sidebar */}
        <Sidebar
          activeSubTab={activeSubTab}
          onSelectSubTab={setActiveSubTab}
          userRole={currentUser.role}
        />

        {/* Dynamic Operational Content View */}
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto bg-slate-50">
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
              />
            ) : currentUser.role === 'EXAM_MANAGER' ? (
              <ExamManagerWorkspace
                key={`manager-${refreshTrigger}`}
                currentUser={currentUser}
                activeSubTab={activeSubTab}
                onRefresh={handleRefreshData}
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
      <footer className="h-9 bg-white border-t border-slate-200 flex items-center justify-between px-6 lg:px-8 text-[11px] text-slate-500 font-medium">
        <div className="flex items-center gap-4">
          <span className="font-bold text-slate-700 uppercase tracking-wider">
            Security: FIPS 140-2 AES-256-GCM / RSA-2048
          </span>
          <span className="text-slate-300">|</span>
          <span className="font-mono text-slate-600">
            Immutable Audit Ledger Hash: SHA-256
          </span>
        </div>
        <p className="text-slate-500">ZeroLeak © 2026 Educational Integrity Assurance System</p>
      </footer>
    </div>
  );
}

export default App;
