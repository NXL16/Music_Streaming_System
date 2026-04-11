import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserRole } from '@musical/shared-types';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
  })
  username!: string;

  @Prop({ required: true, minlength: 60 }) // Bcrypt hash
  password!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
  email!: string;

  @Prop({ required: true, maxlength: 100 })
  displayName!: string;

  @Prop({ default: null })
  avatar?: string;

  @Prop({ maxlength: 500, default: '' })
  bio?: string;

  @Prop({ type: String, enum: Object.values(UserRole), default: UserRole.USER })
  role!: UserRole;

  @Prop({ type: [String], default: [] })
  permissions!: string[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: false })
  emailVerified!: boolean;

  @Prop({ default: false })
  twoFactorEnabled!: boolean;

  @Prop({
    type: {
      totalPlays: { type: Number, default: 0 },
      totalPlaytime: { type: Number, default: 0 },
      totalPlaylistsCreated: { type: Number, default: 0 },
      totalFollowers: { type: Number, default: 0 },
    },
    default: {
      totalPlays: 0,
      totalPlaytime: 0,
      totalPlaylistsCreated: 0,
      totalFollowers: 0,
    },
  })
  stats!: Record<string, any>;

  @Prop({ default: null })
  lastLoginAt?: Date;

  @Prop({ default: Date.now })
  lastPasswordChangeAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ isActive: 1, createdAt: -1 });
UserSchema.index({ lastLoginAt: -1 });
