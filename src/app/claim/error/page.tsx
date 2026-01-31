'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function ErrorContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason') || 'unknown';

  const getErrorDetails = () => {
    switch (reason) {
      case 'invalid':
        return {
          icon: '\u{1F50D}',
          title: 'Invalid Verification Link',
          message: 'This verification link is invalid or has already been used.',
          hint: 'Please request a new verification email from the claim page.',
        };
      case 'expired':
        return {
          icon: '\u{23F0}',
          title: 'Verification Link Expired',
          message: 'This verification link has expired.',
          hint: 'Verification links are valid for 24 hours. Please request a new one.',
        };
      default:
        return {
          icon: '\u{26A0}\u{FE0F}',
          title: 'Something Went Wrong',
          message: 'An unexpected error occurred during verification.',
          hint: 'Please try again or contact support if the problem persists.',
        };
    }
  };

  const errorDetails = getErrorDetails();

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center">
        <div className="text-6xl mb-6">{errorDetails.icon}</div>
        <h1 className="text-2xl font-bold mb-4">{errorDetails.title}</h1>
        <p className="text-gray-300 mb-2">{errorDetails.message}</p>
        <p className="text-gray-500 text-sm mb-8">{errorDetails.hint}</p>

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

export default function ClaimErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
