import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = this.buildUrl(
      this.configService.getOrThrow<string>('PASSWORD_RESET_URL'),
      token,
    );

    await this.sendMail({
      to: email,
      subject: 'Đặt lại mật khẩu Music Streaming',
      text: [
        'Bạn vừa yêu cầu đặt lại mật khẩu.',
        `Mở liên kết sau để đặt lại mật khẩu: ${resetUrl}`,
        'Liên kết có hiệu lực trong 15 phút. Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email.',
      ].join('\n\n'),
      html: this.renderActionEmail({
        title: 'Đặt lại mật khẩu',
        body: 'Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản Music Streaming.',
        actionLabel: 'Đặt lại mật khẩu',
        actionUrl: resetUrl,
        footer:
          'Liên kết có hiệu lực trong 15 phút. Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email.',
      }),
    });
  }

  async sendEmailVerificationEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const verifyUrl = this.buildUrl(
      this.configService.getOrThrow<string>('EMAIL_VERIFICATION_URL'),
      token,
    );

    await this.sendMail({
      to: email,
      subject: 'Xác thực email Music Streaming',
      text: [
        'Vui lòng xác thực email cho tài khoản Music Streaming.',
        `Mở liên kết sau để xác thực email: ${verifyUrl}`,
        'Liên kết có hiệu lực trong 24 giờ.',
      ].join('\n\n'),
      html: this.renderActionEmail({
        title: 'Xác thực email',
        body: 'Vui lòng xác thực email để hoàn tất bảo vệ tài khoản Music Streaming.',
        actionLabel: 'Xác thực email',
        actionUrl: verifyUrl,
        footer: 'Liên kết có hiệu lực trong 24 giờ.',
      }),
    });
  }

  private async sendMail(input: SendMailInput): Promise<void> {
    const apiKey = this.configService.getOrThrow<string>('RESEND_API_KEY');
    const from = this.configService.getOrThrow<string>('MAIL_FROM');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.error(
        `Không thể gửi email tới ${input.to}: ${response.status} ${errorBody}`,
      );
      throw new Error('Không thể gửi email');
    }
  }

  private buildUrl(baseUrl: string, token: string): string {
    const url = new URL(baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private renderActionEmail(input: {
    title: string;
    body: string;
    actionLabel: string;
    actionUrl: string;
    footer: string;
  }): string {
    return `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto;padding:24px">
        <h1 style="font-size:22px;margin:0 0 12px">${input.title}</h1>
        <p style="margin:0 0 20px">${input.body}</p>
        <a href="${input.actionUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px">
          ${input.actionLabel}
        </a>
        <p style="margin:20px 0 0;color:#4b5563;font-size:14px">${input.footer}</p>
      </div>
    `;
  }
}
