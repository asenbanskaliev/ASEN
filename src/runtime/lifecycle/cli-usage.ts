export interface CliUsageRow{readonly syntax:string;readonly note?:string}

/** One table owns the CLI surface. `ASEN_HELP` is generated from it, never typed twice. */
export const ASEN_CLI_USAGE:readonly CliUsageRow[]=Object.freeze([
 Object.freeze({syntax:"asen [--link|--isolated|--home PATH] [Pi arguments]"}),
 Object.freeze({syntax:"asen home [--link|--isolated|--home PATH]"}),
 Object.freeze({syntax:"asen startup",note:"Print the ordered startup sequence; descriptive only, executes nothing"}),
 Object.freeze({syntax:"asen setup --dry-run [--yes]",note:"Preview setup intent (no changes)"}),
 Object.freeze({syntax:"asen [--link|--isolated|--home PATH] backup project-memory --project <project-id> --destination <absolute-path> --dry-run",note:"Preview only; no backup created"}),
 Object.freeze({syntax:"asen [--link|--isolated|--home PATH] managed run <version> -- [Pi arguments]",note:"Current-user execution; publisher unverified"}),
 Object.freeze({syntax:"asen [--link|--isolated|--home PATH] managed select <version> --expected-current <version>",note:"Select retained metadata only; no activation"}),
 Object.freeze({syntax:"asen [--link|--isolated|--home PATH] managed update --manifest <absolute-json> --package-root <absolute-dir> --dry-run",note:"Observe only; software prefix remains OS home/.asen"}),
 Object.freeze({syntax:"asen [--link|--isolated|--home PATH] [--package-root PATH] doctor"}),
 Object.freeze({syntax:"asen managed install|upgrade|rollback|uninstall|release …",note:"Signed install lifecycle (see docs/installation.md)"}),
 Object.freeze({syntax:"asen managed upgrade --manifest F --signature F --package-root D --trust-anchor F --stage-only --yes",note:"Prepara una versión firmada sin ejecutar ni activar"}),
 Object.freeze({syntax:"asen backup home --destination <absolute-file> | backup verify --file <file> | restore home --backup <file> --target-home <dir> --yes"}),
 Object.freeze({syntax:"asen --version"}),
]);

export function renderCliUsage(rows:readonly CliUsageRow[]=ASEN_CLI_USAGE):string{
 const [first,...rest]=rows;
 if(first===undefined)throw new Error("ASEN CLI usage table is empty");
 return ["Usage: "+first.syntax,...rest.map(row=>"       "+row.syntax+(row.note===undefined?"":"  "+row.note))].join("\n")+"\n";
}
