#!/bin/zsh
# Weekly unattended review for Flamingo County. Started by launchd
# (com.flamingocounty.weekly-review). `run.sh quiet` skips the Telegram message.
set -u
DIR="$HOME/.flamingo-review"
# Everything lives here: launchd jobs may not read ~/Documents (macOS privacy).
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
unset ANTHROPIC_API_KEY
DATE=$(date +%Y-%m-%d)
LOG="$DIR/logs/$DATE.log"
exec >>"$LOG" 2>&1
echo "== start $(date)"

# One run at a time; a lock older than 3 hours is a dead run.
LOCK="$DIR/run.lock"
if [ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin -180)" ]; then echo "already running"; exit 0; fi
rm -rf "$LOCK"; mkdir "$LOCK"; trap 'rm -rf "$LOCK"' EXIT

# The instructions, fresh from main; the last copy is kept if GitHub cannot be reached.
gh api "repos/1cmasson/flamingo-county/contents/web/hq/growth-review.md?ref=main" -H "Accept: application/vnd.github.raw" > "$DIR/growth-review.md.new" \
  && [ -s "$DIR/growth-review.md.new" ] && mv "$DIR/growth-review.md.new" "$DIR/growth-review.md"
[ -s "$DIR/growth-review.md" ] || { echo "no growth-review.md"; exit 1; }

# `touch quiet-once` makes the next run silent, whoever starts it.
QUIET="${1:-}"; [ -e "$DIR/quiet-once" ] && { QUIET=quiet; rm -f "$DIR/quiet-once"; }
if [ "$QUIET" = "quiet" ]; then
  NOTIFY="Do NOT send a Telegram message on this run. Put the message you would have sent at the end of the journal entry."
else
  NOTIFY="Send ONE hqSendTelegram, title \"Weekly review\": at most 8 short lines in plain English. What worked, what did not, what changes this week, and anything that needs the owner. No jargon, no ids without a name."
fi
PROMPT=$(sed -e "s|{{DIR}}|$DIR|g" -e "s|{{DATE}}|$DATE|g" "$DIR/prompt.md")
PROMPT=${PROMPT//\{\{NOTIFY\}\}/$NOTIFY}

HQ=mcp__flamingo-hq__
cd "$DIR"
claude -p "$PROMPT" \
  --allowedTools Read Glob Grep \
    "Edit(/$DIR/LESSONS.md)" \
    "Edit(/$DIR/journal/**)" \
    ${HQ}hqBrief ${HQ}hqGrowthContext ${HQ}hqWeeklyReviewContext ${HQ}hqSocialReport ${HQ}hqReelNow \
    ${HQ}findHqReelReviews ${HQ}findHqExperiments ${HQ}findHqSocialStats ${HQ}findHqSocialDrafts \
    ${HQ}findHqPlaybook ${HQ}findHqTasks ${HQ}findHqMarketPosts ${HQ}findHqMarketAccounts \
    ${HQ}findHqVisits ${HQ}findHqClicks ${HQ}findHqSocialComments ${HQ}findStories \
    ${HQ}updateHqExperiments ${HQ}createHqExperiments ${HQ}updateHqPlaybook \
    ${HQ}updateHqTasks ${HQ}createHqTasks ${HQ}hqSendTelegram \
  --disallowedTools Bash WebFetch WebSearch Agent \
    ${HQ}createHqSocialDrafts ${HQ}updateHqSocialDrafts ${HQ}hqRequestPublish ${HQ}hqRequestEmail \
    ${HQ}hqCancelDraft ${HQ}hqMoveDraftToCloud ${HQ}hqRequestSpendApproval
echo "== end $(date) exit $?"
