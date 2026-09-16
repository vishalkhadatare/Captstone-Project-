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
    const diskPath = path.join(localDir, localFileName);
    fs.writeFileSync(diskPath, fileBuffer);

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
