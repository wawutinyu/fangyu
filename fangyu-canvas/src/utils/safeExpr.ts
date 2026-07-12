/** Safe expression evaluator — AST whitelist, no eval()/Function(). Mirrors engine/safe_expr.py. */

export class SafeExprError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SafeExprError'
  }
}

type Context = Record<string, unknown>

const SAFE_FUNCS: Record<string, (...args: unknown[]) => unknown> = {
  len: (v) => (v as { length?: number }).length ?? (Array.isArray(v) ? v.length : 0),
  str: (v) => String(v),
  int: (v) => parseInt(String(v), 10),
  float: (v) => parseFloat(String(v)),
  bool: (v) => Boolean(v),
  min: (...args) => Math.min(...(args as number[])),
  max: (...args) => Math.max(...(args as number[])),
  sum: (v) => (Array.isArray(v) ? (v as number[]).reduce((a, b) => a + b, 0) : 0),
  sorted: (v) => [...(v as unknown[])].sort(),
  abs: (v) => Math.abs(Number(v)),
  round: (v) => Math.round(Number(v)),
}

type Node =
  | { kind: 'const'; value: unknown }
  | { kind: 'name'; id: string }
  | { kind: 'list'; elts: Node[] }
  | { kind: 'dict'; entries: [Node, Node][] }
  | { kind: 'unary'; op: 'not' | 'u+' | 'u-'; arg: Node }
  | { kind: 'binop'; op: string; left: Node; right: Node }
  | { kind: 'compare'; left: Node; ops: string[]; comparators: Node[] }
  | { kind: 'boolop'; op: 'and' | 'or'; values: Node[] }
  | { kind: 'ifexp'; test: Node; body: Node; orelse: Node }
  | { kind: 'call'; func: string; args: Node[] }
  | { kind: 'subscript'; value: Node; slice: Node }
  | { kind: 'attribute'; value: Node; attr: string }

class Tokenizer {
  private i = 0
  constructor(private src: string) {}

  peek(): string { return this.src[this.i] ?? '' }

  peekNext(skip = 1): string {
    let j = this.i
    while (skip > 0 && j < this.src.length) {
      if (!/\s/.test(this.src[j])) skip--
      j++
    }
    while (j < this.src.length && /\s/.test(this.src[j])) j++
    return this.src[j] ?? ''
  }
  advance(): string { return this.src[this.i++] ?? '' }

  skipWs() {
    while (/\s/.test(this.peek())) this.advance()
  }

  readWord(): string {
    let w = ''
    while (/[A-Za-z0-9_]/.test(this.peek())) w += this.advance()
    return w
  }

  readNumber(): string {
    let n = ''
    while (/[0-9.]/.test(this.peek())) n += this.advance()
    return n
  }

  readString(quote: string): string {
    this.advance()
    let s = ''
    while (this.peek() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance()
        const esc = this.advance()
        s += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc
      } else {
        s += this.advance()
      }
    }
    if (this.peek() === quote) this.advance()
    return s
  }

  next(): { type: string; value: string } {
    this.skipWs()
    const c = this.peek()
    if (!c) return { type: 'EOF', value: '' }
    if (/[0-9]/.test(c)) return { type: 'NUMBER', value: this.readNumber() }
    if (/[A-Za-z_]/.test(c)) {
      const w = this.readWord()
      if (w === 'True' || w === 'False' || w === 'None') return { type: w, value: w }
      if (w === 'and') return { type: 'AND', value: w }
      if (w === 'or') return { type: 'OR', value: w }
      if (w === 'not') return { type: 'NOT', value: w }
      if (w === 'in') return { type: 'IN', value: w }
      if (w === 'is') return { type: 'IS', value: w }
      return { type: 'NAME', value: w }
    }
    if (c === '"' || c === "'") return { type: 'STRING', value: this.readString(c) }
    if (c === '(') { this.advance(); return { type: 'LPAREN', value: '(' } }
    if (c === ')') { this.advance(); return { type: 'RPAREN', value: ')' } }
    if (c === '[') { this.advance(); return { type: 'LBRACK', value: '[' } }
    if (c === ']') { this.advance(); return { type: 'RBRACK', value: ']' } }
    if (c === '{') { this.advance(); return { type: 'LBRACE', value: '{' } }
    if (c === '}') { this.advance(); return { type: 'RBRACE', value: '}' } }
    if (c === ',') { this.advance(); return { type: 'COMMA', value: ',' } }
    if (c === ':') { this.advance(); return { type: 'COLON', value: ':' } }
    const two = c + (this.src[this.i + 1] ?? '')
    const OPS = ['==', '!=', '<=', '>=', '//', '**', '<<', '>>']
    if (OPS.includes(two)) { this.i += 2; return { type: 'OP', value: two } }
    if (c === '<' || c === '>' || c === '=' || c === '!' || c === '+' || c === '-' || c === '*' || c === '/' || c === '%') {
      this.advance()
      return { type: 'OP', value: c }
    }
    throw new SafeExprError(`unexpected char: ${c}`)
  }
}

