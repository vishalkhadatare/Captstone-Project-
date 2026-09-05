import crypto from 'node:crypto';
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  bytes: number;
  resource_type: string;
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
  folder: string
): Promise<CloudinaryUploadResult | null> {
  try {
    const config = getCloudinaryConfig();
    if (!config) return null;
    const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const fileBuffer = Buffer.from(base64, 'base64');
    if (fileBuffer.length === 0 || fileBuffer.length > 50 * 1024 * 1024) return null;

    const publicId = `${crypto.randomUUID()}-${originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '')}`;
    const dataUri = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;

    const payload = await cloudinary.uploader.upload(dataUri, {
      folder,
      public_id: publicId,
      resource_type: 'raw',
      use_filename: false,
      unique_filename: false,
      timeout: 30000,
    }) as Partial<CloudinaryUploadResult>;

    if (!payload.secure_url || !payload.public_id) {
      return null;
    }
    return {
      secure_url: payload.secure_url,
      public_id: payload.public_id,
      bytes: payload.bytes || fileBuffer.length,
      resource_type: payload.resource_type || 'raw',
    };
  } catch (error: any) {
    console.warn('[ZeroLeak Storage] Cloudinary upload skipped / offline:', error?.message);
    return null;
  }
}
