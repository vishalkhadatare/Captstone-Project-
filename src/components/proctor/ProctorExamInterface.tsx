import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  Maximize2,
  AlertTriangle,
  Camera,
  Mic,
  MicOff,
  UserX,
  Users,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Send,
  HelpCircle,
  Eye,
  AlertCircle,
  Minimize2,
  Volume2,
} from 'lucide-react';
import { api } from '../../api';
import { detectFacesInVideo, FaceDetectionResult } from '../../utils/faceDetection';
import { AudioMonitor } from '../../utils/audioMonitor';
import { CandidateQuestion, ProctorCandidateExam, RiskLevel } from '../../types';

interface ProctorExamInterfaceProps {
  attemptId: string;
  sessionId: string;
  exam: ProctorCandidateExam;
  student: { id: string; name: string; email?: string };
  questions: CandidateQuestion[];
  stream: MediaStream;
  verificationSnapshot: string;
  onSubmitComplete: (result: {
    score: number;
    totalQuestions: number;
    answeredQuestions: number;
    status: string;
    riskScore: number;
    riskLevel: string;
  }) => void;
}

export const ProctorExamInterface: React.FC<ProctorExamInterfaceProps> = ({
  attemptId,
  sessionId,
  exam,
  student,
  questions,
  stream,
  verificationSnapshot,
  onSubmitComplete,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Time remaining in seconds
  const [timeRemaining, setTimeRemaining] = useState((exam.duration_minutes || 60) * 60);

  // Proctor State & Telemetry
  const [riskScore, setRiskScore] = useState(0);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('NORMAL');
  const [warningCount, setWarningCount] = useState(0);
  const [maxWarnings, setMaxWarnings] = useState(3);
  const [activeWarningModal, setActiveWarningModal] = useState<{
    level: 1 | 2 | 3;
    title: string;
    message: string;
  } | null>(null);

  // Hardware State
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const [micActive, setMicActive] = useState(true);
  const [audioVolume, setAudioVolume] = useState(0);
  const [faceResult, setFaceResult] = useState<FaceDetectionResult>({
    faceCount: 1,
    status: 'NORMAL',
    lookingDirection: 'FORWARD',
    confidence: 0.9,
  });

  const [minimizedCamera, setMinimizedCamera] = useState(false);
  const [recentSignals, setRecentSignals] = useState<string[]>([]);

  // Refs for tracking
  const videoRef = useRef<HTMLVideoElement>(null);
  const faceIntervalRef = useRef<any>(null);
  const heartbeatIntervalRef = useRef<any>(null);
  const audioMonitorRef = useRef<AudioMonitor | null>(null);
  const tabSwitchStartRef = useRef<number | null>(null);
  const lastFaceWarningTimeRef = useRef<number>(0);

  // 1. Initialize Fullscreen & Video Feed
  useEffect(() => {
    // Request fullscreen
    const requestFs = async () => {
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        }
      } catch (err) {
        console.warn('Fullscreen request rejected by browser:', err);
      }
    };
    requestFs();

    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }

    // Initialize Audio Monitoring
    const audioMonitor = new AudioMonitor({
      threshold: 0.32,
      noiseDurationThresholdMs: 2000,
      onAudioActivity: (avgVol) => {
        logProctorEvent('AUDIO_ACTIVITY', 'LOW', {
          average_volume: avgVol,
          note: 'Continuous elevated audio detected. (Background noise may trigger this signal)',
        });
        addSignalBadge('Audio Activity');
      },
      onMicrophoneDisabled: () => {
        setMicActive(false);
        logProctorEvent('MICROPHONE_DISABLED', 'HIGH', { reason: 'Microphone stream interrupted' });
        addSignalBadge('Mic Disconnected');
      },
      onVolumeChange: (vol) => {
        setAudioVolume(vol);
      },
    });
    audioMonitor.start(stream);
    audioMonitorRef.current = audioMonitor;

    // Start Face Detection Loop
    faceIntervalRef.current = setInterval(async () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const res = await detectFacesInVideo(videoRef.current);
        setFaceResult(res);

        const now = Date.now();
        if (res.status === 'NO_FACE' && now - lastFaceWarningTimeRef.current > 7000) {
          lastFaceWarningTimeRef.current = now;
          logProctorEvent('FACE_NOT_DETECTED', 'MEDIUM', {
            note: 'Candidate face missing from camera frame',
          });
          addSignalBadge('Face Missing');
        } else if (res.status === 'MULTIPLE_FACES' && now - lastFaceWarningTimeRef.current > 7000) {
          lastFaceWarningTimeRef.current = now;
          logProctorEvent('MULTIPLE_FACES', 'HIGH', {
            detected_faces: res.faceCount,
            note: 'Multiple persons detected in camera frame',
          });
          addSignalBadge('Multiple Faces');
          triggerProgressiveWarning('Multiple Faces Detected', 'ZeroLeak detected more than one person in your camera view. Only the candidate is permitted.');
        }
      }
    }, 1800);

    // Heartbeat loop every 6 seconds
    heartbeatIntervalRef.current = setInterval(() => {
      sendHeartbeat();
    }, 6000);

    return () => {
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (audioMonitorRef.current) audioMonitorRef.current.stop();
    };
  }, []);

  // 2. Countdown Timer
  useEffect(() => {
    if (timeRemaining <= 0) {
      handleFinalSubmit();
      return;
    }
    const timer = setInterval(() => {
      setTimeRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeRemaining]);

  // 3. Security Event Listeners (Tab Switch, Fullscreen, Shortcuts, Copy/Paste)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const inFs = !!document.fullscreenElement;
      setIsFullscreen(inFs);

      if (!inFs) {
        logProctorEvent('FULLSCREEN_EXIT', 'MEDIUM', { note: 'Candidate exited fullscreen mode' });
        addSignalBadge('Fullscreen Exited');
        triggerProgressiveWarning(
          'Fullscreen Mode Required',
          'You have exited fullscreen mode. Please return to fullscreen immediately to continue the exam.'
        );
      } else {
        logProctorEvent('FULLSCREEN_ENTER', 'LOW', { note: 'Candidate entered fullscreen' });
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        tabSwitchStartRef.current = Date.now();
        logProctorEvent('TAB_SWITCH', 'MEDIUM', {
          action: 'tab_hidden',
          note: 'Candidate switched tabs or minimized browser window',
        });
        addSignalBadge('Tab Switched');
        triggerProgressiveWarning(
          'Window Focus Lost',
          'You have navigated away from the examination window. All tab switches are logged for human proctor review.'
        );
      } else {
        if (tabSwitchStartRef.current) {
          const durationSeconds = Math.round((Date.now() - tabSwitchStartRef.current) / 1000);
          tabSwitchStartRef.current = null;
          logProctorEvent('TAB_SWITCH', 'LOW', {
            action: 'tab_returned',
            duration_seconds: durationSeconds,
            note: `Candidate returned after ${durationSeconds} seconds away.`,
          });
        }
      }
    };

    const handleWindowBlur = () => {
      logProctorEvent('WINDOW_BLUR', 'LOW', { note: 'Browser window lost focus' });
    };

    const handleWindowFocus = () => {
      logProctorEvent('WINDOW_FOCUS', 'LOW', { note: 'Browser window regained focus' });
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logProctorEvent('COPY_ATTEMPT', 'LOW', { note: 'Clipboard copy attempt intercepted' });
      addSignalBadge('Copy Intercepted');
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logProctorEvent('PASTE_ATTEMPT', 'LOW', { note: 'Clipboard paste attempt intercepted' });
      addSignalBadge('Paste Intercepted');
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      logProctorEvent('CUT_ATTEMPT', 'LOW', { note: 'Clipboard cut attempt intercepted' });
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logProctorEvent('CONTEXT_MENU_ATTEMPT', 'LOW', { note: 'Right-click context menu intercepted' });
      addSignalBadge('Right Click Blocked');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for suspicious shortcuts: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Shift+I, F12, PrintScreen
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (
        (isCtrlOrCmd && ['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'i')
      ) {
        e.preventDefault();
        logProctorEvent('SUSPICIOUS_KEY_ATTEMPT', 'LOW', {
          key: e.key,
          ctrl: e.ctrlKey,
          meta: e.metaKey,
          shift: e.shiftKey,
          note: `Shortcut '${isCtrlOrCmd ? 'Ctrl+' : ''}${e.key}' intercepted`,
        });
        addSignalBadge(`Shortcut: ${e.key}`);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    window.addEventListener('cut', handleCut);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('cut', handleCut);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const addSignalBadge = (text: string) => {
    setRecentSignals(prev => [text, ...prev.slice(0, 3)]);
    setTimeout(() => {
      setRecentSignals(prev => prev.filter(t => t !== text));
    }, 4000);
  };

  const triggerProgressiveWarning = (title: string, message: string) => {
    setWarningCount(prev => {
      const nextCount = prev + 1;
      let level: 1 | 2 | 3 = 1;
      if (nextCount === 1) level = 1;
      else if (nextCount === 2) level = 2;
      else level = 3;

      let progressiveMessage = message;
      if (level === 1) {
        progressiveMessage = `Warning 1/${maxWarnings}: ${message}`;
      } else if (level === 2) {
        progressiveMessage = `Warning 2/${maxWarnings}: Repeated suspicious activity detected. Your telemetry is being logged for review.`;
      } else {
        progressiveMessage = `Final Warning: Multiple security anomalies detected. Your exam has been flagged for comprehensive proctor committee review.`;
      }

      setActiveWarningModal({
        level,
        title,
        message: progressiveMessage,
      });

      return nextCount;
    });
  };

  const logProctorEvent = async (eventType: string, severity: string, metadata: any = {}) => {
    try {
      const res = await api.proctor.recordEvent({
        attempt_id: attemptId,
        exam_id: exam.id,
        student_id: student.id,
        event_type: eventType,
        severity,
        metadata,
        hardware_status: {
          camera: cameraActive ? 'ACTIVE' : 'DISABLED',
          microphone: micActive ? 'ACTIVE' : 'DISABLED',
          fullscreen: isFullscreen ? 'ACTIVE' : 'EXITED',
          face: faceResult.status === 'NORMAL' ? 'DETECTED' : faceResult.status === 'NO_FACE' ? 'NOT_DETECTED' : 'MULTIPLE',
          face_count: faceResult.faceCount,
        },
      });

      if (res.success) {
        setRiskScore(res.risk_score);
        setRiskLevel(res.risk_level as RiskLevel);
        setWarningCount(res.warning_count);
        setMaxWarnings(res.max_warnings || 3);
      }
    } catch (e) {
      console.warn('Proctor event log failure:', e);
    }
  };

  const sendHeartbeat = async () => {
    try {
      await api.proctor.sendHeartbeat({
        attempt_id: attemptId,
        camera_status: cameraActive ? 'ACTIVE' : 'DISABLED',
        microphone_status: micActive ? 'ACTIVE' : 'DISABLED',
        fullscreen_status: isFullscreen ? 'ACTIVE' : 'EXITED',
        face_status: faceResult.status === 'NORMAL' ? 'DETECTED' : faceResult.status === 'NO_FACE' ? 'NOT_DETECTED' : 'MULTIPLE',
        faces_detected_count: faceResult.faceCount,
      });
    } catch {}
  };

  const reEnterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
        setActiveWarningModal(null);
      }
    } catch (e) {
      console.warn('Re-enter fullscreen failed:', e);
    }
  };

  const handleSelectOption = (qId: string, option: string) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: option,
    }));
  };

  const handleClearOption = (qId: string) => {
    setAnswers(prev => {
      const copy = { ...prev };
      delete copy[qId];
      return copy;
    });
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await api.proctor.submitAttempt(attemptId, { answers });
      if (document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch {}
      }
      onSubmitComplete({
        score: res.score,
        totalQuestions: res.total_questions,
        answeredQuestions: res.answered_questions,
        status: res.status,
        riskScore: res.risk_score,
        riskLevel: res.risk_level,
      });
    } catch (err: any) {
      alert(`Submission error: ${err.message || 'Failed to submit'}`);
      setSubmitting(false);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const currentQ = questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).filter(k => !!answers[k]).length;

  return (
    <div className="min-h-screen bg-[#0B132B] text-slate-100 flex flex-col font-sans select-none relative overflow-hidden">
      {/* 1. TOP PROCTOR HEADER BAR */}
      <header className="h-16 bg-[#1C2541] border-b border-slate-700/80 px-4 sm:px-6 flex items-center justify-between z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white tracking-wide">{exam.name}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                PROCTORED ENCLAVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Candidate: <strong className="text-white">{student.name}</strong> • Roll: <span className="font-mono text-emerald-400">{student.id}</span>
            </p>
          </div>
        </div>

        {/* Live Proctor Status telemetry & Timer */}
        <div className="flex items-center gap-4">
          {/* Signal Badges */}
          <div className="hidden md:flex items-center gap-1.5">
            {recentSignals.map((sig, i) => (
              <span key={i} className="px-2 py-0.5 bg-amber-950/90 text-amber-300 border border-amber-700 text-[10px] rounded-full font-semibold animate-pulse">
                {sig}
              </span>
            ))}
          </div>

          {/* Risk Level Badge */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700">
            <span className="text-[11px] text-slate-400 font-medium">Risk:</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              riskLevel === 'NORMAL'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                : riskLevel === 'LOW'
                ? 'bg-sky-950 text-sky-300 border border-sky-700'
                : riskLevel === 'MEDIUM'
                ? 'bg-amber-950 text-amber-300 border border-amber-700'
                : riskLevel === 'HIGH'
                ? 'bg-orange-950 text-orange-300 border border-orange-700'
                : 'bg-rose-950 text-rose-300 border border-rose-700 animate-bounce'
            }`}>
              {riskLevel} ({riskScore}/100)
            </span>
          </div>

          {/* Warnings Counter */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
            <AlertTriangle className={`w-3.5 h-3.5 ${warningCount > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
            <span className="text-slate-400">Warnings:</span>
            <span className={`font-bold font-mono ${warningCount >= maxWarnings ? 'text-rose-400' : warningCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
              {warningCount}/{maxWarnings}
            </span>
          </div>

          {/* Countdown Clock */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-3.5 py-1.5 rounded-xl border border-slate-700">
            <Clock className={`w-4 h-4 ${timeRemaining < 300 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`} />
            <span className={`font-mono text-sm font-bold tracking-wider ${timeRemaining < 300 ? 'text-rose-400' : 'text-white'}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>

          {/* Finish Button */}
          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Finish & Submit</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Question Area */}
        <main className="flex-1 p-4 sm:p-8 overflow-y-auto space-y-6">
          {currentQ ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Question Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-mono font-bold">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-xs">
                    {currentQ.subject}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400">Difficulty: <strong className="text-white">{currentQ.difficulty}</strong></span>
                  <span className="text-slate-400">Marks: <strong className="text-emerald-400">+{currentQ.marks}</strong> / <span className="text-rose-400">-{currentQ.negative_marks}</span></span>
                </div>
              </div>

              {/* Question Text */}
              <div className="bg-[#1C2541]/70 border border-slate-700/80 rounded-2xl p-6 shadow-md">
                <p className="text-base sm:text-lg text-slate-100 font-medium leading-relaxed whitespace-pre-wrap">
                  {currentQ.content_text}
                </p>
              </div>

              {/* Options */}
              <div className="space-y-3">
                {currentQ.options && currentQ.options.length > 0 ? (
                  currentQ.options.map((opt, idx) => {
                    const isSelected = answers[currentQ.id] === opt;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectOption(currentQ.id, opt)}
                        className={`w-full p-4 rounded-xl text-left text-sm font-medium border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-emerald-950/70 border-emerald-500 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-400'
                            : 'bg-[#1C2541]/40 border-slate-700 hover:border-slate-600 text-slate-300 hover:bg-[#1C2541]/80'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold border ${
                            isSelected
                              ? 'bg-emerald-600 border-emerald-400 text-white'
                              : 'bg-slate-800 border-slate-600 text-slate-400'
                          }`}>
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span>{opt}</span>
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <textarea
                    rows={6}
                    value={answers[currentQ.id] || ''}
                    onChange={e => handleSelectOption(currentQ.id, e.target.value)}
                    placeholder="Type your descriptive answer here..."
                    className="w-full p-4 rounded-xl bg-[#1C2541]/50 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                )}
              </div>

              {/* Navigation Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  onClick={() => handleClearOption(currentQ.id)}
                  disabled={!answers[currentQ.id]}
                  className="text-xs text-slate-500 hover:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Clear Selection
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white flex items-center gap-1.5 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <button
                    onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
                    disabled={currentQuestionIndex === questions.length - 1}
                    className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white flex items-center gap-1.5 transition-all"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-500">No questions available for this exam.</div>
          )}
        </main>

        {/* Question Palette Sidebar */}
        <aside className="w-full lg:w-72 bg-[#1C2541]/90 border-t lg:border-t-0 lg:border-l border-slate-700 p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Question Palette</span>
              <span className="text-xs text-slate-400 font-mono">{answeredCount}/{questions.length} Solved</span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = idx === currentQuestionIndex;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={`h-9 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center border ${
                      isCurrent
                        ? 'border-emerald-400 ring-2 ring-emerald-400/50 scale-105 z-10'
                        : ''
                    } ${
                      isAnswered
                        ? 'bg-emerald-700 border-emerald-600 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="pt-4 border-t border-slate-800 space-y-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-emerald-700" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700" />
                <span>Unanswered ({questions.length - answeredCount})</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 text-center">
            <button
              onClick={() => setShowSubmitModal(true)}
              className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition-all"
            >
              Review & Submit
            </button>
          </div>
        </aside>
      </div>

      {/* 3. FLOATING CORNER WEBCAM PREVIEW */}
      <div className={`fixed bottom-4 right-4 z-40 transition-all duration-300 ${
        minimizedCamera ? 'w-14 h-14' : 'w-52 sm:w-60'
      }`}>
        {minimizedCamera ? (
          <button
            onClick={() => setMinimizedCamera(false)}
            className="w-14 h-14 rounded-2xl bg-slate-900 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center shadow-2xl hover:scale-105 transition-all"
          >
            <Camera className="w-6 h-6" />
          </button>
        ) : (
          <div className="bg-slate-950 rounded-2xl overflow-hidden border-2 border-slate-700 shadow-2xl backdrop-blur-md">
            {/* Camera Header */}
            <div className="bg-slate-900/90 px-3 py-1.5 flex items-center justify-between text-[10px] text-slate-300 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className="font-bold">Live Proctor Feed</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Audio Volume Indicator */}
                <div className="flex items-center gap-1">
                  <Volume2 className={`w-3 h-3 ${audioVolume > 30 ? 'text-amber-400' : 'text-slate-500'}`} />
                  <div className="w-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-100"
                      style={{ width: `${audioVolume}%` }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => setMinimizedCamera(true)}
                  className="text-slate-400 hover:text-white"
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Video Viewport */}
            <div className="relative aspect-video bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />

              {/* Status pill on camera */}
              <div className="absolute bottom-1.5 left-1.5">
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold backdrop-blur-md flex items-center gap-1 ${
                  faceResult.status === 'NORMAL'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                    : faceResult.status === 'MULTIPLE_FACES'
                    ? 'bg-rose-950/80 text-rose-300 border border-rose-700'
                    : 'bg-amber-950/80 text-amber-300 border border-amber-700'
                }`}>
                  {faceResult.status === 'NORMAL' ? '✓ 1 Face' : faceResult.status === 'MULTIPLE_FACES' ? '⚠ Multiple Faces' : '⚠ Face Missing'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. FULLSCREEN EXIT / PROGRESSIVE WARNING MODAL */}
      {(!isFullscreen || activeWarningModal) && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#1C2541] border-2 border-amber-500/80 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-950/80 text-amber-400 border border-amber-800">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-serif">
                  {activeWarningModal?.title || 'Security Violation: Fullscreen Exited'}
                </h3>
                <span className="text-xs font-mono text-amber-400">
                  Warning Level {warningCount} of {maxWarnings}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {activeWarningModal?.message ||
                'You have exited the mandatory fullscreen examination mode. All exits are recorded on your immutable timeline for review by the examination authority.'}
            </p>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <p className="font-semibold text-slate-200">Proctor Integrity Protocol:</p>
              <p>• Do not switch tabs or use keyboard shortcuts.</p>
              <p>• Keep your face centered in the camera at all times.</p>
              <p>• Further violations will result in your exam being permanently flagged for manual audit.</p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={reEnterFullscreen}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-800 to-teal-700 hover:from-emerald-700 hover:to-teal-600 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Return to Fullscreen & Resume</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. FINAL SUBMISSION CONFIRMATION MODAL */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#1C2541] border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800">
                <Send className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-serif">Confirm Final Submission</h3>
                <p className="text-xs text-slate-400">Are you sure you want to end your examination?</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Questions:</span>
                <span className="font-bold text-white">{questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Answered:</span>
                <span className="font-bold text-emerald-400">{answeredCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Unanswered:</span>
                <span className="font-bold text-rose-400">{questions.length - answeredCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Time Remaining:</span>
                <span className="font-mono text-white">{formatTime(timeRemaining)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-800">
                <span className="text-slate-400">Final Proctor Risk Score:</span>
                <span className={`font-bold ${riskScore >= 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {riskScore}/100 ({riskLevel})
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Upon submission, your responses will be locked and your telemetry ledger will be archived for review.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                Return to Exam
              </button>
              <button
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-xs font-bold text-white shadow-md flex items-center gap-1.5"
              >
                {submitting ? 'Submitting...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

