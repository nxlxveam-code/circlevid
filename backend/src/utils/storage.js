const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const provider = process.env.STORAGE_PROVIDER || 'local';

let s3Client = null;

function createClient() {
  if (provider === 'r2') {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  if (provider === 's3') {
    return new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return null;
}

if (provider !== 'local') {
  s3Client = createClient();
}

function getBucketName() {
  return provider === 'r2'
    ? process.env.R2_BUCKET_NAME
    : process.env.S3_BUCKET_NAME;
}

function getPublicBaseUrl() {
  return provider === 'r2'
    ? process.env.R2_PUBLIC_URL
    : process.env.S3_PUBLIC_URL;
}

/**
 * Upload a buffer to cloud storage or local disk
 */
async function uploadFile(key, buffer, contentType = 'video/mp4') {
  if (provider === 'local') {
    // Сохраняем локально в папке backend/uploads
    const uploadsPath = path.join(__dirname, '../../uploads', key);
    
    // Создаем папки если их нет
    fs.mkdirSync(path.dirname(uploadsPath), { recursive: true });
    
    // Записываем файл
    fs.writeFileSync(uploadsPath, buffer);
    
    const baseUrl = process.env.HOST_URL || `http://localhost:${process.env.PORT || 4000}`;
    return `${baseUrl}/uploads/${key}`;
  }

  // Облачное хранилище (R2 / S3)
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  });

  await s3Client.send(command);
  const baseUrl = getPublicBaseUrl().replace(/\/$/, '');
  return `${baseUrl}/${key}`;
}

/**
 * Delete a file
 */
async function deleteFile(key) {
  if (provider === 'local') {
    const filePath = path.join(__dirname, '../../uploads', key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });
  await s3Client.send(command);
}

module.exports = { uploadFile, deleteFile, provider };
