import { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import * as os from "os";
import {
  LanguageClient,
  LanguageClientOptions,
} from "vscode-languageclient/node";
import * as path from "path";
import { promises as fs } from "fs";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as net from "net";
import axios from "axios";
import * as https from "https";
import * as fsLegacy from "fs";

class ProcessingLanguageServerClient {
  readonly logOutputConsole = vscode.window.createOutputChannel(
    "processing-language-server"
  );
  languageServerProcess: ChildProcessWithoutNullStreams | null = null;
  languageClient: LanguageClient | null = null;
  languageServerConn: net.Socket | null = null;
  readonly configSection = "processing-language-server";
  config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
    this.configSection
  );
  processingVersion = "";

  async reloadConfig(context: ExtensionContext) {
    await this.languageServerStop();
    this.config = vscode.workspace.getConfiguration(this.configSection);
    await this.loadProcessingVersion();
    await client.updateLanguageServer(context);
    await client.languageServerStart();
  }

  async loadProcessingVersion() {
    const processingPath = this.config.get<string>("processingPath")!;
    try {
      this.processingVersion = await fs.readFile(
        process.platform === "darwin"
          ? path.join(processingPath, "Contents", "Java", "lib", "version.txt")
          : path.join(processingPath, "lib", "version.txt"),
        { encoding: "utf-8" }
      );
    } catch (e) {
      await vscode.window.showErrorMessage(
        `Processing path: '${processingPath}' is invalid. Please set the correct path to 'processing-language-server.processingPath' and reload.`
      );
    }
  }

  async updateLanguageServer(context: ExtensionContext) {
    const autoUpdate = this.config.get<boolean>("autoUpdate")!;
    if (!autoUpdate) {
      return;
    }

    const languageServerDir = path.join(
      context.globalStoragePath,
      "processing-language-server"
    );

    try {
      await fs.mkdir(context.globalStoragePath);
    } catch {}

    try {
      await fs.mkdir(languageServerDir);
    } catch {}

    const installedVersions = new Set(
      (await fs.readdir(languageServerDir))
        .filter((x) => x.endsWith(".jar"))
        .map((x) => x.substring(0, x.length - 4))
    );

    let remoteVersions: string[];
    try {
      remoteVersions = await axios
        .get(
          "https://api.github.com/repos/kgtkr/processing-language-server/git/trees/bin"
        )
        .then((res) => res.data)
        .then((json: { tree: Array<{ path: string }> }) =>
          json.tree
            .map((x) => x.path)
            .filter((x) => x.endsWith(".jar"))
            .map((x) => x.substring(0, x.length - 4))
        );
    } catch {
      return;
    }

    const filteredRemoteVersions = remoteVersions
      .filter((x) => {
        const allowVersion = x.split("-")[0];
        return (
          this.processingVersion === allowVersion ||
          this.processingVersion.startsWith(allowVersion + ".")
        );
      })
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));

    const newVersion: string | undefined = filteredRemoteVersions[0];

    if (newVersion === undefined) {
      await vscode.window.showErrorMessage(
        `Processing version: ${this.processingVersion} is not supported. Maybe it works if you install it manually.`
      );
      return;
    }

    const newVersionPath = path.join(languageServerDir, `${newVersion}.jar`);
    const newVersionUrl = `https://raw.githubusercontent.com/kgtkr/processing-language-server/bin/${newVersion}.jar`;

    if (!installedVersions.has(newVersion)) {
      try {
        const tmp = path.join(
          await fs.mkdtemp(
            path.join(os.tmpdir(), "processing-language-server-")
          ),
          "processing-language-server.jar"
        );

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Updating Processing Language Server",
            cancellable: false,
          },
          async (progress) => {
            await new Promise((resolve, reject) => {
              https.get(newVersionUrl, (res) => {
                let downloadSize = 0;
                const file = fsLegacy.createWriteStream(tmp);
                res.pipe(file);
                file.on("finish", async () => {
                  resolve(undefined);
                });
                res.on("data", (chunk: Buffer) => {
                  downloadSize += chunk.byteLength;
                  progress.report({
                    message: `${downloadSize / 1000}KB`,
                  });
                });
                res.on("error", (e) => {
                  reject(e);
                });
              });
            });
          }
        );

        await fs.rename(tmp, newVersionPath);

        vscode.window.showInformationMessage(
          `Processing Language Server is updated.`
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `Failed to update Processing Language Server: ${e}`
        );
        return;
      }
    }

    await this.config.update(
      "languageServerPath",
      newVersionPath,
      vscode.ConfigurationTarget.Global
    );
  }

  async languageServerStop() {
    if (this.languageClient !== null) {
      await this.languageClient.stop();
      this.languageClient = null;
    }

    if (this.languageServerConn !== null) {
      this.languageServerConn.destroy();
      this.languageServerConn = null;
    }

    if (this.languageServerProcess !== null) {
      this.languageServerProcess.kill();
      this.languageServerProcess = null;
    }
  }

  async languageServerStart() {
    await this.languageServerStop();

    const languageServerPath = this.config.get<string>("languageServerPath")!;
    const processingPath = this.config.get<string>("processingPath")!;

    let classpath = "";

    const addJars = async (dir: string) => {
      const classPathSeparator = process.platform === "win32" ? ";" : ":";
      const absDir = path.join(processingPath, dir);
      const names = await fs.readdir(absDir);
      const jars = names
        .filter((name) => name.endsWith(".jar"))
        .map((name) => path.join(absDir, name));
      for (const jar of jars) {
        classpath += jar + classPathSeparator;
      }
    };

    if (process.platform === "darwin") {
      await addJars(path.join("Contents", "Java"));
      await addJars(path.join("Contents", "Java", "core", "library"));
      await addJars(path.join("Contents", "Java", "modes", "java", "mode"));
    } else {
      await addJars("lib");
      await addJars(path.join("core", "library"));
      await addJars(path.join("modes", "java", "mode"));
    }
    classpath += languageServerPath;

    this.logOutputConsole.append("classpath:" + classpath);

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: "file", language: "processing" }],
      synchronize: {
        fileEvents: [
          vscode.workspace.createFileSystemWatcher("**/*.pde"),
          vscode.workspace.createFileSystemWatcher("**/*.java"),
        ],
      },
    };

    this.languageClient = new LanguageClient(
      "processing-language-server",
      "ProcessingLanguageServer",
      async () => {
        const port = Math.floor(Math.random() * (65535 - 1024) + 1024);
        let ready = false;

        this.logOutputConsole.appendLine(
          `Starting language server. Port: ${port}`
        );

        const javaPath = await (async () => {
          switch (process.platform) {
            case "win32":
              return path.join(processingPath, "java", "bin", "java.exe");
            case "linux":
              return path.join(processingPath, "java", "bin", "java");
            case "darwin":
              const path1 = path.join(processingPath, "Contents", "PlugIns");
              const path2 = (await fs.readdir(path1))[0];
              const path3 = path.join("Contents", "Home", "bin", "java");
              return path.join(path1, path2, path3);
            default:
              throw new Error("Unsupported platform");
          }
        })();

        await new Promise((resolve) => {
          this.languageServerProcess = spawn(javaPath, [
            "-Djna.nosys=true",
            "-classpath",
            classpath,
            "net.kgtkr.processingLanguageServer.main",
            String(port),
          ]);

          this.languageServerProcess.stdout.on("data", (data) => {
            this.logOutputConsole.appendLine("[stdout]" + data.toString());

            if (!ready && data.toString().includes("Ready")) {
              ready = true;
              resolve(undefined);
            }
          });

          this.languageServerProcess.stderr.on("data", (data) => {
            this.logOutputConsole.appendLine("[stderr]" + data.toString());
          });

          this.languageServerProcess.on("close", () => {
            this.logOutputConsole.appendLine("[close]");
          });
        });

        this.languageServerConn = net.connect({ port });
        return {
          reader: this.languageServerConn,
          writer: this.languageServerConn,
        };
      },
      clientOptions
    );

    this.languageClient.start();
  }
}

const client = new ProcessingLanguageServerClient();

export async function activate(context: ExtensionContext): Promise<void> {
  vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (event.affectsConfiguration(client.configSection)) {
      await client.reloadConfig(context);
    }
  });
  await client.loadProcessingVersion();
  await client.updateLanguageServer(context);
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "processing-language-server.restart",
      () => {
        client.languageServerStart();
      }
    )
  );

  await client.languageServerStart();
}

export async function deactivate(): Promise<void> {
  await client.languageServerStop();
}
