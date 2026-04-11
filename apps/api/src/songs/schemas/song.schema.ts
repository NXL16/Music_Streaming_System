import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { SongStatus, QualityQuality } from '@musical/shared-types';

export type SongDocument = Song & Document;

@Schema({ timestamps: true })
export class Song {
  @Prop({ required: true, trim: true, maxlength: 255 })
  title!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Artist', required: true })
  artistId!: MongooseSchema.Types.ObjectId;

  @Prop({ maxlength: 255, default: '' })
  album!: string;

  @Prop({ required: true, min: 1, max: 7200 }) // Tính bằng giây
  duration!: number;

  @Prop({ maxlength: 50, default: '' })
  genre!: string;

  @Prop({ default: null })
  releaseDate?: Date;

  @Prop({ maxlength: 1000, default: '' })
  description!: string;

  @Prop({ default: '' })
  lyrics!: string;

  // HLS & Streaming
  @Prop({ default: null, unique: true, sparse: true })
  hlsMasterPath?: string;

  @Prop({ default: null })
  hlsKeyId?: string;

  @Prop({ default: null })
  hlsIV?: string;

  @Prop({ default: false })
  isEncrypted!: boolean;

  @Prop({
    type: [
      {
        quality: { type: String, enum: QualityQuality },
        path: String,
        bandwidth: Number,
        avgSegmentSize: Number,
        segmentCount: Number,
      },
    ],
    default: [],
  })
  bitrates!: Record<string, any>[];

  @Prop({ default: null })
  blurHash?: string;

  @Prop({ type: [Number], default: [] })
  waveform!: number[];

  @Prop({
    type: {
      small: { type: String, default: null },
      medium: { type: String, default: null },
      large: { type: String, default: null },
    },
    default: { small: null, medium: null, large: null },
  })
  thumbnails?: Record<string, any>;

  @Prop({ required: true, unique: true })
  checksum!: string;

  @Prop({ default: 0 })
  fileSize!: number;

  @Prop({ default: null })
  originalFormat?: string;

  @Prop({
    type: String,
    enum: Object.values(SongStatus),
    default: SongStatus.PROCESSING,
  })
  status!: SongStatus;

  @Prop({ default: null })
  processingLog?: string;

  @Prop({ default: null })
  processingStartedAt?: Date;

  @Prop({ default: null })
  processingCompletedAt?: Date;

  @Prop({
    type: {
      playCount: { type: Number, default: 0 },
      likeCount: { type: Number, default: 0 },
      shareCount: { type: Number, default: 0 },
      skipCount: { type: Number, default: 0 },
    },
    default: { playCount: 0, likeCount: 0, shareCount: 0, skipCount: 0 },
  })
  metrics!: Record<string, any>;

  @Prop({ default: true })
  isPublic!: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  uploadedBy!: MongooseSchema.Types.ObjectId;
}

export const SongSchema = SchemaFactory.createForClass(Song);

SongSchema.index({ title: 'text' });
SongSchema.index({ status: 1, isPublic: 1 });
SongSchema.index({ status: 1, updatedAt: -1 });
SongSchema.index({ 'metrics.playCount': -1 });
