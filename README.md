# Lumina

A calm little side app for Windows that stays open from the moment you start your PC until you shut it down. It keeps what matters **now** and **next** in view, and nothing behind you.

- **One timeline of your day**: from now on, in time order: tasks, meals, calendar events, break reminders, timers, focus breaks, the night light and bedtime. Then tomorrow and the coming days.
- **Focus that keeps going**: focus and short breaks run all day on their own (long breaks optional). Lumina counts your focus time, sessions and breaks per day. Stepping away from the PC pauses focus and counts as a break.
- **Body care**: sit upright, drink water, stand up and walk. These pause when you're away and can be muted for an hour, e.g. during a meeting.
- **Meals**: 3 or 5 a day, with a "cook or order now" reminder before each.
- **Habits**: make anything daily (vitamins, pills, reading) and see streaks and your week.
- **Calendar**: add your Google or Outlook calendar's iCal link and its events join the timeline, with a reminder 10 minutes before.
- **Alarms and timers**: a timer is one tap; "Movie 2h" turns the PC off when it ends.
- **Evening**: warm night light, a nudge to sleep, and an optional shutdown at a set time (with 60 seconds to cancel).
- **Corner widget**: minimize Lumina and a small always-on-top pill shows the timer and what's next. Alerts pop up there while you work in other apps.

## Add anything

Press **+** (or N), name it, and give it a time (`14:30`) for a task or alarm, or a length (`20m`) for a timer. The preview tells you exactly what you will get. Typing it all in the name works too: `tomorrow 9am Dentist`, `Gym fri 6pm`, `Vitamins 9am daily`.

## Test mode

`npm run test-mode` (or Ctrl+Shift+T inside the app) opens a sample day with its own data, so your real day is never touched. Jump to the next item on the timeline, move or speed up time, and fire every kind of alert. Shutdowns are only simulated.

## Run

```
npm install
npm start           # desktop app (Electron)
npm run test-mode   # sample day + test panel
npm test
npm run dist        # builds dist/Lumina-VERSION.exe (portable, no install)
```

Space starts or pauses focus. Everything is stored locally on your PC. Fonts: Nunito and Fraunces (SIL Open Font License, see `web/fonts`).

Made by Red Olive Studio.
