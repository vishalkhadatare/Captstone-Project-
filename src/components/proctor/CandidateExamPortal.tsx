import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  KeyRound,
  FileText,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Award,
  Hash,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { api } from '../../api';
import { ProctorCandidateExam, CandidateQuestion } from '../../types';
import { ProctorPreExamCheck } from './ProctorPreExamCheck';
import { ProctorExamInterface } from './ProctorExamInterface';

interface CandidateExamPortalProps {
  onBackToLanding: () => void;
  preSelectedExamId?: string;
}

type PortalStep = 'IDENTIFY' | 'PRE_CHECK' | 'ACTIVE_EXAM' | 'COMPLETED';

export const CandidateExamPortal: React.FC<CandidateExamPortalProps> = ({
  onBackToLanding,
  preSelectedExamId,
}) => {
  const [step, setStep] = useState<PortalStep>('IDENTIFY');
  const [availableExams, setAvailableExams] = useState<ProctorCandidateExam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  // Form State
  const [selectedExamId, setSelectedExamId] = useState<string>(preSelectedExamId || '');
  const [studentName, setStudentName] = useState('Rahul Sharma');
  const [studentId, setStudentId] = useState('STU-2026-9041');
  const [studentEmail, setStudentEmail] = useState('rahul.sharma@candidate.edu.in');
  const [formError, setFormError] = useState<string | null>(null);

  // Session State
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [verificationSnapshot, setVerificationSnapshot] = useState<string | null>(null);
  const [attemptData, setAttemptData] = useState<{
    attemptId: string;
    sessionId: string;
    exam: ProctorCandidateExam;
    student: { id: string; name: string; email?: string };
    questions: CandidateQuestion[];
  } | null>(null);

  // Result State
  const [finalResult, setFinalResult] = useState<{
    score: number;
    totalQuestions: number;
    answeredQuestions: number;
    status: string;
    riskScore: number;
    riskLevel: string;
  } | null>(null);

  useEffect(() => {
    loadAvailableExams();
  }, []);

  const loadAvailableExams = async () => {
    setLoadingExams(true);
    try {
      const res = await api.proctor.getExams();
      setAvailableExams(res.exams || []);
      if (!selectedExamId && res.exams && res.exams.length > 0) {
        setSelectedExamId(res.exams[0].id);
      }
    } catch (e: any) {
      console.warn('Failed to load exams for portal:', e);
    } finally {
      setLoadingExams(false);
    }
  };

  const handleProceedToPreCheck = () => {
    if (!selectedExamId) {
      setFormError('Please select an examination.');
      return;
    }
    if (!studentName.trim() || !studentId.trim()) {
      setFormError('Candidate Name and Roll Number / ID are required.');
      return;
    }
    setFormError(null);
    setStep('PRE_CHECK');
  };

  const handleChecksPassed = async (data: {
    stream: MediaStream;
    verificationSnapshot: string;
  }) => {
    setActiveStream(data.stream);
    setVerificationSnapshot(data.verificationSnapshot);

    try {
      const res = await api.proctor.startAttempt({
        exam_id: selectedExamId,
        student_id: studentId.trim(),
        student_name: studentName.trim(),
        student_email: studentEmail.trim(),
        verification_snapshot: data.verificationSnapshot,
      });

      if (!res.success) {
        throw new Error('Failed to start attempt on server');
      }

      setAttemptData({
        attemptId: res.attempt_id,
        sessionId: res.session_id,
        exam: res.exam,
        student: res.student,
        questions: res.questions,
      });

      setStep('ACTIVE_EXAM');
    } catch (err: any) {
      alert(`Initialization error: ${err.message || 'Could not start examination'}`);
    }
  };

  const handleExamComplete = (result: any) => {
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
      setActiveStream(null);
    }
    setFinalResult(result);
    setStep('COMPLETED');
  };

  const selectedExam = availableExams.find(e => e.id === selectedExamId);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans">
      {/* Step 1: Candidate Identification & Exam Selection */}
      {step === 'IDENTIFY' && (
        <div className="flex-1 flex flex-col justify-center items-center p-4 sm:p-6">
          <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-900 font-serif">Candidate Examination Portal</h1>
                  <p className="text-xs text-slate-500">ZeroLeak Automated Proctoring & Anti-Cheat Protocol</p>
                </div>
              </div>
              <button
                onClick={onBackToLanding}
                className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Exit</span>
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Select Examination
                </label>
                {loadingExams ? (
                  <div className="p-3 rounded-xl border border-slate-200 text-xs text-slate-400 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>Loading available examinations...</span>
                  </div>
                ) : (
                  <select
                    value={selectedExamId}
                    onChange={e => setSelectedExamId(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-300 text-sm font-medium focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white"
                  >
                    {availableExams.map(ex => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name} — {ex.subject} ({ex.duration_minutes || 60} mins)
                      </option>
                    ))}
                  </select>
                )}
                {selectedExam && (
                  <div className="mt-2 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs text-slate-600 flex justify-between">
                    <span>Subject: <strong className="text-emerald-900">{selectedExam.subject}</strong></span>
                    <span>Duration: <strong className="text-emerald-900">{selectedExam.duration_minutes || 60} mins</strong></span>
                    <span>Category: <strong className="text-emerald-900">{selectedExam.category}</strong></span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Candidate Full Name
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm font-medium focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Roll No. / Student ID
                  </label>
                  <input
                    type="text"
                    value={studentId}
                    onChange={e => setStudentId(e.target.value)}
                    placeholder="e.g. STU-2026-9041"
                    className="w-full p-3 rounded-xl border border-slate-300 text-sm font-medium focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Official Email
                  </label>
                  <input
                    type="email"
                    value={studentEmail}
                    onChange={e => setStudentEmail(e.target.value)}
                    placeholder="e.g. candidate@domain.edu"
                    className="w-full p-3 rounded-xl border border-slate-300 text-sm font-medium focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleProceedToPreCheck}
                disabled={!selectedExamId || loadingExams}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-800 to-teal-700 hover:from-emerald-700 hover:to-teal-600 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <span>Proceed to Pre-Exam Security Check</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: 5-Layer Pre-Exam Security Check */}
      {step === 'PRE_CHECK' && selectedExam && (
        <ProctorPreExamCheck
          exam={selectedExam}
          candidateName={studentName}
          candidateId={studentId}
          onChecksPassed={handleChecksPassed}
          onCancel={() => setStep('IDENTIFY')}
        />
      )}

      {/* Step 3: Active Fullscreen Proctored Exam */}
      {step === 'ACTIVE_EXAM' && attemptData && activeStream && verificationSnapshot && (
        <ProctorExamInterface
          attemptId={attemptData.attemptId}
          sessionId={attemptData.sessionId}
          exam={attemptData.exam}
          student={attemptData.student}
          questions={attemptData.questions}
          stream={activeStream}
          verificationSnapshot={verificationSnapshot}
          onSubmitComplete={handleExamComplete}
        />
      )}

      {/* Step 4: Examination Completed & Receipt */}
      {step === 'COMPLETED' && finalResult && (
        <div className="flex-1 flex flex-col justify-center items-center p-4 sm:p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <h1 className="text-xl font-black text-slate-900 font-serif">Examination Submitted</h1>
              <p className="text-xs text-slate-500 mt-1">Your responses and proctoring telemetry have been safely recorded.</p>
            </div>

            {/* Assessment Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Candidate:</span>
                <strong className="text-slate-900">{studentName} ({studentId})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Questions Answered:</span>
                <strong className="text-emerald-700">{finalResult.answeredQuestions} / {finalResult.totalQuestions}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Objective Score:</span>
                <strong className="text-slate-900 font-mono text-sm">{finalResult.score} marks</strong>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-500">Proctor Risk Score:</span>
                <span className={`px-2 py-0.5 rounded font-bold ${
                  finalResult.riskScore >= 60
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {finalResult.riskScore}/100 ({finalResult.riskLevel})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Proctoring Status:</span>
                <span className={`font-bold ${
                  finalResult.status === 'FLAGGED_FOR_REVIEW'
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}>
                  {finalResult.status === 'FLAGGED_FOR_REVIEW' ? 'Flagged for Human Review' : 'Verified Normal Submission'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Your examination session hash has been sealed in the ZeroLeak immutable ledger. You may now close this window.
            </p>

            <button
              onClick={onBackToLanding}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow"
            >
              Return to Public Portal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

