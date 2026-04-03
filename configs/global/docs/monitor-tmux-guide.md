# /monitor-tmux Command Guide

Monitor a tmux session and report progress periodically.

## Usage

```
/monitor-tmux <session-name> [interval-minutes]
```

## What It Does

1. Validates the tmux session exists
2. Starts a monitoring loop at the specified interval
3. Captures session output and reports status
4. Checks for configurable keywords to stop monitoring
5. Stops when session ends or stop condition is met

## Parameters

- `session-name` - Name of the tmux session to monitor
- `interval-minutes` - Check interval in minutes (default: 5)

## Key Features

- Configurable monitoring interval
- Keyword-based stop conditions (e.g., "DONE", "ERROR")
- Periodic progress summaries
- Session validation before starting

## When to Use

- Watching long-running builds or test suites in another session
- Monitoring a deployment in progress
- Tracking background agent work
