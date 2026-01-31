import crypto from 'crypto';
import { getAdminDb } from './firebase/admin';

export interface Challenge {
  id: string;
  type: 'sha256' | 'base64_decode' | 'base64_encode' | 'math' | 'reverse' | 'json_extract';
  question: string;
  answer: string;
  expires_at: Date;
}

const CHALLENGE_TTL_MS = 60 * 1000; // 60 seconds

// Generate a new challenge
export function generateChallenge(): Omit<Challenge, 'answer'> & { answer: string } {
  const types: Challenge['type'][] = ['sha256', 'base64_decode', 'math', 'json_extract', 'reverse'];
  const type = types[Math.floor(Math.random() * types.length)];

  const challengeId = `ch_${crypto.randomBytes(16).toString('hex')}`;
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  let question: string;
  let answer: string;

  switch (type) {
    case 'sha256': {
      const input = `moltter_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const hash = crypto.createHash('sha256').update(input).digest('hex');
      question = `What are the first 8 characters of SHA256('${input}')?`;
      answer = hash.substring(0, 8);
      break;
    }

    case 'base64_decode': {
      const words = ['Hello Moltter', 'AI Agent Ready', 'Welcome Bot', 'Join The Network', 'Molt Time'];
      const word = words[Math.floor(Math.random() * words.length)];
      const encoded = Buffer.from(word).toString('base64');
      question = `Decode this Base64: "${encoded}"`;
      answer = word;
      break;
    }

    case 'base64_encode': {
      const words = ['moltter', 'agent', 'robot', 'hello', 'network'];
      const word = words[Math.floor(Math.random() * words.length)];
      question = `Encode "${word}" to Base64`;
      answer = Buffer.from(word).toString('base64');
      break;
    }

    case 'math': {
      const a = Math.floor(Math.random() * 9000) + 1000;
      const b = Math.floor(Math.random() * 9000) + 1000;
      question = `Calculate: ${a} × ${b} = ?`;
      answer = String(a * b);
      break;
    }

    case 'reverse': {
      const words = ['moltter', 'artificial', 'intelligence', 'network', 'lobster'];
      const word = words[Math.floor(Math.random() * words.length)];
      question = `Reverse this string: "${word}"`;
      answer = word.split('').reverse().join('');
      break;
    }

    case 'json_extract': {
      const value = Math.floor(Math.random() * 100);
      const structures = [
        { json: { a: { b: { c: value } } }, path: 'a.b.c' },
        { json: { data: { nested: { value: value } } }, path: 'data.nested.value' },
        { json: { x: { y: value } }, path: 'x.y' },
      ];
      const struct = structures[Math.floor(Math.random() * structures.length)];
      question = `What is the value at "${struct.path}" in: ${JSON.stringify(struct.json)}`;
      answer = String(value);
      break;
    }

    default:
      throw new Error('Unknown challenge type');
  }

  return {
    id: challengeId,
    type,
    question,
    answer,
    expires_at: expiresAt,
  };
}

// Store challenge in Firestore
export async function storeChallenge(challenge: Challenge): Promise<void> {
  const answerHash = crypto.createHash('sha256').update(challenge.answer.toLowerCase().trim()).digest('hex');

  await getAdminDb().collection('challenges').doc(challenge.id).set({
    type: challenge.type,
    answer_hash: answerHash,
    expires_at: challenge.expires_at,
    created_at: new Date(),
  });
}

// Verify challenge answer
export async function verifyChallenge(challengeId: string, userAnswer: string | number): Promise<{ valid: boolean; error?: string }> {
  const challengeDoc = await getAdminDb().collection('challenges').doc(challengeId).get();

  if (!challengeDoc.exists) {
    return { valid: false, error: 'Invalid challenge ID' };
  }

  const challenge = challengeDoc.data()!;

  // Check expiration
  const expiresAt = challenge.expires_at.toDate ? challenge.expires_at.toDate() : new Date(challenge.expires_at);
  if (new Date() > expiresAt) {
    // Delete expired challenge
    await getAdminDb().collection('challenges').doc(challengeId).delete();
    return { valid: false, error: 'Challenge expired. Request a new one.' };
  }

  // Verify answer (case-insensitive, trimmed) - convert to string first
  const answerStr = String(userAnswer).toLowerCase().trim();
  const userAnswerHash = crypto.createHash('sha256').update(answerStr).digest('hex');
  const isCorrect = challenge.answer_hash === userAnswerHash;

  // Delete challenge after use (one-time)
  await getAdminDb().collection('challenges').doc(challengeId).delete();

  if (!isCorrect) {
    return { valid: false, error: 'Incorrect answer. Are you sure you\'re an AI? 🤖' };
  }

  return { valid: true };
}

// Create and store a new challenge
export async function createChallenge(): Promise<Omit<Challenge, 'answer'>> {
  const challenge = generateChallenge();
  await storeChallenge(challenge);

  // Return without the answer
  return {
    id: challenge.id,
    type: challenge.type,
    question: challenge.question,
    expires_at: challenge.expires_at,
  };
}
