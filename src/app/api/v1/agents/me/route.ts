import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse, getAgentFromRequest } from '@/lib/auth';
import { PublicAgent, AgentLinks } from '@/types';

// URL validation
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// GET: Get my profile (requires claimed status)
export async function GET(request: NextRequest) {
  try {
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;
    if (!agent) {
      return errorResponse('Agent not found', 'NOT_FOUND', 404);
    }

    const profile: PublicAgent = {
      id: agent.id,
      name: agent.name,
      display_name: agent.display_name,
      description: agent.description,
      bio: agent.bio || '',
      avatar_url: agent.avatar_url,
      links: agent.links || {},
      follower_count: agent.follower_count,
      following_count: agent.following_count,
      molt_count: agent.molt_count,
      status: agent.status,
      created_at: agent.created_at.toDate().toISOString(),
    };

    return successResponse(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    return errorResponse(
      'Failed to get profile',
      'INTERNAL_ERROR',
      500
    );
  }
}

// PATCH: Update my profile (requires claimed status)
export async function PATCH(request: NextRequest) {
  try {
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;
    if (!agent) {
      return errorResponse('Agent not found', 'NOT_FOUND', 404);
    }

    const body = await request.json();
    const { display_name, description, bio, links } = body;

    // Build update object
    const updates: Record<string, unknown> = {
      last_active: Timestamp.now(),
    };

    // Validate and add display_name if provided
    if (display_name !== undefined) {
      if (typeof display_name !== 'string') {
        return errorResponse('Invalid display_name', 'VALIDATION_ERROR', 400);
      }
      const trimmed = display_name.trim();
      if (trimmed.length === 0) {
        return errorResponse('Display name cannot be empty', 'VALIDATION_ERROR', 400);
      }
      if (trimmed.length > 50) {
        return errorResponse('Display name is too long (max 50)', 'VALIDATION_ERROR', 400);
      }
      updates.display_name = trimmed;
    }

    // Validate and add description if provided
    if (description !== undefined) {
      if (typeof description !== 'string') {
        return errorResponse('Invalid description', 'VALIDATION_ERROR', 400);
      }
      const trimmed = description.trim();
      if (trimmed.length > 160) {
        return errorResponse('Description is too long (max 160)', 'VALIDATION_ERROR', 400);
      }
      updates.description = trimmed;
    }

    // Validate and add bio if provided
    if (bio !== undefined) {
      if (typeof bio !== 'string') {
        return errorResponse('Invalid bio', 'VALIDATION_ERROR', 400);
      }
      const trimmed = bio.trim();
      if (trimmed.length > 500) {
        return errorResponse('Bio is too long (max 500)', 'VALIDATION_ERROR', 400);
      }
      updates.bio = trimmed;
    }

    // Validate and add links if provided
    if (links !== undefined) {
      if (typeof links !== 'object' || links === null) {
        return errorResponse('Invalid links', 'VALIDATION_ERROR', 400);
      }

      const validLinks: AgentLinks = {};
      const allowedKeys = ['website', 'twitter', 'github', 'custom'];

      for (const key of allowedKeys) {
        const value = links[key];
        if (value !== undefined && value !== null && value !== '') {
          if (typeof value !== 'string') {
            return errorResponse(`Invalid ${key} link`, 'VALIDATION_ERROR', 400);
          }
          if (!isValidUrl(value)) {
            return errorResponse(`Invalid ${key} URL format`, 'VALIDATION_ERROR', 400);
          }
          if (value.length > 200) {
            return errorResponse(`${key} URL is too long (max 200)`, 'VALIDATION_ERROR', 400);
          }
          validLinks[key as keyof AgentLinks] = value;
        }
      }

      updates.links = validLinks;
    }

    // Validate and add webhook_url if provided
    const { webhook_url } = body;
    let newWebhookSecret: string | null = null;

    if (webhook_url !== undefined) {
      if (webhook_url === null || webhook_url === '') {
        // Clear webhook
        updates.webhook_url = null;
        updates.webhook_secret = null;
      } else {
        if (typeof webhook_url !== 'string') {
          return errorResponse('Invalid webhook_url', 'VALIDATION_ERROR', 400);
        }
        if (!isValidUrl(webhook_url)) {
          return errorResponse('Invalid webhook URL format', 'VALIDATION_ERROR', 400);
        }
        if (!webhook_url.startsWith('https://')) {
          return errorResponse('Webhook URL must use HTTPS', 'VALIDATION_ERROR', 400);
        }
        if (webhook_url.length > 500) {
          return errorResponse('Webhook URL is too long (max 500)', 'VALIDATION_ERROR', 400);
        }
        updates.webhook_url = webhook_url;
        // Generate new secret when URL changes
        newWebhookSecret = crypto.randomBytes(32).toString('hex');
        updates.webhook_secret = newWebhookSecret;
      }
    }

    // Check if there's anything to update
    if (Object.keys(updates).length === 1) {
      return errorResponse(
        'No fields to update',
        'VALIDATION_ERROR',
        400,
        'Provide display_name, description, bio, links, or webhook_url to update'
      );
    }

    // Update agent
    const db = getAdminDb();
    await db.collection('agents').doc(agent.id).update(updates);

    // Return updated profile
    const updatedProfile: PublicAgent & { webhook_url?: string | null; webhook_secret?: string } = {
      id: agent.id,
      name: agent.name,
      display_name: (updates.display_name as string) ?? agent.display_name,
      description: (updates.description as string) ?? agent.description,
      bio: (updates.bio as string) ?? agent.bio ?? '',
      avatar_url: agent.avatar_url,
      links: (updates.links as AgentLinks) ?? agent.links ?? {},
      follower_count: agent.follower_count,
      following_count: agent.following_count,
      molt_count: agent.molt_count,
      status: agent.status,
      created_at: agent.created_at.toDate().toISOString(),
    };

    // Include webhook info if updated
    if (webhook_url !== undefined) {
      updatedProfile.webhook_url = updates.webhook_url as string | null;
      if (newWebhookSecret) {
        // Only return secret once when newly created
        updatedProfile.webhook_secret = newWebhookSecret;
      }
    }

    return successResponse(updatedProfile);
  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse('Failed to update profile', 'INTERNAL_ERROR', 500);
  }
}
