#define MyAppName "SnapStream"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "SnapStream"
#define MyAppExeName "SnapStream.exe"

[Setup]
AppId={{B9EF81E1-4AF9-4BD0-91E7-9B6DDF239DB1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\SnapStream
DefaultGroupName=SnapStream
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\..\..\..\dist
OutputBaseFilename=SnapStreamSetup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=SnapStream.ico
UninstallDisplayIcon={app}\SnapStream.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no

[Files]
Source: "..\..\..\..\dist\windows\SnapStream.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\SnapStream"; Filename: "{app}\SnapStream.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\SnapStream"; Filename: "{app}\SnapStream.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{app}\SnapStream.exe"; Description: "Launch SnapStream"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\SnapStream\Extension.staging-*"
Type: filesandordirs; Name: "{localappdata}\SnapStream\Extension.backup-*"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
