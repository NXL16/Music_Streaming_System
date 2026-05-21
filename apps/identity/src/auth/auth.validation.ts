import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type { LoginRequest, SignUpRequest } from '@musical/shared-proto';

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/;

export function normalizeAndValidateSignUpRequest(
  request: SignUpRequest,
): SignUpRequest {
  const username = request.username?.trim().toLowerCase();
  const email = request.email?.trim().toLowerCase();
  const password = request.password;
  const displayName = request.displayName?.trim();

  if (!username || username.length < 3 || username.length > 50) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Username phải từ 3 đến 50 ký tự',
    });
  }

  if (!USERNAME_REGEX.test(username)) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Username chỉ chứa chữ, số và dấu gạch dưới',
    });
  }

  if (!email || email.length > 255 || !EMAIL_REGEX.test(email)) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Email không hợp lệ',
    });
  }

  if (!password || password.length < 8) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Mật khẩu phải có ít nhất 8 ký tự',
    });
  }

  if (!PASSWORD_REGEX.test(password)) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Mật khẩu phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt',
    });
  }

  if (!displayName || displayName.length < 2 || displayName.length > 100) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Tên hiển thị phải từ 2 đến 100 ký tự',
    });
  }

  return {
    ...request,
    username,
    email,
    displayName,
  };
}

export function normalizeAndValidateLoginRequest(
  request: LoginRequest,
): LoginRequest {
  const username = request.username?.trim().toLowerCase();

  if (!username || username.length < 3 || username.length > 50) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Username không hợp lệ',
    });
  }

  if (!request.password) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Mật khẩu là bắt buộc',
    });
  }

  return {
    ...request,
    username,
  };
}
