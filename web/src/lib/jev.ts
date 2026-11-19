/**
 * Jev, TypeSafe AI's decision model (docs.typesafe.ai): given a typed reply
 * and the buttons on screen, which button did they mean? It returns a choice
 * with a probability and never writes text, so nothing it does can put words
 * in our mouth. Only the WhatsApp lines use it, only when the reply matched
 * no button by number or words (lib/laCapital.ts `pick`), and only if
 * TYPESAFE_API_KEY is set. Without it, or on any error, the answer is null
 * and the flow counts a miss, exactly as if Jev weren't there.
 *
 * Phone numbers, emails and long digit runs are blanked out before the reply
 * leaves the server.
 */

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
/** Below this the pick is ignored: better to show the buttons again than guess. */
export const MIN_CONFIDENCE = 0.8
const NONE = 'none'

export const jevConfigured = () => Boolean(process.env.TYPESAFE_API_KEY)

export const redact = (s: string) =>
  s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]')
    .slice(0, 500)

export type JevOption = { id: string; description: string }

/** The button id Jev reads in `reply`, or null (not sure, not set up, or an error). */
export async function jevPick(question: string, reply: string, options: JevOption[]): Promise<string | null> {
  const key = process.env.TYPESAFE_API_KEY
  if (!key || !options.length || !reply.trim()) return null
  const criteria: Record<string, string> = {}
  for (const o of options) criteria[o.id] = o.description
  criteria[NONE] = 'None of these: something else, a question, or not clear.'
  try {
    const res = await fetch(JEV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'jev-latest',
        state: `We asked: ${question}\nThey replied: ${redact(reply)}`,
        questions: {
          pick: { type: 'choice', instructions: 'Which option did the person choose with their reply?', criteria },
        },
      }),
      signal: AbortSignal.timeout(2_500),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { answers?: { pick?: { choice?: string; confidence?: number } } }
    const a = data.answers?.pick
    if (!a?.choice || a.choice === NONE || (a.confidence ?? 0) < MIN_CONFIDENCE) return null
    return options.some((o) => o.id === a.choice) ? a.choice : null
  } catch {
    return null
  }
}
