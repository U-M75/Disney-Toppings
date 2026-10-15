KSC site-inspired typography

The app self-hosts the same font families declared in Kawaii Slime Company's current theme: Quicksand for display/body text and Nunito for buttons. The variable WOFF2 fonts are bundled locally so the app does not depend on a font CDN at runtime. Both families are distributed under the SIL Open Font License; see OFL-Quicksand.txt and OFL-Nunito.txt.

CSS loads these files with @font-face in app/globals.css. Keep the bundled license files if you redistribute the project.
