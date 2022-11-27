import { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
} from "vscode-languageclient/node";
import * as path from "path";
import { promises as fs } from "fs";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";

class ProcessingLanguageServerClient {
  readonly logOutputConsole = vscode.window.createOutputChannel(
    "processing-language-server"
  );
  languageServerProcess: ChildProcessWithoutNullStreams | null = null;
  languageClient: LanguageClient | null = null;
  readonly configSection = "processing-language-server";
  config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
    this.configSection
  );
  processingVersion = "";

  async reloadConfig(context: ExtensionContext) {
    await this.languageServerStop();
    this.config = vscode.workspace.getConfiguration(this.configSection);
    await this.loadProcessingVersion();
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

  async languageServerStop() {
    if (this.languageClient !== null) {
      await this.languageClient.stop();
      this.languageClient = null;
    }

    if (this.languageServerProcess !== null) {
      this.languageServerProcess.kill();
      this.languageServerProcess = null;
    }
  }

  async languageServerStart() {
    await this.languageServerStop();

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
        this.logOutputConsole.appendLine(`Starting language server`);

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

        this.languageServerProcess = spawn(javaPath, [
          "-Djna.nosys=true",
          "-Djava.awt.headless=true",
          "-classpath",
          classpath,
          "processing.mode.java.languageServer.App",
        ]);

        return this.languageServerProcess;
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
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "processing-language-server.restart",
      () => {
        client.languageServerStart();
      }
    )
  );
  await this.loadProcessingVersion();
  await client.languageServerStart();
}

export async function deactivate(): Promise<void> {
  await client.languageServerStop();
}
