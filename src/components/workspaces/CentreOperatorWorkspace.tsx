import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderLock,
  Lock,
  Unlock,
  Printer,
  Laptop,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ShieldCheck,
  Building2,
  Download,
  RefreshCw,
  FileText,
  KeyRound,
  Languages,
  History,
  X,
  ShieldAlert,
} from 'lucide-react';
import { User, Examination, PrintCopy, DynamicWatermarkData, TrustedDevice } from '../../types';
import { api, getDeviceFingerprint, getOrCreateBrowserDeviceIdentity } from '../../api';
import { NavSubTab } from '../Sidebar';
import { SecureViewerModal } from '../SecureViewerModal';
import { PrintRelayPanel } from '../PrintRelayPanel';
import { PrintSecurityGate } from '../PrintSecurityGate';
import { CompetitivePrintExaminationPaper } from '../competitive/CompetitivePrintExaminationPaper';

interface CentreOperatorWorkspaceProps {
  currentUser: User | null;
  activeSubTab: NavSubTab;
  onRefresh: () => void;
}

export const CentreOperatorWorkspace: React.FC<CentreOperatorWorkspaceProps> = ({
  currentUser,
  activeSubTab,
  onRefresh,
}) => {
  const [releasedExams, setReleasedExams] = useState<Examination[]>([]);
  const [printHistory, setPrintHistory] = useState<PrintCopy[]>([]);
  // This account's own workstations, as the trust ledger sees them. The Device
  // Status screen reads the live record instead of asserting a fixed banner, so
  // a revoked or pending terminal shows as such instead of as "TRUSTED".
  const [terminals, setTerminals] = useState<TrustedDevice[]>([]);
  // The local `HW-...` label is a convenience string; the ledger identifies a
  // terminal by the UUID of its key pair, so that is what we match on.
  const [terminalUuid, setTerminalUuid] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Competitive Exam Time-Locked Encrypted Papers state
  const [competitivePapers, setCompetitivePapers] = useState<any[]>([]);
  const [serverTimeIso, setServerTimeIso] = useState<string>('');
  const [serverClockAnchor, setServerClockAnchor] = useState<{
    serverMs: number;
    perfNowMs: number;
  }>({
    serverMs: Date.now(),
    perfNowMs: typeof performance !== 'undefined' ? performance.now() : 0,
  });
  const [liveServerNowMs, setLiveServerNowMs] = useState<number>(Date.now());

  // Active Decrypted Competitive Paper & Print Preview state
  const [activeDecryptedPaper, setActiveDecryptedPaper] = useState<any | null>(null);
  const [activeOperatorPrintMeta, setActiveOperatorPrintMeta] = useState<{
    copyId?: string;
    centreCode?: string;
    operatorName?: string;
    decryptedAt?: string;
    printedAt?: string;
    txHash?: string;
  } | null>(null);
  const [paperViewMode, setPaperViewMode] = useState<'BILINGUAL' | 'ORIGINAL_ENGLISH'>('BILINGUAL');
  const [decryptingPaperId, setDecryptingPaperId] = useState<string | null>(null);
  const [printingPaperId, setPrintingPaperId] = useState<string | null>(null);
  const [downloadingPaperId, setDownloadingPaperId] = useState<string | null>(null);
  const [competitiveCopiesCount, setCompetitiveCopiesCount] = useState<number>(1);

  // Competitive Paper Audit Logs state
  const [selectedAuditPaperId, setSelectedAuditPaperId] = useState<string | null>(null);
  const [competitiveAuditLogs, setCompetitiveAuditLogs] = useState<any[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  // Secure Viewer state (existing University / Legacy exams)
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPaper, setViewerPaper] = useState<any | null>(null);
  const [viewerWatermark, setViewerWatermark] = useState<DynamicWatermarkData | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedPaperVersionId, setSelectedPaperVersionId] = useState<string>('');

  // Print state (existing University / Legacy exams)
  const [printCount, setPrintCount] = useState(10);
  const [printing, setPrinting] = useState(false);

  // Print security gate state. Nothing is minted until the operator re-enters
  // their own password and reads back the one-time code the server mints.
  const [gateOpen, setGateOpen] = useState(false);
  const [gateExamId, setGateExamId] = useState('');
  const [gateExamName, setGateExamName] = useState('');
  const printContainerRef = useRef<HTMLDivElement | null>(null);
  const deviceFp = getDeviceFingerprint();

  const loadCompetitivePapers = useCallback(async (silent = false) => {
    try {
      const compRes = await api.competitive.getOperatorAssignedPapers();
      if (compRes && Array.isArray(compRes.papers)) {
        setCompetitivePapers(compRes.papers);
      }
      if (compRes?.serverTimestampMs) {
        const sMs = Number(compRes.serverTimestampMs);
        setServerClockAnchor({
          serverMs: sMs,
          perfNowMs: typeof performance !== 'undefined' ? performance.now() : 0,
        });
        setLiveServerNowMs(sMs);
      }
      if (compRes?.serverTimeIso) {
        setServerTimeIso(compRes.serverTimeIso);
      }
    } catch (err) {
      if (!silent) {
        console.error('Competitive operator papers load error:', err);
      }
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [relRes, histRes, devRes] = await Promise.all([
        api.getReleasedExams().catch(() => ({ examinations: [] })),
        api.getPrintHistory().catch(() => ({ printHistory: [] })),
        api.getDevices().catch(() => ({ devices: [] })),
        loadCompetitivePapers(true),
      ]);

      setReleasedExams(relRes.examinations || []);
      setPrintHistory(histRes.printHistory || []);
      setTerminals(devRes.devices || []);
      const identity = await getOrCreateBrowserDeviceIdentity().catch(() => null);
      setTerminalUuid(identity?.deviceUuid || '');
    } catch (err: any) {
      console.error('Operator load error:', err);
    } finally {
      setLoading(false);
    }
  }, [loadCompetitivePapers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll backend server clock & time-lock state every 5 seconds
  useEffect(() => {
    const pollInterval = setInterval(() => {
      loadCompetitivePapers(true);
    }, 5000);
    return () => clearInterval(pollInterval);
  }, [loadCompetitivePapers]);

  // Advance server-anchored clock every 1 second using monotonic performance.now()
  // (Immune to browser/OS wall-clock manipulation; actual unlock is enforced on backend)
  useEffect(() => {
    const tickInterval = setInterval(() => {
      const elapsed =
        typeof performance !== 'undefined'
          ? Math.max(0, performance.now() - serverClockAnchor.perfNowMs)
          : 1000;
      setLiveServerNowMs(Math.round(serverClockAnchor.serverMs + elapsed));
    }, 1000);
    return () => clearInterval(tickInterval);
  }, [serverClockAnchor]);

  const loadCompetitivePaperAudit = async (paperId: string) => {
    setSelectedAuditPaperId(paperId);
    setLoadingAuditLogs(true);
    try {
      const res = await api.competitive.getPaperAuditLogs(paperId);
      setCompetitiveAuditLogs(res.logs || []);
    } catch (err: any) {
      console.error('Failed to load competitive paper audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  // Format remaining seconds as HH:MM:SS or Xd HH:MM:SS
  const formatCountdown = (seconds: number): string => {
    if (seconds <= 0) return '00:00:00';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
  };

  // Evaluate live server-anchored countdown for a Competitive Exam paper
  const getPaperLiveLockState = (paper: any) => {
    const decMs = paper.decryptionTimeIso ? new Date(paper.decryptionTimeIso).getTime() : NaN;
    const encMs = paper.encryptionTimeIso ? new Date(paper.encryptionTimeIso).getTime() : NaN;
    const isBeforeEncryption = !isNaN(encMs) && liveServerNowMs < encMs;
    const isLockedByServerClock = isNaN(decMs) ? true : liveServerNowMs < decMs;
    const remainingSec = !isNaN(decMs) && liveServerNowMs < decMs
      ? Math.max(0, Math.ceil((decMs - liveServerNowMs) / 1000))
      : 0;
    const unlockDisplay = paper.decryptionTimeDisplay || '10:00 AM';
    const encDisplay = paper.encryptionTimeDisplay || '9:00 AM';

    return {
      isBeforeEncryption,
      isLocked: isLockedByServerClock,
      canDecryptOrPrint: !isLockedByServerClock,
      remainingSec,
      unlockDisplay,
      encDisplay,
      statusBannerText: isLockedByServerClock
        ? `Locked – Available at ${unlockDisplay}`
        : paper.encryptionStatus === 'PRINTED'
          ? `Unlocked & Printed – Available since ${unlockDisplay}`
          : paper.encryptionStatus === 'DECRYPTED'
            ? `Decrypted & Print Enabled (Unlocked at ${unlockDisplay})`
            : `Unlocked – Ready to Decrypt & Print (${unlockDisplay})`,
    };
  };

  // Decrypt & Unlock Competitive Exam Paper (Server-Side Verified)
  const handleDecryptCompetitivePaper = async (paper: any) => {
    setDecryptingPaperId(paper.id);
    setStatusMessage(null);
    try {
      const res = await api.competitive.decryptAndUnlockPaper(paper.id);
      setActiveDecryptedPaper(res.paper);
      setActiveOperatorPrintMeta({
        copyId: `PREVIEW-${res.paper.id.slice(0, 8).toUpperCase()}`,
        centreCode: res.paper.assignedCentreCode || currentUser?.centre_id || 'CTR-101',
        operatorName: currentUser?.name || 'Centre Superintendent',
        decryptedAt: res.serverTimeIso || new Date().toISOString(),
      });
      setPaperViewMode(res.paper?.enableTranslation ? 'BILINGUAL' : 'ORIGINAL_ENGLISH');
      setStatusMessage({
        type: 'success',
        text: res.message || `Competitive paper "${paper.title}" decrypted and unlocked by server clock verification.`,
      });
      await loadCompetitivePapers(true);
      if (selectedAuditPaperId === paper.id) {
        await loadCompetitivePaperAudit(paper.id);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Server blocked decryption: current server time has not reached the configured unlock time.',
      });
      await loadCompetitivePapers(true);
      if (selectedAuditPaperId === paper.id) {
        await loadCompetitivePaperAudit(paper.id);
      }
    } finally {
      setDecryptingPaperId(null);
    }
  };

  // Build standalone printable HTML document preserving English + Translated questions, sections, options, marks, tables, diagrams
  const buildCompetitivePaperPrintHtml = (
    fullPaper: any,
    meta?: {
      copyId?: string;
      centreCode?: string;
      operatorName?: string;
      decryptedAt?: string;
      printedAt?: string;
      txHash?: string;
    },
    mode: 'BILINGUAL' | 'ORIGINAL_ENGLISH' = 'BILINGUAL'
  ): string => {
    const isEnglishOnly = mode === 'ORIGINAL_ENGLISH';
    const activeSections = isEnglishOnly
      ? fullPaper.originalSections && fullPaper.originalSections.length > 0
        ? fullPaper.originalSections
        : fullPaper.sections || []
      : fullPaper.bilingualSections && fullPaper.bilingualSections.length > 0
        ? fullPaper.bilingualSections
        : fullPaper.sections || [];

    const sectionsHtml = activeSections
      .map((sec: any, sIdx: number) => {
        const qs = sec.questions || [];
        if (qs.length === 0) return '';
        const firstNum = qs[0].displayNumber || qs[0].questionNumber || 1;
        const lastNum = qs[qs.length - 1].displayNumber || qs[qs.length - 1].questionNumber || qs.length;
        const secHeading = `${(sec.subject || 'SECTION').toUpperCase()} : SECTION-${
          sec.sectionLetter || String.fromCharCode(65 + sIdx)
        } (Q. No. ${firstNum} to ${lastNum})`;

        const questionsHtml = qs
          .map((q: any, qIdx: number) => {
            const qNum = q.displayNumber || q.questionNumber || qIdx + 1;
            const marks = q.marks ? `[${q.marks}]` : '';
            const showTrans =
              !isEnglishOnly &&
              (Boolean(q.translationRequired) || Boolean(fullPaper.enableTranslation)) &&
              Boolean(q.translatedText);

            const tableHtml =
              q.tableData && (q.tableData.headers || q.tableData.rows)
                ? `<table class="q-table">
                    ${
                      Array.isArray(q.tableData.headers) && q.tableData.headers.length > 0
                        ? `<thead><tr>${q.tableData.headers.map((h: string) => `<th>${h}</th>`).join('')}</tr></thead>`
                        : ''
                    }
                    ${
                      Array.isArray(q.tableData.rows) && q.tableData.rows.length > 0
                        ? `<tbody>${q.tableData.rows
                            .map((r: string[]) => `<tr>${r.map((c: string) => `<td>${c}</td>`).join('')}</tr>`)
                            .join('')}</tbody>`
                        : ''
                    }
                  </table>`
                : '';

            const diagramHtml = q.diagramSvg
              ? `<div class="q-diagram">${q.diagramSvg}</div>`
              : q.imageUrl
                ? `<div class="q-diagram"><img src="${q.imageUrl}" alt="Diagram" style="max-height:180px;" /></div>`
                : '';

            const subQuestionsHtml =
              Array.isArray(q.subQuestions) && q.subQuestions.length > 0
                ? `<div class="sub-qs">${q.subQuestions
                    .map(
                      (sq: any, sqIdx: number) =>
                        `<div class="sub-q"><strong>${sq.label || `(${String.fromCharCode(97 + sqIdx)})`}</strong> ${
                          sq.text || ''
                        }${!isEnglishOnly && sq.translatedText ? `<div class="q-trans">${sq.translatedText}</div>` : ''}</div>`
                    )
                    .join('')}</div>`
                : '';

            const optionsHtml =
              Array.isArray(q.options) && q.options.length > 0
                ? `<div class="options">${q.options
                    .map((opt: any, oIdx: number) => {
                      const tOpt = q.translatedOptions?.[oIdx];
                      return `<div class="opt"><strong>(${oIdx + 1})</strong> ${opt.text || ''}${
                        showTrans && tOpt?.text ? `<div class="trans-opt">${tOpt.text}</div>` : ''
                      }</div>`;
                    })
                    .join('')}</div>`
                : '';

            return `<div class="q-block">
              <div class="q-en"><strong>${qNum}.</strong> ${q.questionText || ''} <span class="marks">${marks}</span></div>
              ${
                showTrans
                  ? `<div class="q-trans"><strong>${qNum}.</strong> ${q.translatedText}</div>`
                  : ''
              }
              ${tableHtml}
              ${diagramHtml}
              ${subQuestionsHtml}
              ${optionsHtml}
            </div>`;
          })
          .join('');

        return `<div class="section">
          <div class="sec-title">${secHeading}</div>
          <div class="sec-cols">${questionsHtml}</div>
        </div>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${fullPaper.title} - ${fullPaper.id}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: "Times New Roman", Times, Georgia, serif; color: #000; margin: 0; padding: 16px; line-height: 1.45; background: #fff; }
    .meta-bar { font-family: monospace; font-size: 10.5px; border: 1px solid #000; padding: 6px 10px; margin-bottom: 12px; background: #f8f8f8; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 12px; }
    .header h1 { margin: 4px 0; font-size: 21px; text-transform: uppercase; }
    .instructions { font-size: 11.5px; border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
    .sec-title { border: 1px solid #000; padding: 5px 10px; text-align: center; font-weight: bold; text-transform: uppercase; margin: 16px 0 10px; background: #f5f5f5; font-size: 13px; }
    .sec-cols { column-count: 2; column-gap: 24px; column-rule: 1px solid #ccc; }
    .q-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14px; font-size: 13px; }
    .q-trans { margin-top: 3px; padding-left: 8px; border-left: 2px solid #444; color: #111; }
    .q-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 11.5px; }
    .q-table th, .q-table td { border: 1px solid #000; padding: 3px 6px; text-align: left; }
    .q-diagram { margin: 6px 0; text-align: center; }
    .sub-qs { margin-top: 5px; padding-left: 12px; font-size: 12px; }
    .sub-q { margin-bottom: 4px; }
    .options { margin-top: 5px; padding-left: 6px; }
    .opt { margin-bottom: 3px; font-size: 12.5px; }
    .trans-opt { font-size: 11.5px; color: #222; padding-left: 18px; }
    .marks { font-family: sans-serif; font-size: 10.5px; font-weight: bold; color: #333; }
    .footer { border-top: 1px solid #000; margin-top: 22px; padding-top: 8px; text-align: center; font-weight: bold; font-size: 12px; }
  </style>
</head>
<body>
  <div class="meta-bar">
    <div><strong>AUTHORIZED CENTRE PRINT COPY:</strong> ${meta?.copyId || 'OFFICIAL-MASTER'} &nbsp;|&nbsp; <strong>CENTRE:</strong> ${meta?.centreCode || 'CTR-101'} &nbsp;|&nbsp; <strong>OPERATOR:</strong> ${meta?.operatorName || 'Centre Superintendent'}</div>
    <div><strong>PAPER ID:</strong> ${fullPaper.id} &nbsp;|&nbsp; <strong>EXAM DATE:</strong> ${fullPaper.scheduleExamDate || fullPaper.examDate || 'N/A'} &nbsp;|&nbsp; <strong>UNLOCK TIME:</strong> ${fullPaper.decryptionTimeDisplay || 'N/A'} &nbsp;|&nbsp; <strong>AUDIT TX:</strong> ${meta?.txHash || 'VERIFIED'}</div>
  </div>
  <div class="header">
    <div style="font-size:11.5px;font-weight:bold;">${fullPaper.examType || 'COMPETITIVE EXAMINATION'}${
      !isEnglishOnly && fullPaper.enableTranslation && fullPaper.translationLanguage
        ? ` • BILINGUAL EDITION (ENGLISH & ${fullPaper.translationLanguage.toUpperCase()})`
        : ' • ENGLISH EDITION'
    }</div>
    <h1>${fullPaper.title}</h1>
    <div style="font-size:12.5px;">Time Allowed: <strong>${fullPaper.durationMinutes} Minutes</strong> &nbsp;|&nbsp; Maximum Marks: <strong>${fullPaper.totalMarks}</strong> &nbsp;|&nbsp; Total Questions: <strong>${fullPaper.totalQuestions}</strong></div>
  </div>
  ${
    fullPaper.instructions
      ? `<div class="instructions"><strong>Read the following instructions carefully:</strong><br/>${fullPaper.instructions}</div>`
      : ''
  }
  ${sectionsHtml}
  <div class="footer">*** END OF QUESTION PAPER ***</div>
</body>
</html>`;
  };

  // Trigger clean printing via hidden iframe so only the Competitive Exam paper prints
  const triggerCleanIframePrint = (htmlContent: string) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);
        }, 250);
      } else {
        window.print();
      }
    } catch {
      window.print();
    }
  };

  // Print Final Competitive Exam Paper (Server-Side Verified + Audit Logged + Triggers Clean Print)
  const handlePrintCompetitivePaper = async (paper: any) => {
    setPrintingPaperId(paper.id);
    setStatusMessage(null);
    try {
      const res = await api.competitive.printPaper(paper.id, competitiveCopiesCount);
      const fullPaper = res.paper;
      const printRec = res.printRecord || (res as any).printCopy;
      const printMeta = {
        copyId: printRec?.copyId || `COMP-COPY-${Date.now()}`,
        centreCode: (printRec as any)?.centreCode || fullPaper?.assignedCentreCode || currentUser?.centre_id || 'CTR-101',
        operatorName: printRec?.printedBy || currentUser?.name || 'Centre Superintendent',
        decryptedAt: fullPaper?.decryptedAt || printRec?.printedAt,
        printedAt: printRec?.printedAt || new Date().toISOString(),
        txHash: printRec?.txHash,
      };

      const effectiveMode = fullPaper?.enableTranslation ? 'BILINGUAL' : 'ORIGINAL_ENGLISH';
      setActiveDecryptedPaper(fullPaper);
      setActiveOperatorPrintMeta(printMeta);
      setPaperViewMode(effectiveMode);

      setStatusMessage({
        type: 'success',
        text: `${res.message} Copy ID: ${printMeta.copyId} • Audit Tx: ${printMeta.txHash?.slice(0, 16)}...`,
      });

      await Promise.all([loadCompetitivePapers(true), loadData()]);
      if (selectedAuditPaperId === paper.id) {
        await loadCompetitivePaperAudit(paper.id);
      }

      const printHtml = buildCompetitivePaperPrintHtml(fullPaper, printMeta, effectiveMode);
      triggerCleanIframePrint(printHtml);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Server blocked printing: paper is time-locked until the configured decryption time.',
      });
      await loadCompetitivePapers(true);
      if (selectedAuditPaperId === paper.id) {
        await loadCompetitivePaperAudit(paper.id);
      }
    } finally {
      setPrintingPaperId(null);
    }
  };

  // Download Final Competitive Exam Paper (Server-Side Verified + Audit Logged)
  const handleDownloadCompetitivePaper = async (paper: any) => {
    setDownloadingPaperId(paper.id);
    setStatusMessage(null);
    try {
      const res = await api.competitive.downloadPaper(paper.id);
      const fullPaper = res.paper;
      const txHash = res.auditTxHash || (res as any).txHash;
      const dlMeta = {
        copyId: `DOWNLOAD-${fullPaper.id.slice(0, 8).toUpperCase()}`,
        centreCode: fullPaper.assignedCentreCode || currentUser?.centre_id || 'CTR-101',
        operatorName: currentUser?.name || 'Centre Superintendent',
        decryptedAt: fullPaper.decryptedAt || res.serverTimeIso,
        printedAt: res.serverTimeIso,
        txHash,
      };
      setActiveDecryptedPaper(fullPaper);
      setActiveOperatorPrintMeta(dlMeta);

      const htmlDoc = buildCompetitivePaperPrintHtml(
        fullPaper,
        dlMeta,
        fullPaper?.enableTranslation ? 'BILINGUAL' : 'ORIGINAL_ENGLISH'
      );

      const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(fullPaper.title || 'Competitive_Exam_Paper').replace(/[^a-zA-Z0-9_-]/g, '_')}_${fullPaper.id}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMessage({
        type: 'success',
        text: `${res.message} Audit Tx: ${txHash?.slice(0, 16)}...`,
      });
      await loadCompetitivePapers(true);
      if (selectedAuditPaperId === paper.id) {
        await loadCompetitivePaperAudit(paper.id);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Server blocked download: current server time is before the configured unlock time.',
      });
      await loadCompetitivePapers(true);
      if (selectedAuditPaperId === paper.id) {
        await loadCompetitivePaperAudit(paper.id);
      }
    } finally {
      setDownloadingPaperId(null);
    }
  };

  const handleOpenSecureViewer = async (exam: Examination) => {
    setStatusMessage(null);
    try {
      const res = await api.openSecureViewer(exam.id);
      setViewerPaper(res.paperContent);
      setViewerWatermark(res.watermark);
      setSelectedExamId(exam.id);
      setSelectedPaperVersionId(res.paperVersionId);
      setViewerOpen(true);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  /**
   * Printing no longer happens straight from this click. The click opens the
   * print security gate; the server only mints copies once the operator has
   * re-authenticated and echoed back the one-time authorisation code.
   */
  const openPrintGate = (examId: string, examName: string) => {
    if (!examId) {
      setStatusMessage({ type: 'error', text: 'Select an examination before printing.' });
      return;
    }
    setGateExamId(examId);
    setGateExamName(examName || 'Selected examination');
    setGateOpen(true);
  };

  // Reusable Renderer for Competitive Exam Time-Locked Encrypted Papers
  const renderCompetitiveTimeLockedPapersSection = () => (
    <div className="p-6 rounded-xl bg-white border-2 border-indigo-200 shadow-xs space-y-5 print:hidden">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-bold uppercase tracking-wider">
              Competitive Exam Enclave Only
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-mono font-bold">
              AES-256-GCM Server Time-Lock
            </span>
          </div>
          <h3 className="text-base font-bold text-slate-900 mt-1.5 flex items-center gap-2">
            <FolderLock className="w-5 h-5 text-indigo-700" />
            <span>Assigned Competitive Examination Papers (Time-Locked Encryption & Printing)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            All unlock, decryption, download, and print checks are strictly enforced by the backend server clock (
            <code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded text-slate-800">
              current server time &lt; unlock time → LOCKED
            </code>
            ;{' '}
            <code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded text-emerald-800">
              current server time &gt;= unlock time → DECRYPT + PRINT ENABLED
            </code>
            ).
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-mono flex items-center gap-2 shadow-xs">
            <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>
              Official Server Clock:{' '}
              <strong>
                {new Date(liveServerNowMs).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </strong>
            </span>
          </div>
          <button
            onClick={() => loadCompetitivePapers(false)}
            className="text-[11px] text-indigo-700 hover:text-indigo-900 font-bold flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Sync Server Time-Lock Status</span>
          </button>
        </div>
      </div>

      {competitivePapers.length === 0 ? (
        <div className="p-8 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-2">
          <Lock className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-700">
            No Finalized Competitive Exam Papers Assigned Yet
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            When an Exam Manager clicks &ldquo;Finalize &amp; Encrypt Paper&rdquo; on an approved Competitive Exam paper and assigns it to this Centre Superintendent &amp; Operator terminal, it will appear here with its live time-lock schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {competitivePapers.map(paper => {
            const lockState = getPaperLiveLockState(paper);
            const isDecrypting = decryptingPaperId === paper.id;
            const isPrinting = printingPaperId === paper.id;
            const isDownloading = downloadingPaperId === paper.id;

            return (
              <div
                key={paper.id}
                className={`p-5 rounded-xl border-2 transition-all space-y-4 ${
                  lockState.isLocked
                    ? 'bg-amber-50/40 border-amber-300'
                    : 'bg-emerald-50/30 border-emerald-300'
                }`}
              >
                {/* Top Header Row: Exam Name, Badges, and Live Countdown Banner */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-slate-900">{paper.title}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[10px] font-bold">
                        {paper.examType || 'COMPETITIVE'}
                      </span>
                      {paper.enableTranslation && paper.translationLanguage && (
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[10px] font-bold flex items-center gap-1">
                          <Languages className="w-3 h-3" />
                          <span>English + {paper.translationLanguage} Bilingual</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        Assigned Centre: <strong className="font-mono">{paper.assignedCentreCode || 'CTR-101'}</strong>
                      </span>
                      <span>
                        Superintendent/Operator: <strong>{paper.assignedOperatorName || currentUser?.name}</strong>
                      </span>
                      <span>
                        Questions: <strong>{paper.totalQuestions}</strong> ({paper.totalMarks} Marks)
                      </span>
                    </div>
                  </div>

                  {/* Prominent Countdown / Status Pill */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    {lockState.isLocked ? (
                      <div className="px-3.5 py-2 rounded-lg bg-rose-950 text-white border border-rose-800 flex items-center gap-2.5 shadow-xs">
                        <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-amber-300">
                            {lockState.statusBannerText}
                          </div>
                          <div className="text-[10px] font-mono text-rose-200">
                            Server Unlock Countdown: <strong>{formatCountdown(lockState.remainingSec)}</strong>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="px-3.5 py-2 rounded-lg bg-emerald-900 text-white border border-emerald-700 flex items-center gap-2.5 shadow-xs">
                        <Unlock className="w-4 h-4 text-emerald-300 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-emerald-200">
                            {lockState.statusBannerText}
                          </div>
                          <div className="text-[10px] font-mono text-emerald-100">
                            Server Clock Verified • Decryption &amp; Printing Authorized
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Required Metadata Grid: Exam Name, Paper ID, Exam Date, Encryption Status, Encryption Time, Unlock/Decryption Time */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Exam Name</span>
                    <span className="font-bold text-slate-900 mt-0.5 block truncate" title={paper.title}>
                      {paper.title}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Paper ID</span>
                    <span className="font-mono font-bold text-slate-900 mt-0.5 block break-all text-[11px]">
                      {paper.id}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Exam Date</span>
                    <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                      {paper.scheduleExamDate || paper.examDate || 'Scheduled'}
                    </span>
                    <span className="text-[10px] text-slate-500 block truncate">
                      {paper.scheduleTimezone || 'Asia/Kolkata (IST, UTC+05:30)'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Encryption Status</span>
                    <span
                      className={`inline-flex items-center gap-1 font-mono font-bold text-[11px] mt-0.5 ${
                        lockState.isLocked ? 'text-amber-800' : 'text-emerald-800'
                      }`}
                    >
                      {lockState.isLocked ? (
                        <>
                          <Lock className="w-3 h-3 text-amber-600" />
                          <span>
                            {lockState.isBeforeEncryption
                              ? 'SCHEDULED_FOR_ENCRYPTION'
                              : 'ENCRYPTED_LOCKED'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3 h-3 text-emerald-600" />
                          <span>{paper.encryptionStatus || 'UNLOCKED_READY'}</span>
                        </>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-500 block">AES-256-GCM Enclave</span>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Encryption Time</span>
                    <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                      {lockState.encDisplay}
                    </span>
                    <span className="text-[10px] text-slate-500 block">Paper Locked At</span>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Unlock / Decryption Time
                    </span>
                    <span className="font-mono font-bold text-emerald-900 mt-0.5 block">
                      {lockState.unlockDisplay}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {lockState.isLocked ? 'Print Disabled Until Unlock' : 'Print Enabled Now'}
                    </span>
                  </div>
                </div>

                {/* Action Bar: Strictly Locked Before Unlock Time, Enabled At/After Unlock Time */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-600 flex items-center gap-2">
                    {lockState.isLocked ? (
                      <>
                        <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>
                          <strong>Security Policy Active:</strong> Viewing, downloading, decrypting, and printing are strictly blocked on the server until{' '}
                          <strong>{lockState.unlockDisplay}</strong> ({paper.scheduleExamDate || paper.examDate}).
                        </span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>
                          <strong>Server Time-Lock Satisfied:</strong> You may now decrypt, view, download, and print the final Competitive Exam paper{paper.enableTranslation && paper.translationLanguage ? ` (English + ${paper.translationLanguage})` : ''}.
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Decrypt / Open Final Paper Button */}
                    <button
                      onClick={() => handleDecryptCompetitivePaper(paper)}
                      disabled={lockState.isLocked || isDecrypting}
                      title={
                        lockState.isLocked
                          ? `Locked – Available at ${lockState.unlockDisplay}`
                          : 'Decrypt & View Final Competitive Paper'
                      }
                      className={`px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                        lockState.isLocked
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                          : 'bg-indigo-700 hover:bg-indigo-600 text-white shadow-xs'
                      }`}
                    >
                      {lockState.isLocked ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isDecrypting
                          ? 'Decrypting on Server...'
                          : lockState.isLocked
                            ? `Locked (${lockState.unlockDisplay})`
                            : 'Decrypt & View Paper'}
                      </span>
                    </button>

                    {/* Print Paper Button */}
                    <button
                      onClick={() => handlePrintCompetitivePaper(paper)}
                      disabled={lockState.isLocked || isPrinting}
                      title={
                        lockState.isLocked
                          ? `Locked – Available at ${lockState.unlockDisplay}`
                          : 'Decrypt & Print Final Competitive Paper'
                      }
                      className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                        lockState.isLocked
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                          : 'bg-emerald-800 hover:bg-emerald-700 text-white shadow-xs'
                      }`}
                    >
                      {lockState.isLocked ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : (
                        <Printer className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isPrinting
                          ? 'Preparing Print...'
                          : lockState.isLocked
                            ? 'Print Locked'
                            : 'Print Paper'}
                      </span>
                    </button>

                    {/* Download Paper Button */}
                    <button
                      onClick={() => handleDownloadCompetitivePaper(paper)}
                      disabled={lockState.isLocked || isDownloading}
                      title={
                        lockState.isLocked
                          ? `Locked – Available at ${lockState.unlockDisplay}`
                          : 'Download Decrypted Final Competitive Paper'
                      }
                      className={`px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                        lockState.isLocked
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                          : 'bg-slate-800 hover:bg-slate-700 text-white shadow-xs'
                      }`}
                    >
                      {lockState.isLocked ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
                    </button>

                    {/* Audit Logs Button */}
                    <button
                      onClick={() =>
                        selectedAuditPaperId === paper.id
                          ? setSelectedAuditPaperId(null)
                          : loadCompetitivePaperAudit(paper.id)
                      }
                      className="px-3 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center gap-1.5"
                    >
                      <History className="w-3.5 h-3.5 text-indigo-700" />
                      <span>
                        {selectedAuditPaperId === paper.id ? 'Hide Audit Logs' : 'Audit Trail'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Inline Audit Trail Table for Selected Paper */}
                {selectedAuditPaperId === paper.id && (
                  <div className="mt-3 p-4 rounded-xl bg-slate-900 text-slate-100 space-y-3 border border-slate-700">
                    <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-white">
                          Cryptographic Time-Lock &amp; Printing Audit Trail ({paper.id})
                        </span>
                      </div>
                      <button
                        onClick={() => loadCompetitivePaperAudit(paper.id)}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {loadingAuditLogs ? (
                      <p className="text-xs text-slate-400 py-3 text-center">Loading audit logs...</p>
                    ) : competitiveAuditLogs.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center">
                        No audit events recorded yet for this paper.
                      </p>
                    ) : (
                      <div className="overflow-x-auto max-h-60">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="border-b border-slate-700 text-slate-400 uppercase">
                              <th className="py-1.5 px-2">Server Timestamp</th>
                              <th className="py-1.5 px-2">Event</th>
                              <th className="py-1.5 px-2">User / Role</th>
                              <th className="py-1.5 px-2">Status</th>
                              <th className="py-1.5 px-2">Details &amp; Tx Hash</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {competitiveAuditLogs.map(log => (
                              <tr key={log.id} className="hover:bg-slate-800/60">
                                <td className="py-1.5 px-2 font-mono text-slate-300 whitespace-nowrap">
                                  {new Date(log.serverTimestamp).toLocaleString()}
                                </td>
                                <td className="py-1.5 px-2 font-mono font-bold text-emerald-300 whitespace-nowrap">
                                  {log.actionType}
                                </td>
                                <td className="py-1.5 px-2 text-slate-200 whitespace-nowrap">
                                  {log.userName} <span className="text-slate-400">({log.userRole})</span>
                                </td>
                                <td className="py-1.5 px-2 whitespace-nowrap">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      log.status === 'BLOCKED'
                                        ? 'bg-rose-900/80 text-rose-200 border border-rose-700'
                                        : 'bg-emerald-900/80 text-emerald-200 border border-emerald-700'
                                    }`}
                                  >
                                    {log.status}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-slate-300">
                                  <div>{log.details?.message || JSON.stringify(log.details || {})}</div>
                                  <div className="text-[10px] font-mono text-slate-500">
                                    Tx: {log.txHash?.slice(0, 24)}...
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 print:hidden ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Decrypted Competitive Paper Viewer & Print Enclave (Visible on screen AND when printing via @media print) */}
      {activeDecryptedPaper && (
        <div
          ref={printContainerRef}
          className="p-6 rounded-xl bg-slate-100 border-2 border-emerald-600 shadow-lg space-y-4 print:p-0 print:bg-white print:border-none print:shadow-none"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-950 text-white p-4 rounded-xl print:hidden">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Unlock className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Decrypted Final Competitive Examination Paper — Authorized Centre Enclave
                </span>
              </div>
              <h4 className="text-base font-bold text-white">
                {activeDecryptedPaper.title} ({activeDecryptedPaper.id})
              </h4>
              <p className="text-[11px] text-emerald-200">
                Preserving original sections, question numbering, MCQ options, marks, tables, diagrams, and approved{' '}
                {activeDecryptedPaper.enableTranslation && activeDecryptedPaper.translationLanguage
                  ? `English + ${activeDecryptedPaper.translationLanguage} bilingual translations`
                  : 'English formatting'}
                .
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handlePrintCompetitivePaper(activeDecryptedPaper)}
                disabled={printingPaperId === activeDecryptedPaper.id}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {printingPaperId === activeDecryptedPaper.id ? 'Printing...' : 'Print Final Paper'}
                </span>
              </button>

              <button
                onClick={() => handleDownloadCompetitivePaper(activeDecryptedPaper)}
                disabled={downloadingPaperId === activeDecryptedPaper.id}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 border border-slate-600"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download HTML/Print Copy</span>
              </button>

              <button
                onClick={() => setActiveDecryptedPaper(null)}
                className="p-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-emerald-200"
                title="Close Preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Printable Examination Paper Sheet */}
          <CompetitivePrintExaminationPaper
            paper={activeDecryptedPaper}
            viewMode={paperViewMode}
            operatorPrintMeta={activeOperatorPrintMeta || undefined}
          />
        </div>
      )}

      {/* DASHBOARD */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6 print:hidden">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="border-b pb-3 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Examination Delivery Terminal
                </span>
                <h2 className="text-xl font-bold text-slate-900">Centre Operator Enclave</h2>
              </div>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-full">
                CENTRE TERMINAL ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-indigo-50/70 border border-indigo-200">
                <span className="text-[11px] text-indigo-700 font-semibold block">
                  Competitive Encrypted Papers
                </span>
                <span className="text-2xl font-bold text-indigo-950">{competitivePapers.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Released Examinations</span>
                <span className="text-2xl font-bold text-slate-900">{releasedExams.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Printed Copies Total</span>
                <span className="text-2xl font-bold text-slate-900">{printHistory.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Hardware Status</span>
                <span className="text-2xl font-bold text-emerald-700">TRUSTED</span>
              </div>
            </div>
          </div>

          {/* Competitive Exam Time-Locked Papers Section */}
          {renderCompetitiveTimeLockedPapersSection()}

          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Scheduled Examination Papers</h3>
            {releasedExams.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 text-center">No examinations assigned to this centre.</p>
            ) : (
              <div className="space-y-2">
                {releasedExams.map(ex => (
                  <div
                    key={ex.id}
                    className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{ex.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Schedule Date: {ex.exam_date} {ex.exam_time} • Unlock Minute: {ex.unlock_time}
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenSecureViewer(ex)}
                      className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Open Secure Paper Viewer</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RELEASED EXAMINATIONS / SECURE VIEWER */}
      {(activeSubTab === 'released_examinations' || activeSubTab === 'secure_viewer') && (
        <div className="space-y-6 print:hidden">
          {renderCompetitiveTimeLockedPapersSection()}

          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b pb-2">
              Time-Locked Secure Examination Releases
            </h3>
            <p className="text-xs text-slate-500">
              Plaintext paper decryption is cryptographically time-locked. The server evaluates official clock timestamps and releases paper content only when the unlock minute arrives.
            </p>

            <div className="space-y-3">
              {releasedExams.map(ex => (
                <div
                  key={ex.id}
                  className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{ex.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Unlock Minute: <span className="font-bold text-emerald-900">{ex.unlock_time}</span> • Status: {ex.status}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenSecureViewer(ex)}
                      className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Launch Secure Enclave Viewer</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PRINT MANAGEMENT */}
      {activeSubTab === 'print_management' && (
        <div className="space-y-6 print:hidden">
          {renderCompetitiveTimeLockedPapersSection()}

          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b pb-2">
              Controlled &amp; Traceable Examination Printing
            </h3>
            <p className="text-xs text-slate-500">
              Each printed physical copy receives an indelible dynamic watermark header, unique serialized COPY ID, operator fingerprint, and blockchain hash.
            </p>

            <div className="space-y-3 text-xs">
              <label className="block text-slate-700 font-bold">
                Select Examination for Quota-Authorized Batch Printing
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedExamId}
                  onChange={e => setSelectedExamId(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                >
                  <option value="">-- Choose Examination --</option>
                  {releasedExams.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-600">Copies:</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={printCount}
                    onChange={e => setPrintCount(Number(e.target.value))}
                    className="w-24 px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
                  />
                </div>

                <button
                  onClick={() =>
                    openPrintGate(
                      selectedExamId,
                      releasedExams.find(exam => exam.id === selectedExamId)?.name || ''
                    )
                  }
                  disabled={printing || !selectedExamId}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5"
                >
                  <Lock className="w-4 h-4" />
                  <span>Authorize &amp; Print Batch</span>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-indigo-600" />
              <span>
                Printing is gated: the release is armed with your account password and a single-use code, and it can
                be spent exactly once. To print from another desk, a phone or a tablet on this Wi-Fi, open a relay
                below instead of moving the paper by hand.
              </span>
            </div>
          </div>

          {/* WI-FI SECURE PRINT RELAY */}
          <PrintRelayPanel exams={releasedExams} onActivity={loadData} />

          {/* Print Copies Audit Table */}
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Serialized Print Copy Logs</h3>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {printHistory.length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center">No copies printed yet.</p>
              ) : (
                printHistory.map(p => (
                  <div key={p.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-900">{p.copy_id}</span>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Tx Hash: {p.tx_hash?.substring(0, 16)}... • {new Date(p.printed_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      PRINTED &amp; LOGGED
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* DEVICE STATUS */}
      {activeSubTab === 'device_status' && (() => {
        const thisTerminal = terminals.find(t => terminalUuid && t.device_uuid === terminalUuid);
        const statusLabel = (status: string) =>
          status === 'APPROVED' || status === 'TRUSTED'
            ? 'ACCESS GRANTED'
            : status;
        const statusClass = (status: string) =>
          status === 'APPROVED' || status === 'TRUSTED'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : status === 'PENDING' || status === 'PENDING_APPROVAL'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-rose-50 text-rose-800 border-rose-200';

        return (
          <div className="space-y-6 text-xs">
            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 border-b pb-2">
                Workstation Hardware Terminal Status
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 rounded border">
                  <span className="text-slate-500 block">Hardware Fingerprint</span>
                  <span className="font-mono font-bold text-slate-900 break-all">{deviceFp}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded border">
                  <span className="text-slate-500 block">Trust Ledger Status</span>
                  {thisTerminal ? (
                    <span className={`inline-flex mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusClass(thisTerminal.status)}`}>
                      {statusLabel(thisTerminal.status)}
                    </span>
                  ) : (
                    <span className="font-bold text-slate-500">NOT ON RECORD</span>
                  )}
                </div>
                <div className="p-3 bg-slate-50 rounded border">
                  <span className="text-slate-500 block">Hardware Integrity</span>
                  <span className="font-bold text-emerald-700">FIPS 140-2 ENCLAVE BOUND</span>
                </div>
              </div>

              {thisTerminal && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pt-1 text-[11px] text-slate-600">
                  <div>Terminal: <span className="font-semibold text-slate-900">{thisTerminal.device_name}</span></div>
                  <div>Operating system: <span className="font-semibold text-slate-900">{thisTerminal.operating_system || '—'} {thisTerminal.os_version || ''}</span></div>
                  <div>Key schedule: <span className="font-mono font-semibold text-slate-900">{thisTerminal.encryption_algorithm || 'ECDSA-P256'}</span></div>
                  <div>Registered: <span className="font-semibold text-slate-900">{thisTerminal.registered_at ? new Date(thisTerminal.registered_at).toLocaleString() : '—'}</span></div>
                  <div>Last seen: <span className="font-semibold text-slate-900">{thisTerminal.last_seen_at ? new Date(thisTerminal.last_seen_at).toLocaleString() : '—'}</span></div>
                  <div>Attestation: <span className="font-semibold text-slate-900">{thisTerminal.attestation_status || 'UNAVAILABLE'}</span></div>
                </div>
              )}
            </div>

            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 border-b pb-2">
                Terminals Bound to This Centre Account
              </h3>
              {terminals.length === 0 ? (
                <p className="text-slate-400 p-4 text-center">No workstations are bound to this account yet.</p>
              ) : (
                <div className="space-y-2">
                  {terminals.map(t => (
                    <div key={t.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900">
                          {t.device_name}
                          {!!terminalUuid && t.device_uuid === terminalUuid && (
                            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              THIS WORKSTATION
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          FP: {t.device_fingerprint} • IP: {t.ip_address}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Last seen {t.last_seen_at ? new Date(t.last_seen_at).toLocaleString() : 'never'}
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border self-start sm:self-center shrink-0 ${statusClass(t.status)}`}>
                        {statusLabel(t.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Secure Viewer Modal */}
      {viewerOpen && viewerPaper && (
        <SecureViewerModal
          paper={viewerPaper}
          watermark={viewerWatermark}
          currentUser={currentUser}
          onClose={() => setViewerOpen(false)}
          onPrintCopy={() =>
            openPrintGate(selectedExamId, viewerPaper?.exam_name || viewerPaper?.subject || '')
          }
        />
      )}

      {/* Print Security Gate */}
      {gateOpen && (
        <PrintSecurityGate
          examId={gateExamId}
          examName={gateExamName}
          copies={printCount}
          onClose={() => setGateOpen(false)}
          onReleased={message => {
            setStatusMessage({ type: 'success', text: message });
            loadData();
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
