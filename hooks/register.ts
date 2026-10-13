import type { Register } from 'claude-code'

import { classify, decide, parseWords, pickModel, type Level, type ModelTier } from './classify'

export const register: Register = (on, options) => {
  // Eigene Stichworte aus den Plugin-Einstellungen (bleiben lokal, nicht im Repository)
  const extra = { hard: parseWords(options.extraHard), max: parseWords(options.extraMax) }

  let enabled = true
  let current: Level | null = null // Stufe des letzten Prompts ("klebt")
  let reason = ''
  let ratchet: ModelTier = 'sonnet' // einmal Opus → bleibt Opus
  let lastLabel = ''

  // Schalter: /auto-level aus | an | status
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'auto-level',
      description: 'Auto-Level steuern: aus | an | status',
    })
    return next(e)
  })

  on('command.run', { command: 'auto-level' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'aus' || arg === 'off') {
      enabled = false
      current = null
      lastLabel = ''
      $.ui.status(undefined)
      return { text: 'Auto-Level ist aus. Modell und Denktiefe bleiben, wie du sie eingestellt hast.' }
    }
    if (arg === 'an' || arg === 'on') {
      enabled = true
      return { text: 'Auto-Level ist an.' }
    }

    const state = enabled
      ? current
        ? `an – aktuell ${current.name} (${current.model} · ${current.effort}), Grund: ${reason}`
        : 'an – noch kein Prompt bewertet'
      : 'aus'
    const lock = ratchet === 'opus' ? '\nOpus ist für diese Sitzung eingerastet.' : ''
    return { text: `Auto-Level: ${state}${lock}\nBefehle: /auto-level aus | an | status` }
  })

  // 1) Prompt kommt rein → Stufe bestimmen
  on('prompt.submit', ($, e, next) => {
    if (!enabled) return next(e)
    const verdict = classify(e.text, extra)
    const decision = decide(current, verdict)
    current = decision.level
    reason = decision.reason
    return next({ ...e, text: verdict.text })
  }).catch(($, e, next) => next(e)) // Regeln fehlgeschlagen → Prompt unverändert

  // 2) Jede Modell-Anfrage des Haupt-Chats → Modell und Denktiefe setzen
  on('turn.step', async function* ($, e, next) {
    if (!enabled || current === null || e.agentId !== undefined) {
      return yield* next(e) // aus, kein Prompt oder Subagent → unverändert
    }

    const swap = pickModel(e.model, current.model, ratchet)
    const model = swap ?? e.model
    if (model.toLowerCase().includes('opus')) ratchet = 'opus'

    if (e.index === 0) {
      const shown = model.toLowerCase().includes('opus') ? 'opus' : 'sonnet'
      const label = `${current.name}: ${shown} · ${current.effort}`
      $.ui.status(`Auto-Level ${label}`)
      if (label !== lastLabel) $.ui.toast(`Auto-Level ${label} (${reason})`)
      lastLabel = label
    }

    return yield* next({ ...e, model, effort: current.effort })
  })
}
