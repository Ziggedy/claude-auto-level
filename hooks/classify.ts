// Stichwort-Regeln: aus dem Prompt-Text eine von vier Stufen ableiten.
// Eigene Wörter (z. B. Firmenbegriffe) kommen über die Plugin-Einstellungen dazu,
// nicht hier hinein – so bleibt das öffentliche Repository neutral.

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type ModelTier = 'sonnet' | 'opus'
export type LevelName = 'leicht' | 'normal' | 'schwer' | 'maximal'

export type Level = { name: LevelName; model: ModelTier; effort: Effort }

// Sonnet ist das Minimum, Haiku wird nie gewählt
export const LEVELS: Record<LevelName, Level> = {
  leicht: { name: 'leicht', model: 'sonnet', effort: 'low' },
  normal: { name: 'normal', model: 'sonnet', effort: 'medium' },
  schwer: { name: 'schwer', model: 'opus', effort: 'high' },
  maximal: { name: 'maximal', model: 'opus', effort: 'xhigh' },
}

// Smalltalk / Abschluss – nur als ganze Wörter
const EASY = [
  'danke', 'thx', 'thanks', 'hallo', 'hi', 'moin', 'servus', 'ok', 'okay', 'super', 'passt',
  'perfekt', 'top', 'erledigt', 'tschüss', 'bis später',
]

// Anspruchsvollere Aufgaben (+2 je Treffer, Wortanfang genügt)
const HARD = [
  'debug', 'fehler', 'error', 'exception', 'bug', 'funktioniert nicht', 'geht nicht',
  'script', 'skript', 'powershell', 'bash', 'code', 'programmier', 'regex',
  'sql', 'datenbank', 'api', 'server', 'firewall', 'dns', 'netzwerk', 'vpn',
  'zertifikat', 'analysier', 'analyse', 'vergleich', 'warum', 'berechne', 'formel',
  'excel', 'plugin', 'hook', 'deploy', 'docker', 'linux', 'windows', 'registry',
]

// Große, mehrstufige Aufgaben (+4 je Treffer)
const MAX = [
  'architektur', 'konzept', 'strategie', 'migration', 'migrier', 'sicherheitskonzept',
  'refactor', 'von grund auf', 'ausführlich', 'gründlich', 'tiefgehend', 'ultrathink',
  'plan erstellen', 'planung', 'audit', 'dsgvo', 'datenschutz',
]

// Manuelle Übersteuerung: Prompt beginnt mit z. B. "!max " oder "!leicht "
const OVERRIDE: Record<string, LevelName> = {
  '!leicht': 'leicht', '!low': 'leicht',
  '!normal': 'normal', '!mid': 'normal',
  '!schwer': 'schwer', '!high': 'schwer',
  '!max': 'maximal', '!maximal': 'maximal',
}

/** Kommagetrennte Liste aus den Einstellungen → saubere Wortliste */
export const parseWords = (raw: unknown): string[] =>
  typeof raw === 'string'
    ? raw.split(',').map(w => w.trim().toLowerCase()).filter(w => w.length > 0)
    : []

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// whole = true: nur ganze Wörter ("ok" trifft nicht "Oktober")
const hits = (text: string, words: string[], whole = false) =>
  words.filter(w =>
    new RegExp(`(^|[^\\p{L}])${escape(w)}${whole ? '(?![\\p{L}])' : ''}`, 'iu').test(text),
  )

/**
 * Woran die Stufe festgemacht wurde – wichtig für das "Kleben":
 * - forced:    !-Kürzel, gilt immer
 * - keywords:  eigene Stichworte, Code oder langer Text → darf auch runterstufen
 * - smalltalk: "danke", "passt" … → stuft auf leicht
 * - none:      nichts erkennbar → übernimmt die vorige Stufe
 */
export type Signal = 'forced' | 'keywords' | 'smalltalk' | 'none'

export type Verdict = { level: Level; signal: Signal; reason: string; text: string }

export type Extra = { hard?: string[]; max?: string[] }

export function classify(raw: string, extra: Extra = {}): Verdict {
  const trimmed = raw.trim()
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? ''
  const forced = OVERRIDE[first]
  if (forced) {
    return {
      level: LEVELS[forced],
      signal: 'forced',
      reason: `manuell (${first})`,
      text: trimmed.slice(first.length).trim() || trimmed,
    }
  }

  const text = trimmed.toLowerCase()
  const easy = hits(text, EASY, true)
  const hard = hits(text, [...HARD, ...(extra.hard ?? [])])
  const max = hits(text, [...MAX, ...(extra.max ?? [])])
  const hasCode = /```|\$\s*\w+|\b(get|set|new)-\w+/i.test(trimmed)
  const isLong = text.length > 600

  let score = 0
  score += hard.length * 2
  score += max.length * 4
  if (hasCode) score += 3
  if (isLong) score += 2
  if (text.length > 2000) score += 3
  score -= easy.length * 2

  // "maximal" nur bei einem Großaufgaben-Wort oder sehr viel Material
  const isMax = (max.length > 0 && score >= 6) || score >= 12
  const name: LevelName =
    isMax ? 'maximal' : score >= 2 ? 'schwer' : score <= -2 ? 'leicht' : 'normal'

  const hasSubstance = hard.length > 0 || max.length > 0 || hasCode || isLong
  const signal: Signal = hasSubstance ? 'keywords' : easy.length > 0 ? 'smalltalk' : 'none'

  const found = [...max, ...hard, ...(hasCode ? ['Code'] : []), ...easy].slice(0, 3)
  const reason = found.length > 0 ? found.join(', ') : 'Standard'

  return { level: LEVELS[name], signal, reason, text: raw }
}

/** Die Stufe "klebt": ohne klares Signal bleibt die vorige Stufe stehen */
export function decide(prev: Level | null, v: Verdict): { level: Level; reason: string } {
  if (prev === null || v.signal !== 'none') return { level: v.level, reason: v.reason }
  return { level: prev, reason: 'wie vorher' }
}

/**
 * Welches Modell geht raus?
 * - Deine Wahl in der App ist die Untergrenze (Opus gewählt → bleibt Opus)
 * - Einmal Opus in dieser Sitzung → bleibt Opus (kein teurer Rückwechsel)
 * Gibt null zurück, wenn das Modell der Sitzung unverändert bleiben soll.
 */
export function pickModel(
  sessionModel: string,
  wanted: ModelTier,
  ratchet: ModelTier,
): ModelTier | null {
  const session = sessionModel.toLowerCase()
  if (session.includes('opus')) return null // schon Opus → genau dieses Modell behalten
  if (wanted === 'opus' || ratchet === 'opus') return 'opus'
  if (session.includes('sonnet')) return null // schon Sonnet → unverändert
  return 'sonnet' // z. B. Haiku in der App → auf das Minimum Sonnet anheben
}
