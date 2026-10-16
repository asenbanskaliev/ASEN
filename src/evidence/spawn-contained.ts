import {spawn,type ChildProcess,type SpawnOptions} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const windowsJobSource=String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class AsenContainedProcess {
  const uint CREATE_SUSPENDED=0x00000004, CREATE_UNICODE_ENVIRONMENT=0x00000400;
  const uint STARTF_USESTDHANDLES=0x00000100, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE=0x00002000;
  const uint WAIT_OBJECT_0=0, INFINITE=0xffffffff;
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
    public int dwX,dwY,dwXSize,dwYSize,dwXCountChars,dwYCountChars,dwFillAttribute,dwFlags;
    public short wShowWindow,cbReserved2; public IntPtr lpReserved2,hStdInput,hStdOutput,hStdError;
  }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess,hThread; public uint dwProcessId,dwThreadId; }
  [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT_INFORMATION {
    public long PerProcessUserTimeLimit,PerJobUserTimeLimit; public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize,MaximumWorkingSetSize; public uint ActiveProcessLimit;
    public UIntPtr Affinity; public uint PriorityClass,SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong ReadOperationCount,WriteOperationCount,OtherOperationCount,ReadTransferCount,WriteTransferCount,OtherTransferCount; }
  [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT_INFORMATION {
    public BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed;
  }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int infoClass,ref EXTENDED_LIMIT_INFORMATION info,uint length);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string cwd,ref STARTUPINFO startup,out PROCESS_INFORMATION info);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr GetStdHandle(int which);
  static Exception LastError(string action) { return new Win32Exception(Marshal.GetLastWin32Error(),action); }
  static string Quote(string value) {
    var result=new StringBuilder("\""); int slashes=0;
    foreach(char c in value) {
      if(c=='\\') { slashes++; continue; }
      if(c=='\"') { result.Append('\\',slashes*2+1); result.Append(c); slashes=0; continue; }
      result.Append('\\',slashes); slashes=0; result.Append(c);
    }
    result.Append('\\',slashes*2); result.Append('\"'); return result.ToString();
  }
  public static int Run(string executable,string cwd,string[] args) {
    IntPtr job=CreateJobObject(IntPtr.Zero,null); if(job==IntPtr.Zero) throw LastError("CreateJobObject failed");
    PROCESS_INFORMATION pi=new PROCESS_INFORMATION(); bool created=false;
    try {
      EXTENDED_LIMIT_INFORMATION limits=new EXTENDED_LIMIT_INFORMATION();
      limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(EXTENDED_LIMIT_INFORMATION)))) throw LastError("SetInformationJobObject failed");
      var line=new StringBuilder(Quote(executable)); foreach(string arg in args) line.Append(' ').Append(Quote(arg));
      STARTUPINFO si=new STARTUPINFO(); si.cb=Marshal.SizeOf(typeof(STARTUPINFO)); si.dwFlags=(int)STARTF_USESTDHANDLES;
      si.hStdInput=GetStdHandle(-10);si.hStdOutput=GetStdHandle(-11);si.hStdError=GetStdHandle(-12);
      if(!CreateProcess(null,line,IntPtr.Zero,IntPtr.Zero,true,CREATE_SUSPENDED|CREATE_UNICODE_ENVIRONMENT,IntPtr.Zero,cwd,ref si,out pi)) throw LastError("CreateProcess failed");
      created=true;
      if(!AssignProcessToJobObject(job,pi.hProcess)) { TerminateProcess(pi.hProcess,1); throw LastError("AssignProcessToJobObject failed"); }
      if(ResumeThread(pi.hThread)==0xffffffff) { TerminateProcess(pi.hProcess,1); throw LastError("ResumeThread failed"); }
      if(WaitForSingleObject(pi.hProcess,INFINITE)!=WAIT_OBJECT_0) throw LastError("WaitForSingleObject failed");
      uint code;if(!GetExitCodeProcess(pi.hProcess,out code)) throw LastError("GetExitCodeProcess failed"); return unchecked((int)code);
    } finally {
      if(created){CloseHandle(pi.hThread);CloseHandle(pi.hProcess);}
      CloseHandle(job);
    }
  }
}`;

function spawnWindowsJobCommand(command:string,args:readonly string[],options:SpawnOptions):ChildProcess {
  const payloadDirectory=mkdtempSync(join(tmpdir(),"asen-contained-job-")),payloadPath=join(payloadDirectory,"command.json");
  const cwd=options.cwd===undefined?process.cwd():typeof options.cwd==="string"?resolve(options.cwd):fileURLToPath(options.cwd);
  writeFileSync(payloadPath,JSON.stringify({command,args,cwd}),{encoding:"utf8",mode:0o600,flag:"wx"});
  const source=Buffer.from(windowsJobSource,"utf8").toString("base64"),file=Buffer.from(payloadPath,"utf8").toString("base64");
  const script=`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; try { $s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${source}')); Add-Type -TypeDefinition $s; $f=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${file}')); $p=Get-Content -Raw -LiteralPath $f | ConvertFrom-Json; $c=[AsenContainedProcess]::Run([string]$p.command,[string]$p.cwd,[string[]]$p.args); exit $c } catch { [Console]::Error.WriteLine($_.Exception.ToString()); exit 1 }`;
  const encoded=Buffer.from(script,"utf16le").toString("base64");
  try{
    const child=spawn("powershell.exe",["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-EncodedCommand",encoded],{...options,detached:false,windowsHide:true});
    const cleanup=()=>rmSync(payloadDirectory,{recursive:true,force:true});child.once("close",cleanup);child.once("error",cleanup);return child;
  }catch(error){rmSync(payloadDirectory,{recursive:true,force:true});throw error;}
}

/** On Windows, start the exact command suspended and assign it to a kill-on-close Job Object before resume. */
export function spawnContained(command:string,args:readonly string[],options:SpawnOptions={}):ChildProcess {
  if(process.platform==="win32")return spawnWindowsJobCommand(command,args,options);
  return spawn(command,[...args],options);
}