class Parser {
  private cur: { type: string; value: string }
  constructor(private tok: Tokenizer) {
    this.cur = tok.next()
  }

  eat(type?: string, value?: string) {
    if (type && this.cur.type !== type) throw new SafeExprError(`expected ${type}, got ${this.cur.type}`)
    if (value && this.cur.value !== value) throw new SafeExprError(`expected ${value}`)
    const t = this.cur
    this.cur = this.tok.next()
    return t
  }

  parse(): Node {
    const n = this.parseIfExp()
    if (this.cur.type !== 'EOF') throw new SafeExprError('trailing tokens')
    return n
  }

  parseIfExp(): Node {
    let n = this.parseOr()
    if (this.cur.type === 'NAME' && this.cur.value === 'if') {
      this.eat('NAME', 'if')
      const test = this.parseOr()
      this.eat('NAME', 'else')
      const orelse = this.parseIfExp()
      return { kind: 'ifexp', test, body: n, orelse }
    }
    return n
  }

  parseOr(): Node {
    let n = this.parseAnd()
    while (this.cur.type === 'OR') {
      this.eat('OR')
      n = { kind: 'boolop', op: 'or', values: [n, this.parseAnd()] }
    }
    return n
  }

  parseAnd(): Node {
    let n = this.parseNot()
    while (this.cur.type === 'AND') {
      this.eat('AND')
      n = { kind: 'boolop', op: 'and', values: [n, this.parseNot()] }
    }
    return n
  }

  parseNot(): Node {
    if (this.cur.type === 'NOT') {
      this.eat('NOT')
      return { kind: 'unary', op: 'not', arg: this.parseNot() }
    }
    return this.parseCompare()
  }

  parseCompare(): Node {
    let n = this.parseAdd()
    const ops: string[] = []
    const comps: Node[] = []
    for (;;) {
      if (this.cur.type === 'OP' && ['<', '<=', '>', '>=', '==', '!='].includes(this.cur.value)) {
        ops.push(this.eat('OP').value)
        comps.push(this.parseAdd())
      } else if (this.cur.type === 'IN') {
        this.eat('IN')
        ops.push('in')
        comps.push(this.parseAdd())
      } else if (this.cur.type === 'NOT') {
        this.eat('NOT')
        if (this.cur.type !== 'IN') throw new SafeExprError('expected in after not')
        this.eat('IN')
        ops.push('not in')
        comps.push(this.parseAdd())
      } else if (this.cur.type === 'IS') {
        this.eat('IS')
        if (this.cur.type === 'NOT') {
          this.eat('NOT')
          ops.push('is not')
        } else {
          ops.push('is')
        }
        comps.push(this.parseAdd())
      } else break
    }
    if (ops.length) return { kind: 'compare', left: n, ops, comparators: comps }
    return n
  }

  parseAdd(): Node {
    let n = this.parseMul()
    while (this.cur.type === 'OP' && ['+', '-'].includes(this.cur.value)) {
      const op = this.eat('OP').value
      n = { kind: 'binop', op, left: n, right: this.parseMul() }
    }
    return n
  }

  parseMul(): Node {
    let n = this.parseUnary()
    while (this.cur.type === 'OP' && ['*', '/', '//', '%'].includes(this.cur.value)) {
      const op = this.eat('OP').value
      n = { kind: 'binop', op, left: n, right: this.parseUnary() }
    }
    return n
  }

  parseUnary(): Node {
    if (this.cur.type === 'OP' && ['+', '-'].includes(this.cur.value)) {
      const op = this.eat('OP').value === '+' ? 'u+' : 'u-'
      return { kind: 'unary', op, arg: this.parseUnary() }
    }
    return this.parsePower()
  }

