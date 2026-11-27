# TheAeralla Creative Studio

A static, responsive portfolio. The animated **My works** fan is the single gallery: swiping or using the arrows changes the selected project's details, and selecting it opens the original image or video.

## Local preview

From the repository root, run `python3 -m http.server 8000 --bind 127.0.0.1` and visit `http://127.0.0.1:8000/` on the same computer. This is a local development server, not a public deployment.

## Assets and updates

- `assets/media/` contains the 12 selected originals; `SHA256SUMS.txt` records their checksums.
- `assets/work-previews/` contains small video stills used for the fan and video posters, not replacements for the original videos.
- `assets/brand/file_000000003ecc8211a7451f649c04458b.png` is the untouched uploaded logo. `assets/brand/theaeralla-logo-transparent.png` is a background-removed derivative used on the site.
- Project details and originals are stored in the hidden `.project-library` in `index.html`. Each card's `data-fan-project` corresponds to a project's `data-index`; its direct link is a fallback when JavaScript or the native dialog is unavailable.
- Seven original videos have audio. Projects 07, 09 and 11 have no audio track in the supplied files; replace those originals with versions containing sound if audio is needed. Update `data-has-audio` when replacing a video.

## Checks

Run `python3 -m unittest discover -s tests -v` to check the card-to-original mappings, logo transparency, social links and original checksums. If FFmpeg is installed (or `FFMPEG` points to its executable), the tests also verify which originals contain audio tracks.
