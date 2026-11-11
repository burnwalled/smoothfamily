// Help texts (da): every topic in topics.ts, with the same blocks as en.ts (help.test.ts checks it).
import type { TopicText } from "./types";

const texts: Record<string, TopicText> = {
  "start": {
    "title": "Kom i gang",
    "summary": "Hvad Smooth Family er, hvordan appen er bygget op, og hvor du finder ting.",
    "blocks": [
      {
        "p": "Smooth Family er familiens egen app til kalenderen, listerne, opgaverne, maden, hjemmet og det smarte hjem. Den kører på en server hjemme hos jer – en NAS eller en lille computer – så jeres billeder, beskeder og planer bliver hos jer. Intet sendes til store virksomheder, og AI'en er lokal og kun slået til, hvis I vil."
      },
      {
        "shot": "today",
        "caption": "I dag samler dagen: kalenderen, opgaverne, vejret og mere."
      },
      {
        "h": "Installér den som en app"
      },
      {
        "steps": [
          "Åbn familiens adresse i telefonens browser, og log ind.",
          "iPhone: tryk Del → Føj til hjemmeskærm. Android: tryk ⋮ → Installér app (eller Føj til startskærm).",
          "Åbn Smooth Family fra hjemmeskærmen – den starter i fuld skærm og kan sende notifikationer."
        ]
      },
      {
        "h": "Find rundt"
      },
      {
        "p": "På telefonen ligger de mest brugte apps i linjen nederst og resten under Mere; på computeren ligger de i menuen til venstre. Apps, der hører sammen, er faner øverst på siden – Kalender har Rejser, To hjem og Søndagsmødet, Mad har Opskriftsbogen og Spisekammeret."
      },
      {
        "p": "Indstillingerne findes i tre niveauer, alle i menuen bag dit billede: Min profil (dine egne), Familieindstillinger (for den, der styrer familien) og Serverindstillinger (for den, der styrer serveren)."
      },
      {
        "tips": [
          "Spørgsmålstegnet ved siden af en sides overskrift åbner hjælpen til den side.",
          "Skift rækkefølgen i menuen, eller skjul apps, du ikke bruger, under Min profil → Menu.",
          "Hvilke apps hver enkelt ser, vælger familiens administrator under Familieindstillinger → Familiemedlemmer."
        ]
      }
    ]
  },
  "signin": {
    "title": "Log ind og vær sikker",
    "summary": "Adgangskoder, passkeys med Face ID eller fingeraftryk og totrinskoder.",
    "blocks": [
      {
        "p": "Du logger ind med dit brugernavn og din adgangskode. Voksnes adgangskoder har mindst 12 tegn, medmindre serverens administrator har valgt andet – det er længden, der gør en adgangskode svær at knække. Børn kan have kortere."
      },
      {
        "h": "Passkeys – log ind med ansigtet eller fingeren"
      },
      {
        "steps": [
          "Åbn Min profil → Sikkerhed og forbindelser.",
          "Tryk Tilføj passkey, og følg telefonens eller computerens anvisninger.",
          "Næste gang vælger du Log ind med passkey på login-siden."
        ]
      },
      {
        "shot": "signin",
        "caption": "Passkeys og totrinskoder under Min profil."
      },
      {
        "h": "Totrinskoder"
      },
      {
        "p": "Med totrinskoder skriver du en sekscifret kode fra en app som Microsoft eller Google Authenticator efter adgangskoden. Serverens administrator kan gøre dem påkrævet for voksne. De virker uden forbindelse – ingen ekstern tjeneste er involveret."
      },
      {
        "tips": [
          "Glemt adgangskoden? Spørg familiens administrator, som sætter en ny under Familieindstillinger → Familiemedlemmer.",
          "Mistet telefonen med koderne? Administratoren kan nulstille dit totrinslogin samme sted.",
          "En passkey hører til den adresse, den blev lavet på; skifter familien adresse, laver du en ny."
        ]
      }
    ]
  },
  "notifications": {
    "title": "Notifikationer og morgenoversigten",
    "summary": "Klokken, notifikationer på telefonen og en oversigt over dagen hver morgen.",
    "blocks": [
      {
        "p": "Alt, der sker for dig – en opgave at godkende, en besked, en påmindelse, en medicindosis – havner under klokken øverst. Tallet viser, hvor mange du ikke har læst. De samme notifikationer kan også sendes til telefonen."
      },
      {
        "shot": "notifications",
        "caption": "Notifikationscentret gemmer alt, læst eller ej."
      },
      {
        "h": "På telefonen"
      },
      {
        "steps": [
          "Åbn Min profil → Notifikationer.",
          "Slå notifikationer til for denne enhed, og tillad dem, når telefonen spørger.",
          "Vælg, hvad der skal sendes – resten havner alligevel under klokken."
        ]
      },
      {
        "p": "Morgenoversigten er én notifikation på det tidspunkt, du vælger – hverdage eller hver dag – med dagens begivenheder, dine opgaver og din medicin, skolemaden og vejret."
      },
      {
        "tips": [
          "iPhone: notifikationer virker kun, når Smooth Family er føjet til hjemmeskærmen.",
          "Hver enhed slås til for sig – telefonen og tabletten skal hver især have det."
        ]
      }
    ]
  },
  "offline": {
    "title": "Uden dækning",
    "summary": "Lister og opgaver virker i en butik uden signal.",
    "blocks": [
      {
        "p": "Smooth Family gemmer det, du har åbnet, så appen virker, når forbindelsen forsvinder. På indkøbslisten kan du krydse af, tilføje og fjerne, og du kan krydse opgaver af. Ændringerne vises med det samme og markeres med en lille sky, til de er sendt."
      },
      {
        "p": "En markering øverst viser, at du er offline, og hvor mange ændringer der venter. Når forbindelsen kommer tilbage, sendes de af sig selv, i den rækkefølge du lavede dem."
      },
      {
        "tips": [
          "Andre sider viser det, der sidst blev hentet, men kan ikke ændres, før du er online igen.",
          "Har en anden ændret det samme i mellemtiden, gælder den seneste ændring."
        ]
      }
    ]
  },
  "today": {
    "title": "I dag",
    "summary": "Familiens dag på én side – med de kort, du selv vælger.",
    "blocks": [
      {
        "p": "I dag er første side. Den viser det, der er vigtigt nu: ugens kalender, dine opgaver, indkøbslisten, vejret, elprisen, affaldsindsamlingen, skolemaden, det i spisekammeret, der bør spises snart, det, der er på vej for hjemmet og køretøjerne, hvem der er hjemme – og mere."
      },
      {
        "shot": "today",
        "caption": "Hvert kort kan flyttes, tilføjes eller fjernes."
      },
      {
        "steps": [
          "Tryk Tilpas nederst på I dag.",
          "Tilføj kort med Tilføj widget, træk dem i den rækkefølge, du vil, eller fjern dem.",
          "Tryk Færdig."
        ]
      },
      {
        "tips": [
          "Afgange: tilføj et kort pr. stoppested under Tilføj widget – SL i Stockholm eller en anden kilde for hele Sverige, Norge, Finland, Danmark eller London (nogle kræver en nøgle, som serveradministratoren tilføjer under Server → Adresse og tjenester).",
          "Kortenes kilder – stedet for vejret, affaldskalenderen og skolen – indstilles under Familieindstillinger → Hverdagen.",
          "Et kort til en app, du ikke må bruge, vises ikke."
        ]
      }
    ]
  },
  "calendar": {
    "title": "Kalenderen",
    "summary": "Familiens kalender med skolens og klubbernes, hvem der kører, og hvad der skal pakkes.",
    "blocks": [
      {
        "p": "Kalenderen viser familiens egne begivenheder sammen med kalendere, I abonnerer på – skolen, sportsklubben, arbejdet. Skift mellem ugen time for time, måneden og listen. Begivenheder over flere dage er en bjælke hen over dem, og ugenummeret står i kanten."
      },
      {
        "shot": "calendar",
        "caption": "Ugen, time for time."
      },
      {
        "h": "Tilføj en begivenhed"
      },
      {
        "p": "Tryk + Ny begivenhed, giv den en titel og et tidspunkt, og vælg, hvem den gælder – eller lad den gælde alle. Familiens begivenheder deles med alle i familien."
      },
      {
        "h": "Hvem kører, og hvad skal pakkes"
      },
      {
        "p": "Tryk på Kørsel og pakning ved en begivenhed – i kalenderen eller til søndagsmødet – for at sige, at der er brug for et lift, og tag afleveringen eller afhentningen – eller, med En anden, skriv hvem uden for familien der kører, for eksempel en holdkammerats forælder. Giv den en pakkeliste: den samme liste kommer igen for hver begivenhed med samme titel, som hver fodboldtræning, og krydses af for hver gang. En voksen kan vælge dagen, hvor det er tid til at pakke, og den, der skal af sted, får en opgave den dag."
      },
      {
        "shot": "calendar-month",
        "caption": "Måneden skriver ud, hvad der sker hver dag."
      },
      {
        "h": "Abonnér på en kalender"
      },
      {
        "p": "Kalendere læses via et privat iCal-link. Sådan finder du linket i de mest almindelige tjenester:"
      },
      {
        "details": [
          {
            "title": "Google Kalender (Gmail)",
            "blocks": [
              {
                "steps": [
                  "Åbn calendar.google.com på en computer – linket findes ikke i mobilappen.",
                  "I venstre kolonne under \"Mine kalendere\": hold musen over kalenderen og klik ⋮ → \"Indstillinger og deling\".",
                  "Rul ned til \"Integrer kalender\".",
                  "Kopiér \"Hemmelig adresse i iCal-format\" (slutter på .ics). Brug ikke \"Offentlig adresse\" – den virker kun, hvis kalenderen er offentlig."
                ]
              },
              {
                "note": "Arbejds- eller skolekonti: administratoren kan have slået den hemmelige adresse fra. Mangler den, så spørg dem eller brug en privat konto."
              }
            ]
          },
          {
            "title": "Outlook / Microsoft 365",
            "blocks": [
              {
                "steps": [
                  "Åbn outlook.com (privat konto) eller outlook.office.com (arbejde/skole) i browseren.",
                  "Klik på tandhjulet (Indstillinger) → Kalender → Delte kalendere.",
                  "Under \"Udgiv en kalender\": vælg kalenderen og \"Kan se alle detaljer\", og klik Udgiv.",
                  "Kopiér ICS-linket – ikke HTML-linket."
                ]
              },
              {
                "note": "Klassisk Outlook til Windows kan ikke udgive kalendere – brug Outlook på nettet eller nye Outlook. På arbejdskonti kan administratoren have spærret for udgivelse."
              }
            ]
          },
          {
            "title": "iCloud (iPhone / Mac)",
            "blocks": [
              {
                "steps": [
                  "Åbn appen Kalender på iPhone og tryk på \"Kalendere\" nederst.",
                  "Tryk på (i) ved siden af den kalender, du vil tilføje.",
                  "Slå \"Offentlig kalender\" til og tryk på \"Del link…\" → Kopiér.",
                  "Linket starter med webcal:// – indsæt det, som det er."
                ]
              },
              {
                "note": "\"Offentlig\" betyder, at alle med linket kan læse kalenderen. Den vises ikke nogen steder, men hold linket privat."
              }
            ]
          },
          {
            "title": "SportAdmin (klub- og holdaktiviteter)",
            "blocks": [
              {
                "steps": [
                  "Åbn SportAdmin-appen og gå til \"Aktiviteter\".",
                  "Tryk på kalenderikonet øverst til højre.",
                  "Vælg at kopiere linket (abonner direkte tilføjer kun kalenderen til din telefon).",
                  "Indsæt linket i Smooth Family. Det starter som regel med webcal://cal.sportadmin.se/."
                ]
              },
              {
                "note": "Vises der ingen aktiviteter? Holdet skal være koblet til klubbens kalender i SportAdmin – spørg holdlederen. Mange klubsider har også en \"Abonner\"-knap på kalendersiden: højreklik og kopiér linkadressen. Tilføj ét abonnement pr. hold og giv hvert sin egen farve."
              }
            ]
          },
          {
            "title": "MyClub (klubbens og holdets kalender)",
            "blocks": [
              {
                "steps": [
                  "Åbn klubbens websted på MyClub (klubnavn.myclub.se), og gå til holdets kalender eller siden om at abonnere på kalenderen.",
                  "Kopiér abonnementslinket. Et holds ser ud som webcal://calendar.myclub.se/public/teams/12345/calendar.ics – hele klubbens har /public/clubs/ i stedet.",
                  "Indsæt linket i Smooth Family."
                ]
              },
              {
                "note": "Kan du ikke finde linket? Bed holdlederen om kalenderens abonnementslink – det er det samme, klubben giver til iPhone og Google. Tilføj ét abonnement pr. hold, giv hvert sin egen farve, og vælg det barn, det gælder."
              }
            ]
          },
          {
            "title": "laget.se (klubbens og holdets kalender)",
            "blocks": [
              {
                "steps": [
                  "Åbn holdets side på laget.se, for eksempel laget.se/Holdnavn.",
                  "Gå til Kalender, og klik på Prenumerera (abonner) under kalenderen.",
                  "Kopiér linket. Det ser ud som webcal://cal.laget.se/Holdnavn.ics – samme navn som i holdets laget.se-adresse.",
                  "Indsæt linket i Smooth Family."
                ]
              },
              {
                "note": "Kalenderen fra laget.se viser en måned tilbage og seks måneder frem. Tilføj ét abonnement pr. hold, giv hvert sin egen farve, og vælg det barn, det gælder."
              }
            ]
          },
          {
            "title": "Tilføj linket i Smooth Family",
            "blocks": [
              {
                "steps": [
                  "Åbn profilmenuen (øverst til højre) → Familieindstillinger → Kalenderabonnementer.",
                  "Skriv et navn, alle kan genkende, f.eks. \"Skolen\" eller \"Edvin – fodbold\".",
                  "Indsæt linket og vælg en farve.",
                  "Klik Tilføj. Begivenhederne vises i kalenderen og på I dag-siden."
                ]
              }
            ]
          },
          {
            "title": "Virker noget ikke?",
            "blocks": [
              {
                "tips": [
                  "Nye begivenheder kan tage op til 15 minutter om at dukke op – kalenderne caches, så tjenesterne ikke overbelastes.",
                  "Fejl ved tilføjelse? Tjek at linket starter med https:// eller webcal://, og at du har kopieret iCal/ICS-linket, ikke et link til en webside.",
                  "Er et link lækket? Opret et nyt hos udbyderen (Google: \"Nulstil\" den hemmelige adresse) og udskift det her."
                ]
              }
            ]
          }
        ]
      },
      {
        "tips": [
          "Kalendere, I abonnerer på, kan kun læses og opdateres hvert 15. minut.",
          "Din egen kalender kan lægges ind på telefonen med abonnementslinket under Min profil."
        ]
      },
      {
        "h": "Røde dage"
      },
      {
        "p": "Landets helligdage vises i kalenderen som røde dage, og aftenerne, der fungerer som helligdage (juleaften, nytårsaften …), i en lysere rød. Vælg land – eller slå fra – under Familieindstillinger → Hverdagen. For et andet land tilføjer du en offentlig helligdagskalender som abonnement."
      }
    ]
  },
  "trips": {
    "title": "Rejser",
    "summary": "Planlæg rejsen sammen: datoer, rejseplan, pakning pr. person og et budget.",
    "blocks": [
      {
        "p": "En rejse har datoer og et rejsemål – den vises i kalenderen – og hvem der tager med. Tilføj rejseplanen med transport, overnatninger og aktiviteter (billetter kan linkes fra boksen), et fælles budget og en tjekliste før afrejse, som at lukke for vandet."
      },
      {
        "shot": "trips",
        "caption": "Pakning pr. rejsende, med færdige lister."
      },
      {
        "h": "Pakning"
      },
      {
        "p": "Hver rejsende har sin egen pakkeliste plus en fælles. Start fra en skabelon – strand, ski eller weekend – og tilføj resten. En voksen kan vælge dagen, hvor det er tid til at pakke: hver rejsende får så en opgave den dag, med point, og et link til sin egen liste."
      },
      {
        "tips": [
          "Aftenen før afrejse bliver alle, der skal af sted, mindet om det, der mangler at blive pakket og tjekket.",
          "Børnene ser og pakker deres egne ting; de voksne planlægger resten."
        ]
      }
    ]
  },
  "parties": {
    "title": "Fester",
    "summary": "Planlæg en fest sammen – én invitationsside til gæsterne, og tjeklisten, budgettet og tidsplanen til jer.",
    "blocks": [
      {
        "p": "Under Kalender → Fest planlægger du en børnefødselsdag, en fest, en middag, en kampaften, en grillaften eller en dag udendørs. Gæsterne får én fælles side – uden konto – først en gem datoen, hvis I vil, så invitationen, hvor de svarer med navn, allergier og hvem de tager med, så langt I tillader, på dagen portalen til deres billeder og bagefter takken. De kan ændre deres svar senere. I vælger, hvad de ser af hinanden: intet, hvor mange der kommer, eller navnene."
      },
      {
        "shot": "parties",
        "caption": "Festens otte trin – her Design, der begynder med skabelonerne."
      },
      {
        "steps": [
          "Kalender → Fest → Ny fest: navnet, typen, hvis fest, tiden og stedet – så tager festen dig gennem syv trin.",
          "1 Detaljer · 2 Design: skabeloner og udseende (tema og billede), gem datoen, invitationen, festportalen og takken, hver med sin egen plakat · 3 Gæster: hvem der kommer, allergier, e-mailadresser – og jeres egen liste over inviterede.",
          "4 Opgaver – før, under og efter festen · 5 Budget · 6 Program, med punkter I kan skjule for gæsterne · 7 Udsendelser: mails på deres tidspunkt (med serverens e-mail), eller linkene til at dele selv."
        ]
      },
      {
        "shot": "partyinvite",
        "caption": "Gæsternes invitation: plakaten i festens tema, detaljerne, kalenderknapperne og svaret."
      },
      {
        "h": "Planlægningen"
      },
      {
        "p": "En ny fest starter med en tjekliste for sin type – før, under og efter festen – med datoer; hver morgen noget skal gøres, bliver de voksne påmindet. Ret den, som I vil. Budgettet holder styr på, hvad der er brugt mod det planlagte, og programmet på dagens tider (en børnefødselsdag starter med et) – et punkt kan skjules for gæsterne i portalen."
      },
      {
        "shot": "partyportal",
        "caption": "Festportalen via QR-koden: gæsternes billeder, dagens program og mere."
      },
      {
        "tips": [
          "Overraskelsesfest: sæt kryds under Detaljer. De, der fejres, tages ud af planlægningen, og festen er kun i kalenderen for dem, der planlægger, ikke på køkkenskærmen eller i gæstelinks.",
          "Hvem der fejres, og hvem der planlægger, er to valg. De, der fejres, får festen i deres kalender. De, der er krydset af under Hvem planlægger, kan åbne og ændre den, får dens påmindelser og er med i dens chats; de andre i familien ser den ikke blandt festerne. Så kan forældre planlægge et barns fødselsdag, eller en partner en overraskelse.",
          "En fest kan have to chats, der vælges under Detaljer. Gæstechatten er på deres sider og i portalen, hvor de skriver til hinanden og jer før og under festen, og også i jeres chat-app. Planlægningschatten er for familiens voksne og hjælperne, og dem, planen holdes hemmelig for, er ikke med.",
          "Mails er HTML i festens tema, med gæstens egen knap, og almindelig tekst til programmer, der vil have det. Gem datoen mailes ikke, da du ikke har adresserne endnu: under Udsendelser får du en færdig besked med linket, der kan deles med sms, WhatsApp, e-mail eller en app. De, der tilmelder sig, efterlader deres adresse og får invitationen med mail.",
          "Under Gæster kan I forbinde gæster, for eksempel et par, der begge har registreret sig. Begge beholder deres eget svar og link, men ingen tælles dobbelt, de kan ikke tage endnu en +1 med, de kommer ved samme bord, og den ene kan svare for den anden. Appen siger til, når nogens +1 allerede står på listen, og viser, hvor mange der højst kan komme.",
          "Tag en toastmaster med: under Detaljer giver Eksterne hjælpere nogen et personligt link, uden konto, der ophører 1 dag, 3 dage eller 1 uge efter festen. De kan gøre alt for festen undtagen at fjerne den og ser intet andet af familiens. Et nyt trin, Planlægning, har taler, servering, lege og noter efter klokken, og de vælger, hvem det holdes hemmeligt for: for dem er det nedtonet.",
          "Check-in er en valgfri side: fra sin tid viser gæsternes link nedtælling, at de er tilmeldt, jeres information og tommel op eller ned. Tommel ned, med en valgfri besked, ændrer deres svar, og I får det at vide med det samme. En QR-kode, der scannes før portalen åbner, fører til en venteside.",
          "Under Udsendelser viser Mails, hvad hver mail siger. Ret teksten, se hvordan den ser ud, og planlæg hvornår den går.",
          "Under Detaljer er der også maden, hvor gæsterne vælger med deres svar, tilmelding til tale og praktisk info. Under Budget samler I leverandører, via serverens søgning eller i hånden, og den, I vælger, kommer i budgettet. Hver opgave kan have en ansvarlig, der får påmindelsen. Der er køreplan, bordliste og bordkort at udskrive.",
          "Vælg festens sider under Detaljer: invitationen med svar er altid med, gem datoen, festportalen og takken vælger I selv. Det, der ikke er valgt, vises ikke under Design eller Udsendelser, og gæsternes link springer det over.",
          "Importér gæsteliste under Gæster: Excel (.xlsx), CSV, en tekstfil eller indsatte navne. Alle bliver inviteret med deres eget link. Der findes også bordplanen: tilføj bordene, og vælg bord til hver gæst; selskabet sidder sammen, og pladserne tælles.",
          "Skriv {gæst} i en tekst på plakaten, så ser en gæst med personligt link sit eget fornavn. En tekst med feltet vises ikke for dem uden navn, så det passer til en hilsen: invitationen og takken begynder med en.",
          "Portalen ligger under Udsendelser: hvornår den åbner, og hvornår QR-koden og linket holder op med at virke – 3 timer efter festen, hvis I ikke ændrer det, så ingen kommer ind morgenen efter. At udskrive QR-koden er en opgave under At gøre, på en side i festens tema. Slå baggrundsgrafik til i browserens udskriftsvindue for at få farverne med.",
          "Hver side har Forhåndsvis som gæst under Design, til computer og mobil. Sidste trin, Festen, giver en sidste tjekliste over, hvad der mangler – så er det bare at have det sjovt!",
          "Under Gæster kopierer linkknappen ved hver gæst det personlige link til gæsten og selskabet, som kan sendes med sms eller som I vil. Den, der har linket, kan svare som gæsten, så send det kun til dem.",
          "Hver plakat kan se forskellig ud på computer og mobil: vælg Mobil i plakateditoren, så gælder den rækkefølge, det der vises, den justering og størrelse, du ændrer, kun på mobil. Tekster og billeder deles, så en rettelse ses på begge. Indtil du ændrer noget, følger mobilen computeren. Brede tablets regnes som computer, smalle som mobil.",
          "Skabeloner (Design → Skabeloner) sætter alle plakater og udseendet på én gang: den indbyggede Gala eller jeres egne – gem enhver fest som skabelon. Eller lav en med egen AI: skriv jeres ønsker, kopiér prompten til en valgfri AI, og indsæt svaret. I ser skabelonen, før den bruges, kun det, plakaterne kender, kommer ind (ingen kode, ingen billeder udefra), og alt kan ændres bagefter. En skabelon kan også gemmes som fil og åbnes af en anden familie.",
          "Ét link hele vejen: på gem datoen registrerer gæsterne sig med navn og e-mail. Invitationsmailen giver hver af dem et personligt link at svare med. Åbner de det igen, ser de deres svar og kan ændre det. Den, der ikke har svaret, får en påmindelse af sig selv før sidste svardag (Udsendelser). Fra det tidspunkt, I sætter under Design, åbner samme link festportalen, og på det tidspunkt, I sætter under Tak, går takken ud til dem, der kom.",
          "Én fest, fire sider i samme tema, hver med sin egen plakat (Plakat): først en gem datoen, hvis I vil – gæsterne gemmer datoen og skriver deres e-mail og får en mail, når I skifter linket til invitationen – så invitationen, festportalen og takken. Indsæt en fælles playliste fra Spotify, så kan gæsterne ønske sange. Åbn festportalen, og udskriv QR-koden til bordene: gæsterne uploader deres billeder direkte til et album i boksen og ser dagens program.",
          "Appen har et billedbibliotek: baggrunde og topbilleder til mange af temaerne og klistermærker – balloner, discokugle, krebs, studenterhue, ringe, græskar med mere – til plakaten i stedet for emoji (Plakat → en pynterække eller emblemet → Bibliotek).",
          "Under Plakat gør I invitationssiden til jeres egen: tilføj, flyt og fjern dens dele (tekster, billeder, et emblem, en pynterække, hvornår og hvor som billet, kort, liste eller stor dato, en nedtælling, kalenderknapper, invitationen, et bånd). Skriv hver tekst med egen skrift, størrelse, justering og farve – {navn}, {dato} og lignende udfyldes af sig selv. Byt emojierne ud med andre eller med egne billeder, og vælg, hvilke kalenderknapper gæsterne får: kalenderfil (den åbner Apples Kalender på iPhone og Mac og de fleste andre), Google eller Outlook. Temaets plakat er altid ét tryk væk.",
          "Ingen fastlagt dato endnu: sæt kryds ved Lad gæsterne stemme om datoen, og tilføj de datoer, der passer jer. Gæsterne krydser dem af, der passer dem; under Invitation ser I, hvor mange hver dato passer, og vælger én – så kommer festen i kalenderen, de, der stemte på den, regnes som kommende, og de, der har bedt om opdateringer, får en mail.",
          "Vælg, hvad hver gæst må tage med: ingen, en +1 eller familien – så tilføjer de alle i selskabet, hver med allergier, og om det er et barn. En middag, en grillaften eller en udendørsaktivitet starter med familien.",
          "Vælg festens tema, som alle dens sider deler – dem, der passer til festen, først (balloner, pirater og dinosaurer til børnefødselsdag; disco, glimmer, 80'erne og champagne til fest; bistro, jul og krebsegilde til middag; fodbold og ishockey til kamp; grill, rundbold og strand udendørs). Eller lav jeres eget: farver, mønster, emoji og egne billeder øverst og i baggrunden – gemt til senere. Et eget billede kan også komme på invitationen.",
          "Gæster, der angiver deres e-mail og beder om opdateringer, får en bekræftelse, en mail, hvis tid eller sted ændres, en påmindelse dagen før og takken – og de beskeder, I sender under Gæster. Det kræver serverens e-mail, som serveradministratoren opsætter under Server → Adresse og tjenester.",
          "Festen kommer i kalenderen af sig selv – for alle, den gælder (sæt kryds ved én eller flere i familien), og I vælger, hvis ønskeliste der vises på invitationen.",
          "Vis ønskelisten: gæsterne ser ønskerne for den, festen gælder, og sætter flueben ved det, de køber; den, det gælder, ser aldrig hvem.",
          "Bagefter, under Tak: en taktekst og billederne fra et album i Boksen, på samme side, som gæsterne allerede har.",
          "Kun de voksne planlægger fester – ønskelistens reservationer ligger i planlægningen."
        ]
      }
    ]
  },
  "school": {
    "title": "Skolen",
    "summary": "Børnenes skoledag fra InfoMentor eller SchoolSoft via Home Assistant: skolekortet, skolens kalendere og ugebrevet.",
    "blocks": [
      {
        "p": "Hvis familien har forbundet Home Assistant, kan børnenes skole komme ind i Smooth Family via fællesskabets integrationer til InfoMentor og SchoolSoft. Skolekortet på I dag viser hvert barns skoledag, idræt næste skoledag, SFO-tiderne, lektier, fravær og hvad der sker næste gang – og ugebrevet, som åbnes lige der. Skolens kalendere – skemaet, prøver og udflugter, SFO – kommer ind i kalenderen som barnets."
      },
      {
        "details": [
          {
            "title": "InfoMentor (anbefales)",
            "blocks": [
              {
                "steps": [
                  "I Home Assistant: åbn HACS → ⋮ → Brugerdefinerede repositories, tilføj https://github.com/c14ym0re/infomentor-homeassistant af typen Integration, og installér InfoMentor.",
                  "Genstart Home Assistant.",
                  "Indstillinger → Enheder og tjenester → Tilføj integration → InfoMentor. Log ind med BankID (scan QR-koden – indtil videre kun for Stockholm) eller med e-mail og adgangskode, hvis kommunen stadig har den klassiske InfoMentor-konto.",
                  "Hvert barn bliver en enhed. I Smooth Family sætter du flueben ved barnet under Familiemedlemmer → barnet → Skolen fra Home Assistant."
                ]
              },
              {
                "note": "Den giver skoledagen, idræt, lektier, ugebrevet, fravær, SFO-tiderne, skolens kalender og skolens nyheder – og frokosten, hvis du angiver skolens Mateo-enhed. En anden integration, https://github.com/chrfo892/ha-infomentor, giver skemaet, indtjekning i SFO og ulæste notifikationer; den installeres på samme måde."
              }
            ]
          },
          {
            "title": "SchoolSoft (skema og fremmøde)",
            "blocks": [
              {
                "steps": [
                  "I HACS → ⋮ → Brugerdefinerede repositories: tilføj https://github.com/chriseckl/Schoolsoft-for-Home-Assistant af typen Integration, installér den, og genstart Home Assistant.",
                  "Indstillinger → Enheder og tjenester → Tilføj integration → SchoolSoft, og log ind med forælderens brugernavn og adgangskode.",
                  "Tilføj den én gang pr. barn, og sæt derefter flueben ved hvert barns konto i Smooth Family."
                ]
              },
              {
                "note": "Den giver skemaet som kalender (lektioner markeret fraværende eller forsinket), nuværende og næste lektion samt dagens start og slut. Til madplanen findes https://github.com/kanylbullen/ha-schoolsoft – skolens navn er det i skolens SchoolSoft-adresse."
              }
            ]
          }
        ]
      },
      {
        "p": "Et nyt ugebrev, fravær i dag og nyheder fra skolen sendes til barnets voksne som notifikationer. Barnets skole ses af barnets voksne og af barnet selv; køkkenskærmen viser kun skoledagen, aldrig fravær eller breve."
      },
      {
        "tips": [
          "Tilføj kortet Skolen på I dag under Tilpas – og Skoledagen på køkkenskærmen under Familieindstillinger → Køkkenskærm, hvis I vil.",
          "Beta: integrationerne er små, uofficielle projekter, og deres sensorer genkendes på navnene (på engelsk eller svensk). Mangler noget – fortæl os, hvilke sensorer jeres integration har.",
          "En skolekalender kan også tilføjes i hånden under kalenderindstillingerne med adressen homeassistant://calendar.navn.",
          "Kalendere fra Home Assistant kræver direkte forbindelse – de kan ikke læses via gatewayen."
        ]
      }
    ]
  },
  "health": {
    "title": "Sundhed",
    "summary": "Din træning og dagens skridt, søvn og vægt – privat eller delt med familien.",
    "blocks": [
      {
        "p": "Log en træning med få tryk – type, minutter og distance, hvis du vil – og dagens skridt, søvn og vægt. Din side viser de seneste fire uger: minutter pr. dag, dine træninger og hvor mange dage i træk du har rørt dig."
      },
      {
        "h": "Hvem ser det"
      },
      {
        "p": "Alt er kun dit, indtil du deler det, slags for slags: træning, skridt, søvn og vægt, hver med kun dig, de voksne eller hele familien. Andre ser det, du deler, i ugens oversigt øverst."
      },
      {
        "steps": [
          "Åbn Sundhed i menuen.",
          "Log en træning eller dagens værdier.",
          "Under Hvem ser din sundhed vælger du, hvad du deler og med hvem."
        ]
      },
      {
        "h": "Sammen"
      },
      {
        "p": "En voksen sætter familiens mål – timer, kilometer eller træninger mellem to datoer, for eksempel 500 km sammen i maj. De tæller den træning, hver især deler med familien, og vises i Sundhed, i søndagsmødet og på køkkenskærmen (ugens bevægelse). En opgave kan blive færdig ved træning: vælg mindst så mange minutter den dag, så afkrydses den af sig selv, når personens træning slår til – med point, som enhver opgave. Træning giver også mærker."
      },
      {
        "tips": [
          "De voksne ser altid et barns sundhed og kan udfylde den – en forælder kan logge fodboldtræningen.",
          "Et barns vægt gemmes ikke, og vægt sammenlignes aldrig: den er ikke i oversigten.",
          "Hent dine egne data som en fil, eller fjern det hele, nederst på din side."
        ]
      },
      {
        "h": "Fra Home Assistant"
      },
      {
        "p": "Hvis familien har forbundet Home Assistant, kan skridt, søvn, vægt og hvilepuls hentes fra hver persons egne konti der: telefonen med companion-appen, en bruger i Withings, Google Health, Garmin og flere. En familieadmin forbinder kontiene under Familieindstillinger → Familiemedlemmer → personen; personen slår derefter Hent min sundhed fra Home Assistant til i sin profil – intet hentes før da. For et barn slår en voksen det til på barnets side. De læses hvert 15. minut og når du trykker Hent nu, og gemmes på den dag, de gælder; det, du selv udfylder på en dag, vinder altid, og et barns vægt læses aldrig."
      },
      {
        "tips": [
          "Én konto pr. person i Home Assistant: tilføj integrationen for Withings, Garmin eller Google Health én gang for hver af jer, med eget login – og companion-appen på hver telefon.",
          "Skridt og søvn fra telefonen: installer Home Assistants companion-app og slå dens sensorer til – på Android dem til Health Connect (skridt, søvn, puls, vægt …), på iPhone skridttælleren (skridt).",
          "En vægt eller et ur: Withings har sin egen integration i Home Assistant; Garmin, Fitbit, Oura og andre findes som integrationer fra fællesskabet (HACS).",
          "Træninger (beta): fra Withings' træningskalender eller en integrations sensor for seneste aktiviteter, som Garmin Connect eller Strava – de seneste to uger, hver træning én gang, også hvis den allerede er logget her i hånden."
        ]
      }
    ]
  },
  "twohomes": {
    "title": "To hjem",
    "summary": "Til børn, der bor hos begge forældre: planen, overleveringer og den anden forælder.",
    "blocks": [
      {
        "p": "Indstil, hvilke dage et barn er i hvilket hjem – hver anden uge, 2-2-3, hver anden weekend eller egne dage – og tilføj undtagelser for ferier og byttede weekender. Kalenderen viser dagene, og barnets opgaver venter, mens barnet er i det andet hjem."
      },
      {
        "shot": "twohomes",
        "caption": "Planen mellem hjemmene."
      },
      {
        "steps": [
          "Åbn Familieindstillinger → Familiemedlemmer → barnet.",
          "Vælg barnet, mønstret og den første dag.",
          "Tilføj undtagelser, når planerne ændres."
        ]
      },
      {
        "h": "Den anden forælder"
      },
      {
        "p": "Den anden forælder kan få sin egen konto, der kun ser sit barn: planen, kalenderen, nødkortet og overleveringslisten – og kan skrive med jer. Eller send et link, der viser det samme uden konto. Udgifter til barnets ting kan deles, så den anden ser beløbet og sin del – aldrig billeder eller noter."
      },
      {
        "tips": [
          "Aftenen før en overlevering bliver de voksne mindet om det, med overleveringslisten.",
          "Fanen To hjem vises i kalenderen, når en plan er sat op."
        ]
      }
    ]
  },
  "week": {
    "title": "Søndagsmødet",
    "summary": "Et roligt øjeblik hver uge: se tilbage, se frem og sig tak.",
    "blocks": [
      {
        "p": "Søndagsmødet samler familien én gang om ugen. Se tilbage på pointene og ugens bedste hjælper, se frem på kalenderen, maden og hvis tur det er – og giv hinanden takkestjerner."
      },
      {
        "shot": "week",
        "caption": "Ugen, der gik, og ugen, der kommer."
      },
      {
        "p": "Vælg noget at lave sammen, og markér tjekket som færdigt: alle får en kort oversigt. Søndag eftermiddag bliver I mindet om det, hvis I ikke har gjort det."
      },
      {
        "h": "Planlæg den kommende uge"
      },
      {
        "p": "Under den kommende uge trykker du på Kørsel og pakning ved en begivenhed for at tage en aflevering eller afhentning og give den en pakkeliste. Skriv en dags aftensmad ind direkte – en opskrifts navn tager ingredienserne med til indkøbslisten – eller planlæg hele ugens mad derfra."
      }
    ]
  },
  "chat": {
    "title": "Chatten",
    "summary": "Familiens egen chat – med billeder, og kun for jer.",
    "blocks": [
      {
        "p": "Skriv med hele familien eller med en eller nogle få. Billeder havner i chattens eget album i boksen. Beskederne gemmes på jeres server – ingen andre læser dem."
      },
      {
        "shot": "chat",
        "caption": "Beskeder grupperet pr. person, med store emojis."
      },
      {
        "tips": [
          "GIF'er kan slås til af serverens administrator; de kommer fra GIPHY, det eneste sted, chatten når ud.",
          "Ulæste beskeder vises som et tal på chatten og som et kort på I dag."
        ]
      }
    ]
  },
  "lists": {
    "title": "Lister",
    "summary": "Indkøbslister og huskelister, der opdateres for alle med det samme.",
    "blocks": [
      {
        "p": "Lav så mange lister, I har brug for – maden, byggemarkedet, pakningen. Alle ser krydser og nye ting med det samme, og listerne virker uden dækning. Omdøb en liste med blyanten ved siden af navnet."
      },
      {
        "shot": "lists",
        "caption": "En indkøbsliste, delt og levende."
      },
      {
        "tips": [
          "Købte varer kan lægges direkte i spisekammeret med Læg købte varer i spisekammeret.",
          "En liste kan sendes til Home Assistant og derfra til butikkens app – se Indkøbslister i Home Assistant.",
          "Ønskelister og gaveplanlægning er også lister – se Ønskelister og gaver."
        ]
      }
    ]
  },
  "wishes": {
    "title": "Ønskelister og gaver",
    "summary": "Alles ønskelister, hemmelig gaveplanlægning og et link til bedsteforældrene.",
    "blocks": [
      {
        "p": "Alle i familien har en ønskeliste. Tilføj et ønske med link og pris – eller søg det frem på nettet. De andre planlægger gaver i hemmelighed: fødselaren ser aldrig, hvem der køber hvad."
      },
      {
        "shot": "wishes",
        "caption": "En ønskeliste med links."
      },
      {
        "h": "Del med familien"
      },
      {
        "p": "Send et link til bedsteforældre og andre uden konto. De ser ønskelisten og kan markere, hvad de køber, så intet købes to gange – uden at barnet ser det."
      },
      {
        "tips": [
          "Seks uger før en fødselsdag bliver fødselaren mindet om at udfylde sin liste, og en måned før bliver de andre mindet om at planlægge.",
          "Fødselsdage: et medlems på medlemmets side under Familiemedlemmer; familie og venner under Familiemedlemmer → Andre personer."
        ]
      }
    ]
  },
  "food": {
    "title": "Maden og madplanen",
    "summary": "Ugens aftensmåltider, opskrifter fra et link og madlavningstilstand.",
    "blocks": [
      {
        "p": "Planlæg ugens aftensmåltider under Mad. Hent en opskrift fra et link – de fleste opskriftssider virker – eller indsæt teksten, hvis en side ikke kan læses. Ingredienserne kan lægges direkte på indkøbslisten."
      },
      {
        "shot": "food",
        "caption": "Ugens aftensmåltider."
      },
      {
        "h": "Madlavningstilstand"
      },
      {
        "p": "Tryk Lav på en opskrift for stor tekst, ingredienser at krydse af og trin at trykke sig igennem. Hold skærmen tændt forhindrer telefonen i at slukke, mens hænderne er snavsede."
      },
      {
        "h": "Madpakker og weekendfrokost"
      },
      {
        "p": "Når du planlægger ugen, kan du krydse af i Madpakker på hverdage og vælge, hvor mange om dagen: aftensmaden aftenen før bliver så en stor portion – en gryderet, en suppe eller et fad, der holder og kan varmes – og resterne bliver næste dags madpakker. Kryds af i Frokost lørdag og søndag for weekendens frokoster også. Valget huskes til næste uge."
      },
      {
        "tips": [
          "Med den lokale AI kan ugens aftensmåltider foreslås for jer – ud fra det, I kan lide, og det, I har derhjemme.",
          "Når maden er færdig, krydser du af, hvad der blev brugt, og spisekammeret tæller selv ned."
        ]
      }
    ]
  },
  "recipebook": {
    "title": "Opskriftsbogen",
    "summary": "Familiens opskrifter med kategorier, favoritter og stjerner fra alle.",
    "blocks": [
      {
        "p": "Opskriftsbogen gemmer familiens opskrifter med kategorier, favoritter og et link til originalen. Alle i familien giver deres egne stjerner – også børnene – så I ser, hvad der er populært."
      },
      {
        "shot": "recipebook",
        "caption": "Opskrifter med alles stjerner."
      },
      {
        "p": "Kan laves nu viser det, der kan laves af det, I har i spisekammeret. Søg nye opskrifter på nettet via serverens egen søgemaskine – kun søgeordene forlader serveren."
      }
    ]
  },
  "pantry": {
    "title": "Spisekammeret",
    "summary": "Det, I har i fryseren, køleskabet og spisekammeret – og det, der bør spises snart.",
    "blocks": [
      {
        "p": "Hold styr på, hvad I har, hvor og til hvornår. Det, der snart udløber, markeres og vises på I dag, så mindre mad smides ud."
      },
      {
        "shot": "pantry",
        "caption": "Bedst før, pr. sted."
      },
      {
        "h": "Scan maden ind"
      },
      {
        "steps": [
          "Tryk Scan varer ind, og hold varerne op foran kameraet én ad gangen – den samme vare igen tælles op.",
          "Tjek navne og mængder.",
          "Læg det hele det rigtige sted på én gang."
        ]
      },
      {
        "tips": [
          "Opslag af stregkoder kan slås til under Familieindstillinger → Forbindelser; kun stregkoden sendes.",
          "En kvittering, som den lokale AI har læst, kan også fylde spisekammeret."
        ]
      }
    ]
  },
  "tasks": {
    "title": "Opgaver og point",
    "summary": "Pligter med point, skiftes, godkendelse – og efterrapportering.",
    "blocks": [
      {
        "p": "Opgaver kan være engangs eller gentages hver dag, på valgte ugedage, hver måned eller hvert år. Hver opgave er point værd. Tryk Færdig, når den er gjort – børnenes opgaver kan vente på, at en voksen godkender dem."
      },
      {
        "shot": "tasks",
        "caption": "Dagens opgaver med point."
      },
      {
        "h": "Skiftes"
      },
      {
        "p": "Vælg, hvem der skiftes til en opgave: turen går videre, når den er gjort, eller hver uge. Listen viser, hvem der står for tur."
      },
      {
        "h": "Glemt at krydse af?"
      },
      {
        "p": "Under Opgaver → I dag går du tilbage med pilen – op til tre dage – og krydser det af, der blev gjort, med point som sædvanligt."
      },
      {
        "h": "Krydsede den forkerte af?"
      },
      {
        "p": "Tryk på fluebenet ved en færdig opgave for at fortryde – pointene trækkes tilbage. Et barn kan fortryde sine egne, indtil en voksen har godkendt dem; en voksen kan fortryde alle. På køkkenskærmen trykker du på den færdige opgave og bekræfter."
      },
      {
        "h": "Opgaver fra andre apps"
      },
      {
        "p": "Et barns og et kæledyrs medicindoser bliver opgaver med point, og det gør pakningen før en rejse eller en begivenhed også. En voksen kan krydse et barns dosis af; pointene går stadig til barnet."
      },
      {
        "tips": [
          "En opgave kan gentages hver hverdag (mandag–fredag, der ikke er helligdage) eller hver weekend- og helligdag – lufte hunden, fodre katten. Helligdagene følger familiens land, så jul og påske regnes som weekend af sig selv.",
          "Hvilken som helst plan: hver dag eller hver anden dag, valgte ugedage (hverdage, weekend), med nogle ugers mellemrum, en dato eller en ugedag i måneden (første lørdag), med nogle måneders mellemrum, en gang om året – med point. Kæledyr, hjemmet og køretøjerne har deres tilbagevendende opgaver med de samme valg.",
          "Børn kan foreslå opgaver; en voksen gør dem til opgaver eller siger nej tak.",
          "Pointene går til butikken og lommepengene – se de emner.",
          "En opgave, flere kan gøre sammen, deler pointene mellem dem, der gjorde den: vælg hvem, når den krydses af.",
          "Fjerner du en opgave, beholdes de point, der allerede er optjent – og de gange, den blev gjort."
        ]
      }
    ]
  },
  "allowance": {
    "title": "Lommepenge og opsparing",
    "summary": "Lommepenge fra point eller et mål, og sparegrise.",
    "blocks": [
      {
        "p": "Hvert barn tjener lommepenge enten fra point eller ved at nå et ugemål – familien vælger pr. barn. Udbetalinger noteres, så alle ser, hvad der er betalt."
      },
      {
        "shot": "allowance",
        "caption": "Lommepengene og sparegrisene."
      },
      {
        "p": "Sparegrise deler pengene op: bruge, spare, give eller et eget mål. Et barn kan foreslå et sparemål med en del af lommepengene; en voksen godkender det."
      }
    ]
  },
  "shop": {
    "title": "Belønningsbutikken og præstationer",
    "summary": "Byt point til belønninger, og lås præstationer op.",
    "blocks": [
      {
        "p": "I butikken bytter børnene deres point til belønninger, som de voksne har lagt ind – en times spil, vælge fredagsmaden. Et køb kan vente på en voksens godkendelse. Familiemål er belønninger, som hele familien sparer op til sammen."
      },
      {
        "shot": "shop",
        "caption": "Belønninger i butikken."
      },
      {
        "p": "Præstationer låses op af sig selv – den første opgave, en uge i træk – og niveauet vokser med pointene."
      }
    ]
  },
  "littleones": {
    "title": "Lille-tilstand",
    "summary": "Store billeder i stedet for tekst, til børn, der ikke kan læse endnu.",
    "blocks": [
      {
        "p": "I Lille-tilstand ser et barn store billedkort i stedet for appen: morgen- og aftenrutiner i rækkefølge, børnehavetasken – tryk, når det er gjort, for en lille fanfare og et klistermærke."
      },
      {
        "shot": "littleones",
        "caption": "Rutiner til de mindste."
      },
      {
        "steps": [
          "Åbn Opgaver → Lille-tilstand.",
          "Slå tilstanden til for barnet – et barn på 6 år eller yngre, hvis fødselsdag blev angivet, starter med den slået til.",
          "Start fra en færdig rutine, eller lav en egen med billeder."
        ]
      },
      {
        "tips": [
          "En voksen kommer ud af tilstanden ved at holde låsen inde og svare på et regnestykke.",
          "På køkkenskærmen kan hvert barn åbne sine rutiner ved at trykke på sit ansigt."
        ]
      }
    ]
  },
  "vault": {
    "title": "Boksen",
    "summary": "Billeder, filer, dokumenter, kvitteringer og adgangskoder ét sted.",
    "blocks": [
      {
        "p": "Boksen gemmer familiens billeder, chatbilleder, filer, dokumenter og kvitteringer – alt krypteret på jeres server. Filtrér efter type, søg, og markér noget Kun mig, så ingen andre ser det."
      },
      {
        "shot": "vault",
        "caption": "Alt i boksen, med et filter pr. type."
      },
      {
        "h": "Del med et link"
      },
      {
        "p": "Alt i boksen kan deles med et link, der selv holder op med at virke – efter timer eller dage, eller når det er åbnet én gang. Vælg, om modtageren må downloade. Word, Excel og PowerPoint vises direkte i browseren."
      },
      {
        "tips": [
          "Billeder fra samme dag tidligere år dukker op som Minder på I dag.",
          "Serverens administrator bestemmer, hvor stor en fil må være."
        ]
      }
    ]
  },
  "documents": {
    "title": "Dokumenter",
    "summary": "Pas, ID-kort, forsikringer og kontrakter – med påmindelser, før de udløber.",
    "blocks": [
      {
        "p": "Gem familiens dokumenter med en scanning: pas, ID-kort, kørekort, forsikringer, garantier, kontrakter og vaccinationer. Numre vises maskeret, og alt krypteres med familiens egen nøgle."
      },
      {
        "shot": "documents",
        "caption": "Dokumenter med udløbsdato."
      },
      {
        "p": "En udløbsdato giver en påmindelse i tide og vises i kalenderen, så passet fornyes før ferien."
      }
    ]
  },
  "passwords": {
    "title": "Adgangskoder",
    "summary": "Familiens fælles logins, krypteret med familiens nøgle.",
    "blocks": [
      {
        "p": "Gem logins i boksens visning Adgangskoder: streamingtjenesten, wi-fi'et, skolens platform. De krypteres med familiens nøgle. En voksen vælger, hvilke voksne et login deles med; børnene ser deres egne, og de voksne ser børnenes."
      },
      {
        "shot": "passwords",
        "caption": "Logins, med en genereret adgangskode."
      },
      {
        "tips": [
          "Lav en stærk adgangskode med ét tryk.",
          "Et login, der deles med et link, vises én gang – så holder linket op med at virke."
        ]
      }
    ]
  },
  "receipts": {
    "title": "Kvitteringer",
    "summary": "Kvitteringer, som den lokale AI læser, med påmindelser om returret og garanti.",
    "blocks": [
      {
        "p": "Tag et billede af en kvittering, eller vælg et skærmbillede, og knyt den til en bolig, et køretøj eller en kategori. Med den lokale AI læses butik, beløb og dato for dig. Sidste returdag og garantiens udløb giver påmindelser, og reklamationsretten vises af sig selv."
      },
      {
        "shot": "receipts",
        "caption": "Kvitteringer med returret og garanti."
      },
      {
        "tips": [
          "Søg i kvitteringerne, se Året i tal, og eksportér dem til Excel.",
          "En kvittering for et barns ting kan deles med det andet hjem.",
          "Den lokale AI kan skrive et reklamationsbrev for dig.",
          "På Android deler du en kvittering fra en anden app direkte til Smooth Family."
        ]
      }
    ]
  },
  "safety": {
    "title": "Nødkort og medicin",
    "summary": "Det, en babysitter skal vide, og medicin med påmindelser.",
    "blocks": [
      {
        "p": "Nødkortene har det vigtigste, hvis noget sker: allergier, medicin, læge, hvem man ringer til, og rutiner – ét for hver person og ét for hjemmet. De kan læses selv uden forbindelse."
      },
      {
        "shot": "safety",
        "caption": "Nødkortene. Et medlems kort og medicin håndteres på medlemmets side under Familieindstillinger → Familiemedlemmer; husstandens kort under Hverdagen."
      },
      {
        "h": "En babysitter eller bedsteforældrene"
      },
      {
        "p": "Lav et gæstelink under Familieindstillinger → Familiemedlemmer: det viser nødkortene og det, du vælger af kalenderen og listerne, i nogle timer eller dage – så holder det selv op."
      },
      {
        "h": "Medicin"
      },
      {
        "p": "Tilføj en medicin med dosis, tidspunkter og en slutdato for en kur. Et barns og et kæledyrs doser bliver opgaver med point; de voksne får besked, hvis en dosis ikke krydses af. En voksens egen medicin er privat – den lægges ind under Min profil og giver ingen point."
      }
    ]
  },
  "property": {
    "title": "Hjemmet",
    "summary": "Vedligeholdelse, ting pr. rum, energi og projekter – pr. bolig.",
    "blocks": [
      {
        "p": "Hver bolig – huset, lejligheden, sommerhuset – har sit eget kort med den vedligeholdelse, der skal laves, årets udgifter mod sidste år, energien og de igangværende projekter med budget mod forbrug."
      },
      {
        "shot": "property",
        "caption": "Ét kort pr. bolig."
      },
      {
        "p": "Vedligeholdelse, der kommer igen – tagrender, filtre, røgalarmen – foreslås til boligtypen, bliver mindet om i forvejen og vises i kalenderen; det kan også blive en opgave. Ting pr. rum – hvidevarer, varmepumpen – gemmer mærke, pris, manual og garanti."
      },
      {
        "tips": [
          "El, vand og varme kan læses fra Home Assistants sensorer (kun læse).",
          "Udskriv en liste over ting og kvitteringer til indboforsikringen."
        ]
      }
    ]
  },
  "economy": {
    "title": "Økonomi",
    "summary": "Hvor husholdningens penge går hen – med indtægter, budget og bankens fil.",
    "blocks": [
      {
        "p": "Økonomi viser husholdningens udgifter pr. kategori – mad, boligerne, bilen, børnene, fritid. Kvitteringer og boligernes, køretøjernes og rejsernes udgifter tælles med af sig selv. Hver voksen lægger sin egen indtægt ind, og oversigten viser, hvad der kommer ind, går ud og er tilbage."
      },
      {
        "shot": "economy",
        "caption": "Måneden pr. kategori."
      },
      {
        "h": "Importér fra banken"
      },
      {
        "steps": [
          "Eksportér kontoens posteringer som CSV fra netbanken.",
          "Upload filen under Økonomi → Importér fra banken.",
          "Tjek forslaget for hver række – brændstof til bilen, elregningen til boligen – og gem."
        ]
      },
      {
        "tips": [
          "Et budget pr. kategori og måned bliver rødt, når det sprænges.",
          "Poster kan være private, så kun du ser dem."
        ]
      },
      {
        "h": "Abonnementer"
      },
      {
        "p": "Under Hjemmet → Abonnementer samler I alt, husholdningen betaler jævnligt, med hvad det koster om måneden og året. Et abonnement kan pege på et login i boksen, et der findes, eller et nyt du laver lige her, og den, der må se login, kan kopiere adgangskoden herfra; boksens regler gælder som sædvanlig. Efter en bankimport foreslås gentagne betalinger her, og kun du ser forslagene fra din fil: tilføj dem, eller sig, at de ikke er abonnementer, og dem, du har afvist, kommer ikke tilbage. En senere fil siger til om en ny pris eller en betaling for noget, du har afsluttet. Det er en oversigt, så intet lægges til Økonomis summer. Under Påmindelser vælger hver voksen selv: sidste dag at opsige (14 og 2 dage før) samt kvartals- og årsbetalinger (7 dage før). Månedsbetalinger giver ingen påmindelse."
      },
      {
        "shot": "subscriptions",
        "caption": "Hvad det koster, og login fra boksen."
      }
    ]
  },
  "vehicles": {
    "title": "Køretøjer",
    "summary": "Syn, service, dæk, udgifter og forbrug – til alt med motor eller hjul.",
    "blocks": [
      {
        "p": "Hvert køretøj har et kort med det, der er på vej – syn, service, dækskift, forsikring og afgift – og årets udgifter. Påmindelser går på dato eller kilometertal, og den næste sættes, når du markerer en som udført."
      },
      {
        "shot": "vehicles",
        "caption": "Et køretøj med det, der er på vej."
      },
      {
        "p": "Tilføj tankning eller opladning med liter eller kWh, så regnes forbruget ud; opladning hjemme bruger dagens elpris. Gem dæksættene med sæson og mønsterdybde, og lav en rapport til en køber med servicehistorikken."
      },
      {
        "tips": [
          "Et billede af kvitteringen eller en servicehistorik som PDF læses af den lokale AI.",
          "Kilometertallet kan læses fra en sensor i Home Assistant."
        ]
      }
    ]
  },
  "pets": {
    "title": "Kæledyr",
    "summary": "Dyrlægebesøg, vaccinationer, opgaver og en fødselsdag.",
    "blocks": [
      {
        "p": "Hvert dyr har sine dyrlægebesøg og vaccinationer, med påmindelse når de skal laves, og en fødselsdag blandt fødselsdagene. Opgaver som gåture og fodring bliver opgaver, børnene skiftes til – og medicindoser følger samme tur."
      },
      {
        "shot": "pets",
        "caption": "Et kæledyr med sin pleje."
      },
      {
        "tips": [
          "En opgave kan gentages hver hverdag (mandag–fredag, der ikke er helligdage) eller hver weekend- og helligdag – lufte hunden, fodre katten. Helligdagene følger familiens land, så jul og påske regnes som weekend af sig selv."
        ]
      }
    ]
  },
  "smarthome": {
    "title": "Det smarte hjem",
    "summary": "Lys, varme og højttalere, flows, hvem der er hjemme, og elprisen.",
    "blocks": [
      {
        "p": "Med Home Assistant forbundet styrer du hjemmets enheder fra Smooth Family – lys, persienner, varmepumpen, robotstøvsugeren, højttalere – pr. rum og pr. bolig. Familiens administrator vælger, hvilke enheder der vises."
      },
      {
        "shot": "smarthome",
        "caption": "Enheder pr. rum."
      },
      {
        "h": "Flows"
      },
      {
        "p": "Byg dine egne automatiseringer med Når → Hvis → Gør: på et tidspunkt, med en knap på I dag, når en enhed ændrer sig, eller når nogen kommer hjem – for eksempel tænd lyset på trappen, når det bliver mørkt. Flows kan køre i Home Assistant selv, så de virker, mens Smooth Family genstarter."
      },
      {
        "h": "Hvem er hjemme"
      },
      {
        "p": "Knyt familien til personerne i Home Assistant, og hver enkelt vælger at vise hjemme eller ude – aldrig hvor du er. Intet gemmes."
      },
      {
        "tips": [
          "Elprisen: et kort på I dag med dagens timer og flows, der kører i de billigste timer.",
          "Ingen Home Assistant? Prøv det hele med det simulerede hjem."
        ]
      }
    ]
  },
  "homeassistant": {
    "title": "Forbind Home Assistant",
    "summary": "Hjemmets Home Assistant direkte – og andre hjem via gatewayen.",
    "blocks": [
      {
        "p": "Home Assistant i samme hjem som Smooth Family-serveren forbindes direkte, med sin adresse og et langtidstoken. Et andet hjem – sommerhuset – forbindes i stedet via gatewayen, uden at der åbnes en port der."
      },
      {
        "steps": [
          "I Home Assistant: din profil → Sikkerhed → Langtidsadgangstokens → Opret token. Kopiér det.",
          "I Smooth Family: Familieindstillinger → Forbindelser → Smart hjem.",
          "Skriv adressen, f.eks. http://homeassistant.local:8123, og tokenet, og tryk Opret forbindelse.",
          "Tilføj de enheder, der skal vises, og knyt hjemmet til den rigtige bolig."
        ]
      },
      {
        "shot": "homeassistant",
        "caption": "Hjem og enheder under Familieindstillinger."
      },
      {
        "p": "Tokenet gemmes krypteret på serveren. Smooth Family læser tilstande og styrer det, du har tilføjet; målere og sensorer for energi og kilometertal læses kun."
      },
      {
        "tips": [
          "Brug en adresse, der virker fra serveren – en IP-adresse er sikrest.",
          "Familier på en andens server forbinder altid via gatewayen."
        ]
      }
    ]
  },
  "gateway": {
    "title": "Gatewayen – Home Assistant i et andet hjem",
    "summary": "Sommerhusets Home Assistant uden at åbne en port: som tilføjelse eller container.",
    "blocks": [
      {
        "p": "Gatewayen kører ved siden af det andet hjems Home Assistant og ringer op til jeres Smooth Family-server over HTTPS og holder linjen åben. Der åbnes ingen port der, og den virker bag 4G-routere. Home Assistant-tokenet bliver i det hjem; serveren kan kun bede om tilstande og kald i de tilladte domæner – låse og alarmer kun, hvis du tilføjer dem."
      },
      {
        "h": "1. Lav en parringskode"
      },
      {
        "p": "Familieindstillinger → Forbindelser → Smart hjem → Tilføj et hjem via tilføjelsen. Giv det et navn, og vælg boligen; koden på otte tegn gælder i 24 timer."
      },
      {
        "shot": "gateway",
        "caption": "Et hjem via gatewayen, med sin version."
      },
      {
        "h": "2. Installér – hvilken måde afhænger af Home Assistant"
      },
      {
        "p": "Indstillinger → Om i Home Assistant viser installationstypen."
      },
      {
        "details": [
          {
            "title": "Home Assistant OS eller Supervised: som tilføjelse",
            "blocks": [
              {
                "steps": [
                  "Indstillinger → Tilføjelser → Tilføjelsesbutik → ⋮ → Repositories, og tilføj https://github.com/burnwalled/smoothfamily.",
                  "Smooth Family vises i butikken: installér den.",
                  "Udfyld serverens adresse og parringskoden i indstillingerne, og start den."
                ]
              },
              {
                "p": "Tilføjelsen bruger Home Assistants eget token – der skal ikke bruges et langtidstoken."
              }
            ]
          },
          {
            "title": "Home Assistant Container eller Core: som egen container",
            "blocks": [
              {
                "p": "Tilføjelser findes ikke i disse installationer, så gatewayen kører som en Docker-container ved siden af Home Assistant, eller på en Raspberry Pi i det hjem. Den skal bruge et langtidstoken fra din profil i Home Assistant."
              },
              {
                "steps": [
                  "Hent gateway-mappen fra https://github.com/burnwalled/smoothfamily, og byg dens image: docker build -t smooth-family-gateway gateway/",
                  "Start den med SF_SERVER (serverens adresse), SF_PAIRING_CODE, HA_URL og HA_TOKEN og et volumen til /data.",
                  "Loggen siger Paired as … og derefter Connected to …."
                ]
              }
            ]
          }
        ]
      },
      {
        "h": "3. Opdateringer"
      },
      {
        "p": "Gatewayen opdaterer sig selv fra jeres server – slået til som standard. Den kører kun versioner, der er signeret på den computer, hvor udgivelserne laves; ikke engang den, der overtog serveren, kunne køre noget i sommerhuset. Hvis en ny version ikke forbinder, kommer den forrige selv tilbage. Hjemmet viser Nyeste version, når den er opdateret."
      },
      {
        "tips": [
          "Skifter du gatewayens computer, eller kan nøglen være lækket? Lav en ny kode – den gamle nøgle holder op med at virke med det samme.",
          "Er linjen nede, fejler en kommando med det samme i stedet for at blive kørt for sent."
        ]
      }
    ]
  },
  "halists": {
    "title": "Indkøbslister i Home Assistant",
    "summary": "Send en liste til Home Assistant – og derfra til butikkens app.",
    "blocks": [
      {
        "p": "En liste kan sendes til en af Home Assistants opgavelister eller knyttes til en, så begge holdes ens. Med en butiks integration installeret i Home Assistant vises listen så i butikkens egen app. Det, der købes der, krydses af her og havner under Lige købt i spisekammeret."
      },
      {
        "steps": [
          "Installér butikkens integration i Home Assistant (links i dialogen – lavet af andre, på egen risiko).",
          "Åbn listen i Smooth Family → Home Assistant.",
          "Vælg opgavelisten, og send én gang eller knyt listerne sammen."
        ]
      },
      {
        "note": "Nyt og ikke fuldt testet med butikkerne endnu: det virker så godt, som butikkens integration synkroniserer krydserne tilbage."
      }
    ]
  },
  "kiosk": {
    "title": "Køkkenskærmen",
    "summary": "En tablet på væggen med familiens dag.",
    "blocks": [
      {
        "p": "Forbind en tablet med sit eget link eller QR-kode. Den viser familiens dag: dagens og morgendagens kalender med hvem der kører, hvem der er hjemme, vejret, opgaverne, aftensmaden og skolemaden, affaldsafhentningen og elprisen – og en knap til nødkortet. Intet privat vises, og skærmen har ingen konto."
      },
      {
        "shot": "kiosk",
        "caption": "Køkkenskærmen."
      },
      {
        "h": "På skærmen"
      },
      {
        "p": "Opgaver krydses af lige der, med store rækker til fingre: tryk på en og derefter på dit ansigt – for en opgave, I lavede sammen, alle, der hjalp, og pointene deles. Ugens mad og opskriftsbogen åbner madlavningstilstanden: opskriften med stor skrift, ingredienser at krydse af og trinene et ad gangen. De smarte enheder, der er valgt til skærmen, styres med et tryk."
      },
      {
        "h": "Pauseskærmen"
      },
      {
        "p": "Efter de minutter, du vælger, kommer pauseskærmen: familiens billeder, et flip-ur, et roligt ur med vejret, en mørk skærm – eller ræven, der viser vejret udenfor. Den læser, når det er gråt, flyver med drage, når skyerne driver forbi, holder paraplyen i regnen, bygger snemand, når det sner, og sover om natten, og dagens opgaver vises over søen. Et tryk vækker skærmen."
      },
      {
        "p": "Med nogle minutters mellemrum gør ræven noget lille, der passer til vejret – hopper, plasker i en vandpyt, kaster snebold, ser et stjerneskud – og nu og da hopper en hare forbi, eller en fisk springer i søen. Den klæder sig ud til halloween, jul, nytår, påske og sankthans, og på en fødselsdag (personerne under Fødselsdage) får den balloner, festhat og et banner med navnet. Højtiderne følger familiens land; udklædningen slås fra pr. skærm under pauseskærmen. Med reduceret bevægelse på tabletten står ræven stille."
      },
      {
        "steps": [
          "Familieindstillinger → Køkkenskærm → Forbind en skærm.",
          "Åbn linket på tabletten (eller scan QR-koden), og føj det til hjemmeskærmen.",
          "Under skærmen vælger du, hvad den viser, pauseskærm, farver, sprog og nat."
        ]
      },
      {
        "tips": [
          "Alt om en skærm findes under Familieindstillinger → Køkkenskærm: navnet, pauseskærmen (med et billede af hver), hvad den viser, farver og sprog, hvornår den dæmpes om natten, hvilke smarte enheder den må styre, og hvad den må. Én knap giver alle skærme de samme indstillinger, og en skærm henter en ændring inden for et minut.",
          "Ugens mad og opskriftsbogen vælges pr. skærm – de er slået fra, indtil du slår dem til.",
          "En lås vises aldrig på skærmen, uanset hvad du vælger.",
          "Et mistet link erstattes med Nyt link; Afbryd lukker linket helt.",
          "De små kan åbne deres billedrutiner der ved at trykke på deres ansigt.",
          "Fuld skærm med knappen i hjørnet (på en iPad føjer du i stedet skærmen til hjemmeskærmen)."
        ]
      }
    ]
  },
  "localai": {
    "title": "Den lokale AI",
    "summary": "En AI på en computer derhjemme – til kvitteringer, opskrifter og forslag.",
    "blocks": [
      {
        "p": "Smooth Family kan bruge en AI, der kører på en computer i jeres hjem med Ollama. Den læser kvitteringer og servicehistorik, laver tekst eller et billede om til en opskrift, foreslår ugens aftensmåltider og opgaver og svarer på spørgsmål med websøgning. Intet sendes til en ekstern tjeneste."
      },
      {
        "shot": "localai",
        "caption": "Opgaver til den lokale AI."
      },
      {
        "p": "Serverens administrator sætter den op én gang (Serverindstillinger → AI-computeren) – den skal bruge en computer med et nogenlunde godt grafikkort. Derefter vælger hver familie at slå den til. Opgaverne sættes i kø, så computeren kan sove og vækkes, når der er noget at lave."
      },
      {
        "tips": [
          "Alt, hvad AI'en foreslår, vises for dig, før det gemmes.",
          "Uden AI'en kan du stadig kopiere spørgsmålet til en AI, du selv vælger."
        ]
      }
    ]
  },
  "websearch": {
    "title": "Søg på nettet",
    "summary": "Søg via serverens egen søgemaskine – kun ordene forlader serveren.",
    "blocks": [
      {
        "p": "Når serverens administrator har slået søgningen til, kan du søge på nettet fra Smooth Family: efter ønsker og gaver, opskrifter, manualer til ting i hjemmet, fakta om bilen og ting at lave. Søgningen kører på jeres egen server (SearXNG), så kun søgeordene forlader den – ikke hvem der spørger."
      },
      {
        "p": "Med den lokale AI kan du også stille et spørgsmål og få et svar med kilder fra nettet."
      }
    ]
  },
  "family": {
    "title": "Familieindstillinger",
    "summary": "Medlemmer, hvilke apps hver enkelt ser, og familiens hverdag.",
    "blocks": [
      {
        "p": "Familieindstillingerne er til den, der styrer familien. Administratoren tilføjer medlemmer og vælger, hvilke apps hver enkelt ser; en voksen, som administratoren stoler på, kan få lov til også at ændre hverdagsindstillingerne."
      },
      {
        "shot": "family",
        "caption": "Alle i familien; åbn én for alt om personen."
      },
      {
        "h": "Et medlems egen side"
      },
      {
        "p": "Tryk på et medlem for alt om personen samlet ét sted: navn, farve og billede, ny adgangskode og nulstilling af totrinslogin, hvilke apps personen bruger – og for et barn sproget i appen, fødselsdagen, Lille-tilstand, lommepengene, medicinen og nødkortet. En voksens egen medicin forbliver privat, og voksne vælger selv deres billede."
      },
      {
        "h": "Hvad findes hvor"
      },
      {
        "p": "Familiemedlemmer: alle, hver med sin egen side (login, apps, sprog, billede – og for et barn fødselsdag, lommepenge, Lille-tilstand, to hjem, medicin og nødkort), andre personer uden konto til deres fødselsdage, og gæstelinks til babysitteren eller bedsteforældrene. Hverdagen: kalendere, hjemmet, Idags kilder, pointreglerne, husstandens nødkort og kæledyrenes medicin. Køkkenskærm. Familiemedlemmer: smart hjem og den lokale AI. Sikkerhed og data: sikkerhedskopier og eksport."
      },
      {
        "tips": [
          "Angiv et barns fødselsdag, når du tilføjer det – et barn på 6 år eller yngre starter i Lille-tilstand.",
          "Familiens kom i gang-guide kan åbnes igen øverst i Familieindstillinger.",
          "Et nyt medlem starter med administratorens sprog; en forælder ændrer barnets på barnets side."
        ]
      }
    ]
  },
  "familydata": {
    "title": "Familiens data og sikkerhedskopier",
    "summary": "Eksport, familiens egen nøgle og at flytte familien.",
    "blocks": [
      {
        "p": "Under Familieindstillinger → Sikkerhed og data kan administratoren eksportere familiens data og, på en server, som andre driver, vælge en egen nøgle til familien: familiens sikkerhedskopier forsegles så, så kun I kan åbne dem – ikke engang serverens administrator. Eksporten indeholder det, du selv må se i appen: en anden voksens private dokumenter, medicin, sundhed, der ikke deles, og chats, du ikke er med i, holdes udenfor."
      },
      {
        "shot": "familydata",
        "caption": "Familiens sikkerhedskopier og nøgle."
      },
      {
        "tips": [
          "Opbevar nøglen uden for serveren, som en vigtig adgangskode – uden den kan sikkerhedskopierne ikke gendannes.",
          "Loggen viser logins og ændringer i familien."
        ]
      }
    ]
  },
  "profile": {
    "title": "Min profil",
    "summary": "Dit navn, billede, sprog, menu, notifikationer og sikkerhed.",
    "blocks": [
      {
        "p": "Min profil har fire faner. Om mig: navn, billede, sprog og tema, dit nødkort og din egen medicin. Menu: appenes rækkefølge og hvilke der er skjult. Notifikationer: hvad der sendes, og morgenoversigten. Sikkerhed og forbindelser: adgangskode, passkeys, totrinskoder og din telefonkalender."
      },
      {
        "shot": "profile",
        "caption": "Min profil."
      }
    ]
  },
  "server": {
    "title": "Serverindstillinger",
    "summary": "Til den, der styrer serveren: familier, login-regler, adressen og loggen.",
    "blocks": [
      {
        "p": "Serverens administrator bestemmer det, der er ens for alle familier på serveren. Invitér andre familier med et link – de kan prøve en demo først – og sæt en familie på pause, flyt eller fjern den. Administratoren ser aldrig familiernes indhold."
      },
      {
        "shot": "server",
        "caption": "Familierne på serveren."
      },
      {
        "p": "Sikkerhed sætter reglerne for passkeys, totrinskoder og hvor lange adgangskoder skal være. Adresse og tjenester har serverens adresse på internettet, søgningen og tjenesterne for alle familier. Serverens kom i gang-guide kan åbnes igen øverst."
      },
      {
        "h": "Sikkerhedsloggen"
      },
      {
        "p": "Under Sikkerhed ser serverens admin de seneste 30 dages mislykkede logins, bremsen, der stopper for mange forsøg, links, der ikke findes, medlemmernes nye enheder og skiftede adgangskoder – fra alle familier på serveren, med adressen, hver kom fra. Bremsen meddeles straks, og en opsummering af døgnet kommer om morgenen, når der er sket noget. Hvert medlem får besked om en ny enhed på sin egen konto og om en skiftet adgangskode: ikke dem? En ny adgangskode logger de andre ud. Hver vælger under Min profil → Notifikationer, om disse skal pushes."
      },
      {
        "h": "Hvor logins kommer fra"
      },
      {
        "p": "Under Sikkerhed kan serverens admin hente en landetabel (IP Geolocation by DB-IP), som ligger på serveren, så ingen adresse nogensinde sendes væk for at blive slået op. Med den viser sikkerhedsloggen et flag på hver hændelse, og morgenens opsummering siger, hvor tingene kom fra. Logins kan så begrænses til valgte lande: fra andre lande afvises de, og bremsen er strengere, tre forsøg i stedet for otte, talt over en time. Reglen gælder kun login – gæstelinks, køkkenskærmen, kalenderabonnementer og hjemmenetværket begrænses aldrig. Et medlem på rejse lukkes ind hvor som helst fra indtil den dag, der er sat på medlemmets side."
      }
    ]
  },
  "serverbackups": {
    "title": "Sikkerhedskopier og backupnøglen",
    "summary": "Backup hver nat, forseglet med en nøgle, kun du har.",
    "blocks": [
      {
        "p": "Serveren tager en backup hver nat og gemmer 30 dage. Med en backupnøgle forsegles de: serveren kan lave dem, men aldrig læse dem, og nøglen er nok til at få det hele tilbage på en ny server."
      },
      {
        "shot": "serverbackups",
        "caption": "Sikkerhedskopier, forseglet med nøglen."
      },
      {
        "steps": [
          "Serverindstillinger → Sikkerhedskopier og flytning → Lav backupnøgle. Nøglen laves i din browser; serveren får kun den offentlige halvdel.",
          "Gem den i en adgangskodeadministrator, print den eller download den – og bekræft med de sidste tegn.",
          "Prøv nøglen mod den nyeste backup med Prøv min nøgle."
        ]
      },
      {
        "note": "Uden nøglen kan sikkerhedskopierne ikke gendannes, og ingen kan skaffe den til dig igen."
      }
    ]
  },
  "serverupdates": {
    "title": "Opdateringer",
    "summary": "Smooth Family og serverens dele, af sig selv – og gatewayenes versioner.",
    "blocks": [
      {
        "p": "Databasen, Redis, webserveren og søgemaskinen får sikkerhedsrettelser mellem Smooth Familys udgivelser. Vælg, om de lægges ind af sig selv i et ugentligt vindue eller efter din godkendelse. Der tages en backup først, og kommer de nye versioner ikke op, sættes de gamle tilbage."
      },
      {
        "shot": "serverupdates",
        "caption": "Versioner, vinduet og gatewayerne."
      },
      {
        "h": "Smooth Family selv"
      },
      {
        "p": "Vælg en kanal under Smooth Family selv, så opdaterer serveren også appen, samtidig med resten: Stabil følger udgivelserne, Beta hver ændring, så snart den er færdig. Kun versioner, som projektet har signeret, lægges ind, databasen gemmes først, og hvis den nye version ikke starter, kommer den gamle og dens database tilbage. Slået fra, indtil du vælger – at lede er et kald til GitHub."
      },
      {
        "p": "Kortet Gatewayer viser hver gateway på serveren, den version hver enkelt rapporterede, og om den opdaterer sig selv – så du ser, at alle er opdaterede."
      },
      {
        "note": "Serverens update.sh skal planlægges hver time én gang (på en Synology: Opgaveplanlægning, bruger root), for at opdateringer bliver lagt ind."
      }
    ]
  },
  "serverservices": {
    "title": "Tjenester, lokal AI og søgning",
    "summary": "Serverens adresse, søgemaskinen, den lokale AI og andre tjenester.",
    "blocks": [
      {
        "p": "Adresse og tjenester har den adresse, serveren nås på – den bruges i alle links, der sendes ud – opskriftssøgningen og websøgningen (SearXNG på serveren selv), Home Assistant for familier på serveren via gatewayen, GIF'er i chatten og at sende feedback. AI-computeren indstiller, hvor Ollama kører, hvilke modeller der bruges, og vækning og dvale for computeren. E-mail opsætter mailtjenesterne – Gmail med en app-adgangskode, Brevo til en adresse på jeres eget domæne, Exchange Online via en appregistrering i Microsoft Entra eller en anden SMTP-server – hvilken jeres familie sender med, og om de hostede familier også må sende mail (til festgæster, der har bedt om opdateringer). Adresser slår forslagene fra OpenStreetMap i adressefelterne til (via komoots Photon eller jeres egen) – eller fra."
      },
      {
        "shot": "serverservices",
        "caption": "Serverens tjenester."
      }
    ]
  },
  "feedback": {
    "title": "Rapportér et problem",
    "summary": "Noget, der er galt, eller et ønske – til serverens administrator.",
    "blocks": [
      {
        "p": "Fundet noget, der ikke virker, eller ønsker du dig noget nyt? Skriv det under Rapportér et problem i profilmenuen. Det går til den, der driver serveren, med siden, du var på, og din browser – og et skærmbillede, hvis du tilføjer et."
      },
      {
        "steps": [
          "Åbn profilmenuen → Rapportér et problem.",
          "Vælg Noget er galt eller Ønske, og skriv, hvad der skete, eller hvad du gerne vil have.",
          "Tilføj et skærmbillede, hvis det hjælper – indsæt det, slip det, eller tag et foto."
        ]
      },
      {
        "tips": [
          "Du ser dine rapporter på samme side: modtaget, planlagt, rettet eller ikke planlagt – med en linje fra serveradministratoren, når der er en.",
          "Du får en notifikation, når en rapports status ændres.",
          "Familiens administrator ser hele familiens rapporter."
        ]
      }
    ]
  },
  "devices": {
    "title": "Enheder",
    "summary": "Hvad der er forbundet med familiens konto, og om det har det godt.",
    "blocks": [
      {
        "p": "Familieindstillinger → Enheder viser, hvad der taler med serveren for familien: mobilerne og computerne, medlemmerne logger ind på, køkkenskærmene og gatewayene – som Home Assistant-appen eller deres egen container. Et kort placerer dem rundt om serveren; listen har hver enheds version, hvornår den sidst blev set, og hvordan den har det."
      },
      {
        "shot": "devices",
        "caption": "Familiens enheder rundt om serveren."
      },
      {
        "h": "Helbred"
      },
      {
        "p": "Grøn: har det godt. Orange: en gammel version – en app, der skal åbnes igen, eller en gateway, der skal opdateres. Grå: et medlems enhed, der ikke er brugt i et stykke tid. Rød: en køkkenskærm eller gateway, der ikke er der. Under en enhed, der ikke har det godt, står det i listen, hvad du gør."
      },
      {
        "tips": [
          "En enhed, der ikke er set i 7 dage, forsvinder fra kortet, men bliver i listen; et medlems gamle mobil kan glemmes der.",
          "Kun typen af enhed, browser og system, appversionen og hvornår den sidst blev brugt, gemmes – ingen adresse, intet sted.",
          "Serveradministratoren ser jeres enheder som typer, aldrig navne, og kan bede jer se efter en."
        ]
      }
    ]
  },
  "serverreports": {
    "title": "Rapporter fra familierne",
    "summary": "Læs, besvar og send fejl og ønsker videre.",
    "blocks": [
      {
        "p": "Alle familiers rapporter om fejl og ønsker kommer til Serverindstillinger → Rapporter, og du får en notifikation. Åbn en for at læse den med side, browser og skærmbillede; sæt status – modtaget, planlagt, rettet eller ikke planlagt – og skriv en linje til den, der rapporterede, som får besked."
      },
      {
        "h": "Til projektet"
      },
      {
        "p": "Sæt kryds ved de rapporter, Smooth Family-projektet bør kende til, og tryk på Eksportér. Du får en anonym tekst – hvad og hvor, aldrig hvem eller hvilken familie – og GitHubs formular i projektets offentlige repo åbnes udfyldt med den og etiketten from-server-admin. Læs den igennem, og tryk på Create dér. En tekst, der er for lang til linket, kopieres, så du kan indsætte den."
      },
      {
        "tips": [
          "Serveren sender intet: eksporten åbner kun GitHub i din browser.",
          "Eksporterede rapporter markeres, så du ikke sender dem to gange."
        ]
      }
    ]
  },
  "serverdevices": {
    "title": "Familiernes enheder",
    "summary": "Hver families enheder efter type, deres versioner og helbred.",
    "blocks": [
      {
        "p": "Serverindstillinger → Enheder placerer serveren i midten med hver familie rundt om sig, og rundt om hver familie dens typer af enheder: mobiler, tablets, computere, køkkenskærme, gateways og Home Assistant-apps. Du ser hvor mange, hvilke versioner de kører, og om de har det godt – aldrig hvis de er, eller hvad de hedder."
      },
      {
        "p": "Appens version er serverens egen; en gateway skal køre den nyeste, serveren deler ud. Når en familie har en enhed med en gammel version eller en, der ikke er der, sender Bed familien se efter en notifikation til familiens administratorer om hvilke typer og hvorfor."
      },
      {
        "tips": [
          "En enhed, der ikke er set i 7 dage, forsvinder fra kortet.",
          "En gateway opdaterer sig selv, hvis automatisk opdatering er slået til – en gammel betyder oftest, at den er slået fra."
        ]
      }
    ]
  }
};

export default texts;
