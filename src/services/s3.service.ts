import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import getConfig from "../config";

const config = getConfig();

const s3Client = new S3Client({
  region: config.s3.region,
  credentials:
    config.s3.accessKeyId && config.s3.secretAccessKey
      ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
      : undefined,
});

export async function createUploadUrl(params: { contentType: string; filename: string; prefix?: string }) {
  if (!config.s3.bucket) {
    throw new Error("S3 bucket is not configured");
  }

  const safeName = params.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const key = `${params.prefix ? params.prefix.replace(/\/$/, "") + "/" : ""}${timestamp}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: params.contentType?.trim?.() || "application/octet-stream",
  });

  const uploadLink = await getSignedUrl(s3Client, command, { expiresIn: 60 * 5 });
  const fileLink = config.s3.publicBaseUrl
    ? `${config.s3.publicBaseUrl}/${key}`
    : `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
  return { uploadLink, fileLink, key };
}
