import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Mic,
  UserCheck,
  Users,
  ShieldCheck,
  Maximize,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Eye,
  CameraOff,
  MicOff,
  Sparkles,
} from 'lucide-react';
import { detectFacesInVideo, FaceDetectionResult } from '../../utils/faceDetection';
import { ProctorCandidateExam } from '../../types';

interface PreExamCheckProps {
  exam: ProctorCandidateExam;
  candidateName: string;
  candidateId: string;
  onChecksPassed: (data: {
    stream: MediaStream;
    verificationSnapshot: string;
  }) => void;
  onCancel: () => void;
}

export const ProctorPreExamCheck: React.FC<PreExamCheckProps> = ({
  exam,
  candidateName,
  candidateId,
  onChecksPassed,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const checkIntervalRef = useRef<any>(null);

  const [cameraGranted, setCameraGranted] = useState<boolean | null>(null);
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const [browserCompatible, setBrowserCompatible] = useState<boolean>(true);
  const [fullscreenAvailable, setFullscreenAvailable] = useState<boolean>(true);
  const [faceResult, setFaceResult] = useState<FaceDetectionResult>({
    faceCount: 0,
    status: 'NO_FACE',
    lookingDirection: 'AWAY',
    confidence: 0,
  });

  const [snapshotData, setSnapshotData] = useState<string | null>(null);
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    initHardware();
    return () => {
      cleanupStream();
    };
  }, []);

  const cleanupStream = () => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const initHardware = async () => {
    setInitializing(true);
    setErrorMessage(null);
    cleanupStream();

    // Check browser compatibility
    const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasFullscreen = !!(document.fullscreenEnabled || (document.documentElement as any).requestFullscreen);
    const hasVisibility = typeof document.visibilityState !== 'undefined';
    const compat = hasMedia && hasFullscreen && hasVisibility;
    setBrowserCompatible(compat);
    setFullscreenAvailable(hasFullscreen);

    if (!hasMedia) {
      setErrorMessage('Your browser or operating system does not support modern WebRTC media devices.');
      setInitializing(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      });

      streamRef.current = stream;
      setCameraGranted(true);
      setMicGranted(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Start continuous face detection loop
      checkIntervalRef.current = setInterval(async () => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          const res = await detectFacesInVideo(videoRef.current);
          setFaceResult(res);
        }
      }, 750);
    } catch (err: any) {
      console.warn('Hardware permission error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Camera and microphone permissions were denied. Please grant permission in your browser address bar to proceed.');
        setCameraGranted(false);
        setMicGranted(false);
      } else if (err.name === 'NotFoundError') {
        setErrorMessage('No camera or microphone device was found on this system. Please connect hardware to continue.');
      } else {
        setErrorMessage(`Hardware access error: ${err.message || 'Unable to start camera or microphone'}`);
      }
    } finally {
      setInitializing(false);
    }
  };

  const takeSnapshot = () => {
    if (!videoRef.current || videoRef.current.readyState < 2) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        // Add watermark timestamp to image
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(0, 210, 320, 30);
        ctx.fillStyle = '#10b981';
        ctx.font = '10px monospace';
        ctx.fillText(`ZEROLEAK PROCTOR • ${new Date().toLocaleTimeString()} • ${candidateId}`, 8, 228);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setSnapshotData(dataUrl);
      }
    } catch (e) {
      console.error('Snapshot capture failed:', e);
    }
  };

  const isFaceDetected = faceResult.status === 'NORMAL' || faceResult.faceCount === 1;
  const isSingleFace = faceResult.faceCount === 1;
  const allChecksPassed =
    cameraGranted === true &&
    micGranted === true &&
    browserCompatible &&
    fullscreenAvailable &&
    isFaceDetected &&
    isSingleFace &&
    !!snapshotData &&
    consentAgreed;

  const handleStartExam = () => {
    if (!allChecksPassed || !streamRef.current || !snapshotData) return;
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    onChecksPassed({
      stream: streamRef.current,
      verificationSnapshot: snapshotData,
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-semibold mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>ZeroLeak Automated Proctoring Protocol</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-serif">
            Pre-Exam Security & Environment Verification
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Exam: <strong className="text-slate-800 dark:text-slate-200">{exam.name}</strong> ({exam.subject}) • Candidate: <strong className="text-slate-800 dark:text-slate-200">{candidateName}</strong> ({candidateId})
          </p>
        </div>

        <button
          onClick={onCancel}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline self-start md:self-auto"
        >
          Exit to Portal
        </button>
      </div>

      {/* Main Grid: Video Stream + Diagnostic Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column: Camera Viewport & Snapshot */}
        <div className="md:col-span-7 space-y-4">
          <div className="bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-lg relative aspect-video flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />

            {/* Bounding Box Overlay for Face */}
            {isSingleFace && faceResult.box && (
              <div
                className="absolute border-2 border-emerald-400 bg-emerald-500/10 rounded-lg pointer-events-none transition-all duration-300"
                style={{
                  top: `${faceResult.box.y}%`,
                  right: `${faceResult.box.x}%`, // Mirrored
                  width: `${faceResult.box.width}%`,
                  height: `${faceResult.box.height}%`,
                }}
              >
                <span className="absolute -top-5 left-0 bg-emerald-600 text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow">
                  1 FACE VERIFIED
                </span>
              </div>
            )}

            {faceResult.status === 'MULTIPLE_FACES' && (
              <div className="absolute inset-0 bg-rose-950/40 border-2 border-rose-500 flex items-center justify-center p-4">
                <div className="bg-rose-900/90 text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg">
                  <Users className="w-4 h-4 text-rose-300" />
                  <span>Multiple faces detected! Please ensure you are alone.</span>
                </div>
              </div>
            )}

            {faceResult.status === 'NO_FACE' && cameraGranted && (
              <div className="absolute bottom-3 left-3 bg-amber-900/90 text-amber-200 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 backdrop-blur-sm shadow">
                <Eye className="w-3.5 h-3.5" />
                <span>Please position your face clearly inside the frame</span>
              </div>
            )}

            {cameraGranted === false && (
              <div className="text-center p-6 text-slate-400 space-y-2">
                <CameraOff className="w-10 h-10 text-rose-500 mx-auto" />
                <p className="text-sm font-medium text-white">Camera Access Required</p>
                <p className="text-xs max-w-xs mx-auto">Please allow camera permissions in your browser settings to proceed with this exam.</p>
              </div>
            )}

            {/* Live Telemetry Pill */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 backdrop-blur-md ${
                isSingleFace
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                  : faceResult.faceCount > 1
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-700'
                  : 'bg-amber-950/80 text-amber-300 border border-amber-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isSingleFace ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {isSingleFace ? 'Candidate Detected' : faceResult.faceCount > 1 ? 'Multiple Faces' : 'Searching for Face...'}
              </span>
            </div>
          </div>

          {/* Identity Snapshot Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {snapshotData ? (
                <img
                  src={snapshotData}
                  alt="Candidate Snapshot"
                  className="w-16 h-12 object-cover rounded-lg border-2 border-emerald-500"
                />
              ) : (
                <div className="w-16 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-slate-400" />
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Identity Verification Snapshot
                </p>
                <p className="text-[11px] text-slate-500">
                  {snapshotData
                    ? 'Snapshot captured & cryptographically tied to attempt.'
                    : 'Capture your official reference snapshot before beginning.'}
                </p>
              </div>
            </div>

            <button
              onClick={takeSnapshot}
              disabled={!cameraGranted || !isSingleFace}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                isSingleFace
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{snapshotData ? 'Retake Snapshot' : 'Take Snapshot'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Automated Diagnostic Checklist */}
        <div className="md:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Security Readiness Check</span>
            </h2>

            <div className="space-y-2.5 text-xs">
              {/* Camera */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center gap-2.5">
                  <Camera className="w-4 h-4 text-slate-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Camera Permission</span>
                </div>
                {cameraGranted ? (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-rose-500">
                    <AlertCircle className="w-4 h-4" /> Denied / Error
                  </span>
                )}
              </div>

              {/* Microphone */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center gap-2.5">
                  <Mic className="w-4 h-4 text-slate-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Microphone Audio Feed</span>
                </div>
                {micGranted ? (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-rose-500">
                    <AlertCircle className="w-4 h-4" /> Denied / Error
                  </span>
                )}
              </div>

              {/* Face Detection */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 text-slate-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Face Verification</span>
                </div>
                {isFaceDetected ? (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> Detected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-amber-500">
                    <AlertCircle className="w-4 h-4" /> Not In View
                  </span>
                )}
              </div>

              {/* Exactly One Face */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-slate-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Single Candidate Presence</span>
                </div>
                {faceResult.faceCount === 1 ? (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> 1 Person
                  </span>
                ) : faceResult.faceCount > 1 ? (
                  <span className="inline-flex items-center gap-1 font-bold text-rose-500">
                    <AlertCircle className="w-4 h-4" /> Multiple Faces ({faceResult.faceCount})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-slate-400">
                    Waiting...
                  </span>
                )}
              </div>

              {/* Fullscreen & Browser */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center gap-2.5">
                  <Maximize className="w-4 h-4 text-slate-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Fullscreen & Visibility API</span>
                </div>
                {fullscreenAvailable && browserCompatible ? (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> Supported
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-rose-500">
                    <AlertCircle className="w-4 h-4" /> Unsupported
                  </span>
                )}
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Hardware Diagnostics Notice</p>
                  <p className="text-[11px] mt-0.5">{errorMessage}</p>
                </div>
                <button
                  onClick={initHardware}
                  className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Privacy & Monitoring Consent */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
              <p className="font-bold text-slate-900 dark:text-white">Proctoring Telemetry Consent:</p>
              <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                <li>Camera feed is monitored locally for face presence and absence.</li>
                <li>Microphone levels are analyzed for continuous speech/noise anomalies.</li>
                <li>Fullscreen exits and window switches are logged for human proctor review.</li>
                <li>Telemetric evidence is reviewed by the exam board, not automatically penalized.</li>
              </ul>
              <label className="flex items-center gap-2 pt-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentAgreed}
                  onChange={e => setConsentAgreed(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                  I understand and consent to automated proctoring telemetry
                </span>
              </label>
            </div>

            {/* Launch Exam Button */}
            <button
              onClick={handleStartExam}
              disabled={!allChecksPassed}
              className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
                allChecksPassed
                  ? 'bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white hover:from-emerald-700 hover:to-teal-600 hover:shadow-lg hover:-translate-y-0.5'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
              }`}
            >
              <Maximize className="w-4 h-4" />
              <span>
                {!snapshotData
                  ? 'Step 1: Take Verification Snapshot'
                  : !consentAgreed
                  ? 'Step 2: Sign Proctoring Consent'
                  : !isSingleFace
                  ? 'Ensure 1 Face Visible'
                  : 'Enter Fullscreen & Start Examination'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

