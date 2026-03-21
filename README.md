<p align="center">AI-powered coding agent using <a href="https://nano-gpt.com">NanoGPT</a>.</p>

<img width="1052" height="743" alt="image" src="https://github.com/user-attachments/assets/a5674433-c7d2-4fb2-aaa8-98760dae98f4" />

Notice: Due to not having much time to work on nanocode, only the CLI will continue to be updated for now!

---

## Installation

#### CLI

```bash
bun i -g nanocode@latest
```

#### VS Code Extension (Deprecated)

Get from [open-vsx.org](https://open-vsx.org/extension/0xGingi/nanocode)

#### Desktop Application (Deprecated)

Download from [releases](https://github.com/nanogpt-community/nanocode/releases)

#### Zed Extension (Deprecated)

Download from [releases](https://github.com/nanogpt-community/nanocode/releases), unzip zed-version.zip, then add the folder as a dev extension

### Neovim Extension (Deprecated)

More info at [nanocode.nvim](https://github.com/nanogpt-community/nanocode.nvim)

### Configuration

Set your NanoGPT API key:

```bash
nanocode auth login
```

or set it inside nanocode on startup!

Get your API key from [nano-gpt.com/api](https://nano-gpt.com/api)

View your Nano-GPT balance and subscription usage with ```/nanogpt```

The Nano-GPT MCP Server is now built in and automatically enabled, using your API key

### Default Models

- **Primary**: `zai-org/glm-5`
- **Thinking**: `zai-org/glm-5:thinking`

All models from NanoGPT are dynamically loaded from the API when your API key is configured.

---

## Why Use This over Opencode with Nano-GPT as a provider?

NanoCode has some improvements for Nano-GPT and some opinionated changes:

* Models that support reasoning will use the v1thinking endpoint with interleaved thinking enabled by default
* All models are automatically updated from the nano-gpt api, no need to hardcode them
* Nano-GPT MCP built in
* Subscription Model filters + more nanogpt api info added
* Select preferred providers per model (PAYG ONLY)
* Vision MCP Support (Admittedly this is a bit hacky, but it works)
* NanoProxy added and enabled by default

---

### Based on OpenCode

This is a fork of [OpenCode](https://github.com/sst/opencode) configured to use NanoGPT as the default provider.

---
