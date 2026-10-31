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

- **Niche-first workspace.** Pick a niche when you open the app and everything stays scoped to it until you switch. Each niche carries its own script rules, tone, language, visual style, scene count and length, default format and default cast.
- **AI scriptwriting you stay in control of.** Muse drafts a scene-by-scene script in the niche's voice. You edit narration, visuals and camera moves, reorder or add scenes, then approve.
- **Consistent characters.** Describe a character once and let Muse draw a reference image, or upload your own. A video can have a whole cast: the script decides who is on screen in each scene (you can change it), and every keyframe is drawn from those characters' references.
- **Scene-by-scene production.** Each scene gets a keyframe and then an image-to-video clip. Progress updates live, and any single scene can be retried.
- **Ready-to-post output.** FFmpeg upscales Muse's 720p clips to 1080p and joins them into one MP4 with embedded soft subtitles, plus a separate `.srt` file. YouTube streams 1080p uploads at a much higher bitrate than 720p ones.
- **Your channel's title and thumbnail formula.** Each niche can carry its own rules for YouTube titles, thumbnail words and the thumbnail picture; they override MoonReel's general caption rules.
- **Shorts from every video.** One click picks the three strongest 25–58 s moments of a finished video and cuts each into a 9:16 Short with an on-screen hook and burned-in captions, plus its own title and description.
- **Fewer Muse calls and refusals.** Scripts are screened for what Muse's filter declines before any clip is made, declined scenes are rewritten and retried automatically, and shots that carry straight on start from the previous clip's last frame instead of a newly drawn keyframe.
- **Facebook and Instagram Reels from the app.** Connect a Facebook Page to a niche and post its vertical videos and Shorts as reels to the Page and its linked Instagram account, right away or scheduled.
- **Wordless stories.** Set a niche's video type to *Wordless story* for visual parables in the style of short-form cartoon life lessons: the story is told by pictures and acting alone, with no voice and no subtitles, ready for music added in the Reels, Shorts or TikTok app.
- **Ambient loops for your own audio.** Set a niche's video type to *Ambient loop*, describe a place and upload a soundtrack (up to 1 GB). Muse films a few calm shots of it; they crossfade into one seamless loop that repeats until the audio ends, so an hour-long video renders in seconds.
- **Thumbnails in the channel's style.** Each niche picks a template (Impact, Cinematic or Boxed), an accent colour and a brand label. Muse draws a photo framed for the headline, and the worker lays the headline over it as a 1280×720 (or 1080×1920) JPEG.
- **Captions for every platform.** After the render, a YouTube title, description with chapters and tags, plus TikTok, Instagram and Facebook captions are written from the script, each with a copy button.
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
                    │
                    ▼
     Platform captions (chat): YouTube title · description · chapters · tags,
                               TikTok · Instagram · Facebook · thumbnail headline
                    │
                    ▼
     Thumbnail: Muse photo (or a scene keyframe) + niche template  ──►  thumbnail.jpg
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
pnpm db:seed    # add 4 sample niches, plus your private ones (safe to re-run)
```

### 5. Connect your muse.ai account

> [!IMPORTANT]
> **muse.ai changed its sign-in cookies on 27 October 2026.** It no longer sets `hatch_gw` or `hatch_vml`; the session now uses `hatch_sess`, `hatch_native_auth_device` and a host-only `__Host-hatch_…` cookie. muse2api up to commit `14c2ab9` still requires the two old cookies, so its extension stops with *"Đã đọc N Cookie nhưng còn thiếu: hatch_gw, hatch_vml"* and existing accounts stop renewing. Until muse2api is updated, build it with the patch in this repository first: see [Patch muse2api for the new cookies](#patch-muse2api-for-the-new-cookies).

Opening the admin page and entering the key is **not** enough. You must add a muse.ai account, otherwise the app keeps showing **Muse not connected** (*Muse chưa kết nối*).

1. Open **`http://localhost:18610/admin?key=<MUSE2API_KEY>`**.
2. Add an account using one of the three methods below.
3. Check that **Tổng tài khoản** (total accounts) shows at least 1 with status **Sẵn sàng** (ready).

