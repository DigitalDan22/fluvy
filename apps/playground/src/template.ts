import type { HassEntity } from '@fluvy/core';

/**
 * The corner of Jinja the playground answers `render_template` with, as Home Assistant would for the templates a
 * row's text and a template card are likely to carry: `states('x')`, `state_attr('x', 'a')`, `is_state('x', 'v')`,
 * the variables Fluvy hands over (`entity`, `user`), strings, numbers, `true`, `false` and `none`, `~` to join, the
 * arithmetic (`+`, `-`, `*`, `/`, `//`, a sign, parentheses: Mushroom's `(state_attr(entity, 'brightness') / 2.55) |
 * round(0)`), the comparisons (`==`, `!=`, `<`, `>`, `<=`, `>=`), `and`, `or` and `not`, the inline `a if b else c`,
 * the filters `round(n)`, `int`, `float`, `upper`, `lower`, `title` and `capitalize`, the house as lists (`states`,
 * `states.person`, a state's `.state`, `.entity_id`, `.name`, `.attributes.x`) and the filters a count of them is made
 * with (#87: `selectattr`, `rejectattr`, `select`, `reject` with Jinja's tests, `map(attribute='x')` and `map('f')`,
 * `list`, `count`, `length`, `unique`, `join`, `area_id`, `area_name`), inside `{{ … }}` with plain text around, and `{% if %}`, `{% elif %}`, `{% else %}`, `{% endif %}` round the text, each bound as Jinja binds it
 * (a filter tightest, then a sign, `*` `/` `//`, `~`, `+` `-`, the comparisons). Only what is chosen is worked out, as
 * Jinja does; a number is written as JavaScript writes it (`2`, where Python writes a division's `2.0`). A name the
 * template reads that is not defined is nothing, said as a warning, as Home Assistant says it under `strict: false`;
 * anything else is an error, as Home Assistant reports one. The rendered text is then stripped and read as Home
 * Assistant reads it: a number, True / False or None come back as such.
 */

export class TemplateError extends Error {}

/** What a template renders to, once the text has been read as Home Assistant reads it. */
export type Rendered = string | number | boolean | null;

/** A value in the template: undefined is Jinja's undefined, which writes nothing; null is None. */
type Value = unknown;

/** A part of an expression, parsed once and worked out when it is asked (an `else` branch not taken never is). */
type Thunk = () => Value;

/** An area as the registries say it: its id and its name. */
export interface AreaOf {
  readonly id: string;
  readonly name: string;
}

interface Scope {
  readonly states: Readonly<Record<string, HassEntity>>;
  readonly variables: Readonly<Record<string, unknown>>;
  /** Says a warning, as Home Assistant's `log_fn` does while it renders. */
  readonly warn: (message: string) => void;
  /** An entity's area (its own, else its device's), as `area_id` and `area_name` read it. */
  readonly areaOf: (entityId: string) => AreaOf | undefined;
}

interface Token {
  readonly kind: 'string' | 'number' | 'name' | 'punct';
  readonly text: string;
}

const TOKEN =
  /'([^']*)'|"([^"]*)"|(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|(==|!=|<=|>=|<|>|\/\/|[-+*/()|~,.=])/y;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < source.length) {
    if (/\s/.test(source[at] as string)) {
      at += 1;
      continue;
    }
    TOKEN.lastIndex = at;
    const match = TOKEN.exec(source);
    if (!match) throw new TemplateError(`unexpected '${source[at]}' in ${source.trim()}`);
    at = TOKEN.lastIndex;
    const [, single, double, number, name, punct] = match;
    const text = single ?? double;
    tokens.push(
      text !== undefined
        ? { kind: 'string', text }
        : number !== undefined
          ? { kind: 'number', text: number }
          : name !== undefined
            ? { kind: 'name', text: name }
            : { kind: 'punct', text: punct as string },
    );
  }
  return tokens;
}

/** A value as Jinja writes it into the text: undefined as nothing, None, True and False as Python says them. */
const str = (value: Value): string =>
  value === undefined
    ? ''
    : value === null
      ? 'None'
      : typeof value === 'boolean'
        ? value
          ? 'True'
          : 'False'
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);

/** Python's truth: nothing, none, false, 0, the empty text and the empty list are false. */
const truthy = (value: Value): boolean =>
  value !== undefined &&
  value !== null &&
  value !== false &&
  value !== 0 &&
  value !== '' &&
  !(Array.isArray(value) && !value.length);

