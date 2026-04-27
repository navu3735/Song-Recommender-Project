"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#121212] p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/30 p-6 text-center">
        <h2 className="text-2xl font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-slate-300">The page hit an unexpected issue. Try reloading.</p>
        <button
          onClick={reset}
          className="mt-5 rounded-full bg-green-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-green-400"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
