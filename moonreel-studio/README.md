<div align="center">

# MoonReel Studio

**Turn a topic into a finished short video with an AI script, a recurring character and one-click rendering. An open-source way to generate Meta Muse videos while Muse has no public video API.**

Vertical 9:16 for TikTok · Reels · Shorts, and 16:9 for YouTube. Powered by Meta Muse.

[Features](#features) · [Quick start](#quick-start) · [Configuration](#configuration) · [Usage](#usage) · [Troubleshooting](#troubleshooting) · [Contributing](#contributing) · [Architecture](docs/ARCHITECTURE.md)

<img src="docs/images/demo.gif" alt="MoonReel Studio demo: pick a niche, type an idea, review the AI script, watch every scene render, download the final video" width="900" />

<sub>Pick a niche → type an idea → review the script → watch each scene render → download. (Production sped up.)</sub>

</div>

---

## Features

- **Niche-first workspace.** Pick a niche when you open the app and everything stays scoped to it until you switch. Each niche carries its own script rules, tone, language, visual style, scene count and length, default format and default character.
- **AI scriptwriting you stay in control of.** Muse drafts a scene-by-scene script in the niche's voice. You edit narration, visuals and camera moves, reorder or add scenes, then approve.
- **A consistent character.** Describe a character once and let Muse draw a reference image, or upload your own. Every scene is generated from that reference.
- **Scene-by-scene production.** Each scene gets a keyframe and then an image-to-video clip. Progress updates live, and any single scene can be retried.
- **Ready-to-post output.** FFmpeg normalises and joins the clips into one MP4 with embedded soft subtitles, plus a separate `.srt` file.
- **English and Vietnamese UI.** The language follows your browser (English when it prefers neither) and can be switched from the sidebar.
- **Runs on your machine.** Next.js, Postgres and a background worker run locally. AI usage comes out of your own muse.ai account; there are no extra API fees.

<table>
  <tr>
    <td width="50%"><img src="docs/images/niche-picker.jpg" alt="Niche picker" /></td>
    <td width="50%"><img src="docs/images/new-video.jpg" alt="New video form" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Pick a niche: script rules, tone and visual style per channel</sub></td>
    <td align="center"><sub>Type an idea, choose the format and a recurring character</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/script.jpg" alt="Script review" /></td>
    <td width="50%"><img src="docs/images/production.jpg" alt="Per-scene production" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Review and edit the scene-by-scene script</sub></td>
    <td align="center"><sub>Keyframe, then clip, for every scene, with live progress</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/images/project.jpg" alt="Finished video ready to download" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub>The final MP4 with subtitles, ready to post</sub></td>
  </tr>
</table>

> [!IMPORTANT]
> Meta does not offer an official video API for Muse yet. MoonReel talks to muse.ai through
> [muse2api](https://github.com/bynne2602/muse2api), an **unofficial**, self-hosted bridge that drives a
> headless browser with your account's session cookies. It can break when muse.ai changes, and automating a
> consumer account may conflict with Muse's terms. **Use a secondary muse.ai account.**

## How it works

```
 Niche ──► Topic ──► Script (Muse chat) ──► You review & approve
                                                │
                    ┌───────────────────────────┘
                    ▼
     for each scene:  keyframe (Muse image + character reference)
                      └──► clip (Muse video, keyframe as first frame)
                    │
                    ▼
     FFmpeg: normalise · concatenate · subtitles  ──►  final.mp4 + captions.srt
```

| Layer | Technology |
|---|---|
| Web app | Next.js 16 (App Router, Server Actions, Cache Components), React 19, Tailwind CSS 4 |
| Data | PostgreSQL 17, Drizzle ORM |
| Jobs | pg-boss 12 (queues stored in the same Postgres) |
| AI provider | Meta Muse through muse2api (Docker) |
| Rendering | FFmpeg / ffprobe |

The full design, data model and failure handling are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.9 or newer (22 LTS recommended) | |
| pnpm | 9 | `corepack enable` installs the pinned version |
| Docker | Docker Desktop or OrbStack | Runs Postgres and muse2api |
| FFmpeg + ffprobe | any recent build | macOS: `brew install ffmpeg` · Debian/Ubuntu: `apt install ffmpeg` |
| muse.ai account | | A secondary account is strongly recommended |

### 1. Install

```bash
git clone <your-fork-url> moonreel
cd moonreel/moonreel-studio
pnpm install
```

### 2. Configure

```bash
cp .env.example .env
```

Then set **`MUSE2API_KEY`** in `.env`. You choose this value yourself; it is not issued by Muse or Meta. It is the shared secret that protects muse2api's admin page and API, and both Docker and the app read it from `.env`. Generate a strong one with:

```bash
openssl rand -hex 32
```

See [Configuration](#configuration) for every variable.

### 3. Start the services

```bash
docker compose up -d
```

This starts:

| Service | Port | Purpose |
|---|---|---|
| `moonreel-postgres` | `5434` | App data and job queues |
| `moonreel-muse2api` | `18610` | Bridge to muse.ai |

> [!NOTE]
> The first run builds muse2api from GitHub, including a Chromium image, which takes a few minutes. Later starts are instant.

### 4. Create the database schema and sample niches

```bash
pnpm db:push    # create tables
pnpm db:seed    # add 4 sample niches (safe to re-run)
```

### 5. Connect your muse.ai account

Opening the admin page and entering the key is **not** enough. You must add a muse.ai account, otherwise the app keeps showing **Muse not connected** (*Muse chưa kết nối*).

1. Open **`http://localhost:18610/admin?key=<MUSE2API_KEY>`**.
2. Add an account using one of the three methods below.
3. Check that **Tổng tài khoản** (total accounts) shows at least 1 with status **Sẵn sàng** (ready).

<details open>
<summary><b>Option A: browser extension (recommended)</b></summary>

1. Download the extension from **`http://localhost:18610/admin/extension`** (also linked as *Tải tiện ích trình duyệt* on the admin page) and unzip it.
2. Open `chrome://extensions` (works in Chrome, Edge, Brave, Arc and other Chromium browsers), turn on **Developer mode**, click **Load unpacked** and select the unzipped folder.
3. Sign in at [muse.ai](https://muse.ai/), open the extension on that tab and click **Lấy Cookie và thêm tài khoản** (get cookies and add account). The service URL and key are filled in automatically.

</details>

<details>
<summary><b>Option B: paste cookies manually</b></summary>

1. Sign in at [muse.ai](https://muse.ai/), open DevTools (<kbd>F12</kbd>) → **Network** and reload the page (<kbd>F5</kbd>).
2. Select any request to `muse.ai`. Under **Headers → Request Headers**, copy the whole value of the `cookie:` line, starting at `hatch_sess=`.
   Use the *request* `cookie:` header, not `set-cookie` from the response.
3. Paste it into **Cookie đăng nhập** on the admin page and click **Thêm tài khoản** (add account).

The value must contain these four cookies:

| Cookie | Lifetime | Role |
|---|---|---|
| `hatch_sess` | ~30 days | Main session |
| `hatch_gw` | ~1 year | Gateway token |
| `hatch_vml` | **~2 days** | Short-lived token that decides when the session expires |
| `hatch_native_auth_device` | ~30 days | Device id |

</details>

<details>
<summary><b>Option C: helper script</b></summary>

Download `get_muse_cookie.py` from `http://localhost:18610/admin/cookie-helper?download=1` and run the command shown on the admin page (the URL and key are pre-filled). A browser window opens; sign in to muse.ai and the script sends the cookies to muse2api and closes the window. No extra Python packages are needed.

</details>

> [!WARNING]
> Never commit or share cookies, your `.env`, or the `~/.moonreel/` folder. Each of them grants access to your muse.ai account.

### 6. Run

Open two terminals in `moonreel-studio/`:

```bash
pnpm dev       # web app → http://localhost:3000
pnpm worker    # background jobs: Muse calls and FFmpeg rendering
```

Use `pnpm dev --port 3100` if port 3000 is already taken. Once the bottom of the sidebar shows **Muse connected** (*Muse đã kết nối*) with a green dot, you are ready.

## Configuration

All settings live in `moonreel-studio/.env`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | – | Postgres connection string. With the bundled Docker setup: `postgres://moonreel:moonreel@localhost:5434/moonreel` |
| `MUSE2API_KEY` | yes | – | Shared secret for muse2api (admin page and API). Used by both `docker compose` and the app. Generate with `openssl rand -hex 32`. |
| `MUSE2API_BASE_URL` | no | `http://localhost:18610` | Where the app reaches muse2api |
| `MUSE_CONCURRENCY` | no | `1` | Scenes sent to Muse in parallel (1–4). muse2api drives a single browser, so keep `1` unless you run several instances. |
| `STORAGE_DIR` | no | `~/.moonreel/storage` | Generated images, clips and final videos. **Keep it outside the project folder** (see [Troubleshooting](#troubleshooting)). |

muse2api's own data (accounts, cookies, task history) is stored in `~/.moonreel/muse2api`, mounted by `docker-compose.yml`. Its timeouts are set there as well (`MUSE2API_IMAGE_TIMEOUT`, `MUSE2API_VIDEO_TIMEOUT`, `MUSE2API_CHAT_TIMEOUT`).

## Usage

The interface is available in English and Vietnamese. It follows your browser's language, falls back to English, and the **EN / VI** switch at the bottom of the sidebar overrides it. Labels below are the English ones, with the Vietnamese text in parentheses.

1. **Choose a niche.** On first visit the app opens on the niche picker. The choice is remembered in your browser. Use **Switch niche** (*Đổi ngách*) in the sidebar to change it, and **Settings** (*Cấu hình*) to edit its script instructions, tone, language, visual style, scene count, seconds per scene, default format and default character.
2. **Create a character** (*Nhân vật*). Describe the appearance **in English** and in detail (age, face, hair, outfit, colours, art style). Then let Muse draw the reference image (about a minute, in the background) or upload your own.
3. **Start a video** (*Tạo video*). Enter a topic, then pick the format and character; both are preselected from the niche configuration.
4. **Review the script.** Muse writes it in 1–3 minutes and the page updates by itself. Edit any scene, reorder, add or remove scenes, then click **Approve & produce** (*Duyệt & sản xuất*).
5. **Watch production.** Each scene takes about 2–4 minutes (keyframe, then clip). If a scene fails or looks wrong, use **Redo clip** (*Làm lại clip*) or **With image** (*Cả ảnh*) to redraw the keyframe as well. **Edit** (*Sửa*) lets you rewrite that scene's narration, visual description or camera first. If Muse declines a scene, the card says so and shows Muse's reply; soften the description and try again.
6. **Download.** When every scene is done the video is rendered automatically. Download the MP4 and the `.srt` captions from the project page.

### Tips for better results

- Write character appearances and visual styles in English; Muse follows English prompts most reliably.
- Keep narration to 25 words or fewer per scene. Clips are about 10 seconds long.
- Prefer slow, simple camera moves; fast action tends to distort characters.
- Don't ask for on-screen text. The app adds subtitles itself.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the Next.js dev server |
| `pnpm worker` | Start the job worker (does not reload on code changes) |
| `pnpm worker:watch` | Worker with auto-reload. Use only when no job is running, because a reload interrupts the clip in progress. |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm db:push` | Apply the Drizzle schema to Postgres |
| `pnpm db:seed` | Insert the sample niches; existing ones are skipped |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint |

## Troubleshooting

<details>
<summary><b>The sidebar says "Muse not connected"</b></summary>

- Check that the container is running: `docker compose ps` should list `moonreel-muse2api` as up.
- Open `http://localhost:18610/admin?key=<MUSE2API_KEY>`. Entering the key only unlocks the admin page; you still need to **add a muse.ai account** (step 5). Total accounts must be at least 1 and ready.
- If an account shows an error or an expired session, add fresh cookies (see the next item).

</details>

<details>
<summary><b>Generation stops working after a couple of days</b></summary>

The `hatch_vml` cookie lives about 2 days and is not extended by use. When it expires, sign in to muse.ai again and re-import the cookies with the extension or manually. The admin page warns you when a session is close to expiring.

</details>

<details>
<summary><b>Where do I get MUSE2API_KEY?</b></summary>

You create it. Any long random string works; run `openssl rand -hex 32`, put it in `.env`, then restart with `docker compose up -d` so the container picks it up.

</details>

<details>
<summary><b>The page keeps reloading or lagging while a video is being produced</b></summary>

`STORAGE_DIR` (or muse2api's data folder) points inside the project. `next dev` watches the project folder and recompiles on every new file. Remove `STORAGE_DIR` from `.env` to use the default `~/.moonreel/storage`, or point it anywhere outside the repository, then restart `pnpm dev` and `pnpm worker`.

</details>

<details>
<summary><b>A scene is stuck in "Making clip" (*Tạo clip*) after restarting the worker</b></summary>

A worker restart interrupts the scene in progress. Use **Redo clip** on that scene; finished scenes are never regenerated. Avoid `pnpm worker:watch` while jobs are running.

</details>

<details>
<summary><b>"Script generation failed"</b></summary>

Muse occasionally returns a malformed or partial answer. The app retries and repairs once automatically; if it still fails, click **Rewrite script** (*Viết lại kịch bản*). The `pnpm worker` terminal logs the raw reply for debugging.

</details>

<details>
<summary><b>Render fails, or <code>ffmpeg</code> / <code>ffprobe</code> not found</b></summary>

Install FFmpeg and make sure both binaries are on the `PATH` of the terminal running `pnpm worker`. Then click **Render again** (*Ghép lại*) on the project.

</details>

<details>
<summary><b>Port already in use (3000, 5434 or 18610)</b></summary>

- Web app: `pnpm dev --port 3100`.
- Postgres or muse2api: change the left side of the port mapping in `docker-compose.yml`, then update `DATABASE_URL` or `MUSE2API_BASE_URL` to match.

</details>

## Project structure

```
moonreel-studio/
├── docker-compose.yml        Postgres + muse2api
├── docs/
│   ├── ARCHITECTURE.md       Design, data model, flow, limits
│   └── images/               README screenshots
├── scripts/seed.ts           Sample niches
└── src/
    ├── app/
    │   ├── [lang]/           Pages (App Router), one tree per locale
    │   ├── api/              Route handlers
    │   └── actions.ts        Server actions
    ├── i18n/                 Locale negotiation and the en / vi dictionaries
    ├── components/           Design system (ui.tsx), sky background, logo, sidebar, niche picker
    ├── db/schema.ts          niches · characters · projects · scenes
    ├── lib/
    │   ├── providers/        GenerationProvider interface + muse2api client  ← add providers here
    │   ├── pipeline/         Prompts, jobs (script, keyframe, clip) and FFmpeg rendering
    │   ├── active-niche.ts   Active niche (cookie)
    │   ├── queue.ts          pg-boss queues
    │   └── storage.ts        File storage
    ├── proxy.ts              Picks the locale and rewrites URLs into app/[lang]
    └── worker/index.ts       Worker process
```

## Roadmap

- [ ] More providers (Kling, Seedance via fal.ai) behind the `GenerationProvider` interface
- [ ] Burned-in captions, background music and transitions
- [ ] MCP-connector mode, so Muse pulls jobs directly from the app
- [ ] Auto-publishing to TikTok and YouTube

## Contributing

Contributions of every size are welcome: bug reports, docs fixes, translations, new niches, new providers. Read **[CONTRIBUTING.md](../CONTRIBUTING.md)** for the full guide. In short:

1. **Open an issue first** for anything bigger than a small fix, so we can agree on the approach.
2. **Fork, then branch** from `main` (`feat/…`, `fix/…`, `docs/…`).
3. **Follow the conventions:** English code comments and docs; UI text goes in both `src/i18n/dictionaries/en.ts` and `vi.ts`; no database queries inside loops.
4. **Check before pushing:**

   ```bash
   pnpm typecheck && pnpm lint && pnpm build
   ```

5. **Open a pull request** that explains what changed and why. Add a screenshot or GIF for UI changes.

Good first contributions:

- A new **UI language**: copy `src/i18n/dictionaries/en.ts`, translate it, then register the code in `src/i18n/config.ts` and `src/i18n/dictionaries/index.ts`.
- A new **sample niche** in `scripts/seed.ts`.
- A new **generation provider** (Kling, Seedance, …) behind `GenerationProvider` in `src/lib/providers/`.
- Anything tagged [`good first issue`](https://github.com/siri2moon/moonreel/labels/good%20first%20issue).

> [!CAUTION]
> Never paste muse.ai cookies, `.env` contents or files from `~/.moonreel/` into issues, logs or pull requests.

## Acknowledgements

- [muse2api](https://github.com/bynne2602/muse2api) (MIT): the self-hosted muse.ai bridge this project builds on.
- [Meta Muse](https://muse.ai/) for the models. MoonReel is not affiliated with or endorsed by Meta.

## License

[MIT](../LICENSE) © siri2moon
