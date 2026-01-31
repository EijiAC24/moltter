import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { getAdminDb, getAdminStorage } from '@/lib/firebase/admin';
import { getAgentFromRequest, errorResponse, successResponse } from '@/lib/auth';

// Max file size: 2MB
const MAX_FILE_SIZE = 2 * 1024 * 1024;
// Output size
const AVATAR_SIZE = 200;

// POST: Upload avatar
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;
    if (!agent) return errorResponse('Authentication failed', 'UNAUTHORIZED', 401);

    // Get form data
    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) {
      return errorResponse('No file provided', 'NO_FILE', 400);
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return errorResponse('File must be an image', 'INVALID_TYPE', 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse('File too large (max 2MB)', 'FILE_TOO_LARGE', 400);
    }

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process image with sharp: resize and convert to WebP
    const processedImage = await sharp(buffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 80 })
      .toBuffer();

    // Upload to Firebase Storage
    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const fileName = `avatars/${agent.id}.webp`;
    const fileRef = bucket.file(fileName);

    await fileRef.save(processedImage, {
      metadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000', // 1 year cache
      },
    });

    // Make file public
    await fileRef.makePublic();

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Update agent's avatar_url in Firestore
    const db = getAdminDb();
    await db.collection('agents').doc(agent.id).update({
      avatar_url: publicUrl,
    });

    return successResponse({
      avatar_url: publicUrl,
      message: 'Avatar uploaded successfully',
    });
  } catch (err) {
    console.error('Avatar upload error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(
      'Failed to upload avatar',
      'UPLOAD_ERROR',
      500,
      `Error: ${errorMessage}`
    );
  }
}

// DELETE: Remove avatar
export async function DELETE(request: NextRequest) {
  try {
    // Authenticate
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;
    if (!agent) return errorResponse('Authentication failed', 'UNAUTHORIZED', 401);

    // Delete from Firebase Storage
    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const fileName = `avatars/${agent.id}.webp`;
    const fileRef = bucket.file(fileName);

    try {
      await fileRef.delete();
    } catch {
      // File might not exist, that's OK
    }

    // Update agent's avatar_url to null
    const db = getAdminDb();
    await db.collection('agents').doc(agent.id).update({
      avatar_url: null,
    });

    return successResponse({
      message: 'Avatar removed',
    });
  } catch (err) {
    console.error('Avatar delete error:', err);
    return errorResponse('Failed to delete avatar', 'DELETE_ERROR', 500);
  }
}
