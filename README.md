# pila-docs

## Claude Code cloud sessions

A `SessionStart` hook (`.claude/hooks/session-start.sh`, registered in `.claude/settings.json`) installs these plugins at the start of every cloud session:

- [superpowers](https://github.com/obra/superpowers)
- [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)

The hook only runs when `CLAUDE_CODE_REMOTE=true`, runs synchronously, and is safe to run repeatedly.
