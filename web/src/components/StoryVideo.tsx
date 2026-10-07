import type { Media, Video } from '../payload-types'

/**
 * The reel a story was made from, under its cover.
 *
 * `preload="none"`: the files are 15–25 MB, and a reader who never presses
 * play should not pay for one. The poster (the reel's DID YOU KNOW? card) is
 * all that loads, at the 828-wide size, which is plenty for a phone-width
 * player. `playsInline` keeps iOS from jumping to fullscreen on play.
 */
export function StoryVideo({
  video,
  heading,
  note,
  fallback,
}: {
  video: Video
  heading: string
  note: string
  fallback: string
}) {
  const poster = video.poster && typeof video.poster === 'object' ? (video.poster as Media) : null
  const posterUrl = poster?.sizes?.card?.url ?? poster?.url ?? undefined
  return (
    <section
      aria-label={heading}
      style={{
        marginTop: 'clamp(20px,4vw,34px)',
        background: 'var(--ink)',
        border: '4px solid var(--ink)',
        boxShadow: '9px 9px 0 var(--pink)',
        padding: 'clamp(16px,3.5vw,28px)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'clamp(16px,3vw,32px)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <video
        controls
        playsInline
        preload="none"
        poster={posterUrl}
        style={{
          width: 'min(100%, 340px)',
          aspectRatio: '9 / 16',
          height: 'auto',
          background: '#000',
          border: '4px solid var(--cream)',
          display: 'block',
        }}
      >
        <source src={video.url ?? undefined} type="video/mp4" />
        {fallback}
      </video>
      <div style={{ flex: '1 1 240px', maxWidth: '46ch', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--display)',
            fontWeight: 400,
            fontSize: 'clamp(26px,6vw,40px)',
            lineHeight: 0.95,
            color: 'var(--yellow)',
          }}
        >
          {heading}
        </h2>
        <p style={{ margin: 0, color: 'var(--cream)', fontWeight: 600, fontSize: 16, lineHeight: 1.5 }}>{note}</p>
        {video.credits ? (
          <p style={{ margin: 0, color: '#8b939c', fontWeight: 600, fontSize: 12, lineHeight: 1.5 }}>{video.credits}</p>
        ) : null}
      </div>
    </section>
  )
}
