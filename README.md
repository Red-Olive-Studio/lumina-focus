# Lumina

**A quiet light beside your work.** A calm little side app for Windows that stays open from the moment you start your PC until you shut it down. It keeps what matters **now** and **next** in view, and nothing behind you.

**Who it's for:** people who spend the whole day at a PC: developers, designers, writers. In flow, the rest of the day disappears: the meeting slips by, the water glass stays full, and it's 7 pm with stiff shoulders. Lumina sits in the corner and keeps the day in view so you can stay deep in the work. First launch shows a short intro (later: Settings → About Lumina).

- **One timeline of your day**: from now on, in time order: tasks, meals, calendar events, break reminders, timers, focus breaks, the night light and bedtime. Then tomorrow and the coming days.
- **Focus that keeps going**: focus and short breaks run all day on their own (long breaks optional). Lumina counts your focus time, sessions and breaks per day. Stepping away from the PC pauses focus and counts as a break. Break and Focus switch from the main window or the corner widget.
- **History**: under the timeline, a time-ordered log of today: each focus and break stretch (from, until, how long), time away from the PC, and what you did (done, added, removed). Earlier days, back to a week, stay folded until you open them.
- **Reminders (nudges)**: water, posture and a walk are on by default; eyes (20 s far away), stretch, slow breaths, fresh air, save and commit, and check messages are there to switch on, and you can add your own. They show as a quiet note with an icon, nothing to tick off. They pause when you're away and can be muted for an hour, e.g. during a meeting.
- **Remove anything**: every row on the timeline has an ×. Tasks are deleted, a meal is skipped for today, a calendar event is hidden in Lumina (your calendar is untouched), a reminder is switched off.
- **Meals**: as many a day as you like (Settings → Meals a day). Each meal gets its own reminder and a "cook or order now" one before it; rename them and set each time.
- **Undo and restore**: removing a task or an event shows an Undo for a moment. Removed calendar events can also be brought back any time: Settings → Calendars → *Restore N removed*.
- **Focus lock**: pick the apps and tabs you work in (e.g. `chrome`, `code`, or a word from a tab title like `github`). While focus runs, anything else (File Explorer included) gets covered on every monitor until you switch back. The cover offers *Allow 5 min*, *Always allow this app* and *Pause focus*; the taskbar always stays free. Desktop only.
- **Habits**: make anything daily (vitamins, pills, reading) and see streaks and your week.
- **Calendars**: add as many iCal links as you like (Google, Outlook), each with a name such as Work or Family. Time zones, "2nd Tuesday"-style monthly events and moved or cancelled occurrences are handled. Pick each calendar's color, remove one any time. Events join the timeline with a reminder 10 minutes before.
- **Alarms and timers**: type a name and a time ("9:00" or "20m"), pick Today or Tomorrow, done. A task shows "now" when due and "missed" only after 5 minutes without a tick.
- **Evening**: warm night light (Lumina's tint, Windows' own Night light, or both), a nudge to sleep, an optional shutdown at a set time, and a **sleep timer** (the moon button, which always asks first): after the time you set in Settings (e.g. 90 min for a movie) the PC sleeps, shuts down or locks. You always get 60 seconds to cancel.
- **Corner widget**: minimize Lumina and a small always-on-top pill shows the timer and what's next. Alerts pop up there while you work in other apps.

## Add anything

Press **+** (or N), name it, and give it a time (`14:30`) for a task or alarm, or a length (`20m`) for a timer. The preview tells you exactly what you will get. Typing it all in the name works too: `tomorrow 9am Dentist`, `Gym fri 6pm`, `Vitamins 9am daily`.

## Test mode

`npm run test-mode` (or Ctrl+Shift+T inside the app) opens a sample day with its own data, so your real day is never touched. Jump to the next item on the timeline, move or speed up time, and fire every kind of alert. Sleep, lock and shutdown are only simulated.

## Phone

- **Phone app (Expo Go):** install *Expo Go* from the App Store or Play Store, then open `exp://u.expo.dev/96e272b0-b2b5-451f-b041-5a637c77686b/group/04a83b0b-d5f4-453c-b806-24f6bb0dfd22` (or scan the QR code on the [Expo dashboard](https://expo.dev/accounts/red-olive/projects/lumina-focus)). Reminders arrive as phone notifications even while Lumina is closed, and calendars sync.
- **Browser / PWA:** https://red-olive-studio.github.io/lumina-focus/ works offline and can be added to the home screen. In a plain browser, reminders only fire while it's open and calendars don't sync.
- The focus lock, sleep timer and night light are desktop-only.

The phone app (`mobile/`) is a thin Expo shell around the same web build, which GitHub Pages publishes from `web/` on every push. A change to `web/` reaches the phone without a new app release; only a change in `mobile/` needs `cd mobile && npx eas-cli update --branch main --environment production --message "..."`.

## Run

```
npm install
npm start           # desktop app (Electron)
npm run test-mode   # sample day + test panel
npm test
npm run dist        # builds dist/Lumina-VERSION.exe (portable, no install)
```

Space starts or pauses focus. Settings → Theme: like Windows, light or dark. Everything is stored locally on your PC. Fonts: Nunito and Fraunces (SIL Open Font License, see `web/fonts`).

## Brand

- **Mark**: a glowing dot on a line: *now*, on the line of your day. Same shape as the timeline in the app. Files: `web/logo.svg`, `web/icon.png` (window and taskbar icon).
- **Colors**: Paper `#F7F5F0`, Ink `#1F1D1A`, Glow (focus) `#E0912A`, Calm (break) `#2F8C79`, Late `#B9502A`, Calendar `#6A5BD0`. Dark: `#151412` paper, `#F3EFE8` ink, `#F0A53A` glow, `#4DB39C` calm.
- **Type**: Fraunces 600 for the wordmark (always lowercase: *lumina*), Nunito for everything else, Segoe UI Variable for digits.
- **Voice**: short, calm, no exclamation marks. Say what happens ("In 1h 30m the PC sleeps"), never nag.

Made by Red Olive Studio.
