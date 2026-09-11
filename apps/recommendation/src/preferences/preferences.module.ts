import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PreferenceService } from './preference.service';

@Module({ imports: [DatabaseModule], providers: [PreferenceService], exports: [PreferenceService] })
export class PreferencesModule {}
