/** Exact provenance-only document registration, never a runtime authorization. */
export declare function isPinnedReferenceDocument(path:string):boolean;
/** Mask only three explicitly approved native schema-property literals. */
export declare function maskApprovedWireSchemas(path:string,content:string):string;

/** Scan every executable file while masking only counted exact compatibility lines. */
export declare function maskApprovedReferenceTokens(path:string,content:string):string;
