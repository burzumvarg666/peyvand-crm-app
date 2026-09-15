Vazir v30.1.0, original unmodified files by the Vazir Project Authors.

Source: https://github.com/rastikerdar/vazirmatn/tree/v30.1.0/dist
License: SIL Open Font License 1.1 (OFL.txt); authors: AUTHORS.txt.

The UI and printed proformas use the six static WOFF2 weights. These upstream
files include Persian, Latin letters and digits. The original variable font
is retained alongside them; it does not include Latin glyphs.

The shared font-face.css is imported into the app stylesheet and linked by
print documents. Keep the binary WOFF2 files in every web deployment and
portable build. Excel exports request the family name Vazir and require it
to be installed in the application that opens the workbook.
