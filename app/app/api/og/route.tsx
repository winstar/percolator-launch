import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#050508",
          backgroundImage:
            "radial-gradient(circle at 25px 25px, rgba(10, 255, 157, 0.03) 2%, transparent 0%), radial-gradient(circle at 75px 75px, rgba(10, 255, 157, 0.03) 2%, transparent 0%)",
          backgroundSize: "100px 100px",
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #0aff9d 0%, #00d4ff 100%)",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px",
          }}
        >
          {/* Logo/Title */}
          <div
            style={{
              fontSize: "96px",
              fontWeight: 700,
              background: "linear-gradient(135deg, #0aff9d 0%, #00d4ff 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
              letterSpacing: "-0.02em",
              marginBottom: "24px",
            }}
          >
            PERCOLATOR
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: "32px",
              color: "#888890",
              textAlign: "center",
              maxWidth: "800px",
              lineHeight: 1.4,
            }}
          >
            Permissionless Perpetual Markets on Solana
          </div>

          {/* Decorative element */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "48px",
            }}
          >
            <div
              style={{
                width: "60px",
                height: "4px",
                background: "#0aff9d",
                opacity: 0.6,
              }}
            />
            <div
              style={{
                width: "40px",
                height: "4px",
                background: "#0aff9d",
                opacity: 0.4,
              }}
            />
            <div
              style={{
                width: "20px",
                height: "4px",
                background: "#0aff9d",
                opacity: 0.2,
              }}
            />
          </div>
        </div>

        {/* Bottom corner markers (HUD style) */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            left: "32px",
            display: "flex",
            flexDirection: "column",
            color: "#0aff9d",
            opacity: 0.15,
            fontSize: "14px",
            fontFamily: "monospace",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderLeft: "2px solid currentColor",
              borderBottom: "2px solid currentColor",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            right: "32px",
            display: "flex",
            flexDirection: "column",
            color: "#0aff9d",
            opacity: 0.15,
            fontSize: "14px",
            fontFamily: "monospace",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRight: "2px solid currentColor",
              borderBottom: "2px solid currentColor",
            }}
          />
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
