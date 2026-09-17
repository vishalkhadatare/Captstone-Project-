import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { RagQuestionMetadata } from './universityRagPipeline.ts';

export interface UniversityPaperPdfInput {
  universityName: string;
  examName: string;
  subject: string;
  paperCode: string;
  setLetter: string; // 'P', 'Q', 'R', 'S'
  examDate: string;
  durationMinutes: number;
  totalMarks: number;
  markingScheme?: string;
  mcqs: RagQuestionMetadata[];
  section1Theory: RagQuestionMetadata[];
  section2Theory: RagQuestionMetadata[];
}

/**
 * Generates a publication-quality University Question Paper PDF using PDFKit.
 * Preserves section order, question wording 100% unchanged, option blocks, and right-aligned marks.
 */
export function generateUniversityPaperPdf(input: UniversityPaperPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const primaryColor = '#0f172a';
      const secondaryColor = '#334155';

      // Header Watermark Notice
      doc
        .fontSize(7)
        .fillColor('#64748b')
        .text('CONFIDENTIAL • STATE UNIVERSITY EXAMINATION BOARD • PROTECTED UNDER ZEROLEAK VAULT', { align: 'center' })
        .moveDown(0.5);

      // Seat No Box & Paper Code Box
      const topY = doc.y;
      doc.rect(40, topY, 120, 22).strokeColor('#000000').stroke();
      doc.fontSize(8).fillColor('#000000').text('Seat No.', 45, topY + 6);

      doc.rect(440, topY, 115, 22).strokeColor('#000000').stroke();
      doc.fontSize(8).fillColor('#000000').text(`Code: ${input.paperCode} (Set ${input.setLetter})`, 445, topY + 6);

      doc.y = topY + 30;

      // Title & Subtitle
      doc
        .fontSize(14)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(input.universityName.toUpperCase(), { align: 'center' });

      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(input.examName.toUpperCase(), { align: 'center' });

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`Subject: ${input.subject}`, { align: 'center' })
        .moveDown(0.3);

      // Date, Duration & Total Marks Line
      const metaY = doc.y;
      doc.moveTo(40, metaY).lineTo(555, metaY).strokeColor('#000000').lineWidth(1).stroke();
      doc.y = metaY + 5;

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`Day & Date: ${input.examDate || new Date().toLocaleDateString()}`, 40, doc.y, { continued: true })
        .text(`Duration: ${input.durationMinutes} Minutes`, { align: 'center', continued: true })
        .text(`Max. Marks: ${input.totalMarks} Marks`, { align: 'right' });

      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#000000').lineWidth(1).stroke();
      doc.moveDown(0.5);

      // Instructions Box
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('Instructions:', 40, doc.y);

      doc
        .fontSize(8)
        .font('Helvetica')
        .text('1. Q. No. 1 is compulsory. It should be solved in the first 30 minutes in answer booklet.', 45, doc.y)
        .text(`2. Mention Question Paper Set (${input.setLetter}) clearly on top of the answer booklet.`, 45, doc.y)
        .text('3. Figures to the right indicate full marks.', 45, doc.y)
        .text('4. Assume suitable data wherever needed and mention it clearly.', 45, doc.y);

      if (input.markingScheme) {
        doc.text(`5. ${input.markingScheme}`, 45, doc.y);
      }

      doc.moveDown(0.8);

      // SECTION 1: MCQs (Q.1)
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#000000').lineWidth(1.5).stroke();
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Q.1 Choose the correct alternatives from the options.', 40, doc.y, { continued: true })
        .text(`[${input.mcqs.length} Marks]`, { align: 'right' });
      doc.moveDown(0.5);

      // Render MCQs
      input.mcqs.forEach((mcq, idx) => {
        if (doc.y > 730) doc.addPage();

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(`${idx + 1}) `, 45, doc.y, { continued: true })
          .font('Helvetica')
          .text(mcq.questionText, { align: 'justify' });

        if (mcq.options && Array.isArray(mcq.options) && mcq.options.length > 0) {
          const optY = doc.y + 2;
          mcq.options.forEach((opt, oIdx) => {
            const label = String.fromCharCode(97 + oIdx);
            const optText = typeof opt === 'string' ? opt : (opt as any).text || '';
            const xPos = (oIdx % 2 === 0) ? 65 : 310;
            const currentLineY = optY + Math.floor(oIdx / 2) * 14;

            doc
              .fontSize(8)
              .font('Helvetica-Bold')
              .text(`${label}) `, xPos, currentLineY, { continued: true })
              .font('Helvetica')
              .text(optText);
          });
          doc.y = optY + Math.ceil(mcq.options.length / 2) * 14 + 4;
        } else {
          doc.moveDown(0.3);
        }
      });

      doc.moveDown(0.8);

      // SECTION I: Theory (Q.2 & Q.3)
      if (doc.y > 700) doc.addPage();

      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#000000').lineWidth(1.5).stroke();
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('SECTION – I (Theory & Analysis)', 40, doc.y, { continued: true })
        .text('[28 Marks]', { align: 'right' });
      doc.moveDown(0.5);

      if (input.section1Theory.length > 0) {
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('Q.2 Answer any FOUR of the following questions.', 40, doc.y, { continued: true })
          .text('[16 Marks]', { align: 'right' });
        doc.moveDown(0.4);

        const sec1Q2 = input.section1Theory.slice(0, 5);
        sec1Q2.forEach((q, idx) => {
          if (doc.y > 730) doc.addPage();
          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .text(`${String.fromCharCode(97 + idx)}) `, 50, doc.y, { continued: true })
            .font('Helvetica')
            .text(q.questionText, { align: 'justify' });
          doc.moveDown(0.3);
        });

        if (input.section1Theory.length > 5) {
          const sec1Q3 = input.section1Theory.slice(5);
          doc.moveDown(0.4);
          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .text('Q.3 Answer the following questions in detail.', 40, doc.y, { continued: true })
            .text('[12 Marks]', { align: 'right' });
          doc.moveDown(0.4);

          sec1Q3.forEach((q, idx) => {
            if (doc.y > 730) doc.addPage();
            doc
              .fontSize(9)
              .font('Helvetica-Bold')
              .text(`${String.fromCharCode(97 + idx)}) `, 50, doc.y, { continued: true })
              .font('Helvetica')
              .text(q.questionText, { align: 'justify' });
            doc.moveDown(0.3);
          });
        }
      }

      // SECTION II: Theory (Q.4 & Q.5)
      if (doc.y > 700) doc.addPage();

      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#000000').lineWidth(1.5).stroke();
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('SECTION – II (Applications & System Problems)', 40, doc.y, { continued: true })
        .text('[28 Marks]', { align: 'right' });
      doc.moveDown(0.5);

      if (input.section2Theory.length > 0) {
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('Q.4 Answer any FOUR of the following questions.', 40, doc.y, { continued: true })
          .text('[16 Marks]', { align: 'right' });
        doc.moveDown(0.4);

        const sec2Q4 = input.section2Theory.slice(0, 5);
        sec2Q4.forEach((q, idx) => {
          if (doc.y > 730) doc.addPage();
          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .text(`${String.fromCharCode(97 + idx)}) `, 50, doc.y, { continued: true })
            .font('Helvetica')
            .text(q.questionText, { align: 'justify' });
          doc.moveDown(0.3);
        });

        if (input.section2Theory.length > 5) {
          const sec2Q5 = input.section2Theory.slice(5);
          doc.moveDown(0.4);
          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .text('Q.5 Solve / Explain the following in detail.', 40, doc.y, { continued: true })
            .text('[12 Marks]', { align: 'right' });
          doc.moveDown(0.4);

          sec2Q5.forEach((q, idx) => {
            if (doc.y > 730) doc.addPage();
            doc
              .fontSize(9)
              .font('Helvetica-Bold')
              .text(`${String.fromCharCode(97 + idx)}) `, 50, doc.y, { continued: true })
              .font('Helvetica')
              .text(q.questionText, { align: 'justify' });
            doc.moveDown(0.3);
          });
        }
      }

      // End Footer
      doc.moveDown(1);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('*** END OF QUESTION PAPER ***', { align: 'center' });

      // Apply Page Numbers
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#64748b')
          .text(
            `Page ${i + 1} of ${totalPages}  •  ${input.paperCode} (Set ${input.setLetter})`,
            40,
            doc.page.height - 30,
            { align: 'center', width: doc.page.width - 80 }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
