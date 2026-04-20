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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.zohoClient = void 0;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const fs = __importStar(require("fs"));
const env_1 = require("../../config/env");
const redis_1 = require("../../lib/redis");
const logger_1 = require("../../lib/logger");
const FOLDER_CACHE_TTL = 3600; // 1 hour
class ZohoClient {
    accessToken = null;
    tokenExpiresAt = 0;
    client;
    constructor() {
        this.client = axios_1.default.create({ baseURL: 'https://www.zohoapis.com/workdrive/api/v1' });
        this.client.interceptors.response.use((r) => r, async (err) => {
            if (err.response?.status === 401 && !err.config._retried) {
                err.config._retried = true;
                await this.refreshToken();
                err.config.headers['Authorization'] = `Zoho-oauthtoken ${this.accessToken}`;
                return this.client.request(err.config);
            }
            throw err;
        });
    }
    async refreshTokenIfNeeded() {
        if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000)
            return;
        await this.refreshToken();
    }
    async refreshToken() {
        const resp = await axios_1.default.post('https://accounts.zoho.com/oauth/v2/token', null, {
            params: {
                refresh_token: env_1.env.ZOHO_REFRESH_TOKEN,
                client_id: env_1.env.ZOHO_CLIENT_ID,
                client_secret: env_1.env.ZOHO_CLIENT_SECRET,
                grant_type: 'refresh_token',
            },
        });
        this.accessToken = resp.data.access_token;
        this.tokenExpiresAt = Date.now() + resp.data.expires_in * 1000;
        logger_1.logger.info({ module: 'zohoClient', action: 'tokenRefreshed' }, 'Zoho token refreshed');
    }
    authHeader() {
        return `Zoho-oauthtoken ${this.accessToken}`;
    }
    async resolveOrCreateAffiliateFolder(affiliateCode) {
        const redis = (0, redis_1.getRedis)();
        const cacheKey = `v2:zoho:folder:${affiliateCode}`;
        const cached = await redis.get(cacheKey);
        if (cached)
            return cached;
        await this.refreshTokenIfNeeded();
        // List children of ZOHO_AFFILIATES_FOLDER_ID to find existing folder
        const listResp = await this.client.get(`/files/${env_1.env.ZOHO_AFFILIATES_FOLDER_ID}/files`, {
            headers: { Authorization: this.authHeader() },
            params: { filter_type: 'folder' },
        });
        const items = listResp.data?.data ?? [];
        const existing = items.find((f) => f.attributes.name === affiliateCode);
        if (existing) {
            const folderId = existing.id;
            await redis.setex(cacheKey, FOLDER_CACHE_TTL, folderId);
            return folderId;
        }
        // Create folder
        const createResp = await this.client.post('/files', {
            data: {
                attributes: { name: affiliateCode, parent_id: env_1.env.ZOHO_AFFILIATES_FOLDER_ID },
                type: 'files',
            },
        }, { headers: { Authorization: this.authHeader() } });
        const folderId = createResp.data.data.id;
        await redis.setex(cacheKey, FOLDER_CACHE_TTL, folderId);
        logger_1.logger.info({ module: 'zohoClient', action: 'folderCreated', affiliateCode, folderId }, 'Created affiliate folder');
        return folderId;
    }
    async uploadResumeToZoho(params) {
        await this.refreshTokenIfNeeded();
        const folderId = await this.resolveOrCreateAffiliateFolder(params.affiliateCode);
        const form = new form_data_1.default();
        form.append('content', fs.createReadStream(params.filePath), {
            filename: params.fileName,
            contentType: params.mimeType,
        });
        form.append('filename', params.fileName);
        form.append('parent_id', folderId);
        form.append('override-name-exist', 'true');
        const resp = await this.client.post('/upload', form, {
            headers: { ...form.getHeaders(), Authorization: this.authHeader() },
        });
        const fileId = resp.data.data[0]?.attributes?.resource_id;
        logger_1.logger.info({ module: 'zohoClient', action: 'resumeUploaded', affiliateCode: params.affiliateCode, fileId }, 'Resume uploaded');
        return { fileId, fileName: params.fileName, folderId };
    }
    async uploadGeneratedImageToZoho(params) {
        await this.refreshTokenIfNeeded();
        const parentFolder = await this.resolveOrCreateAffiliateFolder(params.affiliateCode);
        // Resolve or create /generated subfolder
        const genFolderKey = `v2:zoho:folder:${params.affiliateCode}:generated`;
        const redis = (0, redis_1.getRedis)();
        let genFolderId = await redis.get(genFolderKey);
        if (!genFolderId) {
            const createResp = await this.client.post('/files', {
                data: {
                    attributes: { name: 'generated', parent_id: parentFolder },
                    type: 'files',
                },
            }, { headers: { Authorization: this.authHeader() } });
            genFolderId = createResp.data.data.id;
            await redis.setex(genFolderKey, FOLDER_CACHE_TTL, genFolderId);
        }
        const buffer = Buffer.from(params.base64Data, 'base64');
        const form = new form_data_1.default();
        form.append('content', buffer, { filename: params.fileName, contentType: params.mimeType });
        form.append('filename', params.fileName);
        form.append('parent_id', genFolderId);
        const resp = await this.client.post('/upload', form, {
            headers: { ...form.getHeaders(), Authorization: this.authHeader() },
        });
        const fileId = resp.data.data[0]?.attributes?.resource_id;
        return { fileId, fileName: params.fileName, folderId: genFolderId };
    }
    async browseAffiliateMediaFolder(params) {
        await this.refreshTokenIfNeeded();
        const folderId = await this.resolveOrCreateAffiliateFolder(params.affiliateCode);
        const resp = await this.client.get(`/files/${folderId}/files`, {
            headers: { Authorization: this.authHeader() },
            params: { page: params.page ?? 1, per_page: params.limit ?? 50 },
        });
        const items = (resp.data?.data ?? []).map((f) => ({
            id: f.id,
            name: f.attributes.name,
            mimeType: f.attributes.content_type,
            size: f.attributes.storage_info?.size_in_bytes ?? 0,
            createdTime: f.attributes.created_time,
        }));
        return { items, hasMore: resp.data?.page_info?.has_more ?? false };
    }
    async browseSharedMediaLibrary(params) {
        await this.refreshTokenIfNeeded();
        const resp = await this.client.get(`/files/${env_1.env.ZOHO_FOLDER_ID}/files`, {
            headers: { Authorization: this.authHeader() },
            params: { page: params.page ?? 1, per_page: params.limit ?? 50 },
        });
        const items = (resp.data?.data ?? []).map((f) => ({
            id: f.id,
            name: f.attributes.name,
            mimeType: f.attributes.content_type,
            size: f.attributes.storage_info?.size_in_bytes ?? 0,
            createdTime: f.attributes.created_time,
        }));
        return { items, hasMore: resp.data?.page_info?.has_more ?? false };
    }
    async deleteFile(providerFileId) {
        await this.refreshTokenIfNeeded();
        await this.client.delete(`/files/${providerFileId}`, {
            headers: { Authorization: this.authHeader() },
        });
        logger_1.logger.info({ module: 'zohoClient', action: 'fileDeleted', providerFileId }, 'File deleted');
    }
    async flushFolderCache(affiliateCode) {
        const redis = (0, redis_1.getRedis)();
        await redis.del(`v2:zoho:folder:${affiliateCode}`);
        await redis.del(`v2:zoho:folder:${affiliateCode}:generated`);
    }
}
// Singleton
exports.zohoClient = new ZohoClient();
//# sourceMappingURL=zohoClient.js.map