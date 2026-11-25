/** Built-in Discord-style slash commands (client-side expansion). */

export type SlashCommand = {
  name: string;
  description: string;
  /** Return message content, or null if needs more args. */
  run: (args: string) => string | null;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "shrug",
    description: "Append ¯\\_(ツ)_/¯",
    run: (args) => `${args} ¯\\_(ツ)_/¯`.trim(),
  },
  {
    name: "tableflip",
    description: "Append (╯°□°)╯︵ ┻━┻",
    run: (args) => `${args} (╯°□°)╯︵ ┻━┻`.trim(),
  },
  {
    name: "unflip",
    description: "Append ┬─┬ ノ( ゜-゜ノ)",
    run: (args) => `${args} ┬─┬ ノ( ゜-゜ノ)`.trim(),
  },
  {
    name: "me",
    description: "Emote action (*does something*)",
    run: (args) => (args.trim() ? `*${args.trim()}*` : null),
  },
  {
    name: "spoiler",
    description: "Wrap text in spoilers",
    run: (args) => (args.trim() ? `||${args.trim()}||` : null),
  },
  {
    name: "lenny",
    description: "Append ( ͡° ͜ʖ ͡°)",
    run: (args) => `${args} ( ͡° ͜ʖ ͡°)`.trim(),
  },
];

export function matchSlashCommand(draft: string): {
  command: SlashCommand;
  args: string;
} | null {
  const trimmed = draft.trimStart();
  if (!trimmed.startsWith("/")) return null;
  const body = trimmed.slice(1);
  const space = body.indexOf(" ");
  const name = (space < 0 ? body : body.slice(0, space)).toLowerCase();
  const args = space < 0 ? "" : body.slice(space + 1);
  const command = SLASH_COMMANDS.find((item) => item.name === name);
  if (!command) return null;
  return { command, args };
}

export function expandSlashCommand(draft: string): string | null {
  const match = matchSlashCommand(draft);
  if (!match) return null;
  return match.command.run(match.args);
}

export function filterSlashCommands(prefix: string): SlashCommand[] {
  const q = prefix.replace(/^\//, "").toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(q));
}
