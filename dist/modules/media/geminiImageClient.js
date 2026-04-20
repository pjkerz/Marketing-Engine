"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImageCandidates = generateImageCandidates;
/**
 * geminiImageClient.ts
 * Generates images via Google Imagen 4 Fast REST API.
 *
 * Requires a paid Google AI Studio API key (Imagen is not on the free tier).
 * To upgrade: https://ai.dev/projects → select project → enable billing.
 *
 * REST endpoint: POST /v1beta/models/imagen-4.0-fast-generate-001:predict
 */
const env_1 = require("../../config/env");
const logger_1 = require("../../lib/logger");
const errorHandler_1 = require("../../middleware/errorHandler");
const crypto_1 = require("crypto");
const IMAGEN_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict';
const BLOCKED_PATTERNS = [
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/, // real person names (basic heuristic)
    /\b(nike|apple|google|amazon|facebook|meta|twitter|tesla|microsoft)\b/i,
    /text (on|in|inside|overlay)/i,
    /\b(political|election|vote|politician)\b/i,
];
const MAX_PROMPT_LENGTH = 500;
function validatePrompt(prompt) {
    if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new errorHandler_1.AppError('MEDIA_PROMPT_REJECTED', `Image prompt exceeds ${MAX_PROMPT_LENGTH} character limit.`, 422, { promptLength: prompt.length });
    }
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(prompt)) {
            throw new errorHandler_1.AppError('MEDIA_PROMPT_REJECTED', 'Image prompt contains blocked content (brand names, real person names, or political content are not allowed).', 422);
        }
    }
}
async function generateImageCandidates(params) {
    validatePrompt(params.prompt);
    const numberOfImages = Math.min(params.numberOfImages, 4);
    logger_1.logger.info({
        module: 'geminiImageClient',
        action: 'generateStart',
        requestId: params.requestId,
        aspectRatio: params.aspectRatio,
        numberOfImages,
    }, 'Generating image candidates via Imagen 4 Fast');
    const response = await fetch(IMAGEN_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env_1.env.GOOGLE_AI_API_KEY,
        },
        body: JSON.stringify({
            instances: [{ prompt: params.prompt }],
            parameters: {
                sampleCount: numberOfImages,
                aspectRatio: params.aspectRatio,
                outputMimeType: 'image/jpeg',
            },
        }),
    });
    const body = await response.json();
    if (!response.ok || body.error) {
        const errMsg = body.error?.message ?? `HTTP ${response.status}`;
        logger_1.logger.error({ module: 'geminiImageClient', requestId: params.requestId, status: response.status, err: errMsg }, 'Imagen API error');
        if (errMsg.toLowerCase().includes('paid') || errMsg.toLowerCase().includes('billing') || response.status === 400) {
            throw new errorHandler_1.AppError('MEDIA_GENERATION_UNAVAILABLE', 'Image generation requires a paid Google AI plan. Visit https://ai.dev/projects to upgrade.', 402);
        }
        if (errMsg.includes('SAFETY') || errMsg.toLowerCase().includes('blocked')) {
            throw new errorHandler_1.AppError('MEDIA_PROMPT_REJECTED', 'Image generation was blocked by safety filters.', 422);
        }
        throw new errorHandler_1.AppError('MEDIA_GENERATION_FAILED', errMsg, 500);
    }
    const predictions = body.predictions ?? [];
    if (predictions.length === 0) {
        throw new errorHandler_1.AppError('MEDIA_GENERATION_FAILED', 'Imagen returned no images.', 500);
    }
    const candidates = predictions.map((p) => ({
        candidateId: (0, crypto_1.randomBytes)(8).toString('hex'),
        base64Data: p.bytesBase64Encoded,
        mimeType: p.mimeType ?? 'image/jpeg',
    }));
    logger_1.logger.info({
        module: 'geminiImageClient',
        action: 'generateComplete',
        requestId: params.requestId,
        candidateCount: candidates.length,
    }, 'Image candidates generated');
    return candidates;
}
//# sourceMappingURL=geminiImageClient.js.map