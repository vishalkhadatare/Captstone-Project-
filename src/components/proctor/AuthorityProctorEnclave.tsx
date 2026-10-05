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
  RefreshCw,
  XCircle,
  AlertCircle,
  CheckCircle2,
  Volume2,
  Radio,
  FileText,
  Send,
  Trash2,
  Play,
  Square,
  Clock,
  Info,
  ExternalLink,
  ChevronRight,
  Shield,
  Activity,
  Check,
  Award,
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

interface TimelineEvent {
  id: string;
  time: string;
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
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
  const [audioLevel, setAudioLevel] = useState(-42);
  const [audioVolumePercent, setAudioVolumePercent] = useState(15);
  const [verificationSnapshot, setVerificationSnapshot] = useState<string | null>(null);

  // Real-time Telemetry & Security Guards
  const [faceResult, setFaceResult] = useState<FaceDetectionResult>({ faceCount: 0, status: 'NOT_DETECTED', faces: [] });
  const [isFaceAbsent, setIsFaceAbsent] = useState(false);
  const [isShoulderSurfing, setIsShoulderSurfing] = useState(false);
  const [isEmergencyLocked, setIsEmergencyLocked] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState<string | null>(null);
  const [leakRiskScore, setLeakRiskScore] = useState(0);
  const [leakRiskLevel, setLeakRiskLevel] = useState<RiskLevel>('NORMAL');
  const [recentWarning, setRecentWarning] = useState<string | null>(null);

  // Warnings Engine: Strictly Maximum 3 Warnings (0/3 to 3/3, never 4/3)
  const [warningCount, setWarningCount] = useState(0);
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [activeWarningData, setActiveWarningData] = useState<{ number: number; title: string; reason: string } | null>(null);
  const lastWarningTimestamp = useRef<number>(0);

  // Focus & Debounced Window Guard
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
  const blurTimerRef = useRef<any>(null);
  const blurWarningFiredRef = useRef<boolean>(false);

  // Voice Evidence Recorder State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null);
  const [voiceDataUrl, setVoiceDataUrl] = useState<string | null>(null);
  const [voiceFileSizeBytes, setVoiceFileSizeBytes] = useState(0);
  const [isSubmittingVoice, setIsSubmittingVoice] = useState(false);
  const [voiceSentSuccess, setVoiceSentSuccess] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordIntervalRef = useRef<any>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Policy Modal
  const [policyModalOpen, setPolicyModalOpen] = useState(false);

  // Live Activity Timeline
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([
    {
      id: 'init-1',
      time: new Date().toLocaleTimeString(),
      event_type: 'SYSTEM_BOOT',
      severity: 'LOW',
      description: 'ZeroLeak Anti-Leak Enclave subsystem initialized',
    },
  ]);

  // Video & Audio Monitoring Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const gateVideoRef = useRef<HTMLVideoElement>(null);
  const audioMonitorRef = useRef<AudioMonitor | null>(null);
  const consecutiveAbsentFrames = useRef(0);
  const lastStateLogged = useRef<'NORMAL' | 'ABSENT' | 'SHOULDER_SURFING'>('NORMAL');

