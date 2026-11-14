// Turkish UI. The app is written in English; tr() turns a finished English string into Turkish just before it's shown:
// an exact match first, then a pattern for strings with names, times and numbers in them (names inside get translated too).
let pick = 'auto';
try { pick = localStorage.getItem('lumina:lang') || 'auto'; } catch {}
export const LANG = pick === 'tr' || (pick === 'auto' && /^tr\b/i.test(globalThis.navigator?.language || '')) ? 'tr' : 'en';
export const LOC = LANG === 'tr' ? 'tr-TR' : 'en-GB';
export const tr = s => translate(s, LANG);

// "1h 05m" -> "1 sa 05 dk", "20m" -> "20 dk"
const units = s => s.replace(/\b(\d+)h (\d\d)m\b/g, '$1 sa $2 dk').replace(/\b(\d+)h\b/g, '$1 sa').replace(/\b(\d+)m\b/g, '$1 dk');
const word = k => WORDS[k] ?? WORDS[k[0]?.toUpperCase() + k.slice(1)]?.toLocaleLowerCase('tr') ?? k;
export function translate(s, lang) {
  if (lang !== 'tr' || typeof s !== 'string' || !s.trim()) return s;
  const k = s.trim(), em = k.match(/^(\p{Extended_Pictographic}️?\s+)(.+)$/u); // a reminder's emoji in front
  if (em) return s.replace(k, () => em[1] + translate(em[2], lang));
  let out = WORDS[k] ?? WORDS[k[0].toUpperCase() + k.slice(1)]?.toLocaleLowerCase('tr'); // "lunch" inside "Cook or order lunch"
  if (out === undefined) for (const [re, to] of PATTERNS) {
    const m = k.match(re);
    if (m) { out = to.replace(/\$(\d)/g, (_, i) => word(m[+i] ?? '')); break; } // a filled-in part (a name, a title) is only looked up, never rewritten
  }
  return units(out === undefined ? s : s.replace(k, () => out));
}

// Static pages: text, placeholders, titles and labels; blocks written in both languages (lang="en" / lang="tr") show one.
export function trDom(root = document) {
  document.documentElement.lang = LANG;
  for (const b of root.querySelectorAll('body [lang]')) b.hidden = b.lang !== LANG;
  if (LANG === 'en') return;
  const w = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) if (!n.parentElement.closest('body [lang], script, style')) n.nodeValue = tr(n.nodeValue);
  for (const e of root.querySelectorAll('[placeholder], [title], [aria-label]'))
    for (const a of ['placeholder', 'title', 'aria-label']) if (e.hasAttribute(a)) e.setAttribute(a, tr(e.getAttribute(a)));
}

