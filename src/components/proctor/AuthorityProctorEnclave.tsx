import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Users,
  Maximize2,
  Minimize2,
  RefreshCw,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Move,
  GripVertical,
  CheckCircle2,
  Volume2,
  Radio,
  Sliders,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { User, AuthorityProctorSession, RiskLevel } from '../../types';
import { api } from '../../api';
import { detectFacesInVideo, FaceDetectionResult } from '../../utils/faceDetection';
import { AudioMonitor } from '../../utils/audioMonitor';

interface AuthorityProctorEnclaveProps {
  currentUser: User | null;
  workspaceType: string;
  examId?: string;
  children: React.ReactNode;
  title?: string;
}

export const AuthorityProctorEnclave: React.FC<AuthorityProctorEnclaveProps> = ({
  currentUser,
  workspaceType,
  examId,
  children,
  title,
}) => {
  // Session State
  const [session, setSession] = useState<AuthorityProctorSession | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [gateOpen, setGateOpen] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hardware Streams & Permissions
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(-45);
  const [verificationSnapshot, setVerificationSnapshot] = useState<string | null>(null);

  // Real-time Telemetry & Security Guards
  const [faceResult, setFaceResult] = useState<FaceDetectionResult>({ faceCount: 0, status: 'NOT_DETECTED', faces: [] });
  const [isFaceAbsent, setIsFaceAbsent] = useState(false);
  const [isShoulderSurfing, setIsShoulderSurfing] = useState(false);
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
  const [isEmergencyLocked, setIsEmergencyLocked] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState<string | null>(null);
  const [leakRiskScore, setLeakRiskScore] = useState(0);
  const [leakRiskLevel, setLeakRiskLevel] = useState<RiskLevel>('NORMAL');
  const [recentWarning, setRecentWarning] = useState<string | null>(null);

  // Movable Rectangular Camera Box HUD Controls
  const [hudMinimized, setHudMinimized] = useState(false);
  const [hudPosition, setHudPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined') {
      return {
        x: Math.max(16, window.innerWidth - 340),
        y: Math.max(16, window.innerHeight - 270),
      };
    }
    return { x: 800, y: 500 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });
  const hudRef = useRef<HTMLDivElement>(null);

  // Video & Audio Monitoring Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const gateVideoRef = useRef<HTMLVideoElement>(null);
  const audioMonitorRef = useRef<AudioMonitor | null>(null);
  const consecutiveAbsentFrames = useRef(0);
  const lastStateLogged = useRef<'NORMAL' | 'ABSENT' | 'SHOULDER_SURFING'>('NORMAL');

  // 1. Initialize Gate Hardware / Check Permissions on Mount
  useEffect(() => {
    startGatePreview();
    return () => {
      stopHardware();
    };
  }, []);

  // Ensure streamRef stays in sync
  useEffect(() => {
    streamRef.current = stream;
    if (!gateOpen && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, gateOpen]);

  const startGatePreview = async () => {
    setErrorMsg(null);
    setInitializing(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      });
      setStream(media);
      streamRef.current = media;
      setCameraActive(true);
      setMicActive(true);

      if (gateVideoRef.current) {
        gateVideoRef.current.srcObject = media;
      }

      // Audio monitor
      const audio = new AudioMonitor({
        onVolumeChange: (vol) => {
          setAudioLevel(Math.round(vol));
        },
      });
      const started = audio.start(media);
      if (started) {
        audioMonitorRef.current = audio;
      }
    } catch (err: any) {
      console.warn('Camera/Mic permission warning:', err);
      setCameraActive(false);
      setMicActive(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg('Camera and Microphone permissions were declined. Please click "Turn ON Camera & Permissions" and allow access in your browser.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMsg('No camera/microphone found. Please connect a working webcam to proceed.');
      } else {
        setErrorMsg('Camera and Microphone access are mandatory for Authority Proctor Enclave. Please grant permissions.');
      }
    } finally {
      setInitializing(false);
    }
  };

  const stopHardware = () => {
    if (audioMonitorRef.current) {
      audioMonitorRef.current.stop();
      audioMonitorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    setCameraActive(false);
    setMicActive(false);
  };

  // Capture verification snapshot
  const takeSnapshot = (): string => {
    const video = gateVideoRef.current || videoRef.current;
    if (!video) return '';
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setVerificationSnapshot(dataUrl);
        return dataUrl;
      }
    } catch (e) {
      console.error('Snapshot capture error:', e);
    }
    return '';
  };

  // Enter Enclave Session
  const handleEnterEnclave = async () => {
    if (!currentUser) return;
    if (!cameraActive || !micActive) {
      await startGatePreview();
      return;
    }

    setInitializing(true);
    setErrorMsg(null);

    const snapshot = takeSnapshot();

    try {
      const res = await api.authorityProctor.startSession({
        workspace_type: workspaceType,
        exam_id: examId,
        verification_snapshot: snapshot || undefined,
      });

      setSession(res.session);
      setSessionActive(true);
      setGateOpen(false);

      // Re-attach stream to floating movable camera box
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
      }, 100);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to initialize Authority Proctor Enclave.');
    } finally {
      setInitializing(false);
    }
  };

  // 2. Draggable Movable Box Logic
  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      startX: hudPosition.x,
      startY: hudPosition.y,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    if (e.touches.length > 0) {
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const boxWidth = hudRef.current?.offsetWidth || 320;
      const boxHeight = hudRef.current?.offsetHeight || 220;
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      const maxX = Math.max(8, window.innerWidth - boxWidth - 8);
      const maxY = Math.max(8, window.innerHeight - boxHeight - 8);

      const newX = Math.min(Math.max(8, dragStartRef.current.startX + deltaX), maxX);
      const newY = Math.min(Math.max(8, dragStartRef.current.startY + deltaY), maxY);

      setHudPosition({ x: newX, y: newY });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const boxWidth = hudRef.current?.offsetWidth || 320;
      const boxHeight = hudRef.current?.offsetHeight || 220;
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStartRef.current.mouseX;
      const deltaY = touch.clientY - dragStartRef.current.mouseY;

      const maxX = Math.max(8, window.innerWidth - boxWidth - 8);
      const maxY = Math.max(8, window.innerHeight - boxHeight - 8);

      const newX = Math.min(Math.max(8, dragStartRef.current.startX + deltaX), maxX);
      const newY = Math.min(Math.max(8, dragStartRef.current.startY + deltaY), maxY);

      setHudPosition({ x: newX, y: newY });
    };

    const handleDragEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleDragEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging]);

  // Handle window resizing to keep box inside screen
  useEffect(() => {
    const handleResize = () => {
      setHudPosition(prev => {
        const boxWidth = hudRef.current?.offsetWidth || 320;
        const boxHeight = hudRef.current?.offsetHeight || 220;
        const maxX = Math.max(8, window.innerWidth - boxWidth - 8);
        const maxY = Math.max(8, window.innerHeight - boxHeight - 8);
        return {
          x: Math.min(prev.x, maxX),
          y: Math.min(prev.y, maxY),
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Quick snap helper to move camera box to any corner
  const snapToCorner = (corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
    const boxWidth = hudRef.current?.offsetWidth || 320;
    const boxHeight = hudRef.current?.offsetHeight || 220;
    const padding = 16;
    switch (corner) {
      case 'top-left': setHudPosition({ x: padding, y: padding + 60 }); break;
      case 'top-right': setHudPosition({ x: Math.max(8, window.innerWidth - boxWidth - padding), y: padding + 60 }); break;
      case 'bottom-left': setHudPosition({ x: padding, y: Math.max(8, window.innerHeight - boxHeight - padding) }); break;
      case 'bottom-right': setHudPosition({ x: Math.max(8, window.innerWidth - boxWidth - padding), y: Math.max(8, window.innerHeight - boxHeight - padding) }); break;
    }
  };

  // 3. Active Enclave Face Detection Loop (Always keeps running)
  useEffect(() => {
    if (!sessionActive) return;

    let mounted = true;
    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const result = await detectFacesInVideo(video);
        if (!mounted) return;
        setFaceResult(result);

        // A. Face Absence check
        if (result.faceCount === 0) {
          consecutiveAbsentFrames.current += 1;
          if (consecutiveAbsentFrames.current >= 3) {
            setIsFaceAbsent(true);
            if (lastStateLogged.current !== 'ABSENT') {
              lastStateLogged.current = 'ABSENT';
              if (session) {
                api.authorityProctor.recordEvent({
                  session_id: session.id,
                  event_type: 'FACE_ABSENT_MASKED',
                  severity: 'MEDIUM',
                  metadata: { reason: 'Official absent from camera view for > 2.5s' },
                }).then(r => {
                  setLeakRiskScore(r.leak_risk_score);
                  setLeakRiskLevel(r.leak_risk_level as RiskLevel);
                });
              }
            }
          }
        } else {
          consecutiveAbsentFrames.current = 0;
          if (isFaceAbsent) {
            setIsFaceAbsent(false);
            if (lastStateLogged.current === 'ABSENT') {
              lastStateLogged.current = 'NORMAL';
              if (session) {
                api.authorityProctor.recordEvent({
                  session_id: session.id,
                  event_type: 'SCREEN_UNMASKED',
                  severity: 'LOW',
                  metadata: { action: 'Official re-verified present on camera' },
                }).then(r => {
                  setLeakRiskScore(r.leak_risk_score);
                  setLeakRiskLevel(r.leak_risk_level as RiskLevel);
                });
              }
            }
          }
        }

        // B. Shoulder-Surfing / Multiple Faces check
        if (result.faceCount >= 2) {
          setIsShoulderSurfing(true);
          if (lastStateLogged.current !== 'SHOULDER_SURFING') {
            lastStateLogged.current = 'SHOULDER_SURFING';
            const snapshot = takeSnapshot();
            if (session) {
              api.authorityProctor.recordEvent({
                session_id: session.id,
                event_type: 'SHOULDER_SURFING_DETECTED',
                severity: 'HIGH',
                metadata: {
                  faces_detected: result.faceCount,
                  action: 'Confidential paper masked immediately to prevent photography or leak',
                },
                snapshot_thumbnail: snapshot || undefined,
              }).then(r => {
                setLeakRiskScore(r.leak_risk_score);
                setLeakRiskLevel(r.leak_risk_level as RiskLevel);
                setRecentWarning('SECURITY ALERT: Second face detected behind official. Material masked.');
              });
            }
          }
        } else if (result.faceCount === 1 && isShoulderSurfing) {
          setIsShoulderSurfing(false);
          lastStateLogged.current = 'NORMAL';
        }
      } catch (err) {
        console.error('Enclave face loop error:', err);
      }
    }, 850);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [sessionActive, session, isFaceAbsent, isShoulderSurfing]);

  // 4. Tab Visibility & Window Focus Guard
  useEffect(() => {
    if (!sessionActive || !session) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsWindowBlurred(true);
        api.authorityProctor.recordEvent({
          session_id: session.id,
          event_type: 'UNAUTHORIZED_WINDOW_SWITCH',
          severity: 'MEDIUM',
          metadata: { action: 'tab_hidden_background_switch' },
        }).then(r => {
          setLeakRiskScore(r.leak_risk_score);
          setLeakRiskLevel(r.leak_risk_level as RiskLevel);
          setRecentWarning('WARNING: Leaving enclave window masks confidential exam material.');
        });
      } else {
        setIsWindowBlurred(false);
      }
    };

    const handleWindowBlur = () => {
      setIsWindowBlurred(true);
      api.authorityProctor.recordEvent({
        session_id: session.id,
        event_type: 'UNAUTHORIZED_WINDOW_SWITCH',
        severity: 'MEDIUM',
        metadata: { action: 'window_blur_focus_lost' },
      }).then(r => {
        setLeakRiskScore(r.leak_risk_score);
        setLeakRiskLevel(r.leak_risk_level as RiskLevel);
      });
    };

    const handleWindowFocus = () => {
      setIsWindowBlurred(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [sessionActive, session]);

  // 5. Clipboard & Screen Capture Interception
  useEffect(() => {
    if (!sessionActive || !session) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setRecentWarning('Right-click context menu is disabled in Authority Proctor Enclave.');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        setRecentWarning('Screenshot attempt intercepted. Incident logged to audit ledger.');
        api.authorityProctor.recordEvent({
          session_id: session.id,
          event_type: 'SCREENSHOT_ATTEMPT_BLOCKED',
          severity: 'HIGH',
          metadata: { key: 'PrintScreen' },
        }).then(r => {
          setLeakRiskScore(r.leak_risk_score);
          setLeakRiskLevel(r.leak_risk_level as RiskLevel);
        });
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'c' || k === 'v' || k === 'x' || k === 's' || k === 'p' || k === 'u') {
          e.preventDefault();
          setRecentWarning(`Unauthorized shortcut '${e.key.toUpperCase()}' intercepted by Enclave.`);
          api.authorityProctor.recordEvent({
            session_id: session.id,
            event_type: 'CLIPBOARD_EXTRACTION_BLOCKED',
            severity: 'MEDIUM',
            metadata: { shortcut: e.key },
          }).then(r => {
            setLeakRiskScore(r.leak_risk_score);
            setLeakRiskLevel(r.leak_risk_level as RiskLevel);
          });
        }
      }

      if (e.key === 'F12') {
        e.preventDefault();
        setRecentWarning('Developer Inspection Tools are restricted in Authority Enclave.');
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sessionActive, session]);

  // 6. Periodic Heartbeat Loop (every 4s)
  useEffect(() => {
    if (!sessionActive || !session) return;

    const interval = setInterval(async () => {
      try {
        const hb = await api.authorityProctor.sendHeartbeat({
          session_id: session.id,
          camera_status: cameraActive ? 'ACTIVE' : 'DISABLED',
          microphone_status: micActive ? 'ACTIVE' : 'DISABLED',
          fullscreen_status: document.fullscreenElement ? 'ACTIVE' : 'EXITED',
          face_status: isShoulderSurfing
            ? 'SHOULDER_SURFING_DETECTED'
            : isFaceAbsent
            ? 'ABSENT'
            : 'VERIFIED',
          faces_detected_count: faceResult.faceCount,
          audio_level_db: audioLevel,
        });

        if (hb.emergency_locked) {
          setIsEmergencyLocked(true);
          setEmergencyReason(hb.emergency_lock_reason || 'Administrative Lockdown');
        }
      } catch (err) {
        console.warn('Enclave heartbeat check:', err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [sessionActive, session, cameraActive, micActive, isShoulderSurfing, isFaceAbsent, faceResult, audioLevel]);

  // Dismiss toast warning after 4.5s
  useEffect(() => {
    if (recentWarning) {
      const timer = setTimeout(() => setRecentWarning(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [recentWarning]);

  // Listen for direct enter event from header or quick-links
  useEffect(() => {
    const handleDirectEnter = () => {
      if (gateOpen) {
        if (cameraActive && micActive) {
          handleEnterEnclave();
        } else {
          startGatePreview();
        }
      }
    };

    window.addEventListener('enter-authority-enclave', handleDirectEnter);
    return () => window.removeEventListener('enter-authority-enclave', handleDirectEnter);
  }, [gateOpen, cameraActive, micActive]);

  // =========================================================================
  // RENDER: 1. Mandatory Pre-Enclave Permission & Camera Gate Screen
  // =========================================================================
  if (gateOpen) {
    const allPermissionsGranted = cameraActive && micActive;

    return (
      <div className="rounded-2xl border-2 border-slate-700 bg-slate-950 text-slate-100 p-4 sm:p-7 shadow-2xl relative overflow-hidden">
        {/* Top security gradient strip */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />

        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">
          {/* Header Banner */}
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-600/40 text-emerald-400 text-xs font-mono font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Mandatory On-Camera Authority Enclave</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {title || 'Authority Proctor Mode: Hardware & Security Permissions'}
            </h2>
            <p className="text-slate-400 text-xs max-w-xl mx-auto">
              To prevent examination paper leaks, all officials must turn <strong className="text-emerald-300">ON Camera</strong> and <strong className="text-emerald-300">ON Microphone</strong> before accessing confidential question authoring, vetting, or decryption.
            </p>
          </div>

          {/* HIGH PRIORITY PROCEED BANNER WHEN PERMISSIONS READY */}
          {allPermissionsGranted && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 border-2 border-emerald-400 shadow-xl shadow-emerald-950/60 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-emerald-300 shrink-0">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <p className="text-sm font-black text-emerald-200 tracking-wide">
                      ALL PERMISSIONS READY • VERIFY ASSIGNED QUESTIONS
                    </p>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Hardware sensors verified. Click below to unlock your assigned questions queue now.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleEnterEnclave}
                disabled={initializing}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/80 flex items-center justify-center gap-2 transition-all cursor-pointer transform hover:scale-[1.03] active:scale-95 shrink-0"
              >
                {initializing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Entering Enclave...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-slate-950" />
                    <span>Enter Enclave & Start Review →</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Main Verification Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            {/* Left: Rectangular Live Camera Viewfinder */}
            <div className="md:col-span-6 space-y-2.5">
              <div className="relative aspect-video max-h-52 w-full bg-slate-900 rounded-xl overflow-hidden border-2 border-slate-700 shadow-xl flex items-center justify-center">
                <video
                  ref={gateVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />

                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 text-slate-400 p-6 text-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-rose-950/50 border border-rose-800 flex items-center justify-center text-rose-400 shadow-inner">
                      <CameraOff className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Camera Offline</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Camera permission required to verify single-official presence.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={startGatePreview}
                      disabled={initializing}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Turn ON Camera
                    </button>
                  </div>
                )}

                {cameraActive && (
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-950/85 backdrop-blur text-[11px] border border-slate-800">
                    <span className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                      Live Camera Streaming
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-slate-300">
                      <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                      {audioLevel} dB
                    </span>
                  </div>
                )}
              </div>

              {/* Identity Pill */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-slate-400">Official:</span>
                  <span className="text-white font-medium truncate">{currentUser?.full_name || 'Authorized Official'}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-emerald-400 font-bold border border-slate-700">
                  {currentUser?.role || 'OFFICIAL'}
                </span>
              </div>
            </div>

            {/* Right: Permission Checklist Cards */}
            <div className="md:col-span-6 space-y-2.5">
              {/* Permission 1: Camera */}
              <div className={`p-3.5 rounded-xl border transition-all ${
                cameraActive ? 'bg-emerald-950/30 border-emerald-600/50' : 'bg-slate-900/60 border-slate-800'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg mt-0.5 ${
                      cameraActive ? 'bg-emerald-900/60 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Camera className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>1. Camera Permission (Webcam ON)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Continuous visual tracking to ensure single official presence and detect shoulder surfing.
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    cameraActive ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}>
                    {cameraActive ? 'GRANTED' : 'REQUIRED'}
                  </span>
                </div>
              </div>

              {/* Permission 2: Microphone */}
              <div className={`p-3.5 rounded-xl border transition-all ${
                micActive ? 'bg-emerald-950/30 border-emerald-600/50' : 'bg-slate-900/60 border-slate-800'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg mt-0.5 ${
                      micActive ? 'bg-emerald-900/60 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Mic className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>2. Microphone Permission (Audio ON)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Acoustic level monitoring to detect unauthorized communication or collusion in the room.
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    micActive ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}>
                    {micActive ? 'GRANTED' : 'REQUIRED'}
                  </span>
                </div>
              </div>

              {/* Permission 3: Fullscreen & Window Switch Guard */}
              <div className="p-3.5 rounded-xl border bg-emerald-950/30 border-emerald-600/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg mt-0.5 bg-emerald-900/60 text-emerald-400">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">
                        <span>3. Focus & Anti-Switching Shield</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Switching windows or pressing Alt+Tab immediately masks confidential paper questions.
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 shrink-0">
                    ARMED
                  </span>
                </div>
              </div>

              {/* Permission 4: Clipboard & Capture Interception */}
              <div className="p-3.5 rounded-xl border bg-emerald-950/30 border-emerald-600/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg mt-0.5 bg-emerald-900/60 text-emerald-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">
                        <span>4. Anti-Screenshot & Clipboard Shield</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Blocks PrintScreen, Snipping Tool, Ctrl+C copy, and developer inspect console.
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 shrink-0">
                    ENFORCED
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Error Message if Denied */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Button Section */}
          <div className="pt-2 text-center space-y-3">
            {!allPermissionsGranted ? (
              <button
                type="button"
                onClick={startGatePreview}
                disabled={initializing}
                className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-sm shadow-xl shadow-amber-950/50 flex items-center gap-3 mx-auto transition-all cursor-pointer transform hover:scale-[1.02]"
              >
                {initializing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Requesting Camera & Mic Permissions...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    <span>Step 1: Turn ON Camera & Microphone</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEnterEnclave}
                disabled={initializing}
                className="px-10 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm shadow-xl shadow-emerald-950/60 flex items-center gap-3 mx-auto transition-all cursor-pointer transform hover:scale-[1.03] active:scale-95 ring-2 ring-emerald-400/60"
              >
                {initializing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin text-slate-950" />
                    <span>Initializing Secure Enclave...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5 text-slate-950" />
                    <span>Enter On-Camera Enclave & Verify Questions →</span>
                  </>
                )}
              </button>
            )}

            <p className="text-[11px] text-slate-400">
              {allPermissionsGranted
                ? '✓ All permissions verified. Click above to open the double-blind question vetting portal & review assigned questions.'
                : 'Click "Turn ON Camera" and select "Allow" in your browser popup to unlock this workspace.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER: 2. Active Enclave Mode with Movable Rectangular Camera Box
  // =========================================================================
  return (
    <div className="relative min-h-[500px]">
      {/* Toast Warning */}
      {recentWarning && (
        <div className="fixed top-20 right-6 z-50 max-w-md p-3.5 rounded-xl bg-slate-900 border border-amber-600 text-amber-200 shadow-2xl flex items-center gap-3 animate-bounce">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="text-xs font-medium">{recentWarning}</div>
        </div>
      )}

      {/* MOVABLE RECTANGULAR CAMERA BOX */}
      <div
        ref={hudRef}
        style={{
          left: `${hudPosition.x}px`,
          top: `${hudPosition.y}px`,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className={`fixed z-50 bg-slate-900/95 backdrop-blur-md rounded-2xl border-2 ${
          isDragging
            ? 'border-emerald-400 shadow-2xl shadow-emerald-950/80 scale-[1.02]'
            : isShoulderSurfing
            ? 'border-rose-500 shadow-2xl shadow-rose-950/80 animate-pulse'
            : isFaceAbsent
            ? 'border-amber-500 shadow-2xl shadow-amber-950/80'
            : 'border-slate-700 shadow-2xl hover:border-slate-600'
        } overflow-hidden transition-all duration-75 select-none w-72 sm:w-80 cursor-grab active:cursor-grabbing`}
      >
        {/* Draggable Header Bar */}
        <div className="px-3 py-2 bg-slate-800/95 border-b border-slate-700 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 truncate">
            <div className="p-1 rounded bg-slate-700 text-slate-300" title="Drag to move anywhere on screen">
              <Move className="w-3.5 h-3.5" />
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-bold text-white text-[11px] uppercase tracking-wider truncate">
              Authority Camera
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
              [Drag to Move]
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              leakRiskScore >= 60 ? 'bg-rose-950 text-rose-300 border border-rose-800' :
              leakRiskScore >= 30 ? 'bg-amber-950 text-amber-300 border border-amber-800' :
              'bg-emerald-950 text-emerald-300 border border-emerald-800'
            }`}>
              Risk: {leakRiskScore}
            </span>
            <button
              type="button"
              onClick={() => setHudMinimized(!hudMinimized)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 cursor-pointer"
              title={hudMinimized ? 'Expand Camera Box' : 'Minimize Camera Box'}
            >
              {hudMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Rectangular Live Camera View (Always keeps video element in DOM for continuous face detection) */}
        <div className={hudMinimized ? 'hidden' : 'p-3 space-y-2'}>
          <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />

            {/* Live Face Status Overlay Pill */}
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur shadow flex items-center gap-1.5 ${
                isShoulderSurfing
                  ? 'bg-rose-900/95 text-rose-200 border border-rose-500 animate-pulse'
                  : isFaceAbsent
                  ? 'bg-amber-900/95 text-amber-200 border border-amber-500'
                  : 'bg-emerald-900/95 text-emerald-200 border border-emerald-500'
              }`}>
                {isShoulderSurfing ? (
                  <>
                    <Users className="w-3 h-3" />
                    <span>2+ Faces (Shoulder Surfing!)</span>
                  </>
                ) : isFaceAbsent ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>No Face Detected</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Official Verified (1 Face)</span>
                  </>
                )}
              </span>
            </div>

            {/* Live Audio Decibel Meter Bar */}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-2.5 py-1 rounded bg-slate-950/85 backdrop-blur text-[10px] text-slate-300 font-mono border border-slate-800/80">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Mic className="w-3 h-3" />
                <span>{audioLevel} dB</span>
              </span>
              <span className="text-[9px] text-slate-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Surveillance
              </span>
            </div>
          </div>

          {/* Quick Snap Positioning Controls & Official Identity */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
            <div className="flex items-center gap-1.5 truncate">
              <span className="truncate max-w-[130px] text-slate-200 font-medium">
                {currentUser?.full_name}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-mono text-emerald-400">
                {currentUser?.role}
              </span>
            </div>

            {/* Snap Corners Buttons */}
            <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400">
              <span className="text-[8px] uppercase tracking-wider text-slate-500">Snap:</span>
              <button
                type="button"
                onClick={() => snapToCorner('top-left')}
                className="px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                title="Snap Top-Left"
              >
                TL
              </button>
              <button
                type="button"
                onClick={() => snapToCorner('top-right')}
                className="px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                title="Snap Top-Right"
              >
                TR
              </button>
              <button
                type="button"
                onClick={() => snapToCorner('bottom-right')}
                className="px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                title="Snap Bottom-Right"
              >
                BR
              </button>
            </div>
          </div>
        </div>

        {/* Minimized Fallback: Compact bar that still keeps video element mounted */}
        {hudMinimized && (
          <div className="px-3 py-1.5 bg-slate-900/95 flex items-center justify-between text-[11px]">
            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
              <Eye className="w-3.5 h-3.5" />
              <span>Face Verified (Movable)</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {audioLevel} dB
            </span>
          </div>
        )}
      </div>

      {/* SECURITY SHIELD 1: Face Absent Blackout */}
      {isFaceAbsent && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center text-slate-100 animate-fade-in select-none">
          <div className="p-4 rounded-3xl bg-amber-950/80 border-2 border-amber-600 text-amber-400 mb-6 shadow-2xl shadow-amber-950">
            <EyeOff className="w-16 h-16" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-wide">
            Confidential Material Masked
          </h2>
          <p className="text-amber-300 text-sm font-medium mt-1">
            Authorized Official Absent From Camera
          </p>
          <p className="text-slate-400 text-xs max-w-md mt-3">
            To prevent question paper leaks to unauthorized persons or passers-by, all confidential examination data is automatically blacked out. Return to your camera to resume work.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            Monitoring Camera for Official's Return...
          </div>
        </div>
      )}

      {/* SECURITY SHIELD 2: Shoulder Surfing (Multiple Faces) Censor */}
      {isShoulderSurfing && (
        <div className="fixed inset-0 z-50 bg-rose-950/90 backdrop-blur-2xl flex flex-col items-center justify-center p-8 text-center text-slate-100 animate-fade-in select-none">
          <div className="p-4 rounded-3xl bg-rose-900 border-2 border-rose-500 text-rose-200 mb-6 shadow-2xl shadow-rose-950 animate-bounce">
            <Users className="w-16 h-16" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-wide">
            LEAK PREVENTION ALERT: SECONDARY FACE DETECTED
          </h2>
          <p className="text-rose-300 text-base font-semibold mt-2">
            Shoulder Surfing / Unauthorized Person in Camera View
          </p>
          <p className="text-slate-300 text-xs max-w-lg mt-3 bg-black/40 p-4 rounded-xl border border-rose-800">
            A secondary individual was detected looking at your screen. The question paper has been immediately masked and watermarked. A high-resolution audit snapshot has been logged to the examination committee ledger.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 border border-rose-700 text-xs font-mono text-rose-300">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            Ensure complete physical privacy before continuing.
          </div>
        </div>
      )}

      {/* SECURITY SHIELD 3: Window Unfocused / Blurred */}
      {isWindowBlurred && !isFaceAbsent && !isShoulderSurfing && (
        <div className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-slate-100 animate-fade-in select-none">
          <div className="p-3 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 mb-4">
            <ShieldAlert className="w-10 h-10 text-amber-400" />
          </div>
          <h3 className="text-xl font-bold text-white">
            Enclave Window Unfocused
          </h3>
          <p className="text-slate-400 text-xs max-w-sm mt-2">
            You navigated away from the secure examination window. External screen capture and application switching are restricted. Click anywhere on this screen to refocus.
          </p>
        </div>
      )}

      {/* SECURITY SHIELD 4: Emergency Remote Lockdown by Admin */}
      {isEmergencyLocked && (
        <div className="fixed inset-0 z-50 bg-rose-950/98 backdrop-blur-3xl flex flex-col items-center justify-center p-8 text-center text-slate-100 animate-fade-in select-none">
          <div className="p-5 rounded-3xl bg-black border-2 border-rose-600 text-rose-500 mb-6 shadow-2xl">
            <Lock className="w-16 h-16" />
          </div>
          <h2 className="text-3xl font-extrabold text-white uppercase tracking-wider">
            TERMINAL EMERGENCY LOCKDOWN
          </h2>
          <p className="text-rose-400 text-sm font-semibold mt-2">
            Session Terminated by Examination Registrar / Auditor
          </p>
          <p className="text-slate-300 text-xs max-w-md mt-4 bg-black/60 p-4 rounded-xl border border-rose-900">
            <strong>Reason:</strong> {emergencyReason || 'Suspected leak breach or unauthorized camera tampering.'}
          </p>
          <p className="text-slate-500 text-xs mt-6">
            Contact the Central Examination Authority to conduct an audit review.
          </p>
        </div>
      )}

      {/* Underlying Confidential Workspace Content */}
      <div className="relative select-none">
        {children}
      </div>
    </div>
  );
};
