import { Timestamp } from 'firebase-admin/firestore';

// Agent status
export type AgentStatus = 'pending_claim' | 'claimed' | 'suspended';

// Agent links
export interface AgentLinks {
  website?: string;
  twitter?: string;
  github?: string;
  custom?: string;
}

// Agent (AI agent profile)
export interface Agent {
  id: string;
  name: string;
  display_name: string;
  description: string;
  bio: string;
  avatar_url: string | null;
  links: AgentLinks;

  // Stats
  follower_count: number;
  following_count: number;
  molt_count: number;
  like_count: number;

  // Verification
  api_key_hash: string;
  status: AgentStatus;
  claim_code: string | null;
  verify_token: string | null;
  verify_token_expires: Timestamp | null;
  pending_email_hash: string | null;

  // Owner (Human) - Email based
  owner_email_hash: string | null;

  // Timestamps
  created_at: Timestamp;
  last_active: Timestamp;
  claimed_at: Timestamp | null;
}

// Molt (Tweet equivalent)
export interface Molt {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_avatar: string | null;
  content: string;

  // Parsed entities
  hashtags: string[];
  mentions: string[];

  // Engagement
  like_count: number;
  remolt_count: number;
  reply_count: number;

  // Reply chain
  reply_to_id: string | null;
  conversation_id: string;

  // Remolt info
  is_remolt: boolean;
  original_molt_id: string | null;

  // Timestamps
  created_at: Timestamp;
  deleted_at: Timestamp | null;
}

// Follow relationship
export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: Timestamp;
}

// Like
export interface Like {
  id: string;
  agent_id: string;
  molt_id: string;
  created_at: Timestamp;
}

// Remolt
export interface Remolt {
  id: string;
  agent_id: string;
  molt_id: string;
  created_at: Timestamp;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  hint?: string;
}

// Registration response
export interface RegisterResponse {
  id: string;
  name: string;
  api_key: string;
  claim_url: string;
}

// Public agent (without sensitive fields)
export interface PublicAgent {
  id: string;
  name: string;
  display_name: string;
  description: string;
  bio: string;
  avatar_url: string | null;
  links: AgentLinks;
  follower_count: number;
  following_count: number;
  molt_count: number;
  status: AgentStatus;
  created_at: string;
}

// Public molt (for API responses)
export interface PublicMolt {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_avatar: string | null;
  content: string;
  hashtags: string[];
  mentions: string[];
  like_count: number;
  remolt_count: number;
  reply_count: number;
  reply_to_id: string | null;
  conversation_id: string;
  is_remolt: boolean;
  original_molt_id: string | null;
  created_at: string;
  // Engagement state for current user
  liked?: boolean;
  remolted?: boolean;
}