<details open>
<summary><b>Option A: browser extension (recommended)</b></summary>

1. Download the extension from **`http://localhost:18610/admin/extension`** (also linked as *Tải tiện ích trình duyệt* on the admin page) and unzip it.
2. Open `chrome://extensions` (works in Chrome, Edge, Brave, Arc and other Chromium browsers), turn on **Developer mode**, click **Load unpacked** and select the unzipped folder.
3. Sign in at [muse.ai](https://muse.ai/), open the extension on that tab and click **Lấy Cookie và thêm tài khoản** (get cookies and add account). The service URL and key are filled in automatically.

The **service address** (*Địa chỉ dịch vụ*) is the root of muse2api, `http://localhost:18610`, not the admin page: `http://localhost:18610/admin` answers `HTTP 404 {"detail":"Not Found"}`. The patched extension strips a trailing `/admin` for you.

Give each account a name (*Tên tài khoản*) so you can tell them apart in the logs, and repeat the steps for every muse.ai account you want muse2api to use.

</details>

<details>
<summary><b>Option B: paste cookies manually</b></summary>

1. Sign in at [muse.ai](https://muse.ai/), open DevTools (<kbd>F12</kbd>) → **Network** and reload the page (<kbd>F5</kbd>).
2. Select any request to `muse.ai`. Under **Headers → Request Headers**, copy the whole value of the `cookie:` line, starting at `hatch_sess=`.
   Use the *request* `cookie:` header, not `set-cookie` from the response.
3. Paste it into **Cookie đăng nhập** on the admin page and click **Thêm tài khoản** (add account).

Copy the whole header: every cookie in it is needed. Since 27 October 2026 the ones that matter are:

| Cookie | Lifetime | Role |
|---|---|---|
| `hatch_sess` | ~30 days | Main session |
| `hatch_native_auth_device` | ~30 days | Device id |
| `__Host-hatch_…` | | Session token, host-only (replaces `hatch_gw` and `hatch_vml`) |

Accounts imported before that date also carry `hatch_gw` (~1 year) and `hatch_vml` (~2 days); muse.ai no longer renews them, so import those accounts again.

</details>

<details>
<summary><b>Option C: helper script</b></summary>

Download `get_muse_cookie.py` from `http://localhost:18610/admin/cookie-helper?download=1` and run the command shown on the admin page (the URL and key are pre-filled). A browser window opens; sign in to muse.ai and the script sends the cookies to muse2api and closes the window. No extra Python packages are needed.

</details>

> [!WARNING]
> Never commit or share cookies, your `.env`, or the `~/.moonreel/` folder. Each of them grants access to your muse.ai account. Screenshots of the extension or the admin page show your `MUSE2API_KEY`; crop it out before sharing.

#### Patch muse2api for the new cookies

`docker/muse2api-session-cookies.patch` makes muse2api work with the cookies muse.ai sets since 27 October 2026:

- only `hatch_sess` and `hatch_native_auth_device` are required (server and extension);
- `__Host-` cookies are set host-only when an account is loaded into Chromium (Chromium rejects them with a domain, so the session was silently dropped);
- the extension accepts the admin page URL as the service address.

Build the patched image once, from a folder outside this repository:

```bash
git clone https://github.com/bynne2602/muse2api.git ~/muse2api
cd ~/muse2api
git checkout 14c2ab9                       # the commit the patch was made against
git apply /path/to/moonreel-studio/docker/muse2api-session-cookies.patch
docker build -t muse2api:local .

cd /path/to/moonreel-studio
docker compose up -d --no-build muse2api   # restart on the patched image
```

Then reload the extension from the patched copy: in `chrome://extensions` remove the old Muse2API extension, click **Load unpacked** and pick `~/muse2api/extension`. Import each account again (Option A).

> [!CAUTION]
> `docker compose build` or `docker compose up --build` rebuilds muse2api from GitHub and drops the patch. Use `--no-build` until muse2api ships its own fix. If `git apply` fails, muse2api has changed: check whether it already handles the new cookies before patching.

To check that an account works, watch the keep-alive lines in `docker logs -f moonreel-muse2api`: every 15 minutes each account logs `执行结果: ok=True` (renewed) or `ok=False` (session dead: import it again).

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
| `NICHES_DIR` | no | `~/.moonreel/niches` | Your private niches, one JSON file each (see [Private niches](#private-niches)). |
| `CF_AIG_ACCOUNT_ID`, `CF_AIG_GATEWAY_ID` | no | – | Write scripts through Cloudflare AI Gateway (see [Scripts through Cloudflare AI Gateway](#scripts-through-cloudflare-ai-gateway)). Builds `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/compat` |
| `CF_AIG_BASE_URL` | no | – | Overrides the whole `/compat` URL, for example with a custom domain |
| `CF_AIG_TOKEN` | no | – | Cloudflare API token; enough on its own when the provider key is stored on the gateway (BYOK) |
| `CF_AIG_PROVIDER_KEY` | no | – | Provider key when it is not stored on the gateway; the token then goes in `cf-aig-authorization` |
| `CF_AIG_BYOK_ALIAS` | no | – | Alias of the stored provider key when it is not `default`. If unset and the gateway has exactly one stored key, its alias is picked up from the gateway's error |
| `SCRIPT_MODEL` | no | `deepseek/deepseek-chat` | Script model on the gateway, as `provider/model` or `dynamic/<route>` |
| `ELEVENLABS_API_KEY` | no | – | Only for niches with a narrator voice (see [One narrator voice](#one-narrator-voice-elevenlabs)). From elevenlabs.io → Developers → API keys. |
| `ELEVENLABS_MODEL` | no | `eleven_multilingual_v2` | ElevenLabs model for the narrator. Use `eleven_flash_v2_5` for languages v2 does not cover, such as Vietnamese. |

muse2api's own data (accounts, cookies, task history) is stored in `~/.moonreel/muse2api`, mounted by `docker-compose.yml`. Its timeouts are set there as well (`MUSE2API_IMAGE_TIMEOUT`, `MUSE2API_VIDEO_TIMEOUT`, `MUSE2API_CHAT_TIMEOUT`).

### Scripts through Cloudflare AI Gateway

By default Muse writes the scripts as well as the images and clips. Muse answers through muse2api, which scrapes the muse.ai page, so long replies can time out: scripts over 12 scenes are therefore written as an outline first and then in parts of 12.

To have a regular LLM write the scripts and keep Muse for media only, set `CF_AIG_ACCOUNT_ID`, `CF_AIG_GATEWAY_ID` and `CF_AIG_TOKEN` (and `SCRIPT_MODEL` if you do not use DeepSeek), then restart the app and the worker. Scripts then come from the gateway's OpenAI-compatible `/compat/chat/completions` endpoint in a single reply, whatever their length; models, provider keys, caching and fallbacks are managed on Cloudflare.

### Private niches

The repository ships four sample niches (`scripts/default-niches.ts`). Niches for your own channels stay out of it: keep each one as a JSON file in `NICHES_DIR` (default `~/.moonreel/niches`), next to the rest of your data.

- `pnpm niches:export` writes every niche you created in the app, except the samples, to that folder. Run it after editing a niche in **Settings** to keep the file current.
- `pnpm db:seed` inserts the sample niches and every file in that folder, skipping slugs that already exist, so a fresh database gets your niches back.

Fields match the niche form; `scriptInstructions` and `postsInstructions` (the title & thumbnail rules) may be a string or an array of lines. `NICHES_DIR` can be a symlink, for example into a private git repository that versions your channels. Default casts are not exported, because their ids only exist in your database.

### Wordless stories

Niches whose **Video type** is *Wordless story* make videos with no words at all: two or three scenes that tell a small visual parable (a setup, then the same place after things change), meant to be watched with the sound off and understood in any country. Muse writes a short shot note for each scene instead of narration, the clips are made with natural sound effects only (no speech, no music), and the render joins them with no voice-over and no subtitle track. Add music when you post, from the app's own library. Captions and thumbnails work as usual; the Shorts panel is hidden because the video is already short. The niche's language is used for the captions.

### Facebook Reels

A niche can post its vertical videos and Shorts straight to a Facebook Page as reels, right away or at a set time, through Meta's free Reels Publishing API. The **Facebook** tab of a finished 9:16 video's captions, and every finished Short, then show a **Facebook Reel** box: edit the caption, pick when it goes public (10 minutes to 29 days ahead, in your own time zone) and press **Schedule reel** (*Hẹn giờ reel*) or **Post now** (*Đăng ngay*). The worker uploads the MP4, waits for Facebook to process it and shows the result; change or cancel a scheduled reel in Meta Business Suite. Reels are labelled as AI-made, and a video's reel gets the video's own thumbnail as its cover (a Short's reel shows a frame with its hook). Facebook allows 3–90 s reels and 30 API posts per Page a day. Music from Facebook's library cannot be added through the API, so post a reel that needs it from the app.

Connect a Page once per niche (niche form → **Facebook & Instagram Reels**). The app has the same steps as a step-by-step page at `/guides/facebook`, linked from that form:

1. At [developers.facebook.com](https://developers.facebook.com/apps) create an app with the use case *Manage everything on your Page*. It can stay in development mode: it only posts to Pages you manage.
2. In the [Graph API Explorer](https://developers.facebook.com/tools/explorer/) pick that app, add the permissions `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content` and `pages_manage_engagement` (the last two set the reel's cover), and press **Generate Access Token**, choosing your Pages.
3. Paste that token into the [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) and press **Extend Access Token**: this gives a long-lived user token.
4. Back in the Explorer, with the long-lived token, request `GET me/accounts`. Each Page in the reply has its `id` and an `access_token`; a Page token taken from a long-lived user token does not expire.
5. Paste the Page's `id` and `access_token` into the niche form and save. MoonReel checks them with Facebook and shows the Page's name.

The token is kept in the `facebook_pages` table: it is never sent to the browser and never written into an exported niche file (those keep only `facebookPageId`).

### Instagram Reels

The same Page connection posts to the Instagram professional account (Business or Creator) linked to that Page. The **Instagram** tab of a finished 9:16 video's captions, and every finished Short, show an **Instagram Reel** box next to the Facebook one. Instagram's API cannot schedule, so a scheduled Instagram reel waits in MoonReel's queue and is uploaded at its time: keep the worker running then (a reel whose time passed while the worker was off goes up as soon as it starts again). Until then **Cancel** (*Huỷ*) drops it. Reels are labelled as AI-made and shared to the feed; Instagram allows 100 API posts a day.

To enable it:

1. Switch the Instagram account to a professional account and link it to the Facebook Page (Instagram → Settings → Account type and tools, then Page → Settings → Linked accounts).
2. In the Meta app, add the use case for the Instagram API with Facebook Login, or customise the existing one, so that `instagram_basic` and `instagram_content_publish` can be added.
3. Generate the token again as in steps 2–4 of Facebook Reels, now also with `instagram_basic` and `instagram_content_publish`, and paste the new Page token into the niche form. The form then shows which Instagram account reels go to.

### Ambient loops

Niches whose **Video type** is *Ambient loop* make background videos for music and soundscapes (study, relax, sleep) instead of narrated stories. The topic describes the place, and the new-video page asks for the soundtrack (MP3, M4A, AAC, WAV, OGG or FLAC). Muse plans one shot per scene, each with gentle, steady motion and a short shot note instead of narration. At render time the clips crossfade into each other and the last fades back into the first, the loop is repeated without re-encoding to the length of the soundtrack, and the clips' own sound is dropped. Words rarely pin down a place exactly, so you can also attach a **reference photo** of a similar spot (JPG, PNG or WebP): Muse uses it as a visual guide for every keyframe and the thumbnail, while the description still decides where they differ. Muse takes one reference image, so the photo replaces a character's reference sheet. Turn on **One fixed camera** in the niche settings to draw a single frame and start every shot from it, so only the motion changes. The camera must stay still: each clip is measured (SSIM of its first frame against later ones), and one where Muse zoomed or panned is made again, up to three times. Swap the soundtrack on the video page at any time; a finished video is rendered again with it. Chapters are left out; captions and thumbnails work as usual.

### One narrator voice (ElevenLabs)

Muse makes every clip with its own sound, so a long video built from many clips can switch voices from scene to scene. For documentary-style niches, give the niche a **narrator voice**:

1. Pick a voice at elevenlabs.io → Voices and copy its voice ID. Commercial use, such as monetized YouTube, needs a paid ElevenLabs plan.
2. Put `ELEVENLABS_API_KEY` in `.env` and restart the app and the worker.
3. In the niche settings, paste the ID into **Narrator voice**.

From then on, clips in that niche are generated with ambient sound only. At render time each scene's narration is read in that one voice, using the neighbouring lines for continuous intonation, and mixed over the clip's lowered sound. When a line runs longer than its clip, the last frame is held until the line ends. The audio is cached per line, so re-rendering or editing one scene only re-reads what changed.

## Usage

The interface is available in English and Vietnamese. It follows your browser's language, falls back to English, and the **EN / VI** switch at the bottom of the sidebar overrides it. Labels below are the English ones, with the Vietnamese text in parentheses.

1. **Choose a niche.** On first visit the app opens on the niche picker. The choice is remembered in your browser. Use **Switch niche** (*Đổi ngách*) in the sidebar to change it, and **Settings** (*Cấu hình*) to edit its script instructions, tone, language, visual style, scene count, seconds per scene, default format and default cast.
2. **Create a character** (*Nhân vật*). Describe the appearance **in English** and in detail (age, face, hair, outfit, colours, art style). Then let Muse draw the reference image (about a minute, in the background) or upload your own.
3. **Start a video** (*Tạo video*). Enter a topic, then pick the format and the cast: click characters in order, the first is the lead. Both are preselected from the niche configuration. **Length** (*Độ dài*) sets this video's scene count (the niche's by default): fewer for a simple topic, more for a story with many turns. Each scene is one Muse clip.
4. **Review the script.** Muse writes it in 1–3 minutes and the page updates by itself. Edit any scene, reorder, add or remove scenes, then click **Approve & produce** (*Duyệt & sản xuất*).
5. **Watch production.** Each scene takes about 2–4 minutes (keyframe, then clip). If a scene fails or looks wrong, use **Redo clip** (*Làm lại clip*) or **With image** (*Cả ảnh*) to redraw the keyframe as well. **Edit** (*Sửa*) lets you rewrite that scene's narration, visual description or camera first. Before production starts, every fresh script gets one screening pass that rewrites the scenes Muse's content filter would likely decline (hunts and kills, injury, menace, children, brands). If Muse still declines a scene, it is rewritten once with Muse's reply as the reason and tried again; after a second refusal the card shows Muse's reply so you can soften the description yourself. Scenes marked **Continue from the previous shot** (*Nối tiếp cảnh trước*) start from the last frame of the clip before instead of a newly drawn keyframe, which saves one Muse call per scene; the script writer sets it for shots that carry straight on (at most three in a row), and you can switch it per scene. **Pause production** (*Tạm dừng sản xuất*) stops every scene that has not reached the video step (for example when Muse's daily video allowance has run out); clips already being made finish, drawn keyframes are kept, and **Retry** continues later.
6. **Download.** When every scene is done the video is rendered automatically. Download the MP4 and the `.srt` captions from the project page.
7. **Post.** Under the video, **Captions** (*Caption*) holds a ready-to-paste title, description, tags and caption per platform. YouTube chapter times are measured on the rendered video, so they are rewritten after every render; **Rewrite captions** (*Viết lại caption*) asks for a new version. Realistic AI footage must be labelled when you upload (YouTube: *Altered content*; TikTok: *AI-generated content*).
8. **Thumbnail.** Drawn right after the captions, in the niche's template. Change the headline (wrap words in `*stars*` for the accent colour), switch the background to any scene's image, or edit the photo description and **Draw a new photo** (*Vẽ ảnh mới*). A headline change only re-lays the text, so it takes a second. If Muse declines the photo, the scene the captions suggested is used and the card says why. Then **Download thumbnail** (*Tải thumbnail*).
9. **Shorts.** **Cut 3 Shorts** (*Cắt 3 Shorts*) lets the AI pick three runs of scenes, write a hook (3–7 words, `*stars*` for the accent colour), a title and a description for each, and render them at 1080×1920: the video in the middle over a blurred copy of itself, the hook above, the narration as captions below. Edit a Short's hook or scene range and it is cut again; title and description changes save instantly. **Download Short** (*Tải Short*), then in YouTube Studio set *Related video* to the full video.

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
| `pnpm db:seed` | Insert the sample niches and your private niche files; existing ones are skipped |
| `pnpm niches:export` | Save the niches you created in the app as private niche files |
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

A muse.ai session does not last forever. When `docker logs moonreel-muse2api` shows `ok=False` for an account, sign in to muse.ai again and re-import its cookies with the extension or manually. The admin page warns you when a session is close to expiring. If the extension says cookies `hatch_gw` / `hatch_vml` are missing, your muse2api predates muse.ai's October 2026 change: apply [the patch](#patch-muse2api-for-the-new-cookies).

</details>

<details>
<summary><b>Images work but every clip fails ("The video didn't get made", "403", "地区限制")</b></summary>

Chat and images can work while video does not. Open a failed scene's **Muse's reply**:

- **"403" or a region restriction (地区限制).** Meta does not allow video for that muse.ai account where it is. It is per account, not per IP: two accounts on the same network can differ. MoonReel marks the scene *This Muse account cannot make videos*, does not ask again, and pauses the project. Import an account that can make videos (try one clip on muse.ai first), then **Retry**. Routing an account through a proxy in another country is not a fix: a session that suddenly moves country is a classic reason for a sign-in check or a lock.
- **"The video didn't get made", with no reason.** Usually the account's daily video allowance is used up. After three clips in a row fail at the video step with none made in between, MoonReel pauses the project by itself. Try again later, or add another account. A long video asks for one clip per scene, so a 36-scene video can use up an account's day.
- **"I did not resubmit this video", or Muse saying it was told not to request videos for this account.** Muse keeps a memory across chats and has written down that this account cannot make videos, so it refuses before trying. Its Settings have no memory editor; in the account's **Main chat** ask it to list what it remembers about video, 403 errors or region restrictions, then ask it to delete those notes and always submit video requests. Do not use **Reset Muse**: it deletes all chats and files.

</details>

<details>
<summary><b>How do I stop a video that keeps failing?</b></summary>

Click **Pause production** (*Tạm dừng sản xuất*) above the scenes. Scenes that have not reached the video step stop, and their waiting jobs are cancelled; clips already being made finish. Keyframes are kept, so **Retry** later only makes the missing clips.

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
├── scripts/default-niches.ts Sample niches shipped with the repo
├── scripts/seed.ts           Inserts sample + private niches
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
- [ ] Background music and transitions
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
