import cloudinary from '../config/cloudinary';
import logger from '../config/logger';

interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Upload a base64 string to Cloudinary.
 */
export const uploadBase64 = async (base64Data: string, folder: string): Promise<UploadResult> => {
  // Ensure the data URI prefix
  const dataUri = base64Data.startsWith('data:')
    ? base64Data
    : `data:image/jpeg;base64,${base64Data}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `secret-space/${folder}`,
    resource_type: 'auto',
  });

  logger.info({ publicId: result.public_id }, '[Storage] File uploaded');
  return { url: result.secure_url, publicId: result.public_id };
};

/**
 * Upload a Buffer to Cloudinary.
 */
export const uploadBuffer = async (buffer: Buffer, folder: string): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `secret-space/${folder}`, resource_type: 'auto' },
      (error, result) => {
        if (error || !result) return reject(error || new Error('Upload failed'));
        logger.info({ publicId: result.public_id }, '[Storage] File uploaded');
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
};

/**
 * Delete a file from Cloudinary by public_id.
 */
export const deleteFile = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId);
  logger.info({ publicId }, '[Storage] File deleted');
};
