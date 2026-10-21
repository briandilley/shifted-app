/**
 * Reads every `webPreferences` object in `src/` and fails on an unsafe value. See
 * "Security" in `docs/spec/BUILD.md`.
 *
 * The test parses the TypeScript sources. It finds:
 *
 * - each property `webPreferences: …` (for example in `new BrowserWindow({ … })`), and
 * - each function whose return type is `WebPreferences`.
 *
 * A `webPreferences` value must be an object literal or a call of such a function. Each
 * object, also inside a spread such as `...(test ? { … } : {})`, must not have an unsafe
 * value, and the object that a window or a view gets must turn on the sandbox and context
 * isolation and turn off Node.js. Each `new BrowserWindow` and `new WebContentsView` must
 * name its `webPreferences`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '../..')
const SRC = join(ROOT, 'src')

/** The values that make a page unsafe. A key with another value is fine. */
const UNSAFE_VALUES: Readonly<Record<string, boolean>> = {
  nodeIntegration: true,
  nodeIntegrationInWorker: true,
  contextIsolation: false,
  sandbox: false,
  webSecurity: false,
  allowRunningInsecureContent: true,
  webviewTag: true,
  experimentalFeatures: true
}

/** The values that each window and view must set itself. */
const REQUIRED_VALUES: Readonly<Record<string, boolean>> = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false
}

/** Keys that must never show up, whatever their value. */
const FORBIDDEN_KEYS = ['enableBlinkFeatures', 'disableBlinkFeatures']

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
  })
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(ROOT, path),
  source: ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
}))

function forEachNode(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  node.forEachChild((child) => forEachNode(child, visit))
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined
}

/** The functions in `src/` whose return type is `WebPreferences`, by name. */
function webPreferenceFunctions(): Map<string, { path: string; node: ts.FunctionDeclaration }> {
  const functions = new Map<string, { path: string; node: ts.FunctionDeclaration }>()
  for (const { path, source } of files) {
    forEachNode(source, (node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.type?.getText(source) === 'WebPreferences'
      ) {
        functions.set(node.name.text, { path, node })
      }
    })
  }
  return functions
}

/** The value of an expression, without parentheses and `as` casts. */
function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)) {
    current = current.expression
  }
  return current
}

/** The object literals that a spread or a return value can give: both sides of `? :`. */
function objectLiterals(expression: ts.Expression): ts.ObjectLiteralExpression[] | undefined {
  const value = unwrap(expression)
  if (ts.isObjectLiteralExpression(value)) return [value]
  if (ts.isConditionalExpression(value)) {
    const whenTrue = objectLiterals(value.whenTrue)
    const whenFalse = objectLiterals(value.whenFalse)
    return whenTrue && whenFalse ? [...whenTrue, ...whenFalse] : undefined
  }
  return undefined
}

interface Finding {
  where: string
  problem: string
}

/**
 * Check one `webPreferences` object literal and the objects that it spreads.
 *
 * @returns The keys with a literal `true` or `false` that the object sets on every path.
 */
function checkObject(
  object: ts.ObjectLiteralExpression,
  where: string,
  findings: Finding[]
): Map<string, boolean> {
  const values = new Map<string, boolean>()
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = objectLiterals(property.expression)
      if (!spread) {
        findings.push({ where, problem: `spread that the test cannot read: ${property.getText()}` })
        continue
      }
      for (const inner of spread) checkObject(inner, where, findings)
      continue
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      findings.push({ where, problem: `shorthand property ${property.name.text}` })
      continue
    }
    if (!ts.isPropertyAssignment(property)) continue
    const key = propertyName(property.name)
    if (key === undefined) continue
    if (FORBIDDEN_KEYS.includes(key)) findings.push({ where, problem: `${key} is set` })
    const value = unwrap(property.initializer)
    const literal =
      value.kind === ts.SyntaxKind.TrueKeyword
        ? true
        : value.kind === ts.SyntaxKind.FalseKeyword
          ? false
          : undefined
    if (key in UNSAFE_VALUES) {
      if (literal === undefined) {
        findings.push({ where, problem: `${key} is not a literal true or false` })
      } else if (literal === UNSAFE_VALUES[key]) {
        findings.push({ where, problem: `${key}: ${String(literal)}` })
      }
    }
    if (literal !== undefined) values.set(key, literal)
  }
  return values
}

