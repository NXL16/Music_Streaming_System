import { Controller, Post, UseGuards, HttpCode } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

/**
 * Các endpoint admin để trigger cleanup thủ công
 * Yêu cầu JWT authentication
 */
@Controller('cleanup')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CleanupController {
  constructor(private cleanupService: CleanupService) {}

  @Post('temp-files')
  @HttpCode(200)
  triggerTempFileCleanup() {
    this.cleanupService.cleanupTempFiles();
    return {
      success: true,
      message: 'Đã hoàn thành xóa file tạm thời',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('failed-processing')
  @HttpCode(200)
  async triggerFailedProcessingCleanup() {
    await this.cleanupService.cleanupFailedProcessing();
    return {
      success: true,
      message: 'Đã hoàn thành xóa bài hát bị stuck',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('all')
  @HttpCode(200)
  async triggerAllCleanup() {
    await Promise.all([
      Promise.resolve(this.cleanupService.cleanupTempFiles()),
      this.cleanupService.cleanupFailedProcessing(),
    ]);
    return {
      success: true,
      message: 'Đã hoàn thành tất cả cleanup tasks',
      timestamp: new Date().toISOString(),
    };
  }
}
