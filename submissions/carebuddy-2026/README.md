# CareBuddy — Healthcare Track submission

Prepared 9 October 2026 for Case Study 2, **AI Healthier Every Day**.

Short blurb: **Your AI companion for everyday and family care.** (Eight words.)

The [public playback page](https://carebuddy.life/submissions/carebuddy-2026/) and [final MP4](https://carebuddy.life/submissions/carebuddy-2026/CareBuddy-Mobile-Demo-v3.mp4) use the approved CareBuddy logo. The 5:58 video shows portrait mobile app captures with captions beside them and original soft instrumental music. It contains no spoken narration.

The landing page opens this walkthrough through **Try CareBuddy** and **Explore the demo**. The playback page’s **Open the interactive demo** link opens Today. Slide 24 of the launch PowerPoint and PDF links to the same playback page.

## Files

- `public/`: the deployed playback HTML, version 3 video and poster, project cover, logo assets, colour palette, fonts and font licences. The unversioned video and poster filenames are relative symlinks to version 3.
- `materials/`: submission form copy, project description, five-slide editable PowerPoint, caption script, SRT captions and three unchanged CodeBuddy development captures. `presentation-fonts/` preserves the deck's Fraunces and DM Sans typography.
- `CareBuddy-Submission-Pack.zip`: the complete prepared submission pack, including the final video, architecture deck, cover, captions, project copy, CodeBuddy captures, brand guidance, colour palette and fonts.
- `materials/Demo-Playback-Verified.png`: the public playback page after successful playback and seeking.
- `inputs/`: the 19 mobile website captures used in the video, four rendered architecture slides, chapter copy and the 73 full-sentence caption timings.
- `scripts/`: video frame composition and the original instrumental music generator.
- `manifest.json`: hashes of the final public files and the recorded media format.

The [current launch presentation](../../presentations/CareBuddy-Launch.pptx) has 51 slides, with a matching [PDF](../../presentations/CareBuddy-Launch.pdf). The product name is CareBuddy; both retain their original typography. The five-slide architecture deck is in `materials/`.

The capture workflow began at app reference `63f19f6e291159b01338a56eaed2fb7edbf98ee6`. Five screens were refreshed for the CareBuddy branding update on 9 October 2026; the updated app passed all 242 automated tests. Care records and health readings are fictional; sleep is fixed frontend content. Pilot targets in the project description are proposed metrics. The screenshots show historical CodeBuddy development work, including investigation of incomplete tasks.

## Rebuild the video

Requirements: Node.js, Python 3 with NumPy, and FFmpeg with H.264/AAC encoders on `PATH`. `FFMPEG_BIN` can select a different FFmpeg executable.

Run these commands from this directory:

```sh
npm ci
python3 -m pip install -r requirements.txt
npm run frames
npm run build:video
```

`frames` checks caption wrapping and footer clearance without encoding a video. `build:video` composes the quiet instrumental soundtrack and renders `public/CareBuddy-Mobile-Demo-v3.mp4` plus its poster. Temporary frames, layout reports and audio stay under ignored `.build/`. The checked-in caption timeline supplies only text and timing; the encoder's audio input is the generated instrumental track.

After an intentional rebuild, review the output and update `manifest.json` before publishing. The SRT and chapter script in `materials/` use the same final caption timings.

## Hosting

The contents of `public/` are hosted independently of the app bundle at `/var/www/carebuddy-submissions/carebuddy-2026/`. Copy them while preserving relative symlinks. The existing Nginx route serves that directory at `/submissions/carebuddy-2026/`, supports byte-range video seeking, and permits GET/HEAD only. Application releases and SQLite records use their existing locations.

The final HTML, video, poster and two logo assets were checked against the live files. Playback, seeking and mobile page layout were verified on 9 October 2026. See `materials/README.txt` for the complete submission checklist and event links.