const WORDS = {
  // header, focus, timeline
  'Test': 'Test', 'Pause reminders for 1 hour': 'Hatırlatmaları 1 saat duraklat', 'Start sleep timer': 'Uyku zamanlayıcısını başlat',
  'Settings': 'Ayarlar', 'Shrink to corner widget': 'Köşe widget\'ına küçült', 'Quit': 'Çık', 'Dismiss': 'Kapat',
  'Focus': 'Odak', 'Break': 'Mola', 'Long break': 'Uzun mola', 'Ready to focus': 'Odağa hazır', 'paused': 'duraklatıldı',
  'Start or pause focus': 'Odağı başlat ya da duraklat', 'Start focus': 'Odağı başlat', 'Pause focus': 'Odağı duraklat',
  'Take a break now': 'Şimdi mola ver', 'End the break and focus': 'Molayı bitir ve odaklan',
  'Your week: focus and habits': 'Haftanız: odak ve alışkanlıklar', 'No focus yet today': 'Bugün henüz odak yok',
  'Your day, now and upcoming': 'Gününüz: şimdi ve sırada', 'History': 'Geçmiş', 'Hide history': 'Geçmişi gizle',
  'What you did today, and when you focused or took a break': 'Bugün ne yaptığınız, ne zaman odaklanıp mola verdiğiniz',
  'Back': 'Geri', 'Now': 'Şimdi', 'now': 'şimdi', 'Today': 'Bugün', 'Tomorrow': 'Yarın', 'Yesterday': 'Dün', 'All day': 'Tüm gün',
  'Nothing else today. Press + to add something.': 'Bugün başka bir şey yok. Eklemek için + düğmesine basın.',
  'Nothing yet today.': 'Bugün henüz bir şey yok.', 'Hide done': 'Yapılanları gizle', 'missed': 'kaçırıldı', 'calendar': 'takvim',
  'focus ends': 'odak biter', 'break ends': 'mola biter', 'timer': 'zamanlayıcı', 'Timer': 'Zamanlayıcı', 'every day': 'her gün', 'alarm': 'alarm',
  'then the PC sleeps': 'sonra bilgisayar uyur', 'then the PC shuts down': 'sonra bilgisayar kapanır', 'then the PC locks': 'sonra bilgisayar kilitlenir',
  'Undo': 'Geri al', 'Mark done': 'Yapıldı olarak işaretle', 'Done, start counting again': 'Yapıldı, yeniden saymaya başla',
  'Join': 'Katıl', 'Join the call': 'Görüşmeye katıl', 'Back to focus': 'Odağa dönüş', 'Warm night light': 'Sıcak gece ışığı',
  'Bedtime': 'Yatma saati', 'PC shuts down': 'Bilgisayar kapanır', 'Meal': 'Öğün', 'All clear': 'Her şey yolunda', 'heads-up': 'ön uyarı',
  // alerts and history
  'Done': 'Yapıldı', 'In 10 min': '10 dk sonra', 'Cancel': 'Vazgeç', 'Continue': 'Devam et', 'Start': 'Başlat', 'Stop timer': 'Zamanlayıcıyı durdur',
  'Focus done. Time for a long break.': 'Odak bitti. Uzun mola zamanı.', 'Focus done. Take a short break.': 'Odak bitti. Kısa bir mola verin.',
  'Break is over. Back to focus.': 'Mola bitti. Odağa dönün.', 'Start break': 'Molayı başlat', "You're back. Focus is paused.": 'Geri döndünüz. Odak duraklatıldı.',
  'Warm night light on': 'Sıcak gece ışığı açık', 'Turn on Night light': 'Gece ışığını açın', 'Sleep timer stopped': 'Uyku zamanlayıcısı durdu',
  'Reminders back on': 'Hatırlatmalar yeniden açık', 'Reminders paused for 1 hour': 'Hatırlatmalar 1 saat duraklatıldı',
  'Away from the PC': 'Bilgisayardan uzakta', 'Away from the screen': 'Ekrandan uzakta', 'Focus lock paused for 5 min': 'Odak kilidi 5 dk duraklatıldı',
  'goes to sleep': 'uyku moduna geçecek', 'shuts down': 'kapanacak', 'locks': 'kilitlenecek',
  'the PC sleeps': 'bilgisayar uyur', 'the PC shuts down': 'bilgisayar kapanır', 'the PC locks': 'bilgisayar kilitlenir', 'you get a reminder': 'bir hatırlatma alırsınız',
  // adder
  'Add a task, alarm or timer': 'Görev, alarm ya da zamanlayıcı ekle', 'Add (N)': 'Ekle (N)', 'Add something': 'Bir şey ekle',
  'What? e.g. Call mom': 'Ne? ör. Annemi ara', 'What': 'Ne', '14:30 or 20m': '14:30 ya da 20dk', 'Time (14:30) or timer length (20m)': 'Saat (14:30) ya da süre (20dk)',
  'Quick timers': 'Hızlı zamanlayıcılar', 'Day': 'Gün', 'Pick a day': 'Gün seçin', 'Every day': 'Her gün', 'Alarm sound': 'Alarm sesi', 'Add': 'Ekle',
  'Use a time like 14:30 or a length like 20m': '14:30 gibi bir saat ya da 20dk gibi bir süre yazın', 'Give it a name': 'Bir ad verin',
  'Name it, then add a time (14:30) or a timer length (20m).': 'Bir ad verin, sonra saat (14:30) ya da süre (20dk) ekleyin.',
  'with alarm': 'alarmlı', 'already passed': 'saati geçti', 'Heads-up before tasks': 'Görevlerden önce ön uyarı',
  'At the time': 'Tam saatinde', 'No heads-up': 'Ön uyarı yok', 'When it starts': 'Başladığında', '1 h before': '1 sa önce',
  // week
  'focus': 'odak', 'sessions': 'seans', 'breaks': 'mola', 'Focus this week': 'Bu hafta odak', 'Habits': 'Alışkanlıklar', 'last 7 days': 'son 7 gün',
  'done': 'yapıldı', 'not done': 'yapılmadı', 'Make anything a daily habit with the repeat button.': 'Tekrar düğmesiyle her şeyi günlük alışkanlık yapın.',
  // settings
  'minutes': 'dakika', 'min': 'dk', 'Long break every (0 = never)': 'Kaç seansta bir uzun mola (0 = hiç)',
  'Long break every N sessions, 0 for never': 'Kaç seansta bir uzun mola, hiç için 0',
  'Keep going: start the next focus or break on its own': 'Devam et: sıradaki odak ya da mola kendiliğinden başlasın',
  'My day': 'Günüm', 'Wake up': 'Uyanış', 'Meals': 'Öğünler', 'Meals a day (0 = none)': 'Günde öğün (0 = yok)',
  'Cook-or-order nudge, min before (0 = off)': 'Yemek yap ya da sipariş ver hatırlatması, kaç dk önce (0 = kapalı)',
  'Each meal gets its own reminder. Rename them, change the time, or remove one with ×.': 'Her öğünün kendi hatırlatması var. Adını ve saatini değiştirin ya da × ile kaldırın.',
  'Reminders': 'Hatırlatmalar', 'tick the ones you want': 'istediklerinizi işaretleyin', 'New reminder': 'Yeni hatırlatma',
  'Reminder text': 'Hatırlatma metni', 'Every N minutes': 'Kaç dakikada bir', 'Add reminder': 'Hatırlatma ekle', 'Delete reminder': 'Hatırlatmayı sil', 'Meal name': 'Öğün adı',
  'Focus lock': 'Odak kilidi', 'Cover everything else during focus': 'Odak sırasında diğer her şeyin üstünü kapat', 'Not during calendar meetings': 'Takvim toplantılarında değil',
  'Add at least one app or tab below; until then nothing is locked.': 'Aşağıya en az bir uygulama ya da sekme ekleyin; o zamana kadar hiçbir şey kilitlenmez.',
  'App or tab, e.g. chrome, code, github': 'Uygulama ya da sekme, ör. chrome, code, github', 'App name or word from a tab title': 'Uygulama adı ya da sekme başlığından bir kelime',
  'Allow it': 'İzin ver', 'Pick from open windows': 'Açık pencerelerden seç', '+ app': '+ uygulama', '+ tab': '+ sekme', 'No open windows found.': 'Açık pencere bulunamadı.',
  'An app name (chrome, code) allows the whole app. A word from a tab\'s title (github, docs) allows only those tabs, so other Chrome tabs get covered. The taskbar and Start never lock, and the cover always lets you pause.':
    'Bir uygulama adı (chrome, code) uygulamanın tamamına izin verir. Sekme başlığından bir kelime (github, docs) yalnızca o sekmelere izin verir, diğer Chrome sekmeleri kapanır. Görev çubuğu ve Başlat hiç kilitlenmez, kapak her zaman duraklatmanıza izin verir.',
  'Calendars': 'Takvimler', 'Name, e.g. Work': 'Ad, ör. İş', 'Calendar name': 'Takvim adı', 'Paste the calendar link': 'Takvim bağlantısını yapıştırın',
  'Calendar link': 'Takvim bağlantısı', 'Add calendar': 'Takvim ekle', 'Sync now': 'Şimdi eşitle', 'Import a file (.ics or .zip)': 'Dosya içe aktar (.ics ya da .zip)',
  'Name': 'Ad', 'Heads-up': 'Ön uyarı', 'Show on the timeline': 'Zaman çizelgesinde göster', 'Hidden from the timeline': 'Zaman çizelgesinde gizli',
  'Sample calendar': 'Örnek takvim', 'Imported file': 'İçe aktarılan dosya', 'Not synced yet': 'Henüz eşitlenmedi', 'No calendars yet': 'Henüz takvim yok', 'Syncing…': 'Eşitleniyor…',
  'Bring back the events you removed from Lumina': "Lumina'dan kaldırdığınız etkinlikleri geri getir",
  'Could not load. Check the link or your connection.': 'Yüklenemedi. Bağlantıyı ya da internetinizi kontrol edin.',
  'This link opens a web page, not a calendar. Copy the iCal address instead.': 'Bu bağlantı takvim değil, bir web sayfası açıyor. Bunun yerine iCal adresini kopyalayın.',
  'This link no longer works. It may have been reset or made private; copy it again.': 'Bu bağlantı artık çalışmıyor. Sıfırlanmış ya da gizlenmiş olabilir; yeniden kopyalayın.',
  "This calendar isn't public. Use its secret iCal address, or import an export file.": 'Bu takvim herkese açık değil. Gizli iCal adresini kullanın ya da dışa aktarma dosyasını içe aktarın.',
  'This is not a web link.': 'Bu bir web bağlantısı değil.', 'Could not load. Check your connection.': 'Yüklenemedi. İnternetinizi kontrol edin.',
  'Calendar links sync in the desktop and phone apps. In a browser, import a file instead.': 'Takvim bağlantıları masaüstü ve telefon uygulamasında eşitlenir. Tarayıcıda bunun yerine dosya içe aktarın.',
  'That is not a web link. Paste the iCal address that starts with https://': 'Bu bir web bağlantısı değil. https:// ile başlayan iCal adresini yapıştırın.',
  'No calendar found in that file.': 'Bu dosyada takvim bulunamadı.', 'That file is too big to keep. Export one calendar at a time.': 'Bu dosya saklamak için çok büyük. Takvimleri tek tek dışa aktarın.',
  'Evening': 'Akşam', 'Screen-time nudge after': 'Ekran süresi uyarısı, şu kadar sonra', 'Screen-time nudge after, minutes': 'Ekran süresi uyarısı, dakika',
  'Warm night light from': 'Sıcak gece ışığı, başlangıç', 'Night light time': 'Gece ışığı saati', 'Night light uses': 'Gece ışığı için',
  "Lumina's warm tint": "Lumina'nın sıcak tonu", 'Windows Night light': 'Windows Gece ışığı', 'Both': 'İkisi de',
  'Shut down PC at': 'Bilgisayarı kapat, saat', 'Shutdown time': 'Kapanma saati', 'Nudge me to sleep after bedtime': 'Yatma saatinden sonra uyumamı hatırlat',
  'Sleep timer': 'Uyku zamanlayıcısı', 'the moon button': 'ay düğmesi', 'After': 'Süre', 'Sleep timer length, minutes': 'Uyku zamanlayıcısı süresi, dakika', 'Then': 'Sonra',
  'Sleep the PC': 'Bilgisayarı uyut', 'Shut down the PC': 'Bilgisayarı kapat', 'Lock the PC': 'Bilgisayarı kilitle', 'Only remind me': 'Sadece hatırlat',
  'App': 'Uygulama', 'Alerts': 'Uyarılar', 'Pop-up + sound': 'Açılır uyarı + ses', 'Sound only': 'Sadece ses', 'Sounds': 'Sesler', 'Volume': 'Ses düzeyi',
  'Sound volume': 'Ses düzeyi', 'Theme': 'Tema', 'Light': 'Açık', 'Dark': 'Koyu', 'Start with Windows': 'Windows ile başlat',
  'About Lumina': 'Lumina hakkında', 'Language': 'Dil', 'Automatic': 'Otomatik', 'Start my day': 'Günüme başla',
  // settings sections, short labels and the "i" explanations
  'timer lengths': 'süreler', 'wake-up, bedtime, task heads-up': 'uyanış, yatma saati, görev ön uyarısı', 'how many, when': 'kaç tane, ne zaman',
  'water, posture, eyes, a walk': 'su, duruş, göz, yürüyüş', 'only your work apps during focus': 'odak sırasında sadece iş uygulamalarınız',
  'Google, Outlook, or a file': 'Google, Outlook ya da dosya', 'night light, screen time, bedtime': 'gece ışığı, ekran süresi, yatma saati',
  'where the small pill sits': 'küçük hap nerede dursun', 'alerts, sound, theme, language': 'uyarılar, ses, tema, dil',
  'Focus, minutes': 'Odak, dakika', 'Break, minutes': 'Mola, dakika', 'Long break, minutes': 'Uzun mola, dakika',
  'Long break every': 'Uzun mola sıklığı', 'Keep going': 'Kendiliğinden devam et', 'Meals a day': 'Günde öğün', 'Cook-or-order': 'Yemek ya da sipariş',
  "Turn on the ones you want and set how often. They pause while you're away from the screen.": 'İstediklerinizi açın ve sıklığını seçin. Ekrandan uzaktayken duraklarlar.',
  '15 min earlier': '15 dk erken', '15 min later': '15 dk geç', 'Color': 'Renk', 'Violet': 'Mor', 'Teal': 'Camgöbeği', 'Rose': 'Gül', 'Blue': 'Mavi', 'Amber': 'Kehribar', 'Green': 'Yeşil',
  'Where do I find the link?': 'Bağlantıyı nerede bulurum?', 'Warmth': 'Sıcaklık', 'Night light warmth': 'Gece ışığı sıcaklığı', 'Dim': 'Karartma', 'Dim the screen': 'Ekranı karart',
  'Screen-time nudge': 'Ekran süresi uyarısı', 'Corner widget': 'Köşe widget\'ı', 'Corner widget position': 'Köşe widget\'ının yeri',
  'Top left': 'Sol üst', 'Top right': 'Sağ üst', 'Bottom left': 'Sol alt', 'Bottom right': 'Sağ alt', 'Taskbar': 'Görev çubuğu',
  "Minimize Lumina and a small pill shows the timer and what's next. Pick a corner, or put it on the taskbar so it never covers your work. You can also drag it there.":
    'Lumina\'yı küçültünce küçük bir hap zamanlayıcıyı ve sıradakini gösterir. Bir köşe seçin ya da işinizin üstünü hiç kapatmasın diye görev çubuğuna koyun. Sürükleyip oraya bırakabilirsiniz de.',
  'Google Calendar': 'Google Takvim', 'Also add it to Google Calendar': 'Google Takvim\'e de ekle',
  'After this many focus sessions you get a long break instead of a short one. 0 keeps only short breaks.': 'Bu kadar odak seansından sonra kısa mola yerine uzun mola gelir. 0 yalnızca kısa molalar demektir.',
  'When a focus or a break ends, the next one starts by itself, so the timer runs all day.': 'Bir odak ya da mola bitince sıradaki kendiliğinden başlar, zamanlayıcı gün boyu döner.',
  'Your day runs from wake-up to the next wake-up, so 00:30 still counts as tonight. Body reminders only come between wake-up and bedtime.': 'Gününüz uyanıştan bir sonraki uyanışa kadar sürer, yani 00:30 hâlâ bu gece sayılır. Beden hatırlatmaları yalnızca uyanış ile yatma saati arasında gelir.',
  'A short alert this long before a task, besides the alert at its time. You can also pick it for each task when you add it.': 'Görevin saatindeki uyarıya ek olarak bu kadar önce kısa bir uyarı. Görev eklerken her görev için ayrıca seçebilirsiniz.',
  'A nudge this many minutes before each meal, to start cooking or order in time. 0 turns it off.': 'Yemeğe zamanında başlamanız ya da sipariş vermeniz için her öğünden bu kadar dakika önce bir hatırlatma. 0 kapatır.',
  "While focus runs, any app or tab that isn't on your list gets covered until you switch back. The taskbar and Start never lock, and the cover always lets you pause.": 'Odak sürerken listenizde olmayan her uygulama ya da sekmenin üstü, geri dönene kadar kapanır. Görev çubuğu ve Başlat hiç kilitlenmez, kapak her zaman duraklatmanıza izin verir.',
  "An app name (chrome, code) allows the whole app. A word from a tab's title (github, docs) allows only those tabs, so other Chrome tabs get covered.": 'Bir uygulama adı (chrome, code) uygulamanın tamamına izin verir. Sekme başlığından bir kelime (github, docs) yalnızca o sekmelere izin verir, diğer Chrome sekmelerinin üstü kapanır.',
  "Lumina's tint lays a warm layer over every screen and can also dim it. Windows Night light changes the display colors itself.": "Lumina'nın tonu her ekranın üstüne sıcak bir katman koyar ve ekranı karartabilir de. Windows Gece ışığı ekran renklerini doğrudan değiştirir.",
  'Darkens the screen beyond its lowest brightness. While you move the slider you see it for a few seconds.': 'Ekranı en düşük parlaklığının da altına karartır. Kaydırıcıyı oynatınca birkaç saniye görürsünüz.',
  'After this long at the screen without a break, a nudge to look away.': 'Mola vermeden bu kadar süre ekran başında kalınca uzağa bakmanız için bir uyarı.',
  'The moon button at the top starts it, for example for a movie. When it ends you always get 60 seconds to cancel.': 'Üstteki ay düğmesi başlatır, örneğin film için. Bittiğinde iptal etmek için her zaman 60 saniyeniz olur.',
  // meeting notes
  'Notes': 'Notlar', 'Close': 'Kapat', 'Meeting notes': 'Toplantı notları', 'Hide notes': 'Notları gizle', 'Copy': 'Kopyala', 'Copied': 'Kopyalandı', 'Delete': 'Sil',
  'Write your notes here. They stay on this device.': 'Notlarınızı buraya yazın. Bu cihazda kalır.',
  // focus lock cover and corner widget
  'Back to your focus': 'Odağınıza dönün', 'Switch to an allowed app from the taskbar and this goes away.': 'Görev çubuğundan izin verilen bir uygulamaya geçin, bu ekran kaybolur.',
  'Allow 5 min': '5 dk izin ver', 'Switch between focus and break': 'Odak ile mola arasında geç', 'Start or pause': 'Başlat ya da duraklat',
  'Open Lumina': "Lumina'yı aç", 'Pause': 'Duraklat',
  // default data: reminders, meals, the sample habit
  'Drink water': 'Su için', 'Sit tall': 'Dik oturun', 'Stand and walk': 'Kalkın ve biraz yürüyün', 'Look far away for 20 seconds': '20 saniye uzağa bakın',
  'Stretch neck and wrists': 'Boynunuzu ve bileklerinizi esnetin', 'Three slow breaths': 'Üç yavaş nefes', 'Fresh air': 'Temiz hava',
  'Save and commit': 'Kaydedin ve commit edin', 'Check messages': 'Mesajlara bakın', 'Vitamins and pills': 'Vitaminler ve ilaçlar',
  'Breakfast': 'Kahvaltı', 'Lunch': 'Öğle yemeği', 'Dinner': 'Akşam yemeği', 'Morning snack': 'Kuşluk atıştırması', 'Afternoon snack': 'İkindi atıştırması', 'Snack': 'Atıştırma',
};

