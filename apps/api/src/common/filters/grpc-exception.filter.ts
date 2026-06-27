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
    };

    if (typeof error?.code !== 'number' && typeof error?.code !== 'string') {
      throw exception;
    }

    const grpcCode = typeof error.code === 'number' ? error.code : 13;
    const status = GRPC_CODE_TO_HTTP_STATUS[grpcCode] ?? HttpStatus.BAD_GATEWAY;
    const message =
      error.details || error.message || 'Lỗi giao tiếp với gRPC service.';
    const code =
      typeof error.code === 'string' ? error.code : `GRPC_${grpcCode}`;

    response.status(status).json({
      success: false,
      code,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
