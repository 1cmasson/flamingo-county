import type { Lang } from '../i18n'
import type { Media, Video } from '../payload-types'
import { StoryVideoPlayer, type VideoCut } from './StoryVideoPlayer'

/**
 * The reel a story was made from, under its cover: the page's own language
 * first, and a switch to the other cut when there is one (StoryVideoPlayer).
 *
 * `preload="none"`: the files are 15–25 MB, and a reader who never presses
 * play should not pay for one. The poster (the reel's DID YOU KNOW? card) is
 * all that loads, at the 828-wide size, which is plenty for a phone-width
 * player. `playsInline` keeps iOS from jumping to fullscreen on play.
 */
export function StoryVideo({
  videos,
  heading,
  note,
  fallback,
  switchLabel,
}: {
  /** One per language, the page's own first. */
  videos: Video[]
  heading: string
  note: string
  fallback: string
  switchLabel: string
}) {
  const cuts: VideoCut[] = videos.map((video) => {
    const poster = video.poster && typeof video.poster === 'object' ? (video.poster as Media) : null
    return {
      language: video.language as Lang,
      url: video.url ?? '',
      posterUrl: poster?.sizes?.card?.url ?? poster?.url ?? undefined,
      credits: video.credits,
    }
  })
  if (!cuts.length) return null
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
      <StoryVideoPlayer cuts={cuts} heading={heading} note={note} fallback={fallback} switchLabel={switchLabel} />
    </section>
  )
}