const PATTERNS = [
  [/^Done: (.+)$/, 'Yapıldı: $1'], [/^Not done: (.+)$/, 'Yapılmadı: $1'], [/^Removed: (.+)$/, 'Kaldırıldı: $1'], [/^Restored: (.+)$/, 'Geri getirildi: $1'],
  [/^Added: (.+)$/, 'Eklendi: $1'], [/^Timer ended: (.+)$/, 'Zamanlayıcı bitti: $1'], [/^Timer cancelled: (.+)$/, 'Zamanlayıcı iptal edildi: $1'],
  [/^Timer: (.+), (\S+)$/, 'Zamanlayıcı: $1, $2'], [/^Turned off: (.+)$/, 'Kapatıldı: $1'], [/^Locked: (.+)$/, 'Kilitlendi: $1'],
  [/^Always allowed: (.+)$/, 'Her zaman izinli: $1'], [/^Notes: (.+)$/, 'Notlar: $1'],
  [/^Sleep timer: in (\S+(?: \d\dm)?) (.+)$/, 'Uyku zamanlayıcısı: $1 sonra $2'], [/^Sleep timer: (.+) left$/, 'Uyku zamanlayıcısı: $1 kaldı'],
  [/^Sleep timer: (.+)$/, 'Uyku zamanlayıcısı: $1'],
  [/^Stop the sleep timer\? (.+) left\.$/, 'Uyku zamanlayıcısı durdurulsun mu? $1 kaldı.'],
  [/^Start the sleep timer\? In (\S+(?: \d\dm)?) (.+)\.$/, 'Uyku zamanlayıcısı başlasın mı? $1 sonra $2.'],
  [/^(.+)\. The PC (goes to sleep|shuts down|locks) in 60 seconds\.$/, '$1. Bilgisayar 60 saniye içinde $2.'],
  [/^(.+) ended$/, '$1 bitti'], [/^(.+) is done$/, '$1 bitti'],
  [/^Time to cook or order (.+)$/, 'Yemek yapma ya da sipariş zamanı: $1'], [/^Cook or order (.+)$/, 'Yemek yap ya da sipariş ver: $1'],
  [/^(.+) starts now$/, '$1 şimdi başlıyor'], [/^(.+) at (\d\d:\d\d)$/, 'Saat $2: $1'],
  [/^(.+) at the screen\. Look away\.$/, '$1 ekran başındasınız. Uzağa bakın.'], [/^It's past bedtime \((.+)\)\.$/, 'Yatma saati geçti ($1).'],
  [/^(\d+)m$/, '$1dk'], [/^(\d+)h$/, '$1sa'], [/^in (\d+) min$/, '$1 dk sonra'], [/^in (.+)$/, '$1 sonra'],
  [/^happening now, until (.+)$/, 'şu an sürüyor · bitiş $1'], [/^until (\d\d:\d\d)$/, 'bitiş $1'], [/^until (\d\d:\d\d) · (.+)$/, 'bitiş $1 · $2'],
  [/^now · (.+) so far$/, 'şimdi · şu ana kadar $1'], [/^every (\d+) min$/, "$1 dk'da bir"],
  [/^(\d+) min before$/, '$1 dk önce'], [/^(\d+) min before (.+)$/, '$1 dk önce · $2'], [/^(\d+) min heads-up$/, '$1 dk ön uyarı'],
  [/^(.+) left$/, '$1 kaldı'], [/^(\d+)-day streak$/, '$1 günlük seri'], [/^(\d+) days$/, '$1 gün'],
  [/^Done, start counting again: (.+)$/, 'Yapıldı, yeniden saymaya başla: $1'],
  [/^Repeats every day\. Click to stop: (.+)$/, 'Her gün tekrarlanır. Durdurmak için tıklayın: $1'], [/^Repeat every day: (.+)$/, 'Her gün tekrarla: $1'],
  [/^Remove from Lumina \(stays in your calendar\): (.+)$/, "Lumina'dan kaldır (takviminizde kalır): $1"],
  [/^Turn off \(back on in Settings\): (.+)$/, "Kapat (Ayarlar'dan yeniden açılır): $1"], [/^Cancel timer: (.+)$/, 'Zamanlayıcıyı iptal et: $1'],
  [/^Skip today: (.+)$/, 'Bugün atla: $1'], [/^Remove (.+)$/, 'Kaldır: $1'], [/^Join (.+)$/, 'Katıl: $1'],
  [/^(\d+) done today$/, 'Bugün $1 yapıldı'], [/^Restore (\d+) removed$/, 'Kaldırılan $1 etkinliği geri getir'],
  [/^Restored (\d+) events? from (.+)$/, '$2: $1 etkinlik geri getirildi'], [/^Heads-up for (.+)$/, 'Ön uyarı: $1'],
  [/^Color of (.+)$/, 'Renk: $1'], [/^Name of (.+)$/, 'Ad: $1'], [/^Time of (.+)$/, 'Saat: $1'],
  [/^Synced (\d\d:\d\d) · (\d+) events this week$/, '$1 eşitlendi · bu hafta $2 etkinlik'], [/^(.+) · (\d+) events? this week$/, '$1 · bu hafta $2 etkinlik'],
  [/^Imported (\d+) calendars?$/, '$1 takvim içe aktarıldı'],
  [/^Reminders paused until (\d\d:\d\d)\. Click to resume$/, 'Hatırlatmalar duraklatıldı (bitiş $1). Sürdürmek için tıklayın'],
  [/^(\d+) min · Lumina(.*)$/, '$1 dk · Lumina$2'], [/^(.+) focus · (\d+) sessions? · (\d+) breaks?$/, '$1 odak · $2 seans · $3 mola'],
  [/^(.+): (\S+(?: \d\dm)?) timer, ends (\d\d:\d\d)(.*)$/, '$1: $2 zamanlayıcı, bitiş $3$4'], [/^\(for (\d+) o'clock, type (.+)\)$/, '(saat $1 için $2 yazın)'],
  [/^Allow all of (.+)$/, 'Tümüne izin ver: $1'], [/^Allow only: (.+)$/, 'Sadece buna izin ver: $1'], [/^Always allow (.+)$/, 'Her zaman izin ver: $1'],
  [/^(.+): (done|not done)$/, '$1: $2'], [/^(.+): (.+) focus$/, '$1: $2 odak'], [/^(Today|Tomorrow|Yesterday)(:| ·) (.+)$/, '$1$2 $3'],
];
