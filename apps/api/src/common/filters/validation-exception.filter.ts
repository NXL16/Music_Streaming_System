import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';

interface ValidationErrorResponse {
  message: string[] | string;
  code?: string;
  error?: string;
  statusCode?: number;
}

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse =
      exception.getResponse() as ValidationErrorResponse;

    const isValidationPipeError =
      exceptionResponse?.error === 'Bad Request' &&
      Array.isArray(exceptionResponse?.message);

    let message: string | string[] = 'Dữ liệu gửi lên không hợp lệ.';
    let code = 'BAD_REQUEST';

    if (Array.isArray(exceptionResponse.message)) {
      message = exceptionResponse.message;
    } else if (typeof exceptionResponse.message === 'string') {
      message = exceptionResponse.message;
    }

    if (isValidationPipeError) {
      code = 'VALIDATION_ERROR';
    } else if (exceptionResponse.code) {
      code = exceptionResponse.code;
    }

    response.status(status).json({
      success: false,
      code,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
