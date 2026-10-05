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
  Circle,
  HelpCircle,
  CheckCircle,
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

// Rigorous Device Permission State Machine
export type DevicePermissionState =
  | 'not_requested'
  | 'checking'
  | 'prompt'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'not_found'
  | 'busy'
  | 'unsupported'
  | 'error';

interface PermissionErrorInfo {
  type: string;
  title: string;
  message: string;
  actionLabel?: string;
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
  // Session Lifecycle State
  const [session, setSession] = useState<AuthorityProctorSession | null>(null);
  const [enclaveStarted, setEnclaveStarted] = useState(false);
  const [isStartingEnclave, setIsStartingEnclave] = useState(false);

  // Dedicated Setup & Permission Verification Modal (Section 3: opens automatically after login)
  const [setupModalOpen, setSetupModalOpen] = useState(true);
  const [permissionPhase, setPermissionPhase] = useState<'IDLE' | 'REQUESTING' | 'SUCCESS' | 'DENIED' | 'ERROR'>('IDLE');

  // Graduated Presence States: 'PRESENT' | 'CHECKING' | 'UNCERTAIN' | 'ABSENT' (Section 25)
  const [presenceStatus, setPresenceStatus] = useState<'PRESENT' | 'CHECKING' | 'UNCERTAIN' | 'ABSENT'>('PRESENT');

  // Hardware Disconnect Flags (Sections 23 & 24)
  const [isCameraDisconnected, setIsCameraDisconnected] = useState(false);
  const [isMicDisconnected, setIsMicDisconnected] = useState(false);

