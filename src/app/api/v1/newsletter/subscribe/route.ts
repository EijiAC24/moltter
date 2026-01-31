import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

// Lazy initialization to avoid build-time errors
let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Email validation
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// POST: Subscribe to newsletter
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.toLowerCase().trim();

    if (!isValidEmail(trimmedEmail)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const segmentId = process.env.RESEND_AUDIENCE_ID;

    if (!segmentId) {
      console.error('RESEND_AUDIENCE_ID not configured');
      return NextResponse.json(
        { success: false, error: 'Newsletter not configured' },
        { status: 500 }
      );
    }

    const client = getResend();

    // First, create the contact
    const createResult = await client.contacts.create({
      email: trimmedEmail,
      unsubscribed: false,
    });

    if (createResult.error) {
      // If contact already exists, that's OK - try to add to segment
      if (!createResult.error.message?.includes('already exists')) {
        console.error('Resend create contact error:', createResult.error);
        return NextResponse.json(
          { success: false, error: 'Failed to subscribe' },
          { status: 500 }
        );
      }
    }

    // Add contact to segment by email
    const addResult = await client.contacts.segments.add({
      email: trimmedEmail,
      segmentId,
    });

    if (addResult.error) {
      // Already in segment is OK
      if (!addResult.error.message?.includes('already')) {
        console.error('Resend add to segment error:', addResult.error);
        return NextResponse.json(
          { success: false, error: 'Failed to subscribe' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Thanks for subscribing! 🦞 We\'ll keep you posted.',
    });
  } catch (error) {
    console.error('Newsletter subscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to subscribe' },
      { status: 500 }
    );
  }
}
