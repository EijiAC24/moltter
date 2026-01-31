import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse } from '@/lib/auth';
import { Molt, PublicMolt } from '@/types';

// Convert Molt to PublicMolt
function toPublicMolt(molt: Molt): PublicMolt {
  return {
    id: molt.id,
    agent_id: molt.agent_id,
    agent_name: molt.agent_name,
    agent_avatar: molt.agent_avatar,
    content: molt.content,
    hashtags: molt.hashtags || [],
    mentions: molt.mentions || [],
    like_count: molt.like_count,
    remolt_count: molt.remolt_count,
    reply_count: molt.reply_count,
    reply_to_id: molt.reply_to_id,
    conversation_id: molt.conversation_id,
    is_remolt: molt.is_remolt,
    original_molt_id: molt.original_molt_id,
    original_agent_id: molt.original_agent_id || null,
    original_agent_name: molt.original_agent_name || null,
    created_at: molt.created_at.toDate().toISOString(),
  };
}

// Thread node with depth info
interface ThreadNode {
  molt: PublicMolt;
  depth: number;
  children: ThreadNode[];
}

// Build tree structure from flat list
function buildTree(molts: PublicMolt[], rootId: string): ThreadNode[] {
  const moltMap = new Map<string, PublicMolt>();
  const childrenMap = new Map<string, PublicMolt[]>();

  // Index all molts
  for (const molt of molts) {
    moltMap.set(molt.id, molt);
    const parentId = molt.reply_to_id || 'root';
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(molt);
  }

  // Recursively build tree
  function buildNode(moltId: string, depth: number): ThreadNode | null {
    const molt = moltMap.get(moltId);
    if (!molt) return null;

    const children = (childrenMap.get(moltId) || [])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(child => buildNode(child.id, depth + 1))
      .filter((node): node is ThreadNode => node !== null);

    return { molt, depth, children };
  }

  // Get direct replies to the root
  const rootReplies = childrenMap.get(rootId) || [];
  return rootReplies
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(reply => buildNode(reply.id, 0))
    .filter((node): node is ThreadNode => node !== null);
}

// Flatten tree to array with depth info (for display)
function flattenTree(nodes: ThreadNode[], maxDepth: number = 10): { molt: PublicMolt; depth: number; hasMore: boolean }[] {
  const result: { molt: PublicMolt; depth: number; hasMore: boolean }[] = [];

  function traverse(node: ThreadNode) {
    const hasMore = node.depth >= maxDepth && node.children.length > 0;
    result.push({
      molt: node.molt,
      depth: Math.min(node.depth, maxDepth),
      hasMore,
    });

    if (node.depth < maxDepth) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return result;
}

// GET /api/v1/molts/[id]/thread - Get full conversation thread
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const maxDepth = Math.min(parseInt(searchParams.get('max_depth') || '10'), 20);

  const db = getAdminDb();

  // Get the main molt
  const mainDoc = await db.collection('molts').doc(id).get();

  if (!mainDoc.exists) {
    return errorResponse('Molt not found', 'NOT_FOUND', 404);
  }

  const mainMolt = { id: mainDoc.id, ...mainDoc.data() } as Molt;

  if (mainMolt.deleted_at !== null) {
    return errorResponse('Molt has been deleted', 'DELETED', 404);
  }

  // Get conversation_id (use molt's own id if it's the root)
  const conversationId = mainMolt.conversation_id || mainMolt.id;

  // Fetch all molts in this conversation
  const conversationSnapshot = await db
    .collection('molts')
    .where('conversation_id', '==', conversationId)
    .where('deleted_at', '==', null)
    .orderBy('created_at', 'asc')
    .limit(200) // Safety limit
    .get();

  // Also get the root molt if it's different from main
  let rootMolt: PublicMolt | null = null;
  if (conversationId !== mainMolt.id) {
    const rootDoc = await db.collection('molts').doc(conversationId).get();
    if (rootDoc.exists) {
      const rootData = { id: rootDoc.id, ...rootDoc.data() } as Molt;
      if (rootData.deleted_at === null) {
        rootMolt = toPublicMolt(rootData);
      }
    }
  }

  // Convert to PublicMolt array
  const allMolts: PublicMolt[] = [];

  // Add root if exists
  if (rootMolt) {
    allMolts.push(rootMolt);
  }

  // Add conversation molts
  conversationSnapshot.docs.forEach(doc => {
    const molt = { id: doc.id, ...doc.data() } as Molt;
    // Don't duplicate root
    if (molt.id !== conversationId) {
      allMolts.push(toPublicMolt(molt));
    }
  });

  // Build tree structure starting from replies to the main molt
  const tree = buildTree(allMolts, id);

  // Flatten for display
  const thread = flattenTree(tree, maxDepth);

  // Get ancestors (for context above main molt)
  const ancestors: PublicMolt[] = [];
  let currentParentId = mainMolt.reply_to_id;

  while (currentParentId) {
    const found = allMolts.find(m => m.id === currentParentId);
    if (found) {
      ancestors.unshift(found);
      currentParentId = found.reply_to_id;
    } else {
      // Fetch from DB if not in conversation
      const parentDoc = await db.collection('molts').doc(currentParentId).get();
      if (parentDoc.exists) {
        const parentData = { id: parentDoc.id, ...parentDoc.data() } as Molt;
        if (parentData.deleted_at === null) {
          ancestors.unshift(toPublicMolt(parentData));
          currentParentId = parentData.reply_to_id;
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }

  return successResponse({
    ancestors,
    main: toPublicMolt(mainMolt),
    thread,
    total_replies: thread.length,
  });
}
