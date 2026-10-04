import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const alt = siteConfig.siteTitle;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  const L = siteConfig.dailyLimit;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b0b0b", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, flex: 1 }}>
          <div style={{ fontSize: 30, letterSpacing: 10, fontWeight: 700 }}>AMOR FATI · TIRUPATI</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 128, fontWeight: 900, lineHeight: 0.92, letterSpacing: -4 }}>
            <span>{L} ONLY.</span>
            <span>EVERY DAY.</span>
          </div>
          <div style={{ fontSize: 30, color: "#bdbdbd" }}>Two burgers. One limited drop. Reserve before you arrive.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 300 }}>
          <div style={{ flex: 1, background: "#FFD000", color: "#0b0b0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 150, fontWeight: 900 }}>{L}</div>
          <div style={{ flex: 1, background: "#C8102E", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 150, fontWeight: 900 }}>{L}</div>
        </div>
      </div>
    ),
    size,
  );
}
