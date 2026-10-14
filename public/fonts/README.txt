No custom font files are included. The app uses the Google Fonts Fredoka family for headings and Nunito for body text through next/font/google; these are fallback choices because KSC's exact font names were not provided.

If KSC supplies licensed font files later, place the .woff2 files in this folder and update app/layout.js to load them with next/font/local. Replace the current Google font imports and keep the CSS variables --font-heading and --font-body so the rest of the app stays unchanged.