/** A state as Jinja reads it: its own fields, and what Home Assistant's template state adds (`name`, `domain`). */
function field(value: Value, key: string): Value {
  if (value === null || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record['entity_id'] === 'string') {
    const id = record['entity_id'];
    const attributes = (record['attributes'] ?? {}) as Record<string, unknown>;
    if (key === 'domain') return id.slice(0, id.indexOf('.'));
    if (key === 'object_id') return id.slice(id.indexOf('.') + 1);
    if (key === 'name') return attributes['friendly_name'] ?? id;
  }
  return record[key];
}

/** A dotted path read through `field` (`attributes.device_class`). */
const path = (value: Value, dotted: string): Value =>
  dotted.split('.').reduce<Value>((at, key) => field(at, key), value);

/** The items of what a filter of lists is handed: a list, a text's letters, else an error as Jinja's. */
function itemsOf(value: Value): Value[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [...value];
  throw new TemplateError(`'${str(value)}' is not iterable`);
}

/** Jinja's tests, as `select`, `reject`, `selectattr` and `rejectattr` name them; none named is the item's truth. */
function test(name: Value, item: Value, against: Value): boolean {
  switch (name) {
    case undefined:
      return truthy(item);
    case 'eq':
    case 'equalto':
    case '==':
      return item === against;
    case 'ne':
    case '!=':
      return item !== against;
    case 'gt':
    case '>':
    case 'lt':
    case '<':
    case 'ge':
    case '>=':
    case 'le':
    case '<=': {
      const operator = { gt: '>', lt: '<', ge: '>=', le: '<=' }[String(name)] ?? String(name);
      return compare(operator, item, against);
    }
    case 'in':
      return itemsOf(against).includes(item);
    case 'none':
      return item === null;
    case 'defined':
      return item !== undefined;
    case 'undefined':
      return item === undefined;
    case 'search':
      return new RegExp(String(against)).test(String(item));
    case 'match':
      return new RegExp(`^(?:${String(against)})`).test(String(item));
  }
  throw new TemplateError(`No test named '${str(name)}'`);
}

/** The words that are values: Jinja writes them in lower case, Python's spelling is read too. */
const LITERALS: Readonly<Record<string, Value>> = {
  true: true,
  True: true,
  false: false,
  False: false,
  none: null,
  None: null,
};

/** Python's comparisons: equal across kinds is false, an order across kinds an error. */
function compare(operator: string, a: Value, b: Value): boolean {
  if (operator === '==') return a === b;
  if (operator === '!=') return a !== b;
  const comparable =
    (typeof a === 'number' && typeof b === 'number') ||
    (typeof a === 'string' && typeof b === 'string');
  if (!comparable)
    throw new TemplateError(`'${operator}' not supported between ${str(a)} and ${str(b)}`);
  const [x, y] = [a as number | string, b as number | string];
  return operator === '<' ? x < y : operator === '>' ? x > y : operator === '<=' ? x <= y : x >= y;
}

/**
 * Python's arithmetic on what the template hands it: numbers, and `+` joining two texts; anything else an error, as
 * Python's `TypeError` (`None / 2.55`, an attribute a light that is off does not have) and its division by zero are.
 */
function arithmetic(operator: string, a: Value, b: Value): number | string {
  if (operator === '+' && typeof a === 'string' && typeof b === 'string') return a + b;
  if (typeof a !== 'number' || typeof b !== 'number')
    throw new TemplateError(`unsupported operand type(s) for ${operator}: ${str(a)} and ${str(b)}`);
  if ((operator === '/' || operator === '//') && b === 0)
    throw new TemplateError('division by zero');
  return operator === '+'
    ? a + b
    : operator === '-'
      ? a - b
      : operator === '*'
        ? a * b
        : operator === '/'
          ? a / b
          : Math.floor(a / b);
}

/**
 * `or` over `and` over `not` over a comparison of sums (`+`, `-`) of `~`-joined products (`*`, `/`, `//`) of signed
 * operands, an operand being `atom ('|' filter)*`; the whole may be `a if b else c`. Each part is parsed into a thunk,
 * worked out only when its value is needed.
 */
