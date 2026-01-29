AUTOMATIC MERGING 

This is a fork of opencode called nanocode, made specifically for the nanogpt API.

* Every hour run "git fetch upstream && git merge upstream"

* Run "bun install" as needed

* KEEP EVERYTHING SPECIFIC TO NANOGPT/nanocode, merge any new changes, keeping anything specific to nanogpt/nanocode intact.

* Ensure all changes from merges use @nanogpt instead of @opencode-ai on imports.

* Ensure all changes from merges use NANOGPT env variables instead of OPENCODE eg. NANOGPT_EXPERIMENTAL_ICON_DISCOVERY

* Check every file of the merges, not just conflicts.

* Never update README.md, keep head

* Don't use opencode version numbers, keep the v1.1.x versioning.

* ensure we always keep the nanocode branding/naming.

* always run "bun run typecheck" when you're done with the merging. Fixing any errors. 

* Nanocode / NanoGPT fork specific improvements include: 
    * Dynamic API endpoint swapping (v1endpoint).
    * loading models from the nanogpt models api.
    * nanogpt mcp server built in
    * nanogpt subscription model filters
    * nanogpt model provider selection
  
* Once the typecheck passes, do the following:
    * Run "bun run typecheck" again to ensure no errors were introduced.
    * git add .
    * Run "git commit -m" and for the message do bump vx.x.x if there was a version bump, otherwise say "merge from upstream"
    * git push
