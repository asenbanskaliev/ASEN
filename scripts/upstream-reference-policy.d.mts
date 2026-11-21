/** Exact provenance-only document registration, never a runtime authorization. */
export declare function isPinnedReferenceDocument(path:string):boolean;
/** Verifica bytes con la huella Git SHA-1 del archivo; falla ante cualquier mutación. */
export declare function coincideHuellaGit(bytes:Buffer,expectedSha:string):boolean;
/** Mask only three explicitly approved native schema-property literals. */
export declare function maskApprovedWireSchemas(path:string,content:string):string;

/** Scan every executable file while masking only counted exact compatibility lines. */
export declare function maskApprovedReferenceTokens(path:string,content:string):string;

/** Whether an approved compatibility entry is reachable from a production entry point. */
export type CompatibilityWiring =
 | {readonly kind:"production";readonly wired:true;readonly consumer:string}
 | {readonly kind:"production";readonly wired:false;readonly consumer:null}
 | {readonly kind:"test";readonly wired:false;readonly consumer:null};
/** Wiring declaration for an approved compatibility entry, or null when undeclared. */
export declare function compatibilityWiringOf(path:string):CompatibilityWiring|null;
/** Every approved compatibility entry, sorted. */
export declare function listCompatibilityEntries():string[];
/** Approved production entries that exist only as ported text, sorted. */
export declare function listUnwiredCompatibilityEntries():string[];
/** Approved entries that declare no wiring at all; must stay empty. */
export declare function compatibilityEntriesWithoutWiring():string[];
