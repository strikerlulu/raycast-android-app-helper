import { exec } from "child_process";
import { promisify } from "util";
import { confirmAlert, getPreferenceValues } from "@raycast/api";
import { PackageInfo, AdbCommandResult, AppFile, LogcatFilter } from "../types";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

/* eslint-disable no-useless-escape */

interface Preferences {
  outputDirectory: string;
  adbPath: string;
  showNotifications: boolean;
}

// Get preferences
export function getAdbPrefs(): Preferences {
  const prefs = getPreferenceValues<Preferences>();
  return {
    outputDirectory: prefs.outputDirectory || "~/Downloads/android-re",
    adbPath: prefs.adbPath || "adb",
    showNotifications: prefs.showNotifications !== false,
  };
}

// Run ADB command with error handling
export async function runAdbCommand(command: string): Promise<AdbCommandResult> {
  const { adbPath } = getAdbPrefs();

  try {
    const { stdout } = await execAsync(`${adbPath} ${command}`);
    return { success: true, output: stdout.trim() };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: (error as Error).message,
    };
  }
}

// Check if ADB is available
export async function checkAdb(): Promise<boolean> {
  const result = await runAdbCommand("--version");
  return result.success;
}

// Check for connected devices
export async function getConnectedDevices(): Promise<string[]> {
  const result = await runAdbCommand("devices");

  if (!result.success) {
    return [];
  }

  const lines = result.output.split("\n").slice(1);
  return lines.filter((line) => line.trim() !== "" && !line.includes("offline")).map((line) => line.split("\t")[0]);
}

// Fetch packages (with type filter)
export async function fetchPackages(systemOnly: boolean = false): Promise<PackageInfo[]> {
  const adbAvailable = await checkAdb();
  if (!adbAvailable) {
    throw new Error("ADB is not installed or not in PATH");
  }

  const devices = await getConnectedDevices();
  if (devices.length === 0) {
    throw new Error("No Android devices connected");
  }

  // Get all packages
  const flag = systemOnly ? "-s" : "-3";
  const result = await runAdbCommand(`shell pm list packages ${flag} -f`);

  if (!result.success) {
    throw new Error(`Failed to fetch packages: ${result.error}`);
  }

  const lines = result.output.split("\n");
  const packageList: PackageInfo[] = [];

  for (const line of lines) {
    if (line.trim()) {
      // Handle different formats of package paths
      // Format can be one of:
      // 1. package:/data/app/com.example.app-HASH/base.apk=com.example.app (older Android)
      // 2. package:/data/app/~~HASH==/com.example.app-HASH==/base.apk=com.example.app (newer Android)
      // 3. package:=/data/app/com.ankit.test-MvRy9lTnM8sXaJXj32oTPA==/base.apk=com.ankit.test (with extra equals sign)
      // 4. package:/bfv.bigfun.danh.bai.online-xH0We4gHJFsTbV6dWgOPBA==/base.apk=bfv.bigfun.danh.bai.online (no leading equals, direct path)

      let packageName: string | null = null;
      let apkPath: string | null = null;

      // Remove the "package:" prefix, leaving just the path and package name part
      const pathAndPackage = line.replace(/^package:=?/, "");

      // Check if the line has the "base.apk=" pattern which is used in most formats
      if (pathAndPackage.includes("base.apk=")) {
        // Split by the last equals sign to get package name
        const parts = pathAndPackage.split("=");
        if (parts.length >= 2) {
          // The package name is the last part after splitting by =
          packageName = parts[parts.length - 1].trim();
          // The path is everything up to but not including the last equals and package name
          apkPath = parts.slice(0, -1).join("=").trim();
        }
      } else {
        // Fallback for other formats
        const match = line.match(/package:=?(.*?)=([^/]+)$/);
        if (match && match[2]) {
          apkPath = match[1].trim();
          packageName = match[2].trim();
        }
      }

      // Ultimate fallback: try to extract package name from the path itself
      if (!packageName || !apkPath) {
        const pathMatch = line.match(/package:.*\/([^/-]+?)(?:-[^/]+)?\/base\.apk/);
        if (pathMatch && pathMatch[1]) {
          packageName = pathMatch[1].trim();
          apkPath = line
            .replace(/^package:=?/, "")
            .split("=")[0]
            .trim();
        }
      }

      if (packageName && apkPath) {
        const isSystemApp = apkPath.includes("/system/");

        // Create basic package info
        const pkgInfo: PackageInfo = {
          name: packageName,
          isSystemApp,
          apkPath,
          versionName: "",
          versionCode: "",
          targetSdk: "",
        };

        packageList.push(pkgInfo);
      }
    }
  }

  // Get app names in batches to avoid overwhelming ADB
  const batchSize = 10;
  for (let i = 0; i < packageList.length; i += batchSize) {
    const batch = packageList.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (pkg) => {
        try {
          pkg.appName = await getAppName(pkg.name);
        } catch (error) {
          pkg.appName = pkg.name;
        }
      }),
    );
  }
  return packageList;
}

