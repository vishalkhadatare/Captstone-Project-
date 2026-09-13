import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Lock,
  AlertTriangle,
  CheckCircle2,
  X,
  Eye,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Examination, User, ExamSimulationPaper } from '../../types';
import { api } from '../../api';

interface ExamSimulationModalProps {
  exam: Examination;
  currentUser: User;
  onClose: () => void;
  onCompleted: (statusMessage?: string) => void;
}

type ProctorGateStatus = 'REQUESTING_PERMISSIONS' | 'PERMISSION_DENIED' | 'STREAM_ACTIVE' | 'STREAM_INTERRUPTED';

export const ExamSimulationModal: React.FC<ExamSimulationModalProps> = ({
  exam,
  currentUser,
  onClose,
  onCompleted,
}) => {
  // Proctoring & Media Stream State
  const [gateStatus, setGateStatus] = useState<ProctorGateStatus>('REQUESTING_PERMISSIONS');
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Simulation Session State
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [paper, setPaper] = useState<ExamSimulationPaper | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(900); // 15 minutes default
  const [loadingPaper, setLoadingPaper] = useState(false);
  const [simulationCompleted, setSimulationCompleted] = useState(false);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);

  // Security Interceptions & Overlays
  const [isTabBlurred, setIsTabBlurred] = useState(false);
  const [blurWarningCount, setBlurWarningCount] = useState(0);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [sessionStartTime] = useState<string>(new Date().toLocaleString());

  // Refs for media streams and timers
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<any>(null);

  // Initialize and request hardware access (Camera + Mic)
  const initHardwareGate = async () => {
    setGateStatus('REQUESTING_PERMISSIONS');
    setHardwareError(null);

    // Stop existing tracks if any
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support proctoring media stream APIs.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });

      mediaStreamRef.current = stream;
      setCameraActive(true);
      setMicActive(true);
      setGateStatus('STREAM_ACTIVE');

      // Bind to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => console.warn('Video play prevented:', err));
      }

      // Setup Web Audio Analyser for mic level meter
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateAudioLevel = () => {
            if (analyserRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
              animFrameRef.current = requestAnimationFrame(updateAudioLevel);
            }
          };
          updateAudioLevel();
        }
      } catch (audioErr) {
        console.warn('Audio analyser setup failed:', audioErr);
      }

      // Track listeners for disconnection
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack) {
        videoTrack.onended = () => handleStreamInterruption('Camera disconnected');
        videoTrack.onmute = () => handleStreamInterruption('Camera muted/lost');
      }
      if (audioTrack) {
        audioTrack.onended = () => handleStreamInterruption('Microphone disconnected');
        audioTrack.onmute = () => handleStreamInterruption('Microphone muted/lost');
      }

      // Start backend simulation session once hardware is verified
      await startBackendSimulation();
    } catch (err: any) {
      console.error('Proctor hardware check error:', err);
      setGateStatus('PERMISSION_DENIED');
      setCameraActive(false);
      setMicActive(false);
      setHardwareError(
        'Camera and Microphone access are mandatory to preview the final examination paper. Simulation cannot start without proctoring verification.'
      );
    }
  };

  // Stream interruption handler
  const handleStreamInterruption = (reason: string) => {
    setGateStatus('STREAM_INTERRUPTED');
    setCameraActive(false);
    setMicActive(false);
    setHardwareError(
      'Proctoring stream interrupted. Question paper hidden. Re-enable camera and microphone to continue.'
    );

    if (sessionToken) {
      api.logSimulationEvent(exam.id, {
        sessionToken,
        eventType: 'HARDWARE_STREAM_INTERRUPTED',
        details: { reason, timestamp: new Date().toISOString() },
      }).catch((e) => console.warn('Failed to log stream interruption event:', e));
    }
  };

  // Request backend simulation session and load paper payload
  const startBackendSimulation = async () => {
    setLoadingPaper(true);
    setApiErrorMessage(null);
    try {
      const res = await api.startExamSimulation(exam.id);
      setSessionToken(res.sessionToken);
      setPaper(res.paper);
      setSecondsRemaining(res.durationSeconds || 900);
    } catch (err: any) {
      console.error('Failed to start simulation:', err);
      // Check if 403 / simulation completed error
      const msg = err.message || 'Simulation already completed. The final question paper cannot be viewed again in simulation mode.';
      setApiErrorMessage(msg);
      if (msg.includes('Simulation already completed')) {
        setSimulationCompleted(true);
      }
    } finally {
      setLoadingPaper(false);
    }
  };

  // Run initial hardware check on mount
  useEffect(() => {
    initHardwareGate();

    return () => {
      // Clean up media tracks & audio context
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Update video ref if stream changes or becomes active
  useEffect(() => {
    if (videoRef.current && mediaStreamRef.current && gateStatus === 'STREAM_ACTIVE') {
      videoRef.current.srcObject = mediaStreamRef.current;
      videoRef.current.play().catch((err) => console.warn('Video auto-play warning:', err));
    }
  }, [gateStatus]);

  // Countdown timer effect
  useEffect(() => {
    if (gateStatus !== 'STREAM_ACTIVE' || !paper || isTabBlurred || simulationCompleted) {
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          handleAutoExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [gateStatus, paper, isTabBlurred, simulationCompleted]);

  // Handle auto-expiration at 00:00
  const handleAutoExpire = async () => {
    if (simulationCompleted) return;
    setSimulationCompleted(true);
    try {
      if (sessionToken) {
        await api.completeExamSimulation(exam.id, {
          sessionToken,
          reason: 'TIMER_EXPIRED',
        });
      }
    } catch (e) {
      console.warn('Auto complete error:', e);
    }
    alert('Simulation preview time expired. Marked as completed.');
    onCompleted('Simulation preview time expired. Marked as completed.');
  };

  // Tab switch & Window blur detection (Section 5)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsTabBlurred(true);
        setBlurWarningCount((c) => c + 1);
        if (sessionToken) {
          api.logSimulationEvent(exam.id, {
            sessionToken,
            eventType: 'TAB_SWITCH',
            details: { count: blurWarningCount + 1, timestamp: new Date().toISOString() },
          }).catch(() => {});
        }
      }
    };

    const handleWindowBlur = () => {
      setIsTabBlurred(true);
      setBlurWarningCount((c) => c + 1);
      if (sessionToken) {
        api.logSimulationEvent(exam.id, {
          sessionToken,
          eventType: 'WINDOW_BLUR',
          details: { count: blurWarningCount + 1, timestamp: new Date().toISOString() },
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [sessionToken, blurWarningCount, exam.id]);

  // Keyboard shortcut blockers (Ctrl+C, Ctrl+P, Ctrl+S, F12, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Prevent Copy (Ctrl+C)
      if (isCtrlOrCmd && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        e.stopPropagation();
        logSecurityKeyViolation('KEY_COPY_ATTEMPT');
        return false;
      }

      // Prevent Print (Ctrl+P)
      if (isCtrlOrCmd && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        logSecurityKeyViolation('KEY_PRINT_ATTEMPT');
        return false;
      }

      // Prevent Save (Ctrl+S)
      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        logSecurityKeyViolation('KEY_SAVE_ATTEMPT');
        return false;
      }

      // Prevent View Source (Ctrl+U)
      if (isCtrlOrCmd && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        e.stopPropagation();
        logSecurityKeyViolation('KEY_VIEW_SOURCE_ATTEMPT');
        return false;
      }

      // Prevent DevTools (F12, Ctrl+Shift+I, Ctrl+Shift+J)
      if (
        e.key === 'F12' ||
        (isCtrlOrCmd && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        logSecurityKeyViolation('KEY_DEVTOOLS_ATTEMPT');
        return false;
      }

      // Prevent PrintScreen key
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        e.stopPropagation();
        logSecurityKeyViolation('KEY_PRINTSCREEN_ATTEMPT');
        return false;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [sessionToken, exam.id]);

  const logSecurityKeyViolation = (violationType: string) => {
    if (sessionToken) {
      api.logSimulationEvent(exam.id, {
        sessionToken,
        eventType: violationType,
        details: { timestamp: new Date().toISOString() },
      }).catch(() => {});
    }
  };

  // Complete simulation action confirmed by Manager
  const handleConfirmComplete = async () => {
    setCompleting(true);
    try {
      await api.completeExamSimulation(exam.id, {
        sessionToken: sessionToken || undefined,
        reason: 'MANAGER_CONFIRMED',
      });
      setSimulationCompleted(true);
      setShowConfirmComplete(false);
      onCompleted('Simulation completed. You may now proceed to Generate Encrypted Paper.');
    } catch (err: any) {
      console.error('Error completing simulation:', err);
      alert(err.message || 'Failed to complete simulation.');
    } finally {
      setCompleting(false);
    }
  };

  // Time formatter
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Watermark text for dynamic diagonal watermark
  const watermarkText = `CONFIDENTIAL – PROCTORED SIMULATION • ${currentUser.full_name} (${currentUser.email}) • ${sessionStartTime} • EXAM ID: ${exam.id}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col text-slate-100 font-['Figtree',sans-serif] select-none"
      onContextMenu={(e) => {
        e.preventDefault();
        logSecurityKeyViolation('RIGHT_CLICK_ATTEMPT');
        return false;
      }}
    >
      {/* CSS Print Blocker */}
      <style>{`
        @media print {
          body, html, * {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      {/* Top Proctored Status Header Bar */}
      <header className="h-16 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0 z-30 shadow-md">
        {/* Left: Branding & Session Badge */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">ZEROLEAK PROCTORED SIMULATION</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
                LIVE REVIEW
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Exam: <span className="text-white font-semibold">{exam.name}</span> ({exam.subject})
            </p>
          </div>
        </div>

        {/* Center: Live Proctored Indicators */}
        <div className="hidden md:flex items-center gap-4 bg-slate-950/60 px-4 py-1.5 rounded-xl border border-slate-800 text-xs">
          {/* Camera Status */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                cameraActive ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'
              }`}
            />
            <span className={cameraActive ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              Camera: {cameraActive ? 'ON' : 'OFF'}
            </span>
          </div>

          <div className="h-3 w-px bg-slate-700" />

          {/* Microphone Status */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                micActive ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'
              }`}
            />
            <span className={micActive ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              Microphone: {micActive ? 'ON' : 'OFF'}
            </span>
            {/* Real-time audio meter bar */}
            {micActive && (
              <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1">
                <div
                  className="h-full bg-emerald-400 transition-all duration-75"
                  style={{ width: `${Math.min(100, audioLevel * 2)}%` }}
                />
              </div>
            )}
          </div>

          <div className="h-3 w-px bg-slate-700" />

          {/* Session Status */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Proctored Session: <strong className="text-white">ACTIVE</strong></span>
          </div>
        </div>

        {/* Right: Countdown Timer & Complete Button */}
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono font-bold text-xs ${
              secondsRemaining < 60
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-bounce'
                : secondsRemaining < 180
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-800 text-emerald-400 border-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{formatTimer(secondsRemaining)}</span>
          </div>

          {gateStatus === 'STREAM_ACTIVE' && !apiErrorMessage && (
            <button
              onClick={() => setShowConfirmComplete(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Complete Simulation</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Exit Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Floating Live PIP Webcam Preview (Corner) */}
        {gateStatus === 'STREAM_ACTIVE' && (
          <div className="absolute bottom-6 right-6 w-56 bg-slate-900/90 border border-slate-700 rounded-xl overflow-hidden shadow-2xl z-40 backdrop-blur-md">
            <div className="px-2.5 py-1.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-[10px] font-mono">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                SURVEILLANCE STREAM
              </span>
              <span className="text-slate-500">{new Date().toLocaleTimeString()}</span>
            </div>
            <div className="relative aspect-video bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
                style={{ transform: 'scaleX(-1)' }}
              />
              <div className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-mono text-slate-300">
                {currentUser.full_name}
              </div>
            </div>
            {/* Audio activity bar */}
            <div className="px-2.5 py-1 bg-slate-950 flex items-center gap-2 text-[10px] text-slate-400">
              <Mic className="w-3 h-3 text-emerald-400" />
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-75"
                  style={{ width: `${Math.min(100, audioLevel * 2)}%` }}
                />
              </div>
              <span className="font-mono text-[9px]">{audioLevel}%</span>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto relative p-6 lg:p-10">
          {/* Dynamic Repeating Diagonal Watermark */}
          {gateStatus === 'STREAM_ACTIVE' && !isTabBlurred && (
            <div
              className="fixed inset-0 pointer-events-none z-20 flex flex-col justify-between overflow-hidden opacity-[0.08]"
              style={{
                background: `repeating-linear-gradient(
                  -35deg,
                  transparent,
                  transparent 180px,
                  rgba(255, 255, 255, 0.15) 180px,
                  rgba(255, 255, 255, 0.15) 360px
                )`,
              }}
            >
              {Array.from({ length: 14 }).map((_, i) => (
                <div
                  key={i}
                  className="text-xs font-mono font-extrabold tracking-widest text-slate-100 whitespace-nowrap transform -rotate-12 select-none py-4"
                  style={{ paddingLeft: `${(i % 3) * 80}px` }}
                >
                  {watermarkText} • {watermarkText}
                </div>
              ))}
            </div>
          )}

          {/* GATE 1: Permission Required Screen */}
          {gateStatus === 'REQUESTING_PERMISSIONS' && (
            <div className="max-w-md mx-auto my-20 p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4 shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                <RefreshCw className="w-7 h-7 animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-white">Verifying Proctoring Hardware</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                ZeroLeak is requesting camera and microphone permissions. Please allow access in your browser prompt to
                start the secure preview session.
              </p>
            </div>
          )}

          {/* GATE 2: Permission Denied or Interrupted Overlay */}
          {(gateStatus === 'PERMISSION_DENIED' || gateStatus === 'STREAM_INTERRUPTED') && (
            <div className="max-w-md mx-auto my-16 p-8 rounded-2xl bg-slate-900/95 border border-rose-500/40 text-center space-y-5 shadow-2xl backdrop-blur-md">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-rose-400">Proctoring Verification Failed</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {hardwareError ||
                    'Camera and Microphone access are mandatory to preview the final examination paper. Simulation cannot start without proctoring verification.'}
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 text-left space-y-1">
                <div className="font-semibold text-slate-200">ZeroLeak Anti-Leak Policy:</div>
                <div>• Examination Manager identity must be verified via continuous video stream.</div>
                <div>• Audio channel must remain active to prevent unauthorized transcription.</div>
                <div>• No content will be rendered until both hardware devices are active.</div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={initHardwareGate}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Permissions</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all cursor-pointer"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}

          {/* GATE 3: Already Completed or API Error Screen */}
          {apiErrorMessage && (
            <div className="max-w-md mx-auto my-16 p-8 rounded-2xl bg-slate-900/95 border border-amber-500/40 text-center space-y-5 shadow-2xl backdrop-blur-md">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-amber-400">Simulation Access Locked</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{apiErrorMessage}</p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 text-left space-y-1">
                <div className="font-semibold text-slate-200">One-Time Preview Policy:</div>
                <div>• Each examination question paper can only be simulated once per regulatory rules.</div>
                <div>• Once completed or expired, the paper cannot be reopened in simulation mode.</div>
                <div>• You may now proceed directly to <strong>Generate Encrypted Paper</strong>.</div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all cursor-pointer"
              >
                Return to Examination Dashboard
              </button>
            </div>
          )}

          {/* Loading Paper Spinner */}
          {gateStatus === 'STREAM_ACTIVE' && loadingPaper && !apiErrorMessage && (
            <div className="max-w-md mx-auto my-24 text-center space-y-4">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Compiling and loading final examination paper payload...</p>
            </div>
          )}

          {/* GATE 4: TAB SWITCH / WINDOW BLUR BLACKOUT OVERLAY */}
          {isTabBlurred && (
            <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-6 text-center backdrop-blur-xl">
              <div className="max-w-md p-8 rounded-2xl bg-slate-900 border border-rose-500/60 shadow-2xl space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto animate-pulse">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-rose-400">Tab Switch / Blur Detected</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Examination view locked. Switching tabs, minimizing windows, or screen capture triggers an immediate
                    blackout and logs a security audit event.
                  </p>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Violation Incident #{blurWarningCount} recorded at {new Date().toLocaleTimeString()}
                </div>
                <button
                  onClick={() => setIsTabBlurred(false)}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
                >
                  Acknowledge &amp; Resume View
                </button>
              </div>
            </div>
          )}

          {/* ACTUAL QUESTION PAPER REVIEW VIEW */}
          {gateStatus === 'STREAM_ACTIVE' && paper && !loadingPaper && !apiErrorMessage && (
            <div className="max-w-4xl mx-auto space-y-8 pb-32">
              {/* Paper Header / Metadata Card */}
              <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      OFFICIAL QUESTION PAPER PREVIEW
                    </span>
                    <h1 className="text-xl font-extrabold text-white mt-1.5">{paper.examinationName}</h1>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                      <span>Subject: <strong className="text-slate-200">{paper.subject}</strong></span>
                      <span>•</span>
                      <span>Category: <strong className="text-slate-200">{paper.category}</strong></span>
                      <span>•</span>
                      <span>Type: <strong className="text-slate-200">{paper.examType}</strong></span>
                    </div>
                  </div>

                  <div className="text-right sm:text-right flex flex-col items-start sm:items-end gap-1 font-mono text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-bold">
                      {paper.versionCode}
                    </span>
                    <span className="text-[11px] text-emerald-400 font-semibold">{paper.setLabel}</span>
                  </div>
                </div>

                {/* Metrics Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Total Questions</div>
                    <div className="text-lg font-extrabold text-white mt-0.5">{paper.questions?.length || 0}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Total Marks</div>
                    <div className="text-lg font-extrabold text-emerald-400 mt-0.5">{paper.totalMarks} Marks</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Duration</div>
                    <div className="text-lg font-extrabold text-white mt-0.5">{paper.durationMinutes} Minutes</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Cryptographic Vault</div>
                    <div className="text-xs font-bold text-amber-400 mt-1 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" />
                      <span>AES-256 + RSA</span>
                    </div>
                  </div>
                </div>

                {/* Instructions Card */}
                {paper.instructions && paper.instructions.length > 0 && (
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-2">
                    <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Candidate &amp; Invigilation Instructions</span>
                    </div>
                    <ul className="space-y-1 text-xs text-slate-400 list-disc list-inside">
                      {paper.instructions.map((inst, idx) => (
                        <li key={idx}>{inst}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Subject Breakdown (for NEET/Multi-Subject) */}
              {paper.subjectBreakdown && paper.subjectBreakdown.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-slate-300">Multi-Subject Question Pool Breakdown:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {paper.subjectBreakdown.map((sb, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs">
                        <div className="font-bold text-white">{sb.subject}</div>
                        <div className="text-[11px] text-slate-400">
                          {sb.count} Questions • {sb.totalMarks} Marks
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Questions List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    QUESTION SET ({paper.questions?.length || 0} ITEMS)
                  </h3>
                  <span className="text-[11px] text-slate-400">Review all questions, options, and marks</span>
                </div>

                {paper.questions?.map((q, idx) => (
                  <div
                    key={q.questionId || idx}
                    className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-3 relative"
                  >
                    {/* Question Header Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-extrabold flex items-center justify-center text-xs">
                          {q.orderIndex || idx + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[10px]">
                          {q.subject}
                        </span>
                        {q.topic && (
                          <span className="text-slate-400 text-[11px]">• {q.topic}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            q.difficulty === 'HARD'
                              ? 'bg-rose-500/20 text-rose-400'
                              : q.difficulty === 'MEDIUM'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {q.difficulty}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-400 font-bold">
                          +{q.marks} Marks
                        </span>
                        {q.negativeMarks ? (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-rose-400 font-bold">
                            -{q.negativeMarks}
                          </span>
                        ) : null}
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                          {q.type}
                        </span>
                      </div>
                    </div>

                    {/* Question Content */}
                    <div className="text-sm text-slate-100 leading-relaxed font-sans whitespace-pre-wrap">
                      {q.content}
                    </div>

                    {/* Multiple Choice Options */}
                    {q.options && Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                        {q.options.map((opt, optIdx) => {
                          const optionLetter = String.fromCharCode(65 + optIdx);
                          return (
                            <div
                              key={optIdx}
                              className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2.5 text-xs"
                            >
                              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                                {optionLetter}
                              </span>
                              <span className="text-slate-300 leading-normal pt-0.5">{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Vault Notice */}
                    <div className="pt-1 flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                      <Lock className="w-3 h-3 text-slate-600" />
                      <span>{q.correctAnswerEncryptedNotice || '[PROTECTED BY ZEROLEAK CRYPTOGRAPHIC VAULT]'}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Complete Simulation CTA */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-emerald-500/30 text-center space-y-3">
                <h4 className="text-sm font-bold text-white">Finished Reviewing the Question Paper?</h4>
                <p className="text-xs text-slate-400 max-w-lg mx-auto">
                  Completing this simulation permanently locks the preview. You will be returned to the dashboard to
                  execute <strong>Generate Encrypted Paper</strong> (AES-256 + RSA-2048 + 3-of-5 Shamir Secret Sharing).
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setShowConfirmComplete(true)}
                    className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xl transition-all inline-flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Complete Simulation &rarr;</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CONFIRMATION MODAL (Section 7) */}
      {showConfirmComplete && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 backdrop-blur-md">
          <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">Complete Proctored Simulation?</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to complete the simulation? Once completed, this final paper{' '}
                <strong className="text-rose-400">CANNOT be previewed again</strong>.
              </p>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 text-left space-y-1">
              <div>• Simulation status will permanently update to <strong>COMPLETED</strong>.</div>
              <div>• You will proceed to <strong>Generate Encrypted Paper</strong>.</div>
              <div>• Audit logs will record completion timestamp and operator hash.</div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowConfirmComplete(false)}
                disabled={completing}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
              >
                Continue Reviewing
              </button>
              <button
                onClick={handleConfirmComplete}
                disabled={completing}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {completing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Finalizing...</span>
                  </>
                ) : (
                  <span>Complete Simulation</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

