import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly bucket: string;
  private readonly cdnUrl: string;
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('R2_BUCKET');
    this.cdnUrl = config.getOrThrow<string>('CDN_URL').replace(/\/+$/, '');
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.getOrThrow<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('R2_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('R2_SECRET_KEY'),
      },
      forcePathStyle: true,
    });
  }

  createUploadUrl(
    objectKey: string,
    contentType: string,
    expiresIn = 900,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn },
    );
  }

  async head(objectKey: string): Promise<{
    contentLength: number;
    contentType: string;
  }> {
    const response = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    return {
      contentLength: Number(response.ContentLength ?? 0),
      contentType: response.ContentType ?? '',
    };
  }

  async deleteMany(objectKeys: string[]): Promise<void> {
    const uniqueKeys = [...new Set(objectKeys.filter(Boolean))];
    if (uniqueKeys.length === 0) return;

    for (let index = 0; index < uniqueKeys.length; index += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Quiet: true,
            Objects: uniqueKeys.slice(index, index + 1000).map((Key) => ({
              Key,
            })),
          },
        }),
      );
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      await this.deleteMany(
        (response.Contents ?? []).flatMap(({ Key }) => (Key ? [Key] : [])),
      );
      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  async getBuffer(objectKey: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!response.Body) throw new Error('STORAGE_OBJECT_BODY_MISSING');
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async downloadToFile(objectKey: string, destination: string): Promise<void> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!(response.Body instanceof Readable)) {
      throw new Error('STORAGE_OBJECT_STREAM_INVALID');
    }
    await pipeline(response.Body, createWriteStream(destination));
  }

  async uploadBuffer(
    objectKey: string,
    body: Buffer,
    contentType: string,
    cacheControl = 'public, max-age=31536000, immutable',
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
        CacheControl: cacheControl,
      }),
    );
  }

  async uploadFile(
    objectKey: string,
    filePath: string,
    contentType: string,
    cacheControl = 'public, max-age=31536000, immutable',
  ): Promise<void> {
    const file = await stat(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: createReadStream(filePath),
        ContentType: contentType,
        ContentLength: file.size,
        CacheControl: cacheControl,
      }),
    );
  }

  publicUrl(objectKey: string): string {
    const encodedKey = objectKey
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    return `${this.cdnUrl}/${encodedKey}`;
  }

  onModuleDestroy(): void {
    this.client?.destroy();
  }
}
