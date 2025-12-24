<p align="center">AI-powered coding agent using <a href="https://nano-gpt.com">NanoGPT</a>.</p>

---

### Installation

```bash
bun i -g nanocode@latest        # or npm/pnpm/yarn
```

### Configuration

Set your NanoGPT API key:

```bash
nanocode auth login
```

Get your API key from [nano-gpt.com/api](https://nano-gpt.com/api)

### Default Models

- **Primary**: `zai-org/glm-4.7`
- **Thinking**: `zai-org/glm-4.7:thinking`

All models from NanoGPT are dynamically loaded from the API when your API key is configured.

---

### Agents

Nanocode includes two built-in agents you can switch between using the `Tab` key:

- **build** - Default, full access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

---

### Based on OpenCode

This is a fork of [OpenCode](https://github.com/sst/opencode) configured to use NanoGPT as the default provider.

---