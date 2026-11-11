// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { configToJSONSchema, createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import config from '@/payload.config'
import { keepArrayRowIds } from '@/lib/mcpArrayRowIds'
import type { StoryPoll, User } from '@/payload-types'

// The plugin's own schema conversion and update tool, exactly as the MCP
// endpoint runs them. The package exports only its entry, so by path.
import { convertCollectionSchemaToZod } from '../../node_modules/@payloadcms/plugin-mcp/dist/utils/schemaConversion/convertCollectionSchemaToZod.js'
import { updateResourceTool } from '../../node_modules/@payloadcms/plugin-mcp/dist/mcp/tools/resource/update.js'

/**
 * Array rows keep their `id` in the MCP tools (lib/mcpArrayRowIds.ts), so a
 * story-poll option's English title can be written onto the same row as its
 * Spanish one instead of rebuilding the array and losing the Spanish.
 */

type Shape = Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: unknown } }>

describe('the JSON schema hook', () => {
  it('wraps array rows like block rows, nested ones too, and leaves the rest alone', () => {
    const row = (props: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties: { id: { type: ['string', 'null'] }, ...props } })
    const schema = {
      definitions: {
        thing: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            rows: { type: ['array', 'null'], items: row({ inner: { type: 'array', items: row({ n: { type: 'number' } }) } }) },
            blocks: { type: 'array', items: { oneOf: [row({ blockType: { const: 'a' } })] } },
            tags: { type: 'array', items: { type: 'string' } },
            items: { type: 'object', properties: { id: { type: 'string' } } },
          },
        },
      },
    }
    const out = keepArrayRowIds(JSON.parse(JSON.stringify(schema))) as typeof schema
    const props = out.definitions.thing.properties as Record<string, { items?: { oneOf?: { properties: Record<string, { items?: unknown }> }[] } }>
    expect(props.rows.items?.oneOf).toHaveLength(1)
    expect(props.rows.items?.oneOf?.[0].properties.inner.items).toEqual({ oneOf: [row({ n: { type: 'number' } })] })
    expect(props.blocks).toEqual(schema.definitions.thing.properties.blocks)
    expect(props.tags).toEqual(schema.definitions.thing.properties.tags)
    expect(props.items).toEqual(schema.definitions.thing.properties.items)
  })
})

describe('MCP tool schemas', () => {
  let payload: Payload
  let schema: ReturnType<typeof configToJSONSchema>

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // What the MCP endpoint builds (getMcpHandler).
    schema = configToJSONSchema(payload.config, payload.db.defaultIDType, undefined, { forceInlineBlocks: true })
  })

  const toolShape = (slug: string) => (convertCollectionSchemaToZod(schema.definitions![slug] as never) as unknown as { shape: Shape }).shape

  it('takes a story-poll option’s row id on update, and keeps it', () => {
    const options = toolShape('story-polls').options
    const sent = [{ id: '6af4c0de00000000000000aa', key: 'jack-tigertail', title: 'Jack Tigertail', teaser: 'The last chief.' }]
    const parsed = options.safeParse(sent)
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true)
    expect(parsed.data).toEqual(sent)
  })

  it('still creates options without ids, and still refuses keys that are not fields', () => {
    const options = toolShape('story-polls').options
    expect(options.safeParse([{ key: 'jack-tigertail', title: 'Jack', image: 4, commentVotes: 2 }]).success).toBe(true)
    expect(options.safeParse([{ key: 'jack-tigertail', title: 'Jack', nope: 1 }]).success).toBe(false)
  })

  it('takes row ids in other arrays too (the link page’s sections and their buttons)', () => {
    const sections = toolShape('link-page').sections
    const parsed = sections.safeParse([{ id: 'sec-1', emoji: '⭐', titleEs: 'Hola', titleEn: 'Hi', buttons: [{ id: 'btn-1', labelEs: 'Ir', labelEn: 'Go', kind: 'link', url: '/events' }] }])
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true)
  })

  it('builds a real (strict) schema for every collection and global, never the permissive fallback', () => {
    for (const slug of [...payload.config.collections.map((c) => c.slug), ...payload.config.globals.map((g) => g.slug)]) {
      expect(typeof (convertCollectionSchemaToZod(schema.definitions![slug] as never) as unknown as { shape?: unknown }).shape, slug).toBe('object')
    }
  })
})

