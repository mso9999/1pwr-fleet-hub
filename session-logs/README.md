# Session logs

Short, factual notes per work session so debugging and handoffs stay grounded.

## How to add a log

1. Create or open `YYYY-MM-DD.md` in this folder (today’s date in ISO form).
2. Append a new **session** block using the template below.
3. Mention git commit or tag if you pushed.

## Template (copy into the day file)

```markdown
## Session — <short title>

- **When:** YYYY-MM-DD (timezone if not obvious)
- **Context:** <what triggered the work>
- **Done:** <bullets: features, fixes, files touched>
- **Deploy:** <e.g. pushed main @ abc1234, fm.1pwrafrica.com>
- **Version:** <package.json version at time of deploy>
- **Follow-ups:** <open items>
- **Testing notes:** <what you verified or what broke>
```

Keep entries scannable; link to PRs or issues if you use them.
