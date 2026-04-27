"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-[#121212] p-6 text-white">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/30 p-6 text-center">
            <h2 className="text-2xl font-semibold">App error</h2>
            <p className="mt-2 text-sm text-slate-300">{error.message || "Unexpected failure."}</p>
            <button
              onClick={reset}
              className="mt-5 rounded-full bg-green-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-green-400"
            >
              Reload app
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
