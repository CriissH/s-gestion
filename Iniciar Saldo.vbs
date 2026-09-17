Option Explicit

Dim shell, fso, appPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "src-tauri\target\release\saldo.exe")
If fso.FileExists(appPath) Then
  shell.Run """" & appPath & """", 1, False
Else
  shell.Run "mshta.exe """ & fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "index.html") & """", 1, False
End If
