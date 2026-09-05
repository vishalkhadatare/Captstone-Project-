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
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return { cloudName, apiKey, apiSecret };
}

export async function uploadDocumentToCloudinary(
  fileData: string,
  originalFilename: string,
  folder: string
): Promise<CloudinaryUploadResult> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
  const fileBuffer = Buffer.from(base64, 'base64');
  if (fileBuffer.length === 0) throw new Error('The uploaded document is empty.');
  if (fileBuffer.length > 50 * 1024 * 1024) throw new Error('The uploaded document exceeds the 50 MB limit.');

  const publicId = `${crypto.randomUUID()}-${originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '')}`;
  const dataUri = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;
  let payload: Partial<CloudinaryUploadResult>;
  try {
    payload = await cloudinary.uploader.upload(dataUri, {
      folder,
      public_id: publicId,
      resource_type: 'raw',
      use_filename: false,
      unique_filename: false,
      timeout: 120000,
    }) as Partial<CloudinaryUploadResult>;
  } catch (error: any) {
    throw new Error(`Cloudinary upload failed: ${error?.message || 'Unable to reach Cloudinary.'}`);
  }
  if (!payload.secure_url || !payload.public_id) {
    throw new Error('Cloudinary upload returned an incomplete response.');
  }
  return {
    secure_url: payload.secure_url,
    public_id: payload.public_id,
    bytes: payload.bytes || fileBuffer.length,
    resource_type: payload.resource_type || 'raw',
  };
}