class Parser {
  private at = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly scope: Scope,
  ) {}

  /** The whole expression: nothing may be left after it. */
  expression(): Thunk {
    const value = this.conditional();
    const left = this.tokens[this.at];
    if (left) throw new TemplateError(`unexpected '${left.text}'`);
    return value;
  }

  /** `a if b else c`; without its `else`, nothing when `b` is false. */
  private conditional(): Thunk {
    const value = this.or();
    if (!this.word('if')) return value;
    const test = this.or();
    const otherwise: Thunk = this.word('else') ? this.conditional() : () => undefined;
    return () => (truthy(test()) ? value() : otherwise());
  }

  private or(): Thunk {
    let left = this.and();
    while (this.word('or')) {
      const [a, b] = [left, this.and()];
      left = () => {
        const value = a();
        return truthy(value) ? value : b();
      };
    }
    return left;
  }

  private and(): Thunk {
    let left = this.not();
    while (this.word('and')) {
      const [a, b] = [left, this.not()];
      left = () => {
        const value = a();
        return truthy(value) ? b() : value;
      };
    }
    return left;
  }

  private not(): Thunk {
    if (!this.word('not')) return this.comparison();
    const value = this.not();
    return () => !truthy(value());
  }

  private comparison(): Thunk {
    let left = this.sum();
    for (let operator = this.operator(); operator; operator = this.operator()) {
      const [a, b, op] = [left, this.sum(), operator];
      left = () => compare(op, a(), b());
    }
    return left;
  }

  private sum(): Thunk {
    let left = this.concat();
    for (let op = this.among('+', '-'); op; op = this.among('+', '-')) {
      const [a, b, operator] = [left, this.concat(), op];
      left = () => arithmetic(operator, a(), b());
    }
    return left;
  }

  private concat(): Thunk {
    const parts = [this.product()];
    while (this.take('~')) parts.push(this.product());
    if (parts.length === 1) return parts[0] as Thunk;
    return () => parts.map((part) => str(part())).join('');
  }

  private product(): Thunk {
    let left = this.signed();
    for (let op = this.among('*', '/', '//'); op; op = this.among('*', '/', '//')) {
      const [a, b, operator] = [left, this.signed(), op];
      left = () => arithmetic(operator, a(), b());
    }
    return left;
  }

  /** A sign, then the operand's filters: Jinja filters what is signed (`-x | round` rounds `-x`). */
  private signed(filtered = true): Thunk {
    const sign = this.among('-', '+');
    let value: Thunk;
    if (sign) {
      const inner = this.signed(false);
      value = () => {
        const number = inner();
        if (typeof number !== 'number')
          throw new TemplateError(`bad operand type for unary ${sign}: ${str(number)}`);
        return sign === '-' ? -number : number;
      };
    } else value = this.atom();
    if (filtered) while (this.take('|')) value = this.filter(value);
    return value;
  }

  private atom(): Thunk {
    const token = this.next();
    if (token.kind === 'string') return () => token.text;
    if (token.kind === 'number') return () => Number(token.text);
    if (token.kind === 'punct' && token.text === '(') {
      const inner = this.conditional();
      this.expect(')');
      return inner;
    }
    if (token.kind === 'name') {
      const name = token.text;
      if (this.peek('(')) return this.call(name);
      if (Object.hasOwn(LITERALS, name)) return () => LITERALS[name];
      // the house: every state, or a domain's (`states.person`), and a state by its id (`states.light.desk`)
      if (name === 'states') return this.fields(this.house());
      // a variable handed over as undefined never reaches Home Assistant (JSON leaves it out): it is not defined
      return this.fields(() => {
        const variable = this.scope.variables[name];
        if (variable === undefined) this.scope.warn(`'${name}' is undefined`);
        return variable;
      });
    }
    throw new TemplateError(`unexpected '${token.text}'`);
  }

  /** `states`, and `states.<domain>` and `states.<domain>.<object id>` after it, as Home Assistant reads them. */
  private house(): Thunk {
    const all = (): HassEntity[] => Object.values(this.scope.states);
    if (!this.peek('.')) return all;
    this.at += 1;
    const domain = this.next().text;
    const ofDomain = (): HassEntity[] =>
      all().filter((state) => state.entity_id.startsWith(`${domain}.`));
    if (!this.peek('.') || this.tokens[this.at + 1]?.kind !== 'name') return ofDomain;
    const after = this.tokens[this.at + 1]?.text ?? '';
    // a state's own field after the domain is the domain's list read, never an object id
    if (['state', 'attributes', 'entity_id', 'name'].includes(after)) return ofDomain;
    this.at += 2;
    return () => this.scope.states[`${domain}.${after}`];
  }

  /** A value's fields read after it: `.state`, `.attributes.friendly_name`. */
  private fields(value: Thunk): Thunk {
    let read = value;
    while (this.take('.')) {
      const [from, key] = [read, this.next().text];
      read = () => field(from(), key);
    }
    return read;
  }

  private call(name: string): Thunk {
    const { args } = this.args();
    if (!['states', 'state_attr', 'is_state'].includes(name))
      throw new TemplateError(`'${name}' is undefined`);
    return () => {
      const values = args.map((arg) => arg());
      const state = this.scope.states[String(values[0])];
      if (name === 'states') return state?.state ?? 'unknown';
      if (name === 'state_attr') return state?.attributes[String(values[1])] ?? null;
      return state?.state === String(values[1]);
    };
  }

  /**
   * Home Assistant's `round` (an int at precision 0, else a float, written with its decimals as Python writes one),
   * Jinja's `int` and `float`, each refusing what is not a number, as they do without a default; Jinja's `upper`,
   * `lower`, `title` and `capitalize`, on the value as it is written; and the filters of lists.
   */
  private filter(value: Thunk): Thunk {
    const name = this.next();
    if (name.kind !== 'name') throw new TemplateError("a filter is expected after '|'");
    if (!FILTERS.includes(name.text)) throw new TemplateError(`No filter named '${name.text}'`);
    const { args, named } = this.peek('(') ? this.args() : { args: [], named: {} };
    return () =>
      this.apply(
        name.text,
        value(),
        args.map((arg) => arg()),
        Object.fromEntries(Object.entries(named).map(([key, arg]) => [key, arg()])),
      );
  }

  /** One filter on its input, its arguments worked out: what `|` and `map('name')` both run. */
  private apply(
    name: string,
    input: Value,
    args: readonly Value[],
    named: Readonly<Record<string, Value>> = {},
  ): Value {
    const words: Readonly<Record<string, (input: string) => string>> = {
      upper: (text) => text.toUpperCase(),
      lower: (text) => text.toLowerCase(),
      title: (text) =>
        text.toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (m) => m.toUpperCase()),
      capitalize: (text) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
    };
    const word = words[name];
    if (word) return word(str(input));
    switch (name) {
      case 'list':
        return [...itemsOf(input)];
      case 'count':
      case 'length':
        return itemsOf(input).length;
      case 'unique':
        return [...new Set(itemsOf(input))];
      case 'join':
        return itemsOf(input)
          .map(str)
          .join(str(args[0] ?? ''));
      case 'select':
      case 'reject':
        return itemsOf(input).filter(
          (item) => test(args[0], item, args[1]) === (name === 'select'),
        );
      case 'selectattr':
      case 'rejectattr':
        return itemsOf(input).filter(
          (item) => test(args[1], path(item, str(args[0])), args[2]) === (name === 'selectattr'),
        );
      case 'map':
        return itemsOf(input).map((item) =>
          named['attribute'] !== undefined
            ? path(item, str(named['attribute']))
            : this.apply(str(args[0]), item, args.slice(1)),
        );
      case 'area_id':
      case 'area_name': {
        const area = this.scope.areaOf(str(input));
        return (name === 'area_id' ? area?.id : area?.name) ?? null;
      }
    }
    const number = Number(input);
    if (
      input === null ||
      input === undefined ||
      input === '' ||
      typeof input === 'boolean' ||
      Number.isNaN(number)
    )
      throw new TemplateError(`${name}: ${str(input)} is not a number`);
    if (name === 'int') return Math.trunc(number);
    if (name === 'float') return number;
    const digits = Number(args[0] ?? 0);
    return digits === 0 ? Math.round(number) : number.toFixed(digits);
  }

  /** A call's arguments: in order, then by name (`map(attribute='entity_id')`). */
  private args(): { args: Thunk[]; named: Record<string, Thunk> } {
    this.expect('(');
    const args: Thunk[] = [];
    const named: Record<string, Thunk> = {};
    if (!this.peek(')'))
      do {
        const [token, after] = [this.tokens[this.at], this.tokens[this.at + 1]];
        if (token?.kind === 'name' && after?.kind === 'punct' && after.text === '=') {
          this.at += 2;
          named[token.text] = this.conditional();
        } else args.push(this.conditional());
      } while (this.take(','));
    this.expect(')');
    return { args, named };
  }

  private next(): Token {
    const token = this.tokens[this.at];
    if (!token) throw new TemplateError('unexpected end of expression');
    this.at += 1;
    return token;
  }

  private peek(text: string): boolean {
    const token = this.tokens[this.at];
    return token?.kind === 'punct' && token.text === text;
  }

  private take(text: string): boolean {
    if (!this.peek(text)) return false;
    this.at += 1;
    return true;
  }

  /** One of these operators next: taken, and said which. */
  private among(...texts: readonly string[]): string | undefined {
    return texts.find((text) => this.take(text));
  }

  /** A keyword (`if`, `and`, `not` …) next: taken. */
  private word(text: string): boolean {
    const token = this.tokens[this.at];
    if (token?.kind !== 'name' || token.text !== text) return false;
    this.at += 1;
    return true;
  }

  private operator(): string | undefined {
    const token = this.tokens[this.at];
    if (token?.kind !== 'punct' || !['==', '!=', '<', '>', '<=', '>='].includes(token.text))
      return undefined;
    this.at += 1;
    return token.text;
  }

  private expect(text: string): void {
    if (!this.take(text)) throw new TemplateError(`'${text}' expected`);
  }
}

