"use client";

import { useEffect } from "react";

/**
 * Last resort: this replaces the root layout, so it gets no fonts, no global
 * stylesheet and no next-intl provider. Everything here is therefore inline and
 * in both languages. It renders only when the root layout itself throws — an
 * ordinary page error is handled by `[locale]/error.tsx`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#0b0b0f",
          color: "#e7e7ea",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 0.25rem", color: "#a1a1aa" }}>
            We could not load the page. Please try again in a moment.
          </p>
          <p lang="ro" style={{ margin: "0 0 1.5rem", color: "#a1a1aa" }}>
            Nu am putut încărca pagina. Încearcă din nou peste câteva momente.
          </p>
          {/* The digest is the only safe handle on the server-side stack trace. */}
          {error.digest ? (
            <p style={{ margin: "0 0 1.5rem", fontSize: "0.75rem", color: "#6b7280" }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: "pointer",
              border: 0,
              borderRadius: "0.5rem",
              padding: "0.625rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              background: "#e7e7ea",
              color: "#0b0b0f",
            }}
          >
            Try again / Reîncearcă
          </button>
        </main>
      </body>
    </html>
  );
}
