import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeRun } from './db';

export type PrinterStatus = 'ONLINE' | 'OFFLINE';

export type PrintJobStatus =
  | 'PRINT_REQUESTED'
  | 'PRINTING'
  | 'PRINTED_SUCCESSFULLY'
  | 'PRINT_FAILED'
  | 'PRINTER_OFFLINE'
  | 'PRINTER_NOT_AVAILABLE';

export interface PrinterDevice {
  id: string;
  name: string;
  location: string;
  type: string;
  status: PrinterStatus;
  isDefault?: boolean;
  centreId?: string;
}

export interface PrintAnywhereJobRecord {
  id: string;
  examId: string;
  examName: string;
  examType: 'UNIVERSITY' | 'COMPETITIVE';
  paperId: string;
  centreId: string;
  centreName: string;
  operatorId: string;
  operatorName: string;
  printerId: string;
  printerName: string;
  printerLocation: string;
  status: PrintJobStatus;
  unlockTime: string;
  requestedAt: string;
  completedAt?: string | null;
  failureReason?: string | null;
  copiesCount: number;
  txHash?: string | null;
  createdAt: string;
}

// Built-in standard printers available at examination centres
export const DEFAULT_CENTRE_PRINTERS: PrinterDevice[] = [
  {
    id: 'PRN-OFFICE-01',
    name: 'Office Printer',
    location: 'Administrative Office – Room 102',
    type: 'Laser Duplex (Network)',
    status: 'ONLINE',
    isDefault: false,
  },
  {
    id: 'PRN-EXAM-HALL-01',
    name: 'Exam Hall Printer',
    location: 'Main Examination Hall A',
    type: 'High-Volume Production Printer',
    status: 'ONLINE',
    isDefault: true,
  },
  {
    id: 'PRN-ADMIN-01',
    name: 'Admin Block Printer',
    location: 'Admin Block Corridor',
    type: 'Multi-Function Office Printer',
    status: 'OFFLINE',
    isDefault: false,
  },
  {
    id: 'PRN-CENTRAL-01',
    name: 'Central Printing Room',
    location: 'Secure Printing Vault – Floor -1',
    type: 'High-Speed Secure Laser Station',
    status: 'ONLINE',
    isDefault: false,
  },
];

/**
 * Initializes the print_anywhere_jobs table if it does not exist.
 */
export function initPrintAnywhereSchema(db: any): void {
  try {
    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS print_anywhere_jobs (
        id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        exam_name TEXT NOT NULL,
        exam_type TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        centre_id TEXT NOT NULL,
        centre_name TEXT,
        operator_id TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        printer_id TEXT NOT NULL,
        printer_name TEXT NOT NULL,
        printer_location TEXT,
        status TEXT NOT NULL,
        unlock_time TEXT,
        requested_at TEXT NOT NULL,
        completed_at TEXT,
        failure_reason TEXT,
        copies_count INTEGER DEFAULT 1,
        tx_hash TEXT,
        created_at TEXT NOT NULL
      );`
    );
  } catch (err) {
    console.error('initPrintAnywhereSchema error:', err);
  }
}

/**
 * Returns available printers for an examination centre.
 */
export function getAvailablePrinters(centreId?: string): PrinterDevice[] {
  return DEFAULT_CENTRE_PRINTERS.map(p => ({
    ...p,
    centreId: centreId || 'CTR-101',
  }));
}

/**
 * Finds a specific printer by ID.
 */
export function getPrinterById(printerId: string, centreId?: string): PrinterDevice | undefined {
  const printers = getAvailablePrinters(centreId);
  return printers.find(p => p.id === printerId || p.name.toLowerCase() === printerId.toLowerCase());
}

/**
 * Creates a new Print Anywhere job.
 */
export function createPrintAnywhereJob(
  db: any,
  params: {
    examId: string;
    examName: string;
    examType: 'UNIVERSITY' | 'COMPETITIVE';
    paperId: string;
    centreId: string;
    centreName: string;
    operatorId: string;
    operatorName: string;
    printerId: string;
    printerName: string;
    printerLocation: string;
    status: PrintJobStatus;
    unlockTime: string;
    requestedAt?: string;
    copiesCount?: number;
    failureReason?: string;
    txHash?: string;
  }
): PrintAnywhereJobRecord {
  initPrintAnywhereSchema(db);
  const id = uuidv4();
  const now = new Date().toISOString();
  const requestedAt = params.requestedAt || now;
  const copiesCount = params.copiesCount && params.copiesCount > 0 ? params.copiesCount : 1;

  executeRun(
    db,
    `INSERT INTO print_anywhere_jobs (
      id, exam_id, exam_name, exam_type, paper_id, centre_id, centre_name,
      operator_id, operator_name, printer_id, printer_name, printer_location,
      status, unlock_time, requested_at, failure_reason, copies_count, tx_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.examId,
      params.examName,
      params.examType,
      params.paperId,
      params.centreId,
      params.centreName,
      params.operatorId,
      params.operatorName,
      params.printerId,
      params.printerName,
      params.printerLocation,
      params.status,
      params.unlockTime,
      requestedAt,
      params.failureReason || null,
      copiesCount,
      params.txHash || null,
      now,
    ]
  );

  return {
    id,
    examId: params.examId,
    examName: params.examName,
    examType: params.examType,
    paperId: params.paperId,
    centreId: params.centreId,
    centreName: params.centreName,
    operatorId: params.operatorId,
    operatorName: params.operatorName,
    printerId: params.printerId,
    printerName: params.printerName,
    printerLocation: params.printerLocation,
    status: params.status,
    unlockTime: params.unlockTime,
    requestedAt,
    completedAt: null,
    failureReason: params.failureReason || null,
    copiesCount,
    txHash: params.txHash || null,
    createdAt: now,
  };
}

