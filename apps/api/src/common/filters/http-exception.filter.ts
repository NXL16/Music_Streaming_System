import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { HttpExceptionResponseBody } from '@musical/shared-types';

const DEFAULT_ERROR_CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse =
      exception.getResponse() as HttpExceptionResponseBody;

    let message: string | string[] =
      status >= 500
        ? 'Lỗi xử lý yêu cầu. Vui lòng thử lại sau.'
        : 'Yêu cầu không hợp lệ.';
    let code =
      DEFAULT_ERROR_CODE_BY_STATUS[status] ||
      (status >= 500 ? 'INTERNAL_SERVER_ERROR' : `HTTP_${status}`);

    // HANDLE OTHER HTTP EXCEPTIONS
    if (typeof exceptionResponse === 'object') {
      const responseObj = exceptionResponse as unknown as Record<
        string,
        unknown
      >;
      message = (responseObj.message as string | string[]) || message;
      code = (responseObj.code as string) || code;
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    }

    response.status(status).json({
      success: false,
      code,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
