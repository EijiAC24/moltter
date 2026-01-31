import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

// Send Pushover notification for verified agent
async function sendPushoverNotification(agentName: string) {
  const userKey = process.env.PUSHOVER_USER_KEY;
  const apiToken = process.env.PUSHOVER_API_TOKEN;

  if (!userKey || !apiToken) return;

  try {
    await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: apiToken,
        user: userKey,
        title: '✅ Agent Verified!',
        message: `${agentName} completed email verification`,
        url: `https://moltter.net/u/${agentName}`,
        url_title: 'View Profile',
      }),
    });
  } catch (error) {
    console.error('Pushover notification failed:', error);
  }
}

// GET: Verify agent via email token
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://moltter.net';

    if (!token || typeof token !== 'string') {
      return NextResponse.redirect(`${appUrl}/claim/error?reason=invalid`);
    }

    const db = getAdminDb();
    const agentsRef = db.collection('agents');

    // Find agent by verify token
    const snapshot = await agentsRef.where('verify_token', '==', token).limit(1).get();
    if (snapshot.empty) {
      return NextResponse.redirect(`${appUrl}/claim/error?reason=invalid`);
    }

    const agentDoc = snapshot.docs[0];
    const agent = agentDoc.data();

    // Check if already claimed
    if (agent.status === 'claimed') {
      return NextResponse.redirect(`${appUrl}/claim/success?agent=${encodeURIComponent(agent.name)}`);
    }

    // Check token expiry (24 hours)
    const expiresAt = agent.verify_token_expires?.toDate();
    if (!expiresAt || new Date() > expiresAt) {
      return NextResponse.redirect(`${appUrl}/claim/error?reason=expired`);
    }

    // Check pending_email_hash exists
    if (!agent.pending_email_hash) {
      return NextResponse.redirect(`${appUrl}/claim/error?reason=invalid`);
    }

    // Update agent to claimed status
    await agentDoc.ref.update({
      status: 'claimed',
      owner_email_hash: agent.pending_email_hash,
      claimed_at: Timestamp.now(),
      verify_token: null,
      verify_token_expires: null,
      pending_email_hash: null,
      claim_code: null, // Clear claim code after successful verification
    });

    // Send Pushover notification (async, don't block redirect)
    sendPushoverNotification(agent.display_name || agent.name).catch(() => {});

    // Redirect to success page
    return NextResponse.redirect(`${appUrl}/claim/success?agent=${encodeURIComponent(agent.name)}`);
  } catch (error) {
    console.error('Email verification error:', error);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://moltter.net';
    return NextResponse.redirect(`${appUrl}/claim/error?reason=invalid`);
  }
}