/**
 * Updates a Print Anywhere job status.
 */
export function updatePrintAnywhereJob(
  db: any,
  jobId: string,
  updates: {
    status: PrintJobStatus;
    completedAt?: string;
    failureReason?: string;
    txHash?: string;
  }
): PrintAnywhereJobRecord | null {
  initPrintAnywhereSchema(db);
  const sets: string[] = ['status = ?'];
  const values: any[] = [updates.status];

  if (updates.completedAt !== undefined) {
    sets.push('completed_at = ?');
    values.push(updates.completedAt);
  }
  if (updates.failureReason !== undefined) {
    sets.push('failure_reason = ?');
    values.push(updates.failureReason);
  }
  if (updates.txHash !== undefined) {
    sets.push('tx_hash = ?');
    values.push(updates.txHash);
  }

  values.push(jobId);
  executeRun(db, `UPDATE print_anywhere_jobs SET ${sets.join(', ')} WHERE id = ?`, values);

  const rows = executeQuery(db, 'SELECT * FROM print_anywhere_jobs WHERE id = ?', [jobId]);
  if (!rows || rows.length === 0) return null;
  return mapJobRow(rows[0]);
}

/**
 * Retrieves Print Anywhere jobs with optional filters.
 */
export function getPrintAnywhereJobs(
  db: any,
  filters?: {
    examId?: string;
    centreId?: string;
    examType?: string;
    limit?: number;
  }
): PrintAnywhereJobRecord[] {
  initPrintAnywhereSchema(db);
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.examId) {
    conditions.push('exam_id = ?');
    params.push(filters.examId);
  }
  if (filters?.centreId) {
    conditions.push('centre_id = ?');
    params.push(filters.centreId);
  }
  if (filters?.examType) {
    conditions.push('exam_type = ?');
    params.push(filters.examType.toUpperCase());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit && filters.limit > 0 ? Math.min(200, filters.limit) : 100;

  const rows = executeQuery(
    db,
    `SELECT * FROM print_anywhere_jobs ${whereClause} ORDER BY requested_at DESC LIMIT ${limit}`,
    params
  );

  return (rows || []).map(mapJobRow);
}

/**
 * Gets the most recent Print Anywhere job for a specific exam or paper.
 */
export function getLatestPrintAnywhereJobForExam(
  db: any,
  examId: string,
  paperId?: string
): PrintAnywhereJobRecord | null {
  initPrintAnywhereSchema(db);
  let rows: any[] = [];
  if (paperId) {
    rows = executeQuery(
      db,
      'SELECT * FROM print_anywhere_jobs WHERE exam_id = ? OR paper_id = ? ORDER BY requested_at DESC LIMIT 1',
      [examId, paperId]
    );
  } else {
    rows = executeQuery(
      db,
      'SELECT * FROM print_anywhere_jobs WHERE exam_id = ? ORDER BY requested_at DESC LIMIT 1',
      [examId]
    );
  }
  if (!rows || rows.length === 0) return null;
  return mapJobRow(rows[0]);
}

function mapJobRow(r: any): PrintAnywhereJobRecord {
  return {
    id: r.id,
    examId: r.exam_id,
    examName: r.exam_name,
    examType: r.exam_type,
    paperId: r.paper_id,
    centreId: r.centre_id,
    centreName: r.centre_name || 'Centre 101',
    operatorId: r.operator_id,
    operatorName: r.operator_name,
    printerId: r.printer_id,
    printerName: r.printer_name,
    printerLocation: r.printer_location || '',
    status: r.status,
    unlockTime: r.unlock_time || '',
    requestedAt: r.requested_at,
    completedAt: r.completed_at || null,
    failureReason: r.failure_reason || null,
    copiesCount: Number(r.copies_count || 1),
    txHash: r.tx_hash || null,
    createdAt: r.created_at,
  };
}

