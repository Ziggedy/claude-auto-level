import { describe, expect, test } from 'claude-code/testing'

import { LEVELS, classify, decide, pickModel } from '../hooks/classify'

describe('Stichwort-Regeln', () => {
  test('Smalltalk → leicht, aber nie unter Sonnet', async () => {
    const v = classify('Danke dir, passt so!')
    expect(v.level.name).toBe('leicht')
    expect(v.level.model).toBe('sonnet')
    expect(v.signal).toBe('smalltalk')
  })

  test('"ok" trifft nicht "Oktober"', async () => {
    expect(classify('Was steht im Oktober an?').signal).toBe('none')
  })

  test('Fehlersuche mit PowerShell → schwer (Opus, high)', async () => {
    const v = classify('Mein PowerShell Script wirft einen Fehler beim Get-ADUser')
    expect(v.level.name).toBe('schwer')
    expect(v.level.effort).toBe('high')
  })

  test('Konzept + Migration → maximal (Opus, xhigh)', async () => {
    const v = classify('Erstelle ein Konzept für die Migration unserer Server in die Cloud')
    expect(v.level.name).toBe('maximal')
    expect(v.level.effort).toBe('xhigh')
  })

  test('!max wird erkannt und aus dem Text entfernt', async () => {
    const v = classify('!max Hallo')
    expect(v.level.name).toBe('maximal')
    expect(v.text).toBe('Hallo')
  })

  test('eigene Stichworte aus den Einstellungen zählen mit', async () => {
    expect(classify('Frage zu Sophos').signal).toBe('none')
    const v = classify('Frage zu Sophos', { hard: ['sophos'] })
    expect(v.level.name).toBe('schwer')
  })
})

describe('Kleben', () => {
  test('Rückfrage ohne Stichwort übernimmt die vorige Stufe', async () => {
    const d = decide(LEVELS.schwer, classify('und jetzt?'))
    expect(d.level.name).toBe('schwer')
  })

  test('Smalltalk stuft runter', async () => {
    expect(decide(LEVELS.schwer, classify('danke, passt')).level.name).toBe('leicht')
  })

  test('neue Stichworte dürfen runterstufen', async () => {
    expect(decide(LEVELS.maximal, classify('Fehler im Script')).level.name).toBe('schwer')
  })
})

describe('Modellwahl', () => {
  test('Opus in der App ist Untergrenze → bleibt unverändert', async () => {
    expect(pickModel('claude-opus-5-5', 'sonnet', 'sonnet')).toBeNull()
  })

  test('Sonnet in der App, schwere Aufgabe → Opus', async () => {
    expect(pickModel('claude-sonnet-5', 'opus', 'sonnet')).toBe('opus')
  })

  test('einmal Opus → kein Rückwechsel', async () => {
    expect(pickModel('claude-sonnet-5', 'sonnet', 'opus')).toBe('opus')
  })

  test('Haiku in der App → auf Sonnet angehoben', async () => {
    expect(pickModel('claude-haiku-4', 'sonnet', 'sonnet')).toBe('sonnet')
  })
})

// Kompletter Ablauf durch die Engine: Prompt → Modell-Anfrage
type Seen = { model: string; effort: unknown }
type Body = Parameters<typeof test>[1]
type TestOn = Parameters<Extract<Body, (...a: never[]) => unknown>>[1]
type TestEngine = Parameters<Extract<Body, (...a: never[]) => unknown>>[0]

function fakeModel(on: TestOn, seen: Seen[]) {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.step', async function* ($, e) {
    seen.push({ model: e.model, effort: e.effort })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
}

async function step($: TestEngine, agentId?: string) {
  const s = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5', effort: 'medium', messageCount: 1, agentId } as never)
  for await (const chunk of s) void chunk
  return s.result
}

test('Ablauf: schwer → Opus/high, Rückfrage bleibt, Smalltalk → low mit eingerastetem Opus', async ($, on) => {
  const seen: Seen[] = []
  fakeModel(on, seen)

  await $.prompt.submit({ text: 'Mein PowerShell Script hat einen Fehler' } as never)
  await step($)
  await $.prompt.submit({ text: 'und jetzt?' } as never)
  await step($)
  await $.prompt.submit({ text: 'danke, passt' } as never)
  await step($)

  expect(seen.map(s => `${s.model}/${s.effort}`)).toEqual(['opus/high', 'opus/high', 'opus/low'])
})

test('Subagents bleiben unangetastet', async ($, on) => {
  const seen: Seen[] = []
  fakeModel(on, seen)
  await $.prompt.submit({ text: '!max los' } as never)
  await step($, 'agent-1')
  expect(seen[0]?.model).toBe('claude-sonnet-5')
  expect(seen[0]?.effort).toBe('medium')
})

test('/auto-level aus schaltet ab', async ($, on) => {
  const seen: Seen[] = []
  fakeModel(on, seen)
  const r = await $.command.run({ command: 'auto-level', args: 'aus' } as never)
  expect(JSON.stringify(r)).toContain('aus')
  await $.prompt.submit({ text: '!max Konzept' } as never)
  await step($)
  expect(seen[0]?.model).toBe('claude-sonnet-5')
})
