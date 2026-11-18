# Weekly review, by itself

Every Monday at 7 AM the owner's Mac runs the growth review with no one
asking. If the Mac is asleep at 7, it runs when the Mac wakes.

These files are the copy of record. The live ones are in `~/.flamingo-review/`
(not in `~/Documents`, which a background job on macOS may not read):

- `run.sh`: fetches `hq/growth-review.md` from main, then runs Claude headless
  with a fixed list of tools. It can read HQ, write experiments, the playbook
  and tasks, and send one Telegram message. It cannot touch drafts or site
  content, publish, email, spend or run shell commands.
- `prompt.md`: what the run does.
- `com.flamingocounty.weekly-review.plist`: the schedule, in `~/Library/LaunchAgents/`.

What it leaves behind, in `~/.flamingo-review/`:

- `LESSONS.md`: the standing rules, rewritten each run. Read before making a reel.
- `journal/<date>-weekly.md`: one line per reel reviewed, verdicts, forecast scores, gaps.
- `logs/<date>.log`: what the run printed.

Run it now: `launchctl kickstart gui/$(id -u)/com.flamingocounty.weekly-review`
(`touch ~/.flamingo-review/quiet-once` first to skip the Telegram message).
Turn it off: `launchctl bootout gui/$(id -u)/com.flamingocounty.weekly-review`.

`ref/` in the live folder holds copies of LEARNING-LOOP.md, TOPIC-SELECTION.md and
story-rules.md from content-marketing-system; copy them again when they change.
