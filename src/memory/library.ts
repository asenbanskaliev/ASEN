import type {MemoryContextOptions,MemoryExport,MemoryItem,MemoryObservationInput,MemoryObservationUpdate,MemoryRelation,MemoryRelationInput,MemorySearchOptions,MemorySearchPreview,MemorySessionSummary,MemoryStore} from "./types.js";
export class MemoryLibrary{
 constructor(private readonly store:MemoryStore,readonly projectId:string){}
 get(id:string):MemoryItem|undefined{const item=this.store.get(id);return item?.projectId===this.projectId?item:undefined;}
 search(query:string,options:MemorySearchOptions={}):MemoryItem[]{return this.store.searchWithOptions(this.projectId,query,options);}
 previews(query:string,options:MemorySearchOptions={}):MemorySearchPreview[]{return this.store.searchPreviews(this.projectId,query,options);}
 context(options:MemoryContextOptions={}):string{return this.store.formatContext(this.projectId,options);}
 relations(id?:string):MemoryRelation[]{return this.store.listRelations(this.projectId,id);}
 export():MemoryExport{return this.store.exportProject(this.projectId);}
}
