// Common types for the extension

export interface PackageInfo {
  name: string;
  appName?: string;
  isSystemApp: boolean;
  apkPath: string;
  versionName: string;
  versionCode: string;
  targetSdk: string;
  dataPath?: string;
  size?: string;
  firstInstallTime?: string;
  lastUpdateTime?: string;
}

export interface LogcatFilter {
  tag?: string;
  pid?: string;
  packageName?: string;
  level: "V" | "D" | "I" | "W" | "E" | "F" | "S"; // Verbose, Debug, Info, Warning, Error, Fatal, Silent
  search?: string; // client-side search/filter for displayed lines
}

export interface AppFile {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: string;
  date?: string;
}

export type AdbCommandResult = {
  success: boolean;
  output: string;
  error?: string;
};
