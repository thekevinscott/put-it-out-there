/**
 * GitHub Actions wrapper. Bundled to `dist-action/index.js` via ncc.
 *
 * Implementation lands in #24. Scaffold here exits cleanly with a
 * not-yet-implemented marker so `action.yml` resolves during early
 * integration work.
 */

export function main(): void {
  const command = process.env.INPUT_COMMAND ?? '';
  process.stderr.write(
    `put-it-out-there@v0 action: command='${command}' — scaffold only; see #24 for the real wrapper.\n`,
  );
  // GHA outputs are appended to $GITHUB_OUTPUT when the CLI supports it;
  // scaffold emits nothing. The action is inert until #24 lands.
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
