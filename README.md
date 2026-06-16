# Android App Helper (Raycast)

Android App Helper provides a small set of device utilities for Android developers and power users inside Raycast.

## Features

- Copy Match URLs: copy Chrome tab URLs that include a configured match string (e.g., a screenshot domain)
- Open Match URLs: open Chrome tab URLs that include the configured match string
- Logcat Viewer: view and stream device logs with filtering by package, tag, or level
- Android App List: list apps; optionally uses Frida (when available) to show friendly app names
- APK extraction and basic app management (extract, launch, clear data, uninstall)

## Shortcuts (examples)
- Copy Package Name: ⌘⇧P
- Launch App: ⌘O
- Launch App Settings: ⌘L
- Extract APK: ⌘E
- Clear App Data: ⌘⇧X
- Start/Stop Live Logcat: ⌘R

## Prerequisites

- Raycast installed on macOS
- Android SDK Platform Tools (adb) available (set ADB Path in preferences if needed)
- For Frida-backed app names: install frida-tools (pip install frida-tools) or set Frida Binaries Path in preferences

## Installation

1. Clone this repository:
```bash
git clone git@github.com:strikerlulu/raycast-android-app-helper.git
cd raycast-android-app-helper
```

2. Install dependencies:
```bash
npm install
```

3. Develop or build:
```bash
npm run dev    # for development
npm run build  # to build the extension
```

## Configuration (Raycast Preferences)
- copyMatch: domain or substring to match in Chrome tabs (default: screenshot.googleplex.com)
- outputDirectory: directory for extracted files (default: ~/Downloads/android-re)
- adbPath: custom adb executable path
- fridaBinPath: optional path to frida and frida-ps binaries
- showNotifications: enable/disable notifications

## Notes & Privacy
- All operations are local (adb, frida, and local commands). No network uploads are performed by the extension.
- The extension reads Chrome tab URLs using AppleScript — Chrome must be installed and accessible.

## TODO
- Add explicit reverse-engineering tooling section (disassembly, deeper analysis) — gated behind optional tools and opt-in features.

## License

MIT