/** Check that the values that every window and view needs are there. */
function checkRequired(values: Map<string, boolean>, where: string, findings: Finding[]): void {
  for (const [key, wanted] of Object.entries(REQUIRED_VALUES)) {
    if (values.get(key) !== wanted) {
      findings.push({ where, problem: `${key} must be ${String(wanted)}` })
    }
  }
}

/** Check the object that each return statement of a `WebPreferences` function gives. */
function checkFunction(
  name: string,
  path: string,
  node: ts.FunctionDeclaration,
  findings: Finding[]
): void {
  const where = `${path}: ${name}()`
  let returns = 0
  forEachNode(node, (child) => {
    if (!ts.isReturnStatement(child) || !child.expression) return
    returns += 1
    const objects = objectLiterals(child.expression)
    if (!objects) {
      findings.push({ where, problem: 'returns a value that is not an object literal' })
      return
    }
    for (const object of objects)
      checkRequired(checkObject(object, where, findings), where, findings)
  })
  if (returns === 0) findings.push({ where, problem: 'returns nothing' })
}

/** Every `webPreferences` property in `src/`, and every window or view with none. */
function checkProperties(
  functions: Map<string, { path: string; node: ts.FunctionDeclaration }>,
  findings: Finding[]
): number {
  let count = 0
  for (const { path, source } of files) {
    forEachNode(source, (node) => {
      if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'webPreferences') {
        count += 1
        const where = `${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
        const value = unwrap(node.initializer)
        if (ts.isCallExpression(value) && ts.isIdentifier(value.expression)) {
          if (!functions.has(value.expression.text)) {
            findings.push({
              where,
              problem: `${value.expression.text}() is not a WebPreferences function`
            })
          }
          return
        }
        if (ts.isObjectLiteralExpression(value)) {
          checkRequired(checkObject(value, where, findings), where, findings)
          return
        }
        findings.push({
          where,
          problem: `webPreferences that the test cannot read: ${value.getText()}`
        })
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === 'BrowserWindow' || node.expression.text === 'WebContentsView')
      ) {
        const [options] = node.arguments ?? []
        const named =
          options !== undefined &&
          ts.isObjectLiteralExpression(unwrap(options)) &&
          (unwrap(options) as ts.ObjectLiteralExpression).properties.some(
            (property) =>
              property.name !== undefined &&
              ts.isPropertyName(property.name) &&
              propertyName(property.name) === 'webPreferences'
          )
        if (!named) {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
          findings.push({
            where: `${path}:${line}`,
            problem: `new ${node.expression.text} with no webPreferences`
          })
        }
      }
    })
  }
  return count
}

describe('webPreferences', () => {
  const functions = webPreferenceFunctions()

  it('finds the two functions that make the web preferences', () => {
    expect([...functions.keys()].sort()).toEqual([
      'googlePageWebPreferences',
      'shiftedScreenWebPreferences'
    ])
  })

  it('has no unsafe value in any webPreferences object in src/', () => {
    const findings: Finding[] = []
    for (const [name, { path, node }] of functions) checkFunction(name, path, node, findings)
    const properties = checkProperties(functions, findings)
    // The main window, the sign-in window and its view, the configuration window, the
    // account picker, the screen picker, the import window, the memory window, the Google
    // app views, and the child windows.
    expect(properties).toBeGreaterThanOrEqual(10)
    expect(findings).toEqual([])
  })

  it('has none of the unsafe values anywhere in src/', () => {
    const pattern =
      /\b(nodeIntegration\s*:\s*true|contextIsolation\s*:\s*false|sandbox\s*:\s*false|webSecurity\s*:\s*false|allowRunningInsecureContent\s*:\s*true|webviewTag\s*:\s*true)\b/
    const found = files.filter(({ source }) => pattern.test(source.text)).map(({ path }) => path)
    expect(found).toEqual([])
  })

  it('catches an unsafe value', () => {
    const source = ts.createSourceFile(
      'example.ts',
      'const options = { webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, ...(x ? { webSecurity: false } : {}) } }',
      ts.ScriptTarget.Latest,
      true
    )
    const findings: Finding[] = []
    forEachNode(source, (node) => {
      if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'webPreferences') {
        checkObject(node.initializer as ts.ObjectLiteralExpression, 'example', findings)
      }
    })
    expect(findings).toEqual([{ where: 'example', problem: 'webSecurity: false' }])
  })
})
