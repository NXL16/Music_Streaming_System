import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type {
  ChangePasswordRequest,
  ListUsersRequest,
  LoginRequest,
  SignUpRequest,
  UpdateProfileRequest,
} from '@musical/shared-proto';

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/;
const MAX_BIO_LENGTH = 500;

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

export function validateNewPassword(password: string): void {
  if (!password || password.length < 8) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Mật khẩu mới phải có ít nhất 8 ký tự',
    });
  }

  if (!PASSWORD_REGEX.test(password)) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message:
        'Mật khẩu mới phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt',
    });
  }
}

export function normalizeAndValidateChangePasswordRequest(
  request: ChangePasswordRequest,
): ChangePasswordRequest {
  if (!request.userId) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'userId là bắt buộc',
    });
  }

  if (!request.currentPassword) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Mật khẩu hiện tại là bắt buộc',
    });
  }

  validateNewPassword(request.newPassword);

  if (request.currentPassword === request.newPassword) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    });
  }

  return request;
}

export function normalizeAndValidateUpdateProfileRequest(
  request: UpdateProfileRequest,
): UpdateProfileRequest {
  const displayName = request.displayName?.trim();
  const avatar = request.avatar?.trim();
  const bio = request.bio?.trim();

  if (!request.userId) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'userId là bắt buộc',
    });
  }

  if (!displayName || displayName.length < 2 || displayName.length > 100) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Tên hiển thị phải từ 2 đến 100 ký tự',
    });
  }

  if (bio && bio.length > MAX_BIO_LENGTH) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Tiểu sử tối đa 500 ký tự',
    });
  }

  return {
    ...request,
    displayName,
    avatar: avatar || undefined,
    bio: bio || undefined,
  };
}

export function normalizeListUsersRequest(
  request: ListUsersRequest,
): ListUsersRequest {
  const page = Math.max(Number(request.page || 1), 1);
  const limit = Math.min(Math.max(Number(request.limit || 20), 1), 100);
  const search = request.search?.trim().toLowerCase();
  const role = request.role?.trim().toUpperCase();

  return {
    ...request,
    page,
    limit,
    search: search || undefined,
    role: role || undefined,
  };
}
