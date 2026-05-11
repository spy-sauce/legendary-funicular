# HYPHA-TEST — tester.tokens

## CACHE HEADER
- **TESTER_ID:** tester.tokens
- **MIRRORS_BIOME:** (cross-cutting)
- **SCOPE:** Verify no secrets or tokens appear in committed source files
- **INPUTS:** cli/src/, impl/, .github/, NUTRIENTS.md
- **TOOLS:** Read, Bash

## Assertions
This tester scans the codebase for hardcoded secrets, tokens, or credentials that
should only exist as environment variables (per CLAUDE.md rule #8).

**Security contract checks:**
1. No file contains literal `ANTHROPIC_API_KEY=` followed by a value.
2. No file contains literal `sk-ant-` (Anthropic key prefix).
3. No file contains Slack webhook URLs (`hooks.slack.com/services/`).
4. No file contains AWS access key patterns (`AKIA[0-9A-Z]{16}`).
5. No `.env` file is committed (should be gitignored).

**Exit conditions:**
- Exit 0 if no secrets detected.
- Exit 1 and emit a Finding if any pattern matches.

## Repro recipe
1. Run `grep -rn "ANTHROPIC_API_KEY=" cli/ impl/ .github/` to find hardcoded keys.
2. Run `grep -rn "sk-ant-" cli/ impl/ .github/` to find Anthropic key prefixes.
3. Run `grep -rn "hooks.slack.com/services/" cli/ impl/ .github/` for webhooks.
4. Run `grep -rE "AKIA[0-9A-Z]{16}" cli/ impl/ .github/` for AWS keys.
5. Check if `.env` exists and is tracked by git.

## Suggested fix template
Found hardcoded secret in `<file_path>` at line `<line_number>`. Remove the
literal value and replace with an environment variable reference. Ensure the
file is added to `.gitignore` if it contains any sensitive configuration.
