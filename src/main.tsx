import { lazy, StrictMode, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/space-grotesk/wght.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import githubMark from './assets/github-mark.png'
import linkedinMark from './assets/linkedin-mark.png'
import whiteRabbit from './assets/white-rabbit.txt?raw'
import { Projects } from './projects'
import { TerminalEntrance } from './terminal-entrance'
import './styles.css'

const Journal = lazy(() => import('./journal'))
const github = 'https://github.com/0xCarbanak'
const linkedin = 'https://www.linkedin.com/in/antonio-limeira/'
const rabbitLines = whiteRabbit.trimEnd().split(/\r?\n/)

type Page = 'gate' | 'home' | 'projects' | 'blog'

function readPage(hash: string): Page {
  if (hash === '#home') return 'home'
  if (hash === '#projects') return 'projects'
  if (hash === '#blog' || hash.startsWith('#blog/')) return 'blog'
  return 'gate'
}

function App() {
  const [hash, setHash] = useState(() => window.location.hash)
  const page = readPage(hash)
  const entrySlug = hash.startsWith('#blog/') ? hash.slice('#blog/'.length) || undefined : undefined
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    function navigate() {
      setHash(window.location.hash)
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])

  useEffect(() => {
    if (page === 'blog') return
    document.title = page === 'projects' ? 'Projects · 0xCarbanak' : '0xCarbanak · Adversary Emulation'
    title.current?.focus({ preventScroll: true })
  }, [page])

  const enterHome = useCallback(() => {
    window.history.replaceState(window.history.state, '', '#home')
    setHash('#home')
  }, [])

  return (
    <>
      {page === 'gate' && <TerminalEntrance onComplete={enterHome} />}

      {(page === 'home' || page === 'gate') && (
        <main className="homepage" inert={page === 'gate'}>
          <div className="home-frame">
            <div className="identity">
              <h1 tabIndex={-1} ref={title}><span className="callsign-zero">0</span>xCarbanak</h1>
              <p className="identity-tagline">Adversary Emulation</p>
              <nav className="profile-links" aria-label="Profiles">
                <a href={github} aria-label="GitHub">
                  <span className="profile-mark" aria-hidden="true">
                    <img src={githubMark} width={294} height={288} alt="" />
                    <span className="profile-rain" style={{ maskImage: `url("${githubMark}")` }}>
                      <span>{'0\n1\n0\n1'}</span>
                      <span>{'1\n0\n0'}</span>
                    </span>
                  </span>
                </a>
                <a href={linkedin} aria-label="LinkedIn">
                  <span className="profile-mark" aria-hidden="true">
                    <img src={linkedinMark} width={840} height={779} alt="" />
                    <span className="profile-rain" style={{ maskImage: `url("${linkedinMark}")` }}>
                      <span>{'1\n0\n1\n0'}</span>
                      <span>{'0\n1\n1'}</span>
                    </span>
                  </span>
                </a>
              </nav>
              <nav className="section-links" aria-label="Site sections">
                <a className="section-link" href="#projects">
                  <span className="section-link-icon" aria-hidden="true"><span className="folder-icon" /></span>
                  <span className="section-link-text">
                    <span className="section-link-title">Projects</span>
                    <span className="section-link-detail">Projects and Tools</span>
                  </span>
                </a>
                <a className="section-link" href="#blog">
                  <span className="section-link-icon" aria-hidden="true"><span className="blog-icon" /></span>
                  <span className="section-link-text">
                    <span className="section-link-title">Blog</span>
                    <span className="section-link-detail">Terminal journal</span>
                  </span>
                </a>
              </nav>
            </div>
            <figure className="rabbit-console" aria-label="White rabbit in ASCII art">
              <div className="rabbit-signal">
                <p className="rabbit-prompt"><span aria-hidden="true">&gt;</span> follow the white rabbit.</p>
                <pre className="rabbit-art" aria-hidden="true">
                  {rabbitLines.map((line, index) => (
                    <span key={index} style={{ animationDelay: `${180 + index * 125}ms` }}>{line}</span>
                  ))}
                </pre>
              </div>
            </figure>
          </div>
        </main>
      )}

      {page === 'projects' && <Projects github={github} titleRef={title} />}

      {page === 'blog' && (
        <Suspense fallback={<main className="journal-page" aria-busy="true">Opening journal…</main>}>
          <Journal slug={entrySlug} />
        </Suspense>
      )}

    </>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