/** The filters this Jinja knows: anything else is an error, as Jinja's is. */
const FILTERS: readonly string[] = [
  'round',
  'int',
  'float',
  'upper',
  'lower',
  'title',
  'capitalize',
  'list',
  'count',
  'length',
  'unique',
  'join',
  'select',
  'reject',
  'selectattr',
  'rejectattr',
  'map',
  'area_id',
  'area_name',
];

/** A template's parts: its text, what it prints (`{{ … }}`), and its `{% if %}` blocks, each branch with its test. */
type Part = string | Thunk | readonly Branch[];
interface Branch {
  /** None: the `else`. */
  readonly test?: Thunk;
  readonly body: Part[];
}

/** The template's parts, its blocks nested as they are opened and closed. */
function parse(template: string, scope: Scope): Part[] {
  const root: Part[] = [];
  /** The open `if` blocks, innermost last: the branches so far, where the next part goes. */
  const open: Array<{ branches: Branch[]; body: Part[] }> = [];
  const into = (): Part[] => open.at(-1)?.body ?? root;
  const expression = (source: string): Thunk => new Parser(tokenize(source), scope).expression();
  let at = 0;
  for (const match of template.matchAll(/\{\{(.*?)\}\}|\{%-?\s*(.*?)\s*-?%\}/gs)) {
    into().push(template.slice(at, match.index));
    at = match.index + match[0].length;
    const [, printed, statement] = match;
    if (printed !== undefined) {
      into().push(expression(printed));
      continue;
    }
    const [, keyword = '', rest = ''] = /^(\w+)\s*(.*)$/s.exec(statement ?? '') ?? [];
    const block = open.at(-1);
    if (keyword === 'if') {
      const body: Part[] = [];
      const branches: Branch[] = [{ test: expression(rest), body }];
      into().push(branches);
      open.push({ branches, body });
    } else if ((keyword === 'elif' || keyword === 'else') && block) {
      block.body = [];
      block.branches.push(
        keyword === 'elif' ? { test: expression(rest), body: block.body } : { body: block.body },
      );
    } else if (keyword === 'endif' && block) open.pop();
    else throw new TemplateError(`unexpected '{% ${statement} %}'`);
  }
  if (open.length) throw new TemplateError("unexpected end of template: '{% endif %}' expected");
  const tail = template.slice(at);
  if (tail.includes('{{') || tail.includes('{%'))
    throw new TemplateError('unexpected end of template');
  root.push(tail);
  return root;
}

