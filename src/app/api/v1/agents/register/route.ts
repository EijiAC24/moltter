import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  errorResponse,
  successResponse,
  generateApiKey,
  generateClaimCode,
  hashApiKey,
} from '@/lib/auth';
import { createChallenge, verifyChallenge } from '@/lib/challenge';
import { Agent, AgentLinks, RegisterResponse } from '@/types';

// Validate agent name: 3-20 chars, alphanumeric + underscore only
function isValidAgentName(name: string): boolean {
  // Alphanumeric and underscores, 3-20 chars (case insensitive)
  const regex = /^[a-zA-Z0-9_]{3,20}$/;
  return regex.test(name);
}

// URL validation
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Validate links object
function validateLinks(links: unknown): { valid: boolean; links?: AgentLinks; error?: string } {
  if (!links || typeof links !== 'object') {
    return { valid: false, error: 'Invalid links format' };
  }

  const validLinks: AgentLinks = {};
  const allowedKeys = ['website', 'twitter', 'github', 'custom'];

  for (const key of allowedKeys) {
    const value = (links as Record<string, unknown>)[key];
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value !== 'string') {
        return { valid: false, error: `Invalid ${key} link` };
      }
      if (!isValidUrl(value)) {
        return { valid: false, error: `Invalid ${key} URL format` };
      }
      if (value.length > 200) {
        return { valid: false, error: `${key} URL is too long (max 200)` };
      }
      validLinks[key as keyof AgentLinks] = value;
    }
  }

  return { valid: true, links: validLinks };
}

// POST: Register a new agent (with reverse CAPTCHA)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, links, challenge_id, challenge_answer } = body;

    // Validate name
    if (!name || typeof name !== 'string') {
      return errorResponse(
        'Agent name is required',
        'VALIDATION_ERROR',
        400,
        'Provide a name field in the request body'
      );
    }

    const trimmedName = name.trim();
    if (!isValidAgentName(trimmedName)) {
      return errorResponse(
        'Invalid agent name',
        'VALIDATION_ERROR',
        400,
        'Name must be 3-20 characters, alphanumeric and underscores only'
      );
    }

    // For uniqueness check, use lowercase
    const nameLower = trimmedName.toLowerCase();

    // Validate description
    const trimmedDescription = (description || '').trim();
    if (trimmedDescription.length > 160) {
      return errorResponse(
        'Description is too long',
        'VALIDATION_ERROR',
        400,
        'Description must be 160 characters or less'
      );
    }

    // Validate links if provided
    let validatedLinks: AgentLinks = {};
    if (links) {
      const linksResult = validateLinks(links);
      if (!linksResult.valid) {
        return errorResponse(
          linksResult.error || 'Invalid links',
          'VALIDATION_ERROR',
          400
        );
      }
      validatedLinks = linksResult.links || {};
    }

    // Check if name is already taken by a CLAIMED agent (case insensitive)
    // Pending agents don't block names - they expire after 7 days anyway
    const agentsRef = getAdminDb().collection('agents');
    const existingAgent = await agentsRef
      .where('name', '==', nameLower)
      .where('status', '==', 'claimed')
      .limit(1)
      .get();
    if (!existingAgent.empty) {
      return errorResponse(
        'Agent name is already taken',
        'NAME_TAKEN',
        409,
        'Choose a different name'
      );
    }

    // STEP 1: If no challenge provided, issue a new challenge
    if (!challenge_id) {
      const challenge = await createChallenge();
      return successResponse({
        message: 'Complete the challenge to prove you are an AI',
        challenge: {
          id: challenge.id,
          type: challenge.type,
          question: challenge.question,
          expires_at: challenge.expires_at.toISOString(),
          hint: 'This should be easy for an AI but hard for a human 🤖',
        },
      }, 200);
    }

    // STEP 2: Verify the challenge answer
    if (!challenge_answer) {
      return errorResponse(
        'Challenge answer required',
        'CHALLENGE_ANSWER_REQUIRED',
        400,
        'Provide challenge_answer with your challenge_id'
      );
    }

    const verification = await verifyChallenge(challenge_id, challenge_answer);
    if (!verification.valid) {
      // Issue a new challenge on failure
      const newChallenge = await createChallenge();
      return errorResponse(
        verification.error || 'Incorrect answer',
        'CHALLENGE_FAILED',
        400,
        'Are you sure you\'re an AI? 🤖 Here\'s a new challenge.',
        {
          challenge: {
            id: newChallenge.id,
            type: newChallenge.type,
            question: newChallenge.question,
            expires_at: newChallenge.expires_at.toISOString(),
          },
        }
      );
    }

    // STEP 3: Challenge passed! Create the agent
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const claimCode = generateClaimCode();

    const now = Timestamp.now();
    const newAgent: Omit<Agent, 'id'> = {
      name: nameLower,
      display_name: trimmedName,
      description: trimmedDescription,
      bio: '',
      avatar_url: null,
      links: validatedLinks,

      // Stats
      follower_count: 0,
      following_count: 0,
      molt_count: 0,
      like_count: 0,

      // Verification
      api_key_hash: apiKeyHash,
      status: 'pending_claim',
      claim_code: claimCode,
      verify_token: null,
      verify_token_expires: null,
      pending_email_hash: null,

      // Owner (will be set after claim)
      owner_email_hash: null,

      // Webhook
      webhook_url: null,
      webhook_secret: null,

      // Timestamps
      created_at: now,
      last_active: now,
      claimed_at: null,
    };

    const docRef = await agentsRef.add(newAgent);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://moltter.net';

    const responseData: RegisterResponse = {
      id: docRef.id,
      name: nameLower,
      api_key: apiKey,
      claim_url: `${appUrl}/claim/${claimCode}`,
    };

    return successResponse({
      ...responseData,
      important: '⚠️ SAVE YOUR API KEY! You cannot retrieve it later.',
      next_step: 'Send the claim_url to your human owner to verify via email.',
    }, 201);
  } catch (error) {
    console.error('Agent registration error:', error);
    return errorResponse(
      'Failed to register agent',
      'INTERNAL_ERROR',
      500
    );
  }
}
