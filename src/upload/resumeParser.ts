import * as fs from 'fs';
import * as path from 'path';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

export interface ParseResult {
  text: string;
  pageCount?: number;
  mimeType: string;
}

export function validateResumeFile(file: Express.Multer.File): void {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError('UPLOAD_INVALID_TYPE', 'Only PDF and DOCX files are accepted.', 415);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError('UPLOAD_INVALID_TYPE', 'File extension must be .pdf or .docx.', 415);
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new AppError('UPLOAD_TOO_LARGE', 'File exceeds the 10 MB limit.', 413);
  }
}

export async function parseResume(filePath: string, mimeType: string): Promise<ParseResult> {
  try {
    if (mimeType === 'application/pdf') {
      return await parsePdf(filePath);
    } else {
      return await parseDocx(filePath);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ module: 'resumeParser', action: 'parseFailed', mimeType, err }, 'Parse failed');
    throw new AppError('UPLOAD_PARSE_FAILED', 'Failed to extract text from file.', 422);
  } finally {
    // Clean up temp file immediately
    fs.unlink(filePath, () => {});
  }
}

async function parsePdf(filePath: string): Promise<ParseResult> {
  // Dynamic import to handle the module properly
  const pdfParse = await import('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse.default(buffer);
  return { text: data.text, pageCount: data.numpages, mimeType: 'application/pdf' };
}

async function parseDocx(filePath: string): Promise<ParseResult> {
  const mammoth = await import('mammoth');
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
}
