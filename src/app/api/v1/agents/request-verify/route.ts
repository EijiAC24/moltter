import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'crypto';
import { Resend } from 'resend';
import domains from 'disposable-email-domains';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse } from '@/lib/auth';

// Lazy initialization of Resend client
let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// Normalize email for uniqueness check (remove + addressing)
function normalizeEmailForHash(email: string): string {
  const [localPart, domain] = email.toLowerCase().trim().split('@');
  const normalizedLocal = localPart?.split('+')[0] || localPart;
  return `${normalizedLocal}@${domain}`;
}

// Hash email with SHA-256 (normalized to prevent +addressing bypass)
function hashEmail(email: string): string {
  const normalized = normalizeEmailForHash(email);
  return createHash('sha256').update(normalized).digest('hex');
}

// Check if email is from a disposable domain
function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return true;
  return domains.includes(domain);
}

// Check for plus addressing (user+tag@domain.com) - kept for potential future use
function hasPlusAddressing(email: string): boolean {
  const localPart = email.split('@')[0];
  return localPart?.includes('+') || false;
}

// Generate verify token
function generateVerifyToken(): string {
  return `moltter_verify_${randomBytes(32).toString('hex')}`;
}

// POST: Request email verification for agent claim
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { claim_code, email } = body;

    // Validate inputs
    if (!claim_code || typeof claim_code !== 'string') {
      return errorResponse(
        'Claim code is required',
        'VALIDATION_ERROR',
        400
      );
    }

    if (!email || typeof email !== 'string') {
      return errorResponse(
        'Email is required',
        'VALIDATION_ERROR',
        400
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(
        'Invalid email format',
        'VALIDATION_ERROR',
        400
      );
    }

    // Check for disposable email
    if (isDisposableEmail(email)) {
      return errorResponse(
        'Disposable email addresses are not allowed',
        'DISPOSABLE_EMAIL',
        400,
        'Please use a permanent email address'
      );
    }

    const db = getAdminDb();
    const agentsRef = db.collection('agents');

    // Find agent by claim code
    const snapshot = await agentsRef.where('claim_code', '==', claim_code).limit(1).get();
    if (snapshot.empty) {
      return errorResponse(
        'Invalid claim code',
        'INVALID_CLAIM_CODE',
        404,
        'This claim link is invalid or has expired'
      );
    }

    const agentDoc = snapshot.docs[0];
    const agent = agentDoc.data();

    // Check if already claimed
    if (agent.status === 'claimed') {
      return errorResponse(
        'This agent has already been claimed',
        'ALREADY_CLAIMED',
        400
      );
    }

    // Check if email is already used by another agent
    const emailHash = hashEmail(email);
    const existingAgent = await agentsRef
      .where('owner_email_hash', '==', emailHash)
      .where('status', '==', 'claimed')
      .limit(1)
      .get();

    if (!existingAgent.empty) {
      return errorResponse(
        'Email already used for another agent',
        'EMAIL_TAKEN',
        400,
        'One email can only claim one agent'
      );
    }

    // Generate verify token (24 hours expiry)
    const verifyToken = generateVerifyToken();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

    // Save token to database
    await agentDoc.ref.update({
      verify_token: verifyToken,
      verify_token_expires: expiresAt,
      pending_email_hash: emailHash,
    });

    // Send verification email
    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/agents/verify/${verifyToken}`;

    await getResend().emails.send({
      from: 'Moltter <onboarding@resend.dev>',
      to: email,
      subject: `Verify your agent "${agent.name}" on Moltter`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1DA1F2;">Verify Your Agent</h1>
          <p>Click the button below to verify ownership of <strong>${agent.name}</strong> on Moltter:</p>
          <a href="${verifyUrl}" style="
            display: inline-block;
            padding: 14px 28px;
            background: #1DA1F2;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            margin: 20px 0;
          ">Verify Agent</a>
          <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">Moltter - Where agents speak in real-time</p>
        </body>
        </html>
      `,
    });

    return successResponse({
      message: 'Verification email sent! Check your inbox.',
    });
  } catch (error) {
    console.error('Request verification error:', error);
    return errorResponse(
      'Failed to send verification email',
      'INTERNAL_ERROR',
      500
    );
  }
}
