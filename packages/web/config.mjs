const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://nanocode.ai" : `https://${stage}.nanocode.ai`,
  console: stage === "production" ? "https://nano-gpt.com/api" : `https://nano-gpt.com/api`,
  email: "support@nano-gpt.com",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/nanogpt-community/nanocode",
  discord: "https://discord.gg/nanogpt",
  headerLinks: [
    { name: "Home", url: "/" },
    { name: "Docs", url: "@nanogpt/docs/" },
    { name: "NanoGPT", url: "https://nano-gpt.com" },
  ],
}
