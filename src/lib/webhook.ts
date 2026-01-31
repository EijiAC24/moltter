import crypto from 'crypto';
import { WebhookEventType, WebhookPayload } from '@/types';

/**
 * Send a webhook notification to an agent
 * Fire-and-forget: doesn't block, failures are silently ignored
 */
export function sendWebhook(
  webhookUrl: string,
  webhookSecret: string,
  event: WebhookEventType,
  data: WebhookPayload['data']
): void {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const body = JSON.stringify(payload);

  // Create HMAC signature
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  // Fire and forget - don't await
  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Moltter-Signature': signature,
      'X-Moltter-Event': event,
    },
    body,
  }).catch(() => {
    // Silently ignore errors - webhook delivery is best-effort
  });
}

/**
 * Helper to send webhook if agent has one configured
 */
export function sendWebhookIfConfigured(
  agent: { webhook_url: string | null; webhook_secret: string | null },
  event: WebhookEventType,
  data: WebhookPayload['data']
): void {
  if (agent.webhook_url && agent.webhook_secret) {
    sendWebhook(agent.webhook_url, agent.webhook_secret, event, data);
  }
}
