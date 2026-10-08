import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { civicMcpServer, MCP_INSTRUCTIONS } from '../../lib/civicMcp'
import { TOOL_NAMES } from '../../lib/civicApi'
import { API_HEADERS, clientKey, json, notReadyResponse, preflight, rateLimit, tooMany } from '../../lib/civicApiHttp'
import { civicCurrent } from '../../lib/civicStatus'
import { absUrl } from '../../lib/site'

/**
 * The public civic MCP server, Streamable HTTP, stateless, no auth:
 * https://flamingocounty.com/mcp. (Payload's private HQ server is
 * /api/mcp; this is a different route and shares nothing with it.)
 *
 * Each POST gets a fresh server and transport and answers in plain JSON. Tool
 * calls are rate-limited per client and tool, and answer 503 while the
 * address database is being built. Nothing about a request is logged.
 */
export const dynamic = 'force-dynamic'

type Rpc = { method?: string; params?: { name?: string } }

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }, 400)
  }
  const messages = (Array.isArray(body) ? body : [body]) as Rpc[]
  const client = clientKey(req)
  // The whole endpoint has a ceiling too, so listing and initializing can't be used to hammer it.
  const waitAll = rateLimit(client, 'mcp', Date.now(), 300)
  if (waitAll) return tooMany(waitAll)
  for (const m of messages) {
    if (m?.method !== 'tools/call') continue
    if (!civicCurrent()) return notReadyResponse()
    const tool = String(m.params?.name ?? '')
    const wait = rateLimit(client, (TOOL_NAMES as readonly string[]).includes(tool) ? tool : 'unknown')
    if (wait) return tooMany(wait)
  }

  const server = civicMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  const res = await transport.handleRequest(req, { parsedBody: body })
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(API_HEADERS)) headers.set(k, v)
  // The answer is complete once handleRequest returns (JSON mode): free the server.
  void server.close()
  return new Response(res.body, { status: res.status, headers })
}

/**
 * GET: this server keeps no stream to resume. A browser (or a curious agent)
 * gets a description instead of an error.
 */
export async function GET() {
  return json({
    name: 'flamingo-county-civic',
    transport: 'streamable-http',
    url: absUrl('/mcp'),
    auth: 'none',
    tools: TOOL_NAMES,
    openapi: absUrl('/api/civic/v1/openapi.json'),
    about: absUrl('/en/ai'),
    instructions: MCP_INSTRUCTIONS,
  })
}

export async function DELETE() {
  return json({ jsonrpc: '2.0', error: { code: -32000, message: 'Stateless server: there is no session to end.' }, id: null }, 405)
}

export const OPTIONS = preflight