  // Subtle Non-blocking Toast Notification (Sections 31 & 32)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'warning' | 'info' } | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const showToast = (text: string, type: 'success' | 'warning' | 'info' = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ text, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 3800);
  };

  // Independent Hardware Permission States
  const [cameraState, setCameraState] = useState<DevicePermissionState>('not_requested');
  const [micState, setMicState] = useState<DevicePermissionState>('not_requested');
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [permissionError, setPermissionError] = useState<PermissionErrorInfo | null>(null);

  // Hardware Streams & Telemetry
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [audioLevelDb, setAudioLevelDb] = useState(-45);
  const [audioVolumePercent, setAudioVolumePercent] = useState(0);
  const [verificationSnapshot, setVerificationSnapshot] = useState<string | null>(null);

  // Real-time Facial Telemetry & Anomaly Sensors
  const [faceResult, setFaceResult] = useState<FaceDetectionResult>({ faceCount: 0, status: 'NOT_DETECTED', faces: [] });
  const [isFaceAbsent, setIsFaceAbsent] = useState(false);
  const [isShoulderSurfing, setIsShoulderSurfing] = useState(false);
  const [isEmergencyLocked, setIsEmergencyLocked] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState<string | null>(null);
  const [leakRiskScore, setLeakRiskScore] = useState(0);
  const [leakRiskLevel, setLeakRiskLevel] = useState<RiskLevel>('NORMAL');

  // Strict 3-Warning Rule Engine (Maintained in backend, hidden from translator UI)
  const [warningCount, setWarningCount] = useState(0);
  const lastWarningTimeRef = useRef<number>(0);

  // Focus & Visibility Debounced Guard (>2.5s threshold with deduplication)
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
  const blurTimerRef = useRef<any>(null);
  const blurWarningFiredRef = useRef<boolean>(false);

  // Voice Evidence Recorder (MediaRecorder API)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null);
  const [voiceDataUrl, setVoiceDataUrl] = useState<string | null>(null);
  const [voiceFileSizeBytes, setVoiceFileSizeBytes] = useState(0);
  const [isSubmittingVoice, setIsSubmittingVoice] = useState(false);
  const [voiceSubmittedSuccess, setVoiceSubmittedSuccess] = useState<{ evidenceId: string } | null>(null);
  const [voiceSubmissionFailed, setVoiceSubmissionFailed] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordIntervalRef = useRef<any>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Policy Modal
  const [policyModalOpen, setPolicyModalOpen] = useState(false);

  // Chronological Audit Activity Ledger
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([
    {
      id: 'init-0',
      time: new Date().toLocaleTimeString(),
      event_type: 'SYSTEM_BOOT',
      severity: 'LOW',
      description: 'ZeroLeak Security Monitor initialized in browser sandbox',
    },
  ]);

  // Video & Audio DOM / Context Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const gateVideoRef = useRef<HTMLVideoElement>(null);
  const audioMonitorRef = useRef<AudioMonitor | null>(null);
  const consecutiveAbsentFrames = useRef(0);
  const lastFaceStateLogged = useRef<'NORMAL' | 'ABSENT' | 'SHOULDER_SURFING'>('NORMAL');

  // Live Clock
  const [currentTimeStr, setCurrentTimeStr] = useState<string>(new Date().toLocaleTimeString());
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTimeStr(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  const addTimelineEvent = (type: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', description: string) => {
    setTimelineEvents(prev => [
      {
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        time: new Date().toLocaleTimeString(),
        event_type: type,
        severity,
        description,
      },
      ...prev.slice(0, 24),
    ]);
  };

  // =========================================================================
  // 1. NON-INTRUSIVE PERMISSION CHECK ON MOUNT (NEVER AUTO-CALL getUserMedia)
  // =========================================================================
  useEffect(() => {
    checkBrowserPermissionStatusNonIntrusive();
    return () => {
      cleanupAllHardware();
    };
  }, []);

  // Sync stream to video elements whenever mediaStream updates
  useEffect(() => {
    streamRef.current = mediaStream;
    if (mediaStream) {
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      if (gateVideoRef.current) {
        gateVideoRef.current.srcObject = mediaStream;
      }
    }
  }, [mediaStream, enclaveStarted]);

  const checkBrowserPermissionStatusNonIntrusive = async () => {
    // Check Secure Context
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setCameraState('unsupported');
      setMicState('unsupported');
      setPermissionError({
        type: 'SECURITY_ERROR',
        title: 'Secure Context Required',
        message: 'Camera and microphone sensors require a secure origin (HTTPS or localhost).',
      });
      return;
    }

    // Check navigator.mediaDevices support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('unsupported');
      setMicState('unsupported');
      setPermissionError({
        type: 'UNSUPPORTED',
        title: 'Browser Media Support Unavailable',
        message: 'Your current browser does not support HTML5 media recording interfaces.',
      });
      return;
    }

    // Use Permissions API where supported without prompting
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const camQuery = await navigator.permissions.query({ name: 'camera' as any });
        if (camQuery.state === 'granted') {
          setCameraState('granted');
        } else if (camQuery.state === 'denied') {
          setCameraState('denied');
        } else {
          setCameraState('prompt');
        }

        camQuery.onchange = () => {
          if (camQuery.state === 'granted') setCameraState('granted');
          else if (camQuery.state === 'denied') setCameraState('denied');
          else setCameraState('prompt');
        };
      } catch {
        setCameraState('not_requested');
      }

      try {
        const micQuery = await navigator.permissions.query({ name: 'microphone' as any });
        if (micQuery.state === 'granted') {
          setMicState('granted');
        } else if (micQuery.state === 'denied') {
          setMicState('denied');
        } else {
          setMicState('prompt');
        }

        micQuery.onchange = () => {
          if (micQuery.state === 'granted') setMicState('granted');
          else if (micQuery.state === 'denied') setMicState('denied');
          else setMicState('prompt');
        };
      } catch {
        setMicState('not_requested');
      }
    } else {
      setCameraState('not_requested');
      setMicState('not_requested');
    }
  };

  // Capture verification photo via canvas from real webcam video stream
  const captureVerificationPhoto = async (stream: MediaStream): Promise<string> => {
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return '';

      const tempVideo = document.createElement('video');
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.srcObject = stream;
      await tempVideo.play().catch(() => {});

      // Wait 350ms for camera exposure stabilization
      await new Promise(r => setTimeout(r, 350));

      const canvas = document.createElement('canvas');
      canvas.width = tempVideo.videoWidth || 640;
      canvas.height = tempVideo.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setVerificationSnapshot(dataUrl);
        return dataUrl;
      }
    } catch (e) {
      console.warn('Initial photo capture notice:', e);
    }
    return '';
  };

  // =========================================================================
  // 2. EXPLICIT USER ACTION: Request Camera & Microphone Permissions
  // =========================================================================
  const handleRequestHardwarePermissions = async () => {
    setIsRequestingPermissions(true);
    setPermissionError(null);
    setPermissionPhase('REQUESTING');
    setCameraState('requesting');
    setMicState('requesting');
    setIsCameraDisconnected(false);
    setIsMicDisconnected(false);

    addTimelineEvent('PERMISSION_REQUEST', 'LOW', 'Official clicked Enable Camera & Microphone');

    let vStream: MediaStream | null = null;
    let aStream: MediaStream | null = null;
    let finalStream: MediaStream | null = null;

    try {
      // 1. Try combined request first
      const combined = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      });

      vStream = combined;
      aStream = combined;
      finalStream = combined;
      setCameraState('granted');
      setMicState('granted');
      setMediaStream(combined);
      streamRef.current = combined;

      // Start Audio Monitor
      startAudioMonitoring(combined);

      addTimelineEvent('CAMERA_ENABLED', 'LOW', 'Camera video feed authenticated');
      addTimelineEvent('MIC_ENABLED', 'LOW', 'Microphone acoustic sensor active');
    } catch (combinedError: any) {
      console.warn('Combined getUserMedia failed, evaluating camera & mic separately:', combinedError);

      // 2. Evaluate Camera independently
      try {
        vStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
        setCameraState('granted');
        addTimelineEvent('CAMERA_ENABLED', 'LOW', 'Camera video feed authenticated');
      } catch (camErr: any) {
        mapDeviceError('camera', camErr);
      }

      // 3. Evaluate Microphone independently
      try {
        aStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        setMicState('granted');
        addTimelineEvent('MIC_ENABLED', 'LOW', 'Microphone acoustic sensor active');
      } catch (micErr: any) {
        mapDeviceError('microphone', micErr);
      }

      // If at least one succeeded, assemble available stream
      if (vStream || aStream) {
        const tracks: MediaStreamTrack[] = [];
        if (vStream) tracks.push(...vStream.getVideoTracks());
        if (aStream) tracks.push(...aStream.getAudioTracks());
        const assembled = new MediaStream(tracks);
        finalStream = assembled;
        setMediaStream(assembled);
        streamRef.current = assembled;

        if (aStream) {
          startAudioMonitoring(assembled);
        }
      }
    } finally {
      setIsRequestingPermissions(false);
    }

    // Attach hardware disconnect listeners (Sections 23 & 24)
    if (finalStream) {
      finalStream.getVideoTracks().forEach(track => {
        track.onended = () => {
          setIsCameraDisconnected(true);
          setCameraState('denied');
          showToast('⚠ Camera connection lost. Please restore camera access.', 'warning');
        };
      });
      finalStream.getAudioTracks().forEach(track => {
        track.onended = () => {
          setIsMicDisconnected(true);
          setMicState('denied');
          showToast('⚠ Microphone connection lost. Please restore microphone access.', 'warning');
        };
      });

      // If both granted: capture authorized verification photo & initialize proctor session
      if (vStream && aStream) {
        setPermissionPhase('SUCCESS');
        try {
          const snap = await captureVerificationPhoto(finalStream);
          const res = await api.authorityProctor.startSession({
            workspace_type: workspaceType,
            exam_id: examId,
            verification_snapshot: snap || undefined,
          });

          setSession(res.session);
          setWarningCount(Number(res.session.warning_count) || 0);
          addTimelineEvent('PROCTOR_SESSION_STARTED', 'LOW', `Enclave session ${res.session.id} authorized & active`);

          // Short 850ms confirmation before closing setup modal
          setTimeout(() => {
            setSetupModalOpen(false);
            setEnclaveStarted(true);
            showToast('✓ Camera verification recorded', 'success');
          }, 850);
        } catch (err: any) {
          console.error('Session start error:', err);
          setTimeout(() => {
            setSetupModalOpen(false);
            setEnclaveStarted(true);
          }, 850);
        }
      } else {
        setPermissionPhase('DENIED');
      }
    } else {
      setPermissionPhase('DENIED');
    }
  };

  const mapDeviceError = (device: 'camera' | 'microphone', error: any) => {
    console.error(`Device error for ${device}:`, error);
    const devName = device === 'camera' ? 'Camera' : 'Microphone';

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      if (device === 'camera') setCameraState('denied');
      else setMicState('denied');

      setPermissionError({
        type: 'PERMISSION_DENIED',
        title: `${devName} Permission Required`,
        message: 'Your browser has not granted access to the requested device. Please click the camera/padlock icon in your browser address bar and select Allow.',
        actionLabel: 'Check Browser Settings',
      });
      addTimelineEvent(`${device.toUpperCase()}_DENIED`, 'MEDIUM', `${devName} permission denied by browser or user`);
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      if (device === 'camera') setCameraState('not_found');
      else setMicState('not_found');

      setPermissionError({
        type: 'NOT_FOUND',
        title: `${devName} Device Not Found`,
        message: `No working ${device} was detected on this workstation. Please attach or enable a compatible device.`,
        actionLabel: 'Connect Device',
      });
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      if (device === 'camera') setCameraState('busy');
      else setMicState('busy');

      setPermissionError({
        type: 'BUSY',
        title: `${devName} Currently Unavailable`,
        message: `The ${device} is currently in use by another application (e.g. Teams, Zoom, or another browser tab). Please close other apps and retry.`,
        actionLabel: 'Retry Hardware',
      });
    } else if (error.name === 'SecurityError') {
      if (device === 'camera') setCameraState('unsupported');
      else setMicState('unsupported');

      setPermissionError({
        type: 'SECURITY_ERROR',
        title: 'Secure Context Required',
        message: 'Camera and microphone access requires HTTPS or localhost.',
      });
    } else {
      if (device === 'camera') setCameraState('error');
      else setMicState('error');

      setPermissionError({
        type: 'UNKNOWN',
        title: `${devName} Sensor Notice`,
        message: error.message || `An error occurred while connecting to the ${device}.`,
        actionLabel: 'Retry',
      });
    }
  };

  const startAudioMonitoring = (stream: MediaStream) => {
    try {
      const audio = new AudioMonitor({
        onVolumeChange: (vol) => {
          setAudioVolumePercent(vol);
          // Convert percent (0..100) to decibels (-65dB to -15dB)
          const db = Math.round(-65 + vol * 0.5);
          setAudioLevelDb(db);
        },
      });
      const started = audio.start(stream);
      if (started) {
        audioMonitorRef.current = audio;
      }
    } catch (e) {
      console.warn('Audio monitor start notice:', e);
    }
  };

  const cleanupAllHardware = () => {
    if (audioMonitorRef.current) {
      audioMonitorRef.current.stop();
      audioMonitorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && isRecordingVoice) {
      mediaRecorderRef.current.stop();
    }
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
    }
    setMediaStream(null);
  };

  // =========================================================================
  // 3. START ENCLAVE REVIEW (Active Enclave Session Start)
  // =========================================================================
  const takeSnapshot = (): string => {
    const video = videoRef.current || gateVideoRef.current;
    if (!video) return '';
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setVerificationSnapshot(dataUrl);
        return dataUrl;
      }
    } catch (e) {
      console.error('Snapshot capture error:', e);
    }
    return '';
  };

  const handleStartEnclave = async () => {
    if (cameraState !== 'granted' || micState !== 'granted') {
      await handleRequestHardwarePermissions();
      return;
    }

    setIsStartingEnclave(true);
    const snap = takeSnapshot();

    try {
      const res = await api.authorityProctor.startSession({
        workspace_type: workspaceType,
        exam_id: examId,
        verification_snapshot: snap || undefined,
      });

      setSession(res.session);
      setEnclaveStarted(true);
      setWarningCount(Number(res.session.warning_count) || 0);

      addTimelineEvent('PROCTOR_SESSION_STARTED', 'LOW', `Enclave session ${res.session.id} authorized & active`);
    } catch (err: any) {
      setPermissionError({
        type: 'SESSION_ERROR',
        title: 'Enclave Authorization Failed',
        message: err.message || 'Unable to establish secure proctor session with server.',
      });
    } finally {
      setIsStartingEnclave(false);
    }
  };

  // =========================================================================
  // 4. CENTRALIZED WARNING DISPATCHER (Strictly Max 3 Warnings, Never 4/3)
  // =========================================================================
  const issueProctorWarning = async (reason: string, eventType: string = 'SUSPICIOUS_ACTIVITY') => {
    if (!session) return;

    // Cooldown check: no duplicate warnings within 4 seconds
    const now = Date.now();
    if (now - lastWarningTimeRef.current < 4000) return;
    lastWarningTimeRef.current = now;

    // Capture visual frame evidence at the moment of violation
    const violationSnap = takeSnapshot();

    try {
      const res = await api.authorityProctor.issueWarning({
        session_id: session.id,
        reason,
        details: {
          event_type: eventType,
          snapshot: violationSnap || undefined,
          presence_status: isFaceAbsent ? 'ABSENT' : isShoulderSurfing ? 'SHOULDER_SURFING_DETECTED' : 'PRESENT',
        },
      });

      const nextCount = Math.min(3, res.warning_count);
      setWarningCount(nextCount);

      // Gentle non-disruptive notification for translator workspace
      const userActionNotice =
        reason.includes('Focus') || eventType === 'FOCUS_LOST'
          ? 'Please keep the secure examination session active.'
          : reason.includes('Secondary') || eventType === 'SHOULDER_SURFING'
          ? 'Please ensure you are working alone in the secure area.'
          : reason.includes('Screenshot') || eventType === 'SCREENSHOT_ATTEMPT'
          ? 'Screen capture is prohibited in this secure enclave.'
          : 'Please remain visible and focused on the secure session.';

      showToast(userActionNotice, 'warning');

      addTimelineEvent(`WARNING_${nextCount}`, nextCount === 3 ? 'CRITICAL' : 'HIGH', reason);
      if (violationSnap) {
        addTimelineEvent('VIOLATION_SNAPSHOT_SAVED', 'HIGH', `Frame evidence associated with Warning #${nextCount} secured for Auditor`);
      }

      if (nextCount >= 3 || res.is_locked) {
        setIsEmergencyLocked(true);
        setEmergencyReason('Maximum proctoring violation threshold reached (3/3). Session placed under official audit review.');
        addTimelineEvent('AUDIT_ESCALATION', 'CRITICAL', 'Case escalated to CBI Chief Vigilance & Security Auditor (Priority: High)');
      }
    } catch (err) {
      console.error('Error issuing authority warning:', err);
    }
  };

  // =========================================================================
  // 5. DEBOUNCED FOCUS & WINDOW BLUR MONITOR (>2.5s Delay with Deduplication)
  // =========================================================================
  useEffect(() => {
    if (!enclaveStarted || !session) return;

    const onFocusLoss = () => {
      setIsWindowBlurred(true);

      if (!blurTimerRef.current && !blurWarningFiredRef.current) {
        blurTimerRef.current = setTimeout(() => {
          blurWarningFiredRef.current = true;
          addTimelineEvent('FOCUS_LOST', 'MEDIUM', 'Window focus lost for >2.5 seconds');
          issueProctorWarning('Focus was lost for >2.5 seconds. Tab and application switching is strictly forbidden.', 'FOCUS_LOST');
        }, 2500);
      }
    };

    const onFocusRestored = () => {
      setIsWindowBlurred(false);
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      if (blurWarningFiredRef.current) {
        addTimelineEvent('FOCUS_RESTORED', 'LOW', 'Official returned focus to examination enclave');
        blurWarningFiredRef.current = false;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        onFocusLoss();
      } else {
        onFocusRestored();
      }
    };

    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', onFocusLoss);
    window.addEventListener('focus', onFocusRestored);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', onFocusLoss);
      window.removeEventListener('focus', onFocusRestored);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, [enclaveStarted, session]);

  // =========================================================================
  // 6. CONTINUOUS FACE & SHOULDER-SURFING DETECTION (850ms interval)
  // =========================================================================
  useEffect(() => {
    if (!enclaveStarted || !mediaStream) return;

    let active = true;
    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const result = await detectFacesInVideo(video);
        if (!active) return;
        setFaceResult(result);

        // A. Graduated Presence Detection (0-2s Checking, 2-4s Uncertain, >4.5s Absent)
        if (result.faceCount === 0) {
          consecutiveAbsentFrames.current += 1;
          const frames = consecutiveAbsentFrames.current;
          if (frames <= 2) {
            setPresenceStatus('CHECKING');
          } else if (frames <= 4) {
            setPresenceStatus('UNCERTAIN');
          } else {
            setPresenceStatus('ABSENT');
            setIsFaceAbsent(true);
            if (lastFaceStateLogged.current !== 'ABSENT') {
              lastFaceStateLogged.current = 'ABSENT';
              addTimelineEvent('FACE_ABSENT', 'MEDIUM', 'Official absent from camera view (>4.5s)');
            }
          }
        } else {
          consecutiveAbsentFrames.current = 0;
          setPresenceStatus('PRESENT');
          if (isFaceAbsent) {
            setIsFaceAbsent(false);
            if (lastFaceStateLogged.current === 'ABSENT') {
              lastFaceStateLogged.current = 'NORMAL';
              addTimelineEvent('FACE_RESTORED', 'LOW', 'Official re-verified present on camera');
            }
          }
        }

        // B. Shoulder Surfing (2+ Faces)
        if (result.faceCount >= 2) {
          setIsShoulderSurfing(true);
          if (lastFaceStateLogged.current !== 'SHOULDER_SURFING') {
            lastFaceStateLogged.current = 'SHOULDER_SURFING';
            addTimelineEvent('SHOULDER_SURFING', 'HIGH', 'Multiple faces detected in camera frame');
            issueProctorWarning('Secondary person detected viewing confidential screen', 'SHOULDER_SURFING');
          }
        } else if (result.faceCount === 1 && isShoulderSurfing) {
          setIsShoulderSurfing(false);
          lastFaceStateLogged.current = 'NORMAL';
        }
      } catch (err) {
        console.error('Face detection notice:', err);
      }
    }, 850);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enclaveStarted, mediaStream, isFaceAbsent, isShoulderSurfing]);

  // =========================================================================
  // 7. KEYBOARD SHORTCUT & SCREENSHOT SHIELD
  // =========================================================================
  useEffect(() => {
    if (!enclaveStarted || !session) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      addTimelineEvent('RIGHT_CLICK_BLOCKED', 'LOW', 'Context menu intercepted');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        addTimelineEvent('SCREENSHOT_BLOCKED', 'HIGH', 'PrintScreen key intercepted');
        issueProctorWarning('Screenshot attempt intercepted by security shield', 'SCREENSHOT_ATTEMPT');
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (['c', 'v', 'x', 's', 'p', 'u'].includes(k)) {
          e.preventDefault();
          addTimelineEvent('CLIPBOARD_BLOCKED', 'MEDIUM', `Shortcut '${e.key.toUpperCase()}' intercepted`);
        }
      }

      if (e.key === 'F12') {
        e.preventDefault();
        addTimelineEvent('DEVTOOLS_BLOCKED', 'MEDIUM', 'Developer Tools shortcut intercepted');
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enclaveStarted, session]);

  // =========================================================================
  // 8. PERIODIC HEARTBEAT TELEMETRY (Every 4s)
  // =========================================================================
  useEffect(() => {
    if (!enclaveStarted || !session) return;

    const interval = setInterval(async () => {
      try {
        const hb = await api.authorityProctor.sendHeartbeat({
          session_id: session.id,
          camera_status: cameraState === 'granted' ? 'ACTIVE' : 'DISABLED',
          microphone_status: micState === 'granted' ? 'ACTIVE' : 'DISABLED',
          fullscreen_status: document.fullscreenElement ? 'ACTIVE' : 'EXITED',
          face_status: isShoulderSurfing
            ? 'SHOULDER_SURFING_DETECTED'
            : isFaceAbsent
            ? 'ABSENT'
            : 'VERIFIED',
          faces_detected_count: faceResult.faceCount,
          audio_level_db: audioLevelDb,
        });

        if (hb.emergency_locked) {
          setIsEmergencyLocked(true);
          setEmergencyReason(hb.emergency_lock_reason || 'Administrative Lockdown by Auditor');
        }

        if (hb.warning_count !== undefined && hb.warning_count > warningCount) {
          setWarningCount(Math.min(3, hb.warning_count));
        }
      } catch (err) {
        console.warn('Heartbeat check notice:', err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [enclaveStarted, session, cameraState, micState, isShoulderSurfing, isFaceAbsent, faceResult, audioLevelDb, warningCount]);

  // Periodic Surveillance Snapshot (Configurable interval e.g. 5 minutes)
  useEffect(() => {
    if (!enclaveStarted || !session || cameraState !== 'granted') return;
    const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
    const snapshotTimer = setInterval(async () => {
      try {
        const snap = takeSnapshot();
        if (snap) {
          await api.authorityProctor.submitCameraEvidence({
            session_id: session.id,
            exam_id: examId,
            image_data_url: snap,
            event_type: 'PERIODIC_SURVEILLANCE_SNAPSHOT',
            presence_status: isFaceAbsent ? 'ABSENT' : isShoulderSurfing ? 'SHOULDER_SURFING_DETECTED' : 'PRESENT',
            warning_number: warningCount,
          });
          addTimelineEvent('PERIODIC_SNAPSHOT_CAPTURED', 'LOW', 'Scheduled surveillance snapshot archived');
        }
      } catch (err) {
        console.warn('Periodic snapshot archiving notice:', err);
      }
    }, SNAPSHOT_INTERVAL_MS);

    return () => clearInterval(snapshotTimer);
  }, [enclaveStarted, session, cameraState, isFaceAbsent, isShoulderSurfing, warningCount, examId]);

  // =========================================================================
  // 9. VOICE EVIDENCE RECORDER (MediaRecorder API)
  // =========================================================================
  const startVoiceRecording = () => {
    if (!streamRef.current) return;

    try {
      recordedChunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setVoiceAudioUrl(url);
        setVoiceFileSizeBytes(blob.size);

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
      setVoiceSubmittedSuccess(null);
      setVoiceSubmissionFailed(false);

      recordIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      addTimelineEvent('VOICE_RECORDING_STARTED', 'LOW', 'Official started recording voice evidence');
    } catch (e: any) {
      console.error('Error starting MediaRecorder:', e);
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
      addTimelineEvent('VOICE_RECORDING_STOPPED', 'LOW', `Audio recording complete (${recordingSeconds}s)`);
    }
  };

  const deleteVoiceRecording = () => {
    setVoiceAudioUrl(null);
    setVoiceDataUrl(null);
    setRecordingSeconds(0);
    recordedChunksRef.current = [];
    setVoiceSubmittedSuccess(null);
    setVoiceSubmissionFailed(false);
  };

  const submitVoiceEvidence = async () => {
    if (!session || !voiceDataUrl) return;
    setIsSubmittingVoice(true);
    setVoiceSubmissionFailed(false);

    try {
      const res = await api.authorityProctor.submitVoiceEvidence({
        session_id: session.id,
        exam_id: examId,
        audio_data_url: voiceDataUrl,
        duration_seconds: recordingSeconds,
        file_size_bytes: voiceFileSizeBytes,
        mime_type: 'audio/webm',
        warning_number: warningCount,
      });

      setVoiceSubmittedSuccess({ evidenceId: res.evidence.id });
      showToast('✓ Voice evidence securely recorded', 'success');
      addTimelineEvent('VOICE_EVIDENCE_SENT', 'MEDIUM', `Voice evidence ${res.evidence.id} securely archived`);
    } catch (err: any) {
      console.error('Voice submit failed:', err);
      setVoiceSubmissionFailed(true);
    } finally {
      setIsSubmittingVoice(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Render animated equalizer audio level bars
  const renderEqualizerBars = () => {
    const totalBars = 7;
    const activeCount = Math.min(totalBars, Math.ceil((audioVolumePercent / 100) * totalBars));
    const heights = [8, 12, 18, 22, 18, 12, 8];

    return (
      <div className="flex items-center gap-1 h-6 px-2 py-0.5 rounded bg-[#F6FAF9] border border-[#DCE7EA]">
        {heights.map((h, idx) => {
          const isActive = idx < activeCount;
          return (
            <div
              key={idx}
              style={{ height: `${h}px` }}
              className={`w-1 rounded-full transition-all duration-100 ${
                isActive
                  ? idx >= 5
                    ? 'bg-[#E84B5F]'
                    : idx >= 3
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

  const isAllReadyToEnter = cameraState === 'granted' && micState === 'granted';

  // =========================================================================
  // MAIN RENDER: PURE LIGHT ENTERPRISE PROCTORING CONSOLE
  // =========================================================================
  return (
    <div
      className="min-h-screen text-[#142B38] space-y-6 pb-12"
      style={{
        backgroundColor: '#F6FAF9',
        backgroundImage: `
          radial-gradient(circle at 10% 10%, rgba(0,168,120,0.03) 0%, transparent 40%),
          radial-gradient(circle at 90% 10%, rgba(0,184,217,0.03) 0%, transparent 40%),
          radial-gradient(circle at 90% 90%, rgba(40,120,216,0.02) 0%, transparent 40%)
        `,
      }}
    >
      {/* ======================================================== */}
      {/* PART 3: TOP WHITE HEADER BAR                             */}
      {/* ======================================================== */}
      <header className="bg-white border-b border-[#DCE7EA] px-6 py-3.5 shadow-[0_2px_12px_rgba(20,43,56,0.04)] sticky top-0 z-30">
        <div className="max-w-[1320px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Mode Identification */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#00A878]" />
              <span className="font-extrabold text-base tracking-tight text-[#142B38]">
                ZEROLEAK
              </span>
            </div>
            <span className="text-[#C8D7DE]">|</span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#65777F]">
              PROCTOR MODE
            </span>
          </div>

          {/* Status Pills */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Enclave Status Pill */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              enclaveStarted
                ? 'bg-[#EAF9F3] text-[#008A63] border-[#00A878]/30'
                : 'bg-[#EEF6FF] text-[#2878D8] border-[#2878D8]/20'
            }`}>
              <span className={`w-2 h-2 rounded-full ${enclaveStarted ? 'bg-[#00A878] animate-pulse' : 'bg-[#2878D8]'}`} />
              {enclaveStarted ? '● ENCLAVE ACTIVE' : '○ ENCLAVE STANDBY'}
            </span>

            {/* Camera Status Pill */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              cameraState === 'granted'
                ? 'bg-[#EAF9F3] text-[#008A63] border-[#00A878]/30'
                : 'bg-[#F6FAF9] text-[#65777F] border-[#DCE7EA]'
            }`}>
              <Camera className="w-3.5 h-3.5" />
              {cameraState === 'granted' ? 'CAMERA ACTIVE' : 'CAMERA READY'}
            </span>

            {/* Mic Status Pill */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              micState === 'granted'
                ? 'bg-[#EAF9F3] text-[#008A63] border-[#00A878]/30'
                : 'bg-[#F6FAF9] text-[#65777F] border-[#DCE7EA]'
            }`}>
              <Mic className="w-3.5 h-3.5" />
              {micState === 'granted' ? `MIC ACTIVE (${audioLevelDb} dB)` : 'MIC READY'}
            </span>

            {/* Security Pill */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EDF9FC] text-[#00B8D9] border border-[#00B8D9]/30">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00B8D9]" />
              SECURITY ACTIVE
            </span>
          </div>

          {/* User Profile & Clock */}
          <div className="flex items-center gap-3 text-xs text-[#65777F]">
            <span className="hidden sm:inline font-mono">
              OFFICIAL: <strong className="text-[#142B38]">{currentUser?.full_name || 'Translator Controller'}</strong>
            </span>
            <span className="text-[#C8D7DE] hidden sm:inline">|</span>
            <span className="flex items-center gap-1 text-[#142B38] font-mono">
              <Clock className="w-3.5 h-3.5 text-[#65777F]" />
              {currentTimeStr}
            </span>
          </div>
        </div>
      </header>

      {/* Main Centered Content Container (max-width 1320px) */}
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 space-y-6">
        {/* ======================================================== */}
        {/* PART 4: WHITE PAGE HEADER CARD                           */}
        {/* ======================================================== */}
        <div className="bg-white rounded-[18px] border border-[#DCE7EA] p-6 sm:p-7 shadow-[0_8px_28px_rgba(30,70,80,0.06)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#EAF9F3] text-[#008A63] border border-[#00A878]/30 text-xs font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-[#00A878]" />
                PROTECTED PROCTORING ENCLAVE
              </span>
              <span className="text-xs font-mono text-[#65777F]">
                SESSION ID: {session?.id ? session.id.substring(0, 16) : 'ZX-2026-ENCLAVE-8821'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#142B38] tracking-tight">
              {title || 'Translator Confidential Translation Enclave'}
            </h1>
            <p className="text-sm text-[#65777F] max-w-2xl leading-relaxed">
              Secure examination translation workspace with continuous camera, acoustic monitoring, and debounced focus surveillance to ensure zero question paper leakage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setPolicyModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#F6FAF9] hover:bg-[#EEF6FF] border border-[#DCE7EA] text-[#142B38] text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5 text-[#2878D8]" />
              Proctoring Policy
            </button>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#EAF9F3] border border-[#00A878]/30 text-xs font-bold text-[#008A63]">
              <span className="w-2 h-2 rounded-full bg-[#00A878] animate-ping" />
              SESSION SECURE
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* PART 28: ENCLAVE READINESS CHECKLIST CARD                */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-[#DCE7EA] p-6 shadow-[0_6px_24px_rgba(30,70,80,0.05)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F0F4F8]">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-[#EAF9F3] text-[#00A878]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#142B38] tracking-tight">
                  ENCLAVE READINESS & VERIFICATION
                </h3>
                <p className="text-xs text-[#65777F]">
                  Required security sensors must be verified before entering the confidential examination workbench.
                </p>
              </div>
            </div>

            <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
              isAllReadyToEnter
                ? 'bg-[#EAF9F3] text-[#008A63] border-[#00A878]/30'
                : 'bg-[#FFF7E8] text-[#F0A11A] border-[#F0A11A]/30'
            }`}>
              {isAllReadyToEnter ? 'READY TO ENTER' : 'ACTION REQUIRED'}
            </span>
          </div>

          {/* 5-Item Checklist Row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
            {/* Check 1: Authentication */}
            <div className="p-3 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA] flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-[#00A878] shrink-0" />
              <div className="truncate">
                <span className="text-xs font-bold text-[#142B38] block truncate">Authentication</span>
                <span className="text-[10px] text-[#008A63] font-medium">Verified Official</span>
              </div>
            </div>

            {/* Check 2: Camera */}
            <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${
              cameraState === 'granted'
                ? 'bg-[#EAF9F3] border-[#00A878]/30'
                : cameraState === 'denied' || cameraState === 'not_found'
                ? 'bg-[#FFF1F3] border-[#E84B5F]/30'
                : 'bg-[#F6FAF9] border-[#DCE7EA]'
            }`}>
              {cameraState === 'granted' ? (
                <CheckCircle className="w-4 h-4 text-[#00A878] shrink-0" />
              ) : cameraState === 'requesting' ? (
                <RefreshCw className="w-4 h-4 text-[#2878D8] animate-spin shrink-0" />
              ) : cameraState === 'denied' || cameraState === 'not_found' ? (
                <XCircle className="w-4 h-4 text-[#E84B5F] shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-[#65777F] shrink-0" />
              )}
              <div className="truncate">
                <span className="text-xs font-bold text-[#142B38] block truncate">Camera</span>
                <span className={`text-[10px] font-medium ${
                  cameraState === 'granted'
                    ? 'text-[#008A63]'
                    : cameraState === 'denied' || cameraState === 'not_found'
                    ? 'text-[#E84B5F]'
                    : 'text-[#65777F]'
                }`}>
                  {cameraState === 'granted'
                    ? 'Active'
                    : cameraState === 'requesting'
                    ? 'Requesting...'
                    : cameraState === 'denied'
                    ? 'Denied'
                    : cameraState === 'not_found'
                    ? 'Not Found'
                    : 'Permission Required'}
                </span>
              </div>
            </div>

            {/* Check 3: Microphone */}
            <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${
              micState === 'granted'
                ? 'bg-[#EAF9F3] border-[#00A878]/30'
                : micState === 'denied' || micState === 'not_found'
                ? 'bg-[#FFF1F3] border-[#E84B5F]/30'
                : 'bg-[#F6FAF9] border-[#DCE7EA]'
            }`}>
              {micState === 'granted' ? (
                <CheckCircle className="w-4 h-4 text-[#00A878] shrink-0" />
              ) : micState === 'requesting' ? (
                <RefreshCw className="w-4 h-4 text-[#2878D8] animate-spin shrink-0" />
              ) : micState === 'denied' || micState === 'not_found' ? (
                <XCircle className="w-4 h-4 text-[#E84B5F] shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-[#65777F] shrink-0" />
              )}
              <div className="truncate">
                <span className="text-xs font-bold text-[#142B38] block truncate">Microphone</span>
                <span className={`text-[10px] font-medium ${
                  micState === 'granted'
                    ? 'text-[#008A63]'
                    : micState === 'denied' || micState === 'not_found'
                    ? 'text-[#E84B5F]'
                    : 'text-[#65777F]'
                }`}>
                  {micState === 'granted'
                    ? 'Active'
                    : micState === 'requesting'
                    ? 'Requesting...'
                    : micState === 'denied'
                    ? 'Denied'
                    : micState === 'not_found'
                    ? 'Not Found'
                    : 'Permission Required'}
                </span>
              </div>
            </div>

            {/* Check 4: Examination Assignment */}
            <div className="p-3 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA] flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-[#00A878] shrink-0" />
              <div className="truncate">
                <span className="text-xs font-bold text-[#142B38] block truncate">Assignment</span>
                <span className="text-[10px] text-[#008A63] font-medium">Paper Bound</span>
              </div>
            </div>

            {/* Check 5: Security Monitor */}
            <div className="p-3 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA] flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-[#00A878] shrink-0" />
              <div className="truncate">
                <span className="text-xs font-bold text-[#142B38] block truncate">Security Shield</span>
                <span className="text-[10px] text-[#008A63] font-medium">Armed (0/3 Violations)</span>
              </div>
            </div>
          </div>

          {/* Error Banner only when actual failure occurred */}
          {permissionError && (
            <div className="p-4 rounded-xl bg-[#FFF1F3] border border-[#E84B5F]/30 text-[#142B38] text-xs flex items-start justify-between gap-3 animate-fade-in">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#E84B5F] shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-[#E84B5F]">{permissionError.title}</h4>
                  <p className="text-[#65777F] mt-0.5">{permissionError.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRequestHardwarePermissions}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#E84B5F]/40 hover:bg-[#FFF1F3] text-[#E84B5F] font-bold text-xs shrink-0 cursor-pointer"
              >
                {permissionError.actionLabel || 'Retry Permissions'}
              </button>
            </div>
          )}

          {/* Action Row */}
          {!enclaveStarted && (
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-[#65777F]">
                {isAllReadyToEnter
                  ? 'All hardware sensors authenticated. Click the button to launch the confidential examination enclave.'
                  : 'Camera and microphone access is required before entering the confidential examination enclave.'}
              </p>

              {!isAllReadyToEnter ? (
                <button
                  type="button"
                  onClick={handleRequestHardwarePermissions}
                  disabled={isRequestingPermissions}
                  className="h-[50px] px-8 rounded-xl text-white font-bold text-sm shadow-[0_4px_16px_rgba(0,168,120,0.25)] hover:shadow-[0_6px_20px_rgba(0,168,120,0.35)] flex items-center justify-center gap-2.5 transition-all cursor-pointer shrink-0 disabled:opacity-75"
                  style={{
                    background: 'linear-gradient(135deg, #00A878, #00C98B)',
                  }}
                >
                  {isRequestingPermissions ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>REQUESTING ACCESS...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 text-white" />
                      <span>Enable Camera & Microphone</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartEnclave}
                  disabled={isStartingEnclave}
                  className="h-[50px] px-10 rounded-xl text-white font-black text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,168,120,0.3)] hover:shadow-[0_6px_24px_rgba(0,168,120,0.4)] flex items-center justify-center gap-2.5 transition-all cursor-pointer shrink-0 transform hover:scale-[1.01]"
                  style={{
                    background: 'linear-gradient(135deg, #00A878, #00C98B)',
                  }}
                >
                  {isStartingEnclave ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>INITIALIZING ENCLAVE...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5 text-white" />
                      <span>Enter Enclave & Start Review →</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Camera Disconnect Notice */}
        {isCameraDisconnected && (
          <div className="p-4 rounded-xl bg-[#FFF1F3] border border-[#E84B5F]/30 text-[#142B38] text-xs flex items-center justify-between gap-3 animate-fade-in shadow-2xs">
            <div className="flex items-center gap-2.5">
              <CameraOff className="w-5 h-5 text-[#E84B5F] shrink-0" />
              <div>
                <span className="font-bold text-[#E84B5F] block">Camera connection lost</span>
                <span className="text-[#65777F]">Please restore camera access to continue your examination session.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRequestHardwarePermissions}
              className="px-4 py-2 rounded-xl bg-white border border-[#E84B5F]/40 hover:bg-[#FFF1F3] text-[#E84B5F] font-bold text-xs shrink-0 cursor-pointer shadow-2xs"
            >
              Reconnect Camera
            </button>
          </div>
        )}

        {/* Microphone Disconnect Notice */}
        {isMicDisconnected && (
          <div className="p-4 rounded-xl bg-[#FFF7E8] border border-[#F0A11A]/30 text-[#142B38] text-xs flex items-center justify-between gap-3 animate-fade-in shadow-2xs">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#F0A11A] shrink-0" />
              <div>
                <span className="font-bold text-[#F0A11A] block">Microphone connection lost</span>
                <span className="text-[#65777F]">Please restore microphone access to maintain session security.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRequestHardwarePermissions}
              className="px-4 py-2 rounded-xl bg-white border border-[#F0A11A]/40 hover:bg-[#FFF7E8] text-[#F0A11A] font-bold text-xs shrink-0 cursor-pointer shadow-2xs"
            >
              Reconnect Microphone
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* TWO-COLUMN PROCTORING WORKSPACE (LIGHT UI)                */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ======================================================== */}
          {/* LEFT COLUMN: Live Camera Card + Microphone & Voice Note */}
          {/* ======================================================== */}
          <div className="lg:col-span-6 space-y-6">
            {/* PART 11 & 12: LIVE CAMERA CARD (WHITE BACKGROUND) */}
            <div className="bg-white rounded-2xl border border-[#DCE7EA] p-6 shadow-[0_6px_24px_rgba(30,70,80,0.05)] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F8]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#EAF9F3] text-[#00A878]">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#142B38] tracking-tight">
                      LIVE CAMERA
                    </h3>
                    <p className="text-xs text-[#65777F]">
                      High-definition continuous visual biometric surveillance feed.
                    </p>
                  </div>
                </div>

                <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${
                  cameraState === 'granted'
                    ? 'bg-[#EAF9F3] text-[#008A63] border-[#00A878]/30'
                    : 'bg-[#F6FAF9] text-[#65777F] border-[#DCE7EA]'
                }`}>
                  {cameraState === 'granted' ? '● CAMERA ACTIVE' : '○ CAMERA NOT ENABLED'}
                </span>
              </div>

              {/* Video Preview Container — LIGHT BACKGROUND #F4F8F9 (NEVER BLACK) */}
              <div className="relative aspect-video w-full bg-[#F4F8F9] rounded-[14px] overflow-hidden border border-[#DCE7EA] shadow-inner flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover -scale-x-100 ${
                    cameraState === 'granted' ? 'block' : 'hidden'
                  }`}
                />

                {/* Camera Inactive Placeholder (LIGHT/WHITE, NOT BLACK) */}
                {cameraState !== 'granted' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F8FBFB] p-6 text-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-[#FFF1F3] border border-[#E84B5F]/20 flex items-center justify-center text-[#E84B5F]">
                      <CameraOff className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#142B38]">CAMERA OFFLINE</p>
                      <p className="text-xs text-[#65777F] mt-1 max-w-xs">
                        Camera access is required before entering the confidential examination enclave.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRequestHardwarePermissions}
                      disabled={isRequestingPermissions}
                      className="px-4 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-xs cursor-pointer"
                      style={{ background: 'linear-gradient(135deg, #00A878, #00C98B)' }}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Enable Camera</span>
                    </button>
                  </div>
                )}

                {/* Subtile Translucent WHITE Overlay when Active */}
                {cameraState === 'granted' && (
                  <>
                    <div className="absolute top-2.5 left-2.5">
                      <span className="px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-xs text-[#008A63] border border-[#DCE7EA] text-[11px] font-bold shadow-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" />
                        LIVE
                      </span>
                    </div>

                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-xs border border-[#DCE7EA] text-xs shadow-xs">
                      <span className="flex items-center gap-1.5 text-[#142B38] font-medium">
                        <span className="w-2 h-2 rounded-full bg-[#00A878]" />
                        Camera verified • Live
                      </span>
                      <span className="font-mono text-[#65777F] text-[11px]">
                        {faceResult.faceCount === 1 ? '1 Face Verified' : `${faceResult.faceCount} Faces`}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Status Footer */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-[#65777F]">
                  Stream: {cameraState === 'granted' ? '720p HD @ 30 FPS' : 'Inactive'}
                </span>
                {cameraState === 'granted' && (
                  <button
                    type="button"
                    onClick={handleRequestHardwarePermissions}
                    className="text-[#2878D8] hover:text-[#1d5fb0] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh Camera Stream
                  </button>
                )}
              </div>
            </div>

            {/* PART 13: MICROPHONE CARD (WHITE BACKGROUND) */}
            <div className="bg-white rounded-2xl border border-[#DCE7EA] p-6 shadow-[0_6px_24px_rgba(30,70,80,0.05)] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F8]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#EDF9FC] text-[#00B8D9]">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#142B38] tracking-tight">
                      MICROPHONE
                    </h3>
                    <p className="text-xs text-[#65777F]">
                      Acoustic telemetry and decibel anomaly monitoring.
                    </p>
                  </div>
                </div>

                <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${
                  micState === 'granted'
                    ? 'bg-[#EAF9F3] text-[#008A63] border-[#00A878]/30'
                    : 'bg-[#F6FAF9] text-[#65777F] border-[#DCE7EA]'
                }`}>
                  {micState === 'granted' ? '● ACTIVE' : '○ NOT ENABLED'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-full bg-white border border-[#DCE7EA] text-[#00B8D9]">
                    <Volume2 className="w-5 h-5 text-[#00B8D9]" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#142B38] block">Acoustic Level Meter</span>
                    <span className="text-xs font-mono text-[#65777F]">
                      {micState === 'granted' ? `Audio Intensity: ${audioLevelDb} dB` : 'Sensor Disconnected'}
                    </span>
                  </div>
                </div>

                {micState === 'granted' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#65777F]">Level:</span>
                    {renderEqualizerBars()}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestHardwarePermissions}
                    className="px-3.5 py-1.5 rounded-xl bg-white border border-[#DCE7EA] hover:bg-[#EEF6FF] text-[#2878D8] font-bold text-xs cursor-pointer shadow-2xs"
                  >
                    Enable Microphone
                  </button>
                )}
              </div>
            </div>

            {/* PART 22, 23, 24: VOICE EVIDENCE RECORDER CARD (WHITE BACKGROUND) */}
            <div className="bg-white rounded-2xl border border-[#DCE7EA] p-6 shadow-[0_6px_24px_rgba(30,70,80,0.05)] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F8]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#EEF6FF] text-[#2878D8]">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#142B38] tracking-tight">
                      VOICE EVIDENCE
                    </h3>
                    <p className="text-xs text-[#65777F]">
                      Record official remarks or translation incident notes.
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-0.5 rounded bg-[#EAF9F3] text-[#008A63] text-[10px] font-bold font-mono border border-[#00A878]/30">
                  OFFICIAL RECORD
                </span>
              </div>

              {/* Recording Area */}
              <div className="p-4 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA] space-y-3">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {isRecordingVoice ? (
                      <div className="w-10 h-10 rounded-full bg-[#FFF1F3] border border-[#E84B5F]/30 flex items-center justify-center text-[#E84B5F] animate-pulse">
                        <Radio className="w-5 h-5 text-[#E84B5F]" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white border border-[#DCE7EA] flex items-center justify-center text-[#2878D8]">
                        <Mic className="w-5 h-5 text-[#2878D8]" />
                      </div>
                    )}

                    <div>
                      <span className={`text-xs font-bold block ${isRecordingVoice ? 'text-[#E84B5F]' : 'text-[#142B38]'}`}>
                        {isRecordingVoice
                          ? '🔴 RECORDING ACTIVE'
                          : voiceAudioUrl
                          ? 'VOICE NOTE READY'
                          : 'STANDBY — READY TO RECORD'}
                      </span>
                      <span className="text-xs font-mono text-[#65777F]">
                        Duration: <strong className="text-[#142B38]">{formatSeconds(recordingSeconds)}</strong>
                        {voiceFileSizeBytes > 0 && ` • (${Math.round(voiceFileSizeBytes / 1024)} KB)`}
                      </span>
                    </div>
                  </div>

                  {/* Start / Stop Button */}
                  {!isRecordingVoice ? (
                    <button
                      type="button"
                      onClick={startVoiceRecording}
                      disabled={micState !== 'granted'}
                      className="px-4 py-2 rounded-xl text-white font-bold text-xs shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #00A878, #00C98B)' }}
                    >
                      Start Recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopVoiceRecording}
                      className="px-4 py-2 rounded-xl bg-[#E84B5F] hover:bg-[#d63b4f] text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 animate-pulse"
                    >
                      <Square className="w-3.5 h-3.5 fill-white" />
                      Stop Recording
                    </button>
                  )}
                </div>

                {/* Audio Player and Submit Controls */}
                {voiceAudioUrl && (
                  <div className="pt-3 border-t border-[#DCE7EA] space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#142B38]">Recorded Audio Preview:</span>
                      <button
                        type="button"
                        onClick={deleteVoiceRecording}
                        className="text-[#E84B5F] hover:text-[#d63b4f] font-semibold text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>

                    <audio controls src={voiceAudioUrl} className="w-full h-8 accent-[#00A878]" />

                    {/* Submit Button */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                      <p className="text-[11px] text-[#65777F]">
                        Encrypts and archives official voice evidence for this session.
                      </p>
                      <button
                        type="button"
                        onClick={submitVoiceEvidence}
                        disabled={isSubmittingVoice || Boolean(voiceSubmittedSuccess)}
                        className="px-5 py-2.5 rounded-xl bg-[#2878D8] hover:bg-[#1d5fb0] disabled:bg-emerald-600 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs"
                      >
                        {isSubmittingVoice ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Encrypting & Saving...</span>
                          </>
                        ) : voiceSubmittedSuccess ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            <span>Saved ✓</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Save Voice Evidence</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Success Verification Banner */}
                {voiceSubmittedSuccess && (
                  <div className="p-3 rounded-xl bg-[#EAF9F3] border border-[#00A878]/30 text-[#008A63] text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#00A878]" />
                      VOICE EVIDENCE SAVED
                    </div>
                    <div className="font-mono text-[11px] text-[#142B38]">
                      Evidence ID: <strong>{voiceSubmittedSuccess.evidenceId}</strong> • Status: ✓ SECURED IN ARCHIVE
                    </div>
                  </div>
                )}

                {/* Failure Banner with Retry */}
                {voiceSubmissionFailed && (
                  <div className="p-3 rounded-xl bg-[#FFF1F3] border border-[#E84B5F]/30 text-[#E84B5F] text-xs flex items-center justify-between gap-2">
                    <span>VOICE EVIDENCE SUBMISSION FAILED</span>
                    <button
                      type="button"
                      onClick={submitVoiceEvidence}
                      className="px-3 py-1 rounded-lg bg-white border border-[#E84B5F]/40 text-[#E84B5F] font-bold text-xs cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* RIGHT COLUMN: Proctor Security Status + Warnings Card    */}
          {/* ======================================================== */}
          <div className="lg:col-span-6 space-y-6">
            {/* PART 14: PROCTOR SECURITY STATUS (WHITE CARD) */}
            <div className="bg-white rounded-2xl border border-[#DCE7EA] p-6 shadow-[0_6px_24px_rgba(30,70,80,0.05)] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F8]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#EAF9F3] text-[#00A878]">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#142B38] tracking-tight">
                      PROCTOR SECURITY STATUS
                    </h3>
                    <p className="text-xs text-[#65777F]">
                      Real-time cryptographic and hardware monitoring ledger.
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-0.5 rounded bg-[#EAF9F3] text-[#008A63] text-xs font-bold border border-[#00A878]/30">
                  SYSTEM ACTIVE
                </span>
              </div>

              {/* Rows */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA]">
                  <span className="font-semibold text-[#142B38]">Camera Stream</span>
                  <span className={`font-mono font-bold ${cameraState === 'granted' ? 'text-[#008A63]' : 'text-[#65777F]'}`}>
                    {cameraState === 'granted' ? '● Active' : '○ Standby'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA]">
                  <span className="font-semibold text-[#142B38]">Microphone Sensor</span>
                  <span className={`font-mono font-bold ${micState === 'granted' ? 'text-[#008A63]' : 'text-[#65777F]'}`}>
                    {micState === 'granted' ? '● Active' : '○ Standby'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA]">
                  <span className="font-semibold text-[#142B38]">Focus Monitor</span>
                  <span className="font-mono font-bold text-[#2878D8]">
                    ● Monitoring (Debounced &gt;2.5s)
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA]">
                  <span className="font-semibold text-[#142B38]">Fullscreen Protection</span>
                  <span className="font-mono font-bold text-[#6257E8]">
                    ● Active
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA]">
                  <span className="font-semibold text-[#142B38]">Clipboard Protection</span>
                  <span className="font-mono font-bold text-[#00B8D9]">
                    ● Active (Intercepted)
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA]">
                  <span className="font-semibold text-[#142B38]">Official Presence</span>
                  <span className={`font-mono font-bold ${
                    presenceStatus === 'PRESENT'
                      ? 'text-[#008A63]'
                      : presenceStatus === 'CHECKING'
                      ? 'text-[#2878D8]'
                      : presenceStatus === 'UNCERTAIN'
                      ? 'text-[#F0A11A]'
                      : 'text-[#E84B5F]'
                  }`}>
                    {presenceStatus === 'PRESENT'
                      ? '● Verified Present'
                      : presenceStatus === 'CHECKING'
                      ? '○ Verifying...'
                      : presenceStatus === 'UNCERTAIN'
                      ? '⚠ Presence Uncertain'
                      : '● Official Absent'}
                  </span>
                </div>
              </div>
            </div>

            {/* PART 25: LIVE SECURITY ACTIVITY (WHITE CARD) */}
            <div className="bg-white rounded-2xl border border-[#DCE7EA] p-6 shadow-[0_6px_24px_rgba(30,70,80,0.05)] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#F0F4F8]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#EEF6FF] text-[#2878D8]">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#142B38] tracking-tight">
                      LIVE SECURITY ACTIVITY
                    </h3>
                    <p className="text-xs text-[#65777F]">
                      Real-time cryptographic audit log of sensor and focus events.
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono text-[#65777F]">
                  {timelineEvents.length} events logged
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {timelineEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl bg-[#F6FAF9] border border-[#DCE7EA] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                        ev.severity === 'CRITICAL'
                          ? 'bg-[#FFF1F3] text-[#E84B5F] border border-[#E84B5F]/30'
                          : ev.severity === 'HIGH'
                          ? 'bg-orange-50 text-orange-700 border border-orange-200'
                          : ev.severity === 'MEDIUM'
                          ? 'bg-[#FFF7E8] text-[#F0A11A] border border-[#F0A11A]/30'
                          : 'bg-[#EAF9F3] text-[#008A63] border border-[#00A878]/30'
                      }`}>
                        {ev.event_type}
                      </span>
                      <span className="text-[#142B38] font-medium truncate">
                        {ev.description}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[#65777F] shrink-0">
                      {ev.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* PART 26: ASSIGNED QUESTIONS WORKBENCH (WHITE CONTAINER)  */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-[#DCE7EA] shadow-[0_6px_24px_rgba(30,70,80,0.05)] overflow-hidden">
          <div className="px-6 py-4 bg-[#F6FAF9] border-b border-[#DCE7EA] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00A878]" />
              <span className="font-bold text-[#142B38] uppercase tracking-wider">
                ASSIGNED QUESTIONS WORKBENCH
              </span>
            </div>
            <span className="text-xs font-mono text-[#008A63] font-bold">
              PROTECTED UNDER ENCLAVE PROTOCOL
            </span>
          </div>

          <div className="p-6">
            {enclaveStarted ? (
              <div>{children}</div>
            ) : (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#EEF6FF] border border-[#2878D8]/20 text-[#2878D8] flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-[#142B38]">
                  Assigned Questions Locked
                </h4>
                <p className="text-xs text-[#65777F] max-w-md mx-auto">
                  To protect confidential question paper materials, questions are only decrypted after camera and microphone sensors are verified.
                </p>
                <button
                  type="button"
                  onClick={handleRequestHardwarePermissions}
                  className="px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-xs hover:shadow-md cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #00A878, #00C98B)' }}
                >
                  Complete Readiness Check to Unlock
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* FLOATING TOAST NOTIFICATION                              */}
      {/* ======================================================== */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-3 duration-200 ${
            toast.type === 'warning'
              ? 'bg-[#FFF7E8] border-[#F0A11A]/40 text-amber-950'
              : toast.type === 'success'
              ? 'bg-[#EAF9F3] border-[#00A878]/40 text-[#008A63]'
              : 'bg-white border-[#DCE7EA] text-[#142B38]'
          }`}
        >
          {toast.type === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-[#F0A11A] shrink-0" />
          ) : toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#00A878] shrink-0" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-[#2878D8] shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* AUTOMATIC CAMERA & MICROPHONE SETUP MODAL (LIGHT THEME)  */}
      {/* ======================================================== */}
      {setupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#DCE7EA] w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 pb-3 border-b border-[#F0F4F8]">
              <div className="p-2.5 rounded-2xl bg-[#EAF9F3] text-[#00A878]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#00A878]">
                  ZeroLeak Secure Session
                </span>
                <h3 className="text-base font-bold text-[#142B38]">
                  Camera &amp; Microphone Verification
                </h3>
              </div>
            </div>

            <p className="text-xs text-[#65777F] leading-relaxed">
              To begin the secure examination session, ZeroLeak requires access to your camera and microphone.
            </p>

            <div className="space-y-2.5">
              <div className="p-3.5 rounded-2xl bg-[#F6FAF9] border border-[#DCE7EA] flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white border border-[#DCE7EA] text-[#00A878]">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-[#142B38] block">Camera</span>
                    <span className="text-[11px] text-[#65777F]">Used for official presence verification.</span>
                  </div>
                </div>
                <span className={`font-mono text-xs font-bold ${
                  cameraState === 'granted' ? 'text-[#008A63]' : 'text-[#65777F]'
                }`}>
                  {cameraState === 'granted' ? '✓ Camera ready' : 'Required'}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6FAF9] border border-[#DCE7EA] flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white border border-[#DCE7EA] text-[#00B8D9]">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-[#142B38] block">Microphone</span>
                    <span className="text-[11px] text-[#65777F]">Used for authorized voice evidence.</span>
                  </div>
                </div>
                <span className={`font-mono text-xs font-bold ${
                  micState === 'granted' ? 'text-[#008A63]' : 'text-[#65777F]'
                }`}>
                  {micState === 'granted' ? '✓ Microphone ready' : 'Required'}
                </span>
              </div>
            </div>

            {permissionPhase === 'SUCCESS' ? (
              <div className="p-3.5 rounded-2xl bg-[#EAF9F3] border border-[#00A878]/30 text-xs font-bold text-[#008A63] flex items-center justify-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-[#00A878]" />
                <span>✓ Secure session initialized</span>
              </div>
            ) : permissionPhase === 'DENIED' || cameraState === 'denied' || micState === 'denied' ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-[#FFF1F3] border border-[#E84B5F]/30 text-xs text-[#E84B5F] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Permission was declined. Please allow camera and microphone access in browser settings.</span>
                </div>
                <button
                  type="button"
                  onClick={handleRequestHardwarePermissions}
                  disabled={isRequestingPermissions}
                  className="w-full py-3 rounded-2xl text-white font-bold text-xs shadow-xs cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #00A878, #00C98B)' }}
                >
                  {isRequestingPermissions ? 'Requesting Access...' : 'Retry Permissions'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRequestHardwarePermissions}
                disabled={isRequestingPermissions}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-xs shadow-[0_4px_16px_rgba(0,168,120,0.25)] hover:shadow-[0_6px_20px_rgba(0,168,120,0.35)] transition-all cursor-pointer flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #00A878, #00C98B)' }}
              >
                {isRequestingPermissions ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Requesting Permissions...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-white" />
                    <span>Enable Camera &amp; Microphone</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PROCTORING POLICY MODAL (LIGHT)                          */}
      {/* ======================================================== */}
      {policyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#DCE7EA] w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DCE7EA] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#00A878]" />
                <h3 className="text-base font-bold text-[#142B38]">
                  ZeroLeak Examination Proctoring Policy
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPolicyModalOpen(false)}
                className="p-1 rounded-lg text-[#65777F] hover:text-[#142B38] hover:bg-[#F6FAF9] cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-[#65777F] leading-relaxed">
              <div className="p-3.5 rounded-xl bg-[#EAF9F3] border border-[#00A878]/30 text-[#008A63]">
                <strong>Zero Leak Commitment:</strong> This examination environment enforces rigorous visual and acoustic tracking under national examination standards to safeguard question paper secrecy.
              </div>

              <div>
                <h4 className="font-bold text-[#142B38] text-sm mb-1">1. Visual Biometric Surveillance</h4>
                <p>
                  Webcam stream is analyzed in-browser for single authorized presence. In the event of shoulder surfing or extended absence, an evidentiary snapshot is securely cataloged.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-[#142B38] text-sm mb-1">2. Acoustic Telemetry & Voice Evidence</h4>
                <p>
                  Microphone input tracks ambient noise levels. Officials may record voice evidence notes directly for the Chief Vigilance Auditor.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-[#142B38] text-sm mb-1">3. Tab Switching & Focus Shield</h4>
                <p>
                  Leaving the enclave window for &gt;2.5 seconds triggers an automatic warning. A strict maximum of 3 warnings is enforced.
                </p>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#F6FAF9] border-t border-[#DCE7EA] flex justify-end">
              <button
                type="button"
                onClick={() => setPolicyModalOpen(false)}
                className="px-4 py-2 rounded-xl text-white font-bold text-xs cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #00A878, #00C98B)' }}
              >
                Close Policy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* LIGHT ANOMALY MASKS (NO BLACK/DARK MASKS)                */}
      {/* ======================================================== */}
      {isFaceAbsent && (
        <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-[#142B38] animate-fade-in select-none">
          <div className="p-4 rounded-3xl bg-[#FFF7E8] border-2 border-[#F0A11A] text-[#F0A11A] mb-4 shadow-xl">
            <EyeOff className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-[#142B38] tracking-tight">
            Confidential Examination Material Masked
          </h2>
          <p className="text-amber-800 text-sm font-semibold mt-1">
            Authorized Official Absent From Camera View
          </p>
          <p className="text-[#65777F] text-xs max-w-md mt-2">
            To prevent question paper leaks to unauthorized persons or passers-by, all confidential examination questions are temporarily masked. Return to your camera to resume work.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F6FAF9] border border-[#DCE7EA] text-xs font-mono text-[#142B38] shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#F0A11A] animate-ping" />
            Monitoring Camera for Official's Return...
          </div>
        </div>
      )}

      {isShoulderSurfing && (
        <div className="fixed inset-0 z-50 bg-[#FFF1F3]/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-[#142B38] animate-fade-in select-none">
          <div className="p-4 rounded-3xl bg-rose-100 border-2 border-[#E84B5F] text-[#E84B5F] mb-4 shadow-xl animate-bounce">
            <Users className="w-14 h-14" />
          </div>
          <h2 className="text-2xl font-extrabold text-[#142B38] tracking-tight">
            LEAK PREVENTION ALERT: SECONDARY FACE DETECTED
          </h2>
          <p className="text-rose-700 text-sm font-bold mt-1">
            Shoulder Surfing / Unauthorized Person in Camera View
          </p>
          <p className="text-[#65777F] text-xs max-w-lg mt-2 bg-white p-3.5 rounded-xl border border-rose-200">
            A secondary person was detected looking at your screen. The question paper has been immediately masked and watermarked. A high-resolution audit snapshot has been logged to the Chief Vigilance Auditor.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-rose-300 text-xs font-mono text-rose-700 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#E84B5F] animate-ping" />
            Ensure complete physical privacy before continuing.
          </div>
        </div>
      )}

      {isWindowBlurred && !isFaceAbsent && !isShoulderSurfing && (
        <div className="fixed inset-0 z-40 bg-[#F6FAF9]/90 backdrop-blur-xs flex flex-col items-center justify-center p-8 text-center text-[#142B38] animate-fade-in select-none">
          <div className="p-3 rounded-2xl bg-white border border-[#DCE7EA] text-[#F0A11A] mb-3 shadow-md">
            <ShieldAlert className="w-10 h-10 text-[#F0A11A]" />
          </div>
          <h3 className="text-xl font-bold text-[#142B38]">
            Enclave Window Unfocused
          </h3>
          <p className="text-[#65777F] text-xs max-w-sm mt-1">
            You navigated away from the secure examination window. External screen capture and application switching are restricted. Click anywhere on this screen to refocus.
          </p>
        </div>
      )}

      {isEmergencyLocked && (
        <div className="fixed inset-0 z-50 bg-[#F6FAF9]/98 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-[#142B38] animate-fade-in select-none">
          <div className="p-5 rounded-3xl bg-[#FFF1F3] border-2 border-[#E84B5F] text-[#E84B5F] mb-4 shadow-xl">
            <Lock className="w-14 h-14" />
          </div>
          <h2 className="text-2xl font-extrabold text-[#142B38] uppercase tracking-wider">
            TERMINAL EMERGENCY LOCKDOWN
          </h2>
          <p className="text-rose-700 text-sm font-semibold mt-1">
            Session Flagged for Review by Examination Registrar / Auditor
          </p>
          <div className="text-[#65777F] text-xs max-w-md mt-3 bg-white p-4 rounded-xl border border-rose-200">
            <strong>Reason:</strong> {emergencyReason || 'Maximum proctoring violation threshold reached (3/3).'}
          </div>
          <p className="text-[#65777F] text-xs mt-4">
            Contact the Central Examination Authority to conduct a forensic audit review.
          </p>
        </div>
      )}
    </div>
  );
};
