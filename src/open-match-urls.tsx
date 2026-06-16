import { showHUD, getPreferenceValues } from "@raycast/api";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

type Preferences = {
  copyMatch: string;
};

const getChromeTabsUrls = async (): Promise<string[]> => {
  const script = `
    tell application "Google Chrome"
      set theURLs to {}
      repeat with aTab in (get tabs of window 1)
        set the end of theURLs to URL of aTab
      end repeat
      return theURLs
    end tell
  `;
  const { stdout } = await execPromise(`osascript -e '${script}'`);
  return stdout
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

export default async function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const match = (prefs.copyMatch || "").trim();

  try {
    if (!match) {
      await showHUD("No match string configured in preferences.");
      return;
    }

    const urls = await getChromeTabsUrls();
    const matched = urls.filter((u) => u.includes(match));

    if (matched.length === 0) {
      await showHUD("No matching Chrome tab URLs found to open.");
      return;
    }

    for (const url of matched) {
      await execPromise(`open "${url}"`);
    }

    await showHUD(`${matched.length} matching URL(s) opened in your browser.`);
  } catch (error) {
    console.error(error);
    await showHUD("Failed to open matching URLs.");
  }
}
