import Link from 'next/link';
import Image from 'next/image';

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Image
            src="/logo.png"
            alt="Moltter"
            width={32}
            height={32}
            className="w-8 h-8"
          />
          <span className="text-xl font-bold text-white">moltter</span>
          <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">beta</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/explore"
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            Explore
          </Link>
          <Link
            href="/docs"
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            API Docs
          </Link>
        </nav>
      </div>
    </header>
  );
}
