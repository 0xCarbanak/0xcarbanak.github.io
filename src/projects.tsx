import { useState, type Ref } from 'react'

const categoryLabels = {
  all: 'All',
  'initial-access': 'Initial access',
  research: 'Research',
  web: 'Web',
  lab: 'Lab',
} as const

type Filter = keyof typeof categoryLabels
const filters = Object.keys(categoryLabels) as Filter[]

const repositories = [
  {
    name: 'omnispex',
    category: 'research',
    language: 'Rust',
    description: 'Offline analysis of Windows executable imports and DLL loading.',
  },
  {
    name: 'web-app-pentest-skill',
    category: 'web',
    language: 'Python',
    description: 'A Claude Code skill for web application security assessments.',
  },
  {
    name: 'grfics-ot-lab',
    category: 'lab',
    language: 'Shell',
    description: 'A simulated chemical plant for industrial security and CTF practice.',
  },
  {
    name: 'session-inception-poc',
    category: 'research',
    language: null,
    description: 'A proof of concept for how Claude Code summarizes a repository.',
  },
  {
    name: 'VSCrook',
    category: 'initial-access',
    language: 'Python',
    description: 'A Visual Studio Code initial access tool for red-team engagements.',
  },
] as const

type ProjectsProps = { github: string; titleRef: Ref<HTMLHeadingElement> }

export function Projects({ github, titleRef }: ProjectsProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const visible = filter === 'all' ? repositories : repositories.filter((repo) => repo.category === filter)

  return (
    <main className="section-page projects-page">
      <a className="home-link" href="#home">Home</a>
      <h1 tabIndex={-1} ref={titleRef}>Projects</h1>

      <div className="projects-toolbar">
        <div className="project-filters" role="group" aria-label="Filter projects by category">
          {filters.map((category) => (
            <button key={category} type="button" aria-pressed={filter === category} onClick={() => setFilter(category)}>
              {categoryLabels[category]}
            </button>
          ))}
        </div>
        <p className="projects-count" role="status">{visible.length} {visible.length === 1 ? 'repository' : 'repositories'}</p>
      </div>

      <ul className="repository-list">
        {visible.map(({ name, category, language, description }) => (
          <li key={name} data-category={category}>
            <a className="repository-entry" href={`${github}/${name}`}>
              <span className="repository-icon" aria-hidden="true"><span className="folder-icon" /></span>
              <span className="repository-summary">
                <span className="repository-name">{name}</span>
                <span className="repository-description">{description}</span>
              </span>
              <span className="repository-meta">
                <span className="repository-category">{categoryLabels[category]}</span>
                {language && <span className="repository-language">{language}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}
