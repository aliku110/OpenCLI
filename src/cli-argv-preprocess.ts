/**
 * argv preprocessing: rewrite `opencli browser <sessionname> <subcommand> ...`
 * into `opencli browser --session <sessionname> <subcommand> ...` so commander
 * (which can't combine a parent positional with subcommand dispatch) can parse it.
 *
 * The user-facing form is positional; the internal form uses --session. Help text
 * for the `browser` command is overridden to advertise the positional form.
 */

/**
 * Browser subcommand names. If `<sessionname>` would collide with one of these,
 * we treat it as a missing-positional error and leave argv alone so commander
 * reports a usable diagnostic.
 *
 * Keep in sync with the subcommands declared on the `browser` command in cli.ts.
 */
const BROWSER_SUBCOMMAND_NAMES: ReadonlySet<string> = new Set([
  'analyze',
  'back',
  'bind',
  'check',
  'click',
  'close',
  'console',
  'dblclick',
  'dialog',
  'drag',
  'eval',
  'extract',
  'fill',
  'find',
  'focus',
  'frames',
  'get',
  'help',
  'hover',
  'init',
  'keys',
  'network',
  'open',
  'screenshot',
  'scroll',
  'select',
  'state',
  'tab',
  'type',
  'unbind',
  'uncheck',
  'upload',
  'verify',
  'wait',
]);

/**
 * Root program options that consume the following token as their value. Used by
 * the preprocessor to identify which token is the root command name (so e.g.
 * `opencli --profile work browser foo state` is recognised as the `browser`
 * command with `<sessionname>=foo`, not the value of --profile).
 *
 * Keep in sync with `program.option(...)` calls in cli.ts.
 */
const ROOT_VALUE_FLAGS: ReadonlySet<string> = new Set(['--profile']);

/**
 * Returns the set of reserved subcommand names (exposed for tests so they stay
 * synced with the actual registrations in cli.ts).
 */
export function getBrowserSubcommandNames(): ReadonlySet<string> {
  return BROWSER_SUBCOMMAND_NAMES;
}

/**
 * Rewrite `argv` to convert the positional `<sessionname>` after `browser`
 * into the internal `--session <name>` flag form.
 *
 * Only acts when `browser` is the root command (i.e. the first non-flag token
 * after any leading root options), so it can't mis-interpret occurrences of
 * the literal word `browser` deeper in the argv (e.g. `opencli adapter init
 * browser/x`, or a URL value containing `browser`).
 *
 * Leaves argv unchanged when:
 *   - root command is not `browser`
 *   - the token after `browser` is a flag (e.g. `--help`)
 *   - the token after `browser` is a known subcommand name (sessionname was
 *     omitted; commander will surface its own required-flag error)
 */
export function rewriteBrowserArgv(argv: readonly string[]): string[] {
  const result = [...argv];
  // Walk past leading root flags + their values to find the root command token.
  let i = 0;
  while (i < result.length) {
    const tok = result[i];
    if (!tok.startsWith('-')) break;
    // `--flag=value` consumes one slot regardless of whether the flag expects a value.
    if (tok.includes('=')) {
      i += 1;
      continue;
    }
    if (ROOT_VALUE_FLAGS.has(tok) && i + 1 < result.length) {
      i += 2;
    } else {
      i += 1;
    }
  }
  if (result[i] !== 'browser') return result;
  const sessionIdx = i + 1;
  const next = result[sessionIdx];
  if (next === undefined) return result;
  if (next.startsWith('-')) return result;
  if (BROWSER_SUBCOMMAND_NAMES.has(next)) return result;
  // Splice in --session <name> in place of the positional.
  result.splice(sessionIdx, 1, '--session', next);
  return result;
}
