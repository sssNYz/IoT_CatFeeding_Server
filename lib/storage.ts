import { Client } from "minio";

// Images and sounds live in one private MinIO bucket; PostgreSQL keeps only the object key (spec Section 7).
export const BUCKET = "catfeeder";

const globalForMinio = globalThis as unknown as { minio?: Client };

function client() {
  return (globalForMinio.minio ??= connect());
}

function connect() {
  const url = new URL(process.env.MINIO_URL ?? "http://minio:9000");
  const accessKey = process.env.MINIO_ROOT_USER;
  const secretKey = process.env.MINIO_ROOT_PASSWORD;
  if (!accessKey || !secretKey) throw new Error("MINIO_ROOT_USER / MINIO_ROOT_PASSWORD are not set (see .env.example)");
  return new Client({
    endPoint: url.hostname,
    port: Number(url.port || 9000),
    useSSL: url.protocol === "https:",
    accessKey,
    secretKey,
  });
}

/** Create the bucket on first start. A new MinIO bucket is private: no anonymous access. */
export async function ensureBucket() {
  if (!(await client().bucketExists(BUCKET))) await client().makeBucket(BUCKET);
}

export const putObject = (key: string, data: Buffer, contentType: string) =>
  client().putObject(BUCKET, key, data, data.length, { "Content-Type": contentType });

export const getObject = (key: string) => client().getObject(BUCKET, key);
