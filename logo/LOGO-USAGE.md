# Smooth Family logo

A smooth-cornered house sheltering a parent and child - your family, your home,
your data. Spruce green `#24402F`, honey amber `#E09B3D`, linen `#F2F1EC`.

## Files

| File | Use |
|---|---|
| icon.svg | App icon / favicon source (squircle, full color) |
| icon-512/192/64/32/16.png | PWA icons, app stores, favicons |
| favicon.ico | Legacy favicon (16/32/48 bundled) |
| logo-mark-on-dark.svg | Transparent mark for dark backgrounds (sidebar) |
| logo-mark-on-light.svg | Transparent mark for light backgrounds |
| logo-horizontal.svg/.png | Lockup with wordmark, for README and docs |

## Wiring it into the app (Next.js 15)

1. Favicon: copy `icon.svg` to `frontend/src/app/icon.svg` - Next.js picks it
   up automatically, no <link> tags needed.
2. Sidebar: copy `logo-mark-on-dark.svg` to `frontend/public/` and replace the
   text-only brand in the Shell component:

   <img src="/logo-mark-on-dark.svg" alt="" className="h-8 w-8" />
   <span className="text-lg font-extrabold tracking-tight text-white">Smooth Family</span>

3. README: `![Smooth Family](docs/logo-horizontal.png)` at the top.

The wordmark in logo-horizontal.svg uses the system font stack (consistent
with the app's no-external-fonts privacy stance), so exact rendering varies
slightly between platforms. Use the pre-rendered PNG where pixel-perfect
output matters.
