<div align="center">

# 🌙 MoonReel: open-source Meta Muse video generator

**No Meta Muse video API yet? MoonReel automates Muse AI video generation for you.**

Type one idea and get a finished short video: a niche-aware AI script, a recurring character with a consistent face, image-to-video clips from Meta Muse, and an MP4 with subtitles. Vertical 9:16 for TikTok · Instagram Reels · YouTube Shorts, and 16:9 for YouTube. Free and MIT-licensed.

[Studio docs](moonreel-studio/README.md) · [Architecture](moonreel-studio/docs/ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md)

<img src="moonreel-studio/docs/images/demo.gif" alt="MoonReel Studio demo: type an idea, review the AI script, watch each scene render, download the video" width="900" />

</div>

## Why MoonReel? Meta Muse has no video API

Meta's official developer API offers Muse chat and image models, but **no video model** (as of October 2026). Muse video generation, roughly ten-second 720p clips with audio, only exists inside the muse.ai app, one prompt at a time. If you searched for a *Meta Muse API*, *muse.ai API*, *Muse video API* or a way to *generate Muse videos programmatically or in bulk*, this is the gap MoonReel fills:

- **Muse as an API.** MoonReel runs [muse2api](https://github.com/bynne2602/muse2api), a self-hosted, MIT-licensed bridge, so Muse chat, text-to-image and image-to-video become HTTP calls.
- **A full production pipeline on top.** Script → keyframes with a consistent character → image-to-video clips → FFmpeg render with subtitles, queued and retried in the background.
- **No extra API fees.** Generation uses your own muse.ai account's allowance.
- **Not locked in.** Providers sit behind one `GenerationProvider` interface, ready for an official Muse video API, Kling or Seedance.

Full write-up with a video walkthrough: [No Meta Muse Video API Yet? Generate Muse AI Videos with Open-Source MoonReel](https://siri2moon.com/posts/meta-muse-video-api-open-source-moonreel).

## Packages

| Package | Description | Status |
|---|---|---|
| [`moonreel-studio`](moonreel-studio) | Web app: niche → AI script → review → per-scene production → MP4 render. Next.js 16, PostgreSQL, pg-boss, FFmpeg, Meta Muse via muse2api. | MVP |

This repository is organised as a monorepo so future pieces can live beside the studio, for example an MCP connector that lets Muse pull jobs directly, or a public landing site.

## Getting started

Setup, configuration, usage and troubleshooting are covered in **[moonreel-studio/README.md](moonreel-studio/README.md)**.

The short version:

```bash
cd moonreel-studio
pnpm install
cp .env.example .env            # set MUSE2API_KEY (openssl rand -hex 32)
docker compose up -d            # Postgres + muse2api
pnpm db:push && pnpm db:seed
# connect a muse.ai account at http://localhost:18610/admin?key=<MUSE2API_KEY>
pnpm dev                        # terminal 1
pnpm worker                     # terminal 2
```

> [!IMPORTANT]
> MoonReel reaches muse.ai through [muse2api](https://github.com/bynne2602/muse2api), an unofficial bridge that uses your account's session cookies. Use a secondary muse.ai account, and never commit cookies or `.env` files.

## FAQ

<details>
<summary><b>Does Meta Muse have a public API for video generation?</b></summary>

Not yet. The official Meta Model API covers Muse chat and image generation only. Video is available inside the muse.ai app, which MoonReel automates through muse2api.

</details>

<details>
<summary><b>How do I generate Meta Muse videos programmatically or in bulk?</b></summary>

Run MoonReel locally. Every scene becomes a background job that is sent to Muse, retried on failure and stitched into one MP4. If you only need raw clips, call muse2api's HTTP API directly.

</details>

<details>
<summary><b>Is it free? Is it allowed?</b></summary>

MoonReel and muse2api are free and MIT-licensed; generation uses your own muse.ai allowance. The bridge is unofficial and drives the web app with your session cookies, which may conflict with Muse's terms, so use a secondary account.

</details>

<details>
<summary><b>What can I make with it?</b></summary>

Faceless channels, storytelling, explainers, tips and facts: any short video with narration, a recurring character and a consistent visual style. Output is 9:16 for TikTok, Reels and Shorts or 16:9 for YouTube.

</details>

## Tiếng Việt

**Meta Muse chưa có API tạo video?** MoonReel là phần mềm **mã nguồn mở, miễn phí** giúp **tự động tạo video AI bằng Meta Muse**. Bạn nhập một câu ý tưởng, AI viết kịch bản theo ngách, giữ nguyên khuôn mặt nhân vật qua từng cảnh, dựng clip và xuất MP4 có phụ đề cho TikTok, Reels, Shorts và YouTube. Giao diện có tiếng Việt. Cài đặt xem tại [moonreel-studio/README.md](moonreel-studio/README.md).

## Documentation

- [Studio README](moonreel-studio/README.md): installation, configuration, usage, troubleshooting
- [Architecture](moonreel-studio/docs/ARCHITECTURE.md): data model, job pipeline, limits, design language
- [Contributing](CONTRIBUTING.md): development setup, conventions, pull request checklist

## Contributing

MoonReel is open source and contributions are welcome: bug reports, docs, translations, sample niches and new AI providers. Start with **[CONTRIBUTING.md](CONTRIBUTING.md)**, browse [`good first issue`](https://github.com/siri2moon/moonreel/labels/good%20first%20issue), or open an issue to discuss an idea.

Please report security problems privately through [GitHub security advisories](https://github.com/siri2moon/moonreel/security/advisories/new), not in public issues.

## License

[MIT](LICENSE) © siri2moon. MoonReel is not affiliated with or endorsed by Meta.
