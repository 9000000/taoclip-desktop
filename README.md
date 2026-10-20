# TaoClip Desktop

TaoClip Desktop is a Windows video editor built with Electron, React, Vite and FFmpeg. It edits media locally on your computer and supports multi-clip projects, AI-assisted tools, and exports for common social video formats.

> This repository contains the application source code. It does not include the AI model files or the `yt-dlp` executable. The app downloads some assets when you use the related features.

## Features

- Arrange video and image clips on a timeline, trim and split clips, and save projects.
- Add text, stickers, filters, transitions, and background audio.
- Generate captions and local text-to-speech with downloaded AI models.
- Replace or blur video backgrounds; face swap is also available with separately downloaded models.
- Detect silence and download supported videos from a URL.
- Export MP4 in portrait, square, and landscape formats.

Some features need an internet connection the first time they download their model or tool. Video editing and export run locally. Google Cloud Text-to-Speech sends the text you choose to Google's API when you enable that option.

## Requirements

- Windows 10 or 11, 64-bit
- Node.js and npm
- Internet access for dependency installation and first-time model/tool downloads

## Run in development

```bash
npm install
npm run dev
```

## Build the Windows installer

```bash
npm run dist
```

The installer is written to `release/`.

## Tests

```bash
npm test
```

Additional feature checks are available with `npm run test:ai`, `npm run test:dl`, and `npm run test:face`. The download tests may access external services and download large files.

## AI models and third-party tools

AI models and tools downloaded by the app have their own owners and license terms. The MIT license in this repository applies to TaoClip Desktop source code; it does not grant rights to third-party models, media, or services. Check the relevant terms before using or redistributing those assets. The face analysis models referenced by the face-swap feature may be limited to non-commercial research use unless separately licensed.

Only download media you have the right to use. Use face-swap features only with appropriate consent and rights.

## License

TaoClip Desktop source code is licensed under the MIT License. See [LICENSE](LICENSE).
