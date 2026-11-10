# Lumina

A calm little side app for Windows. It keeps what matters **now** and **next** in view, and nothing behind you.

- **Focus timer** with breaks and rounds, plus how long you focused today.
- **Now / later list**: what's due now, later today, tomorrow and the coming days. Finished items get out of the way.
- **Habits**: repeat any item every day and see your streak.
- **Gentle break reminders** (water, posture, moving) that pause when you step away from the PC.
- **Corner widget**: minimize Lumina and a small always-on-top pill shows the timer and what's next. Reminders pop up there while you work in other apps.
- Evening helpers: screen-time nudge, warm night light, optional bedtime shutdown.

## Add anything in one line

| Type | Becomes |
| --- | --- |
| `14:30 Call mom` | today at 14:30 |
| `tomorrow 9am Dentist` | tomorrow at 09:00 |
| `Gym fri 6pm` | Friday at 18:00 |
| `Vitamins 9am daily` | a daily habit |
| `20m Tea` | a 20 minute timer |
| `Write report` | a to-do that stays until done |

## Run

```
npm install
npm start      # desktop app (Electron)
npm run web    # browser version, without the desktop extras
npm test
```

Space starts/pauses the timer. Everything is stored locally on your PC.

Made by Red Olive Studio.
