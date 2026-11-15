import path from "node:path";
import {createManagedUpdatePreview} from "./managed-update-preview.js";
import {ManagedInstallError,stageAdditionalManagedVersion,type ManagedInstallFile} from "./managed-install.js";

export interface ManagedAcquisitionUpdateRequest{
 readonly manifestPath:string;
 readonly packageRoot:string;
 readonly prefix:string;
 readonly protectedPaths:readonly string[];
 readonly confirmed:boolean;
}
export interface ManagedAcquisitionUpdateReport{
 readonly schema:"asen.managed-acquisition-update/v1";
 readonly operation:"managed-acquisition-update";
 readonly status:"staged"|"unchanged";
 readonly prefix:string;
 readonly version:string;
 readonly files:readonly ManagedInstallFile[];
 readonly selection:"not-run";
 readonly activation:"not-run";
 readonly producerAuthenticity:"not-established";
 readonly runtimeReady:false;
}
function installError(code:"CONFIRMATION_REQUIRED"|"INVALID_ABSOLUTE_PATH"|"FOREIGN_MANAGED_ROOT"|"VERSION_CONFLICT",message:string):never{throw new ManagedInstallError(code,message);}

/** Freshly previews then stages declared local bytes; it never selects, activates, or executes them. */
export async function stageManagedAcquisitionUpdate(request:ManagedAcquisitionUpdateRequest):Promise<ManagedAcquisitionUpdateReport>{
 if(request.confirmed!==true)installError("CONFIRMATION_REQUIRED","Managed acquisition update requires explicit confirmation");
 for(const [noun,value] of [["manifest",request.manifestPath],["package root",request.packageRoot],["installation prefix",request.prefix],...request.protectedPaths.map(value=>["protected path",value] as const)] as const)if(typeof value!=="string"||!path.isAbsolute(value))installError("INVALID_ABSOLUTE_PATH",`Managed ${noun} must be absolute`);
 const preview=await createManagedUpdatePreview({manifestPath:request.manifestPath,packageRoot:request.packageRoot,prefix:request.prefix});
 if(preview.managed.status!=="owned")installError("FOREIGN_MANAGED_ROOT","Managed acquisition update requires an existing owned installation");
 if(preview.managed.targetVersionState==="conflicting-retained")installError("VERSION_CONFLICT",`Managed version ${preview.acquisition.version} already exists with different data`);
 const expected={schema:"asen.managed-acquisition/v1" as const,version:preview.acquisition.version,files:preview.acquisition.files.map(file=>({sourcePath:file.sourcePath,destinationPath:file.destinationPath,size:file.size,sha256:file.sha256}))};
 const staged=await stageAdditionalManagedVersion({prefix:request.prefix,packageRoot:request.packageRoot,version:expected.version,files:expected.files.map(file=>({sourcePath:file.sourcePath,destinationPath:file.destinationPath})),protectedPaths:request.protectedPaths,confirmed:true,expectedAcquisition:expected});
 return Object.freeze({schema:"asen.managed-acquisition-update/v1",operation:"managed-acquisition-update",status:staged.status as "staged"|"unchanged",prefix:path.resolve(request.prefix),version:expected.version,files:staged.files,selection:"not-run",activation:"not-run",producerAuthenticity:"not-established",runtimeReady:false});
}
