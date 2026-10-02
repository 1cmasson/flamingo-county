/**
 * The question and short answer a business or event page opens with (see
 * `lib/answers.ts`), and, when someone has checked the facts, the day they did.
 *
 * The heading is stored as a sentence ("What is Molina's Ranch Restaurant?")
 * and only DRAWN in capitals, so answer engines read a question rather than a
 * shout. The answer is a plain `<p>` straight under it: that pairing is what
 * gets quoted.
 */
export function AnswerBlock({
  question,
  answer,
  verified,
}: {
  question: string
  answer: string
  verified?: { text: string; iso: string } | null
}) {
  return (
    <section
      style={{
        background: 'var(--grad-cream)',
        border: '4px solid var(--ink)',
        boxShadow: '8px 8px 0 var(--ink)',
        padding: 'clamp(16px,3.5vw,24px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          background: 'var(--ink)',
          color: 'var(--yellow)',
          fontFamily: 'var(--display)',
          fontSize: 'clamp(19px,4.4vw,22px)',
          fontWeight: 400,
          lineHeight: 1.1,
          padding: '7px 12px 4px',
          textTransform: 'uppercase',
          textWrap: 'balance',
        }}
      >
        {question}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: 'clamp(16px,4vw,18px)',
          fontWeight: 600,
          lineHeight: 1.55,
          maxWidth: '68ch',
          textWrap: 'pretty',
        }}
      >
        {answer}
      </p>
      {verified ? (
        <p
          style={{
            margin: 0,
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '1.2px',
            color: 'var(--magenta)',
          }}
        >
          <time dateTime={verified.iso}>{verified.text}</time>
        </p>
      ) : null}
    </section>
  )
}
