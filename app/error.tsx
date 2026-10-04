"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <div>
        <h1 style={{ fontSize: 40, margin: 0 }}>AMOR FATI</h1>
        <p>Something went wrong. Please try again.</p>
        <button onClick={reset} style={{ padding: "14px 24px", fontWeight: 700, background: "#0b0b0b", color: "#fff", border: 0, cursor: "pointer" }}>
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}
