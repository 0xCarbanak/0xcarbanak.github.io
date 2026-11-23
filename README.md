# Antonio Limeira’s website

Install the dependencies and start Vite locally using Node.js 24 and pnpm.

~~~sh
pnpm install --frozen-lockfile
pnpm dev
~~~

Run `pnpm build` to check TypeScript and produce a static build in `dist/`. Run `pnpm preview` to serve that build locally.

The root URL shows a terminal after a one-second pause. The console types a simulated profile-load command and Antonio’s callsign, name, role, and skills. The finished profile waits for Enter or a tap on the continue prompt. **Skip intro** or Escape opens the homepage immediately, and reduced-motion visitors go straight to it. The homepage, Projects page, and journal also support direct links at `/#home`, `/#projects`, and `/#blog`.

The Projects directory uses a snapshot of 0xCarbanak’s public repositories in `src/projects.tsx`. Category filters use the same labels as the repository rows.

## Adding a journal entry

Save a Markdown file in `src/posts/`. Use `YYYY-MM-DD-post-slug.md` as the filename, with a real date and lowercase words separated by hyphens. The first nonblank line is a Markdown title beginning with `# `. Leave a blank line after the title, then write the entry in Markdown.

The journal lists entries newest first and gives each one a link at `/#blog/YYYY-MM-DD-post-slug`. Vite picks up files while the local server is running. Run `pnpm build` to include new entries in the static build.