  parsePower(): Node {
    let n = this.parseAtom()
    if (this.cur.type === 'OP' && this.cur.value === '**') {
      this.eat('OP', '**')
      n = { kind: 'binop', op: '**', left: n, right: this.parseUnary() }
    }
    return n
  }

  parseAtom(): Node {
    if (this.cur.type === 'NUMBER') {
      const v = this.eat('NUMBER').value
      return { kind: 'const', value: v.includes('.') ? parseFloat(v) : parseInt(v, 10) }
    }
    if (this.cur.type === 'STRING') return { kind: 'const', value: this.eat('STRING').value }
    if (this.cur.type === 'True') { this.eat('True'); return { kind: 'const', value: true } }
    if (this.cur.type === 'False') { this.eat('False'); return { kind: 'const', value: false } }
    if (this.cur.type === 'None') { this.eat('None'); return { kind: 'const', value: null } }
    if (this.cur.type === 'NAME') return this.parseTrailers({ kind: 'name', id: this.eat('NAME').value })
    if (this.cur.type === 'LPAREN') {
      this.eat('LPAREN')
      const n = this.parseIfExp()
      this.eat('RPAREN')
      return this.parseTrailers(n)
    }
    if (this.cur.type === 'LBRACK') {
      this.eat('LBRACK')
      const elts: Node[] = []
      if (this.cur.type !== 'RBRACK') {
        elts.push(this.parseIfExp())
        while (this.cur.type === 'COMMA') {
          this.eat('COMMA')
          if (this.cur.type === 'RBRACK') break
          elts.push(this.parseIfExp())
        }
      }
      this.eat('RBRACK')
      return this.parseTrailers({ kind: 'list', elts })
    }
    if (this.cur.type === 'LBRACE') {
      this.eat('LBRACE')
      const entries: [Node, Node][] = []
      if (this.cur.type !== 'RBRACE') {
        const k = this.parseIfExp()
        this.eat('COLON')
        entries.push([k, this.parseIfExp()])
        while (this.cur.type === 'COMMA') {
          this.eat('COMMA')
          if (this.cur.type === 'RBRACE') break
          const k2 = this.parseIfExp()
          this.eat('COLON')
          entries.push([k2, this.parseIfExp()])
        }
      }
      this.eat('RBRACE')
      return this.parseTrailers({ kind: 'dict', entries })
    }
    throw new SafeExprError(`unexpected token ${this.cur.type}`)
  }

  parseTrailers(base: Node): Node {
    let n = base
    for (;;) {
      if (this.cur.type === 'LBRACK') {
        this.eat('LBRACK')
        const sl = this.parseIfExp()
        this.eat('RBRACK')
        n = { kind: 'subscript', value: n, slice: sl }
      } else if (this.cur.type === 'OP' && this.cur.value === '.') {
        this.eat('OP', '.')
        n = { kind: 'attribute', value: n, attr: this.eat('NAME').value }
      } else if (this.cur.type === 'LPAREN') {
        this.eat('LPAREN')
        const args: Node[] = []
        if (this.cur.type !== 'RPAREN') {
          args.push(this.parseIfExp())
          while (this.cur.type === 'COMMA') {
            this.eat('COMMA')
            if (this.cur.type === 'RPAREN') break
            args.push(this.parseIfExp())
          }
        }
        this.eat('RPAREN')
        if (n.kind === 'name') {
          n = { kind: 'call', func: n.id, args }
        } else {
          throw new SafeExprError('only simple calls allowed')
        }
      } else break
    }
    return n
  }
}

