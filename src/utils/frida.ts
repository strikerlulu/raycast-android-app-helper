import { exec } from "child_process";
import { promisify } from "util";
import { getPreferenceValues } from "@raycast/api";
import { PackageInfo } from "../types";
import { logError } from "./debugger";
import path from "path";

const execAsync = promisify(exec);

interface Preferences {
  fridaBinPath?: string;
}

// Get the Frida binary path
function getFridaPath(): string {
  const prefs = getPreferenceValues<Preferences>();
  if (prefs.fridaBinPath) {
    // Join the directory path with 'frida'
    return path.join(prefs.fridaBinPath, "frida");
  }
  return "frida"; // Default to "frida" from PATH if no directory specified
}

// Get the Frida-ps binary path
function getFridaPsPath(): string {
  const prefs = getPreferenceValues<Preferences>();
  if (prefs.fridaBinPath) {
    // Join the directory path with 'frida-ps'
    return path.join(prefs.fridaBinPath, "frida-ps");
  }
  return "frida-ps"; // Default to "frida-ps" from PATH if no directory specified
}

// Check if Frida is installed
export async function checkFrida(): Promise<boolean> {
  try {
    const fridaPath = getFridaPath();
    await execAsync(`"${fridaPath}" --version`);
    return true;
  } catch (error) {
    return false;
  }
}

// Get apps using Frida
export async function getFridaApps(): Promise<PackageInfo[]> {
  try {
    // Check if frida is available
    const fridaAvailable = await checkFrida();
    if (!fridaAvailable) {
      throw new Error(
        "Frida is not installed or the path is incorrect. Install frida-tools (pip install frida-tools) or set the Frida Binaries Path preference to the directory containing frida and frida-ps.",
      );
    }

    // Run frida-ps to get the list of apps
    const fridaPsPath = getFridaPsPath();
    let stdout = "";
    try {
      const result = await execAsync(`"${fridaPsPath}" -Uai`);
      stdout = result.stdout || "";
    } catch (err) {
      // Provide a clearer message when devices are missing or frida cannot connect
      const msg = (err as Error).message || String(err);
      if (msg.includes("unable to connect") || msg.includes("no devices") || msg.includes("failed to connect")) {
        throw new Error(
          "No devices/emulator detected or frida cannot connect. Connect a device or start an emulator and ensure frida-server is running on the device.",
        );
      }
      throw err;
    }

    // If frida-ps produced no output, likely no device or frida-server not running
    if (!stdout.trim()) {
      throw new Error(
        "No devices/emulator detected or frida-server not running on device. Connect a device or start an emulator and ensure frida-server is running.",
      );
    }

    // Parse the output
    const lines = stdout.trim().split("\n");
    const packageList: PackageInfo[] = [];

    // Skip the header line and parse each application line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Frida output format:
      // PID  Name                  Identifier
      // ---  --------------------  ----------------
      // 123  App Name              com.package.name

      const match = line.match(/^\s*(\d+|-)\s+(.{1,20})\s+([a-zA-Z0-9_.]+)$/);
      if (match) {
        const appName = match[2].trim();
        const packageName = match[3].trim();

        packageList.push({
          name: packageName,
          appName: appName,
          isSystemApp: false, // We'll determine this later
          apkPath: "", // We'll fill this in later if needed
          versionName: "",
          versionCode: "",
          targetSdk: "",
        });
      } else {
        // Try alternate regex for different frida output format
        const altMatch = line.match(/^\s*(\d+|-)\s+(.+?)\s{2,}([a-zA-Z0-9_.]+)$/);
        if (altMatch) {
          const appName = altMatch[2].trim();
          const packageName = altMatch[3].trim();

          packageList.push({
            name: packageName,
            appName: appName,
            isSystemApp: false,
            apkPath: "",
            versionName: "",
            versionCode: "",
            targetSdk: "",
          });
        }
      }
    }

    return packageList;
  } catch (error) {
    logError("Failed to get apps using Frida", error);
    throw error;
  }
}

// Match Frida app names with our existing app list
export async function enrichPackagesWithFridaNames(packages: PackageInfo[]): Promise<PackageInfo[]> {
  try {
    const fridaApps = await getFridaApps();

    // Create a map of package name to app name from Frida
    const fridaAppMap = new Map<string, string>();
    for (const app of fridaApps) {
      if (app.name && app.appName) {
        fridaAppMap.set(app.name, app.appName);
      }
    }

    // Enrich our package list with app names from Frida
    for (const pkg of packages) {
      if (fridaAppMap.has(pkg.name)) {
        pkg.appName = fridaAppMap.get(pkg.name) || pkg.appName;
      }
    }

    return packages;
  } catch (error) {
    logError("Failed to enrich packages with Frida app names", error);
    // Don't throw, just return the original packages
    return packages;
  }
}
