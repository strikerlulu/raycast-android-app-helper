import { getPreferenceValues } from "@raycast/api";

interface Preferences {
  outputDirectory: string;
  adbPath: string;
  showNotifications: boolean;
  jadxPath?: string;
  autoExtractTimeout?: number;
}

export function getExtensionPreferences(): Preferences {
  const prefs = getPreferenceValues<Preferences>();

  return {
    outputDirectory: prefs.outputDirectory || "~/Downloads/android-re",
    adbPath: prefs.adbPath || "adb", // Use default adb in PATH if not specified
    showNotifications: prefs.showNotifications !== false,
    jadxPath: prefs.jadxPath || "jadx", // Optional path to jadx for dex decompilation
    autoExtractTimeout: prefs.autoExtractTimeout || 30, // Default 30 seconds timeout
  };
}
