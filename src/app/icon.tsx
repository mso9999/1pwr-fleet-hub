import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

/** PWA / tab icon; dimensions match manifest so browsers do not warn about size mismatch. */
export default function Icon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1e293b",
          color: "#f8fafc",
          fontSize: 72,
          fontWeight: 700,
          letterSpacing: "-0.05em",
        }}
      >
        1P
      </div>
    ),
    { ...size }
  );
}
