/**
 * CLI output helpers: one output object rendered as text, JSON or Markdown.
 */

export type OutputFormat = 'text' | 'json' | 'markdown';

export interface CommandOutput {
  /** Plain terminal rendering. */
  text: string;
  /** Machine-readable object (contract documented per command). */
  json: Record<string, unknown>;
  /** Markdown rendering. */
  markdown: string;
  /** Process exit code. */
  exitCode: number;
}

export function emit(
  format: OutputFormat,
  output: CommandOutput,
  stdout: (s: string) => void,
): number {
  switch (format) {
    case 'json':
      stdout(`${JSON.stringify(output.json, null, 2)}\n`);
      break;
    case 'markdown':
      stdout(output.markdown);
      break;
    case 'text':
      stdout(output.text);
      break;
  }
  return output.exitCode;
}

export function isOutputFormat(value: string | undefined): value is OutputFormat {
  return value === 'text' || value === 'json' || value === 'markdown';
}
