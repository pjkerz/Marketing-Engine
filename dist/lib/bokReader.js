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
exports.readBokChunks = readBokChunks;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const BOK_BASE = path.join(process.cwd(), 'bok');
/**
 * Read relevant BOK (Body of Knowledge) chunks for a given business and topic.
 * Returns up to ~3000 chars of relevant podcast-derived knowledge.
 */
function readBokChunks(businessSlug, topic, maxChars = 3000) {
    const bokDir = path.join(BOK_BASE, businessSlug);
    if (!fs.existsSync(bokDir))
        return '';
    const keywords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const chunks = [];
    try {
        for (const file of fs.readdirSync(bokDir)) {
            if (!file.endsWith('.md') && !file.endsWith('.txt'))
                continue;
            const raw = fs.readFileSync(path.join(bokDir, file), 'utf-8');
            // Split into ~500-char paragraphs
            const paragraphs = raw.split(/\n{2,}/);
            for (const para of paragraphs) {
                if (para.length < 80)
                    continue;
                const lower = para.toLowerCase();
                const score = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
                if (score > 0) {
                    chunks.push({ text: para.trim(), score });
                }
            }
        }
    }
    catch { /* ignore */ }
    if (!chunks.length) {
        // Fallback: grab first few paragraphs as general context
        try {
            const files = fs.readdirSync(bokDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
            if (files.length) {
                const raw = fs.readFileSync(path.join(bokDir, files[0]), 'utf-8');
                return raw.slice(0, maxChars);
            }
        }
        catch { /* ignore */ }
        return '';
    }
    // Sort by relevance, pick best chunks up to maxChars
    chunks.sort((a, b) => b.score - a.score);
    let result = '';
    for (const c of chunks) {
        if (result.length + c.text.length > maxChars)
            break;
        result += c.text + '\n\n';
    }
    return result.trim();
}
//# sourceMappingURL=bokReader.js.map