// Try to obtain a user-friendly app name from dumpsys; fallback to package name
export async function getAppName(packageName: string): Promise<string> {
  try {
    const result = await runAdbCommand(`shell dumpsys package ${packageName}`);
    if (!result.success || !result.output) return packageName;

    // common formats: application-label:'App Name' or application-label:"App Name" or application-label: App Name
    const labelMatch = result.output.match(/application-label(?::|=)\s*['\"]?([^'"\n]+)['\"]?/i);
    if (labelMatch && labelMatch[1]) return labelMatch[1].trim();

    // fallback: try to find "label=..." occurrences
    const altMatch = result.output.match(/label=([^\n\s]+)/i);
    if (altMatch && altMatch[1]) return altMatch[1].trim();

    return packageName;
  } catch (error) {
    return packageName;
  }
}

// Get detailed package info - only when needed
export async function getPackageDetails(packageName: string): Promise<Partial<PackageInfo>> {
  // Get version info
  const result = await runAdbCommand(`shell dumpsys package ${packageName}`);

  if (!result.success) {
    return {};
  }

  // Parse version info
  const versionName = result.output.match(/versionName=([^\s]+)/)?.[1] || "Unknown";
  const versionCode = result.output.match(/versionCode=([^\s]+)/)?.[1] || "Unknown";
  const targetSdk = result.output.match(/targetSdk=([^\s]+)/)?.[1] || "Unknown";
  const firstInstallTime = result.output.match(/firstInstallTime=([^\s]+)/)?.[1];
  const lastUpdateTime = result.output.match(/lastUpdateTime=([^\s]+)/)?.[1];

  // Get app data path
  const dataPathResult = await runAdbCommand(`shell pm path ${packageName}`);
  const dataPath = dataPathResult.success ? `/data/data/${packageName}` : undefined;

  return {
    versionName,
    versionCode,
    targetSdk,
    dataPath,
    firstInstallTime,
    lastUpdateTime,
  };
}

// Extract APK
export async function extractApk(packageInfo: PackageInfo): Promise<string> {
  const { outputDirectory } = getAdbPrefs();
  const expandedOutputDir = outputDirectory.replace(/^~/, process.env.HOME || "~");

  // Create output directory if it doesn't exist — ask for confirmation
  if (!fs.existsSync(expandedOutputDir)) {
    const confirmed = await confirmAlert({
      title: "Create output directory?",
      message: `The output directory ${expandedOutputDir} does not exist. Create it?`,
      primaryAction: {
        title: "Create",
      },
    });

    if (!confirmed) {
      throw new Error("Output directory does not exist.");
    }

    try {
      fs.mkdirSync(expandedOutputDir, { recursive: true });
    } catch (err) {
      throw new Error(`Failed to create output directory: ${(err as Error).message}`);
    }
  }

  const outputPath = path.join(expandedOutputDir, `${packageInfo.name}_${packageInfo.versionCode}.apk`);

  const result = await runAdbCommand(`pull ${packageInfo.apkPath} "${outputPath}"`);

  if (!result.success) {
    throw new Error(`Failed to extract APK: ${result.error}`);
  }

  return outputPath;
}

// Uninstall app
export async function uninstallApp(packageName: string): Promise<AdbCommandResult> {
  return runAdbCommand(`shell pm uninstall ${packageName}`);
}

// Clear app data
export async function clearAppData(packageName: string): Promise<AdbCommandResult> {
  return runAdbCommand(`shell pm clear ${packageName}`);
}

// Force stop app
export async function forceStopApp(packageName: string): Promise<AdbCommandResult> {
  return runAdbCommand(`shell am force-stop ${packageName}`);
}

// start app settings page
export async function launchAppSettings(packageName: string): Promise<AdbCommandResult> {
  return runAdbCommand(`shell am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:${packageName}`);
}

// Start app
export async function startApp(packageName: string): Promise<AdbCommandResult> {
  return runAdbCommand(`shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
}

// Get app files
export async function listAppFiles(packageName: string, dirPath?: string): Promise<AppFile[]> {
  const basePath = dirPath || `/data/data/${packageName}`;
  const result = await runAdbCommand(`shell ls -la ${basePath}`);

  if (!result.success) {
    throw new Error(`Failed to list files: ${result.error}`);
  }

  const lines = result.output.split("\n");
  const files: AppFile[] = [];

  // Skip first line (total)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("total")) continue;

    // Parse ls -la output
    const parts = line.split(/\s+/);
    if (parts.length < 8) continue;

    const isDirectory = parts[0].startsWith("d");
    const name = parts.slice(8).join(" ");

    // Skip . and ..
    if (name === "." || name === "..") continue;

    files.push({
      name,
      path: `${basePath}/${name}`,
      isDirectory,
      size: parts[4],
      date: `${parts[5]} ${parts[6]} ${parts[7]}`,
    });
  }

  return files;
}

// Pull file from device
export async function pullFile(filePath: string): Promise<string> {
  const { outputDirectory } = getAdbPrefs();
  const expandedOutputDir = outputDirectory.replace(/^~/, process.env.HOME || "~");

  if (!fs.existsSync(expandedOutputDir)) {
    fs.mkdirSync(expandedOutputDir, { recursive: true });
  }

  const fileName = path.basename(filePath);
  const outputPath = path.join(expandedOutputDir, fileName);

  const result = await runAdbCommand(`pull "${filePath}" "${outputPath}"`);

  if (!result.success) {
    throw new Error(`Failed to pull file: ${result.error}`);
  }

  return outputPath;
}

// Get logcat
export async function resolveAdbPath(): Promise<string | null> {
  const { adbPath } = getAdbPrefs();

  // If adbPath looks like an absolute or relative path, check it directly
  if (adbPath.includes("/") || adbPath.includes("\\")) {
    if (fs.existsSync(adbPath)) {
      return adbPath;
    }
    return null;
  }

  // Otherwise try to find adb in PATH using command -v
  try {
    const { stdout } = await execAsync("command -v adb");
    const p = (stdout || "").trim();
    if (p) return p;
  } catch (err) {
    // ignore
  }

  return null;
}

export async function getLogcat(filter?: LogcatFilter): Promise<string> {
  let command = "logcat -d";
  let postFilterByPackage = "";

  if (filter) {
    if (filter.packageName) {
      // Try to get PID for the package; some Android versions may not have pidof
      const pidResult = await runAdbCommand(`shell pidof ${filter.packageName}`);
      if (pidResult.success && pidResult.output) {
        // pidof may return multiple PIDs; take the first one
        const pid = pidResult.output.split(/[\s,]+/)[0].trim();
        if (pid) {
          command += ` --pid=${pid}`;
        } else {
          // Fall back to post-filtering by package name in the output
          postFilterByPackage = filter.packageName;
        }
      } else {
        // pidof not available or returned nothing: we'll post-filter
        postFilterByPackage = filter.packageName;
      }
    } else if (filter.pid) {
      command += ` --pid=${filter.pid}`;
    }

    if (filter.tag) {
      command += ` ${filter.tag}:${filter.level}`;
    } else {
      command += ` *:${filter.level}`;
    }
  }

  const result = await runAdbCommand(command);
  if (!result.success) {
    return "";
  }

  let output = result.output || "";

  // If we couldn't pin by PID, filter lines that contain the package name
  if (postFilterByPackage) {
    const lines = output.split("\n");
    output = lines.filter((l) => l.includes(postFilterByPackage)).join("\n");
  }

  return output;
}

// Install APK
export async function installApk(apkPath: string): Promise<AdbCommandResult> {
  return runAdbCommand(`install -r "${apkPath}"`);
}

// Enable/disable package
export async function setPackageEnabled(packageName: string, enabled: boolean): Promise<AdbCommandResult> {
  const flag = enabled ? "enable" : "disable";
  return runAdbCommand(`shell pm ${flag} ${packageName}`);
}

// Disassemble DEX (requires external tools)
export async function disassembleDex(apkPath: string): Promise<AdbCommandResult> {
  // This would require jadx or similar to be installed
  try {
    const { outputDirectory } = getAdbPrefs();
    const expandedOutputDir = outputDirectory.replace(/^~/, process.env.HOME || "~");
    const outputPath = path.join(expandedOutputDir, path.basename(apkPath, ".apk") + "_src");

    const { stdout } = await execAsync(`jadx -d "${outputPath}" "${apkPath}"`);
    return { success: true, output: stdout };
  } catch (error) {
    return { success: false, output: "", error: (error as Error).message };
  }
}

// Add shortcuts to common folders
export function getCommonDataFolders(packageName: string): { name: string; path: string }[] {
  return [
    { name: "Shared Preferences", path: `/data/data/${packageName}/shared_prefs` },
    { name: "Databases", path: `/data/data/${packageName}/databases` },
    { name: "Cache", path: `/data/data/${packageName}/cache` },
    { name: "Files", path: `/data/data/${packageName}/files` },
    { name: "External Files", path: `/sdcard/Android/data/${packageName}/files` },
    { name: "External Cache", path: `/sdcard/Android/data/${packageName}/cache` },
  ];
}

// Get app permissions
export async function getAppPermissions(packageName: string): Promise<string[]> {
  const result = await runAdbCommand(`shell dumpsys package ${packageName} | grep permission`);

  if (!result.success) {
    return [];
  }

  const lines = result.output.split("\n");
  return lines
    .filter((line) => line.includes("permission.") || line.includes("android.permission."))
    .map((line) => {
      // Extract permission name
      const match = line.match(/android\.permission\.([A-Z_]+)/);
      return match ? match[0] : line.trim();
    });
}

// Get app activities
export async function getAppActivities(packageName: string): Promise<string[]> {
  const result = await runAdbCommand(`shell dumpsys package ${packageName} | grep Activity`);

  if (!result.success) {
    return [];
  }

  const lines = result.output.split("\n");
  return lines.filter((line) => line.includes("Activity") && !line.includes("ActivityInfo")).map((line) => line.trim());
}

// Get app services
export async function getAppServices(packageName: string): Promise<string[]> {
  const result = await runAdbCommand(`shell dumpsys package ${packageName} | grep Service`);

  if (!result.success) {
    return [];
  }

  const lines = result.output.split("\n");
  return lines.filter((line) => line.includes("Service")).map((line) => line.trim());
}
