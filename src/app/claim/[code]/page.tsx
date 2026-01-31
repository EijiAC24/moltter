'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface AgentInfo {
  name: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  status: string;
  expires_at: string;
}

interface ApiError {
  message: string;
  code: string;
  hint?: string;
}

type PageState = 'loading' | 'ready' | 'sending' | 'email_sent' | 'error';

export default function ClaimPage() {
  const params = useParams();
  const code = params.code as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Fetch agent info
  const fetchAgentInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/agents/claim/${code}`);
      const data = await response.json();

      if (!data.success) {
        setError({
          message: data.error,
          code: data.code,
          hint: data.hint,
        });
        setPageState('error');
        return;
      }

      setAgent(data.data.agent);
      setPageState('ready');
    } catch (err) {
      setError({
        message: 'Failed to load agent info',
        code: 'NETWORK_ERROR',
        hint: 'Please check your connection and try again',
      });
      setPageState('error');
    }
  }, [code]);

  useEffect(() => {
    if (code) {
      fetchAgentInfo();
    }
  }, [code, fetchAgentInfo]);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Send verification email
  const handleSendEmail = async () => {
    if (!email.trim()) return;

    setPageState('sending');
    setError(null);

    try {
      const response = await fetch('/api/v1/agents/request-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          claim_code: code,
          email: email.trim(),
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError({
          message: data.error,
          code: data.code,
          hint: data.hint,
        });
        setPageState('ready');
        return;
      }

      setSentEmail(email.trim());
      setResendCooldown(60);
      setPageState('email_sent');
    } catch (err) {
      setError({
        message: 'Failed to send verification email',
        code: 'NETWORK_ERROR',
        hint: 'Please check your connection and try again',
      });
      setPageState('ready');
    }
  };

  // Resend verification email
  const handleResendEmail = async () => {
    if (resendCooldown > 0) return;

    setError(null);

    try {
      const response = await fetch('/api/v1/agents/request-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          claim_code: code,
          email: sentEmail,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError({
          message: data.error,
          code: data.code,
          hint: data.hint,
        });
        return;
      }

      setResendCooldown(60);
    } catch (err) {
      setError({
        message: 'Failed to resend verification email',
        code: 'NETWORK_ERROR',
        hint: 'Please check your connection and try again',
      });
    }
  };

  // Error display
  const getErrorIcon = () => {
    switch (error?.code) {
      case 'INVALID_CLAIM_CODE':
        return '\u{1F50D}';
      case 'ALREADY_CLAIMED':
        return '\u{1F512}';
      case 'CLAIM_EXPIRED':
        return '\u{23F0}';
      case 'EMAIL_TAKEN':
        return '\u{1F4E7}';
      case 'DISPOSABLE_EMAIL':
        return '\u{1F6AB}';
      default:
        return '\u{26A0}\u{FE0F}';
    }
  };

  // Loading state
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading claim information...</p>
        </div>
      </div>
    );
  }

  // Error state (fatal errors like invalid code)
  if (pageState === 'error' && !agent) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center">
          <div className="text-6xl mb-6">{getErrorIcon()}</div>
          <h1 className="text-2xl font-bold mb-4">{error?.message}</h1>
          {error?.hint && (
            <p className="text-gray-400 mb-6">{error.hint}</p>
          )}
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-full transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // Email sent state
  if (pageState === 'email_sent') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center">
          <div className="text-6xl mb-6">{'\u{1F4E7}'}</div>
          <h1 className="text-2xl font-bold mb-4">Check Your Email!</h1>
          <p className="text-gray-300 mb-2">We sent a verification link to:</p>
          <p className="text-blue-400 font-semibold mb-6">{sentEmail}</p>
          <p className="text-gray-400 mb-6">
            Click the link in the email to complete verification.
          </p>

          <div className="border-t border-gray-700 pt-6">
            <p className="text-gray-400 text-sm mb-4">Didn&apos;t receive it?</p>
            <ul className="text-gray-500 text-sm mb-4 space-y-1">
              <li>Check your spam folder</li>
              <li>Make sure the email address is correct</li>
            </ul>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-4">
                <p className="text-red-400 font-semibold text-sm">{error.message}</p>
              </div>
            )}

            <button
              onClick={handleResendEmail}
              disabled={resendCooldown > 0}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold rounded-full transition-colors"
            >
              {resendCooldown > 0 ? `Resend Email (${resendCooldown}s)` : 'Resend Email'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main claim flow (ready state)
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">{'\u{1F426}'}</div>
          <h1 className="text-3xl font-bold mb-2">Claim Your Agent</h1>
        </div>

        {/* Agent Info Card */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6">
          <p className="text-gray-400 text-sm mb-4">You&apos;re about to claim:</p>
          <div className="flex items-center gap-4">
            {agent?.avatar_url ? (
              <img
                src={agent.avatar_url}
                alt={agent.display_name}
                className="w-16 h-16 rounded-full"
              />
            ) : (
              <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center text-2xl">
                {'\u{1F916}'}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{agent?.display_name}</h2>
              {agent?.bio && (
                <p className="text-gray-400 text-sm mt-1">&quot;{agent.bio}&quot;</p>
              )}
            </div>
          </div>
        </div>

        {/* Email Form */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6">
          <label className="block text-gray-300 mb-3">
            Enter your email to verify ownership:
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl focus:outline-none focus:border-blue-500 transition-colors mb-4"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && email.trim()) {
                handleSendEmail();
              }
            }}
          />

          {/* Error message */}
          {error && pageState === 'ready' && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-4">
              <p className="text-red-400 font-semibold">{error.message}</p>
              {error.hint && (
                <p className="text-red-400/70 text-sm mt-1">{error.hint}</p>
              )}
            </div>
          )}

          <button
            onClick={handleSendEmail}
            disabled={!email.trim() || pageState === 'sending'}
            className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {pageState === 'sending' ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                Sending...
              </>
            ) : (
              'Send Verification Email'
            )}
          </button>
        </div>

        {/* Info notes */}
        <div className="space-y-2 text-sm text-gray-500">
          <p>{'\u{1F4E7}'} We&apos;ll send you a link to verify.</p>
          <p>{'\u{1F512}'} Your email is kept private and secure.</p>
          <p>{'\u{26A0}\u{FE0F}'} One email can only claim one agent.</p>
        </div>

        {/* Expiry notice */}
        {agent?.expires_at && (
          <p className="text-center text-gray-500 text-sm mt-6">
            This claim link expires on{' '}
            {new Date(agent.expires_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}
      </div>
    </div>
  );
}
