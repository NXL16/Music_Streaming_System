import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import { promises as fsp } from "fs";
import * as path from "path";
import * as mime from "mime-types";

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get<string>("R2_BUCKET_NAME")!;
    this.publicUrl = this.configService.get<string>("R2_PUBLIC_URL")!;

    // Khởi tạo S3 Client trỏ tới Endpoint của Cloudflare R2
    this.s3Client = new S3Client({
      region: "auto",
      endpoint: this.configService.get<string>("R2_ENDPOINT")!,
      credentials: {
        accessKeyId: this.configService.get<string>("R2_ACCESS_KEY_ID")!,
        secretAccessKey: this.configService.get<string>(
          "R2_SECRET_ACCESS_KEY",
        )!,
      },
    });
  }

  /**
   * Upload một thư mục (chứa file m3u8 và các file .ts) lên R2
   */
  async uploadDirectory(localDir: string, s3Prefix: string): Promise<string> {
    const entries = await fsp.readdir(localDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const file = entry.name;
      const filePath = path.join(localDir, file);

      if (file.endsWith(".key") || file.endsWith(".keyinfo")) {
        continue;
      }

      const s3Key = `${s3Prefix}/${file}`;
      await this.uploadFile(filePath, s3Key);
    }

    // Trả về Public URL của file Master Playlist (.m3u8)
    return `${this.publicUrl}/${s3Prefix}/master.m3u8`;
  }

  /**
   * Upload từng file lẻ
   */
  async uploadFile(filePath: string, s3Key: string): Promise<string> {
    const fileStream = fs.createReadStream(filePath);
    const contentType = mime.lookup(filePath) || "application/octet-stream";

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType,
    });

    try {
      await this.s3Client.send(command);
      this.logger.log(`Đã upload lên R2: ${s3Key}`);
      return `${this.publicUrl}/${s3Key}`;
    } catch (error) {
      this.logger.error(`❌ Upload thất bại file ${s3Key}:`, error);
      throw error;
    }
  }
}
