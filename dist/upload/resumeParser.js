"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateResumeFile = validateResumeFile;
exports.parseResume = parseResume;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../lib/logger");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];
function validateResumeFile(file) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new errorHandler_1.AppError('UPLOAD_INVALID_TYPE', 'Only PDF and DOCX files are accepted.', 415);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        throw new errorHandler_1.AppError('UPLOAD_INVALID_TYPE', 'File extension must be .pdf or .docx.', 415);
    }
    if (file.size > MAX_FILE_SIZE) {
        throw new errorHandler_1.AppError('UPLOAD_TOO_LARGE', 'File exceeds the 10 MB limit.', 413);
    }
}
async function parseResume(filePath, mimeType) {
    try {
        if (mimeType === 'application/pdf') {
            return await parsePdf(filePath);
        }
        else {
            return await parseDocx(filePath);
        }
    }
    catch (err) {
        if (err instanceof errorHandler_1.AppError)
            throw err;
        logger_1.logger.error({ module: 'resumeParser', action: 'parseFailed', mimeType, err }, 'Parse failed');
        throw new errorHandler_1.AppError('UPLOAD_PARSE_FAILED', 'Failed to extract text from file.', 422);
    }
    finally {
        // Clean up temp file immediately
        fs.unlink(filePath, () => { });
    }
}
async function parsePdf(filePath) {
    // Dynamic import to handle the module properly
    const pdfParse = await Promise.resolve().then(() => __importStar(require('pdf-parse')));
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse.default(buffer);
    return { text: data.text, pageCount: data.numpages, mimeType: 'application/pdf' };
}
async function parseDocx(filePath) {
    const mammoth = await Promise.resolve().then(() => __importStar(require('mammoth')));
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
}
//# sourceMappingURL=resumeParser.js.map