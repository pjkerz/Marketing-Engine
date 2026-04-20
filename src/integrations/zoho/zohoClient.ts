import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import { env } from '../../config/env';
import { getRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';

const FOLDER_CACHE_TTL = 3600; // 1 hour

export interface ZohoUploadResult {
  fileId: string;
  fileName: string;
  folderId: string;
}

export interface ZohoBrowseItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
}

export interface ZohoBrowseResult {
  items: ZohoBrowseItem[];
  hasMore: boolean;
}

class ZohoClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({ baseURL: 'https://www.zohoapis.com/workdrive/api/v1' });
    this.client.interceptors.response.use(
      (r) => r,
      async (err) => {
        if (err.response?.status === 401 && !err.config._retried) {
          err.config._retried = true;
          await this.refreshToken();
          err.config.headers['Authorization'] = `Zoho-oauthtoken ${this.accessToken}`;
          return this.client.request(err.config);
        }
        throw err;
      },
    );
  }

  async refreshTokenIfNeeded(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) return;
    await this.refreshToken();
  }

  private async refreshToken(): Promise<void> {
    const resp = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
      params: {
        refresh_token: env.ZOHO_REFRESH_TOKEN,
        client_id: env.ZOHO_CLIENT_ID,
        client_secret: env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token',
      },
    });
    this.accessToken = resp.data.access_token as string;
    this.tokenExpiresAt = Date.now() + (resp.data.expires_in as number) * 1000;
    logger.info({ module: 'zohoClient', action: 'tokenRefreshed' }, 'Zoho token refreshed');
  }

  private authHeader(): string {
    return `Zoho-oauthtoken ${this.accessToken}`;
  }

  async resolveOrCreateAffiliateFolder(affiliateCode: string): Promise<string> {
    const redis = getRedis();
    const cacheKey = `v2:zoho:folder:${affiliateCode}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    await this.refreshTokenIfNeeded();

    // List children of ZOHO_AFFILIATES_FOLDER_ID to find existing folder
    const listResp = await this.client.get(`/files/${env.ZOHO_AFFILIATES_FOLDER_ID}/files`, {
      headers: { Authorization: this.authHeader() },
      params: { filter_type: 'folder' },
    });

    const items = listResp.data?.data ?? [];
    const existing = items.find((f: { attributes: { name: string; id: string } }) =>
      f.attributes.name === affiliateCode,
    );

    if (existing) {
      const folderId = existing.id as string;
      await redis.setex(cacheKey, FOLDER_CACHE_TTL, folderId);
      return folderId;
    }

    // Create folder
    const createResp = await this.client.post('/files', {
      data: {
        attributes: { name: affiliateCode, parent_id: env.ZOHO_AFFILIATES_FOLDER_ID },
        type: 'files',
      },
    }, { headers: { Authorization: this.authHeader() } });

    const folderId = createResp.data.data.id as string;
    await redis.setex(cacheKey, FOLDER_CACHE_TTL, folderId);
    logger.info({ module: 'zohoClient', action: 'folderCreated', affiliateCode, folderId }, 'Created affiliate folder');
    return folderId;
  }

  async uploadResumeToZoho(params: {
    affiliateCode: string;
    filePath: string;
    fileName: string;
    mimeType: string;
  }): Promise<ZohoUploadResult> {
    await this.refreshTokenIfNeeded();
    const folderId = await this.resolveOrCreateAffiliateFolder(params.affiliateCode);

    const form = new FormData();
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

    const fileId = resp.data.data[0]?.attributes?.resource_id as string;
    logger.info({ module: 'zohoClient', action: 'resumeUploaded', affiliateCode: params.affiliateCode, fileId }, 'Resume uploaded');
    return { fileId, fileName: params.fileName, folderId };
  }

  async uploadGeneratedImageToZoho(params: {
    affiliateCode: string;
    base64Data: string;
    mimeType: string;
    fileName: string;
  }): Promise<ZohoUploadResult> {
    await this.refreshTokenIfNeeded();
    const parentFolder = await this.resolveOrCreateAffiliateFolder(params.affiliateCode);

    // Resolve or create /generated subfolder
    const genFolderKey = `v2:zoho:folder:${params.affiliateCode}:generated`;
    const redis = getRedis();
    let genFolderId = await redis.get(genFolderKey);
    if (!genFolderId) {
      const createResp = await this.client.post('/files', {
        data: {
          attributes: { name: 'generated', parent_id: parentFolder },
          type: 'files',
        },
      }, { headers: { Authorization: this.authHeader() } });
      genFolderId = createResp.data.data.id as string;
      await redis.setex(genFolderKey, FOLDER_CACHE_TTL, genFolderId);
    }

    const buffer = Buffer.from(params.base64Data, 'base64');
    const form = new FormData();
    form.append('content', buffer, { filename: params.fileName, contentType: params.mimeType });
    form.append('filename', params.fileName);
    form.append('parent_id', genFolderId);

    const resp = await this.client.post('/upload', form, {
      headers: { ...form.getHeaders(), Authorization: this.authHeader() },
    });

    const fileId = resp.data.data[0]?.attributes?.resource_id as string;
    return { fileId, fileName: params.fileName, folderId: genFolderId };
  }

  async browseAffiliateMediaFolder(params: {
    affiliateCode: string;
    page?: number;
    limit?: number;
  }): Promise<ZohoBrowseResult> {
    await this.refreshTokenIfNeeded();
    const folderId = await this.resolveOrCreateAffiliateFolder(params.affiliateCode);

    const resp = await this.client.get(`/files/${folderId}/files`, {
      headers: { Authorization: this.authHeader() },
      params: { page: params.page ?? 1, per_page: params.limit ?? 50 },
    });

    const items = (resp.data?.data ?? []).map((f: {
      id: string;
      attributes: { name: string; content_type: string; storage_info: { size_in_bytes: number }; created_time: string };
    }) => ({
      id: f.id,
      name: f.attributes.name,
      mimeType: f.attributes.content_type,
      size: f.attributes.storage_info?.size_in_bytes ?? 0,
      createdTime: f.attributes.created_time,
    }));

    return { items, hasMore: resp.data?.page_info?.has_more ?? false };
  }

  async browseSharedMediaLibrary(params: { page?: number; limit?: number }): Promise<ZohoBrowseResult> {
    await this.refreshTokenIfNeeded();

    const resp = await this.client.get(`/files/${env.ZOHO_FOLDER_ID}/files`, {
      headers: { Authorization: this.authHeader() },
      params: { page: params.page ?? 1, per_page: params.limit ?? 50 },
    });

    const items = (resp.data?.data ?? []).map((f: {
      id: string;
      attributes: { name: string; content_type: string; storage_info: { size_in_bytes: number }; created_time: string };
    }) => ({
      id: f.id,
      name: f.attributes.name,
      mimeType: f.attributes.content_type,
      size: f.attributes.storage_info?.size_in_bytes ?? 0,
      createdTime: f.attributes.created_time,
    }));

    return { items, hasMore: resp.data?.page_info?.has_more ?? false };
  }

  async deleteFile(providerFileId: string): Promise<void> {
    await this.refreshTokenIfNeeded();
    await this.client.delete(`/files/${providerFileId}`, {
      headers: { Authorization: this.authHeader() },
    });
    logger.info({ module: 'zohoClient', action: 'fileDeleted', providerFileId }, 'File deleted');
  }

  async flushFolderCache(affiliateCode: string): Promise<void> {
    const redis = getRedis();
    await redis.del(`v2:zoho:folder:${affiliateCode}`);
    await redis.del(`v2:zoho:folder:${affiliateCode}:generated`);
  }
}

// Singleton
export const zohoClient = new ZohoClient();
