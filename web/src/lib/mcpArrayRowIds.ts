import type { Config } from 'payload'

type SchemaHook = NonNullable<NonNullable<Config['typescript']>['schema']>[number]
type JSONSchema4 = Parameters<SchemaHook>[0]['jsonSchema']

/**
 * Lets the MCP update tools take an array row's `id`.
 *
 * A localized field inside an array row (a story-poll option's `title`, say)
 * keeps one value per locale on the same row. Writing English onto an existing
 * row therefore has to name the row by its `id`; send the rows without ids and
 * Payload rebuilds the array, and the Spanish text on the old rows is gone.
 *
 * The MCP plugin builds each tool's input schema from Payload's JSON schema,
 * and on the way it deletes `properties.id` from every object it walks into —
 * the document's own id, but also every array row's. Array rows are
 * `additionalProperties: false`, so the row `id` became an unknown key and the
 * update was refused ("Unrecognized key(s) in object: 'id'").
 *
 * Blocks never had the problem: their rows sit under a `oneOf`, which the
 * plugin's clean-up does not walk into, so block ids have always worked. This
 * gives array rows the same shape — `items: { oneOf: [row] }`. The plugin still
 * simplifies relationship fields inside the row (it turns the `oneOf` into an
 * `anyOf` and walks the option), and a one-option `anyOf` becomes the row
 * schema itself, so the tool sees exactly the row it saw before, now with an
 * optional `id`. `id` is never required, so a create without ids still works.
 * The generated TypeScript types do not change (a one-option `oneOf` is just
 * that type).
 */
export function keepArrayRowIds(schema: JSONSchema4): JSONSchema4 {
  for (const definition of Object.values(schema.definitions ?? {})) walk(definition)
  return schema
}

function isRowSchema(items: unknown): items is JSONSchema4 {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return false
  const row = items as JSONSchema4
  return row.type === 'object' && !!row.properties?.id && !row.oneOf && !row.anyOf && !row.$ref
}

function walk(node: unknown): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child)
    return
  }
  const schema = node as JSONSchema4
  // Children first, so rows nested in rows are wrapped too.
  for (const value of Object.values(schema)) walk(value)
  const isArray = schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'))
  if (isArray && isRowSchema(schema.items)) schema.items = { oneOf: [schema.items] }
}
