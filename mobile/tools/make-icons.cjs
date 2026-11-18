// Builds the Android launcher icons and splash images from the brand assets.
// Run from the repo root: node mobile/tools/make-icons.cjs (uses web/'s sharp).
const path = require("path");
const sharp = require(path.resolve("web/node_modules/sharp"));
const RES = path.resolve("mobile/android/app/src/main/res");
const MARK = path.resolve("web/public/brand/financer-icon.png"); // transparent F mark
const LOCKUP = path.resolve("web/public/brand/financer-lockup.png");
const BG = "#F5F6F2";
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function onCanvas(src, canvas, inner, bg) {
  const mark = await sharp(src).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: bg } })
    .composite([{ input: mark, gravity: "center" }])
    .png();
}

(async () => {
  for (const [name, k] of Object.entries(DENSITY)) {
    const dir = path.join(RES, `mipmap-${name}`);
    // Adaptive foreground: 108dp canvas, logo inside the 66dp safe zone.
    await (await onCanvas(MARK, Math.round(108 * k), Math.round(62 * k), { r: 0, g: 0, b: 0, alpha: 0 })).toFile(path.join(dir, "ic_launcher_foreground.png"));
    // Legacy square and round icons (Android 7 and older launchers).
    const size = Math.round(48 * k);
    await (await onCanvas(MARK, size, Math.round(size * 0.68), "#FFFFFF")).toFile(path.join(dir, "ic_launcher.png"));
    const round = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
    const mark = await sharp(MARK).resize(Math.round(size * 0.6), Math.round(size * 0.6), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    await sharp(round).composite([{ input: mark, gravity: "center" }]).png().toFile(path.join(dir, "ic_launcher_round.png"));
  }
  // Splash (pre-Android 12 and the Capacitor splash): brand background with the lockup.
  const fs = require("fs");
  for (const d of fs.readdirSync(RES).filter((d) => d === "drawable" || /^drawable-(port|land)-/.test(d))) {
    const file = path.join(RES, d, "splash.png");
    if (!fs.existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    const w = Math.round(Math.min(width, height) * 0.5);
    const lockup = await sharp(LOCKUP).resize({ width: w }).toBuffer();
    await sharp({ create: { width, height, channels: 4, background: BG } }).composite([{ input: lockup, gravity: "center" }]).png().toFile(file + ".tmp");
    fs.renameSync(file + ".tmp", file);
  }
  console.log("icons and splash written");
})();