function evalNode(node: Node, ctx: Context, numericOnly: boolean): unknown {
  switch (node.kind) {
    case 'const':
      if (numericOnly && typeof node.value !== 'number') throw new SafeExprError('numeric_only')
      return node.value
    case 'name':
      if (numericOnly) throw new SafeExprError('numeric_only')
      if (!(node.id in ctx)) throw new SafeExprError(`undefined name: ${node.id}`)
      return ctx[node.id]
    case 'list':
      if (numericOnly) throw new SafeExprError('numeric_only')
      return node.elts.map(e => evalNode(e, ctx, numericOnly))
    case 'dict': {
      if (numericOnly) throw new SafeExprError('numeric_only')
      const d: Record<string, unknown> = {}
      for (const [k, v] of node.entries) d[String(evalNode(k, ctx, numericOnly))] = evalNode(v, ctx, numericOnly)
      return d
    }
    case 'unary': {
      const v = evalNode(node.arg, ctx, numericOnly)
      if (node.op === 'not') return !v
      if (node.op === 'u+') return +Number(v)
      return -Number(v)
    }
    case 'binop': {
      const l = evalNode(node.left, ctx, numericOnly)
      const r = evalNode(node.right, ctx, numericOnly)
      switch (node.op) {
        case '+': return (l as number) + (r as number)
        case '-': return (l as number) - (r as number)
        case '*': return (l as number) * (r as number)
        case '/': return (l as number) / (r as number)
        case '//': return Math.floor((l as number) / (r as number))
        case '%': return (l as number) % (r as number)
        case '**': return (l as number) ** (r as number)
        default: throw new SafeExprError(`unsupported op: ${node.op}`)
      }
    }
    case 'compare': {
      let left = evalNode(node.left, ctx, numericOnly)
      for (let i = 0; i < node.ops.length; i++) {
        const right = evalNode(node.comparators[i], ctx, numericOnly)
        const op = node.ops[i]
        let ok = false
        if (op === '==') ok = left === right
        else if (op === '!=') ok = left !== right
        else if (op === '<') ok = (left as number) < (right as number)
        else if (op === '<=') ok = (left as number) <= (right as number)
        else if (op === '>') ok = (left as number) > (right as number)
        else if (op === '>=') ok = (left as number) >= (right as number)
        else if (op === 'in') ok = (right as unknown[] | string).includes?.(left as never) ?? false
        else if (op === 'not in') ok = !((right as unknown[] | string).includes?.(left as never) ?? false)
        else if (op === 'is') ok = left === right
        else if (op === 'is not') ok = left !== right
        else throw new SafeExprError(`unsupported compare: ${op}`)
        if (!ok) return false
        left = right
      }
      return true
    }
    case 'boolop': {
      if (node.op === 'and') {
        let val = evalNode(node.values[0], ctx, numericOnly)
        for (let i = 1; i < node.values.length; i++) {
          if (!val) return val
          val = evalNode(node.values[i], ctx, numericOnly)
        }
        return val
      }
      let val = evalNode(node.values[0], ctx, numericOnly)
      for (let i = 1; i < node.values.length; i++) {
        if (val) return val
        val = evalNode(node.values[i], ctx, numericOnly)
      }
      return val
    }
    case 'ifexp':
      return evalNode(node.test, ctx, numericOnly) ? evalNode(node.body, ctx, numericOnly) : evalNode(node.orelse, ctx, numericOnly)
    case 'call': {
      const fn = SAFE_FUNCS[node.func]
      if (!fn) throw new SafeExprError(`function not allowed: ${node.func}`)
      return fn(...node.args.map(a => evalNode(a, ctx, numericOnly)))
    }
    case 'subscript': {
      if (numericOnly) throw new SafeExprError('numeric_only')
      const obj = evalNode(node.value, ctx, numericOnly) as Record<string | number, unknown>
      const key = evalNode(node.slice, ctx, numericOnly)
      return obj[key as string | number]
    }
    case 'attribute': {
      if (numericOnly) throw new SafeExprError('numeric_only')
      const obj = evalNode(node.value, ctx, numericOnly)
      if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[node.attr]
      return (obj as Record<string, unknown>)?.[node.attr]
    }
    default:
      throw new SafeExprError('unsupported node')
  }
}

export function safeEval(expr: string, context: Context = {}, options?: { numericOnly?: boolean }): unknown {
  const trimmed = (expr || '').trim()
  if (!trimmed) throw new SafeExprError('empty expression')
  const ast = new Parser(new Tokenizer(trimmed)).parse()
  return evalNode(ast, context, options?.numericOnly ?? false)
}

export function safeEvalBool(expr: string, context: Context = {}, defaultValue = false): boolean {
  try {
    return Boolean(safeEval(expr, context))
  } catch {
    return defaultValue
  }
}

export function safeEvalInt(expr: string, context: Context = {}, defaultValue = 0): number {
  try {
    return parseInt(String(safeEval(expr, context)), 10)
  } catch {
    return defaultValue
  }
}

export function safeCalc(expr: string): number {
  return Number(safeEval((expr || '0').trim(), {}, { numericOnly: true }))
}
