# Processing Language Server VSCode
[Processing Language Server](https://github.com/kgtkr/processing-language-server-vscode) VSCode Extension.
This extension is currently under development. This is very unstable.
If it crashes, Run `Processing: Restart Language Server` from the command palette. If that doesn't work, restart VSCode.

## Install
Recommend: Disable other Processing extensions.
https://marketplace.visualstudio.com/items?itemName=kgtkr.processing-language-server-vscode

## Support Processing Version
* 4.0b1
* 4.0b2

## Configuration
### `processing-language-server.processingPath` (required)
Processing installed path.

```json
{
    // Example:
    // linux
    "processing-language-server.processingPath": "/home/user/processing-4.0b2",
    // windows
    "processing-language-server.processingPath": "C:\\Users\\user\\processing-4.0b2",
    // macos
    "processing-language-server.processingPath": "/Applications/Processing.app"
}
```

### `processing-language-server.autoUpdate` (default: `true`)
Enable automatic update Processing Language Server.
When enabled, it will be automatically downloaded to `$HOME/processing-language-server`.
If you're using an unsupported version of Processing, disabling automatic updates and setting the `languageServerPath` may work.

### `processing-language-server.languageServerPath`
processing language server jar path.
If automatic update is enabled, it will be set automatically.
