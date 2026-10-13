# auto-level

Ein Mod für Claude Code und Claude Cowork. Er wählt für jeden Prompt automatisch das Modell (Sonnet oder Opus) und die Denktiefe (Effort), und zwar anhand einfacher Stichwort-Regeln.

> Funktioniert nur in Claude Code und Cowork, nicht im normalen claude.ai-Chat im Browser oder auf dem Handy.

## Installieren

```
/plugin install auto-level --marketplace Ziggedy/claude-auto-level
```

Danach `y` (Marktplatz hinzufügen), dann den Bereich „User“ mit Enter wählen. Der Mod läuft sofort und in jeder neuen Sitzung.

**Empfehlung:** Stell in der App **Sonnet** als Standardmodell ein. Deine Modellwahl gilt als Untergrenze. Steht sie auf Opus, kann der Mod nur noch bei der Denktiefe sparen.

## Stufen

| Stufe   | Modell | Denktiefe | Typische Auslöser |
|---------|--------|-----------|-------------------|
| leicht  | Sonnet | low       | „danke“, „passt“, „hallo“ |
| normal  | Sonnet | medium    | Fragen ohne besondere Stichworte |
| schwer  | Opus   | high      | Fehler, Script, PowerShell, Server, Analyse, Code im Prompt |
| maximal | Opus   | xhigh     | Konzept, Migration, Architektur, Audit, Datenschutz |

## Regeln

1. **Kleben:** Eine Nachricht ohne eigene Stichworte (z. B. „und jetzt?“) übernimmt die Stufe der vorigen Nachricht. Runter geht es nur bei Smalltalk, neuen Stichworten oder einem !-Kürzel.
2. **Opus rastet ein:** Ist eine Sitzung einmal auf Opus, bleibt sie dort. Ein Rückwechsel würde das neue Modell zwingen, den ganzen Chat erneut zum vollen Preis zu lesen. Die Denktiefe bewegt sich weiter frei.
3. **Deine Wahl zählt:** Hast du Opus in der App gewählt, bleibt es Opus. Unter Sonnet geht der Mod nie.
4. **Subagents** bleiben unangetastet.

## Selbst steuern

- `!leicht`, `!normal`, `!schwer`, `!max` am Anfang eines Prompts erzwingen eine Stufe. Das Kürzel wird vor dem Absenden entfernt.
- `/auto-level aus` schaltet den Mod für die laufende Sitzung ab.
- `/auto-level an` schaltet ihn wieder ein.
- `/auto-level status` zeigt die aktuelle Stufe und den Grund dafür.

## Eigene Stichworte

Firmen- oder fachspezifische Begriffe gehören nicht ins Repository, sondern in die Plugin-Einstellungen (`/config` → auto-level):

- **Eigene Stichworte: schwer:** kommagetrennt, z. B. `sophos, active directory, datev`
- **Eigene Stichworte: maximal:** kommagetrennt, z. B. `nis2, gobd`

Die Werte liegen nur lokal in deiner `settings.json`.

## Datenschutz

Der Mod sendet keine Daten an Dritte und ruft keine externen Dienste auf. Er liest den Prompt nur lokal, um die Stufe zu bestimmen.

## Entwickeln

```
claude plugin validate .
claude plugin test .
```

Die Regeln stehen in `hooks/classify.ts`, die Anbindung an Claude in `hooks/register.ts`.

Siehe [CHANGELOG.md](CHANGELOG.md) für den Update-Log.
