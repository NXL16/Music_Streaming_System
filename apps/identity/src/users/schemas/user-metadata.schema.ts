import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserMetadataDocument = UserMetadata & Document;

type UserStats = {
  totalPlays: number;
  totalPlaytime: number;
  totalPlaylistsCreated: number;
  totalFollowers: number;
};

@Schema({ timestamps: true, collection: 'user_metadata' })
export class UserMetadata {
  @Prop({ required: true, unique: true, index: true, immutable: true })
  userId!: string; // ID từ Postgres truyền sang

  @Prop({ default: null })
  avatar?: string;

  @Prop({ maxlength: 500, default: '' })
  bio?: string;

  @Prop({ type: [String], default: [] })
  permissions!: string[];

  @Prop({
    type: {
      totalPlays: { type: Number, default: 0 },
      totalPlaytime: { type: Number, default: 0 },
      totalPlaylistsCreated: { type: Number, default: 0 },
      totalFollowers: { type: Number, default: 0 },
    },
    default: () => ({
      totalPlays: 0,
      totalPlaytime: 0,
      totalPlaylistsCreated: 0,
      totalFollowers: 0,
    }),
  })
  stats!: UserStats;
}

export const UserMetadataSchema = SchemaFactory.createForClass(UserMetadata);

UserMetadataSchema.index({ 'stats.totalPlays': -1 });
