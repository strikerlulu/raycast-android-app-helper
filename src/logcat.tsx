import { Detail, ActionPanel, Action, Icon, Form, showToast, Toast, Color } from "@raycast/api";
import { useEffect, useState, useRef } from "react";
import { getLogcat, runAdbCommand, checkAdb, getConnectedDevices, getAdbPrefs } from "./utils/adb";
import { LogcatFilter } from "./types";
import { spawn, ChildProcess } from "child_process";

interface FormValues {
  packageName: string;
  tag: string;
  level: string;
  clearFirst: boolean;
  search: string;
}

type Args = { packageName?: string };

export default function LogcatCommand(props?: { arguments?: Args }) {
  const initialPackage = props?.arguments?.packageName;
  const [isLoading, setIsLoading] = useState(true);
  const [logOutput, setLogOutput] = useState<string>("");
  const [filter, setFilter] = useState<LogcatFilter>(() => ({ level: "V", packageName: initialPackage }));
  const [error, setError] = useState<string | null>(null);
  const [runningCapture, setRunningCapture] = useState(false);
  const [lastAdbCommand, setLastAdbCommand] = useState<string | null>(null);
  const streamRef = useRef<ChildProcess | null>(null);
  const streamBufferRef = useRef<string>("");
  const currentFilterRef = useRef<LogcatFilter>(filter);

  // Keep ref in sync for streaming callbacks
  useEffect(() => {
    currentFilterRef.current = filter;
  }, [filter]);

  // Fetch logcat with current filter
  const fetchLogcat = async (clear = false) => {
    try {
      setIsLoading(true);

      const adbAvailable = await checkAdb();
      if (!adbAvailable) {
        throw new Error("ADB not found. Install Android Platform Tools or set ADB Path in preferences.");
      }

      const devices = await getConnectedDevices();
      if (devices.length === 0) {
        throw new Error("No Android devices/emulators connected.");
      }

      // Clear logcat first if requested
      if (clear) {
        await runAdbCommand("logcat -c");
      }

      // Determine PID mode for header and build adb command string for visibility
      let pidUsed = false;
      let adbCommandStr = "";
      const resolvedAdb = await (await import("./utils/adb")).resolveAdbPath().catch(() => null);
      const prefsAdb = getAdbPrefs().adbPath || "adb";
      // Build command args in correct order: logcat -d [filters]
      const args: string[] = ["logcat", "-d"];

      if (filter) {
        if (filter.packageName) {
          const pidResult = await runAdbCommand(`shell pidof ${filter.packageName}`);
          if (pidResult.success && pidResult.output) {
            pidUsed = true;
            const pid = pidResult.output.split(/[\s,]+/)[0].trim();
            if (pid) args.push(`--pid=${pid}`);
          }
        }

        if (filter.tag) {
          args.push(`${filter.tag}:${filter.level}`);
        } else {
          args.push(`*:${filter.level}`);
        }
      }

      // Show an adb command string even if resolvedAdb is null, to aid debugging
      adbCommandStr = `${resolvedAdb || prefsAdb} ${args.filter(Boolean).join(" ")}`;
      setLastAdbCommand(adbCommandStr);

      const output = await getLogcat(filter);

      // Apply client-side search filter if provided
      const search = filter.search?.trim();
      let filteredOutput = output;
      if (search) {
        const lines = output.split("\n");
        filteredOutput = lines.filter((l) => l.toLowerCase().includes(search.toLowerCase())).join("\n");
      }

      // Format the output with colors
      const formattedOutput = formatLogcat(filteredOutput);

      // Prepend header about what is being shown
      const header = `Showing logs for: ${filter.packageName || "all logs"} ${pidUsed ? "(PID filter)" : ""}`;
      setLogOutput(`**${header}**\n\n` + formattedOutput);
      setError(null);

      // Notify user that filter was applied
      await showToast({
        style: Toast.Style.Success,
        title: "Filter applied",
        message: `${filteredOutput.split("\n").filter(Boolean).length} lines`,
      });
    } catch (error) {
      setError((error as Error).message);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch logcat",
        message: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Format logcat output with colors
  const formatLogcat = (output: string): string => {
    // Convert logcat output to markdown with color syntax
    const lines = output.split("\n");
    let markdown = "";

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line) continue;

      // Special separator lines produced by logcat
      if (line.startsWith("--------- beginning")) {
        markdown += `\n**${line.replace(/-+/g, "-")}**\n`;
        continue;
      }

      if (line.includes(" E ")) {
        // Error
        markdown += `🔴 ${line}\n`;
      } else if (line.includes(" W ")) {
        // Warning
        markdown += `🟠 ${line}\n`;
      } else if (line.includes(" I ")) {
        // Info
        markdown += `🟢 ${line}\n`;
      } else if (line.includes(" D ")) {
        // Debug
        markdown += `🔵 ${line}\n`;
      } else if (line.includes(" V ")) {
        // Verbose
        markdown += `⚪ ${line}\n`;
      } else {
        markdown += `${line}\n`;
      }
    }

    return markdown;
  };

  // Start/stop continuous capture
  const toggleContinuousCapture = async () => {
    if (runningCapture) {
      // Stop streaming
      const proc = streamRef.current;
      if (proc) {
        proc.kill();
        streamRef.current = null;
      }
      streamBufferRef.current = "";
      setRunningCapture(false);
      await showToast({
        style: Toast.Style.Success,
        title: "Logcat Capture Stopped",
      });
      return;
    }

    try {
      const adbAvailable = await checkAdb();
      if (!adbAvailable) {
        throw new Error("ADB not found. Install Android Platform Tools or set ADB Path in preferences.");
      }

      const devices = await getConnectedDevices();
      if (devices.length === 0) {
        throw new Error("No Android devices/emulators connected.");
      }

      // Resolve adb path (either configured or from PATH)
      const resolvedAdb = await (await import("./utils/adb")).resolveAdbPath().catch(() => null);
      if (!resolvedAdb) {
        await showToast({
          style: Toast.Style.Failure,
          title: "ADB not found",
          message:
            "ADB executable not found. Install Android Platform Tools (brew install --cask android-platform-tools) or set ADB Path in extension preferences.",
        });
        return;
      }

      // Build adb logcat args
      const args: string[] = ["logcat"];
      // Filtering by package is handled client-side if pid lookup fails

      if (filter) {
        if (filter.packageName) {
          const pidResult = await runAdbCommand(`shell pidof ${filter.packageName}`);
          if (pidResult.success && pidResult.output) {
            const pid = pidResult.output.split(/[\s,]+/)[0].trim();
            if (pid) {
              args.push(`--pid=${pid}`);
            }
            // otherwise fall back to client-side filtering
          }
        }

        if (filter.tag) {
          args.push(`${filter.tag}:${filter.level}`);
        } else {
          args.push(`*:${filter.level}`);
        }
      }

      // Spawn adb logcat to stream
      let proc: ChildProcess;
      try {
        proc = spawn(resolvedAdb, args, { stdio: ["ignore", "pipe", "pipe"] });
      } catch (spawnErr) {
        console.error("Failed to spawn adb:", spawnErr);
        const code = (spawnErr as unknown as { code?: string })?.code;
        if (code === "ENOENT") {
          await showToast({
            style: Toast.Style.Failure,
            title: "ADB not found",
            message:
              "ADB executable not found. Install Android Platform Tools (brew install --cask android-platform-tools) or set ADB Path in extension preferences.",
          });
          return;
        }
        throw spawnErr;
      }

      streamRef.current = proc;
      streamBufferRef.current = "";
      setLogOutput("");

      const stdoutStream = proc.stdout;
      if (stdoutStream) {
        stdoutStream.on("data", (chunk: Buffer) => {
          try {
            const text = chunk.toString("utf8");
            // Accumulate buffer to handle partial lines
            streamBufferRef.current += text;
            const parts = streamBufferRef.current.split("\n");
            streamBufferRef.current = parts.pop() || ""; // last partial line

            if (parts.length > 0) {
              // Optionally apply client-side search filtering
              const search = currentFilterRef.current?.search?.trim();
              let linesToProcess = parts;
              if (search) {
                const lower = search.toLowerCase();
                linesToProcess = parts.filter((l) => l.toLowerCase().includes(lower));
              }

              if (linesToProcess.length > 0) {
                // Format the lines and append
                const formatted = formatLogcat(linesToProcess.join("\n"));
                setLogOutput((prev) => {
                  const combined = prev + formatted;
                  // Keep the last 20000 chars to avoid memory growth
                  return combined.length > 20000 ? combined.slice(-20000) : combined;
                });
              }
            }
          } catch (err) {
            console.error("Error processing log stream chunk", err);
          }
        });
      }

      const stderrStream = proc.stderr;
      if (stderrStream) {
        stderrStream.on("data", (chunk: Buffer) => {
          console.error("adb logcat stderr:", chunk.toString("utf8"));
        });
      }

      proc.on("error", async (err) => {
        console.error("Failed to start adb logcat", err);
        await showToast({ style: Toast.Style.Failure, title: "Failed to start logcat", message: String(err) });
        streamRef.current = null;
        setRunningCapture(false);
      });

      proc.on("close", () => {
        streamRef.current = null;
        setRunningCapture(false);
      });

      setRunningCapture(true);
      await showToast({ style: Toast.Style.Success, title: "Logcat Capture Started", message: "Streaming live logs" });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to start capture",
        message: (error as Error).message,
      });
    }
  };

  // Filter form submission
  const handleFilterSubmit = async (values: FormValues) => {
    const newFilter: LogcatFilter = {
      level: values.level as "V" | "D" | "I" | "W" | "E" | "F" | "S",
    };

    if (values.packageName) {
      newFilter.packageName = values.packageName;
    } else {
      newFilter.packageName = undefined;
    }

    if (values.tag) {
      newFilter.tag = values.tag;
    } else {
      newFilter.tag = undefined;
    }

    if (values.search) {
      newFilter.search = values.search;
    } else {
      newFilter.search = undefined;
    }

    // If streaming is active, apply filter live without restarting the stream
    const proc = streamRef.current;
    setFilter(newFilter);

    if (proc) {
      // update current filter ref so streaming handler applies search and tag changes
      currentFilterRef.current = newFilter;
      await showToast({ style: Toast.Style.Success, title: "Live filter applied" });
      return;
    }

    // No stream active — fetch once with new filter
    await fetchLogcat(values.clearFirst);
  };

  // Initial fetch
  useEffect(() => {
    fetchLogcat(true);

    // Cleanup stream on unmount
    return () => {
      const proc = streamRef.current;
      if (proc) {
        proc.kill();
        streamRef.current = null;
      }
    };
  }, []);

  // FilterForm component
  const FilterForm = () => (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Apply Filter" onSubmit={handleFilterSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="packageName" title="Package Name" placeholder="com.example.app (optional)" />

      <Form.TextField id="tag" title="Tag" placeholder="ActivityManager (optional)" />

      <Form.TextField id="search" title="Search / Filter" placeholder="Text to search for in log lines (optional)" />

      <Form.Dropdown id="level" title="Log Level" defaultValue="V">
        <Form.Dropdown.Item value="V" title="Verbose" icon={{ source: Icon.Circle, tintColor: Color.SecondaryText }} />
        <Form.Dropdown.Item value="D" title="Debug" icon={{ source: Icon.Circle, tintColor: Color.Blue }} />
        <Form.Dropdown.Item value="I" title="Info" icon={{ source: Icon.Circle, tintColor: Color.Green }} />
        <Form.Dropdown.Item value="W" title="Warning" icon={{ source: Icon.Circle, tintColor: Color.Yellow }} />
        <Form.Dropdown.Item value="E" title="Error" icon={{ source: Icon.Circle, tintColor: Color.Red }} />
        <Form.Dropdown.Item value="F" title="Fatal" icon={{ source: Icon.Circle, tintColor: Color.Magenta }} />
        <Form.Dropdown.Item value="S" title="Silent" icon={{ source: Icon.Circle, tintColor: Color.SecondaryText }} />
      </Form.Dropdown>

      <Form.Checkbox id="clearFirst" label="Clear Logcat First" defaultValue={false} />
    </Form>
  );

  return (
    <Detail
      isLoading={isLoading}
      markdown={
        error
          ? `# Error\n${error}`
          : `# Logcat Output\n\n\`\`\`\n${logOutput || "No logs found or filter too restrictive"}\n\`\`\``
      }
      actions={
        <ActionPanel>
          <Action
            title={runningCapture ? "Stop Capture" : "Start Continuous Capture"}
            icon={runningCapture ? Icon.Stop : Icon.Play}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={toggleContinuousCapture}
          />

          <Action
            title="Refresh Logcat"
            icon={Icon.Redo}
            shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            onAction={() => fetchLogcat(false)}
          />

          {lastAdbCommand && (
            <Action.CopyToClipboard
              title="Copy Adb Command"
              content={lastAdbCommand}
              shortcut={{ modifiers: ["cmd", "shift"], key: "y" }}
            />
          )}
          <Action
            title="Clear and Refresh"
            icon={Icon.Trash}
            shortcut={{ modifiers: ["cmd", "ctrl"], key: "r" }}
            onAction={() => fetchLogcat(true)}
          />

          <Action.Push
            title="Filter Logcat"
            icon={Icon.Filter}
            shortcut={{ modifiers: ["cmd"], key: "f" }}
            target={<FilterForm />}
          />

          <Action.CopyToClipboard
            title="Copy Logcat"
            content={logOutput}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />

          <Action
            title="Save to File"
            icon={Icon.SaveDocument}
            shortcut={{ modifiers: ["cmd"], key: "s" }}
            onAction={async () => {
              // Save to a file in the output directory
              const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
              const pkg = filter.packageName ? `_${filter.packageName}` : "";
              const fileName = `logcat${pkg}_${timestamp}.txt`;

              try {
                const { outputDirectory } = { outputDirectory: "~/Downloads/android-re" };
                const expandedOutputDir = outputDirectory.replace(/^~/, process.env.HOME || "~");

                const result = await runAdbCommand(`logcat -d > "${expandedOutputDir}/${fileName}"`);

                if (!result.success) {
                  throw new Error(result.error);
                }

                await showToast({
                  style: Toast.Style.Success,
                  title: "Logcat Saved",
                  message: fileName,
                });
              } catch (error) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Failed to save logcat",
                  message: (error as Error).message,
                });
              }
            }}
          />
        </ActionPanel>
      }
    />
  );
}
