# TheAeralla Creative Studio

A static, responsive portfolio. The animated **My works** fan is the single homepage gallery: swiping or using the arrows changes the selected project's details, and selecting it opens the original image or video. Each service opens a separate page with its own relevant samples, packages, policies and enquiry links; none of those details add another gallery to the homepage.

## Local preview

From the repository root, run `python3 -m http.server 8000 --bind 127.0.0.1` and visit `http://127.0.0.1:8000/` on the same computer. This is a local development server, not a public deployment.

## Service pages and prices

- `service-pinterest.html`, `service-product-visuals.html` and `service-websites.html` contain the service-specific samples, inclusions, delivery and policies. The homepage links directly to them, including when JavaScript is disabled.
- All nine editable price fields are in `service-prices.js`, grouped by service and then `starter`, `growth` and `premium`. Enter each finalized price as text between its quotes, including the desired currency. An empty string shows **Price on enquiry**. These are studio configuration fields, not visitor-editable inputs. Save and publish the revised file when the prices are approved; the HTML also defaults to “Price on enquiry” if JavaScript is unavailable.
- Enquiry links use `hawkarc2003@gmail.com` and include the service and package in the email subject. The Blog link is a separate navigation link and is not used as a Pinterest sample.

## Assets and updates

- `assets/media/` contains the 12 selected originals; `SHA256SUMS.txt` records their checksums.
- `assets/work-previews/` contains small video stills used for the fan and video posters, not replacements for the original videos.
- `assets/brand/file_000000003ecc8211a7451f649c04458b.png` is the untouched uploaded logo. `assets/brand/theaeralla-logo-transparent.png` is a background-removed derivative used on the site.
- Project details and originals are stored in the hidden `.project-library` in `index.html`. Each card's `data-fan-project` corresponds to a project's `data-index`; its direct link is a fallback when JavaScript or the native dialog is unavailable.
- Seven original videos have audio. Projects 07, 09 and 11 have no audio track in the supplied files; replace those originals with versions containing sound if audio is needed. Update `data-has-audio` when replacing a video. The Pinterest motion pin is project 11 and is labeled silent; the product videos retain their audio and native controls.
- `assets/pinterest/rings-collection.jpg` is a byte-for-byte copy of the Rings Collection artwork from the creator's earlier [`Protofolio` repository](https://github.com/hawkarc2003-cell/Protofolio/blob/7743661384cd19bdacd4deec65f5a042146e65ea/rings-collection.jpg). It carries the studio's Pinterest and Instagram handles and appears on the linked Trendcart jewellery board; its individual Pin URL is not yet verified. The silent bracelet video is the same Git blob as the creator's earlier file whose name contains [Pin 939774647267567002](https://www.pinterest.com/pin/939774647267567002/); the Pin artwork also matches the video's bracelet design. No separate Pinterest carousel originals were positively identified, so none are represented as samples.
- `assets/product-visuals/summer-fridays.jpg` is a byte-for-byte copy of the original in the creator's [`Protofolio` repository](https://github.com/hawkarc2003-cell/Protofolio/blob/7743661384cd19bdacd4deec65f5a042146e65ea/summer-fridays.jpg). The sneaker video matches the imagery in the linked [Instagram Reel](https://www.instagram.com/p/DgAOBa2T61J/). Other product samples link to their existing originals without guessing individual post URLs.
- The website gallery currently shows only the studio homepage, labeled as a demonstration rather than a client project. The requested two existing TheAeralla websites still need to be identified by their URLs before that gallery is complete. The wedding countdown screenshot remains in the asset archive but is not used as a website sample. All sample images and videos are displayed uncropped.

## Checks

Run `python3 -m unittest discover -s tests -v` to check service content, editable price fields, links, card-to-original mappings, logo transparency and checksums. If FFmpeg is installed (or `FFMPEG` points to its executable), the tests also verify which originals contain audio tracks.
