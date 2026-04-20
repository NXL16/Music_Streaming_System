import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    void exception;

    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      success: false,
      code: 'AUTH_TOO_MANY_REQUESTS',
      message: 'Quá nhiều yêu cầu được gửi đến. Vui lòng thử lại sau.',
      timestamp: new Date().toISOString(),
    });
  }
}
