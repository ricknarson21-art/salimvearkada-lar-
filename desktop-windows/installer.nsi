Unicode true
Name "Bir Artı Bir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
InstallDir "$LOCALAPPDATA\BirArtiBir\App"

!include "MUI2.nsh"
!include "x64.nsh"

!ifndef APP_FILES
  !define APP_FILES "bin/Release/net48"
!endif
!ifndef SETUP_FILE
  !define SETUP_FILE "BirArtiBir-Setup-Windows-x64.exe"
!endif
OutFile "${SETUP_FILE}"

!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\BirArtiBir"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\BirArtiBir.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Bir Artı Bir'i aç"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Turkish"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Bu kurulum 64 bit Windows gerektirir."
    Abort
  ${EndIf}
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" "Release"
  ${If} $0 < 528040
    MessageBox MB_OK|MB_ICONSTOP "Microsoft .NET Framework 4.8 veya üzeri gerekir."
    Abort
  ${EndIf}
FunctionEnd

Section
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File "${APP_FILES}/BirArtiBir.exe"
  File "${APP_FILES}/BirArtiBir.exe.config"
  File "${APP_FILES}/Microsoft.Web.WebView2.Core.dll"
  File "${APP_FILES}/Microsoft.Web.WebView2.WinForms.dll"
  SetOutPath "$INSTDIR\runtimes\win-x64\native"
  File "${APP_FILES}/runtimes/win-x64/native/WebView2Loader.dll"
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Kaldir.exe"
  CreateShortcut "$SMPROGRAMS\Bir Artı Bir.lnk" "$INSTDIR\BirArtiBir.exe"
  CreateShortcut "$DESKTOP\Bir Artı Bir.lnk" "$INSTDIR\BirArtiBir.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "Bir Artı Bir"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "0.1.0"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\BirArtiBir.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Kaldir.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetRegView 64
  SetShellVarContext current
  Delete "$DESKTOP\Bir Artı Bir.lnk"
  Delete "$SMPROGRAMS\Bir Artı Bir.lnk"
  Delete "$INSTDIR\BirArtiBir.exe"
  Delete "$INSTDIR\BirArtiBir.exe.config"
  Delete "$INSTDIR\Microsoft.Web.WebView2.Core.dll"
  Delete "$INSTDIR\Microsoft.Web.WebView2.WinForms.dll"
  Delete "$INSTDIR\runtimes\win-x64\native\WebView2Loader.dll"
  RMDir "$INSTDIR\runtimes\win-x64\native"
  RMDir "$INSTDIR\runtimes\win-x64"
  RMDir "$INSTDIR\runtimes"
  Delete "$INSTDIR\Kaldir.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
SectionEnd