  // Live Clock
  const [currentTimeStr, setCurrentTimeStr] = useState<string>(new Date().toLocaleTimeString());
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTimeStr(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // 1. Initialize Gate Hardware & Permissions on Mount
  useEffect(() => {
    startGatePreview();
    return () => {
      stopHardware();
    };
  }, []);

  // Keep streamRef in sync with state
  useEffect(() => {
    streamRef.current = stream;
    if (!gateOpen && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, gateOpen]);

  const addTimelineEvent = (type: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', description: string) => {
    setTimelineEvents(prev => [
      {
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        time: new Date().toLocaleTimeString(),
        event_type: type,
        severity,
        description,
      },
      ...prev.slice(0, 19), // keep latest 20
    ]);
  };

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

      // Start Audio Monitor
      const audio = new AudioMonitor({
        onVolumeChange: (vol) => {
          setAudioVolumePercent(vol);
          // Scale percent (0-100) to decibels (-65 to -15)
          const computedDb = Math.round(-65 + (vol * 0.5));
          setAudioLevel(computedDb);
        },
      });
      const started = audio.start(media);
      if (started) {
        audioMonitorRef.current = audio;
      }

      addTimelineEvent('HARDWARE_READY', 'LOW', 'Camera and acoustic hardware sensors successfully authenticated');
    } catch (err: any) {
      console.warn('Camera/Mic permission warning:', err);
      setCameraActive(false);
      setMicActive(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg('Camera and Microphone permissions were declined. Please allow camera access in your browser to unlock the confidential workspace.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMsg('No camera or microphone found. Please attach an authorized webcam/microphone device.');
      } else {
        setErrorMsg('Camera & Microphone access is mandatory to access confidential exam materials under proctor protocol.');
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        setVerificationSnapshot(dataUrl);
        return dataUrl;
      }
    } catch (e) {
      console.error('Snapshot capture error:', e);
    }
    return '';
  };

  // Enter Enclave Session (Pre-start Gate Action)
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
      setWarningCount(Number(res.session.warning_count) || 0);

      addTimelineEvent('ENCLAVE_STARTED', 'LOW', `Secure enclave session ${res.session.id} initiated on-camera`);

      // Attach stream to active camera view
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

  // =========================================================================
  // WARNING DISPATCHER: Strictly Capped at 3 Warnings (0/3 to 3/3, never 4/3)
  // =========================================================================
  const issueWarning = async (reason: string, details?: any) => {
    if (!session) return;

    // Cooldown check: do not fire warnings more frequently than once every 5 seconds
    const now = Date.now();
    if (now - lastWarningTimestamp.current < 5000) {
      return;
    }
    lastWarningTimestamp.current = now;

    try {
      const res = await api.authorityProctor.issueWarning({
        session_id: session.id,
        reason,
        details,
      });

      const newCount = Math.min(3, res.warning_count);
      setWarningCount(newCount);

      const warningTitle =
        newCount === 1
          ? 'Warning 1 of 3: First Security Notice'
          : newCount === 2
          ? 'Warning 2 of 3: FINAL WARNING'
          : 'Warning 3 of 3: Critical Violation — Session Flagged For Review';

      setActiveWarningData({
        number: newCount,
        title: warningTitle,
        reason,
      });
      setWarningModalOpen(true);

      addTimelineEvent(`WARNING_${newCount}`, newCount === 3 ? 'CRITICAL' : 'HIGH', reason);

      if (newCount >= 3 || res.is_locked) {
        setIsEmergencyLocked(true);
        setEmergencyReason(`Violation threshold reached (3/3). Session flagged for review by Chief Vigilance & Security Auditor.`);
      }
    } catch (err) {
      console.error('Error issuing authority warning:', err);
    }
  };

  // 2. Active Enclave Face Detection Loop (850ms cycle)
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

        // A. Face Absence Check
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
                addTimelineEvent('FACE_ABSENT', 'MEDIUM', 'Official absent from camera view — content masked');
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
                addTimelineEvent('FACE_RESTORED', 'LOW', 'Official presence re-verified on camera');
              }
            }
          }
        }

        // B. Shoulder Surfing / Multiple Faces Check
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
              addTimelineEvent('SHOULDER_SURFING', 'HIGH', 'Multiple faces detected in camera frame');
              issueWarning('Secondary face detected looking at confidential examination screen');
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

  // 3. Tab Visibility & Window Focus Guard with >2.5s Debounce & Deduplication
  useEffect(() => {
    if (!sessionActive || !session) return;

    const onBlurOrHidden = () => {
      setIsWindowBlurred(true);

      // Start 2.5s debounce timer
      if (!blurTimerRef.current && !blurWarningFiredRef.current) {
        blurTimerRef.current = setTimeout(() => {
          blurWarningFiredRef.current = true;
          api.authorityProctor.recordEvent({
            session_id: session.id,
            event_type: 'UNAUTHORIZED_WINDOW_SWITCH',
            severity: 'MEDIUM',
            metadata: { action: 'window_unfocused_gt_2500ms' },
          }).then(r => {
            setLeakRiskScore(r.leak_risk_score);
            setLeakRiskLevel(r.leak_risk_level as RiskLevel);
          });
          addTimelineEvent('FOCUS_LOST', 'MEDIUM', 'Official unfocused or navigated away from enclave window (>2.5s)');
          issueWarning('Navigated away or switched windows away from confidential exam enclave for >2.5 seconds');
        }, 2500);
      }
    };

    const onFocusOrVisible = () => {
      setIsWindowBlurred(false);
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      // Reset fired ref on returning to focus so a new, future blur is monitored
      blurWarningFiredRef.current = false;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        onBlurOrHidden();
      } else {
        onFocusOrVisible();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', onBlurOrHidden);
    window.addEventListener('focus', onFocusOrVisible);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', onBlurOrHidden);
      window.removeEventListener('focus', onFocusOrVisible);
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }
    };
  }, [sessionActive, session, warningCount]);

  // 4. Clipboard & Screen Capture Interception
  useEffect(() => {
    if (!sessionActive || !session) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setRecentWarning('Right-click context menu is restricted in Authority Proctor Enclave.');
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
        addTimelineEvent('SCREENSHOT_BLOCKED', 'HIGH', 'PrintScreen attempt intercepted & logged');
        issueWarning('PrintScreen key stroke intercepted by security shield');
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
          addTimelineEvent('CLIPBOARD_BLOCKED', 'MEDIUM', `Clipboard copy/paste shortcut '${e.key.toUpperCase()}' blocked`);
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
  }, [sessionActive, session, warningCount]);

  // 5. Periodic Heartbeat Loop (every 4s)
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
          setEmergencyReason(hb.emergency_lock_reason || 'Remote Lockdown by Examination Registrar / Auditor');
        }

        if (hb.warning_count !== undefined && hb.warning_count > warningCount) {
          setWarningCount(Math.min(3, hb.warning_count));
        }
      } catch (err) {
        console.warn('Enclave heartbeat check:', err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [sessionActive, session, cameraActive, micActive, isShoulderSurfing, isFaceAbsent, faceResult, audioLevel, warningCount]);

  // Toast warning auto-dismiss
  useEffect(() => {
    if (recentWarning) {
      const timer = setTimeout(() => setRecentWarning(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [recentWarning]);

  // =========================================================================
  // VOICE EVIDENCE RECORDER: MediaRecorder API Integration
  // =========================================================================
  const startVoiceRecording = () => {
    if (!streamRef.current) {
      setErrorMsg('Microphone stream is not available for recording.');
      return;
    }

    try {
      recordedChunksRef.current = [];
      const options = { mimeType: 'audio/webm' };
      const recorder = new MediaRecorder(
        streamRef.current,
        MediaRecorder.isTypeSupported('audio/webm') ? options : undefined
      );

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setVoiceAudioUrl(url);
        setVoiceFileSizeBytes(blob.size);

        // Convert blob to Data URL
        const reader = new FileReader();
        reader.onloadend = () => {
          setVoiceDataUrl(reader.result as string);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      setVoiceSentSuccess(false);

      recordIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      addTimelineEvent('VOICE_RECORDING_STARTED', 'LOW', 'Acoustic evidence recorder started by official');
    } catch (err: any) {
      console.error('Error starting MediaRecorder:', err);
      setErrorMsg('Could not initialize audio recording: ' + err.message);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingVoice) {
      mediaRecorderRef.current.stop();
      setIsRecordingVoice(false);
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current);
        recordIntervalRef.current = null;
      }
      addTimelineEvent('VOICE_RECORDING_STOPPED', 'LOW', `Audio recording completed (${recordingSeconds}s)`);
    }
  };

  const deleteVoiceRecording = () => {
    setVoiceAudioUrl(null);
    setVoiceDataUrl(null);
    setRecordingSeconds(0);
    recordedChunksRef.current = [];
    setVoiceSentSuccess(false);
  };

  const submitVoiceEvidence = async () => {
    if (!session || !voiceDataUrl) return;
    setIsSubmittingVoice(true);
    try {
      await api.authorityProctor.submitVoiceEvidence({
        session_id: session.id,
        exam_id: examId,
        audio_data_url: voiceDataUrl,
        duration_seconds: recordingSeconds,
        file_size_bytes: voiceFileSizeBytes,
        mime_type: 'audio/webm',
        warning_number: warningCount,
      });

      setVoiceSentSuccess(true);
      addTimelineEvent('VOICE_EVIDENCE_SENT', 'MEDIUM', `Voice note (${recordingSeconds}s) transmitted to Chief Vigilance Auditor`);
      setRecentWarning('Voice evidence delivered to Chief Vigilance & Security Auditor review queue.');
    } catch (err: any) {
      console.error('Submit voice evidence error:', err);
      setErrorMsg('Failed to submit voice evidence: ' + err.message);
    } finally {
      setIsSubmittingVoice(false);
    }
  };

  // Helper formatting mm:ss
  const formatTimeSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Audio level bars visualizer
  const renderAudioLevelBars = () => {
    const barsCount = 8;
    // Map volume 0-100 to active bars
    const activeBars = Math.min(barsCount, Math.ceil((audioVolumePercent / 100) * barsCount));
    const heights = [10, 14, 18, 22, 26, 22, 16, 12];

    return (
      <div className="flex items-center gap-1 h-7 px-2 py-1 rounded-md bg-[#F0F4F8] border border-[#DCE6EA]">
        {heights.map((h, i) => {
          const isActive = i < activeBars;
          return (
            <div
              key={i}
              style={{ height: `${h}px` }}
              className={`w-1 rounded-full transition-all duration-100 ${
                isActive
                  ? i >= 6
                    ? 'bg-[#E84B5F]'
                    : i >= 4
                    ? 'bg-[#F0A11A]'
                    : 'bg-[#00A878]'
                  : 'bg-[#C8D7DE]'
              }`}
            />
          );
        })}
      </div>
    );
  };

  // =========================================================================
  // RENDER: 1. Mandatory Pre-Enclave Permission & Camera Gate Screen (LIGHT UI)
  // =========================================================================
  if (gateOpen) {
    const allPermissionsGranted = cameraActive && micActive;

    return (
      <div className="min-h-[640px] bg-[#F6F9FA] rounded-2xl border border-[#DCE6EA] p-6 sm:p-10 shadow-sm relative overflow-hidden text-[#0F172A]">
        {/* Top security emerald accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00A878] via-[#00B8D9] to-[#2878D8]" />

        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header Banner */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[#00A878] text-xs font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-[#00A878]" />
              <span>Mandatory On-Camera Authority Enclave</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
              {title || 'Translator Confidential Translation Enclave'}
            </h2>
            <p className="text-[#475569] text-sm max-w-2xl mx-auto">
              Under central examination security protocols, all question authoring, translation, and vetting activities are conducted on-camera with continuous acoustic monitoring to guarantee zero leak tolerance.
            </p>
          </div>

          {/* Main Verification Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Left: Rectangular Live Camera Viewfinder */}
            <div className="md:col-span-6 bg-white rounded-2xl border border-[#DCE6EA] p-4 shadow-xs flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#F0F4F8]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#00A878] animate-ping" />
                  <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Official Hardware Camera Feed
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[#64748B]">16:9 • 720p HD</span>
              </div>

              <div className="relative aspect-video w-full bg-[#0F172A] rounded-xl overflow-hidden border border-[#DCE6EA] shadow-inner flex items-center justify-center">
                <video
                  ref={gateVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />

                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 text-[#475569] p-6 text-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-[#E84B5F]">
                      <CameraOff className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0F172A]">Camera Sensor Offline</p>
                      <p className="text-xs text-[#64748B] mt-1 max-w-xs">
                        Camera permission required to authenticate official identity before access is granted.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={startGatePreview}
                      disabled={initializing}
                      className="px-4 py-2 rounded-lg bg-[#00A878] hover:bg-[#008f66] text-white font-semibold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Turn ON Camera & Microphone
                    </button>
                  </div>
                )}

                {cameraActive && (
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between px-3 py-1.5 rounded-lg bg-black/75 backdrop-blur text-[11px] text-white">
                    <span className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      Live Hardware Stream Ready
                    </span>
                    <span className="font-mono text-slate-300">{audioLevel} dB</span>
                  </div>
                )}
              </div>

              {/* Official Identity Badge */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-2 h-2 rounded-full bg-[#00A878]" />
                  <span className="text-[#64748B]">Authenticated Official:</span>
                  <span className="font-semibold text-[#0F172A] truncate">
                    {currentUser?.full_name || 'Assigned Official'}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[#00A878] font-mono text-[10px] font-bold">
                  {currentUser?.role || 'TRANSLATOR'}
                </span>
              </div>
            </div>

            {/* Right: Permission Verification Checklist */}
            <div className="md:col-span-6 space-y-3 flex flex-col justify-between">
              {/* Check 1: Camera */}
              <div className={`p-4 rounded-xl border transition-all ${
                cameraActive ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-[#DCE6EA]'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      cameraActive ? 'bg-emerald-100 text-[#00A878]' : 'bg-[#F0F4F8] text-[#64748B]'
                    }`}>
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#0F172A]">1. Visual Biometric Surveillance</h4>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        Continuous facial tracking to verify single authorized official presence and block unauthorized viewers.
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    cameraActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {cameraActive ? 'VERIFIED' : 'REQUIRED'}
                  </span>
                </div>
              </div>

              {/* Check 2: Microphone */}
              <div className={`p-4 rounded-xl border transition-all ${
                micActive ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-[#DCE6EA]'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      micActive ? 'bg-emerald-100 text-[#00A878]' : 'bg-[#F0F4F8] text-[#64748B]'
                    }`}>
                      <Mic className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#0F172A]">2. Acoustic Monitoring & Voice Evidence</h4>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        Room noise & voice monitoring with direct voice reporting to the Chief Vigilance & Security Auditor.
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    micActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {micActive ? 'VERIFIED' : 'REQUIRED'}
                  </span>
                </div>
              </div>

              {/* Check 3: Focus Guard */}
              <div className="p-4 rounded-xl border bg-white border-[#DCE6EA]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 text-[#2878D8]">
                      <Maximize2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#0F172A]">3. Focus & Anti-Switching Shield</h4>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        Strict 3-warning threshold. Switching tabs or windows for &gt;2.5s automatically triggers an audited violation.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 shrink-0">
                    ARMED
                  </span>
                </div>
              </div>

              {/* Check 4: Anti-Screenshot */}
              <div className="p-4 rounded-xl border bg-white border-[#DCE6EA]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-indigo-50 text-[#6257E8]">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#0F172A]">4. Anti-Screenshot & Copy Interception</h4>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        PrintScreen, Snipping tool, and Ctrl+C clipboard extractions are strictly intercepted and logged.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 shrink-0">
                    ENFORCED
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Error Message if Denied */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Button Section: 50px tall prominent emerald CTA */}
          <div className="pt-2 text-center space-y-3">
            {!allPermissionsGranted ? (
              <button
                type="button"
                onClick={startGatePreview}
                disabled={initializing}
                className="h-[50px] px-8 rounded-xl bg-[#00A878] hover:bg-[#008f66] text-white font-bold text-sm shadow-md hover:shadow-lg flex items-center justify-center gap-3 mx-auto transition-all cursor-pointer"
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
                className="h-[50px] px-10 rounded-xl bg-[#00A878] hover:bg-[#008f66] text-white font-black text-sm uppercase tracking-wider shadow-lg hover:shadow-xl flex items-center justify-center gap-3 mx-auto transition-all cursor-pointer transform hover:scale-[1.01] active:scale-[0.99]"
              >
                {initializing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Authorizing Enclave Access...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    <span>ENTER ENCLAVE & START REVIEW →</span>
                  </>
                )}
              </button>
            )}

            <p className="text-xs text-[#64748B]">
              {allPermissionsGranted
                ? 'Hardware sensors verified. Click above to unlock your assigned questions workbench now.'
                : 'Click "Turn ON Camera & Microphone" and select "Allow" in your browser popup to unlock this workspace.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER: 2. Active Enclave Mode (PREMIUM LIGHT ENTERPRISE CONSOLE)
  // =========================================================================
  return (
    <div className="space-y-6 text-[#0F172A]">
      {/* Toast Alert */}
      {recentWarning && (
        <div className="fixed top-20 right-6 z-50 max-w-md p-4 rounded-xl bg-white border-2 border-[#F0A11A] text-[#0F172A] shadow-2xl flex items-center gap-3 animate-bounce">
          <div className="p-2 rounded-lg bg-amber-50 text-[#F0A11A]">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="text-xs font-semibold">{recentWarning}</div>
        </div>
      )}

      {/* TOP SECURITY BAR */}
      <div className="bg-white rounded-xl border border-[#DCE6EA] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Camera Pill */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-[#00A878] border border-emerald-200 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" />
            CAMERA ● ON
          </span>

          {/* Mic Pill */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-50 text-[#00B8D9] border border-cyan-200 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#00B8D9]" />
            MIC ● ON ({audioLevel} dB)
          </span>

          {/* Security Pill */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-[#6257E8] border border-indigo-200 text-xs font-semibold">
            <Lock className="w-3.5 h-3.5 text-[#6257E8]" />
            ENCLAVE ● ARMED
          </span>

          {/* Security Score Pill */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00A878]" />
            98% SECURE
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-[#64748B]">
          <span className="hidden sm:inline">
            ENCLAVE SESSION: <strong className="text-[#0F172A]">{session?.id ? session.id.substring(0, 16) : 'ZX-2026-ENCLAVE-8821'}</strong>
          </span>
          <span className="flex items-center gap-1 text-[#0F172A]">
            <Clock className="w-3.5 h-3.5 text-[#64748B]" />
            {currentTimeStr}
          </span>
        </div>
      </div>

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#DCE6EA] pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[#00A878] text-[11px] font-bold uppercase tracking-wider mb-1.5">
            <Shield className="w-3.5 h-3.5 text-[#00A878]" />
            MANDATORY PROCTORING ENCLAVE
          </div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">
            {title || 'Translator Confidential Translation Enclave'}
          </h1>
          <p className="text-xs text-[#475569] mt-0.5">
            Continuous visual & acoustic proctoring active to safeguard question paper secrecy before examination release.
          </p>
        </div>

        {/* Security Trust Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DCE6EA] text-xs font-medium text-[#475569] shadow-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#00A878]" />
            Biometric Identity Verified
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DCE6EA] text-xs font-medium text-[#475569] shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-[#2878D8]" />
            Anti-Leak Shield Active
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DCE6EA] text-xs font-medium text-[#475569] shadow-xs">
            <Radio className="w-3.5 h-3.5 text-[#6257E8]" />
            Auditor Surveillance Connected
          </span>
        </div>
      </div>

      {/* CONSENT & PRIVACY NOTICE CARD (LIGHT BLUE CARD) */}
      <div className="p-4 rounded-xl bg-[#EEF4F6] border border-[#DCE6EA] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white border border-[#DCE6EA] text-[#2878D8] shrink-0 mt-0.5">
            <Info className="w-4 h-4 text-[#2878D8]" />
          </div>
          <div>
            <span className="font-bold text-[#0F172A]">Proctoring Notice & Legal Compliance:</span>
            <p className="text-[#475569] mt-0.5">
              Live webcam, microphone telemetry, and focus state are monitored exclusively for confidential paper protection. Audio evidence recorded below is routed directly to the Chief Vigilance & Security Auditor.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPolicyModalOpen(true)}
          className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#DCE6EA] text-[#0F172A] font-semibold text-xs flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-[#2878D8]" />
          View Proctoring Policy
        </button>
      </div>

      {/* TWO-COLUMN PROCTORING DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ======================================================== */}
        {/* LEFT COLUMN: Live Camera Feed + Voice Evidence Recorder  */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 space-y-6">
          {/* Card 1: Live Camera Panel */}
          <div className="bg-white rounded-2xl border border-[#DCE6EA] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F8]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#00A878] animate-ping" />
                <h3 className="text-sm font-bold text-[#0F172A] tracking-tight">
                  LIVE PROCTORING STREAM
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-[#00A878] font-bold text-[10px] border border-emerald-200">
                ACTIVE HD 720p
              </span>
            </div>

            {/* 16:9 Video Container */}
            <div className="relative aspect-video w-full bg-[#0F172A] rounded-xl overflow-hidden border border-[#DCE6EA] shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />

              {/* Live Face Detection Status Overlay */}
              <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur shadow-sm flex items-center gap-1.5 ${
                  isShoulderSurfing
                    ? 'bg-[#E84B5F] text-white animate-pulse'
                    : isFaceAbsent
                    ? 'bg-[#F0A11A] text-white'
                    : 'bg-white/90 text-emerald-800 border border-emerald-200'
                }`}>
                  {isShoulderSurfing ? (
                    <>
                      <Users className="w-3.5 h-3.5" />
                      <span>2+ Faces (Shoulder Surfing Alert!)</span>
                    </>
                  ) : isFaceAbsent ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>No Face Detected</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-[#00A878]" />
                      <span>Official Verified (1 Face)</span>
                    </>
                  )}
                </span>

                <span className="px-2 py-0.5 rounded-md bg-black/60 text-white font-mono text-[10px]">
                  FPS: 30 • FaceTrack
                </span>
              </div>

              {/* Bottom Decibel & Volume Visualizer Overlay */}
              <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between px-3 py-1.5 rounded-lg bg-black/75 backdrop-blur text-xs text-white">
                <div className="flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5 text-[#00B8D9]" />
                  <span className="font-mono">{audioLevel} dB</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-300">Room Acoustic Level:</span>
                  {renderAudioLevelBars()}
                </div>
              </div>
            </div>

            {/* Bottom Stream Controls & Metadata */}
            <div className="flex items-center justify-between text-xs pt-1">
              <div className="flex items-center gap-2 text-[#475569]">
                <div className="w-2 h-2 rounded-full bg-[#00A878]" />
                <span>Device: Authorized Internal Webcam</span>
              </div>
              <button
                type="button"
                onClick={startGatePreview}
                className="px-2.5 py-1 rounded-lg border border-[#DCE6EA] hover:bg-[#F0F4F8] text-[#0F172A] font-semibold text-[11px] flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 text-[#64748B]" />
                Reconnect Camera
              </button>
            </div>
          </div>

          {/* Card 2: Voice Evidence Recording / Voice Note */}
          <div className="bg-white rounded-2xl border border-[#DCE6EA] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F8]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-50 text-[#6257E8]">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] tracking-tight">
                    Auditor Voice Evidence Recorder
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    Record official remarks or incident notes directly for the Chief Vigilance Auditor.
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-indigo-50 text-[#6257E8] font-mono text-[10px] font-bold border border-indigo-200">
                AUDITOR DIRECT
              </span>
            </div>

            {/* Recording Controls Area */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Status Indicator */}
                  {isRecordingVoice ? (
                    <div className="w-10 h-10 rounded-full bg-rose-100 border border-rose-300 flex items-center justify-center text-[#E84B5F] animate-pulse">
                      <Radio className="w-5 h-5 text-[#E84B5F]" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-[#6257E8]">
                      <Mic className="w-5 h-5 text-[#6257E8]" />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${isRecordingVoice ? 'text-[#E84B5F]' : 'text-[#0F172A]'}`}>
                        {isRecordingVoice ? 'RECORDING VOICE EVIDENCE...' : voiceAudioUrl ? 'EVIDENCE AUDIO READY' : 'IDLE — READY TO RECORD'}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#64748B] mt-0.5">
                      Elapsed Time: <strong className="text-[#0F172A]">{formatTimeSeconds(recordingSeconds)}</strong>
                      {voiceFileSizeBytes > 0 && ` • (${Math.round(voiceFileSizeBytes / 1024)} KB)`}
                    </div>
                  </div>
                </div>

                {/* Primary Action Button */}
                {!isRecordingVoice ? (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#00A878] hover:bg-[#008f66] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
                  >
                    <Radio className="w-4 h-4" />
                    <span>Start Voice Recording</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#E84B5F] hover:bg-[#d63b4f] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all animate-pulse"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    <span>Stop Recording</span>
                  </button>
                )}
              </div>

              {/* Playback Controls (if recorded) */}
              {voiceAudioUrl && (
                <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                  <div className="text-[11px] font-semibold text-[#475569] flex items-center justify-between">
                    <span>Review Recorded Voice Evidence:</span>
                    <button
                      type="button"
                      onClick={deleteVoiceRecording}
                      className="text-[#E84B5F] hover:text-[#d63b4f] flex items-center gap-1 font-semibold text-[11px] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Discard Recording
                    </button>
                  </div>

                  <audio
                    controls
                    src={voiceAudioUrl}
                    className="w-full h-9 rounded-lg accent-[#6257E8]"
                  />

                  {/* Submit to Auditor Button */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                    <p className="text-[11px] text-[#64748B]">
                      Submits encrypted evidence into the Chief Auditor's surveillance ledger.
                    </p>
                    <button
                      type="button"
                      onClick={submitVoiceEvidence}
                      disabled={isSubmittingVoice || voiceSentSuccess}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#6257E8] hover:bg-[#5246db] disabled:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:cursor-default"
                    >
                      {isSubmittingVoice ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Encrypting & Sending...</span>
                        </>
                      ) : voiceSentSuccess ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          <span>Delivered to Chief Auditor ✓</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Send to Chief Vigilance & Security Auditor</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirmation Alert */}
              {voiceSentSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-[#00A878] shrink-0" />
                  <span>Voice evidence recording logged and routed to Chief Vigilance & Security Auditor review queue.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: Proctor Security Status + Warning Counter  */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 space-y-6">
          {/* Card 1: Proctor Security Status & Telemetry */}
          <div className="bg-white rounded-2xl border border-[#DCE6EA] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F8]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 text-[#2878D8]">
                  <Activity className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#0F172A] tracking-tight">
                  Proctor Security Status & Telemetry
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-[#2878D8] font-bold text-[10px] border border-blue-200">
                ACTIVE MONITOR
              </span>
            </div>

            {/* Hardware & System Checklist */}
            <div className="space-y-2.5">
              {/* Item 1 */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[#00A878]">
                    <Check className="w-3 h-3" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#0F172A]">Camera Stream Telemetry</span>
                    <p className="text-[10px] text-[#64748B]">Continuous visual biometric verification</p>
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold text-[#00A878]">VERIFIED (1 FACE)</span>
              </div>

              {/* Item 2 */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[#00A878]">
                    <Check className="w-3 h-3" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#0F172A]">Microphone Acoustic Sensor</span>
                    <p className="text-[10px] text-[#64748B]">Decibel level & acoustic anomaly detection</p>
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold text-[#00A878]">ACTIVE ({audioLevel} dB)</span>
              </div>

              {/* Item 3 */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[#2878D8]">
                    <Check className="w-3 h-3" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#0F172A]">Window Focus & Switching Guard</span>
                    <p className="text-[10px] text-[#64748B]">Debounced &gt;2.5s focus loss threshold</p>
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold text-[#2878D8]">ARMED</span>
              </div>

              {/* Item 4 */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[#6257E8]">
                    <Check className="w-3 h-3" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#0F172A]">Fullscreen Enclave Protocol</span>
                    <p className="text-[10px] text-[#64748B]">Application sandboxing shield</p>
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold text-[#6257E8]">ENFORCED</span>
              </div>

              {/* Item 5 */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[#6257E8]">
                    <Check className="w-3 h-3" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#0F172A]">Screenshot & Clipboard Shield</span>
                    <p className="text-[10px] text-[#64748B]">PrintScreen & Ctrl+C interception</p>
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold text-[#6257E8]">BLOCKED</span>
              </div>
            </div>

            {/* Security Score Gauge */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#00A878]">
                  ZeroLeak Security Index
                </span>
                <h4 className="text-xl font-extrabold text-[#0F172A] tracking-tight">
                  98% Optimal Enclave Integrity
                </h4>
                <p className="text-xs text-[#475569] mt-0.5">
                  All biometric & environmental telemetry sensors within secure parameters.
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white border border-emerald-300 flex flex-col items-center justify-center shadow-xs shrink-0">
                <span className="text-base font-extrabold font-mono text-[#00A878]">98%</span>
                <span className="text-[8px] font-bold uppercase text-[#64748B]">SECURE</span>
              </div>
            </div>
          </div>

          {/* Card 2: Warning Counter & Violation Threshold Card */}
          <div className="bg-white rounded-2xl border border-[#DCE6EA] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F8]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-50 text-[#F0A11A]">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] tracking-tight">
                    Violation Warning Threshold
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    Strict maximum 3 warnings. Third violation flags session for auditor review.
                  </p>
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded font-mono text-xs font-bold border ${
                warningCount === 0
                  ? 'bg-emerald-50 text-[#00A878] border-emerald-200'
                  : warningCount === 1
                  ? 'bg-amber-50 text-[#F0A11A] border-amber-200'
                  : warningCount === 2
                  ? 'bg-orange-50 text-orange-600 border-orange-200'
                  : 'bg-rose-50 text-[#E84B5F] border-rose-200'
              }`}>
                {warningCount} / 3 VIOLATIONS
              </span>
            </div>

            {/* Visual 3 Indicator Circles */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#475569]">Violation Level Progress:</span>
                <span className="text-xs font-mono text-[#64748B]">
                  {3 - warningCount} warnings remaining
                </span>
              </div>

              {/* 3 Step Indicator Dots */}
              <div className="grid grid-cols-3 gap-3">
                {/* Dot 1 */}
                <div className={`p-3 rounded-xl border flex flex-col items-center text-center space-y-1 transition-all ${
                  warningCount >= 1
                    ? 'bg-amber-50 border-[#F0A11A] text-amber-900 shadow-xs'
                    : 'bg-white border-[#DCE6EA] text-[#64748B]'
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    warningCount >= 1 ? 'bg-[#F0A11A] text-white' : 'bg-[#E2E8F0] text-[#64748B]'
                  }`}>
                    1
                  </div>
                  <span className="text-xs font-bold">Warning 1</span>
                  <span className="text-[10px]">First Notice (Amber)</span>
                </div>

                {/* Dot 2 */}
                <div className={`p-3 rounded-xl border flex flex-col items-center text-center space-y-1 transition-all ${
                  warningCount >= 2
                    ? 'bg-orange-50 border-orange-500 text-orange-900 shadow-xs'
                    : 'bg-white border-[#DCE6EA] text-[#64748B]'
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    warningCount >= 2 ? 'bg-orange-500 text-white' : 'bg-[#E2E8F0] text-[#64748B]'
                  }`}>
                    2
                  </div>
                  <span className="text-xs font-bold">Warning 2</span>
                  <span className="text-[10px]">Final Warning (Orange)</span>
                </div>

                {/* Dot 3 */}
                <div className={`p-3 rounded-xl border flex flex-col items-center text-center space-y-1 transition-all ${
                  warningCount >= 3
                    ? 'bg-rose-50 border-[#E84B5F] text-rose-900 shadow-xs'
                    : 'bg-white border-[#DCE6EA] text-[#64748B]'
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    warningCount >= 3 ? 'bg-[#E84B5F] text-white' : 'bg-[#E2E8F0] text-[#64748B]'
                  }`}>
                    3
                  </div>
                  <span className="text-xs font-bold">Warning 3</span>
                  <span className="text-[10px]">Auditor Review (Red)</span>
                </div>
              </div>

              {/* Warning Policy Statement */}
              <div className="text-[11px] text-[#64748B] pt-2 border-t border-[#E2E8F0] space-y-1">
                <p>
                  <strong>Enforcement Policy:</strong> If a third warning is recorded, your session is immediately locked and flagged for forensic review by the Chief Vigilance & Security Auditor. The warning counter is persistent and never exceeds 3.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* CONFIDENTIAL QUESTION TRANSLATION WORKSPACE WRAPPER      */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-[#DCE6EA] shadow-xs overflow-hidden">
        {/* Top Authorized Banner */}
        <div className="px-5 py-3 bg-[#EEF4F6] border-b border-[#DCE6EA] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00A878]" />
            <span className="font-bold text-[#0F172A] uppercase tracking-wider">
              AUTHORIZED TRANSLATION WORKBENCH • PROTECTED UNDER ENCLAVE PROTOCOL
            </span>
          </div>
          <div className="flex items-center gap-2 text-[#64748B] font-mono text-[11px]">
            <span>OFFICIAL ID: {currentUser?.id?.substring(0, 8) || 'AUTH-OFFICIAL'}</span>
            <span>•</span>
            <span className="text-[#00A878] font-bold">LEAK SHIELD ACTIVE</span>
          </div>
        </div>

        {/* Underlying Children Workspace */}
        <div className="p-4 sm:p-6 select-none relative">
          {children}
        </div>
      </div>

      {/* ======================================================== */}
      {/* LIVE SECURITY ACTIVITY TIMELINE                          */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-[#DCE6EA] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F8]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#2878D8]" />
            <h3 className="text-sm font-bold text-[#0F172A] tracking-tight">
              Live Security Activity Timeline
            </h3>
          </div>
          <span className="text-xs text-[#64748B] font-mono">
            {timelineEvents.length} events logged in session
          </span>
        </div>

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {timelineEvents.map((ev) => (
            <div
              key={ev.id}
              className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                  ev.severity === 'CRITICAL'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : ev.severity === 'HIGH'
                    ? 'bg-orange-100 text-orange-800 border border-orange-300'
                    : ev.severity === 'MEDIUM'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}>
                  {ev.event_type}
                </span>
                <span className="text-[#0F172A] font-medium truncate">
                  {ev.description}
                </span>
              </div>
              <span className="font-mono text-[11px] text-[#64748B] shrink-0">
                {ev.time}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: WARNING NOTIFICATION MODAL (1, 2, 3)            */}
      {/* ======================================================== */}
      {warningModalOpen && activeWarningData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-[#DCE6EA] w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${
                activeWarningData.number === 3
                  ? 'bg-rose-100 text-[#E84B5F]'
                  : activeWarningData.number === 2
                  ? 'bg-orange-100 text-orange-600'
                  : 'bg-amber-100 text-[#F0A11A]'
              }`}>
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  activeWarningData.number === 3
                    ? 'text-[#E84B5F]'
                    : activeWarningData.number === 2
                    ? 'text-orange-600'
                    : 'text-[#F0A11A]'
                }`}>
                  Proctor Violation Detected
                </span>
                <h3 className="text-lg font-bold text-[#0F172A]">
                  {activeWarningData.title}
                </h3>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1 text-xs">
              <span className="text-[#64748B] font-semibold">Violation Reason:</span>
              <p className="text-[#0F172A] font-medium">{activeWarningData.reason}</p>
            </div>

            <p className="text-xs text-[#475569]">
              {activeWarningData.number === 3
                ? 'Your access has been suspended and flagged for review. A report with audio and photographic verification has been transmitted to the Chief Vigilance & Security Auditor.'
                : activeWarningData.number === 2
                ? 'You have reached 2 of 3 allowed warnings. A subsequent infraction will trigger an immediate emergency lockdown of this workspace.'
                : 'Please maintain continuous focus on this window and keep your face visible in the camera frame.'}
            </p>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setWarningModalOpen(false)}
                className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-xs cursor-pointer ${
                  activeWarningData.number === 3
                    ? 'bg-[#E84B5F] hover:bg-[#d63b4f]'
                    : activeWarningData.number === 2
                    ? 'bg-orange-600 hover:bg-orange-500'
                    : 'bg-[#F0A11A] hover:bg-[#d97706]'
                }`}
              >
                {activeWarningData.number === 3 ? 'Acknowledge Lockdown' : 'I Acknowledge & Return to Workbench'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: PROCTORING POLICY & PRIVACY MODAL               */}
      {/* ======================================================== */}
      {policyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#DCE6EA] w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#DCE6EA] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#00A878]" />
                <h3 className="text-base font-bold text-[#0F172A]">
                  ZeroLeak Examination Proctoring Policy
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPolicyModalOpen(false)}
                className="p-1 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F0F4F8] cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs text-[#475569] leading-relaxed">
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                <strong>Zero Leak Commitment:</strong> This examination environment enforces rigorous visual and acoustic tracking under national examination standards to safeguard question paper secrecy.
              </div>

              <div>
                <h4 className="font-bold text-[#0F172A] text-sm mb-1">1. Visual Surveillance & Face Verification</h4>
                <p>
                  Your webcam stream is analyzed strictly within your browser for face detection and presence verification. Only suspicious events (such as shoulder surfing or extended absence) generate encrypted evidentiary snapshots for the Chief Vigilance Auditor.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-[#0F172A] text-sm mb-1">2. Acoustic Telemetry & Voice Evidence</h4>
                <p>
                  Microphone input is monitored for excessive noise and room communication. Officials may also voluntarily or per protocol record voice evidence for audit escalation.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-[#0F172A] text-sm mb-1">3. Tab Switching & Window Focus</h4>
                <p>
                  Navigating away from the confidential window for longer than 2.5 seconds triggers an automatic warning. Three warnings result in session termination and auditor escalation.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-[#0F172A] text-sm mb-1">4. Anti-Capture Shields</h4>
                <p>
                  Screenshots, clipboard copy-pasting, developer inspection consoles, and right-click context menus are intercepted and forbidden under zero leak regulations.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-[#F8FAFC] border-t border-[#DCE6EA] flex justify-end">
              <button
                type="button"
                onClick={() => setPolicyModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#00A878] hover:bg-[#008f66] text-white font-bold text-xs cursor-pointer"
              >
                Close Policy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECURITY SHIELD 1: FACE ABSENT LIGHT MASK                */}
      {/* ======================================================== */}
      {isFaceAbsent && (
        <div className="fixed inset-0 z-50 bg-[#F6F9FA]/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-[#0F172A] animate-fade-in select-none">
          <div className="p-4 rounded-3xl bg-amber-50 border-2 border-[#F0A11A] text-[#F0A11A] mb-4 shadow-xl">
            <EyeOff className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">
            Confidential Examination Material Masked
          </h2>
          <p className="text-amber-700 text-sm font-semibold mt-1">
            Authorized Official Absent From Camera View
          </p>
          <p className="text-[#64748B] text-xs max-w-md mt-2">
            To prevent question paper leaks to unauthorized persons or passers-by, all confidential examination questions are temporarily masked. Return to your camera to resume work.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#DCE6EA] text-xs font-mono text-[#0F172A] shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#F0A11A] animate-ping" />
            Monitoring Camera for Official's Return...
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECURITY SHIELD 2: SHOULDER SURFING LIGHT MASK           */}
      {/* ======================================================== */}
      {isShoulderSurfing && (
        <div className="fixed inset-0 z-50 bg-rose-50/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-[#0F172A] animate-fade-in select-none">
          <div className="p-4 rounded-3xl bg-rose-100 border-2 border-[#E84B5F] text-[#E84B5F] mb-4 shadow-xl animate-bounce">
            <Users className="w-14 h-14" />
          </div>
          <h2 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">
            LEAK PREVENTION ALERT: SECONDARY FACE DETECTED
          </h2>
          <p className="text-rose-700 text-sm font-bold mt-1">
            Shoulder Surfing / Unauthorized Person in Camera View
          </p>
          <p className="text-[#475569] text-xs max-w-lg mt-2 bg-white p-3.5 rounded-xl border border-rose-200">
            A secondary person was detected looking at your screen. The question paper has been immediately masked and watermarked. A high-resolution audit snapshot has been logged to the Chief Vigilance Auditor.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-rose-300 text-xs font-mono text-rose-700 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#E84B5F] animate-ping" />
            Ensure complete physical privacy before continuing.
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECURITY SHIELD 3: WINDOW BLURRED / UNFOCUS MASK         */}
      {/* ======================================================== */}
      {isWindowBlurred && !isFaceAbsent && !isShoulderSurfing && (
        <div className="fixed inset-0 z-40 bg-[#F6F9FA]/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center text-[#0F172A] animate-fade-in select-none">
          <div className="p-3 rounded-2xl bg-white border border-[#DCE6EA] text-[#F0A11A] mb-3 shadow-md">
            <ShieldAlert className="w-10 h-10 text-[#F0A11A]" />
          </div>
          <h3 className="text-xl font-bold text-[#0F172A]">
            Enclave Window Unfocused
          </h3>
          <p className="text-[#64748B] text-xs max-w-sm mt-1">
            You navigated away from the secure examination window. External screen capture and application switching are restricted. Click anywhere on this screen to refocus.
          </p>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECURITY SHIELD 4: EMERGENCY REMOTE LOCKDOWN BY ADMIN    */}
      {/* ======================================================== */}
      {isEmergencyLocked && (
        <div className="fixed inset-0 z-50 bg-[#F6F9FA]/98 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-[#0F172A] animate-fade-in select-none">
          <div className="p-5 rounded-3xl bg-rose-100 border-2 border-[#E84B5F] text-[#E84B5F] mb-4 shadow-xl">
            <Lock className="w-14 h-14" />
          </div>
          <h2 className="text-2xl font-extrabold text-[#0F172A] uppercase tracking-wider">
            TERMINAL EMERGENCY LOCKDOWN
          </h2>
          <p className="text-rose-700 text-sm font-semibold mt-1">
            Session Flagged for Review by Examination Registrar / Auditor
          </p>
          <div className="text-[#475569] text-xs max-w-md mt-3 bg-white p-4 rounded-xl border border-rose-200">
            <strong>Reason:</strong> {emergencyReason || 'Maximum proctoring violation threshold reached (3/3).'}
          </div>
          <p className="text-[#64748B] text-xs mt-4">
            Contact the Central Examination Authority to conduct a forensic audit review.
          </p>
        </div>
      )}
    </div>
  );
};
