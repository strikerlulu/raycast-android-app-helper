// Component for package actions
import { ActionPanel, Action, Icon, showToast, Toast, confirmAlert, open } from "@raycast/api";
import { PackageInfo } from "../types";
import {
  extractApk,
  uninstallApp,
  clearAppData,
  launchAppSettings,
  forceStopApp,
  startApp,
  getPackageDetails,
  setPackageEnabled,
  disassembleDex,
} from "../utils/adb";
import { useState } from "react";
import { PackageDetailsView } from "./PackageDetailsView";
import { AppExplorerView } from "./AppExplorerView";
import path from "path";

interface PackageActionsProps {
  package: PackageInfo;
  systemApp?: boolean;
  onPackageRemoved?: () => void;
}

export function PackageActions({ package: pkg, systemApp = false, onPackageRemoved }: PackageActionsProps) {
  const [, setIsLoading] = useState(false);

  // Load full package details
  const loadDetails = async () => {
    setIsLoading(true);
    try {
      const details = await getPackageDetails(pkg.name);
      return { ...pkg, ...details };
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load details",
        message: (error as Error).message,
      });
      return pkg;
    } finally {
      setIsLoading(false);
    }
  };

  // Extract APK action
  const handleExtractApk = async () => {
    setIsLoading(true);
    try {
      const fullDetails = await loadDetails();
      const outputPath = await extractApk(fullDetails);
      await showToast({
        style: Toast.Style.Success,
        title: "APK Extracted",
        message: path.basename(outputPath),
      });

      // Open the containing folder
      await open(path.dirname(outputPath));
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to extract APK",
        message: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Uninstall package action
  const handleUninstall = async () => {
    const confirmed = await confirmAlert({
      title: "Uninstall App",
      message: `Are you sure you want to uninstall ${pkg.name}?`,
      primaryAction: {
        title: "Uninstall",
      },
    });

    if (!confirmed) return;

    setIsLoading(true);
    try {
      const result = await uninstallApp(pkg.name);
      if (!result.success) {
        throw new Error(result.error);
      }

      await showToast({
        style: Toast.Style.Success,
        title: "App Uninstalled",
      });

      if (onPackageRemoved) {
        onPackageRemoved();
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to uninstall app",
        message: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Clear app data action
  const handleClearData = async () => {
    const confirmed = await confirmAlert({
      title: "Clear App Data",
      message: `Are you sure you want to clear all data for ${pkg.name}?`,
      primaryAction: {
        title: "Clear Data",
      },
    });

    if (!confirmed) return;

    setIsLoading(true);
    try {
      const result = await clearAppData(pkg.name);
      if (!result.success) {
        throw new Error(result.error);
      }

      await showToast({
        style: Toast.Style.Success,
        title: "App Data Cleared",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to clear app data",
        message: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Force stop app
  const handleForceStop = async () => {
    setIsLoading(true);
    try {
      const result = await forceStopApp(pkg.name);
      if (!result.success) {
        throw new Error(result.error);
      }

      await showToast({
        style: Toast.Style.Success,
        title: "App Force Stopped",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to force stop app",
        message: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Launch app
  const handleLaunch = async () => {
    setIsLoading(true);
    try {
      const result = await startApp(pkg.name);
      if (!result.success) {
        throw new Error(result.error);
      }

      await showToast({
        style: Toast.Style.Success,
        title: "App Launched",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to launch app",
        message: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Disassemble APK
  const handleDisassemble = async () => {
    setIsLoading(true);
    try {
      // Check for jadx availability
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execPromise = promisify(exec);

      let jadxFound = false;
      try {
        const { stdout } = await execPromise("command -v jadx");
        if (stdout && stdout.trim()) jadxFound = true;
      } catch {
        // not found
      }

      if (!jadxFound) {
        await showToast({
          style: Toast.Style.Failure,
          title: "JADX not found",
          message: "Install JADX (https://github.com/skylot/jadx) and/or set JADX in your PATH to enable disassembly.",
        });
        return;
      }

      // First extract the APK
      const fullDetails = await loadDetails();
      const apkPath = await extractApk(fullDetails);

      // Then disassemble it
      const result = await disassembleDex(apkPath);
      if (!result.success) {
        throw new Error(result.error || "Failed to disassemble DEX");
      }

      await showToast({
        style: Toast.Style.Success,
        title: "APK Disassembled",
        message: "Source code extracted",
      });

      // Open the output directory
      await open(path.dirname(apkPath) + "/" + path.basename(apkPath, ".apk") + "_src");
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to disassemble APK",
        message: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Enable/disable package
  const handleToggleEnabled = async (enable: boolean) => {
    setIsLoading(true);
    try {
      const result = await setPackageEnabled(pkg.name, enable);
      if (!result.success) {
        throw new Error(result.error);
      }

      await showToast({
        style: Toast.Style.Success,
        title: enable ? "App Enabled" : "App Disabled",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Failed to ${enable ? "enable" : "disable"} app`,
        message: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppLaunchSettings = async () => {
    setIsLoading(true);
    try {
      const result = await launchAppSettings(pkg.name);
      if (!result.success) {
        throw new Error(result.error);
      }

      await showToast({
        style: Toast.Style.Success,
        title: "App Settings Launched",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to launch app settings",
        message: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Common Actions */}
      <Action.CopyToClipboard
        title="Copy Package Name"
        content={pkg.name}
        shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
      />

      <Action title="Launch App" icon={Icon.Play} shortcut={{ modifiers: ["cmd"], key: "o" }} onAction={handleLaunch} />

      <Action
        title="Launch App Settings Page"
        icon={Icon.Play}
        shortcut={{ modifiers: ["cmd"], key: "l" }}
        onAction={handleAppLaunchSettings}
      />

      <Action
        title="Force Stop"
        icon={Icon.Stop}
        shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
        onAction={handleForceStop}
      />

      <Action
        title="Extract Apk"
        icon={Icon.Download}
        shortcut={{ modifiers: ["cmd"], key: "e" }}
        onAction={handleExtractApk}
      />

      <Action.Push
        title="View App Details"
        icon={Icon.Sidebar}
        shortcut={{ modifiers: ["cmd"], key: "d" }}
        target={<PackageDetailsView packageName={pkg.name} />}
      />

      <Action.Push
        title="Explore App Files"
        icon={Icon.Folder}
        shortcut={{ modifiers: ["cmd"], key: "f" }}
        target={<AppExplorerView packageName={pkg.name} />}
      />

      {/* Actions based on app type */}
      {!systemApp && (
        <ActionPanel.Section title="User App Actions">
          <Action
            title="Clear App Data"
            icon={Icon.Trash}
            shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
            onAction={handleClearData}
          />

          <Action
            title="Uninstall App"
            icon={Icon.DeleteDocument}
            shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
            style={Action.Style.Destructive}
            onAction={handleUninstall}
          />
        </ActionPanel.Section>
      )}

      {systemApp && (
        <ActionPanel.Section title="System App Actions">
          <Action
            title="Disable App"
            icon={Icon.EyeDisabled}
            shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            onAction={() => handleToggleEnabled(false)}
          />

          <Action
            title="Enable App"
            icon={Icon.Eye}
            shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
            onAction={() => handleToggleEnabled(true)}
          />
        </ActionPanel.Section>
      )}

      {/* Reverse Engineering Actions */}
      <ActionPanel.Section title="Reverse Engineering">
        <Action
          title="Disassemble Apk (jadx)"
          icon={Icon.Code}
          shortcut={{ modifiers: ["ctrl", "cmd"], key: "d" }}
          onAction={handleDisassemble}
        />

        <Action
          title="Capture Logcat"
          icon={Icon.Terminal}
          shortcut={{ modifiers: ["ctrl", "cmd"], key: "l" }}
          onAction={() => open(`raycast://extensions/ctz/android-app-helper/logcat?packageName=${pkg.name}`)}
        />

        <Action
          title="View App Manifest"
          icon={Icon.Document}
          shortcut={{ modifiers: ["ctrl", "cmd"], key: "m" }}
          onAction={async () => {
            await handleExtractApk();
            // This would typically open the extracted APK and parse the manifest
            // For now we just notify the user
            await showToast({
              style: Toast.Style.Success,
              title: "Extract APK first",
              message: "You can use a tool like apktool to view the manifest",
            });
          }}
        />
      </ActionPanel.Section>
    </>
  );
}
