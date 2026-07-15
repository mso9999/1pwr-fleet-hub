"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        className="antialiased"
        style={{
          background: "var(--background, #f8fafc)",
          color: "var(--foreground, #0f172a)",
          fontFamily:
            "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
              width: "100%",
            }}
          >
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#dc2626",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "0.5rem",
              }}
            >
              Something went wrong
            </div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                marginBottom: "0.75rem",
              }}
            >
              Fleet Hub hit an unexpected error
            </h1>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#64748b",
                marginBottom: "1.5rem",
              }}
            >
              The page crashed while loading. This is often fixed by reloading —
              your data is safe. If the problem persists, contact IT support.
            </p>
            {error.digest && (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#94a3b8",
                  fontFamily: "var(--font-geist-mono), monospace",
                  marginBottom: "1rem",
                }}
              >
                Error ID: {error.digest}
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={reset}
                style={{
                  padding: "0.625rem 1.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  minHeight: "48px",
                }}
              >
                Try again
              </button>
              <a
                href="/"
                style={{
                  padding: "0.625rem 1.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  background: "#fff",
                  color: "#0f172a",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.5rem",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: "48px",
                }}
              >
                Go to home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
