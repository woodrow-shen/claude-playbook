---
name: monitor-tmux
description: Monitor a tmux session and report progress periodically
argument-hint: "[session-name] [interval-minutes] [--until-keyword keyword]"
---

Monitor a tmux session and report progress periodically.

Parse $ARGUMENTS: first word is session name, optional second word is interval in minutes (default: 5), optional `--until-keyword <keyword>` to stop when keyword appears.

## Step 1: Validate tmux Session

```bash
tmux list-sessions | grep -q "^<session-name>:"
```

If session does not exist, show available sessions and stop.

## Step 2: Extract Parameters

From the command arguments:

1. **Session name** (required) — first argument
2. **Interval in minutes** (optional, default: 5) — second argument
   - This is the number of **MINUTES** between checks
   - Store as `interval_minutes`
3. **Until keyword** (optional) — value after `--until-keyword`

**CRITICAL: Calculate sleep duration in seconds:**
```bash
interval_seconds=$((interval_minutes * 60))
```

Example:
- If user provides `5` -> `interval_minutes = 5` -> `interval_seconds = 300`
- If user provides `10` -> `interval_minutes = 10` -> `interval_seconds = 600`

## Step 3: Start Monitoring Loop

For each check (iteration N):

1. Wait for interval (skip on first iteration):
   ```bash
   sleep ${interval_seconds}
   ```

2. Check if session still exists:
   ```bash
   tmux list-sessions | grep -q "^<session-name>:"
   ```
   If session no longer exists -> stop monitoring and report completion

3. Capture tmux session content and analyze:
   ```bash
   tmux capture-pane -t <session-name> -p -S -100
   ```

4. Display `Monitoring Report #N` with:
   - Current status summary
   - Any progress indicators
   - Any errors or issues

5. **Check for keyword (if `--until-keyword` specified):**

   **CRITICAL: Use correct grep command without pipeline to tail**

   ```bash
   tmux capture-pane -t <session-name> -p -S -300 | grep -i "<keyword>"
   ```

   **Check the grep result correctly:**
   - If grep finds the keyword: output will contain the matching line(s)
   - If grep does NOT find the keyword: output will be empty
   - **DO NOT use `| tail` after grep** - it changes the return code
   - **Check if output is empty**, not just the return code

   Example:
   ```bash
   RESULT=$(tmux capture-pane -t dev -p -S -300 | grep -i "Test Complete")
   if [ -n "$RESULT" ]; then
       echo "Keyword found!"
       # Stop monitoring
   else
       echo "Keyword not found, continuing..."
   fi
   ```

6. Check stop conditions:
   - `--until-keyword` specified AND keyword found (output not empty) -> stop
   - Session no longer exists -> stop
   - Otherwise -> continue to next iteration (go back to step 3.1)

## Step 4: Report Completion

Show final summary: session name, total checks, duration, stop reason.
