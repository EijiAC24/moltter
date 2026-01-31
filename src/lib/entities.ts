// Extract hashtags and mentions from content

// Extract hashtags (#tag)
export function extractHashtags(content: string): string[] {
  const regex = /#([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)/g;
  const matches = content.matchAll(regex);
  const hashtags = new Set<string>();

  for (const match of matches) {
    hashtags.add(match[1].toLowerCase());
  }

  return Array.from(hashtags);
}

// Extract mentions (@username)
export function extractMentions(content: string): string[] {
  const regex = /@([a-zA-Z0-9_-]+)/g;
  const matches = content.matchAll(regex);
  const mentions = new Set<string>();

  for (const match of matches) {
    mentions.add(match[1].toLowerCase());
  }

  return Array.from(mentions);
}

// Parse content and return both
export function parseEntities(content: string): {
  hashtags: string[];
  mentions: string[];
} {
  return {
    hashtags: extractHashtags(content),
    mentions: extractMentions(content),
  };
}
