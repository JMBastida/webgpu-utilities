# Output controls responsive check

These screenshots capture the output/replacement panel in Chromium at five viewport sizes and three UI states. They are synthetic, local-only fixtures; no uploaded image or translation service was used.

| Viewport                | Empty                           | OCR text ready                          | Edit ready                                |
| ----------------------- | ------------------------------- | --------------------------------------- | ----------------------------------------- |
| Desktop, 1165 × 747     | [empty](empty-desktop.png)      | [OCR ready](ocr-ready-desktop.png)      | [edit ready](edit-ready-desktop.png)      |
| Tablet, 768 × 1024      | [empty](empty-tablet.png)       | [OCR ready](ocr-ready-tablet.png)       | [edit ready](edit-ready-tablet.png)       |
| Compact wide, 901 × 800 | [empty](empty-compact-wide.png) | [OCR ready](ocr-ready-compact-wide.png) | [edit ready](edit-ready-compact-wide.png) |
| Narrow, 320 × 740       | [empty](empty-narrow.png)       | [OCR ready](ocr-ready-narrow.png)       | [edit ready](edit-ready-narrow.png)       |
| Mobile, 390 × 844       | [empty](empty-mobile.png)       | [OCR ready](ocr-ready-mobile.png)       | [edit ready](edit-ready-mobile.png)       |

The browser sweep confirmed no horizontal document overflow or control overlap at these sizes, associated labels on all three selectors, and action buttons that fit on one line. The Quality selector was set to “High quality” to cover its longest option. The empty state kept actions disabled; the OCR-ready state enabled replacement; and the edit-ready state displayed the editor and result preview with all actions enabled.

The ready states were set up by injecting synthetic DOM values into the running app. This evidence checks layout and visible states, not OCR, translation, image-editing pixels, or actual Bergamot model loading.
