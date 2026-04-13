# Tab Pauser

A Chrome extension that automatically discards inactive tabs after a 
configurable timeout, freeing memory without interrupting your workflow.

## The problem

Chrome holds every open tab in memory — including the 40 you opened three 
days ago and haven't looked at since. Tab Pauser puts those tabs to sleep, 
freeing their RAM until you actually need them. Clicking a sleeping tab 
reloads it normally.

## Features

- Configurable inactivity timer (default: 15 minutes)
- Automatically skips tabs that are:
  - Currently active (you're looking at them)
  - Playing audio or video
  - Pinned
  - Manually protected via the popup
- Per-tab protection toggle in the UI
- Toggle the extension on/off without losing settings
- Works correctly across multiple Chrome windows

## Installation

Not on the Chrome Web Store. To run locally:

1. Clone or download this repository
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the project folder

## Usage

Click the Tab Pauser icon in the Chrome toolbar to open the popup. From 
there you can adjust the timer, see the status of every open tab, and 
lock individual tabs so they're never paused.

## How it works

Built on **Manifest V3**. Uses `chrome.alarms` instead of `setTimeout` — 
service workers in MV3 are killed when idle, so in-memory timers don't 
survive. Alarms persist across worker restarts and wake the service worker 
when they fire.

Discarding a tab via `chrome.tabs.discard()` removes its renderer process 
from memory while keeping it visible in the tab strip. It is not closed — 
clicking it triggers a normal page reload.

When the timer setting changes, all pending alarms are immediately cleared 
and rescheduled at the new duration via a `chrome.storage.onChanged` 
listener.

## Development approach

This project was built through **AI-directed development** using Claude 
(Anthropic). All architecture decisions, constraints, and edge case logic 
were defined by me — the AI handled implementation. This reflects how I 
approach building tools: using AI as a force multiplier to ship faster 
without outsourcing the thinking.
