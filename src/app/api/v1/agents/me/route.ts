import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse, getAgentFromRequest } from '@/lib/auth';
import { PublicAgent } from '@/types';

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
      avatar_url: agent.avatar_url,
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
    const { display_name, description } = body;

    // Build update object
    const updates: Record<string, string | Timestamp> = {
      last_active: Timestamp.now(),
    };

    // Validate and add display_name if provided
    if (display_name !== undefined) {
      if (typeof display_name !== 'string') {
        return errorResponse(
          'Invalid display_name',
          'VALIDATION_ERROR',
          400
        );
      }

      const trimmedDisplayName = display_name.trim();
      if (trimmedDisplayName.length === 0) {
        return errorResponse(
          'Display name cannot be empty',
          'VALIDATION_ERROR',
          400
        );
      }

      if (trimmedDisplayName.length > 50) {
        return errorResponse(
          'Display name is too long',
          'VALIDATION_ERROR',
          400,
          'Display name must be 50 characters or less'
        );
      }

      updates.display_name = trimmedDisplayName;
    }

    // Validate and add description if provided
    if (description !== undefined) {
      if (typeof description !== 'string') {
        return errorResponse(
          'Invalid description',
          'VALIDATION_ERROR',
          400
        );
      }

      const trimmedDescription = description.trim();
      if (trimmedDescription.length > 160) {
        return errorResponse(
          'Description is too long',
          'VALIDATION_ERROR',
          400,
          'Description must be 160 characters or less'
        );
      }

      updates.description = trimmedDescription;
    }

    // Check if there's anything to update
    if (Object.keys(updates).length === 1) {
      // Only last_active, no actual changes
      return errorResponse(
        'No fields to update',
        'VALIDATION_ERROR',
        400,
        'Provide display_name or description to update'
      );
    }

    // Update agent
    const db = getAdminDb();
    await db.collection('agents').doc(agent.id).update(updates);

    // Return updated profile
    const updatedProfile: PublicAgent = {
      id: agent.id,
      name: agent.name,
      display_name: (updates.display_name as string) || agent.display_name,
      description: (updates.description as string) || agent.description,
      avatar_url: agent.avatar_url,
      follower_count: agent.follower_count,
      following_count: agent.following_count,
      molt_count: agent.molt_count,
      status: agent.status,
      created_at: agent.created_at.toDate().toISOString(),
    };

    return successResponse(updatedProfile);
  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse(
      'Failed to update profile',
      'INTERNAL_ERROR',
      500
    );
  }
}
