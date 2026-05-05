import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';

interface ValidationErrorResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    const exceptionResponse =
      exception.getResponse() as ValidationErrorResponse;

    let message = 'Dữ liệu gửi lên không hợp lệ';

    const rawMessage = exceptionResponse?.message;

    // Normalize về string
    if (Array.isArray(rawMessage)) {
      message = rawMessage[0] ?? message;
    } else if (typeof rawMessage === 'string') {
      message = rawMessage;
    }

    response.status(status).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
