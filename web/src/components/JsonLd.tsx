/**
 * Emits one schema.org object as JSON-LD. Server component — the script is in
 * the initial HTML, which is what crawlers read.
 *
 * `<` is escaped so a stored string containing `</script>` cannot end the tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
