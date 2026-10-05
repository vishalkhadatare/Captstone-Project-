import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Shield,
  Activity,
  FileText,
  Volume2,
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

export type ProctorPresenceState =
  | 'CAMERA_PERMISSION_REQUIRED'
  | 'CAMERA_INITIALIZING'
  | 'CAMERA_ACTIVE'
  | 'FACE_DETECTED'
  | 'FACE_NOT_DETECTED'
  | 'PRESENCE_UNCERTAIN'
  | 'TEMPORARILY_ABSENT'
  | 'SESSION_LOCKED';

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

  // Presence State Machine (Section 3)
  const [presenceState, setPresenceState] = useState<ProctorPresenceState>('CAMERA_PERMISSION_REQUIRED');

  // Permission Setup Modal (Section 9)
  const [setupModalOpen, setSetupModalOpen] = useState(true);
  const [cameraState, setCameraState] = useState<DevicePermissionState>('not_requested');
  const [micState, setMicState] = useState<DevicePermissionState>('not_requested');
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [permissionError, setPermissionError] = useState<PermissionErrorInfo | null>(null);

  // Streams & Audio Telemetry
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [audioLevelDb, setAudioLevelDb] = useState(-48);
  const [audioVolumePercent, setAudioVolumePercent] = useState(0);
  const [verificationSnapshot, setVerificationSnapshot] = useState<string | null>(null);

  // Real-time Facial Telemetry & Anomaly Sensors
  const [faceResult, setFaceResult] = useState<FaceDetectionResult>({ faceCount: 1, status: 'NORMAL' });
  const [isShoulderSurfing, setIsShoulderSurfing] = useState(false);
  const [isEmergencyLocked, setIsEmergencyLocked] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState<string | null>(null);
  const [leakRiskScore, setLeakRiskScore] = useState(0);

  // Focus & Window Blur Tracking
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
  const blurTimerRef = useRef<any>(null);
  const blurWarningFiredRef = useRef<boolean>(false);

  // Warning Counter (Synced with Backend Policy)
  const [warningCount, setWarningCount] = useState(0);
  const lastWarningTimeRef = useRef<number>(0);

  // Consecutive Absence Frame Counter for Grace Period (Section 19 & 20)
  const consecutiveAbsentFrames = useRef(0);
  const lastFaceStateLogged = useRef<'NORMAL' | 'ABSENT' | 'SHOULDER_SURFING'>('NORMAL');

  // Voice Evidence Recorder State (Section 14 & 15)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSubmittedNotice, setVoiceSubmittedNotice] = useState<string | null>(null);

  // Floating Movable Camera Panel State (Sections 5, 6, 7)
  const [cameraPos, setCameraPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('zeroleak_camera_pos');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            return {
              x: Math.max(16, Math.min(window.innerWidth - 340, parsed.x)),
              y: Math.max(16, Math.min(window.innerHeight - 260, parsed.y)),
            };
          }
        } catch {}
      }
      return {
        x: Math.max(16, window.innerWidth - 350),
        y: Math.max(16, window.innerHeight - 280),
      };
    }
    return { x: 800, y: 500 };
  });

  const [isMinimized, setIsMinimized] = useState(false);
  const [showMandatoryNotice, setShowMandatoryNotice] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Toast Notification
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'warning' | 'info' } | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const showToast = (text: string, type: 'success' | 'warning' | 'info' = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ text, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Video & Audio DOM / Hardware State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioMonitorRef = useRef<AudioMonitor | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [cameraVideoRendering, setCameraVideoRendering] = useState(false);

  // Callback ref: immediately attaches stream and plays video whenever the <video> DOM element mounts
  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current) {
      if (el.srcObject !== streamRef.current) {
        el.srcObject = streamRef.current;
      }
      el.play().catch((err) => {
        console.warn('Video element play() caught in setVideoRef:', err);
      });
    }
  }, []);

  // Sync stream whenever mediaStream changes or when floating window is restored/started
  useEffect(() => {
    streamRef.current = mediaStream;
    if (videoRef.current && mediaStream) {
      if (videoRef.current.srcObject !== mediaStream) {
        videoRef.current.srcObject = mediaStream;
      }
      videoRef.current.play().catch((err) => {
        console.warn('Video element play() caught in sync effect:', err);
      });
    }
  }, [mediaStream, enclaveStarted, isMinimized]);

  // =========================================================================
  // 1. NON-INTRUSIVE PERMISSION CHECK ON MOUNT
  // =========================================================================
  useEffect(() => {
    checkBrowserPermissionStatusNonIntrusive();
    return () => {
      cleanupAllHardware();
    };
  }, []);

  const checkBrowserPermissionStatusNonIntrusive = async () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setCameraState('unsupported');
      setMicState('unsupported');
      setPermissionError({
        type: 'SECURITY_ERROR',
        title: 'Secure Context Required',
        message: 'Camera and microphone sensors require HTTPS or localhost.',
      });
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('unsupported');
      setMicState('unsupported');
      setPermissionError({
        type: 'UNSUPPORTED',
        title: 'Media Support Unavailable',
        message: 'Your current browser does not support HTML5 media recording interfaces.',
      });
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const camQuery = await navigator.permissions.query({ name: 'camera' as any });
        if (camQuery.state === 'granted') setCameraState('granted');
        else if (camQuery.state === 'denied') setCameraState('denied');
        else setCameraState('prompt');
      } catch {
        setCameraState('not_requested');
      }

      try {
        const micQuery = await navigator.permissions.query({ name: 'microphone' as any });
        if (micQuery.state === 'granted') setMicState('granted');
        else if (micQuery.state === 'denied') setMicState('denied');
        else setMicState('prompt');
      } catch {
        setMicState('not_requested');
      }
    }
  };

  // Capture canvas snapshot from live webcam video
  const takeSnapshot = (): string => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return '';
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.82);
      }
    } catch (e) {
      console.warn('Snapshot capture notice:', e);
    }
    return '';
  };

  // Start real-time acoustic monitoring
  const startAudioMonitoring = (stream: MediaStream) => {
    try {
      const audio = new AudioMonitor({
        onVolumeChange: (vol) => {
          setAudioVolumePercent(vol);
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

  // Clean up all hardware streams when session ends (Section 41)
  const cleanupAllHardware = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (audioMonitorRef.current) {
      audioMonitorRef.current.stop();
      audioMonitorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setMediaStream(null);
    setCameraVideoRendering(false);
  };

  // =========================================================================
  // WEBRTC LIVE AUDIO TRANSMISSION (TO CBI AUDITOR CONSOLE)
  // =========================================================================
  useEffect(() => {
    if (!enclaveStarted || !session?.id || micState !== 'granted' || !mediaStream) {
      return;
    }

    const audioTrack = mediaStream.getAudioTracks()[0];
    if (!audioTrack) return;

    let isMounted = true;
    let answerPollInterval: any = null;

    const initWebRtcAudioPublisher = async () => {
      try {
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }

        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
        peerConnectionRef.current = pc;

        // Add audio track - zero local speaker loopback to prevent acoustic feedback
        pc.addTrack(audioTrack, mediaStream);

        // Handle local ICE candidates and post to backend
        pc.onicecandidate = (event) => {
          if (event.candidate && isMounted && session?.id) {
            api.authorityProctor.postCandidate(session.id, 'TRANSLATOR', event.candidate).catch(() => {});
          }
        };

        // Create and dispatch SDP offer
        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);

        await api.authorityProctor.postOffer(session.id, {
          sdp: offer.sdp,
          type: offer.type,
        });

        // Poll for auditor answer
        let lastRemoteDescriptionSet = false;
        const pollAnswer = async () => {
          if (!isMounted || !session?.id || lastRemoteDescriptionSet) return;
          try {
            const res = await api.authorityProctor.getAnswer(session.id);
            if (res.answer && pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(res.answer));
              lastRemoteDescriptionSet = true;

              // Fetch auditor candidates
              const candRes = await api.authorityProctor.getCandidates(session.id, 'AUDITOR');
              if (candRes.candidates && Array.isArray(candRes.candidates)) {
                for (const cand of candRes.candidates) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                  } catch {}
                }
              }
            }
          } catch (e) {
            // ignore transient poll error
          }
        };

        answerPollInterval = setInterval(pollAnswer, 2000);
        pollAnswer();
      } catch (err) {
        console.warn('WebRTC audio publisher initialization note:', err);
      }
    };

    initWebRtcAudioPublisher();

    return () => {
      isMounted = false;
      if (answerPollInterval) clearInterval(answerPollInterval);
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, [enclaveStarted, session?.id, micState, mediaStream]);


  // =========================================================================
  // 2. EXPLICIT USER ACTION: Request Camera & Microphone Permissions
  // =========================================================================
  const handleRequestHardwarePermissions = async () => {
    setIsRequestingPermissions(true);
    setPermissionError(null);
    setPresenceState('CAMERA_INITIALIZING');
    setCameraState('requesting');
    setMicState('requesting');

    try {
      // Combined getUserMedia for video and audio
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      });

      setCameraState('granted');
      setMicState('granted');
      setMediaStream(stream);
      streamRef.current = stream;

      // Start Audio Monitor
      startAudioMonitoring(stream);

      // Attach hardware disconnect listeners (Sections 33 & 34)
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          setCameraState('denied');
          showToast('⚠ Camera connection lost. Please restore camera access.', 'warning');
        };
      });
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          setMicState('denied');
          showToast('⚠ Microphone connection lost. Please restore microphone access.', 'warning');
        };
      });

      // Capture initial verification photo
      let initialSnap = '';
      try {
        const tempVideo = document.createElement('video');
        tempVideo.muted = true;
        tempVideo.playsInline = true;
        tempVideo.srcObject = stream;
        await tempVideo.play().catch(() => {});
        await new Promise((r) => setTimeout(r, 400));
        const canvas = document.createElement('canvas');
        canvas.width = tempVideo.videoWidth || 640;
        canvas.height = tempVideo.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
          initialSnap = canvas.toDataURL('image/jpeg', 0.85);
          setVerificationSnapshot(initialSnap);
        }
      } catch (e) {
        console.warn('Initial photo snapshot note:', e);
      }

      // Initialize authorized proctor session with backend
      const res = await api.authorityProctor.startSession({
        workspace_type: workspaceType,
        exam_id: examId,
        verification_snapshot: initialSnap || undefined,
      });

      setSession(res.session);
      setWarningCount(Number(res.session.warning_count) || 0);
      setEnclaveStarted(true);
      setPresenceState('FACE_DETECTED');
      setSetupModalOpen(false);

      showToast('✓ Camera & microphone authenticated', 'success');
    } catch (err: any) {
      console.error('getUserMedia failed:', err);
      setPresenceState('CAMERA_PERMISSION_REQUIRED');

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraState('denied');
        setMicState('denied');
        setPermissionError({
          type: 'PERMISSION_DENIED',
          title: 'Camera & Microphone Access Required',
          message: 'Permission was declined or blocked. Click the camera/padlock icon in your browser address bar and select Allow.',
          actionLabel: 'Try Again',
        });
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraState('not_found');
        setMicState('not_found');
        setPermissionError({
          type: 'NOT_FOUND',
          title: 'Camera or Microphone Not Detected',
          message: 'No working camera or microphone was detected on this workstation. Please attach a device.',
          actionLabel: 'Retry',
        });
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraState('busy');
        setMicState('busy');
        setPermissionError({
          type: 'BUSY',
          title: 'Hardware Currently In Use',
          message: 'The camera or microphone is in use by another application (e.g. Teams, Zoom, or another tab). Close other applications and retry.',
          actionLabel: 'Retry',
        });
      } else {
        setCameraState('error');
        setMicState('error');
        setPermissionError({
          type: 'UNKNOWN',
          title: 'Device Connection Issue',
          message: err.message || 'An error occurred while connecting to the camera/microphone.',
          actionLabel: 'Retry',
        });
      }
    } finally {
      setIsRequestingPermissions(false);
    }
  };

  // =========================================================================
  // 3. WARNING DISPATCHER (Strictly Max 3 Warnings)
  // =========================================================================
  const issueProctorWarning = async (reason: string, eventType: string = 'SUSPICIOUS_ACTIVITY') => {
    if (!session) return;
    const now = Date.now();
    if (now - lastWarningTimeRef.current < 4000) return;
    lastWarningTimeRef.current = now;

    const violationSnap = takeSnapshot();

    try {
      const res = await api.authorityProctor.issueWarning({
        session_id: session.id,
        reason,
        details: {
          event_type: eventType,
          snapshot: violationSnap || undefined,
          presence_status: presenceState === 'TEMPORARILY_ABSENT' ? 'ABSENT' : isShoulderSurfing ? 'SHOULDER_SURFING_DETECTED' : 'PRESENT',
        },
      });

      const nextCount = Math.min(3, res.warning_count);
      setWarningCount(nextCount);

      if (nextCount >= 3 || res.is_locked) {
        setIsEmergencyLocked(true);
        setEmergencyReason('Maximum proctoring violation threshold reached (3/3). Session locked under CBI auditor review.');
        setPresenceState('SESSION_LOCKED');
      }
    } catch (err) {
      console.error('Error issuing authority warning:', err);
    }
  };

  // =========================================================================
  // 4. DEBOUNCED FOCUS & WINDOW BLUR MONITOR (>2.5s with Subtle Yellow Warning)
  // =========================================================================
  useEffect(() => {
    if (!enclaveStarted || !session) return;

    const onFocusLoss = () => {
      setIsWindowBlurred(true);
      if (!blurTimerRef.current && !blurWarningFiredRef.current) {
        blurTimerRef.current = setTimeout(() => {
          blurWarningFiredRef.current = true;
          issueProctorWarning('Focus was lost for >2.5 seconds. Tab and application switching is restricted.', 'FOCUS_LOST');
        }, 2800);
      }
    };

    const onFocusRestored = () => {
      setIsWindowBlurred(false);
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      blurWarningFiredRef.current = false;
    };

    const handleVisibility = () => {
      if (document.hidden) onFocusLoss();
      else onFocusRestored();
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
  // 5. CONTINUOUS FACE & PRESENCE DETECTION WITH GENEROUS GRACE PERIOD
  // =========================================================================
  useEffect(() => {
    if (!enclaveStarted || !mediaStream) return;

    let active = true;
    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.paused) {
        setCameraVideoRendering(false);
        return;
      }
      setCameraVideoRendering(true);

      try {
        const result = await detectFacesInVideo(video);
        if (!active) return;
        setFaceResult(result);

        if (result.faceCount >= 1) {
          // Person is present in camera frame!
          const wasAbsent = consecutiveAbsentFrames.current > 18 || presenceState === 'TEMPORARILY_ABSENT';
          consecutiveAbsentFrames.current = 0;

          if (presenceState !== 'SESSION_LOCKED') {
            setPresenceState('FACE_DETECTED');
          }

          if (wasAbsent) {
            lastFaceStateLogged.current = 'NORMAL';
            showToast('✓ Presence verified', 'success');
          }

          // Shoulder surfing check (2+ faces)
          if (result.faceCount >= 2) {
            setIsShoulderSurfing(true);
            if (lastFaceStateLogged.current !== 'SHOULDER_SURFING') {
              lastFaceStateLogged.current = 'SHOULDER_SURFING';
              issueProctorWarning('Secondary person detected viewing confidential screen', 'SHOULDER_SURFING');
            }
          } else {
            setIsShoulderSurfing(false);
          }
        } else {
          // Face temporarily not detected in frame
          consecutiveAbsentFrames.current += 1;
          const frames = consecutiveAbsentFrames.current;

          // 1-3 frames (~2.4s): brief glance, stay normal
          if (frames > 3 && frames <= 18) {
            // 4-18 frames (~3s to 15s): show gentle warning, keep examination visible!
            if (presenceState !== 'SESSION_LOCKED') {
              setPresenceState('PRESENCE_UNCERTAIN');
            }
          } else if (frames > 18) {
            // Sustained continuous absence (>15-20s): temporarily protect materials
            if (presenceState !== 'SESSION_LOCKED') {
              setPresenceState('TEMPORARILY_ABSENT');
            }
            if (lastFaceStateLogged.current !== 'ABSENT') {
              lastFaceStateLogged.current = 'ABSENT';
              issueProctorWarning('Presence check: Official absent from camera view for >15s', 'FACE_ABSENT');
            }
          }
        }
      } catch (err) {
        console.warn('Face detection pass notice:', err);
      }
    }, 850);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enclaveStarted, mediaStream, presenceState]);

  // =========================================================================
  // 6. PERIODIC CAMERA SNAPSHOT EVIDENCE (Every 25 seconds) (Section 21 & 22)
  // =========================================================================
  useEffect(() => {
    if (!enclaveStarted || !session || cameraState !== 'granted') return;
    const SNAPSHOT_INTERVAL_MS = 25 * 1000;

    const snapshotTimer = setInterval(async () => {
      try {
        const snap = takeSnapshot();
        if (snap) {
          await api.authorityProctor.submitCameraEvidence({
            session_id: session.id,
            exam_id: examId,
            image_data_url: snap,
            event_type: 'PERIODIC_SURVEILLANCE_SNAPSHOT',
            presence_status: presenceState === 'TEMPORARILY_ABSENT' ? 'ABSENT' : isShoulderSurfing ? 'SHOULDER_SURFING_DETECTED' : 'PRESENT',
            warning_number: warningCount,
          });
        }
      } catch (err) {
        console.warn('Periodic snapshot notice:', err);
      }
    }, SNAPSHOT_INTERVAL_MS);

    return () => clearInterval(snapshotTimer);
  }, [enclaveStarted, session, cameraState, presenceState, isShoulderSurfing, warningCount, examId]);

  // =========================================================================
  // 7. REAL AUTOMATED VOICE EVIDENCE SAMPLING (Sections 11, 14, 26)
  // =========================================================================
  useEffect(() => {
    if (!enclaveStarted || !session || micState !== 'granted' || !streamRef.current) return;

    let autoRecorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];

    const captureRealVoiceSample = () => {
      if (!streamRef.current || isRecordingVoice) return;
      try {
        const audioTracks = streamRef.current.getAudioTracks();
        if (audioTracks.length === 0) return;
        const audioOnlyStream = new MediaStream(audioTracks);

        chunks = [];
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
        autoRecorder = new MediaRecorder(audioOnlyStream, mime ? { mimeType: mime } : undefined);

        const recordStartTime = Date.now();

        autoRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        autoRecorder.onstop = async () => {
          const recordedDuration = Math.max(1, Math.round((Date.now() - recordStartTime) / 1000));
          const blob = new Blob(chunks, { type: autoRecorder?.mimeType || 'audio/webm' });
          if (blob.size < 50) return;
          const reader = new FileReader();
          reader.onloadend = async () => {
            const dataUrl = reader.result as string;
            if (dataUrl && session?.id) {
              try {
                await api.authorityProctor.submitVoiceEvidence({
                  session_id: session.id,
                  exam_id: examId,
                  audio_data_url: dataUrl,
                  duration_seconds: recordedDuration,
                  file_size_bytes: blob.size,
                  mime_type: blob.type || 'audio/webm',
                  warning_number: warningCount,
                });
                setVoiceSubmittedNotice(`Voice Evidence Sample Secured (${new Date().toLocaleTimeString()})`);
                setTimeout(() => setVoiceSubmittedNotice(null), 4000);
              } catch (err) {
                console.warn('Voice evidence auto-submission notice:', err);
              }
            }
          };
          reader.readAsDataURL(blob);
        };

        autoRecorder.start();
        setIsRecordingVoice(true);

        setTimeout(() => {
          if (autoRecorder && autoRecorder.state === 'recording') {
            try { autoRecorder.stop(); } catch {}
          }
          setIsRecordingVoice(false);
        }, 8000);
      } catch (err) {
        console.warn('Voice recorder notice:', err);
      }
    };

    // First voice sample after 4 seconds of entering enclave
    const initialVoiceTimer = setTimeout(captureRealVoiceSample, 4000);

    // Continuous voice surveillance clips every 24 seconds
    const periodicVoiceTimer = setInterval(captureRealVoiceSample, 24000);

    return () => {
      clearTimeout(initialVoiceTimer);
      clearInterval(periodicVoiceTimer);
      if (autoRecorder && autoRecorder.state === 'recording') {
        try { autoRecorder.stop(); } catch {}
      }
    };
  }, [enclaveStarted, session, micState, warningCount, examId]);

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
            : presenceState === 'TEMPORARILY_ABSENT'
            ? 'ABSENT'
            : 'VERIFIED',
          faces_detected_count: faceResult.faceCount,
          audio_level_db: audioLevelDb,
        });

        if (hb.emergency_locked) {
          setIsEmergencyLocked(true);
          setEmergencyReason(hb.emergency_lock_reason || 'Administrative Lockdown by Auditor');
          setPresenceState('SESSION_LOCKED');
        }

        if (hb.warning_count !== undefined && hb.warning_count > warningCount) {
          setWarningCount(Math.min(3, hb.warning_count));
        }
      } catch (err) {
        console.warn('Heartbeat check notice:', err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [enclaveStarted, session, cameraState, micState, isShoulderSurfing, presenceState, faceResult, audioLevelDb, warningCount]);

  // =========================================================================
  // 9. DRAGGABLE FLOATING CAMERA WINDOW HANDLERS (Sections 5 & 6)
  // =========================================================================
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDraggingRef.current = true;
    dragStartOffsetRef.current = {
      x: e.clientX - cameraPos.x,
      y: e.clientY - cameraPos.y,
    };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const panelWidth = isMinimized ? 220 : 330;
    const panelHeight = isMinimized ? 50 : 250;
    const maxX = Math.max(16, window.innerWidth - panelWidth - 16);
    const maxY = Math.max(16, window.innerHeight - panelHeight - 16);

    const newX = Math.max(16, Math.min(maxX, e.clientX - dragStartOffsetRef.current.x));
    const newY = Math.max(16, Math.min(maxY, e.clientY - dragStartOffsetRef.current.y));

    setCameraPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      sessionStorage.setItem('zeroleak_camera_pos', JSON.stringify(cameraPos));
    }
  };

  // =========================================================================
  // MAIN RENDER: CLEAN TRANSLATOR WORKSPACE + FLOATING CAMERA + MODALS
  // =========================================================================
  return (
    <div className="relative min-h-screen text-[#142B38]">
      {/* ======================================================== */}
      {/* 1. TOP YELLOW FOCUS WARNING BANNER (Section 17 & 18)      */}
      {/* ======================================================== */}
      {isWindowBlurred && (
        <div
          role="alert"
          className="fixed top-0 left-0 right-0 z-40 px-4 py-2.5 text-center text-xs font-semibold flex items-center justify-center gap-2 shadow-xs animate-in slide-in-from-top duration-200"
          style={{
            backgroundColor: '#FFF7D6',
            borderColor: '#F4C542',
            color: '#8A5A00',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#8A5A00]" />
          <span>
            <strong>⚠ PLEASE REMAIN FOCUSED:</strong> Keep the examination window active. Navigating away or application switching is prohibited.
          </span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. TOP YELLOW PRESENCE WARNING BANNER (Section 19)       */}
      {/* ======================================================== */}
      {presenceState === 'PRESENCE_UNCERTAIN' && !isWindowBlurred && (
        <div
          role="alert"
          className="fixed top-0 left-0 right-0 z-40 px-4 py-2.5 text-center text-xs font-semibold flex items-center justify-center gap-2 shadow-xs animate-in slide-in-from-top duration-200"
          style={{
            backgroundColor: '#FFF7D6',
            borderColor: '#F4C542',
            color: '#8A5A00',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
          }}
        >
          <Eye className="w-4 h-4 shrink-0 text-[#8A5A00]" />
          <span>
            <strong>⚠ CAMERA PRESENCE CHECK:</strong> Please remain visible to the camera.
          </span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. PRIMARY TRANSLATOR WORKSPACE (RENDERED NORMALLY)      */}
      {/* ======================================================== */}
      <div className={`w-full transition-all duration-200 ${isWindowBlurred || presenceState === 'PRESENCE_UNCERTAIN' ? 'pt-10' : ''}`}>
        {children}
      </div>

      {/* ======================================================== */}
      {/* 4. MOVABLE FLOATING RECTANGULAR CAMERA WINDOW (Sec 5, 6) */}
      {/* ======================================================== */}
      {enclaveStarted && mediaStream && (
        <div
          style={{
            position: 'fixed',
            left: `${cameraPos.x}px`,
            top: `${cameraPos.y}px`,
            width: isMinimized ? '220px' : '330px',
            zIndex: 60,
          }}
          className="select-none shadow-[0_16px_40px_rgba(20,43,56,0.18)]"
        >
          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-lg flex flex-col">
            {/* Draggable Header */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="px-3.5 py-2.5 bg-slate-50/95 border-b border-slate-200/80 flex items-center justify-between cursor-grab active:cursor-grabbing shrink-0"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-800 tracking-tight">
                  LIVE CAMERA
                </span>
                {isRecordingVoice && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                    REC
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {/* Minimize Button */}
                <button
                  type="button"
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title={isMinimized ? 'Expand Camera Preview' : 'Minimize Camera Window'}
                >
                  {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <span className="font-bold text-sm leading-none px-0.5">−</span>}
                </button>

                {/* Close Button (Shows Mandatory Monitoring Notice) */}
                <button
                  type="button"
                  onClick={() => setShowMandatoryNotice(true)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close Camera"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Expanded Body: Video Preview & Status Strip */}
            {!isMinimized ? (
              <>
                <div className="relative aspect-[4/3] w-full bg-slate-900 overflow-hidden">
                  <video
                    ref={setVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        videoRef.current.play().catch(() => {});
                        if (videoRef.current.videoWidth > 0) {
                          setCameraVideoRendering(true);
                        }
                      }
                    }}
                    onPlaying={() => setCameraVideoRendering(true)}
                    onPause={() => setCameraVideoRendering(false)}
                    onEnded={() => setCameraVideoRendering(false)}
                    className="w-full h-full object-cover -scale-x-100"
                  />
                  {/* Connecting overlay while video initial frames load */}
                  {!cameraVideoRendering && (
                    <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-slate-300">
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                      <span className="text-[11px] font-medium text-slate-200">Connecting Camera Feed...</span>
                    </div>
                  )}

                  {/* Live Quality Tag */}
                  <div className="absolute top-2 left-2 pointer-events-none">
                    <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-emerald-400 text-[10px] font-mono font-bold flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${cameraVideoRendering ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                      720p HD
                    </span>
                  </div>

                  {/* Shoulder Surfing Warning */}
                  {faceResult.faceCount > 1 && (
                    <div className="absolute bottom-2 left-2 right-2 bg-rose-600/90 text-white text-[10px] font-bold px-2 py-1 rounded text-center shadow-xs">
                      ⚠ MULTIPLE FACES DETECTED
                    </div>
                  )}
                </div>

                {/* Status Strip (Section 16) */}
                <div className="p-3 bg-white space-y-1.5 text-[11px] border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <span className={`w-2 h-2 rounded-full ${cameraVideoRendering ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                      <span>{cameraVideoRendering ? 'Camera Active' : 'Camera Initializing...'}</span>
                    </div>
                    <span className="text-slate-400 font-mono text-[10px]">
                      {cameraVideoRendering ? 'Connected' : 'Syncing'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span>Microphone Active</span>
                    </div>
                    <span className="text-slate-500 font-mono text-[10px]">
                      {micState === 'granted' ? `${audioLevelDb} dB` : 'Off'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${presenceState === 'FACE_DETECTED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className={`font-semibold ${presenceState === 'FACE_DETECTED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {presenceState === 'FACE_DETECTED' ? '✓ Presence Verified' : '⚠ Presence Check'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {faceResult.faceCount === 1 ? '1 Face' : `${faceResult.faceCount} Faces`}
                    </span>
                  </div>

                  {voiceSubmittedNotice && (
                    <div className="text-[10px] font-mono text-emerald-700 bg-emerald-50 p-1 rounded text-center border border-emerald-200">
                      {voiceSubmittedNotice}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Minimized Compact View (Section 32) */
              <div
                onClick={() => setIsMinimized(false)}
                className="px-3.5 py-2.5 bg-white hover:bg-slate-50 flex items-center justify-between text-xs cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${cameraVideoRendering ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="font-semibold text-slate-800 text-[11px]">
                    {cameraVideoRendering ? 'Camera Active' : 'Camera Initializing...'}
                  </span>
                </div>
                <span className="text-emerald-700 font-bold text-[10px]">✓ Verified</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MANDATORY CAMERA NOTICE MODAL (Section 7)              */}
      {/* ======================================================== */}
      {showMandatoryNotice && (
        <div className="fixed inset-0 z-[70] bg-slate-900/25 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200/90 w-full max-w-sm p-6 text-slate-800 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Camera Monitoring Required
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Camera surveillance is mandatory for this secure examination enclave to ensure zero question paper leakage. Proctoring cannot be stopped during an active session.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMandatoryNotice(false)}
              className="w-full py-2.5 rounded-xl text-white font-bold text-xs shadow-xs cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #00A878, #00C98B)' }}
            >
              Keep Camera Active
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. WHITE PERMISSION REQUEST MODAL AT LOGIN (Section 9)   */}
      {/* ======================================================== */}
      {setupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200/90 w-full max-w-md p-6 sm:p-7 shadow-2xl space-y-5 text-slate-800 animate-in zoom-in-95">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 block">
                ZeroLeak Secure Session
              </span>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Camera &amp; Microphone Required
              </h3>
              <p className="text-xs text-slate-500">
                Authorized presence verification and acoustic surveillance are required for this confidential examination session.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {/* Camera Info Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60 shrink-0">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Camera</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Used for authorized presence verification and leak prevention during translation.
                  </p>
                </div>
              </div>

              {/* Microphone Info Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200/60 shrink-0">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Microphone</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Used for authorized acoustic surveillance and voice evidence pipeline.
                  </p>
                </div>
              </div>
            </div>

            {permissionError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{permissionError.title}</span>
                </div>
                <p className="text-[11px] text-rose-600">{permissionError.message}</p>
              </div>
            )}

            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                onClick={handleRequestHardwarePermissions}
                disabled={isRequestingPermissions}
                className="w-full py-3 rounded-xl text-white font-bold text-sm shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-75"
                style={{ background: 'linear-gradient(135deg, #00A878, #00C98B)' }}
              >
                {isRequestingPermissions ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Connecting Sensors...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-white" />
                    <span>Enable Camera &amp; Microphone</span>
                  </>
                )}
              </button>
              <p className="text-center text-[11px] text-slate-400">
                Your browser will ask for camera and microphone permission.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. TEMPORARY ABSENCE MASK (ONLY WHEN ABSENT > 18s) (Sec 43)*/}
      {/* ======================================================== */}
      {presenceState === 'TEMPORARILY_ABSENT' && (
        <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-[#142B38] animate-in fade-in duration-200 select-none">
          <div className="p-4 rounded-3xl bg-[#FFF7D6] border-2 border-[#F4C542] text-[#8A5A00] mb-4 shadow-lg">
            <EyeOff className="w-12 h-12 text-[#F0A11A]" />
          </div>
          <h2 className="text-2xl font-bold text-[#142B38] tracking-tight">
            ⚠ Please Return to Camera
          </h2>
          <p className="text-[#8A5A00] text-sm font-semibold mt-1">
            Examination material is temporarily protected while your presence is verified.
          </p>
          <p className="text-slate-500 text-xs max-w-md mt-2 leading-relaxed">
            To prevent question paper leaks to unauthorized persons or passers-by, materials are masked while the official is away from the workstation.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F6FAF9] border border-[#DCE7EA] text-xs font-mono text-[#142B38] shadow-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00A878] animate-ping" />
            ● Monitoring Camera for Official's Return...
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 8. SHOULDER SURFING ALERT                                */}
      {/* ======================================================== */}
      {isShoulderSurfing && (
        <div className="fixed inset-0 z-50 bg-[#FFF1F3]/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-[#142B38] animate-in fade-in select-none">
          <div className="p-4 rounded-3xl bg-rose-100 border-2 border-[#E84B5F] text-[#E84B5F] mb-4 shadow-xl">
            <Users className="w-14 h-14" />
          </div>
          <h2 className="text-2xl font-extrabold text-[#142B38] tracking-tight">
            LEAK PREVENTION ALERT: SECONDARY PERSON DETECTED
          </h2>
          <p className="text-rose-700 text-sm font-bold mt-1">
            Shoulder Surfing / Unauthorized Person in Camera Field
          </p>
          <p className="text-[#65777F] text-xs max-w-lg mt-2 bg-white p-3.5 rounded-xl border border-rose-200">
            A secondary person was detected in your webcam view. The question paper has been temporarily masked. Ensure complete physical privacy before continuing.
          </p>
        </div>
      )}

      {/* ======================================================== */}
      {/* 9. EMERGENCY LOCKDOWN SCREEN                             */}
      {/* ======================================================== */}
      {isEmergencyLocked && (
        <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-[#142B38] animate-in fade-in select-none">
          <div className="p-5 rounded-3xl bg-rose-100 border-2 border-[#E84B5F] text-[#E84B5F] mb-4 shadow-2xl animate-pulse">
            <Lock className="w-14 h-14" />
          </div>
          <h2 className="text-2xl font-extrabold text-[#142B38] tracking-tight">
            TERMINAL SCREEN LOCKDOWN EXECUTED
          </h2>
          <p className="text-rose-700 text-sm font-bold mt-1 max-w-md">
            {emergencyReason || 'Administrative remote blackout executed by CBI Chief Vigilance Auditor.'}
          </p>
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 max-w-md">
            This examination terminal has been locked to prevent unauthorized disclosure. Contact your Examination Controller or CBI Chief Vigilance Auditor to request case clearance.
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-5 right-5 z-[80] px-4 py-3 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-3 duration-200 ${
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
    </div>
  );
};
