# Roslyn Language Server Plugin

Enables Claude Code to use the [Roslyn LSP](https://github.com/dotnet/roslyn/tree/main/src/LanguageServer) from Microsoft for C#.

Derived from [this gist](https://gist.github.com/jrusbatch/1d2c539ef17476c8703f04a2e9148693) by Justin Rusbatch with light updates.

The Language Server Protocol provides IDE-like intelligence to Claude Code. On startup, Claude Code automatically starts LSP servers from installed plugins and exposes them to Claude

## Prerequisites

You must have the Roslyn LSP tool installed. Install with `dotnet tool install --global roslyn-language-server --prerelease`. 

## Installation

Add the marketplace and install the carbon plugin in Claude Code:

```
/plugin marketplace add CNaught-Inc/claude-code-plugins
/plugin install roslyn-ls@cnaught-plugins
```

Restart Claude Code (it's not enough to run `/reload-plugins`).

## Updating

Update the marketplace to fetch the latest available versions, then update the plugin:

```
/plugin marketplace update cnaught-plugins
/plugin update roslyn-ls@cnaught-plugins
```

Then you can run the following or just restart Claude Code:
```
/reload-plugins
```

You can also manage all of this interactively via Claude Code's built-in `/plugin` command. We recommend enabling auto-update for the marketplace so you always have access to the latest versions — go to `/plugin` > **Marketplaces** > select the marketplace > **Enable auto-update**.