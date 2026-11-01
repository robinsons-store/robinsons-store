# Agent instructions

This file is for Codex and any agent that reads AGENTS.md. Claude Code reads CLAUDE.md.
Both follow the same rules, kept in one place:

1. Read CLAUDE.md in full. Its hard rules apply to every change.
2. Read .claude/skills/robinsons-store/SKILL.md before building, and
   .claude/skills/robinsons-store/references/standards.md before writing docs or reviewing.
3. Skills for this repo are in .agents/skills (supabase, supabase-postgres-best-practices,
   vercel-react-best-practices). The robinsons-store skill stays only in .claude/skills so
   it has one copy.
4. Gates before any pull request: npx tsc --noEmit, npm run build with a blank env,
   npm run lint. Update docs/STATUS.md and docs/VERIFICATION.md in the same pull request.
5. docs/AGENTS.md is the register of AI agents in the app and the build loop, not this file.

## Skill precedence

Vendored third-party skills in .claude/skills/vercel-react-best-practices and
.agents/skills/vercel-react-best-practices give general advice. Wherever they differ,
CLAUDE.md and the robinsons-store skill, including its locked architecture, take precedence.
For example, client components keep fetching with useEffect as the locked architecture says.
