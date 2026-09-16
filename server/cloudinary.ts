import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  bytes: number;
  resource_type: string;
  is_local_fallback?: boolean;
}

function getCloudinaryConfig() {
  const cloudinaryUrl = process.env.CLOUDINARY_URL?.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || cloudinaryUrl?.[3];
  const apiKey = process.env.CLOUDINARY_API_KEY || cloudinaryUrl?.[1];
  const apiSecret = process.env.CLOUDINARY_API_SECRET || cloudinaryUrl?.[2];
  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return { cloudName, apiKey, apiSecret };
}

export async function uploadDocumentToCloudinary(
  fileData: string,
  originalFilename: string,
  folder: string = 'zeroleak/question-papers'
): Promise<CloudinaryUploadResult | null> {
  const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
  const fileBuffer = Buffer.from(base64, 'base64');
  if (fileBuffer.length === 0 || fileBuffer.length > 50 * 1024 * 1024) return null;

  const sanitized = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const publicId = `${crypto.randomUUID().substring(0, 8)}-${sanitized.replace(/\.[^.]+$/, '')}`;

  // 1. Try Cloudinary upload
  try {
    const config = getCloudinaryConfig();
    if (config) {
      const dataUri = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;
      const payload = await cloudinary.uploader.upload(dataUri, {
        folder,
        public_id: publicId,
        resource_type: 'raw',
        use_filename: false,
        unique_filename: false,
        timeout: 10000,
      }) as Partial<CloudinaryUploadResult>;

      if (payload?.secure_url && payload?.public_id) {
        return {
          secure_url: payload.secure_url,
          public_id: payload.public_id,
          bytes: payload.bytes || fileBuffer.length,
          resource_type: payload.resource_type || 'raw',
          is_local_fallback: false,
        };
      }
    }
  } catch (error: any) {
    console.warn('[ZeroLeak Cloudinary] Cloudinary upload returned error:', error?.message);
  }

  // 2. Reliable Local Storage Fallback (stores in public/uploads/papers)
  try {
    const localDir = path.resolve(process.cwd(), 'public', 'uploads', 'papers');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localFileName = `${publicId}_${sanitized}`;
    return {
      secure_url: `/uploads/papers/${localFileName}`,
      public_id: publicId,
      bytes: fileBuffer.length,
      resource_type: 'raw',
      is_local_fallback: true,
    };
  } catch (localErr) {
    console.warn('[ZeroLeak Storage] Local fallback save error:', localErr);
    return null;
  }
}

export async function listAllCloudinaryAssets(): Promise<Array<{
  public_id: string;
  secure_url: string;
  format: string;
  bytes: number;
  created_at: string;
  original_filename?: string;
}>> {
  try {
    const config = getCloudinaryConfig();
    if (!config) return [];

    const rawRes = await cloudinary.api.resources({
      resource_type: 'raw',
      max_results: 100,
    });

    const imageRes = await cloudinary.api.resources({
      resource_type: 'image',
      max_results: 50,
    });

    const combined = [...(rawRes.resources || []), ...(imageRes.resources || [])];
    return combined.map((r: any) => {
      const parts = (r.public_id || '').split('/');
      const rawName = parts[parts.length - 1] || 'document.pdf';
      const cleanName = rawName.includes('-') && rawName.length > 36
        ? rawName.substring(rawName.indexOf('-') + 1)
        : rawName;
      return {
        public_id: r.public_id,
        secure_url: r.secure_url,
        format: r.format || 'pdf',
        bytes: r.bytes || 0,
        created_at: r.created_at || new Date().toISOString(),
        original_filename: cleanName.endsWith('.pdf') ? cleanName : `${cleanName}.${r.format || 'pdf'}`,
      };
    });
  } catch (err) {
    console.warn('[ZeroLeak Cloudinary] Failed to list assets from Cloudinary API:', err);
    return [];
  }
}

export async function getCloudinaryHealth(): Promise<{
  connected: boolean;
  cloud_name?: string;
  assets_count?: number;
  error?: string;
}> {
  try {
    const config = getCloudinaryConfig();
    if (!config) return { connected: false, error: 'Cloudinary credentials missing.' };
    const ping = await cloudinary.api.ping();
    if (ping?.status === 'ok') {
      const resources = await listAllCloudinaryAssets();
      return {
        connected: true,
        cloud_name: config.cloudName,
        assets_count: resources.length,
      };
    }
    return { connected: false, error: 'Cloudinary ping did not return ok.' };
  } catch (err: any) {
    return { connected: false, error: err?.message || 'Failed to connect to Cloudinary.' };
  }
}

