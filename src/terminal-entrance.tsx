import { useEffect, useState } from 'react'

const command = 'profile load 0xCarbanak'
const finalSkill = 'Hacking Stuff'
const profile = [
  { label: 'callsign', value: '0xCarbanak' },
  { label: 'name', value: 'Antonio Limeira' },
  { label: 'role', value: 'Red Team Operator' },
  { label: 'skills', value: 'Initial access · Adversary emulation · ' },
]

const typingCadence = [27, 42, 22, 30, 37, 25, 32]
const profileCadence = [15, 22, 16, 24, 17, 19]
const morphSteps = 12
const morphGlyphs = '01ABXZ<>#*+:'
const fadeTime = 300

function scrambleSkill(step: number) {
  const resolved = Math.floor(step / morphSteps * finalSkill.length)
  return [...finalSkill].map((character, index) => {
    if (character === ' ' || index < resolved) return character
    return morphGlyphs[(index * 7 + step * 5) % morphGlyphs.length]
  }).join('')
}

function flickerSkill(cycle: number, step: number) {
  return finalSkill.split(' ').map((word, index) => {
    const position = 1 + (cycle + index * 2) % (word.length - 1)
    const glyph = morphGlyphs[(cycle * 3 + step * 5 + index * 7) % morphGlyphs.length]
    return `${word.slice(0, position)}${glyph}${word.slice(position + 1)}`
  }).join(' ')
}

type Frame =
  | { stage: 'command'; length: number }
  | { stage: 'profile'; field: number; length: number }
  | { stage: 'morph'; step: number }
  | { stage: 'ready' }

export function TerminalEntrance({ onComplete }: { onComplete: () => void }) {
  const [frame, setFrame] = useState<Frame | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [idleSkill, setIdleSkill] = useState<string | null>(null)
  const typingProfile = frame?.stage === 'profile' ? frame : null
  const morph = frame?.stage === 'morph' ? frame : null
  const loaded = frame?.stage === 'ready'
  const visibleFields = loaded || morph ? profile.length : (typingProfile?.field ?? -1) + 1
  const scrambledSkill = morph ? scrambleSkill(morph.step) : leaving ? null : idleSkill

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) {
      onComplete()
      return
    }

    let timer: number

    function queue(action: () => void, delay: number) {
      timer = window.setTimeout(action, delay)
    }

    function morphSkill(step: number) {
      if (step === morphSteps) {
        setFrame({ stage: 'ready' })
        return
      }
      setFrame({ stage: 'morph', step })
      queue(() => morphSkill(step + 1), 42)
    }

    function typeProfile(field: number, length: number) {
      setFrame({ stage: 'profile', field, length })
      const { label, value } = profile[field]
      if (length < label.length + 2 + value.length) {
        queue(() => typeProfile(field, length + 1), profileCadence[length % profileCadence.length])
        return
      }
      if (field < profile.length - 1) queue(() => typeProfile(field + 1, 0), 120)
      else queue(() => morphSkill(0), 90)
    }

    function type(length: number) {
      setFrame({ stage: 'command', length })
      if (length < command.length) {
        queue(() => type(length + 1), typingCadence[length % typingCadence.length])
        return
      }
      queue(() => typeProfile(0, 0), 200)
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onComplete()
    }

    function handleMotion(event: MediaQueryListEvent) {
      if (event.matches) onComplete()
    }

    queue(() => {
      setFrame({ stage: 'command', length: 0 })
      queue(() => type(1), 180)
    }, 1000)
    window.addEventListener('keydown', handleKey)
    motion.addEventListener('change', handleMotion)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', handleKey)
      motion.removeEventListener('change', handleMotion)
    }
  }, [onComplete])

  useEffect(() => {
    if (!loaded || leaving) return

    let cycle = 0
    let frameTimer: number

    function flicker(run: number, step: number) {
      if (step === 4 || document.hidden) {
        setIdleSkill(null)
        return
      }
      setIdleSkill(flickerSkill(run, step))
      frameTimer = window.setTimeout(() => flicker(run, step + 1), 65)
    }

    const interval = window.setInterval(() => flicker(cycle++, 0), 5000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(frameTimer)
    }
  }, [loaded, leaving])

  useEffect(() => {
    if (!loaded || leaving) return

    function handleEnter(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.repeat) return
      event.preventDefault()
      setLeaving(true)
    }

    window.addEventListener('keydown', handleEnter)
    return () => window.removeEventListener('keydown', handleEnter)
  }, [loaded, leaving])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(onComplete, fadeTime)
    return () => window.clearTimeout(timer)
  }, [leaving, onComplete])

  return (
    <div className={`terminal-entrance${frame ? ' terminal-entrance--visible' : ''}${leaving ? ' terminal-entrance--leaving' : ''}`}>
      <p className="terminal-status" role="status">
        {loaded ? 'Profile loaded. Press Enter to continue.' : 'Loading the operator profile. Press Escape to skip.'}
      </p>
      {frame && (
        <div className="boot-terminal">
          <div className="boot-terminal-heading" aria-hidden="true">
            <span>C2 / operator console</span>
            <span>local session</span>
          </div>
          <div className="boot-terminal-output">
            <p className="boot-command" aria-hidden="true">
              <span className="boot-prompt">c2 &gt;</span>
              <span>{frame.stage === 'command' ? command.slice(0, frame.length) : command}{frame.stage === 'command' && <span className="boot-caret" />}</span>
            </p>
            {visibleFields > 0 && (
              <div className="boot-profile">
                <p className="boot-profile-status" aria-hidden="true">
                  <span className="boot-prompt">{loaded ? '[ok]' : '[..]'}</span>
                  <span>{loaded ? 'Profile loaded.' : 'Loading operator profile…'}</span>
                </p>
                <dl className="boot-profile-fields" aria-label="Operator profile">
                  {profile.slice(0, visibleFields).map(({ label, value }, index) => {
                    const fieldLabel = `${label}:`
                    const active = typingProfile?.field === index
                    const length = active ? typingProfile.length : fieldLabel.length + 1 + value.length
                    const afterLabel = length > fieldLabel.length

                    return (
                      <div key={label}>
                        <dt>{fieldLabel.slice(0, length)}{active && !afterLabel && <span className="boot-caret" />}</dt>
                        <dd>
                          {value.slice(0, Math.max(0, length - fieldLabel.length - 1))}
                          {active && afterLabel && <span className="boot-caret" />}
                          {label === 'skills' && (morph || loaded) && (
                            <span className={`boot-skill${scrambledSkill ? ' boot-skill--morphing' : ''}${loaded ? ' boot-skill--idle' : ''}`}>
                              <span className="boot-skill-label">{finalSkill}</span>
                              {scrambledSkill && <span className="boot-skill-scramble" aria-hidden="true">{scrambledSkill}</span>}
                            </span>
                          )}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </div>
            )}
          </div>
          <div className="boot-terminal-footer">
            {loaded ? (
              <button key="continue" type="button" className="boot-continue" onClick={() => setLeaving(true)} disabled={leaving} autoFocus>
                press <kbd>Enter</kbd> to continue
              </button>
            ) : (
              <button key="skip" type="button" onClick={onComplete} className="boot-skip">Skip intro <kbd aria-hidden="true">Esc</kbd></button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
