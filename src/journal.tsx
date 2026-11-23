import { useEffect, useRef } from 'react'
import Markdown from 'react-markdown'

const files = import.meta.glob<string>('./posts/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
})

function readEntry(path: string, source: string) {
  const filename = path.split('/').at(-1) ?? ''
  const match = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.exec(filename)
  const [heading, ...body] = source.trimStart().split(/\r?\n/)
  const title = /^#\s+(.+?)\s*$/u.exec(heading)?.[1]
  const date = match?.[1] ?? ''
  const timestamp = Date.parse(`${date}T00:00:00Z`)

  if (!title || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    if (import.meta.env.DEV) console.warn(`Journal skipped ${filename}. Check its filename, date, and title.`)
    return []
  }

  return [{ slug: filename.slice(0, -3), title, date, body: body.join('\n') }]
}

const entries = Object.entries(files)
  .flatMap(([path, source]) => readEntry(path, source))
  .sort((first, second) => second.date.localeCompare(first.date) || first.slug.localeCompare(second.slug))

export default function Journal({ slug }: { slug?: string }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const entry = entries.find((item) => item.slug === slug)
  const title = slug ? entry?.title ?? 'Entry not found' : 'Journal'

  useEffect(() => {
    document.title = `${title} · 0xCarbanak`
    heading.current?.focus({ preventScroll: true })
  }, [slug, title])

  return (
    <main className="journal-page">
      <a className="home-link" href={slug ? '#blog' : '#home'}>{slug ? 'Journal' : 'Home'}</a>
      <div className="journal-window">
        <header className="journal-header">
          <h1 ref={heading} tabIndex={-1}>
            {slug ? title : <><span aria-hidden="true">~/</span>journal</>}
          </h1>
          {entry && <time className="journal-date" dateTime={entry.date}>{entry.date}</time>}
        </header>

        {entry ? (
          <article className="journal-article" aria-label={entry.title}>
            <Markdown skipHtml>{entry.body}</Markdown>
          </article>
        ) : slug ? (
          <p className="journal-status">This entry is unavailable.</p>
        ) : entries.length ? (
          <ul className="journal-index">
            {entries.map((item) => (
              <li key={item.slug}>
                <a href={`#blog/${item.slug}`}>
                  <time className="journal-date" dateTime={item.date}>{item.date}</time>
                  <span>{item.title}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="journal-status">No entries yet.</p>
        )}
      </div>
    </main>
  )
}