/** The parts written out: each block's first branch whose test holds (or its `else`), the rest never worked out. */
const write = (parts: readonly Part[]): string =>
  parts
    .map((part) => {
      if (typeof part === 'string') return part;
      if (typeof part === 'function') return str(part());
      const branch = part.find(({ test }) => !test || truthy(test()));
      return branch ? write(branch.body) : '';
    })
    .join('');

/** The rendered text as Home Assistant reads it back: a number, True / False, None, else the text. */
const read = (text: string): Rendered =>
  /^-?\d+(\.\d+)?$/.test(text)
    ? Number(text)
    : text === 'True' || text === 'False'
      ? text === 'True'
      : text === 'None'
        ? null
        : text;

/**
 * `template` rendered against `states` (and the variables the caller hands over); a `TemplateError` when it cannot be.
 * `warn` hears what Home Assistant would say as a warning while it renders (a name that is not defined); `areaOf` says
 * an entity's area, as the registries do.
 */
export function renderTemplate(
  template: string,
  states: Readonly<Record<string, HassEntity>>,
  variables: Readonly<Record<string, unknown>> = {},
  warn: (message: string) => void = () => undefined,
  areaOf: (entityId: string) => AreaOf | undefined = () => undefined,
): Rendered {
  return read(write(parse(template.trim(), { states, variables, warn, areaOf })).trim());
}
