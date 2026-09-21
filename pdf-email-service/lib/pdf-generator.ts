import PDFDocument from 'pdfkit';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Medication {
  name: string;
  type?: string;
  dosage?: string;
  dosageUnit?: string;
  frequency?: string;
  duration?: string;
  durationUnit?: string;
  quantity?: string;
  quantityUnit?: string;
  instructions?: string;
}

export interface PrescriptionData {
  patientName: string;
  doctorName?: string;
  medications: Medication[];
  instructions?: string;
  note?: string;
  generatedAt?: Date;
}

// ─── Brand Colors ───────────────────────────────────────────────────────────

const BRAND = {
  primary: '#BD632F',
  primaryLight: '#FFF2EB',
  text: '#1A1817',
  textMuted: '#7C7672',
  textFaint: '#9C9690',
  border: '#E6E1DC',
  surface: '#FFFFFF',
  background: '#FAF9F6',
};

// ─── PDF Generation ─────────────────────────────────────────────────────────

/**
 * Generate a branded prescription PDF entirely in-memory.
 * Returns a Buffer — no disk writes, no Puppeteer.
 */
export function generatePrescriptionPdf(data: PrescriptionData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
      info: {
        Title: `Prescription - ${data.patientName}`,
        Author: 'GoVadi Health',
        Creator: 'GoVadi PDF Service',
      },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const generatedAt = data.generatedAt || new Date();
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 100;

    // ── Header Background ───────────────────────────────────────────────
    doc
      .rect(0, 0, pageWidth, 100)
      .fill(BRAND.primary);

    // ── Brand Name ──────────────────────────────────────────────────────
    doc
      .fontSize(28)
      .font('Helvetica-Bold')
      .fillColor('#FFFFFF')
      .text('GoVadi', 50, 30, { align: 'center' })
      .fontSize(10)
      .font('Helvetica')
      .text('Veterinary Health Services', 50, 62, { align: 'center' });

    // ── Prescription Title ──────────────────────────────────────────────
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .fillColor(BRAND.text)
      .text('PRESCRIPTION', 50, 120, { align: 'center' })
      .moveDown(0.5);

    // ── Divider ─────────────────────────────────────────────────────────
    const lineY = doc.y;
    doc
      .moveTo(50, lineY)
      .lineTo(pageWidth - 50, lineY)
      .strokeColor(BRAND.primary)
      .lineWidth(2)
      .stroke()
      .moveDown(1);

    // ── Patient & Doctor Info ───────────────────────────────────────────
    const infoY = doc.y;

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(BRAND.primary)
      .text('Patient Details', 50, infoY);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(BRAND.text)
      .text(`Name: ${data.patientName}`, 50, infoY + 18)
      .text(`Date: ${generatedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, 50, infoY + 34);

    if (data.doctorName) {
      doc.text(`Doctor: ${data.doctorName}`, 50, infoY + 50);
    }

    doc.moveDown(2);

    // ── Medications Table ───────────────────────────────────────────────
    if (data.medications.length > 0) {
      const tableY = doc.y;

      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(BRAND.primary)
        .text('Medications', 50, tableY)
        .moveDown(0.5);

      // Table header
      const headerY = doc.y;
      const colWidths = [contentWidth * 0.25, contentWidth * 0.2, contentWidth * 0.2, contentWidth * 0.15, contentWidth * 0.2];
      const colX = [50, 50 + colWidths[0], 50 + colWidths[0] + colWidths[1], 50 + colWidths[0] + colWidths[1] + colWidths[2], 50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]];

      // Header background
      doc
        .rect(50, headerY - 4, contentWidth, 22)
        .fill(BRAND.primary);

      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#FFFFFF')
        .text('MEDICATION', colX[0], headerY, { width: colWidths[0] - 4 })
        .text('DOSAGE', colX[1], headerY, { width: colWidths[1] - 4 })
        .text('FREQUENCY', colX[2], headerY, { width: colWidths[2] - 4 })
        .text('DURATION', colX[3], headerY, { width: colWidths[3] - 4 })
        .text('QTY', colX[4], headerY, { width: colWidths[4] - 4 });

      let rowY = headerY + 22;

      // Table rows
      data.medications.forEach((med, index) => {
        const isEven = index % 2 === 0;

        // Row background
        doc
          .rect(50, rowY - 4, contentWidth, 28)
          .fill(isEven ? '#FAF9F6' : '#FFFFFF');

        // Row border
        doc
          .moveTo(50, rowY + 24)
          .lineTo(pageWidth - 50, rowY + 24)
          .strokeColor(BRAND.border)
          .lineWidth(0.5)
          .stroke();

        const dosage = [med.dosage, med.dosageUnit].filter(Boolean).join(' ') || '-';
        const frequency = med.frequency || '-';
        const duration = [med.duration, med.durationUnit].filter(Boolean).join(' ') || '-';
        const quantity = [med.quantity, med.quantityUnit].filter(Boolean).join(' ') || '-';

        doc
          .fontSize(8)
          .font('Helvetica-Bold')
          .fillColor(BRAND.text)
          .text(med.name || '-', colX[0], rowY, { width: colWidths[0] - 4 })
          .font('Helvetica')
          .text(dosage, colX[1], rowY, { width: colWidths[1] - 4 })
          .text(frequency, colX[2], rowY, { width: colWidths[2] - 4 })
          .text(duration, colX[3], rowY, { width: colWidths[3] - 4 })
          .text(quantity, colX[4], rowY, { width: colWidths[4] - 4 });

        // Medication type subtitle
        if (med.type) {
          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor(BRAND.textMuted)
            .text(med.type, colX[0], rowY + 10, { width: colWidths[0] - 4 });
        }

        rowY += 28;
      });

      doc.y = rowY + 10;
    }

    // ── Instructions ────────────────────────────────────────────────────
    if (data.instructions) {
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(BRAND.primary)
        .text('Instructions')
        .moveDown(0.3);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(BRAND.text)
        .text(data.instructions, {
          lineGap: 4,
          width: contentWidth,
        })
        .moveDown(1);
    }

    // ── Medication Note ─────────────────────────────────────────────────
    if (data.note) {
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(BRAND.primary)
        .text('Note')
        .moveDown(0.3);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(BRAND.text)
        .text(data.note, {
          lineGap: 4,
          width: contentWidth,
        })
        .moveDown(1);
    }

    // ── Footer ──────────────────────────────────────────────────────────
    const footerY = doc.page.height - 80;

    // Footer divider
    doc
      .moveTo(50, footerY - 10)
      .lineTo(pageWidth - 50, footerY - 10)
      .strokeColor(BRAND.border)
      .lineWidth(0.5)
      .stroke();

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(BRAND.textFaint)
      .text(
        `Generated on ${generatedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} at ${generatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
        50,
        footerY,
        { align: 'center', width: contentWidth },
      )
      .text(
        'GoVadi Health Services — Veterinary Care Platform',
        50,
        footerY + 14,
        { align: 'center', width: contentWidth },
      )
      .text(
        'This is not a substitute for professional veterinary advice.',
        50,
        footerY + 28,
        { align: 'center', width: contentWidth },
      );

    doc.end();
  });
}
