import { ExtensionContext } from "vscode";
import * as vscode from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
} from "vscode-languageclient/node";
import * as path from "path";
import { promises as fs } from "fs";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as net from "net";

let childProcess: ChildProcessWithoutNullStreams | null = null;
let client: LanguageClient | null = null;
const output = vscode.window.createOutputChannel("processing-language-server");

async function cleanup() {
  if (client !== null) {
    await client.stop();
    client = null;
  }

  if (childProcess !== null) {
    childProcess.kill();
    childProcess = null;
  }
}

async function start(): Promise<void> {
  await cleanup();
  const config = vscode.workspace.getConfiguration(
    "processing-language-server"
  );

  const languageServerPath = config.get<string>("languageServerPath")!;
  const processingPath = config.get<string>("processingPath")!;

  let classpath = "";

  const addJars = async (dir: string) => {
    const absDir = path.join(processingPath, dir);
    const names = await fs.readdir(absDir);
    const jars = names
      .filter((name) => name.endsWith(".jar"))
      .map((name) => path.join(absDir, name));
    for (const jar of jars) {
      classpath += jar + ":";
    }
  };

  await addJars("lib");
  await addJars(path.join("core", "library"));
  await addJars(path.join("modes", "java", "mode"));
  classpath += languageServerPath;

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "processing" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.pde"),
    },
  };

  client = new LanguageClient(
    "processing-language-server",
    "ProcessingLanguageServer",
    async () => {
      const port = Math.floor(Math.random() * (65535 - 1024) + 1024);
      let ready = false;

      output.appendLine(`Starting language server. Port: ${port}`);

      await new Promise((resolve) => {
        childProcess = spawn(path.join(processingPath, "java", "bin", "java"), [
          "-Djna.nosys=true",
          "-classpath",
          classpath,
          "net.kgtkr.processingLanguageServer.main",
          String(port),
        ]);

        childProcess.stdout.on("data", (data) => {
          output.appendLine("[stdout]" + data.toString());

          if (!ready && data.toString().includes("Ready")) {
            ready = true;
            resolve(undefined);
          }
        });

        childProcess.stderr.on("data", (data) => {
          output.appendLine("[stderr]" + data.toString());
        });

        childProcess.on("close", () => {
          output.appendLine("[close]");
        });
      });

      const conn = net.connect({ port });
      return {
        reader: conn,
        writer: conn,
      };
    },
    clientOptions
  );

  client.start();
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "processing-language-server.restart",
      () => {
        start();
      }
    )
  );

  await start();
}

export async function deactivate(): Promise<void> {
  await cleanup();
}
