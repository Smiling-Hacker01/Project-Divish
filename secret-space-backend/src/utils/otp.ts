import nodemailer from 'nodemailer';
import logger from '../config/logger';

export const generateOtp = (): string =>
  String(Math.floor(100000 + Math.random() * 900000)); // 6-digit

export const OTP_EXPIRY_MINUTES = 10;

let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter => {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.warn('[OTP] SMTP_HOST, SMTP_USER, or SMTP_PASS not configured. OTP emails will fail.');
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    // Force Node to use IPv4 instead of IPv6 for Railway compatibility
    family: 4, 
    auth: { user, pass },
  } as any);

  return transporter;
};

export const sendOtpEmail = async (email: string, otp: string): Promise<void> => {


  const from = `"The Secret Space" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

  await getTransporter().sendMail({
    from,
    to: email,
    subject: 'Your verification code',
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:auto">
        <h2 style="color:#e74c8b">The Secret Space 🔐</h2>
        <p>Your one-time verification code is:</p>
        <h1 style="letter-spacing:8px;color:#333">${otp}</h1>
        <p style="color:#999;font-size:13px">Expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this with anyone.</p>
      </div>
    `,
  });

  logger.info({ to: email }, '[OTP] Verification email sent');
};