describe('updateStoryPolls over MCP', () => {
  let payload: Payload
  let user: User
  let req: PayloadRequest
  let pollId: number
  let handler: (params: Record<string, unknown>) => Promise<{ content: { text: string }[] }>
  let shape: Shape

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    user = await payload.create({
      collection: 'users',
      data: { email: `mcp-rows-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    req = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    req.payloadAPI = 'MCP'
    const poll = await payload.create({
      collection: 'story-polls',
      locale: 'es',
      data: {
        slug: `mcp-rows-${Date.now()}`,
        title: 'Tú escoges',
        question: '¿Cuál?',
        opensAt: '2026-11-11T05:00:00.000Z',
        closesAt: '2026-11-16T04:59:00.000Z',
        options: [
          { key: 'jack-tigertail', title: 'Jack Tigertail ES', teaser: 'El último jefe.', commentVotes: 3 },
          { key: 'carol-city', title: 'Carol City ES', teaser: 'El barrio.' },
        ],
      },
      overrideAccess: true,
    })
    pollId = poll.id
    const configSchema = configToJSONSchema(payload.config, payload.db.defaultIDType, undefined, { forceInlineBlocks: true })
    const server = {
      registerTool: (_name: string, def: { inputSchema: Shape }, fn: typeof handler) => {
        shape = def.inputSchema
        handler = fn
      },
    } as unknown as McpServer
    updateResourceTool(server, req, user as never, false, 'story-polls', { 'story-polls': { enabled: { update: true } } }, configSchema.definitions!['story-polls'] as never)
  })

  afterAll(async () => {
    if (!payload) return
    if (pollId) await payload.delete({ collection: 'story-polls', id: pollId, overrideAccess: true }).catch(() => undefined)
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  /** Validate every argument the way the MCP SDK does, then call the tool. */
  const call = async (args: Record<string, unknown>) => {
    const params: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(shape)) {
      const parsed = field.safeParse(args[key])
      if (!parsed.success) throw new Error(`Input validation error at ${key}: ${JSON.stringify(parsed.error)}`)
      if (parsed.data !== undefined) params[key] = parsed.data
    }
    for (const key of Object.keys(args)) if (!(key in shape)) throw new Error(`Unrecognized key ${key}`)
    return handler(params)
  }

  it('adds English option titles on the same rows, and the Spanish stays', async () => {
    const es = await payload.findByID({ collection: 'story-polls', id: pollId, locale: 'es', draft: true, overrideAccess: true })
    const [jack, carol] = es.options!

    const res = await call({
      id: pollId,
      locale: 'en',
      draft: true,
      options: [
        { id: jack.id, key: jack.key, title: 'Jack Tigertail EN', teaser: 'The last chief.' },
        { id: carol.id, key: carol.key, title: 'Carol City EN', teaser: 'The neighborhood.' },
      ],
    })
    expect(res.content[0].text).toContain('updated successfully')

    const read = (locale: 'es' | 'en') =>
      payload.findByID({ collection: 'story-polls', id: pollId, locale, fallbackLocale: false, draft: true, overrideAccess: true }) as Promise<StoryPoll>
    const [afterEs, afterEn] = [await read('es'), await read('en')]
    expect(afterEs.options!.map((o) => [o.id, o.title, o.teaser])).toEqual([
      [jack.id, 'Jack Tigertail ES', 'El último jefe.'],
      [carol.id, 'Carol City ES', 'El barrio.'],
    ])
    expect(afterEn.options!.map((o) => [o.id, o.title, o.teaser])).toEqual([
      [jack.id, 'Jack Tigertail EN', 'The last chief.'],
      [carol.id, 'Carol City EN', 'The neighborhood.'],
    ])
    // Shared fields left out of the rows: say what happens to them.
    expect(afterEs.options![0].commentVotes).toBe(3)
  })
})
