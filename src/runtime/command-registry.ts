/**
 * Unified Command Registry for ASEN.
 * Centralizes command declarations, categories, aliases, help rendering and palette projections.
 */

export type CommandCategory =
  | "core"
  | "workflow"
  | "review"
  | "skills"
  | "configuration"
  | "session"
  | "memory"
  | "diagnostics"
  | "system";

export interface CommandFlagDefinition {
  readonly type: "boolean" | "string";
  readonly description: string;
  readonly default?: unknown;
}

export interface CommandDefinition {
  readonly name: string;
  readonly alias?: readonly string[] | undefined;
  readonly description: string;
  readonly category: CommandCategory;
  readonly handler: (args: string[], context?: unknown) => Promise<number>;
  readonly flags?: Readonly<Record<string, CommandFlagDefinition>> | undefined;
  readonly isHidden?: boolean | undefined;
}

export interface PaletteItem {
  readonly label: string;
  readonly value: string;
  readonly category: CommandCategory;
  readonly hint: string;
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();
  private readonly aliasMap = new Map<string, string>();

  /**
   * Register a new command in the catalog.
   * Throws if the name or any alias conflicts with an existing entry.
   */
  public register(cmd: CommandDefinition): void {
    if (!cmd.name || typeof cmd.name !== "string" || !cmd.name.trim()) {
      throw new Error("Command name must be a non-empty string");
    }
    const normalizedName = cmd.name.trim().toLowerCase();

    if (this.commands.has(normalizedName)) {
      throw new Error(`Command '${cmd.name}' is already registered`);
    }

    if (this.aliasMap.has(normalizedName)) {
      const owner = this.aliasMap.get(normalizedName);
      throw new Error(`Command name '${cmd.name}' conflicts with alias of '${owner}'`);
    }

    const aliases: string[] = [];
    if (cmd.alias && Array.isArray(cmd.alias)) {
      for (const a of cmd.alias) {
        if (typeof a !== "string" || !a.trim()) continue;
        const normalizedAlias = a.trim().toLowerCase();
        if (normalizedAlias === normalizedName) continue;

        if (this.commands.has(normalizedAlias)) {
          throw new Error(
            `Alias '${a}' conflicts with already registered command '${normalizedAlias}'`
          );
        }
        if (this.aliasMap.has(normalizedAlias)) {
          const owner = this.aliasMap.get(normalizedAlias);
          throw new Error(
            `Alias '${a}' conflicts with already registered command '${owner}'`
          );
        }
        aliases.push(normalizedAlias);
      }
    }

    const frozenCommand: CommandDefinition = Object.freeze({
      ...cmd,
      name: normalizedName,
      alias: Object.freeze([...aliases]),
      ...(cmd.flags ? { flags: Object.freeze({ ...cmd.flags }) } : {})
    });

    this.commands.set(normalizedName, frozenCommand);
    for (const a of aliases) {
      this.aliasMap.set(a, normalizedName);
    }
  }

  /**
   * Check if a command or alias is registered.
   */
  public has(name: string): boolean {
    if (!name || typeof name !== "string") return false;
    const key = name.trim().toLowerCase();
    return this.commands.has(key) || this.aliasMap.has(key);
  }

  /**
   * Retrieve a command definition by primary name or alias.
   */
  public get(name: string): CommandDefinition | undefined {
    if (!name || typeof name !== "string") return undefined;
    const key = name.trim().toLowerCase();
    if (this.commands.has(key)) {
      return this.commands.get(key);
    }
    const primary = this.aliasMap.get(key);
    if (primary) {
      return this.commands.get(primary);
    }
    return undefined;
  }

  /**
   * List all registered commands, optionally filtered by category, sorted alphabetically.
   */
  public list(category?: CommandCategory): CommandDefinition[] {
    const list = Array.from(this.commands.values());
    const filtered = category ? list.filter((c) => c.category === category) : list;
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Return items formatted for the command palette (excluding hidden commands).
   */
  public toPaletteItems(): PaletteItem[] {
    return this.list()
      .filter((cmd) => !cmd.isHidden)
      .map((cmd) => {
        const hint = cmd.alias && cmd.alias.length > 0 ? `(${cmd.alias.join(", ")})` : "";
        return {
          label: cmd.name,
          value: cmd.name,
          category: cmd.category,
          hint: hint ? `${hint} · ${cmd.description}` : cmd.description
        };
      });
  }

  /**
   * Render aligned CLI help text for a specific command or the whole catalog.
   */
  public renderHelp(cmdName?: string): string {
    if (cmdName) {
      const cmd = this.get(cmdName);
      if (!cmd) return `Unknown command: ${cmdName}\n`;
      const lines: string[] = [
        `Command: ${cmd.name}`,
        `Category: ${cmd.category}`,
        `Description: ${cmd.description}`
      ];
      if (cmd.alias && cmd.alias.length > 0) {
        lines.push(`Aliases: ${cmd.alias.join(", ")}`);
      }
      if (cmd.flags && Object.keys(cmd.flags).length > 0) {
        lines.push(`Flags:`);
        for (const [flag, def] of Object.entries(cmd.flags)) {
          lines.push(`  --${flag} (${def.type}): ${def.description}`);
        }
      }
      return lines.join("\n") + "\n";
    }

    const lines: string[] = ["ASEN Command Catalog:\n"];
    const maxLen = Math.max(...Array.from(this.commands.keys()).map((k) => k.length), 10);

    for (const cmd of this.list()) {
      if (cmd.isHidden) continue;
      const pad = " ".repeat(maxLen - cmd.name.length + 2);
      lines.push(`  ${cmd.name}${pad}${cmd.description}`);
    }
    return lines.join("\n") + "\n";
  }
}
