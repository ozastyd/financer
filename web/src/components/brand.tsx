/* eslint-disable @next/next/no-img-element -- a small static logo; next/image adds nothing here */

/**
 * The Financer mark next to the name. The name is live text in the app font so
 * it follows the light/dark theme; the mark itself works on both backgrounds.
 */
export function BrandMark({ size = 40, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <span className="row" style={{ gap: Math.round(size * 0.3), alignItems: "center" }}>
      <img src="/brand/financer-icon.png" alt={showName ? "" : "Financer"} width={size} height={size} style={{ width: size, height: size, flex: "none" }} />
      {showName && (
        <span className="b" style={{ fontSize: Math.round(size * 0.62), letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1 }}>
          Financer
        </span>
      )}
    </span>
  );
}
