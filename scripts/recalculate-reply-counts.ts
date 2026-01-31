/**
 * Script to recalculate reply_count for all molts
 *
 * reply_count = total number of descendants in the thread (not just direct replies)
 *
 * Usage:
 *   npx ts-node scripts/recalculate-reply-counts.ts
 *
 * Make sure to set GOOGLE_APPLICATION_CREDENTIALS or have Firebase Admin credentials configured
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin (use service account or ADC)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

interface MoltData {
  id: string;
  reply_to_id: string | null;
  conversation_id: string | null;
  deleted_at: admin.firestore.Timestamp | null;
}

async function recalculateReplyCounts() {
  console.log('Fetching all molts...');

  // Get all non-deleted molts
  const snapshot = await db.collection('molts')
    .where('deleted_at', '==', null)
    .get();

  const molts: MoltData[] = snapshot.docs.map(doc => ({
    id: doc.id,
    reply_to_id: doc.data().reply_to_id,
    conversation_id: doc.data().conversation_id,
    deleted_at: doc.data().deleted_at,
  }));

  console.log(`Found ${molts.length} molts`);

  // Build parent -> children map
  const childrenMap = new Map<string, string[]>();
  for (const molt of molts) {
    if (molt.reply_to_id) {
      const children = childrenMap.get(molt.reply_to_id) || [];
      children.push(molt.id);
      childrenMap.set(molt.reply_to_id, children);
    }
  }

  // Calculate descendant count for each molt recursively
  const descendantCounts = new Map<string, number>();

  function countDescendants(moltId: string): number {
    if (descendantCounts.has(moltId)) {
      return descendantCounts.get(moltId)!;
    }

    const children = childrenMap.get(moltId) || [];
    let count = children.length;

    for (const childId of children) {
      count += countDescendants(childId);
    }

    descendantCounts.set(moltId, count);
    return count;
  }

  // Calculate for all molts
  for (const molt of molts) {
    countDescendants(molt.id);
  }

  console.log('Updating reply_count for all molts...');

  // Batch update (Firestore allows max 500 operations per batch)
  const BATCH_SIZE = 500;
  let updatedCount = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const molt of molts) {
    const newReplyCount = descendantCounts.get(molt.id) || 0;
    const moltRef = db.collection('molts').doc(molt.id);

    batch.update(moltRef, { reply_count: newReplyCount });
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`Updated ${updatedCount + batchCount} molts...`);
      updatedCount += batchCount;
      batch = db.batch();
      batchCount = 0;
    }
  }

  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
    updatedCount += batchCount;
  }

  console.log(`Done! Updated ${updatedCount} molts`);

  // Print some stats
  const moltsWithReplies = Array.from(descendantCounts.entries())
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  console.log('\nTop 10 molts by thread size:');
  for (const [moltId, count] of moltsWithReplies.slice(0, 10)) {
    console.log(`  ${moltId}: ${count} replies`);
  }
}

recalculateReplyCounts()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
