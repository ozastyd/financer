/* eslint-disable @next/next/no-img-element -- small static logo images; next/image adds nothing here */

/** Width ÷ height of the logo lockup in public/brand/financer-lockup*.png. */
const LOCKUP_RATIO = 1223 / 325;

/**
 * The Financer logo: the F mark with the wordmark in the logo's own typeface.
 * Two images, one per theme (the wordmark is dark green on light, near-white
 * on dark); CSS shows the right one.
 */
export function BrandMark({ height = 32, alt = "Financer" }: { height?: number; alt?: string }) {
  const width = Math.round(height * LOCKUP_RATIO);
  const style = { height, width: "auto" } as const;
  return (
    <span className="brand-lockup" role="img" aria-label={alt}>
      <img className="logo-light" src="/brand/financer-lockup.png" alt="" width={width} height={height} style={style} />
      <img className="logo-dark" src="/brand/financer-lockup-dark.png" alt="" width={width} height={height} style={style} />
    </span>
  );
}

/**
 * Shown the moment someone opens the app, while it loads: the logo floating
 * over a soft shadow. Rendered on the server so it is in the first paint.
 */
export function SplashScreen({ leaving }: { leaving: boolean }) {
  return (
    <div className={`splash${leaving ? " done" : ""}`} aria-hidden="true">
      <div className="splash-float">
        <BrandMark height={56} alt="" />
      </div>
      <div className="splash-shadow" />
    </div>
  );
}
