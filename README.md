# Number Ninja

A heavily gamified math practice web app for kids roughly ages 9 to 12. It hides
real arithmetic, fractions, factoring, and pre-algebra practice inside a game with
belts, monster battles, a boss fight, a coin shop, avatars, power-ups, a journey
map, and an arcade break. Progress saves to the cloud so a kid can switch devices
and pick up where they left off.

It is one HTML file plus a tiny save server. No build step, no framework, no
database server to run.

## What's in it

- **Workbook Quest**: three levels of structured problems, tracked per problem.
- **Practice Arena**: endless procedurally generated problems across ten topics,
  difficulty scaled by the kid's mastery (up to an expert tier).
- **Belts**: White to Black per topic, the strengths and weaknesses view shared
  between the kid's home screen and the parent report.
- **Monster and boss battles**: correct answers damage a foe, a boss guards each
  level. Foes telegraph an attack and can crack a cosmetic shield, pure spectacle
  with no effect on score.
- **Coin shop**: emoji and image avatars, cosmetic auras, and consumable power-ups
  (free hint, 50/50, coin boost, and a "Free Play" arcade minigame).
- **Comprehension-gated tutorials**: a kid has to answer a quick check to move on,
  so tutorials can't be skipped blind.
- **"I need help"**: a kid can flag any problem and move on with zero penalty. The
  parent report shows the exact problem, the hint shown, and what the kid tried.
- **Parent report**: read-only, PIN protected, with per-topic mastery, a needs-help
  vs doing-well snapshot, and lifetime stats.

## Tech stack

- **Frontend**: a single `index.html` (HTML, CSS, and plain JavaScript). No
  framework, no bundler. Canvas 2D for the arcade minigame, Web Audio for sound.
- **Backend**: Cloudflare Pages for static hosting plus Pages Functions for the API.
  `functions/api/player.js` becomes `/api/player`, `functions/api/admin.js` becomes
  `/api/admin`.
- **Storage**: Cloudflare KV, one record per player keyed by lowercased name.
- **Auth**: name plus a 4-digit PIN. The PIN is stored only as a salted SHA-256
  hash. The parent report path is read-only and never creates an account.

## Run it locally

You do not strictly need a server to try the game loop:

    # just open the file
    open index.html          # macOS
    # or serve the folder
    npx serve .

Saving needs the Cloudflare Functions runtime. To run the whole thing locally with
the API:

    npm i -D wrangler
    npx wrangler pages dev .

That serves the site and runs `functions/` as `/api/*`. For a local KV store,
Wrangler creates one automatically for `pages dev`.

## Deploy (Cloudflare Pages)

1. Create the KV namespace and put its id in `wrangler.toml`:

       npx wrangler kv namespace create ninja-kv

2. Deploy the folder:

       npx wrangler pages deploy . --project-name=<your-project>

3. In the Pages project settings, bind the KV namespace with the variable name
   `NINJA_KV` (must be exact), then redeploy once so the binding takes effect.

Check it works by visiting `/api/player` in a browser. You should see
`{"ok":true,"service":"number-ninja", ...}`. See `README-DEPLOY.md` for the
drag-and-drop path and more detail.

## Tests

No test framework, just Node scripts.

    node wbtest.js      # verifies every generator + all workbook answers
    node admintest.js   # verifies the admin stats endpoint (mock KV)
    node e2e.js          # full headless browser run (needs playwright)

`e2e.js` drives the real page with Playwright against an in-memory mock of the KV
save server, so it never touches production data.

## Admin stats

`/api/admin` returns platform stats (total players, active, problems solved, a
recent-player roster, and so on) and `admin.html` renders them. It is gated by a
secret: set `ADMIN_TOKEN` as an environment variable on the Pages project. With no
token set, the endpoint refuses to run. Never commit the token.

    npx wrangler pages secret put ADMIN_TOKEN --project-name=<your-project>

Then open `/admin.html` and paste the token.

## How saving works

- First time a kid enters a name and 4-digit PIN, that name is claimed with that PIN.
- Returning on any device with the same name and PIN loads their save.
- The PIN is never stored in the clear, only a one-way salted hash. There is no
  recovery, which is the right trade for a kids' game: no email, no personal data.
- Names are case-insensitive. Two kids who want separate saves pick different names.

## Repo layout

    index.html              the entire game (UI, generators, battle, shop, tutorials)
    functions/api/player.js  save server: login / save / read-only report
    functions/api/admin.js   token-gated platform stats
    admin.html               the admin dashboard page
    characters.json          editable shop config: list image filenames to add avatars
    images/                  avatar art (ship only art you own; emoji work with none)
    wrangler.toml            Cloudflare config (KV binding)
    wbtest.js / e2e.js / admintest.js   tests
    docs/ARCHITECTURE.md     how the pieces fit together

## A note on content

The math problems are generated by the code and inspired by common Grade 4 topics.
They are original and not reproduced from any commercial curriculum. The shop art in
`images/` includes third-party characters used here for private, personal,
non-commercial use only; they belong to their respective owners. If you fork this for
public or commercial use, remove them and ship only art you own. See `LICENSE`. The
game runs entirely on built-in emoji avatars if you ship no images.

## License

MIT for the code. See `LICENSE`.
