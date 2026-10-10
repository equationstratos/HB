import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';

export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface FileStorage {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Développement : fichiers sur le disque local, dans UPLOAD_DIR. */
export class LocalDiskStorage implements FileStorage {
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  private path(key: string): string {
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error('Clé de stockage invalide');
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data, { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined);
  }
}

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/** Production : stockage compatible S3 (AWS, Scaleway, OVH…), chiffré côté serveur. */
export class S3Storage implements FileStorage {
  // Chargé à la demande pour ne pas alourdir le démarrage en développement.
  private clientPromise: Promise<{
    client: import('@aws-sdk/client-s3').S3Client;
    sdk: typeof import('@aws-sdk/client-s3');
  }> | null = null;

  constructor(private readonly config: S3Config) {}

  private async s3() {
    this.clientPromise ??= import('@aws-sdk/client-s3').then((sdk) => ({
      sdk,
      client: new sdk.S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint || undefined,
        forcePathStyle: !!this.config.endpoint,
        credentials:
          this.config.accessKeyId && this.config.secretAccessKey
            ? { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey }
            : undefined,
      }),
    }));
    return this.clientPromise;
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<void> {
    const { client, sdk } = await this.s3();
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const { client, sdk } = await this.s3();
    const out = await client.send(
      new sdk.GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    const bytes = await out.Body?.transformToByteArray();
    if (!bytes) throw new Error('Fichier introuvable');
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    const { client, sdk } = await this.s3();
    await client.send(new sdk.DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
