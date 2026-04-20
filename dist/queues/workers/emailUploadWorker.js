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
exports.startEmailUploadWorker = startEmailUploadWorker;
exports.stopEmailUploadWorker = stopEmailUploadWorker;
const bullmq_1 = require("bullmq");
const fs = __importStar(require("fs"));
const redis_1 = require("../../lib/redis");
const prisma_1 = require("../../lib/prisma");
const logger_1 = require("../../lib/logger");
async function setProgress(jobId, state) {
    const redis = (0, redis_1.getRedis)();
    await redis.set(`v2:email:upload:${jobId}`, JSON.stringify(state), 'EX', 3600); // 1-hour TTL
}
function parseCSV(content) {
    const lines = content.split('\n').filter(l => l.trim());
    return lines.map(line => {
        const cols = [];
        let inQuote = false;
        let cur = '';
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuote && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                }
                else {
                    inQuote = !inQuote;
                }
            }
            else if (ch === ',' && !inQuote) {
                cols.push(cur.trim());
                cur = '';
            }
            else {
                cur += ch;
            }
        }
        cols.push(cur.trim());
        return cols;
    });
}
async function processUpload(job) {
    const { jobId, listId, businessId, filePath, fileName, fieldMap } = job.data;
    const prisma = (0, prisma_1.getPrisma)();
    const state = {
        status: 'processing',
        progress: 0,
        totalRows: 0,
        imported: 0,
        skipped: 0,
        duplicates: 0,
        errors: [],
    };
    await setProgress(jobId, state);
    try {
        // Read file
        if (!fs.existsSync(filePath))
            throw new Error('Upload file not found');
        const content = fs.readFileSync(filePath, 'utf-8');
        // Parse CSV
        const rows = parseCSV(content);
        if (rows.length < 2) {
            state.status = 'error';
            state.errors.push('File is empty or has no data rows');
            await setProgress(jobId, state);
            return;
        }
        // Header row
        const headers = rows[0].map(h => h.toLowerCase().trim());
        const dataRows = rows.slice(1);
        state.totalRows = dataRows.length;
        await setProgress(jobId, state);
        // Map column indices
        const emailCol = headers.indexOf(fieldMap['email'] ?? 'email');
        const nameCol = headers.indexOf(fieldMap['name'] ?? 'name');
        const tagsCol = headers.indexOf(fieldMap['tags'] ?? 'tags');
        if (emailCol === -1) {
            state.status = 'error';
            state.errors.push(`Email column "${fieldMap['email'] ?? 'email'}" not found in headers: ${headers.join(', ')}`);
            await setProgress(jobId, state);
            return;
        }
        // Batch insert — 100 rows at a time
        const BATCH_SIZE = 100;
        const batches = [];
        for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
            batches.push(dataRows.slice(i, i + BATCH_SIZE).map((_, idx) => String(i + idx)));
        }
        let rowIndex = 0;
        for (let batchNum = 0; batchNum < Math.ceil(dataRows.length / BATCH_SIZE); batchNum++) {
            const batchRows = dataRows.slice(batchNum * BATCH_SIZE, (batchNum + 1) * BATCH_SIZE);
            const toCreate = batchRows.map(row => {
                const email = row[emailCol]?.trim().toLowerCase() ?? '';
                const name = nameCol >= 0 ? (row[nameCol]?.trim() || undefined) : undefined;
                const rawTags = tagsCol >= 0 ? (row[tagsCol]?.trim() || '') : '';
                const tags = rawTags ? rawTags.split(/[;|]/).map(t => t.trim()).filter(Boolean) : [];
                return { email, name, tags };
            }).filter(r => {
                if (!r.email || !r.email.includes('@')) {
                    state.skipped++;
                    return false;
                }
                return true;
            });
            // Upsert each subscriber
            for (const sub of toCreate) {
                try {
                    const existing = await prisma.emailSubscriber.findUnique({
                        where: { listId_email: { listId, email: sub.email } },
                        select: { id: true },
                    });
                    if (existing) {
                        state.duplicates++;
                    }
                    else {
                        await prisma.emailSubscriber.create({
                            data: {
                                businessId,
                                listId,
                                email: sub.email,
                                name: sub.name,
                                tags: sub.tags,
                                source: `upload:${fileName}`,
                                status: 'active',
                            },
                        });
                        state.imported++;
                    }
                }
                catch (e) {
                    state.skipped++;
                    if (state.errors.length < 10) {
                        state.errors.push(`Row ${rowIndex + 1}: ${e instanceof Error ? e.message : 'Insert failed'}`);
                    }
                }
                rowIndex++;
            }
            // Update progress
            state.progress = Math.round((rowIndex / state.totalRows) * 100);
            await setProgress(jobId, state);
        }
        // Cleanup temp file
        try {
            fs.unlinkSync(filePath);
        }
        catch { /* ignore */ }
        state.status = 'complete';
        state.progress = 100;
        state.completedAt = new Date().toISOString();
        await setProgress(jobId, state);
        logger_1.logger.info({ module: 'emailUploadWorker', jobId, imported: state.imported, duplicates: state.duplicates, skipped: state.skipped }, 'Upload complete');
    }
    catch (err) {
        state.status = 'error';
        state.errors.push(err instanceof Error ? err.message : 'Unknown error');
        await setProgress(jobId, state);
        logger_1.logger.error({ module: 'emailUploadWorker', jobId, err }, 'Upload failed');
        throw err;
    }
}
let worker = null;
function startEmailUploadWorker() {
    if (worker)
        return;
    worker = new bullmq_1.Worker('v2-email-upload', processUpload, {
        connection: (0, redis_1.getBullRedis)(),
        concurrency: 2,
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ module: 'emailUploadWorker', jobId: job?.data?.jobId, err }, 'Upload job failed');
    });
    logger_1.logger.info({ module: 'emailUploadWorker' }, 'Email upload worker started');
}
async function stopEmailUploadWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}
//# sourceMappingURL=emailUploadWorker.js.map