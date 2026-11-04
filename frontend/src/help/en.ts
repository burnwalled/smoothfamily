// Help texts (en): every topic in topics.ts, with the same blocks as en.ts (help.test.ts checks it).
import type { TopicText } from "./types";

const texts: Record<string, TopicText> = {
  "start": {
    "title": "Getting started",
    "summary": "What Smooth Family is, how the app is laid out and where to find things.",
    "blocks": [
      {
        "p": "Smooth Family is your family's own app for the calendar, lists, tasks, food, the home and the smart home. It runs on a server in your home – a NAS or a small computer – so your photos, messages and plans stay with you. Nothing is sent to big companies, and the AI is local and only on if you want it."
      },
      {
        "shot": "today",
        "caption": "Today gathers the day: calendar, tasks, weather and more."
      },
      {
        "h": "Install it like an app"
      },
      {
        "steps": [
          "Open the family's address in the phone's browser and sign in.",
          "iPhone: tap Share → Add to Home Screen. Android: tap ⋮ → Install app (or Add to home screen).",
          "Open Smooth Family from the home screen – it starts full screen and can send notifications."
        ]
      },
      {
        "h": "Finding your way"
      },
      {
        "p": "On a phone the most used apps are in the bar at the bottom and the rest under More; on a computer they are in the menu on the left. Apps that belong together are tabs at the top of the page – Calendar has Trips, Two homes and the Sunday check-in, Food has the Recipe book and the Pantry."
      },
      {
        "p": "Settings come in three levels, all in the menu behind your picture: My profile (your own), Family settings (for whoever runs the family) and Server settings (for whoever runs the server)."
      },
      {
        "tips": [
          "The ? next to a page's title opens the help for that page.",
          "Change the order of the menu, or hide apps you don't use, under My profile → Menu.",
          "Which apps each member sees is chosen by the family's admin under Family settings → Family members."
        ]
      }
    ]
  },
  "signin": {
    "title": "Signing in and staying safe",
    "summary": "Passwords, passkeys with Face ID or fingerprint, and two-step codes.",
    "blocks": [
      {
        "p": "You sign in with your username and password. Adults' passwords have at least 12 characters unless the server's admin has chosen otherwise – a long password is what makes it hard to crack. Children can have shorter ones."
      },
      {
        "h": "Passkeys – sign in with your face or finger"
      },
      {
        "steps": [
          "Open My profile → Security and connections.",
          "Tap Add passkey and follow the phone's or computer's prompt.",
          "Next time, choose Sign in with passkey on the sign-in page."
        ]
      },
      {
        "shot": "signin",
        "caption": "Passkeys and two-step codes under My profile."
      },
      {
        "h": "Two-step codes"
      },
      {
        "p": "With two-step codes you type a six-digit code from an app such as Microsoft or Google Authenticator after your password. The server's admin can make them required for adults. They work without a connection – no outside service is involved."
      },
      {
        "tips": [
          "Forgot your password? Ask the family's admin – they set a new one under Family settings → Family members.",
          "Lost the phone with your codes? The admin can reset your two-step sign-in in the same place.",
          "A passkey belongs to the address it was made on; if the family's address changes, make a new one."
        ]
      }
    ]
  },
  "notifications": {
    "title": "Notifications and the morning summary",
    "summary": "The bell, notifications on the phone and a summary of the day each morning.",
    "blocks": [
      {
        "p": "Everything that happens for you – a task to approve, a message, a reminder, a medicine dose – lands under the bell at the top. The number shows how many you haven't read. The same notifications can also be pushed to your phone."
      },
      {
        "shot": "notifications",
        "caption": "The notification centre keeps everything, read or not."
      },
      {
        "h": "On the phone"
      },
      {
        "steps": [
          "Open My profile → Notifications.",
          "Turn on notifications for this device and allow them when the phone asks.",
          "Choose what should be pushed – the rest still lands under the bell."
        ]
      },
      {
        "p": "The morning summary is one notification at the time you choose – weekdays or every day – with today's events, your tasks and medicines, the school lunch and the weather."
      },
      {
        "tips": [
          "iPhone: notifications only work when Smooth Family is added to the home screen.",
          "Each device is turned on separately – the phone and the tablet each need it."
        ]
      }
    ]
  },
  "offline": {
    "title": "Without coverage",
    "summary": "Lists and tasks work in a shop without reception.",
    "blocks": [
      {
        "p": "Smooth Family keeps what you have opened, so the app works when the connection is gone. On the shopping list you can tick, add and remove, and you can tick off tasks. The changes show at once and are marked with a small cloud until they have been sent."
      },
      {
        "p": "A marker at the top tells you that you're offline and how many changes are waiting. When the connection comes back they are sent by themselves, in the order you made them."
      },
      {
        "tips": [
          "Other pages show what was last loaded but can't be changed until you're online again.",
          "If someone else changed the same item meanwhile, the last change wins."
        ]
      }
    ]
  },
  "today": {
    "title": "Today",
    "summary": "The family's day on one page – and your own choice of cards.",
    "blocks": [
      {
        "p": "Today is the first page. It shows what matters now: this week's calendar, your tasks, the shopping list, the weather, the electricity price, waste collection, the school lunch, what in the pantry should be used soon, what's coming up for the home and the vehicles, who's home – and more."
      },
      {
        "shot": "today",
        "caption": "Each card can be moved, added or removed."
      },
      {
        "steps": [
          "Tap Customize at the bottom of Today.",
          "Add cards with Add widget, drag them into the order you want, or remove them.",
          "Tap Done."
        ]
      },
      {
        "tips": [
          "Departures: add a card per stop under Add widget – SL in Stockholm, or another provider for all of Sweden, Norway, Finland, Denmark or London (some need a key the server admin adds under Server → Address and services).",
          "The cards' sources – the weather place, waste collection calendar and school – are set by the family under Family settings → Everyday.",
          "A card for an app you can't use doesn't show."
        ]
      }
    ]
  },
  "calendar": {
    "title": "Calendar",
    "summary": "The family's calendar with the school's and the clubs', who drives and what to pack.",
    "blocks": [
      {
        "p": "The calendar shows the family's own events together with calendars you subscribe to – the school, the sports club, work. Switch between the week by the hour, the month and the agenda. Events over several days are a bar across them, and the week number is at the side."
      },
      {
        "shot": "calendar",
        "caption": "The week, hour by hour."
      },
      {
        "h": "Add an event"
      },
      {
        "p": "Tap + New event, give it a title and a time, and choose who it concerns – or leave it for everyone. Family events are shared with everyone in the family."
      },
      {
        "h": "Who drives, and what to pack"
      },
      {
        "p": "Tap Rides & packing next to an event – in the calendar or the Sunday check-in – to say that a ride is needed and take the drop-off or the pick-up – or, with Someone else, write who outside the family drives, such as a teammate's parent. Give it a packing list: the same list comes back for every event with the same title, such as each football practice, and is ticked off per time. An adult can choose the day it's time to pack, and the one going gets a task that day."
      },
      {
        "shot": "calendar-month",
        "caption": "The month writes out what's on each day."
      },
      {
        "h": "Subscribe to a calendar"
      },
      {
        "p": "Calendars are read through a private iCal link. This is how you find the link in the most common services:"
      },
      {
        "details": [
          {
            "title": "Google Calendar (Gmail)",
            "blocks": [
              {
                "steps": [
                  "Open calendar.google.com on a computer – the link can't be found in the mobile app.",
                  "In the left column under \"My calendars\", hover over the calendar and click ⋮ → \"Settings and sharing\".",
                  "Scroll down to \"Integrate calendar\".",
                  "Copy \"Secret address in iCal format\" (ends in .ics). Don't use \"Public address\" – it only works if the calendar is public."
                ]
              },
              {
                "note": "Work or school accounts: the administrator can turn the secret address off. If it's missing, ask them or use a personal account."
              }
            ]
          },
          {
            "title": "Outlook / Microsoft 365",
            "blocks": [
              {
                "steps": [
                  "Open outlook.com (personal account) or outlook.office.com (work/school) in a browser.",
                  "Click the gear (Settings) → Calendar → Shared calendars.",
                  "Under \"Publish a calendar\", choose the calendar and \"Can view all details\", then click Publish.",
                  "Copy the ICS link – not the HTML link."
                ]
              },
              {
                "note": "Classic Outlook for Windows can't publish calendars – use Outlook on the web or the new Outlook. In work accounts the administrator may have blocked publishing."
              }
            ]
          },
          {
            "title": "iCloud (iPhone / Mac)",
            "blocks": [
              {
                "steps": [
                  "On iPhone, open the Calendar app and tap \"Calendars\" at the bottom.",
                  "Tap (i) next to the calendar you want to add.",
                  "Turn on \"Public Calendar\" and tap \"Share Link…\" → Copy.",
                  "The link starts with webcal:// – paste it as is."
                ]
              },
              {
                "note": "\"Public\" means anyone who has the link can read the calendar. It isn't listed anywhere, but keep the link private."
              }
            ]
          },
          {
            "title": "SportAdmin (club and team activities)",
            "blocks": [
              {
                "steps": [
                  "Open the SportAdmin app and go to \"Activities\".",
                  "Tap the calendar icon in the top right corner.",
                  "Choose to copy the link (subscribing directly only adds the calendar to your phone).",
                  "Paste the link in Smooth Family. It usually starts with webcal://cal.sportadmin.se/."
                ]
              },
              {
                "note": "No activities showing? The team must be connected to the club calendar in SportAdmin – ask the team leader. Many club websites also have a \"Subscribe\" button on the calendar page: right-click it and copy the link address. Add one subscription per team and give each its own color."
              }
            ]
          },
          {
            "title": "MyClub (club and team calendar)",
            "blocks": [
              {
                "steps": [
                  "Open the club's website on MyClub (clubname.myclub.se) and go to the team's calendar, or the page about subscribing to the calendar.",
                  "Copy the subscription link. A team's looks like webcal://calendar.myclub.se/public/teams/12345/calendar.ics – the whole club's has /public/clubs/ instead.",
                  "Paste the link in Smooth Family."
                ]
              },
              {
                "note": "Can't find the link? Ask the team leader for the calendar's subscription link – it's the same one the club gives for iPhone and Google. Add one subscription per team, give each its own color, and choose the child it concerns."
              }
            ]
          },
          {
            "title": "laget.se (club and team calendar)",
            "blocks": [
              {
                "steps": [
                  "Open the team's page on laget.se, for example laget.se/TeamName.",
                  "Go to Kalender (calendar) and click Prenumerera (subscribe) below the calendar.",
                  "Copy the link. It looks like webcal://cal.laget.se/TeamName.ics – the same name as in the team's laget.se address.",
                  "Paste the link in Smooth Family."
                ]
              },
              {
                "note": "The calendar from laget.se covers a month back and six months ahead. Add one subscription per team, give each its own color, and choose the child it concerns."
              }
            ]
          },
          {
            "title": "Add the link in Smooth Family",
            "blocks": [
              {
                "steps": [
                  "Open the profile menu (top right) → Family settings → Calendar subscriptions.",
                  "Enter a name everyone recognizes, e.g. \"School\" or \"Edvin – football\".",
                  "Paste the link and pick a color.",
                  "Click Add. Events appear in the calendar and on the Today page."
                ]
              }
            ]
          },
          {
            "title": "Something not working?",
            "blocks": [
              {
                "tips": [
                  "New events can take up to 15 minutes to appear – calendars are cached so the services aren't overloaded.",
                  "Error when adding? Check that the link starts with https:// or webcal:// and that you copied the iCal/ICS link, not a web page link.",
                  "If a link has leaked, create a new one at the provider (Google: \"Reset\" the secret address) and replace it here."
                ]
              }
            ]
          }
        ]
      },
      {
        "tips": [
          "Subscribed calendars are read-only and refresh every 15 minutes.",
          "Your own calendar can be added to your phone with the subscription link under My profile."
        ]
      },
      {
        "h": "Red days"
      },
      {
        "p": "The country's public holidays are in the calendar as red days, with the eves that work like them (Christmas Eve, Midsummer Eve …) in a lighter red. Choose the country – or turn them off – under Family settings → Everyday. For another country, add a public holiday calendar as a subscription."
      }
    ]
  },
  "trips": {
    "title": "Trips",
    "summary": "Plan the trip together: dates, itinerary, packing per person and a budget.",
    "blocks": [
      {
        "p": "A trip has dates and a destination – it shows in the calendar – and who's going. Add the itinerary with travel, stays and activities (tickets can be linked from the vault), a shared budget and a checklist before leaving, such as turning off the water."
      },
      {
        "shot": "trips",
        "caption": "Packing per traveller, with ready-made lists."
      },
      {
        "h": "Packing"
      },
      {
        "p": "Each traveller has their own packing list, plus a shared one. Start from a template – beach, ski or weekend – and add the rest. An adult can choose the day it's time to pack: each traveller then gets a task that day, with points, and a link to their own list."
      },
      {
        "tips": [
          "The evening before you leave, everyone going is reminded of what's left to pack and check.",
          "Children see and pack their own things; adults plan the rest."
        ]
      }
    ]
  },
  "parties": {
    "title": "Parties",
    "summary": "Plan a party together – one invitation page for the guests, and the checklist, budget and timeline for you.",
    "blocks": [
      {
        "p": "Under Calendar → Parties, plan a child's birthday party, a celebration, a dinner, a match night, a barbecue or a day outdoors. The guests get one shared page – no account – first a save-the-date if you like, then the invitation where they reply with their name, allergies and whoever they bring as far as you allow, on the day the portal for their photos, and afterwards the thank-you. They can change their reply later. You choose what they see of each other: nothing, how many are coming, or the names."
      },
      {
        "shot": "parties",
        "caption": "The party's eight steps – here Design, starting with the templates."
      },
      {
        "steps": [
          "Calendar → Parties → New party: the name, kind, whose party, the time and the place – then the party walks you through seven steps.",
          "1 Details · 2 Design: templates and the look (theme and picture), the save-the-date, the invitation, the party day's portal and the thank-you, each a poster of its own · 3 Guests: who's coming, allergies, e-mail addresses – and your own list of invited guests.",
          "4 To do – before, on the day and after · 5 Budget · 6 The day's plan, with points you can hide from the guests · 7 Sending out: mails at their time (with the server's e-mail), or the links to share yourself."
        ]
      },
      {
        "shot": "partyinvite",
        "caption": "The guests' invitation: the poster in the party's theme, the details, the calendar buttons and the reply."
      },
      {
        "h": "Planning"
      },
      {
        "p": "A new party starts with a checklist for its kind – before, on the day and after – with dates; each morning one is due, the adults are reminded. Change it as you like. The budget keeps what's spent against what you planned, and the day's plan its times (a child's party starts with one) – a point can be hidden from the guests on the portal."
      },
      {
        "shot": "partyportal",
        "caption": "The party day's portal from the QR code: photos from the guests, the day's plan and more."
      },
      {
        "tips": [
          "The mails are HTML in the party's theme, with the guest's own button, and plain text for programs that want it. A save-the-date isn't mailed, as you don't have the addresses yet: under Sending out you get a ready message with the link, to share by text, WhatsApp, e-mail or any app. Those who sign up leave their address and get the invitation by mail.",
          "Under Guests you can put guests together, such as a couple who both registered. Each keeps their own reply and link, but nobody is counted twice, they can't also bring another +1, they sit at the same table, and one can answer for the other. The app points out when someone's +1 is already on the list, and shows how many can come at most.",
          "Bring in a toastmaster: under Details, Helpers from outside gives someone a personal link, without an account, ending 1 day, 3 days or 1 week after the party. They can do everything for that party except remove it, and see nothing else of the family's. A new step, The plan, holds speeches, serving, games and notes by the clock, and they choose whom it's kept from: for them it's greyed out.",
          "The check-in is an optional page: from its time the guests' link shows a countdown, that they're signed up, your information, and a thumb up or down. A thumb down with an optional message changes their reply, and you're told at once. A QR code scanned before the portal opens leads to a waiting page.",
          "Under Sending out, The mails shows what every mail says. Change the wording, see how it looks and plan when it goes.",
          "Details also has the menu, where guests choose their food with the reply, a sign-up for speeches, and practical information. Under Budget you gather suppliers, through the server's search or by hand, and a chosen one goes into the budget. Each task can have someone responsible, who gets its reminder. There's a run sheet, a seating list and place cards to print.",
          "Choose the party's pages under Details: the invitation with the reply is always there, the save-the-date, the party day's portal and the thank-you are up to you. What isn't chosen doesn't show under Design or Sending out, and the guests' link skips it.",
          "Bring in a guest list under Guests: Excel (.xlsx), CSV, a text file or pasted names. Everyone becomes invited with their own link. The seating is there too: add the tables and choose one for each guest; their company sits with them and the places are counted.",
          "Write {guest} in a text on a poster and a guest on a personal link sees their own first name. A text with it isn't shown to those without one, so it suits a greeting: the invitation and the thank-you start with one.",
          "The portal lives under Sending out: when it opens and when its QR code and link stop working – 3 hours after the party unless you change it, so nobody gets in the morning after. Printing the QR code is a task under To do, on a page in the party's theme. In your browser's print window, turn on background graphics to get the colours.",
          "Each page has Preview as guest under Design, for computer and phone. The last step, The party, gives a last check of what's left – then have fun!",
          "Under Guests, the link button beside each guest copies the personal link for them and their company, to send by text or however you like. It lets whoever has it reply as that guest, so send it only to them.",
          "Each poster can differ between computers and phones: choose Phone in the poster editor, and the order, what's shown, the alignment and the size you change apply only to phones. Texts and pictures are shared, so a correction shows on both. Until you change anything, the phone follows the computer. Wide tablets count as computers, narrow ones as phones.",
          "Templates (Design → Templates) put all the posters and the look on at once: the built-in Gala, or your own – save any party as a template. Or make one with your own AI: write your wishes, copy the prompt into any AI, and paste its answer back. You see it before it's used, only what the posters know comes in (no code, no outside pictures), and it can all be changed afterwards. A template can also be saved as a file and opened by another family.",
          "One link all the way: on the save-the-date the guests register with a name and an e-mail. The invitation mail gives each of them a personal link to reply with. Opening it again shows their reply, which they can change. Waiting guests get a reminder by themselves before the last day to reply (Mailings). From the time you set under Design the same link opens the party portal, and at the time you set under Thanks the thank-you goes out to those who came.",
          "One party, four pages in the same theme, each with a poster of its own (Poster): a save-the-date first if you like – the guests save the date and leave their e-mail, and get a mail when you switch the link to the invitation – then the invitation, the party day's portal and the thank-you. Paste a collaborative Spotify playlist and the guests can wish for songs. Open the portal and print its QR code for the tables: the guests upload their photos straight to an album in the vault and see the day's plan.",
          "The app comes with a picture library: backgrounds and top pictures for many of the themes, and stickers – balloons, a disco ball, a crayfish, a student cap, rings, a pumpkin and more – to put on the poster in place of emoji (Poster → a decoration row or the emblem → Library).",
          "Under Poster, make the invitation's page your own: add, move and remove its parts (texts, pictures, an emblem, a decoration row, when and where as a ticket, a card, a list or a big date, a countdown, calendar buttons, the invitation, a ribbon). Write every text with its typeface, size, alignment and colour – {title}, {date} and the like fill themselves in. Swap the emoji for others or for pictures of your own, and choose which calendar buttons the guests get: a calendar file (it opens Apple's Calendar on an iPhone or a Mac, and most others), Google or Outlook. The theme's poster is always one tap away.",
          "No set date yet: tick Let the guests vote on the date and add the dates that suit you. The guests tick the ones that suit them; under Invitation you see how many each date suits, and choose one – then it's in the calendar, the ones who voted for it are coming, and those who asked for updates get a mail.",
          "Choose what each guest may bring: no one, a +1, or the family – then they add everyone in their party, each with their allergies and whether they're a child. A dinner, a barbecue or a day outdoors starts with the family.",
          "Choose the party's look, which all its pages share – the ones for the kind of party first (balloons, pirates and dinosaurs for a child's party; disco, glitter, the 80s and champagne for a party; bistro, Christmas and a crayfish party for a dinner; football and hockey for a match; barbecue, rounders and the beach outdoors). Or create your own: colours, a pattern, emoji and your own pictures at the top and in the background – kept to use again. A picture of your own can go on the invitation too.",
          "Guests who give their e-mail and ask for updates get a confirmation, a mail if the time or place changes, a reminder the day before and the thank-you – and the messages you send them from Guests. It needs the server's e-mail, set up by the server admin under Server → Address and services.",
          "The party goes in the calendar by itself – for everyone whose party it is (tick one or more of the family), and you choose whose wish list is on the invitation.",
          "Show the wish list: the guests see the wishes of whose party it is and tick what they'll buy; the one it's for never sees who.",
          "Afterwards, under Thank-you: a thank-you text and the photos from an album in the vault, on the same page the guests already have.",
          "Only the adults plan parties – the wish list's reservations are on the planning."
        ]
      }
    ]
  },
  "school": {
    "title": "School",
    "summary": "The children's school day from InfoMentor or SchoolSoft, through Home Assistant: the school card, the school's calendars and the weekly letter.",
    "blocks": [
      {
        "p": "If the family has connected Home Assistant, the children's school can come into Smooth Family through the community integrations for InfoMentor and SchoolSoft. The school card on Today shows each child's school day, PE the next school day, the after-school hours, homework, absence and what's next – and the weekly letter, which opens right there. The school's calendars – the schedule, tests and trips, after school – come into the calendar as the child's."
      },
      {
        "details": [
          {
            "title": "InfoMentor (recommended)",
            "blocks": [
              {
                "steps": [
                  "In Home Assistant, open HACS → ⋮ → Custom repositories, add https://github.com/c14ym0re/infomentor-homeassistant as the type Integration, and install InfoMentor.",
                  "Restart Home Assistant.",
                  "Settings → Devices & services → Add integration → InfoMentor. Sign in with BankID (scan the QR code – so far only for Stockholm) or with your e-mail and password if your municipality still has the classic InfoMentor account.",
                  "Each child becomes a device. In Smooth Family, tick the child under Family members → the child → School from Home Assistant."
                ]
              },
              {
                "note": "It gives the school day, PE, homework, the weekly letter, absence, the after-school hours, the school calendar and the school's news – and, if you give it your school's Mateo unit, the lunch. Another integration, https://github.com/chrfo892/ha-infomentor, gives the schedule, check-in at after school and unread notifications; it's installed the same way."
              }
            ]
          },
          {
            "title": "SchoolSoft (schedule and attendance)",
            "blocks": [
              {
                "steps": [
                  "In HACS → ⋮ → Custom repositories, add https://github.com/chriseckl/Schoolsoft-for-Home-Assistant as the type Integration, install it and restart Home Assistant.",
                  "Settings → Devices & services → Add integration → SchoolSoft, and sign in with the guardian's username and password.",
                  "Add it once per child, then tick each child's account in Smooth Family."
                ]
              },
              {
                "note": "It gives the schedule as a calendar (lessons marked absent or late), the current and next lesson and the day's start and end. For the lunch menu there's https://github.com/kanylbullen/ha-schoolsoft – the school's name is the one in its SchoolSoft address."
              }
            ]
          }
        ]
      },
      {
        "p": "A new weekly letter, an absence today and news from the school are sent to the child's adults as notifications. The child's school is seen by their adults and the child themself; the kitchen display shows only the school day, never absence or letters."
      },
      {
        "tips": [
          "Add the School card to Today under Customize – and The school day to the kitchen display under Family settings → Kitchen display, if you like.",
          "Beta: the integrations are small, unofficial projects, and their sensors are recognised by their names (in English or Swedish). If something is missing, tell us which sensors your integration has.",
          "A school's calendar can also be added by hand under Calendar settings with the address homeassistant://calendar.name.",
          "Calendars from Home Assistant need a direct connection – they can't be read through the gateway."
        ]
      }
    ]
  },
  "health": {
    "title": "Health",
    "summary": "Your workouts and the day's steps, sleep and weight – private, or shared with the family.",
    "blocks": [
      {
        "p": "Log a workout in a few taps – the kind, the minutes, and a distance if you like – and the day's steps, sleep and weight. Your page shows the last four weeks: minutes a day, your workouts and the days in a row you've moved."
      },
      {
        "h": "Who sees it"
      },
      {
        "p": "Everything is yours alone until you share it, kind by kind: workouts, steps, sleep and weight, each with only you, the adults or the whole family. Others see what you share in the week's overview at the top."
      },
      {
        "steps": [
          "Open Health in the menu.",
          "Log a workout or the day's numbers.",
          "Under Who sees your health, choose what to share and with whom."
        ]
      },
      {
        "h": "Together"
      },
      {
        "p": "An adult sets the family's goals – hours, kilometres or workouts between two dates, such as 500 km together in May. They count the workouts each person shares with the family, and show on Health, in the Sunday check-in and on the kitchen display (the week's exercise). A task can be done by exercising: choose at least so many minutes that day, and it's ticked off by itself once the person's workouts add up – with points, as any task. Workouts also earn badges."
      },
      {
        "tips": [
          "The adults always see a child's health and can enter it – a parent can log the football practice.",
          "A child's weight isn't kept, and weight is never compared: it's not in the overview.",
          "Download your own data as a file, or remove it all, at the bottom of your page."
        ]
      },
      {
        "h": "From Home Assistant"
      },
      {
        "p": "If the family has connected Home Assistant, steps, sleep, weight and resting pulse can be fetched from each person's own accounts there: the phone with the companion app, a Withings user, Google Health, Garmin and others. A family admin links the accounts under Family settings → Family members → the person; the person then turns on Fetch my health from Home Assistant in their profile – nothing is fetched before that. For a child, an adult turns it on on the child's page. They're read every 15 minutes and on Fetch now, and kept on the day they're from; what you enter by hand on a day always wins, and a child's weight is never read."
      },
      {
        "tips": [
          "One account per person in Home Assistant: add the Withings, Garmin or Google Health integration once for each of you, each with your own login – and the companion app on each phone.",
          "Steps and sleep from your phone: install the Home Assistant companion app and turn on its sensors – on Android the Health Connect ones (steps, sleep, heart rate, weight…), on iPhone the pedometer (steps).",
          "A scale or a watch: Withings has its own integration in Home Assistant; Garmin, Fitbit, Oura and others are available as integrations from the community (HACS).",
          "Workouts (beta): from Withings' workout calendar, or an integration's last-activities sensor such as Garmin Connect or Strava – the last two weeks, each workout once, also when it's logged here by hand."
        ]
      }
    ]
  },
  "twohomes": {
    "title": "Two homes",
    "summary": "For children who live with both parents: the schedule, handovers and the other parent.",
    "blocks": [
      {
        "p": "Set up which days a child is in which home – week on, week off, 2-2-3, every other weekend or your own days – and add exceptions for holidays and swapped weekends. The calendar shows the days, and the child's tasks wait while they're in the other home."
      },
      {
        "shot": "twohomes",
        "caption": "The schedule between the homes."
      },
      {
        "steps": [
          "Open Family settings → Family members → the child.",
          "Choose the child, the pattern and the first day.",
          "Add exceptions when plans change."
        ]
      },
      {
        "h": "The other parent"
      },
      {
        "p": "The other parent can get an account of their own that only sees their child: the schedule, the calendar, the emergency card and the handover list – and can write with you. Or send a link that shows the same without an account. Costs for the child's things can be shared, so they see the amount and their part – never photos or notes."
      },
      {
        "tips": [
          "The evening before a handover the adults are reminded, with the handover list.",
          "The Two homes tab shows in the calendar once a schedule is set up."
        ]
      }
    ]
  },
  "week": {
    "title": "The Sunday check-in",
    "summary": "A relaxed weekly moment: look back, look ahead and say thank you.",
    "blocks": [
      {
        "p": "The Sunday check-in gathers the family once a week. Look back at the points and this week's top helper, look ahead at the calendar, the meals and whose turn it is – and give each other thank-you stars."
      },
      {
        "shot": "week",
        "caption": "The week behind and the week ahead."
      },
      {
        "p": "Pick something to do together, and mark the check-in as done: everyone gets a short summary. On Sunday afternoon you're reminded if you haven't done it."
      },
      {
        "h": "Planning the week ahead"
      },
      {
        "p": "Under the week ahead, tap Rides & packing next to an event to take a drop-off or a pick-up and give it a packing list. Write a day's dinner straight in – a recipe's name brings its ingredients for the shopping list – or plan the whole week's food from there."
      }
    ]
  },
  "chat": {
    "title": "Chat",
    "summary": "The family's own chat – with pictures, and only for you.",
    "blocks": [
      {
        "p": "Write with the whole family or with one or a few. Pictures go into the chat's own album in the vault. Messages are kept on your server – nobody else reads them."
      },
      {
        "shot": "chat",
        "caption": "Messages grouped per person, with big emojis."
      },
      {
        "tips": [
          "GIFs can be turned on by the server's admin; they come from GIPHY, the only time the chat reaches outside.",
          "Unread messages show as a number on the chat and as a card on Today."
        ]
      }
    ]
  },
  "lists": {
    "title": "Lists",
    "summary": "Shopping lists and to-do lists that update for everyone at once.",
    "blocks": [
      {
        "p": "Make as many lists as you need – the shopping, the hardware store, packing. Everyone sees ticks and new items at once, and the lists work without coverage. Rename a list with the pencil next to its name."
      },
      {
        "shot": "lists",
        "caption": "A shopping list, shared and live."
      },
      {
        "tips": [
          "Bought groceries can go straight into the pantry with Put bought items in the pantry.",
          "A list can be sent to Home Assistant, and from there to the shop's app – see Shopping lists in Home Assistant.",
          "Wish lists and gift planning are lists too – see Wish lists and presents."
        ]
      }
    ]
  },
  "wishes": {
    "title": "Wish lists and presents",
    "summary": "Everyone's wish list, secret gift planning and a link for the grandparents.",
    "blocks": [
      {
        "p": "Everyone in the family has a wish list. Add a wish with a link and a price – or search the web for it. The others plan presents in secret: the birthday person never sees who buys what."
      },
      {
        "shot": "wishes",
        "caption": "A wish list with links."
      },
      {
        "h": "Share with relatives"
      },
      {
        "p": "Send a link to grandparents and others without an account. They see the wish list and can mark what they're buying, so nothing is bought twice – without the child seeing it."
      },
      {
        "tips": [
          "Six weeks before a birthday the birthday person is reminded to fill in their list, and a month before the others are reminded to plan.",
          "Birthdays: a member's on their page under Family members; relatives and friends under Family members → Other people."
        ]
      }
    ]
  },
  "food": {
    "title": "Food and the meal plan",
    "summary": "The week's dinners, recipes from a link, and cooking mode.",
    "blocks": [
      {
        "p": "Plan the week's dinners on Food. Get a recipe from a link – most recipe sites work – or paste the text if a site doesn't let it be read. The ingredients can go straight onto the shopping list."
      },
      {
        "shot": "food",
        "caption": "The week's dinners."
      },
      {
        "h": "Cooking mode"
      },
      {
        "p": "Tap Cook on a recipe for big type, ingredients to tick off and steps to tap through. Keep the screen on stops the phone from going dark while your hands are messy."
      },
      {
        "h": "Lunchboxes and weekend lunch"
      },
      {
        "p": "When you plan the week, tick Lunchboxes on weekdays and say how many a day: the dinner the evening before is then a big batch – a stew, a soup, a bake that keeps and reheats well – and its leftovers become the next day's lunchboxes. Tick Lunch on Saturday and Sunday for the weekend's lunches too. The choice is remembered for next week."
      },
      {
        "tips": [
          "With the local AI the week's dinners can be suggested for you – from what you like and what you have at home.",
          "When dinner is done, tick off what was used and the pantry counts itself down."
        ]
      }
    ]
  },
  "recipebook": {
    "title": "The recipe book",
    "summary": "The family's recipes with categories, favourites and stars from everyone.",
    "blocks": [
      {
        "p": "The recipe book keeps the family's recipes with categories, favourites and a link to the original. Everyone in the family gives their own stars – children too – so you see what's popular."
      },
      {
        "shot": "recipebook",
        "caption": "Recipes with everyone's stars."
      },
      {
        "p": "Can be made now shows what can be cooked from what you have in the pantry. Search the web for new recipes through the server's own search engine – only the search words leave the server."
      }
    ]
  },
  "pantry": {
    "title": "The pantry",
    "summary": "What you have in the freezer, the fridge and the pantry – and what to use soon.",
    "blocks": [
      {
        "p": "Keep track of what you have, where, and until when. What's about to run out is marked and shows on Today, so less food is thrown away."
      },
      {
        "shot": "pantry",
        "caption": "Best before, per place."
      },
      {
        "h": "Scan in the groceries"
      },
      {
        "steps": [
          "Tap Scan groceries and hold up the items to the camera one by one – the same item again counts up.",
          "Check names and amounts.",
          "Put it all in the right place in one go."
        ]
      },
      {
        "tips": [
          "Looking up barcodes can be turned on under Family settings → Sharing; only the barcode is sent.",
          "A receipt read by the local AI can fill the pantry too."
        ]
      }
    ]
  },
  "tasks": {
    "title": "Tasks and points",
    "summary": "Chores with points, taking turns, approval – and reporting afterwards.",
    "blocks": [
      {
        "p": "Tasks can be one-off or repeat daily, on chosen weekdays, monthly or yearly. Each is worth points. Tap Done when it's done – children's tasks can wait for an adult to approve them."
      },
      {
        "shot": "tasks",
        "caption": "Today's tasks with points."
      },
      {
        "h": "Taking turns"
      },
      {
        "p": "Choose who takes turns on a task: the turn passes when it's done, or every week. The list shows who's next."
      },
      {
        "h": "Forgot to tick it off?"
      },
      {
        "p": "On Tasks → Today, step back with the arrow – up to three days – and tick off what was done, with points as usual."
      },
      {
        "h": "Ticked off the wrong one?"
      },
      {
        "p": "Tap the tick on a done task to undo it – the points go back. A child can undo their own until an adult has approved it; an adult can undo any. On the kitchen display, tap the done task and confirm."
      },
      {
        "h": "Tasks from other apps"
      },
      {
        "p": "A child's and a pet's medicine doses become tasks with points, and so does packing before a trip or an event. An adult can tick off a child's dose; the points are still the child's."
      },
      {
        "tips": [
          "A task can repeat every workday (Monday–Friday that aren't red days) or every weekend day and red day – walking the dog, feeding the cat. The red days follow the family's country, so Christmas, Easter and Midsummer's Eve count as weekend by themselves.",
          "Any schedule: every day or every other day, chosen weekdays (weekdays, the weekend), every few weeks, a date or a weekday of the month (the first Saturday), every few months, once a year – with points. Pets, the home and vehicles have their recurring tasks with the same choices.",
          "Children can suggest tasks; an adult turns them into tasks or declines.",
          "Points go to the shop and the allowance – see those topics.",
          "A task several can do together shares its points between those who did it: choose who when it's ticked off.",
          "Taking a task away keeps the points already earned with it – and the times it was done."
        ]
      }
    ]
  },
  "allowance": {
    "title": "Allowance and savings",
    "summary": "Pocket money from points or a goal, and savings jars.",
    "blocks": [
      {
        "p": "Each child earns allowance either from points or by reaching a weekly goal – the family chooses per child. Payouts are noted, so everyone sees what has been paid."
      },
      {
        "shot": "allowance",
        "caption": "The allowance and the savings jars."
      },
      {
        "p": "Savings jars split the money: spend, save, give or a goal of their own. A child can propose a savings goal with part of the allowance; an adult approves it."
      }
    ]
  },
  "shop": {
    "title": "The reward shop and achievements",
    "summary": "Swap points for rewards, and unlock achievements.",
    "blocks": [
      {
        "p": "In the shop children swap their points for rewards the adults have added – an hour of gaming, choosing Friday's dinner. A purchase can wait for an adult's approval. Family goals are rewards the whole family saves towards together."
      },
      {
        "shot": "shop",
        "caption": "Rewards in the shop."
      },
      {
        "p": "Achievements unlock by themselves – the first task, a week in a row – and the level grows with the points."
      }
    ]
  },
  "littleones": {
    "title": "The little ones' mode",
    "summary": "Big pictures instead of text, for children who can't read yet.",
    "blocks": [
      {
        "p": "In the little ones' mode a child sees big picture cards instead of the app: morning and evening routines in order, the preschool bag – tap when it's done, for a little fanfare and a sticker."
      },
      {
        "shot": "littleones",
        "caption": "Routines for the little ones."
      },
      {
        "steps": [
          "Open Tasks → Little ones' mode.",
          "Turn the mode on for the child – a child of 6 or younger whose birthday was given starts with it on.",
          "Start from a ready-made routine or make your own with pictures."
        ]
      },
      {
        "tips": [
          "A grown-up gets out of the mode by holding the lock and answering a sum.",
          "On the kitchen display each child can open their routines by tapping their face."
        ]
      }
    ]
  },
  "vault": {
    "title": "The vault",
    "summary": "Photos, files, documents, receipts and passwords in one place.",
    "blocks": [
      {
        "p": "The vault keeps the family's photos, chat pictures, files, documents and receipts – everything encrypted on your server. Filter by kind, search, and mark something Only me so nobody else sees it."
      },
      {
        "shot": "vault",
        "caption": "Everything in the vault, with a filter per kind."
      },
      {
        "h": "Share with a link"
      },
      {
        "p": "Anything in the vault can be shared with a link that stops working by itself – after hours or days, or once it has been opened. Choose whether the recipient may download it. Word, Excel and PowerPoint files are shown right in the browser."
      },
      {
        "tips": [
          "Photos from the same day in earlier years show up as Memories on Today.",
          "The server's admin sets how large a file may be."
        ]
      }
    ]
  },
  "documents": {
    "title": "Documents",
    "summary": "Passports, ID cards, insurance and contracts – with reminders before they run out.",
    "blocks": [
      {
        "p": "Keep the family's documents with a scan: passports, ID cards, driving licences, insurance, warranties, contracts and vaccinations. Numbers are shown masked and everything is encrypted with the family's own key."
      },
      {
        "shot": "documents",
        "caption": "Documents with expiry dates."
      },
      {
        "p": "An expiry date gives a reminder in time and shows in the calendar, so the passport is renewed before the holiday."
      }
    ]
  },
  "passwords": {
    "title": "Passwords",
    "summary": "The family's shared logins, encrypted with the family's key.",
    "blocks": [
      {
        "p": "Keep logins in the vault's Passwords view: the streaming service, the Wi-Fi, the school's platform. They are encrypted with the family's key. An adult chooses which adults a login is shared with; children see their own and adults see the children's."
      },
      {
        "shot": "passwords",
        "caption": "Logins, with a generated password."
      },
      {
        "tips": [
          "Generate a strong password with one tap.",
          "A login shared with a link is shown once – then the link stops working."
        ]
      }
    ]
  },
  "receipts": {
    "title": "Receipts",
    "summary": "Receipts read by the local AI, with reminders for returns and warranties.",
    "blocks": [
      {
        "p": "Take a photo of a receipt or choose a screenshot, and link it to a home, a vehicle or a category. With the local AI the shop, amount and date are read for you. The last day to return and the end of the warranty give reminders, and the time to complain shows by itself."
      },
      {
        "shot": "receipts",
        "caption": "Receipts with returns and warranties."
      },
      {
        "tips": [
          "Search the receipts, see The year in numbers and export them for Excel.",
          "A receipt for a child's things can be shared with the other home.",
          "The local AI can write a complaint letter for you.",
          "On Android, share a receipt from another app straight to Smooth Family."
        ]
      }
    ]
  },
  "safety": {
    "title": "Emergency cards and medicines",
    "summary": "What a babysitter needs to know, and medicines with reminders.",
    "blocks": [
      {
        "p": "The emergency cards hold the most important facts if something happens: allergies, medicines, the health centre, who to call and routines – one for each person and one for the home. They can be read even without a connection."
      },
      {
        "shot": "safety",
        "caption": "The emergency cards. A member's card and medicines are kept on their page under Family settings → Family members; the household's card under Everyday."
      },
      {
        "h": "A babysitter or the grandparents"
      },
      {
        "p": "Make a guest link under Family settings → Family members: it shows the emergency cards, and what you choose of the calendar and the lists, for some hours or days – then it stops by itself."
      },
      {
        "h": "Medicines"
      },
      {
        "p": "Add a medicine with dose, times and an end date for a course. A child's and a pet's doses become tasks with points; the adults are told if a dose isn't ticked off. An adult's own medicines are private – they're set up under My profile and give no points."
      }
    ]
  },
  "property": {
    "title": "The home",
    "summary": "Maintenance, things per room, energy and projects – per home.",
    "blocks": [
      {
        "p": "Each home – the house, the flat, the cabin – has its own card with the maintenance that's due, this year's costs against last year, the energy and the open projects with budget against what has been spent."
      },
      {
        "shot": "property",
        "caption": "A card per home."
      },
      {
        "p": "Maintenance that comes back – the gutters, filters, the smoke alarm – is suggested for the kind of home, reminded in advance and shown in the calendar; it can also become a task. Things per room – appliances, the heat pump – keep make, price, manual and warranty."
      },
      {
        "tips": [
          "Electricity, water and heating can be read from Home Assistant's sensors (read only).",
          "Print a list of things and receipts for the home insurance."
        ]
      }
    ]
  },
  "economy": {
    "title": "Economy",
    "summary": "Where the household's money goes – with incomes, budgets and the bank's file.",
    "blocks": [
      {
        "p": "Economy shows the household's spending per category – food, the homes, the car, the children, leisure. Receipts and the homes', vehicles' and trips' costs are counted by themselves. Each adult adds their own income, and the overview shows what comes in, goes out and is left."
      },
      {
        "shot": "economy",
        "caption": "The month per category."
      },
      {
        "h": "Import from the bank"
      },
      {
        "steps": [
          "Export the account's transactions as CSV from the internet bank.",
          "Upload the file under Economy → Import from the bank.",
          "Check the suggestion for each row – fuel to the car, the electricity bill to the home – and save."
        ]
      },
      {
        "tips": [
          "A budget per category and month turns red when it's broken.",
          "Entries can be private, so only you see them."
        ]
      }
    ]
  },
  "vehicles": {
    "title": "Vehicles",
    "summary": "Inspection, service, tyres, costs and consumption – for anything with an engine or wheels.",
    "blocks": [
      {
        "p": "Each vehicle has a card with what's coming up – inspection, service, tyre change, insurance and tax – and this year's costs. Reminders go by date or by mileage, and the next one is set when you mark one done."
      },
      {
        "shot": "vehicles",
        "caption": "A vehicle with what's coming up."
      },
      {
        "p": "Add fuel or charging with litres or kWh and the consumption is worked out; home charging uses the day's electricity price. Keep the tyre sets with season and tread, and make a report for a buyer with the service history."
      },
      {
        "tips": [
          "A photo of the receipt or a service history as PDF is read by the local AI.",
          "The odometer can be read from a Home Assistant sensor."
        ]
      }
    ]
  },
  "pets": {
    "title": "Pets",
    "summary": "Vet visits, vaccinations, chores and a birthday.",
    "blocks": [
      {
        "p": "Each pet has its vet visits and vaccinations, reminded when they're due, and a birthday among the birthdays. Chores like walks and feeding become tasks the children take turns on – and medicine doses follow the same turns."
      },
      {
        "shot": "pets",
        "caption": "A pet with its care."
      },
      {
        "tips": [
          "A task can repeat every workday (Monday–Friday that aren't red days) or every weekend day and red day – walking the dog, feeding the cat. The red days follow the family's country, so Christmas, Easter and Midsummer's Eve count as weekend by themselves."
        ]
      }
    ]
  },
  "smarthome": {
    "title": "The smart home",
    "summary": "Lights, heat and speakers, flows, who's home and the electricity price.",
    "blocks": [
      {
        "p": "With Home Assistant connected you control the home's devices from Smooth Family – lights, blinds, the heat pump, the robot vacuum, speakers – per room and per home. The family's admin chooses which devices show."
      },
      {
        "shot": "smarthome",
        "caption": "Devices per room."
      },
      {
        "h": "Flows"
      },
      {
        "p": "Build your own automations with When → If → Do: at a time, with a button on Today, when a device changes or when someone comes home – for example, turn on the porch light when it gets dark. Flows can run in Home Assistant itself, so they work while Smooth Family restarts."
      },
      {
        "h": "Who's home"
      },
      {
        "p": "Link the family to the people in Home Assistant, and each one chooses to show home or away – never where you are. Nothing is saved."
      },
      {
        "tips": [
          "Electricity price: a Today card with today's hours, and flows that run in the cheapest hours.",
          "No Home Assistant? Try everything with the simulated home."
        ]
      }
    ]
  },
  "homeassistant": {
    "title": "Connecting Home Assistant",
    "summary": "The home's Home Assistant directly – and other homes through the gateway.",
    "blocks": [
      {
        "p": "Home Assistant in the same home as the Smooth Family server is connected directly, with its address and a long-lived token. Another home – the cabin – is connected through the gateway instead, without opening any port there."
      },
      {
        "steps": [
          "In Home Assistant: your profile → Security → Long-lived access tokens → Create token. Copy it.",
          "In Smooth Family: Family settings → Connections → Smart home.",
          "Enter the address, e.g. http://homeassistant.local:8123, and the token, and tap Connect.",
          "Add the devices that should show, and link the home to the right property."
        ]
      },
      {
        "shot": "homeassistant",
        "caption": "Homes and devices under Family settings."
      },
      {
        "p": "The token is kept encrypted on the server. Smooth Family reads states and switches what you have added; meters and sensors for energy and the odometer are only read."
      },
      {
        "tips": [
          "Use an address that works from the server – an IP address is safest.",
          "Hosted families (on someone else's server) always connect through the gateway."
        ]
      }
    ]
  },
  "gateway": {
    "title": "The gateway – Home Assistant in another home",
    "summary": "The cabin's Home Assistant without opening a port: as an add-on or a container.",
    "blocks": [
      {
        "p": "The gateway runs next to the other home's Home Assistant and calls your Smooth Family server over HTTPS, keeping the line open. No port is opened there, and it works behind 4G routers. The Home Assistant token stays in that home; the server can only ask for states and calls in the allowed domains – locks and alarms only if you add them."
      },
      {
        "h": "1. Make a pairing code"
      },
      {
        "p": "Family settings → Connections → Smart home → Add a home through the add-on. Give it a name and choose the property; the eight-character code is valid for 24 hours."
      },
      {
        "shot": "gateway",
        "caption": "A home through the gateway, with its version."
      },
      {
        "h": "2. Install it – which way depends on Home Assistant"
      },
      {
        "p": "Settings → About in Home Assistant shows the installation type."
      },
      {
        "details": [
          {
            "title": "Home Assistant OS or Supervised: as an add-on",
            "blocks": [
              {
                "steps": [
                  "Settings → Add-ons → Add-on store → ⋮ → Repositories, and add https://github.com/burnwalled/smoothfamily.",
                  "Smooth Family shows in the store: install it.",
                  "Enter the server's address and the pairing code in its options, and start it."
                ]
              },
              {
                "p": "The add-on uses Home Assistant's own token – no long-lived token is needed."
              }
            ]
          },
          {
            "title": "Home Assistant Container or Core: as a container of its own",
            "blocks": [
              {
                "p": "Add-ons don't exist in these installations, so the gateway runs as a Docker container next to Home Assistant, or on a Raspberry Pi in that home. It needs a long-lived token from your Home Assistant profile."
              },
              {
                "steps": [
                  "Get the gateway folder from https://github.com/burnwalled/smoothfamily and build its image: docker build -t smooth-family-gateway gateway/",
                  "Start it with SF_SERVER (the server's address), SF_PAIRING_CODE, HA_URL and HA_TOKEN, and a volume for /data.",
                  "Its log says Paired as … and then Connected to …."
                ]
              }
            ]
          }
        ]
      },
      {
        "h": "3. Updates"
      },
      {
        "p": "The gateway updates itself from your server – on by default. It only runs versions signed on the computer the releases are made on; even someone who took over the server couldn't run anything in the cabin. If a new version doesn't connect, the previous one comes back by itself. The home shows Latest version when it's up to date."
      },
      {
        "tips": [
          "Replacing the gateway's computer, or a key that may have leaked? Make a new code – the old key stops working at once.",
          "If the line is down, a command fails at once instead of running late."
        ]
      }
    ]
  },
  "halists": {
    "title": "Shopping lists in Home Assistant",
    "summary": "Send a list to Home Assistant – and from there to ICA's or Coop's app.",
    "blocks": [
      {
        "p": "A list can be sent to one of Home Assistant's to-do lists, or linked to one so both stay the same. With a shop's integration installed in Home Assistant, the list then shows up in the shop's own app. What's bought there is ticked off here and shows under Just bought in the pantry."
      },
      {
        "steps": [
          "Install the shop's integration in Home Assistant (links in the dialog – made by others, at your own risk).",
          "Open the list in Smooth Family → Home Assistant.",
          "Choose the to-do list, and send it once or link the lists."
        ]
      },
      {
        "note": "New and not fully tested with the shops yet: it works as well as the shop's integration syncs ticks back."
      }
    ]
  },
  "kiosk": {
    "title": "The kitchen display",
    "summary": "A tablet on the wall with the family's day.",
    "blocks": [
      {
        "p": "Connect a tablet with a link or a QR code of its own. It shows the family's day: today's and tomorrow's calendar with who drives, who's home, the weather, the tasks, dinner and the school lunch, the waste collection and the electricity price – and a button for the emergency card. Nothing private is shown, and the screen has no account."
      },
      {
        "shot": "kiosk",
        "caption": "The kitchen display."
      },
      {
        "h": "On the screen"
      },
      {
        "p": "Tasks are ticked off right there, with big rows for fingers: tap one, then your face – for a task done together, everyone who helped, and the points are shared. The week's meals and the recipe book open the cooking mode: the recipe in big type, ingredients to tick off and the steps one at a time. The smart home devices chosen for the screen switch with a tap."
      },
      {
        "h": "The screensaver"
      },
      {
        "p": "After the minutes you choose, the screensaver comes on: the family's photos, a flip clock, a calm clock with the weather, a dark screen – or the fox, who plays out the weather outside. It reads on grey days, flies a kite when clouds pass, holds its umbrella in the rain, builds a snowman when it snows and sleeps at night, and the day's open tasks show over the lake. A tap wakes the screen."
      },
      {
        "p": "Every few minutes the fox does something small that fits the weather – hops, splashes in a puddle, throws a snowball, watches a shooting star – and now and then a hare runs by or a fish jumps in the lake. It dresses up for Halloween, Christmas, New Year, Easter and Midsummer, and on a birthday (the people under Birthdays) it gets balloons, a party hat and a banner with the name. The holidays follow the family's country; turn the dressing up off per screen under the screensaver. With reduced motion on the tablet, the fox keeps still."
      },
      {
        "steps": [
          "Family settings → Kitchen display → Connect a screen.",
          "Open the link on the tablet (or scan the QR code) and add it to the home screen.",
          "Under the screen, choose what it shows, its screensaver, colours, language and night."
        ]
      },
      {
        "tips": [
          "Everything about a screen is in Family settings → Kitchen display: its name, the screensaver (with a picture of each), what it shows, its colours and language, when it dims at night, the smart home devices it may switch and what it may do. One button gives all screens the same settings, and a screen picks up a change within a minute.",
          "The week's meals and the recipe book are chosen per screen – they stay off until you turn them on.",
          "A lock is never shown on the screen, whatever you choose.",
          "A lost link is replaced with New link; Disconnect stops the link altogether.",
          "The little ones can open their picture routines there by tapping their face.",
          "Full screen with the button in the corner (on an iPad, add the screen to the home screen instead)."
        ]
      }
    ]
  },
  "localai": {
    "title": "The local AI",
    "summary": "An AI on a computer in your home – for receipts, recipes and suggestions.",
    "blocks": [
      {
        "p": "Smooth Family can use an AI that runs on a computer in your home with Ollama. It reads receipts and service histories, turns text or a photo into a recipe, suggests the week's dinners and chores, and answers questions with web search. Nothing is sent to an outside service."
      },
      {
        "shot": "localai",
        "caption": "Jobs for the local AI."
      },
      {
        "p": "The server's admin sets it up once (Server settings → Local AI) – it needs a computer with a reasonably good graphics card. Then each family chooses to turn it on. Jobs are queued, so the computer can sleep and be woken when there's work."
      },
      {
        "tips": [
          "Everything the AI suggests is shown to you before it's saved.",
          "Without the AI you can still copy the prompt to an AI of your choice."
        ]
      }
    ]
  },
  "websearch": {
    "title": "Searching the web",
    "summary": "Search through the server's own search engine – only the words leave.",
    "blocks": [
      {
        "p": "When the server's admin has turned on the search, you can search the web from Smooth Family: for wishes and presents, recipes, manuals for things in the home, facts about the car and things to do. The search runs on your own server (SearXNG), so only the search words leave it – not who's asking."
      },
      {
        "p": "With the local AI you can also ask a question and get an answer with sources from the web."
      }
    ]
  },
  "family": {
    "title": "Family settings",
    "summary": "Members, which apps each sees, and the family's everyday.",
    "blocks": [
      {
        "p": "Family settings are for whoever runs the family. The admin adds members and chooses which apps each one sees; an adult the admin trusts can be allowed to change the everyday settings too."
      },
      {
        "shot": "family",
        "caption": "Everyone in the family; open one for everything about them."
      },
      {
        "h": "A member's own page"
      },
      {
        "p": "Tap a member for everything about them in one place: name, colour and picture, a new password and resetting two-step sign-in, which apps they use – and for a child the language in the app, the birthday, the little ones' mode, the allowance, medicines and emergency card. An adult's own medicines stay private, and adults choose their own picture."
      },
      {
        "h": "What's where"
      },
      {
        "p": "Family members: everyone, each with a page of their own (sign-in, apps, language, picture – and a child's birthday, allowance, little ones' mode, two homes, medicines and emergency card), other people without an account for their birthdays, and guest links for a babysitter or the grandparents. Everyday: calendars, the home, Today's sources, the points' rules, the household's emergency card and the pets' medicines. Kitchen display. Family members: the smart home and the local AI. Security and data: backups and export."
      },
      {
        "tips": [
          "Give a child's birthday when you add them – a child of 6 or younger starts in the little ones' mode.",
          "The family's setup guide can be opened again at the top of Family settings.",
          "A new member starts in the admin's language; a parent changes a child's on the child's page."
        ]
      }
    ]
  },
  "familydata": {
    "title": "The family's data and backups",
    "summary": "Export, the family's own backup key and moving the family.",
    "blocks": [
      {
        "p": "Under Family settings → Security and data the admin can export the family's data and, on a hosted server, choose a backup key of the family's own: the family's backups are then sealed so that only you can open them – not even the server's admin."
      },
      {
        "shot": "familydata",
        "caption": "The family's backups and key."
      },
      {
        "tips": [
          "Keep the key outside the server, like an important password – without it the backups can't be restored.",
          "The log shows sign-ins and changes in the family."
        ]
      }
    ]
  },
  "profile": {
    "title": "My profile",
    "summary": "Your name, picture, language, menu, notifications and security.",
    "blocks": [
      {
        "p": "My profile has four tabs. About me: name, picture, language and theme, your emergency card and your own medicines. Menu: the order of the apps and which are hidden. Notifications: what is pushed, and the morning summary. Security and connections: password, passkeys, two-step codes and your phone calendar."
      },
      {
        "shot": "profile",
        "caption": "My profile."
      }
    ]
  },
  "server": {
    "title": "Server settings",
    "summary": "For whoever runs the server: families, sign-in rules, the address and the log.",
    "blocks": [
      {
        "p": "The server's admin decides what is the same for every family on the server. Invite other families with a link – they can try a demo first – and pause, move or remove a family. The admin never sees the families' content."
      },
      {
        "shot": "server",
        "caption": "The families on the server."
      },
      {
        "p": "Security sets the rules for passkeys, two-step codes and how long passwords must be. Services holds the server's address on the internet, the search and the services for every family. The server's setup guide can be opened again at the top."
      }
    ]
  },
  "serverbackups": {
    "title": "Backups and the backup key",
    "summary": "Nightly backups, sealed with a key only you keep.",
    "blocks": [
      {
        "p": "The server makes a backup every night and keeps 30 days. With a backup key they are sealed: the server can make them but never read them, and the key alone is enough to bring everything back on a new server."
      },
      {
        "shot": "serverbackups",
        "caption": "Backups, sealed with the key."
      },
      {
        "steps": [
          "Server settings → Data → Make a backup key. The key is made in your browser; the server only gets its public half.",
          "Save it in a password manager, print it or download it – and confirm with the last letters.",
          "Check the key against the newest backup with Check my key."
        ]
      },
      {
        "note": "Without the key the backups can't be restored, and nobody can make it again for you."
      }
    ]
  },
  "serverupdates": {
    "title": "Updates",
    "summary": "Smooth Family and the server's parts, by themselves – and the gateways' versions.",
    "blocks": [
      {
        "p": "The database, Redis, the web server and the search engine get security fixes between Smooth Family's releases. Choose whether they go in by themselves in a weekly window or after your approval. A backup is made first, and if the new versions don't come up the old ones are put back."
      },
      {
        "shot": "serverupdates",
        "caption": "Versions, the window and the gateways."
      },
      {
        "h": "Smooth Family itself"
      },
      {
        "p": "Choose a channel under Smooth Family itself, and the server updates the app too, at the same time as the rest: Stable follows the releases, Beta every change as soon as it is done. Only versions signed by the project are put in, the database is saved first, and if the new version doesn't start, the old one and its database come back. Off until you choose – looking is a call to GitHub."
      },
      {
        "p": "The Gateways card shows every gateway on the server, the version each reported and whether it updates itself – so you see that all are up to date."
      },
      {
        "note": "The server's update.sh has to be scheduled hourly once (on a Synology: Task Scheduler, user root) for updates to be put in."
      }
    ]
  },
  "serverservices": {
    "title": "Services, local AI and search",
    "summary": "The server's address, the search engine, the local AI and other services.",
    "blocks": [
      {
        "p": "Services holds the address the server is reached on – used in every link sent out – the recipe and web search (SearXNG on the server itself), Home Assistant for hosted families through the gateway, GIFs in the chat and sending feedback. Local AI sets where Ollama runs, which models are used, and waking and sleep for the computer. E-mail sets up the mail services – Gmail with an app password, Brevo for an address on your own domain, Exchange Online through an app registration in Microsoft Entra, or another SMTP server – which one your family sends with, and whether the hosted families may send mail too (to a party's guests who asked for updates). Addresses turns on the suggestions from OpenStreetMap in the address fields (through komoot's Photon or one of your own) – or off."
      },
      {
        "shot": "serverservices",
        "caption": "The server's services."
      }
    ]
  },
  "feedback": {
    "title": "Report a problem",
    "summary": "Something wrong, or a wish – to the server's admin.",
    "blocks": [
      {
        "p": "Found something that doesn't work, or wish for something new? Write it under Report a problem in the profile menu. It goes to the person who runs the server, with the page you were on and your browser, and a screenshot if you add one."
      },
      {
        "steps": [
          "Open the profile menu → Report a problem.",
          "Choose Something's wrong or Wish, and write what happened or what you'd like.",
          "Add a screenshot if it helps – paste it, drop it or take a photo."
        ]
      },
      {
        "tips": [
          "You see your reports on the same page: received, planned, fixed or not planned – with a line from the server admin when there is one.",
          "You are told in the notification centre when a report's status changes.",
          "The family's admin sees the whole family's reports."
        ]
      }
    ]
  },
  "devices": {
    "title": "Devices",
    "summary": "What is connected with the family's account, and whether it is well.",
    "blocks": [
      {
        "p": "Family settings → Devices shows what talks to the server for the family: the phones and computers the members sign in on, the kitchen displays, and the gateways – as the Home Assistant app or a container of their own. A map puts them around the server; the list has each one's version, when it was last seen and its health."
      },
      {
        "shot": "devices",
        "caption": "The family's devices around the server."
      },
      {
        "h": "Health"
      },
      {
        "p": "Green: well. Orange: an old version – an app that should be opened again, or a gateway to update. Grey: a member's device not used for a while. Red: a kitchen display or a gateway that isn't there. Under a device that isn't well, the list says what to do."
      },
      {
        "tips": [
          "A device not seen for 7 days leaves the map but stays in the list; a member's old phone can be forgotten there.",
          "Only the kind of device, its browser and system, the app version and when it was last used are kept – no address, no place.",
          "The server admin sees your devices as kinds, never names, and may ask you to look after one."
        ]
      }
    ]
  },
  "serverreports": {
    "title": "Reports from the families",
    "summary": "Read, answer and pass on problems and wishes.",
    "blocks": [
      {
        "p": "Every family's reports of problems and wishes come to Server settings → Reports, and you are told in the notification centre. Open one to read it with its page, browser and screenshot; set its status – received, planned, fixed or not planned – and write a line to the reporter, who is told."
      },
      {
        "h": "To the project"
      },
      {
        "p": "Tick the reports the Smooth Family project should know of and press Export. You get an anonymous text – what and where, never who or which family – and GitHub's form in the project's public repository opens filled in with it and the label from-server-admin. Read it through and press Create there. A text too long for the link is copied for you to paste."
      },
      {
        "tips": [
          "Nothing is sent by the server: the export only opens GitHub in your browser.",
          "Exported reports are marked, so you don't send them twice."
        ]
      }
    ]
  },
  "serverdevices": {
    "title": "The families' devices",
    "summary": "Every family's devices by kind, their versions and health.",
    "blocks": [
      {
        "p": "Server settings → Devices puts the server in the middle with each family around it, and around each family its kinds of device: phones, tablets, computers, kitchen displays, gateways and Home Assistant apps. You see how many, which versions they run and whether they are well – never whose they are or what they are called."
      },
      {
        "p": "The app's version is the server's own; a gateway should run the newest one the server hands out. When a family has a device with an old version or one that isn't there, Ask the family to look after it sends their admins a notification saying which kinds and why."
      },
      {
        "tips": [
          "A device not seen for 7 days leaves the map.",
          "A gateway updates itself if automatic updates are on – an old one usually means they are off."
        ]
      }
    ]
  }
};

export default texts;
