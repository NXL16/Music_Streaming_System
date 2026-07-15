import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

const GRPC_CODE_TO_HTTP_STATUS: Record<number, number> = {
  3: HttpStatus.BAD_REQUEST,
  4: HttpStatus.UNAUTHORIZED,
  5: HttpStatus.NOT_FOUND,
  6: HttpStatus.CONFLICT,
  7: HttpStatus.FORBIDDEN,
  8: HttpStatus.TOO_MANY_REQUESTS,
  9: HttpStatus.CONFLICT,
  10: HttpStatus.CONFLICT,
  12: HttpStatus.NOT_IMPLEMENTED,
  13: HttpStatus.INTERNAL_SERVER_ERROR,
  14: HttpStatus.SERVICE_UNAVAILABLE,
  16: HttpStatus.UNAUTHORIZED,
};

@Catch()
export class GrpcExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const error = exception as {
      code?: number | string;
      message?: string;
      details?: string;
      metadata?: unknown;
    };

    const grpcCode =
      typeof error?.code === 'number'
        ? error.code
        : typeof error?.code === 'string' && /^\d+$/.test(error.code)
          ? Number(error.code)
          : null;

    if (grpcCode === null || !(grpcCode in GRPC_CODE_TO_HTTP_STATUS)) {
      throw exception;
    }

    const status = GRPC_CODE_TO_HTTP_STATUS[grpcCode];
    const message =
      error.details || error.message || 'Lỗi giao tiếp với gRPC service.';

    response.status(status).json({
      success: false,
      code: `GRPC_${grpcCode}`,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
