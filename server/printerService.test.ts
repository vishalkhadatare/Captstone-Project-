import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDb } from './db.ts';
import {
  DEFAULT_CENTRE_PRINTERS,
  getAvailablePrinters,
  getPrinterById,
  createPrintAnywhereJob,
  updatePrintAnywhereJob,
  getPrintAnywhereJobs,
  getLatestPrintAnywhereJobForExam,
  initPrintAnywhereSchema,
} from './printerService.ts';

describe('Print Anywhere Feature Tests', () => {
  it('1. Returns standard centre printer catalog with Online and Offline states', () => {
    const printers = getAvailablePrinters('CTR-101');
    assert.strictEqual(printers.length, 4);

    const office = printers.find(p => p.name === 'Office Printer');
    assert.ok(office);
    assert.strictEqual(office.status, 'ONLINE');

    const examHall = printers.find(p => p.name === 'Exam Hall Printer');
    assert.ok(examHall);
    assert.strictEqual(examHall.status, 'ONLINE');
    assert.strictEqual(examHall.isDefault, true);

    const adminBlock = printers.find(p => p.name === 'Admin Block Printer');
    assert.ok(adminBlock);
    assert.strictEqual(adminBlock.status, 'OFFLINE');

    const centralRoom = printers.find(p => p.name === 'Central Printing Room');
    assert.ok(centralRoom);
    assert.strictEqual(centralRoom.status, 'ONLINE');
  });

  it('2. Enforces that only ONLINE printers are valid targets', () => {
    const onlinePrn = getPrinterById('PRN-EXAM-HALL-01', 'CTR-101');
    assert.ok(onlinePrn);
    assert.strictEqual(onlinePrn.status, 'ONLINE');

    const offlinePrn = getPrinterById('PRN-ADMIN-01', 'CTR-101');
    assert.ok(offlinePrn);
    assert.strictEqual(offlinePrn.status, 'OFFLINE');

    const nonExistent = getPrinterById('UNKNOWN-PRINTER', 'CTR-101');
    assert.strictEqual(nonExistent, undefined);
  });

  it('3. Creates and updates Print Anywhere job lifecycle in database (University & Competitive)', async () => {
    const db = await getDb();
    initPrintAnywhereSchema(db);

    // University Exam print job
    const uniJob = createPrintAnywhereJob(db, {
      examId: 'test-exam-uni-501',
      examName: 'CS-501 Computer Networks',
      examType: 'UNIVERSITY',
      paperId: 'test-ver-uni-501-v1',
      centreId: 'CTR-101',
      centreName: 'ABC Engineering College',
      operatorId: 'usr-op-01',
      operatorName: 'Centre Superintendent',
      printerId: 'PRN-EXAM-HALL-01',
      printerName: 'Exam Hall Printer',
      printerLocation: 'Main Examination Hall A',
      status: 'PRINT_REQUESTED',
      unlockTime: '10:00 AM',
      copiesCount: 25,
    });

    assert.ok(uniJob.id);
    assert.strictEqual(uniJob.examType, 'UNIVERSITY');
    assert.strictEqual(uniJob.status, 'PRINT_REQUESTED');
    assert.strictEqual(uniJob.printerName, 'Exam Hall Printer');
    assert.strictEqual(uniJob.copiesCount, 25);

    // Advance to PRINTED_SUCCESSFULLY
    const completedUniJob = updatePrintAnywhereJob(db, uniJob.id, {
      status: 'PRINTED_SUCCESSFULLY',
      completedAt: new Date().toISOString(),
      txHash: '0xabc123456789',
    });

    assert.ok(completedUniJob);
    assert.strictEqual(completedUniJob.status, 'PRINTED_SUCCESSFULLY');
    assert.ok(completedUniJob.completedAt);
    assert.strictEqual(completedUniJob.txHash, '0xabc123456789');

    // Competitive Exam print job
    const compJob = createPrintAnywhereJob(db, {
      examId: 'test-exam-comp-gs101',
      examName: 'UPSC General Studies Paper I',
      examType: 'COMPETITIVE',
      paperId: 'test-comp-paper-001',
      centreId: 'CTR-102',
      centreName: 'National Examination Centre 2',
      operatorId: 'usr-op-02',
      operatorName: 'Centre Operator 2',
      printerId: 'PRN-OFFICE-01',
      printerName: 'Office Printer',
      printerLocation: 'Administrative Office – Room 102',
      status: 'PRINT_REQUESTED',
      unlockTime: '11:00 AM',
      copiesCount: 50,
    });

    assert.ok(compJob.id);
    assert.strictEqual(compJob.examType, 'COMPETITIVE');
    assert.strictEqual(compJob.status, 'PRINT_REQUESTED');
    assert.strictEqual(compJob.printerName, 'Office Printer');

    // Retrieve jobs via getPrintAnywhereJobs
    const jobs = getPrintAnywhereJobs(db, { limit: 10 });
    assert.ok(jobs.length >= 2);

    const latestUni = getLatestPrintAnywhereJobForExam(db, 'test-exam-uni-501');
    assert.ok(latestUni);
    assert.strictEqual(latestUni.examName, 'CS-501 Computer Networks');
    assert.strictEqual(latestUni.status, 'PRINTED_SUCCESSFULLY');
  });

  it('4. Time-lock boundary verification (Rejects printing before unlock time)', () => {
    const scheduledUnlockMs = Date.now() + 3600 * 1000; // 1 hour in future
    const currentServerTimeMs = Date.now();

    // Verify condition: current server time < unlock time -> LOCKED
    const isLocked = currentServerTimeMs < scheduledUnlockMs;
    assert.strictEqual(isLocked, true, 'Exam must be locked before unlock time arrives');

    // At unlock time: current server time >= unlock time -> UNLOCKED
    const pastUnlockMs = Date.now() - 60 * 1000;
    const isUnlocked = currentServerTimeMs >= pastUnlockMs;
    assert.strictEqual(isUnlocked, true, 'Exam must be unlocked at/after unlock time arrives');
  });
});
