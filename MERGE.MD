MERGING 

This is a fork of opencode called nanocode, made specifically for the nanogpt API.

* Don't be lazy about this, solve every merge conflict file by file!

* Ensure we add new features and bug fixes from upstream

* run "git fetch upstream && git merge upstream/dev"

* Run "bun install" as needed

* KEEP EVERYTHING SPECIFIC TO NANOGPT/nanocode, merge any new changes, keeping anything specific to nanogpt/nanocode intact.

* Ensure all changes from merges use @nanogpt instead of @opencode-ai on imports.

* Ensure all changes from merges use NANOGPT env variables instead of OPENCODE eg. NANOGPT_EXPERIMENTAL_ICON_DISCOVERY

* Check every file of the merges, not just conflicts.

* Never update README.md, keep head

* ensure we always keep the nanocode branding/naming.

* always run "bun run typecheck" when you're done with the merging. Fixing any errors. 

* Nanocode / NanoGPT fork specific improvements include: 
    * Dynamic API endpoint swapping (v1endpoint).
    * loading models from the nanogpt models api.
    * nanogpt mcp server built in
    * nanogpt subscription model filters
    * nanogpt model provider selection
