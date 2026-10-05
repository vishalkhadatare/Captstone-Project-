import React, { useState } from 'react';
import { Upload, FileUp, FileText, CheckCircle2, AlertTriangle, RefreshCw, Trash2, ArrowRight, ArrowLeft, Layers, ShieldCheck } from 'lucide-react';
import { SubjectRule } from './CompetitiveBlueprintForm';
import { api } from '../../api';

interface UploadedFileRecord {
  file: File;
  name: string;
  size: number;
  subject: string;
  status: 'PENDING' | 'EXTRACTING' | 'COMPLETED' | 'ERROR';
  extractedCount?: number;
  errorMessage?: string;
  poolId?: string;
}

interface SubjectUploaderProps {
  examId: string;
  subjects: SubjectRule[];
  onBack: () => void;
  onProceed: () => void;
  onExtractionFinished: () => void;
}

export const CompetitiveSubjectUploader: React.FC<SubjectUploaderProps> = ({
  examId,
  subjects,
  onBack,
  onProceed,
  onExtractionFinished,
}) => {
  // Map of subject -> array of uploaded file records
  const [subjectFiles, setSubjectFiles] = useState<Record<string, UploadedFileRecord[]>>({});
  const [isExtractingGlobal, setIsExtractingGlobal] = useState(false);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Handle files selected for a subject
  const handleFilesSelected = (subjectName: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newRecords: UploadedFileRecord[] = Array.from(files).map(file => ({
      file,
      name: file.name,
      size: file.size,
      subject: subjectName,
      status: 'PENDING',
    }));

    setSubjectFiles(prev => ({
      ...prev,
      [subjectName]: [...(prev[subjectName] || []), ...newRecords],
    }));
  };

  // Remove a file from subject
  const handleRemoveFile = (subjectName: string, index: number) => {
    setSubjectFiles(prev => {
      const current = [...(prev[subjectName] || [])];
      current.splice(index, 1);
      return { ...prev, [subjectName]: current };
    });
  };

  // Trigger extraction for a single file
  const extractSingleFile = async (
    subjectRule: SubjectRule,
    record: UploadedFileRecord,
    index: number
  ) => {
    const subjectName = subjectRule.subjectName;

    // Set status to EXTRACTING
    setSubjectFiles(prev => {
      const current = [...(prev[subjectName] || [])];
      current[index] = { ...current[index], status: 'EXTRACTING', errorMessage: undefined };
      return { ...prev, [subjectName]: current };
    });

    try {
      const base64Data = await fileToBase64(record.file);

      const resp = await api.competitive.uploadSubjectPdf({
        exam_id: examId,
        subject_id: subjectRule.id,
        subject_name: subjectName,
        subject: subjectName,
        file_name: record.name,
        file_data: base64Data,
        marks_per_question: subjectRule.marksPerQuestion,
        negative_marks: subjectRule.negativeMarks,
      });

      if (resp && resp.success) {
        setSubjectFiles(prev => {
          const current = [...(prev[subjectName] || [])];
          current[index] = {
            ...current[index],
            status: 'COMPLETED',
            extractedCount: resp.extractedCount || resp.questions?.length || 0,
            poolId: resp.poolId,
          };
          return { ...prev, [subjectName]: current };
        });
      } else {
        throw new Error((resp as any)?.error || 'Extraction returned no valid questions.');
      }
    } catch (err: any) {
      setSubjectFiles(prev => {
        const current = [...(prev[subjectName] || [])];
        current[index] = {
          ...current[index],
          status: 'ERROR',
          errorMessage: err.message || 'Failed to extract questions.',
        };
        return { ...prev, [subjectName]: current };
      });
    }
  };

  // Extract all pending files across all subjects
  const handleExtractAll = async () => {
    setIsExtractingGlobal(true);

    for (const rule of subjects) {
      const files = subjectFiles[rule.subjectName] || [];
      for (let i = 0; i < files.length; i++) {
        const rec = files[i];
        if (rec.status === 'PENDING' || rec.status === 'ERROR') {
          await extractSingleFile(rule, rec, i);
        }
      }
    }

    setIsExtractingGlobal(false);
    onExtractionFinished();
  };

  // Calculate overall stats
  let totalFilesUploaded = 0;
  let totalExtractedQuestions = 0;
  let hasPendingOrExtracting = false;

  subjects.forEach(s => {
    const list = subjectFiles[s.subjectName] || [];
    totalFilesUploaded += list.length;
    list.forEach(f => {
      totalExtractedQuestions += f.extractedCount || 0;
      if (f.status === 'PENDING' || f.status === 'EXTRACTING') {
        hasPendingOrExtracting = true;
      }
    });
  });

  return (
    <div className="space-y-6">
      {/* Top Advisory Banner */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Step 3: Subject-Wise Question Pool PDF Upload</span>
        </div>
        <p className="text-slate-600 leading-relaxed">
          Upload PDF question papers for <strong>every configured subject</strong>. You can upload{' '}
          <strong>multiple PDFs per subject</strong> (e.g. Paper 1, Paper 2, Paper 3). The system performs real text
          layer & OCR extraction to create verified question pools. <em>These are question source pools, not complete single final papers.</em>
        </p>
      </div>

      {/* Global Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white border border-slate-200 text-xs">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-slate-100 font-mono font-bold text-slate-800 border border-slate-200">
            {totalFilesUploaded} Source PDF{totalFilesUploaded !== 1 ? 's' : ''} Attached
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 font-mono font-bold border border-emerald-200">
            {totalExtractedQuestions} Real Questions Extracted
          </div>
        </div>

        {totalFilesUploaded > 0 && (
          <button
            type="button"
            onClick={handleExtractAll}
            disabled={isExtractingGlobal}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isExtractingGlobal ? 'animate-spin' : ''}`} />
            <span>{isExtractingGlobal ? 'Extracting Question Pools...' : 'Extract All Uploaded PDFs'}</span>
          </button>
        )}
      </div>

      {/* Subject-Wise Upload Cards (Requirement 7) */}
      <div className="space-y-6">
        {subjects.map(subjectRule => {
          const sName = subjectRule.subjectName;
          const files = subjectFiles[sName] || [];
          const extractedForSubject = files.reduce((acc, f) => acc + (f.extractedCount || 0), 0);

          return (
            <div
              key={subjectRule.id}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4"
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      {sName} Question Pool
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Blueprint Target: <strong>{subjectRule.numberOfQuestions} Questions</strong> ({subjectRule.questionType} • {subjectRule.marksPerQuestion} Marks)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                      extractedForSubject >= subjectRule.numberOfQuestions
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {extractedForSubject} / {subjectRule.numberOfQuestions} Verified Questions
                  </span>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div className="relative border-2 border-dashed border-slate-300 hover:border-slate-500 rounded-xl p-6 text-center transition-colors bg-slate-50">
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  id={`file-input-${subjectRule.id}`}
                  onChange={e => handleFilesSelected(sName, e.target.files)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="space-y-2 pointer-events-none">
                  <Upload className="w-6 h-6 text-slate-600 mx-auto" />
                  <div className="text-xs font-bold text-slate-800">
                    Click to browse or drag & drop <strong>{sName} Question PDFs</strong>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Supports multiple PDFs simultaneously (e.g. {sName.toLowerCase()}_set_A.pdf, {sName.toLowerCase()}_mock_2.pdf)
                  </p>
                </div>
              </div>

              {/* List of Files Uploaded for this Subject */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Uploaded Source PDFs for {sName} ({files.length}):
                  </h4>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {files.map((fileRec, fIdx) => (
                      <div
                        key={fIdx}
                        className="p-3 bg-white flex items-center justify-between text-xs gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">{fileRec.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{formatSize(fileRec.size)}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {fileRec.status === 'COMPLETED' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{fileRec.extractedCount} Questions Extracted</span>
                            </span>
                          )}

                          {fileRec.status === 'EXTRACTING' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200 flex items-center gap-1 animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin text-slate-700" />
                              <span>Extracting...</span>
                            </span>
                          )}

                          {fileRec.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => extractSingleFile(subjectRule, fileRec, fIdx)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                            >
                              Extract Now
                            </button>
                          )}

                          {fileRec.status === 'ERROR' && (
                            <div className="flex items-center gap-2">
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800"
                                title={fileRec.errorMessage}
                              >
                                Extraction Error
                              </span>
                              <button
                                type="button"
                                onClick={() => extractSingleFile(subjectRule, fileRec, fIdx)}
                                className="text-[10px] font-bold text-slate-900 underline"
                              >
                                Retry
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveFile(sName, fIdx)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-2 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Blueprint</span>
        </button>

        <button
          type="button"
          onClick={onProceed}
          disabled={totalExtractedQuestions === 0}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            totalExtractedQuestions > 0
              ? 'bg-slate-900 hover:bg-black text-white shadow-sm'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          <span>Proceed to Step 4: Extract & Verify Questions</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

