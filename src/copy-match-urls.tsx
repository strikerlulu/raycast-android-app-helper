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
    const urls = await getChromeTabsUrls();
    const matchedFromChrome = match ? urls.filter((url) => url.includes(match)) : [];

    if (matchedFromChrome.length > 0) {
      const output = matchedFromChrome.join("\n");
      await execPromise(`echo "${output}" | pbcopy`);
      await showHUD(`${matchedFromChrome.length} matching URL(s) copied to clipboard.`);
    } else {
      await showHUD("No matching URLs found in your Chrome tabs.");
    }
  } catch (error) {
    console.error(error);
    await showHUD("Failed to fetch URLs.");
  }
}
